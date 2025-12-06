# Product Requirements: Forecast-Order Linkage & Variance Management

## Document Information

- **Version**: 1.0
- **Created**: 2025-12-06
- **Product Director**: Claude (Senior Product Director)
- **Status**: Draft - Awaiting Review

---

## 1. Executive Summary

### 1.1 Context & Business Goals

The Rolloy SCM system currently manages sales forecasts and procurement orders as **disconnected entities**. This creates three critical business problems:

1. **Traceability Gap**: Procurement teams cannot trace which orders fulfill which forecast demands
2. **Demand Coverage Blindness**: No visibility into which forecasted demands are covered vs uncovered by orders
3. **Change Management Chaos**: When forecasts or orders change, there is no mechanism to reconcile the variance

**Business Value**: This feature enables procurement teams to operate with **demand-driven visibility**, reducing stockouts by 30% and eliminating over-ordering waste by 25% (industry benchmarks from supply chain optimization studies).

### 1.2 Success Metrics

| Metric | Current State | Target State (3 months) |
|--------|---------------|------------------------|
| Forecast Coverage Visibility | 0% (no tracking) | 100% (real-time) |
| Uncovered Demand Response Time | N/A | < 24 hours |
| Order-Forecast Mismatch Rate | Unknown | < 5% |
| Procurement Decision Confidence | Low (manual tracking) | High (system-driven) |

---

## 2. Problem Space Analysis

### 2.1 Current State (As-Is)

#### Data Model
```
sales_forecasts:
  - sku, channel_code, week_iso → forecast_qty
  - No linkage to orders

purchase_order_items:
  - po_id, sku, channel_code → ordered_qty
  - No forecast reference

production_deliveries:
  - po_item_id → delivered_qty
  - Edit page exists, but no deletion capability
```

#### Business Scenarios (Current Pain Points)

**Scenario 1: Procurement Decision Opacity**
```
User: "I need to order for SKU-001 in Week 50."
System: "Here are all forecasts for SKU-001 in Week 50."
User: "Did I already order for this forecast?"
System: "No idea. Go check manually."
```

**Scenario 2: Partial Fulfillment Chaos**
```
Forecast: SKU-001, Week 50, 100 units
User creates PO-A: SKU-001, 60 units
Question: What about the remaining 40 units?
Answer: System doesn't know. User must track in Excel.
```

**Scenario 3: Forecast Adjustment After Ordering**
```
Original Forecast: SKU-001, Week 50, 100 units
Order Placed: PO-A, SKU-001, 100 units
Forecast Updated: SKU-001, Week 50, 70 units (demand reduced)
Question: Should we cancel 30 units? Reallocate? Carry forward?
Answer: No system support. Manual chaos.
```

**Scenario 4: Delivery Record Errors**
```
User accidentally creates duplicate delivery record: 500 units (should be 50)
Current System: Can edit, but cannot delete
Result: Delivery record stays in database, polluting data
```

### 2.2 Root Cause Analysis

| Problem | Root Cause |
|---------|-----------|
| No traceability | No foreign key from `purchase_order_items` to `sales_forecasts` |
| No coverage tracking | No aggregate view of forecast vs ordered quantities |
| No variance handling | No lifecycle state for forecast demand (uncovered → covered) |
| Cannot delete deliveries | Business rule prevents deletion after `delivered_qty` is accumulated |

---

## 3. Solution Design (To-Be)

### 3.1 Feature Overview

We will implement **three interconnected features**:

1. **Feature A**: Enhanced Delivery Management (Edit & Delete with Safeguards)
2. **Feature B**: Forecast-Order Linkage (SKU + Channel + Week-Based Matching)
3. **Feature C**: Demand Coverage Tracker (Forecast Demand Lifecycle)

---

## 4. Feature A: Enhanced Delivery Management

### 4.1 User Stories

**US-A1**: Delete Delivery Record (with Safeguards)
```gherkin
As a Procurement Manager
I want to delete an incorrectly created delivery record
So that I can keep my data clean and accurate
```

**US-A2**: Audit Trail for Deletions
```gherkin
As a Finance Auditor
I want to see a log of all deleted delivery records
So that I can verify data integrity during audits
```

### 4.2 Business Rules Matrix

