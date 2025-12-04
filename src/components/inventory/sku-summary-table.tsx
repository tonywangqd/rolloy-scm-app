'use client'

import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { usePagination } from '@/lib/hooks/use-pagination'
import { formatNumber } from '@/lib/utils'

interface SkuSummaryItem {
  sku: string
  product_name: string
  total_stock: number
  fba_stock: number
  threepl_stock: number
  warehouse_count: number
}

interface SkuSummaryTableProps {
  items: SkuSummaryItem[]
}

export function SkuSummaryTable({ items }: SkuSummaryTableProps) {
  const pagination = usePagination(items, 20)

  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-gray-500">
        暂无库存数据
      </div>
    )
  }

  return (
    <>
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
          {pagination.paginatedItems.map((item) => (
            <TableRow key={item.sku}>
              <TableCell className="font-medium">
                <Link
                  href={`/inventory/algorithm-audit?sku=${item.sku}`}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {item.sku}
                </Link>
              </TableCell>
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

      <DataTablePagination
        totalItems={pagination.totalItems}
        pageSize={pagination.pageSize}
        currentPage={pagination.currentPage}
        onPageChange={pagination.goToPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </>
  )
}
