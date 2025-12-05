'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ================================================================
// TYPE DEFINITIONS (Temporary - will be moved to @/lib/types/database)
// ================================================================

export type CoverageStatus = 'Fully Covered' | 'Partially Covered' | 'Uncovered' | 'Unknown'
export type PropagationConfidence = 'high' | 'medium' | 'low' | 'none'
export type PropagationSourceType =
  | 'actual_order'
  | 'actual_factory_ship'
  | 'actual_ship'
  | 'actual_arrival'
  | 'reverse_calc'

export interface PropagationSource {
  source_type: PropagationSourceType
  source_week: string
  confidence: PropagationConfidence
}

export interface OrderDetailV4 {
  po_id: string
  po_number: string
  ordered_qty: number
  order_date: string
  order_week: string
  fulfillment_status: 'Complete' | 'Partial' | 'Pending'
  delivered_qty: number
  pending_qty: number
  supplier_name: string | null
}

export interface DeliveryDetailV4 {
  delivery_id: string
  delivery_number: string
  po_number: string
  delivered_qty: number
  delivery_date: string
  delivery_week: string
  shipment_status: 'Fully Shipped' | 'Partially Shipped' | 'Awaiting Shipment'
  shipped_qty: number
  unshipped_qty: number
}

export interface ShipmentDetailV4 {
  shipment_id: string
  tracking_number: string
  delivery_number: string | null
  shipped_qty: number
  departure_date: string | null
  arrival_date: string | null
  planned_arrival_week: string
  actual_arrival_week: string | null
  current_status: 'Arrived' | 'In Transit' | 'Departed' | 'Awaiting'
}

export interface ArrivalDetailV4 {
  shipment_id: string
  tracking_number: string
  po_number: string | null
  arrived_qty: number
  arrival_date: string
  arrival_week: string
  warehouse_code: string
  destination_warehouse_name: string
}

export interface AlgorithmAuditRowV4 {
  // Basic week information
  week_iso: string
  week_start_date: string
  week_offset: number
  is_past: boolean
  is_current: boolean

  // Sales data
  sales_forecast: number
  sales_actual: number | null
  sales_effective: number

  // Order data
  planned_order: number
  actual_order: number
  order_effective: number

  // Factory ship data
  planned_factory_ship: number
  actual_factory_ship: number
  factory_ship_effective: number

  // Ship data
  planned_ship: number
  actual_ship: number
  ship_effective: number

  // Arrival data
  planned_arrival: number
  actual_arrival: number
  arrival_effective: number

  // Inventory data
  opening_stock: number
  closing_stock: number
  safety_threshold: number
  stock_status: 'OK' | 'Risk' | 'Stockout'

  // V4 Extensions: Coverage & Lineage
  sales_coverage_status: CoverageStatus
  sales_uncovered_qty: number

  // Lineage metadata
  planned_factory_ship_source?: PropagationSource[]
  planned_ship_source?: PropagationSource[]
  planned_arrival_source?: PropagationSource[]

  // Detailed data
  order_details: OrderDetailV4[]
  factory_ship_details: DeliveryDetailV4[]
  ship_details: ShipmentDetailV4[]
  arrival_details: ArrivalDetailV4[]
}

// ================================================================
// COMPONENT PROPS
// ================================================================

interface AlgorithmAuditTableV4Props {
  rows: AlgorithmAuditRowV4[]
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

function getCoverageBadgeVariant(status: CoverageStatus): 'success' | 'warning' | 'danger' | 'default' {
  switch (status) {
    case 'Fully Covered':
      return 'success'
    case 'Partially Covered':
      return 'warning'
    case 'Uncovered':
      return 'danger'
    default:
      return 'default'
  }
}

function getCoverageLabel(status: CoverageStatus, uncoveredQty: number): string {
  switch (status) {
    case 'Fully Covered':
      return '✓ 全覆盖'
    case 'Partially Covered':
      return `⚠ 缺 ${uncoveredQty}`
    case 'Uncovered':
      return '✗ 未覆盖'
    default:
      return '未知'
  }
}

function getFulfillmentBadgeVariant(status: 'Complete' | 'Partial' | 'Pending'): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'Complete':
      return 'success'
    case 'Partial':
      return 'warning'
    default:
      return 'default'
  }
}

function getShipmentStatusBadgeVariant(
  status: 'Fully Shipped' | 'Partially Shipped' | 'Awaiting Shipment'
): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'Fully Shipped':
      return 'success'
    case 'Partially Shipped':
      return 'warning'
    default:
      return 'default'
  }
}

