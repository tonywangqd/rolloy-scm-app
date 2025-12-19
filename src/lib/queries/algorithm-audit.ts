/**
 * Algorithm Audit Queries
 * Provides comprehensive 16-week data (4 past + 12 future) for verifying inventory calculations
 * Backend Specialist - Rolloy SCM
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getWeekFromDate, addWeeksToWeekString, parseWeekString, getCurrentWeek } from '@/lib/utils/date'
import { format } from 'date-fns'
import type {
  Product,
  StockStatus,
  SupplyChainLeadTimes,
  AlgorithmAuditRowV2,
  AlgorithmAuditResultV2,
  ShipmentDetail as ShipmentDetailV2,
  AlgorithmAuditRowV3,
  AlgorithmAuditResultV3,
  SupplyChainLeadTimesV3,
  SupplyChainValidation,
  SupplyChainValidationError,
  SupplyChainValidationWarning,
} from '@/lib/types/database'
import {
  getISOWeekString,
  parseISOWeekString,
  addWeeksToISOWeek,
  formatDateISO,
} from '@/lib/utils'
import { fetchVarianceAdjustmentsForAudit } from './supply-chain-variances'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

/**
 * Shipment detail for a specific week
 */
export interface ShipmentDetail {
  tracking_number: string
  planned_arrival_date: string | null
  actual_arrival_date: string | null
  shipped_qty: number
  arrival_source: 'actual' | 'planned'
}

/**
 * Algorithm Audit Row - One week's data for a SKU
 * Supports full algorithm verification with 16-week window
 */
export interface AlgorithmAuditRow {
  // Week identification
  week_iso: string           // 2025-W49
  week_start_date: string    // 2025-12-02 (Monday)
  week_offset: number        // -4 to +11 (0 = current week)
  is_past: boolean           // week_offset < 0
  is_current: boolean        // week_offset === 0

  // Sales data (dual-track: actual vs forecast)
  sales_forecast: number     // Summed from sales_forecasts
  sales_actual: number | null // Summed from sales_actuals
  sales_effective: number    // COALESCE(actual, forecast)
  sales_source: 'actual' | 'forecast'  // Which data source is used

  // Shipment/Logistics data (arrival to warehouse)
  shipment_planned_qty: number  // Planned arrivals this week
  shipment_actual_qty: number   // Actual arrivals this week
  shipment_incoming: number     // Total incoming = planned + actual
  shipment_source: 'actual' | 'planned' | 'mixed' // Data source indicator

  // Shipment details (expandable list)
  shipments: ShipmentDetail[]

  // Inventory calculation
  opening_stock: number      // Start of week
  incoming_qty: number       // = shipment_incoming
  outgoing_qty: number       // = sales_effective
  closing_stock: number      // = opening + incoming - outgoing

  // Safety stock
  safety_threshold: number   // avg_weekly_sales * safety_stock_weeks
  stock_status: StockStatus  // 'Stockout' | 'Risk' | 'OK'
}

/**
 * Complete audit result for a SKU
 */
export interface AlgorithmAuditResult {
  product: Product | null
  rows: AlgorithmAuditRow[]
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    safety_stock_weeks: number
  }
}

// ================================================================
// MAIN QUERY FUNCTIONS
// ================================================================

/**
 * Fetch comprehensive 16-week algorithm audit data for a SKU
 * Window: 4 weeks past + current week + 11 weeks future
 */
export async function fetchAlgorithmAudit(sku: string): Promise<AlgorithmAuditResult> {
  const supabase = await createServerSupabaseClient()

  // Fetch product info
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('sku', sku)
    .single()

  if (!product) {
    return {
      product: null,
      rows: [],
      metadata: {
        current_week: getCurrentWeek(),
        start_week: '',
        end_week: '',
        total_weeks: 0,
        avg_weekly_sales: 0,
        safety_stock_weeks: 0,
      },
    }
  }

  // Generate 16-week range: current week - 4 to current week + 11
  const currentWeek = getCurrentWeek()
  const startWeek = addWeeksToWeekString(currentWeek, -4) || currentWeek
  const endWeek = addWeeksToWeekString(currentWeek, 11) || currentWeek

  // Build week array
  const weeks: string[] = []
  let currentIterWeek = startWeek
  for (let i = 0; i < 16; i++) {
    weeks.push(currentIterWeek)
    const next = addWeeksToWeekString(currentIterWeek, 1)
    if (!next) break
    currentIterWeek = next
  }

  // Fetch all data in parallel
  const [
    shipmentsResult,
    forecastsResult,
    actualsResult,
    inventorySnapshotsResult,
  ] = await Promise.all([
    // Shipments with items
    supabase
      .from('shipments')
      .select(`
        id,
        tracking_number,
        planned_arrival_date,
        actual_arrival_date,
        shipment_items!inner(sku, shipped_qty)
      `)
      .eq('shipment_items.sku', sku),

    // Sales Forecasts
    supabase
      .from('sales_forecasts')
      .select('week_iso, forecast_qty')
      .eq('sku', sku)
      .in('week_iso', weeks),

    // Sales Actuals
    supabase
      .from('sales_actuals')
      .select('week_iso, actual_qty')
      .eq('sku', sku)
      .in('week_iso', weeks),

    // Current inventory snapshot
    supabase
      .from('inventory_snapshots')
      .select('qty_on_hand')
      .eq('sku', sku),
  ])

  const shipments = shipmentsResult.data || []
  const forecasts = forecastsResult.data || []
  const actuals = actualsResult.data || []
  const snapshots = inventorySnapshotsResult.data || []

  // Calculate initial stock (sum of all warehouses)
  const initialStock = snapshots.reduce((sum, s) => sum + s.qty_on_hand, 0)

  // Build forecast and actual maps
  const forecastMap = new Map<string, number>()
  forecasts.forEach(f => {
    const current = forecastMap.get(f.week_iso) || 0
    forecastMap.set(f.week_iso, current + f.forecast_qty)
  })

  const actualMap = new Map<string, number>()
  actuals.forEach(a => {
    const current = actualMap.get(a.week_iso) || 0
    actualMap.set(a.week_iso, current + a.actual_qty)
  })

  // Calculate average weekly sales for safety threshold
  const totalEffectiveSales = weeks.reduce((sum, week) => {
    const forecast = forecastMap.get(week) || 0
    const actual = actualMap.get(week)
    return sum + (actual !== undefined && actual !== null ? actual : forecast)
  }, 0)
  const avgWeeklySales = totalEffectiveSales / weeks.length

  // Process shipments by arrival week
  const shipmentsByWeek = new Map<string, ShipmentDetail[]>()

  shipments.forEach(shipment => {
    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]

    items.forEach((item) => {
      // Type guard: ensure item has required properties
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return
      if (item.sku !== sku) return

      // Determine effective arrival week
      const arrivalDate = shipment.actual_arrival_date || shipment.planned_arrival_date
      if (!arrivalDate) return

      const arrivalWeek = getWeekFromDate(new Date(arrivalDate))

      const detail: ShipmentDetail = {
        tracking_number: shipment.tracking_number,
        planned_arrival_date: shipment.planned_arrival_date,
        actual_arrival_date: shipment.actual_arrival_date,
        shipped_qty: item.shipped_qty,
        arrival_source: shipment.actual_arrival_date ? 'actual' : 'planned',
      }

      const existing = shipmentsByWeek.get(arrivalWeek) || []
      existing.push(detail)
      shipmentsByWeek.set(arrivalWeek, existing)
    })
  })

  // Build rows with rolling inventory calculation
  let runningStock = initialStock
  const rows: AlgorithmAuditRow[] = weeks.map((week, index) => {
    const weekOffset = index - 4 // -4 to +11

    // Sales data
    const sales_forecast = forecastMap.get(week) || 0
    const sales_actual = actualMap.get(week) ?? null
    const sales_effective = sales_actual ?? sales_forecast
    const sales_source: 'actual' | 'forecast' = sales_actual !== null ? 'actual' : 'forecast'

    // Shipment data
    const weekShipments = shipmentsByWeek.get(week) || []
    const shipment_planned_qty = weekShipments
      .filter(s => !s.actual_arrival_date)
      .reduce((sum, s) => sum + s.shipped_qty, 0)
    const shipment_actual_qty = weekShipments
      .filter(s => s.actual_arrival_date)
      .reduce((sum, s) => sum + s.shipped_qty, 0)
    const shipment_incoming = shipment_planned_qty + shipment_actual_qty

    let shipment_source: 'actual' | 'planned' | 'mixed' = 'planned'
    if (shipment_actual_qty > 0 && shipment_planned_qty === 0) {
      shipment_source = 'actual'
    } else if (shipment_actual_qty > 0 && shipment_planned_qty > 0) {
      shipment_source = 'mixed'
    }

    // Inventory calculation
    const opening_stock = runningStock
    const incoming_qty = shipment_incoming
    const outgoing_qty = sales_effective
    const closing_stock = opening_stock + incoming_qty - outgoing_qty

    // Update running stock for next iteration
    runningStock = closing_stock

    // Safety threshold and status
    const safety_threshold = avgWeeklySales * product.safety_stock_weeks
    let stock_status: StockStatus = 'OK'
    if (closing_stock <= 0) {
      stock_status = 'Stockout'
    } else if (closing_stock < safety_threshold) {
      stock_status = 'Risk'
    }

    // Get week start date
    const weekStartDate = parseWeekString(week)
    const week_start_date = weekStartDate ? format(weekStartDate, 'yyyy-MM-dd') : week

    return {
      week_iso: week,
      week_start_date,
      week_offset: weekOffset,
      is_past: weekOffset < 0,
      is_current: weekOffset === 0,
      sales_forecast,
      sales_actual,
      sales_effective,
      sales_source,
      shipment_planned_qty,
      shipment_actual_qty,
      shipment_incoming,
      shipment_source,
      shipments: weekShipments,
      opening_stock,
      incoming_qty,
      outgoing_qty,
      closing_stock,
      safety_threshold,
      stock_status,
    }
  })

  return {
    product,
    rows,
    metadata: {
      current_week: currentWeek,
      start_week: startWeek,
      end_week: endWeek,
      total_weeks: weeks.length,
      avg_weekly_sales: avgWeeklySales,
      safety_stock_weeks: product.safety_stock_weeks,
    },
  }
}

