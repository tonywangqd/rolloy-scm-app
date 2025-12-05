# Algorithm Audit V4 - Data Correspondence & Traceability Requirements

## Document Metadata
- **Feature:** Algorithm Audit V4.0 - Data Correspondence Fix
- **Role:** Product Director
- **Date:** 2025-12-05
- **Status:** Requirements Draft
- **Priority:** P0 (Critical Data Integrity Issue)

---

## 1. Executive Summary

### 1.1 Critical Business Problem

The current Algorithm Audit V3 has **severe data correspondence issues** that undermine the entire supply chain verification system:

**Problem 1: Sales-to-Order Mismatch**
- Sales forecast: 55 units
- Actual order placed: 35 units
- System continues using 55 for downstream calculations (factory ship, logistics, arrival)
- The 20-unit gap is not tracked as "cancelled", "unfulfilled", or "deferred"

**Problem 2: Order-to-Delivery Mismatch**
- Order placed: 35 units
- Factory delivery: 10 units
- System may show both planned 35 and actual 10, causing double-counting in inventory

**Problem 3: No Data Provenance**
- Cannot trace "35 units ordered" back to specific PO number
- Cannot trace "10 units delivered" back to specific delivery record
- Impossible to audit discrepancies or debug data issues

### 1.2 Business Impact

| Impact Area | Current State | Business Risk |
|-------------|---------------|---------------|
| Inventory Accuracy | ±30% variance | Wrong stock levels lead to stockouts or overstock |
| Algorithm Trust | Cannot validate | Users stop trusting system recommendations |
| Root Cause Analysis | Impossible | Cannot identify which milestone failed |
| Audit Compliance | Non-compliant | Cannot prove FIFO/FEFO calculations |
| Data Governance | No traceability | Violations of financial audit requirements |

**Critical Issue:** If we cannot trace the supply chain from sales demand → PO → delivery → shipment → arrival, the entire system is a "black box" that users will abandon.

---

## 2. Core User Story

**As a** Supply Chain Director
**I want** to see how each sales forecast translates into specific procurement actions, and how those actions actually executed
**So that** I can identify gaps between plan and reality, take corrective action, and maintain accurate inventory projections

### 2.1 Primary Use Cases

**UC-1: Validate Order Coverage**
- Given: Sales forecast 55 units for W08
- When: I check the audit table
- Then: I see exactly which PO(s) cover this demand
- And: I see if coverage is full (55), partial (35), or zero
- And: I see the gap (20 units) marked as "Uncovered Demand"

**UC-2: Trace Delivery Status**
- Given: PO-2025-001 ordered 35 units for SKU D-001
- When: I check delivery status
- Then: I see which delivery record(s) fulfilled this PO
- And: I see if fulfillment is complete (35), partial (10), or pending (0)
- And: I can click to view the delivery details (date, supplier, quality issues)

**UC-3: Track Shipment Lineage**
- Given: Delivery DEL-2025-001 sent 10 units
- When: I check shipment status
- Then: I see which shipment(s) contain these 10 units
- And: I see current logistics status (departed, in-transit, arrived, customs-held)
- And: I can trace back to original PO number

**UC-4: Inventory Waterfall Calculation**
- Given: Multiple POs with different delivery schedules
- When: I view inventory projection
- Then: Inventory calculation uses ONLY the effective (actual or planned) arrival quantities
- And: NO double-counting occurs
- And: Each arrival is linked to its source PO

---

## 3. Business Rules & Logic

### 3.1 Demand Coverage Rules

**Rule DC-1: Sales Forecast Allocation**
```
For each SKU and sales week:
  SalesDemand = COALESCE(sales_actual, sales_forecast)

  TargetArrivalWeek = SalesWeek - safety_stock_weeks
  TargetOrderWeek = TargetArrivalWeek - (shipping + loading + production weeks)

  Find all POs where:
    - SKU matches
    - actual_order_date falls in TargetOrderWeek ± 1 week tolerance

  OrderedCoverage = SUM(ordered_qty from matching POs)

  DemandStatus =
    IF OrderedCoverage >= SalesDemand THEN 'Fully Covered'
    ELSE IF OrderedCoverage > 0 THEN 'Partially Covered'
    ELSE 'Uncovered'

  UncoveredGap = MAX(0, SalesDemand - OrderedCoverage)
```

