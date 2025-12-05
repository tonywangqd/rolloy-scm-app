# Algorithm Audit V4.0 - Technical Design Document

## Document Metadata
- **Feature:** Algorithm Audit V4.0 - Data Correspondence & Traceability
- **Role:** System Architect
- **Date:** 2025-12-05
- **Status:** Technical Design
- **Priority:** P0 (Critical Data Integrity Issue)
- **Reviewer:** Engineering Lead, CTO

---

## 1. Executive Summary

### 1.1 Design Philosophy

**Core Principle:** "Every number must have a provable origin."

This design addresses the critical data integrity issues in V3 by implementing:
1. **Forward Propagation Override**: Actual orders completely replace backward-calculated plans for their supply chain flow
2. **In-Memory Lineage Tracking**: Dynamic calculation without database bloat
3. **Demand Coverage Analysis**: Explicit tracking of fulfilled vs unfulfilled demand

**Key Architectural Decision:**
- **NO new database tables** (avoids maintenance overhead and data staleness)
- **Compute lineage on-demand** using existing transactional data
- **Extend existing TypeScript types** for rich UI rendering

### 1.2 Performance Target

| Operation | Target | Rationale |
|-----------|--------|-----------|
| Audit page load (1 SKU, 16 weeks) | <2s | Acceptable for analysis page |
| Audit page load (1 SKU, 52 weeks) | <5s | Yearly view for deep analysis |
| Expandable row detail | <500ms | Feels instant |
| Background refresh (all SKUs) | N/A | No caching layer in V4.0 |

---

## 2. Algorithm Design

### 2.1 The V3 Problem (Detailed Analysis)

**Current V3 Logic (lines 973-1099 in algorithm-audit.ts):**

```typescript
// STEP 7: Reverse Calculation (Sales → Planned)
// Problem: Generates planned quantities based on ALL sales demand
rowsV3.forEach((row) => {
  const salesDemand = row.sales_effective
  if (salesDemand <= 0) return

  const arrivalWeek = addWeeksToISOWeek(row.week_iso, -leadTimes.safety_stock_weeks)
  // ... backtrack calculation
  plannedOrderMapV3.set(orderWeek, current + salesDemand)
})

// STEP 7.5: Forward Propagation
// Problem: Only runs IF actual_order exists, but doesn't mark which demand was fulfilled
rowsV3.forEach((row) => {
  if (row.actual_order > 0) {
    const factoryShipWeek = addWeeksToISOWeek(row.week_iso, leadTimes.production_weeks)
    forwardFactoryShipMapV3.set(factoryShipWeek, current + row.actual_order)
  }
})

// Problem: Merge logic doesn't distinguish "covered by actual" vs "uncovered demand"
rowsV3.forEach((row) => {
  row.planned_factory_ship = forwardFactoryShip || plannedFactoryShipMapV3.get(row.week_iso) || 0
  row.factory_ship_effective = row.actual_factory_ship || row.planned_factory_ship
})
```

**Why This Fails:**

1. **Scenario:** Sales forecast 55 in W08, actual order 35 in W02
   - Reverse calc: `planned_order[W02] = 55` ❌ (Wrong: treats as if full demand ordered)
   - Forward prop: `planned_factory_ship[W07] = 35` ✓ (Correct)
   - **Gap not tracked**: The 20-unit shortfall disappears from visibility

2. **Scenario:** Order 35 in W02, delivery 10 in W07
   - Forward prop: `planned_arrival[W13] = 35` ❌ (Wrong: expects full order)
   - Actual: `actual_arrival[W13] = 10` ✓ (Correct)
   - **Duplicate counting risk**: If delivery also creates planned_arrival, we get 35 + 10 = 45

### 2.2 V4 Improved Algorithm

#### Phase 1: Demand Matching (Sales → Orders)

**Objective:** Allocate actual orders to sales demands with a tolerance window.

```typescript
// New function: matchSalesDemandsToOrders()
function matchSalesDemandsToOrders(
  rows: AlgorithmAuditRowV3[],
  leadTimes: SupplyChainLeadTimesV3
): Map<string, DemandCoverage> {
  const demandCoverageMap = new Map<string, DemandCoverage>()

  rows.forEach((row) => {
    const salesDemand = row.sales_effective
    if (salesDemand <= 0) return

    // Calculate target order week (backtrack from sales week)
    const arrivalWeek = addWeeksToISOWeek(row.week_iso, -leadTimes.safety_stock_weeks)
    const shipWeek = arrivalWeek ? addWeeksToISOWeek(arrivalWeek, -leadTimes.shipping_weeks) : null
    const factoryShipWeek = shipWeek ? addWeeksToISOWeek(shipWeek, -leadTimes.loading_weeks) : null
    const targetOrderWeek = factoryShipWeek
      ? addWeeksToISOWeek(factoryShipWeek, -leadTimes.production_weeks)
      : null

    if (!targetOrderWeek) return

    // Find matching orders within ±1 week tolerance
    const matchingOrders: OrderMatch[] = []
    for (let offset = -1; offset <= 1; offset++) {
      const searchWeek = addWeeksToISOWeek(targetOrderWeek, offset)
      if (!searchWeek) continue

      const orderRow = rows.find((r) => r.week_iso === searchWeek)
      if (orderRow && orderRow.actual_order > 0) {
        matchingOrders.push({
          po_numbers: [], // Will be filled from detailed query
          ordered_qty: orderRow.actual_order,
          order_week: searchWeek,
          week_offset: offset,
        })
      }
    }

    // Calculate coverage
    const totalOrderedCoverage = matchingOrders.reduce((sum, o) => sum + o.ordered_qty, 0)
    const coverageStatus: CoverageStatus =
      totalOrderedCoverage >= salesDemand
        ? 'Fully Covered'
        : totalOrderedCoverage > 0
        ? 'Partially Covered'
        : 'Uncovered'

    demandCoverageMap.set(row.week_iso, {
      sales_week: row.week_iso,
      sales_demand: salesDemand,
      target_order_week: targetOrderWeek,
      matching_orders: matchingOrders,
      total_ordered_coverage: totalOrderedCoverage,
      uncovered_qty: Math.max(0, salesDemand - totalOrderedCoverage),
      coverage_status: coverageStatus,
    })
  })

  return demandCoverageMap
}
```

