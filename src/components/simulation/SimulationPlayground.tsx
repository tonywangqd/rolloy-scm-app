'use client'

import { useState, useCallback, useTransition, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ControlPanel } from './ControlPanel'
import { InventoryChart } from './InventoryChart'
import { CashFlowChart } from './CashFlowChart'
import { KPISummaryCards } from './KPISummaryCards'
import { RiskHeatmap } from './RiskHeatmap'
import {
  BarChart3,
  DollarSign,
  Grid3X3,
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import {
  type ScenarioParameters,
  type SimulationResult,
  type SimulationPlaygroundState,
  DEFAULT_SCENARIO_PARAMS,
} from '@/lib/types/simulation'
import { cn } from '@/lib/utils'

// Mock simulation action (will be replaced by actual backend)
async function mockRunSimulation(
  params: ScenarioParameters
): Promise<{ success: boolean; result: SimulationResult | null; error: string | null }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Generate mock data for 12 weeks
  const weeks = Array.from({ length: params.time_horizon_weeks }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() + i * 7)
    const weekNum = String(Math.ceil((date.getDate() - 1) / 7) + 1).padStart(2, '0')
    const year = date.getFullYear()
    return {
      week_iso: `${year}-W${weekNum}`,
      week_start_date: date.toISOString().split('T')[0],
      week_end_date: new Date(date.getTime() + 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
    }
  })

  // Generate mock SKU projections
  const skus = [
    { sku: 'SKU-001', name: 'Premium Widget A', tier: 'HERO' as const },
    { sku: 'SKU-002', name: 'Standard Widget B', tier: 'STANDARD' as const },
    { sku: 'SKU-003', name: 'Basic Widget C', tier: 'STANDARD' as const },
    { sku: 'SKU-004', name: 'Accessory Pack D', tier: 'ACCESSORY' as const },
  ]

  const generateProjections = (isScenario: boolean) => {
    return weeks.map((week, weekIndex) => {
      const projections = skus
        .filter((s) => params.sku_scope.includes(s.tier))
        .map((sku) => {
          // Base values
          const baseSales = sku.tier === 'HERO' ? 500 : sku.tier === 'STANDARD' ? 300 : 100
          const salesLift = isScenario ? params.sales_lift_percent / 100 : 0
          const sales = Math.round(baseSales * (1 + salesLift) * (0.8 + Math.random() * 0.4))

          // Inventory calculation
          const safetyWeeks = sku.tier === 'HERO' ? 4 : sku.tier === 'STANDARD' ? 3 : 2
          const safety = sales * safetyWeeks
          const baseStock = sku.tier === 'HERO' ? 5000 : sku.tier === 'STANDARD' ? 3000 : 1000
          const arrival = weekIndex % 3 === 0 ? Math.round(sales * 2.5) : 0
          const closing = Math.max(
            baseStock - weekIndex * sales * 0.3 + arrival - sales * (isScenario ? 1.2 : 1),
            -500
          )

          const status: 'OK' | 'Risk' | 'Stockout' =
            closing < 0 ? 'Stockout' : closing < safety ? 'Risk' : 'OK'

          return {
            sku: sku.sku,
            product_name: sku.name,
            sku_tier: sku.tier,
            opening_stock: closing + sales,
            arrival_qty: arrival,
            sales_qty: sales,
            closing_stock: closing,
            stock_status: status,
            safety_threshold: safety,
            days_of_stock: sales > 0 ? Math.round((closing / sales) * 7) : null,
            arriving_shipments: [],
          }
        })

      // Cash flow calculations
      const baseCash = 500000
      const weeklyOutflow = projections.reduce(
        (sum, p) => sum + p.sales_qty * (isScenario ? 12 : 10),
        0
      )
      const weeklyInflow = projections.reduce((sum, p) => sum + p.sales_qty * 20, 0)

      return {
        ...week,
        projections,
        cash_position: baseCash - weeklyOutflow * weekIndex + weeklyInflow * weekIndex,
        cash_inflow: weeklyInflow,
        cash_outflow_procurement: weeklyOutflow * 0.7,
        cash_outflow_logistics: weeklyOutflow * 0.3,
        cash_outflow_total: weeklyOutflow,
        total_stock: projections.reduce((sum, p) => sum + p.closing_stock, 0),
        total_safety_threshold: projections.reduce((sum, p) => sum + p.safety_threshold, 0),
        stockout_sku_count: projections.filter((p) => p.stock_status === 'Stockout').length,
        risk_sku_count: projections.filter((p) => p.stock_status === 'Risk').length,
      }
    })
  }

  const baseline = generateProjections(false)
  const scenario = generateProjections(true)

  const result: SimulationResult = {
    baseline,
    scenario,
    cash_impact_total: params.shipping_mode_override === 'Air' ? -15000 : params.sales_lift_percent > 0 ? -8000 : 5000,
    stockout_count_delta: params.sales_lift_percent > 20 ? 3 : params.sales_lift_percent < 0 ? -1 : 0,
    days_of_stock_delta: params.production_lead_adjustment_weeks > 2 ? -7 : 0,
    critical_stockouts: [],
    acceptable_gaps: [],
    recommended_actions: [],
    capital_analysis: params.capital_constraint_enabled && params.capital_cap_usd
      ? {
          period: '2025-01',
          period_type: params.capital_period,
          budget_cap: params.capital_cap_usd,
          planned_spend: params.capital_cap_usd * 0.85,
          exceeds_cap: false,
          excess_amount: 0,
          remaining_budget: params.capital_cap_usd * 0.15,
          included_pos: [],
          deferred_pos: [],
        }
      : null,
    calculated_at: new Date().toISOString(),
    parameters_hash: 'mock-hash-' + Date.now(),
    execution_time_ms: 1500,
  }

  return { success: true, result, error: null }
}

