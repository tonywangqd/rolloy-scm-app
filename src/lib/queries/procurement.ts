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
 * Fetch complete purchase order details with supplier and deliveries
 */
export async function fetchPurchaseOrderDetails(id: string): Promise<{
  order: PurchaseOrder | null
  supplier: Supplier | null
  items: PurchaseOrderItem[]
  deliveries: DeliveryDetail[]
}> {
  const supabase = await createServerSupabaseClient()

  // Fetch order first
  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', id)
    .single()

  if (orderError || !order) {
    return {
      order: null,
      supplier: null,
      items: [],
      deliveries: [],
    }
  }

  // Fetch related data in parallel
  const [itemsResult, supplierResult, deliveriesResult] = await Promise.all([
    supabase.from('purchase_order_items').select('*').eq('po_id', id).order('sku'),
    order.supplier_id
      ? supabase.from('suppliers').select('*').eq('id', order.supplier_id).single()
      : Promise.resolve({ data: null, error: null }),
    supabase.rpc('get_deliveries_by_po', { po_id_param: id }),
  ])

  return {
    order,
    supplier: supplierResult.data,
    items: itemsResult.data || [],
    deliveries: deliveriesResult.data || [],
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

/**
 * Fetch delivery record with context for editing
 * Returns delivery + PO + item constraints
 */
export async function fetchDeliveryForEdit(
  deliveryId: string
): Promise<{ data: import('@/lib/types/database').DeliveryEditContext | null; error: string | null }> {
  try {
    const supabase = await createServerSupabaseClient()

    // Query delivery with related data
    const { data: delivery, error: deliveryError } = await supabase
      .from('production_deliveries')
      .select(`
        *,
        po_item:purchase_order_items!inner(
          id,
          po_id,
          ordered_qty,
          delivered_qty,
          po:purchase_orders!inner(
            id,
            po_number,
            batch_code,
            supplier:suppliers(supplier_name)
          )
        )
      `)
      .eq('id', deliveryId)
      .single()

    if (deliveryError || !delivery) {
      return {
        data: null,
        error: deliveryError?.message || 'Delivery not found',
      }
    }

    // Calculate other deliveries qty (excluding current delivery)
    const { data: otherDeliveries, error: otherError } = await supabase
      .from('production_deliveries')
      .select('delivered_qty')
      .eq('po_item_id', delivery.po_item_id)
      .neq('id', deliveryId)

    if (otherError) {
      return { data: null, error: otherError.message }
    }

    const otherDeliveriesQty = otherDeliveries?.reduce(
      (sum, d) => sum + d.delivered_qty,
      0
    ) || 0

    const maxAllowedQty = delivery.po_item.ordered_qty - otherDeliveriesQty

    return {
      data: {
        delivery,
        po: {
          id: delivery.po_item.po.id,
          po_number: delivery.po_item.po.po_number,
          batch_code: delivery.po_item.po.batch_code,
          supplier_name: delivery.po_item.po.supplier?.supplier_name || null,
        },
        po_item: {
          id: delivery.po_item.id,
          ordered_qty: delivery.po_item.ordered_qty,
          delivered_qty: delivery.po_item.delivered_qty,
        },
        other_deliveries_qty: otherDeliveriesQty,
        max_allowed_qty: maxAllowedQty,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Fetch remaining delivery summary for procurement dashboard
 * Returns aggregated data about pending deliveries
 */
export async function fetchRemainingDeliverySummary(): Promise<import('@/lib/types/database').RemainingDeliverySummary> {
  const supabase = await createServerSupabaseClient()

  // Fetch all incomplete PO items with their planned deliveries
  const { data: poItems, error: poError } = await supabase
    .from('purchase_order_items')
    .select(`
      id,
      sku,
      ordered_qty,
      delivered_qty,
      po:purchase_orders!inner(
        id,
        po_status,
        actual_order_date
      )
    `)
    .in('po.po_status', ['Draft', 'Confirmed', 'In Production'])
    .gt('ordered_qty', 0)

  if (poError || !poItems) {
    console.error('Error fetching PO items:', poError)
    return {
      totalRemainingQty: 0,
      totalPendingPOs: 0,
      totalPendingSKUs: 0,
      weeklyPlan: [],
      overdueCount: 0,
    }
  }

  // Calculate total remaining quantity and pending SKUs
  let totalRemainingQty = 0
  const pendingPOIds = new Set<string>()
  const pendingSKUs = new Set<string>()
  const poOrderDates = new Map<string, string>()

  for (const item of poItems) {
    const remaining = item.ordered_qty - item.delivered_qty
    if (remaining > 0) {
      totalRemainingQty += remaining
      // Type assertion: po is a single object, not an array
      const po = Array.isArray(item.po) ? item.po[0] : item.po
      if (po) {
        pendingPOIds.add(po.id)
        pendingSKUs.add(item.sku)
        if (po.actual_order_date) {
          poOrderDates.set(po.id, po.actual_order_date)
        }
      }
    }
  }

  // Calculate overdue count (orders placed > 30 days ago)
  const now = new Date()
  let overdueCount = 0
  for (const [poId, orderDate] of poOrderDates.entries()) {
    const orderTime = new Date(orderDate).getTime()
    const daysSinceOrder = (now.getTime() - orderTime) / (1000 * 60 * 60 * 24)
    if (daysSinceOrder > 30) {
      overdueCount++
    }
  }

  // Fetch planned deliveries grouped by week
  const { data: plannedDeliveries, error: deliveryError } = await supabase
    .from('production_deliveries')
    .select('planned_delivery_date, delivered_qty')
    .not('planned_delivery_date', 'is', null)
    .is('actual_delivery_date', null) // Only pending deliveries

  if (deliveryError) {
    console.error('Error fetching planned deliveries:', deliveryError)
  }

  // Group planned deliveries by week
  const weeklyPlanMap = new Map<string, { planned_qty: number; delivery_count: number; week_start_date: string }>()

  if (plannedDeliveries) {
    for (const delivery of plannedDeliveries) {
      if (delivery.planned_delivery_date) {
        const date = new Date(delivery.planned_delivery_date)
        // Calculate ISO week
        const yearStart = new Date(date.getFullYear(), 0, 1)
        const weekNumber = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7)
        const weekIso = `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`

        // Get Monday of the week
        const dayOfWeek = date.getDay()
        const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
        const monday = new Date(date.setDate(diff))
        const weekStartDate = monday.toISOString().split('T')[0]

        const existing = weeklyPlanMap.get(weekIso) || { planned_qty: 0, delivery_count: 0, week_start_date: weekStartDate }
        existing.planned_qty += delivery.delivered_qty
        existing.delivery_count += 1
        weeklyPlanMap.set(weekIso, existing)
      }
    }
  }

  // Convert map to array and sort by week
  const weeklyPlan = Array.from(weeklyPlanMap.entries())
    .map(([week_iso, data]) => ({
      week_iso,
      week_start_date: data.week_start_date,
      planned_qty: data.planned_qty,
      delivery_count: data.delivery_count,
    }))
    .sort((a, b) => a.week_iso.localeCompare(b.week_iso))

  return {
    totalRemainingQty,
    totalPendingPOs: pendingPOIds.size,
    totalPendingSKUs: pendingSKUs.size,
    weeklyPlan,
    overdueCount,
  }
}
