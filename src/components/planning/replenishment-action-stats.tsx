/**
 * Replenishment Action Stats Component
 * Displays summary statistics for replenishment suggestions
 */

import { Badge } from '@/components/ui/badge'
import { AlertCircle, AlertTriangle, Clock } from 'lucide-react'
import type { ReplenishmentActionStats } from '@/lib/types/replenishment'

interface ReplenishmentActionStatsProps {
  stats: ReplenishmentActionStats
  onQuickFilter?: (filter: 'critical' | 'high' | 'overdue') => void
}

export function ReplenishmentActionStats({
  stats,
  onQuickFilter,
}: ReplenishmentActionStatsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {/* Total Count */}
      <div className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2">
        <span className="text-sm text-gray-600">总计:</span>
        <span className="text-lg font-semibold text-gray-900">
          {stats.total_count}
        </span>
        <span className="text-sm text-gray-500">项</span>
      </div>

      {/* Critical Priority */}
      {stats.critical_count > 0 && (
        <button
          onClick={() => onQuickFilter?.('critical')}
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 transition-colors hover:bg-red-100"
        >
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-700">紧急:</span>
          <Badge variant="danger" className="ml-1">
            {stats.critical_count}
          </Badge>
        </button>
      )}

      {/* High Priority */}
      {stats.high_count > 0 && (
        <button
          onClick={() => onQuickFilter?.('high')}
          className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 transition-colors hover:bg-orange-100"
        >
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <span className="text-sm text-orange-700">高优先级:</span>
          <Badge className="ml-1 bg-orange-600 hover:bg-orange-700">
            {stats.high_count}
          </Badge>
        </button>
      )}

      {/* Overdue Count */}
      {stats.overdue_count > 0 && (
        <button
          onClick={() => onQuickFilter?.('overdue')}
          className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-100 px-4 py-2 transition-colors hover:bg-red-200"
        >
          <Clock className="h-4 w-4 text-red-700" />
          <span className="text-sm text-red-800">已超期:</span>
          <Badge variant="danger" className="ml-1">
            {stats.overdue_count}
          </Badge>
        </button>
      )}

      {/* Average Days Until Deadline */}
      {stats.total_count > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-blue-50 px-4 py-2">
          <Clock className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-700">平均剩余:</span>
          <span className="font-semibold text-blue-900">
            {stats.avg_days_until_deadline}
          </span>
          <span className="text-sm text-blue-600">天</span>
        </div>
      )}
    </div>
  )
}
