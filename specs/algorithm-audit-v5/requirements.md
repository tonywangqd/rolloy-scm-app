# Algorithm Audit V5 - Product Requirements Document

**Document Version:** 1.0
**Created Date:** 2025-12-09
**Product Owner:** Product Director
**Status:** Draft

---

## 1. Executive Summary

### 1.1 Context & Business Goals

The Algorithm Audit V5 system is designed to provide comprehensive visibility and traceability into the Material Requirements Planning (MRP) process. The core problem we are solving is **the disconnect between planning logic and execution reality** in supply chain operations.

**Key Business Outcomes:**
1. **Transparency:** Enable stakeholders to understand WHY a purchase order was created at a specific time
2. **Accuracy:** Track the delta between planned vs actual execution across five document stages
3. **Optimization:** Identify systematic delays or inefficiencies in the supply chain timeline
4. **Compliance:** Provide audit trail for financial reconciliation and supplier performance review

### 1.2 Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Forecast Accuracy Rate | >85% | (Actual Sales / Forecasted Sales) per SKU-Week |
| On-Time Arrival Rate | >90% | (Arrived on Planned Week / Total Shipments) |
| Document Traceability | 100% | All POs linked to FO → PO → OF → OS → OA chain |
| PSI Calculation Accuracy | 100% | Manual spot-check vs system calculation |

---

## 2. Core Concepts & Domain Model

### 2.1 Time-Based Back-Scheduling Logic

The system operates on **ISO Week** as the fundamental time unit (`YYYY-WW` format). All planning calculations work backwards from the **Sales Demand Week**.

**Calculation Flow (Example for W50 Demand):**

```
Sales Demand Week:    W50  (Customer needs stock available)
    ↓ -1~2 weeks (buffer)
Arrival Week:         W48  (Stock arrives at warehouse)
    ↓ -5 weeks (sea freight)
Shipment Week:        W43  (Container leaves port)
    ↓ -1 week (loading)
Fulfillment Week:     W42  (Factory completes production)
    ↓ -5 weeks (production)
Purchase Week:        W37  (PO issued to supplier)
```

**Critical Business Rules:**
- **Buffer Week** (1-2 weeks): Accounts for customs clearance and warehouse processing
- **Transit Week** (5 weeks): Standard sea freight duration (configurable per route)
- **Loading Week** (1 week): Container stuffing and documentation
- **Production Week** (5 weeks): Manufacturing lead time (configurable per supplier/product)

**Derived Requirement:**
> The system MUST calculate all intermediate weeks deterministically based on configurable parameters: `buffer_weeks`, `transit_weeks`, `loading_weeks`, `production_weeks`.

---

### 2.2 Five-Document Flow (FO → PO → OF → OS → OA)

The supply chain execution is tracked through five sequential document types:

| Document Code | Full Name | Business Meaning | Responsible Party | Key Data |
|---------------|-----------|------------------|-------------------|----------|
| **FO** | Forecast Order | Sales demand signal (internal planning) | Demand Planning Team | `sku_id`, `demand_week`, `quantity`, `channel_id` |
| **PO** | Purchase Order | Commitment to supplier | Procurement Team | `po_number`, `supplier_id`, `order_date`, `planned_delivery_date` |
| **OF** | Order Fulfillment | Factory production completion | Supplier | `of_number`, `po_id`, `production_date`, `quantity_delivered` |
| **OS** | Order Shipment | Container shipped from origin port | Logistics Team | `os_number`, `shipment_date`, `eta`, `container_number` |
| **OA** | Order Arrived | Stock received at warehouse | Warehouse Team | `oa_number`, `arrival_date`, `quantity_received`, `warehouse_id` |

**Document Relationship Rules (MECE):**

#### Rule 1: PO → OF (Split Allowed)
- **Business Scenario:** Supplier delivers partial quantities due to production constraints
- **Logical Constraint:** `SUM(OF.quantity) ≤ PO.quantity`
- **Example:** PO-001 orders 10,000 units → OF-001 (6,000) + OF-002 (4,000)

#### Rule 2: OF → OS (Consolidation Allowed)
- **Business Scenario:** Multiple production batches combined into one container
- **Logical Constraint:** `SUM(OF.quantity linked to OS-X) ≥ OS.quantity`
- **Example:** OF-001 (6,000) + OF-003 (4,000) → OS-001 (10,000)

