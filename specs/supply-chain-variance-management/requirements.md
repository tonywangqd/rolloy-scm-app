# Supply Chain Full-Cycle Variance Management System
## Product Requirements Document (PRD)

**Version:** 1.0.0
**Author:** Product Director
**Date:** 2025-12-08
**Status:** Draft for Review

---

## Executive Summary

### Problem Statement

The current supply chain system lacks a comprehensive mechanism to track and manage quantity variances across the full procurement-to-delivery lifecycle. Critical gaps exist at three key transition points:

1. **Forecast → Order Variance**: Sales forecasts may not be fully covered by purchase orders
2. **Order → Factory Delivery Variance**: Ordered quantities may not be fully fulfilled by factory deliveries
3. **Factory Delivery → Shipment Variance**: Factory-delivered goods may remain unshipped (factory inventory)

These untracked variances create operational blind spots:
- Unshipped quantities lack planned dispatch dates
- Factory inventory has no visibility or future arrival projections
- Algorithm audit tables cannot accurately reflect future inventory states
- No structured workflow exists for variance resolution

### Business Value

**Primary Outcomes:**
- **Operational Transparency**: Full visibility into every unit from forecast to warehouse arrival
- **Proactive Planning**: Expected dates for all pending quantities
- **Accurate Projections**: Algorithm audit tables reflect realistic future inventory
- **Exception Management**: Structured workflows for handling shortfalls and delays

**Success Metrics:**
- 100% variance tracking coverage across all supply chain stages
- <24h time-to-resolution for critical variances
- 95%+ accuracy in future inventory projections
- Zero "lost" units in factory inventory

---

## Business Context

### Supply Chain Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPPLY CHAIN LIFECYCLE                            │
└─────────────────────────────────────────────────────────────────────┘

[Sales Forecast]                     Variance Type: FORECAST COVERAGE
       ↓                             Status: Tracked (existing system)
       ├─ Variance 1: Uncovered Demand
       └─ Coverage Status: See forecast_order_allocations
       ↓
[Purchase Order]                      Variance Type: ORDER FULFILLMENT
       ↓                             Status: MISSING - requires new system
       ├─ Variance 2: Undelivered Balance
       │  • Ordered: 50 units
       │  • Delivered: 45 units
       │  • Balance: 5 units → Need expected_delivery_date
       └─ Action Required: Set delivery plan
       ↓
[Factory Delivery]                    Variance Type: FACTORY INVENTORY
       ↓                             Status: MISSING - requires new system
       ├─ Variance 3: Unshipped Balance
       │  • Delivered: 45 units
       │  • Shipped: 40 units
       │  • Factory Stock: 5 units → Need expected_ship_date
       └─ Action Required: Set shipment plan
       ↓
[Logistics Shipment]                  Variance Type: N/A
       ↓                             Status: 1:1 mapping (no variance)
       └─ Shipped qty = Arrival qty (basic assumption)
       ↓
[Warehouse Arrival]
```

### Variance Definitions

| Variance Type | Calculation | Current State | Proposed Solution |
|---------------|-------------|---------------|-------------------|
| **Forecast Coverage** | `Forecast Qty - Allocated Order Qty` | ✅ Tracked via `forecast_order_allocations` | ⚠️ Enhance with visual indicators in UI |
| **Order Fulfillment** | `Ordered Qty - Delivered Qty` | ❌ Not tracked | 🆕 New `purchase_order_delivery_plans` table |
| **Factory Inventory** | `Delivered Qty - Shipped Qty` | ❌ Not tracked | 🆕 New `factory_inventory_shipment_plans` table |
| **Shipment Variance** | `Shipped Qty - Arrived Qty` | ⚠️ Out of scope | Future enhancement (damage/loss tracking) |

---

## User Stories

### Epic 1: Order Fulfillment Variance Management

**US-1.1: As a Procurement Manager, I want to see undelivered order balances so I can track pending factory shipments**

**Acceptance Criteria:**
```gherkin
Given a purchase order with ordered_qty = 50
And production_deliveries.sum(delivered_qty) = 45
When I view the PO detail page
Then I should see "Undelivered Balance: 5 units"
And I should see an actionable button "Plan Delivery"
```

**US-1.2: As a Procurement Manager, I want to set expected delivery dates for undelivered balances so the system reflects realistic future arrivals**

**Acceptance Criteria:**
```gherkin
Given an undelivered balance of 5 units
When I click "Plan Delivery"
And I set "Expected Delivery Week: 2025-W10"
And I submit the form
Then the system creates a delivery plan record
And the algorithm audit table shows +5 units in W10's "Planned Factory Ship" column
And the plan status is "Pending"
```

**US-1.3: As a Procurement Manager, I want to split undelivered balances into multiple planned deliveries**

**Acceptance Criteria:**
```gherkin
Given an undelivered balance of 10 units
When I create a delivery plan
And I split into "3 units on W09" and "7 units on W11"
Then the system creates 2 separate plan records
And each plan appears in the respective week's algorithm audit table
```

**US-1.4: As a System User, I want the system to auto-close delivery plans when actual deliveries fulfill them**

**Acceptance Criteria:**
```gherkin
Given a delivery plan for 5 units on W10
When a production_delivery record is created with 5+ units in W10
Then the system automatically marks the plan as "Fulfilled"
And removes the planned quantity from future projections
And replaces it with actual delivery data
```

---

### Epic 2: Factory Inventory Variance Management

**US-2.1: As a Logistics Coordinator, I want to see unshipped factory inventory so I can plan container loading**

**Acceptance Criteria:**
```gherkin
Given a production_delivery with delivered_qty = 45
And delivery_shipment_allocations.sum(shipped_qty) = 40
When I view the delivery detail page
Then I should see "Factory Inventory: 5 units"
And I should see a "Plan Shipment" button
```

**US-2.2: As a Logistics Coordinator, I want to set expected shipment dates for factory inventory**

**Acceptance Criteria:**
```gherkin
Given factory inventory of 5 units
When I click "Plan Shipment"
And I set "Expected Ship Week: 2025-W12"
Then the system creates a shipment plan record
And the algorithm audit table shows +5 units in W12's "Planned Ship" column
```

**US-2.3: As a System User, I want the system to auto-close shipment plans when actual shipments fulfill them**

**Acceptance Criteria:**
```gherkin
Given a shipment plan for 5 units on W12
When a shipment with delivery_shipment_allocation of 5+ units is created in W12
Then the system marks the plan as "Fulfilled"
And updates the algorithm audit table with actual data
```

---

### Epic 3: Algorithm Audit Integration

**US-3.1: As a Business Analyst, I want the algorithm audit table to display all planned quantities in their expected weeks**

**Acceptance Criteria:**
```gherkin
Given the following plans:
  | Type          | Qty | Expected Week |
  | Delivery Plan | 5   | 2025-W10      |
  | Shipment Plan | 3   | 2025-W12      |
