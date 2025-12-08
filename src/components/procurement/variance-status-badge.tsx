'use client'

import { Badge } from '@/components/ui/badge'
import type { VarianceStatus, VariancePriority } from '@/lib/types/database'

interface VarianceStatusBadgeProps {
  status: VarianceStatus
}

const statusConfig: Record<VarianceStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger'; labelEn: string }> = {
  pending: { label: '待处理', variant: 'warning', labelEn: 'Pending' },
  scheduled: { label: '已计划', variant: 'default', labelEn: 'Scheduled' },
  partial: { label: '部分完成', variant: 'default', labelEn: 'Partial' },
  completed: { label: '已完成', variant: 'success', labelEn: 'Completed' },
  cancelled: { label: '已取消', variant: 'default', labelEn: 'Cancelled' },
  overdue: { label: '已逾期', variant: 'danger', labelEn: 'Overdue' },
}

export function VarianceStatusBadge({ status }: VarianceStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  )
}

interface VariancePriorityBadgeProps {
  priority: VariancePriority
}

const priorityConfig: Record<VariancePriority, { label: string; className: string }> = {
  Critical: { label: '紧急', className: 'bg-red-600 text-white' },
  High: { label: '高', className: 'bg-orange-500 text-white' },
  Medium: { label: '中', className: 'bg-yellow-400 text-gray-900' },
  Low: { label: '低', className: 'bg-gray-200 text-gray-700' },
}

export function VariancePriorityBadge({ priority }: VariancePriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.Medium
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}

interface VarianceSourceBadgeProps {
  sourceType: 'order_to_delivery' | 'delivery_to_ship' | 'ship_to_arrival'
}

const sourceConfig = {
  order_to_delivery: { label: '待出货', className: 'bg-blue-100 text-blue-800' },
  delivery_to_ship: { label: '工厂库存', className: 'bg-purple-100 text-purple-800' },
  ship_to_arrival: { label: '运输差异', className: 'bg-gray-100 text-gray-800' },
}

export function VarianceSourceBadge({ sourceType }: VarianceSourceBadgeProps) {
  const config = sourceConfig[sourceType] || sourceConfig.order_to_delivery
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
