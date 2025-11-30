import { Header } from '@/components/layout/header'
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
import {
  fetchInventoryStats,
  fetchInventorySummaryBySku,
  fetchInventoryByWarehouse,
  fetchIncomingInventory,
} from '@/lib/queries/inventory'
import { formatNumber, formatDate } from '@/lib/utils'
import { Package, Warehouse, Truck, BoxIcon, ArrowDown } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const [stats, skuSummary, warehouseInventory, incoming] = await Promise.all([
    fetchInventoryStats(),
    fetchInventorySummaryBySku(),
    fetchInventoryByWarehouse(),
    fetchIncomingInventory(),
  ])

  return (
    <div className="flex flex-col">
      <Header
        title="库存管理"
        description="库存查看和管理"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总库存</p>
                  <p className="text-xl font-semibold">{formatNumber(stats.total_stock)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <BoxIcon className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">FBA 库存</p>
                  <p className="text-xl font-semibold">{formatNumber(stats.total_fba)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Warehouse className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">3PL 库存</p>
                  <p className="text-xl font-semibold">{formatNumber(stats.total_3pl)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <Package className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">SKU 数</p>
                  <p className="text-xl font-semibold">{stats.sku_count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-yellow-100 p-2">
                  <Truck className="h-5 w-5 text-yellow-600" />
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
        </div>

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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>追踪号</TableHead>
                    <TableHead>目的仓库</TableHead>
                    <TableHead>物流方案</TableHead>
                    <TableHead>预计到达</TableHead>
                    <TableHead>SKU 明细</TableHead>
                    <TableHead className="text-right">总数量</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incoming.map((shipment) => (
                    <TableRow key={shipment.tracking_number}>
                      <TableCell className="font-medium">{shipment.tracking_number}</TableCell>
                      <TableCell>{shipment.destination_warehouse}</TableCell>
                      <TableCell>{shipment.logistics_plan || '-'}</TableCell>
                      <TableCell>
                        {shipment.planned_arrival_date
                          ? formatDate(shipment.planned_arrival_date)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {shipment.items.slice(0, 3).map((item) => (
                            <Badge key={item.sku} variant="default">
                              {item.sku}: {item.qty}
                            </Badge>
                          ))}
                          {shipment.items.length > 3 && (
                            <Badge variant="default">+{shipment.items.length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatNumber(shipment.total_qty)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            {skuSummary.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无库存数据
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>产品名称</TableHead>
                    <TableHead className="text-right">总库存</TableHead>
                    <TableHead className="text-right">FBA</TableHead>
                    <TableHead className="text-right">3PL</TableHead>
                    <TableHead className="text-right">仓库数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuSummary.map((item) => (
                    <TableRow key={item.sku}>
                      <TableCell className="font-medium">{item.sku}</TableCell>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatNumber(item.total_stock)}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatNumber(item.fba_stock)}
                      </TableCell>
                      <TableCell className="text-right text-purple-600">
                        {formatNumber(item.threepl_stock)}
                      </TableCell>
                      <TableCell className="text-right">{item.warehouse_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
            {warehouseInventory.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无库存数据
              </div>
            ) : (
              <div className="space-y-4">
                {warehouseInventory.map((warehouse) => (
                  <div key={warehouse.warehouse_id} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={warehouse.warehouse_type === 'FBA' ? 'warning' : 'default'}>
                          {warehouse.warehouse_type}
                        </Badge>
                        <span className="font-semibold">{warehouse.warehouse_code}</span>
                        <span className="text-gray-500">- {warehouse.warehouse_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-gray-500">总库存: </span>
                        <span className="font-semibold">{formatNumber(warehouse.total_qty)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {warehouse.items.map((item) => (
                        <div
                          key={item.sku}
                          className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1 text-sm"
                        >
                          <span className="font-medium">{item.sku}</span>
                          <span className="text-gray-400">|</span>
                          <span>{formatNumber(item.qty)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
