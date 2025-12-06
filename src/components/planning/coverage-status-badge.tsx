import { cn } from '@/lib/utils'
import type { ForecastCoverageStatus } from '@/lib/types/database'

interface CoverageStatusBadgeProps {
  status: ForecastCoverageStatus
  coveragePercentage?: number
  className?: string
}

export function CoverageStatusBadge({
  status,
  coveragePercentage,
  className
}: CoverageStatusBadgeProps) {
  const config: Record<ForecastCoverageStatus, {
    label: string
    icon: string
    bgColor: string
    textColor: string
    borderColor: string
  }> = {
    UNCOVERED: {
      label: '未覆盖',
      icon: '✕',
      bgColor: 'bg-red-100',
      textColor: 'text-red-800',
      borderColor: 'border-red-200',
    },
    PARTIALLY_COVERED: {
      label: coveragePercentage
        ? `部分 ${coveragePercentage.toFixed(0)}%`
        : '部分覆盖',
      icon: '⚠',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
      borderColor: 'border-yellow-200',
    },
    FULLY_COVERED: {
      label: '完全覆盖',
      icon: '✓',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-200',
    },
    OVER_COVERED: {
      label: coveragePercentage
        ? `超额 ${coveragePercentage.toFixed(0)}%`
        : '超额覆盖',
      icon: '⚠',
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-800',
      borderColor: 'border-orange-200',
    },
    CLOSED: {
      label: '已完结',
      icon: '✓',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-600',
      borderColor: 'border-gray-200',
    },
  }

  const { label, icon, bgColor, textColor, borderColor } = config[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        bgColor,
        textColor,
        borderColor,
        className
      )}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </span>
  )
}
