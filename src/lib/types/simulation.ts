// File: src/lib/types/simulation.ts
// V3 Simulation Engine Types
// Based on specs/v3-simulation-engine/design.md

// ================================================================
// ENUMS & CONSTANTS
// ================================================================

export type ShippingMode = 'Sea' | 'Air' | 'Express'
export type SkuTierCode = 'HERO' | 'STANDARD' | 'ACCESSORY'
export type CapitalPeriodType = 'monthly' | 'quarterly'
export type SimulationExecutionType = 'CREATE_PO' | 'UPDATE_SHIPMENT' | 'DEFER_PO' | 'BULK' | 'ROLLBACK'
export type SimulationStatus = 'completed' | 'rolled_back' | 'partial_rollback' | 'failed'
export type StockStatusType = 'OK' | 'Risk' | 'Stockout'
export type ActionRecommendation = 'INCLUDE' | 'DEFER' | 'URGENT_ORDER' | 'MODE_CHANGE'

export const SHIPPING_MODE_CONFIG = {
  Sea: { transit_weeks: 5, cost_multiplier: 1.0, display_name: 'Sea Freight (5 weeks)' },
  Air: { transit_weeks: 1, cost_multiplier: 10.0, display_name: 'Air Freight (1 week)' },
  Express: { transit_weeks: 0.5, cost_multiplier: 20.0, display_name: 'Express Air (3 days)' },
} as const

// ================================================================
// SCENARIO PARAMETERS (Input)
// ================================================================

/**
 * Complete input parameters for a simulation scenario
 */
export interface ScenarioParameters {
  // Demand modifiers
  sales_lift_percent: number          // Range: -50 to +100
  sku_scope: SkuTierCode[]            // Which tiers to include

  // Lead time modifiers
  production_lead_adjustment_weeks: number  // Range: -2 to +4
  shipping_mode_override: ShippingMode | null

  // Capital constraint settings
  capital_constraint_enabled: boolean
  capital_cap_usd: number | null
  capital_period: CapitalPeriodType

  // Filtering
  sku_filter: string[] | null         // Specific SKUs or null for all
  warehouse_filter: string[] | null   // Specific warehouses or null for all

  // Time horizon
  time_horizon_weeks: 12 | 26 | 52

  // Optional: specific POs/shipments to modify
  po_ids_to_simulate?: string[]
  shipment_ids_to_simulate?: string[]
}

/**
 * Default scenario parameters
 */
export const DEFAULT_SCENARIO_PARAMS: ScenarioParameters = {
  sales_lift_percent: 0,
  sku_scope: ['HERO', 'STANDARD', 'ACCESSORY'],
  production_lead_adjustment_weeks: 0,
  shipping_mode_override: null,
  capital_constraint_enabled: false,
  capital_cap_usd: null,
  capital_period: 'monthly',
  sku_filter: null,
  warehouse_filter: null,
  time_horizon_weeks: 12,
}

// ================================================================
// SIMULATION RESULT (Output)
// ================================================================

/**
 * Complete simulation result structure
 */
export interface SimulationResult {
  // Comparison projections
  baseline: WeeklyProjection[]
  scenario: WeeklyProjection[]

  // Delta analysis (scenario vs baseline totals)
  cash_impact_total: number           // Negative = more spending
  stockout_count_delta: number        // Positive = more stockouts in scenario
  days_of_stock_delta: number         // Negative = less runway

  // Risk assessment
  critical_stockouts: StockoutEvent[]
  acceptable_gaps: StockoutEvent[]

  // Recommendations
  recommended_actions: RecommendedAction[]

  // Capital constraint results (if enabled)
  capital_analysis: CapitalConstraintResult | null

  // Metadata
  calculated_at: string               // ISO timestamp
  parameters_hash: string             // For caching
  execution_time_ms: number
}

/**
 * Weekly projection for a single week
 */
export interface WeeklyProjection {
  week_iso: string                    // "2025-W01"
  week_start_date: string             // "2025-01-06"
  week_end_date: string               // "2025-01-12"

  // Aggregated inventory
  projections: SKUProjection[]

  // Cash flow
  cash_position: number               // Running cash balance
  cash_inflow: number                 // Revenue (simplified)
  cash_outflow_procurement: number    // PO payments due
  cash_outflow_logistics: number      // Shipment payments due
  cash_outflow_total: number

