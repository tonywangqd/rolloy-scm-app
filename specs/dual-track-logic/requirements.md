# Business Logic Requirements: Dual-Track System (Planned vs Actual)

**Document Version:** 1.0
**Date:** 2025-12-02
**Author:** Product Director
**Status:** Final Specification

---

## Executive Summary

This document defines the **authoritative business logic** for handling "Planned vs Actual" data across the supply chain lifecycle. It addresses the critical question: **"Which date should drive inventory projections and payment calculations?"**

### Core Principle: Progressive Realization

```
The system follows a "Progressive Realization" model:
- Use ACTUAL data when available (highest fidelity)
- Fall back to PLANNED data when actual has not yet occurred
- Apply this consistently across ALL phases
```

---

## 1. Context & Business Goals

### 1.1 Problem Statement

The Rolloy SCM system manages a multi-stage supply chain:

1. **PO Ordering** (Purchase Order) → Supplier receives order
2. **Production Delivery** (交货) → Factory completes production and hands off goods
3. **Shipment Departure** (发货) → Goods leave China port/warehouse
4. **Warehouse Arrival** (到仓) → Goods arrive at US warehouse (FBA/3PL)

Each stage has **both planned dates and actual dates**. The business needs to:

- **Project inventory accurately** using the best available information
- **Calculate payment schedules** based on contractual terms
- **Identify delays and risks** by comparing planned vs actual
- **Maintain data integrity** as information becomes available over time

### 1.2 Business Impact

**High accuracy forecasting** enables:
- Reduced stockout risk (improved customer satisfaction)
- Optimized working capital (reduced overstocking)
- Accurate cash flow projections (financial planning)
- Early warning system (operational agility)

---

## 2. User Stories

### US-1: Inventory Planner - Projection Accuracy

**As an** Inventory Planner
**I want to** see inventory projections based on the MOST CURRENT information
**So that** I can make accurate replenishment decisions

**Acceptance Criteria:**
- GIVEN a shipment has `actual_arrival_date` filled
  - WHEN I view inventory projection for that week
  - THEN the incoming quantity uses `actual_arrival_date`
- GIVEN a shipment has ONLY `planned_arrival_date`
  - WHEN I view inventory projection
  - THEN the incoming quantity uses `planned_arrival_date`
- GIVEN a shipment's actual arrival is delayed by 2 weeks
  - WHEN the actual date is updated
  - THEN inventory projections automatically reflect the delay

### US-2: Finance Manager - Payables Forecasting

**As a** Finance Manager
**I want to** see projected payables based on contractual payment terms
**So that** I can plan cash flow and ensure timely payments

**Acceptance Criteria:**
- GIVEN a production delivery has `actual_delivery_date` = "2025-01-15"
  - AND payment terms = "60 days from delivery"
  - WHEN I view payables schedule
  - THEN payment due date = "2025-03-31" (last business day of month after 60 days)
- GIVEN a shipment arrives on "2025-01-10" (`actual_arrival_date`)
  - AND arrival is before 15th of month
  - WHEN I view logistics payables
  - THEN payment due date = "2025-02-15"

### US-3: Operations Manager - Delay Visibility

**As an** Operations Manager
**I want to** see deviations between planned and actual timelines
**So that** I can identify bottlenecks and improve supplier performance

**Acceptance Criteria:**
- GIVEN a PO with `planned_ship_date` = "2025-01-20"
  - AND shipment `actual_departure_date` = "2025-01-27"
  - WHEN I view PO fulfillment report
  - THEN I see "Delayed by 7 days" indicator
- GIVEN a dashboard view
  - WHEN I filter by "Delayed Shipments"
  - THEN I see all shipments where `actual_departure_date > planned_departure_date`

---

## 3. Data Model Relationships

### 3.1 Current Schema (Verified from codebase)

