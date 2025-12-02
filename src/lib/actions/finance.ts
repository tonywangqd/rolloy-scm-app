'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'

// ================================================================
// SINGLE PAYMENT STATUS UPDATE
// ================================================================

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
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

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

// ================================================================
// BATCH PAYMENT MARKING BY REFERENCE NUMBERS
// ================================================================

/**
 * Parse reference numbers from textarea input
 * Supports multiple formats: newline-separated, comma-separated, or space-separated
 */
function parseReferenceNumbers(input: string): string[] {
  return input
    .split(/[\n,\s]+/) // Split by newline, comma, or space
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Batch mark procurement payments as paid by delivery numbers
 */
export async function batchMarkProcurementPaid(
  deliveryNumbers: string
): Promise<{
  success: boolean
  error?: string
  updated: number
  notFound: string[]
  details: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return {
      success: false,
      error: authResult.error,
      updated: 0,
      notFound: [],
      details: '',
    }
  }

  const numbers = parseReferenceNumbers(deliveryNumbers)
  if (numbers.length === 0) {
    return {
      success: false,
      error: 'No valid delivery numbers provided',
      updated: 0,
      notFound: [],
      details: '',
    }
  }

  const supabase = await createServerSupabaseClient()

  // Find matching deliveries
  const { data: deliveries, error: fetchError } = await supabase
    .from('production_deliveries')
    .select('id, delivery_number, payment_status')
    .in('delivery_number', numbers)

  if (fetchError) {
    return {
      success: false,
      error: fetchError.message,
      updated: 0,
      notFound: [],
      details: '',
    }
  }

  const found = deliveries || []
  const foundNumbers = new Set(found.map((d) => d.delivery_number))
  const notFound = numbers.filter((n) => !foundNumbers.has(n))

  if (found.length === 0) {
    return {
      success: false,
      error: 'No matching delivery records found',
      updated: 0,
      notFound,
      details: `Not found: ${notFound.join(', ')}`,
    }
  }

  // Update payment status to Paid
  const idsToUpdate = found.map((d) => d.id)
  const { error: updateError } = await supabase
    .from('production_deliveries')
    .update({ payment_status: 'Paid' })
    .in('id', idsToUpdate)

  if (updateError) {
    return {
      success: false,
      error: updateError.message,
      updated: 0,
      notFound,
      details: '',
    }
  }

  revalidatePath('/finance')
  revalidatePath('/procurement')

  return {
    success: true,
    updated: found.length,
    notFound,
    details: `Updated ${found.length} delivery record(s). ${notFound.length > 0 ? `Not found: ${notFound.join(', ')}` : ''}`,
  }
}

/**
 * Batch mark logistics payments as paid by tracking numbers
 */
export async function batchMarkLogisticsPaid(
  trackingNumbers: string
): Promise<{
  success: boolean
  error?: string
  updated: number
  notFound: string[]
  details: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return {
      success: false,
      error: authResult.error,
      updated: 0,
      notFound: [],
      details: '',
    }
  }

  const numbers = parseReferenceNumbers(trackingNumbers)
  if (numbers.length === 0) {
    return {
      success: false,
      error: 'No valid tracking numbers provided',
      updated: 0,
      notFound: [],
      details: '',
    }
  }

  const supabase = await createServerSupabaseClient()

  // Find matching shipments
  const { data: shipments, error: fetchError } = await supabase
    .from('shipments')
    .select('id, tracking_number, payment_status')
    .in('tracking_number', numbers)

  if (fetchError) {
    return {
      success: false,
      error: fetchError.message,
      updated: 0,
      notFound: [],
      details: '',
    }
  }

  const found = shipments || []
  const foundNumbers = new Set(found.map((s) => s.tracking_number))
  const notFound = numbers.filter((n) => !foundNumbers.has(n))

  if (found.length === 0) {
    return {
      success: false,
      error: 'No matching shipment records found',
      updated: 0,
      notFound,
      details: `Not found: ${notFound.join(', ')}`,
    }
  }

  // Update payment status to Paid
  const idsToUpdate = found.map((s) => s.id)
  const { error: updateError } = await supabase
    .from('shipments')
    .update({ payment_status: 'Paid' })
    .in('id', idsToUpdate)

  if (updateError) {
    return {
      success: false,
      error: updateError.message,
      updated: 0,
      notFound,
      details: '',
    }
  }

  revalidatePath('/finance')
  revalidatePath('/logistics')

  return {
    success: true,
    updated: found.length,
    notFound,
    details: `Updated ${found.length} shipment record(s). ${notFound.length > 0 ? `Not found: ${notFound.join(', ')}` : ''}`,
  }
}
