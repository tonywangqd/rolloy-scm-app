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
} from '@/lib/types/database'
import {
  getISOWeekString,
  parseISOWeekString,
  addWeeksToISOWeek,
  formatDateISO,
} from '@/lib/utils'

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
  const shipmentsByArrivalWeek = new Map<string, number>()
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

      // Track by arrival week (for inventory calculation)
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
    const planned_arrival_qty = sales_effective * leadTimes.safety_stock_weeks

    // Actual data (aggregated quantities)
    const actual_order_qty = ordersByWeek.get(week) || 0
    const actual_factory_ship_qty = factoryShipsByWeek.get(week) || 0
    const actual_ship_qty = shipmentsByDepartureWeek.get(week) || 0
    const actual_arrival_qty = shipmentsByArrivalWeek.get(week) || 0

    // Determine actual weeks (only if qty > 0)
    const actual_order_week = actual_order_qty > 0 ? week : null
    const actual_factory_ship_week = actual_factory_ship_qty > 0 ? week : null
    const actual_ship_week = actual_ship_qty > 0 ? week : null
    const actual_arrival_week = actual_arrival_qty > 0 ? week : null

    // Shipment details for this week
    const weekShipments = shipmentDetailsByArrivalWeek.get(week) || []

    // Inventory calculation
    const opening_stock = runningStock
    const arrival_effective = actual_arrival_qty // Use actual arrivals only
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
      planned_arrival_qty,
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
 * @returns Complete audit result with 20-column data
 */