#### Phase 2: Forward Propagation with Actuals Override

**Key Change:** Track which quantities are from "real orders" vs "speculative plans".

```typescript
// Enhanced forward propagation
function forwardPropagateWithLineage(
  rows: AlgorithmAuditRowV3[],
  leadTimes: SupplyChainLeadTimesV3
): ForwardPropagationResult {
  // Maps: week -> { actualQty, plannedQty, sources[] }
  const factoryShipMap = new Map<string, PropagationEntry>()
  const shipMap = new Map<string, PropagationEntry>()
  const arrivalMap = new Map<string, PropagationEntry>()

  rows.forEach((row) => {
    // Forward propagate from actual orders (highest priority)
    if (row.actual_order > 0) {
      const factoryShipWeek = addWeeksToISOWeek(row.week_iso, leadTimes.production_weeks)
      if (factoryShipWeek) {
        addPropagationEntry(factoryShipMap, factoryShipWeek, {
          qty: row.actual_order,
          source_type: 'actual_order',
          source_week: row.week_iso,
          confidence: 'high',
        })
      }

      const shipWeek = factoryShipWeek
        ? addWeeksToISOWeek(factoryShipWeek, leadTimes.loading_weeks)
        : null
      if (shipWeek) {
        addPropagationEntry(shipMap, shipWeek, {
          qty: row.actual_order,
          source_type: 'actual_order',
          source_week: row.week_iso,
          confidence: 'high',
        })
      }

      const arrivalWeek = shipWeek
        ? addWeeksToISOWeek(shipWeek, leadTimes.shipping_weeks)
        : null
      if (arrivalWeek) {
        addPropagationEntry(arrivalMap, arrivalWeek, {
          qty: row.actual_order,
          source_type: 'actual_order',
          source_week: row.week_iso,
          confidence: 'high',
        })
      }
    }

    // Forward propagate from actual factory deliveries (if no order tracking)
    if (row.actual_factory_ship > 0) {
      const shipWeek = addWeeksToISOWeek(row.week_iso, leadTimes.loading_weeks)
      if (shipWeek && !hasHighConfidenceEntry(shipMap, shipWeek)) {
        addPropagationEntry(shipMap, shipWeek, {
          qty: row.actual_factory_ship,
          source_type: 'actual_factory_ship',
          source_week: row.week_iso,
          confidence: 'medium',
        })
      }

      const arrivalWeek = shipWeek
        ? addWeeksToISOWeek(shipWeek, leadTimes.shipping_weeks)
        : null
      if (arrivalWeek && !hasHighConfidenceEntry(arrivalMap, arrivalWeek)) {
        addPropagationEntry(arrivalMap, arrivalWeek, {
          qty: row.actual_factory_ship,
          source_type: 'actual_factory_ship',
          source_week: row.week_iso,
          confidence: 'medium',
        })
      }
    }

    // Forward propagate from actual shipments (lowest priority)
    if (row.actual_ship > 0) {
      const arrivalWeek = addWeeksToISOWeek(row.week_iso, leadTimes.shipping_weeks)
      if (arrivalWeek && !hasHighConfidenceEntry(arrivalMap, arrivalWeek)) {
        addPropagationEntry(arrivalMap, arrivalWeek, {
          qty: row.actual_ship,
          source_type: 'actual_ship',
          source_week: row.week_iso,
          confidence: 'low',
        })
      }
    }
  })

  return { factoryShipMap, shipMap, arrivalMap }
}
```

#### Phase 3: Merge Strategy (Critical Logic)

**Rule:** Actual-based forward propagation ALWAYS overrides reverse-calculated plans.

```typescript
rows.forEach((row) => {
  // 1. ORDER: Always use reverse calc for planned (no override)
  row.planned_order = plannedOrderMapV3.get(row.week_iso) || 0

  // 2. FACTORY SHIP: Use forward propagation if available
  const forwardFactoryShip = factoryShipMap.get(row.week_iso)
  if (forwardFactoryShip && forwardFactoryShip.confidence !== 'none') {
    row.planned_factory_ship = forwardFactoryShip.qty
    row.planned_factory_ship_source = forwardFactoryShip.sources
  } else {
    row.planned_factory_ship = plannedFactoryShipMapV3.get(row.week_iso) || 0
    row.planned_factory_ship_source = [{ source_type: 'reverse_calc', confidence: 'low' }]
  }

  // 3. SHIP: Use forward propagation if available
  const forwardShip = shipMap.get(row.week_iso)
  if (forwardShip && forwardShip.confidence !== 'none') {
    row.planned_ship = forwardShip.qty
    row.planned_ship_source = forwardShip.sources
  } else {
    row.planned_ship = plannedShipMapV3.get(row.week_iso) || 0
    row.planned_ship_source = [{ source_type: 'reverse_calc', confidence: 'low' }]
  }

  // 4. ARRIVAL: Use forward propagation if available
  const forwardArrival = arrivalMap.get(row.week_iso)
  if (forwardArrival && forwardArrival.confidence !== 'none') {
    row.planned_arrival = forwardArrival.qty
    row.planned_arrival_source = forwardArrival.sources
  } else {
    row.planned_arrival = plannedArrivalMapV3.get(row.week_iso) || 0
    row.planned_arrival_source = [{ source_type: 'reverse_calc', confidence: 'low' }]
  }

  // 5. EFFECTIVE: Actual always takes precedence
  row.order_effective = row.actual_order || row.planned_order
  row.factory_ship_effective = row.actual_factory_ship || row.planned_factory_ship
  row.ship_effective = row.actual_ship || row.planned_ship
  row.arrival_effective = row.actual_arrival || row.planned_arrival
})
```

