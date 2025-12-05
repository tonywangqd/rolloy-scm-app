/**
 * Algorithm Audit Page V4
 * 24-column reverse-calculation verification with data lineage & coverage tracking
 * Path: /inventory/algorithm-audit
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlgorithmAuditTableV4 } from '@/components/inventory/algorithm-audit-table-v4'
import { AlgorithmAuditFilters } from '@/components/inventory/algorithm-audit-filters'
import { fetchAlgorithmAuditV4, fetchActiveProducts } from '@/lib/queries/algorithm-audit'
import { formatNumber, getCurrentWeek, addWeeksToISOWeek } from '@/lib/utils'

interface PageProps {
  searchParams: Promise<{
    sku?: string
    shipping_weeks?: string
    start_week?: string
    end_week?: string
  }>
}

export default async function AlgorithmAuditPage({ searchParams }: PageProps) {
  // 禁用缓存，确保每次访问都获取最新数据
  noStore()

  const params = await searchParams
  const products = await fetchActiveProducts()

  // 计算默认周次范围（当前周-4 到 当前周+11，共16周）
  const currentWeek = getCurrentWeek()
  const defaultStartWeek = addWeeksToISOWeek(currentWeek, -4) || '2025-W01'
  const defaultEndWeek = addWeeksToISOWeek(currentWeek, 11) || '2025-W52'

  // Parse parameters
  const selectedSku = params.sku || (products.length > 0 ? products[0].sku : null)
  const shippingWeeks = parseInt(params.shipping_weeks || '5', 10)
  const startWeek = params.start_week || defaultStartWeek
  const endWeek = params.end_week || defaultEndWeek

  if (!selectedSku) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-6">算法验证 Algorithm Audit</h1>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-500">暂无产品数据 No products available</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch audit data for selected SKU with custom week range (V4 with coverage & lineage)
  const auditData = await fetchAlgorithmAuditV4(selectedSku, shippingWeeks, startWeek, endWeek)

  if (!auditData.product) {
    redirect('/inventory/algorithm-audit')
  }

  const { product, rows, leadTimes, metadata } = auditData
  const currentStock = rows.find((r) => r.is_current)?.opening_stock || 0

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-2">算法验证 V4 Algorithm Audit</h1>
        <p className="text-sm text-gray-500">
          供应链反推计算验证 (24列完整视图 + 数据覆盖追踪 + 数据溯源)
        </p>
      </div>

      {/* Filters */}
      <Suspense fallback={<div>Loading filters...</div>}>
        <AlgorithmAuditFilters
          products={products}
          selectedSku={selectedSku}
          shippingWeeks={shippingWeeks}
          startWeek={startWeek}
          endWeek={endWeek}
        />
      </Suspense>

      {/* Product Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <div>
              <span className="text-2xl font-bold">{product.sku}</span>
              <span className="text-gray-500 ml-4">{product.product_name}</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-500 mb-1">生产周期</div>
              <div className="font-semibold text-lg">{leadTimes.production_weeks}周</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">装柜周期</div>
              <div className="font-semibold text-lg">{leadTimes.loading_weeks}周</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">物流周期</div>
              <div className="font-semibold text-lg text-blue-600">
                {leadTimes.shipping_weeks}周
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">安全库存</div>
              <div className="font-semibold text-lg">{leadTimes.safety_stock_weeks}周</div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-2 md:grid-cols-5 gap-6">
            <div>
              <div className="text-sm text-gray-500 mb-1">当前库存</div>
              <div className="font-semibold text-blue-600 text-xl">
                {formatNumber(currentStock)}件
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">平均周销</div>
              <div className="font-semibold text-lg">
                {formatNumber(Math.round(metadata.avg_weekly_sales))}件/周
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">总需求量</div>
              <div className="font-semibold text-lg">
                {formatNumber(metadata.total_demand)}件
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">已下单量</div>
              <div className="font-semibold text-lg">
                {formatNumber(metadata.total_ordered)}件
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">需求覆盖率</div>
              <div className="font-semibold text-lg">
                <Badge variant={metadata.overall_coverage_percentage >= 95 ? 'success' : metadata.overall_coverage_percentage >= 70 ? 'warning' : 'danger'}>
                  {metadata.overall_coverage_percentage.toFixed(1)}%
                </Badge>
              </div>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-500">
            数据范围: {metadata.start_week} 至 {metadata.end_week}
            <span className="text-gray-400 ml-2">(共 {metadata.total_weeks} 周)</span>
          </div>
        </CardContent>
      </Card>

      {/* Legend Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-50 border border-gray-300 rounded"></div>
              <span className="text-gray-600">过去周次</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50 border border-blue-300 rounded"></div>
              <span className="text-gray-600">当前周</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-50 border border-green-300 rounded"></div>
              <span className="text-gray-600">实际数据</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-white border border-gray-300 rounded font-bold text-xs">
                取值
              </div>
              <span className="text-gray-600">
                取值列 = COALESCE(实际, 预计) - 用于库存计算
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success">✓ 全覆盖</Badge>
              <span className="text-gray-600">需求完全被订单覆盖</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="warning">⚠ 部分</Badge>
              <span className="text-gray-600">需求部分覆盖，点击查看缺口</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="danger">✗ 未覆盖</Badge>
              <span className="text-gray-600">需求未被任何订单覆盖</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Table */}
      <Card>
        <CardHeader>
          <CardTitle>算法审计表 V4 - 24列完整视图</CardTitle>
          <CardDescription>
            反推计算 + 正向传播: 从销售需求回推到采购下单,验证供应链时间轴,追踪数据覆盖与溯源。点击展开按钮查看详细数据。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="p-12 text-center text-gray-500">加载中...</div>}>
            <AlgorithmAuditTableV4 rows={rows} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
