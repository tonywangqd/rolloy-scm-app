/**
 * Supply Chain Variance Management Actions
 * Backend Specialist - Rolloy SCM
 */

'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { SupplyChainVariance } from '@/lib/types/database'

/**
 * 更新差异的预计处理周
 */
export async function updateVariancePlannedWeek(
  varianceId: string,
  plannedWeek: string | null,
  remarks?: string
): Promise<{
  success: boolean
  error?: string
  data?: SupplyChainVariance
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // 验证 week 格式
    if (plannedWeek && !/^\d{4}-W\d{2}$/.test(plannedWeek)) {
      return { success: false, error: 'Invalid week format. Expected YYYY-WW' }
    }

    const { data, error } = await supabase
      .from('supply_chain_variances')
      .update({
        planned_week: plannedWeek,
        remarks: remarks || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', varianceId)
      .select()
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (err) {
    console.error('Error updating variance planned week:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * 批量更新差异预计周 (用于批量操作)
 */
export async function batchUpdateVariancePlannedWeek(
  updates: Array<{ variance_id: string; planned_week: string | null }>
): Promise<{
  success: boolean
  error?: string
  updated_count: number
}> {
  try {
    const supabase = await createServerSupabaseClient()
    let updated_count = 0

    for (const { variance_id, planned_week } of updates) {
      // 验证 week 格式
      if (planned_week && !/^\d{4}-W\d{2}$/.test(planned_week)) {
        continue // Skip invalid formats
      }

      const { error } = await supabase
        .from('supply_chain_variances')
        .update({ planned_week, updated_at: new Date().toISOString() })
        .eq('id', variance_id)

      if (!error) updated_count++
    }

    return { success: true, updated_count }
  } catch (err) {
    console.error('Error batch updating variances:', err)
    return { success: false, error: String(err), updated_count: 0 }
  }
}

/**
 * 标记差异为已取消 (短装关闭)
 */
export async function cancelVariance(
  varianceId: string,
  reason: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('supply_chain_variances')
      .update({
        status: 'cancelled',
        remarks: reason,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', varianceId)

    if (error) throw error

    return { success: true }
  } catch (err) {
    console.error('Error cancelling variance:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * 手动创建差异记录 (用于修正)
 */
export async function createManualVariance(
  variance: {
    source_type: string
    source_id: string
    sku: string
    channel_code?: string | null
    planned_qty: number
    fulfilled_qty?: number
    planned_week?: string | null
    remarks?: string
  }
): Promise<{
  success: boolean
  error?: string
  data?: SupplyChainVariance
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // 验证 source_type
    if (!['order_to_delivery', 'delivery_to_ship', 'ship_to_arrival'].includes(variance.source_type)) {
      return { success: false, error: 'Invalid source_type' }
    }

    // 验证 week 格式
    if (variance.planned_week && !/^\d{4}-W\d{2}$/.test(variance.planned_week)) {
      return { success: false, error: 'Invalid week format. Expected YYYY-WW' }
    }

    const { data, error } = await supabase
      .from('supply_chain_variances')
      .insert(variance)
      .select()
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (err) {
    console.error('Error creating manual variance:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * 删除差异记录 (仅限管理员)
 */
export async function deleteVariance(
  varianceId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('supply_chain_variances')
      .delete()
      .eq('id', varianceId)

    if (error) throw error

    return { success: true }
  } catch (err) {
    console.error('Error deleting variance:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * 批量取消差异 (短装关闭)
 */
export async function batchCancelVariances(
  varianceIds: string[],
  reason: string
): Promise<{
  success: boolean
  error?: string
  cancelled_count: number
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { error, count } = await supabase
      .from('supply_chain_variances')
      .update({
        status: 'cancelled',
        remarks: reason,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in('id', varianceIds)

    if (error) throw error

    return { success: true, cancelled_count: count || 0 }
  } catch (err) {
    console.error('Error batch cancelling variances:', err)
    return { success: false, error: String(err), cancelled_count: 0 }
  }
}