  // Summary stats
  total_stock: number
  total_safety_threshold: number
  stockout_sku_count: number
  risk_sku_count: number
}

/**
 * Per-SKU projection for a single week
 */
export interface SKUProjection {
  sku: string
  product_name: string
  sku_tier: SkuTierCode

  // Inventory calculation
  opening_stock: number
  arrival_qty: number                 // From shipments
  sales_qty: number                   // Effective sales (actual or forecast)
  closing_stock: number

  // Status
  stock_status: StockStatusType
  safety_threshold: number
  days_of_stock: number | null        // closing_stock / daily_sales

  // Traceability
  arriving_shipments: ShipmentReference[]
}

/**
 * Reference to an arriving shipment
 */
export interface ShipmentReference {
  shipment_id: string
  tracking_number: string
  arriving_qty: number
  shipping_mode: ShippingMode
}

// ================================================================
// CASH FLOW TYPES
// ================================================================

/**
 * Data point for cash flow chart
 */
export interface CashFlowDataPoint {
  week_iso: string
  baseline_cash: number
  scenario_cash: number
  baseline_outflow: number
  scenario_outflow: number
  baseline_inflow: number
  scenario_inflow: number
  capital_cap: number | null
}

// ================================================================
// STOCKOUT & RISK TYPES
// ================================================================

/**
 * Stockout event details
 */
export interface StockoutEvent {
  sku: string
  product_name: string
  sku_tier: SkuTierCode
  stockout_week: string
  duration_weeks: number
  severity: 'Critical' | 'Acceptable'
  within_tolerance: boolean
  projected_lost_sales: number
  recovery_week: string | null
}

// ================================================================
// CAPITAL CONSTRAINT TYPES
// ================================================================

/**
 * Result of capital constraint evaluation
 */
export interface CapitalConstraintResult {
  period: string                      // "2025-01" or "2025-Q1"
  period_type: CapitalPeriodType
  budget_cap: number
  planned_spend: number
  exceeds_cap: boolean
  excess_amount: number
  remaining_budget: number

  // Prioritization results
  included_pos: DeferralSuggestion[]
  deferred_pos: DeferralSuggestion[]
}

/**
 * PO deferral suggestion
 */
export interface DeferralSuggestion {
  po_id: string
  po_number: string
  sku: string
  product_name: string
  sku_tier: SkuTierCode
  priority_weight: number
  amount_usd: number
  planned_order_date: string
  stockout_impact: StockoutImpact
  recommended_action: ActionRecommendation
  defer_to_period: string | null
}

/**
 * Impact of deferring a PO
 */
export interface StockoutImpact {
  causes_stockout: boolean
  stockout_week: string | null
  stockout_duration_weeks: number
  within_tolerance: boolean
}

// ================================================================
// RECOMMENDED ACTIONS
// ================================================================

/**
 * Recommended action from simulation
 */
export interface RecommendedAction {
  action_id: string                   // UUID for tracking
  action_type: 'CREATE_PO' | 'UPDATE_SHIPMENT_MODE' | 'DEFER_PO' | 'EXPEDITE_PO'
  priority: 'Critical' | 'High' | 'Medium' | 'Low'

  // Action details
  description: string
  rationale: string

  // Target entity
  target_type: 'purchase_order' | 'shipment' | 'po_item'
  target_id: string | null            // null for CREATE actions

  // Action payload (varies by action_type)
  payload: CreatePOPayload | UpdateShipmentPayload | DeferPOPayload | null

  // Impact preview
  cash_impact: number
  stockout_prevention: boolean
  estimated_savings: number | null
}

export interface CreatePOPayload {
  sku: string
  suggested_qty: number
  unit_price_usd: number
  order_deadline: string
  expected_delivery_week: string
}

export interface UpdateShipmentPayload {
  shipment_id: string
  current_mode: ShippingMode
  new_mode: ShippingMode
  cost_delta: number
  time_saved_weeks: number
}

export interface DeferPOPayload {
  po_id: string
  current_order_date: string
  new_order_date: string
  defer_to_period: string
}

// ================================================================
// EXECUTION PLAN
// ================================================================

/**
 * Plan for executing simulation results
 */
