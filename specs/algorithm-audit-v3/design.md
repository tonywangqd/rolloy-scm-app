# Algorithm Audit V3 - Technical Design Document

## Document Metadata
- **Feature:** Algorithm Verification Table V3.0
- **Role:** System Architect
- **Date:** 2025-12-03
- **Status:** Design Complete

---

## 1. System Overview

### 1.1 Purpose
Create a comprehensive **20-column algorithm verification table** that displays week-by-week inventory data for validating the supply chain replenishment algorithm. This table uses a **reverse-calculation approach** to backtrack from sales demand to determine optimal procurement and logistics timing.

### 1.2 Key Innovations
1. **Reverse Calculation Logic**: From each sales demand (week X, quantity Q), calculate backwards through the supply chain timeline
2. **Dual-Track Data**: Show both planned (calculated) vs actual (recorded) values across 5 key milestones
3. **Aggregation Support**: Handle multiple sales demands converging to the same week
4. **Configurable Lead Times**: Support dynamic lead time parameters per product

### 1.3 Table Structure (20 Columns)

```
┌─────────────┬──────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┬───────────────────┐
│   Week      │   Sales (3 cols)     │   Order (3 cols)     │  Factory Ship (3)    │  Ship (3 cols)       │  Arrival (3 cols)    │  Stock (4 cols)   │
├─────────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┼───────────────────┤
│ week_iso    │ sales_forecast       │ planned_order        │ planned_factory_ship │ planned_ship         │ planned_arrival      │ opening_stock     │
│ (固定列)    │ sales_actual         │ actual_order         │ actual_factory_ship  │ actual_ship          │ actual_arrival       │ closing_stock     │
│             │ sales_effective      │ order_effective      │ factory_ship_eff     │ ship_effective       │ arrival_effective    │ safety_threshold  │
│             │                      │                      │                      │                      │                      │ stock_status      │
└─────────────┴──────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┴───────────────────┘
```

---

## 2. Data Flow Architecture

### 2.1 Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES (Supabase)                              │
├────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │ sales_forecasts │  │  sales_actuals  │  │    products     │               │
│  │ - week_iso      │  │  - week_iso     │  │ - safety_stock_ │               │
│  │ - forecast_qty  │  │  - actual_qty   │  │   weeks         │               │
│  └─────────────────┘  └─────────────────┘  │ - production_   │               │
│                                             │   lead_weeks    │               │
│  ┌─────────────────┐  ┌─────────────────┐  └─────────────────┘               │
│  │ purchase_orders │  │  production_    │                                     │
│  │ + items         │  │  deliveries     │  ┌─────────────────┐               │
│  │ - actual_order_ │  │ - actual_       │  │  shipments +    │               │
│  │   date          │  │   delivery_date │  │  shipment_items │               │
│  │ - ordered_qty   │  │ - delivered_qty │  │ - actual_       │               │
│  └─────────────────┘  └─────────────────┘  │   departure_date│               │
│                                             │ - actual_       │               │
│  ┌─────────────────┐                       │   arrival_date  │               │
│  │  inventory_     │                       │ - shipped_qty   │               │
│  │  snapshots      │                       └─────────────────┘               │
│  │ - qty_on_hand   │                                                          │
│  └─────────────────┘                                                          │
└────────────────────────────────────────────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                    BACKEND QUERY FUNCTION (Server-Side)                        │
│                   fetchAlgorithmAuditV3(sku, shippingWeeks)                   │
├────────────────────────────────────────────────────────────────────────────────┤
│  Step 1: Fetch product & lead time configuration                              │
│  Step 2: Generate 16-week range (4 past + current + 11 future)               │
│  Step 3: Fetch all data sources in parallel (7 queries)                      │
│  Step 4: Build weekly maps (sales, orders, deliveries, shipments)            │
│  Step 5: Run reverse calculation algorithm (backtrack from sales)            │
│  Step 6: Calculate rolling inventory (period-over-period)                    │
│  Step 7: Determine stock status (OK/Risk/Stockout)                           │
└────────────────────────────────────────────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND COMPONENT                                     │
│                    AlgorithmAuditTableV3.tsx                                  │
├────────────────────────────────────────────────────────────────────────────────┤
│  - Display 20-column table with fixed first column (week_iso)                │
│  - Color-code cells based on data source (actual vs planned)                 │
│  - Highlight stock status (red: Stockout, yellow: Risk, green: OK)           │
│  - Support horizontal scroll with sticky week column                         │
│  - Show expandable shipment details per week                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Aggregation Logic

**Weekly Aggregation Rules:**
```typescript
// For each data type, aggregate by week using ISO week format
orders_by_week[week_iso] = SUM(ordered_qty WHERE getWeekFromDate(actual_order_date) = week_iso)
factory_ships_by_week[week_iso] = SUM(delivered_qty WHERE getWeekFromDate(actual_delivery_date) = week_iso)
ships_by_week[week_iso] = SUM(shipped_qty WHERE getWeekFromDate(actual_departure_date) = week_iso)
arrivals_by_week[week_iso] = SUM(shipped_qty WHERE getWeekFromDate(COALESCE(actual_arrival_date, planned_arrival_date)) = week_iso)
```

---