/**
 * Fetch list of active products for dropdown selection
 */
export async function fetchActiveProducts(): Promise<Product[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('sku')

  if (error) {
    console.error('[Algorithm Audit] Error fetching products:', error)
    return []
  }

  return data || []
}

// ================================================================
// ALGORITHM AUDIT V2.0
// ================================================================

/**
 * Calculate backtrack timeline from a given week
 * Reverses the supply chain to determine when procurement/logistics should have occurred
 */
function calculateBacktrackTimeline(
  currentWeek: string,
  leadTimes: SupplyChainLeadTimes
): {
  planned_arrival_week: string
  planned_ship_week: string
  planned_factory_ship_week: string
  planned_order_week: string
} {
  // Forward calculation: current week -> arrival week (add safety stock weeks)
  const arrivalWeek = addWeeksToWeekString(currentWeek, leadTimes.safety_stock_weeks)

  // Backward calculation from arrival week
  const shipWeek = arrivalWeek ? addWeeksToWeekString(arrivalWeek, -leadTimes.shipping_weeks) : null
  const factoryShipWeek = shipWeek ? addWeeksToWeekString(shipWeek, -leadTimes.loading_weeks) : null
  const orderWeek = factoryShipWeek ? addWeeksToWeekString(factoryShipWeek, -leadTimes.production_weeks) : null

  return {
    planned_arrival_week: arrivalWeek || currentWeek,
    planned_ship_week: shipWeek || currentWeek,
    planned_factory_ship_week: factoryShipWeek || currentWeek,
    planned_order_week: orderWeek || currentWeek,
  }
}

/**
 * Fetch comprehensive V2.0 algorithm audit data with procurement/logistics tracking
 * Window: 4 weeks past + current week + 11 weeks future (16 weeks total)
 */
export async function fetchAlgorithmAuditV2(sku: string): Promise<AlgorithmAuditResultV2> {
  const supabase = await createServerSupabaseClient()

  // Fetch product info
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('sku', sku)
    .single()

  if (!product) {
    return {
      product: null,
      rows: [],
      leadTimes: {
        production_weeks: 8,
        loading_weeks: 1,
        shipping_weeks: 4,
        safety_stock_weeks: 2,
      },
      metadata: {
        current_week: getCurrentWeek(),
        start_week: '',
        end_week: '',
        total_weeks: 0,
        avg_weekly_sales: 0,
        safety_stock_weeks: 0,
      },
    }
  }

  // Configure lead times (default values, can be extended to read from config)
  const leadTimes: SupplyChainLeadTimes = {
    production_weeks: 8,
    loading_weeks: 1,
    shipping_weeks: 4,
    safety_stock_weeks: product.safety_stock_weeks,
  }

  // Generate 16-week range: current week - 4 to current week + 11
  const currentWeek = getCurrentWeek()
  const startWeek = addWeeksToWeekString(currentWeek, -4) || currentWeek
  const endWeek = addWeeksToWeekString(currentWeek, 11) || currentWeek

  // Build week array
  const weeks: string[] = []
  let currentIterWeek = startWeek
  for (let i = 0; i < 16; i++) {
    weeks.push(currentIterWeek)
    const next = addWeeksToWeekString(currentIterWeek, 1)
    if (!next) break
    currentIterWeek = next
  }

  // Fetch all data in parallel
  const [
    purchaseOrdersResult,
    productionDeliveriesResult,
    shipmentsResult,
    forecastsResult,
    actualsResult,
    inventorySnapshotsResult,
  ] = await Promise.all([
    // Purchase Orders with items (for order week tracking)
    supabase
      .from('purchase_orders')
      .select(`
        id,
        po_number,
        actual_order_date,
        purchase_order_items!inner(sku, ordered_qty)
      `)
      .eq('purchase_order_items.sku', sku)
      .not('actual_order_date', 'is', null),

    // Production Deliveries (for factory ship week tracking)
    supabase
      .from('production_deliveries')
      .select(`
        id,
        delivery_number,
        sku,
        delivered_qty,
        actual_delivery_date
      `)
      .eq('sku', sku)
      .not('actual_delivery_date', 'is', null),

    // Shipments with items (for ship/arrival week tracking)
    supabase
      .from('shipments')
      .select(`
        id,
        tracking_number,
        planned_departure_date,
        actual_departure_date,
        planned_arrival_date,
        actual_arrival_date,
        shipment_items!inner(sku, shipped_qty)
      `)
      .eq('shipment_items.sku', sku),

    // Sales Forecasts
    supabase
      .from('sales_forecasts')
      .select('week_iso, forecast_qty')
      .eq('sku', sku)
      .in('week_iso', weeks),

    // Sales Actuals
    supabase
      .from('sales_actuals')
      .select('week_iso, actual_qty')
      .eq('sku', sku)
      .in('week_iso', weeks),

    // Current inventory snapshot
    supabase
      .from('inventory_snapshots')
      .select('qty_on_hand')
      .eq('sku', sku),
  ])

  const purchaseOrders = purchaseOrdersResult.data || []
  const productionDeliveries = productionDeliveriesResult.data || []
  const shipments = shipmentsResult.data || []
  const forecasts = forecastsResult.data || []
  const actuals = actualsResult.data || []
  const snapshots = inventorySnapshotsResult.data || []

  // Calculate initial stock (sum of all warehouses)
  const initialStock = snapshots.reduce((sum, s) => sum + s.qty_on_hand, 0)

  // Build forecast and actual maps
  const forecastMap = new Map<string, number>()
  forecasts.forEach(f => {
    const current = forecastMap.get(f.week_iso) || 0
    forecastMap.set(f.week_iso, current + f.forecast_qty)
  })

  const actualMap = new Map<string, number>()
  actuals.forEach(a => {
    const current = actualMap.get(a.week_iso) || 0
    actualMap.set(a.week_iso, current + a.actual_qty)
  })

  // Calculate average weekly sales for safety threshold
  const totalEffectiveSales = weeks.reduce((sum, week) => {
    const forecast = forecastMap.get(week) || 0
    const actual = actualMap.get(week)
    return sum + (actual !== undefined && actual !== null ? actual : forecast)
  }, 0)
  const avgWeeklySales = totalEffectiveSales / weeks.length

  // Aggregate purchase orders by order week
  const ordersByWeek = new Map<string, number>()
  purchaseOrders.forEach(po => {
    if (!po.actual_order_date) return
    const orderWeek = getWeekFromDate(new Date(po.actual_order_date))

    const items = Array.isArray(po.purchase_order_items)
      ? po.purchase_order_items
      : [po.purchase_order_items]

    items.forEach((item) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('ordered_qty' in item)) return
      if (item.sku !== sku) return

      const current = ordersByWeek.get(orderWeek) || 0
      ordersByWeek.set(orderWeek, current + item.ordered_qty)
    })
  })

  // Aggregate production deliveries by factory ship week
  const factoryShipsByWeek = new Map<string, number>()
  productionDeliveries.forEach(delivery => {
    if (!delivery.actual_delivery_date) return
    const deliveryWeek = getWeekFromDate(new Date(delivery.actual_delivery_date))

    const current = factoryShipsByWeek.get(deliveryWeek) || 0
    factoryShipsByWeek.set(deliveryWeek, current + delivery.delivered_qty)
  })

  // Aggregate shipments by departure and arrival week
  const shipmentsByDepartureWeek = new Map<string, number>()
  const shipmentsByPlannedArrivalWeek = new Map<string, number>() // Planned arrivals (未到货)
  const shipmentsByActualArrivalWeek = new Map<string, number>() // Actual arrivals (已到货)
  const shipmentsByArrivalWeek = new Map<string, number>() // Combined (for effective calculation)
  const shipmentDetailsByArrivalWeek = new Map<string, ShipmentDetailV2[]>()

  shipments.forEach(shipment => {
    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]

    items.forEach((item) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return
      if (item.sku !== sku) return

      // Track by departure week
      if (shipment.actual_departure_date) {
        const departureWeek = getWeekFromDate(new Date(shipment.actual_departure_date))
        const current = shipmentsByDepartureWeek.get(departureWeek) || 0
        shipmentsByDepartureWeek.set(departureWeek, current + item.shipped_qty)
      }

      // Track planned arrivals (shipments without actual_arrival_date but with planned_arrival_date)
      if (!shipment.actual_arrival_date && shipment.planned_arrival_date) {
        const plannedArrivalWeek = getWeekFromDate(new Date(shipment.planned_arrival_date))
        const current = shipmentsByPlannedArrivalWeek.get(plannedArrivalWeek) || 0
        shipmentsByPlannedArrivalWeek.set(plannedArrivalWeek, current + item.shipped_qty)
      }

      // Track actual arrivals
      if (shipment.actual_arrival_date) {
        const actualArrivalWeek = getWeekFromDate(new Date(shipment.actual_arrival_date))
        const current = shipmentsByActualArrivalWeek.get(actualArrivalWeek) || 0
        shipmentsByActualArrivalWeek.set(actualArrivalWeek, current + item.shipped_qty)
      }

      // Track by arrival week (for inventory calculation - use actual if available, else planned)
      const arrivalDate = shipment.actual_arrival_date || shipment.planned_arrival_date
      if (arrivalDate) {
        const arrivalWeek = getWeekFromDate(new Date(arrivalDate))
        const current = shipmentsByArrivalWeek.get(arrivalWeek) || 0
        shipmentsByArrivalWeek.set(arrivalWeek, current + item.shipped_qty)

        // Add to details list
        const detail: ShipmentDetailV2 = {
          tracking_number: shipment.tracking_number,
          planned_departure_date: shipment.planned_departure_date,
          actual_departure_date: shipment.actual_departure_date,
          planned_arrival_date: shipment.planned_arrival_date,
          actual_arrival_date: shipment.actual_arrival_date,
          shipped_qty: item.shipped_qty,
          arrival_source: shipment.actual_arrival_date ? 'actual' : 'planned',
        }

        const existing = shipmentDetailsByArrivalWeek.get(arrivalWeek) || []
        existing.push(detail)
        shipmentDetailsByArrivalWeek.set(arrivalWeek, existing)
      }
    })
  })

  // Build rows with rolling inventory calculation
  let runningStock = initialStock
  const rows: AlgorithmAuditRowV2[] = weeks.map((week, index) => {
    const weekOffset = index - 4 // -4 to +11

    // Sales data
    const sales_forecast = forecastMap.get(week) || 0
    const sales_actual = actualMap.get(week) ?? null
    const sales_effective = sales_actual ?? sales_forecast
    const sales_source: 'actual' | 'forecast' = sales_actual !== null ? 'actual' : 'forecast'

    // Backtrack timeline calculation
    const timeline = calculateBacktrackTimeline(week, leadTimes)
    // Note: planned_arrival_qty will be set from actual shipments data (shipmentsByPlannedArrivalWeek)

    // Actual data (aggregated quantities)
    const actual_order_qty = ordersByWeek.get(week) || 0
    const actual_factory_ship_qty = factoryShipsByWeek.get(week) || 0
    const actual_ship_qty = shipmentsByDepartureWeek.get(week) || 0

    // Arrival quantities - separate planned vs actual
    const planned_arrival_from_shipments = shipmentsByPlannedArrivalWeek.get(week) || 0 // 在途货物预计到仓
    const actual_arrival_qty = shipmentsByActualArrivalWeek.get(week) || 0 // 实际已到仓

    // Determine actual weeks (only if qty > 0)
    const actual_order_week = actual_order_qty > 0 ? week : null
    const actual_factory_ship_week = actual_factory_ship_qty > 0 ? week : null
    const actual_ship_week = actual_ship_qty > 0 ? week : null
    const actual_arrival_week = actual_arrival_qty > 0 ? week : null

    // Shipment details for this week
    const weekShipments = shipmentDetailsByArrivalWeek.get(week) || []

    // Inventory calculation - use actual arrival if available, else planned from in-transit shipments
    const opening_stock = runningStock
    const arrival_effective = actual_arrival_qty > 0 ? actual_arrival_qty : planned_arrival_from_shipments
    const closing_stock = opening_stock + arrival_effective - sales_effective

    // Update running stock for next iteration
    runningStock = closing_stock

    // Safety threshold and status
    const safety_threshold = avgWeeklySales * product.safety_stock_weeks
    let stock_status: StockStatus = 'OK'
    if (closing_stock <= 0) {
      stock_status = 'Stockout'
    } else if (closing_stock < safety_threshold) {
      stock_status = 'Risk'
    }

    // Turnover ratio
    const turnover_ratio = sales_effective > 0 ? closing_stock / sales_effective : null

    // Get week start date
    const weekStartDate = parseWeekString(week)
    const week_start_date = weekStartDate ? format(weekStartDate, 'yyyy-MM-dd') : week

    return {
      week_iso: week,
      week_start_date,
      week_offset: weekOffset,
      is_past: weekOffset < 0,
      is_current: weekOffset === 0,
      sales_forecast,
      sales_actual,
      sales_effective,
      sales_source,
      planned_arrival_week: timeline.planned_arrival_week,
      planned_ship_week: timeline.planned_ship_week,
      planned_factory_ship_week: timeline.planned_factory_ship_week,
      planned_order_week: timeline.planned_order_week,
      planned_arrival_qty: planned_arrival_from_shipments, // From in-transit shipments
      actual_order_week,
      actual_order_qty,
      actual_factory_ship_week,
      actual_factory_ship_qty,
      actual_ship_week,
      actual_ship_qty,
      actual_arrival_week,
      actual_arrival_qty,
      opening_stock,
      arrival_effective,
      closing_stock,
      safety_threshold,
      turnover_ratio,
      stock_status,
      shipments: weekShipments,
    }
  })

  return {
    product,
    rows,
    leadTimes,
    metadata: {
      current_week: currentWeek,
      start_week: startWeek,
      end_week: endWeek,
      total_weeks: weeks.length,
      avg_weekly_sales: avgWeeklySales,
      safety_stock_weeks: product.safety_stock_weeks,
    },
  }
}