export interface ExecutionPlan {
  scenario_hash: string
  actions_to_execute: RecommendedAction[]

  // Validation status
  all_valid: boolean
  validation_errors: ValidationError[]

  // Summary
  total_pos_to_create: number
  total_pos_to_defer: number
  total_shipments_to_update: number
  total_cash_impact: number

  // Confirmation token (prevents double-execution)
  confirmation_token: string
  token_expires_at: string
}

export interface ValidationError {
  action_id: string
  error_code: string
  error_message: string
}

// ================================================================
// AUDIT RECORD
// ================================================================

/**
 * Audit record for simulation execution
 */
export interface SimulationAuditRecord {
  id: string
  scenario_hash: string
  scenario_name: string | null
  scenario_params: ScenarioParameters
  execution_type: SimulationExecutionType
  affected_records: AffectedRecord[]
  summary: ExecutionSummary
  executed_by: string | null
  executed_at: string
  execution_duration_ms: number | null
  rollback_available: boolean
  rollback_deadline: string
  rollback_executed_at: string | null
  rollback_executed_by: string | null
  rollback_reason: string | null
  parent_execution_id: string | null
  status: SimulationStatus
  error_message: string | null
  created_at: string
}

export interface AffectedRecord {
  table: string
  id: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  field?: string
  old_value?: unknown
  new_value?: unknown
  data?: Record<string, unknown>
}

export interface ExecutionSummary {
  pos_created: number
  pos_deferred: number
  shipments_updated: number
  total_value_usd: number
  cash_impact_usd: number
}

// ================================================================
// REFERENCE DATA TYPES
// ================================================================

/**
 * SKU Tier configuration
 */
export interface SkuTier {
  tier_code: SkuTierCode
  tier_name: string
  description: string | null
  service_level_target: number
  stockout_tolerance_days: number
  priority_weight: number
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Capital constraint configuration
 */
export interface CapitalConstraint {
  id: string
  period_type: CapitalPeriodType
  period_key: string
  budget_cap_usd: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

/**
 * Logistics route configuration
 */
export interface LogisticsRoute {
  id: string
  route_code: string
  route_name: string
  origin_country: string
  origin_city: string | null
  destination_region: string
  destination_country: string | null
  shipping_mode: ShippingMode
  transit_time_weeks: number
  transit_time_days: number
  cost_per_kg_usd: number
  minimum_charge_usd: number
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

// ================================================================
// SCENARIO PRESETS
// ================================================================

export interface ScenarioPreset {
  id: string
  name: string
  description: string
  params: Partial<ScenarioParameters>
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Recession planning: -10% sales, +2w lead time',
    params: {
      sales_lift_percent: -10,
      production_lead_adjustment_weeks: 2,
    }
  },
  {
    id: 'aggressive',
    name: 'Aggressive Growth',
    description: 'Peak season prep: +30% sales, Air freight',
    params: {
      sales_lift_percent: 30,
      shipping_mode_override: 'Air',
    }
  },
  {
    id: 'cash_crunch',
    name: 'Cash Crunch',
    description: 'Liquidity crisis: $50K cap, defer Accessories',
    params: {
      capital_constraint_enabled: true,
      capital_cap_usd: 50000,
      sku_scope: ['HERO', 'STANDARD'],
    }
  },
  {
    id: 'supply_disruption',
    name: 'Supply Disruption',
    description: 'Factory delay: +4w production lead time',
    params: {
      production_lead_adjustment_weeks: 4,
    }
  },
  {
    id: 'peak_season',
    name: 'Peak Season',
    description: 'Black Friday: +50% sales (Hero only)',
    params: {
      sales_lift_percent: 50,
      sku_scope: ['HERO'],
    }
  },
]

// ================================================================
// CHART DATA TYPES (for UI)
// ================================================================

/**
 * Data point for inventory comparison chart
 */
export interface InventoryChartDataPoint {
  week_iso: string
  week_label: string
  baseline_stock: number
  scenario_stock: number
  safety_threshold: number
  stockout_zone: boolean
  risk_zone: boolean
}

/**
 * Data point for SKU-level inventory chart
 */
export interface SKUInventoryChartDataPoint {
  week_iso: string
  week_label: string
  sku: string
  product_name: string
  sku_tier: SkuTierCode
  baseline_stock: number
  scenario_stock: number
  safety_threshold: number
  stock_status: StockStatusType
}

/**
 * Risk heatmap cell data
 */
export interface RiskHeatmapCell {
  sku: string
  week_iso: string
  stock_status: StockStatusType
  closing_stock: number
  safety_threshold: number
}

// ================================================================
// UI STATE TYPES
// ================================================================

/**
 * State for the simulation playground
 */
export interface SimulationPlaygroundState {
  // Current parameters
  params: ScenarioParameters