```
purchase_orders (1) ──┬──> (M) purchase_order_items
                      │
                      ├──> (M) production_deliveries
                      │         └─[po_item_id]
                      │
                      └──> (M) shipments
                                ├─[production_delivery_id] (nullable)
                                └──> (M) shipment_items
```

### 3.2 Key Insight: Shipment-to-Delivery Link

**Current State:** The `shipments` table has a `production_delivery_id` column (nullable).

**Design Decision: OPTIONAL Linking**

#### Option A: Strict Linking (Rejected)
- Every shipment MUST reference a production_delivery
- **Problem:** Blocks partial shipments, complicates data entry
- **Problem:** Forces users to create deliveries before knowing shipment details

#### Option B: Flexible Linking (RECOMMENDED)
- `production_delivery_id` remains **nullable**
- Users CAN link shipments to deliveries when the relationship is 1:1 or clear
- System allows "orphan" shipments for:
  - Partial shipments from one delivery
  - Consolidated shipments from multiple deliveries
  - Shipments created before delivery records

**Business Rule Matrix:**

| Scenario | production_delivery_id | Inventory Calculation | Use Case |
|----------|----------------------|----------------------|----------|
| Simple 1:1 fulfillment | Set (UUID) | Uses shipment arrival dates | Factory ships entire PO item in one batch |
| Partial shipment | NULL | Uses shipment arrival dates | Factory splits 1000 units into 2 shipments |
| Consolidated shipment | NULL | Uses shipment arrival dates | Multiple PO items combined in one container |
| Pre-delivery shipment entry | NULL | Uses shipment arrival dates | Logistics team enters tracking before delivery confirmation |

---

## 4. Dual-Track Logic: Field-by-Field Specification

### 4.1 Sales Data (Already Implemented Correctly)

**Source:** `sales_forecasts` (planned) + `sales_actuals` (actual)

```sql
-- Current implementation (from v_inventory_projection_12weeks)
effective_sales = COALESCE(
  NULLIF(SUM(sales_actuals.actual_qty), 0),
  SUM(sales_forecasts.forecast_qty)
)
```

**Rule:** If ANY channel has actual sales data for a week, use actuals for all channels in that week (aggregate).

---

### 4.2 Purchase Orders (PO)

| Field | Type | Used For | Fallback Logic |
|-------|------|----------|----------------|
| `planned_order_date` | DATE | Order tracking, supplier performance | Display only |
| `actual_order_date` | DATE | Payment calculation start point | Display only |
| `planned_ship_date` | DATE | Delay detection, production monitoring | Display only |

**Notes:**
- PO dates do NOT directly affect inventory calculations
- Used for reporting and supplier KPI tracking

---

### 4.3 Production Deliveries (Factory Handoff)

| Field | Type | Used For | Effective Value |
|-------|------|----------|-----------------|
| `planned_delivery_date` | DATE | Production schedule tracking | `COALESCE(actual_delivery_date, planned_delivery_date)` |
| `actual_delivery_date` | DATE | Payment due date calculation (procurement) | Authoritative when set |
| `delivered_qty` | INTEGER | PO fulfillment tracking | Always actual |
| `unit_cost_usd` | NUMERIC | Payment amount calculation | Contract price |

**Payment Rule (Procurement):**
```
Payment Due Date = Last day of (delivery_month + 2 months)
delivery_month = DATE_TRUNC('month', COALESCE(actual_delivery_date, planned_delivery_date))

Example:
  actual_delivery_date = 2025-01-15
  → delivery_month = 2025-01-01
  → payment_due_date = 2025-03-31 (last day of March)
```

**Business Rationale:**
- Payment is triggered by ACTUAL delivery (when goods physically handed over)
- If actual date not recorded, use planned date for provisional cash flow forecast
- Once actual date is entered, payment date updates automatically

---

### 4.4 Shipments (In-Transit)

