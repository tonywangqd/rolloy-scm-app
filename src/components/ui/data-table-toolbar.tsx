'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterOption {
  key: string
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}

export interface DataTableToolbarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters?: FilterOption[]
  onReset?: () => void
  className?: string
}

export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = '搜索...',
  filters = [],
  onReset,
  className,
}: DataTableToolbarProps) {
  const hasActiveFilters = React.useMemo(() => {
    return searchValue !== '' || filters.some((filter) => filter.value !== 'all')
  }, [searchValue, filters])

  const handleReset = () => {
    onSearchChange('')
    filters.forEach((filter) => filter.onChange('all'))
    onReset?.()
  }

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', className)}>
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter Dropdowns */}
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <RadixSelect
              key={filter.key}
              value={filter.value}
              onValueChange={filter.onChange}
            >
              <SelectTrigger className="w-[140px] h-10">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </RadixSelect>
          ))}
        </div>
      )}

      {/* Reset Button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          onClick={handleReset}
          className="h-10 px-3 text-sm"
        >
          <X className="mr-1 h-4 w-4" />
          重置
        </Button>
      )}
    </div>
  )
}
