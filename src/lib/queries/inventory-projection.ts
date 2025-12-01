/**
 * Rolloy SCM System - Inventory Projection Queries
 *
 * This module provides query functions for the 12-week inventory projection feature.
 * It interacts with materialized views that calculate rolling inventory forecasts
 * using dual-track logic (actual vs forecast sales).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  InventoryProjection12WeeksView,
  ReplenishmentSuggestionView,
  InventoryProjectionFilters,
  ReplenishmentSuggestionFilters,
  RiskSummaryStats,
} from '@/lib/types/database'

// ================================================================
// INVENTORY PROJECTION QUERIES
// ================================================================

/**
 * Fetch 12-week inventory projection with optional filters
 *
 * @param filters - Optional filters for SKU, week, and stock status
 * @returns Array of inventory projection records
 */
export async function fetchInventoryProjection12Weeks(
  filters?: InventoryProjectionFilters
): Promise<InventoryProjection12WeeksView[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_inventory_projection_12weeks')
    .select('*')

  // Apply filters
  if (filters?.sku) {
    query = query.eq('sku', filters.sku)
  }

  if (filters?.skus && filters.skus.length > 0) {
    query = query.in('sku', filters.skus)
  }

  if (filters?.week_iso) {
    query = query.eq('week_iso', filters.week_iso)
  }

  if (filters?.stock_status && filters.stock_status !== 'All') {
    query = query.eq('stock_status', filters.stock_status)
  }

  if (filters?.min_week_offset !== undefined) {
    query = query.gte('week_offset', filters.min_week_offset)
  }

  if (filters?.max_week_offset !== undefined) {
    query = query.lte('week_offset', filters.max_week_offset)
  }

  // Order by SKU and week
  query = query.order('sku').order('week_offset')

  const { data, error } = await query

  if (error) {
    console.error('Error fetching inventory projection:', error)
    throw new Error(`Failed to fetch inventory projection: ${error.message}`)
  }

  return (data || []) as InventoryProjection12WeeksView[]
}

/**
 * Fetch inventory projection for a specific SKU
 *
 * @param sku - The SKU to fetch projections for
 * @returns Array of 12 weekly projection records for the SKU
 */
export async function fetchProjectionBySku(
  sku: string
): Promise<InventoryProjection12WeeksView[]> {
  return fetchInventoryProjection12Weeks({ sku })
}

/**
 * Fetch inventory projections grouped by SKU
 * Returns the complete 12-week projection for each SKU
 *
 * @returns Map of SKU to array of weekly projections
 */
export async function fetchProjectionsGroupedBySku(): Promise<
  Map<string, InventoryProjection12WeeksView[]>
> {
  const projections = await fetchInventoryProjection12Weeks()

  const grouped = new Map<string, InventoryProjection12WeeksView[]>()

  projections.forEach((projection) => {
    if (!grouped.has(projection.sku)) {
      grouped.set(projection.sku, [])
    }
    grouped.get(projection.sku)!.push(projection)
  })

  return grouped
}

/**
 * Fetch inventory projections for a specific week
 *
 * @param week_iso - The ISO week string (e.g., '2025-W05')
 * @returns Array of projections for all SKUs in that week
 */
export async function fetchProjectionByWeek(
  week_iso: string
): Promise<InventoryProjection12WeeksView[]> {
  return fetchInventoryProjection12Weeks({ week_iso })
}

/**
 * Fetch risk summary statistics
 * Aggregates counts by stock status and priority
 *
 * @returns Summary statistics object
 */
export async function fetchRiskSummary(): Promise<RiskSummaryStats> {
  const supabase = await createServerSupabaseClient()

  // Get projection stats (week 0 only - current week snapshot)
  const { data: projections } = await supabase
    .from('v_inventory_projection_12weeks')
    .select('sku, stock_status')
    .eq('week_offset', 0)

  // Get replenishment suggestion stats
  const { data: suggestions } = await supabase
    .from('v_replenishment_suggestions')
    .select('priority, is_overdue')

  // Calculate projection stats
  const uniqueSkus = new Set((projections || []).map((p) => p.sku))
  const statusCounts = {
    ok: 0,
    risk: 0,
    stockout: 0,
  }

  ;(projections || []).forEach((p) => {
    if (p.stock_status === 'OK') statusCounts.ok++
    else if (p.stock_status === 'Risk') statusCounts.risk++
    else if (p.stock_status === 'Stockout') statusCounts.stockout++
  })

  // Calculate suggestion stats
  const priorityCounts = {
    critical: 0,
    high: 0,
  }
  let overdueCount = 0

  ;(suggestions || []).forEach((s) => {
    if (s.priority === 'Critical') priorityCounts.critical++
    else if (s.priority === 'High') priorityCounts.high++
    if (s.is_overdue) overdueCount++
  })

  return {
    total_skus: uniqueSkus.size,
    ok_count: statusCounts.ok,
    risk_count: statusCounts.risk,
    stockout_count: statusCounts.stockout,
    critical_priority_count: priorityCounts.critical,
    high_priority_count: priorityCounts.high,
    overdue_count: overdueCount,
  }
}