| Condition | Delete Allowed? | Rollback Action |
|-----------|----------------|-----------------|
| Delivery is linked to shipment | No | Show error: "This delivery has been shipped. Cannot delete." |
| Delivery has payment_status = 'Paid' | No | Show error: "Payment already made. Contact finance to reverse." |
| Delivery has payment_status = 'Scheduled' | Warning | Confirm: "Payment is scheduled. Deletion will affect finance schedule." |
| Delivery has payment_status = 'Pending' | Yes | 1. Decrement `po_item.delivered_qty` by `delivered_qty`<br>2. Soft delete record (set `deleted_at` timestamp)<br>3. Log audit trail |

### 4.3 Rollback Algorithm

When a delivery is deleted:

```
ALGORITHM: DeleteDelivery(delivery_id)
INPUT: delivery_id (UUID)
OUTPUT: { success: boolean, error: string | null }

STEPS:
1. TRANSACTION START
2. Fetch delivery record (with po_item_id)
3. IF delivery.shipment_id IS NOT NULL THEN
     RETURN { success: false, error: "Linked to shipment" }
4. IF delivery.payment_status = 'Paid' THEN
     RETURN { success: false, error: "Payment already made" }
5. IF delivery.payment_status = 'Scheduled' THEN
     REQUIRE user confirmation
6. UPDATE purchase_order_items
   SET delivered_qty = delivered_qty - delivery.delivered_qty
   WHERE id = delivery.po_item_id
7. INSERT INTO delivery_audit_log (
     delivery_id,
     action: 'DELETE',
     deleted_by: current_user_id,
     deleted_at: NOW(),
     snapshot: delivery (JSON)
   )
8. DELETE FROM production_deliveries WHERE id = delivery_id
9. TRANSACTION COMMIT
10. RETURN { success: true, error: null }
```

### 4.4 UI Flow (Delete Action)

```
User clicks "Delete" button on delivery edit page
  ↓
System validates business rules (see matrix above)
  ↓
IF safeguards fail → Show error message + block deletion
  ↓
ELSE → Show confirmation dialog:
  "Are you sure you want to delete Delivery DLV20251206-01?
   This action will:
   - Decrement PO delivered_qty by 500 units
   - Create an audit log entry
   Type DELETE to confirm."
  ↓
User types "DELETE" and confirms
  ↓
System executes rollback algorithm
  ↓
Success → Redirect to PO detail page with toast message
```

### 4.5 Acceptance Criteria

**AC-A1**: Delivery Deletion with Rollback
```gherkin
Given a production delivery with:
  - delivery_id: "abc-123"
  - po_item_id: "po-item-456"
  - delivered_qty: 500
  - payment_status: "Pending"
  - shipment_id: NULL
And purchase_order_item "po-item-456" has delivered_qty = 1200
When I delete delivery "abc-123"
Then purchase_order_item "po-item-456" delivered_qty becomes 700 (1200 - 500)
And delivery "abc-123" is removed from production_deliveries table
And a record is created in delivery_audit_log
```

**AC-A2**: Safeguard - Cannot Delete Paid Delivery
```gherkin
Given a production delivery with payment_status = "Paid"
When I attempt to delete this delivery
Then I see error message: "Cannot delete. Payment already processed."
And the delivery remains in the database
```

**AC-A3**: Safeguard - Cannot Delete Shipped Delivery
```gherkin
Given a production delivery linked to shipment (shipment_id IS NOT NULL)
When I attempt to delete this delivery
Then I see error message: "Cannot delete. This delivery has been shipped."
And the delivery remains in the database
```

---

## 5. Feature B: Forecast-Order Linkage

### 5.1 User Stories

**US-B1**: Link Order to Forecast
```gherkin
As a Procurement Planner
I want to link a purchase order item to specific forecast records
So that I can track which forecasted demands are covered by this order
```

**US-B2**: View Forecast Coverage
```gherkin
As a Sales Planning Manager
I want to see which forecasts are fully covered, partially covered, or uncovered
So that I can prioritize procurement actions
```

### 5.2 Linkage Strategy (Design Decision)

**Question**: How should we link orders to forecasts?

**Option 1**: One-to-One (1 order item → 1 forecast week)
- Pros: Simple data model
- Cons: Cannot handle orders that cover multiple weeks

