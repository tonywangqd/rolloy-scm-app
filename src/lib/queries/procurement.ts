import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  ProductionDelivery,
  Supplier,
  POFulfillmentView,
} from '@/lib/types/database'

/**
 * Fetch all purchase orders with fulfillment status
 */
export async function fetchPurchaseOrders(): Promise<POFulfillmentView[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_po_fulfillment')
    .select('*')
    .order('actual_order_date', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('Error fetching purchase orders:', error)
    return []
  }

  return data || []
}

/**
 * Fetch a single purchase order with items
 */
export async function fetchPurchaseOrderById(id: string): Promise<{
  order: PurchaseOrder | null
  items: PurchaseOrderItem[]
}> {
  const supabase = await createServerSupabaseClient()

  const [orderResult, itemsResult] = await Promise.all([
    supabase.from('purchase_orders').select('*').eq('id', id).single(),
    supabase.from('purchase_order_items').select('*').eq('po_id', id).order('sku'),
  ])

  return {
    order: orderResult.data,
    items: itemsResult.data || [],
  }
}

/**
 * Fetch production deliveries for a PO
 */
export async function fetchDeliveriesByPO(poId: string): Promise<ProductionDelivery[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('production_deliveries')
    .select('*')
    .eq('po_item_id', poId)
    .order('actual_delivery_date', { ascending: false })

  if (error) {
    console.error('Error fetching deliveries:', error)
    return []
  }

  return data || []
}

/**
 * Fetch all production deliveries
 */
export async function fetchAllDeliveries(): Promise<ProductionDelivery[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('production_deliveries')
    .select('*')
    .order('actual_delivery_date', { ascending: false })

  if (error) {
    console.error('Error fetching deliveries:', error)
    return []
  }

  return data || []
}

/**
 * Fetch all suppliers
 */
export async function fetchSuppliers(): Promise<Supplier[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_active', true)
    .order('supplier_name')

  if (error) {
    console.error('Error fetching suppliers:', error)
    return []
  }

  return data || []
}

/**
 * Get next PO number
 */
export async function getNextPONumber(): Promise<string> {
  const supabase = await createServerSupabaseClient()

  const { count } = await supabase
    .from('purchase_orders')
    .select('*', { count: 'exact', head: true })

  const nextNumber = (count || 0) + 1
  const year = new Date().getFullYear()
  return `PO-${year}-${nextNumber.toString().padStart(4, '0')}`
}

/**
 * Get next delivery number
 */
export async function getNextDeliveryNumber(): Promise<string> {
  const supabase = await createServerSupabaseClient()

  const { count } = await supabase
    .from('production_deliveries')
    .select('*', { count: 'exact', head: true })

  const nextNumber = (count || 0) + 1
  const year = new Date().getFullYear()
  return `DLV-${year}-${nextNumber.toString().padStart(4, '0')}`
}
