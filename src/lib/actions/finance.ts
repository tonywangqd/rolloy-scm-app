'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Update procurement payment status
 */
export async function updateProcurementPaymentStatus(
  id: string,
  status: 'Pending' | 'Scheduled' | 'Paid'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('production_deliveries')
    .update({ payment_status: status })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/finance')
  revalidatePath('/procurement')
  return { success: true }
}

/**
 * Update logistics payment status
 */
export async function updateLogisticsPaymentStatus(
  id: string,
  status: 'Pending' | 'Scheduled' | 'Paid'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('shipments')
    .update({ payment_status: status })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/finance')
  revalidatePath('/logistics')
  return { success: true }
}

/**
 * Batch update payment status
 */
export async function batchUpdatePaymentStatus(
  items: { id: string; type: 'procurement' | 'logistics' }[],
  status: 'Pending' | 'Scheduled' | 'Paid'
): Promise<{ success: boolean; error?: string; updated: number }> {
  const supabase = await createServerSupabaseClient()

  const procurementIds = items.filter((i) => i.type === 'procurement').map((i) => i.id)
  const logisticsIds = items.filter((i) => i.type === 'logistics').map((i) => i.id)

  let updated = 0
  let errorMsg = ''

  if (procurementIds.length > 0) {
    const { error } = await supabase
      .from('production_deliveries')
      .update({ payment_status: status })
      .in('id', procurementIds)

    if (error) {
      errorMsg = error.message
    } else {
      updated += procurementIds.length
    }
  }

  if (logisticsIds.length > 0) {
    const { error } = await supabase
      .from('shipments')
      .update({ payment_status: status })
      .in('id', logisticsIds)

    if (error) {
      errorMsg = errorMsg ? `${errorMsg}; ${error.message}` : error.message
    } else {
      updated += logisticsIds.length
    }
  }

  revalidatePath('/finance')
  revalidatePath('/procurement')
  revalidatePath('/logistics')

  if (errorMsg) {
    return { success: false, error: errorMsg, updated }
  }

  return { success: true, updated }
}