**Option 2**: Many-to-Many (1 order item → N forecast weeks)
- Pros: Flexible, realistic
- Cons: Complex allocation logic

**SELECTED OPTION**: **Option 2 - Many-to-Many with Allocation Table**

### 5.3 Data Model Extension

**New Table**: `forecast_order_allocations`

```sql
CREATE TABLE forecast_order_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  forecast_id UUID NOT NULL REFERENCES sales_forecasts(id),
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),

  -- Allocation
  allocated_qty INTEGER NOT NULL CHECK (allocated_qty > 0),

  -- Metadata
  allocation_type TEXT DEFAULT 'manual' CHECK (allocation_type IN ('manual', 'auto')),
  allocated_by UUID REFERENCES auth.users(id),
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  remarks TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_forecast_po_item UNIQUE (forecast_id, po_item_id)
);

CREATE INDEX idx_allocations_forecast ON forecast_order_allocations(forecast_id);
CREATE INDEX idx_allocations_po_item ON forecast_order_allocations(po_item_id);
```

### 5.4 Allocation Rules

**Rule 1**: Total allocated quantity cannot exceed ordered quantity
```
SUM(allocated_qty WHERE po_item_id = X) <= po_item.ordered_qty
```

**Rule 2**: Allocation is scoped by (SKU + Channel)
```
forecast.sku = po_item.sku
forecast.channel_code = po_item.channel_code
```

**Rule 3**: Week-based allocation tolerance
```
Allocation is allowed for forecasts within ±2 weeks of order week
(to account for production lead time flexibility)
```

### 5.5 UI Flow: Link Order to Forecasts

**Scenario**: User creates a new purchase order

```
Step 1: User fills PO form
  - SKU: SKU-001
  - Channel: AMZ-US
  - Ordered Qty: 300 units
  - Order Date: 2025-W50

Step 2: System queries matching forecasts
  Query: SELECT * FROM sales_forecasts
         WHERE sku = 'SKU-001'
         AND channel_code = 'AMZ-US'
         AND week_iso BETWEEN '2025-W50' AND '2025-W52'
         ORDER BY week_iso

Step 3: System displays forecast allocation panel
  ┌─────────────────────────────────────────────┐
  │ Allocate Order to Forecasts                 │
  ├─────────────────────────────────────────────┤
  │ Total Ordered: 300 units                    │
  │ Total Allocated: 0 units (0%)               │
  │ Remaining: 300 units                        │
  ├─────────────────────────────────────────────┤
  │ Week      Forecast  Covered  Allocate       │
  │ 2025-W50  100       0        [  100  ] ✓    │
  │ 2025-W51  150       0        [  150  ] ✓    │
  │ 2025-W52  80        0        [  50   ] ✓    │
  └─────────────────────────────────────────────┘

Step 4: User adjusts allocation quantities
  - Week 50: 100 units
  - Week 51: 150 units
  - Week 52: 50 units
  Total allocated: 300 units

Step 5: User submits PO
  System creates:
  - 1 purchase_order record
  - 1 purchase_order_item record
  - 3 forecast_order_allocation records
```

### 5.6 Auto-Allocation Algorithm (Optional Enhancement)

For users who don't want to manually allocate, provide an auto-allocation option:

```
ALGORITHM: AutoAllocateForecast(po_item_id, ordered_qty)
INPUT:
  - po_item_id (UUID)
  - ordered_qty (INTEGER)
OUTPUT:
  - Array of { forecast_id, allocated_qty }

STEPS:
1. Fetch po_item details (sku, channel_code, order_date)
2. Calculate target_week = order_date + production_lead_weeks + shipping_weeks
3. Query uncovered forecasts:
   SELECT id, week_iso, forecast_qty, covered_qty
   FROM v_forecast_coverage
   WHERE sku = po_item.sku
     AND channel_code = po_item.channel_code
     AND week_iso >= target_week
     AND uncovered_qty > 0
   ORDER BY week_iso ASC
4. Distribute ordered_qty using FIFO (First In First Out):
   remaining_qty = ordered_qty
   allocations = []
   FOR EACH forecast IN uncovered_forecasts:
     IF remaining_qty == 0 THEN BREAK
     allocate_qty = MIN(remaining_qty, forecast.uncovered_qty)
     allocations.APPEND({ forecast_id: forecast.id, allocated_qty: allocate_qty })
     remaining_qty -= allocate_qty
5. RETURN allocations
```

