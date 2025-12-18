/**
 * Forecast Wizard Server Actions
 *
 * Server-side actions for AI-assisted sales forecast generation
 * Implements three forecast algorithms:
 * 1. Moving Average (4-week MA)
 * 2. Year-over-Year Growth (YoY)
 * 3. Custom Baseline
 *
 * @module actions/forecast-wizard
 */

'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  addWeeksToWeekString,
  getWeekStartDate,
  getWeekEndDate,
} from '@/lib/utils/date'
import type {
  ForecastMethod,
  ForecastSuggestion,
  HistoricalSalesData,
  ForecastValidationResult,
} from '@/lib/types/forecast-wizard'

// ================================================================
// ACTION 1: FETCH HISTORICAL SALES
// ================================================================

/**
 * Fetch historical sales data for the past 12 weeks
 * Used in Step 1 to display context chart and calculate baseline
 *
 * @param sku - Product SKU
 * @param channelCode - Sales channel code
 * @param startWeek - Start week in ISO format (YYYY-WNN)
 * @returns Historical sales data or error
 */
export async function fetchHistoricalSales(
  sku: string,
  channelCode: string,
  startWeek: string
): Promise<{
  success: boolean
  data?: HistoricalSalesData[]
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Calculate 12 weeks back from startWeek
    const endWeek = addWeeksToWeekString(startWeek, -1)
    const startWeekMinus12 = addWeeksToWeekString(startWeek, -12)

    if (!startWeekMinus12 || !endWeek) {
      return { success: false, error: 'Invalid week range' }
    }

    const { data, error } = await supabase
      .from('sales_actuals')
      .select('week_iso, actual_qty')
      .eq('sku', sku)
      .eq('channel_code', channelCode)
      .gte('week_iso', startWeekMinus12)
      .lte('week_iso', endWeek)
      .order('week_iso', { ascending: true })

    if (error) {
      return { success: false, error: error.message }
    }

    const historicalData: HistoricalSalesData[] = (data || []).map((item) => ({
      week_iso: item.week_iso,
      actual_qty: item.actual_qty,
    }))

    return { success: true, data: historicalData }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ================================================================
// ACTION 2: GENERATE FORECAST SUGGESTIONS
// ================================================================

/**
 * Generate AI forecast suggestions using selected algorithm
 * Implements 3 forecast methods: MA, YoY, Custom
 *
 * @param sku - Product SKU
 * @param channelCode - Sales channel code
 * @param startWeek - Start week for forecast
 * @param weekCount - Number of weeks to forecast (4-24)
 * @param method - Forecast method to use
 * @param customBaseline - Custom baseline value (required for 'custom' method)
 * @returns Forecast suggestions with metadata
 */
export async function generateForecastSuggestions(
  sku: string,
  channelCode: string,
  startWeek: string,
  weekCount: number,
  method: ForecastMethod,
  customBaseline?: number
): Promise<{
  success: boolean
  data?: ForecastSuggestion[]
  error?: string
  metadata?: {
    averageValue: number
    confidenceLevel: 'high' | 'medium' | 'low'
  }
}> {
  try {
    // Fetch historical data for calculation
    const historicalResult = await fetchHistoricalSales(sku, channelCode, startWeek)
    if (!historicalResult.success || !historicalResult.data) {
      return { success: false, error: 'No historical data available' }
    }

    const historicalData = historicalResult.data

    let suggestions: ForecastSuggestion[] = []
    let confidenceLevel: 'high' | 'medium' | 'low' = 'medium'

    switch (method) {
      case 'moving_average': {
        // Calculate 4-week moving average
        const recentWeeks = historicalData.slice(-4)
        if (recentWeeks.length < 2) {
          return {
            success: false,
            error: 'Insufficient data for moving average (need at least 2 weeks)',
          }
        }

        const avgQty = Math.round(
          recentWeeks.reduce((sum, d) => sum + d.actual_qty, 0) / recentWeeks.length
        )

        suggestions = generateWeeklyForecasts(startWeek, weekCount, avgQty)
        confidenceLevel = recentWeeks.length >= 4 ? 'high' : 'medium'
        break
      }

      case 'year_over_year': {
        const supabase = await createServerSupabaseClient()

        // Calculate YoY growth rate from past year data
        const currentWeekMinus52 = addWeeksToWeekString(startWeek, -52)
        if (!currentWeekMinus52) {
          return { success: false, error: 'Cannot calculate YoY (invalid week)' }
        }

        const lastYearStartWeek = addWeeksToWeekString(currentWeekMinus52, -12)
        if (!lastYearStartWeek) {
          return { success: false, error: 'Cannot calculate YoY (invalid week range)' }
        }

        const { data: lastYearData } = await supabase
          .from('sales_actuals')
          .select('week_iso, actual_qty')
          .eq('sku', sku)
          .eq('channel_code', channelCode)
          .gte('week_iso', lastYearStartWeek)
          .lte('week_iso', currentWeekMinus52)
          .order('week_iso')

        if (!lastYearData || lastYearData.length === 0) {
          return {
            success: false,
            error: 'No year-over-year data available. Try Moving Average instead.',
          }
        }

        // Calculate growth rate
        const lastYearAvg =
          lastYearData.reduce((sum, d) => sum + d.actual_qty, 0) / lastYearData.length
        const currentAvg =
          historicalData.slice(-4).reduce((sum, d) => sum + d.actual_qty, 0) /
          Math.min(4, historicalData.length)
        const growthRate = lastYearAvg > 0 ? (currentAvg - lastYearAvg) / lastYearAvg : 0

        suggestions = generateWeeklyForecastsWithGrowth(
          startWeek,
          weekCount,
          currentAvg,
          growthRate
        )
        confidenceLevel = lastYearData.length >= 8 ? 'high' : 'low'
        break
      }

      case 'custom': {
        if (!customBaseline || customBaseline <= 0) {
          return {
            success: false,
            error: 'Custom baseline value is required and must be > 0',
          }
        }

        suggestions = generateWeeklyForecasts(startWeek, weekCount, customBaseline)
        confidenceLevel = 'low'
        break
      }

      default:
        return { success: false, error: 'Invalid forecast method' }
    }

    const averageValue =
      suggestions.reduce((sum, s) => sum + s.forecast_qty, 0) / suggestions.length

    return {
      success: true,
      data: suggestions,
      metadata: {
        averageValue: Math.round(averageValue),
        confidenceLevel,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ================================================================
// ACTION 3: VALIDATE FORECAST VALUES
// ================================================================

/**
 * Validate forecast values against business rules
 * Checks for:
 * - Negative values
 * - Zero values
 * - >50% variance vs historical average
 * - Stockout risk
 *
 * @param sku - Product SKU
 * @param channelCode - Sales channel code
 * @param forecastValues - Array of forecast values to validate
 * @returns Validation result with warnings and errors
 */
export async function validateForecastValues(
  sku: string,
  channelCode: string,
  forecastValues: { week_iso: string; forecast_qty: number }[]
): Promise<{
  success: boolean
  data?: ForecastValidationResult
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Fetch product safety stock threshold
    const { data: product } = await supabase
      .from('products')
      .select('safety_stock_weeks')
      .eq('sku', sku)
      .single()

    const safetyStockWeeks = product?.safety_stock_weeks || 2

    // Fetch historical average for variance calculation
    const firstWeek = forecastValues[0]?.week_iso
    if (!firstWeek) {
      return { success: false, error: 'No forecast values provided' }
    }

    const historicalResult = await fetchHistoricalSales(sku, channelCode, firstWeek)
    const historicalAvg =
      historicalResult.data && historicalResult.data.length > 0
        ? historicalResult.data.reduce((sum, d) => sum + d.actual_qty, 0) /
          historicalResult.data.length
        : 0

    const warnings: { week_iso: string; message: string; severity: 'warning' | 'error' | 'info' }[] = []
    const errors: { week_iso: string; message: string }[] = []

    forecastValues.forEach(({ week_iso, forecast_qty }) => {
      // Rule 1: Negative values
      if (forecast_qty < 0) {
        errors.push({ week_iso, message: 'Forecast quantity cannot be negative' })
      }

      // Rule 2: Zero values for active SKU
      if (forecast_qty === 0) {
        warnings.push({
          week_iso,
          message: 'Forecast is zero. Confirm if product is being discontinued.',
          severity: 'warning',
        })
      }

      // Rule 3: Variance check (>50% vs historical avg)
      if (historicalAvg > 0) {
        const variance = Math.abs(forecast_qty - historicalAvg)
        const variancePct = (variance / historicalAvg) * 100

        if (variancePct > 50) {
          warnings.push({
            week_iso,
            message: `Forecast ${forecast_qty} is ${variancePct.toFixed(0)}% different from historical average (${Math.round(historicalAvg)})`,
            severity: 'warning',
          })
        }
      }

      // Rule 4: Stockout risk (forecast < safety threshold)
      // Note: This is a simplified check. In reality, we'd need current inventory levels.
      if (historicalAvg > 0) {
        const avgWeeklySales = historicalAvg
        const safetyThreshold = avgWeeklySales * safetyStockWeeks

        if (forecast_qty > 0 && forecast_qty < safetyThreshold * 0.5) {
          warnings.push({
            week_iso,
            message: `Low forecast (${forecast_qty}) may indicate future stockout risk (safety stock: ${safetyStockWeeks} weeks)`,
            severity: 'info',
          })
        }
      }
    })

    const isValid = errors.length === 0

    return {
      success: true,
      data: {
        isValid,
        warnings,
        errors,
        summary: {
          totalWeeks: forecastValues.length,
          totalQuantity: forecastValues.reduce((sum, f) => sum + f.forecast_qty, 0),
          averageWeekly: Math.round(
            forecastValues.reduce((sum, f) => sum + f.forecast_qty, 0) / forecastValues.length
          ),
          historicalAverage: Math.round(historicalAvg),
        },
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ================================================================
// ACTION 4: SAVE FORECAST BATCH
// ================================================================

/**
 * Save forecast batch to database (atomic UPSERT)
 * Updates existing forecasts or creates new ones
 *
 * @param forecastData - Array of forecast data to save
 * @returns Success status and count of saved records
 */
export async function saveForecastBatch(
  forecastData: {
    sku: string
    channel_code: string
    week_iso: string
    week_start_date: string
    week_end_date: string
    forecast_qty: number
  }[]
): Promise<{
  success: boolean
  savedCount?: number
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Batch upsert (INSERT ON CONFLICT UPDATE)
    const { data, error } = await supabase
      .from('sales_forecasts')
      .upsert(
        forecastData.map((f) => ({
          sku: f.sku,
          channel_code: f.channel_code,
          week_iso: f.week_iso,
          week_start_date: f.week_start_date,
          week_end_date: f.week_end_date,
          forecast_qty: f.forecast_qty,
          updated_at: new Date().toISOString(),
        })),
        {
          onConflict: 'sku,channel_code,week_iso',
          ignoreDuplicates: false,
        }
      )
      .select()

    if (error) {
      return { success: false, error: error.message }
    }

    // Revalidate planning pages
    revalidatePath('/planning/forecasts')
    revalidatePath('/planning')

    return {
      success: true,
      savedCount: data?.length || 0,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

/**
 * Generate weekly forecasts with uniform baseline quantity
 *
 * @param startWeek - Start week in ISO format
 * @param weekCount - Number of weeks to generate
 * @param baseQty - Baseline quantity for all weeks
 * @returns Array of forecast suggestions
 */
function generateWeeklyForecasts(
  startWeek: string,
  weekCount: number,
  baseQty: number
): ForecastSuggestion[] {
  const forecasts: ForecastSuggestion[] = []

  for (let i = 0; i < weekCount; i++) {
    const week = addWeeksToWeekString(startWeek, i)
    if (!week) continue

    const weekStart = getWeekStartDate(week)
    const weekEnd = getWeekEndDate(week)

    forecasts.push({
      week_iso: week,
      week_start_date: weekStart,
      week_end_date: weekEnd,
      forecast_qty: Math.round(baseQty),
    })
  }

  return forecasts
}

/**
 * Generate weekly forecasts with growth rate applied
 *
 * @param startWeek - Start week in ISO format
 * @param weekCount - Number of weeks to generate
 * @param baseQty - Baseline quantity
 * @param growthRate - YoY growth rate (e.g., 0.12 for 12% growth)
 * @returns Array of forecast suggestions
 */
function generateWeeklyForecastsWithGrowth(
  startWeek: string,
  weekCount: number,
  baseQty: number,
  growthRate: number
): ForecastSuggestion[] {
  const forecasts: ForecastSuggestion[] = []

  for (let i = 0; i < weekCount; i++) {
    const week = addWeeksToWeekString(startWeek, i)
    if (!week) continue

    const weekStart = getWeekStartDate(week)
    const weekEnd = getWeekEndDate(week)

    // Apply growth rate with slight weekly increment
    const adjustedQty = Math.round(baseQty * (1 + growthRate + i * 0.005))

    forecasts.push({
      week_iso: week,
      week_start_date: weekStart,
      week_end_date: weekEnd,
      forecast_qty: adjustedQty,
    })
  }

  return forecasts
}
