'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { HistoricalSalesData } from '@/lib/types/forecast-wizard'

interface Props {
  data: HistoricalSalesData[]
}

export default function HistoricalTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          该 SKU 和渠道暂无历史销量数据
        </CardContent>
      </Card>
    )
  }

  const avgValue = data.reduce((sum, d) => sum + d.actual_qty, 0) / data.length
  const maxValue = Math.max(...data.map(d => d.actual_qty))
  const minValue = Math.min(...data.map(d => d.actual_qty))

  return (
    <Card>
      <CardHeader>
        <CardTitle>历史销量趋势（过去 12 周）</CardTitle>
        <div className="text-sm text-muted-foreground">
          平均: {Math.round(avgValue)} | 最小: {minValue} | 最大: {maxValue}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week_iso" />
            <YAxis />
            <Tooltip />
            <ReferenceLine y={avgValue} stroke="#94a3b8" strokeDasharray="5 5" label="平均" />
            <Line type="monotone" dataKey="actual_qty" stroke="#3b82f6" strokeWidth={2} name="实际销量" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
