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

    const poId = result.po_id

    // Auto-allocate forecasts for each PO item
    try {
      // Fetch PO items that were just created
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('id, sku, channel_code, ordered_qty')
        .eq('po_id', poId)

      if (poItems && poItems.length > 0) {
        // Auto-allocate each item to matching forecasts
        for (const item of poItems) {
          try {
            await supabase.rpc('auto_allocate_forecast_to_po_item', {
              p_po_item_id: item.id,
              p_allocated_by: null, // System allocation
            })
          } catch (allocError) {
            // Log but don't fail the PO creation
            console.warn(`Auto-allocation failed for PO item ${item.id}:`, allocError)
          }
        }
      }
    } catch (autoAllocError) {
      // Log but don't fail the PO creation
      console.warn('Auto-allocation post-processing failed:', autoAllocError)
    }

    revalidatePath('/procurement')
    revalidatePath('/planning/forecast-coverage')
    return { success: true, id: poId }
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
 * Update purchase order details
 */
export async function updatePurchaseOrder(
  id: string,
  updates: {
    batch_code?: string
    planned_order_date?: string | null
    actual_order_date?: string | null
    planned_ship_date?: string | null
    po_status?: string
    remarks?: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const idValidation = deleteByIdSchema.safeParse({ id })
    if (!idValidation.success) {
      return {
        success: false,
        error: `Validation error: ${idValidation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    // Validate status if provided
    if (updates.po_status) {
      const statusValidation = poStatusSchema.safeParse(updates.po_status)
      if (!statusValidation.success) {
        return {
          success: false,
          error: `Status validation error: ${statusValidation.error.issues.map((e) => e.message).join(', ')}`,
        }
      }
    }

    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('purchase_orders')
      .update({
        ...(updates.batch_code !== undefined && { batch_code: updates.batch_code }),
        ...(updates.planned_order_date !== undefined && { planned_order_date: updates.planned_order_date }),
        ...(updates.actual_order_date !== undefined && { actual_order_date: updates.actual_order_date }),
        ...(updates.planned_ship_date !== undefined && { planned_ship_date: updates.planned_ship_date }),
        ...(updates.po_status !== undefined && { po_status: updates.po_status }),
        ...(updates.remarks !== undefined && { remarks: updates.remarks }),
      })
      .eq('id', id)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/procurement')
    revalidatePath(`/procurement/${id}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: `Failed to update purchase order: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
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

    // Step 1: Get all PO items for this PO
    const { data: poItems, error: poItemsError } = await supabase
      .from('purchase_order_items')
      .select('id')
      .eq('po_id', id)

    if (poItemsError) {
      return { success: false, error: `获取订单明细失败: ${poItemsError.message}` }
    }

    // Step 2: Delete all production deliveries linked to these PO items
    if (poItems && poItems.length > 0) {
      const poItemIds = poItems.map((item) => item.id)

      // Check if any deliveries have been paid
      const { data: paidDeliveries, error: checkError } = await supabase
        .from('production_deliveries')
        .select('id, delivery_number, payment_status')
        .in('po_item_id', poItemIds)
        .eq('payment_status', 'Paid')

      if (checkError) {
        return { success: false, error: `检查交货记录失败: ${checkError.message}` }
      }

      if (paidDeliveries && paidDeliveries.length > 0) {
        return {
          success: false,
          error: `无法删除：有 ${paidDeliveries.length} 条已付款的交货记录。请先联系财务处理。`,
        }
      }

      // Delete all production deliveries for these PO items
      const { error: deleteDeliveriesError } = await supabase
        .from('production_deliveries')
        .delete()
        .in('po_item_id', poItemIds)

      if (deleteDeliveriesError) {
        return { success: false, error: `删除交货记录失败: ${deleteDeliveriesError.message}` }
      }
    }

    // Step 3: Delete all forecast allocations linked to these PO items
    if (poItems && poItems.length > 0) {
      const poItemIds = poItems.map((item) => item.id)
      await supabase
        .from('forecast_order_allocations')
        .delete()
        .in('po_item_id', poItemIds)
    }

    // Step 4: Delete all PO items (this will cascade automatically if FK is set up)
    const { error: deleteItemsError } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('po_id', id)

    if (deleteItemsError) {
      return { success: false, error: `删除订单明细失败: ${deleteItemsError.message}` }
    }

    // Step 5: Delete the purchase order itself
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

/**
 * Update production delivery record
 * Performs cascade updates to purchase_order_items.delivered_qty
 * Logs changes to audit trail
 */
export async function updateDelivery(
  deliveryId: string,
  updates: import('@/lib/types/database').ProductionDeliveryUpdate
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // 1. Authentication check
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const userId = authResult.user?.id

    // 2. Validate input
    const deliveryUpdateSchema = z.object({
      delivered_qty: z.number().int().positive().optional(),
      actual_delivery_date: z.string().optional(), // ISO date string
      unit_cost_usd: z.number().positive().max(10000).optional(),
      payment_status: z.enum(['Pending', 'Scheduled', 'Paid']).optional(),
      remarks: z.string().max(500).nullable().optional(),
    })

    const validation = deliveryUpdateSchema.safeParse(updates)
    if (!validation.success) {
      return {
        success: false,
        error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // 3. Fetch current delivery + constraints
    const { data: currentDelivery, error: fetchError } = await supabase
      .from('production_deliveries')
      .select(`
        *,
        po_item:purchase_order_items!inner(id, po_id, ordered_qty, delivered_qty)
      `)
      .eq('id', deliveryId)
      .single()

    if (fetchError || !currentDelivery) {
      return { success: false, error: 'Delivery not found' }
    }

    // 4. Calculate other deliveries qty (ONLY actual deliveries, not planned)
    const { data: otherDeliveries } = await supabase
      .from('production_deliveries')
      .select('delivered_qty')
      .eq('po_item_id', currentDelivery.po_item_id)
      .neq('id', deliveryId)
      .not('actual_delivery_date', 'is', null) // CRITICAL: Only count actual deliveries

    const otherDeliveriesQty = otherDeliveries?.reduce(
      (sum, d) => sum + d.delivered_qty,
      0
    ) || 0

    // 5. Business rule validation
    if (updates.delivered_qty !== undefined) {
      const maxAllowed = currentDelivery.po_item.ordered_qty - otherDeliveriesQty

      if (updates.delivered_qty > maxAllowed) {
        return {
          success: false,
          error: `交付数量不能超过订单剩余量。订单量: ${currentDelivery.po_item.ordered_qty}, 其他交付: ${otherDeliveriesQty}, 最大允许: ${maxAllowed}`,
        }
      }
    }

    if (updates.actual_delivery_date !== undefined && updates.actual_delivery_date !== null) {
      const deliveryDate = new Date(updates.actual_delivery_date)
      const today = new Date()
      today.setHours(23, 59, 59, 999) // Set to end of today
      if (deliveryDate > today) {
        return { success: false, error: '交付日期不能是未来日期' }
      }
    }

    // 6. Prepare changed fields for audit log
    const changedFields: Record<string, { old: any; new: any }> = {}
    Object.keys(updates).forEach((key) => {
      const oldValue = currentDelivery[key]
      const newValue = updates[key as keyof import('@/lib/types/database').ProductionDeliveryUpdate]
      if (oldValue !== newValue && newValue !== undefined) {
        changedFields[key] = { old: oldValue, new: newValue }
      }
    })

    if (Object.keys(changedFields).length === 0) {
      return { success: false, error: '没有任何更改' }
    }

    // 7. Update delivery
    const { data: updatedDelivery, error: updateError } = await supabase
      .from('production_deliveries')
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
      .select()
      .single()

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // 8. Calculate new total delivered qty (PERFORMANCE OPTIMIZATION)
    // Instead of re-querying the database, calculate from Step 4 results + current update
    // Formula: newTotal = otherDeliveriesQty + (updated delivered_qty OR original delivered_qty)
    const newTotalDeliveredQty = otherDeliveriesQty + (
      updates.delivered_qty !== undefined
        ? updates.delivered_qty
        : currentDelivery.delivered_qty
    )

    // 9. Execute PO item update and audit log in parallel (PERFORMANCE OPTIMIZATION)
    const now = new Date().toISOString()
    const [poItemResult, auditResult] = await Promise.all([
      // Update PO item delivered_qty
      supabase
        .from('purchase_order_items')
        .update({
          delivered_qty: newTotalDeliveredQty,
          updated_at: now,
        })
        .eq('id', currentDelivery.po_item_id),

      // Insert audit log
      supabase
        .from('delivery_edit_audit_log')
        .insert({
          delivery_id: deliveryId,
          changed_by: userId || null,
          changed_at: now,
          changed_fields: changedFields,
          change_reason: updates.remarks || null,
        }),
    ])

    if (poItemResult.error) {
      console.error('Failed to update PO item delivered_qty:', poItemResult.error)
      return {
        success: false,
        error: 'Cascade update failed. Please contact support.',
      }
    }

    if (auditResult.error) {
      console.error('Failed to log audit trail:', auditResult.error)
      // Don't fail the request if audit log fails, but log it
    }

    // 10. Revalidate cache
    revalidatePath('/procurement')
    revalidatePath(`/procurement/${currentDelivery.po_item.po_id}`)

    return { success: true, data: updatedDelivery }
  } catch (err) {
    return {
      success: false,
      error: `Failed to update delivery: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Delete production delivery record
 * Business Rules:
 * 1. Only allowed if payment_status = 'Pending'
 * 2. Cannot delete if delivery is associated with any shipment_items
 * 3. When deleting an actual delivery, automatically delete all planned deliveries for the same PO item
 * 4. Returns remaining undelivered quantity after deletion
 */
export async function deleteDelivery(
  deliveryId: string
): Promise<{ success: boolean; error?: string; data?: { remainingQty: number } }> {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    // Check current delivery status and get PO item info
    const { data: delivery, error: fetchError } = await supabase
      .from('production_deliveries')
      .select(`
        payment_status,
        po_item_id,
        delivered_qty,
        actual_delivery_date
      `)
      .eq('id', deliveryId)
      .single()

    if (fetchError || !delivery) {
      return { success: false, error: 'Delivery not found' }
    }

    // Get PO item info
    const { data: poItem, error: poItemError } = await supabase
      .from('purchase_order_items')
      .select('id, ordered_qty, delivered_qty')
      .eq('id', delivery.po_item_id)
      .single()

    if (poItemError || !poItem) {
      return { success: false, error: 'PO item not found' }
    }

    // Business rule 1: Only allow delete if payment is pending
    if (delivery.payment_status !== 'Pending') {
      return {
        success: false,
        error: '只能删除付款状态为"待支付"的交付记录',
      }
    }

    // Business rule 2: Check if delivery is associated with any shipments
    const { data: shipmentLinks, error: shipmentCheckError } = await supabase
      .from('shipment_items')
      .select('id')
      .eq('production_delivery_id', deliveryId)
      .limit(1)

    if (shipmentCheckError) {
      return {
        success: false,
        error: `检查发货关联失败: ${shipmentCheckError.message}`
      }
    }

    if (shipmentLinks && shipmentLinks.length > 0) {
      return {
        success: false,
        error: '无法删除：该交货记录已关联到发货单，请先取消关联',
      }
    }

    // Business rule 3: If this is an actual delivery, also delete all planned deliveries for the same PO item
    if (delivery.actual_delivery_date) {
      const { error: deletePlannedError } = await supabase
        .from('production_deliveries')
        .delete()
        .eq('po_item_id', delivery.po_item_id)
        .is('actual_delivery_date', null) // Delete only planned deliveries
        .not('planned_delivery_date', 'is', null) // Ensure it has planned_delivery_date

      if (deletePlannedError) {
        console.error('Failed to delete planned deliveries:', deletePlannedError)
        // Don't fail the whole operation, just log it
      }
    }

    // Delete the actual delivery
    const { error: deleteError } = await supabase
      .from('production_deliveries')
      .delete()
      .eq('id', deliveryId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Recalculate PO item delivered_qty (ONLY actual deliveries, not planned)
    const { data: remainingDeliveries } = await supabase
      .from('production_deliveries')
      .select('delivered_qty')
      .eq('po_item_id', delivery.po_item_id)
      .not('actual_delivery_date', 'is', null) // CRITICAL: Only count actual deliveries

    const newTotalDeliveredQty = remainingDeliveries?.reduce(
      (sum, d) => sum + d.delivered_qty,
      0
    ) || 0

    // Calculate remaining undelivered quantity
    const remainingQty = poItem.ordered_qty - newTotalDeliveredQty

    // Update PO item delivered_qty
    await supabase
      .from('purchase_order_items')
      .update({
        delivered_qty: newTotalDeliveredQty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.po_item_id)

    revalidatePath('/procurement')

    // Return remaining quantity for frontend display
    return {
      success: true,
      data: { remainingQty }
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete delivery: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
