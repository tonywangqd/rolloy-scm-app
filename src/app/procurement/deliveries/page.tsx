import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { DeliveriesTable } from '@/components/procurement/deliveries-table'
import { fetchAllDeliveries } from '@/lib/queries/procurement'
import type { ProductionDelivery } from '@/lib/types/database'
import { PackageCheck, Clock, CheckCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DeliveriesPage() {
  const deliveries = await fetchAllDeliveries()

  // Calculate summary stats
  const totalDeliveries = deliveries.length
  const completedDeliveries = deliveries.filter(
    (d: ProductionDelivery) => d.actual_delivery_date !== null
  ).length
  const pendingDeliveries = totalDeliveries - completedDeliveries
  const totalValue = deliveries.reduce((sum: number, d: ProductionDelivery) => sum + (d.total_value_usd || 0), 0)

  return (
    <div className="flex flex-col">
      <Header
        title="采购交货"
        description="管理采购交货记录"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <PackageCheck className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总交货单</p>
                  <p className="text-xl font-semibold">{totalDeliveries}</p>
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
                  <p className="text-sm text-gray-500">已完成</p>
                  <p className="text-xl font-semibold">{completedDeliveries}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <Clock className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">待完工</p>
                  <p className="text-xl font-semibold">{pendingDeliveries}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <PackageCheck className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总价值</p>
                  <p className="text-xl font-semibold">
                    ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Deliveries Table */}
        <DeliveriesTable deliveries={deliveries} />
      </div>
    </div>
  )
}
