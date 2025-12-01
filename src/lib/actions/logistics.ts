'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { PaymentStatus, Region } from '@/lib/types/database'

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
 */
export async function createShipment(
  shipmentData: ShipmentData,
  items: ShipmentItemData[]
): Promise<{ success: boolean; error?: string; data?: { id: string } }> {
  try {
    const supabase = await createServerSupabaseClient()

    // Calculate total cost
    const freightCost = (shipmentData.weight_kg || 0) * (shipmentData.cost_per_kg_usd || 0)
    const totalCost = freightCost + shipmentData.surcharge_usd - shipmentData.tax_refund_usd

    // Insert shipment
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .insert({
        tracking_number: shipmentData.tracking_number,
        batch_code: shipmentData.batch_code,
        logistics_batch_code: shipmentData.logistics_batch_code,
        destination_warehouse_id: shipmentData.destination_warehouse_id,
        customs_clearance: shipmentData.customs_clearance,
        logistics_plan: shipmentData.logistics_plan,
        logistics_region: shipmentData.logistics_region,
        planned_departure_date: shipmentData.planned_departure_date,
        actual_departure_date: shipmentData.actual_departure_date,
        planned_arrival_days: shipmentData.planned_arrival_days,
        planned_arrival_date: shipmentData.planned_arrival_date,
        actual_arrival_date: shipmentData.actual_arrival_date,
        weight_kg: shipmentData.weight_kg,
        unit_count: shipmentData.unit_count,
        cost_per_kg_usd: shipmentData.cost_per_kg_usd,
        surcharge_usd: shipmentData.surcharge_usd,
        tax_refund_usd: shipmentData.tax_refund_usd,
        total_cost_usd: totalCost,
        payment_status: 'Pending',
        remarks: shipmentData.remarks,
      })
      .select('id')
      .single()

    if (shipmentError) {
      console.error('Error creating shipment:', shipmentError)
      return { success: false, error: shipmentError.message }
    }

    // Insert shipment items
    if (items.length > 0) {
      const itemsToInsert = items.map((item) => ({
        shipment_id: shipment.id,
        sku: item.sku,
        shipped_qty: item.shipped_qty,
      }))

      const { error: itemsError } = await supabase
        .from('shipment_items')
        .insert(itemsToInsert)

      if (itemsError) {
        console.error('Error creating shipment items:', itemsError)
        // Cleanup: delete the shipment if items failed
        await supabase.from('shipments').delete().eq('id', shipment.id)
        return { success: false, error: itemsError.message }
      }
    }

    revalidatePath('/logistics')
    return { success: true, data: { id: shipment.id } }
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
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('shipments')
      .update({ payment_status: newStatus })
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
