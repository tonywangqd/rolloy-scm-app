import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Chart Data Types
 */
export interface WeeklySalesTrendData {
  week_iso: string
  week_start_date: string
  forecast_qty: number
  actual_qty: number
}

export interface ChannelSalesData {
  channel_code: string
  channel_name: string
  total_sales: number
  percentage: number
  [key: string]: string | number // Index signature for Recharts compatibility
}

export interface SkuSalesRankingData {
  sku: string
  product_name: string
  total_sales: number
  forecast_total: number
  actual_total: number
}

/**
 * Fetch weekly sales trend data (last 12 weeks)
 * Combines forecast and actual sales by week
 */
export async function fetchWeeklySalesTrend(): Promise<WeeklySalesTrendData[]> {
  const supabase = await createServerSupabaseClient()

  // Get the last 12 weeks of data
  const { data: forecastData, error: forecastError } = await supabase
    .from('sales_forecasts')
    .select('week_iso, week_start_date, forecast_qty')
    .order('week_iso', { ascending: true })

  if (forecastError) {
    console.error('Error fetching forecast data:', forecastError)
    return []
  }

  const { data: actualData, error: actualError } = await supabase
    .from('sales_actuals')
    .select('week_iso, actual_qty')
    .order('week_iso', { ascending: true })

  if (actualError) {
    console.error('Error fetching actual data:', actualError)
    return []
  }

  // Group by week_iso and aggregate
  const weekMap = new Map<string, WeeklySalesTrendData>()

  // Process forecast data
  forecastData?.forEach((row) => {
    if (!weekMap.has(row.week_iso)) {
      weekMap.set(row.week_iso, {
        week_iso: row.week_iso,
        week_start_date: row.week_start_date,
        forecast_qty: 0,
        actual_qty: 0,
      })
    }
    const week = weekMap.get(row.week_iso)!
    week.forecast_qty += row.forecast_qty || 0
  })

  // Process actual data
  actualData?.forEach((row) => {
    if (!weekMap.has(row.week_iso)) {
      weekMap.set(row.week_iso, {
        week_iso: row.week_iso,
        week_start_date: '',
        forecast_qty: 0,
        actual_qty: 0,
      })
    }
    const week = weekMap.get(row.week_iso)!
    week.actual_qty += row.actual_qty || 0
  })

  // Convert to array and sort by week
  const result = Array.from(weekMap.values())
    .sort((a, b) => a.week_iso.localeCompare(b.week_iso))
    .slice(-12) // Get last 12 weeks

  return result
}

/**
 * Fetch sales distribution by channel
 * Aggregates total sales (actual + forecast) by channel
 */
export async function fetchSalesByChannel(): Promise<ChannelSalesData[]> {
  const supabase = await createServerSupabaseClient()

  // Fetch all channels
  const { data: channels } = await supabase
    .from('channels')
    .select('channel_code, channel_name')
    .eq('is_active', true)

  if (!channels || channels.length === 0) {
    return []
  }

  // Fetch actual sales by channel
  const { data: actualData } = await supabase
    .from('sales_actuals')
    .select('channel_code, actual_qty')

  // Fetch forecast sales by channel (for weeks without actuals)
  const { data: forecastData } = await supabase
    .from('sales_forecasts')
    .select('channel_code, forecast_qty')

  // Calculate total sales per channel
  const channelMap = new Map<string, number>()

  // Add actual sales
  actualData?.forEach((row) => {
    const current = channelMap.get(row.channel_code) || 0
    channelMap.set(row.channel_code, current + (row.actual_qty || 0))
  })

  // Add forecast sales (only if no actual data exists)
  forecastData?.forEach((row) => {
    const current = channelMap.get(row.channel_code) || 0
    channelMap.set(row.channel_code, current + (row.forecast_qty || 0))
  })

  // Calculate total for percentage
  const total = Array.from(channelMap.values()).reduce((sum, val) => sum + val, 0)

  // Build result with channel names
  const result: ChannelSalesData[] = channels
    .map((channel) => {
      const totalSales = channelMap.get(channel.channel_code) || 0
      return {
        channel_code: channel.channel_code,
        channel_name: channel.channel_name,
        total_sales: totalSales,
        percentage: total > 0 ? (totalSales / total) * 100 : 0,
      }
    })
    .filter((item) => item.total_sales > 0)
    .sort((a, b) => b.total_sales - a.total_sales)

  return result
}

/**
 * Fetch SKU sales ranking (top 10 SKUs by total sales)
 * Combines forecast and actual sales
 */
export async function fetchSalesBySku(): Promise<SkuSalesRankingData[]> {
  const supabase = await createServerSupabaseClient()

  // Fetch all products
  const { data: products } = await supabase
    .from('products')
    .select('sku, product_name')
    .eq('is_active', true)

  if (!products || products.length === 0) {
    return []
  }

  // Fetch actual sales by SKU
  const { data: actualData } = await supabase
    .from('sales_actuals')
    .select('sku, actual_qty')

  // Fetch forecast sales by SKU
  const { data: forecastData } = await supabase
    .from('sales_forecasts')
    .select('sku, forecast_qty')

  // Calculate totals per SKU
  const skuMap = new Map<string, { forecast: number; actual: number }>()

  // Process actual sales
  actualData?.forEach((row) => {
    if (!skuMap.has(row.sku)) {
      skuMap.set(row.sku, { forecast: 0, actual: 0 })
    }
    const sku = skuMap.get(row.sku)!
    sku.actual += row.actual_qty || 0
  })

  // Process forecast sales
  forecastData?.forEach((row) => {
    if (!skuMap.has(row.sku)) {
      skuMap.set(row.sku, { forecast: 0, actual: 0 })
    }
    const sku = skuMap.get(row.sku)!
    sku.forecast += row.forecast_qty || 0
  })

  // Build result with product names
  const result: SkuSalesRankingData[] = products
    .map((product) => {
      const sales = skuMap.get(product.sku) || { forecast: 0, actual: 0 }
      // Use actual if available, otherwise use forecast
      const totalSales = sales.actual > 0 ? sales.actual : sales.forecast

      return {
        sku: product.sku,
        product_name: product.product_name,
        total_sales: totalSales,
        forecast_total: sales.forecast,
        actual_total: sales.actual,
      }
    })
    .filter((item) => item.total_sales > 0)
    .sort((a, b) => b.total_sales - a.total_sales)
    .slice(0, 10) // Top 10 SKUs

  return result
}
