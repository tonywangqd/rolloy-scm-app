/**
 * Algorithm Audit Page
 * 20-column reverse-calculation verification with configurable shipping weeks
 * Path: /inventory/algorithm-audit
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlgorithmAuditTable } from '@/components/inventory/algorithm-audit-table'
import { AlgorithmAuditFilters } from '@/components/inventory/algorithm-audit-filters'
import { fetchAlgorithmAuditV3, fetchActiveProducts } from '@/lib/queries/algorithm-audit'
import { formatNumber } from '@/lib/utils'

interface PageProps {
  searchParams: Promise<{ sku?: string; shipping_weeks?: string }>
}

export default async function AlgorithmAuditPage({ searchParams }: PageProps) {
  // 禁用缓存，确保每次访问都获取最新数据
  noStore()

  const params = await searchParams
  const products = await fetchActiveProducts()

  // Parse parameters
  const selectedSku = params.sku || (products.length > 0 ? products[0].sku : null)
  const shippingWeeks = parseInt(params.shipping_weeks || '5', 10)

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

  // Fetch audit data for selected SKU
  const auditData = await fetchAlgorithmAuditV3(selectedSku, shippingWeeks)

  if (!auditData.product) {
    redirect('/inventory/algorithm-audit')
  }

  const { product, rows, leadTimes, metadata } = auditData
  const currentStock = rows.find((r) => r.is_current)?.opening_stock || 0

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-2">算法验证 Algorithm Audit</h1>
        <p className="text-sm text-gray-500">
          供应链反推计算验证 (20列完整视图 + 可配置物流周期)
        </p>
      </div>

      {/* Filters */}
      <Suspense fallback={<div>Loading filters...</div>}>
        <AlgorithmAuditFilters
          products={products}
          selectedSku={selectedSku}
          shippingWeeks={shippingWeeks}
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

          <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-6">
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
              <div className="text-sm text-gray-500 mb-1">数据范围</div>
              <div className="font-medium text-sm">
                {metadata.start_week} 至 {metadata.end_week}
                <span className="text-gray-500 ml-2">(共 {metadata.total_weeks} 周)</span>
              </div>
            </div>
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
          </div>
        </CardContent>
      </Card>

      {/* Audit Table */}
      <Card>
        <CardHeader>
          <CardTitle>算法审计表 - 20列完整视图</CardTitle>
          <CardDescription>
            反推计算: 从销售需求回推到采购下单,验证供应链时间轴
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="p-12 text-center text-gray-500">加载中...</div>}>
            <AlgorithmAuditTable rows={rows} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
