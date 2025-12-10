/**
 * Reverse Schedule Algorithm Audit Queries
 * 倒排排程算法验证 - 从销量预测倒推计算各环节建议时间
 *
 * 核心逻辑：
 * 1. 获取销量预测
 * 2. 对每个预测调用倒排排程计算
 * 3. 聚合建议数据到每周：建议下单/出厂/发货/到仓
 * 4. 对比实际数据
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCurrentWeek, addWeeksToISOWeek, parseISOWeekString, formatDateISO, getISOWeekString } from '@/lib/utils'
import type { Product, StockStatus } from '@/lib/types/database'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

/**
 * Lead times configuration
 */
export interface LeadTimes {
  production_weeks: number  // 生产周期 (PO→OF)
  loading_weeks: number     // 装柜周期 (OF→OS)
  shipping_weeks: number    // 物流周期 (OS→OA)
  inbound_weeks: number     // 上架周期 (OA→可销售)
  safety_stock_weeks: number // 安全库存周数
  total_weeks: number       // 总周期
}

/**
 * Reverse schedule calculation for a single forecast
 */
export interface ReverseScheduleItem {
  target_week: string       // 销量需求周
  qty: number              // 需求数量
  suggested_arrival_week: string   // 建议到仓周
  suggested_ship_week: string      // 建议发货周
  suggested_fulfillment_week: string // 建议出厂周
  suggested_order_week: string     // 建议下单周
}

/**
 * Algorithm Audit Row - New structure with 建议 vs 实际
 */
export interface ReverseScheduleAuditRow {
  // Week identification
  week_iso: string
  week_start_date: string
  week_offset: number
  is_past: boolean
  is_current: boolean

  // 销售 (预计 vs 实际)
  sales_forecast: number
  sales_actual: number | null

  // 下单 (建议 vs 实际)
  // "建议"来自倒排排程：这一周应该下单多少（为满足未来N周的销量）
  suggested_order: number
  actual_order: number

  // 出厂 (建议 vs 实际)
  suggested_factory_ship: number
  actual_factory_ship: number

  // 发货 (建议 vs 实际)
  suggested_ship: number
  actual_ship: number

  // 到仓 (建议 vs 实际)
  suggested_arrival: number
  actual_arrival: number

  // 库存计算 (使用: 实际到仓 > 0 ? 实际 : 建议)
  opening_stock: number
  arrival_effective: number  // 有效到仓 = COALESCE(actual, suggested)
  sales_effective: number    // 有效销售 = COALESCE(actual, forecast)
  closing_stock: number
  safety_threshold: number
  stock_status: StockStatus

  // 详细数据 (可展开)
  order_details: Array<{
    po_number: string
    qty: number
    order_date: string
  }>
  fulfillment_details: Array<{
    delivery_number: string
    qty: number
    delivery_date: string
  }>
  ship_details: Array<{
    tracking_number: string
    qty: number
    departure_date: string | null
  }>
  arrival_details: Array<{
    tracking_number: string
    qty: number
    arrival_date: string
  }>
}

/**
 * Complete audit result
 */
export interface ReverseScheduleAuditResult {
  product: Product | null
  rows: ReverseScheduleAuditRow[]
  leadTimes: LeadTimes
  reverseSchedule: ReverseScheduleItem[] // 每个销量预测的倒排结果
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    total_demand: number
    total_suggested_order: number
    total_actual_order: number
    gap: number // total_suggested - total_actual
  }
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

/**
 * Calculate reverse schedule for a target week
 * 倒排排程计算
 */
function calculateReverseForWeek(
  targetWeek: string,
  qty: number,
  leadTimes: LeadTimes
): ReverseScheduleItem {
  // 从销量需求周倒推
  const arrivalWeek = addWeeksToISOWeek(targetWeek, -leadTimes.inbound_weeks) || targetWeek
  const shipWeek = addWeeksToISOWeek(arrivalWeek, -leadTimes.shipping_weeks) || arrivalWeek
  const fulfillmentWeek = addWeeksToISOWeek(shipWeek, -leadTimes.loading_weeks) || shipWeek
  const orderWeek = addWeeksToISOWeek(fulfillmentWeek, -leadTimes.production_weeks) || fulfillmentWeek

  return {
    target_week: targetWeek,
    qty,
    suggested_arrival_week: arrivalWeek,
    suggested_ship_week: shipWeek,
    suggested_fulfillment_week: fulfillmentWeek,
    suggested_order_week: orderWeek,
  }
}

/**
 * Get week string from date
 */
function getWeekFromDate(date: Date): string {
  return getISOWeekString(date)
}

// ================================================================
// MAIN QUERY FUNCTION
// ================================================================

