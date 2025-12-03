'use client'

import * as React from 'react'
import {
  RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

export interface DataTablePaginationProps {
  totalItems: number
  pageSize: number
  currentPage: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
}

export function DataTablePagination({
  totalItems,
  pageSize,
  currentPage,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  // Calculate visible range
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between px-2 py-4">
      {/* Left: Items count and page size selector */}
      <div className="flex items-center gap-6 text-sm">
        <div className="text-gray-600">
          显示 <span className="font-medium text-gray-900">{startItem}</span> 到{' '}
          <span className="font-medium text-gray-900">{endItem}</span>，共{' '}
          <span className="font-medium text-gray-900">{totalItems}</span> 条
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-600">每页</span>
          <RadixSelect
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={String(pageSize)} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </RadixSelect>
          <span className="text-gray-600">条</span>
        </div>
      </div>

      {/* Right: Page navigation */}
      <div className="flex items-center gap-2">
        <div className="text-sm text-gray-600 mr-4">
          第 <span className="font-medium text-gray-900">{currentPage}</span> /{' '}
          <span className="font-medium text-gray-900">{totalPages}</span> 页
        </div>

        <div className="flex items-center gap-1">
          {/* First page */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
            title="第一页"
            className="h-8 w-8 p-0"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>

          {/* Previous page */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canGoPrevious}
            title="上一页"
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page number display with quick jump */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 mx-2">
              {/* Show nearby page numbers */}
              {getPageNumbers(currentPage, totalPages).map((pageNum, idx) => {
                if (pageNum === -1) {
                  return (
                    <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                      ...
                    </span>
                  )
                }
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === currentPage ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(pageNum)}
                    className="h-8 w-8 p-0"
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
          )}

          {/* Next page */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canGoNext}
            title="下一页"
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Last page */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
            title="最后一页"
            className="h-8 w-8 p-0"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Generate array of page numbers to display with ellipsis
 * Shows: [1] ... [currentPage-1, currentPage, currentPage+1] ... [lastPage]
 */
function getPageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    // Show all pages if 7 or fewer
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: number[] = []

  // Always show first page
  pages.push(1)

  if (currentPage > 3) {
    pages.push(-1) // Ellipsis
  }

  // Show pages around current page
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (currentPage < totalPages - 2) {
    pages.push(-1) // Ellipsis
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return pages
}