## 3. TypeScript Type Definitions

### 3.1 Core Data Types

```typescript
/**
 * Supply chain lead time configuration for V3
 * Extended from V2 to include configurable shipping weeks
 */
export interface SupplyChainLeadTimesV3 {
  production_weeks: number      // From products.production_lead_weeks (default: 5 weeks)
  loading_weeks: number          // Fixed: 1 week (container loading time)
  shipping_weeks: number         // User-configurable: default 5 weeks (can be 4-6 weeks)
  safety_stock_weeks: number     // From products.safety_stock_weeks (default: 2 weeks)
}

/**
 * Single row in the Algorithm Audit V3 table
 * Represents one week's data across 20 columns
 */
export interface AlgorithmAuditRowV3 {
  // Column 1: Week identifier (fixed column)
  week_iso: string               // "2026-W08"
  week_start_date: string        // "2026-02-16" (Monday)
  week_offset: number            // -4 to +11 (0 = current week)
  is_past: boolean               // week_offset < 0
  is_current: boolean            // week_offset === 0

  // Columns 2-4: Sales Group
  sales_forecast: number         // Sum from sales_forecasts for this week
  sales_actual: number | null    // Sum from sales_actuals for this week (null if no data)
  sales_effective: number        // COALESCE(sales_actual, sales_forecast)

  // Columns 5-7: Order Group (下单)
  planned_order: number          // Reverse-calculated quantity (accumulated from multiple sales demands)
  actual_order: number           // Sum from purchase_orders aggregated by actual_order_date week
  order_effective: number        // COALESCE(actual_order, planned_order)

  // Columns 8-10: Factory Ship Group (工厂出货)
  planned_factory_ship: number   // Reverse-calculated quantity
  actual_factory_ship: number    // Sum from production_deliveries aggregated by actual_delivery_date week
  factory_ship_effective: number // COALESCE(actual_factory_ship, planned_factory_ship)

  // Columns 11-13: Ship Group (物流发货)
  planned_ship: number           // Reverse-calculated quantity
  actual_ship: number            // Sum from shipments aggregated by actual_departure_date week
  ship_effective: number         // COALESCE(actual_ship, planned_ship)

  // Columns 14-16: Arrival Group (到仓)
  planned_arrival: number        // Reverse-calculated quantity
  actual_arrival: number         // Sum from shipments aggregated by effective arrival week
  arrival_effective: number      // COALESCE(actual_arrival, planned_arrival) - used for inventory calculation

  // Columns 17-20: Inventory Group (库存)
  opening_stock: number          // Period start stock (= last week's closing_stock)
  closing_stock: number          // opening_stock + arrival_effective - sales_effective
  safety_threshold: number       // sales_effective × safety_stock_weeks
  stock_status: StockStatus      // 'OK' | 'Risk' | 'Stockout'
}

/**
 * Complete V3 audit result for a SKU
 */
export interface AlgorithmAuditResultV3 {
  product: Product | null
  rows: AlgorithmAuditRowV3[]
  leadTimes: SupplyChainLeadTimesV3
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    safety_stock_weeks: number
    production_lead_weeks: number
    shipping_weeks: number         // User-provided parameter
  }
}
```

---

## 4. Reverse Calculation Algorithm

### 4.1 Algorithm Overview

**Principle:** For each week's sales demand, calculate backwards through the supply chain to determine when each milestone should occur.

**Formula Chain:**
```
销售需求 (周X, 数量Q)
    ↓ 反推公式
预计到仓周次 = 周X - safety_stock_weeks
预计发货周次 = 预计到仓周次 - shipping_weeks
预计出货周次 = 预计发货周次 - loading_weeks
预计下单周次 = 预计出货周次 - production_weeks
```

### 4.2 Detailed Pseudocode

```typescript
/**
 * Reverse calculation algorithm
 * Distributes sales demands backwards through the supply chain
 */
function calculateReverseTimeline(
  rows: AlgorithmAuditRowV3[],
  leadTimes: SupplyChainLeadTimesV3
): void {
  // Initialize accumulation maps for planned quantities
  const plannedArrivalMap = new Map<string, number>()    // week_iso -> qty
  const plannedShipMap = new Map<string, number>()
  const plannedFactoryShipMap = new Map<string, number>()
  const plannedOrderMap = new Map<string, number>()

  // Step 1: For each week's sales demand, backtrack through timeline
  rows.forEach(row => {
    const salesDemand = row.sales_effective
    if (salesDemand <= 0) return  // Skip weeks with no sales

    const currentWeek = row.week_iso

    // Calculate target weeks (backwards from sales week)
    const arrivalWeek = addWeeksToWeekString(
      currentWeek,
      -leadTimes.safety_stock_weeks
    )
    const shipWeek = arrivalWeek
      ? addWeeksToWeekString(arrivalWeek, -leadTimes.shipping_weeks)
      : null
    const factoryShipWeek = shipWeek
      ? addWeeksToWeekString(shipWeek, -leadTimes.loading_weeks)
      : null
    const orderWeek = factoryShipWeek
      ? addWeeksToWeekString(factoryShipWeek, -leadTimes.production_weeks)
      : null

    // Accumulate quantities in their respective weeks
    if (arrivalWeek) {
      const current = plannedArrivalMap.get(arrivalWeek) || 0
      plannedArrivalMap.set(arrivalWeek, current + salesDemand)
    }
    if (shipWeek) {
      const current = plannedShipMap.get(shipWeek) || 0
      plannedShipMap.set(shipWeek, current + salesDemand)
    }
    if (factoryShipWeek) {
      const current = plannedFactoryShipMap.get(factoryShipWeek) || 0
      plannedFactoryShipMap.set(factoryShipWeek, current + salesDemand)
    }
    if (orderWeek) {
      const current = plannedOrderMap.get(orderWeek) || 0
      plannedOrderMap.set(orderWeek, current + salesDemand)
    }
  })

  // Step 2: Populate planned quantities into rows
  rows.forEach(row => {
    row.planned_arrival = plannedArrivalMap.get(row.week_iso) || 0
    row.planned_ship = plannedShipMap.get(row.week_iso) || 0
    row.planned_factory_ship = plannedFactoryShipMap.get(row.week_iso) || 0
    row.planned_order = plannedOrderMap.get(row.week_iso) || 0
  })
}
```

