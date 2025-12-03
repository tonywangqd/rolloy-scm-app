'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import type {
  BalanceResolution,
  ResolveBalanceRequest,
  ResolveBalanceResponse,
  CreateAdjustmentRequest,
  CreateAdjustmentResponse,
  FinalizeShipmentResponse,
  BalanceSummaryKPIs,
  BalanceListItem,
  BalanceFilters,
  InventoryAdjustment,
  InventoryAdjustmentType,
} from '@/lib/types/database'

// ================================================================
// Server Action: resolveBalance
// Purpose: Process balance resolution actions (defer, short_close)
// ================================================================

export async function resolveBalance(
  request: ResolveBalanceRequest
): Promise<{ success: boolean; data?: ResolveBalanceResponse; error?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    // Validate required fields based on action
    if (request.action === 'defer') {
      if (!request.deferredToWeek && !request.deferredDate) {
        return {
          success: false,
          error: 'Deferred date or week is required for defer action',
        }
      }
    }

    if (request.action === 'short_close') {
      if (!request.reason || request.reason.trim() === '') {
        return {
          success: false,
          error: 'Reason is required for short close action',
        }
      }
    }

    // Call database function
    const { data, error } = await supabase.rpc('resolve_balance', {
      p_balance_id: request.balanceId,
      p_action: request.action,
      p_deferred_to_week: request.deferredToWeek || null,
      p_deferred_date: request.deferredDate || null,
      p_reason: request.reason || null,
    })

    if (error) {
      console.error('Error resolving balance:', error)
      return { success: false, error: error.message }
    }

    // Parse JSONB response
    const result = data as ResolveBalanceResponse

    if (!result.success) {
      return { success: false, error: result.message }
    }

    // Revalidate affected pages
    revalidatePath('/balance-management')
    revalidatePath('/planning')
    revalidatePath('/procurement')

    return { success: true, data: result }
  } catch (err) {
    console.error('Exception in resolveBalance:', err)
    return {
      success: false,
      error: `Failed to resolve balance: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// Server Action: createInventoryAdjustment
// Purpose: Create manual inventory adjustment record
// ================================================================

export async function createInventoryAdjustment(
  request: CreateAdjustmentRequest
): Promise<{ success: boolean; data?: CreateAdjustmentResponse; error?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    // Validate inputs
    if (!request.sku || request.sku.trim() === '') {
      return { success: false, error: 'SKU is required' }
    }

    if (!request.warehouseId) {
      return { success: false, error: 'Warehouse ID is required' }
    }

    if (request.qtyChange === 0) {
      return { success: false, error: 'Quantity change cannot be zero' }
    }

    if (!request.reason || request.reason.trim() === '') {
      return { success: false, error: 'Reason is required' }
    }

    // Call database function
    const { data, error } = await supabase.rpc('create_inventory_adjustment', {
      p_sku: request.sku,
      p_warehouse_id: request.warehouseId,
      p_adjustment_type: request.adjustmentType,
      p_qty_before: request.qtyBefore,
      p_qty_change: request.qtyChange,
      p_reason: request.reason,
      p_notes: request.notes || null,
      p_source_type: request.sourceType || null,
      p_source_id: request.sourceId || null,
    })

    if (error) {
      console.error('Error creating adjustment:', error)
      return { success: false, error: error.message }
    }

    // Parse JSONB response
    const result = data as CreateAdjustmentResponse

    if (!result.success) {
      return { success: false, error: 'Failed to create adjustment' }
    }

    revalidatePath('/inventory')
    revalidatePath('/balance-management')

    return { success: true, data: result }
  } catch (err) {
    console.error('Exception in createInventoryAdjustment:', err)
    return {
      success: false,
      error: `Failed to create inventory adjustment: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// Server Action: finalizeShipment
// Purpose: Mark shipment as finalized and create adjustments for variance
// ================================================================

export async function finalizeShipment(
  shipmentId: string
): Promise<{ success: boolean; data?: FinalizeShipmentResponse; error?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    if (!shipmentId) {
      return { success: false, error: 'Shipment ID is required' }
    }

    // Call database function
    const { data, error } = await supabase.rpc('finalize_shipment', {
      p_shipment_id: shipmentId,
    })

    if (error) {
      console.error('Error finalizing shipment:', error)
      return { success: false, error: error.message }
    }

    // Parse JSONB response
    const result = data as FinalizeShipmentResponse

    if (!result.success) {
      return { success: false, error: 'Failed to finalize shipment' }
    }

    revalidatePath('/logistics')
    revalidatePath('/inventory')

    return { success: true, data: result }
  } catch (err) {
    console.error('Exception in finalizeShipment:', err)
    return {
      success: false,
      error: `Failed to finalize shipment: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// Server Action: getOpenBalances
// Purpose: Fetch open balances with filters and enriched data
// ================================================================

export async function getOpenBalances(
  filters?: BalanceFilters
): Promise<{ success: boolean; data?: BalanceListItem[]; error?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('balance_resolutions')
      .select(
        `
        *,
        products!inner(product_name)
      `
      )
      .in('resolution_status', ['pending', 'deferred'])
      .gt('open_balance', 0)
      .order('created_at', { ascending: false })

    // Apply filters
    if (filters?.sku) {
      query = query.eq('sku', filters.sku)
    }

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('resolution_status', filters.status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching open balances:', error)
      return { success: false, error: error.message }
    }

    // Transform data
    const transformed: BalanceListItem[] = (data || []).map((row: any) => {
      const ageDays = Math.floor(
        (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      let priority: 'Critical' | 'High' | 'Medium' | 'Low'
      if (ageDays > 45) priority = 'Critical'
      else if (ageDays > 15) priority = 'High'
      else if (ageDays > 7) priority = 'Medium'
      else priority = 'Low'

      // Apply priority filter
      if (filters?.priority && filters.priority !== priority) {
        return null
      }

      // Apply age filters
      if (filters?.minAgeDays !== undefined && ageDays < filters.minAgeDays) {
        return null
      }
      if (filters?.maxAgeDays !== undefined && ageDays > filters.maxAgeDays) {
        return null
      }

      const parentReference = `${row.source_type.toUpperCase()}#${row.source_id.substring(0, 8)}`

      return {
        ...row,
        productName: row.products.product_name,
        ageDays,
        priority,
        parentReference,
      }
    }).filter((item): item is BalanceListItem => item !== null)

    return { success: true, data: transformed }
  } catch (err) {
    console.error('Exception in getOpenBalances:', err)
    return {
      success: false,
      error: `Failed to fetch open balances: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// Server Action: getBalanceSummaryKPIs
// Purpose: Get aggregated KPIs for balance dashboard
// ================================================================

export async function getBalanceSummaryKPIs(
  sku?: string
): Promise<{ success: boolean; data?: BalanceSummaryKPIs; error?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc('get_open_balances_summary', {
      p_sku: sku || null,
    })

    if (error) {
      console.error('Error fetching balance summary:', error)
      return { success: false, error: error.message }
    }

    if (!data || data.length === 0) {
      // Return empty KPIs if no data
      return {
        success: true,
        data: {
          totalOpenBalances: 0,
          totalOpenQty: 0,
          criticalCount: 0,
          highPriorityCount: 0,
          pendingCount: 0,
          deferredCount: 0,
          avgAgeDays: 0,
          oldestBalanceDays: 0,
        },
      }
    }

    const result = data[0] as any

    const kpis: BalanceSummaryKPIs = {
      totalOpenBalances: Number(result.total_open_balances) || 0,
      totalOpenQty: Number(result.total_open_qty) || 0,
      criticalCount: Number(result.critical_count) || 0,
      highPriorityCount: Number(result.high_priority_count) || 0,
      pendingCount: Number(result.pending_count) || 0,
      deferredCount: Number(result.deferred_count) || 0,
      avgAgeDays: Number(result.avg_age_days) || 0,
      oldestBalanceDays: Number(result.oldest_balance_days) || 0,
    }

    return { success: true, data: kpis }
  } catch (err) {
    console.error('Exception in getBalanceSummaryKPIs:', err)
    return {
      success: false,
      error: `Failed to fetch balance summary: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// Server Action: updateBalanceActualQty
// Purpose: Update actual_qty when subsequent deliveries/receipts occur
// ================================================================

export async function updateBalanceActualQty(
  balanceId: string,
  newActualQty: number
): Promise<{ success: boolean; autoFulfilled?: boolean; error?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    // Fetch current balance
    const { data: balance, error: fetchError } = await supabase
      .from('balance_resolutions')
      .select('actual_qty, planned_qty')
      .eq('id', balanceId)
      .single()

    if (fetchError) {
      return { success: false, error: fetchError.message }
    }

    if (!balance) {
      return { success: false, error: 'Balance not found' }
    }

    // Update actual_qty
    const { error: updateError } = await supabase
      .from('balance_resolutions')
      .update({ actual_qty: newActualQty })
      .eq('id', balanceId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    const autoFulfilled = newActualQty >= balance.planned_qty

    revalidatePath('/balance-management')

    return { success: true, autoFulfilled }
  } catch (err) {
    console.error('Exception in updateBalanceActualQty:', err)
    return {
      success: false,
      error: `Failed to update balance: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// Server Action: getInventoryAdjustments
// Purpose: Fetch inventory adjustment history
// ================================================================

export async function getInventoryAdjustments(
  sku?: string,
  warehouseId?: string,
  adjustmentType?: InventoryAdjustmentType
): Promise<{ success: boolean; data?: InventoryAdjustment[]; error?: string }> {
  try {
    // Check authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('inventory_adjustments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (sku) {
      query = query.eq('sku', sku)
    }

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId)
    }

    if (adjustmentType) {
      query = query.eq('adjustment_type', adjustmentType)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching adjustments:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data as InventoryAdjustment[] }
  } catch (err) {
    console.error('Exception in getInventoryAdjustments:', err)
    return {
      success: false,
      error: `Failed to fetch adjustments: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
