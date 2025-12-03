# 算法验证页面 V2.0 技术设计文档
# Algorithm Audit V2.0 Technical Design Document

**版本 Version:** 2.0
**创建日期 Created:** 2025-12-03
**架构师 System Architect:** Rolloy SCM Team
**状态 Status:** Ready for Implementation
**依赖需求 Requirements:** `specs/algorithm-audit/requirements.md`

---

## 1. 设计概览 Design Overview

### 1.1 核心改进 Core Improvements

本次V2.0设计在V1.0基础上扩展完整供应链时间线，主要改进：

1. **完整供应链流程** - 展示从下单到销售的5个阶段（Order → Factory Ship → Ship → Arrive → Sell）
2. **反推算法** - 根据销售周和提前期参数，反推各阶段应该发生的周次
3. **双轨数据对比** - 每个阶段显示预计值 vs 实际值，并明确显示系统取值逻辑
4. **周转率指标** - 增加库存周转率计算，评估库存健康度
5. **数据溯源** - 支持展开明细，查看具体的PO、Delivery、Shipment记录

### 1.2 数据流架构 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  AlgorithmAuditTable (Client Component)                        │ │
│  │  - SKU Selector                                                 │ │
│  │  - 21-Column Table with Expandable Details                     │ │
│  │  - Color-coded Cells (Actual/Forecast/Backtracked)            │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Server Component (SSR)
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js Server (Vercel)                          │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Page: /inventory/algorithm-audit                              │ │
│  │  - Calls fetchAlgorithmAuditV2(sku)                           │ │
│  │  - Passes data to Client Component                            │ │
│  └───────────────────┬────────────────────────────────────────────┘ │
│                      │                                               │
│  ┌───────────────────▼────────────────────────────────────────────┐ │
│  │  lib/queries/algorithm-audit.ts                                │ │
│  │  fetchAlgorithmAuditV2(sku): Promise<AlgorithmAuditResultV2>  │ │
│  │                                                                 │ │
│  │  Step 1: Fetch Product Info                                    │ │
│  │  Step 2: Generate 16-week range                                │ │
│  │  Step 3: Parallel queries (6 tables)                           │ │
│  │    - purchase_orders + purchase_order_items                    │ │
│  │    - production_deliveries                                     │ │
│  │    - shipments + shipment_items                                │ │
│  │    - sales_forecasts                                           │ │
│  │    - sales_actuals                                             │ │
│  │    - inventory_snapshots                                       │ │
│  │  Step 4: Aggregate by week_iso                                 │ │
│  │  Step 5: Backtrack supply chain weeks                          │ │
│  │  Step 6: Rolling inventory calculation                         │ │
│  └───────────────────┬────────────────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Tables:                                                        │ │
│  │  - products                                                     │ │
│  │  - purchase_orders                                             │ │
│  │  - purchase_order_items                                        │ │
│  │  - production_deliveries                                       │ │
│  │  - shipments                                                   │ │
│  │  - shipment_items                                              │ │
│  │  - sales_forecasts                                             │ │
│  │  - sales_actuals                                               │ │
│  │  - inventory_snapshots                                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. TypeScript 类型定义 Type Definitions

### 2.1 新增核心类型

```typescript
/**
 * Algorithm Audit Result V2.0
 * Extended with full supply chain timeline
 */
export interface AlgorithmAuditResultV2 {
  product: Product | null
  rows: AlgorithmAuditRowV2[]
  metadata: AlgorithmAuditMetadataV2
}

/**
 * Metadata for Algorithm Audit V2.0
 */
export interface AlgorithmAuditMetadataV2 {
  current_week: string
  start_week: string
  end_week: string
  total_weeks: number
  avg_weekly_sales: number
  safety_stock_weeks: number

  // New: Lead time parameters
  lead_times: SupplyChainLeadTimes
}

/**
 * Supply chain lead time parameters
 * Used for backtracking timeline
 */
export interface SupplyChainLeadTimes {
  production_weeks: number      // Order → Factory Ship (default: 8)
  loading_weeks: number          // Factory Ship → Ship (default: 1)
  transit_weeks: number          // Ship → Arrive (default: 4)
  safety_buffer_weeks: number    // Arrive → Sale (product.safety_stock_weeks)
}

/**
 * Algorithm Audit Row V2.0
 * One week's complete supply chain data for a SKU
 */
export interface AlgorithmAuditRowV2 {
  // ===== Basic Info =====
  week_iso: string
  week_start_date: string
  week_offset: number
  is_past: boolean
  is_current: boolean

  // ===== Sales Data (3 columns) =====
  sales_forecast: number
  sales_actual: number | null
  sales_effective: number
  sales_source: 'actual' | 'forecast'

  // ===== Arrival Data (5 columns) =====
  // Planned (backtracked from current week)
  planned_arrival_week: string
  planned_arrival_qty: number

  // Actual (from database)
  actual_arrival_week: string | null
  actual_arrival_qty: number

  // Effective value (used in inventory calculation)
  arrival_effective: number
  arrival_source: 'actual' | 'planned'

  // ===== Ship Data (2 columns) =====
  planned_ship_week: string
  actual_ship_week: string | null

  // ===== Factory Ship Data (2 columns) =====
  planned_factory_ship_week: string
  actual_factory_ship_week: string | null

  // ===== Order Data (3 columns) =====
  planned_order_week: string
  actual_order_week: string | null
  actual_order_qty: number

  // ===== Inventory Calculation (5 columns) =====
  opening_stock: number
  closing_stock: number
  safety_threshold: number
  turnover_ratio: number | null  // closing_stock / sales_effective
  stock_status: StockStatus

  // ===== Expandable Details =====
  shipment_details: ShipmentDetail[]
  order_details: OrderDetail[]
  delivery_details: DeliveryDetail[]
}

/**
 * Order detail for expandable section
 */
export interface OrderDetail {
  po_number: string
  po_item_id: string
  supplier_name: string | null
  planned_order_date: string | null
  actual_order_date: string | null
  ordered_qty: number
  order_source: 'actual' | 'planned'
}

/**
 * Production delivery detail for expandable section
 */
export interface DeliveryDetail {
  delivery_number: string
  po_number: string
  planned_delivery_date: string | null
  actual_delivery_date: string | null
  delivered_qty: number
  delivery_source: 'actual' | 'planned'
}

/**
 * Shipment detail for expandable section
 * (Already exists in V1, kept for reference)
 */
export interface ShipmentDetail {
  tracking_number: string
  planned_arrival_date: string | null
  actual_arrival_date: string | null
  shipped_qty: number
  arrival_source: 'actual' | 'planned'
}
```

### 2.2 供应链参数常量