export function SimulationPlayground() {
  // State
  const [params, setParams] = useState<ScenarioParameters>(DEFAULT_SCENARIO_PARAMS)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'inventory' | 'cashflow' | 'heatmap'>('inventory')
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null)

  // Transitions for loading states
  const [isRunning, startRunTransition] = useTransition()
  const [isRefreshing, startRefreshTransition] = useTransition()

  // Run simulation
  const handleRunSimulation = useCallback(() => {
    startRunTransition(async () => {
      setError(null)
      try {
        // TODO: Replace with actual server action
        // const response = await runSimulation(params)
        const response = await mockRunSimulation(params)

        if (response.success && response.result) {
          setResult(response.result)
        } else {
          setError(response.error || 'Simulation failed')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred')
      }
    })
  }, [params])

  // Refresh baseline data on mount
  useEffect(() => {
    startRefreshTransition(async () => {
      // TODO: Replace with actual server action
      // await refreshSimulationData()
      console.log('Refreshing baseline data...')
    })
  }, [])

  return (
    <div className="flex h-[calc(100vh-120px)] gap-6">
      {/* Control Panel - Left Side (30%) */}
      <div className="w-[350px] flex-shrink-0">
        <ControlPanel
          params={params}
          onParamsChange={setParams}
          onRunSimulation={handleRunSimulation}
          isLoading={isRunning}
        />
      </div>

      {/* Visualization Area - Right Side (70%) */}
      <div className="flex-1 overflow-auto space-y-6">
        {/* Loading/Error States */}
        {isRefreshing && (
          <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-4 py-2 rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin" />
            Refreshing baseline data...
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* KPI Summary Cards */}
        <KPISummaryCards
          result={result}
          capitalCap={params.capital_constraint_enabled ? params.capital_cap_usd : null}
        />

        {/* Tab Group for Charts */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="cashflow" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Cash Flow
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4" />
              Risk Heatmap
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="mt-4">
            <InventoryChart
              baseline={result?.baseline ?? []}
              scenario={result?.scenario ?? []}
              selectedSKU={selectedSKU}
              onSelectSKU={setSelectedSKU}
            />
          </TabsContent>

          <TabsContent value="cashflow" className="mt-4">
            <CashFlowChart
              baseline={result?.baseline ?? []}
              scenario={result?.scenario ?? []}
              capitalCap={params.capital_constraint_enabled ? params.capital_cap_usd : null}
            />
          </TabsContent>

          <TabsContent value="heatmap" className="mt-4">
            <RiskHeatmap
              projections={result?.scenario ?? []}
              tierFilter={params.sku_scope}
            />
          </TabsContent>
        </Tabs>

        {/* Execute Button (conditional - only show when result exists and has recommendations) */}
        {result && result.recommended_actions.length > 0 && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">
                      {result.recommended_actions.length} actions recommended
                    </p>
                    <p className="text-sm text-green-700">
                      Review and execute to apply scenario changes
                    </p>
                  </div>
                </div>
                <Button variant="primary" className="bg-green-600 hover:bg-green-700">
                  <Play className="h-4 w-4 mr-2" />
                  Execute Actions
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!result && !isRunning && !error && (
          <Card className="border-dashed border-2 border-gray-300">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BarChart3 className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Simulation Results
              </h3>
              <p className="text-sm text-gray-500 text-center max-w-md mb-4">
                Configure your scenario parameters in the control panel and click
                &quot;Run Simulation&quot; to see inventory and cash flow projections.
              </p>
              <Button variant="primary" onClick={handleRunSimulation}>
                <Play className="h-4 w-4 mr-2" />
                Run First Simulation
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading Skeleton */}
        {isRunning && (
          <Card>
            <CardContent className="flex items-center justify-center py-24">
              <div className="text-center">
                <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Running simulation...</p>
                <p className="text-sm text-gray-400">
                  Calculating projections for {params.time_horizon_weeks} weeks
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
