'use client'

import { useMemo } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, AlertTriangle, XCircle, CheckCircle } from 'lucide-react'
import type { InventoryProjection12WeeksView } from '@/lib/types/database'

interface InventoryProjectionChartProps {
  projections: InventoryProjection12WeeksView[]
  selectedSku?: string
}

interface ChartDataPoint {
  week: string
  weekLabel: string
  weekOffset: number
  totalStock: number
  okStock: number
  riskStock: number
  stockoutStock: number
  safetyStock: number
  incomingQty: number
  salesQty: number
  skuCount: number
  stockoutSkus: string[]
  riskSkus: string[]
}

const STATUS_COLORS = {
  ok: '#22c55e',      // green-500
  risk: '#eab308',    // yellow-500
  stockout: '#ef4444', // red-500
}

export function InventoryProjectionChart({ projections, selectedSku }: InventoryProjectionChartProps) {
  // Aggregate data by week
  const chartData = useMemo(() => {
    // Filter by SKU if selected
    const filtered = selectedSku
      ? projections.filter(p => p.sku === selectedSku)
      : projections

    // Group by week
    const weekMap = new Map<string, ChartDataPoint>()

    filtered.forEach(p => {
      if (!weekMap.has(p.week_iso)) {
        weekMap.set(p.week_iso, {
          week: p.week_iso,
          weekLabel: p.week_iso.replace('-W', '/W'),
          weekOffset: p.week_offset,
          totalStock: 0,
          okStock: 0,
          riskStock: 0,
          stockoutStock: 0,
          safetyStock: 0,
          incomingQty: 0,
          salesQty: 0,
          skuCount: 0,
          stockoutSkus: [],
          riskSkus: [],
        })
      }

      const entry = weekMap.get(p.week_iso)!
      entry.totalStock += p.closing_stock
      entry.safetyStock += p.safety_stock_threshold
      entry.incomingQty += p.incoming_qty
      entry.salesQty += p.effective_sales
      entry.skuCount++

      if (p.stock_status === 'OK') {
        entry.okStock += p.closing_stock
      } else if (p.stock_status === 'Risk') {
        entry.riskStock += p.closing_stock
        if (!entry.riskSkus.includes(p.sku)) {
          entry.riskSkus.push(p.sku)
        }
      } else if (p.stock_status === 'Stockout') {
        entry.stockoutStock += Math.abs(p.closing_stock) // Show absolute value for stockout
        if (!entry.stockoutSkus.includes(p.sku)) {
          entry.stockoutSkus.push(p.sku)
        }
      }
    })

    // Convert to sorted array
    return Array.from(weekMap.values()).sort((a, b) => a.weekOffset - b.weekOffset)
  }, [projections, selectedSku])

  // Calculate summary stats
  const summary = useMemo(() => {
    const currentWeek = chartData.find(d => d.weekOffset === 0)
    const stockoutWeeks = chartData.filter(d => d.stockoutSkus.length > 0)
    const riskWeeks = chartData.filter(d => d.riskSkus.length > 0)

    // Get unique SKUs at risk
    const allStockoutSkus = new Set<string>()
    const allRiskSkus = new Set<string>()
    chartData.forEach(d => {
      d.stockoutSkus.forEach(sku => allStockoutSkus.add(sku))
      d.riskSkus.forEach(sku => allRiskSkus.add(sku))
    })

    return {
      currentStock: currentWeek?.totalStock || 0,
      stockoutSkuCount: allStockoutSkus.size,
      riskSkuCount: allRiskSkus.size,
      firstStockoutWeek: stockoutWeeks[0]?.week || null,
      weeksWithIssues: stockoutWeeks.length + riskWeeks.length,
    }
  }, [chartData])

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartDataPoint
      return (
        <div className="rounded-lg border bg-white p-3 shadow-lg">
          <p className="mb-2 font-semibold text-gray-900">{data.weekLabel}</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-600">期末库存:</span>
              <span className="font-medium">{data.totalStock.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-600">安全库存:</span>
              <span className="font-medium">{data.safetyStock.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-600">入库:</span>
              <span className="font-medium text-green-600">+{data.incomingQty.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-600">销量:</span>
              <span className="font-medium text-blue-600">-{data.salesQty.toLocaleString()}</span>
            </div>
            {data.stockoutSkus.length > 0 && (
              <div className="mt-2 border-t pt-2">
                <span className="text-red-600">断货 SKU: {data.stockoutSkus.join(', ')}</span>
              </div>
            )}
            {data.riskSkus.length > 0 && (
              <div className="mt-1">
                <span className="text-yellow-600">风险 SKU: {data.riskSkus.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-gray-500">暂无库存预测数据</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            12周库存预测
            {selectedSku && (
              <Badge className="ml-2 bg-blue-100 text-blue-800">
                {selectedSku}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-4 text-sm">
            {summary.stockoutSkuCount > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <XCircle className="h-4 w-4" />
                <span>{summary.stockoutSkuCount} SKU 断货</span>
              </div>
            )}
            {summary.riskSkuCount > 0 && (
              <div className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <span>{summary.riskSkuCount} SKU 风险</span>
              </div>
            )}
            {summary.stockoutSkuCount === 0 && summary.riskSkuCount === 0 && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>库存健康</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: 10 }}
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    okStock: '正常库存',
                    riskStock: '风险库存',
                    stockoutStock: '断货',
                    safetyStock: '安全库存线',
                  }
                  return labels[value] || value
                }}
              />

              {/* Stacked bar for inventory status */}
              <Bar dataKey="okStock" stackId="stock" fill={STATUS_COLORS.ok} name="okStock" />
              <Bar dataKey="riskStock" stackId="stock" fill={STATUS_COLORS.risk} name="riskStock" />
              <Bar dataKey="stockoutStock" stackId="stock" fill={STATUS_COLORS.stockout} name="stockoutStock" />

              {/* Safety stock line */}
              <Line
                type="monotone"
                dataKey="safetyStock"
                stroke="#9333ea"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="safetyStock"
              />

              {/* Reference line for current week */}
              <ReferenceLine
                x={chartData.find(d => d.weekOffset === 0)?.weekLabel}
                stroke="#3b82f6"
                strokeWidth={2}
                label={{ value: '当前周', position: 'top', fill: '#3b82f6', fontSize: 12 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend explanation */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS.ok }} />
            <span>正常 (库存 &gt; 安全库存)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS.risk }} />
            <span>风险 (0 &lt; 库存 &lt; 安全库存)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS.stockout }} />
            <span>断货 (库存 &le; 0)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-full border-2 border-dashed border-purple-600" />
            <span>安全库存线</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