### 4.3 Example Calculation

**Scenario:**
- SKU: D-001
- Safety stock weeks: 2
- Production weeks: 5
- Loading weeks: 1
- Shipping weeks: 5

**Sales Demand:**
- Week W08: 373 units
- Week W09: 400 units
- Week W10: 350 units (different safety stock assumption)

**Reverse Calculation for Week W08 (373 units):**
```
销售周次: W08 (373 units)
  ↓ 减 2 周 (safety_stock_weeks)
到仓周次: W06 (累加 373)
  ↓ 减 5 周 (shipping_weeks)
发货周次: W01 (累加 373)
  ↓ 减 1 周 (loading_weeks)
出货周次: W52 (上一年, 累加 373)
  ↓ 减 5 周 (production_weeks)
下单周次: W47 (上一年, 累加 373)
```

**Reverse Calculation for Week W09 (400 units):**
```
销售周次: W09 (400 units)
  ↓ 减 2 周
到仓周次: W07 (累加 400)
  ↓ 减 5 周
发货周次: W02 (累加 400)
  ↓ 减 1 周
出货周次: W01 (累加 400)
  ↓ 减 5 周
下单周次: W48 (上一年, 累加 400)
```

**Aggregation Example:**
If Week W10 also maps to W06 for arrival, then:
```
W06 planned_arrival = 373 (from W08) + 350 (from W10) = 723 units
```

---

## 5. Backend Query Function Design

### 5.1 Function Signature

```typescript
/**
 * Fetch Algorithm Audit V3 data for a specific SKU
 *
 * @param sku - Product SKU to analyze
 * @param shippingWeeks - Configurable shipping lead time (default: 5 weeks, range: 4-6)
 * @returns Complete audit result with 20-column data
 */
export async function fetchAlgorithmAuditV3(
  sku: string,
  shippingWeeks: number = 5
): Promise<AlgorithmAuditResultV3>
```

### 5.2 Implementation Steps

