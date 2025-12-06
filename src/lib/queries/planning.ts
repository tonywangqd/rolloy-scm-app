import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { SalesForecast, SalesActual, Product, Channel } from '@/lib/types/database'
import {
  getCurrentWeek,
  compareWeeks,
  addWeeksToWeekString,
  getWeekRange,
} from '@/lib/utils/date'

/**
 * Fetch sales forecasts with product and channel info
 */
export async function fetchSalesForecasts(options?: {
  yearWeekFrom?: string
  yearWeekTo?: string
  sku?: string
  channelCode?: string
}): Promise<(SalesForecast & { product_name?: string; channel_name?: string })[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('sales_forecasts')
    .select('*')
    .order('week_iso', { ascending: false })

  if (options?.yearWeekFrom) {
    query = query.gte('week_iso', options.yearWeekFrom)
  }
  if (options?.yearWeekTo) {
    query = query.lte('week_iso', options.yearWeekTo)
  }
  if (options?.sku) {
    query = query.eq('sku', options.sku)
  }
  if (options?.channelCode) {
    query = query.eq('channel_code', options.channelCode)
  }

  const { data: forecasts, error } = await query

  if (error) {
    console.error('Error fetching sales forecasts:', error)
    return []
  }

  // Fetch product and channel names
  const skus = [...new Set(forecasts?.map((f) => f.sku) || [])]
  const channelCodes = [...new Set(forecasts?.map((f) => f.channel_code) || [])]

  const [productsResult, channelsResult] = await Promise.all([
    supabase.from('products').select('sku, product_name').in('sku', skus),
    supabase.from('channels').select('channel_code, channel_name').in('channel_code', channelCodes),
  ])

  const productMap = new Map(productsResult.data?.map((p) => [p.sku, p.product_name]) || [])
  const channelMap = new Map(channelsResult.data?.map((c) => [c.channel_code, c.channel_name]) || [])

  return (forecasts || []).map((f) => ({
    ...f,
    product_name: productMap.get(f.sku),
    channel_name: channelMap.get(f.channel_code),
  }))
}

/**
 * Fetch sales actuals with product and channel info
 */
export async function fetchSalesActuals(options?: {
  yearWeekFrom?: string
  yearWeekTo?: string
  sku?: string
  channelCode?: string
}): Promise<(SalesActual & { product_name?: string; channel_name?: string })[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('sales_actuals')
    .select('*')
    .order('week_iso', { ascending: false })

  if (options?.yearWeekFrom) {
    query = query.gte('week_iso', options.yearWeekFrom)
  }
  if (options?.yearWeekTo) {
    query = query.lte('week_iso', options.yearWeekTo)
  }
  if (options?.sku) {
    query = query.eq('sku', options.sku)
  }
  if (options?.channelCode) {
    query = query.eq('channel_code', options.channelCode)
  }

  const { data: actuals, error } = await query

  if (error) {
    console.error('Error fetching sales actuals:', error)
    return []
  }

  // Fetch product and channel names
  const skus = [...new Set(actuals?.map((a) => a.sku) || [])]
  const channelCodes = [...new Set(actuals?.map((a) => a.channel_code) || [])]

  const [productsResult, channelsResult] = await Promise.all([
    supabase.from('products').select('sku, product_name').in('sku', skus),
    supabase.from('channels').select('channel_code, channel_name').in('channel_code', channelCodes),
  ])

  const productMap = new Map(productsResult.data?.map((p) => [p.sku, p.product_name]) || [])
  const channelMap = new Map(channelsResult.data?.map((c) => [c.channel_code, c.channel_name]) || [])

  return (actuals || []).map((a) => ({
    ...a,
    product_name: productMap.get(a.sku),
    channel_name: channelMap.get(a.channel_code),
  }))
}

/**
 * Fetch forecast vs actual comparison
 */
