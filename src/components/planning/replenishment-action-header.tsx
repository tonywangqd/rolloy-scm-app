/**
 * Replenishment Action Header Component
 * Filter controls for replenishment suggestions
 */

'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Search, Filter } from 'lucide-react'
import type { ReplenishmentActionFilters } from '@/lib/types/replenishment'

interface ReplenishmentActionHeaderProps {
  filters: ReplenishmentActionFilters
  onFilterChange: (filters: ReplenishmentActionFilters) => void
}

export function ReplenishmentActionHeader({
  filters,
  onFilterChange,
}: ReplenishmentActionHeaderProps) {
  const handlePriorityChange = (priority: ReplenishmentActionFilters['priority']) => {
    onFilterChange({ ...filters, priority })
  }

  const handleOverdueToggle = () => {
    onFilterChange({ ...filters, overdueOnly: !filters.overdueOnly })
  }

  const handleSearchChange = (searchSku: string) => {
    onFilterChange({ ...filters, searchSku })
  }

  return (
    <div className="space-y-4">
      {/* Title Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            补货行动中心
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            根据库存预测生成的采购建议，按优先级和截止日期排序
          </p>
        </div>
      </div>

      {/* Filter Controls Row */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Priority Filter */}
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="priority-filter" className="text-sm font-medium">
            优先级筛选
          </Label>
          <div className="mt-1.5 flex gap-2">
            {(['All', 'Critical', 'High', 'Medium', 'Low'] as const).map((priority) => (
              <button
                key={priority}
                onClick={() => handlePriorityChange(priority)}
                className={`
                  rounded-md px-3 py-1.5 text-sm font-medium transition-colors
                  ${
                    filters.priority === priority
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                {priority === 'All' ? '全部' : priority === 'Critical' ? '紧急' : priority === 'High' ? '高' : priority === 'Medium' ? '中' : '低'}
              </button>
            ))}
          </div>
        </div>

        {/* Overdue Toggle */}
        <div>
          <Label className="text-sm font-medium">快速筛选</Label>
          <button
            onClick={handleOverdueToggle}
            className={`
              mt-1.5 flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors
              ${
                filters.overdueOnly
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            <Filter className="h-4 w-4" />
            仅显示超期
            {filters.overdueOnly && (
              <Badge variant="default" className="ml-1 bg-white text-red-600">
                ON
              </Badge>
            )}
          </button>
        </div>

        {/* SKU Search */}
        <div className="flex-1 min-w-[250px]">
          <Label htmlFor="sku-search" className="text-sm font-medium">
            搜索 SKU / 产品名
          </Label>
          <div className="relative mt-1.5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="sku-search"
              type="text"
              placeholder="输入 SKU 或产品名称..."
              value={filters.searchSku}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Active Filters Display */}
      {(filters.priority !== 'All' || filters.overdueOnly || filters.searchSku) && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">当前筛选:</span>
          {filters.priority !== 'All' && (
            <Badge variant="default">
              优先级: {filters.priority}
            </Badge>
          )}
          {filters.overdueOnly && (
            <Badge variant="danger">
              仅超期
            </Badge>
          )}
          {filters.searchSku && (
            <Badge variant="default">
              搜索: {filters.searchSku}
            </Badge>
          )}
          <button
            onClick={() => onFilterChange({
              priority: 'All',
              overdueOnly: false,
              searchSku: '',
            })}
            className="ml-2 text-blue-600 hover:underline"
          >
            清除筛选
          </button>
        </div>
      )}
    </div>
  )
}
