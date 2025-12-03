import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { BalanceResolution, InventoryAdjustment } from '@/lib/types/database'

// ================================================================
// Query: getEffectiveSupply
// Purpose: Get SKU's future effective supply including pending balances
// ================================================================

export async function getEffectiveSupply(sku: string): Promise<{
  onHand: number
  inTransit: number
  openBalance: number
  totalSupply: number
}> {
  const supabase = await createServerSupabaseClient()

  // Get current on-hand inventory
  const { data: inventoryData } = await supabase
    .from('inventory_snapshots')
    .select('qty_on_hand')
    .eq('sku', sku)

  const onHand = inventoryData?.reduce((sum, row) => sum + row.qty_on_hand, 0) || 0

  // Get in-transit quantity (shipments not yet arrived)
  const { data: shipmentsData } = await supabase
    .from('shipment_items')
    .select('shipped_qty, shipments!inner(actual_arrival_date)')
    .eq('sku', sku)

  const inTransit =
    shipmentsData
      ?.filter((row: any) => !row.shipments.actual_arrival_date)
      .reduce((sum, row) => sum + row.shipped_qty, 0) || 0

  // Get open balance quantity
  const { data: balanceData } = await supabase
    .from('balance_resolutions')
    .select('open_balance')
    .eq('sku', sku)
    .in('resolution_status', ['pending', 'deferred'])

  const openBalance = balanceData?.reduce((sum, row) => sum + row.open_balance, 0) || 0

  return {
    onHand,
    inTransit,
    openBalance,
    totalSupply: onHand + inTransit + openBalance,
  }
}

// ================================================================
// Query: getBalanceDashboard
// Purpose: Get balance dashboard summary data
// ================================================================

export async function getBalanceDashboard(): Promise<{
  totalPending: number
  totalDeferred: number
  totalByType: Record<string, number>
}> {
  const supabase = await createServerSupabaseClient()

  const { data: balances } = await supabase
    .from('balance_resolutions')
    .select('resolution_status, source_type')
    .in('resolution_status', ['pending', 'deferred'])
    .gt('open_balance', 0)

  const totalPending = balances?.filter((b) => b.resolution_status === 'pending').length || 0
  const totalDeferred = balances?.filter((b) => b.resolution_status === 'deferred').length || 0

  const totalByType: Record<string, number> = {}
  balances?.forEach((b) => {
    totalByType[b.source_type] = (totalByType[b.source_type] || 0) + 1
  })

  return {
    totalPending,
    totalDeferred,
    totalByType,
  }
}

// ================================================================
// Query: getBalanceById
// Purpose: Get single balance record with enriched data
// ================================================================

export async function getBalanceById(balanceId: string): Promise<BalanceResolution | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('balance_resolutions')
    .select('*')
    .eq('id', balanceId)
    .single()

  if (error || !data) {
    return null
  }

  return data as BalanceResolution
}

// ================================================================
// Query: getBalancesBySource
// Purpose: Get all balances for a specific source entity
// ================================================================

export async function getBalancesBySource(
  sourceType: 'po_item' | 'delivery' | 'shipment_item',
  sourceId: string
): Promise<BalanceResolution[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('balance_resolutions')
    .select('*')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })

  if (error || !data) {
    return []
  }

  return data as BalanceResolution[]
}

// ================================================================
// Query: getRecentAdjustments
// Purpose: Get recent inventory adjustments for a SKU
// ================================================================

export async function getRecentAdjustments(
  sku: string,
  limit = 10
): Promise<InventoryAdjustment[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('inventory_adjustments')
    .select('*')
    .eq('sku', sku)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) {
    return []
  }

  return data as InventoryAdjustment[]
}

// ================================================================
// Query: getPendingApprovals
// Purpose: Get adjustments pending approval
// ================================================================

export async function getPendingApprovals(): Promise<InventoryAdjustment[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('inventory_adjustments')
    .select('*')
    .eq('requires_approval', true)
    .is('approved_at', null)
    .order('created_at', { ascending: true })

  if (error || !data) {
    return []
  }

  return data as InventoryAdjustment[]
}

// ================================================================
// Query: getBalanceHistory
// Purpose: Get closed balances for reporting/audit
// ================================================================

export async function getBalanceHistory(
  sku?: string,
  startDate?: string,
  endDate?: string
): Promise<BalanceResolution[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('balance_resolutions')
    .select('*')
    .in('resolution_status', ['fulfilled', 'short_closed', 'cancelled'])
    .order('closed_at', { ascending: false })

  if (sku) {
    query = query.eq('sku', sku)
  }

  if (startDate) {
    query = query.gte('closed_at', startDate)
  }

  if (endDate) {
    query = query.lte('closed_at', endDate)
  }

  const { data, error } = await query

  if (error || !data) {
    return []
  }

  return data as BalanceResolution[]
}
