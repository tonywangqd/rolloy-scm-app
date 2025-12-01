/**
 * Rolloy SCM System - Replenishment Action Center Utilities
 * Helper functions for replenishment UI logic
 */

import type {
  ReplenishmentSuggestionView,
  Priority,
} from '@/lib/types/database'
import type {
  ReplenishmentActionFilters,
  ReplenishmentActionStats,
  PriorityBadgeConfig,
  StockStatusBadgeConfig,
  DeadlineIndicatorConfig,
  DeadlineUrgency,
} from '@/lib/types/replenishment'

// ================================================================
// DEFAULT VALUES
// ================================================================

export const DEFAULT_REPLENISHMENT_FILTERS: ReplenishmentActionFilters = {
  priority: 'All',
  overdueOnly: false,
  searchSku: '',
}

// ================================================================
// FILTERING FUNCTIONS
// ================================================================

/**
 * Filter replenishment suggestions based on current filters
 */
export function filterReplenishmentSuggestions(
  suggestions: ReplenishmentSuggestionView[],
  filters: ReplenishmentActionFilters
): ReplenishmentSuggestionView[] {
  return suggestions.filter((suggestion) => {
    // Priority filter
    if (filters.priority !== 'All' && suggestion.priority !== filters.priority) {
      return false
    }

    // Overdue filter
    if (filters.overdueOnly && !suggestion.is_overdue) {
      return false
    }

    // SKU search filter
    if (filters.searchSku.trim() !== '') {
      const searchTerm = filters.searchSku.toLowerCase()
      const matchesSku = suggestion.sku.toLowerCase().includes(searchTerm)
      const matchesName = suggestion.product_name.toLowerCase().includes(searchTerm)
      if (!matchesSku && !matchesName) {
        return false
      }
    }

    return true
  })
}

// ================================================================
// STATISTICS FUNCTIONS
// ================================================================

/**
 * Calculate statistics for replenishment suggestions
 */
export function calculateReplenishmentStats(
  suggestions: ReplenishmentSuggestionView[]
): ReplenishmentActionStats {
  const stats: ReplenishmentActionStats = {
    total_count: suggestions.length,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    overdue_count: 0,
    avg_days_until_deadline: 0,
  }

  if (suggestions.length === 0) {
    return stats
  }

  let totalDays = 0

  suggestions.forEach((suggestion) => {
    // Count by priority
    switch (suggestion.priority) {
      case 'Critical':
        stats.critical_count++
        break
      case 'High':
        stats.high_count++
        break
      case 'Medium':
        stats.medium_count++
        break
      case 'Low':
        stats.low_count++
        break
    }

    // Count overdue
    if (suggestion.is_overdue) {
      stats.overdue_count++
    }

    // Sum days until deadline
    totalDays += suggestion.days_until_deadline
  })

  // Calculate average
  stats.avg_days_until_deadline = Math.round(totalDays / suggestions.length)

  return stats
}

// ================================================================
// SORTING FUNCTIONS
// ================================================================

/**
 * Sort suggestions by priority and deadline
 * Priority order: Critical > High > Medium > Low
 * Within same priority: Earlier deadline first
 */
export function sortReplenishmentSuggestions(
  suggestions: ReplenishmentSuggestionView[]
): ReplenishmentSuggestionView[] {
  const priorityOrder: Record<Priority, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  }

  return [...suggestions].sort((a, b) => {
    // First sort by priority
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    // Then sort by deadline (earlier first)
    return new Date(a.order_deadline_date).getTime() - new Date(b.order_deadline_date).getTime()
  })
}

// ================================================================
// UI CONFIGURATION FUNCTIONS
// ================================================================

/**
 * Get priority badge configuration
 */
export function getPriorityBadgeConfig(priority: Priority): PriorityBadgeConfig {
  const configs: Record<Priority, PriorityBadgeConfig> = {
    Critical: {
      variant: 'danger',
      className: 'bg-red-100 text-red-700 border-red-300',
      label: '紧急',
    },
    High: {
      variant: 'warning',
      className: 'bg-orange-100 text-orange-700 border-orange-300',
      label: '高',
    },
    Medium: {
      variant: 'warning',
      className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      label: '中',
    },
    Low: {
      variant: 'default',
      className: 'bg-gray-100 text-gray-700 border-gray-300',
      label: '低',
    },
  }

  return configs[priority]
}

