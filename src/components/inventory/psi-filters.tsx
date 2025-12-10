'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search, Filter } from 'lucide-react'

export function PSIFilters() {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* SKU Filter */}
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            SKU
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索SKU..."
              className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Warehouse Filter */}
        <div className="w-48">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            仓库
          </label>
          <select className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
            <option value="">全部仓库</option>
            <option value="US-WEST">US-West</option>
            <option value="US-EAST">US-East</option>
            <option value="EU-MAIN">EU-Main</option>
          </select>
        </div>

        {/* Week Range Filter */}
        <div className="w-48">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            周范围
          </label>
          <select className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
            <option value="12">未来12周</option>
            <option value="8">未来8周</option>
            <option value="4">未来4周</option>
          </select>
        </div>

        {/* Risk Only Toggle */}
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">仅显示风险SKU</span>
          </label>
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-end gap-2">
          <Button size="sm" variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            重置
          </Button>
          <Button size="sm">
            应用筛选
          </Button>
        </div>
      </div>
    </Card>
  )
}