```typescript
// File: src/lib/queries/algorithm-audit-v3.ts

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getWeekFromDate,
  addWeeksToWeekString,
  parseWeekString,
  getCurrentWeek
} from '@/lib/utils/date'
import { format } from 'date-fns'
import type {
  Product,
  StockStatus,
  AlgorithmAuditRowV3,
  AlgorithmAuditResultV3,
  SupplyChainLeadTimesV3
} from '@/lib/types/database'

export async function fetchAlgorithmAuditV3(
  sku: string,
  shippingWeeks: number = 5
): Promise<AlgorithmAuditResultV3> {
  const supabase = await createServerSupabaseClient()

  // ================================================================
  // STEP 1: Fetch Product Configuration
  // ================================================================
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('sku', sku)
    .single()

  if (!product) {
    return {
      product: null,
      rows: [],
      leadTimes: {
        production_weeks: 5,
        loading_weeks: 1,
        shipping_weeks: shippingWeeks,
        safety_stock_weeks: 2,
      },
      metadata: {
        current_week: getCurrentWeek(),
        start_week: '',
        end_week: '',
        total_weeks: 0,
        avg_weekly_sales: 0,
        safety_stock_weeks: 2,
        production_lead_weeks: 5,
        shipping_weeks: shippingWeeks,
      },
    }
  }

  // ================================================================
  // STEP 2: Configure Lead Times
  // ================================================================
  const leadTimes: SupplyChainLeadTimesV3 = {
    production_weeks: product.production_lead_weeks,
    loading_weeks: 1,  // Fixed
    shipping_weeks: shippingWeeks,  // User-configurable
    safety_stock_weeks: product.safety_stock_weeks,
  }

  // ================================================================
  // STEP 3: Generate 16-Week Range
  // ================================================================
  const currentWeek = getCurrentWeek()
  const startWeek = addWeeksToWeekString(currentWeek, -4) || currentWeek
  const endWeek = addWeeksToWeekString(currentWeek, 11) || currentWeek

  const weeks: string[] = []
  let currentIterWeek = startWeek
  for (let i = 0; i < 16; i++) {
    weeks.push(currentIterWeek)
    const next = addWeeksToWeekString(currentIterWeek, 1)
    if (!next) break
    currentIterWeek = next
  }

  // ================================================================
  // STEP 4: Fetch All Data Sources in Parallel
  // ================================================================
  const [
    forecastsResult,
    actualsResult,
    purchaseOrdersResult,
    productionDeliveriesResult,
    shipmentsResult,
    inventorySnapshotsResult,
  ] = await Promise.all([
    // Sales Forecasts
    supabase
      .from('sales_forecasts')
      .select('week_iso, forecast_qty')
      .eq('sku', sku)
      .in('week_iso', weeks),

    // Sales Actuals
    supabase
      .from('sales_actuals')
      .select('week_iso, actual_qty')
      .eq('sku', sku)
      .in('week_iso', weeks),

    // Purchase Orders with items (for actual_order aggregation)
    supabase
      .from('purchase_orders')
      .select(`
        id,
        po_number,
        actual_order_date,
        purchase_order_items!inner(sku, ordered_qty)
      `)
      .eq('purchase_order_items.sku', sku)
      .not('actual_order_date', 'is', null),

    // Production Deliveries (for actual_factory_ship aggregation)
    supabase
      .from('production_deliveries')
      .select('sku, delivered_qty, actual_delivery_date')
      .eq('sku', sku)
      .not('actual_delivery_date', 'is', null),

    // Shipments with items (for actual_ship and actual_arrival)
    supabase
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
      .eq('shipment_items.sku', sku),

    // Current inventory snapshot
    supabase
      .from('inventory_snapshots')
      .select('qty_on_hand')
      .eq('sku', sku),
  ])

  const forecasts = forecastsResult.data || []
  const actuals = actualsResult.data || []
  const purchaseOrders = purchaseOrdersResult.data || []
  const productionDeliveries = productionDeliveriesResult.data || []
  const shipments = shipmentsResult.data || []
  const snapshots = inventorySnapshotsResult.data || []

  // ================================================================
  // STEP 5: Build Weekly Aggregation Maps
  // ================================================================

  // 5.1 Sales data maps
  const forecastMap = new Map<string, number>()
  forecasts.forEach(f => {
    const current = forecastMap.get(f.week_iso) || 0
    forecastMap.set(f.week_iso, current + f.forecast_qty)
  })

  const actualSalesMap = new Map<string, number>()
  actuals.forEach(a => {
    const current = actualSalesMap.get(a.week_iso) || 0
    actualSalesMap.set(a.week_iso, current + a.actual_qty)
  })

  // 5.2 Actual order quantities by week
  const actualOrderMap = new Map<string, number>()
  purchaseOrders.forEach(po => {
    if (!po.actual_order_date) return
    const orderWeek = getWeekFromDate(new Date(po.actual_order_date))

    const items = Array.isArray(po.purchase_order_items)
      ? po.purchase_order_items
      : [po.purchase_order_items]

    items.forEach((item) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('ordered_qty' in item)) return
      if (item.sku !== sku) return

      const current = actualOrderMap.get(orderWeek) || 0
      actualOrderMap.set(orderWeek, current + item.ordered_qty)
    })
  })

  // 5.3 Actual factory ship quantities by week
  const actualFactoryShipMap = new Map<string, number>()
  productionDeliveries.forEach(delivery => {
    if (!delivery.actual_delivery_date) return
    const deliveryWeek = getWeekFromDate(new Date(delivery.actual_delivery_date))

    const current = actualFactoryShipMap.get(deliveryWeek) || 0
    actualFactoryShipMap.set(deliveryWeek, current + delivery.delivered_qty)
  })

  // 5.4 Actual ship quantities by departure week
  const actualShipMap = new Map<string, number>()
  shipments.forEach(shipment => {
    if (!shipment.actual_departure_date) return
    const departureWeek = getWeekFromDate(new Date(shipment.actual_departure_date))

    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]

    items.forEach((item) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return
      if (item.sku !== sku) return

      const current = actualShipMap.get(departureWeek) || 0
      actualShipMap.set(departureWeek, current + item.shipped_qty)
    })
  })

  // 5.5 Actual arrival quantities by arrival week
  const actualArrivalMap = new Map<string, number>()
  shipments.forEach(shipment => {
    const arrivalDate = shipment.actual_arrival_date || shipment.planned_arrival_date
    if (!arrivalDate) return
    const arrivalWeek = getWeekFromDate(new Date(arrivalDate))

    const items = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [shipment.shipment_items]

    items.forEach((item) => {
      if (!item || typeof item !== 'object' || !('sku' in item) || !('shipped_qty' in item)) return
      if (item.sku !== sku) return

      const current = actualArrivalMap.get(arrivalWeek) || 0
      actualArrivalMap.set(arrivalWeek, current + item.shipped_qty)
    })
  })

  // ================================================================
  // STEP 6: Initialize Rows with Sales and Actual Data
  // ================================================================
  const rows: AlgorithmAuditRowV3[] = weeks.map((week, index) => {
    const weekOffset = index - 4
    const weekStartDate = parseWeekString(week)
    const week_start_date = weekStartDate ? format(weekStartDate, 'yyyy-MM-dd') : week

    const sales_forecast = forecastMap.get(week) || 0
    const sales_actual = actualSalesMap.get(week) ?? null
    const sales_effective = sales_actual ?? sales_forecast

    const actual_order = actualOrderMap.get(week) || 0
    const actual_factory_ship = actualFactoryShipMap.get(week) || 0
    const actual_ship = actualShipMap.get(week) || 0
    const actual_arrival = actualArrivalMap.get(week) || 0

    return {
      week_iso: week,
      week_start_date,
      week_offset: weekOffset,
      is_past: weekOffset < 0,
      is_current: weekOffset === 0,
      sales_forecast,
      sales_actual,
      sales_effective,
      planned_order: 0,              // Will be calculated in Step 7
      actual_order,
      order_effective: 0,            // Will be calculated after planned_order
      planned_factory_ship: 0,
      actual_factory_ship,
      factory_ship_effective: 0,
      planned_ship: 0,
      actual_ship,
      ship_effective: 0,
      planned_arrival: 0,
      actual_arrival,
      arrival_effective: 0,
      opening_stock: 0,              // Will be calculated in Step 8
      closing_stock: 0,
      safety_threshold: 0,
      stock_status: 'OK' as StockStatus,
    }
  })

  // ================================================================
  // STEP 7: Reverse Calculation for Planned Quantities
  // ================================================================
  const plannedOrderMap = new Map<string, number>()
  const plannedFactoryShipMap = new Map<string, number>()
  const plannedShipMap = new Map<string, number>()
  const plannedArrivalMap = new Map<string, number>()

  rows.forEach(row => {
    const salesDemand = row.sales_effective
    if (salesDemand <= 0) return

    // Backtrack timeline
    const arrivalWeek = addWeeksToWeekString(
      row.week_iso,
      -leadTimes.safety_stock_weeks
    )
    const shipWeek = arrivalWeek
      ? addWeeksToWeekString(arrivalWeek, -leadTimes.shipping_weeks)
      : null
    const factoryShipWeek = shipWeek
      ? addWeeksToWeekString(shipWeek, -leadTimes.loading_weeks)
      : null
    const orderWeek = factoryShipWeek
      ? addWeeksToWeekString(factoryShipWeek, -leadTimes.production_weeks)
      : null

    // Accumulate quantities
    if (arrivalWeek) {
      const current = plannedArrivalMap.get(arrivalWeek) || 0
      plannedArrivalMap.set(arrivalWeek, current + salesDemand)
    }
    if (shipWeek) {
      const current = plannedShipMap.get(shipWeek) || 0
      plannedShipMap.set(shipWeek, current + salesDemand)
    }
    if (factoryShipWeek) {
      const current = plannedFactoryShipMap.get(factoryShipWeek) || 0
      plannedFactoryShipMap.set(factoryShipWeek, current + salesDemand)
    }
    if (orderWeek) {
      const current = plannedOrderMap.get(orderWeek) || 0
      plannedOrderMap.set(orderWeek, current + salesDemand)
    }
  })

  // Populate planned quantities and calculate effective values
  rows.forEach(row => {
    row.planned_order = plannedOrderMap.get(row.week_iso) || 0
    row.planned_factory_ship = plannedFactoryShipMap.get(row.week_iso) || 0
    row.planned_ship = plannedShipMap.get(row.week_iso) || 0
    row.planned_arrival = plannedArrivalMap.get(row.week_iso) || 0

    // Calculate effective values (actual takes precedence)
    row.order_effective = row.actual_order || row.planned_order
    row.factory_ship_effective = row.actual_factory_ship || row.planned_factory_ship
    row.ship_effective = row.actual_ship || row.planned_ship
    row.arrival_effective = row.actual_arrival || row.planned_arrival
  })

  // ================================================================
  // STEP 8: Calculate Rolling Inventory
  // ================================================================
  const initialStock = snapshots.reduce((sum, s) => sum + s.qty_on_hand, 0)
  const totalEffectiveSales = rows.reduce((sum, row) => sum + row.sales_effective, 0)
  const avgWeeklySales = totalEffectiveSales / rows.length

  let runningStock = initialStock
  rows.forEach(row => {
    row.opening_stock = runningStock
    row.closing_stock = runningStock + row.arrival_effective - row.sales_effective
    row.safety_threshold = row.sales_effective * leadTimes.safety_stock_weeks

    // Update running stock for next iteration
    runningStock = row.closing_stock

    // Determine stock status
    if (row.closing_stock <= 0) {
      row.stock_status = 'Stockout'
    } else if (row.closing_stock < row.safety_threshold) {
      row.stock_status = 'Risk'
    } else {
      row.stock_status = 'OK'
    }
  })

  // ================================================================
  // STEP 9: Return Complete Result
  // ================================================================
  return {
    product,
    rows,
    leadTimes,
    metadata: {
      current_week: currentWeek,
      start_week: startWeek,
      end_week: endWeek,
      total_weeks: weeks.length,
      avg_weekly_sales: avgWeeklySales,
      safety_stock_weeks: product.safety_stock_weeks,
      production_lead_weeks: product.production_lead_weeks,
      shipping_weeks: shippingWeeks,
    },
  }
}
```