When I view the algorithm audit table for the SKU
Then W10's "Planned Factory Ship" should include +5 units
And W12's "Planned Ship" should include +3 units
And hovering shows tooltip: "Includes 5 units from Delivery Plan #DP-001"
```

**US-3.2: As a Business Analyst, I want to distinguish between reverse-calculated planned quantities and manually set planned quantities**

**Acceptance Criteria:**
```gherkin
Given a week with planned_factory_ship = 10 units
Where 6 units are from reverse calculation (algorithm)
And 4 units are from manual delivery plans
When I hover over the "Planned Factory Ship" cell
Then the tooltip shows:
  "Total: 10 units
   - Reverse Calculated: 6 units (from sales demand)
   - Delivery Plans: 4 units (from DP-001, DP-002)"
```

---

### Epic 4: Variance Action Management

**US-4.1: As a Procurement Manager, I want to mark a variance as permanently canceled**

**Acceptance Criteria:**
```gherkin
Given an undelivered balance of 5 units
When I select "Cancel/Write-off" action
And I provide cancellation reason "Supplier production issue"
Then the plan status changes to "Cancelled"
And the quantity is removed from all future projections
And an audit log entry is created
```

**US-4.2: As a Procurement Manager, I want to add remarks to variances for team visibility**

**Acceptance Criteria:**
```gherkin
Given a delivery plan for 5 units
When I add remark "Waiting for raw material, expect 2-week delay"
Then the remark is visible in:
  - PO detail variance list
  - Algorithm audit table tooltip
  - Variance management dashboard
```

**US-4.3: As a Procurement Manager, I want to adjust planned dates if delays occur**

**Acceptance Criteria:**
```gherkin
Given a delivery plan with expected_week = "2025-W10"
And current status = "Pending"
When I edit and change to expected_week = "2025-W12"
Then the system creates an audit log entry
And the algorithm audit table reflects the new week
And previous week's projection is adjusted accordingly
```

---

## Data Model Specification

### New Table: `purchase_order_delivery_plans`

**Purpose:** Track expected delivery dates for undelivered order balances

**Schema:**
```typescript
interface PurchaseOrderDeliveryPlan {
  // Identity
  id: string                          // UUID primary key
  po_item_id: string                  // FK -> purchase_order_items.id

  // Quantity
  planned_qty: number                 // Quantity expected to be delivered

  // Timeline
  expected_delivery_week: string      // ISO week format "YYYY-WW"
  expected_delivery_date: string      // DATE (calculated from week start)

  // Status & Actions
  plan_status: DeliveryPlanStatus     // 'pending' | 'fulfilled' | 'cancelled' | 'overdue'
  fulfilled_qty: number               // Auto-calculated from actual deliveries
  remaining_qty: number               // Computed: planned_qty - fulfilled_qty

  // Fulfillment tracking
  fulfilled_at: string | null         // TIMESTAMPTZ when status became 'fulfilled'
  fulfillment_delivery_ids: string[]  // Array of delivery IDs that fulfilled this plan

  // Cancellation
  cancelled_at: string | null
  cancelled_by: string | null         // UUID (user_id)
  cancellation_reason: string | null

  // Metadata
  remarks: string | null
  created_by: string | null           // UUID (user_id)
  created_at: string                  // TIMESTAMPTZ
  updated_at: string                  // TIMESTAMPTZ
}

type DeliveryPlanStatus = 'pending' | 'partial' | 'fulfilled' | 'cancelled' | 'overdue'
```

**Constraints & Indexes:**
```sql
-- Foreign key constraint
FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id) ON DELETE CASCADE

-- Check constraints
CHECK (planned_qty > 0)
CHECK (fulfilled_qty >= 0)
CHECK (fulfilled_qty <= planned_qty)
CHECK (expected_delivery_week ~ '^\d{4}-W\d{2}$')  -- ISO week format

-- Indexes
CREATE INDEX idx_delivery_plans_status ON purchase_order_delivery_plans(plan_status)
CREATE INDEX idx_delivery_plans_week ON purchase_order_delivery_plans(expected_delivery_week)
CREATE INDEX idx_delivery_plans_po_item ON purchase_order_delivery_plans(po_item_id)
```

**Triggers:**
```sql
-- Auto-update status based on fulfillment
CREATE TRIGGER update_delivery_plan_status
  AFTER INSERT OR UPDATE ON production_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION sync_delivery_plan_fulfillment();