```typescript
/**
 * lib/constants/supply-chain-params.ts
 * Supply chain lead time parameters (hardcoded for V2.0)
 */
export const SUPPLY_CHAIN_LEAD_TIMES = {
  PRODUCTION_WEEKS: 8,        // Order → Factory Ship
  LOADING_PREP_WEEKS: 1,      // Factory Ship → Ship
  TRANSIT_WEEKS: 4,           // Ship → Arrive
  SAFETY_BUFFER_WEEKS: 2,     // Default safety stock weeks (overridden by product.safety_stock_weeks)
} as const

export type SupplyChainLeadTimesType = typeof SUPPLY_CHAIN_LEAD_TIMES
```

---

## 3. 后端查询逻辑设计 Backend Query Design

### 3.1 主查询函数签名

```typescript
/**
 * lib/queries/algorithm-audit.ts
 * Fetch comprehensive algorithm audit data V2.0
 */
export async function fetchAlgorithmAuditV2(
  sku: string
): Promise<AlgorithmAuditResultV2> {
  const supabase = await createServerSupabaseClient()

  // Step 1: Fetch product info
  const product = await fetchProductInfo(supabase, sku)
  if (!product) return emptyResult()

  // Step 2: Generate 16-week range
  const weeks = generateWeekRange()

  // Step 3: Parallel data fetching
  const [
    ordersMap,
    deliveriesMap,
    shipmentsMap,
    forecastsMap,
    actualsMap,
    initialStock,
  ] = await Promise.all([
    fetchOrdersByWeek(supabase, sku, weeks),
    fetchDeliveriesByWeek(supabase, sku, weeks),
    fetchShipmentsByWeek(supabase, sku, weeks),
    fetchForecastsByWeek(supabase, sku, weeks),
    fetchActualsByWeek(supabase, sku, weeks),
    fetchInitialStock(supabase, sku),
  ])

  // Step 4: Calculate metadata
  const metadata = calculateMetadata(product, weeks, forecastsMap, actualsMap)

  // Step 5: Build rows with backtracking and rolling inventory
  const rows = buildAuditRows({
    weeks,
    product,
    ordersMap,
    deliveriesMap,
    shipmentsMap,
    forecastsMap,
    actualsMap,
    initialStock,
    metadata,
  })

  return { product, rows, metadata }
}
```

### 3.2 辅助查询函数

#### 3.2.1 订单数据聚合

```typescript
/**
 * Fetch purchase orders grouped by order week
 * Returns Map<week_iso, OrderDetail[]>
 */
async function fetchOrdersByWeek(
  supabase: SupabaseClient,
  sku: string,
  weeks: string[]
): Promise<Map<string, OrderDetail[]>> {
  const { data: orders } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      po_number,
      planned_order_date,
      actual_order_date,
      supplier:suppliers(supplier_name),
      purchase_order_items!inner(
        id,
        sku,
        ordered_qty
      )
    `)
    .eq('purchase_order_items.sku', sku)

  const ordersMap = new Map<string, OrderDetail[]>()

  orders?.forEach(order => {
    order.purchase_order_items.forEach(item => {
      if (item.sku !== sku) return

      // Aggregate by actual order week (if exists)
      if (order.actual_order_date) {
        const week = getWeekFromDate(new Date(order.actual_order_date))
        if (!weeks.includes(week)) return

        const detail: OrderDetail = {
          po_number: order.po_number,
          po_item_id: item.id,
          supplier_name: order.supplier?.supplier_name || null,
          planned_order_date: order.planned_order_date,
          actual_order_date: order.actual_order_date,
          ordered_qty: item.ordered_qty,
          order_source: 'actual',
        }

        const existing = ordersMap.get(week) || []
        existing.push(detail)
        ordersMap.set(week, existing)
      }
    })
  })

  return ordersMap
}
```

#### 3.2.2 生产交付数据聚合

```typescript
/**
 * Fetch production deliveries grouped by delivery week
 * Returns Map<week_iso, DeliveryDetail[]>
 */
async function fetchDeliveriesByWeek(
  supabase: SupabaseClient,
  sku: string,
  weeks: string[]
): Promise<Map<string, DeliveryDetail[]>> {
  const { data: deliveries } = await supabase
    .from('production_deliveries')
    .select(`
      id,
      delivery_number,
      sku,
      delivered_qty,
      planned_delivery_date,
      actual_delivery_date,
      purchase_order_item:purchase_order_items!inner(
        purchase_order:purchase_orders(po_number)
      )
    `)
    .eq('sku', sku)

  const deliveriesMap = new Map<string, DeliveryDetail[]>()

  deliveries?.forEach(delivery => {
    // Aggregate by actual delivery week (if exists)
    if (delivery.actual_delivery_date) {
      const week = getWeekFromDate(new Date(delivery.actual_delivery_date))
      if (!weeks.includes(week)) return

      const detail: DeliveryDetail = {
        delivery_number: delivery.delivery_number,
        po_number: delivery.purchase_order_item.purchase_order.po_number,
        planned_delivery_date: delivery.planned_delivery_date,
        actual_delivery_date: delivery.actual_delivery_date,
        delivered_qty: delivery.delivered_qty,
        delivery_source: 'actual',
      }

      const existing = deliveriesMap.get(week) || []
      existing.push(detail)
      deliveriesMap.set(week, existing)
    }
  })

  return deliveriesMap
}
```

#### 3.2.3 发运数据聚合

```typescript
/**
 * Fetch shipments grouped by departure/arrival week
 * Returns nested Map:
 * - arrivalMap: Map<arrival_week, ShipmentDetail[]>
 * - departureMap: Map<departure_week, string> (just week string for display)
 */
async function fetchShipmentsByWeek(
  supabase: SupabaseClient,
  sku: string,
  weeks: string[]
): Promise<{
  arrivalMap: Map<string, ShipmentDetail[]>
  departureMap: Map<string, string>
}> {
  const { data: shipments } = await supabase
    .from('shipments')
    .select(`
      id,
      tracking_number,
      planned_departure_date,
      actual_departure_date,
      planned_arrival_date,
      actual_arrival_date,
      shipment_items!inner(sku, shipped_qty)
    `)
    .eq('shipment_items.sku', sku)

  const arrivalMap = new Map<string, ShipmentDetail[]>()
  const departureMap = new Map<string, string>()

  shipments?.forEach(shipment => {
    shipment.shipment_items.forEach((item: any) => {
      if (item.sku !== sku) return

      // Aggregate by arrival week
      const arrivalDate = shipment.actual_arrival_date || shipment.planned_arrival_date
      if (arrivalDate) {
        const arrivalWeek = getWeekFromDate(new Date(arrivalDate))
        if (weeks.includes(arrivalWeek)) {
          const detail: ShipmentDetail = {
            tracking_number: shipment.tracking_number,
            planned_arrival_date: shipment.planned_arrival_date,
            actual_arrival_date: shipment.actual_arrival_date,
            shipped_qty: item.shipped_qty,
            arrival_source: shipment.actual_arrival_date ? 'actual' : 'planned',
          }

          const existing = arrivalMap.get(arrivalWeek) || []
          existing.push(detail)
          arrivalMap.set(arrivalWeek, existing)
        }
      }

      // Aggregate by departure week (for display only)
      const departureDate = shipment.actual_departure_date || shipment.planned_departure_date
      if (departureDate) {
        const departureWeek = getWeekFromDate(new Date(departureDate))
        if (weeks.includes(departureWeek)) {
          departureMap.set(departureWeek, departureWeek)
        }
      }
    })
  })

  return { arrivalMap, departureMap }
}
```

### 3.3 反推算法实现

```typescript
/**
 * Backtrack supply chain weeks from current week
 *
 * Logic:
 * 1. Planned Arrival Week = Current Week + safety_buffer_weeks
 * 2. Planned Arrival Qty = Forecast Sales × safety_buffer_weeks
 * 3. Planned Ship Week = Planned Arrival Week - transit_weeks
 * 4. Planned Factory Ship Week = Planned Ship Week - loading_weeks
 * 5. Planned Order Week = Planned Factory Ship Week - production_weeks
 */