export async function fetchForecastVsActual(yearWeek: string): Promise<{
  sku: string
  channel_code: string
  forecast_qty: number
  actual_qty: number
  variance: number
  variance_pct: number
}[]> {
  const supabase = await createServerSupabaseClient()

  const [forecastsResult, actualsResult] = await Promise.all([
    supabase.from('sales_forecasts').select('*').eq('week_iso', yearWeek),
    supabase.from('sales_actuals').select('*').eq('week_iso', yearWeek),
  ])

  const forecasts = forecastsResult.data || []
  const actuals = actualsResult.data || []

  // Create a map of actuals
  const actualsMap = new Map(
    actuals.map((a) => [`${a.sku}-${a.channel_code}`, a.actual_qty])
  )

  return forecasts.map((f) => {
    const actualQty = actualsMap.get(`${f.sku}-${f.channel_code}`) || 0
    const variance = actualQty - f.forecast_qty
    const variancePct = f.forecast_qty > 0 ? (variance / f.forecast_qty) * 100 : 0

    return {
      sku: f.sku,
      channel_code: f.channel_code,
      forecast_qty: f.forecast_qty,
      actual_qty: actualQty,
      variance,
      variance_pct: variancePct,
    }
  })
}

/**
 * Fetch available year-weeks for planning
 */
export async function fetchAvailableWeeks(): Promise<string[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('sales_forecasts')
    .select('week_iso')
    .order('week_iso', { ascending: false })

  if (error) {
    console.error('Error fetching weeks:', error)
    return []
  }

  return [...new Set(data?.map((d) => d.week_iso) || [])]
}

// Week utility functions have been moved to @/lib/utils/date
// Re-export getCurrentWeek for backward compatibility
export { getCurrentWeek } from '@/lib/utils/date'

/**
 * Fetch sales timeline: past 4 weeks + current week + future 12 weeks
 */
export async function fetchSalesTimeline(): Promise<{
  weeks: {
    week_iso: string
    week_type: 'past' | 'current' | 'future'
    forecast_total: number
    actual_total: number
    variance: number
    variance_pct: number
  }[]
  by_sku: {
    sku: string
    product_name?: string
    weeks: { week_iso: string; forecast: number; actual: number }[]
  }[]
}> {
  const supabase = await createServerSupabaseClient()

  // Get current week and calculate range
  const currentWeek = getCurrentWeek()

  // Calculate week range: past 4 weeks + current + future 12 weeks = 17 weeks
  const weekFrom = addWeeksToWeekString(currentWeek, -4)
  const weekTo = addWeeksToWeekString(currentWeek, 12)

  if (!weekFrom || !weekTo) {
    throw new Error('Failed to calculate week range')
  }

  // Fetch forecasts and actuals in parallel
  // Note: Data is in sales_forecasts/sales_actuals tables with week_iso field
  const [forecastsResult, actualsResult, productsResult] = await Promise.all([
    supabase
      .from('sales_forecasts')
      .select('*')
      .gte('week_iso', weekFrom)
      .lte('week_iso', weekTo),
    supabase
      .from('sales_actuals')
      .select('*')
      .gte('week_iso', weekFrom)
      .lte('week_iso', weekTo),
    supabase
      .from('products')
      .select('sku, product_name')
      .eq('is_active', true),
  ])

  const forecasts = forecastsResult.data || []
  const actuals = actualsResult.data || []
  const products = productsResult.data || []

  // Create product name map
  const productNameMap = new Map(products.map((p) => [p.sku, p.product_name]))

  // Generate all weeks in the range
  const allWeeks = getWeekRange(weekFrom, weekTo)

  // Aggregate by week
  const weekMap = new Map<string, { forecast: number; actual: number }>()

  forecasts.forEach((f) => {
    const current = weekMap.get(f.week_iso) || { forecast: 0, actual: 0 }
    weekMap.set(f.week_iso, { ...current, forecast: current.forecast + f.forecast_qty })
  })

  actuals.forEach((a) => {
    const current = weekMap.get(a.week_iso) || { forecast: 0, actual: 0 }
    weekMap.set(a.week_iso, { ...current, actual: current.actual + a.actual_qty })
  })

  // Build weeks array with type classification
  const weeks = allWeeks.map((weekISO) => {
    const data = weekMap.get(weekISO) || { forecast: 0, actual: 0 }
    const comparison = compareWeeks(weekISO, currentWeek)
    const week_type: 'past' | 'current' | 'future' =
      comparison < 0 ? 'past' : comparison === 0 ? 'current' : 'future'

    const variance = data.actual - data.forecast
    const variance_pct = data.forecast > 0 ? (variance / data.forecast) * 100 : 0

    return {
      week_iso: weekISO,
      week_type,
      forecast_total: data.forecast,
      actual_total: data.actual,
      variance,
      variance_pct,
    }
  })

  // Aggregate by SKU
  const skuMap = new Map<string, Map<string, { forecast: number; actual: number }>>()

  forecasts.forEach((f) => {
    if (!skuMap.has(f.sku)) {
      skuMap.set(f.sku, new Map())
    }
    const weekData = skuMap.get(f.sku)!
    const current = weekData.get(f.week_iso) || { forecast: 0, actual: 0 }
    weekData.set(f.week_iso, { ...current, forecast: current.forecast + f.forecast_qty })
  })

  actuals.forEach((a) => {
    if (!skuMap.has(a.sku)) {
      skuMap.set(a.sku, new Map())
    }
    const weekData = skuMap.get(a.sku)!
    const current = weekData.get(a.week_iso) || { forecast: 0, actual: 0 }
    weekData.set(a.week_iso, { ...current, actual: current.actual + a.actual_qty })
  })

  // Build by_sku array
  const by_sku = Array.from(skuMap.entries()).map(([sku, weekData]) => ({
    sku,
    product_name: productNameMap.get(sku),
    weeks: allWeeks.map((weekISO) => {
      const data = weekData.get(weekISO) || { forecast: 0, actual: 0 }
      return {
        week_iso: weekISO,
        forecast: data.forecast,
        actual: data.actual,
      }
    }),
  }))

  return { weeks, by_sku }
}

