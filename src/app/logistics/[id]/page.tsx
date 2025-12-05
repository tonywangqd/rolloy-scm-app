import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchShipmentById, fetchWarehouses } from '@/lib/queries/logistics'
import { ArrowLeft, Edit } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Warehouse } from '@/lib/types/database'

interface ShipmentDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function ShipmentDetailPage({ params }: ShipmentDetailPageProps) {
  const resolvedParams = await params
  const { shipment, items } = await fetchShipmentById(resolvedParams.id)

  if (!shipment) {
    notFound()
  }

  // Fetch warehouse details
  const warehouses = await fetchWarehouses()
  const warehouse = warehouses.find((w) => w.id === shipment.destination_warehouse_id)

  // Calculate costs
  const freightCost = (shipment.weight_kg || 0) * (shipment.cost_per_kg_usd || 0)
  const totalCost = freightCost + (shipment.surcharge_usd || 0) - (shipment.tax_refund_usd || 0)

  // Status badge variant
  const getStatusVariant = (date: string | null) => {
    if (!date) return 'secondary'
    return 'default'
  }

  // Format date as YYYY/MM/DD
  const formatDate = (date: string | null) => {
    if (!date) return '-'
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}/${month}/${day}`
  }

  return (
    <div className="flex flex-col">
      <Header title="发运单详情 Shipment Detail" description="查看物流发运记录详细信息" />

      <div className="flex-1 p-6">
        <div className="space-y-6">
          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <Link href="/logistics">
              <Button variant="ghost">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回列表 Back
              </Button>
            </Link>
            <Link href={`/logistics/${resolvedParams.id}/edit`}>
              <Button variant="primary">
                <Edit className="mr-2 h-4 w-4" />
                编辑 Edit
              </Button>
            </Link>
          </div>

          {/* Shipment Header Info */}
          <Card>
            <CardHeader>
              <CardTitle>发运基本信息 Shipment Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-gray-500">运单号 Tracking Number</p>
                  <p className="mt-1 text-lg font-semibold">{shipment.tracking_number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">目的仓库 Destination Warehouse</p>
                  <p className="mt-1 text-lg font-semibold">
                    {warehouse ? `${warehouse.warehouse_code} - ${warehouse.warehouse_name}` : '-'}
                  </p>
                  {warehouse && (
                    <Badge variant="default" className="mt-1">
                      {warehouse.warehouse_type}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">物流方案 Logistics Plan</p>
                  <p className="mt-1 text-lg">{shipment.logistics_plan || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">区域 Region</p>
                  <p className="mt-1 text-lg">
                    {shipment.logistics_region
                      ? shipment.logistics_region === 'East'
                        ? '东部 East'
                        : shipment.logistics_region === 'Central'
                        ? '中部 Central'
                        : '西部 West'
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">清关 Customs Clearance</p>
                  <Badge variant={shipment.customs_clearance ? 'warning' : 'default'} className="mt-1">
                    {shipment.customs_clearance ? '需要清关 Yes' : '无需清关 No'}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">批次号 Batch Code</p>
                  <p className="mt-1 text-lg">{shipment.batch_code || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline / Dates */}
          <Card>
            <CardHeader>
              <CardTitle>时间节点 Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">预计开船日期 Planned Departure</p>
                  <p className="mt-1 text-lg">{formatDate(shipment.planned_departure_date)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">实际开船日期 Actual Departure</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatDate(shipment.actual_departure_date)}
                  </p>
                  {shipment.actual_departure_date && (
                    <Badge variant="default" className="mt-1">
                      已发货 Shipped
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">预计到达日期 Planned Arrival</p>
                  <p className="mt-1 text-lg">{formatDate(shipment.planned_arrival_date)}</p>
                  {shipment.planned_arrival_days && (
                    <p className="mt-1 text-sm text-gray-500">
                      ({shipment.planned_arrival_days} 天 days)
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">实际到达日期 Actual Arrival</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatDate(shipment.actual_arrival_date)}
                  </p>
                  {shipment.actual_arrival_date && (
                    <Badge variant="default" className="mt-1">
                      已签收 Received
                    </Badge>
                  )}
                  {shipment.actual_transit_days && (
                    <p className="mt-1 text-sm text-gray-500">
                      实际用时 {shipment.actual_transit_days} 天
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost Details */}
          <Card>
            <CardHeader>
              <CardTitle>费用明细 Cost Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-sm font-medium text-gray-500">计费重量 Weight (Kg)</p>
                  <p className="mt-1 text-lg font-semibold">{shipment.weight_kg || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">公斤单价 Price/Kg (CNY)</p>
                  <p className="mt-1 text-lg">
                    {shipment.cost_per_kg_usd ? `¥${shipment.cost_per_kg_usd.toFixed(2)}` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">运费 Freight Cost (CNY)</p>
                  <p className="mt-1 text-lg font-semibold text-blue-600">
                    ¥{freightCost.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">杂费/退税 Surcharge/Refund</p>
                  <p className="mt-1 text-lg">
                    <span className="text-red-600">+¥{(shipment.surcharge_usd || 0).toFixed(2)}</span>
                    {' / '}
                    <span className="text-green-600">-¥{(shipment.tax_refund_usd || 0).toFixed(2)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">总费用 Total Cost (CNY)</p>
                  <p className="mt-1 text-2xl font-bold text-green-600">
                    ¥{totalCost.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-lg bg-blue-50 p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">付款状态 Payment Status</p>
                    <Badge
                      variant={
                        shipment.payment_status === 'Paid'
                          ? 'success'
                          : shipment.payment_status === 'Scheduled'
                          ? 'default'
                          : 'warning'
                      }
                      className="mt-1"
                    >
                      {shipment.payment_status === 'Paid'
                        ? '已付款 Paid'
                        : shipment.payment_status === 'Scheduled'
                        ? '已排期 Scheduled'
                        : '待付款 Pending'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">付款到期日 Payment Due Date</p>
                    <p className="mt-1">{formatDate(shipment.payment_due_date)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">付款月份 Payment Month</p>
                    <p className="mt-1">{shipment.payment_month || '-'}</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-gray-500">
                注：付款到期日为到港后30天。费用以人民币（CNY）计价，数据库字段保持原有格式。
              </p>
            </CardContent>
          </Card>

          {/* Shipment Items Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>货物明细 Shipment Items</CardTitle>
                <div className="text-sm text-gray-500">
                  总数量 Total: {items.reduce((sum, item) => sum + item.shipped_qty, 0)} 件
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <p>暂无货物明细</p>
                  <p className="text-sm">No shipment items</p>
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">发货数量 Shipped Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-gray-500">{index + 1}</TableCell>
                          <TableCell className="font-mono font-semibold">{item.sku}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {item.shipped_qty}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-50 font-semibold">
                        <TableCell colSpan={2} className="text-right">
                          合计 Total
                        </TableCell>
                        <TableCell className="text-right text-lg text-blue-600">
                          {items.reduce((sum, item) => sum + item.shipped_qty, 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Remarks */}
          {shipment.remarks && (
            <Card>
              <CardHeader>
                <CardTitle>备注 Remarks</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-gray-700">{shipment.remarks}</p>
              </CardContent>
            </Card>
          )}

          {/* Source Purchase Order Info (if linked) */}
          {shipment.production_delivery_id && (
            <Card>
              <CardHeader>
                <CardTitle>关联信息 Related Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-gray-500">生产交货记录 Production Delivery ID</p>
                    <p className="mt-1 font-mono text-sm">{shipment.production_delivery_id}</p>
                  </div>
                  {shipment.logistics_batch_code && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">物流批次号 Logistics Batch Code</p>
                      <p className="mt-1 font-mono">{shipment.logistics_batch_code}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-gray-400">创建时间 Created At</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {new Date(shipment.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400">更新时间 Updated At</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {new Date(shipment.updated_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                {shipment.arrival_week_iso && (
                  <div>
                    <p className="text-xs font-medium text-gray-400">到达周 Arrival Week (ISO)</p>
                    <p className="mt-1 text-sm text-gray-600">{shipment.arrival_week_iso}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bottom Actions */}
          <div className="flex justify-between border-t pt-6">
            <Link href="/logistics">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回列表 Back to List
              </Button>
            </Link>
            <Link href={`/logistics/${resolvedParams.id}/edit`}>
              <Button variant="primary">
                <Edit className="mr-2 h-4 w-4" />
                编辑发运单 Edit Shipment
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