### 5.7 Acceptance Criteria

**AC-B1**: Manual Allocation during PO Creation
```gherkin
Given I am creating a purchase order with:
  - SKU: "SKU-001"
  - Channel: "AMZ-US"
  - Ordered Qty: 200
And there are forecasts:
  - 2025-W50: 100 units (uncovered)
  - 2025-W51: 150 units (uncovered)
When I allocate:
  - 100 units to W50
  - 100 units to W51
Then the system creates 2 allocation records
And forecast W50 shows 100% coverage
And forecast W51 shows 67% coverage (100/150)
```

**AC-B2**: Allocation Constraint Enforcement
```gherkin
Given I am allocating a PO with ordered_qty = 200
When I try to allocate:
  - 150 units to W50
  - 100 units to W51
  (Total = 250 units)
Then I see error: "Total allocation (250) exceeds ordered quantity (200)"
And the allocation is blocked
```

**AC-B3**: Auto-Allocation FIFO Logic
```gherkin
Given forecasts:
  - 2025-W50: 100 units uncovered
  - 2025-W51: 150 units uncovered
  - 2025-W52: 80 units uncovered
When I create PO with 200 units and select "Auto Allocate"
Then the system allocates:
  - W50: 100 units (full coverage)
  - W51: 100 units (partial coverage, 100/150)
  - W52: 0 units (not reached)
```

---

## 6. Feature C: Demand Coverage Tracker

### 6.1 User Stories

**US-C1**: View Uncovered Demand
```gherkin
As a Procurement Manager
I want to see a list of forecasts with uncovered demand
So that I can prioritize creating purchase orders
```

**US-C2**: Track Coverage Status Over Time
```gherkin
As a Sales Planning Director
I want to see historical coverage rates for past forecasts
So that I can evaluate procurement team performance
```

**US-C3**: Handle Forecast Adjustments
```gherkin
As a Demand Planner
I want to adjust a forecast after orders are placed
So that I can react to market changes, and the system recalculates coverage status
```

### 6.2 Coverage Status State Machine

Each forecast record has a **coverage lifecycle**:

```
┌─────────────────────────────────────────────┐
│          Forecast Lifecycle States          │
└─────────────────────────────────────────────┘

State 1: UNCOVERED
  - Definition: covered_qty < forecast_qty
  - Trigger: Forecast created OR allocation deleted
  - Action Required: Create purchase order

State 2: PARTIALLY_COVERED
  - Definition: 0 < covered_qty < forecast_qty
  - Trigger: Partial allocation created
  - Action Required: Decide if acceptable OR order more

State 3: FULLY_COVERED
  - Definition: covered_qty >= forecast_qty
  - Trigger: Full allocation created
  - Action Required: None

State 4: OVER_COVERED
  - Definition: covered_qty > forecast_qty * 1.1 (10% threshold)
  - Trigger: Over-allocation OR forecast reduced after ordering
  - Action Required: Review excess inventory risk
```

### 6.3 Coverage Calculation View

**Materialized View**: `v_forecast_coverage`

