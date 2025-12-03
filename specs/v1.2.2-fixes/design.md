# V1.2.2 Bug Fixes - Technical Design Document

**Version:** 1.2.2
**Author:** System Architect
**Date:** 2025-12-03
**Status:** Design Phase

---

## Executive Summary

This document outlines the technical design for 7 critical bug fixes and feature improvements in version 1.2.2. Each fix includes detailed schema changes, component modifications, and implementation strategies.

---

## Problem 1: Inventory Projection Chart - Timeline and Display Issues

### Current Issues
1. **X-axis labels truncated:** Only shows "W50", "W01" without year/month context
2. **Cross-year confusion:** When spanning Dec-Jan, weeks repeat (W50, W01, W01...)
3. **Redundant data:** Shows both opening_stock and closing_stock (visually cluttered)
4. **Timeline scope:** Currently shows future 12 weeks only, need past 12 + future 12 = 24 weeks
5. **Missing stockout markers:** No visual indicator when closing_stock <= 0

### Technical Design

#### A. Data Layer Changes

**File:** `src/lib/queries/inventory.ts`

Add new function to fetch 24-week projection (past 12 + future 12):

```typescript
/**
 * Fetch inventory projection: past 12 weeks + future 12 weeks = 24 weeks
 * @param sku - Product SKU
 * @param currentWeekIso - Current week in ISO format (YYYY-WW)
 */
export async function fetchInventoryProjection24Weeks(
  sku: string,
  currentWeekIso?: string
): Promise<InventoryProjection12WeeksView[]> {
  const supabase = await createServerSupabaseClient()

  // Get current week if not provided
  const currentWeek = currentWeekIso || getCurrentISOWeek()

  const { data, error } = await supabase
    .from('v_inventory_projection_12weeks')
    .select('*')
    .eq('sku', sku)
    .gte('week_offset', -12)  // Past 12 weeks
    .lte('week_offset', 12)   // Future 12 weeks (including current = 0)
    .order('week_offset', { ascending: true })

  if (error) {
    console.error('Error fetching 24-week projection:', error)
    return []
  }

  return data || []
}

/**
 * Get current ISO week in YYYY-WW format
 */
function getCurrentISOWeek(): string {
  const now = new Date()
  const year = getISOWeekYear(now)
  const week = getISOWeek(now)
  return `${year}-W${String(week).padStart(2, '0')}`
}
```

**Note:** Requires `date-fns` functions: `getISOWeek`, `getISOWeekYear`

#### B. Component Layer Changes

**File:** `src/components/planning/inventory-projection-chart.tsx`

