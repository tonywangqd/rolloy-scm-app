import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Edit, Package, FileText } from 'lucide-react'
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
import { fetchPurchaseOrderDetails } from '@/lib/queries/procurement'
import type { POStatus, PaymentStatus } from '@/lib/types/database'
import { DeleteDeliveryButton } from '@/components/procurement/delete-delivery-button'

export const dynamic = 'force-dynamic'

interface PurchaseOrderDetailPageProps {
  params: Promise<{ id: string }>
}

// Status badge helper
function getStatusBadge(status: POStatus) {
  const variants: Record<POStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }> = {
    Draft: { label: '草稿', variant: 'default' },
    Confirmed: { label: '已确认', variant: 'default' },
    'In Production': { label: '生产中', variant: 'warning' },
    Delivered: { label: '已交付', variant: 'success' },
    Cancelled: { label: '已取消', variant: 'danger' },
  }

  const config = variants[status]
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  )
}

// Payment status badge helper
function getPaymentStatusBadge(status: PaymentStatus) {
  const variants: Record<PaymentStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }> = {
    Pending: { label: '待支付', variant: 'warning' },
    Scheduled: { label: '已排期', variant: 'default' },
    Paid: { label: '已支付', variant: 'success' },
  }

  const config = variants[status]
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  )
}

// Format date as YYYY/MM/DD
function formatDate(dateString: string | null) {
  if (!dateString) return '-'
  const d = new Date(dateString)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

export default async function PurchaseOrderDetailPage({
  params,
}: PurchaseOrderDetailPageProps) {
  const resolvedParams = await params
  const { order, supplier, items, deliveries } = await fetchPurchaseOrderDetails(
    resolvedParams.id
  )

  if (!order) {
    notFound()
  }

  // Calculate totals
  const totalOrderedQty = items.reduce((sum, item) => sum + item.ordered_qty, 0)
  const totalDeliveredQty = items.reduce((sum, item) => sum + item.delivered_qty, 0)
  const totalOrderValue = items.reduce(
    (sum, item) => sum + item.ordered_qty * item.unit_price_usd,
    0
  )
  const fulfillmentPercentage =
    totalOrderedQty > 0 ? (totalDeliveredQty / totalOrderedQty) * 100 : 0

  return (
    <div className="flex flex-col">
      <Header
        title={`采购订单详情 - ${order.po_number}`}
        description="Purchase Order Details"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Back & Edit Actions */}
        <div className="flex items-center justify-between">
          <Link href="/procurement">
            <Button variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回列表
            </Button>
          </Link>
          <Link href={`/procurement/${resolvedParams.id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              编辑订单
            </Button>
          </Link>
        </div>

        {/* Order Header Information */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                订单信息 / Order Information
              </CardTitle>
              {getStatusBadge(order.po_status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-gray-500">采购订单号 / PO Number</p>
                <p className="mt-1 text-lg font-semibold">{order.po_number}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">批次号 / Batch Code</p>
                <p className="mt-1 text-lg font-semibold">{order.batch_code}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">供应商 / Supplier</p>
                <p className="mt-1 text-lg font-semibold">
                  {supplier ? supplier.supplier_name : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">预计下单日期 / Planned Order Date</p>
                <p className="mt-1 text-base">{formatDate(order.planned_order_date)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">实际下单日期 / Actual Order Date</p>
                <p className="mt-1 text-base">{formatDate(order.actual_order_date)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">预计发货日期 / Planned Ship Date</p>
                <p className="mt-1 text-base">{formatDate(order.planned_ship_date)}</p>
              </div>
            </div>

            {order.remarks && (
              <div className="mt-6 border-t pt-4">
                <p className="text-sm font-medium text-gray-500">备注 / Remarks</p>
                <p className="mt-1 text-sm text-gray-700">{order.remarks}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Summary Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">总订购数量</p>
                <p className="mt-2 text-3xl font-bold text-blue-600">{totalOrderedQty}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">已交付数量</p>
                <p className="mt-2 text-3xl font-bold text-green-600">{totalDeliveredQty}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">履约率</p>
                <p className="mt-2 text-3xl font-bold text-purple-600">
                  {fulfillmentPercentage.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">订单金额</p>
                <p className="mt-2 text-3xl font-bold text-orange-600">
                  ${totalOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order Items Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              订单明细 / Order Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>渠道 / Channel</TableHead>
                  <TableHead className="text-right">订购数量 / Ordered</TableHead>
                  <TableHead className="text-right">已交付 / Delivered</TableHead>
                  <TableHead className="text-right">未交付 / Remaining</TableHead>
                  <TableHead className="text-right">单价 (USD)</TableHead>
                  <TableHead className="text-right">金额 (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500">
                      暂无订单明细
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const remaining = item.ordered_qty - item.delivered_qty
                    const itemTotal = item.ordered_qty * item.unit_price_usd
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono font-medium">{item.sku}</TableCell>
                        <TableCell>{item.channel_code || '-'}</TableCell>
                        <TableCell className="text-right">{item.ordered_qty}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {item.delivered_qty}
                        </TableCell>
                        <TableCell className="text-right">
                          {remaining > 0 ? (
                            <span className="font-semibold text-orange-600">{remaining}</span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          ${item.unit_price_usd.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${itemTotal.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Delivery Records */}
        <Card>
          <CardHeader>
            <CardTitle>交付记录 / Delivery Records ({deliveries.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <p className="text-center text-sm text-gray-500">暂无交付记录</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>交付单号 / Delivery No.</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead className="text-right">交付数量</TableHead>
                    <TableHead className="text-right">单价 (USD)</TableHead>
                    <TableHead className="text-right">金额 (USD)</TableHead>
                    <TableHead>交付日期</TableHead>
                    <TableHead>付款截止日</TableHead>
                    <TableHead>付款状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow key={delivery.delivery_id}>
                      <TableCell className="font-mono">{delivery.delivery_number}</TableCell>
                      <TableCell className="font-mono font-medium">{delivery.sku}</TableCell>
                      <TableCell>{delivery.channel_code || '-'}</TableCell>
                      <TableCell className="text-right">{delivery.delivered_qty}</TableCell>
                      <TableCell className="text-right">
                        ${delivery.unit_cost_usd.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${delivery.total_value_usd?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell>{formatDate(delivery.actual_delivery_date)}</TableCell>
                      <TableCell>{formatDate(delivery.payment_due_date)}</TableCell>
                      <TableCell>{getPaymentStatusBadge(delivery.payment_status)}</TableCell>
                      <TableCell className="text-right">
                        <DeleteDeliveryButton
                          deliveryId={delivery.delivery_id}
                          deliveryNumber={delivery.delivery_number}
                          paymentStatus={delivery.payment_status}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Supplier Information (if available) */}
        {supplier && (
          <Card>
            <CardHeader>
              <CardTitle>供应商信息 / Supplier Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-gray-500">供应商代码</p>
                  <p className="mt-1 text-base">{supplier.supplier_code}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">付款账期 (天)</p>
                  <p className="mt-1 text-base">{supplier.payment_terms_days}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