function getShipmentCurrentStatusBadge(
  status: 'Arrived' | 'In Transit' | 'Departed' | 'Awaiting'
): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'Arrived':
      return 'success'
    case 'In Transit':
    case 'Departed':
      return 'warning'
    default:
      return 'default'
  }
}

function getSourceTypeLabel(sourceType: PropagationSourceType): string {
  switch (sourceType) {
    case 'actual_order':
      return '基于实际订单'
    case 'actual_factory_ship':
      return '基于实际工厂出货'
    case 'actual_ship':
      return '基于实际物流发货'
    case 'actual_arrival':
      return '基于实际到仓'
    case 'reverse_calc':
      return '反推计算'
    default:
      return '未知来源'
  }
}

function getConfidenceLabel(confidence: PropagationConfidence): string {
  switch (confidence) {
    case 'high':
      return '高'
    case 'medium':
      return '中'
    case 'low':
      return '低'
    default:
      return '无'
  }
}

function formatValue(value: number | null): string {
  if (value === null || value === 0) return '-'
  return value.toString()
}

// ================================================================
// SUB-COMPONENTS
// ================================================================

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
}

function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        {children}
      </div>
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
          {content}
        </div>
      )}
    </div>
  )
}

interface ExpandedDetailsProps {
  row: AlgorithmAuditRowV4
  type: 'order' | 'factory_ship' | 'ship' | 'arrival'
}

