'use client'

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import type { ForecastSuggestion } from '@/lib/types/forecast-wizard'

interface Props {
  data: ForecastSuggestion[]
}

export default function MethodPreviewChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">暂无数据</div>
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data}>
        <XAxis dataKey="week_iso" hide />
        <YAxis hide />
        <Tooltip />
        <Area type="monotone" dataKey="forecast_qty" fill="#3b82f6" fillOpacity={0.6} name="预测数量" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
