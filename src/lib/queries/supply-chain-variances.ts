/**
 * Supply Chain Variance Queries
 * Backend Specialist - Rolloy SCM
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { VarianceOverview, VarianceSummaryKPIs, SupplyChainVariance, VarianceAdjustment } from '@/lib/types/database'

/**
 * 获取差异列表 (带筛选)
 */
export async function fetchVariances(filters?: {
  sku?: string
  status?: string
  priority?: string
  min_pending_qty?: number
  source_type?: string
}): Promise<VarianceOverview[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_variance_overview')
    .select('*')
    .order('priority', { ascending: true })
    .order('age_days', { ascending: false })

  if (filters?.sku) {
    query = query.eq('sku', filters.sku)
  }

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority)
  }

  if (filters?.min_pending_qty) {
    query = query.gte('pending_qty', filters.min_pending_qty)
  }

  if (filters?.source_type) {
    query = query.eq('source_type', filters.source_type)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching variances:', error)
    return []
  }

  return data || []
}

/**
 * 获取差异汇总 KPI
 */
export async function fetchVarianceSummaryKPIs(): Promise<VarianceSummaryKPIs> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_variance_overview')
    .select('*')
    .in('status', ['pending', 'scheduled', 'overdue', 'partial'])

  if (error || !data) {
    return {
      total_variances: 0,
      total_pending_qty: 0,
      critical_count: 0,
      high_count: 0,
      overdue_count: 0,
      scheduled_count: 0,
      avg_age_days: 0,
      oldest_variance_days: 0
    }
  }

  const totalAgeDays = data.reduce((sum, v) => sum + v.age_days, 0)
  const ageDaysArray = data.map(v => v.age_days)

  return {
    total_variances: data.length,
    total_pending_qty: data.reduce((sum, v) => sum + v.pending_qty, 0),
    critical_count: data.filter(v => v.priority === 'Critical').length,
    high_count: data.filter(v => v.priority === 'High').length,
    overdue_count: data.filter(v => v.status === 'overdue').length,
    scheduled_count: data.filter(v => v.status === 'scheduled').length,
    avg_age_days: data.length > 0 ? Math.round(totalAgeDays / data.length) : 0,
    oldest_variance_days: ageDaysArray.length > 0 ? Math.max(...ageDaysArray) : 0
  }
}

/**
 * 获取单个差异的详细信息
 */
export async function fetchVarianceById(
  varianceId: string
): Promise<VarianceOverview | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_variance_overview')
    .select('*')
    .eq('id', varianceId)
    .single()

  if (error) {
    console.error('Error fetching variance:', error)
    return null
  }

  return data
}

/**
 * 获取特定 SKU 的所有差异
 */
export async function fetchVariancesBySKU(
  sku: string,
  includeCompleted: boolean = false
): Promise<VarianceOverview[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_variance_overview')
    .select('*')
    .eq('sku', sku)
    .order('created_at', { ascending: false })

  if (!includeCompleted) {
    query = query.in('status', ['pending', 'scheduled', 'overdue', 'partial'])
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching variances by SKU:', error)
    return []
  }

  return data || []
}

/**
 * 获取逾期差异列表
 */
export async function fetchOverdueVariances(): Promise<VarianceOverview[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_variance_overview')
    .select('*')
    .eq('status', 'overdue')
    .order('age_days', { ascending: false })

  if (error) {
    console.error('Error fetching overdue variances:', error)
    return []
  }

  return data || []
}

/**
 * 获取高优先级差异列表
 */
export async function fetchHighPriorityVariances(
  limit: number = 20
): Promise<VarianceOverview[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_variance_overview')
    .select('*')
    .in('priority', ['Critical', 'High'])
    .in('status', ['pending', 'scheduled', 'overdue', 'partial'])
    .order('priority', { ascending: true })
    .order('age_days', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching high priority variances:', error)
    return []
  }

  return data || []
}

/**
 * 为算法审计V4获取差异调整数据
 * 返回指定 SKU 在指定周范围内的差异计划
 */
export async function fetchVarianceAdjustmentsForAudit(
  sku: string,
  weekRange: string[]
): Promise<Map<string, VarianceAdjustment>> {
  const supabase = await createServerSupabaseClient()

  // 查询该 SKU 在未来周的差异计划
  const { data: variances, error } = await supabase
    .from('supply_chain_variances')
    .select('*')
    .eq('sku', sku)
    .in('status', ['pending', 'scheduled', 'overdue', 'partial'])
    .not('planned_week', 'is', null)
    .in('planned_week', weekRange)

  if (error) {
    console.error('Error fetching variance adjustments:', error)
    return new Map()
  }

  if (!variances || variances.length === 0) {
    return new Map()
  }

  // 构建 week -> adjustment 映射
  const adjustmentMap = new Map<string, VarianceAdjustment>()

  variances.forEach(v => {
    if (!v.planned_week) return

    const existing = adjustmentMap.get(v.planned_week) || {
      factory_ship_adjustment: 0,
      ship_adjustment: 0,
      variances: []
    }

    // 根据 source_type 分类调整
    if (v.source_type === 'order_to_delivery') {
      // 下单→出货差异：调整 planned_factory_ship
      existing.factory_ship_adjustment += v.pending_qty
    } else if (v.source_type === 'delivery_to_ship') {
      // 出货→发货差异：调整 planned_ship
      existing.ship_adjustment += v.pending_qty
    }

    existing.variances.push(v as SupplyChainVariance)
    adjustmentMap.set(v.planned_week, existing)
  })

  return adjustmentMap
}

/**
 * 获取待计划的差异数量 (用于 Dashboard KPI)
 */
export async function fetchPendingVarianceCount(): Promise<number> {
  const supabase = await createServerSupabaseClient()

  const { count, error } = await supabase
    .from('supply_chain_variances')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'overdue'])

  if (error) {
    console.error('Error fetching pending variance count:', error)
    return 0
  }

  return count || 0
}

/**
 * 按产品分组的差异汇总
 */
export async function fetchVariancesByProduct(): Promise<Array<{
  sku: string
  product_name: string
  total_pending_qty: number
  variance_count: number
  critical_count: number
  oldest_age_days: number
}>> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_variance_overview')
    .select('*')
    .in('status', ['pending', 'scheduled', 'overdue', 'partial'])

  if (error || !data) {
    console.error('Error fetching variances by product:', error)
    return []
  }

  // 按 SKU 分组聚合
  const groupedMap = new Map<string, {
    sku: string
    product_name: string
    total_pending_qty: number
    variance_count: number
    critical_count: number
    oldest_age_days: number
  }>()

  data.forEach(v => {
    const existing = groupedMap.get(v.sku) || {
      sku: v.sku,
      product_name: v.product_name,
      total_pending_qty: 0,
      variance_count: 0,
      critical_count: 0,
      oldest_age_days: 0
    }

    existing.total_pending_qty += v.pending_qty
    existing.variance_count += 1
    if (v.priority === 'Critical') existing.critical_count += 1
    existing.oldest_age_days = Math.max(existing.oldest_age_days, v.age_days)

    groupedMap.set(v.sku, existing)
  })

  return Array.from(groupedMap.values()).sort((a, b) => b.critical_count - a.critical_count)
}