  // Loading states
  isLoading: boolean
  isRefreshing: boolean
  isExecuting: boolean

  // Result data
  result: SimulationResult | null
  error: string | null

  // UI state
  activeTab: 'inventory' | 'cashflow' | 'heatmap'
  selectedSKU: string | null
}

// ================================================================
// BASELINE DATA TYPES (Internal)
// ================================================================

/**
 * Product with tier information
 */
export interface ProductWithTier {
  sku: string
  product_name: string
  sku_tier: SkuTierCode
  unit_cost_usd: number
  safety_stock_weeks: number
  production_lead_weeks: number
  priority_weight: number
  stockout_tolerance_days: number
  service_level_target: number
  current_stock: number
}

/**
 * Warehouse with route information
 */
export interface WarehouseWithRoute {
  id: string
  warehouse_code: string
  warehouse_name: string
  warehouse_type: 'FBA' | '3PL'
  region: 'East' | 'Central' | 'West'
  default_route_id: string | null
}

/**
 * Pending PO item in pipeline
 */
export interface POItemPipeline {
  po_item_id: string
  po_id: string
  po_number: string
  sku: string
  ordered_qty: number
  delivered_qty: number
  pending_qty: number
  unit_price_usd: number
  planned_order_date: string | null
  planned_ship_date: string | null
  po_status: string
}

/**
 * Pending shipment in pipeline
 */
export interface ShipmentPipeline {
  shipment_id: string
  tracking_number: string
  sku: string
  shipped_qty: number
  shipping_mode: string | null
  planned_arrival_date: string | null
  actual_arrival_date: string | null
  arrival_week: string | null
}

/**
 * Baseline data structure for simulation
 */
export interface BaselineData {
  // Current inventory state
  inventory: Map<string, number>  // SKU -> qty_on_hand

  // Sales data (next 12/26/52 weeks)
  forecasts: Map<string, Map<string, number>>  // SKU -> week_iso -> qty
  actuals: Map<string, Map<string, number>>    // SKU -> week_iso -> qty

  // Pipeline: pending POs and shipments
  pending_po_items: POItemPipeline[]
  pending_shipments: ShipmentPipeline[]

  // Reference data
  products: Map<string, ProductWithTier>
  routes: Map<string, LogisticsRoute>
  warehouses: Map<string, WarehouseWithRoute>

  // Constraints
  capital_constraints: Map<string, number>  // period_key -> cap
  sku_tiers: Map<SkuTierCode, SkuTier>
}

// ================================================================
// API RESPONSE TYPES
// ================================================================

/**
 * Response from runSimulation action
 */
export interface RunSimulationResponse {
  success: boolean
  result: SimulationResult | null
  error: string | null
  cache_hit: boolean
  execution_time_ms: number
}

/**
 * Response from getExecutionPlan action
 */
export interface GetExecutionPlanResponse {
  success: boolean
  plan: ExecutionPlan | null
  error: string | null
}

/**
 * Request for executeScenario action
 */
export interface ExecuteScenarioRequest {
  scenario_hash: string
  confirmation_token: string
  selected_action_ids: string[]
}

/**
 * Response from executeScenario action
 */
export interface ExecuteScenarioResponse {
  success: boolean
  execution_id: string | null
  affected_records: AffectedRecord[]
  summary: ExecutionSummary | null
  error: string | null
}

/**
 * Request for rollbackExecution action
 */
export interface RollbackRequest {
  execution_id: string
  reason: string
}

/**
 * Response from rollbackExecution action
 */
export interface RollbackResponse {
  success: boolean
  rolled_back_records: number
  error: string | null
}

/**
 * Confirmation token data stored in cache
 */
export interface ConfirmationTokenData {
  scenario_hash: string
  action_ids: string[]
  expires_at: string
}