| Field | Type | Used For | Effective Value |
|-------|------|----------|-----------------|
| `planned_departure_date` | DATE | Shipping schedule monitoring | `COALESCE(actual_departure_date, planned_departure_date)` |
| `actual_departure_date` | DATE | Transit time calculation | Authoritative when set |
| `planned_arrival_date` | DATE | Inventory projection (provisional) | Used if actual_arrival_date NULL |
| `actual_arrival_date` | DATE | **Inventory projection (authoritative)** | **Primary driver for inventory** |
| `weight_kg` | NUMERIC | Logistics cost calculation | Actual weight |
| `cost_per_kg_usd` | NUMERIC | Freight cost calculation | Contract rate |

**Inventory Projection Rule:**
```sql
-- From current implementation (lines 152-160 in view)
effective_arrival_date = COALESCE(actual_arrival_date, planned_arrival_date)
arrival_week_iso = get_week_iso(effective_arrival_date)

-- Incoming quantity allocated to arrival_week_iso
incoming_qty[week] = SUM(shipment_items.shipped_qty
                         WHERE arrival_week_iso = week)
```

**Payment Rule (Logistics):**
```
Payment Due Date = CASE
  WHEN DAY(effective_arrival_date) <= 15
    THEN DATE_TRUNC('month', effective_arrival_date) + 1 month + 14 days
  ELSE
    LAST_DAY(DATE_TRUNC('month', effective_arrival_date) + 1 month)
END

Examples:
  actual_arrival_date = 2025-01-10 (≤15) → payment_due = 2025-02-15
  actual_arrival_date = 2025-01-20 (>15)  → payment_due = 2025-02-28
  actual_arrival_date = NULL, planned = 2025-01-18 → payment_due = 2025-02-28
```

---

## 5. Critical Data Flow: Inventory Projection

### 5.1 Formula (Week-by-Week)

```
Closing Stock[W] = Opening Stock[W] + Incoming[W] - Effective Sales[W]

Where:
  Opening Stock[W] = Closing Stock[W-1]  (for W=0, read from inventory_snapshots)

  Incoming[W] = SUM(
                  shipment_items.shipped_qty
                  WHERE get_week_iso(
                          COALESCE(shipments.actual_arrival_date,
                                   shipments.planned_arrival_date)
                        ) = W
                )

  Effective Sales[W] = COALESCE(
                         SUM(sales_actuals.actual_qty WHERE week_iso = W),
                         SUM(sales_forecasts.forecast_qty WHERE week_iso = W)
                       )
```

### 5.2 Implementation Status

**CURRENT STATE (Verified from code):**
- Already implemented correctly in `v_inventory_projection_12weeks` (lines 149-161)
- Uses `COALESCE(actual_arrival_date, planned_arrival_date)` for incoming qty
- This is the **correct behavior** - NO CHANGES NEEDED

### 5.3 Risk Status Classification

```
Stock Status = CASE
  WHEN closing_stock < 0                      THEN 'Stockout'
  WHEN closing_stock < safety_stock_threshold THEN 'Risk'
  ELSE                                             'OK'
END

safety_stock_threshold = avg_weekly_sales * safety_stock_weeks
```

---

## 6. Payment Calculation Logic

### 6.1 Procurement Payables (from Production Deliveries)

**Data Source:** `production_deliveries` table

**Calculation Logic:**

```sql
-- Computed fields (should be in database as generated columns or view)
delivery_month = DATE_TRUNC('month',
                            COALESCE(actual_delivery_date, planned_delivery_date))

total_value_usd = delivered_qty * unit_cost_usd

payment_due_date = (delivery_month + INTERVAL '2 months' - INTERVAL '1 day')::DATE
                   -- Last day of month, 2 months after delivery

payment_month = DATE_TRUNC('month', payment_due_date)

payment_status = CASE
  WHEN actual_delivery_date IS NULL THEN 'Pending'
  WHEN payment_due_date > CURRENT_DATE THEN 'Scheduled'
  ELSE 'Due'
END
```

**Example Scenarios:**

