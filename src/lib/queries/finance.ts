import { createServerSupabaseClient } from '@/lib/supabase/server'

interface PayableItem {
  id: string
  type: 'procurement' | 'logistics'
  reference_number: string
  batch_code: string | null
  amount_usd: number
  due_date: string
  payment_month: string
  payment_status: string
  created_at: string
}

/**
 * Fetch pending payables grouped by month
 */
export async function fetchPendingPayables(): Promise<{
  month: string
  procurement_total: number
  logistics_total: number
  total: number
  items: PayableItem[]
}[]> {
  const supabase = await createServerSupabaseClient()

  // Fetch procurement payables (from production_deliveries)
  const { data: procurementData } = await supabase
    .from('production_deliveries')
    .select('*')
    .neq('payment_status', 'Paid')
    .not('payment_month', 'is', null)
    .order('payment_due_date')

  // Fetch logistics payables (from shipments)
  const { data: logisticsData } = await supabase
    .from('shipments')
    .select('*')
    .neq('payment_status', 'Paid')
    .not('payment_month', 'is', null)
    .order('payment_due_date')

  // Group by month
  const monthMap = new Map<string, {
    procurement_total: number
    logistics_total: number
    items: PayableItem[]
  }>()

  // Process procurement
  ;(procurementData || []).forEach((d: any) => {
    const month = d.payment_month
    if (!monthMap.has(month)) {
      monthMap.set(month, { procurement_total: 0, logistics_total: 0, items: [] })
    }
    const entry = monthMap.get(month)!
    const amount = d.total_value_usd || 0
    entry.procurement_total += amount
    entry.items.push({
      id: d.id,
      type: 'procurement',
      reference_number: d.delivery_number,
      batch_code: null,
      amount_usd: amount,
      due_date: d.payment_due_date,
      payment_month: month,
      payment_status: d.payment_status,
      created_at: d.created_at,
    })
  })

  // Process logistics
  ;(logisticsData || []).forEach((s: any) => {
    const month = s.payment_month
    if (!monthMap.has(month)) {
      monthMap.set(month, { procurement_total: 0, logistics_total: 0, items: [] })
    }
    const entry = monthMap.get(month)!
    const amount = s.total_cost_usd || 0
    entry.logistics_total += amount
    entry.items.push({
      id: s.id,
      type: 'logistics',
      reference_number: s.tracking_number,
      batch_code: s.batch_code,
      amount_usd: amount,
      due_date: s.payment_due_date,
      payment_month: month,
      payment_status: s.payment_status,
      created_at: s.created_at,
    })
  })

  // Convert to array and sort by month
  return Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      ...data,
      total: data.procurement_total + data.logistics_total,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Fetch payment summary statistics
 */
export async function fetchPaymentSummary(): Promise<{
  total_pending: number
  procurement_pending: number
  logistics_pending: number
  next_month_due: number
  overdue_amount: number
}> {
  const supabase = await createServerSupabaseClient()

  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const nextMonth = today.getMonth() === 11
    ? `${today.getFullYear() + 1}-01`
    : `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}`

  // Fetch all pending payables
  const [procurementResult, logisticsResult] = await Promise.all([
    supabase
      .from('production_deliveries')
      .select('total_value_usd, payment_due_date, payment_month')
      .neq('payment_status', 'Paid'),
    supabase
      .from('shipments')
      .select('total_cost_usd, payment_due_date, payment_month')
      .neq('payment_status', 'Paid'),
  ])

  let procurement_pending = 0
  let logistics_pending = 0
  let next_month_due = 0
  let overdue_amount = 0

  const todayStr = today.toISOString().split('T')[0]

  ;(procurementResult.data || []).forEach((d: any) => {
    const amount = d.total_value_usd || 0
    procurement_pending += amount
    if (d.payment_month === nextMonth) {
      next_month_due += amount
    }
    if (d.payment_due_date && d.payment_due_date < todayStr) {
      overdue_amount += amount
    }
  })

  ;(logisticsResult.data || []).forEach((s: any) => {
    const amount = s.total_cost_usd || 0
    logistics_pending += amount
    if (s.payment_month === nextMonth) {
      next_month_due += amount
    }
    if (s.payment_due_date && s.payment_due_date < todayStr) {
      overdue_amount += amount
    }
  })

  return {
    total_pending: procurement_pending + logistics_pending,
    procurement_pending,
    logistics_pending,
    next_month_due,
    overdue_amount,
  }
}

/**
 * Fetch payment history (paid items)
 */
export async function fetchPaymentHistory(limit = 50): Promise<PayableItem[]> {
  const supabase = await createServerSupabaseClient()

  const [procurementResult, logisticsResult] = await Promise.all([
    supabase
      .from('production_deliveries')
      .select('*')
      .eq('payment_status', 'Paid')
      .order('updated_at', { ascending: false })
      .limit(limit / 2),
    supabase
      .from('shipments')
      .select('*')
      .eq('payment_status', 'Paid')
      .order('updated_at', { ascending: false })
      .limit(limit / 2),
  ])

  const items: PayableItem[] = []

  ;(procurementResult.data || []).forEach((d: any) => {
    items.push({
      id: d.id,
      type: 'procurement',
      reference_number: d.delivery_number,
      batch_code: null,
      amount_usd: d.total_value_usd || 0,
      due_date: d.payment_due_date,
      payment_month: d.payment_month,
      payment_status: d.payment_status,
      created_at: d.created_at,
    })
  })

  ;(logisticsResult.data || []).forEach((s: any) => {
    items.push({
      id: s.id,
      type: 'logistics',
      reference_number: s.tracking_number,
      batch_code: s.batch_code,
      amount_usd: s.total_cost_usd || 0,
      due_date: s.payment_due_date,
      payment_month: s.payment_month,
      payment_status: s.payment_status,
      created_at: s.created_at,
    })
  })

  return items.sort((a, b) => b.created_at.localeCompare(a.created_at))
}
