'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import type { WeeklySalesForecastInsert, WeeklySalesActualInsert } from '@/lib/types/database'
import {
  weeklySalesForecastInsertSchema,
  weeklySalesActualInsertSchema,
  batchSalesForecastsSchema,
  batchSalesActualsSchema,
  copyForecastsSchema,
  deleteSalesForecastSchema,
} from '@/lib/validations'

/**
 * Create or update sales forecast
 */
export async function upsertSalesForecast(
  forecast: WeeklySalesForecastInsert
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = weeklySalesForecastInsertSchema.safeParse(forecast)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('weekly_sales_forecasts')
    .upsert(validation.data, {
      onConflict: 'year_week,sku,channel_code',
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
  forecasts: WeeklySalesForecastInsert[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = batchSalesForecastsSchema.safeParse(forecasts)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('weekly_sales_forecasts')
    .upsert(validation.data, {
      onConflict: 'year_week,sku,channel_code',
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
  actual: WeeklySalesActualInsert
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = weeklySalesActualInsertSchema.safeParse(actual)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('weekly_sales_actuals')
    .upsert(validation.data, {
      onConflict: 'year_week,sku,channel_code',
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
  actuals: WeeklySalesActualInsert[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = batchSalesActualsSchema.safeParse(actuals)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('weekly_sales_actuals')
    .upsert(validation.data, {
      onConflict: 'year_week,sku,channel_code',
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
  yearWeek: string,
  sku: string,
  channelCode: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = deleteSalesForecastSchema.safeParse({ yearWeek, sku, channelCode })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('weekly_sales_forecasts')
    .delete()
    .eq('year_week', yearWeek)
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
  yearWeek: string,
  sku: string,
  channelCode: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = deleteSalesForecastSchema.safeParse({ yearWeek, sku, channelCode })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('weekly_sales_actuals')
    .delete()
    .eq('year_week', yearWeek)
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
    .from('weekly_sales_forecasts')
    .select('*')
    .eq('year_week', fromWeek)

  if (fetchError) {
    return { success: false, error: fetchError.message }
  }

  if (!sourceForecasts || sourceForecasts.length === 0) {
    return { success: false, error: '源周没有预测数据' }
  }

  // Create new forecasts for target week
  const newForecasts = sourceForecasts.map((f) => ({
    year_week: toWeek,
    sku: f.sku,
    channel_code: f.channel_code,
    forecast_qty: f.forecast_qty,
    remarks: f.remarks,
  }))

  const { error: insertError } = await supabase
    .from('weekly_sales_forecasts')
    .upsert(newForecasts, {
      onConflict: 'year_week,sku,channel_code',
    })

  if (insertError) {
    return { success: false, error: insertError.message }
  }

  revalidatePath('/planning')
  revalidatePath('/planning/forecasts')
  return { success: true, count: newForecasts.length }
}