---

## 6. Frontend Component Design

### 6.1 Component Structure

```tsx
// File: src/components/inventory/algorithm-audit-table-v3.tsx

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AlgorithmAuditResultV3, AlgorithmAuditRowV3, StockStatus } from '@/lib/types/database'

interface AlgorithmAuditTableV3Props {
  data: AlgorithmAuditResultV3
  shippingWeeks: number
  onShippingWeeksChange?: (weeks: number) => void
}

export default function AlgorithmAuditTableV3({
  data,
  shippingWeeks,
  onShippingWeeksChange,
}: AlgorithmAuditTableV3Props) {
  const { product, rows, leadTimes, metadata } = data

  if (!product) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">产品未找到</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <div>
            <span className="text-2xl font-bold">{product.sku}</span>
            <span className="text-muted-foreground ml-4">{product.product_name}</span>
          </div>
          <div className="flex gap-4 items-center">
            <div className="text-sm text-muted-foreground">
              物流周期:
              <input
                type="number"
                min={4}
                max={6}
                value={shippingWeeks}
                onChange={(e) => onShippingWeeksChange?.(parseInt(e.target.value))}
                className="ml-2 w-16 px-2 py-1 border rounded"
              />
              周
            </div>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* Lead Time Summary */}
        <div className="mb-6 grid grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">生产周期</p>
            <p className="text-xl font-bold">{leadTimes.production_weeks}周</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">装柜周期</p>
            <p className="text-xl font-bold">{leadTimes.loading_weeks}周</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">物流周期</p>
            <p className="text-xl font-bold">{leadTimes.shipping_weeks}周</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">安全库存</p>
            <p className="text-xl font-bold">{leadTimes.safety_stock_weeks}周</p>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {/* Week Column (Fixed) */}
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left border-r-2">
                  周次
                </th>

                {/* Sales Group */}
                <th colSpan={3} className="px-3 py-2 text-center border-r">
                  销售
                </th>

                {/* Order Group */}
                <th colSpan={3} className="px-3 py-2 text-center border-r">
                  下单
                </th>

                {/* Factory Ship Group */}
                <th colSpan={3} className="px-3 py-2 text-center border-r">
                  工厂出货
                </th>

                {/* Ship Group */}
                <th colSpan={3} className="px-3 py-2 text-center border-r">
                  物流发货
                </th>

                {/* Arrival Group */}
                <th colSpan={3} className="px-3 py-2 text-center border-r">
                  到仓
                </th>

                {/* Inventory Group */}
                <th colSpan={4} className="px-3 py-2 text-center">
                  库存
                </th>
              </tr>

              <tr className="text-xs">
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 border-r-2"></th>

                {/* Sales sub-headers */}
                <th className="px-2 py-1">预计</th>
                <th className="px-2 py-1">实际</th>
                <th className="px-2 py-1 border-r">取值</th>

                {/* Order sub-headers */}
                <th className="px-2 py-1">预计</th>
                <th className="px-2 py-1">实际</th>
                <th className="px-2 py-1 border-r">取值</th>

                {/* Factory Ship sub-headers */}
                <th className="px-2 py-1">预计</th>
                <th className="px-2 py-1">实际</th>
                <th className="px-2 py-1 border-r">取值</th>

                {/* Ship sub-headers */}
                <th className="px-2 py-1">预计</th>
                <th className="px-2 py-1">实际</th>
                <th className="px-2 py-1 border-r">取值</th>

                {/* Arrival sub-headers */}
                <th className="px-2 py-1">预计</th>
                <th className="px-2 py-1">实际</th>
                <th className="px-2 py-1 border-r">取值</th>

                {/* Inventory sub-headers */}
                <th className="px-2 py-1">期初</th>
                <th className="px-2 py-1">期末</th>
                <th className="px-2 py-1">安全</th>
                <th className="px-2 py-1">状态</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(row => (
                <TableRow key={row.week_iso} row={row} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Metadata Footer */}
        <div className="mt-4 text-sm text-muted-foreground">
          <p>数据范围: {metadata.start_week} 至 {metadata.end_week} (共 {metadata.total_weeks} 周)</p>
          <p>平均周销量: {metadata.avg_weekly_sales.toFixed(0)} 件</p>
        </div>
      </CardContent>
    </Card>
  )
}

// Sub-component for table row
function TableRow({ row }: { row: AlgorithmAuditRowV3 }) {
  const getStockStatusBadge = (status: StockStatus) => {
    const variants = {
      OK: 'default',
      Risk: 'warning',
      Stockout: 'destructive',
    } as const
    return <Badge variant={variants[status]}>{status}</Badge>
  }

  const getCellClass = (isActual: boolean) => {
    return isActual ? 'bg-green-50 font-semibold' : 'bg-gray-50'
  }

  return (
    <tr className="border-t hover:bg-muted/50">
      {/* Week */}
      <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium border-r-2">
        {row.week_iso}
        {row.is_current && <Badge variant="secondary" className="ml-2">当前</Badge>}
      </td>

      {/* Sales */}
      <td className="px-2 py-2 text-right">{row.sales_forecast}</td>
      <td className={`px-2 py-2 text-right ${row.sales_actual !== null ? 'bg-green-50 font-semibold' : ''}`}>
        {row.sales_actual ?? '-'}
      </td>
      <td className="px-2 py-2 text-right font-bold border-r">{row.sales_effective}</td>

      {/* Order */}
      <td className="px-2 py-2 text-right">{row.planned_order}</td>
      <td className={`px-2 py-2 text-right ${row.actual_order > 0 ? 'bg-green-50 font-semibold' : ''}`}>
        {row.actual_order || '-'}
      </td>
      <td className="px-2 py-2 text-right font-bold border-r">{row.order_effective}</td>

      {/* Factory Ship */}
      <td className="px-2 py-2 text-right">{row.planned_factory_ship}</td>
      <td className={`px-2 py-2 text-right ${row.actual_factory_ship > 0 ? 'bg-green-50 font-semibold' : ''}`}>
        {row.actual_factory_ship || '-'}
      </td>
      <td className="px-2 py-2 text-right font-bold border-r">{row.factory_ship_effective}</td>

      {/* Ship */}
      <td className="px-2 py-2 text-right">{row.planned_ship}</td>
      <td className={`px-2 py-2 text-right ${row.actual_ship > 0 ? 'bg-green-50 font-semibold' : ''}`}>
        {row.actual_ship || '-'}
      </td>
      <td className="px-2 py-2 text-right font-bold border-r">{row.ship_effective}</td>

      {/* Arrival */}
      <td className="px-2 py-2 text-right">{row.planned_arrival}</td>
      <td className={`px-2 py-2 text-right ${row.actual_arrival > 0 ? 'bg-green-50 font-semibold' : ''}`}>
        {row.actual_arrival || '-'}
      </td>
      <td className="px-2 py-2 text-right font-bold border-r">{row.arrival_effective}</td>

      {/* Inventory */}
      <td className="px-2 py-2 text-right">{row.opening_stock}</td>
      <td className="px-2 py-2 text-right font-bold">{row.closing_stock}</td>
      <td className="px-2 py-2 text-right text-muted-foreground">{row.safety_threshold.toFixed(0)}</td>
      <td className="px-2 py-2 text-center">{getStockStatusBadge(row.stock_status)}</td>
    </tr>
  )
}
```