/**
 * Fetch products list
 */
export async function fetchProducts(): Promise<Product[]> {
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

/**
 * Fetch channels list
 */
export async function fetchChannels(): Promise<Channel[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('is_active', true)
    .order('channel_code')

  if (error) {
    console.error('Error fetching channels:', error)
    return []
  }

  return data || []
}

// ================================================================
// FORECAST-ORDER LINKAGE QUERIES
// ================================================================

/**
 * Fetch forecast coverage list with filters
 */
export async function fetchForecastCoverage(filters?: {
  sku?: string
  channelCode?: string
  weekIso?: string
  status?: import('@/lib/types/database').ForecastCoverageStatus
}): Promise<import('@/lib/types/database').ForecastCoverageView[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase.from('v_forecast_coverage').select('*').order('week_iso', { ascending: true })

  if (filters?.sku) {
    query = query.eq('sku', filters.sku)
  }
  if (filters?.channelCode) {
    query = query.eq('channel_code', filters.channelCode)
  }
  if (filters?.weekIso) {
    query = query.eq('week_iso', filters.weekIso)
  }
  if (filters?.status) {
    query = query.eq('coverage_status', filters.status)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching forecast coverage:', error)
    return []
  }

  return data || []
}

/**
 * Fetch forecast coverage KPIs
 */
export async function fetchForecastCoverageKPIs(): Promise<{
  total: number
  uncovered: number
  partially: number
  fully: number
  over: number
  avgCoveragePercentage: number
}> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.from('v_forecast_coverage').select('coverage_status, coverage_percentage')

  if (error) {
    console.error('Error fetching coverage KPIs:', error)
    return {
      total: 0,
      uncovered: 0,
      partially: 0,
      fully: 0,
      over: 0,
      avgCoveragePercentage: 0,
    }
  }

  const kpis = {
    total: data.length,
    uncovered: data.filter((d) => d.coverage_status === 'UNCOVERED').length,
    partially: data.filter((d) => d.coverage_status === 'PARTIALLY_COVERED').length,
    fully: data.filter((d) => d.coverage_status === 'FULLY_COVERED').length,
    over: data.filter((d) => d.coverage_status === 'OVER_COVERED').length,
    avgCoveragePercentage:
      data.length > 0
        ? data.reduce((sum, d) => sum + d.coverage_percentage, 0) / data.length
        : 0,
  }

  return kpis
}

/**
 * Fetch pending variance resolutions
 */
export async function fetchPendingVariances(): Promise<
  import('@/lib/types/database').VariancePendingActionsView[]
> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_variance_pending_actions')
    .select('*')
    .order('priority', { ascending: true })
    .order('detected_at', { ascending: true })

  if (error) {
    console.error('Error fetching pending variances:', error)
    return []
  }

  return data || []
}

/**
 * Fetch allocatable forecasts for a PO item (for allocation selection)
 */