// ================================================================
// ALGORITHM AUDIT V3.0 (20-Column Reverse Calculation)
// ================================================================

/**
 * Fetch Algorithm Audit V3 data for a specific SKU
 *
 * @param sku - Product SKU to analyze
 * @param shippingWeeks - Configurable shipping lead time (default: 5 weeks, range: 4-6)
 * @param customStartWeek - Optional custom start week (format: 2025-W01)
 * @param customEndWeek - Optional custom end week (format: 2026-W52)
 * @returns Complete audit result with 20-column data
 */
export async function fetchAlgorithmAuditV3(
  sku: string,
  shippingWeeks: number = 5,
  customStartWeek?: string,
  customEndWeek?: string
): Promise<AlgorithmAuditResultV3> {
  const supabase = await createServerSupabaseClient()
  const currentWeekV3 = getCurrentWeek()

  // STEP 1: Fetch Product Configuration
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('sku', sku)
    .single()

  if (!product) {
    return {
      product: null,
      rows: [],
      leadTimes: {
        production_weeks: 5,
        loading_weeks: 1,
        shipping_weeks: shippingWeeks,
        safety_stock_weeks: 2,
      },
      metadata: {
        current_week: currentWeekV3,
        start_week: '',
        end_week: '',
        total_weeks: 0,
        avg_weekly_sales: 0,
        safety_stock_weeks: 2,
        production_lead_weeks: 5,
        shipping_weeks: shippingWeeks,
      },
    }
  }

  // STEP 2: Configure Lead Times
  const leadTimesV3: SupplyChainLeadTimesV3 = {
    production_weeks: product.production_lead_weeks,
    loading_weeks: 1,
    shipping_weeks: shippingWeeks,
    safety_stock_weeks: product.safety_stock_weeks,
  }

  // STEP 3: Generate Week Range (supports custom range or default 16-week)
  // 如果提供了自定义起始周和结束周，使用它们；否则使用默认的16周范围
  const startWeekV3 = customStartWeek || addWeeksToISOWeek(currentWeekV3, -4) || currentWeekV3
  const endWeekV3 = customEndWeek || addWeeksToISOWeek(currentWeekV3, 11) || currentWeekV3

  // 生成周次数组
  const weeksV3: string[] = []
  let currentIterWeekV3 = startWeekV3
  // 最多生成200周（约4年）以防止无限循环
  for (let i = 0; i < 200; i++) {
    weeksV3.push(currentIterWeekV3)
    if (currentIterWeekV3 >= endWeekV3) break
    const next = addWeeksToISOWeek(currentIterWeekV3, 1)
    if (!next) break
    currentIterWeekV3 = next
  }

  // STEP 4: Fetch All Data Sources in Parallel
  // ✅ FIX: 新增 delivery_shipment_allocations 查询，用于正确计算已发货数量
  const [
    forecastsResultV3,
    actualsResultV3,
    purchaseOrdersResultV3,
    productionDeliveriesResultV3,
    shipmentsResultV3,
    inventorySnapshotsResultV3,
    deliveryAllocationsResultV3,
  ] = await Promise.all([
    supabase
      .from('sales_forecasts')
      .select('week_iso, forecast_qty')
      .eq('sku', sku)
      .in('week_iso', weeksV3),
    supabase
      .from('sales_actuals')
      .select('week_iso, actual_qty')
      .eq('sku', sku)
      .in('week_iso', weeksV3),
    supabase
      .from('purchase_orders')
      .select(`
        id,
        po_number,
        actual_order_date,
        planned_ship_date,
        purchase_order_items!inner(id, sku, ordered_qty)
      `)
      .eq('purchase_order_items.sku', sku)
      .not('actual_order_date', 'is', null),
    supabase
      .from('production_deliveries')
      .select('id, sku, po_item_id, delivered_qty, actual_delivery_date, shipped_qty, shipment_status')
      .eq('sku', sku)
      .not('actual_delivery_date', 'is', null),
    supabase
      .from('shipments')
      .select(`
        id,
        tracking_number,
        production_delivery_id,
        planned_departure_date,
        actual_departure_date,
        planned_arrival_date,
        actual_arrival_date,
        shipment_items!inner(sku, shipped_qty)
      `)
      .eq('shipment_items.sku', sku),
    supabase
      .from('inventory_snapshots')
      .select('qty_on_hand')
      .eq('sku', sku),
    // ✅ NEW: 查询 delivery_shipment_allocations 表（N:N 关联）
    supabase
      .from('delivery_shipment_allocations')
      .select(`
        id,
        delivery_id,
        shipment_id,
        shipped_qty,
        production_deliveries!inner(sku)
      `)
      .eq('production_deliveries.sku', sku),
  ])

  const forecastsV3 = forecastsResultV3.data || []
  const actualsV3 = actualsResultV3.data || []
  const purchaseOrdersV3 = purchaseOrdersResultV3.data || []
  const productionDeliveriesV3 = productionDeliveriesResultV3.data || []
  const shipmentsV3 = shipmentsResultV3.data || []
  const snapshotsV3 = inventorySnapshotsResultV3.data || []
  // ✅ NEW: delivery_shipment_allocations 数据（N:N 关联表）
  const deliveryAllocationsV3 = deliveryAllocationsResultV3.data || []

  // STEP 5: Build Weekly Aggregation Maps
  const forecastMapV3 = new Map<string, number>()
  forecastsV3.forEach((f) => {
    const current = forecastMapV3.get(f.week_iso) || 0
    forecastMapV3.set(f.week_iso, current + f.forecast_qty)
  })

  const actualSalesMapV3 = new Map<string, number>()
  actualsV3.forEach((a) => {
    const current = actualSalesMapV3.get(a.week_iso) || 0
    actualSalesMapV3.set(a.week_iso, current + a.actual_qty)
  })

  // ================================================================
  // CRITICAL FIX: Calculate PO fulfillment status to prevent double-counting
  // For each PO item, track: ordered_qty, delivered_qty, pending_qty
  // Planned weeks should only show pending_qty (not yet fulfilled)
  // ================================================================

  // Build PO item fulfillment map: po_item_id -> { ordered, delivered, pending, order_week, planned_ship_date }
  interface POItemFulfillment {
    ordered_qty: number
    delivered_qty: number
    pending_qty: number
    order_week: string
    order_date: string
    planned_ship_date: string | null  // ✅ 新增：PO的预计出厂日期
  }
  const poItemFulfillmentMap = new Map<string, POItemFulfillment>()

  // Calculate delivered quantities per PO item from production_deliveries
  const deliveriesByPOItem = new Map<string, number>()
  productionDeliveriesV3.forEach((delivery: any) => {
    if (!delivery.po_item_id) return
    const current = deliveriesByPOItem.get(delivery.po_item_id) || 0
    deliveriesByPOItem.set(delivery.po_item_id, current + delivery.delivered_qty)
  })

  // Build fulfillment status for each PO item
  purchaseOrdersV3.forEach((po: any) => {
    if (!po.actual_order_date) return
    const orderWeek = getWeekFromDate(new Date(po.actual_order_date))
    const items = Array.isArray(po.purchase_order_items)
      ? po.purchase_order_items
      : [po.purchase_order_items]
    items.forEach((item: any) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('ordered_qty' in item)) return
      if (item.sku !== sku) return

      const delivered = deliveriesByPOItem.get(item.id) || 0
      const pending = item.ordered_qty - delivered

      poItemFulfillmentMap.set(item.id, {
        ordered_qty: item.ordered_qty,
        delivered_qty: delivered,
        pending_qty: Math.max(0, pending), // Ensure non-negative
        order_week: orderWeek,
        order_date: po.actual_order_date,
        planned_ship_date: po.planned_ship_date || null, // ✅ 存储 PO 的预计出厂日期
      })
    })
  })

  // Aggregate actual orders (for order week display)
  const actualOrderMapV3 = new Map<string, number>()
  poItemFulfillmentMap.forEach((fulfillment) => {
    const current = actualOrderMapV3.get(fulfillment.order_week) || 0
    actualOrderMapV3.set(fulfillment.order_week, current + fulfillment.ordered_qty)
  })

  // Aggregate actual factory shipments (deliveries)
  const actualFactoryShipMapV3 = new Map<string, number>()
  productionDeliveriesV3.forEach((delivery) => {
    if (!delivery.actual_delivery_date) return
    const deliveryWeek = getWeekFromDate(new Date(delivery.actual_delivery_date))
    const current = actualFactoryShipMapV3.get(deliveryWeek) || 0
    actualFactoryShipMapV3.set(deliveryWeek, current + delivery.delivered_qty)
  })

  // ================================================================
  // ✅ CRITICAL FIX: Calculate delivery fulfillment using N:N allocations table
  // 使用 delivery_shipment_allocations 表来计算已发货数量，而非旧的 production_delivery_id
  // For each delivery, track: delivered_qty, shipped_qty, pending_ship_qty
  // ================================================================

  interface DeliveryFulfillment {
    delivered_qty: number
    shipped_qty: number
    pending_ship_qty: number
    delivery_week: string
  }
  const deliveryFulfillmentMap = new Map<string, DeliveryFulfillment>()

  // ✅ FIX V3: 计算每个 delivery 的已发货数量
  // 使用多种数据源确保准确性
  const shippedByDelivery = new Map<string, number>()

  // 方案1: 优先使用 production_deliveries.shipped_qty（触发器维护的字段）
  productionDeliveriesV3.forEach((delivery: any) => {
    if (delivery.shipped_qty != null && delivery.shipped_qty > 0) {
      shippedByDelivery.set(delivery.id, delivery.shipped_qty)
    }
  })

  // 方案2: 使用 N:N 关联表 delivery_shipment_allocations 的数据
  // 如果 allocation 表有更多的数据，使用较大值
  deliveryAllocationsV3.forEach((allocation: any) => {
    if (!allocation.delivery_id) return
    const existingShipped = shippedByDelivery.get(allocation.delivery_id) || 0
    const newShipped = existingShipped + allocation.shipped_qty
    // 使用较大值（allocation 表可能有更完整的数据）
    shippedByDelivery.set(allocation.delivery_id, Math.max(existingShipped, newShipped))
  })

  // ✅ 方案3 (新增): 从 shipment_items 反向计算总发货量
  // 如果通过旧方式创建的 shipment 没有关联 delivery，我们需要用另一种方式处理
  // 计算所有已发货的总量，用于校验
  const totalShippedFromShipments = shipmentsV3.reduce((total: number, shipment: any) => {
    if (!shipment.actual_departure_date) return total // 只计算已发货的
    const items = Array.isArray(shipment.shipment_items) ? shipment.shipment_items : [shipment.shipment_items]
    return total + items.reduce((sum: number, item: any) => {
      if (!item || item.sku !== sku) return sum
      return sum + (item.shipped_qty || 0)
    }, 0)
  }, 0)

  // 计算 delivery 层的总出货量
  const totalDelivered = productionDeliveriesV3.reduce((sum, d) => sum + d.delivered_qty, 0)

  // 计算 delivery 层认为的已发货总量
  let totalShippedFromDeliveries = 0
  shippedByDelivery.forEach((qty) => { totalShippedFromDeliveries += qty })

  // ⚠️ 如果 shipment 发货总量 > delivery 记录的发货量，说明有未关联的 shipment
  // 这种情况下，我们需要减少 pending_ship_qty 的计算
  const unlinkedShipmentQty = Math.max(0, totalShippedFromShipments - totalShippedFromDeliveries)

  // Build fulfillment status for each delivery
  productionDeliveriesV3.forEach((delivery) => {
    if (!delivery.actual_delivery_date) return
    const deliveryWeek = getWeekFromDate(new Date(delivery.actual_delivery_date))
    const shipped = shippedByDelivery.get(delivery.id) || 0
    const pending = delivery.delivered_qty - shipped

    deliveryFulfillmentMap.set(delivery.id, {
      delivered_qty: delivery.delivered_qty,
      shipped_qty: shipped,
      pending_ship_qty: Math.max(0, pending),
      delivery_week: deliveryWeek,
    })
  })

  // Aggregate actual shipments (departures)
  const actualShipMapV3 = new Map<string, number>()
  shipmentsV3.forEach((shipment: any) => {
    if (!shipment.actual_departure_date) return
    const departureWeek = getWeekFromDate(new Date(shipment.actual_departure_date))
    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]
    items.forEach((item: any) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return
      if (item.sku !== sku) return
      const current = actualShipMapV3.get(departureWeek) || 0
      actualShipMapV3.set(departureWeek, current + item.shipped_qty)
    })
  })

  // ================================================================
  // CRITICAL FIX: Calculate shipment fulfillment to prevent double-counting
  // For each shipment, track: shipped_qty, arrived status
  // ✅ FIX #4: ShipmentFulfillment不再使用planned_arrival_week
  // 说明：到仓周应该基于departure_week + shipping_weeks计算，而非planned_arrival_week
  // ================================================================

  interface ShipmentFulfillment {
    shipped_qty: number
    arrived: boolean          // 是否已到达
    departure_week: string    // 实际发货周（用于计算到仓周）
    // ✅ 移除planned_arrival_week和actual_arrival_week字段
    // 到仓周通过 departure_week + shipping_weeks 动态计算
  }
  const shipmentFulfillmentMap = new Map<string, ShipmentFulfillment>()

  shipmentsV3.forEach((shipment: any) => {
    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]

    const totalShippedQty = items.reduce((sum: number, item: any) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return sum
      if (item.sku !== sku) return sum
      return sum + item.shipped_qty
    }, 0)

    if (totalShippedQty === 0) return

    const departureWeek = shipment.actual_departure_date
      ? getWeekFromDate(new Date(shipment.actual_departure_date))
      : null

    if (departureWeek) {
      shipmentFulfillmentMap.set(shipment.id, {
        shipped_qty: totalShippedQty,
        arrived: !!shipment.actual_arrival_date,
        departure_week: departureWeek,
        // ✅ 不再存储planned/actual_arrival_week，由计算逻辑动态推导
      })
    }
  })

  // ✅ FIX #3: 分离actual_arrival的定义，只统计真正已到达的shipment
  // 说明：原逻辑混用了actual_arrival_date和planned_arrival_date，导致actual_arrival包含了计划数据
  // 修正后：actual_arrival只统计已到达的shipment（有actual_arrival_date的）
  const actualArrivalMapV3 = new Map<string, number>()
  shipmentsV3.forEach((shipment: any) => {
    // ✅ 只使用actual_arrival_date，不再混用planned_arrival_date
    if (!shipment.actual_arrival_date) return  // 跳过未到达的shipment

    const arrivalWeek = getWeekFromDate(new Date(shipment.actual_arrival_date))
    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]
    items.forEach((item: any) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return
      if (item.sku !== sku) return
      const current = actualArrivalMapV3.get(arrivalWeek) || 0
      actualArrivalMapV3.set(arrivalWeek, current + item.shipped_qty)
    })
  })

  // STEP 6: Initialize Rows with Sales and Actual Data
  // 计算当前周在数组中的索引（用于week_offset）
  const currentWeekIndex = weeksV3.indexOf(currentWeekV3)

  const rowsV3: AlgorithmAuditRowV3[] = weeksV3.map((week, index) => {
    // week_offset: 相对于当前周的偏移量
    const weekOffset = currentWeekIndex >= 0 ? index - currentWeekIndex : index
    const weekStartDate = parseISOWeekString(week)
    const week_start_date = weekStartDate ? formatDateISO(weekStartDate) : week

    const sales_forecast = forecastMapV3.get(week) || 0
    const sales_actual = actualSalesMapV3.get(week) ?? null
    const sales_effective = sales_actual ?? sales_forecast

    const actual_order = actualOrderMapV3.get(week) || 0
    const actual_factory_ship = actualFactoryShipMapV3.get(week) || 0
    const actual_ship = actualShipMapV3.get(week) || 0
    const actual_arrival = actualArrivalMapV3.get(week) || 0

    return {
      week_iso: week,
      week_start_date,
      week_offset: weekOffset,
      is_past: week < currentWeekV3,      // 基于周次字符串比较
      is_current: week === currentWeekV3, // 精确匹配当前周
      sales_forecast,
      sales_actual,
      sales_effective,
      planned_order: 0,
      actual_order,
      order_effective: 0,
      planned_factory_ship: 0,
      actual_factory_ship,
      factory_ship_effective: 0,
      planned_ship: 0,
      actual_ship,
      ship_effective: 0,
      planned_arrival: 0,
      actual_arrival,
      arrival_effective: 0,
      opening_stock: 0,
      closing_stock: 0,
      safety_threshold: 0,
      stock_status: 'OK' as StockStatus,
    }
  })

  // STEP 7: Calculate Planned Quantities Based on Fulfillment Status
  // ================================================================
  // CRITICAL FIX: Planned quantities should reflect PENDING (unfulfilled) portions only
  // This prevents double-counting when actual data exists
  // ================================================================

  const plannedOrderMapV3 = new Map<string, number>()
  const plannedFactoryShipMapV3 = new Map<string, number>()
  const plannedShipMapV3 = new Map<string, number>()
  const plannedArrivalMapV3 = new Map<string, number>()

  // For each PO item, calculate planned factory ship week based on pending_qty
  // ✅ CRITICAL FIX: 优先使用 PO 的 planned_ship_date（预计出厂日期）
  // 如果没有 planned_ship_date，则回退到默认计算：order_week + production_weeks
  poItemFulfillmentMap.forEach((fulfillment) => {
    if (fulfillment.pending_qty <= 0) return // Skip if fully fulfilled

    // Calculate when this pending order should ship from factory
    // ✅ 优先使用 PO 设定的预计出厂日期
    let factoryShipWeek: string | null = null
    if (fulfillment.planned_ship_date) {
      // 使用 PO 的预计出厂日期转换为周次
      factoryShipWeek = getWeekFromDate(new Date(fulfillment.planned_ship_date))
    } else {
      // 回退到默认计算：下单周 + 生产周期
      factoryShipWeek = addWeeksToISOWeek(fulfillment.order_week, leadTimesV3.production_weeks)
    }

    if (factoryShipWeek) {
      const current = plannedFactoryShipMapV3.get(factoryShipWeek) || 0
      plannedFactoryShipMapV3.set(factoryShipWeek, current + fulfillment.pending_qty)
    }

    // ❌ 移除：不再从PO层计算planned_ship
    // PO层的pending_qty代表"未生产"的数量，不是"待发货"数量
    // planned_ship应该从Delivery层获取（工厂已出货但物流未发货）
  })

  // ================================================================
  // ✅ CRITICAL FIX V2: 计算真正的待发货数量 (pending_ship)
  //
  // 问题背景：
  // - 旧方式创建的 shipment 没有关联 delivery (production_delivery_id = NULL)
  // - 导致 delivery.shipped_qty = 0，系统认为全部未发
  // - 实际上 shipment_items 已经记录了发货，造成重复计算
  //
  // 解决方案：
  // - 从 shipment_items 计算总发货量 (最准确)
  // - 真正的 pending_ship = totalDelivered - totalShippedFromShipments
  // ================================================================

  // 计算真正的待发货总量
  const actualPendingShipTotal = Math.max(0, totalDelivered - totalShippedFromShipments)

  // 如果有待发货数量，基于当前周计算预计发货周和到仓周
  // 注意：只放到 planned_ship，不放到 planned_arrival
  // 因为 planned_arrival 会由已发货的 shipment 单独计算（在途货物）
  if (actualPendingShipTotal > 0) {
    // 基于当前周 + loading_weeks 计算计划发货周（假设尽快发货）
    const shipWeek = addWeeksToISOWeek(currentWeekV3, leadTimesV3.loading_weeks)
    if (shipWeek) {
      const current = plannedShipMapV3.get(shipWeek) || 0
      plannedShipMapV3.set(shipWeek, current + actualPendingShipTotal)
    }

    // 基于发货周 + shipping_weeks 计算计划到仓周
    const arrivalWeek = shipWeek
      ? addWeeksToISOWeek(shipWeek, leadTimesV3.shipping_weeks)
      : null
    if (arrivalWeek) {
      const current = plannedArrivalMapV3.get(arrivalWeek) || 0
      plannedArrivalMapV3.set(arrivalWeek, current + actualPendingShipTotal)
    }
  }

  // ✅ FIX #2: 修正在途shipment的到仓时间计算逻辑
  // 说明：对于已发货但未到仓的shipment，应该基于实际发货周 + shipping_weeks计算到仓周
  // 不应该使用planned_arrival_week，因为那是基于计划的，不是基于实际发货的
  shipmentFulfillmentMap.forEach((fulfillment) => {
    if (fulfillment.arrived) return // 跳过已到达的shipment

    // ✅ 始终基于实际发货周计算到仓周（而非使用planned_arrival_week）
    const arrivalWeek = addWeeksToISOWeek(
      fulfillment.departure_week,  // 使用实际发货周
      leadTimesV3.shipping_weeks   // 加上运输周期
    )

    if (arrivalWeek) {
      // 添加到计划到仓（planned_arrival）
      const existing = plannedArrivalMapV3.get(arrivalWeek) || 0
      plannedArrivalMapV3.set(arrivalWeek, existing + fulfillment.shipped_qty)
    }
  })

  // STEP 7.5: Apply Planned Values to Rows
  rowsV3.forEach((row) => {
    // Set planned values from fulfillment-based calculation
    row.planned_order = plannedOrderMapV3.get(row.week_iso) || 0
    row.planned_factory_ship = plannedFactoryShipMapV3.get(row.week_iso) || 0
    row.planned_ship = plannedShipMapV3.get(row.week_iso) || 0
    row.planned_arrival = plannedArrivalMapV3.get(row.week_iso) || 0

    // Effective values: use actual if available, otherwise planned
    row.order_effective = row.actual_order || row.planned_order
    row.factory_ship_effective = row.actual_factory_ship || row.planned_factory_ship
    row.ship_effective = row.actual_ship || row.planned_ship
    row.arrival_effective = row.actual_arrival || row.planned_arrival
  })

  // STEP 8: Calculate Rolling Inventory
  const initialStockV3 = snapshotsV3.reduce((sum, s) => sum + s.qty_on_hand, 0)
  const totalEffectiveSalesV3 = rowsV3.reduce((sum, row) => sum + row.sales_effective, 0)
  const avgWeeklySalesV3 = totalEffectiveSalesV3 / rowsV3.length

  let runningStockV3 = initialStockV3
  rowsV3.forEach((row) => {
    row.opening_stock = runningStockV3
    row.closing_stock = runningStockV3 + row.arrival_effective - row.sales_effective
    row.safety_threshold = row.sales_effective * leadTimesV3.safety_stock_weeks
    runningStockV3 = row.closing_stock

    if (row.closing_stock <= 0) {
      row.stock_status = 'Stockout'
    } else if (row.closing_stock < row.safety_threshold) {
      row.stock_status = 'Risk'
    } else {
      row.stock_status = 'OK'
    }
  })

  return {
    product,
    rows: rowsV3,
    leadTimes: leadTimesV3,
    metadata: {
      current_week: currentWeekV3,
      start_week: startWeekV3,
      end_week: endWeekV3,
      total_weeks: weeksV3.length,
      avg_weekly_sales: avgWeeklySalesV3,
      safety_stock_weeks: product.safety_stock_weeks,
      production_lead_weeks: product.production_lead_weeks,
      shipping_weeks: shippingWeeks,
    },
  }
}