/**
 * Fetch Reverse Schedule Algorithm Audit Data
 * 获取倒排排程算法验证数据
 *
 * @param sku - Product SKU
 * @param customStartWeek - Optional custom start week
 * @param customEndWeek - Optional custom end week
 */
export async function fetchReverseScheduleAudit(
  sku: string,
  customStartWeek?: string,
  customEndWeek?: string
): Promise<ReverseScheduleAuditResult> {
  const supabase = await createServerSupabaseClient()
  const currentWeek = getCurrentWeek()

  // Default: 过去4周 + 未来11周 = 16周
  const startWeek = customStartWeek || addWeeksToISOWeek(currentWeek, -4) || currentWeek
  const endWeek = customEndWeek || addWeeksToISOWeek(currentWeek, 11) || currentWeek

  // ================================================================
  // STEP 1: Fetch Product Info
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
        shipping_weeks: 5,
        inbound_weeks: 2,
        safety_stock_weeks: 2,
        total_weeks: 13,
      },
      reverseSchedule: [],
      metadata: {
        current_week: currentWeek,
        start_week: startWeek,
        end_week: endWeek,
        total_weeks: 0,
        avg_weekly_sales: 0,
        total_demand: 0,
        total_suggested_order: 0,
        total_actual_order: 0,
        gap: 0,
      },
    }
  }

  // ================================================================
  // STEP 2: Fetch Lead Times from system_parameters
  // ================================================================

  const { data: paramData } = await supabase
    .from('system_parameters')
    .select('param_value')
    .eq('param_key', 'lead_times')
    .single()

  const leadTimes: LeadTimes = {
    production_weeks: product.production_lead_weeks || (paramData?.param_value as any)?.production_weeks || 5,
    loading_weeks: (paramData?.param_value as any)?.loading_weeks || 1,
    shipping_weeks: (paramData?.param_value as any)?.shipping_weeks || 5,
    inbound_weeks: (paramData?.param_value as any)?.inbound_weeks || 2,
    safety_stock_weeks: product.safety_stock_weeks || 2,
    total_weeks: 0,
  }
  leadTimes.total_weeks = leadTimes.production_weeks + leadTimes.loading_weeks +
    leadTimes.shipping_weeks + leadTimes.inbound_weeks

  // ================================================================
  // STEP 3: Generate Week Range
  // ================================================================

  const weeks: string[] = []
  let currentIterWeek = startWeek
  const currentWeekIndex = { value: -1 }

  for (let i = 0; i < 24; i++) { // 最多24周防止无限循环
    if (currentIterWeek > endWeek) break
    weeks.push(currentIterWeek)
    if (currentIterWeek === currentWeek) {
      currentWeekIndex.value = i
    }
    const next = addWeeksToISOWeek(currentIterWeek, 1)
    if (!next) break
    currentIterWeek = next
  }

  // ================================================================
  // STEP 4: Fetch Sales Forecasts (销量预测)
  // ================================================================

  const { data: forecasts } = await supabase
    .from('sales_forecasts')
    .select('week_iso, forecast_qty')
    .eq('sku', sku)
    .eq('is_closed', false)
    .in('week_iso', weeks)

  const forecastMap = new Map<string, number>()
  ;(forecasts || []).forEach(f => {
    const current = forecastMap.get(f.week_iso) || 0
    forecastMap.set(f.week_iso, current + f.forecast_qty)
  })

  // ================================================================
  // STEP 5: Calculate Reverse Schedule for Each Forecast
  // 对每个销量预测计算倒排排程
  // ================================================================

  const reverseSchedule: ReverseScheduleItem[] = []
  const suggestedOrderByWeek = new Map<string, number>()
  const suggestedFulfillmentByWeek = new Map<string, number>()
  const suggestedShipByWeek = new Map<string, number>()
  const suggestedArrivalByWeek = new Map<string, number>()

  weeks.forEach(week => {
    const forecastQty = forecastMap.get(week) || 0
    if (forecastQty > 0) {
      const reverseResult = calculateReverseForWeek(week, forecastQty, leadTimes)
      reverseSchedule.push(reverseResult)

      // 聚合到对应周
      const orderCurrent = suggestedOrderByWeek.get(reverseResult.suggested_order_week) || 0
      suggestedOrderByWeek.set(reverseResult.suggested_order_week, orderCurrent + forecastQty)

      const fulfillCurrent = suggestedFulfillmentByWeek.get(reverseResult.suggested_fulfillment_week) || 0
      suggestedFulfillmentByWeek.set(reverseResult.suggested_fulfillment_week, fulfillCurrent + forecastQty)

      const shipCurrent = suggestedShipByWeek.get(reverseResult.suggested_ship_week) || 0
      suggestedShipByWeek.set(reverseResult.suggested_ship_week, shipCurrent + forecastQty)

      const arrivalCurrent = suggestedArrivalByWeek.get(reverseResult.suggested_arrival_week) || 0
      suggestedArrivalByWeek.set(reverseResult.suggested_arrival_week, arrivalCurrent + forecastQty)
    }
  })

  // ================================================================
  // STEP 6: Fetch Actual Data (实际数据)
  // ================================================================

  // 实际销量
  const { data: actuals } = await supabase
    .from('sales_actuals')
    .select('week_iso, actual_qty')
    .eq('sku', sku)
    .in('week_iso', weeks)

  const actualSalesMap = new Map<string, number>()
  ;(actuals || []).forEach(a => {
    const current = actualSalesMap.get(a.week_iso) || 0
    actualSalesMap.set(a.week_iso, current + a.actual_qty)
  })

  // 实际下单 (PO)
  const { data: purchaseOrders } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      po_number,
      actual_order_date,
      purchase_order_items!inner(sku, ordered_qty)
    `)
    .eq('purchase_order_items.sku', sku)
    .not('actual_order_date', 'is', null)

  const actualOrderMap = new Map<string, number>()
  const orderDetailsByWeek = new Map<string, Array<{ po_number: string; qty: number; order_date: string }>>()
  ;(purchaseOrders || []).forEach((po: any) => {
    if (!po.actual_order_date) return
    const orderWeek = getWeekFromDate(new Date(po.actual_order_date))
    const items = Array.isArray(po.purchase_order_items) ? po.purchase_order_items : [po.purchase_order_items]
    items.forEach((item: any) => {
      if (item?.sku !== sku) return
      const current = actualOrderMap.get(orderWeek) || 0
      actualOrderMap.set(orderWeek, current + item.ordered_qty)

      const details = orderDetailsByWeek.get(orderWeek) || []
      details.push({ po_number: po.po_number, qty: item.ordered_qty, order_date: po.actual_order_date })
      orderDetailsByWeek.set(orderWeek, details)
    })
  })

  // 实际出厂 (Delivery)
  const { data: deliveries } = await supabase
    .from('production_deliveries')
    .select('id, delivery_number, sku, delivered_qty, actual_delivery_date')
    .eq('sku', sku)
    .not('actual_delivery_date', 'is', null)

  const actualFactoryShipMap = new Map<string, number>()
  const fulfillmentDetailsByWeek = new Map<string, Array<{ delivery_number: string; qty: number; delivery_date: string }>>()
  ;(deliveries || []).forEach((d: any) => {
    if (!d.actual_delivery_date) return
    const deliveryWeek = getWeekFromDate(new Date(d.actual_delivery_date))
    const current = actualFactoryShipMap.get(deliveryWeek) || 0
    actualFactoryShipMap.set(deliveryWeek, current + d.delivered_qty)

    const details = fulfillmentDetailsByWeek.get(deliveryWeek) || []
    details.push({ delivery_number: d.delivery_number, qty: d.delivered_qty, delivery_date: d.actual_delivery_date })
    fulfillmentDetailsByWeek.set(deliveryWeek, details)
  })

  // 实际发货 (Shipment - departure)
  const { data: shipments } = await supabase
    .from('shipments')
    .select(`
      id,
      tracking_number,
      actual_departure_date,
      actual_arrival_date,
      shipment_items!inner(sku, shipped_qty)
    `)
    .eq('shipment_items.sku', sku)

  const actualShipMap = new Map<string, number>()
  const actualArrivalMap = new Map<string, number>()
  const shipDetailsByWeek = new Map<string, Array<{ tracking_number: string; qty: number; departure_date: string | null }>>()
  const arrivalDetailsByWeek = new Map<string, Array<{ tracking_number: string; qty: number; arrival_date: string }>>()

  ;(shipments || []).forEach((s: any) => {
    const items = Array.isArray(s.shipment_items) ? s.shipment_items : [s.shipment_items]
    items.forEach((item: any) => {
      if (item?.sku !== sku) return

      // 实际发货
      if (s.actual_departure_date) {
        const departureWeek = getWeekFromDate(new Date(s.actual_departure_date))
        const current = actualShipMap.get(departureWeek) || 0
        actualShipMap.set(departureWeek, current + item.shipped_qty)

        const details = shipDetailsByWeek.get(departureWeek) || []
        details.push({ tracking_number: s.tracking_number, qty: item.shipped_qty, departure_date: s.actual_departure_date })
        shipDetailsByWeek.set(departureWeek, details)
      }

      // 实际到仓
      if (s.actual_arrival_date) {
        const arrivalWeek = getWeekFromDate(new Date(s.actual_arrival_date))
        const current = actualArrivalMap.get(arrivalWeek) || 0
        actualArrivalMap.set(arrivalWeek, current + item.shipped_qty)

        const details = arrivalDetailsByWeek.get(arrivalWeek) || []
        details.push({ tracking_number: s.tracking_number, qty: item.shipped_qty, arrival_date: s.actual_arrival_date })
        arrivalDetailsByWeek.set(arrivalWeek, details)
      }
    })
  })

  // ================================================================
  // STEP 7: Fetch Current Inventory Snapshot
  // ================================================================

  const { data: snapshots } = await supabase
    .from('inventory_snapshots')
    .select('qty_on_hand')
    .eq('sku', sku)

  const initialStock = (snapshots || []).reduce((sum, s) => sum + s.qty_on_hand, 0)

  // ================================================================
  // STEP 8: Build Rows with Rolling Inventory
  // ================================================================

  let runningStock = initialStock
  const totalEffectiveSales = weeks.reduce((sum, week) => {
    const forecast = forecastMap.get(week) || 0
    const actual = actualSalesMap.get(week)
    return sum + (actual !== undefined && actual !== null ? actual : forecast)
  }, 0)
  const avgWeeklySales = totalEffectiveSales / weeks.length

  const rows: ReverseScheduleAuditRow[] = weeks.map((week, index) => {
    const weekOffset = currentWeekIndex.value >= 0 ? index - currentWeekIndex.value : index - 4
    const weekStartDate = parseISOWeekString(week)
    const week_start_date = weekStartDate ? formatDateISO(weekStartDate) : week

    // 销售
    const sales_forecast = forecastMap.get(week) || 0
    const sales_actual = actualSalesMap.get(week) ?? null
    const sales_effective = sales_actual !== null ? sales_actual : sales_forecast

    // 建议 vs 实际
    const suggested_order = suggestedOrderByWeek.get(week) || 0
    const actual_order = actualOrderMap.get(week) || 0

    const suggested_factory_ship = suggestedFulfillmentByWeek.get(week) || 0
    const actual_factory_ship = actualFactoryShipMap.get(week) || 0

    const suggested_ship = suggestedShipByWeek.get(week) || 0
    const actual_ship = actualShipMap.get(week) || 0

    const suggested_arrival = suggestedArrivalByWeek.get(week) || 0
    const actual_arrival = actualArrivalMap.get(week) || 0

    // 有效到仓 = COALESCE(实际, 建议)
    const arrival_effective = actual_arrival > 0 ? actual_arrival : suggested_arrival

    // 库存计算
    const opening_stock = runningStock
    const closing_stock = opening_stock + arrival_effective - sales_effective
    runningStock = closing_stock

    // 安全库存和状态
    const safety_threshold = avgWeeklySales * leadTimes.safety_stock_weeks
    let stock_status: StockStatus = 'OK'
    if (closing_stock <= 0) {
      stock_status = 'Stockout'
    } else if (closing_stock < safety_threshold) {
      stock_status = 'Risk'
    }

    return {
      week_iso: week,
      week_start_date,
      week_offset: weekOffset,
      is_past: week < currentWeek,
      is_current: week === currentWeek,
      sales_forecast,
      sales_actual,
      suggested_order,
      actual_order,
      suggested_factory_ship,
      actual_factory_ship,
      suggested_ship,
      actual_ship,
      suggested_arrival,
      actual_arrival,
      opening_stock,
      arrival_effective,
      sales_effective,
      closing_stock,
      safety_threshold,
      stock_status,
      order_details: orderDetailsByWeek.get(week) || [],
      fulfillment_details: fulfillmentDetailsByWeek.get(week) || [],
      ship_details: shipDetailsByWeek.get(week) || [],
      arrival_details: arrivalDetailsByWeek.get(week) || [],
    }
  })

  // ================================================================
  // STEP 9: Calculate Metadata
  // ================================================================

  const totalDemand = Array.from(forecastMap.values()).reduce((a, b) => a + b, 0)
  const totalSuggestedOrder = Array.from(suggestedOrderByWeek.values()).reduce((a, b) => a + b, 0)
  const totalActualOrder = Array.from(actualOrderMap.values()).reduce((a, b) => a + b, 0)

  return {
    product,
    rows,
    leadTimes,
    reverseSchedule,
    metadata: {
      current_week: currentWeek,
      start_week: startWeek,
      end_week: endWeek,
      total_weeks: weeks.length,
      avg_weekly_sales: avgWeeklySales,
      total_demand: totalDemand,
      total_suggested_order: totalSuggestedOrder,
      total_actual_order: totalActualOrder,
      gap: totalSuggestedOrder - totalActualOrder,
    },
  }
}
