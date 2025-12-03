/**
 * Algorithm Audit Queries
 * Provides comprehensive 16-week data (4 past + 12 future) for verifying inventory calculations
 * Backend Specialist - Rolloy SCM
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getWeekFromDate, addWeeksToWeekString, parseWeekString, getCurrentWeek } from '@/lib/utils/date'
import { format } from 'date-fns'
import type { Product, StockStatus } from '@/lib/types/database'

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
