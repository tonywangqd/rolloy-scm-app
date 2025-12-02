'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import { inventorySnapshotUpsertSchema, batchInventorySnapshotsSchema, deleteInventorySnapshotSchema, deleteByIdSchema } from '@/lib/validations'

/**
 * Update inventory snapshot
 */
export async function updateInventorySnapshot(
  sku: string,
  warehouseId: string,
  qtyOnHand: number
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = inventorySnapshotUpsertSchema.safeParse({
    sku,
    warehouse_id: warehouseId,
    qty_on_hand: qtyOnHand,
  })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('inventory_snapshots')
    .upsert(
      {
        sku: validation.data.sku,
        warehouse_id: validation.data.warehouse_id,
        qty_on_hand: validation.data.qty_on_hand,
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
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = batchInventorySnapshotsSchema.safeParse(updates)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const dataToUpsert = validation.data.map((u) => ({
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
  return { success: true, count: validation.data.length }
}

/**
 * Delete inventory snapshot
 */
export async function deleteInventorySnapshot(
  sku: string,
  warehouseId: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = deleteInventorySnapshotSchema.safeParse({ sku, warehouseId })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

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
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate ID
  const validation = deleteByIdSchema.safeParse({ id: shipmentId })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => e.message).join(', ')}`,
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