// ================================================================
// ALGORITHM AUDIT V4.0 (Enhanced with Demand Coverage & Lineage)
// ================================================================

import type {
  AlgorithmAuditRowV4,
  AlgorithmAuditResultV4,
  DemandCoverage,
  OrderMatch,
  OrderDetailV4,
  DeliveryDetailV4,
  ShipmentDetailV4,
  ArrivalDetailV4,
  PropagationSource,
  PropagationConfidence,
  CoverageStatus,
} from '@/lib/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Match sales demands to actual orders within ±1 week tolerance
 * This function implements demand coverage analysis
 */
function matchSalesDemandsToOrders(
  rows: AlgorithmAuditRowV3[],
  leadTimes: SupplyChainLeadTimesV3
): Map<string, DemandCoverage> {
  const demandCoverageMap = new Map<string, DemandCoverage>()

  rows.forEach((row) => {
    const salesDemand = row.sales_effective
    if (salesDemand <= 0) return

    // Calculate target order week (backtrack from sales week)
    const arrivalWeek = addWeeksToISOWeek(row.week_iso, -leadTimes.safety_stock_weeks)
    const shipWeek = arrivalWeek ? addWeeksToISOWeek(arrivalWeek, -leadTimes.shipping_weeks) : null
    const factoryShipWeek = shipWeek ? addWeeksToISOWeek(shipWeek, -leadTimes.loading_weeks) : null
    const targetOrderWeek = factoryShipWeek
      ? addWeeksToISOWeek(factoryShipWeek, -leadTimes.production_weeks)
      : null

    if (!targetOrderWeek) return

    // Find matching orders within ±1 week tolerance
    const matchingOrders: OrderMatch[] = []
    for (let offset = -1; offset <= 1; offset++) {
      const searchWeek = addWeeksToISOWeek(targetOrderWeek, offset)
      if (!searchWeek) continue

      const orderRow = rows.find((r) => r.week_iso === searchWeek)
      if (orderRow && orderRow.actual_order > 0) {
        matchingOrders.push({
          po_numbers: [], // Will be filled from detailed query
          ordered_qty: orderRow.actual_order,
          order_week: searchWeek,
          week_offset: offset,
        })
      }
    }

    // Calculate coverage
    const totalOrderedCoverage = matchingOrders.reduce((sum, o) => sum + o.ordered_qty, 0)
    const coverageStatus: CoverageStatus =
      totalOrderedCoverage >= salesDemand
        ? 'Fully Covered'
        : totalOrderedCoverage > 0
        ? 'Partially Covered'
        : 'Uncovered'

    demandCoverageMap.set(row.week_iso, {
      sales_week: row.week_iso,
      sales_demand: salesDemand,
      target_order_week: targetOrderWeek,
      matching_orders: matchingOrders,
      total_ordered_coverage: totalOrderedCoverage,
      uncovered_qty: Math.max(0, salesDemand - totalOrderedCoverage),
      coverage_status: coverageStatus,
    })
  })

  return demandCoverageMap
}

