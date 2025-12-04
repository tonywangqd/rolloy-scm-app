'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { DataTableToolbar } from '@/components/ui/data-table-toolbar'
import { usePagination } from '@/lib/hooks/use-pagination'
import { formatDate, getPOStatusVariant } from '@/lib/utils'
import { Plus, Eye, Pencil } from 'lucide-react'
import { DeletePOButton } from './delete-po-button'
import type { POFulfillmentView } from '@/lib/types/database'

interface OrdersTableProps {
  orders: POFulfillmentView[]
}

export function OrdersTable({ orders }: OrdersTableProps) {
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Filter orders based on search and filters
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Search filter (PO number, batch, supplier)
      const searchLower = searchValue.toLowerCase()
      const matchesSearch =
        searchValue === '' ||
        order.po_number.toLowerCase().includes(searchLower) ||
        order.batch_code?.toLowerCase().includes(searchLower) ||
        order.supplier_name?.toLowerCase().includes(searchLower)

      // Status filter
      const matchesStatus =
        statusFilter === 'all' || order.po_status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [orders, searchValue, statusFilter])

  const pagination = usePagination(filteredOrders, 20)

  return (
    <>
      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">
            共 {orders.length} 个采购订单
          </span>
        </div>
        <Link href="/procurement/new">
          <Button variant="primary">
            <Plus className="mr-2 h-4 w-4" />
            创建采购订单
          </Button>
        </Link>
      </div>

      {/* PO Table */}
      <Card>
        <CardHeader>
          <CardTitle>采购订单列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search and Filters */}
            <DataTableToolbar
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              searchPlaceholder="搜索 PO 号、批次、供应商..."
              filters={[
                {
                  key: 'status',
                  label: '状态',
                  value: statusFilter,
                  onChange: setStatusFilter,
                  options: [
                    { value: 'all', label: '全部状态' },
                    { value: 'Pending', label: 'Pending' },
                    { value: 'Partial', label: 'Partial' },
                    { value: 'Fulfilled', label: 'Fulfilled' },
                    { value: 'Cancelled', label: 'Cancelled' },
                  ],
                },
              ]}
            />

            {/* Results count */}
            <div className="text-sm text-gray-500">
              共 {filteredOrders.length} 个订单
              {filteredOrders.length !== orders.length && (
                <span className="ml-1">(已过滤 {orders.length - filteredOrders.length} 个)</span>
              )}
            </div>

            {filteredOrders.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                {searchValue || statusFilter !== 'all'
                  ? '没有符合条件的采购订单'
                  : '暂无采购订单，点击上方按钮创建'}
              </div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>订单号</TableHead>
                    <TableHead>批次</TableHead>
                    <TableHead>供应商</TableHead>
                    <TableHead>下单日期</TableHead>
                    <TableHead className="text-right">订购数量</TableHead>
                    <TableHead className="text-right">已交付</TableHead>
                    <TableHead className="text-right">完成率</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((order) => (
                    <TableRow key={order.po_id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/procurement/${order.po_id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {order.po_number}
                        </Link>
                      </TableCell>
                      <TableCell>{order.batch_code}</TableCell>
                      <TableCell>{order.supplier_name || '-'}</TableCell>
                      <TableCell>
                        {order.actual_order_date
                          ? formatDate(order.actual_order_date)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {order.total_ordered}
                      </TableCell>
                      <TableCell className="text-right">
                        {order.total_delivered}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            order.fulfillment_percentage >= 100
                              ? 'text-green-600'
                              : order.fulfillment_percentage > 0
                              ? 'text-yellow-600'
                              : 'text-gray-500'
                          }
                        >
                          {order.fulfillment_percentage}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPOStatusVariant(order.po_status)}>
                          {order.po_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/procurement/${order.po_id}`}>
                            <Button variant="ghost" size="sm" title="查看详情">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/procurement/${order.po_id}/edit`}>
                            <Button variant="ghost" size="sm" title="编辑">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          <DeletePOButton
                            poId={order.po_id}
                            poNumber={order.po_number}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          />
                        </div>
                      </TableCell>
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
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
