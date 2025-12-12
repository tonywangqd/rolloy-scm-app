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
    Risk: { variant: 'warning' as const, label: '风险' },
    Stockout: { variant: 'danger' as const, label: '断货' },
  }
  return <Badge variant={config[status].variant}>{config[status].label}</Badge>
}

// Compare planned/suggested vs actual - highlight gaps
function getCompareCell(planned: number, actual: number) {
  // 只有当建议/预计和实际都为0时才显示 "-"
  if (planned === 0 && actual === 0) {
    return <span className="text-gray-400">-</span>
  }

  const gap = actual - planned
  // 只有当实际值 > 0 时才显示差距
  // 因为 actual=0 表示"还没发生"，显示差距没有意义
  const hasGap = actual > 0 && planned > 0 && gap !== 0

  return (
    <div className="flex flex-col items-end">
      <span className={actual > 0 ? 'font-semibold text-green-700' : 'text-gray-500'}>
        {/* 当有建议/预计值时，实际为0也要显示0（而不是-），这样更清晰 */}
        {planned > 0 ? actual.toString() : formatValue(actual)}
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
              周次
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-purple-50"
            >
              销量
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-orange-50"
              title="建议=倒推（从销量预测）"
            >
              下单 (倒推)
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-yellow-50"
              title="预计=正推（从实际下单）"
            >
              出厂 (正推)
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-cyan-50"
              title="预计=正推（从实际出厂）"
            >
              发货 (正推)
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-green-50"
              title="预计=正推（从实际发货或在途）"
            >
              到仓 (正推)
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center font-semibold bg-blue-50"
            >
              库存
            </th>
          </tr>

          {/* Sub-headers */}
          <tr className="text-xs border-b">
            {/* 销量 - 2 columns */}
            <th className="px-2 py-1 text-center text-purple-700 font-medium bg-purple-50/50">预测</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-purple-700 font-medium bg-purple-50/50">实际</th>

            {/* 下单 - 2 columns */}
            <th className="px-2 py-1 text-center text-orange-700 font-medium bg-orange-50/50" title="从销量预测倒推">建议</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-orange-700 font-medium bg-orange-50/50">实际</th>

            {/* 出厂 - 2 columns */}
            <th className="px-2 py-1 text-center text-yellow-700 font-medium bg-yellow-50/50" title="从实际下单正推">预计</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-yellow-700 font-medium bg-yellow-50/50">实际</th>

            {/* 发货 - 2 columns */}
            <th className="px-2 py-1 text-center text-cyan-700 font-medium bg-cyan-50/50" title="从实际出厂正推">预计</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-cyan-700 font-medium bg-cyan-50/50">实际</th>

            {/* 到仓 - 2 columns */}
            <th className="px-2 py-1 text-center text-green-700 font-medium bg-green-50/50" title="从实际发货正推或在途shipment">预计</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-green-700 font-medium bg-green-50/50">实际</th>

            {/* 库存 - 4 columns */}
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50">期初</th>
            <th className="px-2 py-1 text-center text-blue-700 font-semibold bg-blue-50/50">期末</th>
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50">安全</th>
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50">状态</th>
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
                      当前
                    </Badge>
                  )}
                </div>
              </td>

              {/* 销量 Group - 2 columns */}
              <td className="px-2 py-2 text-right text-gray-700">
                {formatValue(row.sales_forecast)}
              </td>
              <td className={`px-2 py-2 text-right border-r border-gray-300 ${
                row.sales_actual !== null ? 'font-semibold text-purple-700' : 'text-gray-400'
              }`}>
                {formatValue(row.sales_actual)}
              </td>

              {/* 下单 Group - 2 columns (建议=倒推) */}
              <td className={`px-2 py-2 text-right ${
                row.suggested_order > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'
              }`}>
                {formatValue(row.suggested_order)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.suggested_order, row.actual_order)}
              </td>

              {/* 出厂 Group - 2 columns (预计=正推) */}
              <td className={`px-2 py-2 text-right ${
                row.planned_factory_ship > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'
              }`}>
                {formatValue(row.planned_factory_ship)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.planned_factory_ship, row.actual_factory_ship)}
              </td>

              {/* 发货 Group - 2 columns (预计=正推) */}
              <td className={`px-2 py-2 text-right ${
                row.planned_ship > 0 ? 'text-cyan-600 font-medium' : 'text-gray-400'
              }`}>
                {formatValue(row.planned_ship)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.planned_ship, row.actual_ship)}
              </td>

              {/* 到仓 Group - 2 columns (预计=正推) */}
              <td className={`px-2 py-2 text-right ${
                row.planned_arrival > 0 ? 'text-green-600 font-medium' : 'text-gray-400'
              }`}>
                {formatValue(row.planned_arrival)}
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.planned_arrival, row.actual_arrival)}
              </td>

              {/* 库存 Group - 4 columns */}
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
