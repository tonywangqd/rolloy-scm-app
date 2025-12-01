import Link from 'next/link'
import { Header } from '@/components/layout/header'
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
import { fetchShipments } from '@/lib/queries/logistics'
import { formatDate, formatCurrencyCNY, getWarehouseTypeVariant } from '@/lib/utils'
import { PaymentStatusToggle } from '@/components/logistics/payment-status-toggle'
import { Plus, Eye, Truck, Package } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LogisticsPage() {
  const shipments = await fetchShipments()

  // Calculate summary stats
  const inTransit = shipments.filter(
    (s) => s.actual_departure_date && !s.actual_arrival_date
  ).length
  const delivered = shipments.filter((s) => s.actual_arrival_date).length
  const totalCost = shipments.reduce((sum, s) => sum + (s.total_cost_usd || 0), 0)

  return (
    <div className="flex flex-col">
      <Header
        title="物流管理"
        description="管理发运和物流成本"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总发运单</p>
                  <p className="text-xl font-semibold">{shipments.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <Truck className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">运输中</p>
                  <p className="text-xl font-semibold">{inTransit}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">已到货</p>
                  <p className="text-xl font-semibold">{delivered}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Package className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总运费</p>
                  <p className="text-xl font-semibold">{formatCurrencyCNY(totalCost)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              共 {shipments.length} 个发运单
            </span>
          </div>
          <Link href="/logistics/new">
            <Button variant="primary">
              <Plus className="mr-2 h-4 w-4" />
              创建发运单
            </Button>
          </Link>
        </div>

        {/* Shipments Table */}
        <Card>
          <CardHeader>
            <CardTitle>发运单列表</CardTitle>
          </CardHeader>
          <CardContent>
            {shipments.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无发运单，点击上方按钮创建
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
                  {shipments.map((shipment) => (
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
                          <span className="text-green-600">
                            {formatDate(shipment.actual_arrival_date)}
                          </span>
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
                        <Link href={`/logistics/${shipment.id}`}>
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
      </div>
    </div>
  )
}