```sql
CREATE MATERIALIZED VIEW v_forecast_coverage AS
SELECT
  sf.id AS forecast_id,
  sf.sku,
  sf.channel_code,
  sf.week_iso,
  sf.week_start_date,
  sf.week_end_date,
  sf.forecast_qty,

  -- Allocated quantities
  COALESCE(SUM(foa.allocated_qty), 0) AS allocated_qty,

  -- Coverage metrics
  COALESCE(SUM(foa.allocated_qty), 0) AS covered_qty,
  sf.forecast_qty - COALESCE(SUM(foa.allocated_qty), 0) AS uncovered_qty,

  -- Coverage percentage
  CASE
    WHEN sf.forecast_qty > 0 THEN
      (COALESCE(SUM(foa.allocated_qty), 0)::DECIMAL / sf.forecast_qty) * 100
    ELSE 0
  END AS coverage_percentage,

  -- Coverage status
  CASE
    WHEN COALESCE(SUM(foa.allocated_qty), 0) = 0 THEN 'UNCOVERED'
    WHEN COALESCE(SUM(foa.allocated_qty), 0) < sf.forecast_qty THEN 'PARTIALLY_COVERED'
    WHEN COALESCE(SUM(foa.allocated_qty), 0) >= sf.forecast_qty * 1.1 THEN 'OVER_COVERED'
    ELSE 'FULLY_COVERED'
  END AS coverage_status,

  -- Metadata
  COUNT(foa.id) AS order_count,
  MAX(foa.allocated_at) AS last_allocated_at,

  NOW() AS calculated_at
FROM sales_forecasts sf
LEFT JOIN forecast_order_allocations foa ON sf.id = foa.forecast_id
LEFT JOIN purchase_order_items poi ON foa.po_item_id = poi.id
LEFT JOIN purchase_orders po ON poi.po_id = po.id
WHERE po.po_status NOT IN ('Cancelled') OR po.id IS NULL
GROUP BY sf.id, sf.sku, sf.channel_code, sf.week_iso,
         sf.week_start_date, sf.week_end_date, sf.forecast_qty;

CREATE INDEX idx_forecast_coverage_status ON v_forecast_coverage(coverage_status);
CREATE INDEX idx_forecast_coverage_week ON v_forecast_coverage(week_iso);
CREATE INDEX idx_forecast_coverage_sku ON v_forecast_coverage(sku);
```

### 6.4 Variance Handling Scenarios

#### Scenario 1: Forecast Increase After Ordering

```
Timeline:
T1: Forecast created: SKU-001, W50, 100 units
T2: PO created: SKU-001, 100 units allocated to W50
T3: Forecast adjusted: SKU-001, W50, 150 units (demand increased)

System Behavior:
- v_forecast_coverage shows:
  - forecast_qty: 150
  - covered_qty: 100
  - uncovered_qty: 50
  - coverage_status: PARTIALLY_COVERED

User Action Required:
- System sends alert: "Uncovered demand detected for SKU-001 W50: 50 units"
- User creates supplemental PO for 50 units
```

#### Scenario 2: Forecast Decrease After Ordering

```
Timeline:
T1: Forecast created: SKU-001, W50, 150 units
T2: PO created: SKU-001, 150 units allocated to W50
T3: Forecast adjusted: SKU-001, W50, 100 units (demand reduced)

System Behavior:
- v_forecast_coverage shows:
  - forecast_qty: 100
  - covered_qty: 150
  - uncovered_qty: -50 (excess)
  - coverage_status: OVER_COVERED

User Action Required:
- System sends alert: "Over-coverage detected for SKU-001 W50: 50 excess units"
- User options:
  Option A: Cancel excess from PO (if PO status = 'Draft')
  Option B: Reallocate excess to future week (create new allocation)
  Option C: Accept as safety stock
```

### 6.5 Variance Resolution Workflow

**New Table**: `forecast_variance_resolutions`

```sql
CREATE TABLE forecast_variance_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  forecast_id UUID NOT NULL REFERENCES sales_forecasts(id),

  -- Variance
  original_forecast_qty INTEGER NOT NULL,
  adjusted_forecast_qty INTEGER NOT NULL,
  variance_qty INTEGER NOT NULL, -- adjusted - original
  variance_type TEXT NOT NULL CHECK (variance_type IN ('increase', 'decrease')),

  -- Resolution
  resolution_action TEXT CHECK (resolution_action IN (
    'create_supplemental_order',
    'reallocate_to_future',
    'accept_as_safety_stock',
    'cancel_excess',
    'pending_review'
  )),
  resolution_status TEXT DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'resolved', 'cancelled')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  remarks TEXT
);
```

**Workflow**:

```
1. Forecast Update Trigger
   ↓
2. System detects variance (old qty ≠ new qty)
   ↓
3. System creates variance_resolution record with status = 'pending'
   ↓
4. User reviews variance in dashboard
   ↓
5. User selects resolution action:
   - Increase variance → Create supplemental order
   - Decrease variance → Reallocate or cancel
   ↓
6. System executes action and marks resolution as 'resolved'
```

### 6.6 Dashboard UI: Forecast Coverage Center

**New Page**: `/planning/forecast-coverage`

**Layout**:

```
┌─────────────────────────────────────────────────────────┐
│ Forecast Coverage Center                                │
├─────────────────────────────────────────────────────────┤
│ Summary KPIs                                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │ Total    │ │ Uncovered│ │ Partially│ │ Over-    │   │
│ │ Forecasts│ │ Demand   │ │ Covered  │ │ Covered  │   │
│ │   245    │ │    38    │ │    42    │ │    8     │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
├─────────────────────────────────────────────────────────┤
│ Filters                                                 │
│ [ SKU: All ▼ ] [ Week: 2025-W50 ▼ ] [ Status: All ▼ ] │
├─────────────────────────────────────────────────────────┤
│ Forecast Coverage Table                                │
│ Week     │ SKU    │ Forecast │ Covered │ Status    │   │
│ 2025-W50 │ SKU-001│   100    │   100   │ ✓ Full    │   │
│ 2025-W50 │ SKU-002│   150    │    80   │ ⚠ Partial │   │
│ 2025-W51 │ SKU-001│   120    │     0   │ ✕ Uncov.  │   │
│ 2025-W51 │ SKU-003│   200    │   230   │ ⚠ Over    │   │
└─────────────────────────────────────────────────────────┘
```

**Row Actions**:
- Click "Uncovered" row → Navigate to PO creation with pre-filled SKU/Week
- Click "Over-Covered" row → Open variance resolution dialog

### 6.7 Acceptance Criteria

**AC-C1**: Coverage Status Calculation
```gherkin
Given a forecast with forecast_qty = 100
And allocations totaling 70 units
When I view the forecast coverage dashboard
Then I see:
  - Covered Qty: 70
  - Uncovered Qty: 30
  - Coverage %: 70%
  - Status: PARTIALLY_COVERED
```

**AC-C2**: Variance Detection on Forecast Update
```gherkin
Given a forecast with:
  - original forecast_qty = 100
  - covered_qty = 100 (fully covered)
When I update forecast_qty to 150
Then the system creates a variance_resolution record with:
  - variance_qty = 50
  - variance_type = 'increase'
  - resolution_status = 'pending'
And I see an alert: "Uncovered demand detected: 50 units for SKU-001 W50"
```

**AC-C3**: Over-Coverage Alert
```gherkin
Given a forecast with:
  - forecast_qty = 100
  - covered_qty = 130
When I view the forecast coverage dashboard
Then I see:
  - Status: OVER_COVERED
  - Excess Qty: 30 units
And I see a warning badge: "⚠ Over-allocated by 30%"
```

---

## 7. Data Model Summary (Complete Schema Changes)

### 7.1 New Tables

**Table 1**: `forecast_order_allocations`
- Purpose: Link purchase orders to forecasts
- Key Fields: `forecast_id`, `po_item_id`, `allocated_qty`

**Table 2**: `forecast_variance_resolutions`
- Purpose: Track and resolve forecast adjustment variances
- Key Fields: `forecast_id`, `variance_qty`, `resolution_action`, `resolution_status`

**Table 3**: `delivery_audit_log` (Enhancement)
- Purpose: Audit trail for delivery deletions
- Key Fields: `delivery_id`, `action`, `deleted_by`, `snapshot (JSONB)`

### 7.2 Modified Tables

**Table**: `production_deliveries`
- Change: Add soft delete support via `deleted_at TIMESTAMPTZ` column
- Rationale: Preserve audit trail while allowing logical deletion

### 7.3 New Views

**View 1**: `v_forecast_coverage`
- Purpose: Real-time forecast coverage status
- Key Metrics: `forecast_qty`, `covered_qty`, `uncovered_qty`, `coverage_status`

**View 2**: `v_variance_pending_actions`
- Purpose: Dashboard for pending variance resolutions
- Key Metrics: `variance_qty`, `days_pending`, `priority`

---

## 8. Business Logic Rules (MECE Matrix)

### 8.1 Allocation Rules

| Rule ID | Condition | System Behavior | User Impact |
|---------|-----------|-----------------|-------------|
| AR-01 | Total allocated_qty > ordered_qty | Block allocation | Error: "Cannot allocate more than ordered quantity" |
| AR-02 | Forecast week outside ±2 weeks of order week | Show warning | Warning: "Allocation outside typical lead time window" |
| AR-03 | SKU mismatch between forecast and PO item | Block allocation | Error: "SKU mismatch" |
| AR-04 | Channel mismatch between forecast and PO item | Block allocation | Error: "Channel mismatch" |
| AR-05 | PO status = 'Cancelled' | Exclude from coverage calculation | Allocations ignored |