function ExpandedDetails({ row, type }: ExpandedDetailsProps) {
  if (type === 'order' && row.order_details.length > 0) {
    const totalOrdered = row.order_details.reduce((sum, o) => sum + o.ordered_qty, 0)
    const totalDelivered = row.order_details.reduce((sum, o) => sum + o.delivered_qty, 0)
    const totalPending = row.order_details.reduce((sum, o) => sum + o.pending_qty, 0)

    return (
      <div className="p-4 bg-blue-50 border-l-4 border-blue-500">
        <h4 className="font-semibold text-sm mb-3 text-blue-900">订单详情 - {row.week_iso}</h4>

        <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
          <div>
            <span className="text-gray-600">总订单量:</span>
            <span className="ml-2 font-semibold">{totalOrdered}</span>
          </div>
          <div>
            <span className="text-gray-600">已交付:</span>
            <span className="ml-2 font-semibold text-green-700">{totalDelivered}</span>
          </div>
          <div>
            <span className="text-gray-600">待交付:</span>
            <span className="ml-2 font-semibold text-orange-700">{totalPending}</span>
          </div>
          <div>
            <span className="text-gray-600">覆盖缺口:</span>
            <span className="ml-2 font-semibold text-red-700">{row.sales_uncovered_qty}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse bg-white rounded">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left border">PO号</th>
                <th className="px-3 py-2 text-left border">下单日期</th>
                <th className="px-3 py-2 text-left border">供应商</th>
                <th className="px-3 py-2 text-right border">订单量</th>
                <th className="px-3 py-2 text-right border">已交付</th>
                <th className="px-3 py-2 text-right border">待交付</th>
                <th className="px-3 py-2 text-center border">状态</th>
              </tr>
            </thead>
            <tbody>
              {row.order_details.map((order) => (
                <tr key={order.po_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border">
                    <Link
                      href={`/procurement/edit/${order.po_id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                      {order.po_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 border text-gray-700">{order.order_date}</td>
                  <td className="px-3 py-2 border text-gray-700">{order.supplier_name || '-'}</td>
                  <td className="px-3 py-2 border text-right font-medium">{order.ordered_qty}</td>
                  <td className="px-3 py-2 border text-right text-green-700">{order.delivered_qty}</td>
                  <td className="px-3 py-2 border text-right text-orange-700">{order.pending_qty}</td>
                  <td className="px-3 py-2 border text-center">
                    <Badge variant={getFulfillmentBadgeVariant(order.fulfillment_status)}>
                      {order.fulfillment_status === 'Complete' ? '✓ 完成' : ''}
                      {order.fulfillment_status === 'Partial' ? '⚠ 部分' : ''}
                      {order.fulfillment_status === 'Pending' ? '待处理' : ''}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (type === 'factory_ship' && row.factory_ship_details.length > 0) {
    return (
      <div className="p-4 bg-purple-50 border-l-4 border-purple-500">
        <h4 className="font-semibold text-sm mb-3 text-purple-900">工厂出货详情 - {row.week_iso}</h4>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse bg-white rounded">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left border">交货单号</th>
                <th className="px-3 py-2 text-left border">关联PO</th>
                <th className="px-3 py-2 text-left border">交货日期</th>
                <th className="px-3 py-2 text-right border">交货量</th>
                <th className="px-3 py-2 text-right border">已发货</th>
                <th className="px-3 py-2 text-right border">待发货</th>
                <th className="px-3 py-2 text-center border">发货状态</th>
              </tr>
            </thead>
            <tbody>
              {row.factory_ship_details.map((delivery) => (
                <tr key={delivery.delivery_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border font-medium">{delivery.delivery_number}</td>
                  <td className="px-3 py-2 border">
                    <span className="text-blue-600 text-xs">{delivery.po_number}</span>
                  </td>
                  <td className="px-3 py-2 border text-gray-700">{delivery.delivery_date}</td>
                  <td className="px-3 py-2 border text-right font-medium">{delivery.delivered_qty}</td>
                  <td className="px-3 py-2 border text-right text-green-700">{delivery.shipped_qty}</td>
                  <td className="px-3 py-2 border text-right text-orange-700">{delivery.unshipped_qty}</td>
                  <td className="px-3 py-2 border text-center">
                    <Badge variant={getShipmentStatusBadgeVariant(delivery.shipment_status)}>
                      {delivery.shipment_status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (type === 'ship' && row.ship_details.length > 0) {
    return (
      <div className="p-4 bg-orange-50 border-l-4 border-orange-500">
        <h4 className="font-semibold text-sm mb-3 text-orange-900">物流发货详情 - {row.week_iso}</h4>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse bg-white rounded">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left border">货柜号</th>
                <th className="px-3 py-2 text-left border">关联交货单</th>
                <th className="px-3 py-2 text-right border">发货量</th>
                <th className="px-3 py-2 text-left border">发货日期</th>
                <th className="px-3 py-2 text-left border">预计到达周</th>
                <th className="px-3 py-2 text-left border">实际到达日期</th>
                <th className="px-3 py-2 text-center border">状态</th>
              </tr>
            </thead>
            <tbody>
              {row.ship_details.map((shipment) => (
                <tr key={shipment.shipment_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border">
                    <Link
                      href={`/logistics/edit/${shipment.shipment_id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                      {shipment.tracking_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 border text-xs text-gray-600">
                    {shipment.delivery_number || '-'}
                  </td>
                  <td className="px-3 py-2 border text-right font-medium">{shipment.shipped_qty}</td>
                  <td className="px-3 py-2 border text-gray-700">{shipment.departure_date || '-'}</td>
                  <td className="px-3 py-2 border text-gray-700">{shipment.planned_arrival_week}</td>
                  <td className="px-3 py-2 border text-gray-700">{shipment.arrival_date || '-'}</td>
                  <td className="px-3 py-2 border text-center">
                    <Badge variant={getShipmentCurrentStatusBadge(shipment.current_status)}>
                      {shipment.current_status === 'Arrived' ? '✓ 已到仓' : ''}
                      {shipment.current_status === 'In Transit' ? '运输中' : ''}
                      {shipment.current_status === 'Departed' ? '已发货' : ''}
                      {shipment.current_status === 'Awaiting' ? '待发货' : ''}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (type === 'arrival' && row.arrival_details.length > 0) {
    return (
      <div className="p-4 bg-green-50 border-l-4 border-green-500">
        <h4 className="font-semibold text-sm mb-3 text-green-900">到仓详情 - {row.week_iso}</h4>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse bg-white rounded">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left border">货柜号</th>
                <th className="px-3 py-2 text-left border">关联PO</th>
                <th className="px-3 py-2 text-right border">到仓量</th>
                <th className="px-3 py-2 text-left border">到仓日期</th>
                <th className="px-3 py-2 text-left border">仓库代码</th>
                <th className="px-3 py-2 text-left border">仓库名称</th>
              </tr>
            </thead>
            <tbody>
              {row.arrival_details.map((arrival) => (
                <tr key={arrival.shipment_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border">
                    <Link
                      href={`/logistics/edit/${arrival.shipment_id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                      {arrival.tracking_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 border text-xs text-gray-600">{arrival.po_number || '-'}</td>
                  <td className="px-3 py-2 border text-right font-medium text-green-700">
                    {arrival.arrived_qty}
                  </td>
                  <td className="px-3 py-2 border text-gray-700">{arrival.arrival_date}</td>
                  <td className="px-3 py-2 border text-gray-700">{arrival.warehouse_code}</td>
                  <td className="px-3 py-2 border text-gray-700">
                    {arrival.destination_warehouse_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return null
}

// ================================================================
// MAIN COMPONENT
// ================================================================

export function AlgorithmAuditTableV4({ rows }: AlgorithmAuditTableV4Props) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRowExpansion = (weekIso: string, type: 'order' | 'factory_ship' | 'ship' | 'arrival') => {
    const key = `${weekIso}-${type}`
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const isExpanded = (weekIso: string, type: 'order' | 'factory_ship' | 'ship' | 'arrival') => {
    return expandedRows.has(`${weekIso}-${type}`)
  }

  const getStockStatusBadge = (status: 'OK' | 'Risk' | 'Stockout') => {
    const variants = {
      OK: 'success' as const,
      Risk: 'warning' as const,
      Stockout: 'danger' as const,
    }
    return <Badge variant={variants[status]}>{status}</Badge>
  }

  const getRowBgClass = (row: AlgorithmAuditRowV4): string => {
    if (row.is_current) return 'bg-blue-50'
    if (row.is_past) return 'bg-gray-50'
    return ''
  }

  const renderPlannedValueWithTooltip = (
    value: number,
    sources?: PropagationSource[]
  ) => {
    if (!sources || sources.length === 0) {
      return <span className="text-gray-700">{formatValue(value)}</span>
    }

    const highestConfidence = sources[0]?.confidence || 'none'
    const isLowConfidence = highestConfidence === 'low' || highestConfidence === 'none'

    const tooltipContent = (
      <div>
        <p className="font-semibold mb-2">数据来源:</p>
        {sources.map((source, idx) => (
          <p key={idx} className="mb-1">
            • {getSourceTypeLabel(source.source_type)}
            <br />
            <span className="text-gray-300 text-xs ml-2">(来自 {source.source_week})</span>
          </p>
        ))}
        <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-700">
          置信度: {getConfidenceLabel(highestConfidence)}
        </p>
      </div>
    )

    return (
      <Tooltip content={tooltipContent}>
        <span className={`inline-flex items-center gap-1 ${isLowConfidence ? 'text-gray-400' : 'text-gray-700'}`}>
          {formatValue(value)}
          <Info className="w-3 h-3 opacity-50" />
        </span>
      </Tooltip>
    )
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100">
          {/* Group headers */}
          <tr className="border-b">
            <th
              rowSpan={2}
              className="sticky left-0 z-20 bg-gray-100 px-3 py-2 text-left border-r-2 border-gray-300 font-semibold"
            >
              周次
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              销售
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              下单
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              工厂出货
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              物流发货
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              到仓
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center font-semibold"
            >
              库存
            </th>
          </tr>

          {/* Sub-headers */}
          <tr className="text-xs border-b">
            {/* Sales - 4 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center text-gray-600 font-semibold">取值</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-medium">
              覆盖
            </th>

            {/* Order - 4 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center text-gray-600 font-semibold">取值</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-medium">
              详情
            </th>

            {/* Factory Ship - 4 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center text-gray-600 font-semibold">取值</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-medium">
              详情
            </th>

            {/* Ship - 4 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center text-gray-600 font-semibold">取值</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-medium">
              详情
            </th>

            {/* Arrival - 4 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center text-gray-600 font-semibold">取值</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-medium">
              详情
            </th>

            {/* Inventory */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">期初</th>
            <th className="px-2 py-1 text-center text-gray-600 font-semibold">期末</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">安全</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">状态</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <React.Fragment key={row.week_iso}>
              {/* Main row */}
              <tr className={`border-b hover:bg-gray-50 ${getRowBgClass(row)}`}>
                {/* Week (Fixed Column) */}
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium border-r-2 border-gray-300">
                  <div className="flex items-center gap-2">
                    {row.week_iso}
                    {row.is_current && (
                      <Badge variant="default" className="text-xs">
                        当前
                      </Badge>
                    )}
                  </div>
                </td>

                {/* Sales Group - 4 columns */}
                <td className="px-2 py-2 text-right text-gray-700">
                  {formatValue(row.sales_forecast)}
                </td>
                <td
                  className={`px-2 py-2 text-right ${
                    row.sales_actual !== null
                      ? 'bg-green-50 font-semibold text-green-900'
                      : 'text-gray-400'
                  }`}
                >
                  {formatValue(row.sales_actual)}
                </td>
                <td className="px-2 py-2 text-right font-bold text-gray-900">
                  {row.sales_effective}
                </td>
                <td className="px-2 py-2 text-center">
                  {row.sales_effective > 0 && (
                    <Badge variant={getCoverageBadgeVariant(row.sales_coverage_status)}>
                      {getCoverageLabel(row.sales_coverage_status, row.sales_uncovered_qty)}
                    </Badge>
                  )}
                </td>

                {/* Order Group - 4 columns */}
                <td className="px-2 py-2 text-right text-gray-700">
                  {formatValue(row.planned_order)}
                </td>
                <td
                  className={`px-2 py-2 text-right ${
                    row.actual_order > 0
                      ? 'bg-green-50 font-semibold text-green-900'
                      : 'text-gray-400'
                  }`}
                >
                  {formatValue(row.actual_order)}
                </td>
                <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                  {row.order_effective}
                </td>
                <td className="px-2 py-2 text-center border-r border-gray-300">
                  {row.order_details.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRowExpansion(row.week_iso, 'order')}
                      className="h-6 w-6 p-0"
                    >
                      {isExpanded(row.week_iso, 'order') ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </td>

                {/* Factory Ship Group - 4 columns */}
                <td className="px-2 py-2 text-right">
                  {renderPlannedValueWithTooltip(row.planned_factory_ship, row.planned_factory_ship_source)}
                </td>
                <td
                  className={`px-2 py-2 text-right ${
                    row.actual_factory_ship > 0
                      ? 'bg-green-50 font-semibold text-green-900'
                      : 'text-gray-400'
                  }`}
                >
                  {formatValue(row.actual_factory_ship)}
                </td>
                <td className="px-2 py-2 text-right font-bold text-gray-900">
                  {row.factory_ship_effective}
                </td>
                <td className="px-2 py-2 text-center border-r border-gray-300">
                  {row.factory_ship_details.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRowExpansion(row.week_iso, 'factory_ship')}
                      className="h-6 w-6 p-0"
                    >
                      {isExpanded(row.week_iso, 'factory_ship') ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </td>

                {/* Ship Group - 4 columns */}
                <td className="px-2 py-2 text-right">
                  {renderPlannedValueWithTooltip(row.planned_ship, row.planned_ship_source)}
                </td>
                <td
                  className={`px-2 py-2 text-right ${
                    row.actual_ship > 0
                      ? 'bg-green-50 font-semibold text-green-900'
                      : 'text-gray-400'
                  }`}
                >
                  {formatValue(row.actual_ship)}
                </td>
                <td className="px-2 py-2 text-right font-bold text-gray-900">
                  {row.ship_effective}
                </td>
                <td className="px-2 py-2 text-center border-r border-gray-300">
                  {row.ship_details.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRowExpansion(row.week_iso, 'ship')}
                      className="h-6 w-6 p-0"
                    >
                      {isExpanded(row.week_iso, 'ship') ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </td>

                {/* Arrival Group - 4 columns */}
                <td className="px-2 py-2 text-right">
                  {renderPlannedValueWithTooltip(row.planned_arrival, row.planned_arrival_source)}
                </td>
                <td
                  className={`px-2 py-2 text-right ${
                    row.actual_arrival > 0
                      ? 'bg-green-50 font-semibold text-green-900'
                      : 'text-gray-400'
                  }`}
                >
                  {formatValue(row.actual_arrival)}
                </td>
                <td className="px-2 py-2 text-right font-bold text-gray-900">
                  {row.arrival_effective}
                </td>
                <td className="px-2 py-2 text-center border-r border-gray-300">
                  {row.arrival_details.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRowExpansion(row.week_iso, 'arrival')}
                      className="h-6 w-6 p-0"
                    >
                      {isExpanded(row.week_iso, 'arrival') ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </td>

                {/* Inventory Group */}
                <td className="px-2 py-2 text-right text-gray-700">
                  {row.opening_stock}
                </td>
                <td className="px-2 py-2 text-right font-bold text-gray-900">
                  {row.closing_stock}
                </td>
                <td className="px-2 py-2 text-right text-gray-500 text-xs">
                  {Math.round(row.safety_threshold)}
                </td>
                <td className="px-2 py-2 text-center">
                  {getStockStatusBadge(row.stock_status)}
                </td>
              </tr>

              {/* Expanded detail rows */}
              {isExpanded(row.week_iso, 'order') && (
                <tr>
                  <td colSpan={24} className="p-0 border-b">
                    <ExpandedDetails row={row} type="order" />
                  </td>
                </tr>
              )}
              {isExpanded(row.week_iso, 'factory_ship') && (
                <tr>
                  <td colSpan={24} className="p-0 border-b">
                    <ExpandedDetails row={row} type="factory_ship" />
                  </td>
                </tr>
              )}
              {isExpanded(row.week_iso, 'ship') && (
                <tr>
                  <td colSpan={24} className="p-0 border-b">
                    <ExpandedDetails row={row} type="ship" />
                  </td>
                </tr>
              )}
              {isExpanded(row.week_iso, 'arrival') && (
                <tr>
                  <td colSpan={24} className="p-0 border-b">
                    <ExpandedDetails row={row} type="arrival" />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
