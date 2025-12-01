/**
 * Rolloy SCM System - Replenishment Action Center Types
 * UI State types for the Replenishment Action Center
 */

import type { ReplenishmentSuggestionView } from './database'

// ================================================================
// FILTER TYPES
// ================================================================

/**
 * Client-side filter state for Replenishment Action Center
 */
export interface ReplenishmentActionFilters {
  priority: 'All' | 'Critical' | 'High' | 'Medium' | 'Low'
  overdueOnly: boolean
  searchSku: string
}

/**
 * Default filter values
 */
export const DEFAULT_REPLENISHMENT_FILTERS: ReplenishmentActionFilters = {
  priority: 'All',
  overdueOnly: false,
  searchSku: '',
}

// ================================================================
// ACTION TYPES
// ================================================================

/**
 * Row-level action types
 */
export type ReplenishmentActionType = 'create_po' | 'dismiss' | 'view_projection'

/**
 * Action payload for row interactions
 */
export interface ReplenishmentRowAction {
  type: ReplenishmentActionType
  sku: string
  suggestion: ReplenishmentSuggestionView
}

// ================================================================
// STATISTICS TYPES
// ================================================================

/**
 * Computed statistics for Replenishment Action Center
 */
export interface ReplenishmentActionStats {
  total_count: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  overdue_count: number
  avg_days_until_deadline: number
}

// ================================================================
// UTILITY TYPES
// ================================================================

/**
 * Priority badge configuration
 */
export interface PriorityBadgeConfig {
  variant: 'default' | 'success' | 'warning' | 'danger'
  className: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

/**
 * Stock status badge configuration
 */
export interface StockStatusBadgeConfig {
  variant: 'default' | 'success' | 'warning' | 'danger'
  className: string
  label: string
}

/**
 * Deadline urgency level
 */
export type DeadlineUrgency = 'overdue' | 'critical' | 'warning' | 'normal'

/**
 * Deadline indicator configuration
 */
export interface DeadlineIndicatorConfig {
  urgency: DeadlineUrgency
  className: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}
