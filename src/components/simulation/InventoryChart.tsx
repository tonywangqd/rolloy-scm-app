'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import type {
  WeeklyProjection,
  SkuTierCode,
  StockStatusType,
  InventoryChartDataPoint,
} from '@/lib/types/simulation'
import { cn } from '@/lib/utils'

interface InventoryChartProps {
  baseline: WeeklyProjection[]
  scenario: WeeklyProjection[]
  selectedSKU?: string | null
  onSelectSKU?: (sku: string | null) => void
}

// SKU tier safety thresholds (in weeks of sales)
const SKU_TIER_SAFETY_WEEKS: Record<SkuTierCode, number> = {
  HERO: 4,
  STANDARD: 3,
  ACCESSORY: 2,
}

export function InventoryChart({
  baseline,
  scenario,
  selectedSKU,
  onSelectSKU,
}: InventoryChartProps) {
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null)

  // Transform data for chart
  const chartData = useMemo((): InventoryChartDataPoint[] => {
    if (!baseline.length || !scenario.length) return []

    return baseline.map((baseWeek, index) => {
      const scenarioWeek = scenario[index]

      // Calculate totals or single SKU values
      let baselineStock = 0
      let scenarioStock = 0
      let safetyThreshold = 0

      if (selectedSKU) {
        // Single SKU view
        const baseSKU = baseWeek.projections.find((p) => p.sku === selectedSKU)
        const scenarioSKU = scenarioWeek?.projections.find((p) => p.sku === selectedSKU)

        baselineStock = baseSKU?.closing_stock ?? 0
        scenarioStock = scenarioSKU?.closing_stock ?? 0
        safetyThreshold = baseSKU?.safety_threshold ?? 0
      } else {
        // Aggregated view
        baselineStock = baseWeek.total_stock
        scenarioStock = scenarioWeek?.total_stock ?? 0
        safetyThreshold = baseWeek.total_safety_threshold
      }

      // Determine zones
      const stockoutZone = scenarioStock < 0
      const riskZone = scenarioStock >= 0 && scenarioStock < safetyThreshold

      // Format week label (e.g., "2025-W01" -> "W01")
      const weekLabel = baseWeek.week_iso.split('-W')[1]
        ? `W${baseWeek.week_iso.split('-W')[1]}`
        : baseWeek.week_iso

      return {
        week_iso: baseWeek.week_iso,
        week_label: weekLabel,
        baseline_stock: baselineStock,
        scenario_stock: scenarioStock,
        safety_threshold: safetyThreshold,
        stockout_zone: stockoutZone,
        risk_zone: riskZone,
      }
    })
  }, [baseline, scenario, selectedSKU])

  // Get available SKUs for legend/filter
  const availableSKUs = useMemo(() => {
    if (!baseline.length) return []
    const skus = new Map<string, { name: string; tier: SkuTierCode }>()
    baseline[0].projections.forEach((p) => {
      skus.set(p.sku, { name: p.product_name, tier: p.sku_tier })
    })
    return Array.from(skus.entries()).map(([sku, info]) => ({
      sku,
      ...info,
    }))
  }, [baseline])

  // Calculate Y-axis domain
  const yDomain = useMemo(() => {
    if (!chartData.length) return [0, 100]
    const allValues = chartData.flatMap((d) => [
      d.baseline_stock,
      d.scenario_stock,
      d.safety_threshold,
    ])
    const min = Math.min(0, ...allValues)
    const max = Math.max(...allValues) * 1.1
    return [min, max]
  }, [chartData])

  // Calculate safety threshold for reference areas
  const avgSafetyThreshold = useMemo(() => {
    if (!chartData.length) return 0
    return chartData.reduce((sum, d) => sum + d.safety_threshold, 0) / chartData.length
  }, [chartData])

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload as InventoryChartDataPoint
      if (!data) return null

      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 font-semibold text-gray-900">{data.week_iso}</p>
          <div className="space-y-1">
            <p className="text-sm text-gray-600">
              Baseline Stock:{' '}
              <span className="font-semibold text-blue-600">
                {data.baseline_stock.toLocaleString()}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              Scenario Stock:{' '}
              <span
                className={cn(
                  'font-semibold',
                  data.stockout_zone
                    ? 'text-red-600'
                    : data.risk_zone
                      ? 'text-amber-600'
                      : 'text-green-600'
                )}
              >
                {data.scenario_stock.toLocaleString()}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              Safety Threshold:{' '}
              <span className="font-semibold text-orange-500">
                {data.safety_threshold.toLocaleString()}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              Status:{' '}
              <span
                className={cn(
                  'font-semibold',
                  data.stockout_zone
                    ? 'text-red-600'
                    : data.risk_zone
                      ? 'text-amber-600'
                      : 'text-green-600'
                )}
              >
                {data.stockout_zone ? 'Stockout' : data.risk_zone ? 'Risk' : 'OK'}
              </span>
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  if (!chartData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inventory Projection</CardTitle>
          <CardDescription>
            Baseline vs Scenario comparison with safety zones
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-80 items-center justify-center text-gray-500">
            Run a simulation to see inventory projections
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Inventory Projection</CardTitle>
            <CardDescription>
              {selectedSKU
                ? `${selectedSKU} - Baseline vs Scenario`
                : 'All SKUs - Baseline vs Scenario'}
            </CardDescription>
          </div>
          {availableSKUs.length > 0 && (
            <select
              value={selectedSKU ?? ''}
              onChange={(e) => onSelectSKU?.(e.target.value || null)}
              className="text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              <option value="">All SKUs (Aggregated)</option>
              {availableSKUs.map((sku) => (
                <option key={sku.sku} value={sku.sku}>
                  {sku.sku} - {sku.name} ({sku.tier})
                </option>
              ))}
            </select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
            onMouseMove={(state) => {
              if (state?.activeLabel) {
                setHoveredWeek(state.activeLabel as string)
              }
            }}
            onMouseLeave={() => setHoveredWeek(null)}
          >
            {/* Background zones */}
            {/* Red zone for stockout (below 0) */}
            <ReferenceArea
              y1={yDomain[0]}
              y2={0}
              fill="#FEE2E2"
              fillOpacity={0.6}
              label={{ value: 'Stockout Zone', fill: '#DC2626', fontSize: 10 }}
            />

            {/* Yellow zone for risk (0 to safety threshold) */}
            <ReferenceArea
              y1={0}
              y2={avgSafetyThreshold}
              fill="#FEF3C7"
              fillOpacity={0.4}
              label={{ value: 'Risk Zone', fill: '#D97706', fontSize: 10, position: 'insideTopLeft' }}
            />

            {/* Green zone for healthy (above safety threshold) */}
            <ReferenceArea
              y1={avgSafetyThreshold}
              y2={yDomain[1]}
              fill="#D1FAE5"
              fillOpacity={0.3}
            />

            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

            <XAxis
              dataKey="week_label"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#e5e7eb' }}
            />

            <YAxis
              domain={yDomain}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(value) => value.toLocaleString()}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
              formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
            />

            {/* Safety threshold reference line */}
            <ReferenceLine
              y={avgSafetyThreshold}
              stroke="#F97316"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: 'Safety Threshold',
                fill: '#F97316',
                fontSize: 11,
                position: 'right',
              }}
            />

            {/* Zero line */}
            <ReferenceLine y={0} stroke="#6B7280" strokeWidth={1} />

            {/* Baseline line (solid) */}
            <Line
              type="monotone"
              dataKey="baseline_stock"
              name="Baseline"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={{ fill: '#3B82F6', r: 3 }}
              activeDot={{ r: 5 }}
            />

            {/* Scenario line (dashed) */}
            <Line
              type="monotone"
              dataKey="scenario_stock"
              name="Scenario"
              stroke="#8B5CF6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={(props: any) => {
                const { payload, cx, cy } = props
                if (!payload) return null

                // Color based on status
                let fillColor = '#10B981' // Green for OK
                if (payload.stockout_zone) {
                  fillColor = '#EF4444' // Red for stockout
                } else if (payload.risk_zone) {
                  fillColor = '#F59E0B' // Amber for risk
                }

                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={payload.stockout_zone ? 6 : 3}
                    fill={fillColor}
                    stroke="#fff"
                    strokeWidth={payload.stockout_zone ? 2 : 0}
                  />
                )
              }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Legend for zones */}
        <div className="mt-4 flex items-center justify-center gap-6 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-200" />
            <span className="text-gray-600">Healthy Stock</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-200" />
            <span className="text-gray-600">Risk Zone</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-200" />
            <span className="text-gray-600">Stockout Zone</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