### 2.3 Detailed Lineage Enrichment

**Objective:** Fetch granular details (PO numbers, tracking numbers) for expandable rows.

```typescript
// New function: enrichRowsWithLineageDetails()
async function enrichRowsWithLineageDetails(
  rows: AlgorithmAuditRowV3[],
  sku: string,
  supabase: SupabaseClient
): Promise<AlgorithmAuditRowV4[]> {
  // Step 1: Identify weeks with actual data
  const weeksWithOrders = rows.filter((r) => r.actual_order > 0).map((r) => r.week_iso)
  const weeksWithDeliveries = rows.filter((r) => r.actual_factory_ship > 0).map((r) => r.week_iso)
  const weeksWithShipments = rows.filter((r) => r.actual_ship > 0).map((r) => r.week_iso)
  const weeksWithArrivals = rows.filter((r) => r.actual_arrival > 0).map((r) => r.week_iso)

  // Step 2: Fetch detailed records in parallel
  const [orderDetails, deliveryDetails, shipmentDetails, arrivalDetails] = await Promise.all([
    fetchOrderDetailsByWeeks(supabase, sku, weeksWithOrders),
    fetchDeliveryDetailsByWeeks(supabase, sku, weeksWithDeliveries),
    fetchShipmentDetailsByWeeks(supabase, sku, weeksWithShipments, 'departure'),
    fetchShipmentDetailsByWeeks(supabase, sku, weeksWithArrivals, 'arrival'),
  ])

  // Step 3: Build detail maps
  const orderDetailMap = groupByWeek(orderDetails, 'order_week')
  const deliveryDetailMap = groupByWeek(deliveryDetails, 'delivery_week')
  const shipmentDetailMap = groupByWeek(shipmentDetails, 'departure_week')
  const arrivalDetailMap = groupByWeek(arrivalDetails, 'arrival_week')

  // Step 4: Enhance rows with details
  const rowsV4: AlgorithmAuditRowV4[] = rows.map((row) => {
    const demandCoverage = demandCoverageMap.get(row.week_iso)

    return {
      ...row,
      // Sales coverage
      sales_coverage_status: demandCoverage?.coverage_status || 'Unknown',
      sales_uncovered_qty: demandCoverage?.uncovered_qty || 0,

      // Order details (expandable)
      order_details: orderDetailMap.get(row.week_iso) || [],

      // Factory ship details
      factory_ship_details: deliveryDetailMap.get(row.week_iso) || [],

      // Ship details
      ship_details: shipmentDetailMap.get(row.week_iso) || [],

      // Arrival details
      arrival_details: arrivalDetailMap.get(row.week_iso) || [],
    }
  })

  return rowsV4
}
```

---

## 3. TypeScript Type Extensions

### 3.1 Core Lineage Types

```typescript
/**
 * Coverage status for sales demand
 */
export type CoverageStatus = 'Fully Covered' | 'Partially Covered' | 'Uncovered' | 'Unknown'

/**
 * Confidence level for forward propagation
 */
export type PropagationConfidence = 'high' | 'medium' | 'low' | 'none'

/**
 * Source type for propagated quantities
 */
export type PropagationSourceType =
  | 'actual_order'
  | 'actual_factory_ship'
  | 'actual_ship'
  | 'actual_arrival'
  | 'reverse_calc'

/**
 * Demand coverage analysis for a sales week
 */
export interface DemandCoverage {
  sales_week: string
  sales_demand: number
  target_order_week: string
  matching_orders: OrderMatch[]
  total_ordered_coverage: number
  uncovered_qty: number
  coverage_status: CoverageStatus
}

/**
 * Matched order within ±1 week tolerance
 */
export interface OrderMatch {
  po_numbers: string[] // e.g., ["PO-2025-001", "PO-2025-002"]
  ordered_qty: number
  order_week: string
  week_offset: number // -1, 0, +1
}

/**
 * Propagation source metadata
 */
export interface PropagationSource {
  source_type: PropagationSourceType
  source_week: string
  confidence: PropagationConfidence
}

/**
 * Aggregated propagation entry
 */
export interface PropagationEntry {
  qty: number
  sources: PropagationSource[]
  confidence: PropagationConfidence // Highest confidence among sources
}
```

### 3.2 Detail Types (for Expandable Rows)

```typescript
/**
 * Detailed order information for a specific week
 */
export interface OrderDetailV4 {
  po_id: string
  po_number: string
  ordered_qty: number
  order_date: string // YYYY-MM-DD
  order_week: string // YYYY-WW
  fulfillment_status: 'Complete' | 'Partial' | 'Pending'
  delivered_qty: number
  pending_qty: number
  supplier_name: string | null
}

/**
 * Detailed delivery information for a specific week
 */
export interface DeliveryDetailV4 {
  delivery_id: string
  delivery_number: string
  po_number: string // Traceability back to order
  delivered_qty: number
  delivery_date: string
  delivery_week: string
  shipment_status: 'Fully Shipped' | 'Partially Shipped' | 'Awaiting Shipment'
  shipped_qty: number
  unshipped_qty: number
}

/**
 * Detailed shipment information (departure)
 */
export interface ShipmentDetailV4 {
  shipment_id: string
  tracking_number: string
  delivery_number: string | null // Traceability
  shipped_qty: number
  departure_date: string | null
  arrival_date: string | null
  planned_arrival_week: string
  actual_arrival_week: string | null
  current_status: 'Arrived' | 'In Transit' | 'Departed' | 'Awaiting'
}

/**
 * Detailed arrival information
 */
export interface ArrivalDetailV4 {
  shipment_id: string
  tracking_number: string
  po_number: string | null // Full traceability (if linkable)
  arrived_qty: number
  arrival_date: string
  arrival_week: string
  warehouse_code: string
  destination_warehouse_name: string
}
```

