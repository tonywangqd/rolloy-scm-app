import { Card } from '@/components/ui/card'
import { Package, Clock, AlertTriangle, FileText, CheckCircle } from 'lucide-react'
import type { RemainingShipmentSummary as RemainingShipmentSummaryType } from '@/lib/queries/logistics'

interface RemainingShipmentSummaryProps {
  summary: RemainingShipmentSummaryType
}

export function RemainingShipmentSummary({ summary }: RemainingShipmentSummaryProps) {
  // If no unshipped items, show success state
  if (summary.totalUnshippedQty === 0) {
    return (
      <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <div className="flex items-center space-x-3">
          <CheckCircle className="h-8 w-8 text-green-600" />
          <div>
            <p className="text-lg font-semibold text-green-900">全部已发货</p>
            <p className="text-sm text-green-700">所有完工入库的货品均已发运</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center space-x-2">
        <Package className="h-5 w-5 text-orange-600" />
        <h3 className="text-lg font-semibold text-gray-900">待发货摘要</h3>
      </div>

      {/* Main stats cards - 3 columns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Unshipped Quantity */}
        <Card className="p-5 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Package className="h-8 w-8 text-orange-600" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600">未发货总数</p>
              <p className="text-3xl font-bold text-orange-900">
                {summary.totalUnshippedQty.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">件</p>
            </div>
          </div>
        </Card>

        {/* Average Days Since Delivery */}
        <Card className="p-5 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600">平均滞留</p>
              <p className="text-3xl font-bold text-amber-900">
                {summary.avgDaysSinceDelivery !== null
                  ? summary.avgDaysSinceDelivery
                  : '-'}
              </p>
              <p className="text-xs text-gray-500 mt-1">天</p>
            </div>
          </div>
        </Card>

        {/* Overdue Count */}
        <Card
          className={`p-5 ${
            summary.overdueCount > 0
              ? 'border-red-200 bg-gradient-to-br from-red-50 to-rose-50'
              : 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50'
          }`}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              {summary.overdueCount > 0 ? (
                <AlertTriangle className="h-8 w-8 text-red-600" />
              ) : (
                <CheckCircle className="h-8 w-8 text-green-600" />
              )}
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600">超期预警</p>
              <p
                className={`text-3xl font-bold ${
                  summary.overdueCount > 0 ? 'text-red-900' : 'text-green-900'
                }`}
              >
                {summary.overdueCount}
              </p>
              <p className="text-xs text-gray-500 mt-1">件 (&gt;7天)</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Additional info row */}
      <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 px-4 py-3 rounded-lg">
        <div className="flex items-center space-x-2">
          <FileText className="h-4 w-4 text-gray-500" />
          <span>
            未发货批次: <span className="font-semibold">{summary.totalUnshippedLines}</span> 行
          </span>
        </div>
        {summary.oldestDeliveryDays !== null && (
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <span>
              最长滞留: <span className="font-semibold">{summary.oldestDeliveryDays}</span> 天
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
