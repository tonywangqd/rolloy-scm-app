'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import type { PaymentStatus, Region } from '@/lib/types/database'
import { shipmentInsertSchema, shipmentItemInsertSchema, paymentStatusSchema, deleteByIdSchema } from '@/lib/validations'
import { z } from 'zod'

interface ShipmentData {
  tracking_number: string
  batch_code: string | null
  logistics_batch_code: string | null
  destination_warehouse_id: string
  customs_clearance: boolean
  logistics_plan: string | null
  logistics_region: Region | null
  planned_departure_date: string | null
  actual_departure_date: string | null
  planned_arrival_days: number | null
  planned_arrival_date: string | null
  actual_arrival_date: string | null
  weight_kg: number | null
  unit_count: number | null
  cost_per_kg_usd: number | null
  surcharge_usd: number
  tax_refund_usd: number
  remarks: string | null
}

interface ShipmentItemData {
  sku: string
  shipped_qty: number
}

/**
 * Create a new shipment with items
 * Uses atomic RPC function to ensure data consistency
 */
export async function createShipment(
  shipmentData: ShipmentData,
  items: ShipmentItemData[]
): Promise<{ success: boolean; error?: string; data?: { id: string } }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate shipment data
    const shipmentValidation = shipmentInsertSchema.safeParse(shipmentData)
    if (!shipmentValidation.success) {
      return {
        success: false,
        error: `Shipment validation error: ${shipmentValidation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      }
    }

    // Validate items
    const itemsSchema = z.array(shipmentItemInsertSchema.omit({ id: true, shipment_id: true })).min(1)
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
      shipped_qty: item.shipped_qty,
    }))

    // Call RPC function for atomic operation
    const { data, error } = await supabase.rpc('create_shipment_with_items', {
      p_tracking_number: shipmentValidation.data.tracking_number,
      p_batch_code: shipmentValidation.data.batch_code || null,
      p_logistics_batch_code: shipmentValidation.data.logistics_batch_code || null,
      p_destination_warehouse_id: shipmentValidation.data.destination_warehouse_id,
      p_customs_clearance: shipmentValidation.data.customs_clearance,
      p_logistics_plan: shipmentValidation.data.logistics_plan || null,
      p_logistics_region: shipmentValidation.data.logistics_region || null,
      p_planned_departure_date: shipmentValidation.data.planned_departure_date || null,
      p_actual_departure_date: shipmentValidation.data.actual_departure_date || null,
      p_planned_arrival_days: shipmentValidation.data.planned_arrival_days || null,
      p_planned_arrival_date: shipmentValidation.data.planned_arrival_date || null,
      p_actual_arrival_date: shipmentValidation.data.actual_arrival_date || null,
      p_weight_kg: shipmentValidation.data.weight_kg || null,
      p_unit_count: shipmentValidation.data.unit_count || null,
      p_cost_per_kg_usd: shipmentValidation.data.cost_per_kg_usd || null,
      p_surcharge_usd: shipmentValidation.data.surcharge_usd || 0,
      p_tax_refund_usd: shipmentValidation.data.tax_refund_usd || 0,
      p_remarks: shipmentValidation.data.remarks || null,
      p_items: itemsJson,
    })

    if (error) {
      console.error('Error creating shipment:', error)
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

    revalidatePath('/logistics')
    return { success: true, data: { id: result.shipment_id } }
  } catch (error) {
    console.error('Error creating shipment:', error)
    return { success: false, error: 'Failed to create shipment' }
  }
}

/**
 * Update shipment payment status
 */
export async function updateShipmentPaymentStatus(
  shipmentId: string,
  newStatus: PaymentStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const idValidation = deleteByIdSchema.safeParse({ id: shipmentId })
    if (!idValidation.success) {
      return {
        success: false,
        error: `Validation error: ${idValidation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    // Validate status
    const statusValidation = paymentStatusSchema.safeParse(newStatus)
    if (!statusValidation.success) {
      return {
        success: false,
        error: `Validation error: ${statusValidation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('shipments')
      .update({ payment_status: statusValidation.data })
      .eq('id', shipmentId)

    if (error) {
      console.error('Error updating payment status:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/logistics')
    return { success: true }
  } catch (error) {
    console.error('Error updating payment status:', error)
    return { success: false, error: 'Failed to update payment status' }
  }
}

/**
 * Update an existing shipment (excluding items)
 * Items cannot be edited - they must be deleted and recreated
 * Enhanced with arrival status validation
 */
export async function updateShipment(
  shipmentId: string,
  shipmentData: Partial<ShipmentData>
): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const idValidation = deleteByIdSchema.safeParse({ id: shipmentId })
    if (!idValidation.success) {
      return {
        success: false,
        error: `参数校验失败：${idValidation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // Check if shipment exists and get current state
    const { data: existingShipment, error: fetchError } = await supabase
      .from('shipments')
      .select('id, tracking_number, actual_arrival_date, actual_departure_date, destination_warehouse_id')
      .eq('id', shipmentId)
      .single()

    if (fetchError || !existingShipment) {
      console.error('Error fetching shipment:', fetchError)
      return { success: false, error: '运单不存在' }
    }

    // Prevent modification of critical fields if already arrived
    let warning: string | undefined
    if (existingShipment.actual_arrival_date) {
      const criticalFieldsChanged =
        (shipmentData.destination_warehouse_id && shipmentData.destination_warehouse_id !== existingShipment.destination_warehouse_id) ||
        (shipmentData.actual_arrival_date && shipmentData.actual_arrival_date !== existingShipment.actual_arrival_date)

      if (criticalFieldsChanged) {
        return {
          success: false,
          error: '修改失败：运单已到货，无法修改目的仓库或到货日期。如需修改，请先撤销到货状态。'
        }
      }

      warning = '警告：该运单已到货，库存已更新。修改运单信息不会自动调整库存。'
    }

    // Update only the provided fields
    const { error: updateError } = await supabase
      .from('shipments')
      .update({
        tracking_number: shipmentData.tracking_number,
        destination_warehouse_id: shipmentData.destination_warehouse_id,
        logistics_plan: shipmentData.logistics_plan,
        logistics_region: shipmentData.logistics_region,
        planned_departure_date: shipmentData.planned_departure_date,
        actual_departure_date: shipmentData.actual_departure_date,
        planned_arrival_date: shipmentData.planned_arrival_date,
        actual_arrival_date: shipmentData.actual_arrival_date,
        weight_kg: shipmentData.weight_kg,
        cost_per_kg_usd: shipmentData.cost_per_kg_usd,
        surcharge_usd: shipmentData.surcharge_usd,
        tax_refund_usd: shipmentData.tax_refund_usd,
        remarks: shipmentData.remarks,
      })
      .eq('id', shipmentId)

    if (updateError) {
      console.error('Error updating shipment:', updateError)
      return { success: false, error: `更新失败：${updateError.message}` }
    }

    revalidatePath('/logistics')
    revalidatePath(`/logistics/${shipmentId}`)
    return { success: true, warning }
  } catch (error) {
    console.error('Error updating shipment:', error)
    return { success: false, error: '更新运单失败，请稍后重试' }
  }
}

/**
 * Mark shipment as arrived
 * Updates the arrival date and processes inventory updates
 */
export async function markShipmentArrived(
  shipmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const idValidation = deleteByIdSchema.safeParse({ id: shipmentId })
    if (!idValidation.success) {
      return {
        success: false,
        error: `Validation error: ${idValidation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // Check if shipment exists and is not already arrived
    const { data: shipment, error: fetchError } = await supabase
      .from('shipments')
      .select('id, tracking_number, actual_arrival_date')
      .eq('id', shipmentId)
      .single()

    if (fetchError || !shipment) {
      console.error('Error fetching shipment:', fetchError)
      return { success: false, error: 'Shipment not found' }
    }

    if (shipment.actual_arrival_date) {
      return { success: false, error: 'Shipment has already arrived' }
    }

    // Update shipment arrival date
    const today = new Date().toISOString().split('T')[0]
    const { error: updateError } = await supabase
      .from('shipments')
      .update({ actual_arrival_date: today })
      .eq('id', shipmentId)

    if (updateError) {
      console.error('Error updating arrival date:', updateError)
      return { success: false, error: updateError.message }
    }

    // Import and call processShipmentArrival from inventory actions
    const { processShipmentArrival } = await import('@/lib/actions/inventory')
    const inventoryResult = await processShipmentArrival(shipmentId)

    if (!inventoryResult.success) {
      // Rollback: revert arrival date
      await supabase
        .from('shipments')
        .update({ actual_arrival_date: null })
        .eq('id', shipmentId)

      return { success: false, error: inventoryResult.error || 'Failed to update inventory' }
    }

    revalidatePath('/logistics')
    revalidatePath('/inventory')
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Error marking shipment as arrived:', error)
    return { success: false, error: 'Failed to mark shipment as arrived' }
  }
}

/**
 * Delete a shipment
 * Cascade deletes shipment items and delivery allocations
 * Prevents deletion of arrived shipments unless force flag is used
 */
export async function deleteShipment(
  id: string,
  options?: { force?: boolean }
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const validation = deleteByIdSchema.safeParse({ id })
    if (!validation.success) {
      return {
        success: false,
        error: `参数校验失败：${validation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // Check if shipment exists and get current state
    const { data: shipment, error: fetchError } = await supabase
      .from('shipments')
      .select('id, tracking_number, actual_arrival_date, actual_departure_date')
      .eq('id', id)
      .single()

    if (fetchError || !shipment) {
      return { success: false, error: '运单不存在' }
    }

    // Handle arrived shipments
    if (shipment.actual_arrival_date) {
      if (!options?.force) {
        return {
          success: false,
          error: '删除失败：运单已到货，库存已更新。请先撤销到货状态，或使用强制删除功能（将自动回滚库存）。'
        }
      }
      // Force delete - will be handled by forceDeleteShipment
      return await forceDeleteShipment(id)
    }

    // Handle departed but not arrived shipments
    if (shipment.actual_departure_date) {
      // Allow deletion with warning
      const { error: deleteError } = await supabase
        .from('shipments')
        .delete()
        .eq('id', id)

      if (deleteError) {
        console.error('Error deleting shipment:', deleteError)
        return { success: false, error: `删除失败：${deleteError.message}` }
      }

      revalidatePath('/logistics')
      revalidatePath('/procurement/deliveries')
      return {
        success: true,
        message: '运单已删除（该运单已发运但未到货，关联的生产交付记录已释放）'
      }
    }

    // Delete pending shipment (not yet departed)
    const { error: deleteError } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting shipment:', deleteError)
      return { success: false, error: `删除失败：${deleteError.message}` }
    }

    revalidatePath('/logistics')
    revalidatePath('/procurement/deliveries')
    return { success: true, message: '运单已删除' }
  } catch (err) {
    console.error('Error deleting shipment:', err)
    return {
      success: false,
      error: `删除运单失败：${err instanceof Error ? err.message : '未知错误'}`,
    }
  }
}

/**
 * Validate delivery allocation
 * Checks if the requested quantity can be allocated from the delivery
 */
export async function validateDeliveryAllocation(
  deliveryId: string,
  requestedQty: number,
  excludeShipmentId?: string
): Promise<{ valid: boolean; availableQty: number; error?: string }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { valid: false, availableQty: 0, error: authResult.error }
    }

    // Validate inputs
    if (!deliveryId || requestedQty <= 0) {
      return { valid: false, availableQty: 0, error: 'Invalid input parameters' }
    }

    const supabase = await createServerSupabaseClient()

    // Call validation RPC function
    const { data, error } = await supabase.rpc('validate_delivery_allocation', {
      p_delivery_id: deliveryId,
      p_new_shipped_qty: requestedQty,
      p_exclude_shipment_id: excludeShipmentId || null,
    })

    if (error) {
      console.error('Error validating delivery allocation:', error)
      return { valid: false, availableQty: 0, error: error.message }
    }

    if (!data || data.length === 0) {
      return { valid: false, availableQty: 0, error: 'No validation result returned' }
    }

    const result = data[0]
    return {
      valid: result.is_valid,
      availableQty: result.available_qty,
      error: result.is_valid ? undefined : result.error_message,
    }
  } catch (error) {
    console.error('Error validating delivery allocation:', error)
    return { valid: false, availableQty: 0, error: 'Failed to validate allocation' }
  }
}

/**
 * Allocation item for creating shipment with deliveries
 */
interface ShipmentAllocationInput {
  delivery_id: string
  shipped_qty: number
  remarks?: string | null
}

/**
 * Create a new shipment with delivery allocations
 * Uses atomic RPC function to ensure data consistency
 * This replaces the legacy single-delivery shipment creation
 */
export async function createShipmentWithAllocations(
  shipmentData: ShipmentData,
  allocations: ShipmentAllocationInput[]
): Promise<{ success: boolean; error?: string; data?: { id: string } }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate shipment data
    const shipmentValidation = shipmentInsertSchema.safeParse(shipmentData)
    if (!shipmentValidation.success) {
      return {
        success: false,
        error: `Shipment validation error: ${shipmentValidation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      }
    }

    // Validate allocations
    if (!allocations || allocations.length === 0) {
      return {
        success: false,
        error: 'At least one delivery allocation is required',
      }
    }

    // Validate each allocation
    for (const allocation of allocations) {
      if (!allocation.delivery_id || allocation.shipped_qty <= 0) {
        return {
          success: false,
          error: 'Invalid allocation: delivery_id and shipped_qty must be valid',
        }
      }
    }

    const supabase = await createServerSupabaseClient()

    // Convert allocations to JSONB format expected by the function
    const allocationsJson = allocations.map((a) => ({
      delivery_id: a.delivery_id,
      shipped_qty: a.shipped_qty,
      remarks: a.remarks || null,
    }))

    // Call RPC function for atomic operation
    const { data, error } = await supabase.rpc('create_shipment_with_delivery_allocations', {
      p_tracking_number: shipmentValidation.data.tracking_number,
      p_batch_code: shipmentValidation.data.batch_code || null,
      p_logistics_batch_code: shipmentValidation.data.logistics_batch_code || null,
      p_destination_warehouse_id: shipmentValidation.data.destination_warehouse_id,
      p_customs_clearance: shipmentValidation.data.customs_clearance,
      p_logistics_plan: shipmentValidation.data.logistics_plan || null,
      p_logistics_region: shipmentValidation.data.logistics_region || null,
      p_planned_departure_date: shipmentValidation.data.planned_departure_date || null,
      p_actual_departure_date: shipmentValidation.data.actual_departure_date || null,
      p_planned_arrival_days: shipmentValidation.data.planned_arrival_days || null,
      p_planned_arrival_date: shipmentValidation.data.planned_arrival_date || null,
      p_actual_arrival_date: shipmentValidation.data.actual_arrival_date || null,
      p_weight_kg: shipmentValidation.data.weight_kg || null,
      p_unit_count: shipmentValidation.data.unit_count || null,
      p_cost_per_kg_usd: shipmentValidation.data.cost_per_kg_usd || null,
      p_surcharge_usd: shipmentValidation.data.surcharge_usd || 0,
      p_tax_refund_usd: shipmentValidation.data.tax_refund_usd || 0,
      p_remarks: shipmentValidation.data.remarks || null,
      p_allocations: allocationsJson,
    })

    if (error) {
      console.error('Error creating shipment with allocations:', error)
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

    revalidatePath('/logistics')
    revalidatePath('/procurement/deliveries')
    return { success: true, data: { id: result.shipment_id } }
  } catch (error) {
    console.error('Error creating shipment with allocations:', error)
    return { success: false, error: 'Failed to create shipment' }
  }
}

/**
 * Undo shipment arrival - rollback inventory updates
 * Clears actual_arrival_date and reverts inventory changes
 */
export async function undoShipmentArrival(
  shipmentId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const validation = deleteByIdSchema.safeParse({ id: shipmentId })
    if (!validation.success) {
      return {
        success: false,
        error: `参数校验失败：${validation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // Get shipment details with items
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .select('*, shipment_items(*)')
      .eq('id', shipmentId)
      .single()

    if (shipmentError || !shipment) {
      return { success: false, error: '运单不存在' }
    }

    // Check if shipment has arrived
    if (!(shipment as any).actual_arrival_date) {
      return {
        success: false,
        error: '撤销失败：该运单尚未到货'
      }
    }

    // Rollback inventory for each item
    const items = (shipment as any).shipment_items || []
    for (const item of items) {
      // Get current inventory
      const { data: currentInv, error: invError } = await supabase
        .from('inventory_snapshots')
        .select('qty_on_hand')
        .eq('sku', item.sku)
        .eq('warehouse_id', (shipment as any).destination_warehouse_id)
        .single()

      if (invError) {
        return {
          success: false,
          error: `回滚库存失败：SKU ${item.sku} 的库存记录不存在`
        }
      }

      const currentQty = currentInv.qty_on_hand
      // Use received_qty if available, fallback to shipped_qty
      const arrivalQty = item.received_qty !== undefined && item.received_qty !== null
        ? item.received_qty
        : item.shipped_qty
      const newQty = currentQty - arrivalQty

      if (newQty < 0) {
        return {
          success: false,
          error: `回滚库存失败：SKU ${item.sku} 的库存不足（当前库存 ${currentQty}，需回滚 ${arrivalQty}）`
        }
      }

      // Update inventory
      const { error: updateInvError } = await supabase
        .from('inventory_snapshots')
        .update({
          qty_on_hand: newQty,
          last_counted_at: new Date().toISOString(),
        })
        .eq('sku', item.sku)
        .eq('warehouse_id', (shipment as any).destination_warehouse_id)

      if (updateInvError) {
        return {
          success: false,
          error: `回滚库存失败：${updateInvError.message}`
        }
      }
    }

    // Clear arrival date
    const { error: clearError } = await supabase
      .from('shipments')
      .update({ actual_arrival_date: null })
      .eq('id', shipmentId)

    if (clearError) {
      return {
        success: false,
        error: `撤销到货状态失败：${clearError.message}`
      }
    }

    revalidatePath('/logistics')
    revalidatePath('/inventory')
    revalidatePath('/')
    return {
      success: true,
      message: `已撤销到货状态（运单 ${(shipment as any).tracking_number}），库存已回滚`
    }
  } catch (error) {
    console.error('Error undoing shipment arrival:', error)
    return {
      success: false,
      error: `撤销到货失败：${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

/**
 * Undo shipment departure
 * Clears actual_departure_date
 */
export async function undoShipmentDeparture(
  shipmentId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const validation = deleteByIdSchema.safeParse({ id: shipmentId })
    if (!validation.success) {
      return {
        success: false,
        error: `参数校验失败：${validation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // Check if shipment exists and get current state
    const { data: shipment, error: fetchError } = await supabase
      .from('shipments')
      .select('id, tracking_number, actual_arrival_date, actual_departure_date')
      .eq('id', shipmentId)
      .single()

    if (fetchError || !shipment) {
      return { success: false, error: '运单不存在' }
    }

    // Check if already arrived
    if (shipment.actual_arrival_date) {
      return {
        success: false,
        error: '撤销失败：该运单已到货，请先撤销到货状态'
      }
    }

    // Check if has departed
    if (!shipment.actual_departure_date) {
      return {
        success: false,
        error: '撤销失败：该运单尚未发运'
      }
    }

    // Clear departure date
    const { error: clearError } = await supabase
      .from('shipments')
      .update({ actual_departure_date: null })
      .eq('id', shipmentId)

    if (clearError) {
      return {
        success: false,
        error: `撤销发运状态失败：${clearError.message}`
      }
    }

    revalidatePath('/logistics')
    return {
      success: true,
      message: `已撤销发运状态（运单 ${shipment.tracking_number}）`
    }
  } catch (error) {
    console.error('Error undoing shipment departure:', error)
    return {
      success: false,
      error: `撤销发运失败：${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

/**
 * Force delete an arrived shipment
 * Automatically rollbacks inventory before deletion
 */
export async function forceDeleteShipment(
  shipmentId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const authResult = await requireAuth()
    if ('error' in authResult) {
      return { success: false, error: authResult.error }
    }

    // Validate ID
    const validation = deleteByIdSchema.safeParse({ id: shipmentId })
    if (!validation.success) {
      return {
        success: false,
        error: `参数校验失败：${validation.error.issues.map((e) => e.message).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // Get shipment details
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .select('*, shipment_items(*)')
      .eq('id', shipmentId)
      .single()

    if (shipmentError || !shipment) {
      return { success: false, error: '运单不存在' }
    }

    const trackingNumber = (shipment as any).tracking_number
    const hasArrived = !!(shipment as any).actual_arrival_date

    // If arrived, rollback inventory first
    if (hasArrived) {
      const items = (shipment as any).shipment_items || []
      for (const item of items) {
        // Get current inventory
        const { data: currentInv, error: invError } = await supabase
          .from('inventory_snapshots')
          .select('qty_on_hand')
          .eq('sku', item.sku)
          .eq('warehouse_id', (shipment as any).destination_warehouse_id)
          .single()

        if (invError) {
          return {
            success: false,
            error: `回滚库存失败：SKU ${item.sku} 的库存记录不存在`
          }
        }

        const currentQty = currentInv.qty_on_hand
        // Use received_qty if available, fallback to shipped_qty
        const arrivalQty = item.received_qty !== undefined && item.received_qty !== null
          ? item.received_qty
          : item.shipped_qty
        const newQty = currentQty - arrivalQty

        if (newQty < 0) {
          return {
            success: false,
            error: `回滚库存失败：SKU ${item.sku} 的库存不足（当前库存 ${currentQty}，需回滚 ${arrivalQty}）`
          }
        }

        // Update inventory
        const { error: updateInvError } = await supabase
          .from('inventory_snapshots')
          .update({
            qty_on_hand: newQty,
            last_counted_at: new Date().toISOString(),
          })
          .eq('sku', item.sku)
          .eq('warehouse_id', (shipment as any).destination_warehouse_id)

        if (updateInvError) {
          return {
            success: false,
            error: `回滚库存失败：${updateInvError.message}`
          }
        }
      }
    }

    // Delete shipment (cascade deletes items and allocations)
    const { error: deleteError } = await supabase
      .from('shipments')
      .delete()
      .eq('id', shipmentId)

    if (deleteError) {
      console.error('Error force deleting shipment:', deleteError)
      return {
        success: false,
        error: `强制删除失败：${deleteError.message}`
      }
    }

    revalidatePath('/logistics')
    revalidatePath('/procurement/deliveries')
    if (hasArrived) {
      revalidatePath('/inventory')
      revalidatePath('/')
    }

    return {
      success: true,
      message: hasArrived
        ? `运单已强制删除（运单 ${trackingNumber}），库存已回滚`
        : `运单已删除（运单 ${trackingNumber}）`
    }
  } catch (error) {
    console.error('Error force deleting shipment:', error)
    return {
      success: false,
      error: `强制删除失败：${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}
