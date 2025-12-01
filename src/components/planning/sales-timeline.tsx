'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'

interface SalesTimelineProps {
  data: {
    weeks: {
      week_iso: string
      week_type: 'past' | 'current' | 'future'
      forecast_total: number
      actual_total: number
      variance: number
      variance_pct: number
    }[]
    by_sku: {
      sku: string
      product_name?: string
      weeks: { week_iso: string; forecast: number; actual: number }[]
    }[]
  }
}

interface ChartDataPoint {
  week: string
  week_full: string
  week_type: 'past' | 'current' | 'future'
  forecast: number
  actual: number
  variance: number
  variance_pct: number
  display_value: number
}

export function SalesTimeline({ data }: SalesTimelineProps) {
  // Format data for chart
  const chartData: ChartDataPoint[] = data.weeks.map((week) => ({
    week: week.week_iso.split('-W')[1] ? `W${week.week_iso.split('-W')[1]}` : week.week_iso,
    week_full: week.week_iso,
    week_type: week.week_type,
    forecast: week.forecast_total,
    actual: week.actual_total,
    variance: week.variance,
    variance_pct: week.variance_pct,
    // Use actual for past weeks, forecast for future weeks
    display_value: week.week_type === 'past' ? week.actual_total : week.forecast_total,
  }))

  // Custom tooltip with proper typing
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartDataPoint
      const isPast = data.week_type === 'past'
      const isCurrent = data.week_type === 'current'
      const isFuture = data.week_type === 'future'

      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 font-semibold text-gray-900">
            {data.week_full}
            {isCurrent && <span className="ml-2 text-xs text-yellow-600">(当前周)</span>}
          </p>
          <div className="space-y-1">
            {isPast && (
              <>
                <p className="text-sm text-green-600">
                  实际销量: <span className="font-semibold">{data.actual.toLocaleString()}</span>
                </p>
                <p className="text-sm text-blue-600">
                  预测销量: <span className="font-semibold">{data.forecast.toLocaleString()}</span>
                </p>
                <p className={`text-sm ${data.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  偏差: <span className="font-semibold">
                    {data.variance >= 0 ? '+' : ''}{data.variance.toLocaleString()}
                    ({data.variance_pct >= 0 ? '+' : ''}{data.variance_pct.toFixed(1)}%)
                  </span>
                </p>
              </>
            )}
            {isCurrent && (
              <>
                <p className="text-sm text-blue-600">
                  预测销量: <span className="font-semibold">{data.forecast.toLocaleString()}</span>
                </p>
                {data.actual > 0 && (
                  <p className="text-sm text-green-600">
                    当前销量: <span className="font-semibold">{data.actual.toLocaleString()}</span>
                  </p>
                )}
              </>
            )}
            {isFuture && (
              <p className="text-sm text-blue-600">
                预测销量: <span className="font-semibold">{data.forecast.toLocaleString()}</span>
              </p>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  // Custom bar cell color based on week type
  const getBarColor = (week_type: 'past' | 'current' | 'future') => {
    switch (week_type) {
      case 'past':
        return '#10b981' // green-500 for actual sales
      case 'current':
        return '#f59e0b' // amber-500 for current week
      case 'future':
        return '#3b82f6' // blue-500 for forecast sales
    }
  }

  if (!data || data.weeks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>销量时间线</CardTitle>
          <CardDescription>过去4周 + 当前周 + 未来12周销量数据</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-80 items-center justify-center text-gray-500">
            暂无数据
          </div>
        </CardContent>
      </Card>
    )
  }

  // Find current week index for reference line
  const currentWeekIndex = chartData.findIndex((d) => d.week_type === 'current')

  return (
    <Card>
      <CardHeader>
        <CardTitle>销量时间线</CardTitle>
        <CardDescription>
          过去4周实际销量 + 当前周 + 未来12周预测销量（共{data.weeks.length}周）
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Legend - Responsive layout */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3 text-sm sm:gap-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 shrink-0 rounded bg-green-500" />
            <span className="text-gray-600">过去周（实际）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 shrink-0 rounded bg-amber-500" />
            <span className="text-gray-600">当前周</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 shrink-0 rounded bg-blue-500" />
            <span className="text-gray-600">未来周（预测）</span>
          </div>
        </div>

        {/* Chart - Responsive height */}
        <ResponsiveContainer width="100%" height={350} className="sm:h-[400px]">
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="week"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={{ stroke: '#e5e7eb' }}
              angle={-45}
              textAnchor="end"
              height={70}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(value) => {
                if (typeof value === 'number') {
                  return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString()
                }
                return String(value)
              }}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Reference line at current week */}
            {currentWeekIndex >= 0 && (
              <ReferenceLine
                x={chartData[currentWeekIndex].week}
                stroke="#f59e0b"
                strokeDasharray="5 5"
                label={{
                  value: '当前周',
                  position: 'top',
                  fill: '#f59e0b',
                  fontSize: 12,
                }}
              />
            )}

            {/* Single bar with different colors based on week type */}
            <Bar
              dataKey="display_value"
              name="销量"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.week_type)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Summary Stats - Responsive grid */}
        <div className="mt-6 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3 sm:gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-500 sm:text-sm">过去4周总实际</p>
            <p className="text-lg font-semibold text-green-600 sm:text-xl">
              {data.weeks
                .filter((w) => w.week_type === 'past')
                .reduce((sum, w) => sum + w.actual_total, 0)
                .toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 sm:text-sm">当前周预测</p>
            <p className="text-lg font-semibold text-amber-600 sm:text-xl">
              {data.weeks
                .filter((w) => w.week_type === 'current')
                .reduce((sum, w) => sum + w.forecast_total, 0)
                .toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 sm:text-sm">未来12周预测</p>
            <p className="text-lg font-semibold text-blue-600 sm:text-xl">
              {data.weeks
                .filter((w) => w.week_type === 'future')
                .reduce((sum, w) => sum + w.forecast_total, 0)
                .toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
