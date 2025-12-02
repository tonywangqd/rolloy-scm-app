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
