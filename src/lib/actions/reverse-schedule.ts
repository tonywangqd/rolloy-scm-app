'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

export interface ReverseScheduleRequest {
  sku: string
  targetSalesWeek: string
  targetSalesQty: number
}

export interface ReverseScheduleBreakdown {
  targetSalesWeek: string
  targetSalesQty: number
  productionLeadWeeks: number
  loadingBufferWeeks: number
  transitTimeWeeks: number
  inboundBufferWeeks: number
  totalLeadTimeWeeks: number
}

export interface ReverseScheduleResult {
  suggestedOrderWeek: string
  suggestedOrderDate: string
  suggestedFulfillmentWeek: string
  suggestedShipWeek: string
  suggestedArrivalWeek: string
  breakdown: ReverseScheduleBreakdown
}

export interface ReverseScheduleResponse {
  success: boolean
  data?: ReverseScheduleResult
  error?: string
}

export interface OrderSuggestion {
  sku: string
  productName: string
  spu: string
  salesWeek: string
  forecastQty: number
  coveredQty: number
  suggestedOrderQty: number
  suggestedOrderWeek: string
  suggestedOrderDate: string
  suggestedFulfillmentWeek: string
  suggestedShipWeek: string
  suggestedArrivalWeek: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  isOverdue: boolean
  leadTimeBreakdown: ReverseScheduleBreakdown
  calculatedAt: string
}

export interface GetOrderSuggestionsResponse {
  success: boolean
  data?: OrderSuggestion[]
  metadata?: {
    totalSuggestions: number
    criticalCount: number
    highCount: number
    overdueCount: number
  }
  error?: string
}

// ================================================================
// SERVER ACTIONS
// ================================================================

/**
 * Calculate reverse schedule for a single sales demand
 * 计算单个销售需求的倒排排程
 *
 * @param req - Sales demand information
 * @returns Suggested timeline with breakdown
 */
export async function calculateReverseSchedule(
  req: ReverseScheduleRequest
): Promise<ReverseScheduleResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc('calculate_reverse_schedule', {
      p_sku: req.sku,
      p_target_sales_week: req.targetSalesWeek,
      p_target_sales_qty: req.targetSalesQty
    })

    if (error) {
      console.error('[calculateReverseSchedule] Error:', error)
      throw error
    }

    if (!data || data.length === 0) {
      throw new Error('No result returned from reverse schedule calculation')
    }

    const result = data[0]

    return {
      success: true,
      data: {
        suggestedOrderWeek: result.suggested_order_week,
        suggestedOrderDate: result.suggested_order_date,
        suggestedFulfillmentWeek: result.suggested_fulfillment_week,
        suggestedShipWeek: result.suggested_ship_week,
        suggestedArrivalWeek: result.suggested_arrival_week,
        breakdown: result.breakdown as ReverseScheduleBreakdown
      }
    }
  } catch (error) {
    console.error('[calculateReverseSchedule] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate reverse schedule'
    }
  }
}

/**
 * Calculate reverse schedule for multiple SKUs in batch
 * 批量计算多个 SKU 的倒排排程
 *
 * @param requests - Array of sales demands
 * @returns Array of schedule results
 */
export async function calculateReverseScheduleBatch(
  requests: ReverseScheduleRequest[]
): Promise<ReverseScheduleResponse[]> {
  return Promise.all(requests.map(req => calculateReverseSchedule(req)))
}

/**
 * Get all order suggestions based on uncovered forecasts
 * 获取所有基于未覆盖预测的下单建议
 *
 * @param filters - Optional filters (priority, overdue only, etc.)
 * @returns List of order suggestions
 */
export async function getOrderSuggestions(filters?: {
  priority?: 'Critical' | 'High' | 'Medium' | 'Low'
  overdueOnly?: boolean
  sku?: string
}): Promise<GetOrderSuggestionsResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('v_reverse_schedule_suggestions')
      .select('*')
      .order('priority', { ascending: true })
      .order('sales_week', { ascending: true })

    // Apply filters
    if (filters?.priority) {
      query = query.eq('priority', filters.priority)
    }
    if (filters?.overdueOnly) {
      query = query.eq('is_overdue', true)
    }
    if (filters?.sku) {
      query = query.eq('sku', filters.sku)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getOrderSuggestions] Error:', error)
      throw error
    }

    // Transform data to match interface
    const suggestions: OrderSuggestion[] = (data || []).map((row: any) => ({
      sku: row.sku,
      productName: row.product_name,
      spu: row.spu,
      salesWeek: row.sales_week,
      forecastQty: row.forecast_qty,
      coveredQty: row.covered_qty,
      suggestedOrderQty: row.suggested_order_qty,
      suggestedOrderWeek: row.suggested_order_week,
      suggestedOrderDate: row.suggested_order_date,
      suggestedFulfillmentWeek: row.suggested_fulfillment_week,
      suggestedShipWeek: row.suggested_ship_week,
      suggestedArrivalWeek: row.suggested_arrival_week,
      priority: row.priority,
      isOverdue: row.is_overdue,
      leadTimeBreakdown: row.lead_time_breakdown,
      calculatedAt: row.calculated_at
    }))

    // Calculate metadata
    const metadata = {
      totalSuggestions: suggestions.length,
      criticalCount: suggestions.filter(s => s.priority === 'Critical').length,
      highCount: suggestions.filter(s => s.priority === 'High').length,
      overdueCount: suggestions.filter(s => s.isOverdue).length
    }

    return {
      success: true,
      data: suggestions,
      metadata
    }
  } catch (error) {
    console.error('[getOrderSuggestions] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get order suggestions'
    }
  }
}

/**
 * Get order suggestions for a specific SKU
 * 获取指定 SKU 的下单建议
 *
 * @param sku - Product SKU
 * @returns Order suggestions for the SKU
 */
export async function getOrderSuggestionsForSKU(
  sku: string
): Promise<GetOrderSuggestionsResponse> {
  return getOrderSuggestions({ sku })
}
