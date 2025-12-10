/**
 * Algorithm Audit Page V5 - Reverse Schedule
 * 倒排排程算法验证 - 从销量预测倒推各环节建议时间
 * Path: /inventory/algorithm-audit
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ReverseScheduleAuditTable } from '@/components/inventory/reverse-schedule-audit-table'
import { AlgorithmAuditFilters } from '@/components/inventory/algorithm-audit-filters'
import { fetchReverseScheduleAudit } from '@/lib/queries/reverse-schedule-audit'
import { fetchActiveProducts } from '@/lib/queries/algorithm-audit'
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
  noStore()

  const params = await searchParams
  const products = await fetchActiveProducts()

  const currentWeek = getCurrentWeek()
  const defaultStartWeek = addWeeksToISOWeek(currentWeek, -4) || '2025-W01'
  const defaultEndWeek = addWeeksToISOWeek(currentWeek, 11) || '2025-W52'

  const selectedSku = params.sku || (products.length > 0 ? products[0].sku : null)
  const startWeek = params.start_week || defaultStartWeek
  const endWeek = params.end_week || defaultEndWeek

  if (!selectedSku) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-6">算法验证 - 倒排排程</h1>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-500">暂无产品数据，请先添加产品</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const auditData = await fetchReverseScheduleAudit(selectedSku, startWeek, endWeek)

  if (!auditData.product) {
    redirect('/inventory/algorithm-audit')
  }

  const { product, rows, leadTimes, reverseSchedule, metadata } = auditData
  const currentStock = rows.find((r) => r.is_current)?.opening_stock || 0

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-2">算法验证 V5 - 倒排排程</h1>
        <p className="text-sm text-gray-500">
          从销量预测倒推计算：建议下单周 → 建议出厂周 → 建议发货周 → 建议到仓周
        </p>
      </div>

      {/* Filters */}
      <Suspense fallback={<div>Loading filters...</div>}>
        <AlgorithmAuditFilters
          products={products}
          selectedSku={selectedSku}
          shippingWeeks={leadTimes.shipping_weeks}
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
          {/* Lead Times */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-orange-50 rounded-lg p-3">
              <div className="text-xs text-orange-600 mb-1">生产周期</div>
              <div className="font-semibold text-lg text-orange-700">{leadTimes.production_weeks}周</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <div className="text-xs text-yellow-600 mb-1">装柜周期</div>
              <div className="font-semibold text-lg text-yellow-700">{leadTimes.loading_weeks}周</div>
            </div>
            <div className="bg-cyan-50 rounded-lg p-3">
              <div className="text-xs text-cyan-600 mb-1">物流周期</div>
              <div className="font-semibold text-lg text-cyan-700">{leadTimes.shipping_weeks}周</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs text-green-600 mb-1">上架周期</div>
              <div className="font-semibold text-lg text-green-700">{leadTimes.inbound_weeks}周</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-xs text-purple-600 mb-1">总周期</div>
              <div className="font-semibold text-lg text-purple-700">{leadTimes.total_weeks}周</div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
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
              <div className="text-sm text-gray-500 mb-1">建议下单</div>
              <div className="font-semibold text-lg text-orange-600">
                {formatNumber(metadata.total_suggested_order)}件
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">实际下单</div>
              <div className="font-semibold text-lg">
                {formatNumber(metadata.total_actual_order)}件
                {metadata.gap !== 0 && (
                  <span className={`text-sm ml-2 ${metadata.gap > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    ({metadata.gap > 0 ? `缺${metadata.gap}` : `多${-metadata.gap}`})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            数据范围: {metadata.start_week} 至 {metadata.end_week}
            <span className="text-gray-400 ml-2">(共 {metadata.total_weeks} 周)</span>
          </div>
        </CardContent>
      </Card>

      {/* Reverse Schedule Visualization */}
      {reverseSchedule.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">倒排排程计算结果</CardTitle>
            <CardDescription>
              每个销量预测周 → 倒推各环节建议时间
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">销量需求周</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">需求数量</th>
                    <th className="px-3 py-2 text-center font-medium text-orange-600">建议下单周</th>
                    <th className="px-3 py-2 text-center font-medium text-yellow-600">建议出厂周</th>
                    <th className="px-3 py-2 text-center font-medium text-cyan-600">建议发货周</th>
                    <th className="px-3 py-2 text-center font-medium text-green-600">建议到仓周</th>
                  </tr>
                </thead>
                <tbody>
                  {reverseSchedule.slice(0, 8).map((item, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{item.target_week}</td>
                      <td className="px-3 py-2 text-right">{item.qty}</td>
                      <td className="px-3 py-2 text-center text-orange-600">{item.suggested_order_week}</td>
                      <td className="px-3 py-2 text-center text-yellow-600">{item.suggested_fulfillment_week}</td>
                      <td className="px-3 py-2 text-center text-cyan-600">{item.suggested_ship_week}</td>
                      <td className="px-3 py-2 text-center text-green-600">{item.suggested_arrival_week}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reverseSchedule.length > 8 && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  显示前 8 条，共 {reverseSchedule.length} 条倒排计算
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend Card */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-50 border border-gray-300 rounded"></div>
                <span className="text-gray-600">过去周次</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-50 border border-blue-300 rounded"></div>
                <span className="text-gray-600">当前周</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-orange-600 font-medium">建议</span>
                <span className="text-gray-600">= 从销量预测倒推计算</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-700 font-semibold">实际</span>
                <span className="text-gray-600">= 实际发生的数据</span>
              </div>
            </div>
            <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
              <strong>公式:</strong> 销量需求周 - 上架{leadTimes.inbound_weeks}周 = 到仓周 →
              到仓周 - 物流{leadTimes.shipping_weeks}周 = 发货周 →
              发货周 - 装柜{leadTimes.loading_weeks}周 = 出厂周 →
              出厂周 - 生产{leadTimes.production_weeks}周 = 下单周
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Table */}
      <Card>
        <CardHeader>
          <CardTitle>周度对比表 - 建议 vs 实际</CardTitle>
          <CardDescription>
            对比每周的建议执行量与实际执行量，差异以红色/绿色数字显示
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="p-12 text-center text-gray-500">加载中...</div>}>
            <ReverseScheduleAuditTable rows={rows} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
