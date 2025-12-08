# Product Requirement Document: Shipment-Delivery Linkage System

## Document Metadata
- **Feature Name:** Shipment-Delivery Linkage (物流发货与采购交货关联系统)
- **Version:** 1.0
- **Author:** Product Director
- **Created:** 2025-12-08
- **Status:** Draft

---

## 1. CONTEXT & BUSINESS GOALS

### 1.1 Problem Statement

**Current Pain Points:**
1. **Manual Data Entry:** Users must manually input shipment quantities without visibility into which factory deliveries are awaiting shipment.
2. **No Traceability:** Cannot track which shipment corresponds to which factory delivery records.
3. **Hidden Unshipped Goods:** Factory-delivered goods that have not yet been shipped are invisible in the system, creating blind spots in supply chain tracking.
4. **Error-Prone Process:** Manual entry increases risk of quantity mismatches, double-shipping, or overlooking delivered goods.

**Business Context:**
- **Factory Delivery (工厂交货):** Supplier ships goods from factory to logistics provider. One PO Item can have multiple delivery records (1:N).
- **Logistics Shipment (物流发货):** Logistics provider consolidates goods and ships to warehouse. One shipment can include goods from multiple factory deliveries (N:1).

**Critical Difference from PO → Delivery Flow:**
- PO → Delivery: **1:N** (one PO spawns multiple deliveries)
- Delivery → Shipment: **N:1** (multiple deliveries merge into one shipment)

### 1.2 Business Objectives

**Primary Goals:**
1. **Improve Operational Efficiency:** Reduce manual data entry by 80% via selection-based workflow.
2. **Enhance Traceability:** Enable full lineage tracking from PO → Delivery → Shipment → Warehouse Arrival.
3. **Reduce Errors:** Eliminate quantity mismatches through automated validation.
4. **Provide Visibility:** Surface unshipped factory deliveries in real-time dashboards.

**Success Metrics:**
- Average time to create shipment reduced from 5 minutes to 90 seconds.
- Quantity mismatch errors reduced to <1%.
- 100% of shipments linked to source deliveries within 2 weeks of system launch.

---

## 2. USER STORIES

### 2.1 Primary User Personas

**Persona 1: Logistics Coordinator (物流协调员)**
- **Role:** Manages shipments from China to US warehouses.
- **Pain Points:** Manually checking factory delivery records in Excel, then re-entering data into system.
- **Goals:** Quickly identify what needs to ship, create shipments with 1-click selection.

**Persona 2: Supply Chain Manager (供应链经理)**
- **Role:** Oversees procurement, delivery, and shipment timelines.
- **Pain Points:** Cannot see which deliveries are "stuck" awaiting shipment.
- **Goals:** Dashboard view of unshipped goods with aging alerts.

### 2.2 Core User Stories

**Story 1: Create Shipment from Deliveries (Primary Flow)**
```gherkin
As a Logistics Coordinator
I want to create a shipment by selecting from pending factory deliveries
So that I avoid manual data entry and ensure accurate quantity tracking
```

**Story 2: Partial Shipment Handling**
```gherkin
As a Logistics Coordinator
I want to ship only part of a factory delivery's quantity
So that I can consolidate multiple partial shipments based on container capacity
```

**Story 3: View Unshipped Deliveries**
```gherkin
As a Supply Chain Manager
I want to see all factory deliveries that have not been fully shipped
So that I can identify bottlenecks and expedite delayed shipments
```

**Story 4: Trace Shipment Lineage**
```gherkin
As a Supply Chain Manager
I want to trace a shipment back to its source factory deliveries and POs
So that I can investigate discrepancies and optimize supplier performance
```

**Story 5: Prevent Over-Shipment**
```gherkin
As a Logistics Coordinator
I want the system to prevent me from shipping more than the delivered quantity
So that I avoid inventory errors and reconciliation issues
```

---

## 3. BUSINESS RULES

### 3.1 Core Rules Matrix

