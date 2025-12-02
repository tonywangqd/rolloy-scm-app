import { createServerSupabaseClient } from '@/lib/supabase/server'
import { formatDateISO, getProcurementPaymentDate, getLogisticsPaymentDate } from '@/lib/utils'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

export interface ProcurementPayment {
  id: string
  po_number: string
  supplier_name: string
  delivery_number: string
  delivery_date: string
  amount_usd: number
  payment_date: string
  payment_month: string
  payment_status: 'Pending' | 'Scheduled' | 'Paid'
}

export interface LogisticsPayment {
  id: string
  tracking_number: string
  arrival_date: string
  amount_cny: number
  amount_usd: number
  payment_date: string
  payment_period: string // "2025-01上" or "2025-01下"
  payment_status: 'Pending' | 'Scheduled' | 'Paid'
}

export interface ProcurementPaymentGroup {
  payment_month: string
  total_usd: number
  items: ProcurementPayment[]
}

export interface LogisticsPaymentGroup {
  payment_period: string
  payment_date: string
  total_cny: number
  total_usd: number
  items: LogisticsPayment[]
}

// ================================================================
// PROCUREMENT PAYMENTS (USD)
// ================================================================

/**
 * Fetch procurement payments from production_deliveries
 * Payment terms: 60 days after delivery (payment on last business day of month + 2)
 */