#### Rule 3: OS → OA (Split Allowed)
- **Business Scenario:** Container contents distributed to multiple warehouses
- **Logical Constraint:** `SUM(OA.quantity) ≤ OS.quantity`
- **Example:** OS-001 (10,000) → OA-001 (7,000 to Warehouse A) + OA-002 (3,000 to Warehouse B)

#### Rule 4: Traceability Chain
- **Must-Have:** Every OA must trace back to exactly ONE FO (original demand signal)
- **Path:** `OA → OS → OF → PO → FO`
- **Purpose:** Enable root-cause analysis (e.g., "This stockout was caused by late PO issued in W37")

---

### 2.3 PSI (Production-Sales-Inventory) Calculation Matrix

The PSI table is the **single source of truth** for inventory status. It reconciles planned vs actual data across a rolling 12-week horizon.

**Table Structure (Per SKU, Per Week, Per Warehouse):**

| Column | Formula | Data Source | Business Logic |
|--------|---------|-------------|----------------|
| **Week** | ISO Week (`YYYY-WW`) | System-generated | Current week + 12 weeks forward |
| **Beginning Inventory** | Previous week's Ending Inventory | Recursive from W-1 | Initial seed from `inventory_snapshots.quantity` |
| **Est. Arrival** | `SUM(OA.quantity)` WHERE `planned_arrival_week = current_week` | `purchase_orders.planned_delivery_date` back-calculated | Uses Back-Scheduling logic |
| **Actual Arrival** | `SUM(OA.quantity)` WHERE `actual_arrival_date IN current_week` | `production_deliveries.actual_arrival_date` | Only populated for past weeks |
| **Total Supply** | `Beginning Inventory + COALESCE(Actual Arrival, Est. Arrival)` | Calculated | Prioritizes actuals over estimates |
| **Sales Forecast** | `SUM(FO.quantity)` WHERE `demand_week = current_week` | `sales_forecasts.quantity` | Planned sales |
| **Actual Sales** | `SUM(sales_actuals.quantity)` WHERE `sales_week = current_week` | `sales_actuals.quantity` | Historical data |
| **Applied Sales** | `COALESCE(Actual Sales, Sales Forecast)` | Calculated | Defaults to forecast for future weeks |
| **Ending Inventory** | `Total Supply - Applied Sales` | Calculated | Carried forward to next week |
| **Weeks of Supply** | `Ending Inventory / AVG(Applied Sales, 4 weeks)` | Calculated | Inventory health indicator |

**Color-Coding Rules (Stock Status):**
- **Green (OK):** `Weeks of Supply ≥ safety_stock_weeks + 2`
- **Yellow (Risk):** `safety_stock_weeks ≤ Weeks of Supply < safety_stock_weeks + 2`
- **Red (Stockout):** `Weeks of Supply < safety_stock_weeks`

---

## 3. User Stories & Acceptance Criteria

### 3.1 Epic: Document Traceability

#### User Story 3.1.1: As a Demand Planner, I want to trace any warehouse arrival back to the original forecast, so that I can validate if the replenishment was based on accurate demand.

**Acceptance Criteria:**
```gherkin
Given I select an Order Arrival record (OA-12345)
When I click "View Traceability Chain"
Then I should see the full lineage:
  - FO-67890 (Demand Week: 2025-W50, Quantity: 10,000)
  - PO-23456 (Order Date: 2025-W37, Supplier: ABC Corp)
  - OF-34567 (Fulfillment Date: 2025-W42, Quantity: 10,000)
  - OS-45678 (Shipment Date: 2025-W43, ETA: 2025-W48)
  - OA-12345 (Arrival Date: 2025-W48, Quantity: 10,000)
And each step should display:
  - Planned Date vs Actual Date
  - Quantity Planned vs Quantity Actual
  - Deviation (in days and %)
```

#### User Story 3.1.2: As a Procurement Manager, I want to see all OF records linked to a PO, so that I can track partial deliveries from the supplier.

**Acceptance Criteria:**
```gherkin
Given PO-23456 has an ordered quantity of 15,000 units
When I view the PO detail page
Then I should see a "Fulfillment Progress" section with:
  - OF-001: 6,000 units (40%) - Delivered on 2025-W42
  - OF-002: 4,000 units (27%) - Delivered on 2025-W43
  - OF-003: 5,000 units (33%) - Planned for 2025-W44
  - Total Fulfilled: 10,000 / 15,000 (67%)
  - Status: "Partially Fulfilled"
And I should see a visual progress bar indicating 67% completion
```

---

### 3.2 Epic: PSI Calculation Accuracy