/**
 * Fetch order details for specific weeks
 */
async function fetchOrderDetailsByWeeks(
  supabase: SupabaseClient,
  sku: string,
  weeks: string[]
): Promise<OrderDetailV4[]> {
  if (weeks.length === 0) return []

  // Convert weeks to date range for efficient DB query
  const dateRanges = weeks.map((week) => {
    const weekStart = parseISOWeekString(week)
    const weekEnd = weekStart ? new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000) : weekStart
    return { start: weekStart ? formatDateISO(weekStart) : '', end: weekEnd ? formatDateISO(weekEnd) : '' }
  })

  const minDate = dateRanges[0].start
  const maxDate = dateRanges[dateRanges.length - 1].end

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      po_number,
      actual_order_date,
      suppliers(supplier_name),
      purchase_order_items!inner(
        id,
        sku,
        ordered_qty,
        delivered_qty
      )
    `)
    .eq('purchase_order_items.sku', sku)
    .gte('actual_order_date', minDate)
    .lte('actual_order_date', maxDate)
    .not('actual_order_date', 'is', null)

  if (error) throw error

  // Transform to OrderDetailV4 format
  const details: OrderDetailV4[] = []
  data?.forEach((po: any) => {
    const items = Array.isArray(po.purchase_order_items)
      ? po.purchase_order_items
      : [po.purchase_order_items]

    items.forEach((item: any) => {
      if (item.sku !== sku) return

      const orderWeek = getWeekFromDate(new Date(po.actual_order_date))
      const pendingQty = item.ordered_qty - item.delivered_qty
      const fulfillmentStatus: 'Complete' | 'Partial' | 'Pending' =
        pendingQty === 0 ? 'Complete' : item.delivered_qty > 0 ? 'Partial' : 'Pending'

      details.push({
        po_id: po.id,
        po_number: po.po_number,
        ordered_qty: item.ordered_qty,
        order_date: po.actual_order_date,
        order_week: orderWeek,
        fulfillment_status: fulfillmentStatus,
        delivered_qty: item.delivered_qty,
        pending_qty: pendingQty,
        supplier_name: po.suppliers?.supplier_name || null,
      })
    })
  })

  return details
}

/**
 * Fetch delivery details for specific weeks
 */
async function fetchDeliveryDetailsByWeeks(
  supabase: SupabaseClient,
  sku: string,
  weeks: string[]
): Promise<DeliveryDetailV4[]> {
  if (weeks.length === 0) return []

  const dateRanges = weeks.map((week) => {
    const weekStart = parseISOWeekString(week)
    const weekEnd = weekStart ? new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000) : weekStart
    return { start: weekStart ? formatDateISO(weekStart) : '', end: weekEnd ? formatDateISO(weekEnd) : '' }
  })

  const minDate = dateRanges[0].start
  const maxDate = dateRanges[dateRanges.length - 1].end

  const { data, error } = await supabase
    .from('production_deliveries')
    .select(`
      id,
      delivery_number,
      sku,
      delivered_qty,
      actual_delivery_date,
      purchase_order_items!inner(
        purchase_orders!inner(po_number)
      )
    `)
    .eq('sku', sku)
    .gte('actual_delivery_date', minDate)
    .lte('actual_delivery_date', maxDate)
    .not('actual_delivery_date', 'is', null)

  if (error) throw error

  // For each delivery, calculate shipped quantity from shipments
  const details: DeliveryDetailV4[] = []

  for (const delivery of data || []) {
    const deliveryWeek = getWeekFromDate(new Date(delivery.actual_delivery_date))

    // Query shipments linked to this delivery
    const { data: shipmentData } = await supabase
      .from('shipments')
      .select('shipment_items!inner(sku, shipped_qty)')
      .eq('production_delivery_id', delivery.id)
      .eq('shipment_items.sku', sku)

    let shippedQty = 0
    shipmentData?.forEach((shipment: any) => {
      const items = Array.isArray(shipment.shipment_items) ? shipment.shipment_items : [shipment.shipment_items]
      items.forEach((item: any) => {
        if (item.sku === sku) {
          shippedQty += item.shipped_qty
        }
      })
    })

    const unshippedQty = delivery.delivered_qty - shippedQty
    const shipmentStatus: 'Fully Shipped' | 'Partially Shipped' | 'Awaiting Shipment' =
      unshippedQty === 0 ? 'Fully Shipped' : shippedQty > 0 ? 'Partially Shipped' : 'Awaiting Shipment'

    // Extract PO number from nested structure
    const poItem: any = Array.isArray(delivery.purchase_order_items)
      ? delivery.purchase_order_items[0]
      : delivery.purchase_order_items
    const po: any = poItem?.purchase_orders
    const poNumber = Array.isArray(po) ? po[0]?.po_number : po?.po_number

    details.push({
      delivery_id: delivery.id,
      delivery_number: delivery.delivery_number,
      po_number: poNumber || 'N/A',
      delivered_qty: delivery.delivered_qty,
      delivery_date: delivery.actual_delivery_date,
      delivery_week: deliveryWeek,
      shipment_status: shipmentStatus,
      shipped_qty: shippedQty,
      unshipped_qty: unshippedQty,
    })
  }

  return details
}

/**
 * Fetch shipment details by departure weeks
 */
async function fetchShipmentDetailsByDepartureWeeks(
  supabase: SupabaseClient,
  sku: string,
  weeks: string[]
): Promise<ShipmentDetailV4[]> {
  if (weeks.length === 0) return []

  const dateRanges = weeks.map((week) => {
    const weekStart = parseISOWeekString(week)
    const weekEnd = weekStart ? new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000) : weekStart
    return { start: weekStart ? formatDateISO(weekStart) : '', end: weekEnd ? formatDateISO(weekEnd) : '' }
  })

  const minDate = dateRanges[0].start
  const maxDate = dateRanges[dateRanges.length - 1].end

  const { data, error } = await supabase
    .from('shipments')
    .select(`
      id,
      tracking_number,
      actual_departure_date,
      actual_arrival_date,
      planned_arrival_date,
      production_deliveries(delivery_number),
      shipment_items!inner(sku, shipped_qty)
    `)
    .eq('shipment_items.sku', sku)
    .gte('actual_departure_date', minDate)
    .lte('actual_departure_date', maxDate)

  if (error) throw error

  const details: ShipmentDetailV4[] = []
  data?.forEach((shipment: any) => {
    const items = Array.isArray(shipment.shipment_items) ? shipment.shipment_items : [shipment.shipment_items]

    items.forEach((item: any) => {
      if (item.sku !== sku) return

      const plannedArrivalWeek = shipment.planned_arrival_date
        ? getWeekFromDate(new Date(shipment.planned_arrival_date))
        : 'N/A'
      const actualArrivalWeek = shipment.actual_arrival_date
        ? getWeekFromDate(new Date(shipment.actual_arrival_date))
        : null

      const currentStatus: 'Arrived' | 'In Transit' | 'Departed' | 'Awaiting' =
        shipment.actual_arrival_date
          ? 'Arrived'
          : shipment.actual_departure_date
          ? 'In Transit'
          : 'Awaiting'

      details.push({
        shipment_id: shipment.id,
        tracking_number: shipment.tracking_number,
        delivery_number: shipment.production_deliveries?.delivery_number || null,
        shipped_qty: item.shipped_qty,
        departure_date: shipment.actual_departure_date,
        arrival_date: shipment.actual_arrival_date,
        planned_arrival_week: plannedArrivalWeek,
        actual_arrival_week: actualArrivalWeek,
        current_status: currentStatus,
      })
    })
  })

  return details
}

/**
 * Fetch shipment details by arrival weeks
 */
async function fetchShipmentDetailsByArrivalWeeks(
  supabase: SupabaseClient,
  sku: string,
  weeks: string[]
): Promise<ArrivalDetailV4[]> {
  if (weeks.length === 0) return []

  const dateRanges = weeks.map((week) => {
    const weekStart = parseISOWeekString(week)
    const weekEnd = weekStart ? new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000) : weekStart
    return { start: weekStart ? formatDateISO(weekStart) : '', end: weekEnd ? formatDateISO(weekEnd) : '' }
  })

  const minDate = dateRanges[0].start
  const maxDate = dateRanges[dateRanges.length - 1].end

  const { data, error } = await supabase
    .from('shipments')
    .select(`
      id,
      tracking_number,
      actual_arrival_date,
      destination_warehouse_id,
      warehouses!inner(warehouse_code, warehouse_name),
      shipment_items!inner(sku, shipped_qty)
    `)
    .eq('shipment_items.sku', sku)
    .gte('actual_arrival_date', minDate)
    .lte('actual_arrival_date', maxDate)
    .not('actual_arrival_date', 'is', null)

  if (error) throw error

  const details: ArrivalDetailV4[] = []
  data?.forEach((shipment: any) => {
    const items = Array.isArray(shipment.shipment_items) ? shipment.shipment_items : [shipment.shipment_items]

    items.forEach((item: any) => {
      if (item.sku !== sku) return

      const arrivalWeek = getWeekFromDate(new Date(shipment.actual_arrival_date))

      details.push({
        shipment_id: shipment.id,
        tracking_number: shipment.tracking_number,
        po_number: null, // Would require complex join to get PO number
        arrived_qty: item.shipped_qty,
        arrival_date: shipment.actual_arrival_date,
        arrival_week: arrivalWeek,
        warehouse_code: shipment.warehouses?.warehouse_code || 'N/A',
        destination_warehouse_name: shipment.warehouses?.warehouse_name || 'Unknown',
      })
    })
  })

  return details
}

/**
 * Main V4 function - Integrates V3 logic with demand matching and detail queries
 */
export async function fetchAlgorithmAuditV4(
  sku: string,
  shippingWeeks: number = 5,
  customStartWeek?: string,
  customEndWeek?: string
): Promise<AlgorithmAuditResultV4> {
  // Step 1: Get V3 base data
  const resultV3 = await fetchAlgorithmAuditV3(sku, shippingWeeks, customStartWeek, customEndWeek)

  if (!resultV3.product) {
    // 返回空的校验结果
    const emptyValidation: SupplyChainValidation = {
      is_valid: true,
      totals: { ordered: 0, factory_shipped: 0, shipped: 0, arrived: 0 },
      actuals: { ordered: 0, factory_shipped: 0, shipped: 0, arrived: 0 },
      pending: { factory_ship: 0, ship: 0, arrival: 0 },
      errors: [],
      warnings: [],
    }
    return {
      product: null,
      rows: [],
      leadTimes: resultV3.leadTimes,
      metadata: {
        ...resultV3.metadata,
        total_demand: 0,
        total_ordered: 0,
        overall_coverage_percentage: 0,
        variance_count: 0,
        total_factory_ship_adjustment: 0,
        total_ship_adjustment: 0,
      },
      validation: emptyValidation,
    }
  }

  // Step 1.5: Fetch variance adjustments for the week range
  const weekRange = resultV3.rows.map((row) => row.week_iso)
  const varianceAdjustments = await fetchVarianceAdjustmentsForAudit(sku, weekRange)

  // Step 2: Match sales demands to orders
  const demandCoverageMap = matchSalesDemandsToOrders(resultV3.rows, resultV3.leadTimes)

  // Step 3: Identify weeks with actual data
  const weeksWithOrders = resultV3.rows.filter((r) => r.actual_order > 0).map((r) => r.week_iso)
  const weeksWithDeliveries = resultV3.rows.filter((r) => r.actual_factory_ship > 0).map((r) => r.week_iso)
  const weeksWithDepartures = resultV3.rows.filter((r) => r.actual_ship > 0).map((r) => r.week_iso)
  const weeksWithArrivals = resultV3.rows.filter((r) => r.actual_arrival > 0).map((r) => r.week_iso)

  // Step 4: Fetch detailed records in parallel
  const supabase = await createServerSupabaseClient()
  const [orderDetails, deliveryDetails, shipmentDetails, arrivalDetails] = await Promise.all([
    fetchOrderDetailsByWeeks(supabase, sku, weeksWithOrders),
    fetchDeliveryDetailsByWeeks(supabase, sku, weeksWithDeliveries),
    fetchShipmentDetailsByDepartureWeeks(supabase, sku, weeksWithDepartures),
    fetchShipmentDetailsByArrivalWeeks(supabase, sku, weeksWithArrivals),
  ])

  // Step 5: Build detail maps
  const orderDetailMap = new Map<string, OrderDetailV4[]>()
  orderDetails.forEach((detail) => {
    const existing = orderDetailMap.get(detail.order_week) || []
    existing.push(detail)
    orderDetailMap.set(detail.order_week, existing)
  })

  const deliveryDetailMap = new Map<string, DeliveryDetailV4[]>()
  deliveryDetails.forEach((detail) => {
    const existing = deliveryDetailMap.get(detail.delivery_week) || []
    existing.push(detail)
    deliveryDetailMap.set(detail.delivery_week, existing)
  })

  const shipmentDetailMap = new Map<string, ShipmentDetailV4[]>()
  shipmentDetails.forEach((detail) => {
    const departureWeek = detail.departure_date ? getWeekFromDate(new Date(detail.departure_date)) : 'N/A'
    const existing = shipmentDetailMap.get(departureWeek) || []
    existing.push(detail)
    shipmentDetailMap.set(departureWeek, existing)
  })

  const arrivalDetailMap = new Map<string, ArrivalDetailV4[]>()
  arrivalDetails.forEach((detail) => {
    const existing = arrivalDetailMap.get(detail.arrival_week) || []
    existing.push(detail)
    arrivalDetailMap.set(detail.arrival_week, existing)
  })

  // Step 6: Enhance rows with V4 data
  // ✅ CRITICAL FIX: 直接使用 V3 的正确计算结果，不应用 variance adjustment
  //
  // 修复说明：
  // 1. V3 已经从 shipment_items 正确计算了 planned_ship = totalDelivered - totalShippedFromShipments
  // 2. variance adjustment 是差异追踪工具，不应用于修正 planned 数量
  // 3. 应用 variance 会导致重复计算，因为 V3 的计算已经包含了实际的 pending 数量
  //
  // PSI 核心逻辑：
  // - 期初库存 = 上周期末库存
  // - 到仓取值 = COALESCE(actual_arrival, planned_arrival)
  // - 销售取值 = COALESCE(actual_sales, forecast_sales)
  // - 期末库存 = 期初 + 到仓 - 销售
  const rowsV4: AlgorithmAuditRowV4[] = resultV3.rows.map((row) => {
    const demandCoverage = demandCoverageMap.get(row.week_iso)

    // ✅ 直接使用 V3 的值，不做任何 adjustment
    // V3 的计算逻辑已经正确：
    // - actual_factory_ship: 从 production_deliveries 统计
    // - actual_ship: 从 shipments (actual_departure_date) 统计
    // - actual_arrival: 从 shipments (actual_arrival_date) 统计
    // - planned_ship: totalDelivered - totalShippedFromShipments (待发货)
    // - planned_arrival: 在途货物 (已发货但未到仓) + planned_ship (预计发货后到仓)

    // ✅ Effective 值使用 COALESCE 逻辑 (PSI 标准算法)
    const factory_ship_effective = row.actual_factory_ship || row.planned_factory_ship
    const ship_effective = row.actual_ship || row.planned_ship
    const arrival_effective = row.actual_arrival || row.planned_arrival

    return {
      ...row,
      // 使用 COALESCE 逻辑计算 effective 值
      factory_ship_effective,
      ship_effective,
      arrival_effective,

      // Sales coverage analysis
      sales_coverage_status: demandCoverage?.coverage_status || 'Unknown',
      sales_uncovered_qty: demandCoverage?.uncovered_qty || 0,

      // Lineage metadata (追踪数据来源)
      planned_factory_ship_source: row.actual_factory_ship > 0
        ? [{ source_type: 'actual_factory_ship' as const, source_week: row.week_iso, confidence: 'high' as const }]
        : row.planned_factory_ship > 0
        ? [{ source_type: 'reverse_calc' as const, source_week: row.week_iso, confidence: 'medium' as const }]
        : undefined,
      planned_ship_source: row.actual_ship > 0
        ? [{ source_type: 'actual_ship' as const, source_week: row.week_iso, confidence: 'high' as const }]
        : row.planned_ship > 0
        ? [{ source_type: 'reverse_calc' as const, source_week: row.week_iso, confidence: 'medium' as const }]
        : undefined,
      planned_arrival_source: row.actual_arrival > 0
        ? [{ source_type: 'actual_arrival' as const, source_week: row.week_iso, confidence: 'high' as const }]
        : row.planned_arrival > 0
        ? [{ source_type: 'reverse_calc' as const, source_week: row.week_iso, confidence: 'medium' as const }]
        : undefined,

      // Detailed data (for expandable rows)
      order_details: orderDetailMap.get(row.week_iso) || [],
      factory_ship_details: deliveryDetailMap.get(row.week_iso) || [],
      ship_details: shipmentDetailMap.get(row.week_iso) || [],
      arrival_details: arrivalDetailMap.get(row.week_iso) || [],
    }
  })

  // Step 7: Calculate V4-specific metadata
  const totalDemand = rowsV4.reduce((sum, row) => sum + row.sales_effective, 0)
  const totalOrdered = rowsV4.reduce((sum, row) => sum + row.actual_order, 0)
  const overallCoveragePercentage = totalDemand > 0 ? (totalOrdered / totalDemand) * 100 : 0

  // Calculate variance statistics
  let varianceCount = 0
  let totalFactoryShipAdjustment = 0
  let totalShipAdjustment = 0

  varianceAdjustments.forEach((adjustment) => {
    varianceCount += adjustment.variances.length
    totalFactoryShipAdjustment += adjustment.factory_ship_adjustment
    totalShipAdjustment += adjustment.ship_adjustment
  })

  // ================================================================
  // ✅ Step 8: Supply Chain Data Validation (数据校验)
  // 确保各层数量传播正确，不会出现重复计算或数量溢出
  // ================================================================
  const validation = validateSupplyChainData(rowsV4, totalOrdered)

  return {
    product: resultV3.product,
    rows: rowsV4,
    leadTimes: resultV3.leadTimes,
    metadata: {
      ...resultV3.metadata,
      total_demand: totalDemand,
      total_ordered: totalOrdered,
      overall_coverage_percentage: Math.round(overallCoveragePercentage * 100) / 100,
      variance_count: varianceCount,
      total_factory_ship_adjustment: totalFactoryShipAdjustment,
      total_ship_adjustment: totalShipAdjustment,
    },
    validation,
  }
}

// ================================================================
// SUPPLY CHAIN DATA VALIDATION FUNCTION
// 供应链数据校验函数
// ================================================================

/**
 * Validate supply chain data flow
 * 校验供应链数据流是否正确
 *
 * 规则：
 * 1. 工厂出货累计 ≤ 下单总量
 * 2. 物流发货累计 ≤ 工厂出货累计
 * 3. 到仓累计 ≤ 物流发货累计
 * 4. 各层 pending 数量不能为负数
 */
function validateSupplyChainData(
  rows: AlgorithmAuditRowV4[],
  totalOrdered: number
): SupplyChainValidation {
  const errors: SupplyChainValidationError[] = []
  const warnings: SupplyChainValidationWarning[] = []

  // 计算各层累计实际数量
  const actualOrdered = rows.reduce((sum, row) => sum + row.actual_order, 0)
  const actualFactoryShipped = rows.reduce((sum, row) => sum + row.actual_factory_ship, 0)
  const actualShipped = rows.reduce((sum, row) => sum + row.actual_ship, 0)
  const actualArrived = rows.reduce((sum, row) => sum + row.actual_arrival, 0)

  // 计算各层累计计划数量（只计算 pending 部分）
  const plannedFactoryShip = rows.reduce((sum, row) => sum + row.planned_factory_ship, 0)
  const plannedShip = rows.reduce((sum, row) => sum + row.planned_ship, 0)
  const plannedArrival = rows.reduce((sum, row) => sum + row.planned_arrival, 0)

  // 计算各层总量（实际 + 计划 pending）
  const totalFactoryShipped = actualFactoryShipped + plannedFactoryShip
  const totalShipped = actualShipped + plannedShip
  const totalArrived = actualArrived + plannedArrival

  // 计算各层 pending 数量
  const pendingFactoryShip = actualOrdered - actualFactoryShipped
  const pendingShip = actualFactoryShipped - actualShipped
  const pendingArrival = actualShipped - actualArrived

  // 校验规则 1: 工厂出货累计 ≤ 下单总量
  if (totalFactoryShipped > actualOrdered && actualOrdered > 0) {
    errors.push({
      code: 'OVERFLOW_FACTORY_SHIP',
      message: `工厂出货总量(${totalFactoryShipped})超过下单总量(${actualOrdered})`,
      layer: 'factory_ship',
      expected: actualOrdered,
      actual: totalFactoryShipped,
      diff: totalFactoryShipped - actualOrdered,
    })
  }

  // 校验规则 2: 物流发货累计 ≤ 工厂出货累计
  if (totalShipped > actualFactoryShipped && actualFactoryShipped > 0) {
    errors.push({
      code: 'OVERFLOW_SHIP',
      message: `物流发货总量(${totalShipped})超过工厂出货总量(${actualFactoryShipped})`,
      layer: 'ship',
      expected: actualFactoryShipped,
      actual: totalShipped,
      diff: totalShipped - actualFactoryShipped,
    })
  }

  // 校验规则 3: 到仓累计 ≤ 物流发货累计
  if (totalArrived > actualShipped && actualShipped > 0) {
    errors.push({
      code: 'OVERFLOW_ARRIVAL',
      message: `到仓总量(${totalArrived})超过物流发货总量(${actualShipped})`,
      layer: 'arrival',
      expected: actualShipped,
      actual: totalArrived,
      diff: totalArrived - actualShipped,
    })
  }

  // 校验规则 4: pending 不能为负数（但允许为负数的情况是数据修正）
  if (pendingFactoryShip < 0) {
    warnings.push({
      code: 'PARTIAL_FULFILLMENT',
      message: '工厂出货超出下单数量',
      details: `工厂已出货 ${actualFactoryShipped}，但下单只有 ${actualOrdered}，超出 ${-pendingFactoryShip}`,
    })
  }

  if (pendingShip < 0) {
    warnings.push({
      code: 'PARTIAL_FULFILLMENT',
      message: '物流发货超出工厂出货数量',
      details: `物流已发货 ${actualShipped}，但工厂出货只有 ${actualFactoryShipped}，超出 ${-pendingShip}`,
    })
  }

  if (pendingArrival < 0) {
    warnings.push({
      code: 'PARTIAL_FULFILLMENT',
      message: '到仓数量超出物流发货数量',
      details: `已到仓 ${actualArrived}，但物流发货只有 ${actualShipped}，超出 ${-pendingArrival}`,
    })
  }

  // 校验是否有未关联的数据
  if (plannedShip > 0 && actualFactoryShipped === 0) {
    warnings.push({
      code: 'MISSING_ALLOCATION',
      message: '存在计划物流发货但无工厂出货记录',
      details: `计划物流发货 ${plannedShip}，但工厂实际出货为 0`,
    })
  }

  const isValid = errors.length === 0

  return {
    is_valid: isValid,
    totals: {
      ordered: actualOrdered,
      factory_shipped: totalFactoryShipped,
      shipped: totalShipped,
      arrived: totalArrived,
    },
    actuals: {
      ordered: actualOrdered,
      factory_shipped: actualFactoryShipped,
      shipped: actualShipped,
      arrived: actualArrived,
    },
    pending: {
      factory_ship: Math.max(0, pendingFactoryShip),
      ship: Math.max(0, pendingShip),
      arrival: Math.max(0, pendingArrival),
    },
    errors,
    warnings,
  }
}
