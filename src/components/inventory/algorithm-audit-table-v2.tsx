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
import type { AlgorithmAuditResultV2 } from '@/lib/types/database'
import type { Product } from '@/lib/types/database'
import { cn } from '@/lib/utils'

interface AlgorithmAuditTableV2Props {
  products: Product[]
  selectedSku: string
  auditData: AlgorithmAuditResultV2
}

export function AlgorithmAuditTableV2({
  products,
  selectedSku,
  auditData
}: AlgorithmAuditTableV2Props) {
  const router = useRouter()
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())

  const { rows, metadata, leadTimes } = auditData

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

  const getStockStatusBadge = (status: string) => {
    switch (status) {
      case 'Stockout':
        return <Badge variant="danger" className="font-semibold text-xs">缺货</Badge>
      case 'Risk':
        return <Badge variant="warning" className="font-semibold text-xs">风险</Badge>
      case 'OK':
        return <Badge variant="success" className="text-xs">正常</Badge>
      default:
        return <Badge variant="default" className="text-xs">{status}</Badge>
    }
  }

  const getStockCellClass = (stock: number, threshold: number) => {
    if (stock <= 0) return 'bg-red-600 text-white font-bold'
    if (stock < threshold) return 'bg-orange-100 text-orange-900 font-semibold'
    return ''
  }

  const getTurnoverClass = (turnover: number | null) => {
    if (turnover === null) return 'text-gray-400'
    if (turnover >= 1) return 'text-green-600 font-semibold'
    if (turnover >= 0.5) return 'text-yellow-600 font-semibold'
    return 'text-red-600 font-bold'
  }

  const formatTurnover = (turnover: number | null) => {
    if (turnover === null) return '-'
    return `${turnover.toFixed(1)}x`
  }

  // Total columns: 21
  const TOTAL_COLS = 21

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

      {/* Lead Times Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="font-medium text-gray-700">提前期参数 Lead Times:</div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">生产周期:</span>
              <span className="font-semibold">{leadTimes.production_weeks}周</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">装运准备:</span>
              <span className="font-semibold">{leadTimes.loading_weeks}周</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">运输时间:</span>
              <span className="font-semibold">{leadTimes.shipping_weeks}周</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">安全库存:</span>
              <span className="font-semibold">{leadTimes.safety_stock_weeks}周</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table Card */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1800px]">
              {/* Double-layer Header */}
              <thead>
                {/* First Layer - Group Headers */}
                <tr className="bg-gray-200">
                  <th colSpan={2} className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold">
                    基础信息<br /><span className="text-gray-500 font-normal">Basic</span>
                  </th>
                  <th colSpan={3} className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold bg-yellow-100">
                    销售数据<br /><span className="text-gray-500 font-normal">Sales</span>
                  </th>
                  <th colSpan={5} className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold bg-blue-100">
                    到仓数据<br /><span className="text-gray-500 font-normal">Arrival</span>
                  </th>
                  <th colSpan={2} className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold bg-purple-100">
                    发货数据<br /><span className="text-gray-500 font-normal">Ship</span>
                  </th>
                  <th colSpan={2} className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold bg-orange-100">
                    出货数据<br /><span className="text-gray-500 font-normal">Factory</span>
                  </th>
                  <th colSpan={2} className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold bg-green-100">
                    下单数据<br /><span className="text-gray-500 font-normal">Order</span>
                  </th>
                  <th colSpan={5} className="border-b border-gray-300 px-2 py-2 text-center font-semibold bg-gray-100">
                    库存计算<br /><span className="text-gray-500 font-normal">Inventory</span>
                  </th>
                </tr>

                {/* Second Layer - Column Headers */}
                <tr className="bg-gray-100">
                  {/* Basic Info (2 cols) */}
                  <th className="sticky left-0 z-20 bg-gray-100 border-b border-r-2 border-gray-300 px-2 py-2 text-left font-semibold whitespace-nowrap">
                    周次<br />Week
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-left font-semibold whitespace-nowrap">
                    起始日<br />Start
                  </th>

                  {/* Sales Data (3 cols) */}
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap bg-yellow-50">
                    预计销量<br />Forecast
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap bg-yellow-50">
                    实际销量<br />Actual
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap bg-yellow-50">
                    销量取值<br />Effective
                  </th>

                  {/* Arrival Data (5 cols) */}
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap bg-blue-50">
                    预计到仓周<br />Plan Week
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap bg-blue-50">
                    预计到仓量<br />Plan Qty
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap bg-blue-50">
                    实际到仓周<br />Act Week
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap bg-blue-50">
                    实际到仓量<br />Act Qty
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap bg-blue-50">
                    到仓取值<br />Effective
                  </th>

                  {/* Ship Data (2 cols) */}
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap bg-purple-50">
                    预计发货周<br />Plan Ship
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap bg-purple-50">
                    实际发货周<br />Act Ship
                  </th>

                  {/* Factory Ship Data (2 cols) */}
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap bg-orange-50">
                    预计出货周<br />Plan Factory
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap bg-orange-50">
                    实际出货周<br />Act Factory
                  </th>

                  {/* Order Data (2 cols) */}
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap bg-green-50">
                    预计下单周<br />Plan Order
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap bg-green-50">
                    实际下单周<br />Act Order
                  </th>

                  {/* Inventory Calculation (5 cols) */}
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    期初库存<br />Opening
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    期末库存<br />Closing
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    安全库存<br />Safety
                  </th>
                  <th className="border-b border-r border-gray-300 px-2 py-2 text-right font-semibold whitespace-nowrap">
                    周转率<br />Turnover
                  </th>
                  <th className="border-b border-gray-300 px-2 py-2 text-center font-semibold whitespace-nowrap">
                    状态<br />Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const isExpanded = expandedWeeks.has(row.week_iso)
                  const hasShipments = row.shipments.length > 0
                  const borderClass = row.is_current ? 'border-l-4 border-l-blue-400' : ''

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
                        {/* Week (Fixed Column) */}
                        <td className={cn(
                          'sticky left-0 z-10 bg-white border-r-2 border-gray-300 px-2 py-1.5 font-mono font-semibold',
                          row.is_current && 'bg-blue-50 border-l-4 border-l-blue-400'
                        )}>
                          {row.week_iso}
                          {row.is_current && (
                            <span className="ml-1 text-blue-600">*</span>
                          )}
                        </td>

                        {/* Week Start Date */}
                        <td className="border-r border-gray-200 px-2 py-1.5 text-gray-600">
                          {row.week_start_date}
                        </td>

                        {/* Sales Forecast */}
                        <td className="border-r border-gray-200 px-2 py-1.5 text-right bg-yellow-50">
                          {formatNumber(row.sales_forecast)}
                        </td>

                        {/* Sales Actual */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-right',
                          row.sales_actual !== null
                            ? 'bg-green-50 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.sales_actual !== null ? formatNumber(row.sales_actual) : '-'}
                        </td>

                        {/* Sales Effective */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-right font-semibold',
                          row.sales_source === 'actual'
                            ? 'bg-green-100'
                            : 'bg-yellow-100'
                        )}>
                          {formatNumber(row.sales_effective)}
                        </td>

                        {/* Planned Arrival Week */}
                        <td className="border-r border-gray-200 px-2 py-1.5 text-center bg-sky-50 font-mono text-xs">
                          {row.planned_arrival_week}
                        </td>

                        {/* Planned Arrival Qty */}
                        <td className="border-r border-gray-200 px-2 py-1.5 text-right bg-sky-50">
                          {formatNumber(row.planned_arrival_qty)}
                        </td>

                        {/* Actual Arrival Week */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-center font-mono text-xs',
                          row.actual_arrival_week
                            ? 'bg-green-50 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.actual_arrival_week || '-'}
                        </td>

                        {/* Actual Arrival Qty */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-right',
                          row.actual_arrival_qty > 0
                            ? 'bg-green-50 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.actual_arrival_qty > 0 ? formatNumber(row.actual_arrival_qty) : '-'}
                        </td>

                        {/* Arrival Effective (Clickable for details) */}
                        <td
                          className={cn(
                            'border-r border-gray-200 px-2 py-1.5 text-right font-semibold',
                            hasShipments && 'cursor-pointer hover:bg-blue-100',
                            row.arrival_effective > 0
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-50 text-gray-400'
                          )}
                          onClick={() => hasShipments && toggleWeek(row.week_iso)}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {hasShipments && (
                              isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                            )}
                            <span>{row.arrival_effective > 0 ? formatNumber(row.arrival_effective) : '-'}</span>
                          </div>
                        </td>

                        {/* Planned Ship Week */}
                        <td className="border-r border-gray-200 px-2 py-1.5 text-center bg-purple-50 font-mono text-xs">
                          {row.planned_ship_week}
                        </td>

                        {/* Actual Ship Week */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-center font-mono text-xs',
                          row.actual_ship_week
                            ? 'bg-green-50 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.actual_ship_week || '-'}
                        </td>

                        {/* Planned Factory Ship Week */}
                        <td className="border-r border-gray-200 px-2 py-1.5 text-center bg-orange-50 font-mono text-xs">
                          {row.planned_factory_ship_week}
                        </td>

                        {/* Actual Factory Ship Week */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-center font-mono text-xs',
                          row.actual_factory_ship_week
                            ? 'bg-green-50 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.actual_factory_ship_week || '-'}
                        </td>

                        {/* Planned Order Week */}
                        <td className="border-r border-gray-200 px-2 py-1.5 text-center bg-green-50 font-mono text-xs">
                          {row.planned_order_week}
                        </td>

                        {/* Actual Order Week */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-center font-mono text-xs',
                          row.actual_order_week
                            ? 'bg-green-50 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.actual_order_week || '-'}
                        </td>

                        {/* Opening Stock */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-right font-medium',
                          row.is_past && 'bg-green-50'
                        )}>
                          {formatNumber(row.opening_stock)}
                        </td>

                        {/* Closing Stock */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-right font-bold',
                          getStockCellClass(row.closing_stock, row.safety_threshold)
                        )}>
                          {formatNumber(row.closing_stock)}
                        </td>

                        {/* Safety Threshold */}
                        <td className="border-r border-gray-200 px-2 py-1.5 text-right text-gray-500">
                          {formatNumber(Math.round(row.safety_threshold))}
                        </td>

                        {/* Turnover Ratio */}
                        <td className={cn(
                          'border-r border-gray-200 px-2 py-1.5 text-right',
                          getTurnoverClass(row.turnover_ratio)
                        )}>
                          {formatTurnover(row.turnover_ratio)}
                        </td>

                        {/* Status */}
                        <td className="px-2 py-1.5 text-center">
                          {getStockStatusBadge(row.stock_status)}
                        </td>
                      </tr>

                      {/* Expanded Shipment Details */}
                      {isExpanded && hasShipments && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={TOTAL_COLS} className="px-6 py-4 border-b border-gray-200">
                            <div className="text-sm">
                              <div className="font-semibold mb-3 text-gray-700">
                                发运明细 Shipment Details ({row.shipments.length}):
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
                                      <span className="text-gray-500">计划发货:</span>
                                      <span className="px-2 py-1 bg-purple-50 border border-purple-200 rounded text-xs">
                                        {shipment.planned_departure_date || '-'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">实际发货:</span>
                                      <span className={cn(
                                        'px-2 py-1 rounded text-xs',
                                        shipment.actual_departure_date
                                          ? 'bg-green-50 border border-green-200 font-medium'
                                          : 'bg-gray-50 border border-gray-200 text-gray-400'
                                      )}>
                                        {shipment.actual_departure_date || '-'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">计划到仓:</span>
                                      <span className="px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs">
                                        {shipment.planned_arrival_date || '-'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">实际到仓:</span>
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

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium text-gray-700 mb-2">数据来源 Data Source</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
                  <span>实际数据 Actual</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-50 border border-yellow-200 rounded"></div>
                  <span>预测数据 Forecast</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-sky-50 border border-sky-200 rounded"></div>
                  <span>反推计算 Backtrack</span>
                </div>
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-700 mb-2">周转率 Turnover</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold">1.5x</span>
                  <span>正常 (&ge;1.0)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-600 font-semibold">0.7x</span>
                  <span>警告 (0.5-1.0)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-600 font-bold">0.3x</span>
                  <span>危险 (&lt;0.5)</span>
                </div>
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-700 mb-2">库存状态 Stock Status</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="text-xs">正常</Badge>
                  <span>库存充足</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="text-xs">风险</Badge>
                  <span>低于安全库存</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="danger" className="text-xs">缺货</Badge>
                  <span>库存为零</span>
                </div>
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-700 mb-2">供应链流程 Supply Chain</div>
              <div className="text-xs text-gray-500 leading-relaxed">
                下单 &rarr; 出货 &rarr; 发货 &rarr; 到仓 &rarr; 销售<br />
                Order &rarr; Factory &rarr; Ship &rarr; Arrival &rarr; Sale
              </div>
            </div>
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
    </div>
  )
}