#### User Story 3.2.1: As a Supply Chain Analyst, I want the system to automatically calculate PSI tables for all active SKUs, so that I don't need to maintain Excel spreadsheets.

**Acceptance Criteria:**
```gherkin
Given I navigate to the "PSI Analysis" page
When the page loads
Then I should see a table with:
  - Rows: All SKUs where inventory > 0 OR future sales forecast exists
  - Columns: 12 weeks (current week + 11 future weeks)
  - Each cell displays: Ending Inventory and Weeks of Supply
And the table should:
  - Color-code cells based on stock status (Green/Yellow/Red)
  - Display a warning icon for any week projecting stockout
  - Allow filtering by Product Category, Channel, Warehouse
And the calculation should complete within 3 seconds for up to 500 SKUs
```

#### User Story 3.2.2: As a Finance Controller, I want to drill down into any PSI cell to see the detailed calculation, so that I can validate the numbers during audit.

**Acceptance Criteria:**
```gherkin
Given I click on the PSI cell for SKU "ABC-001", Week "2025-W50"
When the detail modal opens
Then I should see:
  1. Beginning Inventory: 5,000 units (from W49 ending)
  2. Est. Arrival: 3,000 units
     - PO-111: 1,500 units (planned arrival W50)
     - PO-222: 1,500 units (planned arrival W50)
  3. Actual Arrival: 2,800 units
     - OA-555: 1,500 units (arrived 2025-12-09)
     - OA-666: 1,300 units (arrived 2025-12-10)
  4. Total Supply: 7,800 units (5,000 + 2,800)
  5. Sales Forecast: 4,000 units
  6. Actual Sales: 0 units (future week)
  7. Applied Sales: 4,000 units (using forecast)
  8. Ending Inventory: 3,800 units
  9. Weeks of Supply: 2.1 weeks (3,800 / avg 4-week sales of 1,800)
And each line item should be clickable to navigate to the source record
```

---

### 3.3 Epic: Delta Analysis (Plan vs Actual)

#### User Story 3.3.1: As a Logistics Manager, I want to see a "Variance Report" comparing planned vs actual dates across all shipments, so that I can identify systematic delays.

**Acceptance Criteria:**
```gherkin
Given I open the "Shipment Variance Report"
When I select date range "2025-Q4"
Then I should see a table with:
  - Shipment ID
  - Planned Shipment Week
  - Actual Shipment Week
  - Variance (in weeks, e.g., "+2" for 2 weeks late)
  - Planned Arrival Week
  - Actual Arrival Week
  - Variance (in weeks)
And the report should:
  - Highlight shipments with variance > 1 week in red
  - Show aggregated stats: Avg Variance, Median Variance, On-Time Rate
  - Allow grouping by Supplier, Route, Product Category
And I should be able to export this report to Excel
```

#### User Story 3.3.2: As a Demand Planner, I want to see forecast accuracy per SKU, so that I can adjust future planning parameters.

**Acceptance Criteria:**
```gherkin
Given I navigate to "Forecast Accuracy Dashboard"
When I select the past 8 weeks
Then I should see a table with:
  - SKU ID
  - Total Forecasted Quantity (sum of 8 weeks)
  - Total Actual Sales Quantity
  - Accuracy Rate (%) = MIN(Actual / Forecast, 100%)
  - Bias = (Actual - Forecast) / Forecast (positive = under-forecast)
And the table should:
  - Sort by Accuracy Rate ascending (worst performers first)
  - Show a scatter plot: X-axis = Forecast, Y-axis = Actual
  - Highlight SKUs with Accuracy < 70% in red
And I should see aggregated metrics:
  - Portfolio-wide Accuracy Rate (weighted by sales volume)
  - % of SKUs with Accuracy > 85%
```

---

## 4. Business Rules Matrix

### 4.1 Document Quantity Integrity Rules

| Rule ID | Condition | Expected Behavior | Error Handling |
|---------|-----------|-------------------|----------------|
| **BR-001** | `SUM(OF.quantity WHERE po_id = X) > PO.quantity` | Reject new OF creation | Display error: "Total fulfilled quantity cannot exceed PO quantity" |
| **BR-002** | `SUM(OA.quantity WHERE shipment_id = Y) > OS.quantity` | Reject new OA creation | Display error: "Total arrived quantity cannot exceed shipment quantity" |
| **BR-003** | User attempts to delete PO with linked OF records | Prevent deletion | Display error: "Cannot delete PO with existing fulfillments. Archive instead." |
| **BR-004** | OF record has no linked PO | Reject OF creation | Display error: "Fulfillment must reference a valid Purchase Order" |