export async function fetchAlgorithmAuditV3(
  sku: string,
  shippingWeeks: number = 5
): Promise<AlgorithmAuditResultV3> {
  const supabase = await createServerSupabaseClient()

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
        current_week: getCurrentWeek(),
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

  // STEP 3: Generate 16-Week Range
  const currentWeekV3 = getCurrentWeek()
  const startWeekV3 = addWeeksToISOWeek(currentWeekV3, -4) || currentWeekV3
  const endWeekV3 = addWeeksToISOWeek(currentWeekV3, 11) || currentWeekV3

  const weeksV3: string[] = []
  let currentIterWeekV3 = startWeekV3
  for (let i = 0; i < 16; i++) {
    weeksV3.push(currentIterWeekV3)
    const next = addWeeksToISOWeek(currentIterWeekV3, 1)
    if (!next) break
    currentIterWeekV3 = next
  }

  // STEP 4: Fetch All Data Sources in Parallel
  const [
    forecastsResultV3,
    actualsResultV3,
    purchaseOrdersResultV3,
    productionDeliveriesResultV3,
    shipmentsResultV3,
    inventorySnapshotsResultV3,
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
        purchase_order_items!inner(sku, ordered_qty)
      `)
      .eq('purchase_order_items.sku', sku)
      .not('actual_order_date', 'is', null),
    supabase
      .from('production_deliveries')
      .select('sku, delivered_qty, actual_delivery_date')
      .eq('sku', sku)
      .not('actual_delivery_date', 'is', null),
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
    supabase
      .from('inventory_snapshots')
      .select('qty_on_hand')
      .eq('sku', sku),
  ])

  const forecastsV3 = forecastsResultV3.data || []
  const actualsV3 = actualsResultV3.data || []
  const purchaseOrdersV3 = purchaseOrdersResultV3.data || []
  const productionDeliveriesV3 = productionDeliveriesResultV3.data || []
  const shipmentsV3 = shipmentsResultV3.data || []
  const snapshotsV3 = inventorySnapshotsResultV3.data || []

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

  const actualOrderMapV3 = new Map<string, number>()
  purchaseOrdersV3.forEach((po) => {
    if (!po.actual_order_date) return
    const orderWeek = getWeekFromDate(new Date(po.actual_order_date))
    const items = Array.isArray(po.purchase_order_items)
      ? po.purchase_order_items
      : [po.purchase_order_items]
    items.forEach((item: any) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('ordered_qty' in item)) return
      if (item.sku !== sku) return
      const current = actualOrderMapV3.get(orderWeek) || 0
      actualOrderMapV3.set(orderWeek, current + item.ordered_qty)
    })
  })

  const actualFactoryShipMapV3 = new Map<string, number>()
  productionDeliveriesV3.forEach((delivery) => {
    if (!delivery.actual_delivery_date) return
    const deliveryWeek = getWeekFromDate(new Date(delivery.actual_delivery_date))
    const current = actualFactoryShipMapV3.get(deliveryWeek) || 0
    actualFactoryShipMapV3.set(deliveryWeek, current + delivery.delivered_qty)
  })

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

  const actualArrivalMapV3 = new Map<string, number>()
  shipmentsV3.forEach((shipment: any) => {
    const arrivalDate = shipment.actual_arrival_date || shipment.planned_arrival_date
    if (!arrivalDate) return
    const arrivalWeek = getWeekFromDate(new Date(arrivalDate))
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
  const rowsV3: AlgorithmAuditRowV3[] = weeksV3.map((week, index) => {
    const weekOffset = index - 4
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
      is_past: weekOffset < 0,
      is_current: weekOffset === 0,
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

  // STEP 7: Reverse Calculation for Planned Quantities (from sales demand)
  const plannedOrderMapV3 = new Map<string, number>()
  const plannedFactoryShipMapV3 = new Map<string, number>()
  const plannedShipMapV3 = new Map<string, number>()
  const plannedArrivalMapV3 = new Map<string, number>()

  rowsV3.forEach((row) => {
    const salesDemand = row.sales_effective
    if (salesDemand <= 0) return

    const arrivalWeek = addWeeksToISOWeek(row.week_iso, -leadTimesV3.safety_stock_weeks)
    const shipWeek = arrivalWeek ? addWeeksToISOWeek(arrivalWeek, -leadTimesV3.shipping_weeks) : null
    const factoryShipWeek = shipWeek ? addWeeksToISOWeek(shipWeek, -leadTimesV3.loading_weeks) : null
    const orderWeek = factoryShipWeek
      ? addWeeksToISOWeek(factoryShipWeek, -leadTimesV3.production_weeks)
      : null

    if (arrivalWeek) {
      const current = plannedArrivalMapV3.get(arrivalWeek) || 0
      plannedArrivalMapV3.set(arrivalWeek, current + salesDemand)
    }
    if (shipWeek) {
      const current = plannedShipMapV3.get(shipWeek) || 0
      plannedShipMapV3.set(shipWeek, current + salesDemand)
    }
    if (factoryShipWeek) {
      const current = plannedFactoryShipMapV3.get(factoryShipWeek) || 0
      plannedFactoryShipMapV3.set(factoryShipWeek, current + salesDemand)
    }
    if (orderWeek) {
      const current = plannedOrderMapV3.get(orderWeek) || 0
      plannedOrderMapV3.set(orderWeek, current + salesDemand)
    }
  })

  // STEP 7.5: Forward Propagation from Actual Orders
  // When an actual order is placed, propagate it forward through the supply chain
  const forwardFactoryShipMapV3 = new Map<string, number>()
  const forwardShipMapV3 = new Map<string, number>()
  const forwardArrivalMapV3 = new Map<string, number>()

  rowsV3.forEach((row) => {
    // Forward propagate from actual orders
    if (row.actual_order > 0) {
      // Order placed → factory ships after production_weeks
      const factoryShipWeek = addWeeksToISOWeek(row.week_iso, leadTimesV3.production_weeks)
      if (factoryShipWeek) {
        const current = forwardFactoryShipMapV3.get(factoryShipWeek) || 0
        forwardFactoryShipMapV3.set(factoryShipWeek, current + row.actual_order)
      }

      // Factory ships → departs port after loading_weeks
      const shipWeek = factoryShipWeek
        ? addWeeksToISOWeek(factoryShipWeek, leadTimesV3.loading_weeks)
        : null
      if (shipWeek) {
        const current = forwardShipMapV3.get(shipWeek) || 0
        forwardShipMapV3.set(shipWeek, current + row.actual_order)
      }

      // Departs → arrives after shipping_weeks
      const arrivalWeek = shipWeek
        ? addWeeksToISOWeek(shipWeek, leadTimesV3.shipping_weeks)
        : null
      if (arrivalWeek) {
        const current = forwardArrivalMapV3.get(arrivalWeek) || 0
        forwardArrivalMapV3.set(arrivalWeek, current + row.actual_order)
      }
    }

    // Forward propagate from actual factory shipments (if no order tracking)
    if (row.actual_factory_ship > 0) {
      // Factory ships → departs port after loading_weeks
      const shipWeek = addWeeksToISOWeek(row.week_iso, leadTimesV3.loading_weeks)
      if (shipWeek) {
        const existingForward = forwardShipMapV3.get(shipWeek) || 0
        // Only add if not already tracked from orders
        if (existingForward === 0) {
          forwardShipMapV3.set(shipWeek, row.actual_factory_ship)
        }
      }

      // Departs → arrives after shipping_weeks
      const arrivalWeek = shipWeek
        ? addWeeksToISOWeek(shipWeek, leadTimesV3.shipping_weeks)
        : null
      if (arrivalWeek) {
        const existingForward = forwardArrivalMapV3.get(arrivalWeek) || 0
        if (existingForward === 0) {
          forwardArrivalMapV3.set(arrivalWeek, row.actual_factory_ship)
        }
      }
    }

    // Forward propagate from actual shipments (departures)
    if (row.actual_ship > 0) {
      const arrivalWeek = addWeeksToISOWeek(row.week_iso, leadTimesV3.shipping_weeks)
      if (arrivalWeek) {
        const existingForward = forwardArrivalMapV3.get(arrivalWeek) || 0
        // Only add if not already tracked from earlier stages
        if (existingForward === 0) {
          forwardArrivalMapV3.set(arrivalWeek, row.actual_ship)
        }
      }
    }
  })

  rowsV3.forEach((row) => {
    // Set planned values from reverse calculation (sales demand based)
    row.planned_order = plannedOrderMapV3.get(row.week_iso) || 0

    // For factory_ship, ship, and arrival: use forward propagation from actuals if available
    // Otherwise fall back to reverse calculation from sales demand
    const forwardFactoryShip = forwardFactoryShipMapV3.get(row.week_iso) || 0
    const forwardShip = forwardShipMapV3.get(row.week_iso) || 0
    const forwardArrival = forwardArrivalMapV3.get(row.week_iso) || 0

    row.planned_factory_ship = forwardFactoryShip || plannedFactoryShipMapV3.get(row.week_iso) || 0
    row.planned_ship = forwardShip || plannedShipMapV3.get(row.week_iso) || 0
    row.planned_arrival = forwardArrival || plannedArrivalMapV3.get(row.week_iso) || 0

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