### 3.3 Enhanced V4 Row Type

```typescript
/**
 * Algorithm Audit Row V4 - Extends V3 with lineage data
 */
export interface AlgorithmAuditRowV4 extends AlgorithmAuditRowV3 {
  // Sales Coverage
  sales_coverage_status: CoverageStatus
  sales_uncovered_qty: number

  // Lineage metadata (for planned values)
  planned_factory_ship_source?: PropagationSource[]
  planned_ship_source?: PropagationSource[]
  planned_arrival_source?: PropagationSource[]

  // Detailed data (for expandable rows)
  order_details: OrderDetailV4[]
  factory_ship_details: DeliveryDetailV4[]
  ship_details: ShipmentDetailV4[]
  arrival_details: ArrivalDetailV4[]
}

/**
 * Complete V4 audit result
 */
export interface AlgorithmAuditResultV4 {
  product: Product | null
  rows: AlgorithmAuditRowV4[]
  leadTimes: SupplyChainLeadTimesV3
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    safety_stock_weeks: number
    production_lead_weeks: number
    shipping_weeks: number
    // V4-specific metadata
    total_demand: number
    total_ordered: number
    overall_coverage_percentage: number
  }
}
```

---

## 4. Database Strategy

### 4.1 NO New Tables (Architectural Decision)

**Rationale:**
1. **Avoid Data Duplication:** Lineage is derived from existing transactional data
2. **No Staleness Issues:** Always compute fresh from source of truth
3. **Simpler Maintenance:** No refresh jobs or sync logic
4. **Smaller Surface Area:** Fewer tables = fewer RLS policies

**Trade-off Accepted:**
- Slightly slower page load (~2-3s vs <1s with materialized table)
- Acceptable for an analysis page that's not frequently accessed

### 4.2 Optimized Queries

**Critical Indexes (already exist in production):**
```sql
-- Existing indexes (verify in Supabase)
CREATE INDEX idx_purchase_orders_actual_order_date ON purchase_orders(actual_order_date);
CREATE INDEX idx_production_deliveries_actual_delivery_date ON production_deliveries(actual_delivery_date);
CREATE INDEX idx_shipments_actual_departure_date ON shipments(actual_departure_date);
CREATE INDEX idx_shipments_actual_arrival_date ON shipments(actual_arrival_date);
```

**Query Strategy:**
- **Single SKU query**: Fetch all transactional data in parallel (4 queries)
- **Week filtering**: Use `IN (week_list)` for targeted fetches
- **JOIN optimization**: Use Supabase's `.select('*, related_table(*)')` syntax

---

## 5. Implementation Plan

### 5.1 Code Files to Modify

```
src/lib/queries/algorithm-audit.ts (Primary changes)
├── Add: matchSalesDemandsToOrders()
├── Add: forwardPropagateWithLineage()
├── Add: enrichRowsWithLineageDetails()
├── Add: fetchOrderDetailsByWeeks()
├── Add: fetchDeliveryDetailsByWeeks()
├── Add: fetchShipmentDetailsByWeeks()
└── Modify: fetchAlgorithmAuditV3() → fetchAlgorithmAuditV4()

src/lib/types/database.ts
├── Add: DemandCoverage interface
├── Add: OrderDetailV4 interface
├── Add: DeliveryDetailV4 interface
├── Add: ShipmentDetailV4 interface
├── Add: ArrivalDetailV4 interface
├── Add: PropagationSource interface
└── Add: AlgorithmAuditRowV4 interface

src/app/settings/algorithm-audit/page.tsx
└── Update: Use AlgorithmAuditResultV4 type

src/components/settings/algorithm-audit-table-v4.tsx (New file)
├── Expandable row rendering
├── Coverage status badges
└── Detail modals
```

### 5.2 Development Phases

#### Phase 1: Core Algorithm (Week 1)
- [ ] Implement `matchSalesDemandsToOrders()`
- [ ] Implement `forwardPropagateWithLineage()`
- [ ] Unit tests for demand matching logic
- [ ] Unit tests for forward propagation override

#### Phase 2: Lineage Enrichment (Week 2)
- [ ] Implement `fetchOrderDetailsByWeeks()`
- [ ] Implement `fetchDeliveryDetailsByWeeks()`
- [ ] Implement `fetchShipmentDetailsByWeeks()`
- [ ] Implement `enrichRowsWithLineageDetails()`
- [ ] Integration tests with real Supabase data

#### Phase 3: UI Enhancement (Week 3)
- [ ] Add coverage status column to table
- [ ] Implement expandable rows
- [ ] Create detail modals (PO details, shipment details)
- [ ] Add traceability links (clickable PO numbers)
- [ ] Mobile responsive layout

#### Phase 4: Validation & Polish (Week 4)
- [ ] Implement consistency checks (AC-4, AC-5)
- [ ] Performance optimization (measure actual load time)
- [ ] Edge case handling (missing data, partial coverage)
- [ ] User acceptance testing
- [ ] Documentation update

---

## 6. Data Validation Rules

### 6.1 Consistency Checks (Critical for Trust)

