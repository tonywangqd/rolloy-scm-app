/**
 * Rolloy SCM V3 - Simulation Engine Service
 *
 * STATELESS pure calculation service for scenario simulation.
 * Handles baseline fetching, projection calculation, and constraint evaluation.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'
import {
  format,
  addWeeks,
  startOfISOWeek,
  getISOWeek,
  getISOWeekYear,
} from 'date-fns'

import {
  SHIPPING_MODE_CONFIG,
  type ScenarioParameters,
  type SimulationResult,
  type WeeklyProjection,
  type SKUProjection,
  type BaselineData,
  type ProductWithTier,
  type POItemPipeline,
  type ShipmentPipeline,
  type LogisticsRoute,
  type WarehouseWithRoute,
  type SkuTier,
  type SkuTierCode,
  type StockStatusType,
  type StockoutEvent,
  type RecommendedAction,
  type ValidationError,
  type CapitalConstraintResult,
  type DeferralSuggestion,
  type ShipmentReference,
  type ShippingMode,
  type ConfirmationTokenData,
} from '@/lib/types/simulation'

// In-memory cache for simulation results (short-lived)
const scenarioCache = new Map<string, { result: SimulationResult; expires: number }>()
const tokenCache = new Map<string, ConfirmationTokenData>()

// Cache TTL
const SCENARIO_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * SimulatorService - Stateless calculation service for simulation engine
 *
 * Key features:
 * - Baseline fetching with fallback logic for missing forecasts
 * - Pure calculation without side effects
 * - Result caching for performance
 * - Action validation before execution
 */
export class SimulatorService {
  /**
   * Fetch baseline data for simulation
   * Includes fallback logic: if a SKU has no future forecast, use average of last 4 weeks sales
   */
  async fetchBaseline(horizon_weeks: number): Promise<BaselineData> {
    const supabase = await createServerSupabaseClient()

    // Generate week range
    const weeks = this.generateWeekRange(horizon_weeks)

    // Fetch baseline data using RPC function
    const { data, error } = await supabase.rpc('get_simulation_baseline', {
      p_skus: null, // All SKUs
      p_weeks: weeks,
    })

    if (error) {
      throw new Error(`Failed to fetch baseline: ${error.message}`)
    }

    // Transform raw data to BaselineData structure
    return this.transformToBaselineData(data, weeks)
  }

  /**
   * Run simulation with given parameters
   * Pure calculation - no database writes
   */
  async runSimulation(params: ScenarioParameters): Promise<SimulationResult> {
    const startTime = performance.now()

    // 1. Fetch baseline data
    const baseline = await this.fetchBaseline(params.time_horizon_weeks)

    // 2. Filter products by SKU scope
    const filteredProducts = this.filterProductsByScope(baseline.products, params)

    // 3. Generate week list
    const weeks = this.generateWeekRange(params.time_horizon_weeks)

    // 4. Calculate baseline projections
    const baselineProjections = this.calculateProjections(
      filteredProducts,
      baseline,
      weeks,
      {
        sales_lift_percent: 0,
        production_lead_adjustment_weeks: 0,
        shipping_mode_override: null,
      }
    )

    // 5. Calculate scenario projections
    const scenarioProjections = this.calculateProjections(
      filteredProducts,
      baseline,
      weeks,
      {
        sales_lift_percent: params.sales_lift_percent,
        production_lead_adjustment_weeks: params.production_lead_adjustment_weeks,
        shipping_mode_override: params.shipping_mode_override,
      }
    )

    // 6. Identify stockout events
    const { critical, acceptable } = this.identifyStockoutEvents(
      scenarioProjections,
      filteredProducts,
      baseline.sku_tiers
    )

    // 7. Generate recommended actions
    const recommendedActions = this.generateRecommendations(
      baselineProjections,
      scenarioProjections,
      filteredProducts,
      baseline,
      params
    )

    // 8. Evaluate capital constraints (if enabled)
    let capitalAnalysis: CapitalConstraintResult | null = null
    if (params.capital_constraint_enabled && params.capital_cap_usd) {
      capitalAnalysis = this.evaluateCapitalConstraints(
        recommendedActions,
        params.capital_cap_usd,
        params.capital_period,
        filteredProducts,
        baseline.sku_tiers
      )
    }

    // 9. Calculate deltas
    const baselineTotals = this.calculateTotals(baselineProjections)
    const scenarioTotals = this.calculateTotals(scenarioProjections)

    const result: SimulationResult = {
      baseline: baselineProjections,
      scenario: scenarioProjections,
      cash_impact_total: scenarioTotals.totalOutflow - baselineTotals.totalOutflow,
      stockout_count_delta: scenarioTotals.stockoutCount - baselineTotals.stockoutCount,
      days_of_stock_delta: scenarioTotals.avgDaysOfStock - baselineTotals.avgDaysOfStock,
      critical_stockouts: critical,
      acceptable_gaps: acceptable,
      recommended_actions: recommendedActions,
      capital_analysis: capitalAnalysis,
      calculated_at: new Date().toISOString(),
      parameters_hash: this.generateScenarioHash(params),
      execution_time_ms: performance.now() - startTime,
    }

    return result
  }

