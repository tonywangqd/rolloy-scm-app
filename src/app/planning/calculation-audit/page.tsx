import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchCalculationAudit, fetchSKUsForAudit } from '@/lib/queries/calculation-audit'
import { formatNumber } from '@/lib/utils'
import { Calculator, AlertCircle } from 'lucide-react'
import { SKUSelector } from '@/components/planning/sku-selector'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    sku?: string
  }>
}

export default async function CalculationAuditPage({ searchParams }: PageProps) {
  const params = await searchParams
  const selectedSKU = params.sku

  // Fetch available SKUs for dropdown
  const products = await fetchSKUsForAudit()

  // If no SKU selected or invalid, show selection screen
  if (!selectedSKU || !products.find(p => p.sku === selectedSKU)) {
    return (
      <div className="flex flex-col">
        <Header
          title="库存计算验证"
          description="查看每个产品的周级库存计算明细"
        />
        <div className="flex-1 p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calculator className="h-5 w-5" />
                <span>选择产品</span>
              </CardTitle>
              <CardDescription>
                选择一个SKU以查看其库存计算过程
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SKUSelector products={products} />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Fetch audit data for selected SKU
  const { product, rows } = await fetchCalculationAudit(selectedSKU)

  if (!product) {
    return (
      <div className="flex flex-col">
        <Header
          title="库存计算验证"
          description="查看每个产品的周级库存计算明细"
        />
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <span>未找到产品: {selectedSKU}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header
        title="库存计算验证"
        description={`${product.product_name} (${product.sku})`}
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Product Info & Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calculator className="h-5 w-5 text-purple-600" />
                <span>产品信息</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-gray-500">SKU</p>
                <p className="font-semibold">{product.sku}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">产品名称</p>
                <p className="font-semibold">{product.product_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">安全库存周数</p>
                <p className="font-semibold">{product.safety_stock_weeks} 周</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">单位成本</p>
                <p className="font-semibold">${product.unit_cost_usd.toFixed(2)}</p>
              </div>
            </div>
            <div className="border-t pt-4">
              <SKUSelector products={products} currentSKU={selectedSKU} />
            </div>
          </CardContent>
        </Card>

        {/* Calculation Logic Explanation */}
        <Card>
          <CardHeader>
            <CardTitle>计算逻辑说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="font-semibold text-green-800">实际值 (绿色)</p>
                <p className="text-green-700">使用实际发生的数据</p>
              </div>
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <p className="font-semibold text-yellow-800">预估值 (黄色)</p>
                <p className="text-yellow-700">使用预测/计划数据</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="font-semibold text-red-800">库存不足 (红色)</p>
                <p className="text-red-700">低于安全库存阈值</p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-gray-600">
              <p><strong>取值优先级:</strong> 实际值 优先于 预估值 (COALESCE 逻辑)</p>
              <p><strong>库存计算:</strong> 期末库存 = 期初库存 + 入库数量 - 销售数量</p>
            </div>
          </CardContent>
        </Card>

        {/* Calculation Table */}
        <Card>
          <CardHeader>
            <CardTitle>周度计算明细</CardTitle>
            <CardDescription>
              显示12周的库存计算过程
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无数据
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-white font-semibold">
                        周次
                      </TableHead>
                      <TableHead colSpan={3} className="border-l text-center font-semibold">
                        采购下单
                      </TableHead>
                      <TableHead colSpan={3} className="border-l text-center font-semibold">
                        工厂交付
                      </TableHead>
                      <TableHead colSpan={4} className="border-l text-center font-semibold">
                        物流到仓
                      </TableHead>
                      <TableHead colSpan={3} className="border-l text-center font-semibold">
                        销售出库
                      </TableHead>
                      <TableHead colSpan={3} className="border-l text-center font-semibold">
                        库存变化
                      </TableHead>
                    </TableRow>
                    <TableRow className="text-xs">
                      <TableHead className="sticky left-0 z-10 bg-white"></TableHead>
                      {/* Purchase Orders */}
                      <TableHead className="border-l text-right">预估</TableHead>
                      <TableHead className="text-right">实际</TableHead>
                      <TableHead className="text-right font-semibold">取值</TableHead>
                      {/* Deliveries */}
                      <TableHead className="border-l text-right">预估</TableHead>
                      <TableHead className="text-right">实际</TableHead>
                      <TableHead className="text-right font-semibold">取值</TableHead>
                      {/* Shipments */}
                      <TableHead className="border-l text-right">数量</TableHead>
                      <TableHead className="text-right">预计周</TableHead>
                      <TableHead className="text-right">实际周</TableHead>
                      <TableHead className="text-right font-semibold">到仓周</TableHead>
                      {/* Sales */}
                      <TableHead className="border-l text-right">预测</TableHead>
                      <TableHead className="text-right">实际</TableHead>
                      <TableHead className="text-right font-semibold">取值</TableHead>
                      {/* Inventory */}
                      <TableHead className="border-l text-right">期初</TableHead>
                      <TableHead className="text-right">入库</TableHead>
                      <TableHead className="text-right font-semibold">期末</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const isLowStock = row.closing_stock < row.safety_stock_threshold
                      const hasActualOrder = row.actual_order_qty !== null
                      const hasActualDelivery = row.actual_delivery_qty !== null
                      const hasActualArrival = row.actual_arrival_week !== null
                      const hasActualSales = row.actual_sales !== null

                      return (
                        <TableRow key={row.week_iso}>
                          <TableCell className="sticky left-0 z-10 bg-white font-medium">
                            {row.week_iso}
                          </TableCell>

                          {/* Purchase Orders */}
                          <TableCell className="border-l text-right text-sm">
                            {row.planned_order_qty ? formatNumber(row.planned_order_qty) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {row.actual_order_qty ? formatNumber(row.actual_order_qty) : '-'}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              hasActualOrder
                                ? 'bg-green-50 text-green-700'
                                : row.planned_order_qty
                                ? 'bg-yellow-50 text-yellow-700'
                                : ''
                            }`}
                          >
                            {row.effective_order_qty > 0 ? formatNumber(row.effective_order_qty) : '-'}
                          </TableCell>

                          {/* Deliveries */}
                          <TableCell className="border-l text-right text-sm">
                            {row.planned_delivery_qty ? formatNumber(row.planned_delivery_qty) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {row.actual_delivery_qty ? formatNumber(row.actual_delivery_qty) : '-'}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              hasActualDelivery
                                ? 'bg-green-50 text-green-700'
                                : row.planned_delivery_qty
                                ? 'bg-yellow-50 text-yellow-700'
                                : ''
                            }`}
                          >
                            {row.effective_delivery_qty > 0 ? formatNumber(row.effective_delivery_qty) : '-'}
                          </TableCell>

                          {/* Shipments */}
                          <TableCell className="border-l text-right text-sm">
                            {row.shipment_qty ? formatNumber(row.shipment_qty) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {row.planned_arrival_week || '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {row.actual_arrival_week || '-'}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              hasActualArrival
                                ? 'bg-green-50 text-green-700'
                                : row.planned_arrival_week
                                ? 'bg-yellow-50 text-yellow-700'
                                : ''
                            }`}
                          >
                            {row.effective_arrival_week || '-'}
                          </TableCell>

                          {/* Sales */}
                          <TableCell className="border-l text-right text-sm">
                            {formatNumber(row.forecast_sales)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {row.actual_sales !== null ? formatNumber(row.actual_sales) : '-'}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              hasActualSales
                                ? 'bg-green-50 text-green-700'
                                : 'bg-yellow-50 text-yellow-700'
                            }`}
                          >
                            {formatNumber(row.effective_sales)}
                          </TableCell>

                          {/* Inventory */}
                          <TableCell className="border-l text-right text-sm">
                            {formatNumber(row.opening_stock)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatNumber(row.incoming_stock)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-bold ${
                              isLowStock ? 'bg-red-50 text-red-700' : 'text-gray-900'
                            }`}
                          >
                            {formatNumber(row.closing_stock)}
                            {isLowStock && (
                              <Badge variant="danger" className="ml-2 text-xs">
                                低
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
