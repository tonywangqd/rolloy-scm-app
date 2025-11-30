'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Update inventory snapshot
 */
export async function updateInventorySnapshot(
  sku: string,
  warehouseId: string,
  qtyOnHand: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('inventory_snapshots')
    .upsert(
      {
        sku,
        warehouse_id: warehouseId,
        qty_on_hand: qtyOnHand,
        last_counted_at: new Date().toISOString(),
      },
      {
        onConflict: 'sku,warehouse_id',
      }
    )

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/inventory')
  revalidatePath('/')
  return { success: true }
}

/**
 * Batch update inventory snapshots
 */
export async function batchUpdateInventorySnapshots(
  updates: { sku: string; warehouse_id: string; qty_on_hand: number }[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  const supabase = await createServerSupabaseClient()

  const dataToUpsert = updates.map((u) => ({
    ...u,
    last_counted_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('inventory_snapshots')
    .upsert(dataToUpsert, {
      onConflict: 'sku,warehouse_id',
    })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/inventory')
  revalidatePath('/')
  return { success: true, count: updates.length }
}

/**
 * Delete inventory snapshot
 */
export async function deleteInventorySnapshot(
  sku: string,
  warehouseId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('inventory_snapshots')
    .delete()
    .eq('sku', sku)
    .eq('warehouse_id', warehouseId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/inventory')
  revalidatePath('/')
  return { success: true }
}

/**
 * Process shipment arrival - update inventory
 */
export async function processShipmentArrival(
  shipmentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  // Get shipment details
  const { data: shipment, error: shipmentError } = await supabase
    .from('shipments')
    .select('*, shipment_items(*)')
    .eq('id', shipmentId)
    .single()

  if (shipmentError || !shipment) {
    return { success: false, error: shipmentError?.message || 'Shipment not found' }
  }

  // Update inventory for each item
  const items = (shipment as any).shipment_items || []
  for (const item of items) {
    // Get current inventory
    const { data: currentInv } = await supabase
      .from('inventory_snapshots')
      .select('qty_on_hand')
      .eq('sku', item.sku)
      .eq('warehouse_id', (shipment as any).destination_warehouse_id)
      .single()

    const currentQty = currentInv?.qty_on_hand || 0
    const newQty = currentQty + item.shipped_qty

    // Upsert inventory
    const { error: invError } = await supabase
      .from('inventory_snapshots')
      .upsert(
        {
          sku: item.sku,
          warehouse_id: (shipment as any).destination_warehouse_id,
          qty_on_hand: newQty,
          last_counted_at: new Date().toISOString(),
        },
        {
          onConflict: 'sku,warehouse_id',
        }
      )

    if (invError) {
      return { success: false, error: invError.message }
    }
  }

  // Mark shipment as arrived
  const { error: updateError } = await supabase
    .from('shipments')
    .update({ actual_arrival_date: new Date().toISOString().split('T')[0] })
    .eq('id', shipmentId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  revalidatePath('/inventory')
  revalidatePath('/logistics')
  revalidatePath('/')
  return { success: true }
}