function backtrackSupplyChainWeeks(params: {
  current_week: string
  forecast_sales: number
  safety_buffer_weeks: number
  lead_times: SupplyChainLeadTimes
}): {
  planned_arrival_week: string
  planned_arrival_qty: number
  planned_ship_week: string
  planned_factory_ship_week: string
  planned_order_week: string
} {
  const {
    current_week,
    forecast_sales,
    safety_buffer_weeks,
    lead_times,
  } = params

  // Step 1: Planned arrival
  const planned_arrival_week = addWeeksToWeekString(
    current_week,
    safety_buffer_weeks
  ) || current_week

  const planned_arrival_qty = Math.round(
    forecast_sales * safety_buffer_weeks
  )

  // Step 2: Planned ship (departure from port)
  const planned_ship_week = addWeeksToWeekString(
    planned_arrival_week,
    -lead_times.transit_weeks
  ) || current_week

  // Step 3: Planned factory ship (production delivery)
  const planned_factory_ship_week = addWeeksToWeekString(
    planned_ship_week,
    -lead_times.loading_weeks
  ) || current_week

  // Step 4: Planned order
  const planned_order_week = addWeeksToWeekString(
    planned_factory_ship_week,
    -lead_times.production_weeks
  ) || current_week

  return {
    planned_arrival_week,
    planned_arrival_qty,
    planned_ship_week,
    planned_factory_ship_week,
    planned_order_week,
  }
}
```

### 3.4 行数据构建逻辑

```typescript
/**
 * Build audit rows with backtracking and rolling inventory
 */
function buildAuditRows(params: {
  weeks: string[]
  product: Product
  ordersMap: Map<string, OrderDetail[]>
  deliveriesMap: Map<string, DeliveryDetail[]>
  shipmentsMap: { arrivalMap: Map<string, ShipmentDetail[]>; departureMap: Map<string, string> }
  forecastsMap: Map<string, number>
  actualsMap: Map<string, number>
  initialStock: number
  metadata: AlgorithmAuditMetadataV2
}): AlgorithmAuditRowV2[] {
  const {
    weeks,
    product,
    ordersMap,
    deliveriesMap,
    shipmentsMap,
    forecastsMap,
    actualsMap,
    initialStock,
    metadata,
  } = params

  let runningStock = initialStock
  const currentWeek = metadata.current_week

  return weeks.map((week, index) => {
    const weekOffset = index - 4 // -4 to +11

    // ===== Sales Data =====
    const sales_forecast = forecastsMap.get(week) || 0
    const sales_actual = actualsMap.get(week) ?? null
    const sales_effective = sales_actual ?? sales_forecast
    const sales_source: 'actual' | 'forecast' = sales_actual !== null ? 'actual' : 'forecast'

    // ===== Backtrack Supply Chain =====
    const backtracked = backtrackSupplyChainWeeks({
      current_week: week,
      forecast_sales: sales_forecast,
      safety_buffer_weeks: product.safety_stock_weeks,
      lead_times: metadata.lead_times,
    })

    // ===== Arrival Data =====
    const shipment_details = shipmentsMap.arrivalMap.get(week) || []
    const actual_arrival_qty = shipment_details.reduce(
      (sum, s) => sum + s.shipped_qty,
      0
    )
    const actual_arrival_week = shipment_details.length > 0 ? week : null

    const arrival_effective = actual_arrival_qty > 0
      ? actual_arrival_qty
      : backtracked.planned_arrival_qty
    const arrival_source: 'actual' | 'planned' = actual_arrival_qty > 0 ? 'actual' : 'planned'

    // ===== Ship Data =====
    const actual_ship_week = shipmentsMap.departureMap.get(week) || null

    // ===== Factory Ship Data =====
    const delivery_details = deliveriesMap.get(week) || []
    const actual_factory_ship_week = delivery_details.length > 0 ? week : null

    // ===== Order Data =====
    const order_details = ordersMap.get(week) || []
    const actual_order_week = order_details.length > 0 ? week : null
    const actual_order_qty = order_details.reduce((sum, o) => sum + o.ordered_qty, 0)

    // ===== Inventory Calculation =====
    const opening_stock = runningStock
    const closing_stock = opening_stock + arrival_effective - sales_effective
    runningStock = closing_stock

    const safety_threshold = metadata.avg_weekly_sales * product.safety_stock_weeks
    const turnover_ratio = sales_effective > 0 ? closing_stock / sales_effective : null

    let stock_status: StockStatus = 'OK'
    if (closing_stock <= 0) {
      stock_status = 'Stockout'
    } else if (closing_stock < safety_threshold) {
      stock_status = 'Risk'
    }

    // ===== Build Row =====
    return {
      week_iso: week,
      week_start_date: formatWeek(week, 'yyyy-MM-dd'),
      week_offset: weekOffset,
      is_past: weekOffset < 0,
      is_current: week === currentWeek,

      // Sales
      sales_forecast,
      sales_actual,
      sales_effective,
      sales_source,

      // Arrival
      planned_arrival_week: backtracked.planned_arrival_week,
      planned_arrival_qty: backtracked.planned_arrival_qty,
      actual_arrival_week,
      actual_arrival_qty,
      arrival_effective,
      arrival_source,

      // Ship
      planned_ship_week: backtracked.planned_ship_week,
      actual_ship_week,

      // Factory Ship
      planned_factory_ship_week: backtracked.planned_factory_ship_week,
      actual_factory_ship_week,

      // Order
      planned_order_week: backtracked.planned_order_week,
      actual_order_week,
      actual_order_qty,

      // Inventory
      opening_stock,
      closing_stock,
      safety_threshold,
      turnover_ratio,
      stock_status,

      // Details
      shipment_details,
      order_details,
      delivery_details,
    }
  })
}
```

---

## 4. 前端组件设计 Frontend Component Design

### 4.1 组件结构

```
src/app/inventory/algorithm-audit/
├── page.tsx                                    # Server Component (Data Fetching)
└── components/
    ├── algorithm-audit-table-v2.tsx            # Client Component (Main Table)
    ├── algorithm-audit-header.tsx              # SKU Selector + Filters
    ├── algorithm-audit-row.tsx                 # Single Row Component
    ├── expandable-order-details.tsx            # Order Details Expandable Section
    ├── expandable-delivery-details.tsx         # Delivery Details Expandable Section
    └── expandable-shipment-details.tsx         # Shipment Details Expandable Section
