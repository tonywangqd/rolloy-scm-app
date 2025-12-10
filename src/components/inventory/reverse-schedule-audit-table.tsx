'use client'

import { Badge } from '@/components/ui/badge'
import type { ReverseScheduleAuditRow } from '@/lib/queries/reverse-schedule-audit'

// ================================================================
// COMPONENT PROPS
// ================================================================

interface ReverseScheduleAuditTableProps {
  rows: ReverseScheduleAuditRow[]
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

function formatValue(value: number | null): string {
  if (value === null || value === 0) return '-'
  return value.toString()
}

function getStockStatusBadge(status: 'OK' | 'Risk' | 'Stockout') {
  const config = {
    OK: { variant: 'success' as const, label: 'OK' },
    Risk: { variant: 'warning' as const, label: '\u98ce\u9669' },
    Stockout: { variant: 'danger' as const, label: '\u65ad\u8d27' },
  }
  return <Badge variant={config[status].variant}>{config[status].label}</Badge>
}

// Compare suggested vs actual - highlight gaps
function getCompareCell(suggested: number, actual: number) {
  if (suggested === 0 && actual === 0) {
    return <span className="text-gray-400">-</span>
  }

  const gap = actual - suggested
  const hasGap = suggested > 0 && gap !== 0

  return (
    <div className="flex flex-col items-end">
      <span className={actual > 0 ? 'font-semibold text-green-700' : 'text-gray-400'}>
        {formatValue(actual)}
      </span>
      {hasGap && (
        <span className={`text-xs ${gap > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {gap > 0 ? `+${gap}` : gap}
        </span>
      )}
    </div>
  )
}

// ================================================================
// MAIN COMPONENT
// ================================================================

export function ReverseScheduleAuditTable({ rows }: ReverseScheduleAuditTableProps) {
  const getRowBgClass = (row: ReverseScheduleAuditRow): string => {
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
              \u5468\u6b21
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-purple-50"
            >
              \u9500\u91cf
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-orange-50"
            >
              \u4e0b\u5355
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-yellow-50"
            >
              \u51fa\u5382
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-cyan-50"
            >
              \u53d1\u8d27
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-green-50"
            >
              \u5230\u4ed3
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center font-semibold bg-blue-50"
            >
              \u5e93\u5b58
            </th>
          </tr>

          {/* Sub-headers */}
          <tr className="text-xs border-b">
            {/* \u9500\u91cf - 2 columns */}
            <th className="px-2 py-1 text-center text-purple-700 font-medium bg-purple-50/50">\u9884\u8ba1</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-purple-700 font-medium bg-purple-50/50">\u5b9e\u9645</th>

            {/* \u4e0b\u5355 - 2 columns */}
            <th className="px-2 py-1 text-center text-orange-700 font-medium bg-orange-50/50">\u5efa\u8bae</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-orange-700 font-medium bg-orange-50/50">\u5b9e\u9645</th>

            {/* \u51fa\u5382 - 2 columns */}
            <th className="px-2 py-1 text-center text-yellow-700 font-medium bg-yellow-50/50">\u5efa\u8bae</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-yellow-700 font-medium bg-yellow-50/50">\u5b9e\u9645</th>

            {/* \u53d1\u8d27 - 2 columns */}
            <th className="px-2 py-1 text-center text-cyan-700 font-medium bg-cyan-50/50">\u5efa\u8bae</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-cyan-700 font-medium bg-cyan-50/50">\u5b9e\u9645</th>

            {/* \u5230\u4ed3 - 2 columns */}
            <th className="px-2 py-1 text-center text-green-700 font-medium bg-green-50/50">\u5efa\u8bae</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-green-700 font-medium bg-green-50/50">\u5b9e\u9645</th>

            {/* \u5e93\u5b58 - 4 columns */}
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50">\u671f\u521d</th>
            <th className="px-2 py-1 text-center text-blue-700 font-semibold bg-blue-50/50">\u671f\u672b</th>
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50">\u5b89\u5168</th>
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50">\u72b6\u6001</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.week_iso} className={`border-b hover:bg-gray-50/50 ${getRowBgClass(row)}`}>
              {/* Week (Fixed Column) */}
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium border-r-2 border-gray-300">
                <div className="flex items-center gap-2">
                  {row.week_iso}
                  {row.is_current && (
                    <Badge variant="default" className="text-xs">
                      \u5f53\u524d
                    </Badge>
                  )}
                </div>
              </td>

              {/* \u9500\u91cf Group - 2 columns */}
              <td className="px-2 py-2 text-right text-gray-700">
                {formatValue(row.sales_forecast)}
              </td>
              <td className={`px-2 py-2 text-right border-r border-gray-300 ${
                row.sales_actual !== null ? 'font-semibold text-purple-700' : 'text-gray-400'
              }`}>
                {formatValue(row.sales_actual)}
              </td>

              {/* \u4e0b\u5355 Group - 2 columns */}
              <td className={`px-2 py-2 text-right ${
                row.suggested_order > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'
              }`}>
                {formatValue(row.suggested_order)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.suggested_order, row.actual_order)}
              </td>

              {/* \u51fa\u5382 Group - 2 columns */}
              <td className={`px-2 py-2 text-right ${
                row.suggested_factory_ship > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'
              }`}>
                {formatValue(row.suggested_factory_ship)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.suggested_factory_ship, row.actual_factory_ship)}
              </td>

              {/* \u53d1\u8d27 Group - 2 columns */}
              <td className={`px-2 py-2 text-right ${
                row.suggested_ship > 0 ? 'text-cyan-600 font-medium' : 'text-gray-400'
              }`}>
                {formatValue(row.suggested_ship)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.suggested_ship, row.actual_ship)}
              </td>

              {/* \u5230\u4ed3 Group - 2 columns */}
              <td className={`px-2 py-2 text-right ${
                row.suggested_arrival > 0 ? 'text-green-600 font-medium' : 'text-gray-400'
              }`}>
                {formatValue(row.suggested_arrival)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.suggested_arrival, row.actual_arrival)}
              </td>

              {/* \u5e93\u5b58 Group - 4 columns */}
              <td className="px-2 py-2 text-right text-gray-700">
                {row.opening_stock}
              </td>
              <td className="px-2 py-2 text-right">
                <span
                  className={`font-bold ${
                    row.closing_stock <= 0
                      ? 'text-red-600'
                      : row.closing_stock < row.safety_threshold
                      ? 'text-orange-600'
                      : 'text-green-600'
                  }`}
                >
                  {row.closing_stock}
                </span>
              </td>
              <td className="px-2 py-2 text-right text-xs text-gray-500">
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