/**
 * Fetch SKUs at risk (Stockout or Risk status) in any of the 12 weeks
 *
 * @returns Array of unique SKUs with their earliest risk week
 */
export async function fetchSkusAtRisk(): Promise<{
  sku: string
  product_name: string
  first_risk_week: string
  first_risk_week_offset: number
  stock_status: 'Stockout' | 'Risk'
  closing_stock: number
}[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_inventory_projection_12weeks')
    .select('sku, product_name, week_iso, week_offset, stock_status, closing_stock')
    .in('stock_status', ['Stockout', 'Risk'])
    .order('sku')
    .order('week_offset')

  if (error) {
    console.error('Error fetching SKUs at risk:', error)
    throw new Error(`Failed to fetch SKUs at risk: ${error.message}`)
  }

  // Get first risk week for each SKU
  const riskMap = new Map<string, {
    sku: string
    product_name: string
    first_risk_week: string
    first_risk_week_offset: number
    stock_status: 'Stockout' | 'Risk'
    closing_stock: number
  }>()

  ;(data || []).forEach((row) => {
    if (!riskMap.has(row.sku)) {
      riskMap.set(row.sku, {
        sku: row.sku,
        product_name: row.product_name,
        first_risk_week: row.week_iso,
        first_risk_week_offset: row.week_offset,
        stock_status: row.stock_status as 'Stockout' | 'Risk',
        closing_stock: row.closing_stock,
      })
    }
  })

  return Array.from(riskMap.values())
}

// ================================================================
// REPLENISHMENT SUGGESTION QUERIES
// ================================================================

/**
 * Fetch replenishment suggestions with optional filters
 *
 * @param filters - Optional filters for SKU, priority, overdue status
 * @returns Array of replenishment suggestion records
 */
export async function fetchReplenishmentSuggestions(
  filters?: ReplenishmentSuggestionFilters
): Promise<ReplenishmentSuggestionView[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_replenishment_suggestions')
    .select('*')

  // Apply filters
  if (filters?.sku) {
    query = query.eq('sku', filters.sku)
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority)
  }

  if (filters?.is_overdue !== undefined) {
    query = query.eq('is_overdue', filters.is_overdue)
  }

  if (filters?.max_days_until_deadline !== undefined) {
    query = query.lte('days_until_deadline', filters.max_days_until_deadline)
  }

  // Order by priority and deadline
  query = query.order('priority').order('order_deadline_date')

  const { data, error } = await query

  if (error) {
    console.error('Error fetching replenishment suggestions:', error)
    throw new Error(`Failed to fetch replenishment suggestions: ${error.message}`)
  }

  return (data || []) as ReplenishmentSuggestionView[]
}

/**
 * Fetch replenishment suggestions for a specific SKU
 *
 * @param sku - The SKU to fetch suggestions for
 * @returns Array of replenishment suggestions (should typically be 0 or 1)
 */
export async function fetchReplenishmentBySku(
  sku: string
): Promise<ReplenishmentSuggestionView[]> {
  return fetchReplenishmentSuggestions({ sku })
}

/**
 * Fetch critical replenishment suggestions
 * Returns suggestions with Critical or High priority
 *
 * @returns Array of high-priority replenishment suggestions
 */
export async function fetchCriticalReplenishments(): Promise<
  ReplenishmentSuggestionView[]
> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_replenishment_suggestions')
    .select('*')
    .in('priority', ['Critical', 'High'])
    .order('priority')
    .order('order_deadline_date')

  if (error) {
    console.error('Error fetching critical replenishments:', error)
    throw new Error(`Failed to fetch critical replenishments: ${error.message}`)
  }

  return (data || []) as ReplenishmentSuggestionView[]
}

/**
 * Fetch overdue replenishment suggestions
 * Returns suggestions where order_deadline_date has passed
 *
 * @returns Array of overdue replenishment suggestions
 */
export async function fetchOverdueReplenishments(): Promise<
  ReplenishmentSuggestionView[]
> {
  return fetchReplenishmentSuggestions({ is_overdue: true })
}

// ================================================================
// ADMIN FUNCTIONS
// ================================================================

/**
 * Refresh the materialized views
 * This should be called after significant data changes (e.g., new shipments, sales actuals)
 *
 * Note: This is a potentially long-running operation. Consider running it as a background job.
 */
export async function refreshInventoryProjectionViews(): Promise<void> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.rpc('refresh_inventory_projections')

  if (error) {
    console.error('Error refreshing inventory projections:', error)
    throw new Error(`Failed to refresh inventory projections: ${error.message}`)
  }

  console.log('Inventory projection views refreshed successfully')
}

/**
 * Get the last calculated timestamp from the projections
 * Useful for displaying when the data was last updated
 *
 * @returns ISO timestamp string of last calculation, or null if no data
 */
export async function getLastCalculatedTimestamp(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_inventory_projection_12weeks')
    .select('calculated_at')
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return data.calculated_at
}
