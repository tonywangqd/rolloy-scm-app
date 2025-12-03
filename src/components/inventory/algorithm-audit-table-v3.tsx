'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { AlgorithmAuditRowV3, StockStatus } from '@/lib/types/database'

interface AlgorithmAuditTableV3Props {
  rows: AlgorithmAuditRowV3[]
}

export function AlgorithmAuditTableV3({ rows }: AlgorithmAuditTableV3Props) {
  const getStockStatusBadge = (status: StockStatus) => {
    const variants = {
      OK: 'success' as const,
      Risk: 'warning' as const,
      Stockout: 'danger' as const,
    }
    return <Badge variant={variants[status]}>{status}</Badge>
  }

  const formatValue = (value: number | null): string => {
    if (value === null || value === 0) return '-'
    return value.toString()
  }

  const getRowBgClass = (row: AlgorithmAuditRowV3): string => {
    if (row.is_current) return 'bg-blue-50'
    if (row.is_past) return 'bg-gray-50'
    return ''
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100">
          {/* Group headers */}
          <tr className="border-b">
            <th
              rowSpan={2}
              className="sticky left-0 z-20 bg-gray-100 px-3 py-2 text-left border-r-2 border-gray-300 font-semibold"
            >
              周次
            </th>
            <th
              colSpan={3}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              销售
            </th>
            <th
              colSpan={3}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              下单
            </th>
            <th
              colSpan={3}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              工厂出货
            </th>
            <th
              colSpan={3}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              物流发货
            </th>
            <th
              colSpan={3}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              到仓
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center font-semibold"
            >
              库存
            </th>
          </tr>

          {/* Sub-headers */}
          <tr className="text-xs border-b">
            {/* Sales */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">
              取值
            </th>

            {/* Order */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">
              取值
            </th>

            {/* Factory Ship */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">
              取值
            </th>

            {/* Ship */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">
              取值
            </th>

            {/* Arrival */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">
              取值
            </th>

            {/* Inventory */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">期初</th>
            <th className="px-2 py-1 text-center text-gray-600 font-semibold">期末</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">安全</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">状态</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={row.week_iso}
              className={`border-b hover:bg-gray-50 ${getRowBgClass(row)}`}
            >
              {/* Week (Fixed Column) */}
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium border-r-2 border-gray-300">
                <div className="flex items-center gap-2">
                  {row.week_iso}
                  {row.is_current && (
                    <Badge variant="default" className="text-xs">
                      当前
                    </Badge>
                  )}
                </div>
              </td>

              {/* Sales Group */}
              <td className="px-2 py-2 text-right text-gray-700">
                {formatValue(row.sales_forecast)}
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.sales_actual !== null
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                {formatValue(row.sales_actual)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                {row.sales_effective}
              </td>

              {/* Order Group */}
              <td className="px-2 py-2 text-right text-gray-700">
                {formatValue(row.planned_order)}
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.actual_order > 0
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                {formatValue(row.actual_order)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                {row.order_effective}
              </td>

              {/* Factory Ship Group */}
              <td className="px-2 py-2 text-right text-gray-700">
                {formatValue(row.planned_factory_ship)}
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.actual_factory_ship > 0
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                {formatValue(row.actual_factory_ship)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                {row.factory_ship_effective}
              </td>

              {/* Ship Group */}
              <td className="px-2 py-2 text-right text-gray-700">
                {formatValue(row.planned_ship)}
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.actual_ship > 0
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                {formatValue(row.actual_ship)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                {row.ship_effective}
              </td>

              {/* Arrival Group */}
              <td className="px-2 py-2 text-right text-gray-700">
                {formatValue(row.planned_arrival)}
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.actual_arrival > 0
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                {formatValue(row.actual_arrival)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                {row.arrival_effective}
              </td>

              {/* Inventory Group */}
              <td className="px-2 py-2 text-right text-gray-700">
                {row.opening_stock}
              </td>
              <td className="px-2 py-2 text-right font-bold text-gray-900">
                {row.closing_stock}
              </td>
              <td className="px-2 py-2 text-right text-gray-500 text-xs">
                {Math.round(row.safety_threshold)}
              </td>
              <td className="px-2 py-2 text-center">
                {getStockStatusBadge(row.stock_status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
