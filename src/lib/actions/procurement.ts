'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import type {
  PurchaseOrderInsert,
  PurchaseOrderItemInsert,
  ProductionDeliveryInsert,
} from '@/lib/types/database'
import {
  purchaseOrderInsertSchema,
  purchaseOrderItemInsertSchema,
  productionDeliveryInsertSchema,
  poStatusSchema,
  paymentStatusSchema,
  deleteByIdSchema,
} from '@/lib/validations'
import { z } from 'zod'

/**
 * Create a new purchase order with items
 * Uses atomic RPC function to ensure data consistency
 */
export async function createPurchaseOrder(
  order: PurchaseOrderInsert,
  items: Omit<PurchaseOrderItemInsert, 'po_id'>[]
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    // Validate order
    const orderValidation = purchaseOrderInsertSchema.safeParse(order)
    if (!orderValidation.success) {
      return {
        success: false,
        error: `Order validation error: ${orderValidation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      }
    }

    // Validate items
    const itemsSchema = z.array(purchaseOrderItemInsertSchema.omit({ po_id: true })).min(1)
    const itemsValidation = itemsSchema.safeParse(items)
    if (!itemsValidation.success) {
      return {
        success: false,
        error: `Items validation error: ${itemsValidation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // Convert items to JSONB format expected by the function
    const itemsJson = itemsValidation.data.map((item) => ({
      sku: item.sku,
      channel_code: item.channel_code || null,
      ordered_qty: item.ordered_qty,
      unit_price_usd: item.unit_price_usd,
      delivered_qty: item.delivered_qty || 0,
    }))

    // Call RPC function for atomic operation
    const { data, error } = await supabase.rpc('create_purchase_order_with_items', {
      p_po_number: orderValidation.data.po_number,
      p_batch_code: orderValidation.data.batch_code,
      p_supplier_id: orderValidation.data.supplier_id || null,
      p_planned_order_date: orderValidation.data.planned_order_date || null,
      p_actual_order_date: orderValidation.data.actual_order_date || null,
      p_planned_ship_date: orderValidation.data.planned_ship_date || null,
      p_po_status: orderValidation.data.po_status || 'Draft',
      p_remarks: orderValidation.data.remarks || null,
      p_items: itemsJson,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    // Check RPC function result
    if (!data || data.length === 0) {
      return { success: false, error: 'No response from database function' }
    }

    const result = data[0]
    if (!result.success) {
      return { success: false, error: result.error_message || 'Unknown error' }
    }

    revalidatePath('/procurement')
    return { success: true, id: result.po_id }
  } catch (err) {
    return {
      success: false,
      error: `Failed to create purchase order: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Update purchase order status
 */
export async function updatePOStatus(
  id: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  // Validate ID
  const idValidation = deleteByIdSchema.safeParse({ id })
  if (!idValidation.success) {
    return {
      success: false,
      error: `Validation error: ${idValidation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  // Validate status
  const statusValidation = poStatusSchema.safeParse(status)
  if (!statusValidation.success) {
    return {
      success: false,
      error: `Validation error: ${statusValidation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('purchase_orders')
    .update({ po_status: statusValidation.data })
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
  // Validate input
  const validation = productionDeliveryInsertSchema.safeParse(delivery)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('production_deliveries')
    .insert(validation.data)
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
  // Validate ID
  const idValidation = deleteByIdSchema.safeParse({ id })
  if (!idValidation.success) {
    return {
      success: false,
      error: `Validation error: ${idValidation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  // Validate status
  const statusValidation = paymentStatusSchema.safeParse(status)
  if (!statusValidation.success) {
    return {
      success: false,
      error: `Validation error: ${statusValidation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('production_deliveries')
    .update({ payment_status: statusValidation.data })
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
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const validation = deleteByIdSchema.safeParse({ id })
    if (!validation.success) {
      return {
        success: false,
        error: `Validation error: ${validation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

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
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete purchase order: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
