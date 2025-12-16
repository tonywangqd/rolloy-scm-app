/**
 * Reverse Schedule Algorithm Audit Queries
 * 供应链算法验证 - 双向计算逻辑
 *
 * 核心逻辑：
 * 1. 倒推（从销量预测）→ 建议下单（告诉用户应该什么时候下单）
 * 2. 正推（从实际数据）→ 预计出厂/发货/到仓（告诉用户已下单的货什么时候到）
 *
 * 计算方向：
 * - 建议下单 = 倒推：销量需求周 - 总周期
 * - 预计出厂 = 正推：实际下单周 + 生产周期
 * - 预计发货 = 正推：实际出厂周 + 装柜周期（或从在途shipment）
 * - 预计到仓 = 正推：实际发货周 + 物流周期（或从在途shipment）
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCurrentWeek, addWeeksToISOWeek, parseISOWeekString, formatDateISO, getISOWeekString } from '@/lib/utils'
import type { Product, StockStatus } from '@/lib/types/database'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

export interface LeadTimes {
  production_weeks: number  // 生产周期 (PO→OF)
  loading_weeks: number     // 装柜周期 (OF→OS)
  shipping_weeks: number    // 物流周期 (OS→OA)
  inbound_weeks: number     // 上架周期 (OA→可销售)
  safety_stock_weeks: number
  total_weeks: number
}

export interface ReverseScheduleItem {
  target_week: string
  qty: number
  suggested_order_week: string
}

/**
 * Algorithm Audit Row - 双向计算结构
 * - 下单：建议（倒推）vs 实际
 * - 出厂/发货/到仓：预计（正推）vs 实际
 */
export interface ReverseScheduleAuditRow {
  week_iso: string
  week_start_date: string
  week_offset: number
  is_past: boolean
  is_current: boolean

  // 销售 (预测 vs 实际)
  sales_forecast: number
  sales_actual: number | null

  // 下单 (建议[倒推] vs 实际)
  suggested_order: number  // 倒推：为满足未来销量，这周应该下单多少
  actual_order: number

  // 出厂 (预计[正推] vs 实际)
  planned_factory_ship: number  // 正推：基于已下单，预计这周出厂多少
  actual_factory_ship: number

  // 发货 (预计[正推] vs 实际)
  planned_ship: number  // 正推：基于已出厂或在途，预计这周发货多少
  actual_ship: number

  // 到仓 (预计[正推] vs 实际)
  planned_arrival: number  // 正推：基于已发货或在途，预计这周到仓多少
  actual_arrival: number

  // 库存计算
  opening_stock: number
  arrival_effective: number  // COALESCE(actual_arrival, planned_arrival)
  sales_effective: number    // COALESCE(actual_sales, forecast_sales)
  closing_stock: number
  turnover_ratio: number | null  // 周转率 = 期末库存 / 有效销量
  stock_status: StockStatus

  // 详细数据
  order_details: Array<{ po_number: string; qty: number; order_date: string }>
  fulfillment_details: Array<{ delivery_number: string; qty: number; delivery_date: string }>
  ship_details: Array<{ tracking_number: string; qty: number; departure_date: string | null }>
  arrival_details: Array<{ tracking_number: string; qty: number; arrival_date: string }>
}

export interface ReverseScheduleAuditResult {
  product: Product | null
  rows: ReverseScheduleAuditRow[]
  leadTimes: LeadTimes
  reverseSchedule: ReverseScheduleItem[]
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    total_demand: number
    total_suggested_order: number
    total_actual_order: number
    gap: number
  }
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

function getWeekFromDate(date: Date): string {
  return getISOWeekString(date)
}

// ================================================================
// MAIN QUERY FUNCTION
// ================================================================