### 4.2 Time Logic Validation Rules

| Rule ID | Condition | Expected Behavior | Error Handling |
|---------|-----------|-------------------|----------------|
| **BR-101** | `OF.production_date < PO.order_date` | Flag as anomaly | Display warning: "Fulfillment date is earlier than PO order date" |
| **BR-102** | `OA.arrival_date < OS.shipment_date` | Reject OA creation | Display error: "Arrival date cannot be earlier than shipment date" |
| **BR-103** | `planned_arrival_week` deviates > 4 weeks from calculated week (via back-scheduling) | Display warning icon in UI | Tooltip: "Manual override detected. Original calculated week: W45" |

### 4.3 PSI Calculation Edge Cases

| Scenario | Handling Rule |
|----------|---------------|
| **No sales forecast for future week** | Assume Sales Forecast = 0 (display as blank cell, not zero) |
| **Negative ending inventory** | Display in red with "(Stockout)" label. Set Weeks of Supply = 0 |
| **Beginning inventory = 0 AND no planned arrivals** | Skip row from PSI table (no active supply chain activity) |
| **Multiple warehouses for same SKU** | Calculate PSI separately per warehouse. Provide a "Consolidated View" toggle |

---

## 5. Data Visualization Requirements

### 5.1 Traceability Flow Diagram

**Chart Type:** Horizontal Sankey Diagram

**Data Source Logic:**
- **Nodes:** FO → PO → OF → OS → OA (5 stages)
- **Edges:** Quantity flow between stages (thickness proportional to quantity)
- **Metrics:**
  - Total quantity at each stage
  - Quantity lost between stages (displayed as annotation)
  - Average time spent at each stage (displayed as label)

**Filters:**
- Date Range (e.g., "Orders placed in 2025-Q4")
- Product Category
- Supplier

**User Interaction:**
- Click on any node to see detailed records
- Hover over edge to see exact quantity and percentage

---

### 5.2 PSI Heatmap

**Chart Type:** Weekly Grid (Rows = SKUs, Columns = Weeks)

**Cell Color Logic:**
- **Green:** Weeks of Supply ≥ 6 weeks
- **Yellow:** 2 ≤ Weeks of Supply < 6 weeks
- **Red:** Weeks of Supply < 2 weeks
- **Gray:** No forecast or inventory (inactive SKU)

**Cell Content:**
- Primary: Ending Inventory (bold number)
- Secondary: Weeks of Supply (small text below)

**Filters:**
- Warehouse selector (dropdown)
- Product Category (multi-select)
- "Show only at-risk SKUs" toggle (hides all-green rows)

**Export:**
- "Export to Excel" button (downloads full 12-week PSI table with formulas)

---

### 5.3 Variance Trend Chart

**Chart Type:** Combo Chart (Bar + Line)

**X-Axis:** ISO Weeks (e.g., W45, W46, W47...)

**Y-Axis (Left):** Number of Shipments

**Y-Axis (Right):** On-Time Arrival Rate (%)

**Data Series:**
- **Blue Bars:** Total shipments arrived this week
- **Red Bars:** Shipments arrived late (variance > 0)
- **Green Line:** On-Time Rate (%) = (On-Time Shipments / Total Shipments) × 100

**Filters:**
- Date Range selector
- Supplier multi-select
- Route multi-select (e.g., "China → US West Coast")

**Insights Panel:**
- Display: "Avg Delay: 1.2 weeks" (calculated from variance)
- Display: "Most Delayed Route: China → Europe (avg +2.3 weeks)"

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Requirement | Target | Measurement Method |
|-------------|--------|-------------------|
| PSI Calculation (500 SKUs × 12 weeks) | < 3 seconds | Load time on "PSI Analysis" page |
| Traceability Chain Lookup (single record) | < 500ms | Click "View Chain" → Modal display |
| Variance Report Generation (1000 shipments) | < 5 seconds | Export to Excel completion time |

**Implementation Guidance for Engineers:**
- Use PostgreSQL materialized views for PSI calculations (refresh every 1 hour)
- Index foreign keys: `of.po_id`, `os.shipment_id`, `oa.shipment_id`
- Cache traceability chains in a junction table `audit_lineage` (updated via trigger)

---

### 6.2 Data Integrity

