import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Product, Channel, Warehouse, Supplier } from '@/lib/types/database'

/**
 * Fetch all products
 */
export async function fetchAllProducts(): Promise<Product[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('products')
    .select('*')
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
export async function fetchAllChannels(): Promise<Channel[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('channels')
    .select('*')
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
export async function fetchAllWarehouses(): Promise<Warehouse[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .order('warehouse_code')

  if (error) {
    console.error('Error fetching warehouses:', error)
    return []
  }

  return data || []
}

/**
 * Fetch all suppliers
 */
export async function fetchAllSuppliers(): Promise<Supplier[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('supplier_code')

  if (error) {
    console.error('Error fetching suppliers:', error)
    return []
  }

  return data || []
}

/**
 * Get master data counts
 */
export async function getMasterDataCounts(): Promise<{
  products: number
  channels: number
  warehouses: number
  suppliers: number
}> {
  const supabase = await createServerSupabaseClient()

  const [productsResult, channelsResult, warehousesResult, suppliersResult] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('channels').select('*', { count: 'exact', head: true }),
    supabase.from('warehouses').select('*', { count: 'exact', head: true }),
    supabase.from('suppliers').select('*', { count: 'exact', head: true }),
  ])

  return {
    products: productsResult.count || 0,
    channels: channelsResult.count || 0,
    warehouses: warehousesResult.count || 0,
    suppliers: suppliersResult.count || 0,
  }
}