**Rule DC-2: Order Fulfillment Tracking**
```
For each PO Item:
  OrderedQty = purchase_order_items.ordered_qty

  Find all production_deliveries where:
    - po_id matches
    - sku matches

  DeliveredQty = SUM(delivered_qty from matching deliveries)

  FulfillmentStatus =
    IF DeliveredQty >= OrderedQty THEN 'Complete'
    ELSE IF DeliveredQty > 0 THEN 'Partial'
    ELSE 'Pending'

  PendingQty = OrderedQty - DeliveredQty
```

**Rule DC-3: Shipment Arrival Tracking**
```
For each production_delivery:
  DeliveredQty = production_deliveries.delivered_qty

  Find all shipment_items where:
    - sku matches
    - created_at >= delivery.actual_delivery_date
    - created_at <= delivery.actual_delivery_date + 7 days

  ShippedQty = SUM(shipped_qty from matching shipment_items)

  ShipmentStatus =
    IF ShippedQty >= DeliveredQty THEN 'Fully Shipped'
    ELSE IF ShippedQty > 0 THEN 'Partially Shipped'
    ELSE 'Awaiting Shipment'

  UnshippedQty = DeliveredQty - ShippedQty
```

### 3.2 Data Priority & Resolution Rules

**Rule DP-1: Effective Quantity Selection**
```
For inventory calculations, ALWAYS use arrival_effective:

arrival_effective = COALESCE(
  actual_arrival_from_shipments,
  planned_arrival_from_forward_propagation,
  0
)

Where:
  actual_arrival = SUM(shipment_items.shipped_qty)
                   WHERE actual_arrival_week = this_week

  planned_arrival = forward_propagated_qty_from_actual_orders
                    (See Forward Propagation Algorithm)
```

**Rule DP-2: No Duplicate Counting**
```
Inventory calculation formula:
  closing_stock = opening_stock + arrival_effective - sales_effective

CRITICAL: arrival_effective must NEVER include:
  - Both planned and actual for the same goods
  - Quantities already counted in previous weeks
  - Speculative forecasts if actual order was cancelled
```

**Rule DP-3: Cancellation & Adjustment Handling**
```
When actual_order < planned_order:
  Gap = planned_order - actual_order

  IF Gap > 0 THEN
    - Mark Gap as "Cancelled Demand" in order week
    - DO NOT propagate Gap to future factory_ship/ship/arrival
    - Recalculate forward propagation using ONLY actual_order
  END IF
```

### 3.3 Forward Propagation Algorithm (Critical Fix)

**Current Bug:** V3 uses backward calculation from sales to determine planned values, which does NOT update when actual orders differ from plan.

**New Algorithm:**
```
STEP 1: Reverse Calculation (Sales → Planned Order)
  For each sales week W:
    planned_order[W - total_lead_time] = sales_demand[W]

STEP 2: Forward Propagation (Actual Order → Expected Arrival)
  For each week W where actual_order > 0:
    expected_factory_ship[W + production_weeks] = actual_order[W]
    expected_ship[W + production_weeks + loading_weeks] = actual_order[W]
    expected_arrival[W + total_lead_time] = actual_order[W]

STEP 3: Override Planned with Forward Propagated
  For each week W:
    IF expected_arrival[W] > 0 THEN
      planned_arrival[W] = expected_arrival[W]
    ELSE
      planned_arrival[W] = backward_calculated_arrival[W]
    END IF

STEP 4: Apply Actuals
  arrival_effective[W] = COALESCE(
    actual_arrival[W],      # From shipment actuals
    planned_arrival[W]      # From forward propagation or backward calc
  )
```

**Key Insight:** Once an actual order is placed, we STOP using backward-calculated quantities for that supply chain flow. We track the ACTUAL order through its lifecycle.

---

## 4. Data Model Extensions

### 4.1 New Database Objects Required

