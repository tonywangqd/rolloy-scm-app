'use client'

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
} from 'recharts'
import type { InventoryProjection12WeeksView } from '@/lib/types/database'

interface InventoryProjectionChartProps {
  data: InventoryProjection12WeeksView[]
  sku?: string
}

export function InventoryProjectionChart({ data, sku }: InventoryProjectionChartProps) {
  // Format data for chart
  const chartData = data.map((item) => ({
    week: item.week_iso.split('-W')[1] ? `W${item.week_iso.split('-W')[1]}` : item.week_iso,
    week_full: item.week_iso,
    opening_stock: item.opening_stock,
    closing_stock: item.closing_stock,
    safety_threshold: item.safety_stock_threshold,
    incoming: item.incoming_qty,
    sales: item.effective_sales,
    status: item.stock_status,
  }))

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 font-semibold text-gray-900">{label}</p>
          <div className="space-y-1">
            <p className="text-sm text-blue-600">
              期初库存: <span className="font-semibold">{data.opening_stock.toLocaleString()}</span>
            </p>
            <p className="text-sm text-purple-600">
              期末库存: <span className="font-semibold">{data.closing_stock.toLocaleString()}</span>
            </p>
            <p className="text-sm text-orange-600">
              安全库存: <span className="font-semibold">{data.safety_threshold.toLocaleString()}</span>
            </p>
            <p className="text-sm text-green-600">
              到货量: <span className="font-semibold">{data.incoming.toLocaleString()}</span>
            </p>
            <p className="text-sm text-red-600">
              销量: <span className="font-semibold">{data.sales.toLocaleString()}</span>
            </p>
            <p className="text-sm text-gray-600">
              状态: <span className={`font-semibold ${
                data.status === 'OK' ? 'text-green-600' :
                data.status === 'Risk' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {data.status === 'OK' ? '正常' : data.status === 'Risk' ? '风险' : '断货'}
              </span>
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>库存趋势</CardTitle>
          <CardDescription>
            {sku ? `${sku} 的库存预测趋势` : '未来12周库存预测趋势'}
          </CardDescription>
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
        <CardTitle>库存趋势</CardTitle>
        <CardDescription>
          {sku ? `${sku} 的库存预测趋势` : '未来12周库存预测趋势'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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

            {/* Lines */}
            <Line
              type="monotone"
              dataKey="opening_stock"
              name="期初库存"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="closing_stock"
              name="期末库存"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: '#8b5cf6', r: 4 }}
              activeDot={{ r: 6 }}
            />
            {/* Safety stock threshold as step line (dynamic based on weekly sales) */}
            <Line
              type="stepAfter"
              dataKey="safety_threshold"
              name="安全库存"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4, fill: '#f97316' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