| actual_delivery_date | planned_delivery_date | Effective Date | Payment Due | Payment Month | Status |
|---------------------|----------------------|----------------|-------------|---------------|--------|
| 2025-01-15 | 2025-01-10 | 2025-01-15 | 2025-03-31 | 2025-03 | Scheduled |
| NULL | 2025-02-20 | 2025-02-20 | 2025-04-30 | 2025-04 | Pending |
| 2025-01-31 | 2025-01-25 | 2025-01-31 | 2025-03-31 | 2025-03 | Scheduled |

---

### 6.2 Logistics Payables (from Shipments)

**Data Source:** `shipments` table

**Calculation Logic:**

```sql
-- Computed fields
effective_arrival_date = COALESCE(actual_arrival_date, planned_arrival_date)

arrival_day = EXTRACT(DAY FROM effective_arrival_date)

freight_cost_usd = weight_kg * cost_per_kg_usd

total_cost_usd = freight_cost_usd + surcharge_usd - tax_refund_usd

payment_due_date = CASE
  -- Arrived before/on 15th → Pay on 15th of next month
  WHEN arrival_day <= 15 THEN
    (DATE_TRUNC('month', effective_arrival_date) + INTERVAL '1 month' + INTERVAL '14 days')::DATE

  -- Arrived after 15th → Pay on last day of next month
  ELSE
    (DATE_TRUNC('month', effective_arrival_date) + INTERVAL '2 months' - INTERVAL '1 day')::DATE
END

payment_month = DATE_TRUNC('month', payment_due_date)

payment_status = CASE
  WHEN actual_arrival_date IS NULL THEN 'Pending'
  WHEN payment_due_date > CURRENT_DATE THEN 'Scheduled'
  ELSE 'Due'
END
```

**Example Scenarios:**

| actual_arrival_date | planned_arrival_date | Effective Arrival | Arrival Day | Payment Due | Payment Month | Status |
|--------------------|---------------------|-------------------|-------------|-------------|---------------|--------|
| 2025-01-10 | 2025-01-08 | 2025-01-10 | 10 (≤15) | 2025-02-15 | 2025-02 | Scheduled |
| 2025-01-20 | 2025-01-18 | 2025-01-20 | 20 (>15) | 2025-02-28 | 2025-02 | Scheduled |
| NULL | 2025-02-12 | 2025-02-12 | 12 (≤15) | 2025-03-15 | 2025-03 | Pending |
| NULL | 2025-02-25 | 2025-02-25 | 25 (>15) | 2025-03-31 | 2025-03 | Pending |

---

## 7. State Transition Matrix

### 7.1 Production Delivery States

| Current State | Event | Next State | System Action |
|---------------|-------|------------|---------------|
| Planned | Factory confirms handoff | Actual | Set `actual_delivery_date`, update `payment_due_date` |
| Planned | Date passes without confirmation | Overdue | Flag for follow-up, retain `planned_delivery_date` |
| Actual | Payment processed | Paid | Update `payment_status` = 'Paid' |

### 7.2 Shipment States

| Current State | Event | Next State | System Action |
|---------------|-------|------------|---------------|
| Planned | Shipment departs | In Transit | Set `actual_departure_date` |
| In Transit | Goods arrive at warehouse | Arrived | Set `actual_arrival_date`, refresh inventory projections |
| Arrived | Payment processed | Paid | Update `payment_status` = 'Paid' |

---

## 8. Derived Metrics & Dashboards

### 8.1 KPI Definitions

| Metric | Calculation | Business Meaning |
|--------|-------------|------------------|
| **On-Time Delivery Rate** | `COUNT(actual_delivery_date <= planned_delivery_date) / COUNT(*)` | Supplier performance |
| **On-Time Shipment Rate** | `COUNT(actual_arrival_date <= planned_arrival_date) / COUNT(*)` | Logistics performance |
| **Average Delay (Days)** | `AVG(actual_arrival_date - planned_arrival_date)` WHERE `actual_arrival_date > planned_arrival_date` | Supply chain reliability |
| **Forecast Accuracy** | `1 - ABS(actual_qty - forecast_qty) / actual_qty` | Sales planning quality |
| **Inventory Turnover** | `SUM(effective_sales) / AVG(closing_stock)` | Capital efficiency |