export async function fetchAllocatableForecasts(
  sku: string,
  channelCode: string | null,
  targetWeek?: string
): Promise<import('@/lib/types/database').ForecastCoverageView[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_forecast_coverage')
    .select('*')
    .eq('sku', sku)
    .gt('uncovered_qty', 0)
    .order('week_iso', { ascending: true })

  if (channelCode) {
    query = query.eq('channel_code', channelCode)
  }

  if (targetWeek) {
    // Only show forecasts within ±2 weeks of target week
    const { addWeeksToWeekString } = await import('@/lib/utils/date')
    const minWeek = addWeeksToWeekString(targetWeek, -2)
    const maxWeek = addWeeksToWeekString(targetWeek, 2)
    if (minWeek && maxWeek) {
      query = query.gte('week_iso', minWeek).lte('week_iso', maxWeek)
    }
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching allocatable forecasts:', error)
    return []
  }

  return data || []
}

/**
 * Fetch allocations for a PO item
 */
export async function fetchPoItemAllocations(
  poItemId: string
): Promise<
  (import('@/lib/types/database').ForecastOrderAllocation & {
    forecast?: {
      week_iso: string
      forecast_qty: number
    }
    product_name?: string
  })[]
> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('forecast_order_allocations')
    .select(
      `
      *,
      forecast:sales_forecasts!forecast_id (
        week_iso,
        forecast_qty,
        sku
      )
    `
    )
    .eq('po_item_id', poItemId)
    .order('allocated_at', { ascending: false })

  if (error) {
    console.error('Error fetching PO item allocations:', error)
    return []
  }

  // Fetch product names
  const skus = [...new Set((data || []).map((a) => a.forecast?.sku).filter(Boolean) as string[])]

  if (skus.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('sku, product_name')
      .in('sku', skus)

    const productMap = new Map((products || []).map((p) => [p.sku, p.product_name]))

    return (data || []).map((a) => ({
      ...a,
      product_name: a.forecast?.sku ? productMap.get(a.forecast.sku) : undefined,
    }))
  }

  return data || []
}

/**
 * Fetch allocations for a forecast
 */
export async function fetchForecastAllocations(
  forecastId: string
): Promise<
  (import('@/lib/types/database').ForecastOrderAllocation & {
    po_item?: {
      id: string
      ordered_qty: number
      delivered_qty: number
    }
    po?: {
      po_number: string
      batch_code: string
    }
  })[]
> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('forecast_order_allocations')
    .select(
      `
      *,
      po_item:purchase_order_items!po_item_id (
        id,
        ordered_qty,
        delivered_qty,
        po_id
      )
    `
    )
    .eq('forecast_id', forecastId)
    .order('allocated_at', { ascending: false })

  if (error) {
    console.error('Error fetching forecast allocations:', error)
    return []
  }

  // Fetch PO details
  const poIds = [...new Set((data || []).map((a) => a.po_item?.po_id).filter(Boolean) as string[])]

  if (poIds.length > 0) {
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('id, po_number, batch_code')
      .in('id', poIds)

    const poMap = new Map((pos || []).map((p) => [p.id, p]))

    return (data || []).map((a) => ({
      ...a,
      po: a.po_item?.po_id ? poMap.get(a.po_item.po_id) : undefined,
    }))
  }

  return data || []
}

/**
 * Fetch delivery deletion audit logs
 */
export async function fetchDeliveryDeletionLogs(options?: {
  deliveryId?: string
  poItemId?: string
  limit?: number
}): Promise<import('@/lib/types/database').DeliveryDeletionAuditLog[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('delivery_deletion_audit_log')
    .select('*')
    .order('deleted_at', { ascending: false })

  if (options?.deliveryId) {
    query = query.eq('delivery_id', options.deliveryId)
  }
  if (options?.poItemId) {
    query = query.eq('po_item_id', options.poItemId)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching delivery deletion logs:', error)
    return []
  }

  return data || []
}

/**
 * Fetch variance resolution by ID
 */
export async function fetchVarianceResolution(
  resolutionId: string
): Promise<import('@/lib/types/database').ForecastVarianceResolution | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('forecast_variance_resolutions')
    .select('*')
    .eq('id', resolutionId)
    .single()

  if (error) {
    console.error('Error fetching variance resolution:', error)
    return null
  }

  return data
}
