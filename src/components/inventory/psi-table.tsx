'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Info, RefreshCw, AlertCircle } from 'lucide-react'
import { calculatePSI, type PSIRow } from '@/lib/actions/psi'

interface PSIWeekData {
  weekIso: string
  weekStartDate: string
  openingStock: number
  plannedArrivalQty: number
  actualArrivalQty: number
  effectiveArrivalQty: number
  forecastSalesQty: number
  actualSalesQty: number | null
  effectiveSalesQty: number
  closingStock: number
  safetyStockThreshold: number
  stockStatus: 'OK' | 'Risk' | 'Stockout'
}

interface PSITableProps {
  sku?: string
  warehouseId?: string
}

function getStockStatusBadge(status: 'OK' | 'Risk' | 'Stockout') {
  switch (status) {
    case 'OK':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">正常</Badge>
    case 'Risk':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">风险</Badge>
    case 'Stockout':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">断货</Badge>
  }
}

function getStockStatusIcon(status: 'OK' | 'Risk' | 'Stockout') {
  switch (status) {
    case 'OK':
      return '🟢'
    case 'Risk':
      return '🟡'
    case 'Stockout':
      return '🔴'
  }
}

// Helper to transform PSIRow from DB to PSIWeekData for display
function transformPSIRow(row: PSIRow): PSIWeekData {
  return {
    weekIso: row.week_iso,
    weekStartDate: row.week_start_date,
    openingStock: row.opening_stock,
    plannedArrivalQty: row.planned_arrival_qty,
    actualArrivalQty: row.actual_arrival_qty,
    effectiveArrivalQty: row.effective_arrival_qty,
    forecastSalesQty: row.forecast_sales_qty,
    actualSalesQty: row.actual_sales_qty,
    effectiveSalesQty: row.effective_sales_qty,
    closingStock: row.closing_stock,
    safetyStockThreshold: row.safety_stock_threshold,
    stockStatus: row.stock_status as 'OK' | 'Risk' | 'Stockout',
  }
}

// Get current ISO week string
function getCurrentWeekIso(): string {
  const now = new Date()
  const jan4 = new Date(now.getFullYear(), 0, 4)
  const dayOfYear = Math.floor((now.getTime() - jan4.getTime()) / 86400000) + jan4.getDay() + 1
  const weekNum = Math.ceil(dayOfYear / 7)
  return `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`
}

