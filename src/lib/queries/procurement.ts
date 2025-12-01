import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  ProductionDelivery,
  Supplier,
  POFulfillmentView,
  PODeliveriesSummaryView,
  DeliveryDetail,
  DeliveryBySKU,
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
 * Get next PO number with date-based format
 * Format: PO{YYYYMMDD}{NN}
 * Example: PO2025120101, PO2025120102
 */
export async function getNextPONumber(orderDate?: Date): Promise<string> {
  const supabase = await createServerSupabaseClient()

  // Use provided date or current date
  const date = orderDate || new Date()
  const dateString = date.toISOString().split('T')[0] // YYYY-MM-DD format

  const { data, error } = await supabase.rpc('get_next_po_number', {
    order_date: dateString,
  })

  if (error) {
    console.error('Error generating PO number:', error)
    // Fallback: generate client-side if RPC fails
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `PO${year}${month}${day}01`
  }

  return data || `PO${dateString.replace(/-/g, '')}01`
}

/**
 * Get next delivery number with date-based format
 * Format: DLV{YYYYMMDD}{NN}
 * Example: DLV2025120101, DLV2025120102
 */
export async function getNextDeliveryNumber(deliveryDate?: Date): Promise<string> {
  const supabase = await createServerSupabaseClient()

  // Use provided date or current date
  const date = deliveryDate || new Date()
  const dateString = date.toISOString().split('T')[0] // YYYY-MM-DD format

  const { data, error } = await supabase.rpc('get_next_delivery_number', {
    delivery_date: dateString,
  })

  if (error) {
    console.error('Error generating delivery number:', error)
    // Fallback: generate client-side if RPC fails
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `DLV${year}${month}${day}01`
  }

  return data || `DLV${dateString.replace(/-/g, '')}01`
}

/**
 * Fetch deliveries by PO using database function
 */
export async function fetchDeliveriesByPOFunction(poId: string): Promise<DeliveryDetail[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_deliveries_by_po', {
    po_id_param: poId,
  })

  if (error) {
    console.error('Error fetching deliveries by PO:', error)
    return []
  }

  return data || []
}

/**
 * Fetch deliveries by SKU with optional date range
 */
export async function fetchDeliveriesBySKU(
  sku: string,
  startDate?: string,
  endDate?: string
): Promise<DeliveryBySKU[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_deliveries_by_sku', {
    sku_param: sku,
    start_date: startDate || null,
    end_date: endDate || null,
  })

  if (error) {
    console.error('Error fetching deliveries by SKU:', error)
    return []
  }

  return data || []
}

/**
 * Fetch PO deliveries summary view
 */
export async function fetchPODeliveriesSummary(): Promise<PODeliveriesSummaryView[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_po_deliveries_summary')
    .select('*')
    .order('actual_order_date', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('Error fetching PO deliveries summary:', error)
    return []
  }

  return data || []
}

/**
 * Validate PO number format
 */
export async function validatePONumberFormat(poNumber: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('validate_po_number_format', {
    po_num: poNumber,
  })

  if (error) {
    console.error('Error validating PO number:', error)
    return false
  }

  return data || false
}
