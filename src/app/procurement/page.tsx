import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OrdersTable } from '@/components/procurement/orders-table'
import { ExportButton } from '@/components/ui/export-button'
import { fetchPurchaseOrders } from '@/lib/queries/procurement'
import { Package, Factory, CheckCircle, Clock } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ProcurementPage() {
  const orders = await fetchPurchaseOrders()

  // Calculate summary stats
  const totalOrders = orders.length
  const inProduction = orders.filter((o) => o.po_status === 'In Production').length
  const delivered = orders.filter((o) => o.po_status === 'Delivered').length
  const draftOrders = orders.filter((o) => o.po_status === 'Draft').length

  // Prepare export data
  const ordersExportData = orders.map(order => ({
    '订单号': order.po_number,
    '批次': order.batch_code,
    '供应商': order.supplier_name || '-',
    '下单日期': order.actual_order_date ? formatDate(order.actual_order_date) : '-',
    '订购数量': order.total_ordered,
    '已交付': order.total_delivered,
    '完成率': `${order.fulfillment_percentage}%`,
    '状态': order.po_status,
  }))

  return (
    <div className="flex flex-col">
      <Header
        title="采购订单"
        description="管理采购订单"
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
                  <p className="text-sm text-gray-500">总订单数</p>
                  <p className="text-xl font-semibold">{totalOrders}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-gray-100 p-2">
                  <Clock className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">草稿</p>
                  <p className="text-xl font-semibold">{draftOrders}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <Factory className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">生产中</p>
                  <p className="text-xl font-semibold">{inProduction}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">已交付</p>
                  <p className="text-xl font-semibold">{delivered}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>采购订单列表</CardTitle>
              {orders.length > 0 && (
                <ExportButton
                  data={ordersExportData}
                  filename={`采购订单_${new Date().toISOString().split('T')[0]}`}
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <OrdersTable orders={orders} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