```

### 4.2 主表格列配置

```typescript
/**
 * Table column configuration for Algorithm Audit V2.0
 * Total: 21 columns grouped into 7 sections
 */
export const ALGORITHM_AUDIT_COLUMNS = [
  // ===== Section 1: Basic Info (2 columns) =====
  { id: 'week_iso', label: '周次 Week', width: '100px', sticky: 'left', group: 'basic' },
  { id: 'week_start_date', label: '周起始日 Start', width: '120px', group: 'basic' },

  // ===== Section 2: Sales Data (3 columns) =====
  { id: 'sales_forecast', label: '预计销量 Forecast', width: '100px', group: 'sales' },
  { id: 'sales_actual', label: '实际销量 Actual', width: '100px', group: 'sales' },
  { id: 'sales_effective', label: '销量取值 Effective', width: '120px', group: 'sales', emphasize: true },

  // ===== Section 3: Arrival Data (5 columns) =====
  { id: 'planned_arrival_week', label: '预计到仓周 Plan Week', width: '100px', group: 'arrival' },
  { id: 'planned_arrival_qty', label: '预计到仓量 Plan Qty', width: '100px', group: 'arrival' },
  { id: 'actual_arrival_week', label: '实际到仓周 Actual Week', width: '100px', group: 'arrival' },
  { id: 'actual_arrival_qty', label: '实际到仓量 Actual Qty', width: '100px', group: 'arrival' },
  { id: 'arrival_effective', label: '到仓取值 Effective', width: '120px', group: 'arrival', emphasize: true },

  // ===== Section 4: Ship Data (2 columns) =====
  { id: 'planned_ship_week', label: '预计发货周 Plan', width: '100px', group: 'ship' },
  { id: 'actual_ship_week', label: '实际发货周 Actual', width: '100px', group: 'ship' },

  // ===== Section 5: Factory Ship Data (2 columns) =====
  { id: 'planned_factory_ship_week', label: '预计出货周 Plan', width: '100px', group: 'factory' },
  { id: 'actual_factory_ship_week', label: '实际出货周 Actual', width: '100px', group: 'factory' },

  // ===== Section 6: Order Data (2 columns) =====
  { id: 'planned_order_week', label: '预计下单周 Plan', width: '100px', group: 'order' },
  { id: 'actual_order_week', label: '实际下单周 Actual', width: '100px', group: 'order' },

  // ===== Section 7: Inventory Calculation (5 columns) =====
  { id: 'opening_stock', label: '期初库存 Opening', width: '100px', group: 'inventory' },
  { id: 'closing_stock', label: '期末库存 Closing', width: '140px', group: 'inventory', emphasize: true },
  { id: 'safety_threshold', label: '安全库存 Safety', width: '100px', group: 'inventory' },
  { id: 'turnover_ratio', label: '周转率 Turnover', width: '100px', group: 'inventory' },
  { id: 'stock_status', label: '状态 Status', width: '100px', group: 'inventory' },
] as const
```

### 4.3 颜色编码系统

```typescript
/**
 * Cell styling based on data type and value source
 */
export function getCellStyle(params: {
  columnId: string
  value: any
  source?: 'actual' | 'forecast' | 'planned'
  isPast: boolean
  stockStatus?: StockStatus
}): { backgroundColor: string; textColor: string; fontWeight: string } {
  const { columnId, value, source, isPast, stockStatus } = params

  // ===== Actual Values (Green) =====
  if (source === 'actual' && value !== null) {
    return {
      backgroundColor: 'bg-green-50',
      textColor: 'text-gray-900',
      fontWeight: 'font-medium',
    }
  }

  // ===== Forecast Values (Yellow) =====
  if (source === 'forecast') {
    return {
      backgroundColor: 'bg-yellow-50',
      textColor: 'text-gray-900',
      fontWeight: 'font-normal',
    }
  }

  // ===== Planned/Backtracked Values (Light Blue) =====
  if (source === 'planned' || columnId.startsWith('planned_')) {
    return {
      backgroundColor: 'bg-sky-50',
      textColor: isPast ? 'text-gray-400' : 'text-gray-700',
      fontWeight: 'font-normal',
    }
  }

  // ===== Effective Values (Emphasis) =====
  if (columnId.includes('effective')) {
    return {
      backgroundColor: source === 'actual' ? 'bg-green-100' : 'bg-yellow-100',
      textColor: 'text-gray-900',
      fontWeight: 'font-semibold',
    }
  }

  // ===== Stock Status Colors =====
  if (columnId === 'closing_stock' && stockStatus) {
    if (stockStatus === 'Stockout') {
      return {
        backgroundColor: 'bg-red-600',
        textColor: 'text-white',
        fontWeight: 'font-bold',
      }
    }
    if (stockStatus === 'Risk') {
      return {
        backgroundColor: 'bg-orange-100',
        textColor: 'text-orange-900',
        fontWeight: 'font-semibold',
      }
    }
  }

  // ===== Default =====
  return {
    backgroundColor: 'bg-white',
    textColor: 'text-gray-900',
    fontWeight: 'font-normal',
  }
}
```

### 4.4 可展开明细组件

```typescript
/**
 * Expandable Order Details Component
 */
interface ExpandableOrderDetailsProps {
  week_iso: string
  order_details: OrderDetail[]
}

