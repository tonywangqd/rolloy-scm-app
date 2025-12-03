'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableToolbar } from '@/components/ui/data-table-toolbar'
import { formatDate, formatCurrencyCNY, getWarehouseTypeVariant } from '@/lib/utils'
import { PaymentStatusToggle } from '@/components/logistics/payment-status-toggle'
import { ArrivalConfirmButton } from '@/components/logistics/arrival-confirm-button'
import { DeleteShipmentButton } from '@/components/logistics/delete-shipment-button'
import { Eye, Pencil } from 'lucide-react'
import type { Shipment, WarehouseType } from '@/lib/types/database'

interface LogisticsTableProps {
  shipments: (Shipment & {
    warehouse_name?: string
    warehouse_code?: string
    warehouse_type?: WarehouseType
    item_count?: number
  })[]
}

export function LogisticsTable({ shipments }: LogisticsTableProps) {
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [warehouseFilter, setWarehouseFilter] = useState('all')

  // Filter shipments based on search and filters
  const filteredShipments = useMemo(() => {
    return shipments.filter((shipment) => {
      // Search filter (tracking number, batch code, warehouse)
      const searchLower = searchValue.toLowerCase()
      const matchesSearch =
        searchValue === '' ||
        shipment.tracking_number.toLowerCase().includes(searchLower) ||
        shipment.batch_code?.toLowerCase().includes(searchLower) ||
        shipment.warehouse_code?.toLowerCase().includes(searchLower) ||
        shipment.warehouse_name?.toLowerCase().includes(searchLower)

      // Status filter
      let matchesStatus = true
      if (statusFilter === 'in-transit') {
        matchesStatus = !!shipment.actual_departure_date && !shipment.actual_arrival_date
      } else if (statusFilter === 'delivered') {
        matchesStatus = !!shipment.actual_arrival_date
      } else if (statusFilter === 'pending') {
        matchesStatus = !shipment.actual_departure_date
      }

      // Warehouse type filter
      const matchesWarehouse =
        warehouseFilter === 'all' ||
        (warehouseFilter === 'FBA' &&
          (shipment.warehouse_type === 'FBA' || shipment.warehouse_code?.startsWith('FBA'))) ||
        (warehouseFilter === '3PL' &&
          (shipment.warehouse_type === '3PL' || !shipment.warehouse_code?.startsWith('FBA')))

      return matchesSearch && matchesStatus && matchesWarehouse
    })
  }, [shipments, searchValue, statusFilter, warehouseFilter])


  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <DataTableToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="搜索追踪号、批次、仓库..."
        filters={[
          {
            key: 'status',
            label: '状态',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'all', label: '全部状态' },
              { value: 'pending', label: '待发运' },
              { value: 'in-transit', label: '运输中' },
              { value: 'delivered', label: '已到货' },
            ],
          },
          {
            key: 'warehouse',
            label: '仓库类型',
            value: warehouseFilter,
            onChange: setWarehouseFilter,
            options: [
              { value: 'all', label: '全部仓库' },
              { value: 'FBA', label: 'FBA仓' },
              { value: '3PL', label: '海外仓' },
            ],
          },
        ]}
      />

      {/* Results count */}
      <div className="text-sm text-gray-500">
        共 {filteredShipments.length} 个发运单
        {filteredShipments.length !== shipments.length && (
          <span className="ml-1">(已过滤 {shipments.length - filteredShipments.length} 个)</span>
        )}
      </div>

      {/* Table */}
      {filteredShipments.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-gray-500">
          {searchValue || statusFilter !== 'all' || warehouseFilter !== 'all'
            ? '没有符合条件的发运单'
            : '暂无发运单，点击上方按钮创建'}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>追踪号</TableHead>
              <TableHead>批次</TableHead>
              <TableHead>仓库类型</TableHead>
              <TableHead>仓库代号</TableHead>
              <TableHead>物流方案</TableHead>
              <TableHead>开船日期</TableHead>
              <TableHead>到货日期</TableHead>
              <TableHead className="text-right">数量</TableHead>
              <TableHead className="text-right">运费(CNY)</TableHead>
              <TableHead>付款状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredShipments.map((shipment) => (
              <TableRow key={shipment.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/logistics/${shipment.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {shipment.tracking_number}
                  </Link>
                </TableCell>
                <TableCell>{shipment.batch_code || '-'}</TableCell>
                <TableCell>
                  {shipment.warehouse_code ? (
                    <Badge variant={getWarehouseTypeVariant(shipment.warehouse_code.startsWith('FBA') ? 'FBA' : '3PL')}>
                      {shipment.warehouse_code.startsWith('FBA') ? 'FBA仓' : '海外仓'}
                    </Badge>
                  ) : shipment.warehouse_type ? (
                    <Badge variant={getWarehouseTypeVariant(shipment.warehouse_type)}>
                      {shipment.warehouse_type === 'FBA' ? 'FBA仓' : '海外仓'}
                    </Badge>
                  ) : '-'}
                </TableCell>
                <TableCell className="font-mono">
                  {shipment.warehouse_code || '-'}
                </TableCell>
                <TableCell>
                  {shipment.logistics_plan || '-'}
                  {shipment.logistics_region && (
                    <span className="ml-1 text-gray-500">
                      ({shipment.logistics_region})
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {shipment.actual_departure_date ? (
                    formatDate(shipment.actual_departure_date)
                  ) : shipment.planned_departure_date ? (
                    <span>
                      {formatDate(shipment.planned_departure_date)}
                      <span className="ml-1 text-xs text-orange-500">预计</span>
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  {shipment.actual_arrival_date ? (
                    <div className="flex flex-col">
                      <span className="text-green-600 font-medium">
                        {formatDate(shipment.actual_arrival_date)}
                      </span>
                      <span className="text-xs text-gray-500">已到货</span>
                    </div>
                  ) : shipment.actual_departure_date ? (
                    <div className="space-y-1">
                      {shipment.planned_arrival_date && (
                        <div className="text-sm">
                          {formatDate(shipment.planned_arrival_date)}
                          <span className="ml-1 text-xs text-orange-500">预计</span>
                        </div>
                      )}
                      <ArrivalConfirmButton
                        shipmentId={shipment.id}
                        trackingNumber={shipment.tracking_number}
                        warehouseName={shipment.warehouse_name}
                        warehouseCode={shipment.warehouse_code}
                      />
                    </div>
                  ) : shipment.planned_arrival_date ? (
                    <span>
                      {formatDate(shipment.planned_arrival_date)}
                      <span className="ml-1 text-xs text-orange-500">预计</span>
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {shipment.item_count || 0}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrencyCNY(shipment.total_cost_usd || 0)}
                </TableCell>
                <TableCell>
                  <PaymentStatusToggle
                    shipmentId={shipment.id}
                    currentStatus={shipment.payment_status}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/logistics/${shipment.id}`}>
                      <Button variant="ghost" size="sm" title="查看详情">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href={`/logistics/${shipment.id}/edit`}>
                      <Button variant="ghost" size="sm" title="编辑">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <DeleteShipmentButton
                      shipmentId={shipment.id}
                      trackingNumber={shipment.tracking_number}
                      hasArrived={!!shipment.actual_arrival_date}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
