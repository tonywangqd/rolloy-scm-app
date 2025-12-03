'use client'

/**
 * Algorithm Audit Table - Client Component
 * Interactive 16-week inventory calculation table with expandable shipment details
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
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-100 border-b border-r-2 border-gray-300 px-3 py-3 text-left font-semibold whitespace-nowrap">
                    周次<br />Week
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-left font-semibold whitespace-nowrap">
                    周起始日<br />Week Start
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    期初库存<br />Opening
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    预估下单<br />Forecast
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    实际下单<br />Actual
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    下单取值<br />Effective
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    出货预估<br />Ship Plan
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    出货实际<br />Ship Actual
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap cursor-pointer hover:bg-gray-200">
                    到仓数量<br />Incoming
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    本周变化<br />Net Change
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    期末库存<br />Closing
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-right font-semibold whitespace-nowrap">
                    安全库存<br />Safety
                  </th>
                  <th className="border-b border-gray-300 px-3 py-3 text-center font-semibold whitespace-nowrap">
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
                          'sticky left-0 z-10 bg-white border-r-2 border-gray-300 px-3 py-2 font-mono text-sm font-semibold',
                          row.is_current && 'bg-blue-50 border-l-4 border-l-blue-400'
                        )}>
                          {row.week_iso}
                          {row.is_current && (
                            <span className="ml-1 text-xs text-blue-600">▸</span>
                          )}
                        </td>

                        {/* Week Start Date */}
                        <td className="px-3 py-2 text-gray-600">
                          {row.week_start_date}
                        </td>

                        {/* Opening Stock */}
                        <td className={cn(
                          'px-3 py-2 text-right font-medium border border-transparent',
                          row.is_past ? 'bg-green-50 border-green-200' : ''
                        )}>
                          {formatNumber(row.opening_stock)}
                        </td>

                        {/* Sales Forecast */}
                        <td className="px-3 py-2 text-right bg-yellow-50 border border-yellow-200">
                          {formatNumber(row.sales_forecast)}
                        </td>

                        {/* Sales Actual */}
                        <td className={cn(
                          'px-3 py-2 text-right border border-transparent',
                          row.sales_actual !== null
                            ? 'bg-green-50 border-green-200 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.sales_actual !== null ? formatNumber(row.sales_actual) : '-'}
                        </td>

                        {/* Sales Effective */}
                        <td className={cn(
                          'px-3 py-2 text-right font-semibold border border-transparent',
                          row.sales_source === 'actual'
                            ? 'bg-green-50 border-green-200'
                            : 'bg-yellow-50 border-yellow-200'
                        )}>
                          {formatNumber(row.sales_effective)}
                        </td>

                        {/* Shipment Planned */}
                        <td className="px-3 py-2 text-right bg-yellow-50 border border-yellow-200">
                          {row.shipment_planned_qty > 0 ? formatNumber(row.shipment_planned_qty) : '-'}
                        </td>

                        {/* Shipment Actual */}
                        <td className={cn(
                          'px-3 py-2 text-right border border-transparent',
                          row.shipment_actual_qty > 0
                            ? 'bg-green-50 border-green-200 font-medium'
                            : 'bg-gray-50 text-gray-400'
                        )}>
                          {row.shipment_actual_qty > 0 ? formatNumber(row.shipment_actual_qty) : '-'}
                        </td>

                        {/* Incoming (Clickable) */}
                        <td
                          className={cn(
                            'px-3 py-2 text-right font-semibold border border-transparent',
                            hasShipments && 'cursor-pointer hover:bg-blue-50',
                            row.incoming_qty > 0 && 'text-blue-600'
                          )}
                          onClick={() => hasShipments && toggleWeek(row.week_iso)}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {hasShipments && (
                              isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                            )}
                            <span>{row.incoming_qty > 0 ? formatNumber(row.incoming_qty) : '-'}</span>
                          </div>
                        </td>

                        {/* Net Change */}
                        <td className={cn(
                          'px-3 py-2 text-right font-semibold',
                          row.incoming_qty - row.outgoing_qty > 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                          {row.incoming_qty - row.outgoing_qty > 0 ? '+' : ''}
                          {formatNumber(row.incoming_qty - row.outgoing_qty)}
                        </td>

                        {/* Closing Stock */}
                        <td className={cn(
                          'px-3 py-2 text-right font-bold border border-transparent',
                          getStockCellClass(row.closing_stock, row.safety_threshold)
                        )}>
                          {formatNumber(row.closing_stock)}
                        </td>

                        {/* Safety Threshold */}
                        <td className="px-3 py-2 text-right text-gray-500">
                          {formatNumber(Math.round(row.safety_threshold))}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2 text-center">
                          {getStockStatusBadge(row.stock_status)}
                        </td>
                      </tr>

                      {/* Expanded Shipment Details */}
                      {isExpanded && hasShipments && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={13} className="px-6 py-4 border-b border-gray-200">
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
    </div>
  )
}
