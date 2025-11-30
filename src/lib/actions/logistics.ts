'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ShipmentInsert, ShipmentItemInsert } from '@/lib/types/database'

/**
 * Create a new shipment with items
 */
export async function createShipment(
  shipment: ShipmentInsert,
  items: Omit<ShipmentItemInsert, 'shipment_id'>[]
): Promise<{ success: boolean; error?: string; id?: string }> {
  const supabase = await createServerSupabaseClient()

  // Insert shipment
  const { data: shipmentData, error: shipmentError } = await (supabase
    .from('shipments') as any)
    .insert(shipment)
    .select('id')
    .single()

  if (shipmentError) {
    return { success: false, error: shipmentError.message }
  }

  // Insert items
  if (items.length > 0) {
    const itemsWithShipmentId = items.map((item) => ({
      ...item,
      shipment_id: shipmentData.id,
    }))

    const { error: itemsError } = await (supabase
      .from('shipment_items') as any)
      .insert(itemsWithShipmentId)

    if (itemsError) {
      // Rollback shipment
      await (supabase.from('shipments') as any).delete().eq('id', shipmentData.id)
      return { success: false, error: itemsError.message }
    }
  }

  revalidatePath('/logistics')
  return { success: true, id: shipmentData.id }
}

/**
 * Update shipment arrival
 */
export async function updateShipmentArrival(
  id: string,
  actual_arrival_date: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await (supabase
    .from('shipments') as any)
    .update({ actual_arrival_date })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/logistics')
  revalidatePath('/inventory')
  return { success: true }
}

/**
 * Update shipment payment status
 */
export async function updateShipmentPaymentStatus(
  id: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await (supabase
    .from('shipments') as any)
    .update({ payment_status: status })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/logistics')
  revalidatePath('/finance')
  return { success: true }
}

/**
 * Delete a shipment
 */
export async function deleteShipment(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await (supabase
    .from('shipments') as any)
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/logistics')
  return { success: true }
}