```typescript
'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import type { InventoryProjection12WeeksView } from '@/lib/types/database'

interface InventoryProjectionChartProps {
  data: InventoryProjection12WeeksView[]
  sku?: string
}

export function InventoryProjectionChart({ data, sku }: InventoryProjectionChartProps) {
  // Format data for chart
  const chartData = useMemo(() => {
    return data.map((item) => {
      // Parse week_iso: "2025-W50" -> { year: 2025, week: 50 }
      const [yearStr, weekStr] = item.week_iso.split('-W')
      const year = parseInt(yearStr, 10)
      const week = parseInt(weekStr, 10)

      // Format label: "12/W50" (month/week)
      // Use week_start_date to get the month
      const weekStartDate = new Date(item.week_start_date)
      const month = weekStartDate.getMonth() + 1 // 1-12
      const weekLabel = `${String(month).padStart(2, '0')}/W${String(week).padStart(2, '0')}`

      return {
        week: weekLabel,
        week_full: item.week_iso,
        week_offset: item.week_offset,
        closing_stock: item.closing_stock,
        safety_threshold: item.safety_stock_threshold,
        incoming: item.incoming_qty,
        sales: item.effective_sales,
        status: item.stock_status,
        is_stockout: item.closing_stock <= 0,
      }
    })
  }, [data])

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 font-semibold text-gray-900">{label}</p>
          <div className="space-y-1">
            <p className="text-sm text-purple-600">
              期末库存: <span className="font-semibold">{data.closing_stock.toLocaleString()}</span>
            </p>
            <p className="text-sm text-orange-600">
              安全库存: <span className="font-semibold">{data.safety_threshold.toLocaleString()}</span>
            </p>
            <p className="text-sm text-green-600">
              到货量: <span className="font-semibold">{data.incoming.toLocaleString()}</span>
            </p>
            <p className="text-sm text-red-600">
              销量: <span className="font-semibold">{data.sales.toLocaleString()}</span>
            </p>
            <p className="text-sm text-gray-600">
              状态: <span className={`font-semibold ${
                data.status === 'OK' ? 'text-green-600' :
                data.status === 'Risk' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {data.status === 'OK' ? '正常' : data.status === 'Risk' ? '风险' : '断货'}
              </span>
            </p>
            {data.is_stockout && (
              <p className="text-sm font-bold text-red-600">
                ⚠️ 断货周
              </p>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  // Custom dot for stockout weeks
  const StockoutDot = (props: any) => {
    const { cx, cy, payload } = props
    if (payload.is_stockout) {
      return (
        <g>
          <circle cx={cx} cy={cy} r={6} fill="#dc2626" stroke="#fff" strokeWidth={2} />
          <text x={cx} y={cy - 15} textAnchor="middle" fill="#dc2626" fontSize="12" fontWeight="bold">
            ⚠️
          </text>
        </g>
      )
    }
    return <circle cx={cx} cy={cy} r={4} fill="#8b5cf6" />
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>库存趋势</CardTitle>
          <CardDescription>
            {sku ? `${sku} 的库存预测趋势（过去12周 + 未来12周）` : '过去12周 + 未来12周库存预测趋势'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-80 items-center justify-center text-gray-500">
            暂无数据
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>库存趋势</CardTitle>
        <CardDescription>
          {sku ? `${sku} 的库存预测趋势（过去12周 + 未来12周）` : '过去12周 + 未来12周库存预测趋势'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="week"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={{ stroke: '#e5e7eb' }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(value) => value.toLocaleString()}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
              formatter={(value) => (
                <span className="text-sm text-gray-700">{value}</span>
              )}
            />

            {/* Only show closing_stock (removed opening_stock) */}
            <Line
              type="monotone"
              dataKey="closing_stock"
              name="期末库存"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={<StockoutDot />}
              activeDot={{ r: 6 }}
            />

            {/* Safety stock threshold */}
            <Line
              type="stepAfter"
              dataKey="safety_threshold"
              name="安全库存"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4, fill: '#f97316' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
```

#### C. Page Integration

**File:** `src/components/planning/inventory-projection-wrapper.tsx`

Update to use 24-week query:

```typescript
// Change import
import { fetchInventoryProjection24Weeks } from '@/lib/queries/inventory'

// In component
const data = await fetchInventoryProjection24Weeks(sku)
```

#### D. Database View Update (Optional)

If the view `v_inventory_projection_12weeks` doesn't support negative offsets, update the view to include past weeks:

**File:** `supabase/migrations/YYYYMMDDHHMMSS_update_inventory_projection_view.sql`

```sql
-- Update view to support past 12 weeks (week_offset -12 to +12)
CREATE OR REPLACE VIEW v_inventory_projection_12weeks AS
SELECT
  ip.sku,
  p.product_name,
  ip.week_iso,
  ip.week_start_date,
  ip.week_end_date,
  -- Calculate week_offset relative to current week
  (
    (date_part('isoyear', ip.week_start_date) - date_part('isoyear', CURRENT_DATE)) * 52 +
    (date_part('week', ip.week_start_date) - date_part('week', CURRENT_DATE))
  )::int AS week_offset,
  ip.start_stock AS opening_stock,
  ip.incoming_qty,
  ip.effective_sales,
  ip.sales_forecast AS forecast_qty,
  ip.sales_actual AS actual_qty,
  ip.end_stock AS closing_stock,
  ip.safety_stock_threshold,
  ip.stock_status,
  ip.weeks_until_stockout,
  ip.calculated_at
FROM inventory_projections ip
LEFT JOIN products p ON ip.sku = p.sku
WHERE
  -- Past 12 weeks to future 12 weeks
  ip.week_start_date >= CURRENT_DATE - INTERVAL '12 weeks'
  AND ip.week_start_date <= CURRENT_DATE + INTERVAL '12 weeks'
ORDER BY ip.sku, ip.week_iso;
```

---

## Problem 2: Finance Payment Management - Paid Records Visibility

### Current Issues
1. **Disappearing data:** After marking payment as "Paid", records disappear from UI
2. **No audit trail:** Cannot see payment history
3. **Single-use batch action:** Batch payment form loses context after submission

### Technical Design

#### A. Data Layer Changes

**File:** `src/lib/queries/finance.ts`

Modify queries to fetch BOTH pending and paid records:

```typescript
/**
 * Fetch procurement payments (ALL statuses including Paid)
 */
export async function fetchProcurementPaymentsAll(): Promise<{
  pending: ProcurementPaymentGroup[]
  paid: ProcurementPaymentGroup[]
}> {
  const supabase = await createServerSupabaseClient()

  // Fetch ALL deliveries with payment information
  const { data, error } = await supabase
    .from('production_deliveries')
    .select(`
      id,
      delivery_number,
      actual_delivery_date,
      total_value_usd,
      payment_status,
      payment_date,
      po_item_id,
      purchase_order_items!inner (
        po_id,
        purchase_orders!inner (
          po_number,
          supplier_id,
          suppliers (
            supplier_name
          )
        )
      )
    `)
    .not('actual_delivery_date', 'is', null)
    .order('actual_delivery_date', { ascending: false })

  if (error || !data) {
    console.error('Error fetching procurement payments:', error)
    return { pending: [], paid: [] }
  }

  // Separate pending and paid
  const pendingMap = new Map<string, { total_usd: number; items: ProcurementPayment[] }>()
  const paidMap = new Map<string, { total_usd: number; items: ProcurementPayment[] }>()

  data.forEach((delivery: any) => {
    const deliveryDate = new Date(delivery.actual_delivery_date)
    const paymentDate = delivery.payment_status === 'Paid' && delivery.payment_date
      ? new Date(delivery.payment_date)
      : getProcurementPaymentDate(deliveryDate)

    // Use actual payment date for paid items, planned payment date for pending
    const paymentMonth = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`

    const poItem = delivery.purchase_order_items
    const po = poItem?.purchase_orders
    const supplier = po?.suppliers

    const amount = delivery.total_value_usd || 0

    const payment: ProcurementPayment = {
      id: delivery.id,
      po_number: po?.po_number || 'N/A',
      supplier_name: supplier?.supplier_name || 'Unknown',
      delivery_number: delivery.delivery_number,
      delivery_date: delivery.actual_delivery_date,
      amount_usd: amount,
      payment_date: formatDateISO(paymentDate),
      payment_month: paymentMonth,
      payment_status: delivery.payment_status,
    }

    // Group by paid status
    const targetMap = delivery.payment_status === 'Paid' ? paidMap : pendingMap
    if (!targetMap.has(paymentMonth)) {
      targetMap.set(paymentMonth, { total_usd: 0, items: [] })
    }
    const group = targetMap.get(paymentMonth)!
    group.total_usd += amount
    group.items.push(payment)
  })

  // Convert to arrays
  const pending = Array.from(pendingMap.entries())
    .map(([payment_month, data]) => ({ payment_month, ...data }))
    .sort((a, b) => a.payment_month.localeCompare(b.payment_month))

  const paid = Array.from(paidMap.entries())
    .map(([payment_month, data]) => ({ payment_month, ...data }))
    .sort((a, b) => b.payment_month.localeCompare(a.payment_month)) // Desc for paid

  return { pending, paid }
}

/**
 * Fetch logistics payments (ALL statuses including Paid)
 */
export async function fetchLogisticsPaymentsAll(): Promise<{
  pending: LogisticsPaymentGroup[]
  paid: LogisticsPaymentGroup[]
}> {
  const supabase = await createServerSupabaseClient()
  const USD_TO_CNY = 7.2

  const { data, error } = await supabase
    .from('shipments')
    .select('id, tracking_number, actual_arrival_date, total_cost_usd, payment_status, payment_date')
    .not('actual_arrival_date', 'is', null)
    .order('actual_arrival_date', { ascending: false })

  if (error || !data) {
    console.error('Error fetching logistics payments:', error)
    return { pending: [], paid: [] }
  }

  const pendingMap = new Map<string, { payment_date: string; total_cny: number; total_usd: number; items: LogisticsPayment[] }>()
  const paidMap = new Map<string, { payment_date: string; total_cny: number; total_usd: number; items: LogisticsPayment[] }>()

  data.forEach((shipment: any) => {
    const arrivalDate = new Date(shipment.actual_arrival_date)
    const paymentDate = shipment.payment_status === 'Paid' && shipment.payment_date
      ? new Date(shipment.payment_date)
      : getLogisticsPaymentDate(arrivalDate)

    const dayOfMonth = arrivalDate.getDate()
    const yearMonth = `${arrivalDate.getFullYear()}-${String(arrivalDate.getMonth() + 1).padStart(2, '0')}`
    const period = dayOfMonth <= 15 ? '上' : '下'
    const paymentPeriod = `${yearMonth}${period}`

    const amountUsd = shipment.total_cost_usd || 0
    const amountCny = amountUsd * USD_TO_CNY

    const payment: LogisticsPayment = {
      id: shipment.id,
      tracking_number: shipment.tracking_number,
      arrival_date: shipment.actual_arrival_date,
      amount_cny: amountCny,
      amount_usd: amountUsd,
      payment_date: formatDateISO(paymentDate),
      payment_period: paymentPeriod,
      payment_status: shipment.payment_status,
    }

    const targetMap = shipment.payment_status === 'Paid' ? paidMap : pendingMap
    if (!targetMap.has(paymentPeriod)) {
      targetMap.set(paymentPeriod, {
        payment_date: formatDateISO(paymentDate),
        total_cny: 0,
        total_usd: 0,
        items: [],
      })
    }
    const group = targetMap.get(paymentPeriod)!
    group.total_usd += amountUsd
    group.total_cny += amountCny
    group.items.push(payment)
  })

  const pending = Array.from(pendingMap.entries())
    .map(([payment_period, data]) => ({ payment_period, ...data }))
    .sort((a, b) => a.payment_period.localeCompare(b.payment_period))

  const paid = Array.from(paidMap.entries())
    .map(([payment_period, data]) => ({ payment_period, ...data }))
    .sort((a, b) => b.payment_period.localeCompare(a.payment_period))

  return { pending, paid }
}
```

#### B. Schema Changes (Add payment_date column)

Currently `payment_date` is computed. We need to store actual payment date:

**File:** `supabase/migrations/YYYYMMDDHHMMSS_add_payment_date_columns.sql`

```sql
-- Add payment_date column to production_deliveries
ALTER TABLE production_deliveries
ADD COLUMN IF NOT EXISTS payment_date DATE;

COMMENT ON COLUMN production_deliveries.payment_date IS 'Actual date payment was made (NULL if not paid yet)';

-- Add payment_date column to shipments
ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS payment_date DATE;

COMMENT ON COLUMN shipments.payment_date IS 'Actual date payment was made (NULL if not paid yet)';

-- Create index for payment queries
CREATE INDEX IF NOT EXISTS idx_production_deliveries_payment_date ON production_deliveries(payment_date) WHERE payment_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_payment_date ON shipments(payment_date) WHERE payment_date IS NOT NULL;
```

#### C. Component Changes

**File:** `src/components/finance/finance-tabs.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatCurrencyCNY, formatDate, getPaymentStatusVariant } from '@/lib/utils'
import { Calendar, Package, Truck, CheckCircle2 } from 'lucide-react'
import { BatchPaymentForm } from '@/components/finance/batch-payment-form'
import type { ProcurementPaymentGroup, LogisticsPaymentGroup } from '@/lib/queries/finance'

interface FinanceTabsProps {
  procurementPending: ProcurementPaymentGroup[]
  procurementPaid: ProcurementPaymentGroup[]
  logisticsPending: LogisticsPaymentGroup[]
  logisticsPaid: LogisticsPaymentGroup[]
}

export function FinanceTabs({
  procurementPending,
  procurementPaid,
  logisticsPending,
  logisticsPaid,
}: FinanceTabsProps) {
  const [activeTab, setActiveTab] = useState('procurement')

  // Render payment group card
  const renderProcurementCard = (monthData: ProcurementPaymentGroup, isPaid: boolean) => (
    <Card key={monthData.payment_month}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {isPaid ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Calendar className="h-5 w-5" />}
            {monthData.payment_month} {isPaid ? '已付采购款' : '应付采购款'}
          </CardTitle>
          <div className={`text-lg font-semibold ${isPaid ? 'text-green-600' : 'text-purple-600'}`}>
            {formatCurrency(monthData.total_usd)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>交货单号</TableHead>
              <TableHead>PO号</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>交货日期</TableHead>
              <TableHead>付款日期</TableHead>
              <TableHead className="text-right">金额 (USD)</TableHead>
              {!isPaid && <TableHead>状态</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthData.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.delivery_number}</TableCell>
                <TableCell>{item.po_number}</TableCell>
                <TableCell>{item.supplier_name}</TableCell>
                <TableCell>{formatDate(item.delivery_date)}</TableCell>
                <TableCell>{formatDate(item.payment_date)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(item.amount_usd)}
                </TableCell>
                {!isPaid && (
                  <TableCell>
                    <Badge variant={getPaymentStatusVariant(item.payment_status)}>
                      {item.payment_status === 'Pending' ? '待付' :
                       item.payment_status === 'Scheduled' ? '已排期' : '已付'}
                    </Badge>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )

  const renderLogisticsCard = (periodData: LogisticsPaymentGroup, isPaid: boolean) => (
    <Card key={periodData.payment_period}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {isPaid ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Calendar className="h-5 w-5" />}
            {formatDate(periodData.payment_date)} {isPaid ? '已付物流款' : '应付物流款'}
            {!isPaid && (
              <span className="text-sm text-gray-500 font-normal ml-2">
                ({periodData.payment_period})
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className={`text-lg font-semibold ${isPaid ? 'text-green-600' : 'text-green-600'}`}>
              {formatCurrencyCNY(periodData.total_cny)}
            </span>
            <span className="text-sm text-gray-500">
              ({formatCurrency(periodData.total_usd)})
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>运单号</TableHead>
              <TableHead>到货日期</TableHead>
              <TableHead>付款日期</TableHead>
              <TableHead className="text-right">金额 (CNY)</TableHead>
              <TableHead className="text-right">金额 (USD)</TableHead>
              {!isPaid && <TableHead>状态</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodData.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.tracking_number}</TableCell>
                <TableCell>{formatDate(item.arrival_date)}</TableCell>
                <TableCell>{formatDate(item.payment_date)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrencyCNY(item.amount_cny)}
                </TableCell>
                <TableCell className="text-right text-gray-500">
                  {formatCurrency(item.amount_usd)}
                </TableCell>
                {!isPaid && (
                  <TableCell>
                    <Badge variant={getPaymentStatusVariant(item.payment_status)}>
                      {item.payment_status === 'Pending' ? '待付' :
                       item.payment_status === 'Scheduled' ? '已排期' : '已付'}
                    </Badge>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="procurement">
          <Package className="mr-2 h-4 w-4" />
          采购付款 (USD)
        </TabsTrigger>
        <TabsTrigger value="logistics">
          <Truck className="mr-2 h-4 w-4" />
          物流付款 (CNY)
        </TabsTrigger>
      </TabsList>

      {/* Procurement Tab */}
      <TabsContent value="procurement" className="space-y-6 mt-6">
        {/* Batch Payment Form */}
        <BatchPaymentForm type="procurement" />

        {/* Pending Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-700">应付款项</h3>
          {procurementPending.length === 0 ? (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-gray-500">
                暂无待付采购款
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {procurementPending.map((monthData) => renderProcurementCard(monthData, false))}
            </div>
          )}
        </div>

        {/* Paid Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-green-700">已付款项</h3>
          {procurementPaid.length === 0 ? (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-gray-500">
                暂无已付采购款记录
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {procurementPaid.map((monthData) => renderProcurementCard(monthData, true))}
            </div>
          )}
        </div>
      </TabsContent>

      {/* Logistics Tab */}
      <TabsContent value="logistics" className="space-y-6 mt-6">
        {/* Batch Payment Form */}
        <BatchPaymentForm type="logistics" />

        {/* Pending Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-700">应付款项</h3>
          {logisticsPending.length === 0 ? (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-gray-500">
                暂无待付物流款
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {logisticsPending.map((periodData) => renderLogisticsCard(periodData, false))}
            </div>
          )}
        </div>

        {/* Paid Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-green-700">已付款项</h3>
          {logisticsPaid.length === 0 ? (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-gray-500">
                暂无已付物流款记录
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {logisticsPaid.map((periodData) => renderLogisticsCard(periodData, true))}
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
```

#### D. Page Integration

**File:** `src/app/finance/page.tsx`

```typescript
import { Header } from '@/components/layout/header'
import { FinanceTabs } from '@/components/finance/finance-tabs'
import { fetchProcurementPaymentsAll, fetchLogisticsPaymentsAll } from '@/lib/queries/finance'

export const dynamic = 'force-dynamic'

export default async function FinancePage() {
  const [procurementData, logisticsData] = await Promise.all([
    fetchProcurementPaymentsAll(),
    fetchLogisticsPaymentsAll(),
  ])

  return (
    <div className="flex flex-col">
      <Header title="资金管理" description="管理采购和物流付款" />

      <div className="flex-1 space-y-6 p-6">
        <FinanceTabs
          procurementPending={procurementData.pending}
          procurementPaid={procurementData.paid}
          logisticsPending={logisticsData.pending}
          logisticsPaid={logisticsData.paid}
        />
      </div>
    </div>
  )
}
```

#### E. Server Action Update

**File:** `src/lib/actions/finance.ts`

Update batch payment action to set `payment_date`:

```typescript
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markPaymentsPaid(
  ids: string[],
  type: 'procurement' | 'logistics',
  paymentDate: string // YYYY-MM-DD format
) {
  try {
    const supabase = await createServerSupabaseClient()
    const table = type === 'procurement' ? 'production_deliveries' : 'shipments'

    const { error } = await supabase
      .from(table)
      .update({
        payment_status: 'Paid',
        payment_date: paymentDate,
      })
      .in('id', ids)

    if (error) throw error

    revalidatePath('/finance')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
```

---

## Problem 3: Inventory Statistics Validation

### Current Issue
Verify that `total_stock = total_fba + total_3pl` in `fetchInventoryStats()`

### Analysis

**File:** `src/lib/queries/inventory.ts` (lines 173-219)

Current implementation:

```typescript
export async function fetchInventoryStats(): Promise<{
  total_stock: number
  total_fba: number
  total_3pl: number
  sku_count: number
  warehouse_count: number
}> {
  const supabase = await createServerSupabaseClient()

  const { data: inventory } = await supabase
    .from('inventory_snapshots')
    .select('sku, warehouse_id, qty_on_hand')

  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id, warehouse_type')

  const warehouseTypeMap = new Map((warehouses || []).map((w: any) => [w.id, w.warehouse_type]))

  let total_stock = 0
  let total_fba = 0
  let total_3pl = 0
  const skus = new Set<string>()
  const warehouseIds = new Set<string>()

  ;(inventory || []).forEach((inv: any) => {
    const qty = inv.qty_on_hand || 0
    total_stock += qty  // Line 200
    skus.add(inv.sku)
    warehouseIds.add(inv.warehouse_id)

    const warehouseType = warehouseTypeMap.get(inv.warehouse_id)
    if (warehouseType === 'FBA') {
      total_fba += qty  // Line 206
    } else {
      total_3pl += qty  // Line 208
    }
  })

  return {
    total_stock,
    total_fba,
    total_3pl,
    sku_count: skus.size,
    warehouse_count: warehouseIds.size,
  }
}
```

### Verdict: CORRECT ✅

The logic is mathematically sound:
- `total_stock` accumulates ALL inventory (line 200)
- `total_fba` accumulates only FBA warehouses (line 206)
- `total_3pl` accumulates only 3PL warehouses (line 208)
- Since every warehouse is either FBA or 3PL: `total_stock = total_fba + total_3pl`

### Potential Issue: In-Transit Inventory

The question mentions "在途数量应该来自 shipments 表中已发运但未到货的记录" (in-transit should come from shipped but not arrived shipments).

**Issue:** The current stats do NOT include in-transit inventory.

### Solution: Add In-Transit to Stats

**File:** `src/lib/queries/inventory.ts`

Update `fetchInventoryStats` to include in_transit:

```typescript
export async function fetchInventoryStats(): Promise<{
  total_stock: number
  total_fba: number
  total_3pl: number
  in_transit: number
  sku_count: number
  warehouse_count: number
}> {
  const supabase = await createServerSupabaseClient()

  const { data: inventory } = await supabase
    .from('inventory_snapshots')
    .select('sku, warehouse_id, qty_on_hand')

  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id, warehouse_type')

  // Fetch in-transit shipments
  const { data: inTransitShipments } = await supabase
    .from('shipments')
    .select(`
      id,
      shipment_items (
        sku,
        shipped_qty
      )
    `)
    .not('actual_departure_date', 'is', null)
    .is('actual_arrival_date', null)

  const warehouseTypeMap = new Map((warehouses || []).map((w: any) => [w.id, w.warehouse_type]))

  let total_stock = 0
  let total_fba = 0
  let total_3pl = 0
  const skus = new Set<string>()
  const warehouseIds = new Set<string>()

  ;(inventory || []).forEach((inv: any) => {
    const qty = inv.qty_on_hand || 0
    total_stock += qty
    skus.add(inv.sku)
    warehouseIds.add(inv.warehouse_id)

    const warehouseType = warehouseTypeMap.get(inv.warehouse_id)
    if (warehouseType === 'FBA') {
      total_fba += qty
    } else {
      total_3pl += qty
    }
  })

  // Calculate in-transit quantity
  let in_transit = 0
  ;(inTransitShipments || []).forEach((shipment: any) => {
    ;(shipment.shipment_items || []).forEach((item: any) => {
      in_transit += item.shipped_qty || 0
    })
  })

  return {
    total_stock,
    total_fba,
    total_3pl,
    in_transit,
    sku_count: skus.size,
    warehouse_count: warehouseIds.size,
  }
}
```

Update Dashboard to display in-transit:

**File:** `src/app/page.tsx`

Add a new stats card for in-transit inventory.

---

## Problem 4: Product List Simplification

### Changes Required

1. **Remove Columns:** unit_weight_kg, color_code, spu, category
2. **Keep Columns:** SKU, product_name, safety_stock_weeks, is_active, actions
3. **Add Column:** production_lead_weeks (default: 5 weeks)

### Database Changes

**File:** `supabase/migrations/YYYYMMDDHHMMSS_add_production_lead_weeks.sql`

```sql
-- Add production_lead_weeks column to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS production_lead_weeks INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN products.production_lead_weeks IS 'Production lead time in weeks (default: 5)';

-- Constraint: must be >= 1
ALTER TABLE products
ADD CONSTRAINT production_lead_weeks_positive CHECK (production_lead_weeks >= 1);
```

### Type Updates

**File:** `src/lib/types/database.ts`

```typescript
export interface Product {
  id: string
  sku: string
  spu: string
  color_code: string
  product_name: string
  category: string | null
  unit_cost_usd: number
  unit_weight_kg: number | null
  safety_stock_weeks: number
  production_lead_weeks: number  // NEW
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductInsert {
  id?: string
  sku: string
  spu?: string
  color_code?: string
  product_name: string
  category?: string | null
  unit_cost_usd?: number
  unit_weight_kg?: number | null
  safety_stock_weeks?: number
  production_lead_weeks?: number  // NEW (default: 5)
  is_active?: boolean
}

export interface ProductUpdate {
  sku?: string
  spu?: string
  color_code?: string
  product_name?: string
  category?: string | null
  unit_cost_usd?: number
  unit_weight_kg?: number | null
  safety_stock_weeks?: number
  production_lead_weeks?: number  // NEW
  is_active?: boolean
}
```

### Component Updates

**File:** `src/app/settings/products/page.tsx`

Simplify table and form:

```typescript
// Update EditingProduct interface
interface EditingProduct {
  sku: string
  product_name: string
  unit_cost_usd: number
  safety_stock_weeks: number
  production_lead_weeks: number  // NEW
  is_active: boolean
  isNew?: boolean
}

// Update startEdit function
const startEdit = (product: Product) => {
  setEditingProduct({
    sku: product.sku,
    product_name: product.product_name,
    unit_cost_usd: product.unit_cost_usd || 0,
    safety_stock_weeks: product.safety_stock_weeks || 2,
    production_lead_weeks: product.production_lead_weeks || 5,  // NEW
    is_active: product.is_active,
  })
}

// Update startNew function
const startNew = () => {
  setEditingProduct({
    sku: '',
    product_name: '',
    unit_cost_usd: 0,
    safety_stock_weeks: 2,
    production_lead_weeks: 5,  // NEW
    is_active: true,
    isNew: true,
  })
}

// Update saveProduct - insert/update logic
const saveProduct = async () => {
  if (!editingProduct) return
  if (!editingProduct.sku || !editingProduct.product_name) {
    setMessage('SKU 和产品名称为必填项')
    return
  }
  if (!editingProduct.unit_cost_usd || editingProduct.unit_cost_usd <= 0) {
    setMessage('单位成本必须大于 0')
    return
  }
  if (!editingProduct.safety_stock_weeks || editingProduct.safety_stock_weeks <= 0) {
    setMessage('安全库存周数必须大于 0')
    return
  }
  if (!editingProduct.production_lead_weeks || editingProduct.production_lead_weeks <= 0) {
    setMessage('生产周期必须大于 0')
    return
  }

  setSaving(true)
  setMessage('')

  const supabase = createClient()

  if (editingProduct.isNew) {
    const { error } = await (supabase.from('products') as any).insert({
      sku: editingProduct.sku,
      product_name: editingProduct.product_name,
      unit_cost_usd: editingProduct.unit_cost_usd,
      safety_stock_weeks: editingProduct.safety_stock_weeks,
      production_lead_weeks: editingProduct.production_lead_weeks,  // NEW
      is_active: editingProduct.is_active,
    })

    if (error) {
      setMessage(`创建失败: ${error.message}`)
    } else {
      setMessage('创建成功')
      setEditingProduct(null)
      await loadProducts()
    }
  } else {
    const { error } = await (supabase
      .from('products') as any)
      .update({
        product_name: editingProduct.product_name,
        unit_cost_usd: editingProduct.unit_cost_usd,
        safety_stock_weeks: editingProduct.safety_stock_weeks,
        production_lead_weeks: editingProduct.production_lead_weeks,  // NEW
        is_active: editingProduct.is_active,
      })
      .eq('sku', editingProduct.sku)

    if (error) {
      setMessage(`更新失败: ${error.message}`)
    } else {
      setMessage('更新成功')
      setEditingProduct(null)
      await loadProducts()
    }
  }

  setSaving(false)
}

// Update Form JSX (remove spu, color_code, category, unit_weight_kg)
<CardContent>
  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
    <div className="space-y-2">
      <Label htmlFor="sku">SKU *</Label>
      <Input
        id="sku"
        value={editingProduct.sku}
        onChange={(e) =>
          setEditingProduct({ ...editingProduct, sku: e.target.value })
        }
        disabled={!editingProduct.isNew}
      />
    </div>
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor="product_name">产品名称 *</Label>
      <Input
        id="product_name"
        value={editingProduct.product_name}
        onChange={(e) =>
          setEditingProduct({ ...editingProduct, product_name: e.target.value })
        }
      />
    </div>
  </div>
  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
    <div className="space-y-2">
      <Label htmlFor="unit_cost_usd">单位成本 (USD) *</Label>
      <Input
        id="unit_cost_usd"
        type="number"
        step="0.01"
        min="0"
        value={editingProduct.unit_cost_usd}
        onChange={(e) =>
          setEditingProduct({
            ...editingProduct,
            unit_cost_usd: parseFloat(e.target.value) || 0,
          })
        }
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="safety_stock_weeks">安全库存周数 *</Label>
      <Input
        id="safety_stock_weeks"
        type="number"
        step="1"
        min="1"
        value={editingProduct.safety_stock_weeks}
        onChange={(e) =>
          setEditingProduct({
            ...editingProduct,
            safety_stock_weeks: parseInt(e.target.value) || 2,
          })
        }
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="production_lead_weeks">生产周期 (周) *</Label>
      <Input
        id="production_lead_weeks"
        type="number"
        step="1"
        min="1"
        value={editingProduct.production_lead_weeks}
        onChange={(e) =>
          setEditingProduct({
            ...editingProduct,
            production_lead_weeks: parseInt(e.target.value) || 5,
          })
        }
      />
    </div>
  </div>
  <div className="mt-4 flex items-center gap-4">
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={editingProduct.is_active}
        onChange={(e) =>
          setEditingProduct({ ...editingProduct, is_active: e.target.checked })
        }
        className="h-4 w-4 rounded border-gray-300"
      />
      <span className="text-sm">启用</span>
    </label>
  </div>
  <div className="mt-4 flex gap-2">
    <Button variant="primary" onClick={saveProduct} disabled={saving}>
      <Save className="mr-2 h-4 w-4" />
      {saving ? '保存中...' : '保存'}
    </Button>
    <Button variant="outline" onClick={cancelEdit}>
      <X className="mr-2 h-4 w-4" />
      取消
    </Button>
  </div>
</CardContent>

// Update Table JSX (remove spu, color_code, category, unit_weight_kg columns)
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>SKU</TableHead>
      <TableHead>产品名称</TableHead>
      <TableHead className="text-right">单位成本 (USD)</TableHead>
      <TableHead className="text-right">安全库存周数</TableHead>
      <TableHead className="text-right">生产周期 (周)</TableHead>
      <TableHead>状态</TableHead>
      <TableHead className="text-right">操作</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {products.map((product) => (
      <TableRow key={product.sku}>
        <TableCell className="font-medium">{product.sku}</TableCell>
        <TableCell>{product.product_name}</TableCell>
        <TableCell className="text-right">
          ${product.unit_cost_usd?.toFixed(2) || '0.00'}
        </TableCell>
        <TableCell className="text-right">
          {product.safety_stock_weeks}周
        </TableCell>
        <TableCell className="text-right">
          {product.production_lead_weeks || 5}周
        </TableCell>
        <TableCell>
          <Badge variant={product.is_active ? 'success' : 'default'}>
            {product.is_active ? '启用' : '停用'}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          {/* Action buttons remain the same */}
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## Problem 5: Procurement Overview Stats Cards

### Design

Add 4 stats cards to Procurement page, mirroring Logistics page structure.

**File:** `src/app/procurement/page.tsx`

```typescript
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { ProcurementTabs } from '@/components/procurement/procurement-tabs'
import { fetchPurchaseOrders, fetchAllDeliveries } from '@/lib/queries/procurement'
import { Package, Clock, CheckCircle2, DollarSign } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ProcurementPage() {
  const [orders, deliveries] = await Promise.all([
    fetchPurchaseOrders(),
    fetchAllDeliveries(),
  ])

  // Calculate stats
  const totalOrders = orders.length
  const inProduction = orders.filter(o => o.po_status === 'In Production').length
  const delivered = orders.filter(o => o.po_status === 'Delivered').length
  const totalProcurementValue = deliveries.reduce((sum, d) => sum + (d.total_value_usd || 0), 0)

  return (
    <div className="flex flex-col">
      <Header
        title="采购管理"
        description="管理采购订单和生产交付"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总订单数</p>
                  <p className="text-xl font-semibold">{totalOrders}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <Clock className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">生产中</p>
                  <p className="text-xl font-semibold">{inProduction}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">已交付</p>
                  <p className="text-xl font-semibold">{delivered}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <DollarSign className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总采购额</p>
                  <p className="text-xl font-semibold">
                    ${totalProcurementValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <ProcurementTabs orders={orders} deliveries={deliveries} />
      </div>
    </div>
  )
}
```

---

## Problem 6: Notifications Page

### Design

Create a simple notifications list page for system alerts.

**File:** `src/app/notifications/page.tsx`

```typescript
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// TODO: Replace with actual database query
const mockNotifications = [
  {
    id: '1',
    type: 'stockout',
    title: '库存预警',
    message: 'SKU-001 预计在第50周断货，请及时补货',
    severity: 'critical',
    createdAt: '2025-12-01T10:00:00Z',
    isRead: false,
  },
  {
    id: '2',
    type: 'order_status',
    title: '订单状态变更',
    message: 'PO-2025-001 已交付',
    severity: 'info',
    createdAt: '2025-11-30T14:30:00Z',
    isRead: false,
  },
  {
    id: '3',
    type: 'payment_due',
    title: '付款提醒',
    message: '2025-12月采购款即将到期',
    severity: 'warning',
    createdAt: '2025-11-29T09:00:00Z',
    isRead: true,
  },
]

export default async function NotificationsPage() {
  const notifications = mockNotifications

  const getIcon = (type: string) => {
    switch (type) {
      case 'stockout':
        return <AlertTriangle className="h-5 w-5 text-red-600" />
      case 'order_status':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case 'payment_due':
        return <Bell className="h-5 w-5 text-yellow-600" />
      default:
        return <Info className="h-5 w-5 text-blue-600" />
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">紧急</Badge>
      case 'warning':
        return <Badge variant="default" className="bg-yellow-500">警告</Badge>
      case 'info':
        return <Badge variant="default" className="bg-blue-500">信息</Badge>
      default:
        return <Badge variant="default">普通</Badge>
    }
  }

  return (
    <div className="flex flex-col">
      <Header
        title="系统通知"
        description="查看库存预警、订单状态变更等通知"
      />

      <div className="flex-1 space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              通知列表
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无通知
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-4 rounded-lg border p-4 ${
                      notification.isRead ? 'bg-gray-50' : 'bg-white border-blue-200'
                    }`}
                  >
                    <div className="mt-1">{getIcon(notification.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-semibold ${!notification.isRead ? 'text-blue-900' : 'text-gray-900'}`}>
                          {notification.title}
                        </h3>
                        {getSeverityBadge(notification.severity)}
                        {!notification.isRead && (
                          <span className="ml-2 h-2 w-2 rounded-full bg-blue-600"></span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

**Navigation Integration:**

Update sidebar to add notifications link:

**File:** `src/components/layout/nav.tsx`

```typescript
import { Bell } from 'lucide-react'

// Add to navigation items
{
  name: '系统通知',
  href: '/notifications',
  icon: Bell,
}
```

---

## Problem 7: Documentation Folder Organization

### Design

Move all root-level `.md` files to `docs/` directory with consistent naming.

**Migration Script:**

**File:** `scripts/organize-docs.sh`

```bash
#!/bin/bash

# Create docs directory if not exists
mkdir -p docs

# List of files to move
files=(
  "BALANCE_MANAGEMENT_IMPLEMENTATION.md"
  "CHANGES_SUMMARY.md"
  "DATABASE_CLEANUP_SUMMARY.md"
  "FINANCE_REFACTOR_SUMMARY.md"
  "INVENTORY_PROJECTION_README.md"
  "PROCUREMENT_DATABASE_UPDATE.md"
  "REPLENISHMENT_ACTION_CENTER_VERIFICATION.md"
  "V2_FRONTEND_IMPLEMENTATION.md"
  "V2_TABLE_STRUCTURE.md"
)

# New naming convention (lowercase + hyphens)
new_names=(
  "balance-management-implementation.md"
  "changes-summary.md"
  "database-cleanup-summary.md"
  "finance-refactor-summary.md"
  "inventory-projection-readme.md"
  "procurement-database-update.md"
  "replenishment-action-center-verification.md"
  "v2-frontend-implementation.md"
  "v2-table-structure.md"
)

# Move and rename
for i in "${!files[@]}"; do
  if [ -f "${files[$i]}" ]; then
    mv "${files[$i]}" "docs/${new_names[$i]}"
    echo "Moved: ${files[$i]} -> docs/${new_names[$i]}"
  fi
done

# Keep these in root
# - README.md (project readme)
# - CLAUDE.md (AI instructions)
# - QUICK_START.md (developer quickstart)

echo "Documentation organization complete!"
echo "Kept in root: README.md, CLAUDE.md, QUICK_START.md"
```

**Execution:**

```bash
chmod +x scripts/organize-docs.sh
./scripts/organize-docs.sh
```

**Update References:**

Search codebase for references to moved files and update paths:

```bash
# Example: Update import paths in CLAUDE.md if needed
grep -r "BALANCE_MANAGEMENT_IMPLEMENTATION.md" .
# Replace with docs/balance-management-implementation.md
```

---

## Implementation Checklist

### Problem 1: Inventory Chart (Priority: HIGH)
- [ ] Add `getCurrentISOWeek()` helper to `lib/queries/inventory.ts`
- [ ] Create `fetchInventoryProjection24Weeks()` query
- [ ] Update chart component with month/week labels
- [ ] Add stockout dot markers
- [ ] Remove opening_stock line
- [ ] Update database view if needed (migration)
- [ ] Test cross-year display (W50 -> W01)

### Problem 2: Finance Management (Priority: HIGH)
- [ ] Add `payment_date` column to `production_deliveries` (migration)
- [ ] Add `payment_date` column to `shipments` (migration)
- [ ] Create `fetchProcurementPaymentsAll()` query
- [ ] Create `fetchLogisticsPaymentsAll()` query
- [ ] Update `finance-tabs.tsx` with pending/paid sections
- [ ] Update `markPaymentsPaid()` action to set payment_date
- [ ] Update finance page to pass both pending and paid data
- [ ] Test payment workflow end-to-end

### Problem 3: Inventory Stats (Priority: MEDIUM)
- [ ] Add in_transit calculation to `fetchInventoryStats()`
- [ ] Update dashboard to display in-transit stat
- [ ] Verify total_stock = total_fba + total_3pl (already correct)

### Problem 4: Product List (Priority: MEDIUM)
- [ ] Add `production_lead_weeks` column to products table (migration)
- [ ] Update Product type definitions
- [ ] Simplify products page form (remove 4 fields)
- [ ] Update table columns
- [ ] Test create/edit/validation

### Problem 5: Procurement Stats (Priority: LOW)
- [ ] Add stats cards to procurement page
- [ ] Calculate total orders, in production, delivered, total value
- [ ] Match styling with logistics page

### Problem 6: Notifications (Priority: LOW)
- [ ] Create notifications page skeleton
- [ ] Add to navigation
- [ ] Design notification data model (future)
- [ ] Implement mock data display

### Problem 7: Documentation (Priority: LOW)
- [ ] Create `scripts/organize-docs.sh`
- [ ] Execute migration script
- [ ] Update any internal references
- [ ] Commit changes

---

## Testing Strategy

### Unit Tests
- Date formatting functions (month/week labels)
- Payment date calculations
- Stats aggregation logic

### Integration Tests
- 24-week chart rendering
- Finance pending/paid separation
- Product CRUD with new field

### Manual QA
- Cross-year chart display (Dec 2025 -> Jan 2026)
- Payment workflow: Pending -> Scheduled -> Paid
- In-transit quantity accuracy
- Documentation links validity

---

## Rollback Plan

### Database Migrations
All migrations include `IF NOT EXISTS` and `IF EXISTS` checks for safe re-runs.

### Rollback Commands

```sql
-- Problem 2: Remove payment_date columns
ALTER TABLE production_deliveries DROP COLUMN IF EXISTS payment_date;
ALTER TABLE shipments DROP COLUMN IF EXISTS payment_date;

-- Problem 4: Remove production_lead_weeks column
ALTER TABLE products DROP COLUMN IF EXISTS production_lead_weeks;
```

### Component Rollback
Each fix is isolated in specific files - revert individual commits if needed.

---

## Performance Considerations

### Problem 1: Chart Performance
- 24 weeks of data = ~24 data points per SKU (negligible)
- Use `useMemo` for chart data transformation

### Problem 2: Finance Queries
- Add indexes on `payment_date` columns
- Separate pending/paid queries may increase load time slightly
- Consider pagination if payment history grows large (> 1000 records)

### Problem 3: In-Transit Calculation
- Additional JOIN with shipment_items
- Should remain fast with proper indexes
- Monitor query performance in production

---

## Version Impact

**Version:** 1.2.2
**Type:** Bug Fixes + Minor Features
**Breaking Changes:** None
**Database Changes:** 2 migrations (payment_date, production_lead_weeks)

---

## Success Criteria

1. **Chart Fix:** Cross-year display shows "12/W50, 01/W01" format, stockout markers visible
2. **Finance Fix:** Paid records visible in separate section with actual payment dates
3. **Stats Fix:** In-transit inventory displayed on dashboard
4. **Product Fix:** Simplified form with production_lead_weeks field
5. **Procurement Fix:** Stats cards match logistics page design
6. **Notifications:** Page accessible from navigation
7. **Docs Fix:** All `.md` files organized in `docs/` with consistent naming

---

## Dependencies

- `date-fns` (already installed) for ISO week calculations
- `recharts` (already installed) for custom chart markers
- No new dependencies required

---

## Notes for Frontend Artisan

- Use existing ShadCN components (Card, Badge, Table)
- Follow existing color scheme (blue, purple, green, orange, red)
- Maintain responsive design (grid-cols-1 sm:grid-cols-4)
- Use Lucide icons consistently

## Notes for Backend Specialist

- All migrations must be idempotent (IF NOT EXISTS)
- Add proper indexes for new columns
- Include COMMENT ON COLUMN for documentation
- Test constraint violations (production_lead_weeks >= 1)

## Notes for QA Director

- Test cross-year boundary (2025-W52 -> 2026-W01)
- Verify payment date persistence after batch actions
- Check in-transit calculation with multiple shipments
- Validate product form with missing required fields
- Test documentation links after migration

---

**End of Design Document**
