'use server'

/**
 * Rolloy SCM V3 - Simulation Engine Server Actions
 *
 * Server-side actions for the simulation engine.
 * All mutation actions require authentication.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import { SimulatorService } from '@/lib/services/simulator'
import {
  simulationParamsSchema,
  executeScenarioRequestSchema,
  rollbackRequestSchema,
  updateProductTierSchema,
  upsertCapitalConstraintSchema,
} from '@/lib/validations/simulation'
import type {
  ScenarioParameters,
  RunSimulationResponse,
  GetExecutionPlanResponse,
  ExecuteScenarioRequest,
  ExecuteScenarioResponse,
  RollbackRequest,
  RollbackResponse,
  ExecutionPlan,
  AffectedRecord,
  RecommendedAction,
  SkuTier,
  CapitalConstraint,
  LogisticsRoute,
  SkuTierCode,
  CreatePOPayload,
  UpdateShipmentPayload,
  DeferPOPayload,
} from '@/lib/types/simulation'

// ================================================================
// SIMULATION ACTIONS
// ================================================================

/**
 * Run a simulation with given parameters
 * Does NOT modify database - pure calculation
 */
export async function runSimulation(
  params: ScenarioParameters
): Promise<RunSimulationResponse> {
  const start = performance.now()

  try {
    // Validate parameters
    const validation = simulationParamsSchema.safeParse(params)
    if (!validation.success) {
      return {
        success: false,
        result: null,
        error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
        cache_hit: false,
        execution_time_ms: performance.now() - start,
      }
    }

    // Initialize service
    const simulator = new SimulatorService()

    // Check cache
    const cached = await simulator.getCachedResult(params)
    if (cached) {
      return {
        success: true,
        result: cached,
        error: null,
        cache_hit: true,
        execution_time_ms: performance.now() - start,
      }
    }

    // Run simulation
    const result = await simulator.runSimulation(params)

    // Cache result
    await simulator.cacheResult(params, result)

    return {
      success: true,
      result,
      error: null,
      cache_hit: false,
      execution_time_ms: performance.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      result: null,
      error: `Simulation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      cache_hit: false,
      execution_time_ms: performance.now() - start,
    }
  }
}

/**
 * Get execution plan for a simulation result
 * Validates all actions before execution
 */
export async function getExecutionPlan(
  scenario_hash: string,
  selected_action_ids: string[]
): Promise<GetExecutionPlanResponse> {
  try {
    const simulator = new SimulatorService()

    // Retrieve cached simulation result
    const result = await simulator.getCachedResultByHash(scenario_hash)
    if (!result) {
      return {
        success: false,
        plan: null,
        error: 'Simulation result not found or expired. Please run simulation again.',
      }
    }

    // Filter selected actions
    const selected_actions = result.recommended_actions.filter(
      a => selected_action_ids.includes(a.action_id)
    )

    if (selected_actions.length === 0) {
      return {
        success: false,
        plan: null,
        error: 'No actions selected for execution.',
      }
    }

    // Validate all actions
    const validation_errors = await simulator.validateActions(selected_actions)

    // Generate confirmation token
    const confirmation_token = crypto.randomUUID()
    const token_expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes

    // Store token (for preventing double-execution)
    await simulator.storeConfirmationToken(confirmation_token, {
      scenario_hash,
      action_ids: selected_action_ids,
      expires_at: token_expires_at,
    })

    const plan: ExecutionPlan = {
      scenario_hash,
      actions_to_execute: selected_actions,
      all_valid: validation_errors.length === 0,
      validation_errors,
      total_pos_to_create: selected_actions.filter(a => a.action_type === 'CREATE_PO').length,
      total_pos_to_defer: selected_actions.filter(a => a.action_type === 'DEFER_PO').length,
      total_shipments_to_update: selected_actions.filter(a => a.action_type === 'UPDATE_SHIPMENT_MODE').length,
      total_cash_impact: selected_actions.reduce((sum, a) => sum + a.cash_impact, 0),
      confirmation_token,
      token_expires_at,
    }

    return { success: true, plan, error: null }
  } catch (err) {
    return {
      success: false,
      plan: null,
      error: `Failed to generate execution plan: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Execute selected actions from simulation
 * This is the WRITE operation - creates/updates actual records
 */
export async function executeScenario(
  request: ExecuteScenarioRequest
): Promise<ExecuteScenarioResponse> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return {
      success: false,
      execution_id: null,
      affected_records: [],
      summary: null,
      error: authResult.error ?? 'Authentication required',
    }
  }

  // Validate request
  const validation = executeScenarioRequestSchema.safeParse(request)
  if (!validation.success) {
    return {
      success: false,
      execution_id: null,
      affected_records: [],
      summary: null,
      error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  try {
    // Validate confirmation token
    const simulator = new SimulatorService()
    const tokenValid = await simulator.validateConfirmationToken(
      request.confirmation_token,
      request.scenario_hash,
      request.selected_action_ids
    )

    if (!tokenValid) {
      return {
        success: false,
        execution_id: null,
        affected_records: [],
        summary: null,
        error: 'Invalid or expired confirmation token. Please regenerate execution plan.',
      }
    }

    // Get cached result
    const result = await simulator.getCachedResultByHash(request.scenario_hash)
    if (!result) {
      return {
        success: false,
        execution_id: null,
        affected_records: [],
        summary: null,
        error: 'Simulation result expired. Please run simulation again.',
      }
    }

    // Filter selected actions
    const actions = result.recommended_actions.filter(
      a => request.selected_action_ids.includes(a.action_id)
    )

    // Execute actions
    const affected_records: AffectedRecord[] = []
    let pos_created = 0
    let pos_deferred = 0
    let shipments_updated = 0
    let total_value = 0
    let cash_impact = 0

    for (const action of actions) {
      const record = await executeAction(supabase, action)
      if (record) {
        affected_records.push(record)
      }

      switch (action.action_type) {
        case 'CREATE_PO':
          pos_created++
          if (action.payload && 'suggested_qty' in action.payload && 'unit_price_usd' in action.payload) {
            const payload = action.payload as CreatePOPayload
            total_value += payload.suggested_qty * payload.unit_price_usd
          }
          break
        case 'DEFER_PO':
          pos_deferred++
          break
        case 'UPDATE_SHIPMENT_MODE':
          shipments_updated++
          if (action.payload && 'cost_delta' in action.payload) {
            const payload = action.payload as UpdateShipmentPayload
            cash_impact += payload.cost_delta
          }
          break
      }
    }

    // Create audit record
    const execution_id = crypto.randomUUID()
    const { data: { user } } = await supabase.auth.getUser()

    const { error: auditError } = await supabase
      .from('simulation_executions')
      .insert({
        id: execution_id,
        scenario_hash: request.scenario_hash,
        scenario_params: result.parameters_hash,
        execution_type: actions.length > 1 ? 'BULK' : actions[0]?.action_type || 'BULK',
        affected_records,
        summary: {
          pos_created,
          pos_deferred,
          shipments_updated,
          total_value_usd: total_value,
          cash_impact_usd: cash_impact,
        },
        executed_by: user?.id || null,
        status: 'completed',
      })

    if (auditError) {
      console.error('Failed to create audit record:', auditError)
      // Don't fail the operation, just log
    }

    // Invalidate cache
    await simulator.invalidateCache()

    // Revalidate relevant paths
    revalidatePath('/planning/simulation')
    revalidatePath('/procurement')
    revalidatePath('/logistics')

    return {
      success: true,
      execution_id,
      affected_records,
      summary: {
        pos_created,
        pos_deferred,
        shipments_updated,
        total_value_usd: total_value,
        cash_impact_usd: cash_impact,
      },
      error: null,
    }
  } catch (err) {
    return {
      success: false,
      execution_id: null,
      affected_records: [],
      summary: null,
      error: `Execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Rollback a previous execution
 * Only available within 24 hours
 */
export async function rollbackExecution(
  request: RollbackRequest
): Promise<RollbackResponse> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return {
      success: false,
      rolled_back_records: 0,
      error: authResult.error ?? 'Authentication required',
    }
  }

  // Validate request
  const validation = rollbackRequestSchema.safeParse(request)
  if (!validation.success) {
    return {
      success: false,
      rolled_back_records: 0,
      error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  try {
    // Fetch execution record
    const { data: execution, error: fetchError } = await supabase
      .from('simulation_executions')
      .select('*')
      .eq('id', request.execution_id)
      .single()

    if (fetchError || !execution) {
      return {
        success: false,
        rolled_back_records: 0,
        error: 'Execution record not found.',
      }
    }

    // Check rollback eligibility
    if (!execution.rollback_available) {
      return {
        success: false,
        rolled_back_records: 0,
        error: 'Rollback not available for this execution.',
      }
    }

    const deadline = new Date(execution.rollback_deadline)
    if (new Date() > deadline) {
      return {
        success: false,
        rolled_back_records: 0,
        error: 'Rollback deadline has passed (24 hours after execution).',
      }
    }

    // Execute rollback for each affected record
    let rolled_back = 0
    const affected = execution.affected_records as AffectedRecord[]

    for (const record of affected) {
      const success = await rollbackRecord(supabase, record)
      if (success) rolled_back++
    }

    // Update execution record
    const { data: { user } } = await supabase.auth.getUser()

    await supabase
      .from('simulation_executions')
      .update({
        rollback_executed_at: new Date().toISOString(),
        rollback_executed_by: user?.id || null,
        rollback_reason: request.reason,
        status: rolled_back === affected.length ? 'rolled_back' : 'partial_rollback',
      })
      .eq('id', request.execution_id)

    // Revalidate relevant paths
    revalidatePath('/planning/simulation')
    revalidatePath('/procurement')
    revalidatePath('/logistics')

    return {
      success: true,
      rolled_back_records: rolled_back,
      error: null,
    }
  } catch (err) {
    return {
      success: false,
      rolled_back_records: 0,
      error: `Rollback failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Refresh simulation baseline data
 * Triggers materialized view refresh
 */
export async function refreshSimulationData(): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase.rpc('refresh_simulation_baseline')

    if (error) {
      return {
        success: false,
        error: `Failed to refresh baseline: ${error.message}`,
      }
    }

    // Invalidate cache
    const simulator = new SimulatorService()
    await simulator.invalidateCache()

    return { success: true, error: null }
  } catch (err) {
    return {
      success: false,
      error: `Refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// CONSTRAINT MANAGEMENT ACTIONS
// ================================================================

/**
 * Get all SKU tiers
 */
export async function getSkuTiers(): Promise<{
  success: boolean
  tiers: SkuTier[]
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('sku_tiers')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      return { success: false, tiers: [], error: error.message }
    }

    return { success: true, tiers: data || [], error: null }
  } catch (err) {
    return {
      success: false,
      tiers: [],
      error: `Failed to fetch SKU tiers: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Update product SKU tier
 */
export async function updateProductTier(
  sku: string,
  tier_code: SkuTierCode
): Promise<{ success: boolean; error: string | null }> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return { success: false, error: authResult.error ?? 'Authentication required' }
  }

  // Validate input
  const validation = updateProductTierSchema.safeParse({ sku, tier_code })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
    }
  }

  try {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('products')
      .update({ sku_tier: tier_code })
      .eq('sku', sku)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/settings/products')
    return { success: true, error: null }
  } catch (err) {
    return {
      success: false,
      error: `Failed to update tier: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Get capital constraints
 */
export async function getCapitalConstraints(): Promise<{
  success: boolean
  constraints: CapitalConstraint[]
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('capital_constraints')
      .select('*')
      .eq('is_active', true)
      .order('period_key', { ascending: true })

    if (error) {
      return { success: false, constraints: [], error: error.message }
    }

    return { success: true, constraints: data || [], error: null }
  } catch (err) {
    return {
      success: false,
      constraints: [],
      error: `Failed to fetch constraints: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Upsert capital constraint
 */
export async function upsertCapitalConstraint(
  constraint: Omit<CapitalConstraint, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; id: string | null; error: string | null }> {
  const authResult = await requireAuth()
  if ('error' in authResult && authResult.error) {
    return { success: false, id: null, error: authResult.error ?? 'Authentication required' }
  }

  // Validate input
  const validation = upsertCapitalConstraintSchema.safeParse(constraint)
  if (!validation.success) {
    return {
      success: false,
      id: null,
      error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
    }
  }

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('capital_constraints')
      .upsert(
        {
          period_type: constraint.period_type,
          period_key: constraint.period_key,
          budget_cap_usd: constraint.budget_cap_usd,
          is_active: constraint.is_active,
          notes: constraint.notes,
          updated_by: user?.id || null,
        },
        { onConflict: 'period_type,period_key' }
      )
      .select('id')
      .single()

    if (error) {
      return { success: false, id: null, error: error.message }
    }

    revalidatePath('/planning/simulation')
    return { success: true, id: data?.id || null, error: null }
  } catch (err) {
    return {
      success: false,
      id: null,
      error: `Failed to save constraint: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Get logistics routes
 */
export async function getLogisticsRoutes(): Promise<{
  success: boolean
  routes: LogisticsRoute[]
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('logistics_routes')
      .select('*')
      .eq('is_active', true)
      .order('route_code', { ascending: true })

    if (error) {
      return { success: false, routes: [], error: error.message }
    }

    return { success: true, routes: data || [], error: null }
  } catch (err) {
    return {
      success: false,
      routes: [],
      error: `Failed to fetch routes: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

/**
 * Get simulation execution history
 */
export async function getSimulationHistory(limit: number = 20): Promise<{
  success: boolean
  executions: {
    id: string
    scenario_hash: string
    scenario_name: string | null
    execution_type: string
    summary: Record<string, unknown>
    executed_at: string
    status: string
    rollback_available: boolean
    rollback_deadline: string
  }[]
  error: string | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('simulation_executions')
      .select('id, scenario_hash, scenario_name, execution_type, summary, executed_at, status, rollback_available, rollback_deadline')
      .order('executed_at', { ascending: false })
      .limit(limit)

    if (error) {
      return { success: false, executions: [], error: error.message }
    }

    return { success: true, executions: data || [], error: null }
  } catch (err) {
    return {
      success: false,
      executions: [],
      error: `Failed to fetch history: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

/**
 * Execute a single action
 */
async function executeAction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  action: RecommendedAction
): Promise<AffectedRecord | null> {
  switch (action.action_type) {
    case 'CREATE_PO': {
      if (!action.payload || !('sku' in action.payload)) return null
      const payload = action.payload as CreatePOPayload

      // Create new PO (simplified - in production would use stored procedure)
      const poNumber = `SIM-${Date.now().toString(36).toUpperCase()}`
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          batch_code: poNumber,
          po_status: 'Draft',
          planned_order_date: payload.order_deadline,
        })
        .select('id')
        .single()

      if (poError || !po) {
        console.error('Failed to create PO:', poError)
        return null
      }

      // Create PO item
      await supabase.from('purchase_order_items').insert({
        po_id: po.id,
        sku: payload.sku,
        ordered_qty: payload.suggested_qty,
        unit_price_usd: payload.unit_price_usd,
      })

      return {
        table: 'purchase_orders',
        id: po.id,
        action: 'CREATE',
        data: {
          po_number: poNumber,
          sku: payload.sku,
          qty: payload.suggested_qty,
          value: payload.suggested_qty * payload.unit_price_usd,
        },
      }
    }

    case 'DEFER_PO': {
      if (!action.target_id || !action.payload || !('new_order_date' in action.payload)) return null
      const payload = action.payload as DeferPOPayload

      const { data: oldPO } = await supabase
        .from('purchase_orders')
        .select('planned_order_date')
        .eq('id', action.target_id)
        .single()

      const { error } = await supabase
        .from('purchase_orders')
        .update({ planned_order_date: payload.new_order_date })
        .eq('id', action.target_id)

      if (error) {
        console.error('Failed to defer PO:', error)
        return null
      }

      return {
        table: 'purchase_orders',
        id: action.target_id,
        action: 'UPDATE',
        field: 'planned_order_date',
        old_value: oldPO?.planned_order_date,
        new_value: payload.new_order_date,
      }
    }

    case 'UPDATE_SHIPMENT_MODE': {
      if (!action.target_id || !action.payload || !('new_mode' in action.payload)) return null
      const payload = action.payload as UpdateShipmentPayload

      const { data: oldShipment } = await supabase
        .from('shipments')
        .select('logistics_plan')
        .eq('id', action.target_id)
        .single()

      const { error } = await supabase
        .from('shipments')
        .update({ logistics_plan: payload.new_mode })
        .eq('id', action.target_id)

      if (error) {
        console.error('Failed to update shipment:', error)
        return null
      }

      return {
        table: 'shipments',
        id: action.target_id,
        action: 'UPDATE',
        field: 'logistics_plan',
        old_value: oldShipment?.logistics_plan,
        new_value: payload.new_mode,
      }
    }

    default:
      return null
  }
}

/**
 * Rollback a single record
 */
async function rollbackRecord(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  record: AffectedRecord
): Promise<boolean> {
  try {
    switch (record.action) {
      case 'CREATE': {
        // Delete created record
        const { error } = await supabase
          .from(record.table)
          .delete()
          .eq('id', record.id)

        return !error
      }

      case 'UPDATE': {
        // Restore old value
        if (!record.field || record.old_value === undefined) return false

        const { error } = await supabase
          .from(record.table)
          .update({ [record.field]: record.old_value })
          .eq('id', record.id)

        return !error
      }

      default:
        return false
    }
  } catch {
    return false
  }
}