/**
 * Get stock status badge configuration
 */
export function getStockStatusBadgeConfig(
  status: 'Stockout' | 'Risk' | 'OK'
): StockStatusBadgeConfig {
  const configs: Record<'Stockout' | 'Risk' | 'OK', StockStatusBadgeConfig> = {
    Stockout: {
      variant: 'danger',
      className: 'bg-red-100 text-red-700',
      label: '断货',
    },
    Risk: {
      variant: 'warning',
      className: 'bg-yellow-100 text-yellow-700',
      label: '风险',
    },
    OK: {
      variant: 'success',
      className: 'bg-green-100 text-green-700',
      label: '正常',
    },
  }

  return configs[status]
}

/**
 * Determine deadline urgency level
 */
export function getDeadlineUrgency(
  daysUntilDeadline: number,
  isOverdue: boolean
): DeadlineUrgency {
  if (isOverdue) {
    return 'overdue'
  }
  if (daysUntilDeadline <= 3) {
    return 'critical'
  }
  if (daysUntilDeadline <= 7) {
    return 'warning'
  }
  return 'normal'
}

/**
 * Get deadline indicator configuration
 */
export function getDeadlineIndicatorConfig(
  daysUntilDeadline: number,
  isOverdue: boolean
): DeadlineIndicatorConfig {
  const urgency = getDeadlineUrgency(daysUntilDeadline, isOverdue)

  const configs: Record<DeadlineUrgency, DeadlineIndicatorConfig> = {
    overdue: {
      urgency: 'overdue',
      className: 'text-red-600 font-semibold',
      label: `已超期 ${Math.abs(daysUntilDeadline)} 天`,
    },
    critical: {
      urgency: 'critical',
      className: 'text-red-600 font-semibold',
      label: `${daysUntilDeadline} 天内`,
    },
    warning: {
      urgency: 'warning',
      className: 'text-orange-600 font-medium',
      label: `${daysUntilDeadline} 天内`,
    },
    normal: {
      urgency: 'normal',
      className: 'text-gray-600',
      label: `${daysUntilDeadline} 天内`,
    },
  }

  return configs[urgency]
}

// ================================================================
// DATE FORMATTING FUNCTIONS
// ================================================================

/**
 * Format ISO week to readable format
 * @example '2025-W05' → 'W05 (01/27-02/02)'
 */
export function formatWeekRange(
  weekIso: string,
  startDate: string,
  endDate: string
): string {
  const weekNumber = weekIso.split('-W')[1]
  const start = formatShortDate(startDate)
  const end = formatShortDate(endDate)
  return `W${weekNumber} (${start}-${end})`
}

/**
 * Format date to short format
 * @example '2025-01-27' → '01/27'
 */
export function formatShortDate(dateString: string): string {
  const date = new Date(dateString)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}`
}

/**
 * Format date to medium format
 * @example '2025-01-27' → '2025-01-27 (Mon)'
 */
export function formatMediumDate(dateString: string): string {
  const date = new Date(dateString)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekday = weekdays[date.getDay()]
  return `${dateString} (${weekday})`
}

// ================================================================
// VALIDATION FUNCTIONS
// ================================================================

/**
 * Check if a suggestion requires immediate action
 */
export function requiresImmediateAction(
  suggestion: ReplenishmentSuggestionView
): boolean {
  return suggestion.is_overdue ||
         suggestion.priority === 'Critical' ||
         suggestion.days_until_deadline <= 3
}

/**
 * Get action urgency message
 */
export function getActionUrgencyMessage(
  suggestion: ReplenishmentSuggestionView
): string | null {
  if (suggestion.is_overdue) {
    return '下单时间已超期，请立即处理'
  }
  if (suggestion.priority === 'Critical' && suggestion.days_until_deadline <= 3) {
    return '紧急：剩余时间不足 3 天'
  }
  if (suggestion.days_until_deadline <= 7) {
    return '请尽快处理，一周内需下单'
  }
  return null
}