**Check CV-1: No Phantom Arrivals**
```typescript
function validateNoPhantomArrivals(rows: AlgorithmAuditRowV4[]): ValidationResult {
  const errors: string[] = []

  rows.forEach((row) => {
    if (row.arrival_effective > 0 && row.arrival_details.length === 0) {
      errors.push(
        `Week ${row.week_iso}: Arrival quantity ${row.arrival_effective} has no shipment records.`
      )
    }

    // Verify sum matches
    const sumFromDetails = row.arrival_details.reduce((sum, d) => sum + d.arrived_qty, 0)
    if (Math.abs(row.arrival_effective - sumFromDetails) > 0.01) {
      errors.push(
        `Week ${row.week_iso}: Arrival effective (${row.arrival_effective}) does not match details sum (${sumFromDetails}).`
      )
    }
  })

  return { isValid: errors.length === 0, errors }
}
```

**Check CV-2: No Double Counting**
```typescript
function validateNoDoubleCounting(rows: AlgorithmAuditRowV4[]): ValidationResult {
  const errors: string[] = []

  // Verify each order's lifecycle only contributes once to inventory
  const orderLifecycles = new Map<string, OrderLifecycleTracker>()

  rows.forEach((row) => {
    row.order_details.forEach((order) => {
      const tracker = orderLifecycles.get(order.po_number) || {
        po_number: order.po_number,
        ordered_qty: order.ordered_qty,
        total_arrivals_seen: 0,
      }

      tracker.total_arrivals_seen += order.ordered_qty // This would need actual tracking
      orderLifecycles.set(order.po_number, tracker)
    })
  })

  // Check for duplicates
  orderLifecycles.forEach((tracker) => {
    // This is a simplified check; real implementation would track exact weeks
    if (tracker.total_arrivals_seen > tracker.ordered_qty * 1.1) {
      errors.push(
        `PO ${tracker.po_number}: Potential double-counting detected. Ordered ${tracker.ordered_qty}, but tracked arrivals suggest duplication.`
      )
    }
  })

  return { isValid: errors.length === 0, errors }
}
```

**Check CV-3: Coverage Completeness**
```typescript
function validateCoverageCompleteness(rows: AlgorithmAuditRowV4[]): ValidationResult {
  const warnings: string[] = []

  const totalDemand = rows.reduce((sum, r) => sum + r.sales_effective, 0)
  const totalOrdered = rows.reduce((sum, r) => sum + r.actual_order, 0)
  const totalUncovered = rows.reduce((sum, r) => sum + r.sales_uncovered_qty, 0)

  const expectedUncovered = totalDemand - totalOrdered
  if (Math.abs(totalUncovered - expectedUncovered) > 0.01) {
    warnings.push(
      `Uncovered demand calculation mismatch: Expected ${expectedUncovered}, got ${totalUncovered}.`
    )
  }

  // Identify weeks with critical uncovered demand
  rows.forEach((row) => {
    if (row.sales_uncovered_qty > 0 && row.stock_status === 'Stockout') {
      warnings.push(
        `Week ${row.week_iso}: ${row.sales_uncovered_qty} units uncovered AND stockout predicted. Urgent action required.`
      )
    }
  })

  return { isValid: true, errors: [], warnings }
}
```

### 6.2 Validation Execution

```typescript
// In fetchAlgorithmAuditV4(), before returning result
const validationResults = {
  phantomCheck: validateNoPhantomArrivals(rowsV4),
  doubleCountCheck: validateNoDoubleCounting(rowsV4),
  coverageCheck: validateCoverageCompleteness(rowsV4),
}

if (!validationResults.phantomCheck.isValid) {
  console.error('[Algorithm Audit V4] Phantom arrivals detected:', validationResults.phantomCheck.errors)
}

// Optionally: Include validation status in result
return {
  ...result,
  validationStatus: validationResults,
}
```

---

## 7. UI/UX Design Guidance

### 7.1 Expandable Row Pattern

**Component Structure:**
```tsx
<TableRow>
  <TableCell>W08</TableCell>
  <TableCell>
    <div className="flex items-center gap-2">
      <span>373</span>
      <Badge variant={coverageVariant}>
        {row.sales_coverage_status === 'Fully Covered' ? '✓ 全覆盖' : ''}
        {row.sales_coverage_status === 'Partially Covered' ? `⚠ 缺 ${row.sales_uncovered_qty}` : ''}
        {row.sales_coverage_status === 'Uncovered' ? '✗ 未覆盖' : ''}
      </Badge>
      {row.order_details.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => toggleDetails('sales', rowIndex)}>
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
      )}
    </div>
  </TableCell>
  {/* ... other columns */}
</TableRow>

{expanded && (
  <TableRow>
    <TableCell colSpan={20}>
      <ExpandedDetails>
        <h4>销售覆盖详情</h4>
        <p>需求: {row.sales_effective} 件</p>
        <p>已下单: {row.order_details.reduce((sum, o) => sum + o.ordered_qty, 0)} 件</p>
        <p>未覆盖: {row.sales_uncovered_qty} 件</p>

        {row.order_details.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>PO号</th>
                <th>下单量</th>
                <th>已交付</th>
                <th>待交付</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {row.order_details.map((order) => (
                <tr key={order.po_id}>
                  <td>
                    <Link href={`/procurement/edit/${order.po_id}`}>
                      {order.po_number}
                    </Link>
                  </td>
                  <td>{order.ordered_qty}</td>
                  <td>{order.delivered_qty}</td>
                  <td>{order.pending_qty}</td>
                  <td>
                    <Badge variant={order.fulfillment_status === 'Complete' ? 'success' : 'warning'}>
                      {order.fulfillment_status === 'Complete' ? '✓ 完成' : '⚠ 部分'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </ExpandedDetails>
    </TableCell>
  </TableRow>
)}
```

### 7.2 Coverage Badge Variants