| Rule ID | Rule Description | Validation Logic | Error Handling |
|---------|------------------|------------------|----------------|
| **BR-01** | A shipment item must link to at least one delivery item | `shipment_items.delivery_item_id IS NOT NULL` OR use junction table | Block creation if no delivery selected |
| **BR-02** | Total shipped quantity ≤ Total delivered quantity (per SKU) | `SUM(shipped_qty) ≤ delivered_qty` | Show error: "Exceeds delivery qty" |
| **BR-03** | Partial shipment creates "unshipped balance" | `unshipped_qty = delivered_qty - SUM(shipped_qty)` | Display balance in UI |
| **BR-04** | Unshipped deliveries remain visible until fully shipped | `unshipped_qty > 0` | Filter: "Show Unshipped" |
| **BR-05** | One delivery can be split across multiple shipments | Junction table allows N:N mapping | Allow multiple selections |
| **BR-06** | Shipment quantity can be edited before departure | `actual_departure_date IS NULL` | Lock after departure |
| **BR-07** | SKU consistency: shipment SKU must match delivery SKU | `shipment_items.sku = production_deliveries.sku` | Auto-populate SKU |

### 3.2 State Transition Rules

**Factory Delivery States:**
```
Created → [Shipped] → [Fully Shipped] → [Arrived]
         ↓ partial    ↓ remaining
    [Partially Shipped (with balance)]
```

**State Definitions:**
- **Unshipped:** `SUM(shipped_qty) = 0`
- **Partially Shipped:** `0 < SUM(shipped_qty) < delivered_qty`
- **Fully Shipped:** `SUM(shipped_qty) = delivered_qty`
- **Overshipped (Error):** `SUM(shipped_qty) > delivered_qty` (blocked by BR-02)

### 3.3 Quantity Validation Rules

**Scenario A: Single Delivery, Full Shipment**
```
Delivery: 100 units
Shipment 1: 100 units ✅
Remaining: 0 units
```

**Scenario B: Single Delivery, Partial Shipments**
```
Delivery: 100 units
Shipment 1: 30 units ✅
Remaining: 70 units → carries over to next shipment selection
Shipment 2: 50 units ✅
Remaining: 20 units
Shipment 3: 20 units ✅
Remaining: 0 units
```

**Scenario C: Multiple Deliveries, Consolidated Shipment**
```
Delivery 1 (SKU-A): 50 units
Delivery 2 (SKU-A): 30 units
Shipment 1: 80 units (combines both deliveries) ✅
Remaining: 0 units
```

**Scenario D: Over-Shipment Attempt (Blocked)**
```
Delivery: 100 units
Shipment 1: 120 units ❌
Error: "Cannot ship 120 units. Only 100 units available from delivery."
```

---

## 4. FUNCTIONAL REQUIREMENTS

### 4.1 Feature Breakdown

#### 4.1.1 Shipment Creation Workflow

**FR-01: Pre-Selection View**
- Display all factory deliveries with status "Unshipped" or "Partially Shipped"
- Group by: SKU, Supplier, Delivery Date (user-selectable)
- Show columns:
  - Delivery Number
  - PO Number (traceability)
  - SKU
  - Delivered Qty
  - Already Shipped Qty
  - Available to Ship (calculated)
  - Delivery Date
  - Age (days since delivery)

**FR-02: Multi-Select Delivery Items**
- User can select multiple delivery records via checkboxes
- Display selection summary:
  - Total SKUs selected: X
  - Total available quantity: Y units
  - Total weight (if available): Z kg

**FR-03: Quantity Input Modal**
- For each selected delivery, show:
  - Delivery Number
  - Available Qty (grayed out, read-only)
  - Ship Qty (editable, default = Available Qty)
  - Remaining Qty (auto-calculated)
- Allow partial quantity input
- Validation: `Ship Qty ≤ Available Qty`

**FR-04: Shipment Form Auto-Population**
- Auto-populate:
  - Batch Code (from first selected delivery)
  - Suggested Departure Date (based on delivery date + loading time)
  - Total Unit Count (sum of all selected quantities)
  - Total Weight (if product weight data exists)
- User can override all auto-populated fields

**FR-05: Submit and Link**
- Create shipment record with standard fields
- Create shipment_items records for each SKU
- Create linkage records in `delivery_shipment_items` junction table
- Update delivery shipment status atomically

#### 4.1.2 Unshipped Deliveries Dashboard

**FR-06: List View**
- Default filter: `unshipped_qty > 0`
- Sort options:
  - Oldest delivery first (default)
  - Highest quantity first
  - By supplier
