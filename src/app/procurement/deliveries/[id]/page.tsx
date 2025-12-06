import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { fetchDeliveryForEdit } from '@/lib/queries/procurement'
import { ArrowLeft, Edit, Truck, Package, Calendar, DollarSign, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency } from '@/lib/utils'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function DeliveryDetailPage({ params }: PageProps) {
  const resolvedParams = await params
  const { data, error } = await fetchDeliveryForEdit(resolvedParams.id)

  if (error || !data) {
    notFound()
  }

  const { delivery, po, po_item } = data

  const paymentStatusColors = {
    Pending: 'warning',
    Scheduled: 'default',
    Paid: 'success',
  } as const

  return (
    <>
      <Header
        title="交货记录详情"
        description={`Delivery Detail - ${delivery.delivery_number}`}
      />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Breadcrumb */}
          <Link
            href={`/procurement/${po.id}`}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回订单详情 Back to PO
          </Link>

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-gray-900">
                交货记录详情 Delivery Detail
              </h1>
              <p className="text-sm text-gray-600">
                {delivery.delivery_number}
              </p>
            </div>
            <Link href={`/procurement/deliveries/${delivery.id}/edit`}>
              <Button variant="primary">
                <Edit className="mr-2 h-4 w-4" />
                编辑 Edit
              </Button>
            </Link>
          </div>

          {/* Basic Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                基本信息 Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-gray-500">交货单号 Delivery Number</label>
                <p className="font-medium">{delivery.delivery_number}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">采购订单 PO Number</label>
                <p className="font-medium">
                  <Link href={`/procurement/${po.id}`} className="text-blue-600 hover:underline">
                    {po.po_number}
                  </Link>
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500">批次号 Batch Code</label>
                <p className="font-medium">{po.batch_code || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">付款状态 Payment Status</label>
                <div className="mt-1">
                  <Badge variant={paymentStatusColors[delivery.payment_status as keyof typeof paymentStatusColors]}>
                    {delivery.payment_status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                产品信息 Product Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-gray-500">SKU</label>
                <p className="font-medium">{delivery.sku}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">渠道 Channel</label>
                <p className="font-medium">{delivery.channel_code || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">订单数量 Ordered Qty</label>
                <p className="font-medium">{po_item.ordered_qty}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">本次交货数量 Delivered Qty</label>
                <p className="font-medium text-green-600">{delivery.delivered_qty}</p>
              </div>
            </CardContent>
          </Card>

          {/* Date Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                日期信息 Date Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-gray-500">计划交货日期 Planned Delivery Date</label>
                <p className="font-medium">
                  {delivery.planned_delivery_date
                    ? formatDate(delivery.planned_delivery_date)
                    : 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500">实际交货日期 Actual Delivery Date</label>
                <p className="font-medium">
                  {delivery.actual_delivery_date
                    ? formatDate(delivery.actual_delivery_date)
                    : 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500">付款到期日 Payment Due Date</label>
                <p className="font-medium">
                  {delivery.payment_due_date
                    ? formatDate(delivery.payment_due_date)
                    : 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500">创建时间 Created At</label>
                <p className="font-medium">
                  {delivery.created_at
                    ? formatDate(delivery.created_at)
                    : 'N/A'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Cost Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                费用信息 Cost Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-gray-500">单价 Unit Cost (USD)</label>
                <p className="font-medium">{formatCurrency(delivery.unit_cost_usd)}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">总金额 Total Value (USD)</label>
                <p className="font-medium text-blue-600">
                  {formatCurrency(delivery.unit_cost_usd * delivery.delivered_qty)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Remarks Card */}
          {delivery.remarks && (
            <Card>
              <CardHeader>
                <CardTitle>备注 Remarks</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{delivery.remarks}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