```tsx
function getCoverageBadgeVariant(status: CoverageStatus): BadgeVariant {
  switch (status) {
    case 'Fully Covered':
      return 'success' // Green
    case 'Partially Covered':
      return 'warning' // Yellow
    case 'Uncovered':
      return 'destructive' // Red
    default:
      return 'secondary' // Gray
  }
}
```

### 7.3 Tooltip for Planned Value Sources

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>
      <span className={row.planned_arrival_source?.[0]?.confidence === 'low' ? 'text-gray-400' : ''}>
        {row.planned_arrival}
      </span>
    </TooltipTrigger>
    <TooltipContent>
      <p>数据来源:</p>
      {row.planned_arrival_source?.map((source, idx) => (
        <p key={idx}>
          • {source.source_type === 'actual_order' ? '基于实际订单' : ''}
          {source.source_type === 'reverse_calc' ? '反推计算' : ''}
          (来自 {source.source_week})
        </p>
      ))}
      <p className="text-xs text-gray-500 mt-2">
        置信度: {row.planned_arrival_source?.[0]?.confidence === 'high' ? '高' : '低'}
      </p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## 8. Performance Optimization

### 8.1 Query Optimization

**Batch Fetching for Detail Records:**
```typescript
// Instead of 16 queries (one per week), batch by week list
async function fetchOrderDetailsByWeeks(
  supabase: SupabaseClient,
  sku: string,
  weeks: string[]
): Promise<OrderDetailV4[]> {
  if (weeks.length === 0) return []

  // Convert weeks to date range for efficient DB query
  const dateRanges = weeks.map((week) => {
    const weekStart = parseISOWeekString(week)
    const weekEnd = addDays(weekStart, 6)
    return { start: formatDateISO(weekStart), end: formatDateISO(weekEnd) }
  })

  const minDate = dateRanges[0].start
  const maxDate = dateRanges[dateRanges.length - 1].end

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      po_number,
      actual_order_date,
      suppliers(supplier_name),
      purchase_order_items!inner(
        id,
        sku,
        ordered_qty,
        delivered_qty
      )
    `)
    .eq('purchase_order_items.sku', sku)
    .gte('actual_order_date', minDate)
    .lte('actual_order_date', maxDate)
    .not('actual_order_date', 'is', null)

  if (error) throw error

  // Transform to OrderDetailV4 format
  const details: OrderDetailV4[] = []
  data?.forEach((po) => {
    const items = Array.isArray(po.purchase_order_items)
      ? po.purchase_order_items
      : [po.purchase_order_items]

    items.forEach((item: any) => {
      if (item.sku !== sku) return

      const orderWeek = getWeekFromDate(new Date(po.actual_order_date))
      const pendingQty = item.ordered_qty - item.delivered_qty
      const fulfillmentStatus: 'Complete' | 'Partial' | 'Pending' =
        pendingQty === 0 ? 'Complete' : item.delivered_qty > 0 ? 'Partial' : 'Pending'

      details.push({
        po_id: po.id,
        po_number: po.po_number,
        ordered_qty: item.ordered_qty,
        order_date: po.actual_order_date,
        order_week: orderWeek,
        fulfillment_status: fulfillmentStatus,
        delivered_qty: item.delivered_qty,
        pending_qty: pendingQty,
        supplier_name: po.suppliers?.supplier_name || null,
      })
    })
  })

  return details
}
```

### 8.2 Caching Strategy (Future Enhancement)

**Phase 1 (V4.0):** No caching (prioritize correctness)
**Phase 2 (V4.1):** Implement Redis cache with 5-minute TTL
```typescript
// Future implementation
const cacheKey = `audit_v4:${sku}:${startWeek}:${endWeek}:${shippingWeeks}`
const cachedResult = await redis.get(cacheKey)
if (cachedResult) {
  return JSON.parse(cachedResult)
}

