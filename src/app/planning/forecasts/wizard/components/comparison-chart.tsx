'use client'

import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { ForecastSuggestion, HistoricalSalesData } from '@/lib/types/forecast-wizard'

interface Props {
  forecastData: ForecastSuggestion[]
  historicalData: HistoricalSalesData[]
}

export default function ComparisonChart({ forecastData, historicalData }: Props) {
  // Merge historical and forecast data for display
  const chartData = forecastData.map((forecast) => {
    const historical = historicalData.find((h) => h.week_iso === forecast.week_iso)
    return {
      week_iso: forecast.week_iso,
      forecast_qty: forecast.forecast_qty,
      actual_qty: historical?.actual_qty || null,
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>预测 vs 历史对比</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week_iso" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="actual_qty" fill="#94a3b8" name="历史实际" />
            <Line type="monotone" dataKey="forecast_qty" stroke="#3b82f6" strokeWidth={2} name="新预测" />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