- KPI cards:
  - Total unshipped deliveries
  - Total unshipped quantity (units)
  - Average age of unshipped deliveries (days)
  - Critical alerts (age > 14 days)

**FR-07: Aging Alerts**
- Color coding:
  - Green: 0-7 days since delivery
  - Yellow: 8-14 days since delivery
  - Red: >14 days since delivery (critical)
- Push notification: "5 deliveries awaiting shipment for >14 days"

#### 4.1.3 Shipment Detail View (Traceability)

**FR-08: Source Delivery Section**
- Display all linked delivery records:
  - Delivery Number (clickable link)
  - PO Number (clickable link)
  - Delivered Qty
  - Shipped in This Shipment
  - Total Shipped (across all shipments)
  - Remaining Balance
- Expandable row shows full PO item details

**FR-09: Shipment Edit Constraints**
- Before departure (`actual_departure_date IS NULL`):
  - Can edit quantities
  - Can add/remove delivery links
  - Can delete shipment (reverts delivery status)
- After departure:
  - Quantities locked (display-only)
  - Show warning: "Shipment has departed. Contact admin to modify."

#### 4.1.4 Delivery Detail View Enhancement

**FR-10: Shipment History Tab**
- Add section to delivery detail page:
  - "Shipment Records"
  - Show all shipments linked to this delivery:
    - Shipment Tracking Number
    - Departure Date
    - Quantity Shipped
    - Status (In Transit / Arrived)
    - Arrival Date
- Display total shipped: "80 / 100 units shipped"

---

## 5. DATA REQUIREMENTS

### 5.1 Data Model Design Principles

**Principle 1: N:N Relationship**
- One delivery can be split across multiple shipments.
- One shipment can consolidate multiple deliveries.
- Solution: Junction table `delivery_shipment_items`.

**Principle 2: Quantity Integrity**
- Track quantity at the linkage level (not just at shipment_items level).
- Each junction record stores: `shipped_qty_from_this_delivery`.

**Principle 3: Denormalization for Performance**
- Add computed column `shipped_qty` to `production_deliveries` for fast filtering.
- Trigger updates on junction table changes.

### 5.2 Proposed Data Schema

#### Table 1: `delivery_shipment_items` (NEW - Junction Table)
```
Columns:
- id: UUID (PK)
- delivery_id: UUID (FK → production_deliveries.id)
- shipment_item_id: UUID (FK → shipment_items.id)
- shipped_qty: INTEGER (quantity shipped in this specific link)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ

Constraints:
- UNIQUE(delivery_id, shipment_item_id)
- CHECK(shipped_qty > 0)
- Foreign keys with ON DELETE CASCADE

Indexes:
- idx_delivery_shipment_items_delivery_id
- idx_delivery_shipment_items_shipment_item_id
```

#### Table 2: `production_deliveries` (MODIFY - Add Computed Columns)
```
New Columns:
- shipped_qty: INTEGER DEFAULT 0 (denormalized for performance)
- shipment_status: TEXT (enum: 'unshipped' | 'partial' | 'fully_shipped')

Computed Fields (via trigger):
- shipped_qty = SUM(delivery_shipment_items.shipped_qty)
- shipment_status = CASE
    WHEN shipped_qty = 0 THEN 'unshipped'
    WHEN shipped_qty < delivered_qty THEN 'partial'
    WHEN shipped_qty = delivered_qty THEN 'fully_shipped'
    ELSE 'error'
  END
```

#### Table 3: `shipment_items` (NO CHANGES)
```
Existing structure is sufficient:
- id: UUID
- shipment_id: UUID
- sku: TEXT
- shipped_qty: INTEGER
```

### 5.3 Database Views

#### View 1: `v_unshipped_deliveries`
```sql
Purpose: Fast access to deliveries awaiting shipment
Columns:
- delivery_id
- delivery_number
- po_number
- sku
- product_name
- delivered_qty
- shipped_qty (from denormalized column)
- unshipped_qty (delivered_qty - shipped_qty)
- delivery_date
- days_since_delivery (CURRENT_DATE - delivery_date)
- supplier_name

Filters:
- unshipped_qty > 0
- delivery_date IS NOT NULL
```