| Requirement | Validation Method |
|-------------|-------------------|
| Every OA must link to exactly one FO | Database foreign key constraint + weekly audit script |
| Sum of OF quantities ≤ PO quantity | Database check constraint OR application-level validation |
| No orphaned OF records (PO deleted but OF remains) | Cascade delete rule OR soft-delete pattern |

---

### 6.3 Scalability

**Expected Data Volume (Year 1):**
- Products: 500 SKUs
- Purchase Orders: 2,000 POs/year
- Fulfillments: 4,000 OF records/year (avg 2 per PO)
- Shipments: 1,500 OS records/year
- Arrivals: 3,000 OA records/year

**Growth Projection (Year 3):**
- 3× growth across all dimensions
- PSI table size: 500 SKUs × 52 weeks × 3 warehouses = 78,000 rows/year

**Database Strategy:**
- Partition `sales_actuals` table by year
- Archive audit records older than 2 years to cold storage
- Use time-series database (TimescaleDB extension) for weekly aggregates

---

## 7. Out of Scope (V5 Phase)

The following features are explicitly excluded from V5 to maintain focus:

1. **Multi-Currency Support:** All financial calculations assume single currency (RMB)
2. **Automated PO Generation:** System displays replenishment suggestions only; human approval required
3. **Supplier Portal Integration:** Suppliers manually report OF dates via CSV upload
4. **Real-Time Shipment Tracking:** OS/OA dates updated manually, not via API integration
5. **What-If Scenario Planning:** No simulation mode for testing different lead times

---

## 8. Success Criteria & Go-Live Checklist

### 8.1 Functional Acceptance

- [ ] All user stories (3.1.1 - 3.3.2) pass manual testing
- [ ] PSI calculations match Excel baseline for 20 sample SKUs
- [ ] Traceability chain displays correctly for 100 random OA records
- [ ] Variance report generates without errors for 6-month historical data

### 8.2 Data Migration Validation

- [ ] All existing PO/OF/OS/OA records imported with correct linkages
- [ ] Historical sales forecasts and actuals loaded for past 12 weeks
- [ ] Zero orphaned records in `audit_lineage` table

### 8.3 User Training

- [ ] 2-hour training session for Demand Planning team
- [ ] 1-hour training for Procurement team
- [ ] Written documentation: "PSI Calculation Guide" and "Traceability FAQ"

### 8.4 Performance Benchmarks

- [ ] PSI page load time < 3s (tested with 500 SKUs)
- [ ] Variance report export < 5s (tested with 1000 shipments)
- [ ] Database query optimization: all queries < 1s (checked via pg_stat_statements)

---

## 9. Open Questions & Assumptions

### 9.1 Assumptions

1. **ISO Week Boundary:** Week starts on Monday (ISO 8601 standard)
2. **Warehouse Assignment:** Each OA is assigned to exactly one warehouse (no cross-docking)
3. **Forecast Update Frequency:** Sales forecasts updated weekly (every Monday)
4. **Data Retention:** Audit records retained for 2 years, then archived

### 9.2 Questions for Stakeholders

| Question | Decision Needed By | Impact |
|----------|-------------------|--------|
| Should PSI calculation include in-transit inventory (OS without OA)? | Demand Planning Lead | Changes "Total Supply" formula |
| How to handle returns/damaged goods in OA quantity? | Warehouse Manager | May need `quantity_accepted` vs `quantity_received` |
| Should forecast accuracy exclude discontinued SKUs? | Product Manager | Affects dashboard metrics |
| What is the acceptable variance threshold for alerts? | Supply Chain Director | Defines "red" vs "yellow" thresholds |

---

## 10. Appendix: Terminology

| Term | Definition |
|------|------------|
| **Back-Scheduling** | Calculation method that works backwards from demand date to determine order date |
| **ISO Week** | Week numbering per ISO 8601 (W01-W53, week starts Monday) |
| **Safety Stock Weeks** | Minimum inventory buffer (e.g., 2 weeks) to prevent stockouts |
| **Weeks of Supply** | Inventory level divided by average weekly sales rate |
| **COALESCE** | SQL function that returns first non-null value (used for actual vs planned fallback) |
| **Materialized View** | Pre-computed database view that stores results for faster querying |

---

**Document Status:** Ready for System Architect Review
**Next Step:** Create `specs/algorithm-audit-v5/design.md` (Database Schema + API Contracts)
**Estimated Engineering Effort:** 4-6 weeks (1 Frontend + 1 Backend + 2 weeks testing)