export async function fetchProcurementPayments(): Promise<ProcurementPaymentGroup[]> {
  const supabase = await createServerSupabaseClient()

  // Fetch deliveries with PO and supplier information
  const { data, error } = await supabase
    .from('production_deliveries')
    .select(`
      id,
      delivery_number,
      actual_delivery_date,
      total_value_usd,
      payment_status,
      po_item_id,
      purchase_order_items!inner (
        po_id,
        purchase_orders!inner (
          po_number,
          supplier_id,
          suppliers (
            supplier_name
          )
        )
      )
    `)
    .not('actual_delivery_date', 'is', null)
    .neq('payment_status', 'Paid')
    .order('actual_delivery_date')

  if (error || !data) {
    console.error('Error fetching procurement payments:', error)
    return []
  }

  // Group by payment month
  const monthMap = new Map<string, {
    total_usd: number
    items: ProcurementPayment[]
  }>()

  data.forEach((delivery: any) => {
    const deliveryDate = new Date(delivery.actual_delivery_date)
    const paymentDate = getProcurementPaymentDate(deliveryDate)
    const paymentMonth = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`

    const poItem = delivery.purchase_order_items
    const po = poItem?.purchase_orders
    const supplier = po?.suppliers

    if (!monthMap.has(paymentMonth)) {
      monthMap.set(paymentMonth, { total_usd: 0, items: [] })
    }

    const group = monthMap.get(paymentMonth)!
    const amount = delivery.total_value_usd || 0

    group.total_usd += amount
    group.items.push({
      id: delivery.id,
      po_number: po?.po_number || 'N/A',
      supplier_name: supplier?.supplier_name || 'Unknown',
      delivery_number: delivery.delivery_number,
      delivery_date: delivery.actual_delivery_date,
      amount_usd: amount,
      payment_date: formatDateISO(paymentDate),
      payment_month: paymentMonth,
      payment_status: delivery.payment_status,
    })
  })

  // Convert to array and sort by month
  return Array.from(monthMap.entries())
    .map(([payment_month, data]) => ({
      payment_month,
      ...data,
    }))
    .sort((a, b) => a.payment_month.localeCompare(b.payment_month))
}

// ================================================================
// LOGISTICS PAYMENTS (CNY)
// ================================================================

/**
 * Fetch logistics payments from shipments
 * Payment terms:
 * - Arrival day <= 15: payment on 15th of next month
 * - Arrival day > 15: payment on last business day of next month
 */
export async function fetchLogisticsPayments(): Promise<LogisticsPaymentGroup[]> {
  const supabase = await createServerSupabaseClient()

  // Exchange rate: 1 USD = 7.2 CNY (hardcoded for now)
  const USD_TO_CNY = 7.2

  const { data, error } = await supabase
    .from('shipments')
    .select('id, tracking_number, actual_arrival_date, total_cost_usd, payment_status')
    .not('actual_arrival_date', 'is', null)
    .neq('payment_status', 'Paid')
    .order('actual_arrival_date')

  if (error || !data) {
    console.error('Error fetching logistics payments:', error)
    return []
  }

  // Group by payment period (半月)
  const periodMap = new Map<string, {
    payment_date: string
    total_cny: number
    total_usd: number
    items: LogisticsPayment[]
  }>()

  data.forEach((shipment: any) => {
    const arrivalDate = new Date(shipment.actual_arrival_date)
    const paymentDate = getLogisticsPaymentDate(arrivalDate)
    const dayOfMonth = arrivalDate.getDate()

    // Payment period format: "2025-01上" (上半月) or "2025-01下" (下半月)
    const yearMonth = `${arrivalDate.getFullYear()}-${String(arrivalDate.getMonth() + 1).padStart(2, '0')}`
    const period = dayOfMonth <= 15 ? '上' : '下'
    const paymentPeriod = `${yearMonth}${period}`

    if (!periodMap.has(paymentPeriod)) {
      periodMap.set(paymentPeriod, {
        payment_date: formatDateISO(paymentDate),
        total_cny: 0,
        total_usd: 0,
        items: [],
      })
    }

    const group = periodMap.get(paymentPeriod)!
    const amountUsd = shipment.total_cost_usd || 0
    const amountCny = amountUsd * USD_TO_CNY

    group.total_usd += amountUsd
    group.total_cny += amountCny
    group.items.push({
      id: shipment.id,
      tracking_number: shipment.tracking_number,
      arrival_date: shipment.actual_arrival_date,
      amount_cny: amountCny,
      amount_usd: amountUsd,
      payment_date: formatDateISO(paymentDate),
      payment_period: paymentPeriod,
      payment_status: shipment.payment_status,
    })
  })

  // Convert to array and sort by period
  return Array.from(periodMap.entries())
    .map(([payment_period, data]) => ({
      payment_period,
      ...data,
    }))
    .sort((a, b) => a.payment_period.localeCompare(b.payment_period))
}

// ================================================================
// SUMMARY STATISTICS
// ================================================================

/**
 * Fetch payment summary statistics
 */
export async function fetchPaymentSummary(): Promise<{
  procurement_pending_usd: number
  logistics_pending_usd: number
  logistics_pending_cny: number
  total_pending_usd: number
  next_month_due_usd: number
  overdue_amount_usd: number
}> {
  const supabase = await createServerSupabaseClient()
  const USD_TO_CNY = 7.2

  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const nextMonth = today.getMonth() === 11
    ? `${today.getFullYear() + 1}-01`
    : `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}`
  const todayStr = formatDateISO(today)

  // Fetch procurement payables
  const { data: procurementData } = await supabase
    .from('production_deliveries')
    .select('total_value_usd, actual_delivery_date')
    .neq('payment_status', 'Paid')
    .not('actual_delivery_date', 'is', null)

  // Fetch logistics payables
  const { data: logisticsData } = await supabase
    .from('shipments')
    .select('total_cost_usd, actual_arrival_date')
    .neq('payment_status', 'Paid')
    .not('actual_arrival_date', 'is', null)

  let procurement_pending_usd = 0
  let logistics_pending_usd = 0
  let next_month_due_usd = 0
  let overdue_amount_usd = 0

  // Calculate procurement
  ;(procurementData || []).forEach((d: any) => {
    const amount = d.total_value_usd || 0
    procurement_pending_usd += amount

    if (d.actual_delivery_date) {
      const paymentDate = getProcurementPaymentDate(new Date(d.actual_delivery_date))
      const paymentMonth = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`

      if (paymentMonth === nextMonth) {
        next_month_due_usd += amount
      }
      if (formatDateISO(paymentDate) < todayStr) {
        overdue_amount_usd += amount
      }
    }
  })

  // Calculate logistics
  ;(logisticsData || []).forEach((s: any) => {
    const amount = s.total_cost_usd || 0
    logistics_pending_usd += amount

    if (s.actual_arrival_date) {
      const paymentDate = getLogisticsPaymentDate(new Date(s.actual_arrival_date))
      const paymentMonth = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`

      if (paymentMonth === nextMonth) {
        next_month_due_usd += amount
      }
      if (formatDateISO(paymentDate) < todayStr) {
        overdue_amount_usd += amount
      }
    }
  })

  return {
    procurement_pending_usd,
    logistics_pending_usd,
    logistics_pending_cny: logistics_pending_usd * USD_TO_CNY,
    total_pending_usd: procurement_pending_usd + logistics_pending_usd,
    next_month_due_usd,
    overdue_amount_usd,
  }
}