  /**
   * Get cached simulation result
   */
  async getCachedResult(params: ScenarioParameters): Promise<SimulationResult | null> {
    const hash = this.generateScenarioHash(params)
    const cached = scenarioCache.get(hash)

    if (cached && cached.expires > Date.now()) {
      return cached.result
    }

    // Expired or not found
    if (cached) {
      scenarioCache.delete(hash)
    }

    return null
  }

  /**
   * Get cached result by hash directly
   */
  async getCachedResultByHash(hash: string): Promise<SimulationResult | null> {
    const cached = scenarioCache.get(hash)

    if (cached && cached.expires > Date.now()) {
      return cached.result
    }

    if (cached) {
      scenarioCache.delete(hash)
    }

    return null
  }

  /**
   * Cache simulation result
   */
  async cacheResult(params: ScenarioParameters, result: SimulationResult): Promise<void> {
    const hash = this.generateScenarioHash(params)
    scenarioCache.set(hash, {
      result,
      expires: Date.now() + SCENARIO_CACHE_TTL_MS,
    })
  }

  /**
   * Validate recommended actions before execution
   */
  async validateActions(actions: RecommendedAction[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = []
    const supabase = await createServerSupabaseClient()

    for (const action of actions) {
      // Validate based on action type
      switch (action.action_type) {
        case 'CREATE_PO': {
          // Validate SKU exists
          if (action.payload && 'sku' in action.payload) {
            const { data: product } = await supabase
              .from('products')
              .select('sku')
              .eq('sku', action.payload.sku)
              .eq('is_active', true)
              .single()

            if (!product) {
              errors.push({
                action_id: action.action_id,
                error_code: 'INVALID_SKU',
                error_message: `SKU ${action.payload.sku} not found or inactive`,
              })
            }
          }
          break
        }

        case 'DEFER_PO': {
          // Validate PO exists and is in valid status
          if (action.target_id) {
            const { data: po } = await supabase
              .from('purchase_orders')
              .select('id, po_status')
              .eq('id', action.target_id)
              .single()

            if (!po) {
              errors.push({
                action_id: action.action_id,
                error_code: 'PO_NOT_FOUND',
                error_message: `PO ${action.target_id} not found`,
              })
            } else if (po.po_status === 'Delivered' || po.po_status === 'Cancelled') {
              errors.push({
                action_id: action.action_id,
                error_code: 'INVALID_PO_STATUS',
                error_message: `Cannot defer PO with status ${po.po_status}`,
              })
            }
          }
          break
        }

        case 'UPDATE_SHIPMENT_MODE': {
          // Validate shipment exists and is not arrived
          if (action.target_id) {
            const { data: shipment } = await supabase
              .from('shipments')
              .select('id, actual_arrival_date')
              .eq('id', action.target_id)
              .single()

            if (!shipment) {
              errors.push({
                action_id: action.action_id,
                error_code: 'SHIPMENT_NOT_FOUND',
                error_message: `Shipment ${action.target_id} not found`,
              })
            } else if (shipment.actual_arrival_date) {
              errors.push({
                action_id: action.action_id,
                error_code: 'SHIPMENT_ARRIVED',
                error_message: 'Cannot modify arrived shipment',
              })
            }
          }
          break
        }
      }
    }

    return errors
  }

  /**
   * Store confirmation token for execution
   */
  async storeConfirmationToken(token: string, data: ConfirmationTokenData): Promise<void> {
    tokenCache.set(token, data)

    // Auto-cleanup expired tokens
    setTimeout(() => {
      tokenCache.delete(token)
    }, TOKEN_TTL_MS)
  }

  /**
   * Validate confirmation token
   */
  async validateConfirmationToken(
    token: string,
    scenarioHash: string,
    actionIds: string[]
  ): Promise<boolean> {
    const cached = tokenCache.get(token)

    if (!cached) {
      return false
    }

    // Check expiration
    if (new Date(cached.expires_at) < new Date()) {
      tokenCache.delete(token)
      return false
    }

    // Check scenario hash matches
    if (cached.scenario_hash !== scenarioHash) {
      return false
    }

    // Check action IDs match
    const cachedIds = new Set(cached.action_ids)
    const requestedIds = new Set(actionIds)

    if (cachedIds.size !== requestedIds.size) {
      return false
    }

    for (const id of requestedIds) {
      if (!cachedIds.has(id)) {
        return false
      }
    }

    // Invalidate token after use (one-time use)
    tokenCache.delete(token)

    return true
  }

  /**
   * Invalidate all cached data
   */
  async invalidateCache(): Promise<void> {
    scenarioCache.clear()
  }

  // ================================================================
  // PRIVATE HELPER METHODS
  // ================================================================

  /**
   * Generate week range from current date
   */
  private generateWeekRange(horizonWeeks: number): string[] {
    const weeks: string[] = []
    const now = new Date()
    const currentWeekStart = startOfISOWeek(now)

    for (let i = 0; i < horizonWeeks; i++) {
      const weekDate = addWeeks(currentWeekStart, i)
      const year = getISOWeekYear(weekDate)
      const week = getISOWeek(weekDate)
      weeks.push(`${year}-W${week.toString().padStart(2, '0')}`)
    }

    return weeks
  }

  /**
   * Transform raw database data to BaselineData structure
   * Implements FALLBACK LOGIC: If SKU has no future forecast, use average of last 4 weeks sales
   */
  private transformToBaselineData(data: Record<string, unknown>, weeks: string[]): BaselineData {
    const products = new Map<string, ProductWithTier>()
    const forecasts = new Map<string, Map<string, number>>()
    const actuals = new Map<string, Map<string, number>>()
    const inventory = new Map<string, number>()
    const capitalConstraints = new Map<string, number>()
    const skuTiers = new Map<SkuTierCode, SkuTier>()
    const routes = new Map<string, LogisticsRoute>()
    const warehouses = new Map<string, WarehouseWithRoute>()

    // Transform products
    const productsData = (data as { products?: unknown[] }).products || []
    for (const p of productsData as ProductWithTier[]) {
      products.set(p.sku, p)
      inventory.set(p.sku, p.current_stock || 0)
    }

    // Transform forecasts
    const forecastsData = (data as { forecasts?: { sku: string; week_iso: string; qty: number }[] }).forecasts || []
    for (const f of forecastsData) {
      if (!forecasts.has(f.sku)) {
        forecasts.set(f.sku, new Map())
      }
      forecasts.get(f.sku)!.set(f.week_iso, f.qty)
    }

    // Transform actuals
    const actualsData = (data as { actuals?: { sku: string; week_iso: string; qty: number }[] }).actuals || []
    for (const a of actualsData) {
      if (!actuals.has(a.sku)) {
        actuals.set(a.sku, new Map())
      }
      actuals.get(a.sku)!.set(a.week_iso, a.qty)
    }

    // FALLBACK LOGIC: For SKUs with no future forecast, calculate average from last 4 weeks actuals
    for (const sku of products.keys()) {
      const skuForecasts = forecasts.get(sku)
      const hasAnyForecast = skuForecasts && skuForecasts.size > 0

      if (!hasAnyForecast) {
        // Calculate average from last 4 weeks of actuals
        const skuActuals = actuals.get(sku)
        let avgSales = 0

        if (skuActuals && skuActuals.size > 0) {
          // Get last 4 weeks (most recent)
          const sortedWeeks = Array.from(skuActuals.keys()).sort().slice(-4)
          const totalSales = sortedWeeks.reduce((sum, week) => sum + (skuActuals.get(week) || 0), 0)
          avgSales = Math.round(totalSales / Math.max(sortedWeeks.length, 1))
        }

        // Use average as forecast for all projection weeks
        if (avgSales > 0) {
          const skuForecastMap = new Map<string, number>()
          for (const week of weeks) {
            skuForecastMap.set(week, avgSales)
          }
          forecasts.set(sku, skuForecastMap)
        }
      }
    }

    // Transform capital constraints
    const constraintsData = (data as { capital_constraints?: { period_key: string; budget_cap_usd: number }[] }).capital_constraints || []
    for (const c of constraintsData) {
      capitalConstraints.set(c.period_key, c.budget_cap_usd)
    }

    // Transform SKU tiers
    const tiersData = (data as { sku_tiers?: SkuTier[] }).sku_tiers || []
    for (const t of tiersData) {
      skuTiers.set(t.tier_code as SkuTierCode, t)
    }

    // Transform logistics routes
    const routesData = (data as { logistics_routes?: LogisticsRoute[] }).logistics_routes || []
    for (const r of routesData) {
      routes.set(r.id, r)
    }

    // Transform pending items
    const pendingPOItems: POItemPipeline[] = (data as { pending_po_items?: POItemPipeline[] }).pending_po_items || []
    const pendingShipments: ShipmentPipeline[] = (data as { pending_shipments?: ShipmentPipeline[] }).pending_shipments || []

    return {
      inventory,
      forecasts,
      actuals,
      pending_po_items: pendingPOItems,
      pending_shipments: pendingShipments,
      products,
      routes,
      warehouses,
      capital_constraints: capitalConstraints,
      sku_tiers: skuTiers,
    }
  }

  /**
   * Filter products by SKU scope
   */
  private filterProductsByScope(
    products: Map<string, ProductWithTier>,
    params: ScenarioParameters
  ): Map<string, ProductWithTier> {
    const filtered = new Map<string, ProductWithTier>()

    for (const [sku, product] of products) {
      // Check tier scope
      if (!params.sku_scope.includes(product.sku_tier as SkuTierCode)) {
        continue
      }

      // Check SKU filter
      if (params.sku_filter && !params.sku_filter.includes(sku)) {
        continue
      }

      filtered.set(sku, product)
    }

    return filtered
  }

  /**
   * Calculate weekly projections
   */
  private calculateProjections(
    products: Map<string, ProductWithTier>,
    baseline: BaselineData,
    weeks: string[],
    modifiers: {
      sales_lift_percent: number
      production_lead_adjustment_weeks: number
      shipping_mode_override: ShippingMode | null
    }
  ): WeeklyProjection[] {
    const projections: WeeklyProjection[] = []

    // Track running stock per SKU
    const runningStock = new Map<string, number>()
    for (const [sku, product] of products) {
      runningStock.set(sku, baseline.inventory.get(sku) || product.current_stock || 0)
    }

    for (const weekIso of weeks) {
      const weekDate = this.parseWeekISO(weekIso)
      const weekEndDate = addWeeks(weekDate, 1)

      const skuProjections: SKUProjection[] = []
      let totalStock = 0
      let totalSafetyThreshold = 0
      let stockoutCount = 0
      let riskCount = 0

      for (const [sku, product] of products) {
        const openingStock = runningStock.get(sku) || 0

        // Get forecast (with sales lift applied)
        const baseForecast = baseline.forecasts.get(sku)?.get(weekIso) || 0
        const salesQty = Math.round(baseForecast * (1 + modifiers.sales_lift_percent / 100))

        // Get arrivals (from pending shipments)
        const arrivalQty = this.calculateArrivals(
          sku,
          weekIso,
          baseline.pending_shipments,
          modifiers.shipping_mode_override
        )

        // Calculate closing stock
        const closingStock = Math.max(openingStock + arrivalQty - salesQty, -1000) // Allow negative for visibility

        // Calculate safety threshold
        const avgWeeklySales = this.calculateAverageWeeklySales(baseline.forecasts.get(sku) || new Map())
        const safetyThreshold = avgWeeklySales * product.safety_stock_weeks

        // Determine stock status
        let stockStatus: StockStatusType
        if (closingStock < 0) {
          stockStatus = 'Stockout'
          stockoutCount++
        } else if (closingStock < safetyThreshold) {
          stockStatus = 'Risk'
          riskCount++
        } else {
          stockStatus = 'OK'
        }

        // Calculate days of stock
        const dailySales = avgWeeklySales / 7
        const daysOfStock = dailySales > 0 ? Math.round(closingStock / dailySales) : null

        // Get arriving shipments references
        const arrivingShipments = this.getArrivingShipments(sku, weekIso, baseline.pending_shipments)

        skuProjections.push({
          sku,
          product_name: product.product_name,
          sku_tier: product.sku_tier as SkuTierCode,
          opening_stock: openingStock,
          arrival_qty: arrivalQty,
          sales_qty: salesQty,
          closing_stock: closingStock,
          stock_status: stockStatus,
          safety_threshold: safetyThreshold,
          days_of_stock: daysOfStock,
          arriving_shipments: arrivingShipments,
        })

        // Update running stock for next week
        runningStock.set(sku, closingStock)

        totalStock += Math.max(closingStock, 0)
        totalSafetyThreshold += safetyThreshold
      }

      projections.push({
        week_iso: weekIso,
        week_start_date: format(weekDate, 'yyyy-MM-dd'),
        week_end_date: format(weekEndDate, 'yyyy-MM-dd'),
        projections: skuProjections,
        cash_position: 0, // Simplified
        cash_inflow: 0,
        cash_outflow_procurement: 0,
        cash_outflow_logistics: 0,
        cash_outflow_total: 0,
        total_stock: totalStock,
        total_safety_threshold: totalSafetyThreshold,
        stockout_sku_count: stockoutCount,
        risk_sku_count: riskCount,
      })
    }

    return projections
  }

  /**
   * Calculate arrivals for a SKU in a given week
   */
  private calculateArrivals(
    sku: string,
    weekIso: string,
    pendingShipments: ShipmentPipeline[],
    modeOverride: ShippingMode | null
  ): number {
    let totalArrival = 0

    for (const shipment of pendingShipments) {
      if (shipment.sku !== sku) continue

      // Determine arrival week
      let arrivalWeek = shipment.arrival_week

      // Apply mode override if applicable
      if (modeOverride && shipment.shipping_mode !== modeOverride) {
        // Recalculate arrival based on new mode
        const currentMode = (shipment.shipping_mode as ShippingMode) || 'Sea'
        const currentTransit = (SHIPPING_MODE_CONFIG as Record<string, { transit_weeks: number }>)[currentMode]?.transit_weeks || 5
        const newTransit = (SHIPPING_MODE_CONFIG as Record<string, { transit_weeks: number }>)[modeOverride]?.transit_weeks || 5
        const weeksDelta = currentTransit - newTransit

        if (arrivalWeek) {
          arrivalWeek = this.addWeeksToWeekISO(arrivalWeek, -weeksDelta)
        }
      }

      if (arrivalWeek === weekIso) {
        totalArrival += shipment.shipped_qty
      }
    }

    return totalArrival
  }

  /**
   * Get arriving shipment references
   */
  private getArrivingShipments(
    sku: string,
    weekIso: string,
    pendingShipments: ShipmentPipeline[]
  ): ShipmentReference[] {
    const references: ShipmentReference[] = []

    for (const shipment of pendingShipments) {
      if (shipment.sku === sku && shipment.arrival_week === weekIso) {
        references.push({
          shipment_id: shipment.shipment_id,
          tracking_number: shipment.tracking_number,
          arriving_qty: shipment.shipped_qty,
          shipping_mode: (shipment.shipping_mode as ShippingMode) || 'Sea',
        })
      }
    }

    return references
  }

  /**
   * Identify stockout events from projections
   */
  private identifyStockoutEvents(
    projections: WeeklyProjection[],
    products: Map<string, ProductWithTier>,
    skuTiers: Map<SkuTierCode, SkuTier>
  ): { critical: StockoutEvent[]; acceptable: StockoutEvent[] } {
    const critical: StockoutEvent[] = []
    const acceptable: StockoutEvent[] = []

    // Track stockouts by SKU
    const stockoutTracker = new Map<string, { startWeek: string; duration: number; lostSales: number }>()

    for (const week of projections) {
      for (const proj of week.projections) {
        if (proj.stock_status === 'Stockout') {
          // Start or continue stockout
          if (!stockoutTracker.has(proj.sku)) {
            stockoutTracker.set(proj.sku, {
              startWeek: week.week_iso,
              duration: 1,
              lostSales: Math.max(0, -proj.closing_stock),
            })
          } else {
            const tracker = stockoutTracker.get(proj.sku)!
            tracker.duration++
            tracker.lostSales += Math.max(0, -proj.closing_stock)
          }
        } else if (stockoutTracker.has(proj.sku)) {
          // Stockout ended - create event
          const tracker = stockoutTracker.get(proj.sku)!
          const product = products.get(proj.sku)
          const tier = skuTiers.get(proj.sku_tier)

          const toleranceDays = tier?.stockout_tolerance_days || 0
          const durationDays = tracker.duration * 7
          const withinTolerance = durationDays <= toleranceDays

          const event: StockoutEvent = {
            sku: proj.sku,
            product_name: product?.product_name || proj.sku,
            sku_tier: proj.sku_tier,
            stockout_week: tracker.startWeek,
            duration_weeks: tracker.duration,
            severity: withinTolerance ? 'Acceptable' : 'Critical',
            within_tolerance: withinTolerance,
            projected_lost_sales: tracker.lostSales,
            recovery_week: week.week_iso,
          }

          if (withinTolerance) {
            acceptable.push(event)
          } else {
            critical.push(event)
          }

          stockoutTracker.delete(proj.sku)
        }
      }
    }

    // Handle ongoing stockouts at end of projection
    for (const [sku, tracker] of stockoutTracker) {
      const product = products.get(sku)
      const tier = skuTiers.get(product?.sku_tier as SkuTierCode)

      const toleranceDays = tier?.stockout_tolerance_days || 0
      const durationDays = tracker.duration * 7
      const withinTolerance = durationDays <= toleranceDays

      const event: StockoutEvent = {
        sku,
        product_name: product?.product_name || sku,
        sku_tier: product?.sku_tier as SkuTierCode || 'STANDARD',
        stockout_week: tracker.startWeek,
        duration_weeks: tracker.duration,
        severity: withinTolerance ? 'Acceptable' : 'Critical',
        within_tolerance: withinTolerance,
        projected_lost_sales: tracker.lostSales,
        recovery_week: null,
      }

      if (withinTolerance) {
        acceptable.push(event)
      } else {
        critical.push(event)
      }
    }

    return { critical, acceptable }
  }

  /**
   * Generate recommendations based on projections
   */
  private generateRecommendations(
    baseline: WeeklyProjection[],
    scenario: WeeklyProjection[],
    products: Map<string, ProductWithTier>,
    baselineData: BaselineData,
    params: ScenarioParameters
  ): RecommendedAction[] {
    const recommendations: RecommendedAction[] = []

    // Find SKUs at risk of stockout in scenario
    for (const week of scenario) {
      for (const proj of week.projections) {
        if (proj.stock_status === 'Stockout') {
          const product = products.get(proj.sku)
          if (!product) continue

          // Recommend creating urgent PO
          const avgWeeklySales = this.calculateAverageWeeklySales(
            baselineData.forecasts.get(proj.sku) || new Map()
          )
          const suggestedQty = Math.round(avgWeeklySales * product.safety_stock_weeks * 1.5)

          recommendations.push({
            action_id: crypto.randomUUID(),
            action_type: 'CREATE_PO',
            priority: proj.sku_tier === 'HERO' ? 'Critical' : 'High',
            description: `Create emergency order for ${proj.sku}`,
            rationale: `Projected stockout in ${week.week_iso}. Current closing stock: ${proj.closing_stock}`,
            target_type: 'po_item',
            target_id: null,
            payload: {
              sku: proj.sku,
              suggested_qty: suggestedQty,
              unit_price_usd: product.unit_cost_usd,
              order_deadline: week.week_start_date,
              expected_delivery_week: this.addWeeksToWeekISO(
                week.week_iso,
                product.production_lead_weeks + 5
              ),
            },
            cash_impact: -suggestedQty * product.unit_cost_usd,
            stockout_prevention: true,
            estimated_savings: null,
          })
        }
      }
    }

    return recommendations
  }

  /**
   * Evaluate capital constraints
   */
  private evaluateCapitalConstraints(
    actions: RecommendedAction[],
    budgetCap: number,
    periodType: 'monthly' | 'quarterly',
    products: Map<string, ProductWithTier>,
    skuTiers: Map<SkuTierCode, SkuTier>
  ): CapitalConstraintResult {
    // Sort actions by priority (tier weight)
    const sortedActions = [...actions].sort((a, b) => {
      if (a.payload && b.payload && 'sku' in a.payload && 'sku' in b.payload) {
        const tierA = products.get(a.payload.sku)?.sku_tier as SkuTierCode
        const tierB = products.get(b.payload.sku)?.sku_tier as SkuTierCode
        const weightA = skuTiers.get(tierA)?.priority_weight || 0
        const weightB = skuTiers.get(tierB)?.priority_weight || 0
        return weightB - weightA
      }
      return 0
    })

    const included: DeferralSuggestion[] = []
    const deferred: DeferralSuggestion[] = []
    let remainingBudget = budgetCap
    let totalPlanned = 0

    for (const action of sortedActions) {
      const cost = Math.abs(action.cash_impact)
      totalPlanned += cost

      if (action.payload && 'sku' in action.payload) {
        const product = products.get(action.payload.sku)
        const tier = product?.sku_tier as SkuTierCode
        const tierConfig = skuTiers.get(tier)

        const suggestion: DeferralSuggestion = {
          po_id: action.target_id || '',
          po_number: '',
          sku: action.payload.sku,
          product_name: product?.product_name || action.payload.sku,
          sku_tier: tier || 'STANDARD',
          priority_weight: tierConfig?.priority_weight || 50,
          amount_usd: cost,
          planned_order_date: action.payload.order_deadline,
          stockout_impact: {
            causes_stockout: action.stockout_prevention,
            stockout_week: null,
            stockout_duration_weeks: 0,
            within_tolerance: false,
          },
          recommended_action: cost <= remainingBudget ? 'INCLUDE' : 'DEFER',
          defer_to_period: null,
        }

        if (cost <= remainingBudget) {
          included.push(suggestion)
          remainingBudget -= cost
        } else {
          deferred.push(suggestion)
        }
      }
    }

    return {
      period: this.getCurrentPeriod(periodType),
      period_type: periodType,
      budget_cap: budgetCap,
      planned_spend: totalPlanned,
      exceeds_cap: totalPlanned > budgetCap,
      excess_amount: Math.max(0, totalPlanned - budgetCap),
      remaining_budget: remainingBudget,
      included_pos: included,
      deferred_pos: deferred,
    }
  }

  /**
   * Calculate totals from projections
   */
  private calculateTotals(projections: WeeklyProjection[]): {
    totalOutflow: number
    stockoutCount: number
    avgDaysOfStock: number
  } {
    let totalOutflow = 0
    let stockoutCount = 0
    let totalDaysOfStock = 0
    let daysOfStockCount = 0

    for (const week of projections) {
      totalOutflow += week.cash_outflow_total
      stockoutCount += week.stockout_sku_count

      for (const proj of week.projections) {
        if (proj.days_of_stock !== null) {
          totalDaysOfStock += proj.days_of_stock
          daysOfStockCount++
        }
      }
    }

    return {
      totalOutflow,
      stockoutCount,
      avgDaysOfStock: daysOfStockCount > 0 ? totalDaysOfStock / daysOfStockCount : 0,
    }
  }

  /**
   * Generate scenario hash for caching
   */
  private generateScenarioHash(params: ScenarioParameters): string {
    const normalized = {
      sales_lift: params.sales_lift_percent,
      mode: params.shipping_mode_override,
      lead_adj: params.production_lead_adjustment_weeks,
      cap: params.capital_constraint_enabled ? params.capital_cap_usd : null,
      cap_period: params.capital_period,
      skus: params.sku_filter?.sort().join(',') || 'ALL',
      tiers: params.sku_scope.sort().join(','),
      horizon: params.time_horizon_weeks,
    }

    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .substring(0, 16)
  }

  /**
   * Parse week ISO string to Date
   */
  private parseWeekISO(weekISO: string): Date {
    const [year, week] = weekISO.split('-W').map(Number)
    const jan4 = new Date(year, 0, 4)
    const weekStart = startOfISOWeek(jan4)
    return addWeeks(weekStart, week - 1)
  }

  /**
   * Add weeks to week ISO string
   */
  private addWeeksToWeekISO(weekISO: string, weeksToAdd: number): string {
    const date = this.parseWeekISO(weekISO)
    const newDate = addWeeks(date, weeksToAdd)
    const year = getISOWeekYear(newDate)
    const week = getISOWeek(newDate)
    return `${year}-W${week.toString().padStart(2, '0')}`
  }

  /**
   * Calculate average weekly sales from forecast map
   */
  private calculateAverageWeeklySales(forecasts: Map<string, number>): number {
    if (forecasts.size === 0) return 0
    const total = Array.from(forecasts.values()).reduce((sum, qty) => sum + qty, 0)
    return total / forecasts.size
  }

  /**
   * Get current period key
   */
  private getCurrentPeriod(periodType: 'monthly' | 'quarterly'): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    if (periodType === 'monthly') {
      return `${year}-${month.toString().padStart(2, '0')}`
    } else {
      const quarter = Math.ceil(month / 3)
      return `${year}-Q${quarter}`
    }
  }
}