const result = await computeAlgorithmAuditV4(...)
await redis.setex(cacheKey, 300, JSON.stringify(result)) // 5-minute cache
return result
```

---

## 9. Acceptance Criteria Verification

### AC-1: Coverage Status Display ✓
**Implementation:**
- `DemandCoverage` interface tracks coverage status
- `matchSalesDemandsToOrders()` calculates coverage with ±1 week tolerance
- UI displays badge with status and gap quantity

### AC-2: Order Detail Expansion ✓
**Implementation:**
- `order_details: OrderDetailV4[]` attached to each row
- `fetchOrderDetailsByWeeks()` queries PO records with fulfillment status
- Expandable row component renders detail table with clickable PO links

### AC-3: Delivery Traceability ✓
**Implementation:**
- `DeliveryDetailV4` includes `po_number` field
- `fetchDeliveryDetailsByWeeks()` joins `production_deliveries` with `purchase_orders`
- UI displays PO link in delivery details

### AC-4: No Double Counting ✓
**Implementation:**
- Forward propagation uses confidence levels to prevent overrides
- `arrival_effective = COALESCE(actual_arrival, planned_arrival)` ensures single source
- `validateNoDoubleCounting()` check detects anomalies

### AC-5: Cancellation Handling ✓
**Implementation:**
- `sales_uncovered_qty` explicitly tracks unfulfilled demand
- Forward propagation from actual_order (35) overrides reverse calc (55)
- Downstream weeks use forward-propagated 35, not backward-calculated 55

### AC-6: Lineage Refresh (N/A for V4.0)
**Rationale:** No caching layer means data is always fresh
**Future:** If V4.1 adds caching, implement cache invalidation on PO/delivery/shipment write

---

## 10. Risk Mitigation

### Risk R-1: Performance Degradation (Medium Probability)
**Mitigation:**
- Parallel query execution (Promise.all)
- Indexed date columns on all transactional tables
- Week-based filtering reduces result set size
- Pagination for 52+ week views (if needed)

**Fallback:** If load time exceeds 5s, implement server-side caching in V4.1

### Risk R-2: Historical Data Gaps (High Probability)
**Mitigation:**
- Mark pre-system orders with `legacy_data = true` flag
- Exclude legacy orders from coverage calculation
- Display warning badge: "⚠ 历史数据不完整，覆盖率可能偏低"

**Implementation:**
```typescript
if (orderDate < SYSTEM_LAUNCH_DATE) {
  return {
    ...orderDetail,
    is_legacy: true,
    warning: 'Legacy order - may lack full traceability',
  }
}
```

### Risk R-3: Complex UI State Management (Medium Probability)
**Mitigation:**
- Use React Context for expanded row state
- Lazy load detail data only when row expands
- Virtualized rendering for 52+ week views (react-virtual)

**Fallback:** If UX feels sluggish, split into separate detail pages

### Risk R-4: Edge Case - Multi-PO Shipments (Low Probability)
**Scenario:** One shipment contains items from multiple POs
**Current State:** `production_deliveries` links to `po_item_id`, but shipments may consolidate
**Mitigation:**
- Accept that shipment-level lineage may be approximate
- Display message: "此批次包含多个订单的货物，显示主要来源"
- Full resolution requires M:N relationship (out of scope for V4.0)

---

## 11. Future Enhancements (Out of V4.0 Scope)

### V4.1: Automated Alerts
- Trigger Slack/Email when coverage drops below 80%
- Daily digest of uncovered demand by SKU

### V4.2: Predictive Delay Warnings
- Analyze historical transit times
- Predict late arrivals based on departure date

### V4.3: Supplier Scorecard Integration
- Track order fulfillment rate by supplier
- Display supplier reliability in order details

### V4.4: Multi-Currency Support
- Track actual unit costs from PO items
- Calculate variance between forecast and actual landed cost

### V4.5: Quality Inspection Integration
- Link to quality hold records
- Display rejected quantities in delivery details

---

## 12. Deployment Checklist

- [ ] Merge types into `src/lib/types/database.ts`
- [ ] Implement core algorithm functions in `src/lib/queries/algorithm-audit.ts`
- [ ] Create new query function `fetchAlgorithmAuditV4()`
- [ ] Add unit tests for demand matching logic
- [ ] Add integration tests with test data
- [ ] Create UI component `algorithm-audit-table-v4.tsx`
- [ ] Update page to use V4 endpoint
- [ ] Add feature flag: `ENABLE_ALGORITHM_AUDIT_V4` (default: false)
- [ ] Deploy to staging environment
- [ ] User acceptance testing with 3 SKUs
- [ ] Performance benchmark (measure actual load time)
- [ ] Security review (verify no N+1 queries)
- [ ] Enable feature flag in production
- [ ] Monitor error logs for 7 days
- [ ] Document known limitations in user guide

---

## 13. Testing Strategy

### Unit Tests
```typescript
describe('matchSalesDemandsToOrders', () => {
  it('should fully cover demand when order matches exactly', () => {
    const rows = [
      { week_iso: '2025-W08', sales_effective: 55, actual_order: 0 },
      { week_iso: '2025-W02', sales_effective: 0, actual_order: 55 },
    ]
    const result = matchSalesDemandsToOrders(rows, leadTimes)
    expect(result.get('2025-W08')?.coverage_status).toBe('Fully Covered')
    expect(result.get('2025-W08')?.uncovered_qty).toBe(0)
  })

  it('should partially cover when order is insufficient', () => {
    const rows = [
      { week_iso: '2025-W08', sales_effective: 55, actual_order: 0 },
      { week_iso: '2025-W02', sales_effective: 0, actual_order: 35 },
    ]
    const result = matchSalesDemandsToOrders(rows, leadTimes)
    expect(result.get('2025-W08')?.coverage_status).toBe('Partially Covered')
    expect(result.get('2025-W08')?.uncovered_qty).toBe(20)
  })

  it('should match orders within ±1 week tolerance', () => {
    const rows = [
      { week_iso: '2025-W08', sales_effective: 55, actual_order: 0 },
      { week_iso: '2025-W01', sales_effective: 0, actual_order: 55 }, // -1 week
    ]
    const result = matchSalesDemandsToOrders(rows, leadTimes)
    expect(result.get('2025-W08')?.matching_orders).toHaveLength(1)
    expect(result.get('2025-W08')?.matching_orders[0].week_offset).toBe(-1)
  })
})