export async function fetchReverseScheduleAudit(
  sku: string,
  customStartWeek?: string,
  customEndWeek?: string
): Promise<ReverseScheduleAuditResult> {
  const supabase = await createServerSupabaseClient()
  const currentWeek = getCurrentWeek()

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
      leadTimes: { production_weeks: 5, loading_weeks: 1, shipping_weeks: 5, inbound_weeks: 2, safety_stock_weeks: 2, total_weeks: 13 },
      reverseSchedule: [],
      metadata: { current_week: currentWeek, start_week: startWeek, end_week: endWeek, total_weeks: 0, avg_weekly_sales: 0, total_demand: 0, total_suggested_order: 0, total_actual_order: 0, gap: 0 },
    }
  }

  // ================================================================
  // STEP 2: Fetch Lead Times
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
  leadTimes.total_weeks = leadTimes.production_weeks + leadTimes.loading_weeks + leadTimes.shipping_weeks + leadTimes.inbound_weeks

  // ================================================================
  // STEP 3: Generate Week Range
  // ================================================================

  const weeks: string[] = []
  let currentIterWeek = startWeek
  let currentWeekIndex = -1

  // 最多支持 104 周（2年），与筛选器范围一致
  for (let i = 0; i < 104; i++) {
    if (currentIterWeek > endWeek) break
    weeks.push(currentIterWeek)
    if (currentIterWeek === currentWeek) currentWeekIndex = i
    const next = addWeeksToISOWeek(currentIterWeek, 1)
    if (!next) break
    currentIterWeek = next
  }

  // ================================================================
  // STEP 4: Fetch Sales Forecasts
  // ================================================================

  const { data: forecasts } = await supabase
    .from('sales_forecasts')
    .select('week_iso, forecast_qty')
    .eq('sku', sku)
    .eq('is_closed', false)

  const forecastMap = new Map<string, number>()
  ;(forecasts || []).forEach(f => {
    const current = forecastMap.get(f.week_iso) || 0
    forecastMap.set(f.week_iso, current + f.forecast_qty)
  })

  // ================================================================
  // STEP 5: 倒推计算 - 建议下单
  // 从销量预测倒推：这周应该下多少单（为满足未来N周的销量）
  // ================================================================

  const reverseSchedule: ReverseScheduleItem[] = []
  const suggestedOrderByWeek = new Map<string, number>()

  // 遍历所有周的销量预测
  forecastMap.forEach((qty, targetWeek) => {
    if (qty > 0) {
      // 倒推：销量需求周 - 总周期 = 建议下单周
      const orderWeek = addWeeksToISOWeek(targetWeek, -leadTimes.total_weeks)
      if (orderWeek) {
        reverseSchedule.push({ target_week: targetWeek, qty, suggested_order_week: orderWeek })
        const current = suggestedOrderByWeek.get(orderWeek) || 0
        suggestedOrderByWeek.set(orderWeek, current + qty)
      }
    }
  })

  // ================================================================
  // STEP 6: Fetch Actual Data
  // ================================================================

  // 实际销量
  const { data: actuals } = await supabase
    .from('sales_actuals')
    .select('week_iso, actual_qty')
    .eq('sku', sku)

  const actualSalesMap = new Map<string, number>()
  ;(actuals || []).forEach(a => {
    const current = actualSalesMap.get(a.week_iso) || 0
    actualSalesMap.set(a.week_iso, current + a.actual_qty)
  })

  // 实际下单 (PO)
  const { data: purchaseOrders } = await supabase
    .from('purchase_orders')
    .select(`id, po_number, actual_order_date, purchase_order_items!inner(sku, ordered_qty)`)
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

  // 出厂记录 (Delivery) - 包含实际和预计
  const { data: deliveries } = await supabase
    .from('production_deliveries')
    .select('id, delivery_number, sku, delivered_qty, planned_delivery_date, actual_delivery_date')
    .eq('sku', sku)

  const actualFactoryShipMap = new Map<string, number>()
  const fulfillmentDetailsByWeek = new Map<string, Array<{ delivery_number: string; qty: number; delivery_date: string }>>()
  // 新增：从 production_deliveries 读取预计出厂（有 planned 但没有 actual 的记录）
  const plannedFactoryShipFromDeliveriesMap = new Map<string, number>()

  ;(deliveries || []).forEach((d: any) => {
    if (d.actual_delivery_date) {
      // 实际出厂
      const deliveryWeek = getWeekFromDate(new Date(d.actual_delivery_date))
      const current = actualFactoryShipMap.get(deliveryWeek) || 0
      actualFactoryShipMap.set(deliveryWeek, current + d.delivered_qty)
      const details = fulfillmentDetailsByWeek.get(deliveryWeek) || []
      details.push({ delivery_number: d.delivery_number, qty: d.delivered_qty, delivery_date: d.actual_delivery_date })
      fulfillmentDetailsByWeek.set(deliveryWeek, details)
    } else if (d.planned_delivery_date) {
      // 预计出厂（有 planned 但没有 actual）
      const plannedWeek = getWeekFromDate(new Date(d.planned_delivery_date))
      const current = plannedFactoryShipFromDeliveriesMap.get(plannedWeek) || 0
      plannedFactoryShipFromDeliveriesMap.set(plannedWeek, current + d.delivered_qty)
    }
  })

  // Shipments
  const { data: shipments } = await supabase
    .from('shipments')
    .select(`id, tracking_number, actual_departure_date, planned_arrival_date, actual_arrival_date, shipment_items!inner(sku, shipped_qty)`)
    .eq('shipment_items.sku', sku)

  const actualShipMap = new Map<string, number>()
  const actualArrivalMap = new Map<string, number>()
  const plannedArrivalFromShipmentsMap = new Map<string, number>() // 在途货物预计到仓
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
      // 在途货物预计到仓（已发货但未到仓）
      else if (s.actual_departure_date && s.planned_arrival_date) {
        const plannedArrivalWeek = getWeekFromDate(new Date(s.planned_arrival_date))
        const current = plannedArrivalFromShipmentsMap.get(plannedArrivalWeek) || 0
        plannedArrivalFromShipmentsMap.set(plannedArrivalWeek, current + item.shipped_qty)
      }
    })
  })

  // ================================================================
  // STEP 7: 正推计算 - 部分履约追踪
  // 核心思想（优先级从高到低）：
  // 1. 从 production_deliveries 读取预计出厂（planned_delivery_date 但无 actual_delivery_date）
  //    用户创建PO时会生成连续几周的预计出货计划，实际出货从时间近的先出
  // 2. 如果没有预计出厂记录，则从实际下单正推计算
  // 3. 如果没有实际下单，则从建议下单正推计算
  // ================================================================

  // 7.1 预计出厂（正推）：追踪部分履约
  const plannedFactoryShipByWeek = new Map<string, number>()

  // 最高优先级：从 production_deliveries 读取预计出厂
  // 这些是有 planned_delivery_date 但没有 actual_delivery_date 的记录
  // 用户创建PO时会生成连续几周的预计出货计划
  //
  // 重要：预计出厂需要扣减已实际出厂的总量
  // 例如：下单150，实际出厂105，则剩余预计出厂只能是45
  if (plannedFactoryShipFromDeliveriesMap.size > 0) {
    // 计算总下单量
    const totalOrdered = Array.from(actualOrderMap.values()).reduce((a, b) => a + b, 0)
    // 计算总实际出厂量
    const totalActualFactoryShip = Array.from(actualFactoryShipMap.values()).reduce((a, b) => a + b, 0)
    // 剩余待出厂 = 总下单 - 总实际出厂
    let remainingToShip = Math.max(0, totalOrdered - totalActualFactoryShip)

    // 按周排序，从近到远分配剩余量
    const sortedPlannedWeeks = Array.from(plannedFactoryShipFromDeliveriesMap.keys()).sort()

    for (const week of sortedPlannedWeeks) {
      if (remainingToShip <= 0) break

      const actualQty = actualFactoryShipMap.get(week) || 0
      const plannedQty = plannedFactoryShipFromDeliveriesMap.get(week) || 0

      if (actualQty > 0) {
        // 该周有实际出厂，从剩余量中扣除该周预计量，但不显示预计值
        // 因为该周的计划已被"占用"，后续周只能分配剩余的量
        remainingToShip -= plannedQty
        continue
      }

      // 分配剩余量，不超过该周原计划
      const allocatedQty = Math.min(plannedQty, remainingToShip)
      if (allocatedQty > 0) {
        plannedFactoryShipByWeek.set(week, allocatedQty)
        remainingToShip -= allocatedQty
      }
    }
  }

  // 次优先级：如果没有预计出厂记录，使用计算的预计
  if (plannedFactoryShipFromDeliveriesMap.size === 0) {
    // 核心逻辑：剩余预计出厂 = 总下单 - 总实际出厂
    // 不再基于下单周正推，而是直接计算剩余量并分配到未来最近的可用周

    // 1. 计算总下单量
    const totalOrdered = Array.from(actualOrderMap.values()).reduce((a, b) => a + b, 0)

    // 如果没有实际下单，用建议下单
    const totalSuggestedOrder = totalOrdered > 0 ? 0 : Array.from(suggestedOrderByWeek.values()).reduce((a, b) => a + b, 0)
    const totalOrderBase = totalOrdered > 0 ? totalOrdered : totalSuggestedOrder

    // 2. 计算总实际出厂量
    const totalActualFactoryShip = Array.from(actualFactoryShipMap.values()).reduce((a, b) => a + b, 0)

    // 3. 剩余待出厂 = 总下单 - 总实际出厂
    const remainingToShip = Math.max(0, totalOrderBase - totalActualFactoryShip)

    // 4. 如果有剩余，分配到未来最近的可用周
    if (remainingToShip > 0) {
      // 找到当前周或下一周作为预计出厂周
      // 优先使用最近的订单周 + 生产周期
      let targetWeek: string | null = null

      if (actualOrderMap.size > 0) {
        // 从实际下单中找最近的订单周
        const latestOrderWeek = Array.from(actualOrderMap.keys()).sort().pop()
        if (latestOrderWeek) {
          targetWeek = addWeeksToISOWeek(latestOrderWeek, leadTimes.production_weeks)
        }
      } else if (suggestedOrderByWeek.size > 0) {
        // 从建议下单中找最近的订单周
        const latestSuggestedWeek = Array.from(suggestedOrderByWeek.keys()).sort().pop()
        if (latestSuggestedWeek) {
          targetWeek = addWeeksToISOWeek(latestSuggestedWeek, leadTimes.production_weeks)
        }
      }

      // 如果找到目标周，分配剩余量
      if (targetWeek) {
        // 如果目标周已有实际出厂，推到下一周
        let finalWeek = targetWeek
        while (actualFactoryShipMap.has(finalWeek)) {
          const nextWeek = addWeeksToISOWeek(finalWeek, 1)
          if (!nextWeek) break
          finalWeek = nextWeek
        }

        plannedFactoryShipByWeek.set(finalWeek, remainingToShip)
      }
    }
  }

  // 7.2 预计发货（正推）：追踪部分履约
  const plannedShipByWeek = new Map<string, number>()

  // 从预计出厂正推预计发货
  plannedFactoryShipByWeek.forEach((qty, factoryShipWeek) => {
    const shipWeek = addWeeksToISOWeek(factoryShipWeek, leadTimes.loading_weeks)
    if (shipWeek) {
      const current = plannedShipByWeek.get(shipWeek) || 0
      plannedShipByWeek.set(shipWeek, current + qty)
    }
  })

  // 从实际出厂正推预计发货
  actualFactoryShipMap.forEach((qty, factoryShipWeek) => {
    const shipWeek = addWeeksToISOWeek(factoryShipWeek, leadTimes.loading_weeks)
    if (shipWeek) {
      const actualQty = actualShipMap.get(shipWeek) || 0
      if (actualQty === 0) {
        // 没有实际发货，显示预计
        const current = plannedShipByWeek.get(shipWeek) || 0
        // 用实际出厂推算的值（可能比预计出厂推算的更准确）
        plannedShipByWeek.set(shipWeek, Math.max(current, qty))
      } else if (actualQty < qty) {
        // 部分发货，差额显示在下一周
        const gap = qty - actualQty
        const nextWeek = addWeeksToISOWeek(shipWeek, 1)
        if (nextWeek) {
          const existing = plannedShipByWeek.get(nextWeek) || 0
          plannedShipByWeek.set(nextWeek, existing + gap)
        }
        plannedShipByWeek.delete(shipWeek) // 该周已有实际，不显示预计
      } else {
        // 实际 >= 预计，不显示预计
        plannedShipByWeek.delete(shipWeek)
      }
    }
  })

  // 7.3 预计到仓（正推）：追踪部分履约
  const plannedArrivalByWeek = new Map<string, number>()

  // 先从预计发货正推
  plannedShipByWeek.forEach((qty, shipWeek) => {
    const arrivalWeek = addWeeksToISOWeek(shipWeek, leadTimes.shipping_weeks)
    if (arrivalWeek) {
      const current = plannedArrivalByWeek.get(arrivalWeek) || 0
      plannedArrivalByWeek.set(arrivalWeek, current + qty)
    }
  })

  // 从实际发货正推
  actualShipMap.forEach((qty, shipWeek) => {
    const arrivalWeek = addWeeksToISOWeek(shipWeek, leadTimes.shipping_weeks)
    if (arrivalWeek) {
      const actualQty = actualArrivalMap.get(arrivalWeek) || 0
      const plannedFromShipments = plannedArrivalFromShipmentsMap.get(arrivalWeek) || 0

      if (actualQty === 0 && plannedFromShipments === 0) {
        // 用实际发货推算
        const current = plannedArrivalByWeek.get(arrivalWeek) || 0
        plannedArrivalByWeek.set(arrivalWeek, Math.max(current, qty))
      } else if (actualQty > 0 && actualQty < qty) {
        // 部分到仓，差额显示在下一周
        const gap = qty - actualQty
        const nextWeek = addWeeksToISOWeek(arrivalWeek, 1)
        if (nextWeek) {
          const existing = plannedArrivalByWeek.get(nextWeek) || 0
          plannedArrivalByWeek.set(nextWeek, existing + gap)
        }
        plannedArrivalByWeek.delete(arrivalWeek)
      } else if (actualQty > 0) {
        plannedArrivalByWeek.delete(arrivalWeek)
      }
    }
  })

  // 用在途shipment的预计到仓覆盖（最高优先级）
  plannedArrivalFromShipmentsMap.forEach((qty, week) => {
    const actualQty = actualArrivalMap.get(week) || 0
    if (actualQty === 0) {
      plannedArrivalByWeek.set(week, qty)
    }
  })

  // ================================================================
  // STEP 8: Fetch Current Inventory
  // ================================================================

  const { data: snapshots } = await supabase
    .from('inventory_snapshots')
    .select('qty_on_hand')
    .eq('sku', sku)

  const initialStock = (snapshots || []).reduce((sum, s) => sum + s.qty_on_hand, 0)

  // ================================================================
  // STEP 9: Build Rows
  // ================================================================

  let runningStock = initialStock
  const totalEffectiveSales = weeks.reduce((sum, week) => {
    const forecast = forecastMap.get(week) || 0
    const actual = actualSalesMap.get(week)
    return sum + (actual !== undefined && actual !== null ? actual : forecast)
  }, 0)
  const avgWeeklySales = totalEffectiveSales / weeks.length

  const rows: ReverseScheduleAuditRow[] = weeks.map((week, index) => {
    const weekOffset = currentWeekIndex >= 0 ? index - currentWeekIndex : index - 4
    const weekStartDate = parseISOWeekString(week)
    const week_start_date = weekStartDate ? formatDateISO(weekStartDate) : week

    // 销售
    const sales_forecast = forecastMap.get(week) || 0
    const sales_actual = actualSalesMap.get(week) ?? null
    const sales_effective = sales_actual !== null ? sales_actual : sales_forecast

    // 下单：建议（倒推）vs 实际
    const suggested_order = suggestedOrderByWeek.get(week) || 0
    const actual_order = actualOrderMap.get(week) || 0

    // 出厂：预计（正推）vs 实际
    const planned_factory_ship = plannedFactoryShipByWeek.get(week) || 0
    const actual_factory_ship = actualFactoryShipMap.get(week) || 0

    // 发货：预计（正推）vs 实际
    const planned_ship = plannedShipByWeek.get(week) || 0
    const actual_ship = actualShipMap.get(week) || 0

    // 到仓：预计（正推）vs 实际
    const planned_arrival = plannedArrivalByWeek.get(week) || 0
    const actual_arrival = actualArrivalMap.get(week) || 0

    // 有效到仓 = COALESCE(实际, 预计)
    const arrival_effective = actual_arrival > 0 ? actual_arrival : planned_arrival

    // 库存计算
    const opening_stock = runningStock
    const closing_stock = opening_stock + arrival_effective - sales_effective
    runningStock = closing_stock

    // 周转率 = 期末库存 / 有效销量（销量为0时为null）
    const turnover_ratio = sales_effective > 0 ? closing_stock / sales_effective : null

    // 库存状态：简化为根据期末库存判断
    let stock_status: StockStatus = 'OK'
    if (closing_stock <= 0) stock_status = 'Stockout'
    else if (turnover_ratio !== null && turnover_ratio < 2) stock_status = 'Risk' // 周转率<2周视为风险

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
      planned_factory_ship,
      actual_factory_ship,
      planned_ship,
      actual_ship,
      planned_arrival,
      actual_arrival,
      opening_stock,
      arrival_effective,
      sales_effective,
      closing_stock,
      turnover_ratio,
      stock_status,
      order_details: orderDetailsByWeek.get(week) || [],
      fulfillment_details: fulfillmentDetailsByWeek.get(week) || [],
      ship_details: shipDetailsByWeek.get(week) || [],
      arrival_details: arrivalDetailsByWeek.get(week) || [],
    }
  })

  // ================================================================
  // STEP 10: Calculate Metadata
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
