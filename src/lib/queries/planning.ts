import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { WeeklySalesForecast, WeeklySalesActual, Product, Channel } from '@/lib/types/database'

/**
 * Fetch weekly sales forecasts with product and channel info
 */
export async function fetchSalesForecasts(options?: {
  yearWeekFrom?: string
  yearWeekTo?: string
  sku?: string
  channelCode?: string
}): Promise<(WeeklySalesForecast & { product_name?: string; channel_name?: string })[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('weekly_sales_forecasts')
    .select('*')
    .order('year_week', { ascending: false })

  if (options?.yearWeekFrom) {
    query = query.gte('year_week', options.yearWeekFrom)
  }
  if (options?.yearWeekTo) {
    query = query.lte('year_week', options.yearWeekTo)
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
 * Fetch weekly sales actuals with product and channel info
 */
export async function fetchSalesActuals(options?: {
  yearWeekFrom?: string
  yearWeekTo?: string
  sku?: string
  channelCode?: string
}): Promise<(WeeklySalesActual & { product_name?: string; channel_name?: string })[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('weekly_sales_actuals')
    .select('*')
    .order('year_week', { ascending: false })

  if (options?.yearWeekFrom) {
    query = query.gte('year_week', options.yearWeekFrom)
  }
  if (options?.yearWeekTo) {
    query = query.lte('year_week', options.yearWeekTo)
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
    supabase.from('weekly_sales_forecasts').select('*').eq('year_week', yearWeek),
    supabase.from('weekly_sales_actuals').select('*').eq('year_week', yearWeek),
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
    .from('weekly_sales_forecasts')
    .select('year_week')
    .order('year_week', { ascending: false })

  if (error) {
    console.error('Error fetching weeks:', error)
    return []
  }

  return [...new Set(data?.map((d) => d.year_week) || [])]
}

/**
 * Get current ISO week
 */
export function getCurrentWeek(): string {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`
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
