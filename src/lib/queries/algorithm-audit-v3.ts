/**
 * Algorithm Audit V3 Query Functions
 * Implements reverse-calculation algorithm for supply chain validation
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getISOWeekString,
  parseISOWeekString,
  addWeeksToISOWeek,
  getWeekFromDate,
  getCurrentWeek,
  formatDateISO,
} from '@/lib/utils'
import type {
  Product,
  StockStatus,
  AlgorithmAuditRowV3,
  AlgorithmAuditResultV3,
  SupplyChainLeadTimesV3,
} from '@/lib/types/database'

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

  // ================================================================
  // STEP 1: Fetch Product Configuration
  // ================================================================
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

  // ================================================================
  // STEP 2: Configure Lead Times
  // ================================================================
  const leadTimes: SupplyChainLeadTimesV3 = {
    production_weeks: product.production_lead_weeks,
    loading_weeks: 1, // Fixed
    shipping_weeks: shippingWeeks, // User-configurable
    safety_stock_weeks: product.safety_stock_weeks,
  }

  // ================================================================
  // STEP 3: Generate 16-Week Range
  // ================================================================
  const currentWeek = getCurrentWeek()
  const startWeek = addWeeksToISOWeek(currentWeek, -4) || currentWeek
  const endWeek = addWeeksToISOWeek(currentWeek, 11) || currentWeek

  const weeks: string[] = []
  let currentIterWeek = startWeek
  for (let i = 0; i < 16; i++) {
    weeks.push(currentIterWeek)
    const next = addWeeksToISOWeek(currentIterWeek, 1)
    if (!next) break
    currentIterWeek = next
  }

  // ================================================================
  // STEP 4: Fetch All Data Sources in Parallel
  // ================================================================
  const [
    forecastsResult,
    actualsResult,
    purchaseOrdersResult,
    productionDeliveriesResult,
    shipmentsResult,
    inventorySnapshotsResult,
  ] = await Promise.all([
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

    // Purchase Orders with items (for actual_order aggregation)
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

    // Production Deliveries (for actual_factory_ship aggregation)
    supabase
      .from('production_deliveries')
      .select('sku, delivered_qty, actual_delivery_date')
      .eq('sku', sku)
      .not('actual_delivery_date', 'is', null),

    // Shipments with items (for actual_ship and actual_arrival)
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

    // Current inventory snapshot
    supabase
      .from('inventory_snapshots')
      .select('qty_on_hand')
      .eq('sku', sku),
  ])

  const forecasts = forecastsResult.data || []
  const actuals = actualsResult.data || []
  const purchaseOrders = purchaseOrdersResult.data || []
  const productionDeliveries = productionDeliveriesResult.data || []
  const shipments = shipmentsResult.data || []
  const snapshots = inventorySnapshotsResult.data || []

  // ================================================================
  // STEP 5: Build Weekly Aggregation Maps
  // ================================================================

  // 5.1 Sales data maps
  const forecastMap = new Map<string, number>()
  forecasts.forEach((f) => {
    const current = forecastMap.get(f.week_iso) || 0
    forecastMap.set(f.week_iso, current + f.forecast_qty)
  })

  const actualSalesMap = new Map<string, number>()
  actuals.forEach((a) => {
    const current = actualSalesMap.get(a.week_iso) || 0
    actualSalesMap.set(a.week_iso, current + a.actual_qty)
  })

  // 5.2 Actual order quantities by week
  const actualOrderMap = new Map<string, number>()
  purchaseOrders.forEach((po) => {
    if (!po.actual_order_date) return
    const orderWeek = getWeekFromDate(new Date(po.actual_order_date))

    const items = Array.isArray(po.purchase_order_items)
      ? po.purchase_order_items
      : [po.purchase_order_items]

    items.forEach((item: any) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('ordered_qty' in item)) return
      if (item.sku !== sku) return

      const current = actualOrderMap.get(orderWeek) || 0
      actualOrderMap.set(orderWeek, current + item.ordered_qty)
    })
  })

  // 5.3 Actual factory ship quantities by week
  const actualFactoryShipMap = new Map<string, number>()
  productionDeliveries.forEach((delivery) => {
    if (!delivery.actual_delivery_date) return
    const deliveryWeek = getWeekFromDate(new Date(delivery.actual_delivery_date))

    const current = actualFactoryShipMap.get(deliveryWeek) || 0
    actualFactoryShipMap.set(deliveryWeek, current + delivery.delivered_qty)
  })

  // 5.4 Actual ship quantities by departure week
  const actualShipMap = new Map<string, number>()
  shipments.forEach((shipment: any) => {
    if (!shipment.actual_departure_date) return
    const departureWeek = getWeekFromDate(new Date(shipment.actual_departure_date))

    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]

    items.forEach((item: any) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return
      if (item.sku !== sku) return

      const current = actualShipMap.get(departureWeek) || 0
      actualShipMap.set(departureWeek, current + item.shipped_qty)
    })
  })

  // 5.5 Actual arrival quantities by arrival week
  const actualArrivalMap = new Map<string, number>()
  shipments.forEach((shipment: any) => {
    const arrivalDate = shipment.actual_arrival_date || shipment.planned_arrival_date
    if (!arrivalDate) return
    const arrivalWeek = getWeekFromDate(new Date(arrivalDate))

    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]

    items.forEach((item: any) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return
      if (item.sku !== sku) return

      const current = actualArrivalMap.get(arrivalWeek) || 0
      actualArrivalMap.set(arrivalWeek, current + item.shipped_qty)
    })
  })

  // ================================================================
  // STEP 6: Initialize Rows with Sales and Actual Data
  // ================================================================
  const rows: AlgorithmAuditRowV3[] = weeks.map((week, index) => {
    const weekOffset = index - 4
    const weekStartDate = parseISOWeekString(week)
    const week_start_date = weekStartDate ? formatDateISO(weekStartDate) : week

    const sales_forecast = forecastMap.get(week) || 0
    const sales_actual = actualSalesMap.get(week) ?? null
    const sales_effective = sales_actual ?? sales_forecast

    const actual_order = actualOrderMap.get(week) || 0
    const actual_factory_ship = actualFactoryShipMap.get(week) || 0
    const actual_ship = actualShipMap.get(week) || 0
    const actual_arrival = actualArrivalMap.get(week) || 0

    return {
      week_iso: week,
      week_start_date,
      week_offset: weekOffset,
      is_past: weekOffset < 0,
      is_current: weekOffset === 0,
      sales_forecast,
      sales_actual,
      sales_effective,
      planned_order: 0, // Will be calculated in Step 7
      actual_order,
      order_effective: 0, // Will be calculated after planned_order
      planned_factory_ship: 0,
      actual_factory_ship,
      factory_ship_effective: 0,
      planned_ship: 0,
      actual_ship,
      ship_effective: 0,
      planned_arrival: 0,
      actual_arrival,
      arrival_effective: 0,
      opening_stock: 0, // Will be calculated in Step 8
      closing_stock: 0,
      safety_threshold: 0,
      stock_status: 'OK' as StockStatus,
    }
  })

  // ================================================================
  // STEP 7: Reverse Calculation for Planned Quantities
  // ================================================================
  const plannedOrderMap = new Map<string, number>()
  const plannedFactoryShipMap = new Map<string, number>()
  const plannedShipMap = new Map<string, number>()
  const plannedArrivalMap = new Map<string, number>()

  rows.forEach((row) => {
    const salesDemand = row.sales_effective
    if (salesDemand <= 0) return

    // Backtrack timeline
    const arrivalWeek = addWeeksToISOWeek(row.week_iso, -leadTimes.safety_stock_weeks)
    const shipWeek = arrivalWeek ? addWeeksToISOWeek(arrivalWeek, -leadTimes.shipping_weeks) : null
    const factoryShipWeek = shipWeek ? addWeeksToISOWeek(shipWeek, -leadTimes.loading_weeks) : null
    const orderWeek = factoryShipWeek
      ? addWeeksToISOWeek(factoryShipWeek, -leadTimes.production_weeks)
      : null

    // Accumulate quantities
    if (arrivalWeek) {
      const current = plannedArrivalMap.get(arrivalWeek) || 0
      plannedArrivalMap.set(arrivalWeek, current + salesDemand)
    }
    if (shipWeek) {
      const current = plannedShipMap.get(shipWeek) || 0
      plannedShipMap.set(shipWeek, current + salesDemand)
    }
    if (factoryShipWeek) {
      const current = plannedFactoryShipMap.get(factoryShipWeek) || 0
      plannedFactoryShipMap.set(factoryShipWeek, current + salesDemand)
    }
    if (orderWeek) {
      const current = plannedOrderMap.get(orderWeek) || 0
      plannedOrderMap.set(orderWeek, current + salesDemand)
    }
  })

  // Populate planned quantities and calculate effective values
  rows.forEach((row) => {
    row.planned_order = plannedOrderMap.get(row.week_iso) || 0
    row.planned_factory_ship = plannedFactoryShipMap.get(row.week_iso) || 0
    row.planned_ship = plannedShipMap.get(row.week_iso) || 0
    row.planned_arrival = plannedArrivalMap.get(row.week_iso) || 0

    // Calculate effective values (actual takes precedence)
    row.order_effective = row.actual_order || row.planned_order
    row.factory_ship_effective = row.actual_factory_ship || row.planned_factory_ship
    row.ship_effective = row.actual_ship || row.planned_ship
    row.arrival_effective = row.actual_arrival || row.planned_arrival
  })

  // ================================================================
  // STEP 8: Calculate Rolling Inventory
  // ================================================================
  const initialStock = snapshots.reduce((sum, s) => sum + s.qty_on_hand, 0)
  const totalEffectiveSales = rows.reduce((sum, row) => sum + row.sales_effective, 0)
  const avgWeeklySales = totalEffectiveSales / rows.length

  let runningStock = initialStock
  rows.forEach((row) => {
    row.opening_stock = runningStock
    row.closing_stock = runningStock + row.arrival_effective - row.sales_effective
    row.safety_threshold = row.sales_effective * leadTimes.safety_stock_weeks

    // Update running stock for next iteration
    runningStock = row.closing_stock

    // Determine stock status
    if (row.closing_stock <= 0) {
      row.stock_status = 'Stockout'
    } else if (row.closing_stock < row.safety_threshold) {
      row.stock_status = 'Risk'
    } else {
      row.stock_status = 'OK'
    }
  })

  // ================================================================
  // STEP 9: Return Complete Result
  // ================================================================
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
      production_lead_weeks: product.production_lead_weeks,
      shipping_weeks: shippingWeeks,
    },
  }
}