#### View 2: `v_shipment_lineage`
```sql
Purpose: Full traceability from PO to Shipment
Columns:
- shipment_id
- tracking_number
- shipment_status
- delivery_id
- delivery_number
- po_id
- po_number
- sku
- shipped_qty_in_link
- delivered_qty
- ordered_qty
```

---

## 6. BUSINESS LOGIC MATRIX

### 6.1 Validation Rules Table

| Validation ID | Field | Rule | Error Message |
|---------------|-------|------|---------------|
| **VAL-01** | Ship Qty | `ship_qty ≤ available_qty` | "Cannot ship {input} units. Only {available} available." |
| **VAL-02** | Ship Qty | `ship_qty > 0` | "Quantity must be greater than 0." |
| **VAL-03** | Delivery Selection | At least 1 delivery selected | "Please select at least one delivery record." |
| **VAL-04** | SKU Match | All selected deliveries for same SKU | "Cannot mix different SKUs in one shipment item." |
| **VAL-05** | Departure Date | `planned_departure_date ≥ MAX(delivery_date)` | "Departure cannot be before latest delivery date." |
| **VAL-06** | Edit Lock | `actual_departure_date IS NULL` | "Cannot edit. Shipment has already departed." |

### 6.2 Calculation Rules

| Calculation | Formula | Usage |
|-------------|---------|-------|
| Available to Ship | `delivered_qty - COALESCE(shipped_qty, 0)` | Display in selection UI |
| Total Shipment Weight | `SUM(shipped_qty × product.unit_weight_kg)` | Auto-populate weight field |
| Unshipped Aging | `CURRENT_DATE - actual_delivery_date` | Alert threshold: >14 days |
| Shipment Status | `CASE WHEN all deliveries fully_shipped THEN 'complete' ELSE 'partial' END` | Badge display |

---

## 7. ACCEPTANCE CRITERIA (GHERKIN SYNTAX)

### 7.1 Feature: Create Shipment from Deliveries

```gherkin
Scenario: User creates shipment by selecting full delivery quantities
  Given factory deliveries exist with the following data:
    | Delivery Number | SKU   | Delivered Qty | Shipped Qty |
    | DN-001         | SKU-A | 100          | 0           |
    | DN-002         | SKU-B | 50           | 0           |
  When the user navigates to "Create Shipment" page
  And the user selects deliveries "DN-001" and "DN-002"
  And the user accepts default quantities (100 for SKU-A, 50 for SKU-B)
  And the user fills tracking number "TRK-2025-001"
  And the user clicks "Create Shipment"
  Then a new shipment "TRK-2025-001" is created
  And shipment contains 2 items (SKU-A: 100, SKU-B: 50)
  And junction table has 2 records linking deliveries to shipment items
  And delivery "DN-001" status updates to "fully_shipped"
  And delivery "DN-002" status updates to "fully_shipped"
  And user sees success message: "Shipment created successfully"

Scenario: User ships partial quantity from delivery
  Given delivery "DN-003" exists with:
    | SKU   | Delivered Qty | Shipped Qty |
    | SKU-C | 100          | 0           |
  When the user selects delivery "DN-003"
  And the user changes ship quantity to "30"
  And the user creates shipment "TRK-2025-002"
  Then shipment "TRK-2025-002" contains SKU-C with quantity 30
  And delivery "DN-003" shipped_qty updates to 30
  And delivery "DN-003" status updates to "partial"
  And delivery "DN-003" still appears in "Unshipped Deliveries" list with available qty 70

Scenario: User attempts to ship more than delivered quantity
  Given delivery "DN-004" exists with:
    | SKU   | Delivered Qty | Shipped Qty |
    | SKU-D | 50           | 0           |
  When the user selects delivery "DN-004"
  And the user inputs ship quantity "60"
  Then the system shows error: "Cannot ship 60 units. Only 50 available from delivery DN-004."
  And the "Create Shipment" button is disabled
  And no shipment is created

Scenario: User edits shipment quantities before departure
  Given shipment "TRK-2025-003" exists with:
    | SKU   | Shipped Qty | Departure Date |
    | SKU-E | 40          | NULL           |
  And linked to delivery "DN-005" (delivered_qty: 100)
  When the user navigates to shipment detail page
  And the user clicks "Edit Quantities"
  And the user changes SKU-E quantity to "60"
  And the user saves changes
  Then shipment item quantity updates to 60
  And junction table record updates shipped_qty to 60
  And delivery "DN-005" shipped_qty updates to 60

Scenario: User cannot edit shipment after departure
  Given shipment "TRK-2025-004" exists with:
    | SKU   | Shipped Qty | Actual Departure Date |
    | SKU-F | 30          | 2025-12-05            |
  When the user navigates to shipment detail page
  Then the "Edit Quantities" button is hidden
  And all quantity fields are read-only
  And user sees warning: "Shipment has departed. Contact admin to modify."
```

