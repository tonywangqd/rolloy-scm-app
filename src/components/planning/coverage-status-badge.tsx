import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type CoverageStatus = 'UNCOVERED' | 'PARTIALLY_COVERED' | 'FULLY_COVERED' | 'OVER_COVERED'

interface CoverageStatusBadgeProps {
  status: CoverageStatus
  coveragePercentage?: number
  className?: string
}

export function CoverageStatusBadge({
  status,
  coveragePercentage,
  className
}: CoverageStatusBadgeProps) {
  const config = {
    UNCOVERED: {
      variant: 'danger' as const,
      label: '未覆盖 Uncovered',
      icon: '✕',
      bgColor: 'bg-red-100',
      textColor: 'text-red-800',
      borderColor: 'border-red-200',
    },
    PARTIALLY_COVERED: {
      variant: 'warning' as const,
      label: coveragePercentage
        ? `部分覆盖 ${coveragePercentage.toFixed(0)}%`
        : '部分覆盖 Partial',
      icon: '⚠',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
      borderColor: 'border-yellow-200',
    },
    FULLY_COVERED: {
      variant: 'success' as const,
      label: '完全覆盖 Full',
      icon: '✓',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-200',
    },
    OVER_COVERED: {
      variant: 'warning' as const,
      label: coveragePercentage
        ? `超额覆盖 ${coveragePercentage.toFixed(0)}%`
        : '超额覆盖 Over',
      icon: '⚠',
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-800',
      borderColor: 'border-orange-200',
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
