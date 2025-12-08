import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Shipment, ShipmentItem, Warehouse, WarehouseType } from '@/lib/types/database'

/**
 * Fetch all shipments with details
 */
export async function fetchShipments(): Promise<
  (Shipment & {
    warehouse_name?: string
    warehouse_code?: string
    warehouse_type?: WarehouseType
    item_count?: number
  })[]
> {
  const supabase = await createServerSupabaseClient()

  const { data: shipments, error } = await supabase
    .from('shipments')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching shipments:', error)
    return []
  }

  // Fetch warehouse details (name, code, type)
  const warehouseIds = [...new Set(shipments?.map((s) => s.destination_warehouse_id) || [])]
  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id, warehouse_name, warehouse_code, warehouse_type')
    .in('id', warehouseIds)

  const warehouseMap = new Map(warehouses?.map((w) => [w.id, {
    name: w.warehouse_name,
    code: w.warehouse_code,
    type: w.warehouse_type as WarehouseType,
  }]) || [])

  // Fetch item counts
  const shipmentIds = shipments?.map((s) => s.id) || []
  const { data: items } = await supabase
    .from('shipment_items')
    .select('shipment_id, shipped_qty')
    .in('shipment_id', shipmentIds)

  const itemCountMap = new Map<string, number>()
  items?.forEach((item) => {
    const current = itemCountMap.get(item.shipment_id) || 0
    itemCountMap.set(item.shipment_id, current + item.shipped_qty)
  })

  return (shipments || []).map((s) => {
    const warehouseInfo = warehouseMap.get(s.destination_warehouse_id)
    return {
      ...s,
      warehouse_name: warehouseInfo?.name,
      warehouse_code: warehouseInfo?.code,
      warehouse_type: warehouseInfo?.type,
      item_count: itemCountMap.get(s.id) || 0,
    }
  })
}

/**
 * Fetch a single shipment with items
 */
export async function fetchShipmentById(id: string): Promise<{
  shipment: Shipment | null
  items: ShipmentItem[]
}> {
  const supabase = await createServerSupabaseClient()

  const [shipmentResult, itemsResult] = await Promise.all([
    supabase.from('shipments').select('*').eq('id', id).single(),
    supabase.from('shipment_items').select('*').eq('shipment_id', id).order('sku'),
  ])

  return {
    shipment: shipmentResult.data,
    items: itemsResult.data || [],
  }
}

/**
 * Fetch warehouses
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
 * Get next tracking number
 */
export async function getNextTrackingNumber(): Promise<string> {
  const supabase = await createServerSupabaseClient()

  const { count } = await supabase
    .from('shipments')
    .select('*', { count: 'exact', head: true })

  const nextNumber = (count || 0) + 1
  return `SHIP-${new Date().getFullYear()}-${nextNumber.toString().padStart(4, '0')}`
}

/**
 * Fetch unshipped production deliveries
 * Shows deliveries with remaining unshipped quantity
 */
export async function fetchUnshippedDeliveries(): Promise<
  Array<{
    delivery_id: string
    delivery_number: string
    sku: string
    channel_code: string | null
    po_number: string
    batch_code: string
    supplier_name: string | null
    delivered_qty: number
    shipped_qty: number
    unshipped_qty: number
    actual_delivery_date: string | null
    days_since_delivery: number | null
    product_name: string | null
    spu: string | null
    shipment_status: string
    payment_status: string
    created_at: string
    updated_at: string
  }>
> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_unshipped_deliveries')
    .select('*')
    .order('actual_delivery_date', { ascending: false })
    .order('delivery_number', { ascending: false })

  if (error) {
    console.error('Error fetching unshipped deliveries:', error)
    return []
  }

  return data || []
}

/**
 * Fetch delivery allocations (shipment history for a delivery)
 * Shows which shipments this delivery has been allocated to
 */
export async function fetchDeliveryAllocations(deliveryId: string): Promise<
  Array<{
    shipment_id: string
    tracking_number: string
    shipped_qty: number
    allocated_at: string
    actual_departure_date: string | null
    planned_arrival_date: string | null
    actual_arrival_date: string | null
    remarks: string | null
  }>
> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_delivery_allocations', {
    p_delivery_id: deliveryId,
  })

  if (error) {
    console.error('Error fetching delivery allocations:', error)
    return []
  }

  return data || []
}

/**
 * Fetch shipment source deliveries (delivery sources for a shipment)
 * Shows which deliveries were combined into this shipment
 */
export async function fetchShipmentSourceDeliveries(shipmentId: string): Promise<
  Array<{
    delivery_id: string
    delivery_number: string
    po_number: string
    batch_code: string
    sku: string
    shipped_qty: number
    delivered_qty: number
    delivery_date: string | null
    supplier_name: string | null
    remarks: string | null
  }>
> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_shipment_source_deliveries', {
    p_shipment_id: shipmentId,
  })

  if (error) {
    console.error('Error fetching shipment source deliveries:', error)
    return []
  }

  return data || []
}