### 6.2 Page Integration

```tsx
// File: src/app/inventory/algorithm-audit-v3/page.tsx

import React, { Suspense } from 'react'
import { fetchAlgorithmAuditV3 } from '@/lib/queries/algorithm-audit-v3'
import AlgorithmAuditTableV3 from '@/components/inventory/algorithm-audit-table-v3'
import { Skeleton } from '@/components/ui/skeleton'

interface PageProps {
  searchParams: Promise<{ sku?: string; shipping_weeks?: string }>
}

export default async function AlgorithmAuditV3Page({ searchParams }: PageProps) {
  const params = await searchParams
  const sku = params.sku || 'D-001'
  const shippingWeeks = parseInt(params.shipping_weeks || '5', 10)

  const data = await fetchAlgorithmAuditV3(sku, shippingWeeks)

  return (
    <div className="container mx-auto py-8">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AlgorithmAuditTableV3
          data={data}
          shippingWeeks={shippingWeeks}
        />
      </Suspense>
    </div>
  )
}
```

---

## 7. File Checklist

### 7.1 Files to Create

| File Path | Purpose | Status |
|-----------|---------|--------|
| `specs/algorithm-audit-v3/design.md` | Technical design document (this file) | ✅ Created |
| `src/lib/queries/algorithm-audit-v3.ts` | Backend query function | ⏳ Pending |
| `src/components/inventory/algorithm-audit-table-v3.tsx` | Frontend table component | ⏳ Pending |
| `src/app/inventory/algorithm-audit-v3/page.tsx` | Next.js page route | ⏳ Pending |

