import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getWeekFromDate, getNextWeeks, getCurrentWeek, getWeekRange } from '@/lib/utils/date'
import type { Product } from '@/lib/types/database'

/**
 * Calculation Audit Row - represents one week's data for a SKU
 */
export interface CalculationAuditRow {
  week_iso: string
  // Purchase Orders
  planned_order_qty: number | null
  actual_order_qty: number | null
  effective_order_qty: number
  // Production Deliveries
  planned_delivery_qty: number | null
  actual_delivery_qty: number | null
  effective_delivery_qty: number
  // Shipments
  shipment_qty: number | null
  planned_arrival_week: string | null
  actual_arrival_week: string | null
  effective_arrival_week: string | null
  // Sales
  forecast_sales: number
  actual_sales: number | null
  effective_sales: number
  // Inventory
  opening_stock: number
  incoming_stock: number
  closing_stock: number
  safety_stock_threshold: number
}

/**
 * Fetch calculation audit data for a specific SKU
 * Shows week-by-week breakdown of all inventory calculations
 */
export async function fetchCalculationAudit(sku: string): Promise<{
  product: Product | null
  rows: CalculationAuditRow[]
}> {
  const supabase = await createServerSupabaseClient()

  // Fetch product info
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('sku', sku)
    .single()

  if (!product) {
    return { product: null, rows: [] }
  }

  // Generate 12 weeks range (current + 11 future)
  const currentWeek = getCurrentWeek()
  const weeks = getNextWeeks(12)

  // Fetch all relevant data in parallel
  const [
    purchaseOrdersResult,
    deliveriesResult,
    shipmentsResult,
    forecastsResult,
    actualsResult,
    inventoryProjectionResult,
  ] = await Promise.all([
    // Purchase Orders (planned vs actual order dates)
    supabase
      .from('purchase_orders')
      .select(`
        id,
        planned_order_date,
        actual_order_date,
        purchase_order_items!inner(sku, ordered_qty)
      `)
      .eq('purchase_order_items.sku', sku)
      .not('purchase_order_items', 'is', null),

    // Production Deliveries (planned vs actual delivery dates)
    supabase
      .from('production_deliveries')
      .select('*')
      .eq('sku', sku),

    // Shipments (planned vs actual arrival dates)
    supabase
      .from('shipments')
      .select(`
        id,
        planned_arrival_date,
        actual_arrival_date,
        shipment_items!inner(sku, shipped_qty)
      `)
      .eq('shipment_items.sku', sku)
      .not('shipment_items', 'is', null),

    // Sales Forecasts
    supabase
      .from('sales_forecasts')
      .select('*')
      .eq('sku', sku)
      .in('week_iso', weeks),

    // Sales Actuals
    supabase
      .from('sales_actuals')
      .select('*')
      .eq('sku', sku)
      .in('week_iso', weeks),

    // Inventory Projections (for stock levels)
    supabase
      .from('v_inventory_projection_12weeks')
      .select('*')
      .eq('sku', sku),
  ])

  const purchaseOrders = purchaseOrdersResult.data || []
  const deliveries = deliveriesResult.data || []
  const shipments = shipmentsResult.data || []
  const forecasts = forecastsResult.data || []
  const actuals = actualsResult.data || []
  const projections = inventoryProjectionResult.data || []

  // Build maps for quick lookup
  const forecastMap = new Map(forecasts.map(f => [f.week_iso, f.forecast_qty]))
  const actualMap = new Map(actuals.map(a => [a.week_iso, a.actual_qty]))
  const projectionMap = new Map(projections.map(p => [p.week_iso, p]))

  // Aggregate purchase orders by week
  const ordersByWeek = new Map<string, { planned: number; actual: number }>()
  purchaseOrders.forEach(po => {
    const items = Array.isArray(po.purchase_order_items)
      ? po.purchase_order_items
      : [po.purchase_order_items]

    items.forEach((item: any) => {
      if (item.sku !== sku) return

      // Planned order week
      if (po.planned_order_date) {
        const week = getWeekFromDate(new Date(po.planned_order_date))
        const current = ordersByWeek.get(week) || { planned: 0, actual: 0 }
        ordersByWeek.set(week, { ...current, planned: current.planned + item.ordered_qty })
      }

      // Actual order week
      if (po.actual_order_date) {
        const week = getWeekFromDate(new Date(po.actual_order_date))
        const current = ordersByWeek.get(week) || { planned: 0, actual: 0 }
        ordersByWeek.set(week, { ...current, actual: current.actual + item.ordered_qty })
      }
    })
  })

  // Aggregate deliveries by week
  const deliveriesByWeek = new Map<string, { planned: number; actual: number }>()
  deliveries.forEach(delivery => {
    // Planned delivery week
    if (delivery.planned_delivery_date) {
      const week = getWeekFromDate(new Date(delivery.planned_delivery_date))
      const current = deliveriesByWeek.get(week) || { planned: 0, actual: 0 }
      deliveriesByWeek.set(week, { ...current, planned: current.planned + delivery.delivered_qty })
    }

    // Actual delivery week
    if (delivery.actual_delivery_date) {
      const week = getWeekFromDate(new Date(delivery.actual_delivery_date))
      const current = deliveriesByWeek.get(week) || { planned: 0, actual: 0 }
      deliveriesByWeek.set(week, { ...current, actual: current.actual + delivery.delivered_qty })
    }
  })

  // Aggregate shipments by arrival week
  const shipmentsByWeek = new Map<string, {
    qty: number
    planned_week: string | null
    actual_week: string | null
  }>()

  shipments.forEach(shipment => {
    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]

    items.forEach((item: any) => {
      if (item.sku !== sku) return

      const planned_week = shipment.planned_arrival_date
        ? getWeekFromDate(new Date(shipment.planned_arrival_date))
        : null

      const actual_week = shipment.actual_arrival_date
        ? getWeekFromDate(new Date(shipment.actual_arrival_date))
        : null

      const effective_week = actual_week || planned_week
      if (!effective_week) return

      const current = shipmentsByWeek.get(effective_week) || {
        qty: 0,
        planned_week: null,
        actual_week: null,
      }

      shipmentsByWeek.set(effective_week, {
        qty: current.qty + item.shipped_qty,
        planned_week: planned_week || current.planned_week,
        actual_week: actual_week || current.actual_week,
      })
    })
  })

  // Build rows for each week
  const rows: CalculationAuditRow[] = weeks.map(week => {
    const orders = ordersByWeek.get(week) || { planned: 0, actual: 0 }
    const delivs = deliveriesByWeek.get(week) || { planned: 0, actual: 0 }
    const shipment = shipmentsByWeek.get(week)
    const projection = projectionMap.get(week)

    const forecast_sales = forecastMap.get(week) || 0
    const actual_sales = actualMap.get(week) || null
    const effective_sales = actual_sales ?? forecast_sales

    return {
      week_iso: week,
      // Orders
      planned_order_qty: orders.planned > 0 ? orders.planned : null,
      actual_order_qty: orders.actual > 0 ? orders.actual : null,
      effective_order_qty: orders.actual > 0 ? orders.actual : orders.planned,
      // Deliveries
      planned_delivery_qty: delivs.planned > 0 ? delivs.planned : null,
      actual_delivery_qty: delivs.actual > 0 ? delivs.actual : null,
      effective_delivery_qty: delivs.actual > 0 ? delivs.actual : delivs.planned,
      // Shipments
      shipment_qty: shipment?.qty || null,
      planned_arrival_week: shipment?.planned_week || null,
      actual_arrival_week: shipment?.actual_week || null,
      effective_arrival_week: shipment?.actual_week || shipment?.planned_week || null,
      // Sales
      forecast_sales,
      actual_sales,
      effective_sales,
      // Inventory (from projection view)
      opening_stock: projection?.opening_stock || 0,
      incoming_stock: projection?.incoming_qty || 0,
      closing_stock: projection?.closing_stock || 0,
      safety_stock_threshold: projection?.safety_stock_threshold || 0,
    }
  })

  return { product, rows }
}

/**
 * Fetch list of SKUs for dropdown
 */
export async function fetchSKUsForAudit(): Promise<Product[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('sku')

  if (error) {
    console.error('Error fetching products:', error)
    return []
  }

  return data || []
}