-- Prevent modification of fulfilled/cancelled plans
CREATE TRIGGER prevent_fulfilled_plan_edit
  BEFORE UPDATE ON purchase_order_delivery_plans
  FOR EACH ROW
  WHEN (OLD.plan_status IN ('fulfilled', 'cancelled'))
  EXECUTE FUNCTION raise_exception('Cannot edit fulfilled or cancelled plans');
```

---

### New Table: `factory_inventory_shipment_plans`

**Purpose:** Track expected shipment dates for unshipped factory inventory

**Schema:**
```typescript
interface FactoryInventoryShipmentPlan {
  // Identity
  id: string                          // UUID primary key
  delivery_id: string                 // FK -> production_deliveries.id

  // Quantity
  planned_qty: number                 // Quantity expected to be shipped

  // Timeline
  expected_ship_week: string          // ISO week format "YYYY-WW"
  expected_ship_date: string          // DATE (calculated from week start)
  expected_arrival_week: string       // Computed: ship_week + shipping_lead_time

  // Status & Actions
  plan_status: ShipmentPlanStatus     // 'pending' | 'fulfilled' | 'cancelled' | 'overdue'
  fulfilled_qty: number               // Auto-calculated from actual shipments
  remaining_qty: number               // Computed: planned_qty - fulfilled_qty

  // Fulfillment tracking
  fulfilled_at: string | null
  fulfillment_shipment_ids: string[]  // Array of shipment IDs that fulfilled this plan

  // Cancellation
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null

  // Metadata
  remarks: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type ShipmentPlanStatus = 'pending' | 'partial' | 'fulfilled' | 'cancelled' | 'overdue'
```

**Constraints & Indexes:**
```sql
-- Foreign key
FOREIGN KEY (delivery_id) REFERENCES production_deliveries(id) ON DELETE CASCADE

-- Check constraints
CHECK (planned_qty > 0)
CHECK (fulfilled_qty >= 0)
CHECK (fulfilled_qty <= planned_qty)
CHECK (expected_ship_week ~ '^\d{4}-W\d{2}$')

-- Indexes
CREATE INDEX idx_shipment_plans_status ON factory_inventory_shipment_plans(plan_status)
CREATE INDEX idx_shipment_plans_week ON factory_inventory_shipment_plans(expected_ship_week)
CREATE INDEX idx_shipment_plans_delivery ON factory_inventory_shipment_plans(delivery_id)
```

**Triggers:**
```sql
-- Auto-update status when shipments are allocated
CREATE TRIGGER update_shipment_plan_status
  AFTER INSERT OR UPDATE ON delivery_shipment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION sync_shipment_plan_fulfillment();
```

---

### Enhanced View: `v_po_item_variance_summary`

**Purpose:** Consolidated view of order fulfillment variances with delivery plan details

**Schema:**
```sql
CREATE OR REPLACE VIEW v_po_item_variance_summary AS
SELECT
  poi.id AS po_item_id,
  poi.po_id,
  po.po_number,
  po.batch_code,
  poi.sku,
  poi.channel_code,
  p.product_name,

  -- Order quantities
  poi.ordered_qty,

  -- Actual deliveries
  COALESCE(SUM(pd.delivered_qty), 0) AS total_delivered_qty,

  -- Variance (undelivered balance)
  poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0) AS undelivered_balance,

  -- Delivery plans
  COALESCE(SUM(
    CASE WHEN podp.plan_status IN ('pending', 'partial')
    THEN podp.remaining_qty ELSE 0 END
  ), 0) AS planned_delivery_qty,

  -- Unplanned quantity (critical metric)
  (poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0))
    - COALESCE(SUM(
        CASE WHEN podp.plan_status IN ('pending', 'partial')
        THEN podp.remaining_qty ELSE 0 END
      ), 0) AS unplanned_qty,

  -- Status indicators
  CASE
    WHEN poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0) = 0 THEN 'Fulfilled'
    WHEN (poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0))
      = COALESCE(SUM(
          CASE WHEN podp.plan_status IN ('pending', 'partial')
          THEN podp.remaining_qty ELSE 0 END
        ), 0) THEN 'Planned'
    ELSE 'Requires Planning'
  END AS variance_status,

  -- Timeline
  MIN(podp.expected_delivery_week) AS next_planned_delivery_week,

  -- Metadata
  COUNT(DISTINCT podp.id) FILTER (WHERE podp.plan_status IN ('pending', 'partial')) AS active_plan_count

