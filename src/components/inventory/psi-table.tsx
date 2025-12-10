'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Info } from 'lucide-react'

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

// Mock data for demonstration - will be replaced with real API call
const mockPSIData: PSIWeekData[] = [
  {
    weekIso: '2025-W48',
    weekStartDate: '2025-11-25',
    openingStock: 100,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 20,
    actualSalesQty: 20,
    effectiveSalesQty: 20,
    closingStock: 80,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2025-W49',
    weekStartDate: '2025-12-02',
    openingStock: 80,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 20,
    actualSalesQty: 20,
    effectiveSalesQty: 20,
    closingStock: 60,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2025-W50',
    weekStartDate: '2025-12-09',
    openingStock: 60,
    plannedArrivalQty: 50,
    actualArrivalQty: 0,
    effectiveArrivalQty: 50,
    forecastSalesQty: 20,
    actualSalesQty: null,
    effectiveSalesQty: 20,
    closingStock: 90,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2025-W51',
    weekStartDate: '2025-12-16',
    openingStock: 90,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 20,
    actualSalesQty: null,
    effectiveSalesQty: 20,
    closingStock: 70,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2025-W52',
    weekStartDate: '2025-12-23',
    openingStock: 70,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 20,
    actualSalesQty: null,
    effectiveSalesQty: 20,
    closingStock: 50,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2026-W01',
    weekStartDate: '2025-12-30',
    openingStock: 50,
    plannedArrivalQty: 100,
    actualArrivalQty: 0,
    effectiveArrivalQty: 100,
    forecastSalesQty: 20,
    actualSalesQty: null,
    effectiveSalesQty: 20,
    closingStock: 130,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2026-W02',
    weekStartDate: '2026-01-06',
    openingStock: 130,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 20,
    actualSalesQty: null,
    effectiveSalesQty: 20,
    closingStock: 110,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2026-W03',
    weekStartDate: '2026-01-13',
    openingStock: 110,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 20,
    actualSalesQty: null,
    effectiveSalesQty: 20,
    closingStock: 90,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2026-W04',
    weekStartDate: '2026-01-20',
    openingStock: 90,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 20,
    actualSalesQty: null,
    effectiveSalesQty: 20,
    closingStock: 70,
    safetyStockThreshold: 40,
    stockStatus: 'OK',
  },
  {
    weekIso: '2026-W05',
    weekStartDate: '2026-01-27',
    openingStock: 70,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 35,
    actualSalesQty: null,
    effectiveSalesQty: 35,
    closingStock: 35,
    safetyStockThreshold: 40,
    stockStatus: 'Risk',
  },
  {
    weekIso: '2026-W06',
    weekStartDate: '2026-02-03',
    openingStock: 35,
    plannedArrivalQty: 0,
    actualArrivalQty: 0,
    effectiveArrivalQty: 0,
    forecastSalesQty: 40,
    actualSalesQty: null,
    effectiveSalesQty: 40,
    closingStock: -5,
    safetyStockThreshold: 40,
    stockStatus: 'Stockout',
  },
]

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

export function PSITable({ sku, warehouseId }: PSITableProps) {
  const [data] = useState<PSIWeekData[]>(mockPSIData)
  const currentWeekIso = '2025-W50'

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