**Option A: Materialized Linkage Table (Recommended)**
```sql
CREATE TABLE supply_chain_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  sales_week_iso text NOT NULL,
  sales_demand numeric NOT NULL,

  -- Order linkage
  po_id uuid REFERENCES purchase_orders(id),
  po_number text,
  po_item_ordered_qty numeric,
  po_order_week text,

  -- Delivery linkage
  delivery_id uuid REFERENCES production_deliveries(id),
  delivery_number text,
  delivered_qty numeric,
  delivery_week text,

  -- Shipment linkage
  shipment_id uuid REFERENCES shipments(id),
  tracking_number text,
  shipped_qty numeric,
  ship_week text,
  arrival_week text,

  -- Status tracking
  coverage_status text CHECK (coverage_status IN ('Fully Covered', 'Partially Covered', 'Uncovered')),
  fulfillment_status text CHECK (fulfillment_status IN ('Complete', 'Partial', 'Pending', 'N/A')),
  shipment_status text CHECK (shipment_status IN ('Arrived', 'In Transit', 'Departed', 'Awaiting', 'N/A')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_scl_sku_sales_week ON supply_chain_lineage(sku, sales_week_iso);
CREATE INDEX idx_scl_po_id ON supply_chain_lineage(po_id);
CREATE INDEX idx_scl_delivery_id ON supply_chain_lineage(delivery_id);
CREATE INDEX idx_scl_shipment_id ON supply_chain_lineage(shipment_id);
```

**Option B: Computed View (Fallback if no materialization needed)**
```sql
CREATE OR REPLACE VIEW v_algorithm_audit_lineage AS
SELECT
  -- (Complex JOIN logic combining all stages)
  -- This would be dynamically calculated each time
  -- Performance may be slower for large datasets
FROM sales_forecasts
LEFT JOIN purchase_orders ...
LEFT JOIN production_deliveries ...
LEFT JOIN shipments ...
```

**Recommendation:** Use Option A (materialized table) with a refresh function triggered by data changes, similar to `refresh_inventory_projections()`.

### 4.2 Type Definitions (TypeScript)

```typescript
// Extend AlgorithmAuditRowV3 with lineage data
export interface AlgorithmAuditRowV4 extends AlgorithmAuditRowV3 {
  // Sales Coverage
  sales_coverage_status: 'Fully Covered' | 'Partially Covered' | 'Uncovered'
  sales_uncovered_qty: number

  // Order Details
  order_details: OrderDetail[]

  // Factory Ship Details
  factory_ship_details: DeliveryDetail[]

  // Ship Details
  ship_details: ShipmentDetail[]

  // Arrival Details
  arrival_details: ArrivalDetail[]
}

export interface OrderDetail {
  po_id: string
  po_number: string
  ordered_qty: number
  order_date: string
  order_week: string
  fulfillment_status: 'Complete' | 'Partial' | 'Pending'
  delivered_qty: number
  pending_qty: number
}

export interface DeliveryDetail {
  delivery_id: string
  delivery_number: string
  po_number: string  // Traceability
  delivered_qty: number
  delivery_date: string
  delivery_week: string
  shipment_status: 'Fully Shipped' | 'Partially Shipped' | 'Awaiting Shipment'
  shipped_qty: number
  unshipped_qty: number
}

export interface ShipmentDetail {
  shipment_id: string
  tracking_number: string
  delivery_number: string  // Traceability
  shipped_qty: number
  departure_date: string | null
  arrival_date: string | null
  planned_arrival_week: string
  actual_arrival_week: string | null
  current_status: 'Arrived' | 'In Transit' | 'Departed' | 'Awaiting'
}

export interface ArrivalDetail {
  shipment_id: string
  tracking_number: string
  po_number: string  // Full traceability
  arrived_qty: number
  arrival_date: string
  arrival_week: string
  warehouse_code: string
}
```

---

## 5. User Interface Requirements

### 5.1 Enhanced Table Layout (24 Columns)

**New Column Groups:**
1. **Week** (1 col): ISO week identifier
2. **Sales** (4 cols): Forecast, Actual, Effective, **Coverage Status**
3. **Order** (4 cols): Planned, Actual, Effective, **Details (expandable)**
4. **Factory Ship** (4 cols): Planned, Actual, Effective, **Details (expandable)**
5. **Ship** (4 cols): Planned, Actual, Effective, **Details (expandable)**
6. **Arrival** (4 cols): Planned, Actual, Effective, **Details (expandable)**
7. **Inventory** (4 cols): Opening, Closing, Safety, Status