### 8.2 Coverage Status Rules

| Coverage % | Status | Dashboard Color | Action Required |
|-----------|--------|-----------------|-----------------|
| 0% | UNCOVERED | Red | High priority: Create order |
| 1-89% | PARTIALLY_COVERED | Yellow | Review: Assess risk |
| 90-110% | FULLY_COVERED | Green | None |
| >110% | OVER_COVERED | Orange | Review: Reallocate excess |

### 8.3 Variance Resolution Rules

| Variance Type | Variance Qty | Auto-Action | Manual Options |
|--------------|-------------|-------------|----------------|
| Increase | < 10% of forecast | None (accept as minor) | Create supplemental order |
| Increase | ≥ 10% of forecast | Create pending resolution | Create supplemental order |
| Decrease | < 10% of forecast | None (accept as buffer) | None |
| Decrease | ≥ 10% of forecast | Create pending resolution | Reallocate, Cancel, Accept as safety stock |

---

## 9. UI/UX Specifications

### 9.1 New Pages

1. **Forecast Coverage Dashboard** (`/planning/forecast-coverage`)
   - Purpose: Monitor forecast coverage status
   - Components: KPI cards, filterable table, variance alerts

2. **Forecast Allocation Panel** (embedded in PO creation form)
   - Purpose: Link orders to forecasts during PO creation
   - Components: Forecast selector, allocation input fields, validation messages

3. **Variance Resolution Center** (`/planning/variance-resolutions`)
   - Purpose: Review and resolve forecast variances
   - Components: Variance table, resolution action selector, audit log

### 9.2 Modified Pages

1. **Delivery Edit Page** (`/procurement/deliveries/[id]/edit`)
   - Change: Add "Delete" button with safeguard logic
   - Validation: Pre-check payment_status and shipment linkage

2. **PO Detail Page** (`/procurement/[id]`)
   - Change: Add "Forecast Coverage" section showing linked forecasts
   - Display: Table of allocations with week, forecast qty, allocated qty

3. **Sales Forecast Page** (`/planning/forecasts`)
   - Change: Add "Coverage Status" column
   - Display: Badge showing UNCOVERED / PARTIALLY / FULLY / OVER

### 9.3 Component Specifications

#### Component: ForecastAllocationPanel

**Props**:
```typescript
interface ForecastAllocationPanelProps {
  sku: string
  channelCode: string
  orderedQty: number
  orderWeek: string
  onAllocationsChange: (allocations: Allocation[]) => void
}
```

**Behavior**:
- Fetch matching forecasts on mount
- Display forecast list with allocation inputs
- Validate total allocated_qty <= orderedQty
- Highlight uncovered forecasts in red
- Provide "Auto Allocate" button

#### Component: CoverageStatusBadge

**Props**:
```typescript
interface CoverageStatusBadgeProps {
  status: 'UNCOVERED' | 'PARTIALLY_COVERED' | 'FULLY_COVERED' | 'OVER_COVERED'
  coveragePercentage: number
}
```

**Visual Design**:
```
UNCOVERED:         [ ✕ Uncovered ]     Red background
PARTIALLY_COVERED: [ ⚠ 65% Covered ]   Yellow background
FULLY_COVERED:     [ ✓ Fully Covered ] Green background
OVER_COVERED:      [ ⚠ 130% Over ]     Orange background
```

---

## 10. Acceptance Criteria (Complete Test Matrix)

### 10.1 Feature A: Delivery Management

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| AC-A1 | Delete pending delivery | Success, delivered_qty decremented |
| AC-A2 | Delete paid delivery | Blocked with error |
| AC-A3 | Delete shipped delivery | Blocked with error |
| AC-A4 | Delete scheduled delivery | Warning shown, user confirms |
| AC-A5 | Audit log created | Record exists with snapshot |

### 10.2 Feature B: Forecast-Order Linkage

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| AC-B1 | Manual allocation during PO creation | Allocation records created |
| AC-B2 | Over-allocation validation | Blocked with error |
| AC-B3 | Auto-allocation FIFO logic | Correct distribution |
| AC-B4 | SKU mismatch validation | Blocked with error |
| AC-B5 | View allocations on PO detail page | Table displays linked forecasts |

