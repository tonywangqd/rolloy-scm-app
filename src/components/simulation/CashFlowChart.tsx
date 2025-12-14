'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { WeeklyProjection, CashFlowDataPoint } from '@/lib/types/simulation'
import { cn } from '@/lib/utils'

interface CashFlowChartProps {
  baseline: WeeklyProjection[]
  scenario: WeeklyProjection[]
  capitalCap?: number | null
}

export function CashFlowChart({ baseline, scenario, capitalCap }: CashFlowChartProps) {
  // Transform data for chart
  const chartData = useMemo((): CashFlowDataPoint[] => {
    if (!baseline.length || !scenario.length) return []

    return baseline.map((baseWeek, index) => {
      const scenarioWeek = scenario[index]

      // Format week label
      const weekLabel = baseWeek.week_iso.split('-W')[1]
        ? `W${baseWeek.week_iso.split('-W')[1]}`
        : baseWeek.week_iso

      return {
        week_iso: baseWeek.week_iso,
        week_label: weekLabel,
        baseline_cash: baseWeek.cash_position,
        scenario_cash: scenarioWeek?.cash_position ?? 0,
        baseline_outflow: baseWeek.cash_outflow_total,
        scenario_outflow: scenarioWeek?.cash_outflow_total ?? 0,
        baseline_inflow: baseWeek.cash_inflow,
        scenario_inflow: scenarioWeek?.cash_inflow ?? 0,
        capital_cap: capitalCap ?? null,
      }
    })
  }, [baseline, scenario, capitalCap])

  // Calculate cumulative outflows for area chart
  const areaData = useMemo(() => {
    if (!chartData.length) return []

    let baselineCumulative = 0
    let scenarioCumulative = 0

    return chartData.map((d) => {
      baselineCumulative += d.baseline_outflow
      scenarioCumulative += d.scenario_outflow

      return {
        ...d,
        baseline_cumulative_outflow: baselineCumulative,
        scenario_cumulative_outflow: scenarioCumulative,
      }
    })
  }, [chartData])

  // Calculate Y-axis domain
  const yDomain = useMemo(() => {
    if (!areaData.length) return [0, 100000]

    const allValues = areaData.flatMap((d) => [
      d.baseline_cumulative_outflow,
      d.scenario_cumulative_outflow,
    ])

    if (capitalCap) {
      allValues.push(capitalCap)
    }

    const max = Math.max(...allValues) * 1.1
    return [0, max]
  }, [areaData, capitalCap])

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload
      if (!data) return null

      const exceeds = capitalCap && data.scenario_cumulative_outflow > capitalCap

      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 font-semibold text-gray-900">{data.week_iso}</p>
          <div className="space-y-1">
            <p className="text-sm text-gray-600">
              Baseline Outflow (Cumulative):{' '}
              <span className="font-semibold text-blue-600">
                ${data.baseline_cumulative_outflow.toLocaleString()}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              Scenario Outflow (Cumulative):{' '}
              <span
                className={cn(
                  'font-semibold',
                  exceeds ? 'text-red-600' : 'text-purple-600'
                )}
              >
                ${data.scenario_cumulative_outflow.toLocaleString()}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              Weekly Delta:{' '}
              <span
                className={cn(
                  'font-semibold',
                  data.scenario_outflow > data.baseline_outflow
                    ? 'text-red-600'
                    : 'text-green-600'
                )}
              >
                {data.scenario_outflow > data.baseline_outflow ? '+' : ''}$
                {(data.scenario_outflow - data.baseline_outflow).toLocaleString()}
              </span>
            </p>
            {capitalCap && (
              <p className="text-sm text-gray-600 pt-1 border-t border-gray-200 mt-1">
                Budget Cap:{' '}
                <span className="font-semibold text-orange-600">
                  ${capitalCap.toLocaleString()}
                </span>
                {exceeds && (
                  <span className="ml-2 text-red-600 font-semibold">
                    (Exceeded by ${(data.scenario_cumulative_outflow - capitalCap).toLocaleString()})
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  if (!areaData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow Projection</CardTitle>
          <CardDescription>Cumulative procurement & logistics spend</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-80 items-center justify-center text-gray-500">
            Run a simulation to see cash flow projections
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
            <CardTitle>Cash Flow Projection</CardTitle>
            <CardDescription>
              Cumulative procurement & logistics spend (Baseline vs Scenario)
            </CardDescription>
          </div>
          {capitalCap && (
            <div className="text-sm">
              <span className="text-gray-500">Budget Cap: </span>
              <span className="font-semibold text-orange-600">
                ${capitalCap.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart
            data={areaData}
            margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
          >
            <defs>
              <linearGradient id="baselineGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="scenarioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05} />
              </linearGradient>
            </defs>

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
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="rect"
              formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
            />

            {/* Capital constraint reference line */}
            {capitalCap && (
              <ReferenceLine
                y={capitalCap}
                stroke="#F97316"
                strokeDasharray="8 4"
                strokeWidth={2}
                label={{
                  value: 'Budget Cap',
                  fill: '#F97316',
                  fontSize: 11,
                  position: 'right',
                }}
              />
            )}

            {/* Baseline area */}
            <Area
              type="monotone"
              dataKey="baseline_cumulative_outflow"
              name="Baseline Spend"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#baselineGradient)"
              activeDot={{ r: 5 }}
            />

            {/* Scenario area */}
            <Area
              type="monotone"
              dataKey="scenario_cumulative_outflow"
              name="Scenario Spend"
              stroke="#8B5CF6"
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="url(#scenarioGradient)"
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Summary footer */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
          <div className="p-2 bg-blue-50 rounded-lg">
            <p className="text-gray-600">Baseline Total</p>
            <p className="font-semibold text-blue-600">
              ${areaData[areaData.length - 1]?.baseline_cumulative_outflow.toLocaleString() ?? 0}
            </p>
          </div>
          <div className="p-2 bg-purple-50 rounded-lg">
            <p className="text-gray-600">Scenario Total</p>
            <p className="font-semibold text-purple-600">
              ${areaData[areaData.length - 1]?.scenario_cumulative_outflow.toLocaleString() ?? 0}
            </p>
          </div>
          <div className={cn(
            'p-2 rounded-lg',
            (areaData[areaData.length - 1]?.scenario_cumulative_outflow ?? 0) >
            (areaData[areaData.length - 1]?.baseline_cumulative_outflow ?? 0)
              ? 'bg-red-50'
              : 'bg-green-50'
          )}>
            <p className="text-gray-600">Difference</p>
            <p className={cn(
              'font-semibold',
              (areaData[areaData.length - 1]?.scenario_cumulative_outflow ?? 0) >
              (areaData[areaData.length - 1]?.baseline_cumulative_outflow ?? 0)
                ? 'text-red-600'
                : 'text-green-600'
            )}>
              {(areaData[areaData.length - 1]?.scenario_cumulative_outflow ?? 0) >
              (areaData[areaData.length - 1]?.baseline_cumulative_outflow ?? 0)
                ? '+'
                : ''}
              $
              {(
                (areaData[areaData.length - 1]?.scenario_cumulative_outflow ?? 0) -
                (areaData[areaData.length - 1]?.baseline_cumulative_outflow ?? 0)
              ).toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