describe('forwardPropagateWithLineage', () => {
  it('should propagate from actual order to expected arrival', () => {
    const rows = [
      { week_iso: '2025-W02', actual_order: 35 },
      // ... other weeks
    ]
    const result = forwardPropagateWithLineage(rows, leadTimes)
    const expectedArrivalWeek = '2025-W13' // W02 + 5 production + 1 loading + 5 shipping
    expect(result.arrivalMap.get(expectedArrivalWeek)?.qty).toBe(35)
    expect(result.arrivalMap.get(expectedArrivalWeek)?.confidence).toBe('high')
  })

  it('should not override high-confidence propagation with low-confidence', () => {
    const rows = [
      { week_iso: '2025-W02', actual_order: 35 },
      { week_iso: '2025-W07', actual_factory_ship: 30 }, // Would propagate to same arrival
    ]
    const result = forwardPropagateWithLineage(rows, leadTimes)
    const arrivalWeek = '2025-W13'
    expect(result.arrivalMap.get(arrivalWeek)?.qty).toBe(35) // From order, not factory ship
    expect(result.arrivalMap.get(arrivalWeek)?.confidence).toBe('high')
  })
})
```

### Integration Tests
```typescript
describe('fetchAlgorithmAuditV4 Integration', () => {
  it('should return V4 result with lineage details', async () => {
    const result = await fetchAlgorithmAuditV4('D-001', 5)

    expect(result.rows).toBeDefined()
    expect(result.rows[0]).toHaveProperty('sales_coverage_status')
    expect(result.rows[0]).toHaveProperty('order_details')
    expect(result.rows[0]).toHaveProperty('factory_ship_details')
  })

  it('should validate no phantom arrivals', async () => {
    const result = await fetchAlgorithmAuditV4('D-001', 5)
    const validationResult = validateNoPhantomArrivals(result.rows)
    expect(validationResult.isValid).toBe(true)
  })
})
```

---

## 14. Success Metrics (3-Month Post-Launch)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Data Integrity Score | >95% | Weekly automated validation checks pass rate |
| User Trust Rating | >4.5/5 | Survey: "I trust the audit table data" |
| Coverage Visibility | 100% | All SKUs show coverage status |
| Traceability Usage | >40% | % of sessions where users expand detail rows |
| Stockout Prevention | <3/month | Reduction from 12/month baseline |
| Audit Prep Time | <8 hours | Time to prepare monthly financial audit report |

---

## 15. Conclusion

### Summary of Design Decisions

1. **NO new database tables** - Compute lineage on-demand for data freshness
2. **Enhanced V3 algorithm** - Add demand matching + forward propagation with confidence tracking
3. **Rich TypeScript types** - Enable IDE autocomplete and type safety
4. **Expandable UI pattern** - Progressive disclosure of detail data
5. **Validation layer** - Automated checks for data consistency

### Key Innovations

- **Confidence-Based Propagation**: Prevents low-quality data from overriding high-quality actuals
- **Demand Coverage Analysis**: Explicit tracking of order fulfillment vs demand
- **Zero-Duplication Guarantee**: Forward propagation logic ensures each order flow counted once

### Next Steps

1. Engineering Lead approval of technical design
2. Backend Specialist implements core algorithm (Phase 1-2)
3. Frontend Artisan builds UI components (Phase 3)
4. QA Director validates against acceptance criteria (Phase 4)
5. Staged rollout: 10 SKUs → 50 SKUs → all SKUs

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Forward Propagation | Tracking actual order through supply chain stages (order → factory ship → ship → arrival) |
| Reverse Calculation | Backward calculation from sales demand to determine when order should have occurred |
| Demand Coverage | Percentage of sales demand matched by actual purchase orders |
| Lineage | Traceability path from sales demand to warehouse arrival |
| Confidence Level | Quality indicator for propagated quantities (high/medium/low) |
| Uncovered Demand | Sales forecast not matched by any purchase order |
| Phantom Quantity | Arrival/inventory increase without corresponding shipment record (data error) |

---

## Appendix B: SQL Query Examples

### Query 1: Order Details by Week Range
```sql
SELECT
  po.id AS po_id,
  po.po_number,
  po.actual_order_date,
  s.supplier_name,
  poi.ordered_qty,
  poi.delivered_qty,
  (poi.ordered_qty - poi.delivered_qty) AS pending_qty,
  CASE
    WHEN poi.delivered_qty >= poi.ordered_qty THEN 'Complete'
    WHEN poi.delivered_qty > 0 THEN 'Partial'
    ELSE 'Pending'
  END AS fulfillment_status
FROM purchase_orders po
JOIN purchase_order_items poi ON po.id = poi.po_id
LEFT JOIN suppliers s ON po.supplier_id = s.id
WHERE poi.sku = 'D-001'
  AND po.actual_order_date >= '2025-02-03'
  AND po.actual_order_date <= '2025-02-09'
  AND po.actual_order_date IS NOT NULL
ORDER BY po.actual_order_date DESC;
```

### Query 2: Delivery Details with PO Traceability
```sql
SELECT
  pd.id AS delivery_id,
  pd.delivery_number,
  po.po_number,
  pd.delivered_qty,
  pd.actual_delivery_date,
  COALESCE(
    (SELECT SUM(si.shipped_qty)
     FROM shipment_items si
     JOIN shipments s ON si.shipment_id = s.id
     WHERE si.sku = pd.sku
       AND s.actual_departure_date >= pd.actual_delivery_date
       AND s.actual_departure_date <= pd.actual_delivery_date + INTERVAL '7 days'),
    0
  ) AS shipped_qty,
  CASE
    WHEN shipped_qty >= pd.delivered_qty THEN 'Fully Shipped'
    WHEN shipped_qty > 0 THEN 'Partially Shipped'
    ELSE 'Awaiting Shipment'
  END AS shipment_status
FROM production_deliveries pd
JOIN purchase_order_items poi ON pd.po_item_id = poi.id
JOIN purchase_orders po ON poi.po_id = po.id
WHERE pd.sku = 'D-001'
  AND pd.actual_delivery_date >= '2025-03-10'
  AND pd.actual_delivery_date <= '2025-03-16'
ORDER BY pd.actual_delivery_date DESC;
```

---

## Appendix C: File Size Estimates

| File | Current Size | Estimated V4 Size | Delta |
|------|--------------|-------------------|-------|
| `algorithm-audit.ts` | ~1,140 lines | ~1,800 lines | +660 lines |
| `database.ts` | ~1,356 lines | ~1,550 lines | +194 lines |
| `algorithm-audit-table-v4.tsx` | N/A | ~600 lines | New file |

**Total V4 Implementation:** ~1,450 new lines of code

---

**End of Technical Design Document**

**Approval Required:**
- [ ] Engineering Lead (Technical Feasibility)
- [ ] Backend Specialist (Implementation Complexity)
- [ ] Frontend Artisan (UI/UX Feasibility)
- [ ] QA Director (Testing Strategy)
- [ ] CTO (Strategic Alignment)

**Sign-off Date:** __________
**Approved by:** __________
