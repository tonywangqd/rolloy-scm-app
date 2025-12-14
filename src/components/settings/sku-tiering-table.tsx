'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { ArrowUpDown, Search } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  RadixSelect,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/lib/hooks/use-toast'
import { ToastContainer } from '@/components/ui/toast'
import { getProductsWithTiers, bulkUpdateProductTiers } from '@/lib/actions/constraints'

// Type definitions
export type ProductTier = 'HERO' | 'STANDARD' | 'ACCESSORY'

export interface ProductWithTier {
  sku: string
  product_name: string
  sku_tier: ProductTier
  supplier_name?: string | null
  unit_cost_usd: number
  safety_stock_weeks?: number
  production_lead_weeks?: number
  current_stock?: number
}

const tierBadgeConfig: Record<ProductTier, { label: string; className: string }> = {
  HERO: { label: 'Hero', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  STANDARD: { label: 'Standard', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  ACCESSORY: { label: 'Accessory', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' },
}

export function SkuTieringTable() {
  const [data, setData] = useState<ProductWithTier[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [tierFilter, setTierFilter] = useState<ProductTier | 'ALL'>('ALL')
  const [bulkTier, setBulkTier] = useState<ProductTier | ''>('')
  const { toasts, showToast, dismissToast } = useToast()

  // Load data on mount
  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true)
        const result = await getProductsWithTiers()
        if (result.success && result.data) {
          setData(result.data)
        } else {
          showToast(result.error || 'Failed to load products', 'error')
        }
      } catch (error) {
        showToast('Failed to load products', 'error')
      } finally {
        setLoading(false)
      }
    }
    loadProducts()
  }, [])

  // Filter data by tier
  const filteredData = useMemo(() => {
    if (tierFilter === 'ALL') return data
    return data.filter((p) => p.sku_tier === tierFilter)
  }, [data, tierFilter])

  // Define columns
  const columns = useMemo<ColumnDef<ProductWithTier>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'sku',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            SKU
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.getValue('sku')}</span>
        ),
      },
      {
        accessorKey: 'product_name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Product Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="max-w-[300px] truncate">{row.getValue('product_name')}</span>
        ),
      },
      {
        accessorKey: 'sku_tier',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Tier
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const tier = row.getValue('sku_tier') as ProductTier
          const config = tierBadgeConfig[tier]
          return (
            <Badge className={config.className}>
              {config.label}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'supplier_name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Supplier
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-gray-600">{row.getValue('supplier_name') || '-'}</span>
        ),
      },
      {
        accessorKey: 'unit_cost_usd',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Unit Cost
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const cost = row.getValue('unit_cost_usd') as number
          return <span className="font-mono">${cost.toFixed(2)}</span>
        },
      },
    ],
    []
  )

  // Create table instance
  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      globalFilter,
    },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  // Get selected rows
  const selectedRows = table.getFilteredSelectedRowModel().rows

  // Handle bulk tier change
  async function handleBulkTierChange() {
    if (!bulkTier || selectedRows.length === 0) return

    try {
      setSaving(true)
      const updates = selectedRows.map((row) => ({
        sku: row.original.sku,
        tier: bulkTier,
      }))

      const result = await bulkUpdateProductTiers(updates)
      if (result.success) {
        // Update local state
        setData((prev) =>
          prev.map((p) => {
            const update = updates.find((u) => u.sku === p.sku)
            return update ? { ...p, sku_tier: update.tier } : p
          })
        )
        setRowSelection({})
        setBulkTier('')
        showToast(`Successfully updated ${result.updated_count} products`, 'success')
      } else {
        showToast(result.error || 'Failed to update products', 'error')
      }
    } catch (error) {
      showToast('Failed to update products', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SKU Segmentation</CardTitle>
          <CardDescription>Classify products by priority tier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading products...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>SKU Segmentation</CardTitle>
          <CardDescription>Classify products by priority tier</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk action bar */}
          {selectedRows.length > 0 && (
            <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg mb-4 border border-blue-200">
              <span className="text-sm font-medium text-blue-700">
                {selectedRows.length} product{selectedRows.length > 1 ? 's' : ''} selected
              </span>
              <RadixSelect value={bulkTier} onValueChange={(v) => setBulkTier(v as ProductTier)}>
                <SelectTrigger className="w-44 bg-white">
                  <SelectValue placeholder="Change tier to..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HERO">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      Hero
                    </span>
                  </SelectItem>
                  <SelectItem value="STANDARD">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Standard
                    </span>
                  </SelectItem>
                  <SelectItem value="ACCESSORY">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                      Accessory
                    </span>
                  </SelectItem>
                </SelectContent>
              </RadixSelect>
              <Button
                onClick={handleBulkTierChange}
                disabled={!bulkTier || saving}
                size="sm"
              >
                {saving ? 'Applying...' : 'Apply'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRowSelection({})
                  setBulkTier('')
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by SKU or product name..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <RadixSelect
              value={tierFilter}
              onValueChange={(v) => setTierFilter(v as ProductTier | 'ALL')}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Tiers</SelectItem>
                <SelectItem value="HERO">Hero</SelectItem>
                <SelectItem value="STANDARD">Standard</SelectItem>
                <SelectItem value="ACCESSORY">Accessory</SelectItem>
              </SelectContent>
            </RadixSelect>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-gray-200">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No products found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between py-4">
            <div className="text-sm text-gray-500">
              Showing {table.getRowModel().rows.length} of {filteredData.length} products
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
