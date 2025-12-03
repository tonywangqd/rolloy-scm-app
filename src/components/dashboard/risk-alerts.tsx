import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import type { InventoryProjection12WeeksView } from '@/lib/types/database'

interface RiskAlertsProps {
  alerts: InventoryProjection12WeeksView[]
}

export function RiskAlerts({ alerts }: RiskAlertsProps) {
  // Filter to show max 5 alerts
  const displayAlerts = alerts.slice(0, 5)
  const hasMoreAlerts = alerts.length > 5

  // Check if there are any risks
  const hasRisks = alerts.length > 0

  return (
    <Card className="border-l-4 border-l-red-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {hasRisks ? (
              <>
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span>库存风险预警</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span>库存状态</span>
              </>
            )}
          </CardTitle>
          <Link
            href="/planning/projection"
            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            查看详情
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>

      <CardContent>
        {hasRisks ? (
          <div className="space-y-3">
            {/* Summary */}
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-red-600">{alerts.length}</span> 个SKU将在未来2周内面临缺货风险
            </p>

            {/* Alert List */}
            <ul className="space-y-2">
              {displayAlerts.map((alert) => {
                const isStockout = alert.stock_status === 'Stockout'
                const badgeVariant = isStockout ? 'danger' : 'warning'
                const statusText = isStockout ? '缺货' : '风险'

                return (
                  <li
                    key={`${alert.sku}-${alert.week_iso}`}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className="text-gray-400 select-none">•</span>
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/inventory/algorithm-audit?sku=${alert.sku}`}
                        className="font-medium text-gray-900 hover:text-blue-600 hover:underline transition-colors"
                      >
                        {alert.sku}
                      </Link>
                      <Badge variant={badgeVariant} className="text-xs">
                        {statusText}
                      </Badge>
                      <span className="text-gray-600">
                        预计 {alert.week_iso} 周缺货
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Show more indicator */}
            {hasMoreAlerts && (
              <p className="text-xs text-gray-500 pt-1">
                还有 {alerts.length - 5} 个SKU存在风险，点击查看详情
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span>当前库存状态良好，无缺货风险</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
