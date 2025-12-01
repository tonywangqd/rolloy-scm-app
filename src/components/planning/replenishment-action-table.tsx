/**
 * Replenishment Action Table Component
 * Displays replenishment suggestions in a table format
 */

'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, Package, Eye, XCircle } from 'lucide-react'
import type { ReplenishmentSuggestionView } from '@/lib/types/database'
import type { ReplenishmentRowAction } from '@/lib/types/replenishment'
import {
  getPriorityBadgeConfig,
  getStockStatusBadgeConfig,
  getDeadlineIndicatorConfig,
  formatWeekRange,
  formatMediumDate,
  requiresImmediateAction,
  getActionUrgencyMessage,
} from '@/lib/utils/replenishment-utils'

interface ReplenishmentActionTableProps {
  data: ReplenishmentSuggestionView[]
  onAction: (action: ReplenishmentRowAction) => void
}

export function ReplenishmentActionTable({
  data,
  onAction,
}: ReplenishmentActionTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-500">
        <div className="text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-lg font-medium">暂无补货建议</p>
          <p className="mt-2 text-sm">
            当前筛选条件下没有找到需要补货的 SKU
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">SKU / 产品</TableHead>
            <TableHead className="text-center w-[120px]">风险周</TableHead>
            <TableHead className="text-right w-[100px]">建议采购</TableHead>
            <TableHead className="text-center w-[150px]">下单截止</TableHead>
            <TableHead className="text-center w-[100px]">优先级</TableHead>
            <TableHead className="text-center w-[100px]">库存状态</TableHead>
            <TableHead className="text-center w-[250px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((suggestion) => {
            const priorityConfig = getPriorityBadgeConfig(suggestion.priority)
            const statusConfig = getStockStatusBadgeConfig(suggestion.stock_status)
            const deadlineConfig = getDeadlineIndicatorConfig(
              suggestion.days_until_deadline,
              suggestion.is_overdue
            )
            const urgentAction = requiresImmediateAction(suggestion)
            const urgencyMessage = getActionUrgencyMessage(suggestion)

            return (
              <TableRow
                key={`${suggestion.sku}-${suggestion.risk_week_iso}`}
                className={urgentAction ? 'bg-red-50' : undefined}
              >
                {/* SKU / Product */}
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900">{suggestion.sku}</p>
                    <p className="text-sm text-gray-600">{suggestion.product_name}</p>
                  </div>
                </TableCell>

                {/* Risk Week */}
                <TableCell className="text-center">
                  <div className="space-y-1">
                    <p className="font-mono text-sm font-medium">
                      {suggestion.risk_week_iso}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatWeekRange(
                        suggestion.risk_week_iso,
                        suggestion.risk_week_start,
                        suggestion.risk_week_end
                      )}
                    </p>
                  </div>
                </TableCell>

                {/* Suggested Order Qty */}
                <TableCell className="text-right">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-blue-600">
                      {suggestion.suggested_order_qty.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">件</p>
                  </div>
                </TableCell>

                {/* Order Deadline */}
                <TableCell className="text-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-900">
                      {formatMediumDate(suggestion.order_deadline_date)}
                    </p>
                    <p className={`text-xs ${deadlineConfig.className}`}>
                      {deadlineConfig.label}
                    </p>
                  </div>
                </TableCell>

                {/* Priority */}
                <TableCell className="text-center">
                  <Badge variant={priorityConfig.variant} className={priorityConfig.className}>
                    {priorityConfig.label}
                  </Badge>
                </TableCell>

                {/* Stock Status */}
                <TableCell className="text-center">
                  <Badge variant={statusConfig.variant} className={statusConfig.className}>
                    {statusConfig.label}
                  </Badge>
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    {/* Create PO Button */}
                    <Button
                      size="sm"
                      onClick={() =>
                        onAction({
                          type: 'create_po',
                          sku: suggestion.sku,
                          suggestion,
                        })
                      }
                      className={
                        urgentAction
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }
                    >
                      <Package className="mr-1 h-3.5 w-3.5" />
                      创建采购单
                    </Button>

                    {/* View Projection Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onAction({
                          type: 'view_projection',
                          sku: suggestion.sku,
                          suggestion,
                        })
                      }
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      查看详情
                    </Button>

                    {/* Dismiss Button (Future) */}
                    {/* <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onAction({
                          type: 'dismiss',
                          sku: suggestion.sku,
                          suggestion,
                        })
                      }
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      忽略
                    </Button> */}
                  </div>

                  {/* Urgency Message */}
                  {urgencyMessage && (
                    <div className="mt-2 flex items-center justify-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      {urgencyMessage}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
