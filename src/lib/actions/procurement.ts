'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  PurchaseOrderInsert,
  PurchaseOrderItemInsert,
  ProductionDeliveryInsert,
} from '@/lib/types/database'

/**
 * Create a new purchase order with items
 */
export async function createPurchaseOrder(
  order: PurchaseOrderInsert,
  items: Omit<PurchaseOrderItemInsert, 'po_id'>[]
): Promise<{ success: boolean; error?: string; id?: string }> {
  const supabase = await createServerSupabaseClient()

  // Insert order
  const { data: orderData, error: orderError } = await supabase
    .from('purchase_orders')
    .insert(order)
    .select('id')
    .single()

  if (orderError) {
    return { success: false, error: orderError.message }
  }

  // Insert items
  if (items.length > 0) {
    const itemsWithPoId = items.map((item) => ({
      ...item,
      po_id: orderData.id,
    }))

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(itemsWithPoId)

    if (itemsError) {
      // Rollback order
      await supabase.from('purchase_orders').delete().eq('id', orderData.id)
      return { success: false, error: itemsError.message }
    }
  }

  revalidatePath('/procurement')
  return { success: true, id: orderData.id }
}

/**
 * Update purchase order status
 */
export async function updatePOStatus(
  id: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('purchase_orders')
    .update({ po_status: status })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/procurement')
  return { success: true }
}

/**
 * Create a production delivery
 */
export async function createDelivery(
  delivery: ProductionDeliveryInsert
): Promise<{ success: boolean; error?: string; id?: string }> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('production_deliveries')
    .insert(delivery)
    .select('id')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/procurement')
  return { success: true, id: data.id }
}

/**
 * Update delivery payment status
 */
export async function updateDeliveryPaymentStatus(
  id: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('production_deliveries')
    .update({ payment_status: status })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/procurement')
  revalidatePath('/finance')
  return { success: true }
}

/**
 * Delete a purchase order
 */
export async function deletePurchaseOrder(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/procurement')
  return { success: true }
}
