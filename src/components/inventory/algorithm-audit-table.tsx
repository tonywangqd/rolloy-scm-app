'use client'

/**
 * Algorithm Audit Table V2.0 - Client Component
 * Enhanced 21-column table with full supply chain timeline
 * Groups: Basic Info, Sales, Arrival, Ship, Factory Ship, Order, Inventory
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RadixSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import type { AlgorithmAuditResult } from '@/lib/queries/algorithm-audit'
import type { Product } from '@/lib/types/database'
import { cn } from '@/lib/utils'

interface AlgorithmAuditTableProps {
  products: Product[]
  selectedSku: string
  auditData: AlgorithmAuditResult
}

export function AlgorithmAuditTable({
  products,
  selectedSku,
  auditData
}: AlgorithmAuditTableProps) {
  const router = useRouter()
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())

  const { rows, metadata } = auditData

  const toggleWeek = (weekIso: string) => {
    const newExpanded = new Set(expandedWeeks)
    if (newExpanded.has(weekIso)) {
      newExpanded.delete(weekIso)
    } else {
      newExpanded.add(weekIso)
    }
    setExpandedWeeks(newExpanded)
  }

  const handleSkuChange = (newSku: string) => {
    router.push(`/inventory/algorithm-audit?sku=${encodeURIComponent(newSku)}`)
  }

  // Helper to get cell background color based on data type
  const getCellClass = (isPast: boolean, isActual: boolean, isForecast: boolean) => {
    if (isActual) return 'bg-green-50 border-green-200'
    if (isForecast) return 'bg-yellow-50 border-yellow-200'
    if (isPast) return 'bg-gray-50'
    return 'bg-white'
  }

  const getStockStatusBadge = (status: string) => {
    switch (status) {
      case 'Stockout':
        return <Badge variant="danger" className="font-semibold">缺货</Badge>
      case 'Risk':
        return <Badge variant="warning" className="font-semibold">风险</Badge>
      case 'OK':
        return <Badge variant="success">正常</Badge>
      default:
        return <Badge variant="default">{status}</Badge>
    }
  }

  const getStockCellClass = (stock: number, threshold: number) => {
    if (stock <= 0) return 'bg-red-600 text-white font-bold'
    if (stock < threshold) return 'bg-orange-100 text-orange-900 font-semibold'
    return ''
  }

  return (
    <div className="space-y-4">
      {/* SKU Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
              选择SKU Select SKU:
            </label>
            <RadixSelect value={selectedSku} onValueChange={handleSkuChange}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="选择产品..." />
              </SelectTrigger>
              <SelectContent>
                {products.map(product => (
                  <SelectItem key={product.id} value={product.sku}>
                    <span className="font-mono">{product.sku}</span>
                    <span className="ml-2 text-gray-500">- {product.product_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </RadixSelect>
          </div>
        </CardContent>
      </Card>

      {/* Main Table Card */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              {/* Double-layer header with grouped columns */}
              <thead className="bg-gray-50 sticky top-0 z-10">
                {/* Layer 1: Group Headers */}
                <tr className="border-b-2 border-gray-300">
                  <th colSpan={2} className="border-r-2 border-gray-300 px-2 py-2 text-center font-bold bg-white text-gray-700">
                    基础信息<br />Basic Info
                  </th>
                  <th colSpan={3} className="border-r-2 border-gray-300 px-2 py-2 text-center font-bold bg-yellow-50 text-gray-700">
                    销售数据<br />Sales Data
                  </th>
                  <th colSpan={5} className="border-r-2 border-gray-300 px-2 py-2 text-center font-bold bg-blue-50 text-gray-700">
                    到仓数据<br />Arrival Data
                  </th>
                  <th colSpan={2} className="border-r-2 border-gray-300 px-2 py-2 text-center font-bold bg-purple-50 text-gray-700">
                    发货数据<br />Ship Data
                  </th>
                  <th colSpan={2} className="border-r-2 border-gray-300 px-2 py-2 text-center font-bold bg-orange-50 text-gray-700">
                    出货数据<br />Factory Ship
                  </th>
                  <th colSpan={2} className="border-r-2 border-gray-300 px-2 py-2 text-center font-bold bg-green-50 text-gray-700">
                    下单数据<br />Order Data
                  </th>
                  <th colSpan={5} className="px-2 py-2 text-center font-bold bg-gray-100 text-gray-700">
                    库存计算<br />Inventory
                  </th>
                </tr>

                {/* Layer 2: Column Headers */}
                <tr className="bg-gray-100 border-b border-gray-300">
                  {/* Basic Info (2) */}
                  <th className="sticky left-0 z-20 bg-gray-100 border-r border-gray-300 px-2 py-2 text-left font-semibold whitespace-nowrap text-xs">
                    周次<br />Week
                  </th>
                  <th className="border-r-2 border-gray-300 px-2 py-2 text-left font-semibold whitespace-nowrap">
                    周起始日<br />Start Date
                  </th>

                  {/* Sales Data (3) */}
                  <th className="bg-yellow-50 border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    预计销量<br />Forecast
                  </th>
                  <th className="bg-yellow-50 border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    实际销量<br />Actual
                  </th>
                  <th className="bg-yellow-50 border-r-2 border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    销量取值<br />Effective
                  </th>

                  {/* Arrival Data (5) */}
                  <th className="bg-blue-50 border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    预计到仓周<br />Plan Week
                  </th>
                  <th className="bg-blue-50 border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    预计到仓量<br />Plan Qty
                  </th>
                  <th className="bg-blue-50 border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    实际到仓周<br />Actual Week
                  </th>
                  <th className="bg-blue-50 border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    实际到仓量<br />Actual Qty
                  </th>
                  <th className="bg-blue-50 border-r-2 border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    到仓取值<br />Effective
                  </th>

                  {/* Ship Data (2) */}
                  <th className="bg-purple-50 border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    预计发货周<br />Plan Week
                  </th>
                  <th className="bg-purple-50 border-r-2 border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    实际发货周<br />Actual Week
                  </th>

                  {/* Factory Ship Data (2) */}
                  <th className="bg-orange-50 border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    预计出货周<br />Plan Week
                  </th>
                  <th className="bg-orange-50 border-r-2 border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    实际出货周<br />Actual Week
                  </th>

                  {/* Order Data (2) */}
                  <th className="bg-green-50 border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    预计下单周<br />Plan Week
                  </th>
                  <th className="bg-green-50 border-r-2 border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    实际下单周<br />Actual Week
                  </th>

                  {/* Inventory Calculation (5) */}
                  <th className="bg-gray-100 border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    期初库存<br />Opening
                  </th>
                  <th className="bg-gray-100 border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    期末库存<br />Closing
                  </th>
                  <th className="bg-gray-100 border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    安全库存<br />Safety
                  </th>
                  <th className="bg-gray-100 border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    周转率<br />Turnover
                  </th>
                  <th className="bg-gray-100 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    状态<br />Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = expandedWeeks.has(row.week_iso)
                  const hasShipments = row.shipments.length > 0
                  const borderClass = row.is_current ? 'border-l-4 border-l-blue-500' : ''

                  // Calculate turnover ratio (weeks of inventory coverage)
                  const turnoverRatio = row.sales_effective > 0
                    ? row.closing_stock / row.sales_effective
                    : null

                  // Placeholder data for V2 columns (to be implemented by backend)
                  const plannedArrivalWeek = '-' // Backend will implement backtracking algorithm
                  const plannedArrivalQty = 0
                  const actualArrivalWeek = row.shipments.length > 0 ? row.week_iso : null
                  const actualArrivalQty = row.shipment_actual_qty

                  return (
                    <>
                      {/* Main Row */}
                      <tr
                        key={row.week_iso}
                        className={cn(
                          'border-b border-gray-200 hover:bg-gray-50 transition-colors',
                          borderClass
                        )}
                      >
                        {/* ===== Basic Info (2) ===== */}

                        {/* Week (Fixed Column) */}
                        <td className={cn(
                          'sticky left-0 z-10 bg-white border-r border-gray-300 px-2 py-2 font-mono text-xs font-bold',
                          row.is_current && 'bg-blue-50 border-l-4 border-l-blue-500'
                        )}>
                          {row.week_iso}
                          {row.is_current && (
                            <span className="ml-1 text-xs text-blue-600">▸</span>
                          )}
                        </td>

                        {/* Week Start Date */}
                        <td className="border-r-2 border-gray-300 px-2 py-2 text-xs text-gray-600">
                          {row.week_start_date}
                        </td>

                        {/* ===== Sales Data (3) ===== */}

                        {/* Sales Forecast */}
                        <td className="bg-yellow-50 border-r border-gray-300 px-2 py-2 text-right text-xs">
                          {formatNumber(row.sales_forecast)}
                        </td>

                        {/* Sales Actual */}
                        <td className={cn(
                          'border-r border-gray-300 px-2 py-2 text-right text-xs',
                          row.sales_actual !== null
                            ? 'bg-green-50 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.sales_actual !== null ? formatNumber(row.sales_actual) : '-'}
                        </td>

                        {/* Sales Effective */}
                        <td className={cn(
                          'border-r-2 border-gray-300 px-2 py-2 text-right text-xs font-semibold',
                          row.sales_source === 'actual'
                            ? 'bg-green-100'
                            : 'bg-yellow-100'
                        )}>
                          {formatNumber(row.sales_effective)}
                        </td>

                        {/* ===== Arrival Data (5) ===== */}

                        {/* Planned Arrival Week */}
                        <td className="bg-sky-50 border-r border-gray-300 px-2 py-2 text-center text-xs text-gray-600">
                          {plannedArrivalWeek}
                        </td>

                        {/* Planned Arrival Qty */}
                        <td className="bg-sky-50 border-r border-gray-300 px-2 py-2 text-right text-xs text-gray-600">
                          {plannedArrivalQty > 0 ? formatNumber(plannedArrivalQty) : '-'}
                        </td>

                        {/* Actual Arrival Week */}
                        <td className={cn(
                          'border-r border-gray-300 px-2 py-2 text-center text-xs',
                          actualArrivalWeek ? 'bg-green-50 font-medium' : 'bg-gray-50 text-gray-400'
                        )}>
                          {actualArrivalWeek || '-'}
                        </td>

                        {/* Actual Arrival Qty */}
                        <td className={cn(
                          'border-r border-gray-300 px-2 py-2 text-right text-xs',
                          actualArrivalQty > 0 ? 'bg-green-50 font-medium' : 'bg-gray-50 text-gray-400'
                        )}>
                          {actualArrivalQty > 0 ? formatNumber(actualArrivalQty) : '-'}
                        </td>

                        {/* Arrival Effective (Clickable) */}
                        <td
                          className={cn(
                            'border-r-2 border-gray-300 px-2 py-2 text-right text-xs font-semibold',
                            hasShipments && 'cursor-pointer hover:bg-blue-100',
                            row.incoming_qty > 0 && 'text-blue-600'
                          )}
                          onClick={() => hasShipments && toggleWeek(row.week_iso)}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {hasShipments && (
                              isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                            )}
                            <span className={cn(
                              actualArrivalQty > 0 ? 'bg-green-100' : 'bg-sky-100',
                              'px-1 rounded'
                            )}>
                              {row.incoming_qty > 0 ? formatNumber(row.incoming_qty) : '-'}
                            </span>
                          </div>
                        </td>

                        {/* ===== Ship Data (2) ===== */}

                        {/* Planned Ship Week */}
                        <td className="bg-purple-50 border-r border-gray-300 px-2 py-2 text-center text-xs text-gray-600">
                          -
                        </td>

                        {/* Actual Ship Week */}
                        <td className="bg-purple-50 border-r-2 border-gray-300 px-2 py-2 text-center text-xs text-gray-400">
                          -
                        </td>

                        {/* ===== Factory Ship Data (2) ===== */}

                        {/* Planned Factory Ship Week */}
                        <td className="bg-orange-50 border-r border-gray-300 px-2 py-2 text-center text-xs text-gray-600">
                          -
                        </td>

                        {/* Actual Factory Ship Week */}
                        <td className="bg-orange-50 border-r-2 border-gray-300 px-2 py-2 text-center text-xs text-gray-400">
                          -
                        </td>

                        {/* ===== Order Data (2) ===== */}

                        {/* Planned Order Week */}
                        <td className="bg-green-50 border-r border-gray-300 px-2 py-2 text-center text-xs text-gray-600">
                          -
                        </td>

                        {/* Actual Order Week */}
                        <td className="bg-green-50 border-r-2 border-gray-300 px-2 py-2 text-center text-xs text-gray-400">
                          -
                        </td>

                        {/* ===== Inventory Calculation (5) ===== */}

                        {/* Opening Stock */}
                        <td className={cn(
                          'bg-gray-50 border-r border-gray-300 px-2 py-2 text-right text-xs font-medium'
                        )}>
                          {formatNumber(row.opening_stock)}
                        </td>

                        {/* Closing Stock */}
                        <td className={cn(
                          'border-r border-gray-300 px-2 py-2 text-right text-xs font-bold',
                          getStockCellClass(row.closing_stock, row.safety_threshold)
                        )}>
                          {formatNumber(row.closing_stock)}
                        </td>

                        {/* Safety Threshold */}
                        <td className="bg-gray-50 border-r border-gray-300 px-2 py-2 text-right text-xs text-gray-500">
                          {formatNumber(Math.round(row.safety_threshold))}
                        </td>

                        {/* Turnover Ratio */}
                        <td className={cn(
                          'border-r border-gray-300 px-2 py-2 text-right text-xs font-medium',
                          turnoverRatio !== null && turnoverRatio < 0.5
                            ? 'bg-red-100 text-red-900'
                            : turnoverRatio !== null && turnoverRatio < 1
                            ? 'bg-yellow-100 text-yellow-900'
                            : turnoverRatio !== null
                            ? 'bg-green-50 text-green-900'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {turnoverRatio !== null
                            ? `${turnoverRatio.toFixed(1)}x`
                            : '-'
                          }
                        </td>

                        {/* Status */}
                        <td className="bg-gray-50 px-2 py-2 text-center">
                          {getStockStatusBadge(row.stock_status)}
                        </td>
                      </tr>

                      {/* Expanded Shipment Details */}
                      {isExpanded && hasShipments && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={21} className="px-6 py-4 border-b border-gray-200">
                            <div className="text-sm">
                              <div className="font-semibold mb-3 text-gray-700">
                                物流明细 Shipment Details ({row.shipments.length}):
                              </div>
                              <div className="space-y-2">
                                {row.shipments.map((shipment, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-6 p-3 bg-white rounded-lg border border-gray-200"
                                  >
                                    <div className="flex-1">
                                      <span className="font-mono font-semibold text-blue-600">
                                        {shipment.tracking_number}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">计划:</span>
                                      <span className="px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs">
                                        {shipment.planned_arrival_date || '-'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">实际:</span>
                                      <span className={cn(
                                        'px-2 py-1 rounded text-xs',
                                        shipment.actual_arrival_date
                                          ? 'bg-green-50 border border-green-200 font-medium'
                                          : 'bg-gray-50 border border-gray-200 text-gray-400'
                                      )}>
                                        {shipment.actual_arrival_date || '-'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">数量:</span>
                                      <span className="font-semibold">
                                        {formatNumber(shipment.shipped_qty)}件
                                      </span>
                                    </div>

                                    <a
                                      href="/logistics"
                                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium"
                                    >
                                      查看详情
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-500">数据范围 Data Range</div>
              <div className="font-semibold mt-1">
                {metadata.start_week} 至 {metadata.end_week}
              </div>
            </div>
            <div>
              <div className="text-gray-500">总周数 Total Weeks</div>
              <div className="font-semibold mt-1">{metadata.total_weeks}周</div>
            </div>
            <div>
              <div className="text-gray-500">平均周销 Avg Weekly Sales</div>
              <div className="font-semibold mt-1">
                {formatNumber(Math.round(metadata.avg_weekly_sales))}件
              </div>
            </div>
            <div>
              <div className="text-gray-500">安全库存周数 Safety Weeks</div>
              <div className="font-semibold mt-1">{metadata.safety_stock_weeks}周</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend Card */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="font-semibold text-sm text-gray-700">
              图例说明 Legend
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              {/* Data Source Colors */}
              <div>
                <div className="font-medium text-gray-600 mb-2">数据来源 Data Source:</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-green-50 border border-green-200 rounded"></span>
                    <span>实际值 Actual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-yellow-50 border border-yellow-200 rounded"></span>
                    <span>预计值 Forecast</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-sky-50 border border-sky-200 rounded"></span>
                    <span>计划值 Planned (反推算法)</span>
                  </div>
                </div>
              </div>

              {/* Turnover Ratio Colors */}
              <div>
                <div className="font-medium text-gray-600 mb-2">周转率 Turnover Ratio:</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-green-50 border border-green-200 rounded"></span>
                    <span>正常 (≥1x)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></span>
                    <span>偏低 (0.5-1x)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-red-100 border border-red-300 rounded"></span>
                    <span>危险 (&lt;0.5x)</span>
                  </div>
                </div>
              </div>

              {/* Column Groups */}
              <div>
                <div className="font-medium text-gray-600 mb-2">列分组 Column Groups:</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-yellow-50 border border-yellow-200 rounded"></span>
                    <span>销售数据</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-blue-50 border border-blue-200 rounded"></span>
                    <span>到仓数据</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-purple-50 border border-purple-200 rounded"></span>
                    <span>发货数据</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-orange-50 border border-orange-200 rounded"></span>
                    <span>出货数据</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-green-50 border border-green-200 rounded"></span>
                    <span>下单数据</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200 text-xs text-gray-500">
              <strong>注意 Note:</strong> 预计到仓周、发货周、出货周、下单周列目前显示为"-"，等待后端反推算法实现。
              <br />
              Planned arrival/ship/factory/order weeks show "-" pending backend backtracking algorithm implementation.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