export function PSITable({ sku, warehouseId }: PSITableProps) {
  const [data, setData] = useState<PSIWeekData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentWeekIso = getCurrentWeekIso()

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await calculatePSI({ sku, warehouseId })
      if (result.success && result.data) {
        setData(result.data.map(transformPSIRow))
      } else {
        setError(result.error || 'Failed to load PSI data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [sku, warehouseId])

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading PSI data...</span>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Info className="h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">No PSI data available</p>
          <p className="text-xs text-gray-400">Please add sales forecasts and inventory data first</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">PSI 周报表</h2>
          <p className="text-sm text-gray-500">
            SKU: {sku || 'ALL'} | 仓库: {warehouseId || 'ALL'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            导出Excel
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex items-center gap-4 rounded-lg bg-gray-50 p-3 text-sm">
        <span className="font-medium text-gray-700">图例:</span>
        <div className="flex items-center gap-1">
          <span>* = 当前周</span>
        </div>
        <div className="flex items-center gap-1">
          {getStockStatusIcon('OK')} OK (正常)
        </div>
        <div className="flex items-center gap-1">
          {getStockStatusIcon('Risk')} Risk (风险)
        </div>
        <div className="flex items-center gap-1">
          {getStockStatusIcon('Stockout')} Stockout (断货)
        </div>
        <Button variant="ghost" size="sm" className="ml-auto">
          <Info className="h-4 w-4" />
        </Button>
      </div>

      {/* PSI Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300 bg-gray-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                周次
              </th>
              {data.map((week) => (
                <th
                  key={week.weekIso}
                  className={`px-4 py-3 text-center text-sm font-semibold ${
                    week.weekIso === currentWeekIso
                      ? 'bg-blue-50 text-blue-900'
                      : 'text-gray-900'
                  }`}
                >
                  {week.weekIso}
                  {week.weekIso === currentWeekIso && <span className="ml-1">*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 期初库存 */}
            <tr className="border-b border-gray-200 bg-white">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                期初库存
              </td>
              {data.map((week) => (
                <td
                  key={week.weekIso}
                  className={`px-4 py-3 text-center text-sm ${
                    week.weekIso === currentWeekIso ? 'bg-blue-50' : ''
                  }`}
                >
                  {week.openingStock}
                </td>
              ))}
            </tr>

            {/* 预计到仓 */}
            <tr className="border-b border-gray-200 bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                预计到仓
              </td>
              {data.map((week) => (
                <td
                  key={week.weekIso}
                  className={`px-4 py-3 text-center text-sm ${
                    week.weekIso === currentWeekIso ? 'bg-blue-50' : ''
                  } ${week.plannedArrivalQty > 0 ? 'font-semibold text-green-700' : 'text-gray-400'}`}
                >
                  {week.plannedArrivalQty || '-'}
                </td>
              ))}
            </tr>

            {/* 实际到仓 */}
            <tr className="border-b border-gray-200 bg-white">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                实际到仓
              </td>
              {data.map((week) => (
                <td
                  key={week.weekIso}
                  className={`px-4 py-3 text-center text-sm ${
                    week.weekIso === currentWeekIso ? 'bg-blue-50' : ''
                  } ${week.actualArrivalQty > 0 ? 'font-semibold text-green-700' : 'text-gray-400'}`}
                >
                  {week.actualArrivalQty || '-'}
                </td>
              ))}
            </tr>

            {/* 预计销量 */}
            <tr className="border-b border-gray-200 bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                预计销量
              </td>
              {data.map((week) => (
                <td
                  key={week.weekIso}
                  className={`px-4 py-3 text-center text-sm ${
                    week.weekIso === currentWeekIso ? 'bg-blue-50' : ''
                  }`}
                >
                  {week.forecastSalesQty}
                </td>
              ))}
            </tr>

            {/* 实际销量 */}
            <tr className="border-b border-gray-200 bg-white">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                实际销量
              </td>
              {data.map((week) => (
                <td
                  key={week.weekIso}
                  className={`px-4 py-3 text-center text-sm ${
                    week.weekIso === currentWeekIso ? 'bg-blue-50' : ''
                  } ${week.actualSalesQty !== null ? 'font-semibold text-blue-700' : 'text-gray-400'}`}
                >
                  {week.actualSalesQty !== null ? week.actualSalesQty : '-'}
                </td>
              ))}
            </tr>

            {/* 期末库存 */}
            <tr className="border-b-2 border-gray-300 bg-gray-50">
              <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                期末库存
              </td>
              {data.map((week) => (
                <td
                  key={week.weekIso}
                  className={`px-4 py-3 text-center text-sm font-semibold ${
                    week.weekIso === currentWeekIso ? 'bg-blue-50' : ''
                  } ${
                    week.closingStock < 0
                      ? 'text-red-700'
                      : week.closingStock < week.safetyStockThreshold
                      ? 'text-yellow-700'
                      : 'text-gray-900'
                  }`}
                >
                  {week.closingStock}
                </td>
              ))}
            </tr>

            {/* 库存状态 */}
            <tr className="border-b border-gray-200 bg-white">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                库存状态
              </td>
              {data.map((week) => (
                <td
                  key={week.weekIso}
                  className={`px-4 py-3 text-center ${
                    week.weekIso === currentWeekIso ? 'bg-blue-50' : ''
                  }`}
                >
                  {getStockStatusBadge(week.stockStatus)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Notes */}
      <div className="mt-4 rounded-lg bg-blue-50 p-4 text-sm text-gray-700">
        <p className="font-medium">说明:</p>
        <ul className="mt-2 space-y-1 text-xs">
          <li>• 期末库存 = 期初库存 + 实际到仓(或预计到仓) - 实际销量(或预计销量)</li>
          <li>• 库存状态: 期末库存 &lt; 0 为断货,期末库存 &lt; 安全库存为风险,否则为正常</li>
          <li>• 当前周标记为 * ,蓝色背景高亮显示</li>
        </ul>
      </div>
    </Card>
  )
}
