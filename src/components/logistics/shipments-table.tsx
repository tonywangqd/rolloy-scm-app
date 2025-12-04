'use client'

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
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { usePagination } from '@/lib/hooks/use-pagination'
import { formatDate, formatCurrencyCNY, getWarehouseTypeVariant } from '@/lib/utils'
import { PaymentStatusToggle } from '@/components/logistics/payment-status-toggle'
import { ArrivalConfirmButton } from '@/components/logistics/arrival-confirm-button'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import type { PaymentStatus } from '@/lib/types/database'

interface ShipmentWithDetails {
  id: string
  tracking_number: string
  batch_code: string | null
  warehouse_code: string | null
  warehouse_type: string | null
  warehouse_name: string | null
  logistics_plan: string | null
  logistics_region: string | null
  planned_departure_date: string | null
  actual_departure_date: string | null
  planned_arrival_date: string | null
  actual_arrival_date: string | null
  item_count: number
  total_cost_usd: number | null
  payment_status: PaymentStatus
}

interface ShipmentsTableProps {
  shipments: ShipmentWithDetails[]
}

export function ShipmentsTable({ shipments }: ShipmentsTableProps) {
  const pagination = usePagination(shipments, 20)

  if (shipments.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-gray-500">
        暂无发运单，点击上方按钮创建
      </div>
    )
  }

  return (
    <>
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
          {pagination.paginatedItems.map((shipment) => (
            <TableRow key={shipment.id}>
              <TableCell className="font-medium">
                {shipment.tracking_number}
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
                      warehouseName={shipment.warehouse_name || undefined}
                      warehouseCode={shipment.warehouse_code || undefined}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
  )
}