**Total: 25 Columns** (up from 20)

### 5.2 Expandable Row Details

**User Interaction:**
```
Row W06:
  [+] 销售: 预计 400 | 实际 373 | 取值 373 | 覆盖 ✓

Click [+] expands:

  └─ 销售明细 (Sales Details):
     - 覆盖状态: 全部覆盖 (Fully Covered)
     - 需求: 373件
     - 已下单: 373件 (PO-2025-001: 200件, PO-2025-002: 173件)
     - 未覆盖: 0件

  [+] 下单: 预计 723 | 实际 800 | 取值 800 | 详情 [2个PO]

Click [+] expands:

  └─ 下单明细 (Order Details):
     ┌─────────────────────────────────────────────────────────────┐
     │ PO号         │ 下单量 │ 下单日期    │ 已交付 │ 待交付 │ 状态 │
     ├─────────────────────────────────────────────────────────────┤
     │ PO-2025-001  │ 500    │ 2025-02-03  │ 500    │ 0      │ ✓完成 │
     │ PO-2025-002  │ 300    │ 2025-02-05  │ 100    │ 200    │ ⚠部分 │
     └─────────────────────────────────────────────────────────────┘
     合计: 800件下单, 600件已交付, 200件待交付
```

### 5.3 Coverage Status Indicators

**Visual Design:**
```
销售覆盖状态徽章:
  ✓ 全部覆盖 (Fully Covered)   - Green badge
  ⚠ 部分覆盖 (Partially Covered) - Yellow badge with gap number
  ✗ 未覆盖 (Uncovered)           - Red badge

Example:
  销售 373 | 覆盖 ⚠ 部分 (-20)

  Means:
    - Sales demand: 373
    - Orders placed: 353
    - Gap: 20 units uncovered
```

### 5.4 Traceability Links

**Clickable Data Provenance:**
```
每个数据点应该可以点击查看来源:

[实际 800] ← Hover shows tooltip:
  "来自 2个采购订单:
   • PO-2025-001: 500件
   • PO-2025-002: 300件
   点击查看详情"

Click → Opens modal with full PO details including:
  - Supplier
  - Unit cost
  - Payment terms
  - Approval status
  - Edit history
```

---

## 6. Data Validation Requirements

### 6.1 Consistency Checks

**Check CV-1: No Phantom Quantities**
```
For each week W and SKU:

  IF arrival_effective > 0 THEN
    ASSERT EXISTS (
      SELECT 1 FROM shipments s
      JOIN shipment_items si ON s.id = si.shipment_id
      WHERE si.sku = this_sku
        AND get_iso_week(COALESCE(s.actual_arrival_date, s.planned_arrival_date)) = W
    )
  END IF

Error Message: "发现 W06 到仓量 800 件,但未找到对应的物流记录。数据不一致。"
```

**Check CV-2: No Double Counting**
```
For each PO Item:
  total_delivered = SUM(production_deliveries.delivered_qty WHERE po_id = this_po)

  ASSERT total_delivered <= purchase_order_items.ordered_qty

Error Message: "PO-2025-001 下单 500 件,但交付记录累计 650 件,超出下单量。"
```

**Check CV-3: Arrival Cannot Exceed Shipment**
```
For each shipment:
  arrived_qty = SUM(warehouse receipts for this tracking_number)
  shipped_qty = SUM(shipment_items.shipped_qty)

  ASSERT arrived_qty <= shipped_qty

Error Message: "货柜 TRK-001 发货 100 件,但入库记录 120 件,数据异常。"
```

### 6.2 Audit Trail Requirements

**Requirement AT-1: Change Tracking**
Every modification to PO/Delivery/Shipment must log:
- Who made the change (user_id)
- When (timestamp with timezone)
- What changed (old_value vs new_value)
- Why (optional comment field)

