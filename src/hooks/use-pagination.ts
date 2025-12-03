'use client'

import { useState, useMemo } from 'react'

export interface UsePaginationReturn<T> {
  currentPage: number
  pageSize: number
  totalPages: number
  totalItems: number
  paginatedItems: T[]
  goToPage: (page: number) => void
  setPageSize: (size: number) => void
  nextPage: () => void
  previousPage: () => void
  canGoNext: boolean
  canGoPrevious: boolean
}

/**
 * Hook for managing pagination state and computing paginated data
 * @param items - Array of items to paginate
 * @param defaultPageSize - Initial page size (default: 20)
 * @returns Pagination state and controls
 */
export function usePagination<T>(
  items: T[],
  defaultPageSize = 20
): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  // Compute paginated items
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return items.slice(startIndex, endIndex)
  }, [items, currentPage, pageSize])

  // Navigation functions
  const goToPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages))
    setCurrentPage(validPage)
  }

  const handleSetPageSize = (size: number) => {
    setPageSize(size)
    // Reset to page 1 when page size changes to avoid out-of-bounds
    setCurrentPage(1)
  }

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1)
    }
  }

  const previousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1)
    }
  }

  const canGoNext = currentPage < totalPages
  const canGoPrevious = currentPage > 1

  return {
    currentPage,
    pageSize,
    totalPages,
    totalItems,
    paginatedItems,
    goToPage,
    setPageSize: handleSetPageSize,
    nextPage,
    previousPage,
    canGoNext,
    canGoPrevious,
  }
}
