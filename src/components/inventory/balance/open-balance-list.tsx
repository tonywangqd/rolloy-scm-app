'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Settings2, AlertTriangle, Clock, CheckCircle } from 'lucide-react'

interface BalanceResolution {
  id: string
  sku: string
  productName: string
  sourceType: 'po_item' | 'delivery' | 'shipment_item'
  plannedQty: number
  actualQty: number
  varianceQty: number
  openBalance: number
  status: 'pending' | 'deferred' | 'short_closed' | 'fulfilled'
  createdAt: string
}

interface OpenBalanceListProps {
  balances: BalanceResolution[]
  onResolve: (balance: BalanceResolution) => void
}

const getSourceTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    po_item: '采购订单 PO',
    delivery: '工厂交付 Delivery',
    shipment_item: '物流发运 Shipment',
  }
  return labels[type] || type
}

const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: 'default' | 'success' | 'warning' | 'danger'; label: string; icon: React.ReactNode }> = {
    pending: {
      variant: 'warning',
      label: '待处理 Pending',
      icon: <AlertTriangle className="mr-1 h-3 w-3" />,
    },
    deferred: {
      variant: 'default',
      label: '已顺延 Deferred',
      icon: <Clock className="mr-1 h-3 w-3" />,
    },
    short_closed: {
      variant: 'danger',
      label: '已关闭 Closed',
      icon: null,
    },
    fulfilled: {
      variant: 'success',
      label: '已完成 Fulfilled',
      icon: <CheckCircle className="mr-1 h-3 w-3" />,
    },
  }
  const config = variants[status] || variants.pending
  return (
    <Badge variant={config.variant} className="flex w-fit items-center">
      {config.icon}
      {config.label}
    </Badge>
  )
}

export function OpenBalanceList({ balances, onResolve }: OpenBalanceListProps) {
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  // Filter balances
  const filteredBalances = useMemo(() => {
    return balances.filter((balance) => {
      // Search filter
      const searchLower = searchValue.toLowerCase()
      const matchesSearch =
        searchValue === '' ||
        balance.sku.toLowerCase().includes(searchLower) ||
        balance.productName.toLowerCase().includes(searchLower)

      // Status filter
      const matchesStatus =
        statusFilter === 'all' || balance.status === statusFilter

      // Type filter
      const matchesType =
        typeFilter === 'all' || balance.sourceType === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [balances, searchValue, statusFilter, typeFilter])

  const pagination = usePagination(filteredBalances, 20)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>未结余额列表 Open Balance List</span>
          <span className="text-sm font-normal text-gray-500">
            共 {filteredBalances.length} 条记录
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Toolbar */}
          <DataTableToolbar
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="搜索 SKU 或产品名称... | Search SKU or product..."
            filters={[
              {
                key: 'status',
                label: '状态',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { value: 'all', label: '全部状态 All' },
                  { value: 'pending', label: '待处理 Pending' },
                  { value: 'deferred', label: '已顺延 Deferred' },
                ],
              },
              {
                key: 'type',
                label: '来源',
                value: typeFilter,
                onChange: setTypeFilter,
                options: [
                  { value: 'all', label: '全部来源 All' },
                  { value: 'po_item', label: '采购订单 PO' },
                  { value: 'delivery', label: '工厂交付 Delivery' },
                  { value: 'shipment_item', label: '物流发运 Shipment' },
                ],
              },
            ]}
          />

          {/* Results */}
          {filteredBalances.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-500">
              {searchValue || statusFilter !== 'all' || typeFilter !== 'all'
                ? '没有符合条件的余额记录'
                : '暂无未结余额'}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>来源类型</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>产品名称</TableHead>
                    <TableHead className="text-right">预计量</TableHead>
                    <TableHead className="text-right">实际量</TableHead>
                    <TableHead className="text-right">差额</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((balance) => (
                    <TableRow key={balance.id}>
                      <TableCell>
                        <span className="text-sm">
                          {getSourceTypeLabel(balance.sourceType)}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {balance.sku}
                      </TableCell>
                      <TableCell>{balance.productName}</TableCell>
                      <TableCell className="text-right">
                        {balance.plannedQty}
                      </TableCell>
                      <TableCell className="text-right">
                        {balance.actualQty}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold text-red-600">
                          {balance.openBalance}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(balance.status)}</TableCell>
                      <TableCell className="text-right">
                        {(balance.status === 'pending' ||
                          balance.status === 'deferred') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onResolve(balance)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Settings2 className="mr-1 h-4 w-4" />
                            处理 Handle
                          </Button>
                        )}
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
  )
}
