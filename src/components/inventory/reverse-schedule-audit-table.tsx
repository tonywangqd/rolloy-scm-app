'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { ReverseScheduleAuditRow } from '@/lib/queries/reverse-schedule-audit'

// ================================================================
// COMPONENT PROPS
// ================================================================

interface ReverseScheduleAuditTableProps {
  rows: ReverseScheduleAuditRow[]
}

// ================================================================
// TOOLTIP TYPES
// ================================================================

type TooltipColumnType =
  | 'sales_forecast'
  | 'sales_actual'
  | 'order_suggested'
  | 'order_actual'
  | 'factory_ship_planned'
  | 'factory_ship_actual'
  | 'ship_planned'
  | 'ship_actual'
  | 'arrival_planned'
  | 'arrival_actual'
  | 'inventory_opening'
  | 'inventory_closing'
  | 'inventory_turnover'
  | 'inventory_status'

// ================================================================
// TOOLTIP COMPONENT
// ================================================================

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
  rowData: ReverseScheduleAuditRow
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

function generateTooltipContent(columnType: TooltipColumnType, rowData: ReverseScheduleAuditRow): React.ReactNode {
  switch (columnType) {
    case 'sales_forecast':
      return generateSalesForecastTooltip(rowData)
    case 'sales_actual':
      return generateSalesActualTooltip(rowData)
    case 'order_suggested':
      return generateOrderSuggestedTooltip(rowData)
    case 'order_actual':
      return generateOrderActualTooltip(rowData)
    case 'factory_ship_planned':
      return generateFactoryShipPlannedTooltip(rowData)
    case 'factory_ship_actual':
      return generateFactoryShipActualTooltip(rowData)
    case 'ship_planned':
      return generateShipPlannedTooltip(rowData)
    case 'ship_actual':
      return generateShipActualTooltip(rowData)
    case 'arrival_planned':
      return generateArrivalPlannedTooltip(rowData)
    case 'arrival_actual':
      return generateArrivalActualTooltip(rowData)
    case 'inventory_opening':
      return generateInventoryOpeningTooltip(rowData)
    case 'inventory_closing':
      return generateInventoryClosingTooltip(rowData)
    case 'inventory_turnover':
      return generateInventoryTurnoverTooltip(rowData)
    case 'inventory_status':
      return generateInventoryStatusTooltip(rowData)
    default:
      return null
  }
}

// ================================================================
// TOOLTIP CONTENT GENERATORS
// ================================================================

function generateSalesForecastTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">销量预测</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.sales_forecast} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 销量预测表 (sales_forecasts)</div>
        <div className="text-xs text-gray-500 mt-1">周次: {row.week_iso}</div>
      </div>
    </div>
  )
}

function generateSalesActualTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">实际销量</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">
          数量: {row.sales_actual !== null ? `${row.sales_actual} 件` : '暂无数据'}
        </div>
        <div className="text-xs text-gray-600 mt-1">
          来源: {row.sales_actual !== null ? '实际销量表 (sales_actuals)' : '尚未录入'}
        </div>
        <div className="text-xs text-gray-500 mt-1">周次: {row.week_iso}</div>
      </div>
    </div>
  )
}

function generateOrderSuggestedTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📦</span>
        <h4 className="text-sm font-semibold text-orange-700">预计下单 (倒推缺口)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.suggested_order} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 销量预测倒推 - 实际已下单</div>
        <div className="text-xs text-orange-600 mt-2 p-2 bg-orange-50 rounded">
          <strong>计算公式:</strong><br />
          预计下单 = 倒推需求 - 实际已下单<br />
          （仅显示剩余缺口）
        </div>
        <div className="text-xs text-gray-500 mt-1">
          含义: 为满足未来销量需求，还需要下单 {row.suggested_order} 件
        </div>
      </div>
    </div>
  )
}

function generateOrderActualTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📦</span>
          <h4 className="text-sm font-semibold text-gray-900">实际下单</h4>
        </div>
        <span className="text-xs text-gray-500">{row.week_iso}</span>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.actual_order} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 采购订单 (purchase_orders)</div>
      </div>

      {row.order_details.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-700 mb-2">订单明细:</div>
          <ul className="space-y-1.5">
            {row.order_details.map((order, idx) => (
              <li key={idx} className="text-xs">
                <Link
                  href={`/procurement`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {order.po_number}
                </Link>
                {': '}
                <span className="text-gray-900">{order.qty} 件</span>
                {' '}
                <span className="text-gray-500">
                  ({order.order_date})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function generateFactoryShipPlannedTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏭</span>
        <h4 className="text-sm font-semibold text-yellow-700">预计出厂 (正推)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.planned_factory_ship} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 从实际下单/建议下单正推计算</div>
        <div className="text-xs text-yellow-600 mt-2 p-2 bg-yellow-50 rounded">
          <strong>计算公式:</strong><br />
          实际下单周 + 生产周期 = 预计出厂周
        </div>
        <div className="text-xs text-gray-500 mt-1">
          含义: 基于已下单的货，预计这周出厂 {row.planned_factory_ship} 件
        </div>
      </div>
    </div>
  )
}

function generateFactoryShipActualTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏭</span>
          <h4 className="text-sm font-semibold text-gray-900">实际出厂</h4>
        </div>
        <span className="text-xs text-gray-500">{row.week_iso}</span>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.actual_factory_ship} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 生产交付单 (production_deliveries)</div>
      </div>

      {row.fulfillment_details.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-700 mb-2">出厂明细:</div>
          <ul className="space-y-1.5">
            {row.fulfillment_details.map((delivery, idx) => (
              <li key={idx} className="text-xs">
                <span className="font-medium text-gray-900">{delivery.delivery_number}</span>
                {': '}
                <span className="text-gray-900">{delivery.qty} 件</span>
                {' '}
                <span className="text-gray-500">({delivery.delivery_date})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function generateShipPlannedTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🚢</span>
        <h4 className="text-sm font-semibold text-cyan-700">预计发货 (正推)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.planned_ship} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 从实际出厂/预计出厂正推计算</div>
        <div className="text-xs text-cyan-600 mt-2 p-2 bg-cyan-50 rounded">
          <strong>计算公式:</strong><br />
          实际出厂周 + 装柜周期 = 预计发货周
        </div>
        <div className="text-xs text-gray-500 mt-1">
          含义: 基于已出厂的货，预计这周发货 {row.planned_ship} 件
        </div>
      </div>
    </div>
  )
}

function generateShipActualTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚢</span>
          <h4 className="text-sm font-semibold text-gray-900">实际发货</h4>
        </div>
        <span className="text-xs text-gray-500">{row.week_iso}</span>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.actual_ship} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 货运单 (shipments)</div>
      </div>

      {row.ship_details.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-700 mb-2">发货明细:</div>
          <ul className="space-y-1.5">
            {row.ship_details.map((shipment, idx) => (
              <li key={idx} className="text-xs">
                <Link
                  href={`/logistics`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {shipment.tracking_number}
                </Link>
                {': '}
                <span className="text-gray-900">{shipment.qty} 件</span>
                {shipment.departure_date && (
                  <span className="text-gray-500"> ({shipment.departure_date})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function generateArrivalPlannedTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📥</span>
        <h4 className="text-sm font-semibold text-green-700">预计到仓 (正推)</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.planned_arrival} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 从实际发货/预计发货正推计算 或 在途货物</div>
        <div className="text-xs text-green-600 mt-2 p-2 bg-green-50 rounded">
          <strong>计算来源 (优先级):</strong><br />
          1. 在途shipment的预计到仓日期<br />
          2. 实际发货周 + 物流周期<br />
          3. 预计发货周 + 物流周期
        </div>
        <div className="text-xs text-gray-500 mt-1">
          含义: 基于已发货的货，预计这周到仓 {row.planned_arrival} 件
        </div>
      </div>
    </div>
  )
}

function generateArrivalActualTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📥</span>
          <h4 className="text-sm font-semibold text-gray-900">实际到仓</h4>
        </div>
        <span className="text-xs text-gray-500">{row.week_iso}</span>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.actual_arrival} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 货运单到仓记录 (shipments.actual_arrival_date)</div>
      </div>

      {row.arrival_details.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-700 mb-2">到仓明细:</div>
          <ul className="space-y-1.5">
            {row.arrival_details.map((arrival, idx) => (
              <li key={idx} className="text-xs">
                <Link
                  href={`/logistics`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {arrival.tracking_number}
                </Link>
                {': '}
                <span className="text-gray-900">{arrival.qty} 件</span>
                <span className="text-gray-500"> ({arrival.arrival_date})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function generateInventoryOpeningTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">期初库存</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.opening_stock} 件</div>
        <div className="text-xs text-gray-600 mt-1">
          来源: 上周期末库存
        </div>
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
          计算公式: 上周期末库存 = 本周期初库存
        </div>
      </div>
    </div>
  )
}

function generateInventoryClosingTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h4 className="text-sm font-semibold text-gray-900">期末库存</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">数量: {row.closing_stock} 件</div>
        <div className="text-xs text-gray-600 mt-1">来源: 计算得出</div>
      </div>

      <div className="border-t border-gray-200 pt-2">
        <div className="text-xs font-semibold text-gray-700 mb-2">计算明细:</div>
        <ul className="space-y-1 text-xs text-gray-700">
          <li>期初库存: <span className="font-medium">{row.opening_stock}</span></li>
          <li>有效到仓: <span className="font-medium text-green-700">+{row.arrival_effective}</span></li>
          <li>有效销量: <span className="font-medium text-red-700">-{row.sales_effective}</span></li>
          <li className="pt-1 border-t border-gray-200">期末库存: <span className="font-bold">{row.closing_stock}</span></li>
        </ul>
      </div>

      <div className="border-t border-gray-200 pt-2">
        <div className="text-xs text-gray-500">
          公式: 期末 = 期初 + 到仓 - 销量
        </div>
      </div>
    </div>
  )
}

function generateInventoryTurnoverTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔄</span>
        <h4 className="text-sm font-semibold text-gray-900">库存周转率</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">
          周转率: {row.turnover_ratio !== null ? row.turnover_ratio.toFixed(1) : '无法计算'}
        </div>
        <div className="text-xs text-gray-600 mt-1">来源: 计算得出</div>
        <div className="text-xs text-blue-600 mt-2 p-2 bg-blue-50 rounded">
          <strong>计算公式:</strong><br />
          周转率 = 期末库存 / 本周销量
        </div>
        <div className="text-xs text-gray-500 mt-2">
          {row.turnover_ratio !== null ? (
            <>
              含义: 当前库存可以支撑 {row.turnover_ratio.toFixed(1)} 周的销售<br />
              参考: 周转率 &lt; 2 视为库存风险
            </>
          ) : (
            '本周销量为0，无法计算周转率'
          )}
        </div>
      </div>
    </div>
  )
}

function generateInventoryStatusTooltip(row: ReverseScheduleAuditRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <h4 className="text-sm font-semibold text-gray-900">库存状态</h4>
      </div>
      <div className="border-t border-gray-200 pt-2">
        <div className="text-sm text-gray-900 font-medium">状态: {row.stock_status}</div>
        <div className="text-xs text-gray-600 mt-1">来源: 基于周转率计算</div>
      </div>

      <div className="border-t border-gray-200 pt-2">
        <div className="text-xs font-semibold text-gray-700 mb-2">判断规则:</div>
        <ul className="space-y-1 text-xs text-gray-700">
          <li>期末库存: <span className="font-medium">{row.closing_stock} 件</span></li>
          <li>周转率: <span className="font-medium">{row.turnover_ratio !== null ? row.turnover_ratio.toFixed(1) : '-'}</span></li>
        </ul>
      </div>

      <div className="border-t border-gray-200 pt-2">
        <div className="text-xs text-gray-500 space-y-1">
          <div><Badge variant="danger" className="text-xs mr-1">断货</Badge> 期末库存 &le; 0</div>
          <div><Badge variant="warning" className="text-xs mr-1">风险</Badge> 周转率 &lt; 2</div>
          <div><Badge variant="success" className="text-xs mr-1">OK</Badge> 周转率 &ge; 2</div>
        </div>
      </div>
    </div>
  )
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

function formatValue(value: number | null): string {
  if (value === null || value === 0) return '-'
  return value.toString()
}

function getStockStatusBadge(status: 'OK' | 'Risk' | 'Stockout') {
  const config = {
    OK: { variant: 'success' as const, label: 'OK' },
    Risk: { variant: 'warning' as const, label: '风险' },
    Stockout: { variant: 'danger' as const, label: '断货' },
  }
  return <Badge variant={config[status].variant}>{config[status].label}</Badge>
}

// Compare planned/suggested vs actual - highlight gaps
function getCompareCell(planned: number, actual: number, row: ReverseScheduleAuditRow, columnType: TooltipColumnType) {
  // 只有当建议/预计和实际都为0时才显示 "-"
  if (planned === 0 && actual === 0) {
    return <span className="text-gray-400">-</span>
  }

  const gap = actual - planned
  // 只有当实际值 > 0 时才显示差距
  // 因为 actual=0 表示"还没发生"，显示差距没有意义
  const hasGap = actual > 0 && planned > 0 && gap !== 0

  return (
    <DataProvenanceTooltip columnType={columnType} rowData={row}>
      <div className="flex flex-col items-end">
        <span className={actual > 0 ? 'font-semibold text-green-700' : 'text-gray-500'}>
          {/* 当有建议/预计值时，实际为0也要显示0（而不是-），这样更清晰 */}
          {planned > 0 ? actual.toString() : formatValue(actual)}
        </span>
        {hasGap && (
          <span className={`text-xs ${gap > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {gap > 0 ? `+${gap}` : gap}
          </span>
        )}
      </div>
    </DataProvenanceTooltip>
  )
}

// ================================================================
// MAIN COMPONENT
// ================================================================

export function ReverseScheduleAuditTable({ rows }: ReverseScheduleAuditTableProps) {
  const getRowBgClass = (row: ReverseScheduleAuditRow): string => {
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
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-purple-50"
            >
              销量
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-orange-50"
              title="预计=倒推（从销量预测计算缺口）"
            >
              下单 (倒推)
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-yellow-50"
              title="预计=正推（从实际下单）"
            >
              出厂 (正推)
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-cyan-50"
              title="预计=正推（从实际出厂）"
            >
              发货 (正推)
            </th>
            <th
              colSpan={2}
              className="px-3 py-2 text-center border-r border-gray-300 font-semibold bg-green-50"
              title="预计=正推（从实际发货或在途）"
            >
              到仓 (正推)
            </th>
            <th
              colSpan={4}
              className="px-3 py-2 text-center font-semibold bg-blue-50"
            >
              库存
            </th>
          </tr>

          {/* Sub-headers */}
          <tr className="text-xs border-b">
            {/* 销量 - 2 columns */}
            <th className="px-2 py-1 text-center text-purple-700 font-medium bg-purple-50/50">预测</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-purple-700 font-medium bg-purple-50/50">实际</th>

            {/* 下单 - 2 columns */}
            <th className="px-2 py-1 text-center text-orange-700 font-medium bg-orange-50/50" title="倒推计算的剩余需求缺口">预计</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-orange-700 font-medium bg-orange-50/50">实际</th>

            {/* 出厂 - 2 columns */}
            <th className="px-2 py-1 text-center text-yellow-700 font-medium bg-yellow-50/50" title="从实际下单正推">预计</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-yellow-700 font-medium bg-yellow-50/50">实际</th>

            {/* 发货 - 2 columns */}
            <th className="px-2 py-1 text-center text-cyan-700 font-medium bg-cyan-50/50" title="从实际出厂正推">预计</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-cyan-700 font-medium bg-cyan-50/50">实际</th>

            {/* 到仓 - 2 columns */}
            <th className="px-2 py-1 text-center text-green-700 font-medium bg-green-50/50" title="从实际发货正推或在途shipment">预计</th>
            <th className="px-2 py-1 text-center border-r border-gray-300 text-green-700 font-medium bg-green-50/50">实际</th>

            {/* 库存 - 4 columns */}
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50">期初</th>
            <th className="px-2 py-1 text-center text-blue-700 font-semibold bg-blue-50/50">期末</th>
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50" title="周转率 = 期末库存 / 本周销量">周转</th>
            <th className="px-2 py-1 text-center text-blue-700 font-medium bg-blue-50/50">状态</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.week_iso} className={`border-b hover:bg-gray-50/50 ${getRowBgClass(row)}`}>
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

              {/* 销量 Group - 2 columns */}
              <td className="px-2 py-2 text-right text-gray-700">
                <DataProvenanceTooltip columnType="sales_forecast" rowData={row}>
                  {formatValue(row.sales_forecast)}
                </DataProvenanceTooltip>
              </td>
              <td className={`px-2 py-2 text-right border-r border-gray-300 ${
                row.sales_actual !== null ? 'font-semibold text-purple-700' : 'text-gray-400'
              }`}>
                <DataProvenanceTooltip columnType="sales_actual" rowData={row}>
                  {formatValue(row.sales_actual)}
                </DataProvenanceTooltip>
              </td>

              {/* 下单 Group - 2 columns (建议=倒推) */}
              <td className={`px-2 py-2 text-right ${
                row.suggested_order > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'
              }`}>
                <DataProvenanceTooltip columnType="order_suggested" rowData={row}>
                  {formatValue(row.suggested_order)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.suggested_order, row.actual_order, row, 'order_actual')}
              </td>

              {/* 出厂 Group - 2 columns (预计=正推) */}
              <td className={`px-2 py-2 text-right ${
                row.planned_factory_ship > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'
              }`}>
                <DataProvenanceTooltip columnType="factory_ship_planned" rowData={row}>
                  {formatValue(row.planned_factory_ship)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.planned_factory_ship, row.actual_factory_ship, row, 'factory_ship_actual')}
              </td>

              {/* 发货 Group - 2 columns (预计=正推) */}
              <td className={`px-2 py-2 text-right ${
                row.planned_ship > 0 ? 'text-cyan-600 font-medium' : 'text-gray-400'
              }`}>
                <DataProvenanceTooltip columnType="ship_planned" rowData={row}>
                  {formatValue(row.planned_ship)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.planned_ship, row.actual_ship, row, 'ship_actual')}
              </td>

              {/* 到仓 Group - 2 columns (预计=正推) */}
              <td className={`px-2 py-2 text-right ${
                row.planned_arrival > 0 ? 'text-green-600 font-medium' : 'text-gray-400'
              }`}>
                <DataProvenanceTooltip columnType="arrival_planned" rowData={row}>
                  {formatValue(row.planned_arrival)}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right border-r border-gray-300">
                {getCompareCell(row.planned_arrival, row.actual_arrival, row, 'arrival_actual')}
              </td>

              {/* 库存 Group - 4 columns */}
              <td className="px-2 py-2 text-right text-gray-700">
                <DataProvenanceTooltip columnType="inventory_opening" rowData={row}>
                  {row.opening_stock}
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right">
                <DataProvenanceTooltip columnType="inventory_closing" rowData={row}>
                  <span
                    className={`font-bold ${
                      row.closing_stock <= 0
                        ? 'text-red-600'
                        : row.turnover_ratio !== null && row.turnover_ratio < 2
                        ? 'text-orange-600'
                        : 'text-green-600'
                    }`}
                  >
                    {row.closing_stock}
                  </span>
                </DataProvenanceTooltip>
              </td>
              <td className="px-2 py-2 text-right text-xs text-gray-500">
                <DataProvenanceTooltip columnType="inventory_turnover" rowData={row}>
                  {row.turnover_ratio !== null ? row.turnover_ratio.toFixed(1) : '-'}
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
