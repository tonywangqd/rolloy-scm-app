'use client'

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
import { formatDate, getPOStatusVariant } from '@/lib/utils'
import { Plus, Eye } from 'lucide-react'
import type { POFulfillmentView } from '@/lib/types/database'

interface OrdersTableProps {
  orders: POFulfillmentView[]
}

export function OrdersTable({ orders }: OrdersTableProps) {
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
          {orders.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-500">
              暂无采购订单，点击上方按钮创建
            </div>
          ) : (
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
                {orders.map((order) => (
                  <TableRow key={order.po_id}>
                    <TableCell className="font-medium">
                      {order.po_number}
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
                      <Link href={`/procurement/${order.po_id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