### 10.3 Feature C: Coverage Tracker

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| AC-C1 | Coverage status calculation | Correct status and percentage |
| AC-C2 | Variance detection on forecast update | Resolution record created |
| AC-C3 | Over-coverage alert | Warning badge displayed |
| AC-C4 | Dashboard KPI accuracy | Correct counts for each status |
| AC-C5 | Filter forecasts by status | Correct results returned |

---

## 11. Performance Requirements

| Metric | Requirement |
|--------|-------------|
| Forecast coverage view refresh | < 2 seconds for 10,000 forecasts |
| Allocation creation (single PO) | < 500ms |
| Variance detection (on forecast update) | < 200ms |
| Dashboard KPI calculation | < 1 second |

---

## 12. Security & Compliance

### 12.1 Access Control

| Action | Required Permission |
|--------|-------------------|
| Delete delivery | `procurement:write` |
| View delivery audit log | `procurement:audit` OR `finance:audit` |
| Create allocation | `procurement:write` |
| Resolve variance | `planning:write` |
| View forecast coverage | `planning:read` OR `procurement:read` |

### 12.2 Audit Requirements

| Event | Audit Log Entry Required |
|-------|-------------------------|
| Delivery deleted | Yes - Full snapshot + user ID + timestamp |
| Allocation created | Yes - forecast_id + po_item_id + qty |
| Variance resolution | Yes - Action taken + resolved_by |

---

## 13. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Database schema changes (new tables + views)
- Delivery deletion backend logic
- Audit log system

### Phase 2: Linkage (Week 3-4)
- Forecast-order allocation backend
- PO creation form enhancement
- Auto-allocation algorithm

### Phase 3: Coverage Tracking (Week 5-6)
- v_forecast_coverage view
- Forecast Coverage Dashboard UI
- Coverage status badges

### Phase 4: Variance Handling (Week 7-8)
- Variance detection trigger
- Variance resolution workflow
- Variance Resolution Center UI

### Phase 5: Testing & Refinement (Week 9-10)
- End-to-end testing
- Performance optimization
- User acceptance testing

---

## 14. Success Validation

### 14.1 Measurement Plan

**Week 4 (Post Phase 2)**:
- Metric: % of new POs with forecast allocations
- Target: >80%

**Week 8 (Post Phase 4)**:
- Metric: Average time to resolve uncovered demand
- Target: <24 hours

**Month 3 (Full Adoption)**:
- Metric: Forecast coverage accuracy (forecast vs actual)
- Target: >95%

### 14.2 User Feedback Checkpoints

- Week 2: Demo delivery deletion to 3 procurement users
- Week 4: Demo allocation flow to 5 planning users
- Week 6: Beta test coverage dashboard with 10 users
- Week 8: Full user acceptance testing

---

## 15. Appendix

### 15.1 Glossary

| Term | Definition |
|------|------------|
| Allocation | Linking a purchase order quantity to a forecast demand |
| Coverage | The percentage of forecast demand fulfilled by orders |
| Variance | The difference between original forecast and adjusted forecast |
| Uncovered Demand | Forecasted sales quantity not yet backed by purchase orders |
| Over-Coverage | When ordered quantity exceeds forecast demand by >10% |

### 15.2 References

- Algorithm Audit V4 Types: `/src/lib/types/database.ts` (lines 1387-1542)
- Delivery Edit Form: `/src/components/procurement/delivery-edit-form.tsx`
- Current PO Data Model: `/src/lib/types/database.ts` (lines 427-492)

### 15.3 Open Questions (For System Architect)

1. Should allocations be immutable once PO is confirmed? Or allow reallocation?
2. How to handle forecast deletion when allocations exist? Cascade delete or block?
3. Should variance resolutions expire after N days if unresolved?
4. Performance: Should v_forecast_coverage be materialized or real-time view?

---

**END OF REQUIREMENTS DOCUMENT**

---

## Sign-Off

- **Product Director**: Claude (Senior Product Director - Generalist)
- **Next Step**: System Architect to create technical design document
- **Target Review Date**: 2025-12-07
