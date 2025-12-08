import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  DashboardKPIs,
  InventorySummaryView,
  PendingPayablesView,
  Product,
  Channel,
  Warehouse,
  InventoryProjection12WeeksView
} from '@/lib/types/database'

/**
 * Fetch dashboard KPIs
 */
export async function fetchDashboardKPIs(): Promise<DashboardKPIs> {
  const supabase = await createServerSupabaseClient()

  // Fetch inventory summary
  const { data: inventoryData } = await supabase
    .from('v_inventory_summary')
    .select('*')

  // Fetch pending payables for next month
  const { data: payablesData } = await supabase
    .from('v_pending_payables')
    .select('*')

  // Fetch active suggestions count
  const { count: suggestionsCount } = await supabase
    .from('replenishment_suggestions')
    .select('*', { count: 'exact', head: true })
    .eq('suggestion_status', 'Active')

  // Fetch risk SKU count (from projections)
  const { count: riskCount } = await supabase
    .from('inventory_projections')
    .select('*', { count: 'exact', head: true })
    .in('stock_status', ['Risk', 'Stockout'])

  // Calculate totals
  const inventory = (inventoryData || []) as InventorySummaryView[]
  const totalStock = inventory.reduce((sum, item) => sum + (item.total_stock || 0), 0)
  const totalStockValue = inventory.reduce((sum, item) => sum + (item.stock_value_usd || 0), 0)

  // Calculate next month payables
  const payables = (payablesData || []) as PendingPayablesView[]
  const nextMonthPayables = payables.reduce((sum, item) => sum + (item.total_amount_usd || 0), 0)

  return {
    total_stock: totalStock,
    total_stock_value: totalStockValue,
    risk_sku_count: riskCount || 0,
    pending_suggestions: suggestionsCount || 0,
    next_month_payables: nextMonthPayables,
  }
}

/**
 * Fetch inventory summary view
 */
export async function fetchInventorySummary(): Promise<InventorySummaryView[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_inventory_summary')
    .select('*')
    .order('sku')

  if (error) {
    console.error('Error fetching inventory summary:', error)
    return []
  }

  return data || []
}

/**
 * Fetch pending payables
 */
export async function fetchPendingPayables(): Promise<PendingPayablesView[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_pending_payables')
    .select('*')
    .order('payment_month')

  if (error) {
    console.error('Error fetching pending payables:', error)
    return []
  }

  return data || []
}

/**
 * Fetch all products
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
 * Fetch all channels
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

/**
 * Fetch all warehouses
 */
export async function fetchWarehouses(): Promise<Warehouse[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .order('warehouse_code')

  if (error) {
    console.error('Error fetching warehouses:', error)
    return []
  }

  return data || []
}

/**
 * Fetch master data counts for dashboard
 */
export async function fetchMasterDataCounts(): Promise<{
  products: number
  channels: number
  warehouses: number
  suppliers: number
}> {
  const supabase = await createServerSupabaseClient()

  const [products, channels, warehouses, suppliers] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('channels').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('warehouses').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])

  return {
    products: products.count || 0,
    channels: channels.count || 0,
    warehouses: warehouses.count || 0,
    suppliers: suppliers.count || 0,
  }
}

/**
 * Fetch stock risk alerts for dashboard
 * Returns SKUs that will face stockouts or risks within the next 3 weeks
 *
 * Note: This function refreshes the materialized view before querying
 * to ensure data is always up-to-date
 */
export async function fetchStockRiskAlerts(): Promise<InventoryProjection12WeeksView[]> {
  const supabase = await createServerSupabaseClient()

  // Refresh the materialized view to ensure fresh data
  try {
    await supabase.rpc('refresh_inventory_projections')
  } catch (refreshError) {
    console.warn('Failed to refresh inventory projections:', refreshError)
    // Continue with potentially stale data
  }

  const { data, error } = await supabase
    .from('v_inventory_projection_12weeks')
    .select('*')
    .in('stock_status', ['Stockout', 'Risk'])
    .lte('week_offset', 3)
    .order('week_offset', { ascending: true })
    .order('stock_status', { ascending: true }) // Stockout first, then Risk
    .limit(10)

  if (error) {
    console.error('Error fetching stock risk alerts:', error)
    return []
  }

  return data || []
}