FROM purchase_order_items poi
JOIN purchase_orders po ON poi.po_id = po.id
JOIN products p ON poi.sku = p.sku
LEFT JOIN production_deliveries pd ON pd.po_item_id = poi.id
LEFT JOIN purchase_order_delivery_plans podp ON podp.po_item_id = poi.id
GROUP BY poi.id, po.id, p.product_name
HAVING poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0) > 0;
```

---

### Enhanced View: `v_factory_inventory_summary`

**Purpose:** Consolidated view of unshipped factory inventory with shipment plans

**Schema:**
```sql
CREATE OR REPLACE VIEW v_factory_inventory_summary AS
SELECT
  pd.id AS delivery_id,
  pd.delivery_number,
  pd.po_item_id,
  poi.po_id,
  po.po_number,
  po.batch_code,
  pd.sku,
  p.product_name,

  -- Delivery quantities
  pd.delivered_qty,

  -- Shipped quantities
  COALESCE(SUM(dsa.shipped_qty), 0) AS total_shipped_qty,

  -- Factory inventory (unshipped balance)
  pd.delivered_qty - COALESCE(SUM(dsa.shipped_qty), 0) AS factory_inventory_qty,

  -- Shipment plans
  COALESCE(SUM(
    CASE WHEN fisp.plan_status IN ('pending', 'partial')
    THEN fisp.remaining_qty ELSE 0 END
  ), 0) AS planned_shipment_qty,

  -- Unplanned inventory (critical metric)
  (pd.delivered_qty - COALESCE(SUM(dsa.shipped_qty), 0))
    - COALESCE(SUM(
        CASE WHEN fisp.plan_status IN ('pending', 'partial')
        THEN fisp.remaining_qty ELSE 0 END
      ), 0) AS unplanned_inventory_qty,

  -- Status
  CASE
    WHEN pd.delivered_qty - COALESCE(SUM(dsa.shipped_qty), 0) = 0 THEN 'Fully Shipped'
    WHEN (pd.delivered_qty - COALESCE(SUM(dsa.shipped_qty), 0))
      = COALESCE(SUM(
          CASE WHEN fisp.plan_status IN ('pending', 'partial')
          THEN fisp.remaining_qty ELSE 0 END
        ), 0) THEN 'Planned'
    ELSE 'Requires Planning'
  END AS inventory_status,

  -- Timeline
  pd.actual_delivery_date,
  CURRENT_DATE - pd.actual_delivery_date::date AS days_in_factory,
  MIN(fisp.expected_ship_week) AS next_planned_ship_week,

  -- Metadata
  COUNT(DISTINCT fisp.id) FILTER (WHERE fisp.plan_status IN ('pending', 'partial')) AS active_plan_count

FROM production_deliveries pd
JOIN purchase_order_items poi ON pd.po_item_id = poi.id
JOIN purchase_orders po ON poi.po_id = po.id
JOIN products p ON pd.sku = p.sku
LEFT JOIN delivery_shipment_allocations dsa ON dsa.delivery_id = pd.id
LEFT JOIN factory_inventory_shipment_plans fisp ON fisp.delivery_id = pd.id
GROUP BY pd.id, poi.id, po.id, p.product_name
HAVING pd.delivered_qty - COALESCE(SUM(dsa.shipped_qty), 0) > 0;
```

---

## Business Rules & Logic

### Rule Matrix: Delivery Plan Management

| Condition | Constraint | Business Logic |
|-----------|------------|----------------|
| **Creation Validation** | `planned_qty <= undelivered_balance` | Cannot plan more than the remaining undelivered quantity |
| **Concurrent Plans** | `SUM(active_plans.planned_qty) <= undelivered_balance` | Multiple active plans allowed, but total cannot exceed balance |
| **Past Week Planning** | `expected_delivery_week >= current_week + 1` | Cannot plan deliveries in past or current week |
| **Auto-fulfillment** | When actual delivery occurs in planned week | System auto-matches and fulfills plans |
| **Partial Fulfillment** | When actual < planned | Plan status → 'partial', remaining_qty updated |
| **Over-fulfillment** | When actual > planned | Excess quantity fulfills earliest pending plan first (FIFO) |
| **Cancellation** | User-initiated | Plan marked 'cancelled', quantity removed from projections |
| **Overdue Detection** | When `expected_week < current_week AND status = 'pending'` | Plan status → 'overdue', triggers alert notification |

### Rule Matrix: Shipment Plan Management

| Condition | Constraint | Business Logic |
|-----------|------------|----------------|
| **Creation Validation** | `planned_qty <= factory_inventory_qty` | Cannot plan more than unshipped balance |
| **Concurrent Plans** | `SUM(active_plans.planned_qty) <= factory_inventory_qty` | Multiple plans allowed within balance |
| **Lead Time Validation** | `expected_ship_week >= delivery_week + loading_weeks` | Minimum 1 week loading time after delivery |
| **Auto-fulfillment** | When shipment allocation occurs in planned week | System auto-matches via SKU and week |
| **Partial Fulfillment** | When shipped < planned | Status → 'partial', remaining updated |
| **Over-fulfillment** | When shipped > planned | Excess fulfills next pending plan (FIFO) |
| **Cascading Impact** | Plan fulfillment | Updates algorithm audit table's "Planned Ship" and "Planned Arrival" columns |

### Rule Matrix: Algorithm Audit Integration

| Variance Type | Algorithm Audit Column | Display Logic |
|---------------|------------------------|---------------|
| **Delivery Plans** | `planned_factory_ship` | Add sum of active plans' `remaining_qty` to reverse-calculated value |
| **Shipment Plans** | `planned_ship` | Add sum of active plans' `remaining_qty` to reverse-calculated value |
| **Cascading Arrivals** | `planned_arrival` | Shipment plans propagate to arrival week = ship_week + shipping_lead_time |
| **Tooltip Display** | All "Planned" columns | Show breakdown: "Reverse Calc: X, Delivery Plans: Y, Shipment Plans: Z" |
| **Status Indicators** | Visual styling | Plans in past weeks marked "Overdue" (red), current week "Due" (yellow) |

---

## User Interface Specification

### UI-1: Purchase Order Detail Page - Variance Section

**Location:** `/procurement/purchase-orders/[id]` (existing page enhancement)

**New Section: "Delivery Variance"**

```
┌────────────────────────────────────────────────────────────────┐
│ 📦 Delivery Status & Planning                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Order Item: SKU-001 - Product Name                            │
│  ├─ Ordered Quantity:     50 units                             │
│  ├─ Delivered Quantity:   45 units   [View Deliveries →]       │
│  └─ Undelivered Balance:  5 units    ⚠️                        │
│                                                                 │
│  Delivery Plans:                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ Plan #DP-001              Status: Pending            │     │
│  │ Quantity: 3 units                                    │     │
│  │ Expected Week: 2025-W10 (Mar 3 - Mar 9)             │     │
│  │ Remarks: Waiting for raw material                   │     │
│  │ [Edit Plan] [Cancel Plan]                           │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
│  Unplanned Quantity: 2 units                                   │
│  [+ Plan Delivery]                                             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Actions:**
- **[+ Plan Delivery]**: Opens modal to create new delivery plan
- **[Edit Plan]**: Modify expected date/quantity (if status = pending)
- **[Cancel Plan]**: Mark as cancelled with reason
- **[View Deliveries]**: Navigate to production deliveries list filtered by PO item

