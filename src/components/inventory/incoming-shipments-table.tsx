'use client'

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
import { usePagination } from '@/hooks/use-pagination'
import { formatDate, formatNumber } from '@/lib/utils'

interface IncomingShipment {
  tracking_number: string
  destination_warehouse: string
  logistics_plan: string | null
  planned_arrival_date: string | null
  total_qty: number
  items: { sku: string; qty: number }[]
}

interface IncomingShipmentsTableProps {
  shipments: IncomingShipment[]
}

export function IncomingShipmentsTable({ shipments }: IncomingShipmentsTableProps) {
  const pagination = usePagination(shipments, 10)

  if (shipments.length === 0) {
    return null
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>追踪号</TableHead>
            <TableHead>目的仓库</TableHead>
            <TableHead>物流方案</TableHead>
            <TableHead>预计到达</TableHead>
            <TableHead>SKU 明细</TableHead>
            <TableHead className="text-right">总数量</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.paginatedItems.map((shipment) => (
            <TableRow key={shipment.tracking_number}>
              <TableCell className="font-medium">{shipment.tracking_number}</TableCell>
              <TableCell>{shipment.destination_warehouse}</TableCell>
              <TableCell>{shipment.logistics_plan || '-'}</TableCell>
              <TableCell>
                {shipment.planned_arrival_date
                  ? formatDate(shipment.planned_arrival_date)
                  : '-'}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {shipment.items.slice(0, 3).map((item) => (
                    <Badge key={item.sku} variant="default">
                      {item.sku}: {item.qty}
                    </Badge>
                  ))}
                  {shipment.items.length > 3 && (
                    <Badge variant="default">+{shipment.items.length - 3}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatNumber(shipment.total_qty)}
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
        pageSizeOptions={[5, 10, 20, 50]}
      />
    </>
  )
}
