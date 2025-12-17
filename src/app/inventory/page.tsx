import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchInventoryStats,
  fetchInventorySummaryBySku,
  fetchInventoryByWarehouse,
  fetchIncomingInventory,
} from '@/lib/queries/inventory'
import { fetchInventoryProjection12Weeks, fetchRiskSummary } from '@/lib/queries/inventory-projection'
import { formatNumber } from '@/lib/utils'
import { Package, Warehouse, Truck, BoxIcon, AlertTriangle } from 'lucide-react'
import { InventoryByWarehouse } from '@/components/inventory/inventory-by-warehouse'
import { SkuSummaryTable } from '@/components/inventory/sku-summary-table'
import { IncomingShipmentsTable } from '@/components/inventory/incoming-shipments-table'
import { InventoryProjectionChart } from '@/components/inventory/inventory-projection-chart'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const [stats, skuSummary, warehouseInventory, incoming, projections, riskSummary] = await Promise.all([
    fetchInventoryStats(),
    fetchInventorySummaryBySku(),
    fetchInventoryByWarehouse(),
    fetchIncomingInventory(),
    fetchInventoryProjection12Weeks(),
    fetchRiskSummary(),
  ])

  return (
    <div className="flex flex-col">
      <Header
        title="库存管理"
        description="库存查看和管理"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总库存</p>
                  <p className="text-xl font-semibold">{formatNumber(stats.total_stock)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <BoxIcon className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">FBA 库存</p>
                  <p className="text-xl font-semibold">{formatNumber(stats.total_fba)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Warehouse className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">3PL 库存</p>
                  <p className="text-xl font-semibold">{formatNumber(stats.total_3pl)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-yellow-100 p-2">
                  <Truck className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">在途数量</p>
                  <p className="text-xl font-semibold">
                    {formatNumber(incoming.reduce((sum, i) => sum + i.total_qty, 0))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-red-100 p-2">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">断货风险</p>
                  <p className="text-xl font-semibold text-red-600">
                    {riskSummary.stockout_count + riskSummary.risk_count}
                  </p>
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
                  <p className="text-sm text-gray-500">SKU 数</p>
                  <p className="text-xl font-semibold">{stats.sku_count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 12-Week Inventory Projection Chart */}
        <InventoryProjectionChart projections={projections} />

        {/* Incoming Shipments */}
        {incoming.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                在途货物
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IncomingShipmentsTable shipments={incoming} />
            </CardContent>
          </Card>
        )}

        {/* Inventory by SKU */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              按 SKU 汇总
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SkuSummaryTable items={skuSummary} />
          </CardContent>
        </Card>

        {/* Inventory by Warehouse */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5" />
              按仓库明细
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InventoryByWarehouse warehouseInventory={warehouseInventory} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