### 7.2 Feature: View Unshipped Deliveries

```gherkin
Scenario: User views unshipped deliveries dashboard
  Given the following deliveries exist:
    | Delivery Number | SKU   | Delivered Qty | Shipped Qty | Delivery Date |
    | DN-010         | SKU-G | 100          | 0           | 2025-11-20    |
    | DN-011         | SKU-H | 50           | 30          | 2025-11-25    |
    | DN-012         | SKU-I | 80           | 80          | 2025-11-30    |
  When the user navigates to "Unshipped Deliveries" page
  Then the user sees 2 delivery records (DN-010, DN-011)
  And delivery "DN-012" is not displayed (fully shipped)
  And KPI card shows:
    | Metric                | Value |
    | Total Unshipped       | 2     |
    | Total Unshipped Qty   | 120   |
  And delivery "DN-010" row is highlighted red (age > 14 days)
  And delivery "DN-011" row is highlighted yellow (age 8-14 days)

Scenario: User filters unshipped deliveries by aging
  Given 10 unshipped deliveries exist with ages: 5, 9, 12, 16, 20, 3, 18, 7, 11, 22 days
  When the user selects filter "Critical (>14 days)"
  Then the user sees 4 deliveries (ages: 16, 20, 18, 22)
  And KPI card updates to reflect filtered data

Scenario: User traces shipment to source deliveries
  Given shipment "TRK-2025-005" exists with:
    | SKU   | Shipped Qty |
    | SKU-J | 80          |
  And linked to deliveries:
    | Delivery Number | Shipped from This Delivery |
    | DN-020         | 50                         |
    | DN-021         | 30                         |
  When the user navigates to shipment detail page
  Then the user sees "Source Deliveries" section with 2 rows:
    | Delivery Number | PO Number | Shipped Qty |
    | DN-020         | PO-001    | 50          |
    | DN-021         | PO-002    | 30          |
  And each Delivery Number is a clickable link
  And clicking "DN-020" navigates to delivery detail page
```

---

## 8. NON-FUNCTIONAL REQUIREMENTS

### 8.1 Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Page Load Time (Unshipped Deliveries List) | <2 seconds for 1000 records | P95 latency |
| Shipment Creation Time | <3 seconds for 10 items | End-to-end transaction |
| Junction Table Query Performance | <500ms for traceability view | Index-backed query |
| Concurrent Users | Support 20 simultaneous shipment creations | Load testing |

### 8.2 Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Role-Based Access | Only users with `logistics_coordinator` role can create/edit shipments |
| Audit Trail | Log all shipment creation/edit actions with user ID and timestamp |
| Data Integrity | Use database transactions to ensure atomic updates across 3 tables |
| Permission Checks | Validate user permissions in RLS policies for `delivery_shipment_items` table |

### 8.3 Usability Requirements

- **Mobile Responsiveness:** Unshipped deliveries list must be usable on iPad (tablet view).
- **Keyboard Shortcuts:** Support Enter key to submit shipment, Esc to cancel.
- **Undo Action:** Allow deletion of shipments before departure (reverts delivery status).
- **Inline Validation:** Show real-time error messages as user types quantity.

---

## 9. EDGE CASES & ERROR HANDLING

### 9.1 Edge Case Matrix

