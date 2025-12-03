import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { ProcurementTabs } from '@/components/procurement/procurement-tabs'
import { fetchPurchaseOrders, fetchAllDeliveries } from '@/lib/queries/procurement'
import { Package, Factory, CheckCircle, DollarSign } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ProcurementPage() {
  const [orders, deliveries] = await Promise.all([
    fetchPurchaseOrders(),
    fetchAllDeliveries(),
  ])

  // Calculate summary stats
  const totalOrders = orders.length
  const inProduction = orders.filter((o) => o.po_status === 'In Production').length
  const delivered = orders.filter((o) => o.po_status === 'Delivered').length

  // Calculate total procurement value from deliveries
  const totalValue = deliveries.reduce((sum, d) => sum + (d.total_value_usd || 0), 0)

  return (
    <div className="flex flex-col">
      <Header
        title="采购管理"
        description="管理采购订单和生产交付"
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
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <DollarSign className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总采购额</p>
                  <p className="text-xl font-semibold">
                    ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <ProcurementTabs orders={orders} deliveries={deliveries} />
      </div>
    </div>
  )
}
