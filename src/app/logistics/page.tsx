import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchShipments, fetchRemainingShipmentSummary } from '@/lib/queries/logistics'
import { Plus, Package, Truck } from 'lucide-react'
import { LogisticsTable } from '@/components/logistics/logistics-table'
import { RemainingShipmentSummary } from '@/components/logistics/remaining-shipment-summary'

export const dynamic = 'force-dynamic'

export default async function LogisticsPage() {
  const [shipments, remainingSummary] = await Promise.all([
    fetchShipments(),
    fetchRemainingShipmentSummary(),
  ])

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
                  <p className="text-xl font-semibold">
                    ¥{(totalCost * 7.2).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Remaining Shipment Summary */}
        <RemainingShipmentSummary summary={remainingSummary} />

        {/* Shipments Table with Search/Filter */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>发运单列表</CardTitle>
              <Link href="/logistics/new">
                <Button variant="primary">
                  <Plus className="mr-2 h-4 w-4" />
                  创建发运单
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <LogisticsTable shipments={shipments} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
