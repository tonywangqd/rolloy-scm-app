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
} from 'recharts'
import type { SkuSalesRankingData } from '@/lib/queries/charts'

interface SkuRankingChartProps {
  data: SkuSalesRankingData[]
}

// Gradient colors for bars (from best to worst)
const getBarColor = (index: number, total: number) => {
  const colors = [
    '#1e40af', // blue-800 (top)
    '#3b82f6', // blue-500
    '#60a5fa', // blue-400
    '#93c5fd', // blue-300
    '#bfdbfe', // blue-200
    '#dbeafe', // blue-100
  ]

  // Distribute colors based on ranking
  const colorIndex = Math.min(Math.floor((index / total) * colors.length), colors.length - 1)
  return colors[colorIndex]
}

export function SkuRankingChart({ data }: SkuRankingChartProps) {
  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-1 font-semibold text-gray-900">{data.product_name}</p>
          <p className="text-xs text-gray-500">SKU: {data.sku}</p>
          <div className="mt-2 space-y-1">
            <p className="text-sm text-gray-600">
              总销量: <span className="font-semibold">{data.total_sales.toLocaleString()}</span>
            </p>
            {data.actual_total > 0 && (
              <p className="text-sm text-green-600">
                实际: <span className="font-semibold">{data.actual_total.toLocaleString()}</span>
              </p>
            )}
            {data.forecast_total > 0 && (
              <p className="text-sm text-blue-600">
                预测: <span className="font-semibold">{data.forecast_total.toLocaleString()}</span>
              </p>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  // Custom Y-axis tick to show SKU
  const CustomYAxisTick = ({ x, y, payload }: any) => {
    const item = data.find((d) => d.sku === payload.value)
    const displayText = item ? `${item.sku}` : payload.value

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={4}
          textAnchor="end"
          fill="#6b7280"
          className="text-xs"
        >
          {displayText}
        </text>
      </g>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SKU 销量排名</CardTitle>
          <CardDescription>销量前10的产品SKU</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-96 items-center justify-center text-gray-500">
            暂无数据
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SKU 销量排名</CardTitle>
        <CardDescription>销量前10的产品SKU</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(data.length * 50 + 20, 120)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={true} vertical={false} />
            <XAxis
              type="number"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(value) => value.toLocaleString()}
            />
            <YAxis
              type="category"
              dataKey="sku"
              tick={<CustomYAxisTick />}
              tickLine={{ stroke: '#e5e7eb' }}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
            <Bar
              dataKey="total_sales"
              radius={[0, 4, 4, 0]}
              maxBarSize={40}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(index, data.length)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Top 3 Highlight */}
        <div className={`mt-4 grid gap-4 border-t border-gray-100 pt-6 ${data.length === 1 ? 'grid-cols-1' : data.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {data.slice(0, 3).map((item, index) => (
            <div
              key={item.sku}
              className="relative rounded-lg border border-gray-200 bg-gradient-to-br from-blue-50 to-white p-3"
            >
              {/* 排名徽章 - 绝对定位在右上角 */}
              <div
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: getBarColor(index, data.length) }}
              >
                {index + 1}
              </div>
              <div className="mb-1">
                <span className="text-xs font-semibold text-gray-500">
                  NO.{index + 1}
                </span>
              </div>
              <p className="truncate text-xs font-medium text-gray-600">{item.sku}</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {item.total_sales.toLocaleString()}
              </p>
              <p className="truncate text-xs text-gray-500">{item.product_name}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