---

### UI-2: Delivery Plan Creation Modal

**Trigger:** Click "[+ Plan Delivery]" button

**Modal Design:**
```
┌─────────────────────────────────────────────────────────┐
│  Plan Delivery for SKU-001                         [×]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Available to Plan: 5 units                             │
│                                                          │
│  Quantity *                                             │
│  [          5          ] units                          │
│  └─ Max: 5 units                                        │
│                                                          │
│  Expected Delivery Week *                               │
│  [  2025-W10  ▼]                                        │
│  └─ Week of Mar 3 - Mar 9, 2025                         │
│                                                          │
│  ☐ Split into multiple deliveries                       │
│  └─ (Check to add more delivery schedules)              │
│                                                          │
│  Remarks (Optional)                                     │
│  [─────────────────────────────────────────────]       │
│  │ Factory confirmed partial shipment due to    │       │
│  │ component shortage                           │       │
│  [─────────────────────────────────────────────]       │
│                                                          │
│  [Cancel]                    [Create Delivery Plan]     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Validation Rules:**
- Quantity must be > 0 and <= available balance
- Expected week must be >= current_week + 1
- If "Split" is checked, show additional quantity/week inputs
- Sum of split quantities must equal original planned quantity

---

### UI-3: Production Delivery Detail Page - Factory Inventory Section

**Location:** `/procurement/deliveries/[id]/edit` (existing page enhancement)

**New Section: "Factory Inventory & Shipment Planning"**

```
┌────────────────────────────────────────────────────────────────┐
│ 🚛 Shipment Status & Planning                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Delivery: DEL-2025-03-15-001                                  │
│  ├─ Delivered Quantity:   45 units                             │
│  ├─ Shipped Quantity:     40 units   [View Shipments →]        │
│  └─ Factory Inventory:    5 units    🏭                        │
│                                                                 │
│  Shipment Plans:                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ Plan #SP-001              Status: Pending            │     │
│  │ Quantity: 5 units                                    │     │
│  │ Expected Ship Week: 2025-W12 (Mar 17 - Mar 23)      │     │
│  │ Expected Arrival: 2025-W17 (5 weeks transit)        │     │
│  │ Remarks: Consolidating with next batch              │     │
│  │ [Edit Plan] [Cancel Plan]                           │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
│  No unplanned inventory ✓                                      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

### UI-4: Algorithm Audit Table - Enhanced Tooltips

**Location:** `/inventory/algorithm-audit` (existing page enhancement)

**Enhanced Hover Behavior:**

When hovering over any "Planned" column cell (Planned Order, Planned Factory Ship, Planned Ship, Planned Arrival):

```
┌─────────────────────────────────────────────┐
│ 🔍 2025-W10 Planned Factory Ship Breakdown │
├─────────────────────────────────────────────┤
│                                              │
│  Total Planned: 12 units                    │
│                                              │
│  Composition:                                │
│  • Reverse Calculated: 7 units              │
│    (From sales demand + lead time)          │
│                                              │
│  • Delivery Plans: 5 units                  │
│    ├─ DP-001: 3 units (SKU-001)            │
│    │   Status: Pending                      │
│    │   From: PO-2025-001-A                  │
│    │                                         │
│    └─ DP-002: 2 units (SKU-001)            │
│        Status: Overdue ⚠️                   │
│        From: PO-2025-002-B                  │
│                                              │
│  [View All Plans for This Week →]          │
│                                              │
└─────────────────────────────────────────────┘
```

**Visual Indicators:**
- **Reverse Calculated Values**: Normal weight text
- **Plan-Enhanced Values**: Bold text + 📋 icon
- **Overdue Plans**: Red badge in tooltip
- **Pending Plans**: Blue badge in tooltip
- **Fulfilled Plans**: Green badge (if shown in historical view)

---

### UI-5: Variance Management Dashboard (New Page)

**Route:** `/procurement/variance-dashboard`

**Purpose:** Centralized view of all active variances requiring action

**Layout:**

```
┌───────────────────────────────────────────────────────────────┐
│  Variance Management Dashboard                                │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  📊 Summary KPIs                                              │
│  ┌───────────────┬───────────────┬───────────────┐          │
│  │ Unplanned     │ Overdue       │ Total Active  │          │
│  │ Variances     │ Plans         │ Plans         │          │
│  │   12 items    │   3 items     │   45 items    │          │
│  └───────────────┴───────────────┴───────────────┘          │
│                                                                │
│  🔴 Critical Items Requiring Attention                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ SKU-001 | PO-2025-001-A | Unplanned: 5 units        │   │
│  │ Status: No delivery plan | Age: 15 days              │   │
│  │ [Plan Delivery]                                       │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ SKU-003 | DEL-2025-03-10-001 | Factory: 10 units     │   │
│  │ Status: No shipment plan | Days in factory: 22 days  │   │
│  │ [Plan Shipment]                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                                │
│  ⚠️ Overdue Plans                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ DP-002 | SKU-002 | Expected: W08 | Qty: 3 units      │   │
│  │ Status: Overdue (2 weeks) | From: PO-2025-002-B      │   │
│  │ [Edit Plan] [Mark Cancelled] [Convert to Actual]     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                                │
│  Filters: [Status ▼] [SKU Search] [Week Range]               │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Features:**
- Real-time KPI cards
- Sortable/filterable tables
- Quick action buttons for each variance
- Drill-down links to source records (PO, Delivery, Shipment)
- Export to Excel for offline analysis

---

## Integration Points

### Integration 1: Algorithm Audit V4 Query Enhancement

**Current State:** Algorithm audit query calculates planned values via reverse calculation only

**Required Changes:**

```typescript
// src/lib/queries/algorithm-audit-v4.ts

