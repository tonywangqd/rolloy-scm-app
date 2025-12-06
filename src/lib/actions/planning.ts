'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import type { SalesForecastInsert, SalesActualInsert } from '@/lib/types/database'
import {
  salesForecastInsertSchema,
  salesActualInsertSchema,
  batchSalesForecastsSchema,
  batchSalesActualsSchema,
  copyForecastsSchema,
  deleteSalesForecastSchema,
} from '@/lib/validations'

/**
 * Create or update sales forecast
 */
export async function upsertSalesForecast(
  forecast: SalesForecastInsert
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = salesForecastInsertSchema.safeParse(forecast)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('sales_forecasts')
    .upsert(validation.data, {
      onConflict: 'week_iso,sku,channel_code',
    })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/forecasts')
  return { success: true }
}

/**
 * Batch upsert sales forecasts
 */
export async function batchUpsertSalesForecasts(
  forecasts: SalesForecastInsert[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  if (!forecasts || forecasts.length === 0) {
    return { success: false, error: 'No data to import' }
  }

  const supabase = await createServerSupabaseClient()

  // Calculate week dates for each forecast
  const { parseWeekString } = await import('@/lib/utils/date')
  const { format, endOfISOWeek } = await import('date-fns')

  const forecastsWithDates = forecasts.map((f) => {
    const weekStart = parseWeekString(f.week_iso)
    if (!weekStart) {
      throw new Error(`Invalid week format: ${f.week_iso}`)
    }
    const weekEnd = endOfISOWeek(weekStart)

    return {
      ...f,
      week_start_date: format(weekStart, 'yyyy-MM-dd'),
      week_end_date: format(weekEnd, 'yyyy-MM-dd'),
    }
  })

  // Validate input
  const validation = batchSalesForecastsSchema.safeParse(forecastsWithDates)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const { error } = await supabase
    .from('sales_forecasts')
    .upsert(validation.data, {
      onConflict: 'week_iso,sku,channel_code',
    })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/forecasts')
  return { success: true, count: validation.data.length }
}

/**
 * Create or update sales actual
 */
export async function upsertSalesActual(
  actual: SalesActualInsert
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = salesActualInsertSchema.safeParse(actual)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('sales_actuals')
    .upsert(validation.data, {
      onConflict: 'week_iso,sku,channel_code',
    })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/actuals')
  return { success: true }
}

/**
 * Batch upsert sales actuals
 */
export async function batchUpsertSalesActuals(
  actuals: SalesActualInsert[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  if (!actuals || actuals.length === 0) {
    return { success: false, error: 'No data to import' }
  }

  const supabase = await createServerSupabaseClient()

  // Calculate week dates for each actual
  const { parseWeekString } = await import('@/lib/utils/date')
  const { format, endOfISOWeek } = await import('date-fns')

  const actualsWithDates = actuals.map((a) => {
    const weekStart = parseWeekString(a.week_iso)
    if (!weekStart) {
      throw new Error(`Invalid week format: ${a.week_iso}`)
    }
    const weekEnd = endOfISOWeek(weekStart)

    return {
      ...a,
      week_start_date: format(weekStart, 'yyyy-MM-dd'),
      week_end_date: format(weekEnd, 'yyyy-MM-dd'),
    }
  })

  // Validate input
  const validation = batchSalesActualsSchema.safeParse(actualsWithDates)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const { error } = await supabase
    .from('sales_actuals')
    .upsert(validation.data, {
      onConflict: 'week_iso,sku,channel_code',
    })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/actuals')
  return { success: true, count: validation.data.length }
}

/**
 * Delete sales forecast
 */
export async function deleteSalesForecast(
  weekIso: string,
  sku: string,
  channelCode: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = deleteSalesForecastSchema.safeParse({ weekIso, sku, channelCode })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('sales_forecasts')
    .delete()
    .eq('week_iso', weekIso)
    .eq('sku', sku)
    .eq('channel_code', channelCode)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/forecasts')
  return { success: true }
}

/**
 * Delete sales actual
 */
export async function deleteSalesActual(
  weekIso: string,
  sku: string,
  channelCode: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = deleteSalesForecastSchema.safeParse({ weekIso, sku, channelCode })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('sales_actuals')
    .delete()
    .eq('week_iso', weekIso)
    .eq('sku', sku)
    .eq('channel_code', channelCode)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/actuals')
  return { success: true }
}

/**
 * Delete all forecasts for a SKU in a specific week (all channels)
 */
export async function deleteSalesForecastBySku(
  weekIso: string,
  sku: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('sales_forecasts')
    .delete()
    .eq('week_iso', weekIso)
    .eq('sku', sku)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/forecasts')
  return { success: true }
}

/**
 * Delete all actuals for a SKU in a specific week (all channels)
 */
export async function deleteSalesActualBySku(
  weekIso: string,
  sku: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('sales_actuals')
    .delete()
    .eq('week_iso', weekIso)
    .eq('sku', sku)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/actuals')
  return { success: true }
}

/**
 * Copy forecasts from one week to another
 */
export async function copyForecastsToWeek(
  fromWeek: string,
  toWeek: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = copyForecastsSchema.safeParse({ fromWeek, toWeek })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  // Fetch source forecasts
  const { data: sourceForecasts, error: fetchError } = await supabase
    .from('sales_forecasts')
    .select('*')
    .eq('week_iso', fromWeek)

  if (fetchError) {
    return { success: false, error: fetchError.message }
  }

  if (!sourceForecasts || sourceForecasts.length === 0) {
    return { success: false, error: '源周没有预测数据' }
  }

  // Create new forecasts for target week
  const newForecasts = sourceForecasts.map((f) => ({
    week_iso: toWeek,
    week_start_date: f.week_start_date,
    week_end_date: f.week_end_date,
    sku: f.sku,
    channel_code: f.channel_code,
    forecast_qty: f.forecast_qty,
  }))

  const { error: insertError } = await supabase
    .from('sales_forecasts')
    .upsert(newForecasts, {
      onConflict: 'week_iso,sku,channel_code',
    })

  if (insertError) {
    return { success: false, error: insertError.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/forecasts')
  return { success: true, count: newForecasts.length }
}

// ================================================================
// FORECAST-ORDER LINKAGE ACTIONS
// ================================================================

/**
 * Delete production delivery with rollback and audit
 */
export async function deleteProductionDelivery(
  deliveryId: string,
  deletionReason?: string
): Promise<{
  success: boolean
  error?: string
  errorCode?: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call stored procedure
    const { data, error } = await supabase.rpc('delete_production_delivery', {
      p_delivery_id: deliveryId,
      p_deleted_by: user.id,
      p_deletion_reason: deletionReason || null,
    })

    if (error) {
      console.error('Delete delivery RPC error:', error)
      return { success: false, error: error.message }
    }

    const result = data && data.length > 0 ? data[0] : null
    if (!result || !result.success) {
      return {
        success: false,
        error: result?.error_message || 'Unknown error',
        errorCode: result?.error_code || 'UNKNOWN',
      }
    }

    revalidatePath('/procurement')
    revalidatePath('/procurement/deliveries')
    return { success: true }
  } catch (error) {
    console.error('Delete delivery error:', error)
    return { success: false, error: 'Database error' }
  }
}

/**
 * Create manual allocation between forecast and PO item
 */
export async function createForecastAllocation(params: {
  forecastId: string
  poItemId: string
  allocatedQty: number
  remarks?: string
}): Promise<{
  success: boolean
  data?: { id: string }
  error?: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Validate: Check SKU and channel match
    const { data: forecast, error: forecastError } = await supabase
      .from('sales_forecasts')
      .select('sku, channel_code')
      .eq('id', params.forecastId)
      .single()

    if (forecastError || !forecast) {
      return { success: false, error: 'Forecast not found' }
    }

    const { data: poItem, error: poItemError } = await supabase
      .from('purchase_order_items')
      .select('sku, channel_code, ordered_qty')
      .eq('id', params.poItemId)
      .single()

    if (poItemError || !poItem) {
      return { success: false, error: 'PO item not found' }
    }

    if (forecast.sku !== poItem.sku) {
      return { success: false, error: 'SKU mismatch between forecast and PO item' }
    }

    if (forecast.channel_code !== poItem.channel_code && poItem.channel_code !== null) {
      return { success: false, error: 'Channel mismatch between forecast and PO item' }
    }

    // Validate: Check total allocation doesn't exceed ordered_qty
    const { data: existingAllocations } = await supabase
      .from('forecast_order_allocations')
      .select('allocated_qty')
      .eq('po_item_id', params.poItemId)

    const totalAllocated =
      (existingAllocations || []).reduce((sum, a) => sum + a.allocated_qty, 0) +
      params.allocatedQty

    if (totalAllocated > poItem.ordered_qty) {
      return {
        success: false,
        error: `Total allocation (${totalAllocated}) exceeds ordered quantity (${poItem.ordered_qty})`,
      }
    }

    // Insert allocation
    const { data, error } = await supabase
      .from('forecast_order_allocations')
      .insert({
        forecast_id: params.forecastId,
        po_item_id: params.poItemId,
        allocated_qty: params.allocatedQty,
        allocation_type: 'manual',
        allocated_by: user.id,
        remarks: params.remarks || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Create allocation error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/planning/forecast-coverage')
    revalidatePath('/procurement')
    return { success: true, data }
  } catch (error) {
    console.error('Create allocation error:', error)
    return { success: false, error: 'Failed to create allocation' }
  }
}

/**
 * Create multiple forecast allocations for a PO item
 */
export async function createForecastAllocations(
  poItemId: string,
  allocations: { forecastId: string; allocatedQty: number }[]
): Promise<{
  success: boolean
  count?: number
  error?: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Validate total allocation
    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedQty, 0)

    const { data: poItem } = await supabase
      .from('purchase_order_items')
      .select('ordered_qty')
      .eq('id', poItemId)
      .single()

    if (!poItem) {
      return { success: false, error: 'PO item not found' }
    }

    if (totalAllocated > poItem.ordered_qty) {
      return {
        success: false,
        error: `Total allocation (${totalAllocated}) exceeds ordered quantity (${poItem.ordered_qty})`,
      }
    }

    // Insert all allocations
    const allocationInserts = allocations.map((a) => ({
      forecast_id: a.forecastId,
      po_item_id: poItemId,
      allocated_qty: a.allocatedQty,
      allocation_type: 'manual' as const,
      allocated_by: user.id,
    }))

    const { error } = await supabase
      .from('forecast_order_allocations')
      .insert(allocationInserts)

    if (error) {
      console.error('Batch create allocations error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/planning/forecast-coverage')
    revalidatePath('/procurement')
    return { success: true, count: allocations.length }
  } catch (error) {
    console.error('Create allocations error:', error)
    return { success: false, error: 'Failed to create allocations' }
  }
}

/**
 * Auto-allocate forecasts to PO item using FIFO algorithm
 */
export async function autoAllocateForecasts(poItemId: string): Promise<{
  success: boolean
  data?: { forecast_id: string; allocated_qty: number; week_iso: string }[]
  error?: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call stored procedure
    const { data, error } = await supabase.rpc('auto_allocate_forecast_to_po_item', {
      p_po_item_id: poItemId,
      p_allocated_by: user.id,
    })

    if (error) {
      console.error('Auto-allocate RPC error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/planning/forecast-coverage')
    revalidatePath('/procurement')
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Auto-allocate error:', error)
    return { success: false, error: 'Auto-allocation failed' }
  }
}

/**
 * Resolve forecast variance
 */
export async function resolveForecastVariance(params: {
  resolutionId: string
  action: import('@/lib/types/database').ResolutionAction
  notes?: string
}): Promise<{
  success: boolean
  error?: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update resolution
    const { error } = await supabase
      .from('forecast_variance_resolutions')
      .update({
        resolution_action: params.action,
        resolution_status: 'resolved',
        resolution_notes: params.notes || null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', params.resolutionId)

    if (error) {
      console.error('Resolve variance error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/planning/variance-resolutions')
    return { success: true }
  } catch (error) {
    console.error('Resolve variance error:', error)
    return { success: false, error: 'Failed to resolve variance' }
  }
}

/**
 * Delete forecast allocation
 */
export async function deleteForecastAllocation(allocationId: string): Promise<{
  success: boolean
  error?: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  try {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('forecast_order_allocations')
      .delete()
      .eq('id', allocationId)

    if (error) {
      console.error('Delete allocation error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/planning/forecast-coverage')
    revalidatePath('/procurement')
    return { success: true }
  } catch (error) {
    console.error('Delete allocation error:', error)
    return { success: false, error: 'Failed to delete allocation' }
  }
}

/**
 * Update forecast allocation quantity
 */
export async function updateForecastAllocation(
  allocationId: string,
  allocatedQty: number,
  remarks?: string
): Promise<{
  success: boolean
  error?: string
}> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Get allocation details
    const { data: allocation, error: fetchError } = await supabase
      .from('forecast_order_allocations')
      .select('po_item_id, allocated_qty')
      .eq('id', allocationId)
      .single()

    if (fetchError || !allocation) {
      return { success: false, error: 'Allocation not found' }
    }

    // Validate: Check total allocation doesn't exceed ordered_qty
    const { data: poItem } = await supabase
      .from('purchase_order_items')
      .select('ordered_qty')
      .eq('id', allocation.po_item_id)
      .single()

    if (!poItem) {
      return { success: false, error: 'PO item not found' }
    }

    const { data: otherAllocations } = await supabase
      .from('forecast_order_allocations')
      .select('allocated_qty')
      .eq('po_item_id', allocation.po_item_id)
      .neq('id', allocationId)

    const otherAllocatedQty = (otherAllocations || []).reduce(
      (sum, a) => sum + a.allocated_qty,
      0
    )
    const totalAllocated = otherAllocatedQty + allocatedQty

    if (totalAllocated > poItem.ordered_qty) {
      return {
        success: false,
        error: `Total allocation (${totalAllocated}) exceeds ordered quantity (${poItem.ordered_qty})`,
      }
    }

    // Update allocation
    const { error } = await supabase
      .from('forecast_order_allocations')
      .update({
        allocated_qty: allocatedQty,
        remarks: remarks || null,
      })
      .eq('id', allocationId)

    if (error) {
      console.error('Update allocation error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/planning/forecast-coverage')
    revalidatePath('/procurement')
    return { success: true }
  } catch (error) {
    console.error('Update allocation error:', error)
    return { success: false, error: 'Failed to update allocation' }
  }
}
