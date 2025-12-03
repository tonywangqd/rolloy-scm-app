'use client'

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableToolbar } from '@/components/ui/data-table-toolbar'
import { formatNumber } from '@/lib/utils'

interface SkuSummary {
  sku: string
  product_name: string
  total_stock: number
  fba_stock: number
  threepl_stock: number
  warehouse_count: number
}

interface InventorySkuTableProps {
  skuSummary: SkuSummary[]
}

export function InventorySkuTable({ skuSummary }: InventorySkuTableProps) {
  const [searchValue, setSearchValue] = useState('')

  // Filter SKUs based on search
  const filteredSummary = useMemo(() => {
    return skuSummary.filter((item) => {
      const searchLower = searchValue.toLowerCase()
      return (
        searchValue === '' ||
        item.sku.toLowerCase().includes(searchLower) ||
        item.product_name.toLowerCase().includes(searchLower)
      )
    })
  }, [skuSummary, searchValue])

  return (
    <div className="space-y-4">
      {/* Search */}
      <DataTableToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="搜索 SKU 或产品名称..."
      />

      {/* Results count */}
      <div className="text-sm text-gray-500">
        共 {filteredSummary.length} 个 SKU
        {filteredSummary.length !== skuSummary.length && (
          <span className="ml-1">(已过滤 {skuSummary.length - filteredSummary.length} 个)</span>
        )}
      </div>

      {/* Table */}
      {filteredSummary.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-gray-500">
          {searchValue ? '没有符合条件的 SKU' : '暂无库存数据'}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>产品名称</TableHead>
              <TableHead className="text-right">总库存</TableHead>
              <TableHead className="text-right">FBA</TableHead>
              <TableHead className="text-right">3PL</TableHead>
              <TableHead className="text-right">仓库数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSummary.map((item) => (
              <TableRow key={item.sku}>
                <TableCell className="font-medium">{item.sku}</TableCell>
                <TableCell>{item.product_name}</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatNumber(item.total_stock)}
                </TableCell>
                <TableCell className="text-right text-orange-600">
                  {formatNumber(item.fba_stock)}
                </TableCell>
                <TableCell className="text-right text-purple-600">
                  {formatNumber(item.threepl_stock)}
                </TableCell>
                <TableCell className="text-right">{item.warehouse_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