// BEFORE (pseudo-code)
const planned_factory_ship = calculateReverseFromSalesDemand(
  sales_effective,
  lead_times
)

// AFTER (enhanced)
const planned_factory_ship_reverse = calculateReverseFromSalesDemand(
  sales_effective,
  lead_times
)

const planned_factory_ship_from_plans = await supabase
  .from('purchase_order_delivery_plans')
  .select('planned_qty, remaining_qty')
  .eq('expected_delivery_week', week_iso)
  .in('plan_status', ['pending', 'partial'])
  .sum('remaining_qty')

const planned_factory_ship =
  planned_factory_ship_reverse +
  planned_factory_ship_from_plans

// Store metadata for tooltip display
row.planned_factory_ship_sources = {
  reverse_calculated: planned_factory_ship_reverse,
  delivery_plans: planned_factory_ship_from_plans,
  delivery_plan_ids: [...] // For tooltip details
}
```

**Similar Enhancement Required For:**
- `planned_ship` (integrate `factory_inventory_shipment_plans`)
- `planned_arrival` (cascade from shipment plans + lead time)

---

### Integration 2: Auto-Fulfillment Trigger Logic

**Scenario:** When a new `production_delivery` record is created, auto-fulfill matching delivery plans

**PostgreSQL Function:**
```sql
CREATE OR REPLACE FUNCTION sync_delivery_plan_fulfillment()
RETURNS TRIGGER AS $$
DECLARE
  target_week TEXT;
  matching_plans RECORD;
  remaining_qty INT;
BEGIN
  -- Calculate ISO week of delivery
  target_week := to_char(NEW.actual_delivery_date, 'IYYY-"W"IW');
  remaining_qty := NEW.delivered_qty;

  -- Find matching plans (FIFO by created_at)
  FOR matching_plans IN
    SELECT id, po_item_id, planned_qty, fulfilled_qty
    FROM purchase_order_delivery_plans
    WHERE po_item_id = NEW.po_item_id
      AND expected_delivery_week = target_week
      AND plan_status IN ('pending', 'partial')
    ORDER BY created_at ASC
  LOOP
    -- Calculate fulfillment amount
    DECLARE
      plan_remaining INT := matching_plans.planned_qty - matching_plans.fulfilled_qty;
      fulfill_amount INT := LEAST(remaining_qty, plan_remaining);
    BEGIN
      -- Update plan
      UPDATE purchase_order_delivery_plans
      SET
        fulfilled_qty = fulfilled_qty + fulfill_amount,
        plan_status = CASE
          WHEN fulfilled_qty + fulfill_amount >= planned_qty THEN 'fulfilled'
          ELSE 'partial'
        END,
        fulfilled_at = CASE
          WHEN fulfilled_qty + fulfill_amount >= planned_qty THEN NOW()
          ELSE fulfilled_at
        END,
        fulfillment_delivery_ids = array_append(fulfillment_delivery_ids, NEW.id::text),
        updated_at = NOW()
      WHERE id = matching_plans.id;

      -- Deduct from remaining
      remaining_qty := remaining_qty - fulfill_amount;

      -- Exit if all quantity allocated
      EXIT WHEN remaining_qty <= 0;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_delivery_plan_fulfillment
  AFTER INSERT OR UPDATE OF delivered_qty ON production_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION sync_delivery_plan_fulfillment();
```

**Similar Function Required For:**
- `sync_shipment_plan_fulfillment()` (triggered by `delivery_shipment_allocations` inserts)

---

### Integration 3: Overdue Detection Scheduled Job

**Purpose:** Automatically mark plans as overdue when their expected week has passed

**Implementation:** PostgreSQL cron job or Next.js scheduled edge function

**Logic:**
```sql
-- Run daily at 00:00 UTC
UPDATE purchase_order_delivery_plans
SET
  plan_status = 'overdue',
  updated_at = NOW()
WHERE plan_status = 'pending'
  AND expected_delivery_week < to_char(CURRENT_DATE, 'IYYY-"W"IW');

UPDATE factory_inventory_shipment_plans
SET
  plan_status = 'overdue',
  updated_at = NOW()
WHERE plan_status = 'pending'
  AND expected_ship_week < to_char(CURRENT_DATE, 'IYYY-"W"IW');
```

---

## Acceptance Criteria (System-Level)

### AC-1: Data Integrity

```gherkin
Scenario: Prevent over-planning
  Given a PO item with undelivered_balance = 5 units
  And an existing active plan for 3 units
  When I attempt to create a new plan for 3 units
  Then the system rejects the request
  And shows error: "Total planned quantity (6) exceeds undelivered balance (5)"
```

### AC-2: Auto-Fulfillment Accuracy

```gherkin
Scenario: Exact fulfillment
  Given a delivery plan for 5 units on W10
  When a production_delivery of 5 units is created in W10
  Then the plan status becomes "fulfilled"
  And fulfilled_qty = 5
  And remaining_qty = 0
  And fulfilled_at is set to current timestamp

