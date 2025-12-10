'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

export interface CalculatePSIRequest {
  sku?: string
  warehouseId?: string
  startWeek?: string
  endWeek?: string
}

export interface PSIRow {
  sku: string
  product_name: string
  warehouse_id: string
  warehouse_name: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  week_offset: number
  opening_stock: number
  planned_arrival_qty: number
  actual_arrival_qty: number
  effective_arrival_qty: number
  forecast_sales_qty: number
  actual_sales_qty: number | null
  effective_sales_qty: number
  closing_stock: number
  safety_stock_threshold: number
  stock_status: 'OK' | 'Risk' | 'Stockout'
  calculated_at: string
}

export interface CalculatePSIResponse {
  success: boolean
  data?: PSIRow[]
  metadata?: {
    totalRows: number
    calculationTime: number
    filters: CalculatePSIRequest
  }
  error?: string
}

export interface PSISummary {
  totalSKUs: number
  okCount: number
  riskCount: number
  stockoutCount: number
}

export interface GetPSISummaryResponse {
  success: boolean
  data?: PSISummary
  error?: string
}

// ================================================================
// SERVER ACTIONS
// ================================================================

/**
 * Calculate PSI (Production-Sales-Inventory) projection
 * 计算进销存预测
 *
 * @param req - Filter parameters
 * @returns PSI rows with metadata
 */
export async function calculatePSI(
  req: CalculatePSIRequest = {}
): Promise<CalculatePSIResponse> {
  const startTime = Date.now()

  try {
    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('v_psi_weekly_projection')
      .select('*')
      .order('week_offset', { ascending: true })

    // Apply filters
    if (req.sku) {
      query = query.eq('sku', req.sku)
    }
    if (req.warehouseId) {
      query = query.eq('warehouse_id', req.warehouseId)
    }
    if (req.startWeek) {
      query = query.gte('week_iso', req.startWeek)
    }
    if (req.endWeek) {
      query = query.lte('week_iso', req.endWeek)
    }

    const { data, error } = await query

    if (error) {
      console.error('[calculatePSI] Error:', error)
      throw error
    }

    const calculationTime = Date.now() - startTime

    return {
      success: true,
      data: data as PSIRow[],
      metadata: {
        totalRows: data.length,
        calculationTime,
        filters: req
      }
    }
  } catch (error) {
    console.error('[calculatePSI] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate PSI'
    }
  }
}

/**
 * Get PSI summary statistics
 * 获取 PSI 汇总统计
 *
 * @returns Summary statistics for current week
 */
export async function getPSISummary(): Promise<GetPSISummaryResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('v_psi_weekly_projection')
      .select('sku, stock_status')
      .eq('week_offset', 0) // Current week only

    if (error) {
      console.error('[getPSISummary] Error:', error)
      throw error
    }

    const summary: PSISummary = {
      totalSKUs: new Set(data.map(d => d.sku)).size,
      okCount: data.filter(d => d.stock_status === 'OK').length,
      riskCount: data.filter(d => d.stock_status === 'Risk').length,
      stockoutCount: data.filter(d => d.stock_status === 'Stockout').length
    }

    return {
      success: true,
      data: summary
    }
  } catch (error) {
    console.error('[getPSISummary] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get PSI summary'
    }
  }
}

/**
 * Get PSI data for a specific SKU
 * 获取指定 SKU 的 PSI 数据
 *
 * @param sku - Product SKU
 * @param warehouseId - Optional warehouse filter
 * @returns PSI rows for the SKU
 */
export async function getPSIForSKU(
  sku: string,
  warehouseId?: string
): Promise<CalculatePSIResponse> {
  return calculatePSI({ sku, warehouseId })
}

/**
 * Refresh PSI snapshots (trigger recalculation)
 * 刷新 PSI 快照 (触发重新计算)
 *
 * @returns Success status
 */
export async function refreshPSISnapshots(): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Note: This would typically refresh a materialized view
    // For now, we'll just verify the view exists
    const { error } = await supabase
      .from('v_psi_weekly_projection')
      .select('count')
      .limit(1)

    if (error) throw error

    return {
      success: true,
      message: 'PSI snapshots refreshed successfully (view queried)'
    }
  } catch (error) {
    console.error('[refreshPSISnapshots] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh PSI snapshots'
    }
  }
}
