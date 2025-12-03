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
import { usePagination } from '@/hooks/use-pagination'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Eye, Plus } from 'lucide-react'
import type { ProductionDelivery } from '@/lib/types/database'

interface DeliveriesTableProps {
  deliveries: ProductionDelivery[]
}

function getPaymentStatusVariant(status: string): 'default' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'Paid':
      return 'success'
    case 'Pending':
      return 'warning'
    case 'Overdue':
      return 'danger'
    default:
      return 'default'
  }
}

export function DeliveriesTable({ deliveries }: DeliveriesTableProps) {
  const [searchValue, setSearchValue] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')

  // Filter deliveries based on search and filters
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((delivery) => {
      // Search filter (delivery number, SKU, channel)
      const searchLower = searchValue.toLowerCase()
      const matchesSearch =
        searchValue === '' ||
        delivery.delivery_number.toLowerCase().includes(searchLower) ||
        delivery.sku.toLowerCase().includes(searchLower) ||
        delivery.channel_code?.toLowerCase().includes(searchLower)

      // Payment status filter
      const matchesPayment =
        paymentFilter === 'all' || delivery.payment_status === paymentFilter

      return matchesSearch && matchesPayment
    })
  }, [deliveries, searchValue, paymentFilter])

  const pagination = usePagination(filteredDeliveries, 20)

  return (
    <>
      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">
            共 {deliveries.length} 条交货记录
          </span>
        </div>
        <Link href="/procurement/deliveries/new">
          <Button variant="primary">
            <Plus className="mr-2 h-4 w-4" />
            新增交货记录
          </Button>
        </Link>
      </div>

      {/* Deliveries Table */}
      <Card>
        <CardHeader>
          <CardTitle>交货记录列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search and Filters */}
            <DataTableToolbar
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              searchPlaceholder="搜索交货单号、SKU、渠道..."
              filters={[
                {
                  key: 'payment',
                  label: '付款状态',
                  value: paymentFilter,
                  onChange: setPaymentFilter,
                  options: [
                    { value: 'all', label: '全部状态' },
                    { value: 'Pending', label: 'Pending' },
                    { value: 'Paid', label: 'Paid' },
                    { value: 'Overdue', label: 'Overdue' },
                  ],
                },
              ]}
            />

            {/* Results count */}
            <div className="text-sm text-gray-500">
              共 {filteredDeliveries.length} 条交货记录
              {filteredDeliveries.length !== deliveries.length && (
                <span className="ml-1">(已过滤 {deliveries.length - filteredDeliveries.length} 条)</span>
              )}
            </div>

            {filteredDeliveries.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                {searchValue || paymentFilter !== 'all'
                  ? '没有符合条件的交货记录'
                  : '暂无交货记录，点击上方按钮新增'}
              </div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>交货单号</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>交货日期</TableHead>
                    <TableHead className="text-right">交货数量</TableHead>
                    <TableHead className="text-right">单价 (USD)</TableHead>
                    <TableHead className="text-right">总金额 (USD)</TableHead>
                    <TableHead>付款状态</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/procurement/deliveries/${delivery.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {delivery.delivery_number}
                        </Link>
                      </TableCell>
                      <TableCell>{delivery.sku}</TableCell>
                      <TableCell>{delivery.channel_code || '-'}</TableCell>
                      <TableCell>
                        {delivery.actual_delivery_date
                          ? formatDate(delivery.actual_delivery_date)
                          : delivery.planned_delivery_date
                          ? formatDate(delivery.planned_delivery_date)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {delivery.delivered_qty.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(delivery.unit_cost_usd)}
                      </TableCell>
                      <TableCell className="text-right">
                        {delivery.total_value_usd
                          ? formatCurrency(delivery.total_value_usd)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPaymentStatusVariant(delivery.payment_status)}>
                          {delivery.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {delivery.remarks || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/procurement/deliveries/${delivery.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
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
