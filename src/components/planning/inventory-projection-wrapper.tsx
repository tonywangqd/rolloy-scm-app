'use client'

import { useState, useImperativeHandle, forwardRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SkuFilter } from './sku-filter'
import { InventoryProjectionChart } from './inventory-projection-chart'
import { InventoryProjectionTable } from './inventory-projection-table'
import type { InventoryProjection12WeeksView } from '@/lib/types/database'

interface InventoryProjectionWrapperProps {
  initialData: InventoryProjection12WeeksView[]
  availableSkus: string[]
}

export interface InventoryProjectionWrapperRef {
  filterToSku: (sku: string) => void
  scrollIntoView: () => void
}

export const InventoryProjectionWrapper = forwardRef<
  InventoryProjectionWrapperRef,
  InventoryProjectionWrapperProps
>(function InventoryProjectionWrapper(
  { initialData, availableSkus },
  ref
) {
  const [selectedSku, setSelectedSku] = useState<string>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Expose methods to parent components via ref
  useImperativeHandle(ref, () => ({
    filterToSku: (sku: string) => {
      setSelectedSku(sku)
    },
    scrollIntoView: () => {
      // Scroll to this component
      const element = document.getElementById('inventory-projection-section')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
  }))

  // Filter data based on selected SKU
  const filteredData = selectedSku === 'all'
    ? initialData
    : initialData.filter((item) => item.sku === selectedSku)

  // Handle refresh
  const handleRefresh = () => {
    setIsRefreshing(true)
    // Reload the page to fetch fresh data
    window.location.reload()
  }

  return (
    <div id="inventory-projection-section" className="space-y-6">
      {/* Filter Controls */}
      <SkuFilter
        skus={availableSkus}
        selectedSku={selectedSku}
        onSkuChange={setSelectedSku}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Chart */}
      <InventoryProjectionChart
        data={filteredData}
        sku={selectedSku !== 'all' ? selectedSku : undefined}
      />

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>分周明细</CardTitle>
        </CardHeader>
        <CardContent>
          <InventoryProjectionTable data={filteredData} />
        </CardContent>
      </Card>
    </div>
  )
})