Scenario: Partial fulfillment
  Given a delivery plan for 10 units on W10
  When a production_delivery of 6 units is created in W10
  Then the plan status becomes "partial"
  And fulfilled_qty = 6
  And remaining_qty = 4

Scenario: Over-fulfillment
  Given two delivery plans: Plan A (5 units, W10), Plan B (3 units, W10)
  When a production_delivery of 7 units is created in W10
  Then Plan A status = "fulfilled" (fulfilled_qty = 5)
  And Plan B status = "partial" (fulfilled_qty = 2, remaining = 1)
```

### AC-3: Algorithm Audit Accuracy

```gherkin
Scenario: Plan integration in audit table
  Given the following active plans:
    | Type     | Qty | Week    |
    | Delivery | 5   | 2025-W10|
    | Shipment | 3   | 2025-W12|
  When the algorithm audit table is generated for SKU-001
  Then W10's planned_factory_ship includes +5 units
  And W12's planned_ship includes +3 units
  And W17's planned_arrival includes +3 units (W12 + 5 weeks transit)
  And tooltip shows breakdown of reverse calc vs plans
```

### AC-4: Cascade Cancellation

```gherkin
Scenario: Cancel delivery plan
  Given a delivery plan for 5 units on W10
  And a corresponding shipment plan for 5 units on W12 (created after delivery)
  When I cancel the delivery plan with reason "Order cancelled by customer"
  Then delivery plan status = "cancelled"
  And the system prompts: "Linked shipment plan found. Cancel it too? [Yes] [No]"
  When I click [Yes]
  Then shipment plan status = "cancelled"
  And both plans are removed from algorithm audit projections
