'use server'

/**
 * Rolloy SCM V3 - Constraint Management Server Actions
 *
 * Server-side actions for managing simulation constraints:
 * - SKU Tier Management
 * - Capital Constraints
 * - Logistics Routes
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import {
  bulkUpdateTiersSchema,
  upsertCapitalConstraintSchema,
  deleteCapitalConstraintSchema,
  createLogisticsRouteSchema,
  updateLogisticsRouteByIdSchema,
  deleteLogisticsRouteSchema,
} from '@/lib/validations/simulation'
import type {
  ProductWithTier,
  CapitalConstraint,
  LogisticsRoute,
  SkuTierCode,
  ShippingMode,
} from '@/lib/types/simulation'

// ================================================================
// SKU TIER MANAGEMENT
// ================================================================

/**
 * Get all products with their tier information
 * Returns data for the SKU tier management grid
 */
export async function getProductsWithTiers(): Promise<{
  success: boolean
  data: ProductWithTier[] | null
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Query products with tier info joined from sku_tiers
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        sku,
        product_name,
        sku_tier,
        unit_cost_usd,
        safety_stock_weeks,
        production_lead_weeks
      `)
      .order('sku', { ascending: true })

    if (productsError) {
      return { success: false, data: null, error: productsError.message }
    }

    // Query sku_tiers for priority weight and tolerance info
    const { data: tiers, error: tiersError } = await supabase
      .from('sku_tiers')
      .select('tier_code, priority_weight, stockout_tolerance_days, service_level_target')
      .eq('is_active', true)

    if (tiersError) {
      return { success: false, data: null, error: tiersError.message }
    }

    // Create a map for quick tier lookup
    const tierMap = new Map(tiers?.map(t => [t.tier_code, t]) || [])

    // Query current inventory for each product
    const { data: inventory, error: inventoryError } = await supabase
      .from('inventory_snapshots')
      .select('sku, qty_on_hand')
      .order('snapshot_date', { ascending: false })

    if (inventoryError) {
      console.warn('Failed to fetch inventory:', inventoryError.message)
    }

    // Get latest inventory per SKU
    const inventoryMap = new Map<string, number>()
    if (inventory) {
      for (const inv of inventory) {
        if (!inventoryMap.has(inv.sku)) {
          inventoryMap.set(inv.sku, inv.qty_on_hand)
        }
      }
    }

    // Build ProductWithTier array
    // Note: Component expects 'tier' field but simulation type uses 'sku_tier'
    // We return the simulation type format for consistency
    const productsWithTiers: ProductWithTier[] = (products || []).map(p => {
      const tierInfo = tierMap.get(p.sku_tier) || {
        priority_weight: 1,
        stockout_tolerance_days: 0,
        service_level_target: 0.95,
      }

      return {
        sku: p.sku,
        product_name: p.product_name,
        sku_tier: p.sku_tier as SkuTierCode,
        unit_cost_usd: p.unit_cost_usd || 0,
        safety_stock_weeks: p.safety_stock_weeks || 4,
        production_lead_weeks: p.production_lead_weeks || 4,
        priority_weight: tierInfo.priority_weight,
        stockout_tolerance_days: tierInfo.stockout_tolerance_days,
        service_level_target: tierInfo.service_level_target,
        current_stock: inventoryMap.get(p.sku) || 0,
      }
    })

    return { success: true, data: productsWithTiers, error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to fetch products: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Bulk update product tiers (for multi-select operations)
 */
export async function bulkUpdateProductTiers(
  updates: { sku: string; tier: SkuTierCode }[]
): Promise<{
  success: boolean
  updated_count: number
  error: string | null
}> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return { success: false, updated_count: 0, error: authResult.error ?? 'Authentication required' }
  }

  // Validate input
  const validation = bulkUpdateTiersSchema.safeParse({ updates })
  if (!validation.success) {
    return {
      success: false,
      updated_count: 0,
      error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
    }
  }

  try {
    const supabase = await createServerSupabaseClient()
    let updated_count = 0

    // Process updates in a batch
    // Note: Supabase doesn't support bulk update with different values,
    // so we need to update each product individually
    for (const update of updates) {
      const { error } = await supabase
        .from('products')
        .update({ sku_tier: update.tier })
        .eq('sku', update.sku)

      if (!error) {
        updated_count++
      } else {
        console.warn(`Failed to update tier for SKU ${update.sku}:`, error.message)
      }
    }

    // Revalidate relevant paths
    revalidatePath('/settings/products')
    revalidatePath('/planning/simulation')

    return {
      success: true,
      updated_count,
      error: updated_count < updates.length
        ? `Updated ${updated_count}/${updates.length} products`
        : null,
    }
  } catch (err) {
    return {
      success: false,
      updated_count: 0,
      error: `Bulk update failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Get SKU tier statistics (count per tier)
 */
export async function getSkuTierStats(): Promise<{
  success: boolean
  data: { tier: string; count: number }[] | null
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Count products per tier
    const { data, error } = await supabase
      .from('products')
      .select('sku_tier')

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    // Aggregate counts
    const counts = new Map<string, number>()
    for (const p of data || []) {
      const tier = p.sku_tier || 'STANDARD'
      counts.set(tier, (counts.get(tier) || 0) + 1)
    }

    // Ensure all tiers are represented
    const tiers: SkuTierCode[] = ['HERO', 'STANDARD', 'ACCESSORY']
    const stats = tiers.map(tier => ({
      tier,
      count: counts.get(tier) || 0,
    }))

    return { success: true, data: stats, error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to fetch stats: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// CAPITAL CONSTRAINTS CRUD
// ================================================================

/**
 * Get all capital constraints
 */
export async function getCapitalConstraints(): Promise<{
  success: boolean
  data: CapitalConstraint[] | null
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('capital_constraints')
      .select('*')
      .order('period_key', { ascending: true })

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    return { success: true, data: data || [], error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to fetch constraints: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Upsert a capital constraint (create or update)
 * Supports both budget_cap (component format) and budget_cap_usd (DB format)
 */
export async function upsertCapitalConstraint(
  constraint: {
    period_type?: 'monthly' | 'quarterly'
    period_key: string
    budget_cap_usd?: number
    budget_cap?: number | null
    is_active?: boolean
    notes?: string
  }
): Promise<{
  success: boolean
  data: CapitalConstraint | null
  error: string | null
}> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return { success: false, data: null, error: authResult.error ?? 'Authentication required' }
  }

  // Handle both field names for budget
  const budgetValue = constraint.budget_cap_usd ?? constraint.budget_cap

  // Skip if budget is null or undefined
  if (budgetValue === null || budgetValue === undefined) {
    return { success: true, data: null, error: null }
  }

  // Default period_type to 'monthly' if not provided
  const periodType = constraint.period_type ?? 'monthly'

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('capital_constraints')
      .upsert(
        {
          period_type: periodType,
          period_key: constraint.period_key,
          budget_cap_usd: budgetValue,
          is_active: constraint.is_active ?? true,
          notes: constraint.notes ?? null,
          updated_by: user?.id || null,
        },
        { onConflict: 'period_type,period_key' }
      )
      .select('*')
      .single()

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    revalidatePath('/planning/simulation')
    revalidatePath('/settings/simulation')
    return { success: true, data, error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to save constraint: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Delete a capital constraint
 */
export async function deleteCapitalConstraint(id: string): Promise<{
  success: boolean
  error: string | null
}> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return { success: false, error: authResult.error ?? 'Authentication required' }
  }

  // Validate input
  const validation = deleteCapitalConstraintSchema.safeParse({ id })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
    }
  }

  try {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('capital_constraints')
      .delete()
      .eq('id', id)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/planning/simulation')
    return { success: true, error: null }
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete constraint: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Generate upcoming periods for the budget editor
 * Returns next 12 months with their constraint status
 */
export async function getUpcomingPeriods(): Promise<{
  success: boolean
  data: { period_key: string; label: string; has_constraint: boolean; budget?: number }[] | null
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Get existing constraints
    const { data: constraints, error } = await supabase
      .from('capital_constraints')
      .select('period_key, budget_cap_usd')
      .eq('period_type', 'monthly')
      .eq('is_active', true)

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    // Create constraint map
    const constraintMap = new Map(
      constraints?.map(c => [c.period_key, c.budget_cap_usd]) || []
    )

    // Generate next 12 months
    const periods: { period_key: string; label: string; has_constraint: boolean; budget?: number }[] = []
    const now = new Date()

    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const period_key = `${year}-${month}`

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const label = `${monthNames[date.getMonth()]} ${year}`

      const budget = constraintMap.get(period_key)

      periods.push({
        period_key,
        label,
        has_constraint: budget !== undefined,
        budget,
      })
    }

    return { success: true, data: periods, error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to generate periods: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// LOGISTICS ROUTES CRUD
// ================================================================

/**
 * Get all logistics routes
 */
export async function getLogisticsRoutes(): Promise<{
  success: boolean
  data: LogisticsRoute[] | null
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('logistics_routes')
      .select('*')
      .order('route_code', { ascending: true })

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    return { success: true, data: data || [], error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to fetch routes: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Update a logistics route (transit time, cost, etc.)
 */
export async function updateLogisticsRoute(
  id: string,
  updates: {
    transit_time_weeks?: number
    cost_per_kg_usd?: number
    is_active?: boolean
    route_name?: string
    minimum_charge_usd?: number
  }
): Promise<{
  success: boolean
  data: LogisticsRoute | null
  error: string | null
}> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return { success: false, data: null, error: authResult.error ?? 'Authentication required' }
  }

  // Validate input
  const validation = updateLogisticsRouteByIdSchema.safeParse({ id, ...updates })
  if (!validation.success) {
    return {
      success: false,
      data: null,
      error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
    }
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Build update object
    const updateData: Record<string, unknown> = {}
    if (updates.transit_time_weeks !== undefined) {
      updateData.transit_time_weeks = updates.transit_time_weeks
      updateData.transit_time_days = Math.round(updates.transit_time_weeks * 7)
    }
    if (updates.cost_per_kg_usd !== undefined) {
      updateData.cost_per_kg_usd = updates.cost_per_kg_usd
    }
    if (updates.is_active !== undefined) {
      updateData.is_active = updates.is_active
    }
    if (updates.route_name !== undefined) {
      updateData.route_name = updates.route_name
    }
    if (updates.minimum_charge_usd !== undefined) {
      updateData.minimum_charge_usd = updates.minimum_charge_usd
    }

    const { data, error } = await supabase
      .from('logistics_routes')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    revalidatePath('/settings/logistics')
    revalidatePath('/planning/simulation')
    return { success: true, data, error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to update route: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Create a new logistics route
 * Handles both 2-letter country codes and full country names
 */
export async function createLogisticsRoute(
  route: {
    route_code: string
    route_name: string
    origin_country: string
    destination_region: string
    shipping_mode: string  // Accept both 'Sea' and 'SEA' formats
    transit_time_weeks: number
    cost_per_kg_usd: number
    is_default?: boolean
    is_active?: boolean
    origin_city?: string
    destination_country?: string
    minimum_charge_usd?: number
  }
): Promise<{
  success: boolean
  data: LogisticsRoute | null
  error: string | null
}> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return { success: false, data: null, error: authResult.error ?? 'Authentication required' }
  }

  // Normalize shipping mode to database format (capitalized)
  const normalizedMode = normalizeShippingMode(route.shipping_mode)

  // Normalize country to 2-letter code if needed
  const originCode = normalizeCountryCode(route.origin_country)

  try {
    const supabase = await createServerSupabaseClient()

    // Check if route_code already exists
    const { data: existing } = await supabase
      .from('logistics_routes')
      .select('id')
      .eq('route_code', route.route_code.toUpperCase())
      .single()

    if (existing) {
      return {
        success: false,
        data: null,
        error: `Route code ${route.route_code} already exists`,
      }
    }

    const { data, error } = await supabase
      .from('logistics_routes')
      .insert({
        route_code: route.route_code.toUpperCase(),
        route_name: route.route_name,
        origin_country: originCode,
        origin_city: route.origin_city ?? null,
        destination_region: route.destination_region,
        destination_country: route.destination_country ? normalizeCountryCode(route.destination_country) : null,
        shipping_mode: normalizedMode,
        transit_time_weeks: route.transit_time_weeks,
        transit_time_days: Math.round(route.transit_time_weeks * 7),
        cost_per_kg_usd: route.cost_per_kg_usd,
        minimum_charge_usd: route.minimum_charge_usd ?? 0,
        is_active: route.is_active ?? true,
        is_default: route.is_default ?? false,
      })
      .select('*')
      .single()

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    revalidatePath('/settings/logistics')
    revalidatePath('/settings/simulation')
    revalidatePath('/planning/simulation')
    return { success: true, data, error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to create route: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Normalize shipping mode to DB format
 */
function normalizeShippingMode(mode: string): ShippingMode {
  const upper = mode.toUpperCase()
  if (upper === 'SEA') return 'Sea'
  if (upper === 'AIR') return 'Air'
  if (upper === 'EXPRESS') return 'Express'
  // Already in correct format
  if (mode === 'Sea' || mode === 'Air' || mode === 'Express') {
    return mode as ShippingMode
  }
  return 'Sea' // Default
}

/**
 * Normalize country name to 2-letter code
 */
function normalizeCountryCode(country: string): string {
  const countryMap: Record<string, string> = {
    'china': 'CN',
    'usa': 'US',
    'united states': 'US',
    'uk': 'GB',
    'united kingdom': 'GB',
    'germany': 'DE',
    'japan': 'JP',
    'france': 'FR',
    'canada': 'CA',
    'australia': 'AU',
    'india': 'IN',
    'brazil': 'BR',
    'mexico': 'MX',
    'spain': 'ES',
    'italy': 'IT',
  }

  // Already a 2-letter code
  if (country.length === 2) {
    return country.toUpperCase()
  }

  return countryMap[country.toLowerCase()] || country.substring(0, 2).toUpperCase()
}

/**
 * Delete a logistics route
 */
export async function deleteLogisticsRoute(id: string): Promise<{
  success: boolean
  error: string | null
}> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return { success: false, error: authResult.error ?? 'Authentication required' }
  }

  // Validate input
  const validation = deleteLogisticsRouteSchema.safeParse({ id })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
    }
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Check if route is used by any shipments
    const { data: usage } = await supabase
      .from('shipments')
      .select('id')
      .eq('route_id', id)
      .limit(1)

    if (usage && usage.length > 0) {
      // Soft delete instead - mark as inactive
      const { error } = await supabase
        .from('logistics_routes')
        .update({ is_active: false })
        .eq('id', id)

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        error: 'Route is in use by shipments. Marked as inactive instead of deleting.',
      }
    }

    // Hard delete if not in use
    const { error } = await supabase
      .from('logistics_routes')
      .delete()
      .eq('id', id)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/settings/logistics')
    revalidatePath('/planning/simulation')
    return { success: true, error: null }
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete route: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Get active routes by shipping mode
 */
export async function getRoutesByMode(mode: ShippingMode): Promise<{
  success: boolean
  data: LogisticsRoute[] | null
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('logistics_routes')
      .select('*')
      .eq('shipping_mode', mode)
      .eq('is_active', true)
      .order('route_code', { ascending: true })

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    return { success: true, data: data || [], error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to fetch routes: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Get default route for a destination region
 */
export async function getDefaultRoute(
  destination_region: string,
  shipping_mode?: ShippingMode
): Promise<{
  success: boolean
  data: LogisticsRoute | null
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('logistics_routes')
      .select('*')
      .eq('destination_region', destination_region)
      .eq('is_active', true)
      .eq('is_default', true)

    if (shipping_mode) {
      query = query.eq('shipping_mode', shipping_mode)
    }

    const { data, error } = await query.single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      return { success: false, data: null, error: error.message }
    }

    return { success: true, data: data || null, error: null }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to fetch default route: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