### 8.2 Required Dashboard Views

**A. Financial Overview (资金管理)**
- **Data:** `v_pending_payables` view
- **Dimensions:** Payment Month, Payable Type (Procurement/Logistics)
- **Metrics:** Total Amount USD, Record Count
- **Filters:** Status (Pending/Scheduled/Due), Date Range

**B. Inventory Risk Dashboard (库存预测)**
- **Data:** `v_inventory_projection_12weeks` view
- **Dimensions:** SKU, Week ISO, Stock Status
- **Metrics:** Opening Stock, Incoming Qty, Effective Sales, Closing Stock
- **Filters:** Stock Status (All/Risk/Stockout), Week Offset

**C. Replenishment Suggestions (补货建议)**
- **Data:** `v_replenishment_suggestions` view
- **Dimensions:** Priority, Is Overdue
- **Metrics:** Suggested Order Qty, Days Until Deadline
- **Filters:** Priority, SKU, Deadline Range

---

## 9. Edge Cases & Error Handling

### 9.1 Missing Data Scenarios

| Scenario | System Behavior | User Guidance |
|----------|----------------|---------------|
| Shipment has NO planned_arrival_date and NO actual_arrival_date | Exclude from inventory projection, show warning | User must enter at least planned date |
| Production delivery has delivered_qty but no dates | Payment status = 'Pending', exclude from payables | User must confirm delivery date |
| Sales forecast exists but week is in past and no actual | Use forecast (with warning flag) | Data team should backfill actuals |

### 9.2 Data Integrity Constraints

**Database Constraints (to be enforced):**

```sql
-- Constraint 1: Actual date cannot be before planned date by more than 30 days
ALTER TABLE production_deliveries ADD CONSTRAINT chk_delivery_dates
CHECK (actual_delivery_date IS NULL
       OR planned_delivery_date IS NULL
       OR actual_delivery_date >= planned_delivery_date - INTERVAL '30 days');

-- Constraint 2: Shipment must have at least planned arrival date
ALTER TABLE shipments ADD CONSTRAINT chk_arrival_dates
CHECK (planned_arrival_date IS NOT NULL);

-- Constraint 3: Delivered qty cannot exceed ordered qty
ALTER TABLE production_deliveries ADD CONSTRAINT chk_delivery_qty
CHECK (delivered_qty > 0);
```

---

## 10. Migration & Rollout Strategy

### 10.1 Phase 1: Validation (Current Sprint)

**Goal:** Verify existing implementation matches specification

**Tasks:**
1. System Architect reviews `v_inventory_projection_12weeks` SQL
2. QA Director runs test scenarios with sample data
3. Confirm payment calculation logic in database triggers/functions

**Success Criteria:**
- All test cases pass (see Section 11)
- No discrepancies between spec and implementation

### 10.2 Phase 2: Enhancement (If Needed)

**Potential Additions:**
1. Add generated columns for computed fields (`effective_arrival_date`, `payment_due_date`)
2. Create database triggers to auto-update payment status
3. Add audit log for date changes (track when actuals override planneds)

### 10.3 Phase 3: Documentation & Training

**Deliverables:**
1. User manual section: "How Planned vs Actual Dates Work"
2. Training video: "Understanding Inventory Projections"
3. FAQ document for common scenarios

---

## 11. Acceptance Criteria (Gherkin)

### AC-1: Inventory Projection Uses Effective Arrival Date