```

---

## Out of Scope (Explicitly)

The following are NOT included in this PRD and should be addressed in future phases:

1. **Shipment-Arrival Variance**: Tracking quantity loss/damage during transit (requires warehouse receipt confirmation workflow)
2. **Forecast Adjustment Automation**: Auto-adjusting sales forecasts based on chronic under-delivery patterns
3. **Supplier Performance Scoring**: Using variance data to calculate supplier reliability metrics
4. **Financial Impact Analysis**: Calculating cash flow impact of delayed deliveries
5. **Multi-Warehouse Factory Inventory**: This version assumes single factory location per delivery
6. **Plan Approval Workflow**: Current design allows direct plan creation; approval gates are future enhancement
7. **Mobile App Interface**: UI specifications are for desktop/tablet web interface only

---

## Success Metrics & KPIs

### Operational Metrics

| Metric | Definition | Target | Measurement Frequency |
|--------|------------|--------|----------------------|
| **Planning Coverage Rate** | `(Planned Qty / Total Variance Qty) × 100%` | ≥ 95% | Daily |
| **Overdue Plan Rate** | `(Overdue Plans / Total Active Plans) × 100%` | < 5% | Weekly |
| **Plan Accuracy** | `(Fulfilled as Expected / Total Fulfilled Plans) × 100%` | ≥ 85% | Monthly |
| **Unplanned Variance Age** | Average days a variance exists without a plan | < 3 days | Daily |
| **Factory Inventory Days** | Average days goods stay unshipped at factory | < 14 days | Weekly |

### User Adoption Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| **Active Users Creating Plans** | 100% of procurement team | Within 2 weeks of launch |
| **Plans Created per Week** | ≥ 20 plans | After 1 month |
| **User Satisfaction Score** | ≥ 4.0/5.0 | Post-launch survey |

### Business Impact Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| **Inventory Forecast Accuracy** | TBD (pre-launch audit) | +10% improvement | Monthly comparison |
| **Stockout Incidents** | TBD (historical average) | -20% reduction | Quarterly comparison |
| **Emergency Orders** | TBD (historical count) | -30% reduction | Quarterly comparison |

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Performance Impact** | Algorithm audit query slows down with plan joins | Medium | High | 1. Add database indexes on week columns<br>2. Implement query result caching<br>3. Paginate variance dashboard |
| **Data Race Conditions** | Concurrent plan creation exceeds balance | High | Medium | 1. Use database-level constraints<br>2. Implement row-level locking in triggers<br>3. Add optimistic locking in UI |
| **Trigger Complexity** | Auto-fulfillment logic causes cascade failures | High | Low | 1. Extensive unit testing of trigger functions<br>2. Add rollback mechanisms<br>3. Log all trigger executions for debugging |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **User Resistance** | Team continues manual tracking in spreadsheets | High | Medium | 1. Comprehensive training program<br>2. Show clear value through pilot test<br>3. Phase out manual processes gradually |
| **Data Migration Issues** | Historical variances have no baseline plans | Medium | High | 1. One-time bulk plan creation for active variances<br>2. Clearly mark "legacy" plans in UI<br>3. Allow backdated plan creation with admin approval |
| **Over-Planning Complexity** | Users create redundant or conflicting plans | Medium | Medium | 1. Validation rules prevent over-planning<br>2. Dashboard shows warnings for unusual patterns<br>3. Weekly review process with team lead |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Undelivered Balance** | The quantity difference between `ordered_qty` and `total_delivered_qty` for a PO item |
| **Factory Inventory** | Goods that have been delivered by the factory but not yet shipped to warehouses |
| **Delivery Plan** | A user-created record specifying expected delivery date for undelivered order balance |
| **Shipment Plan** | A user-created record specifying expected shipment date for unshipped factory inventory |
| **Variance Status** | System-calculated status: 'Fulfilled', 'Planned', 'Requires Planning' |
| **Plan Status** | Lifecycle status: 'pending', 'partial', 'fulfilled', 'cancelled', 'overdue' |
| **Auto-Fulfillment** | System automatically marks plan as fulfilled when actual transaction matches plan criteria |
| **Reverse Calculation** | Algorithm-driven planned values based on sales demand + lead times (opposite of forward propagation) |
| **FIFO Fulfillment** | First-In-First-Out logic: oldest plans are fulfilled first when multiple plans exist |

---

## Appendix B: Sample User Workflow

### Workflow: Handle Undelivered Order Balance

**Persona:** Procurement Manager (Sarah)
**Scenario:** PO-2025-001-A ordered 50 units of SKU-001, but factory only delivered 45 units in W09. Sarah needs to track the remaining 5 units.

**Steps:**

1. **Discover Variance**
   - Navigate to `/procurement/purchase-orders/[id]`
   - See banner: "⚠️ Undelivered Balance: 5 units"
   - Click "[+ Plan Delivery]" button

2. **Create Delivery Plan**
   - Modal opens: "Plan Delivery for SKU-001"
   - Enter: Quantity = 5, Expected Week = 2025-W10
   - Add remark: "Factory confirmed delay due to component shortage"
   - Click [Create Delivery Plan]

3. **Verify in Algorithm Audit**
   - Navigate to `/inventory/algorithm-audit?sku=SKU-001`
   - Find row for W10
   - See "Planned Factory Ship" = 12 (7 from reverse calc + 5 from plan)
   - Hover to see tooltip breakdown

4. **Handle Actual Delivery**
   - In W10, factory delivers 5 units
   - Backend engineer creates `production_delivery` record
   - System automatically marks plan as "fulfilled"
   - Sarah receives notification: "Delivery Plan DP-001 fulfilled by DEL-2025-03-17-001"

5. **Review Completion**
   - Return to PO detail page
   - See: "Undelivered Balance: 0 units ✓"
   - Plan shows: Status = Fulfilled, Fulfilled At = 2025-03-17 10:23:15

---

## Appendix C: Mock API Contracts

### POST `/api/delivery-plans`

**Request Body:**
```json
{
  "po_item_id": "uuid-123",
  "planned_qty": 5,
  "expected_delivery_week": "2025-W10",
  "remarks": "Factory confirmed delay"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-456",
    "po_item_id": "uuid-123",
    "planned_qty": 5,
    "fulfilled_qty": 0,
    "remaining_qty": 5,
    "expected_delivery_week": "2025-W10",
    "expected_delivery_date": "2025-03-03",
    "plan_status": "pending",
    "remarks": "Factory confirmed delay",
    "created_at": "2025-12-08T10:00:00Z"
  }
}
```

**Response (Validation Error):**
```json
{
  "success": false,
  "error": {
    "code": "OVER_PLANNING",
    "message": "Total planned quantity (8) exceeds undelivered balance (5)",
    "details": {
      "undelivered_balance": 5,
      "existing_plans_total": 3,
      "requested_qty": 5
    }
  }
}
```

---

### GET `/api/po-items/[id]/variance-summary`

**Response:**
```json
{
  "success": true,
  "data": {
    "po_item_id": "uuid-123",
    "po_number": "PO-2025-001-A",
    "sku": "SKU-001",
    "ordered_qty": 50,
    "total_delivered_qty": 45,
    "undelivered_balance": 5,
    "variance_status": "Planned",
    "active_plans": [
      {
        "id": "uuid-456",
        "planned_qty": 3,
        "remaining_qty": 3,
        "expected_delivery_week": "2025-W10",
        "plan_status": "pending",
        "created_at": "2025-12-08T10:00:00Z"
      },
      {
        "id": "uuid-789",
        "planned_qty": 2,
        "remaining_qty": 2,
        "expected_delivery_week": "2025-W11",
        "plan_status": "pending",
        "created_at": "2025-12-08T11:00:00Z"
      }
    ],
    "unplanned_qty": 0
  }
}
```

---

## Appendix D: Migration Strategy

### Phase 1: Foundation (Week 1-2)

- Create database tables (`purchase_order_delivery_plans`, `factory_inventory_shipment_plans`)
- Implement database triggers for auto-fulfillment
- Create views (`v_po_item_variance_summary`, `v_factory_inventory_summary`)
- Add TypeScript types to `lib/types/database.ts`

### Phase 2: Backend API (Week 2-3)

- Implement Server Actions for plan CRUD operations
- Create query functions for variance data retrieval
- Integrate plan data into algorithm audit V4 query
- Add validation logic for over-planning prevention

### Phase 3: UI Components (Week 3-4)

- Build delivery plan creation modal
- Add variance sections to PO detail page
- Add shipment planning to delivery edit page
- Enhance algorithm audit table tooltips
- Create variance management dashboard

### Phase 4: Testing & Refinement (Week 4-5)

- Unit tests for trigger functions
- Integration tests for auto-fulfillment
- UAT with procurement team
- Performance testing with large datasets
- Bug fixes and UX refinements

### Phase 5: Launch & Monitoring (Week 5-6)

- Production deployment
- User training sessions
- Monitor error logs and performance metrics
- Collect user feedback
- Iterate based on real-world usage

---

## Document Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | Product Director | Initial PRD creation |

---

## Approval & Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Director | [Name] | [Date] | [Pending] |
| System Architect | [Name] | [Date] | [Pending] |
| Engineering Lead | [Name] | [Date] | [Pending] |
| Business Stakeholder | [Name] | [Date] | [Pending] |

---

**END OF DOCUMENT**