| Edge Case | Expected Behavior | Error Message (if applicable) |
|-----------|-------------------|-------------------------------|
| User selects delivery with 0 available qty | Delivery is disabled (grayed out) in selection list | N/A (prevention via UI) |
| Delivery is deleted after shipment creation | Shipment remains valid; show warning in lineage view | "Source delivery DN-XXX has been deleted" |
| User creates 2 simultaneous shipments for same delivery | Second transaction fails with optimistic lock error | "Delivery quantities have changed. Please refresh and retry." |
| Network timeout during shipment creation | Transaction rolls back; user sees retry prompt | "Request timed out. Your shipment was not created. Retry?" |
| SKU mismatch between delivery and shipment item | Backend validation rejects request | "SKU mismatch detected. Contact support." |
| User inputs negative quantity | Frontend blocks input; backend rejects if bypassed | "Quantity must be greater than 0" |
| Delivery has NULL delivery date | Exclude from "Unshipped Deliveries" list (data integrity issue) | N/A (filtered out) |

### 9.2 Rollback & Recovery

**Scenario: Shipment Deletion Before Departure**
- User action: Delete shipment "TRK-2025-010"
- System actions:
  1. Delete records from `delivery_shipment_items` (CASCADE deletes shipment_items)
  2. Trigger recalculates `production_deliveries.shipped_qty`
  3. Update delivery status from "fully_shipped" back to "partial" or "unshipped"
- Audit log: Record deletion action with reason (user-provided or default: "Shipment cancelled")

**Scenario: Partial Shipment Correction**
- User action: Edit shipment quantity from 50 to 40 (before departure)
- System actions:
  1. Update `delivery_shipment_items.shipped_qty`
  2. Trigger updates `production_deliveries.shipped_qty` (-10 units)
  3. Refresh "Unshipped Deliveries" view to show +10 available units

---

## 10. DEPENDENCIES & CONSTRAINTS

### 10.1 Technical Dependencies

- **Database:** PostgreSQL 14+ (requires JSONB support for shipment creation function)
- **ORM:** Supabase RPC functions (extend `create_shipment_with_items` to accept delivery links)
- **UI Framework:** ShadCN UI components (Table, Checkbox, Modal)
- **Charting:** Not required for this feature

### 10.2 Cross-Feature Dependencies

| Dependent Feature | Impact | Mitigation |
|-------------------|--------|------------|
| PO Fulfillment Tracking | Must ensure delivery status updates don't break existing PO fulfillment logic | Integration testing |
| Inventory Projection Algorithm | Shipment quantities must feed into arrival calculations | Update algorithm to read from junction table |
| Payment Tracking | Logistics payment due date depends on arrival date | No schema changes needed |

### 10.3 Migration Path

**Phase 1: Schema Migration (Week 1)**
- Create `delivery_shipment_items` junction table
- Add `shipped_qty`, `shipment_status` columns to `production_deliveries`
- Create database triggers for auto-updates
- Backfill existing data (infer linkages from batch codes if possible, else mark as "legacy")

**Phase 2: Backend Implementation (Week 2)**
- Extend `create_shipment_with_items` RPC function
- Implement validation rules
- Create database views for queries

**Phase 3: Frontend Implementation (Week 3)**
- Build selection UI
- Build unshipped deliveries dashboard
- Update shipment detail page

**Phase 4: Testing & Rollout (Week 4)**
- UAT with 3 logistics coordinators
- Load testing with 1000+ delivery records
- Gradual rollout (10% → 50% → 100% of users)

---

## 11. OUT OF SCOPE

The following are explicitly NOT included in this feature:

1. **Automatic Shipment Creation:** No AI-driven auto-consolidation of deliveries. User must manually select.
2. **Multi-Warehouse Shipments:** One shipment = one destination warehouse (as per existing constraint).
3. **Shipment Splitting:** Cannot split an already-created shipment into two. User must delete and recreate.
4. **Real-Time Shipment Tracking Integration:** No integration with 3PL APIs for live tracking status.
5. **Cost Allocation by Delivery:** Logistics cost remains at shipment level, not split by source delivery.
6. **Historical Data Cleanup:** Legacy shipments (created before this feature) will not be retroactively linked.

---

## 12. GLOSSARY

