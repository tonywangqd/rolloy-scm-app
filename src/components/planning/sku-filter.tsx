'use client'

import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

interface SkuFilterProps {
  skus: string[]
  selectedSku: string
  onSkuChange: (sku: string) => void
  onRefresh: () => void
  isRefreshing?: boolean
}

export function SkuFilter({
  skus,
  selectedSku,
  onSkuChange,
  onRefresh,
  isRefreshing = false,
}: SkuFilterProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <span className="text-sm text-gray-500">筛选:</span>
        <div className="w-64">
          <Select
            value={selectedSku}
            onChange={(e) => onSkuChange(e.target.value)}
          >
            <option value="all">全部 SKU</option>
            {skus.map((sku) => (
              <option key={sku} value={sku}>
                {sku}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button
        variant="outline"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        刷新数据
      </Button>
    </div>
  )
}
