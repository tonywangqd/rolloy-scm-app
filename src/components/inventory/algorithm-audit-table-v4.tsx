'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

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

// Removed unused badge variant functions - replaced with inline tooltip content

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

// ================================================================
// TOOLTIP TYPES
// ================================================================

type TooltipColumnType =
  | 'sales_forecast'
  | 'sales_actual'
  | 'sales_effective'
  | 'order_planned'
  | 'order_actual'
  | 'order_effective'
  | 'factory_ship_planned'
  | 'factory_ship_actual'
  | 'factory_ship_effective'
  | 'ship_planned'
  | 'ship_actual'
  | 'ship_effective'
  | 'arrival_planned'
  | 'arrival_actual'
  | 'arrival_effective'
  | 'inventory_opening'
  | 'inventory_closing'
  | 'inventory_safety'
  | 'inventory_status'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
}

function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [delayTimeout, setDelayTimeout] = useState<NodeJS.Timeout | null>(null)
  const [position, setPosition] = useState<'top' | 'bottom'>('top')
  const triggerRef = React.useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    // Calculate best position for tooltip
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      // If not enough space above (< 200px), show below
      setPosition(spaceAbove < 200 && spaceBelow > spaceAbove ? 'bottom' : 'top')
    }

    const timeout = setTimeout(() => {
      setIsVisible(true)
    }, 300)
    setDelayTimeout(timeout)
  }

  const handleMouseLeave = () => {
    if (delayTimeout) {
      clearTimeout(delayTimeout)
    }
    setIsVisible(false)
  }

  return (
    <div className="relative inline-block" ref={triggerRef}>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-help border-b border-dashed border-gray-300 hover:border-gray-500 transition-colors"
      >
        {children}
      </div>
      {isVisible && (
        <div
          className={`fixed z-[9999] w-80 max-w-[90vw] p-4 bg-white border border-gray-200 rounded-lg shadow-xl ${
            position === 'top' ? 'transform -translate-x-1/2' : 'transform -translate-x-1/2'
          }`}
          style={{
            left: triggerRef.current ? triggerRef.current.getBoundingClientRect().left + triggerRef.current.offsetWidth / 2 : 0,
            ...(position === 'top'
              ? { bottom: window.innerHeight - (triggerRef.current?.getBoundingClientRect().top || 0) + 8 }
              : { top: (triggerRef.current?.getBoundingClientRect().bottom || 0) + 8 }
            ),
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className={`absolute left-1/2 -translate-x-1/2 ${position === 'top' ? 'top-full -mt-1' : 'bottom-full -mb-1'}`}>
            <div className={`border-8 border-transparent ${position === 'top' ? 'border-t-white' : 'border-b-white'}`}></div>
          </div>
          {content}
        </div>
      )}
    </div>
  )
}

// ================================================================
// DATA PROVENANCE TOOLTIP COMPONENT
// ================================================================

interface DataProvenanceTooltipProps {
  columnType: TooltipColumnType
  rowData: AlgorithmAuditRowV4
  children: React.ReactNode
  disabled?: boolean
}

function DataProvenanceTooltip({ columnType, rowData, children, disabled = false }: DataProvenanceTooltipProps) {
  if (disabled) {
    return <>{children}</>
  }

  const tooltipContent = generateTooltipContent(columnType, rowData)

  return (
    <Tooltip content={tooltipContent}>
      {children}
    </Tooltip>
  )
}

// ================================================================
// TOOLTIP CONTENT GENERATOR
// ================================================================

function generateTooltipContent(columnType: TooltipColumnType, rowData: AlgorithmAuditRowV4): React.ReactNode {
  switch (columnType) {
    case 'sales_forecast':
      return generateSalesForecastTooltip(rowData)
    case 'sales_actual':
      return generateSalesActualTooltip(rowData)
    case 'sales_effective':
      return generateSalesEffectiveTooltip(rowData)
    case 'order_planned':
      return generateOrderPlannedTooltip(rowData)
    case 'order_actual':
      return generateOrderActualTooltip(rowData)
    case 'order_effective':
      return generateOrderEffectiveTooltip(rowData)
    case 'factory_ship_planned':
      return generateFactoryShipPlannedTooltip(rowData)
    case 'factory_ship_actual':
      return generateFactoryShipActualTooltip(rowData)
    case 'factory_ship_effective':
      return generateFactoryShipEffectiveTooltip(rowData)
    case 'ship_planned':
      return generateShipPlannedTooltip(rowData)
    case 'ship_actual':
      return generateShipActualTooltip(rowData)
    case 'ship_effective':
      return generateShipEffectiveTooltip(rowData)
    case 'arrival_planned':
      return generateArrivalPlannedTooltip(rowData)
    case 'arrival_actual':
      return generateArrivalActualTooltip(rowData)
    case 'arrival_effective':
      return generateArrivalEffectiveTooltip(rowData)
    case 'inventory_opening':
      return generateInventoryOpeningTooltip(rowData)
    case 'inventory_closing':
      return generateInventoryClosingTooltip(rowData)
    case 'inventory_safety':
      return generateInventorySafetyTooltip(rowData)
    case 'inventory_status':
      return generateInventoryStatusTooltip(rowData)
    default:
      return null
  }
}

function generateSalesForecastTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">销售 Sales (预测)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.sales_forecast} units</div>
        <div className="text-xs text-gray-600 mt-1">Source: Sales forecast (sales_forecasts)</div>
        <div className="text-xs text-gray-500 mt-1">Week: {row.week_iso}</div>
      </div>
    </div>
  )
}

function generateSalesActualTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">销售 Sales (实际)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">
          Value: {row.sales_actual !== null ? `${row.sales_actual} units` : 'No actual data yet'}
        </div>
        <div className="text-xs text-gray-600 mt-1">
          Source: {row.sales_actual !== null ? 'Actual sales (sales_actuals)' : 'Not yet recorded'}
        </div>
        <div className="text-xs text-gray-500 mt-1">Week: {row.week_iso}</div>
      </div>
    </div>
  )
}

function generateSalesEffectiveTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">销售 Sales (取值)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.sales_effective} units</div>
        <div className="text-xs text-gray-600 mt-1">
          Source: {row.sales_actual !== null ? 'Actual (优先使用实际数据)' : 'Forecast (使用预测数据)'}
        </div>
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
          Formula: COALESCE(actual, forecast)
        </div>
      </div>
    </div>
  )
}

function generateOrderPlannedTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📦</span>
        <h4 className="text-sm font-semibold text-gray-900">下单 Order (预计)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.planned_order} units</div>
        <div className="text-xs text-gray-600 mt-1">Source: Planned orders (not yet implemented)</div>
        <div className="text-xs text-gray-500 mt-1">Week: {row.week_iso}</div>
      </div>
    </div>
  )
}

function generateOrderActualTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📦</span>
          <h4 className="text-sm font-semibold text-gray-900">下单 Order (实际)</h4>
        </div>
        <span className="text-xs text-gray-500">{row.week_iso}</span>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.actual_order} units</div>
        <div className="text-xs text-gray-600 mt-1">Source: Actual purchase orders</div>
      </div>

      {row.order_details.length > 0 && (
        <>
          <div className="border-t border-gray-200 pt-2">
            <div className="text-xs font-semibold text-gray-700 mb-2">Details:</div>
            <ul className="space-y-1.5">
              {row.order_details.map((order, idx) => (
                <li key={idx} className="text-xs">
                  <Link
                    href={`/procurement/edit/${order.po_id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {order.po_number}
                  </Link>
                  {': '}
                  <span className="text-gray-900">{order.ordered_qty} units</span>
                  {' '}
                  <span className="text-gray-500">
                    ({order.fulfillment_status === 'Complete' ? '✓ Delivered' : order.fulfillment_status})
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-200 pt-2">
            <Badge variant={getCoverageBadgeVariant(row.sales_coverage_status)}>
              {row.sales_coverage_status}
            </Badge>
            {row.sales_uncovered_qty > 0 && (
              <span className="text-xs text-gray-600 ml-2">Gap: {row.sales_uncovered_qty} units</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function generateOrderEffectiveTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📦</span>
        <h4 className="text-sm font-semibold text-gray-900">下单 Order (取值)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.order_effective} units</div>
        <div className="text-xs text-gray-600 mt-1">
          Source: {row.actual_order > 0 ? 'Actual (优先使用实际数据)' : 'Planned (使用预计数据)'}
        </div>
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
          Formula: COALESCE(actual, planned)
        </div>
      </div>
    </div>
  )
}

function generateFactoryShipPlannedTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  const sources = row.planned_factory_ship_source || []

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏭</span>
        <h4 className="text-sm font-semibold text-gray-900">工厂出货 Factory Ship (预计)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.planned_factory_ship} units</div>
        {sources.length > 0 && (
          <div className="mt-2">
            <div className="text-xs font-semibold text-gray-700 mb-1">Data Source:</div>
            {sources.map((source, idx) => (
              <div key={idx} className="text-xs text-gray-600">
                • {getSourceTypeLabel(source.source_type)}
                <span className="text-gray-400 ml-1">(from {source.source_week}, {getConfidenceLabel(source.confidence)} confidence)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function generateFactoryShipActualTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏭</span>
          <h4 className="text-sm font-semibold text-gray-900">工厂出货 Factory Ship (实际)</h4>
        </div>
        <span className="text-xs text-gray-500">{row.week_iso}</span>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.actual_factory_ship} units</div>
        <div className="text-xs text-gray-600 mt-1">Source: Actual production deliveries</div>
      </div>

      {row.factory_ship_details.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-700 mb-2">Details:</div>
          <ul className="space-y-1.5">
            {row.factory_ship_details.map((delivery, idx) => (
              <li key={idx} className="text-xs">
                <span className="font-medium text-gray-900">{delivery.delivery_number}</span>
                {': '}
                <span className="text-gray-900">{delivery.delivered_qty} units</span>
                {' '}
                <span className="text-gray-500">(from {delivery.po_number})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function generateFactoryShipEffectiveTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏭</span>
        <h4 className="text-sm font-semibold text-gray-900">工厂出货 Factory Ship (取值)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.factory_ship_effective} units</div>
        <div className="text-xs text-gray-600 mt-1">
          Source: {row.actual_factory_ship > 0 ? 'Actual (优先使用实际数据)' : 'Planned (使用预计数据)'}
        </div>
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
          Formula: COALESCE(actual, planned)
        </div>
      </div>
    </div>
  )
}

function generateShipPlannedTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  const sources = row.planned_ship_source || []

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🚢</span>
        <h4 className="text-sm font-semibold text-gray-900">物流发货 Ship (预计)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.planned_ship} units</div>
        {sources.length > 0 && (
          <div className="mt-2">
            <div className="text-xs font-semibold text-gray-700 mb-1">Data Source:</div>
            {sources.map((source, idx) => (
              <div key={idx} className="text-xs text-gray-600">
                • {getSourceTypeLabel(source.source_type)}
                <span className="text-gray-400 ml-1">(from {source.source_week}, {getConfidenceLabel(source.confidence)} confidence)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function generateShipActualTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚢</span>
          <h4 className="text-sm font-semibold text-gray-900">物流发货 Ship (实际)</h4>
        </div>
        <span className="text-xs text-gray-500">{row.week_iso}</span>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.actual_ship} units</div>
        <div className="text-xs text-gray-600 mt-1">Source: Actual shipment departures</div>
      </div>

      {row.ship_details.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-700 mb-2">Details:</div>
          <ul className="space-y-1.5">
            {row.ship_details.map((shipment, idx) => (
              <li key={idx} className="text-xs">
                <Link
                  href={`/logistics/edit/${shipment.shipment_id}`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {shipment.tracking_number}
                </Link>
                {': '}
                <span className="text-gray-900">{shipment.shipped_qty} units</span>
                {' '}
                <span className="text-gray-500">({shipment.current_status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function generateShipEffectiveTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🚢</span>
        <h4 className="text-sm font-semibold text-gray-900">物流发货 Ship (取值)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.ship_effective} units</div>
        <div className="text-xs text-gray-600 mt-1">
          Source: {row.actual_ship > 0 ? 'Actual (优先使用实际数据)' : 'Planned (使用预计数据)'}
        </div>
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
          Formula: COALESCE(actual, planned)
        </div>
      </div>
    </div>
  )
}

function generateArrivalPlannedTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  const sources = row.planned_arrival_source || []

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📥</span>
        <h4 className="text-sm font-semibold text-gray-900">到货 Arrival (预计)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.planned_arrival} units</div>
        {sources.length > 0 && (
          <div className="mt-2">
            <div className="text-xs font-semibold text-gray-700 mb-1">Data Source:</div>
            {sources.map((source, idx) => (
              <div key={idx} className="text-xs text-gray-600">
                • {getSourceTypeLabel(source.source_type)}
                <span className="text-gray-400 ml-1">(from {source.source_week}, {getConfidenceLabel(source.confidence)} confidence)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function generateArrivalActualTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📥</span>
          <h4 className="text-sm font-semibold text-gray-900">到货 Arrival (实际)</h4>
        </div>
        <span className="text-xs text-gray-500">{row.week_iso}</span>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.actual_arrival} units</div>
        <div className="text-xs text-gray-600 mt-1">Source: Actual shipment arrivals</div>
      </div>

      {row.arrival_details.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-700 mb-2">Details:</div>
          <ul className="space-y-1.5">
            {row.arrival_details.map((arrival, idx) => (
              <li key={idx} className="text-xs">
                <Link
                  href={`/logistics/edit/${arrival.shipment_id}`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {arrival.tracking_number}
                </Link>
                {': '}
                <span className="text-gray-900">{arrival.arrived_qty} units</span>
                {' '}
                <span className="text-gray-500">({arrival.warehouse_code}, {arrival.arrival_date})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function generateArrivalEffectiveTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📥</span>
        <h4 className="text-sm font-semibold text-gray-900">到货 Arrival (取值)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.arrival_effective} units</div>
        <div className="text-xs text-gray-600 mt-1">
          Source: {row.actual_arrival > 0 ? 'Actual (优先使用实际数据)' : 'Planned (使用预计数据)'}
        </div>
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
          Formula: COALESCE(actual, planned)
        </div>
      </div>
    </div>
  )
}

function generateInventoryOpeningTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">库存 Inventory (期初)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.opening_stock} units</div>
        <div className="text-xs text-gray-600 mt-1">
          Source: Previous week&apos;s closing stock
        </div>
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
          Formula: Closing stock of Week {row.week_offset - 1}
        </div>
      </div>
    </div>
  )
}

function generateInventoryClosingTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">库存 Inventory (期末)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {row.closing_stock} units</div>
        <div className="text-xs text-gray-600 mt-1">Source: Calculation</div>
      </div>

      <div className="border-t border-gray-200 pt-2">
        <div className="text-xs font-semibold text-gray-700 mb-2">Calculation Details:</div>
        <ul className="space-y-1 text-xs text-gray-700">
          <li>Opening stock: <span className="font-medium">{row.opening_stock}</span></li>
          <li>Arrivals: <span className="font-medium text-green-700">+{row.arrival_effective}</span></li>
          <li>Sales: <span className="font-medium text-red-700">-{row.sales_effective}</span></li>
          <li className="pt-1 border-t border-gray-200">Closing: <span className="font-bold">{row.closing_stock}</span></li>
        </ul>
      </div>

      <div className="border-t border-gray-200 pt-2">
        <div className="text-xs text-gray-500">
          Formula: Opening + Arrival - Sales
        </div>
      </div>
    </div>
  )
}

function generateInventorySafetyTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  const safetyWeeks = row.sales_effective > 0
    ? (row.safety_threshold / row.sales_effective).toFixed(1)
    : '∞'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <h4 className="text-sm font-semibold text-gray-900">安全库存 Safety Stock</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Value: {Math.round(row.safety_threshold)} units</div>
        <div className="text-xs text-gray-600 mt-1">Source: Product settings (safety_stock_weeks)</div>
        <div className="text-xs text-gray-500 mt-2">
          Coverage: {safetyWeeks} weeks at current sales rate
        </div>
      </div>
    </div>
  )
}

function generateInventoryStatusTooltip(row: AlgorithmAuditRowV4): React.ReactNode {
  const coverageWeeks = row.sales_effective > 0
    ? (row.closing_stock / row.sales_effective).toFixed(1)
    : '∞'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <h4 className="text-sm font-semibold text-gray-900">库存状态 Stock Status</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">Status: {row.stock_status}</div>
        <div className="text-xs text-gray-600 mt-1">Source: Calculated based on safety threshold</div>
      </div>

      <div className="border-t border-gray-200 pt-2">
        <div className="text-xs font-semibold text-gray-700 mb-2">Details:</div>
        <ul className="space-y-1 text-xs text-gray-700">
          <li>Current stock: <span className="font-medium">{row.closing_stock} units</span></li>
          <li>Safety threshold: <span className="font-medium">{Math.round(row.safety_threshold)} units</span></li>
          <li>Coverage: <span className="font-medium">{coverageWeeks} weeks</span></li>
        </ul>
      </div>

      <div className="border-t border-gray-200 pt-2">
        <Badge variant={row.stock_status === 'OK' ? 'success' : row.stock_status === 'Risk' ? 'warning' : 'danger'}>
          {row.stock_status === 'OK' ? '✓ Safe' : row.stock_status === 'Risk' ? '⚠ Risk' : '✗ Stockout'}
        </Badge>
      </div>
    </div>
  )
}

// Removed ExpandedDetails component - replaced with hover tooltips

// ================================================================
// MAIN COMPONENT
// ================================================================

export function AlgorithmAuditTableV4({ rows }: AlgorithmAuditTableV4Props) {
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
              colSpan={3}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              下单
            </th>
            <th
              colSpan={3}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              工厂出货
            </th>
            <th
              colSpan={3}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold"
            >
              物流发货
            </th>
            <th
              colSpan={3}
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

            {/* Order - 3 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">取值</th>

            {/* Factory Ship - 3 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">取值</th>

            {/* Ship - 3 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">取值</th>

            {/* Arrival - 3 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">预计</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">实际</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-gray-600 font-semibold">取值</th>

            {/* Inventory - 4 columns */}
            <th className="px-2 py-1 text-center text-gray-600 font-medium">期初</th>
            <th className="px-2 py-1 text-center text-gray-600 font-semibold">期末</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">安全</th>
            <th className="px-2 py-1 text-center text-gray-600 font-medium">状态</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.week_iso} className={`border-b hover:bg-gray-50 ${getRowBgClass(row)}`}>
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
                <DataProvenanceTooltip columnType="sales_forecast" rowData={row}>
                  {formatValue(row.sales_forecast)}
                </DataProvenanceTooltip>
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.sales_actual !== null
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                <DataProvenanceTooltip columnType="sales_actual" rowData={row}>
                  {formatValue(row.sales_actual)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right font-bold text-gray-900">
                <DataProvenanceTooltip columnType="sales_effective" rowData={row}>
                  {row.sales_effective}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-center">
                {row.sales_effective > 0 && (
                  <Badge variant={getCoverageBadgeVariant(row.sales_coverage_status)}>
                    {getCoverageLabel(row.sales_coverage_status, row.sales_uncovered_qty)}
                  </Badge>
                )}
              </td>

              {/* Order Group - 3 columns */}
              <td className="px-2 py-2 text-right text-gray-700">
                <DataProvenanceTooltip columnType="order_planned" rowData={row}>
                  {formatValue(row.planned_order)}
                </DataProvenanceTooltip>
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.actual_order > 0
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                <DataProvenanceTooltip columnType="order_actual" rowData={row}>
                  {formatValue(row.actual_order)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                <DataProvenanceTooltip columnType="order_effective" rowData={row}>
                  {row.order_effective}
                </DataProvenanceTooltip>
              </td>

              {/* Factory Ship Group - 3 columns */}
              <td
                className={`px-2 py-2 text-right ${
                  row.planned_factory_ship > 0 && row.planned_factory_ship_source && row.planned_factory_ship_source.length > 0
                    ? 'bg-blue-50 text-blue-900'
                    : 'text-gray-700'
                }`}
              >
                <DataProvenanceTooltip columnType="factory_ship_planned" rowData={row}>
                  <span className="flex items-center justify-end gap-1">
                    {formatValue(row.planned_factory_ship)}
                    {row.planned_factory_ship > 0 && row.planned_factory_ship_source && row.planned_factory_ship_source.length > 0 && (
                      <span className="text-[10px] text-blue-600" title="基于数据传播计算">
                        ⓘ
                      </span>
                    )}
                  </span>
                </DataProvenanceTooltip>
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.actual_factory_ship > 0
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                <DataProvenanceTooltip columnType="factory_ship_actual" rowData={row}>
                  {formatValue(row.actual_factory_ship)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                <DataProvenanceTooltip columnType="factory_ship_effective" rowData={row}>
                  {row.factory_ship_effective}
                </DataProvenanceTooltip>
              </td>

              {/* Ship Group - 3 columns */}
              <td
                className={`px-2 py-2 text-right ${
                  row.planned_ship > 0 && row.planned_ship_source && row.planned_ship_source.length > 0
                    ? 'bg-blue-50 text-blue-900'
                    : 'text-gray-700'
                }`}
              >
                <DataProvenanceTooltip columnType="ship_planned" rowData={row}>
                  <span className="flex items-center justify-end gap-1">
                    {formatValue(row.planned_ship)}
                    {row.planned_ship > 0 && row.planned_ship_source && row.planned_ship_source.length > 0 && (
                      <span className="text-[10px] text-blue-600" title="基于数据传播计算">
                        ⓘ
                      </span>
                    )}
                  </span>
                </DataProvenanceTooltip>
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.actual_ship > 0
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                <DataProvenanceTooltip columnType="ship_actual" rowData={row}>
                  {formatValue(row.actual_ship)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                <DataProvenanceTooltip columnType="ship_effective" rowData={row}>
                  {row.ship_effective}
                </DataProvenanceTooltip>
              </td>

              {/* Arrival Group - 3 columns */}
              <td
                className={`px-2 py-2 text-right ${
                  row.planned_arrival > 0 && row.planned_arrival_source && row.planned_arrival_source.length > 0
                    ? 'bg-blue-50 text-blue-900'
                    : 'text-gray-700'
                }`}
              >
                <DataProvenanceTooltip columnType="arrival_planned" rowData={row}>
                  <span className="flex items-center justify-end gap-1">
                    {formatValue(row.planned_arrival)}
                    {row.planned_arrival > 0 && row.planned_arrival_source && row.planned_arrival_source.length > 0 && (
                      <span className="text-[10px] text-blue-600" title="基于数据传播计算">
                        ⓘ
                      </span>
                    )}
                  </span>
                </DataProvenanceTooltip>
              </td>
              <td
                className={`px-2 py-2 text-right ${
                  row.actual_arrival > 0
                    ? 'bg-green-50 font-semibold text-green-900'
                    : 'text-gray-400'
                }`}
              >
                <DataProvenanceTooltip columnType="arrival_actual" rowData={row}>
                  {formatValue(row.actual_arrival)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300 font-bold text-gray-900">
                <DataProvenanceTooltip columnType="arrival_effective" rowData={row}>
                  {row.arrival_effective}
                </DataProvenanceTooltip>
              </td>

              {/* Inventory Group - 4 columns */}
              <td className="px-2 py-2 text-right">
                <DataProvenanceTooltip columnType="inventory_opening" rowData={row}>
                  <span className="text-gray-700">{row.opening_stock}</span>
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right">
                <DataProvenanceTooltip columnType="inventory_closing" rowData={row}>
                  <span
                    className={`font-bold ${
                      row.closing_stock < row.safety_threshold
                        ? row.stock_status === 'Stockout'
                          ? 'text-red-600'
                          : 'text-orange-600'
                        : 'text-green-600'
                    }`}
                  >
                    {row.closing_stock}
                  </span>
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right">
                <DataProvenanceTooltip columnType="inventory_safety" rowData={row}>
                  <span className="text-xs text-gray-500">{Math.round(row.safety_threshold)}</span>
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-center">
                <DataProvenanceTooltip columnType="inventory_status" rowData={row}>
                  {getStockStatusBadge(row.stock_status)}
                </DataProvenanceTooltip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