| Term | Definition |
|------|------------|
| **Factory Delivery** | Goods shipped from supplier factory to logistics provider (recorded in `production_deliveries`) |
| **Logistics Shipment** | Consolidated goods shipped from logistics provider to warehouse (recorded in `shipments`) |
| **Unshipped Balance** | Quantity delivered but not yet included in any shipment |
| **Partial Shipment** | Shipment containing less than the full delivered quantity |
| **Junction Table** | Bridge table enabling N:N relationship between deliveries and shipments |
| **Denormalization** | Storing calculated values (like `shipped_qty`) in table for performance |
| **Traceability** | Ability to track a shipment back to its source PO and deliveries |
| **Optimistic Locking** | Concurrency control preventing simultaneous edits to same record |

---

## 13. APPENDIX: DATA FLOW DIAGRAMS

### 13.1 Data Flow: Create Shipment

```
User Action:
  Select Deliveries → Input Quantities → Fill Shipment Form → Submit

Backend Process:
  1. Validate quantities (ship_qty ≤ available_qty)
  2. BEGIN TRANSACTION
  3. INSERT INTO shipments (...)
  4. INSERT INTO shipment_items (...)
  5. INSERT INTO delivery_shipment_items (link delivery → shipment_item)
  6. TRIGGER updates production_deliveries.shipped_qty
  7. TRIGGER updates production_deliveries.shipment_status
  8. COMMIT TRANSACTION
  9. Return success response

Frontend Update:
  - Show success toast
  - Redirect to shipment detail page
  - Refresh "Unshipped Deliveries" list (remove fully shipped items)
```

### 13.2 Query Flow: Unshipped Deliveries List

```
User Request:
  Navigate to /logistics/unshipped-deliveries

Backend Query:
  SELECT *
  FROM v_unshipped_deliveries
  WHERE unshipped_qty > 0
  ORDER BY days_since_delivery DESC
  LIMIT 100

View Definition:
  SELECT
    pd.id AS delivery_id,
    pd.delivery_number,
    po.po_number,
    pd.sku,
    p.product_name,
    pd.delivered_qty,
    COALESCE(pd.shipped_qty, 0) AS shipped_qty,
    (pd.delivered_qty - COALESCE(pd.shipped_qty, 0)) AS unshipped_qty,
    pd.actual_delivery_date AS delivery_date,
    (CURRENT_DATE - pd.actual_delivery_date) AS days_since_delivery,
    s.supplier_name
  FROM production_deliveries pd
  JOIN purchase_order_items poi ON pd.po_item_id = poi.id
  JOIN purchase_orders po ON poi.po_id = po.id
  JOIN products p ON pd.sku = p.sku
  LEFT JOIN suppliers s ON po.supplier_id = s.id
  WHERE pd.actual_delivery_date IS NOT NULL

Frontend Render:
  - Map data to Table component
  - Apply color coding based on days_since_delivery
  - Render KPI cards with aggregated metrics
```

---

## 14. QUESTIONS FOR STAKEHOLDERS

Before proceeding to design phase, Product Director requires clarification on:

1. **Business Priority:** What is the acceptable lag between factory delivery and shipment creation? (e.g., target: ship within 7 days of delivery?)
2. **Cost Allocation:** Should logistics cost be split proportionally across linked deliveries, or remain at shipment level?
3. **Historical Data:** How should we handle shipments created before this feature launches? Ignore or attempt to infer linkages?
4. **Permission Model:** Should only Logistics Coordinators create shipments, or also Supply Chain Managers?
5. **Notification Rules:** Should system send auto-alerts for deliveries awaiting shipment >14 days?
6. **SKU Mixing:** Is it acceptable for one shipment to contain multiple different SKUs? (Assuming yes based on current `shipment_items` structure)

---

## 15. SIGN-OFF

This document requires approval from:

- [ ] **Supply Chain Director:** Business logic validation
- [ ] **Logistics Manager:** User story confirmation
- [ ] **System Architect:** Feasibility review (before design phase)
- [ ] **Engineering Lead:** Effort estimation (after design phase)

**Next Steps:**
Once approved, System Architect will create `/specs/shipment-delivery-linkage/design.md` covering:
- Detailed ER diagram for junction table
- RLS policies for `delivery_shipment_items`
- Extended `create_shipment_with_items` RPC function signature
- Migration scripts for schema changes
- API contracts for frontend-backend communication

---

**Document Version History:**
- v1.0 (2025-12-08): Initial draft by Product Director
