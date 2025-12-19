import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, AlertTriangle, Clock, TrendingUp } from 'lucide-react'
import type { RemainingDeliverySummary } from '@/lib/types/database'
import { formatDate } from '@/lib/utils'

interface RemainingDeliverySummaryProps {
  summary: RemainingDeliverySummary
}

export function RemainingDeliverySummaryComponent({ summary }: RemainingDeliverySummaryProps) {
  const {
    totalRemainingQty,
    totalPendingPOs,
    totalPendingSKUs,
    weeklyPlan,
    overdueCount,
  } = summary

  // Check if there are any pending deliveries
  const hasPendingDeliveries = totalRemainingQty > 0

  if (!hasPendingDeliveries) {
    return (
      <Card className="bg-green-50 border-green-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-3">
              <Package className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">所有采购订单均已完成交付</p>
              <p className="text-lg font-semibold text-green-700">暂无待处理订单</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Take only next 4 weeks for display
  const upcomingWeeks = weeklyPlan.slice(0, 4)

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-purple-900">
            <TrendingUp className="h-5 w-5" />
            剩余预计交货摘要
          </span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {overdueCount} 个超期订单
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Summary Stats Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Total Remaining Quantity */}
            <div className="rounded-lg bg-white p-4 shadow-sm border border-purple-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">待交付总量</p>
                  <p className="text-3xl font-bold text-purple-700">{totalRemainingQty.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">件</p>
                </div>
                <div className="rounded-full bg-purple-100 p-3">
                  <Package className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </div>

            {/* Pending POs */}
            <div className="rounded-lg bg-white p-4 shadow-sm border border-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">待处理订单</p>
                  <p className="text-3xl font-bold text-blue-700">{totalPendingPOs}</p>
                  <p className="text-xs text-gray-500 mt-1">个</p>
                </div>
                <div className="rounded-full bg-blue-100 p-3">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Pending SKUs */}
            <div className="rounded-lg bg-white p-4 shadow-sm border border-indigo-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">待处理SKU</p>
                  <p className="text-3xl font-bold text-indigo-700">{totalPendingSKUs}</p>
                  <p className="text-xs text-gray-500 mt-1">个</p>
                </div>
                <div className="rounded-full bg-indigo-100 p-3">
                  <Package className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Plan Table */}
          {upcomingWeeks.length > 0 && (
            <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                未来4周预计交货计划
              </h3>
              <div className="overflow-hidden rounded-md border border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        周次
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        开始日期
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                        预计数量
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                        批次数
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {upcomingWeeks.map((week) => (
                      <tr key={week.week_iso} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-purple-700">
                          {week.week_iso}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(week.week_start_date)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-right text-gray-900">
                          {week.planned_qty.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {week.delivery_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {weeklyPlan.length > 4 && (
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-center text-xs text-gray-500">
                          还有 {weeklyPlan.length - 4} 周的计划未显示
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* No Weekly Plan Message */}
          {upcomingWeeks.length === 0 && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-yellow-800">暂无预计交货计划</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    建议在交货记录页面为待处理订单填写预计交货周次，以提高库存预测准确性。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