```gherkin
Feature: Inventory Projection Calculation

  Scenario: Shipment with actual arrival date
    Given a shipment with tracking_number "TRK001"
    And actual_arrival_date is "2025-02-10"
    And planned_arrival_date is "2025-02-05"
    And shipment_items includes SKU "SKU001" with shipped_qty 500
    When the inventory projection is calculated for week "2025-W06"
    Then the incoming_qty for SKU "SKU001" in week "2025-W06" includes 500 units
    And the incoming_qty for SKU "SKU001" in week "2025-W05" does NOT include those 500 units

  Scenario: Shipment with only planned arrival date
    Given a shipment with tracking_number "TRK002"
    And actual_arrival_date is NULL
    And planned_arrival_date is "2025-03-15"
    And shipment_items includes SKU "SKU002" with shipped_qty 300
    When the inventory projection is calculated for week "2025-W11"
    Then the incoming_qty for SKU "SKU002" in week "2025-W11" includes 300 units

  Scenario: Actual arrival date updated after initial projection
    Given a shipment initially had planned_arrival_date "2025-02-20"
    And inventory projections were calculated showing 1000 units in week "2025-W08"
    When actual_arrival_date is updated to "2025-03-05" (week "2025-W10")
    And inventory projections are refreshed
    Then incoming_qty for week "2025-W08" decreases by 1000 units
    And incoming_qty for week "2025-W10" increases by 1000 units
```

### AC-2: Procurement Payment Due Date Calculation

```gherkin
Feature: Procurement Payment Calculation

  Scenario: Delivery in mid-month with actual date
    Given a production_delivery with delivery_number "DEL001"
    And actual_delivery_date is "2025-01-15"
    And planned_delivery_date is "2025-01-12"
    And total_value_usd is 50000
    When payment_due_date is calculated
    Then payment_due_date equals "2025-03-31"
    And payment_month equals "2025-03-01"
    And payment_status equals "Scheduled"

  Scenario: Delivery at month-end with only planned date
    Given a production_delivery with delivery_number "DEL002"
    And actual_delivery_date is NULL
    And planned_delivery_date is "2025-02-28"
    And total_value_usd is 75000
    When payment_due_date is calculated
    Then payment_due_date equals "2025-04-30"
    And payment_month equals "2025-04-01"
    And payment_status equals "Pending"
```

### AC-3: Logistics Payment Due Date Calculation

```gherkin
Feature: Logistics Payment Calculation

  Scenario: Arrival before 15th of month
    Given a shipment with tracking_number "TRK003"
    And actual_arrival_date is "2025-01-10"
    And total_cost_usd is 8000
    When payment_due_date is calculated
    Then payment_due_date equals "2025-02-15"
    And payment_month equals "2025-02-01"

  Scenario: Arrival after 15th of month
    Given a shipment with tracking_number "TRK004"
    And actual_arrival_date is "2025-01-20"
    And total_cost_usd is 12000
    When payment_due_date is calculated
    Then payment_due_date equals "2025-02-28"
    And payment_month equals "2025-02-01"

  Scenario: Arrival on exactly 15th of month (boundary test)
    Given a shipment with tracking_number "TRK005"
    And actual_arrival_date is "2025-02-15"
    And total_cost_usd is 6000
    When payment_due_date is calculated
    Then payment_due_date equals "2025-03-15"
    And payment_month equals "2025-03-01"
```

### AC-4: Sales Effective Quantity (Dual-Track)

```gherkin
Feature: Sales Dual-Track Logic

  Scenario: Week with actual sales data
    Given sales_forecasts for SKU "SKU001" in week "2025-W10" total 500 units
    And sales_actuals for SKU "SKU001" in week "2025-W10" total 450 units
    When effective_sales is calculated for week "2025-W10"
    Then effective_sales equals 450 (uses actual)

  Scenario: Week with only forecast data
    Given sales_forecasts for SKU "SKU002" in week "2025-W12" total 800 units
    And sales_actuals for SKU "SKU002" in week "2025-W12" is empty
    When effective_sales is calculated for week "2025-W12"
    Then effective_sales equals 800 (uses forecast)
```

---

## 12. Non-Functional Requirements

### 12.1 Performance

