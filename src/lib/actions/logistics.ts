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
 */
export async function updateShipment(
  shipmentId: string,
  shipmentData: Partial<ShipmentData>
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

    // Check if shipment exists
    const { data: existingShipment, error: fetchError } = await supabase
      .from('shipments')
      .select('id')
      .eq('id', shipmentId)
      .single()

    if (fetchError || !existingShipment) {
      console.error('Error fetching shipment:', fetchError)
      return { success: false, error: 'Shipment not found' }
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
      return { success: false, error: updateError.message }
    }

    revalidatePath('/logistics')
    revalidatePath(`/logistics/${shipmentId}`)
    return { success: true }
  } catch (error) {
    console.error('Error updating shipment:', error)
    return { success: false, error: 'Failed to update shipment' }
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
