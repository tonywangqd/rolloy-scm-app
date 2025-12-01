'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts'
import type { WeeklySalesTrendData } from '@/lib/queries/charts'

interface SalesTrendChartProps {
  data: WeeklySalesTrendData[]
}

export function SalesTrendChart({ data }: SalesTrendChartProps) {
  // Format week_iso to display format (e.g., "2025-W01" -> "W01")
  const chartData = data.map((item) => ({
    ...item,
    week: item.week_iso.split('-W')[1] ? `W${item.week_iso.split('-W')[1]}` : item.week_iso,
  }))

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 font-semibold text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-semibold">{entry.value.toLocaleString()}</span>
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>销量趋势</CardTitle>
          <CardDescription>最近12周的销售预测与实际对比</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-80 items-center justify-center text-gray-500">
            暂无数据
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>销量趋势</CardTitle>
        <CardDescription>最近12周的销售预测与实际对比</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="week"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(value) => value.toLocaleString()}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
              formatter={(value) => (
                <span className="text-sm text-gray-700">{value}</span>
              )}
            />
            <Bar
              dataKey="forecast_qty"
              name="预测销量"
              fill="#93c5fd"
              fillOpacity={0.8}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="actual_qty"
              name="实际销量"
              fill="#3b82f6"
              fillOpacity={0.9}
              radius={[4, 4, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="forecast_qty"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="actual_qty"
              stroke="#1d4ed8"
              strokeWidth={2}
              dot={{ fill: '#1e40af', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
