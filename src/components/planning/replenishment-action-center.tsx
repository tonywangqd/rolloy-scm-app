/**
 * Replenishment Action Center Component
 * Main container for replenishment suggestions
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { ReplenishmentActionHeader } from './replenishment-action-header'
import { ReplenishmentActionStats } from './replenishment-action-stats'
import { ReplenishmentActionTable } from './replenishment-action-table'
import type { ReplenishmentSuggestionView } from '@/lib/types/database'
import type {
  ReplenishmentActionFilters,
  ReplenishmentRowAction,
} from '@/lib/types/replenishment'
import {
  filterReplenishmentSuggestions,
  calculateReplenishmentStats,
  sortReplenishmentSuggestions,
  DEFAULT_REPLENISHMENT_FILTERS,
} from '@/lib/utils/replenishment-utils'

interface ReplenishmentActionCenterProps {
  suggestions: ReplenishmentSuggestionView[]
  onViewProjection?: (sku: string) => void
}

export function ReplenishmentActionCenter({
  suggestions,
  onViewProjection,
}: ReplenishmentActionCenterProps) {
  const router = useRouter()
  const [filters, setFilters] = useState<ReplenishmentActionFilters>(
    DEFAULT_REPLENISHMENT_FILTERS
  )

  // Sort suggestions by priority and deadline
  const sortedSuggestions = useMemo(
    () => sortReplenishmentSuggestions(suggestions),
    [suggestions]
  )

  // Filter suggestions based on current filters
  const filteredSuggestions = useMemo(
    () => filterReplenishmentSuggestions(sortedSuggestions, filters),
    [sortedSuggestions, filters]
  )

  // Calculate statistics for all suggestions (not filtered)
  const allStats = useMemo(
    () => calculateReplenishmentStats(suggestions),
    [suggestions]
  )

  // Calculate statistics for filtered suggestions
  const filteredStats = useMemo(
    () => calculateReplenishmentStats(filteredSuggestions),
    [filteredSuggestions]
  )

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: ReplenishmentActionFilters) => {
    setFilters(newFilters)
  }, [])

  // Handle quick filter clicks
  const handleQuickFilter = useCallback((filter: 'critical' | 'high' | 'overdue') => {
    setFilters((prev) => {
      switch (filter) {
        case 'critical':
          return { ...prev, priority: 'Critical', overdueOnly: false }
        case 'high':
          return { ...prev, priority: 'High', overdueOnly: false }
        case 'overdue':
          return { ...prev, priority: 'All', overdueOnly: true }
        default:
          return prev
      }
    })
  }, [])

  // Handle row actions
  const handleAction = useCallback(
    (action: ReplenishmentRowAction) => {
      switch (action.type) {
        case 'create_po':
          // Navigate to PO creation page with pre-filled data
          router.push(
            `/planning/purchase-orders/new?sku=${action.sku}&qty=${action.suggestion.suggested_order_qty}&deadline=${action.suggestion.order_deadline_date}`
          )
          break

        case 'view_projection':
          // Trigger parent component to scroll and filter to this SKU
          if (onViewProjection) {
            onViewProjection(action.sku)
          }
          break

        case 'dismiss':
          // Future: Update suggestion status to 'Dismissed'
          console.log('Dismiss action not yet implemented:', action.sku)
          break

        default:
          console.warn('Unknown action type:', action)
      }
    },
    [router, onViewProjection]
  )

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* Header with Filters */}
        <ReplenishmentActionHeader
          filters={filters}
          onFilterChange={handleFilterChange}
        />

        {/* Statistics Summary */}
        <ReplenishmentActionStats
          stats={allStats}
          onQuickFilter={handleQuickFilter}
        />

        {/* Filtered Results Info */}
        {filteredSuggestions.length !== suggestions.length && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            筛选结果: 显示 <strong>{filteredSuggestions.length}</strong> / {suggestions.length} 项补货建议
          </div>
        )}

        {/* Action Table */}
        <ReplenishmentActionTable
          data={filteredSuggestions}
          onAction={handleAction}
        />

        {/* Additional Info */}
        {filteredSuggestions.length > 0 && (
          <div className="text-sm text-gray-500">
            <p>
              <strong>提示:</strong> 建议采购数量基于安全库存和预测销量计算，
              实际下单时请结合供应商 MOQ、包装规格等因素调整。
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