- **Inventory projection refresh:** Must complete in < 30 seconds for 1000 SKUs
- **Payment calculation:** Real-time (sub-second) when viewing dashboards
- **Database queries:** All views must use indexed columns for WHERE clauses

### 12.2 Data Retention

- **Historical projections:** Retain calculated projections for 12 months (audit trail)
- **Date changes:** Log all updates to actual dates with timestamp and user

### 12.3 Security

- **RLS Policies:** All date-based calculations must respect Row Level Security
- **Audit logging:** Track who changed `actual_*_date` fields and when
- **Read-only views:** Materialized views should not be directly editable

---

## 13. Open Questions & Future Enhancements

### 13.1 Deferred to Future Sprints

1. **Multi-currency support:** Currently all amounts in USD - future need for CNY/EUR?
2. **Automated date updates:** Integration with logistics APIs to auto-fill `actual_arrival_date`
3. **Machine learning forecasts:** Replace manual forecast entry with ML predictions
4. **What-if scenarios:** Allow users to simulate delays and see impact on inventory

### 13.2 Dependencies

- **Date-fns library:** Frontend must use `getISOWeek()` consistently with PostgreSQL `TO_CHAR(date, 'IYYY-IW')`
- **Supabase RLS:** Payment views must enforce tenant isolation

---

## 14. Appendix: SQL Examples

### 14.1 Effective Arrival Date Query

```sql
-- Get incoming inventory for next 4 weeks (already implemented)
SELECT
  si.sku,
  get_week_iso(COALESCE(s.actual_arrival_date, s.planned_arrival_date)) AS arrival_week,
  SUM(si.shipped_qty) AS incoming_qty
FROM shipment_items si
INNER JOIN shipments s ON si.shipment_id = s.id
WHERE COALESCE(s.actual_arrival_date, s.planned_arrival_date)
      BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '4 weeks'
GROUP BY si.sku, arrival_week
ORDER BY arrival_week, si.sku;
```

### 14.2 Payables Summary Query

```sql
-- Procurement payables by month
SELECT
  DATE_TRUNC('month', payment_due_date) AS payment_month,
  COUNT(*) AS delivery_count,
  SUM(total_value_usd) AS total_amount_usd,
  payment_status
FROM production_deliveries
WHERE payment_status IN ('Scheduled', 'Due')
GROUP BY payment_month, payment_status
ORDER BY payment_month;

-- Logistics payables by month
SELECT
  DATE_TRUNC('month', payment_due_date) AS payment_month,
  COUNT(*) AS shipment_count,
  SUM(total_cost_usd) AS total_amount_usd,
  payment_status
FROM shipments
WHERE payment_status IN ('Scheduled', 'Due')
GROUP BY payment_month, payment_status
ORDER BY payment_month;
```

---

## 15. Glossary

| Term | Definition |
|------|------------|
| **Dual-Track** | System design pattern where both planned and actual values coexist, with actual overriding planned when available |
| **Effective Value** | The authoritative value chosen by `COALESCE(actual, planned)` logic |
| **Progressive Realization** | Process where planned data gradually converts to actual data as events occur |
| **ISO Week** | ISO 8601 week numbering system (format: YYYY-WNN, weeks start Monday) |
| **Safety Stock Threshold** | Minimum inventory level = avg_weekly_sales × safety_stock_weeks |
| **Stockout** | Inventory level below zero (cannot fulfill orders) |
| **Risk** | Inventory below safety threshold but above zero |
| **Payment Terms** | Contractual agreement defining when payment is due relative to delivery/arrival |

---

**Document Control:**
- **Next Review Date:** 2025-03-01
- **Approval Required From:** Technical Architect, Finance Manager, Operations Manager
- **Related Documents:**
  - `/Users/tony/Desktop/rolloy-scm/specs/dual-track-logic/design.md` (to be created by System Architect)
  - `/Users/tony/Desktop/rolloy-scm/supabase/migrations/20250130_create_inventory_projection_12weeks_view.sql` (existing implementation)
