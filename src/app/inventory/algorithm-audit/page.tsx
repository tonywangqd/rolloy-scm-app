/**
 * Algorithm Audit Page
 * Enhanced 16-week inventory calculation verification with shipment details
 * Path: /inventory/algorithm-audit
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlgorithmAuditTable } from '@/components/inventory/algorithm-audit-table'
import { fetchAlgorithmAudit, fetchActiveProducts } from '@/lib/queries/algorithm-audit'
import { formatNumber } from '@/lib/utils'

interface PageProps {
  searchParams: Promise<{ sku?: string }>
}

export default async function AlgorithmAuditPage({ searchParams }: PageProps) {
  const params = await searchParams
  const products = await fetchActiveProducts()

  // If no SKU selected, default to first product
  const selectedSku = params.sku || (products.length > 0 ? products[0].sku : null)

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
  const auditData = await fetchAlgorithmAudit(selectedSku)

  if (!auditData.product) {
    redirect('/inventory/algorithm-audit')
  }

  const { product, rows, metadata } = auditData
  const currentStock = rows.find(r => r.is_current)?.opening_stock || 0

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-2">算法验证 Algorithm Audit</h1>
        <p className="text-sm text-gray-500">
          16周库存计算详细验证 (4周历史 + 当前周 + 11周预测)
        </p>
      </div>

      {/* Product Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>产品信息 Product Information</CardTitle>
          <CardDescription>当前选中的SKU详细信息</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-500 mb-1">SKU</div>
              <div className="font-mono font-semibold text-lg">{product.sku}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">产品名称 Product Name</div>
              <div className="font-medium">{product.product_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">安全库存 Safety Stock</div>
              <div className="font-semibold">
                {product.safety_stock_weeks}周 / {formatNumber(Math.round(metadata.avg_weekly_sales * product.safety_stock_weeks))}件
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">当前库存 Current Stock</div>
              <div className="font-semibold text-blue-600 text-lg">
                {formatNumber(currentStock)}件
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-500 mb-3">平均周销 Average Weekly Sales</div>
            <div className="font-semibold text-lg">
              {formatNumber(Math.round(metadata.avg_weekly_sales))}件/周
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="font-medium text-gray-700">图例 Legend:</div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
              <span>实际数据 Actual</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-50 border border-yellow-200 rounded"></div>
              <span>预测数据 Forecast</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-600 rounded"></div>
              <span className="text-red-600 font-medium">缺货 Stockout</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded"></div>
              <span className="text-orange-700 font-medium">风险 Risk</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-400 rounded"></div>
              <span className="text-blue-600 font-medium">当前周 Current Week</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Table */}
      <Suspense fallback={<div className="animate-pulse h-96 bg-gray-50 rounded-lg" />}>
        <AlgorithmAuditTable
          products={products}
          selectedSku={selectedSku}
          auditData={auditData}
        />
      </Suspense>

      {/* Last Updated */}
      <div className="text-sm text-gray-500 text-right">
        最后更新 Last Updated: {new Date().toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
    </div>
  )
}