### 7.2 Files to Modify

| File Path | Modification | Status |
|-----------|--------------|--------|
| `src/lib/types/database.ts` | Add V3 types (AlgorithmAuditRowV3, SupplyChainLeadTimesV3, AlgorithmAuditResultV3) | ⏳ Pending |

---

## 8. API Contract

### 8.1 Query Function

```typescript
// Input
fetchAlgorithmAuditV3(
  sku: string,                  // "D-001"
  shippingWeeks: number = 5     // 4-6 weeks
): Promise<AlgorithmAuditResultV3>

// Output
{
  product: Product | null,
  rows: AlgorithmAuditRowV3[],  // 16 rows (4 past + current + 11 future)
  leadTimes: {
    production_weeks: 5,
    loading_weeks: 1,
    shipping_weeks: 5,
    safety_stock_weeks: 2
  },
  metadata: {
    current_week: "2026-W01",
    start_week: "2025-W49",
    end_week: "2026-W12",
    total_weeks: 16,
    avg_weekly_sales: 385.5,
    safety_stock_weeks: 2,
    production_lead_weeks: 5,
    shipping_weeks: 5
  }
}
```

### 8.2 Row Data Structure

```typescript
AlgorithmAuditRowV3 {
  week_iso: "2026-W06",
  week_start_date: "2026-02-02",
  week_offset: 1,
  is_past: false,
  is_current: false,

  // Sales (3 columns)
  sales_forecast: 400,
  sales_actual: 373,
  sales_effective: 373,

  // Order (3 columns)
  planned_order: 723,       // Aggregated from multiple future sales demands
  actual_order: 800,
  order_effective: 800,

  // Factory Ship (3 columns)
  planned_factory_ship: 400,
  actual_factory_ship: 0,
  factory_ship_effective: 400,

  // Ship (3 columns)
  planned_ship: 350,
  actual_ship: 0,
  ship_effective: 350,

  // Arrival (3 columns)
  planned_arrival: 723,     // Multiple sales demands map to this week
  actual_arrival: 0,
  arrival_effective: 723,

  // Inventory (4 columns)
  opening_stock: 1200,
  closing_stock: 1550,      // 1200 + 723 - 373
  safety_threshold: 746,    // 373 * 2
  stock_status: "OK"
}
```