**Requirement AT-2: Lineage Refresh Log**
When supply_chain_lineage table refreshes:
- Log start time, end time, duration
- Log number of records created/updated/deleted
- Log any anomalies detected (gaps, mismatches)
- Send notification if critical issues found

---

## 7. Success Metrics

### 7.1 Data Integrity Metrics

| Metric | Calculation | Target | Critical Threshold |
|--------|-------------|--------|-------------------|
| Coverage Accuracy | (Covered Sales / Total Sales) × 100% | >95% | <80% triggers alert |
| Fulfillment Rate | (Delivered Qty / Ordered Qty) × 100% | >98% | <90% triggers alert |
| Arrival Accuracy | ABS(Planned Arrival - Actual Arrival) / Planned Arrival | <10% | >30% triggers review |
| Traceability Completeness | (POs with full lineage / Total POs) × 100% | 100% | <95% requires investigation |

### 7.2 User Adoption Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Details Click-through Rate | >40% | % of users who expand detail rows |
| Average Time on Audit Page | >8 minutes | Session duration |
| Issue Resolution Time | <2 hours | From detection to corrective action |
| System Trust Score | >4.5/5 | User survey: "I trust this data" |

### 7.3 Business Impact Metrics

| Metric | Baseline (V3) | Target (V4) | Timeline |
|--------|---------------|-------------|----------|
| Inventory Accuracy | 70% | 95% | 3 months |
| Stockout Incidents | 12/month | <3/month | 3 months |
| Overstock Write-offs | $50K/quarter | <$10K/quarter | 6 months |
| Audit Prep Time | 40 hours | <8 hours | Immediate |

---

## 8. Acceptance Criteria

### AC-1: Coverage Status Display
- **Given** SKU D-001 has sales forecast 55 in W08
- **And** actual PO placed for 35 units in the target order week
- **When** user views W08 in audit table
- **Then** sales coverage status shows "⚠ Partially Covered"
- **And** uncovered_qty shows 20
- **And** tooltip shows "需求 55 件,已下单 35 件,缺口 20 件"

### AC-2: Order Detail Expansion
- **Given** W06 has 2 POs (PO-2025-001: 500, PO-2025-002: 300)
- **When** user clicks [+] icon in Order column
- **Then** expandable row shows table with 2 PO records
- **And** each row shows PO number, ordered qty, delivered qty, pending qty, status
- **And** PO number is clickable link to PO detail page

### AC-3: Delivery Traceability
- **Given** PO-2025-001 has delivery DEL-2025-001 (500 units)
- **When** user expands factory ship details
- **Then** delivery record shows po_number = "PO-2025-001"
- **And** clicking delivery_number navigates to delivery detail page
- **And** delivery detail page has backlink to originating PO

### AC-4: No Double Counting
- **Given** PO-2025-001 ordered 500 units in W02
- **And** forward propagation expects arrival in W08
- **And** actual shipment arrived 500 units in W08
- **When** inventory calculation runs for W08
- **Then** arrival_effective = 500 (NOT 1000)
- **And** closing_stock increases by exactly 500

### AC-5: Cancellation Handling
- **Given** sales forecast 55 in W08 suggests order 55 in W02
- **And** actual order placed only 35 in W02
- **When** user views W02
- **Then** planned_order shows 55 (backward calc)
- **And** actual_order shows 35 (from PO)
- **And** order_effective shows 35 (actual takes precedence)
- **When** user views future weeks W03-W08
- **Then** planned_factory_ship/ship/arrival are based on 35, NOT 55
- **And** NO phantom 20 units appear in downstream weeks

### AC-6: Lineage Refresh
- **Given** new PO is created
- **When** lineage refresh function runs
- **Then** supply_chain_lineage table updates within 5 minutes
- **And** audit table reflects new PO in next page load
- **And** coverage status updates automatically

---

## 9. Technical Constraints

### 9.1 Performance Requirements

| Operation | Max Response Time | Notes |
|-----------|------------------|-------|
| Initial table load | <2 seconds | Without expansion |
| Expand detail row | <500ms | Query should use indexed lookups |
| Lineage refresh (1 SKU) | <10 seconds | Background job acceptable |
| Lineage refresh (all SKUs) | <5 minutes | Scheduled nightly at 2 AM |