export function ExpandableOrderDetails({ week_iso, order_details }: ExpandableOrderDetailsProps) {
  if (order_details.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="font-semibold text-sm text-gray-700">
        下单明细 Order Details ({order_details.length}):
      </div>
      {order_details.map((order, idx) => (
        <div key={idx} className="flex items-center gap-6 p-3 bg-white rounded-lg border">
          <div className="flex-1">
            <span className="font-mono font-semibold text-blue-600">
              {order.po_number}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">供应商:</span>
            <span className="font-medium">{order.supplier_name || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">计划日期:</span>
            <span className="px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs">
              {order.planned_order_date || '-'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">实际日期:</span>
            <span className={cn(
              'px-2 py-1 rounded text-xs',
              order.actual_order_date
                ? 'bg-green-50 border border-green-200 font-medium'
                : 'bg-gray-50 border border-gray-200 text-gray-400'
            )}>
              {order.actual_order_date || '-'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">数量:</span>
            <span className="font-semibold">{formatNumber(order.ordered_qty)}件</span>
          </div>
          <a
            href={`/procurement?search=${order.po_number}`}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium"
          >
            查看详情
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ))}
    </div>
  )
}
```

---

## 5. 数据库优化建议 Database Optimization

### 5.1 索引优化

为保证查询性能，建议添加以下复合索引：

```sql
-- Purchase Orders: Optimize order week lookup
CREATE INDEX IF NOT EXISTS idx_po_actual_order_date
ON purchase_orders(actual_order_date)
WHERE actual_order_date IS NOT NULL;

-- Production Deliveries: Optimize delivery week lookup
CREATE INDEX IF NOT EXISTS idx_delivery_actual_delivery_date_sku
ON production_deliveries(actual_delivery_date, sku)
WHERE actual_delivery_date IS NOT NULL;

-- Shipments: Optimize arrival/departure week lookup
CREATE INDEX IF NOT EXISTS idx_shipment_actual_arrival_date
ON shipments(actual_arrival_date)
WHERE actual_arrival_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipment_actual_departure_date
ON shipments(actual_departure_date)
WHERE actual_departure_date IS NOT NULL;

-- Shipment Items: Optimize SKU filtering
CREATE INDEX IF NOT EXISTS idx_shipment_items_sku
ON shipment_items(sku, shipment_id);

-- Purchase Order Items: Optimize SKU filtering
CREATE INDEX IF NOT EXISTS idx_po_items_sku
ON purchase_order_items(sku, po_id);
```

### 5.2 查询性能预估

基于16周窗口和单个SKU查询：

| 查询表 | 预估行数 | 索引命中 | 预估耗时 |
|--------|---------|---------|---------|
| purchase_orders + purchase_order_items | ~20-50 | ✓ | ~50ms |
| production_deliveries | ~20-50 | ✓ | ~30ms |
| shipments + shipment_items | ~50-100 | ✓ | ~80ms |
| sales_forecasts | ~16 | ✓ (week_iso) | ~10ms |
| sales_actuals | ~16 | ✓ (week_iso) | ~10ms |
| inventory_snapshots | ~5 | ✓ (sku) | ~5ms |
| **总计 Total** | | | **~185ms** |

并行查询后预估总耗时：**~100ms** (最慢查询的耗时)

---

## 6. 实现优先级与里程碑 Implementation Phases

### Phase 1: MVP - 核心扩展 (P0)

**目标 Goal:** 在V1.0基础上添加关键新列，保持向后兼容

**需实现 Deliverables:**
1. 新增类型定义 (`AlgorithmAuditRowV2`, `SupplyChainLeadTimes`)
2. 实现反推算法 (`backtrackSupplyChainWeeks`)
3. 扩展查询函数 (`fetchAlgorithmAuditV2`)
4. 添加新列：
   - 预计到仓周/量 (Planned Arrival Week/Qty)
   - 周转率 (Turnover Ratio)
5. 更新表格组件显示新列

**验收标准 Acceptance:**
- 所有V1.0功能正常工作
- 新增5列正确显示数据
- 反推算法准确率100%
- 单SKU查询 < 2秒

**工期 Timeline:** 2-3天

---

### Phase 2: 完整供应链时间线 (P1)

**目标 Goal:** 展示完整的Order → Factory → Ship → Arrive → Sell流程

**需实现 Deliverables:**
1. 实现订单数据聚合 (`fetchOrdersByWeek`)
2. 实现生产交付数据聚合 (`fetchDeliveriesByWeek`)
3. 实现发货周匹配
4. 添加剩余12列（发货、出货、下单）
5. 更新表格组件显示完整21列

**验收标准 Acceptance:**
- 21列全部正确显示
- 实际值与预计值对比清晰
- 数据溯源准确（可链接到原始记录）
- 单SKU查询 < 2秒

**工期 Timeline:** 3-4天

---

### Phase 3: 可展开明细 (P2)

**目标 Goal:** 支持展开查看具体的PO、Delivery、Shipment记录

**需实现 Deliverables:**
1. 实现 `ExpandableOrderDetails` 组件
2. 实现 `ExpandableDeliveryDetails` 组件
3. 扩展现有 `ExpandableShipmentDetails` 组件
4. 添加展开/折叠交互逻辑
5. 添加"查看详情"链接跳转

**验收标准 Acceptance:**
- 点击数量列可展开明细
- 明细显示完整信息（PO号、日期、数量等）
- "查看详情"链接跳转到正确页面
- 展开/折叠动画流畅

**工期 Timeline:** 2天

---

### Phase 4: 增强体验 (P3 - 未来)

**可选功能 Optional Features:**
- 导出Excel功能
- 异常值警告（预计vs实际偏差>50%）
- 历史准确率分析图表
- 响应式移动端布局
- 提前期参数可配置（设置页面）

---

## 7. 数据流图 Data Flow Diagram

### 7.1 查询执行流程

```
┌──────────────────────────────────────────────────────────────────┐
│ fetchAlgorithmAuditV2(sku: string)                               │
└────────────────────────┬─────────────────────────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌─────────┐      ┌────────────┐      ┌────────────────┐
│ Product │      │ Week Range │      │ Initial Stock  │
│  Info   │      │ Generation │      │  (Snapshots)   │
└─────────┘      └────────────┘      └────────────────┘
                         │
                         ▼
          ┌──────────────────────────────────┐
          │   Promise.all (6 parallel queries) │
          └──────────────────────────────────┘
                         │
    ┌────────────────────┼──────────────────────────┐
    │                    │                          │
    ▼                    ▼                          ▼
┌─────────┐      ┌────────────┐      ┌──────────────────┐
│ Orders  │      │ Deliveries │      │   Shipments      │
│ ByWeek  │      │  ByWeek    │      │ (Arrival/Depart) │
└─────────┘      └────────────┘      └──────────────────┘
    │                    │                          │
    ▼                    ▼                          ▼
┌─────────┐      ┌────────────┐      ┌──────────────────┐
│Forecasts│      │  Actuals   │      │  (Data Merged)   │
│ ByWeek  │      │  ByWeek    │      └──────────────────┘
└─────────┘      └────────────┘
    │                    │
    └────────────────────┼─────────────────────────┐
                         │                         │
                         ▼                         ▼
              ┌──────────────────┐      ┌──────────────────┐
              │ Calculate        │      │ Backtrack        │
              │ Metadata         │      │ Supply Chain     │
              │ (Avg Sales, etc) │      │ Weeks            │
              └──────────────────┘      └──────────────────┘
                         │                         │
                         └──────────┬──────────────┘
                                    ▼
                         ┌───────────────────────┐
                         │  Build Audit Rows     │
                         │  (16 rows)            │
                         │  - Sales data         │
                         │  - Backtracked weeks  │
                         │  - Actual matching    │
                         │  - Rolling inventory  │
                         └───────────────────────┘
                                    │
                                    ▼
                         ┌───────────────────────┐
                         │ Return                │
                         │ AlgorithmAuditResultV2│
                         └───────────────────────┘
```

### 7.2 单行数据计算流程

```
Input: week_iso, forecast_sales, product, lead_times
│
├─> Step 1: Backtrack Supply Chain
│   ├─> planned_arrival_week = current_week + safety_buffer_weeks
│   ├─> planned_arrival_qty = forecast_sales × safety_buffer_weeks
│   ├─> planned_ship_week = planned_arrival_week - transit_weeks
│   ├─> planned_factory_ship_week = planned_ship_week - loading_weeks
│   └─> planned_order_week = planned_factory_ship_week - production_weeks
│
├─> Step 2: Match Actual Data
│   ├─> actual_order_week = ordersMap.get(week) ? week : null
│   ├─> actual_factory_ship_week = deliveriesMap.get(week) ? week : null
│   ├─> actual_ship_week = departureMap.get(week) ? week : null
│   └─> actual_arrival_qty = arrivalMap.get(week).sum(shipped_qty)
│
├─> Step 3: Calculate Effective Values
│   ├─> sales_effective = sales_actual ?? sales_forecast
│   ├─> arrival_effective = actual_arrival_qty > 0 ? actual_arrival_qty : planned_arrival_qty
│   └─> sources = ['actual' | 'forecast' | 'planned']
│
├─> Step 4: Rolling Inventory Calculation
│   ├─> opening_stock = previous_closing_stock
│   ├─> closing_stock = opening_stock + arrival_effective - sales_effective
│   ├─> turnover_ratio = closing_stock / sales_effective
│   └─> stock_status = closing_stock vs safety_threshold
│
└─> Output: AlgorithmAuditRowV2
```

---

## 8. 边界情况处理 Edge Cases

### 8.1 数据缺失

| 场景 Scenario | 处理方式 Handling |
|--------------|-----------------|
| 未来周无预测数据 | `forecast_qty = 0`, 显示"-" |
| 历史周无实际数据 | 使用预测值兜底, 标注来源为 `forecast` |
| PO未填写实际下单日期 | `actual_order_week = null`, 显示"-" |
| 发运单未到仓 | `actual_arrival_qty = 0`, 使用计划值 |
| 无库存快照数据 | `initialStock = 0`, 显示警告 |

### 8.2 跨年周次

```typescript
// 示例: 2025年最后一周 + 2周 = 2026年第2周
addWeeksToWeekString('2025-W52', 2) // => '2026-W02' ✓

// date-fns 自动处理跨年逻辑
```

### 8.3 部分交付

```typescript
// 场景: 一个PO分2次交付
// PO-001: 订购100件
//   - Delivery-001: 60件 (2025-W10)
//   - Delivery-002: 40件 (2025-W12)

// 处理: 分别聚合到对应周
// W10: actual_factory_ship_week = '2025-W10', qty = 60
// W12: actual_factory_ship_week = '2025-W12', qty = 40
```

### 8.4 一周多单

```typescript
// 场景: 同一SKU在同一周有多个PO下单
// PO-001: 100件 (2025-W10)
// PO-002: 50件 (2025-W10)

// 处理: 聚合显示总量, 可展开查看明细
// actual_order_qty = 150
// order_details = [PO-001, PO-002]
```

---

## 9. 测试用例 Test Cases

### 9.1 单元测试

```typescript
describe('backtrackSupplyChainWeeks', () => {
  it('should correctly backtrack 8+1+4=13 weeks', () => {
    const result = backtrackSupplyChainWeeks({
      current_week: '2025-W45',
      forecast_sales: 50,
      safety_buffer_weeks: 2,
      lead_times: {
        production_weeks: 8,
        loading_weeks: 1,
        transit_weeks: 4,
      },
    })

    expect(result.planned_arrival_week).toBe('2025-W47')
    expect(result.planned_arrival_qty).toBe(100)
    expect(result.planned_ship_week).toBe('2025-W43')
    expect(result.planned_factory_ship_week).toBe('2025-W42')
    expect(result.planned_order_week).toBe('2025-W34')
  })

  it('should handle cross-year backtracking', () => {
    const result = backtrackSupplyChainWeeks({
      current_week: '2026-W02',
      forecast_sales: 100,
      safety_buffer_weeks: 2,
      lead_times: {
        production_weeks: 8,
        loading_weeks: 1,
        transit_weeks: 4,
      },
    })

    expect(result.planned_order_week).toBe('2025-W39') // Cross year
  })
})

describe('buildAuditRows', () => {
  it('should calculate rolling inventory correctly', () => {
    const rows = buildAuditRows({
      weeks: ['2025-W45', '2025-W46'],
      // ... mock data
      initialStock: 200,
    })

    // Week 45: 200 + 100 - 50 = 250
    expect(rows[0].opening_stock).toBe(200)
    expect(rows[0].closing_stock).toBe(250)

    // Week 46: 250 + 0 - 60 = 190
    expect(rows[1].opening_stock).toBe(250)
    expect(rows[1].closing_stock).toBe(190)
  })

  it('should prioritize actual values over forecast', () => {
    const row = buildAuditRows({
      forecastsMap: new Map([['2025-W45', 50]]),
      actualsMap: new Map([['2025-W45', 48]]),
      // ... other params
    })[0]

    expect(row.sales_effective).toBe(48)
    expect(row.sales_source).toBe('actual')
  })
})
```

### 9.2 集成测试

```typescript
describe('fetchAlgorithmAuditV2', () => {
  it('should return complete 16-week data for valid SKU', async () => {
    const result = await fetchAlgorithmAuditV2('TEST-SKU-001')

    expect(result.product).not.toBeNull()
    expect(result.rows).toHaveLength(16)
    expect(result.metadata.total_weeks).toBe(16)
    expect(result.rows[0].week_iso).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('should return empty result for invalid SKU', async () => {
    const result = await fetchAlgorithmAuditV2('INVALID-SKU')

    expect(result.product).toBeNull()
    expect(result.rows).toHaveLength(0)
  })

  it('should match actual arrival data from shipments', async () => {
    // Setup: Create shipment with actual_arrival_date in W45
    // ...

    const result = await fetchAlgorithmAuditV2('TEST-SKU-001')
    const w45Row = result.rows.find(r => r.week_iso === '2025-W45')

    expect(w45Row?.actual_arrival_week).toBe('2025-W45')
    expect(w45Row?.actual_arrival_qty).toBeGreaterThan(0)
    expect(w45Row?.arrival_source).toBe('actual')
  })
})
```

---

## 10. 性能优化建议 Performance Optimization

### 10.1 后端优化

1. **并行查询** - 使用 `Promise.all` 同时查询6个表
2. **索引优化** - 添加复合索引 (见第5章)
3. **数据过滤** - 仅查询16周窗口内的数据
4. **查询精简** - 使用 `.select()` 仅获取必需字段
5. **缓存策略** - 考虑使用 React Server Components 的自动缓存

### 10.2 前端优化

1. **虚拟滚动** - 如果未来扩展到52周，使用 `react-window`
2. **懒加载明细** - 明细数据仅在展开时渲染
3. **防抖搜索** - SKU选择器使用 debounce
4. **Memoization** - 使用 `useMemo` 缓存计算结果
5. **代码分割** - 明细组件使用动态导入

### 10.3 数据库查询优化示例

```sql
-- 优化前 (全表扫描)
SELECT * FROM shipments
WHERE id IN (
  SELECT shipment_id FROM shipment_items WHERE sku = 'SKU123'
);

-- 优化后 (使用索引 + INNER JOIN)
SELECT s.id, s.tracking_number, s.actual_arrival_date, si.shipped_qty
FROM shipments s
INNER JOIN shipment_items si ON s.id = si.shipment_id
WHERE si.sku = 'SKU123'
  AND s.actual_arrival_date >= '2025-01-01'
  AND s.actual_arrival_date <= '2025-12-31';
```

---

## 11. 安全性考虑 Security Considerations

### 11.1 Row Level Security (RLS)

**当前假设 Current Assumption:**
- 所有表已启用 RLS
- 用户只能访问其组织的数据

**V2.0 不涉及新增安全风险 No New Risks:**
- 仅读取数据，不涉及写入操作
- 查询逻辑在 Server Component 中执行
- 前端不暴露原始数据库查询

### 11.2 输入验证

```typescript
// SKU参数验证
export async function fetchAlgorithmAuditV2(sku: string) {
  // Validate SKU format
  if (!/^[A-Z0-9-]{3,50}$/.test(sku)) {
    throw new Error('Invalid SKU format')
  }

  // ... rest of the function
}
```

---

## 12. 开发任务分解 Development Task Breakdown

### 12.1 Backend Specialist 任务清单

- [ ] **Task B-1:** 创建 `lib/constants/supply-chain-params.ts`
- [ ] **Task B-2:** 扩展 `lib/types/database.ts` (新增类型定义)
- [ ] **Task B-3:** 实现 `backtrackSupplyChainWeeks()` 函数
- [ ] **Task B-4:** 实现 `fetchOrdersByWeek()` 查询
- [ ] **Task B-5:** 实现 `fetchDeliveriesByWeek()` 查询
- [ ] **Task B-6:** 扩展 `fetchShipmentsByWeek()` (添加 departureMap)
- [ ] **Task B-7:** 实现 `buildAuditRows()` 主逻辑
- [ ] **Task B-8:** 创建 `fetchAlgorithmAuditV2()` 入口函数
- [ ] **Task B-9:** 编写单元测试 (backtrack算法)
- [ ] **Task B-10:** 添加数据库索引 (SQL migration)

**预估工时 Estimated Effort:** 3-4天

### 12.2 Frontend Artisan 任务清单

- [ ] **Task F-1:** 复制 `algorithm-audit-table.tsx` → `algorithm-audit-table-v2.tsx`
- [ ] **Task F-2:** 更新表头配置 (21列分组)
- [ ] **Task F-3:** 实现 `getCellStyle()` 颜色编码函数
- [ ] **Task F-4:** 添加新列渲染逻辑（预计到仓周/量、周转率等）
- [ ] **Task F-5:** 创建 `ExpandableOrderDetails` 组件
- [ ] **Task F-6:** 创建 `ExpandableDeliveryDetails` 组件
- [ ] **Task F-7:** 集成展开/折叠交互
- [ ] **Task F-8:** 添加 Tooltip 显示计算逻辑
- [ ] **Task F-9:** 响应式布局优化（横向滚动 + 固定列）
- [ ] **Task F-10:** 更新页面 `page.tsx` 调用 V2 查询

**预估工时 Estimated Effort:** 3-4天

### 12.3 QA Director 验收清单

- [ ] **Test Q-1:** 反推算法准确性验证 (手工计算 vs 系统计算)
- [ ] **Test Q-2:** 实际值匹配准确性 (对比数据库原始记录)
- [ ] **Test Q-3:** 库存滚动计算准确性 (16周连续性验证)
- [ ] **Test Q-4:** 颜色编码正确性 (实际值绿色、预计值黄色)
- [ ] **Test Q-5:** 展开明细功能 (点击可展开、数据完整)
- [ ] **Test Q-6:** 性能测试 (单SKU查询 < 2秒)
- [ ] **Test Q-7:** 跨年周次处理 (2025-W52 + 2 = 2026-W02)
- [ ] **Test Q-8:** 边界情况 (无数据SKU、部分交付等)
- [ ] **Test Q-9:** 浏览器兼容性 (Chrome, Safari, Firefox)
- [ ] **Test Q-10:** 可访问性 (色盲模式、键盘导航)

**预估工时 Estimated Effort:** 1-2天

---

## 13. 依赖与风险 Dependencies & Risks

### 13.1 技术依赖

| 依赖项 | 版本 | 用途 | 风险等级 |
|-------|------|------|---------|
| `date-fns` | ^2.30.0 | 周次计算、跨年处理 | 低 (已验证) |
| `Supabase Client` | Latest | 数据库查询 | 低 |
| `Next.js 16` | ^16.0.0 | Server Components | 低 |
| `React 19` | ^19.0.0 | 前端渲染 | 低 |
| `ShadCN UI` | Latest | 表格组件 | 低 |

### 13.2 数据质量风险

**高风险 High Risk:**
- **风险R-1:** 历史数据中 `actual_order_date` 缺失率 > 50%
  - **缓解措施:** 显示"-"，不影响核心功能；提供数据补录工具

**中风险 Medium Risk:**
- **风险R-2:** `shipments.production_delivery_id` 外键缺失
  - **缓解措施:** 通过 `sku` + `week_iso` 聚合匹配，不依赖外键

**低风险 Low Risk:**
- **风险R-3:** 跨周分批到仓导致周次不匹配
  - **缓解措施:** 按实际到仓周聚合，不强制一对一匹配

### 13.3 性能风险

**风险P-1:** 16周 × 6表JOIN查询超时 (> 2秒)
- **缓解措施:**
  - 添加数据库索引
  - 使用 Promise.all 并行查询
  - 前端添加 Loading 状态

**风险P-2:** 大量SKU切换导致Supabase连接池耗尽
- **缓解措施:**
  - 使用 React Query 缓存已加载的SKU (TTL=5分钟)
  - 添加防抖 (debounce 300ms)

---

## 14. 文档交付清单 Documentation Deliverables

### 14.1 开发文档

- [x] 技术设计文档 (本文档)
- [ ] API文档 (`fetchAlgorithmAuditV2` 函数签名)
- [ ] 数据库Schema变更说明 (新增索引)
- [ ] 类型定义文档 (TypeScript interfaces)

### 14.2 用户文档

- [ ] 用户手册 (功能说明、列定义、颜色图例)
- [ ] FAQ (常见问题解答)
- [ ] 视频教程 (5分钟快速上手)

### 14.3 测试文档

- [ ] 单元测试报告
- [ ] 集成测试报告
- [ ] 性能测试报告
- [ ] 验收测试清单

---

## 15. 成功标准 Success Criteria

### 15.1 功能完整性

- [x] 需求文档 100% 覆盖
- [ ] 21列数据正确展示
- [ ] 反推算法准确率 = 100%
- [ ] 实际值匹配准确率 ≥ 95%
- [ ] 库存计算误差 = 0

### 15.2 性能指标

- [ ] 首次加载时间 < 2秒
- [ ] SKU切换响应 < 1秒
- [ ] 表格滚动帧率 ≥ 60 FPS
- [ ] 数据库查询时间 < 500ms

### 15.3 用户体验

- [ ] 颜色编码清晰易懂
- [ ] 展开/折叠动画流畅
- [ ] 色盲模式友好 (WCAG AA)
- [ ] 移动端基本可用

---

## 16. 审批与签字 Approval

| 角色 Role | 姓名 Name | 日期 Date | 签名 Signature |
|----------|---------|----------|---------------|
| Product Director | | 2025-12-03 | ✓ (需求已确认) |
| System Architect | Claude | 2025-12-03 | ✓ (设计完成) |
| Backend Specialist | | Pending | - |
| Frontend Artisan | | Pending | - |
| QA Director | | Pending | - |

---

## 附录 A: SQL查询示例 SQL Query Examples

### A.1 获取某SKU某周的实际下单量

```sql
-- 查询SKU在2025-W34的实际下单量
SELECT
  get_week_from_date(po.actual_order_date) AS order_week,
  po.po_number,
  poi.ordered_qty,
  s.supplier_name
FROM purchase_orders po
INNER JOIN purchase_order_items poi ON po.id = poi.po_id
LEFT JOIN suppliers s ON po.supplier_id = s.id
WHERE poi.sku = 'TEST-SKU-001'
  AND get_week_from_date(po.actual_order_date) = '2025-W34'
ORDER BY po.actual_order_date;
```

### A.2 获取某SKU某周的实际出货量

```sql
-- 查询SKU在2025-W42的实际出货量
SELECT
  get_week_from_date(pd.actual_delivery_date) AS delivery_week,
  pd.delivery_number,
  pd.delivered_qty,
  po.po_number
FROM production_deliveries pd
INNER JOIN purchase_order_items poi ON pd.po_item_id = poi.id
INNER JOIN purchase_orders po ON poi.po_id = po.id
WHERE pd.sku = 'TEST-SKU-001'
  AND get_week_from_date(pd.actual_delivery_date) = '2025-W42'
ORDER BY pd.actual_delivery_date;
```

### A.3 获取某SKU某周的实际到仓量

```sql
-- 查询SKU在2025-W47的实际到仓量
SELECT
  get_week_from_date(s.actual_arrival_date) AS arrival_week,
  s.tracking_number,
  si.shipped_qty,
  w.warehouse_name
FROM shipments s
INNER JOIN shipment_items si ON s.id = si.shipment_id
LEFT JOIN warehouses w ON s.destination_warehouse_id = w.id
WHERE si.sku = 'TEST-SKU-001'
  AND get_week_from_date(s.actual_arrival_date) = '2025-W47'
ORDER BY s.actual_arrival_date;
```

---

## 附录 B: 数据流示例 Data Flow Example

### B.1 输入示例

```typescript
// 输入: SKU = "TEST-SKU-001", 当前周 = "2025-W45"
const input = {
  sku: 'TEST-SKU-001',
  product: {
    safety_stock_weeks: 2,
    unit_cost_usd: 10,
  },
  lead_times: {
    production_weeks: 8,
    loading_weeks: 1,
    transit_weeks: 4,
  },
}
```

### B.2 反推计算结果

```typescript
// 对于 2025-W45 的行:
const backtrackResult = {
  // 预计销量 50台, 安全库存2周
  planned_arrival_week: '2025-W47',      // W45 + 2
  planned_arrival_qty: 100,              // 50 × 2
  planned_ship_week: '2025-W43',         // W47 - 4 (运输)
  planned_factory_ship_week: '2025-W42', // W43 - 1 (装运)
  planned_order_week: '2025-W34',        // W42 - 8 (生产)
}
```

### B.3 实际数据匹配

```typescript
// 从数据库查询到的实际值:
const actualData = {
  actual_order_week: '2025-W34',       // 匹配! PO-001 在 W34 下单
  actual_order_qty: 100,
  actual_factory_ship_week: '2025-W42', // 匹配! Delivery-001 在 W42 出货
  actual_ship_week: '2025-W43',        // 匹配! Shipment-001 在 W43 发货
  actual_arrival_week: '2025-W47',     // 匹配! 在 W47 到仓
  actual_arrival_qty: 100,
  sales_actual: 48,                    // 实际销量48台 (vs 预计50台)
}
```

### B.4 最终行数据

```typescript
// AlgorithmAuditRowV2 for 2025-W45
const row = {
  week_iso: '2025-W45',

  // 销售 (实际值优先)
  sales_forecast: 50,
  sales_actual: 48,
  sales_effective: 48,              // ← 使用实际值
  sales_source: 'actual',

  // 到仓 (实际值优先)
  planned_arrival_week: '2025-W47',
  planned_arrival_qty: 100,
  actual_arrival_week: '2025-W47',
  actual_arrival_qty: 100,
  arrival_effective: 100,           // ← 使用实际值
  arrival_source: 'actual',

  // 其他阶段
  planned_ship_week: '2025-W43',
  actual_ship_week: '2025-W43',     // ← 匹配成功
  planned_factory_ship_week: '2025-W42',
  actual_factory_ship_week: '2025-W42', // ← 匹配成功
  planned_order_week: '2025-W34',
  actual_order_week: '2025-W34',    // ← 匹配成功

  // 库存 (假设期初200台)
  opening_stock: 200,
  closing_stock: 252,               // 200 + 100 - 48 = 252
  turnover_ratio: 5.25,             // 252 / 48 ≈ 5.25周
  stock_status: 'OK',
}
```

---

**文档结束 End of Document**

**下一步 Next Steps:**
1. Backend Specialist 阅读并实现第3章的查询逻辑
2. Frontend Artisan 阅读并实现第4章的组件设计
3. 两者并行开发，预计5-7天完成 Phase 1 + Phase 2
4. QA Director 执行第9章的测试用例验收

**联系方式 Contact:**
如有疑问，请联系 System Architect 或在 GitHub Issue 中讨论。