---

## 9. Performance Considerations

### 9.1 Query Optimization
- Use parallel queries (`Promise.all`) to fetch all data sources simultaneously
- Limit queries to 16-week window only
- Use proper database indexes on date and SKU columns
- Aggregate data in JavaScript (Map structures) rather than multiple DB queries

### 9.2 Rendering Optimization
- Fixed first column (week_iso) for horizontal scrolling
- Lazy rendering for expandable shipment details (future enhancement)
- Memoize table rows if parent re-renders

### 9.3 Database Indexes Required

```sql
-- Recommended indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_sales_forecasts_sku_week ON sales_forecasts(sku, week_iso);
CREATE INDEX IF NOT EXISTS idx_sales_actuals_sku_week ON sales_actuals(sku, week_iso);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_actual_order_date ON purchase_orders(actual_order_date) WHERE actual_order_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_deliveries_sku_date ON production_deliveries(sku, actual_delivery_date) WHERE actual_delivery_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_departure_date ON shipments(actual_departure_date) WHERE actual_departure_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_arrival_date ON shipments(actual_arrival_date, planned_arrival_date);
```

---

## 10. Testing Strategy

### 10.1 Unit Tests
- Test reverse calculation logic with known inputs
- Test week aggregation for overlapping demands
- Test COALESCE logic for effective values

### 10.2 Integration Tests
- Test full query function with sample SKU
- Verify 16-week range generation
- Verify data aggregation accuracy

### 10.3 Manual Test Cases

**Test Case 1: Single Week Demand**
- Input: SKU with one week of sales (W08: 373 units)
- Expected: Correctly backtrack to W06 arrival, W01 ship, W52 factory ship, W47 order

**Test Case 2: Aggregation**
- Input: Multiple weeks mapping to same arrival week
- Expected: Planned arrival = sum of all contributing sales demands

**Test Case 3: Dual-Track Data**
- Input: SKU with both forecasts and actuals
- Expected: Effective values prioritize actuals

**Test Case 4: Configurable Shipping Weeks**
- Input: Change shipping_weeks from 5 to 4
- Expected: All timeline calculations shift by 1 week

---

## 11. Future Enhancements

1. **Expandable Shipment Details**: Click on arrival cell to see detailed tracking numbers
2. **Export to Excel**: Download 20-column table with formatting
3. **Comparison Mode**: Side-by-side comparison of different shipping week scenarios
4. **Variance Alerts**: Highlight cells where actual differs significantly from planned
5. **Lead Time Profiles**: Save different lead time configurations per supplier

---

## 12. Appendix: Mathematical Formulas

### 12.1 Reverse Calculation Timeline

```
Given:
  - Sales Week: W_s
  - Sales Quantity: Q_s
  - Safety Stock Weeks: S
  - Shipping Weeks: T_ship
  - Loading Weeks: T_load
  - Production Weeks: T_prod

Calculate:
  W_arrival = W_s - S
  W_ship = W_arrival - T_ship
  W_factory = W_ship - T_load
  W_order = W_factory - T_prod

Accumulation:
  planned_arrival[W_arrival] += Q_s
  planned_ship[W_ship] += Q_s
  planned_factory_ship[W_factory] += Q_s
  planned_order[W_order] += Q_s
```

### 12.2 Inventory Calculation

```
For week w:
  opening_stock[w] = closing_stock[w-1]  (or initial_stock for first week)
  arrival_effective[w] = COALESCE(actual_arrival[w], planned_arrival[w])
  sales_effective[w] = COALESCE(sales_actual[w], sales_forecast[w])
  closing_stock[w] = opening_stock[w] + arrival_effective[w] - sales_effective[w]

  safety_threshold[w] = sales_effective[w] × safety_stock_weeks

  stock_status[w] =
    IF closing_stock[w] <= 0 THEN 'Stockout'
    ELSE IF closing_stock[w] < safety_threshold[w] THEN 'Risk'
    ELSE 'OK'
```

---

## End of Design Document

**Next Steps:**
1. Review and approve this design document
2. Implement backend query function (`algorithm-audit-v3.ts`)
3. Add TypeScript types to `database.ts`
4. Implement frontend component (`algorithm-audit-table-v3.tsx`)
5. Create Next.js page route
6. Test with sample data
7. Deploy to production

**Questions/Clarifications:**
- Confirm shipping_weeks range (currently 4-6 weeks)
- Confirm initial stock source (using inventory_snapshots sum)
- Confirm color-coding scheme for actual vs planned cells