### 9.2 Data Volume Assumptions

| Entity | Volume | Growth Rate |
|--------|--------|-------------|
| SKUs | 500 | +10/month |
| POs per month | 200 | +5% YoY |
| Deliveries per month | 500 | +5% YoY |
| Shipments per month | 100 | +5% YoY |
| Lineage records | 50,000 | +20% YoY |

**Indexing Strategy:**
- All date fields must have B-tree indexes
- All foreign keys must have indexes
- Consider partial indexes for active records only

---

## 10. Dependencies & Risks

### 10.1 Technical Dependencies

| Dependency | Version | Risk Level | Mitigation |
|------------|---------|------------|------------|
| PostgreSQL | 15+ | Low | Use Supabase managed DB |
| date-fns | 3.0+ | Low | Stable library |
| Supabase Realtime | Latest | Medium | Fallback to polling |
| Server Components | Next.js 15+ | Low | Use SSR patterns |

### 10.2 Data Dependencies

| Dependency | Owner | Risk Level | Mitigation |
|------------|-------|------------|------------|
| Historical PO data completeness | Procurement team | High | Implement data backfill script |
| Shipment tracking updates | Logistics team | Medium | Add manual override UI |
| Sales forecast accuracy | Planning team | Medium | Show confidence intervals |
| Inventory snapshot freshness | Warehouse team | High | Auto-refresh every 4 hours |

### 10.3 Known Risks

**Risk R-1: Historical Data Gaps**
- **Impact:** Cannot establish full lineage for orders placed before system launch
- **Probability:** High (90%)
- **Mitigation:** Mark pre-system records with flag "legacy_data = true", exclude from coverage calculations

**Risk R-2: Multi-PO Consolidation**
- **Impact:** One shipment may contain items from multiple POs
- **Probability:** Medium (40%)
- **Mitigation:** Allow M:N relationship in shipment_items table with po_id column

**Risk R-3: Performance Degradation**
- **Impact:** Complex JOIN queries may slow down as data grows
- **Probability:** Medium (50%)
- **Mitigation:** Use materialized table, index aggressively, implement pagination

---

## 11. Out of Scope (V4.0)

The following features are **explicitly excluded** from V4.0:

1. Automated alerts when coverage drops below threshold
2. Predictive analytics for delivery delays
3. Integration with supplier portals for real-time order status
4. Mobile app support for field teams
5. Multi-currency cost tracking in lineage
6. Quality inspection results in delivery details
7. Returns and damaged goods handling
8. Cross-dock and direct-ship scenarios

These may be considered for V4.1+ based on V4.0 adoption metrics.

---

## 12. Implementation Phases

### Phase 1: Data Model & Backend (Week 1-2)
- Create supply_chain_lineage table
- Implement refresh function
- Create TypeScript types
- Write lineage query function
- Unit tests for business rules

### Phase 2: UI Enhancement (Week 3)
- Add coverage status column
- Implement expandable row details
- Add traceability links
- Update table to 25 columns

### Phase 3: Validation & Polish (Week 4)
- Implement consistency checks
- Add data quality alerts
- Performance optimization
- User acceptance testing

### Phase 4: Documentation & Rollout (Week 5)
- User guide with screenshots
- Admin guide for lineage refresh
- Training session for supply chain team
- Gradual rollout to 10 SKUs → 50 SKUs → all SKUs

---

## 13. Approval & Sign-off

**Required Approvals:**

| Role | Name | Approval Criteria | Status |
|------|------|------------------|--------|
| Product Manager | [Name] | Business logic alignment | Pending |
| Engineering Lead | [Name] | Technical feasibility | Pending |
| Supply Chain Director | [Name] | Solves actual pain points | Pending |
| Data Governance Officer | [Name] | Audit compliance | Pending |
| CTO | [Name] | Strategic alignment | Pending |

**Next Step:** Proceed to System Architect for technical design (`specs/algorithm-audit-v4/design.md`)

---

## End of Requirements Document

**Version:** 1.0
**Last Updated:** 2025-12-05
**Author:** Product Director (AI Agent)
**Reviewers:** [To be assigned]
