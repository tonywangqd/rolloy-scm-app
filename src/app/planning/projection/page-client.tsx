/**
 * Inventory Projection Page - Client Component
 * Handles interactive features with refs and callbacks
 */

'use client'

import { useRef, useCallback } from 'react'
import { InventoryProjectionWrapper, type InventoryProjectionWrapperRef } from '@/components/planning/inventory-projection-wrapper'
import { ReplenishmentActionCenter } from '@/components/planning/replenishment-action-center'
import type {
  InventoryProjection12WeeksView,
  ReplenishmentSuggestionView,
} from '@/lib/types/database'

interface InventoryProjectionPageClientProps {
  projections: InventoryProjection12WeeksView[]
  suggestions: ReplenishmentSuggestionView[]
  uniqueSkus: string[]
}

export function InventoryProjectionPageClient({
  projections,
  suggestions,
  uniqueSkus,
}: InventoryProjectionPageClientProps) {
  const projectionWrapperRef = useRef<InventoryProjectionWrapperRef>(null)

  // Handle "View Projection" action from Replenishment Action Center
  const handleViewProjection = useCallback((sku: string) => {
    if (projectionWrapperRef.current) {
      // Scroll to the projection section
      projectionWrapperRef.current.scrollIntoView()

      // Filter to the specific SKU after a short delay to ensure scroll completes
      setTimeout(() => {
        projectionWrapperRef.current?.filterToSku(sku)
      }, 300)
    }
  }, [])

  return (
    <div className="space-y-8">
      {/* Replenishment Action Center */}
      {suggestions.length > 0 && (
        <ReplenishmentActionCenter
          suggestions={suggestions}
          onViewProjection={handleViewProjection}
        />
      )}

      {/* Inventory Projection Section */}
      <InventoryProjectionWrapper
        ref={projectionWrapperRef}
        initialData={projections}
        availableSkus={uniqueSkus}
      />
    </div>
  )
}
