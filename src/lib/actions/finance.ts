'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import { updatePaymentStatusSchema, batchUpdatePaymentStatusSchema } from '@/lib/validations'

/**
 * Update procurement payment status
 */
export async function updateProcurementPaymentStatus(
  id: string,
  status: 'Pending' | 'Scheduled' | 'Paid'
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = updatePaymentStatusSchema.safeParse({ id, status })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('production_deliveries')
    .update({ payment_status: validation.data.status })
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
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = updatePaymentStatusSchema.safeParse({ id, status })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('shipments')
    .update({ payment_status: validation.data.status })
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
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error, updated: 0 }
  }

  // Validate input
  const validation = batchUpdatePaymentStatusSchema.safeParse({ items, status })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      updated: 0,
    }
  }

  const supabase = await createServerSupabaseClient()

  const procurementIds = validation.data.items.filter((i) => i.type === 'procurement').map((i) => i.id)
  const logisticsIds = validation.data.items.filter((i) => i.type === 'logistics').map((i) => i.id)

  let updated = 0
  let errorMsg = ''

  if (procurementIds.length > 0) {
    const { error } = await supabase
      .from('production_deliveries')
      .update({ payment_status: validation.data.status })
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
      .update({ payment_status: validation.data.status })
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
