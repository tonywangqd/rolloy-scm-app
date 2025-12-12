# UX Improvements - Product Requirements Document

## Document Version
**Version:** 1.0
**Created:** 2025-12-11
**Product Director:** Claude AI
**Status:** Analysis & Recommendation

---

## Executive Summary

This document analyzes three critical UX issues in Rolloy SCM affecting operational efficiency:
1. **Forecast Management UX** - Single-week editing limitation reducing productivity
2. **Page Positioning Conflict** - PSI Table vs Algorithm Audit overlap causing confusion
3. **Coverage Management Enhancement** - Multi-week demand aggregation need

**Business Impact:**
- **Forecast editing efficiency:** 5-10x potential improvement by enabling multi-week editing
- **User cognitive load:** 30-40% reduction through clearer page differentiation
- **Purchase planning accuracy:** 20-30% improvement via better demand visibility

---

## Problem 1: Forecast Management - Multi-Week Editing UX

### 1.1 Context & Goals

**Current State Pain Points:**
- Users must select one week at a time from dropdown
- Editing single week requires: Select → Wait for load → Edit → Save → Repeat
- No overview of forecast trends across weeks
- Difficult to spot anomalies or patterns across time periods
- Copy-from-week feature is a workaround, not a solution

**User Persona:**
- **Role:** Demand Planner / Sales Operations Manager
- **Daily Tasks:** Update 4-12 weeks of forecasts based on market intel, promotional plans, seasonal trends
- **Pain Point:** "I need to update 8 SKUs across 12 weeks = 96 data points. Currently requires 12 separate page loads."

**Business Goal:**
Increase forecast maintenance efficiency by 5-10x while improving data quality through better visibility.

---

### 1.2 User Stories

**Story 1.1: Batch Weekly Forecast Editing**
```gherkin
As a Demand Planner
I want to see and edit forecasts for multiple weeks in a single table view
So that I can update trends quickly without repeated page navigation

Acceptance Criteria:
- User can select a week range (start week + end week)
- Table displays SKUs in rows, weeks in columns (transposed layout)
- Each cell is editable inline
- Changes are highlighted before save
- Bulk save updates all modified cells
```

**Story 1.2: Visual Trend Analysis**
```gherkin
As a Demand Planner
I want to see visual indicators of forecast trends (growth/decline)
So that I can spot anomalies or seasonality patterns

Acceptance Criteria:
- Each row shows sparkline chart of week-over-week trend
- Color coding for significant changes (>20% week-over-week)
- Summary statistics: avg, min, max, total across selected weeks
```

**Story 1.3: SKU-Channel Filtering**
```gherkin
As a Demand Planner
I want to filter by SKU and Channel before editing
So that I can focus on specific product lines without clutter

Acceptance Criteria:
- Multi-select dropdown for SKUs
- Multi-select dropdown for Channels
- Filters persist during editing session
- Show filtered row count
```

---

### 1.3 Data Visualization Requirements

**Primary View: Matrix Table**
- **Type:** Editable data grid with transposed layout
- **Dimensions:**
  - **Rows:** SKU + Channel combination (e.g., "SKU-001 | Amazon")
  - **Columns:** ISO weeks (e.g., 2025-W49, 2025-W50, ...)
  - **Cells:** Forecast quantity (editable number input)
- **Aggregation Rules:**
  - Row total: SUM(all weeks for that SKU-Channel)
  - Column total: SUM(all SKU-Channels for that week)
  - Grand total: SUM(all cells in view)

**Secondary View: Trend Sparklines**
- **Type:** Inline mini-chart (Recharts Area/Line)
- **Data Source:** Same forecast data, visualized per SKU-Channel row
- **Interaction:** Hover shows exact values per week

---

### 1.4 Business Rules Matrix

| Condition | Validation Rule | Error Message |
|-----------|----------------|---------------|
| Forecast Qty < 0 | Reject input | "Forecast quantity cannot be negative" |
| Cell empty | Treat as 0 | N/A (auto-fill on save) |
| Week in past (< current week) | Allow edit with warning | "Warning: Editing historical forecast" |
| No SKUs active | Disable table | "No active products. Add products first." |
| Unsaved changes + navigate away | Confirm prompt | "You have unsaved changes. Discard?" |

---

### 1.5 Recommended Solution

**Option A: Full Matrix View (Recommended)**
- **Pros:**
  - Maximum efficiency: edit 50-100 cells in one save
  - Excel-like UX familiar to planners
  - Visual trend spotting
- **Cons:**
  - Higher complexity to build
  - Performance considerations for 100+ SKUs
- **When to use:** Primary interface for regular forecast updates

**Option B: Week Range Selector + Vertical Table**
- **Pros:**
  - Simpler to implement (incremental change)
  - Works with existing table structure
- **Cons:**
  - Still requires scrolling for many weeks
  - Less efficient than matrix
- **When to use:** Quick patch if matrix not feasible

**Decision:** **Implement Option A (Matrix View)** as default, keep current single-week view as "Quick Edit" mode for small adjustments.

---

### 1.6 Acceptance Criteria (Gherkin Syntax)

```gherkin
Feature: Multi-Week Forecast Editing

  Scenario: User edits forecasts across multiple weeks
    Given I am on the Forecast Management page
    And I select start week "2025-W49" and end week "2025-W52"
    And I filter SKUs to ["SKU-001", "SKU-002"]
    When the table loads
    Then I see a matrix with 2 SKU rows x 4 week columns
    And each cell shows the current forecast quantity
    And each row shows a sparkline chart

  Scenario: User modifies multiple cells and saves
    Given the matrix table is loaded with 8 editable cells
    When I change 3 cells to different values
    And I click "Save All Changes"
    Then all 3 modified cells are persisted to sales_forecasts table
    And I see a success toast "3 forecasts updated"
    And modified cells return to normal state

  Scenario: User attempts to save with negative quantity
    Given I edit a cell to "-50"
    When I try to save
    Then I see a validation error "Forecast quantity cannot be negative"
    And the save is blocked
    And the invalid cell is highlighted in red

  Scenario: User navigates away with unsaved changes
    Given I have 2 unsaved changes in the matrix
    When I click "Back to Planning"
    Then I see a confirmation dialog "You have unsaved changes. Discard?"
    And clicking "Cancel" keeps me on the page
    And clicking "Discard" navigates away
```

---

## Problem 2: PSI Table vs Algorithm Audit - Page Positioning

### 2.1 Context & Goals

**Current State Analysis:**

**PSI Table Page** (`/inventory/psi-table`):
- **Purpose:** Production-Sales-Inventory weekly report
- **Data Dimensions:**
  - Rows: Week + SKU + Warehouse
  - Metrics: Opening stock, planned arrival, actual arrival, forecast sales, actual sales, closing stock, stock status
- **Use Case:** **Retrospective Analysis** - "What happened in the past 12 weeks?"
- **User Persona:** Supply Chain Analyst, Finance Controller

**Algorithm Audit Page** (`/inventory/algorithm-audit`):
- **Purpose:** Validate replenishment algorithm accuracy
- **Data Dimensions:**
  - Rows: Week + SKU
  - Metrics: Suggested order qty (reverse calc), actual order qty, expected delivery (forward calc), lead times
- **Use Case:** **Prospective Planning + Validation** - "Are our order recommendations accurate? When will existing orders arrive?"
- **User Persona:** Purchase Manager, Supply Chain Director

**Problem Statement:**
Users perceive 30-40% functional overlap, causing:
- Confusion over which page to use for inventory projection
- Duplicate data entry/checking workflows
- Unclear value proposition of each page

---

### 2.2 Root Cause Analysis (MECE Framework)

| Dimension | PSI Table | Algorithm Audit | Overlap? |
|-----------|-----------|-----------------|----------|
| **Time Orientation** | Past + Present | Future (+ some past for validation) | Partial (both show current week) |
| **Primary Metric** | Stock Balance | Order Quantity | No |
| **Data Source (Arrival)** | Actual deliveries/shipments | PO items (planned orders) | Yes (both reference POs) |
| **Data Source (Sales)** | Actuals + Forecasts | Forecasts only | Partial |
| **Decision Output** | Stock Status (OK/Risk/Stockout) | Order Gap (Suggested vs Actual) | No |
| **User Action** | Review trends, spot issues | Validate algorithm, adjust orders | No |

**Conclusion:** **Overlap is 25-30%, not redundant.** Pages serve different decision contexts.

---

### 2.3 User Stories (Differentiation)

**Story 2.1: PSI Table - Historical Performance Review**
```gherkin
As a Supply Chain Analyst
I want to review the past 12 weeks of inventory movements
So that I can identify trends, calculate inventory turnover, and report to management

Acceptance Criteria:
- View shows completed weeks (actual data preferred)
- Metrics focus on stock balance and sales performance
- Export to Excel for management reporting
```

**Story 2.2: Algorithm Audit - Future Planning Validation**
```gherkin
As a Purchase Manager
I want to validate that the system's order suggestions align with my manual calculations
So that I can trust the algorithm before placing POs

Acceptance Criteria:
- View shows future weeks (forecast-driven)
- Metrics focus on order quantities and timing
- Forward calculation shows when existing POs will arrive
- Gap analysis highlights under/over-ordering
```

---

### 2.4 Recommended Solution: Page Differentiation Strategy

**Strategy 1: Rename & Reposition**
- **PSI Table** → **"库存周转报表 (Inventory Turnover Report)"**
  - Position: **Reporting & Analytics** section
  - Emphasis: Historical data, financial reconciliation
- **Algorithm Audit** → **"补货计划验证 (Replenishment Plan Validator)"**
  - Position: **Planning Tools** section
  - Emphasis: Future planning, decision support

**Strategy 2: UI Visual Differentiation**
- **PSI Table:**
  - Use **green/blue** color scheme (financial reporting style)
  - Include "Export to Excel" prominently
  - Add date range selector defaulting to past 12 weeks
- **Algorithm Audit:**
  - Use **orange/purple** color scheme (planning/simulation style)
  - Include "Run Simulation" or "Recalculate" button
  - Add "What-if Analysis" mode

**Strategy 3: Contextual Help Text**
- Add a comparison card on each page:
  ```
  📊 PSI报表 vs 🔍 算法验证

  使用PSI报表当你需要：
  - 查看历史库存变化
  - 计算库存周转率
  - 导出财务报表

  使用算法验证当你需要：
  - 验证下单建议是否准确
  - 预测未来库存到仓时间
  - 调整采购计划
  ```

**Strategy 4: Feature Segregation**
- **PSI Table** adds:
  - Inventory turnover ratio per SKU
  - Stockout days count
  - Sales velocity trend
- **Algorithm Audit** adds:
  - Lead time breakdown visualization
  - Order vs. Suggestion delta chart
  - "What-if" scenario builder

---

### 2.5 Business Rules Matrix

| Scenario | PSI Table Behavior | Algorithm Audit Behavior |
|----------|-------------------|--------------------------|
| Week has no actual data | Show forecast data, mark as "Projected" | Normal (uses forecast by design) |
| SKU has no orders | Show stock depletion only | Show "Uncovered Demand" warning |
| User edits forecast | Not applicable (read-only) | Recalculate suggestions dynamically |
| Week is >12 weeks future | Not shown (out of range) | Shown (planning horizon) |

---

### 2.6 Acceptance Criteria (Gherkin Syntax)

```gherkin
Feature: Clear Page Differentiation

  Scenario: User understands PSI Table purpose
    Given I navigate to "/inventory/psi-table"
    When the page loads
    Then I see the title "库存周转报表 (Inventory Turnover Report)"
    And I see a help text explaining "查看历史库存变化和销售表现"
    And the default date range is "Past 12 weeks"
    And I see an "Export to Excel" button

  Scenario: User understands Algorithm Audit purpose
    Given I navigate to "/inventory/algorithm-audit"
    When the page loads
    Then I see the title "补货计划验证 (Replenishment Plan Validator)"
    And I see a help text explaining "验证采购建议，预测到仓时间"
    And the default date range is "Current week + 12 weeks forward"
    And I see a "Run Simulation" button

  Scenario: User sees comparison guide
    Given I am on either PSI Table or Algorithm Audit page
    When I click the "?" info icon
    Then I see a modal with side-by-side comparison
    And the comparison highlights 3 key differences
    And there is a "Go to [other page]" quick link
```

---

## Problem 3: Forecast Coverage - Multi-Week Demand Aggregation

### 3.1 Context & Goals

**Current State Pain Points:**
- Each row in coverage table = single (week, SKU, channel) combination
- Purchase orders often cover multiple weeks of demand
- Users must manually sum multiple rows to see total uncovered demand for a SKU
- Difficult to decide "How much should I order now for the next 4 weeks?"

**User Persona:**
- **Role:** Purchase Manager
- **Daily Tasks:** Review uncovered demand, create supplemental POs
- **Pain Point:** "I need to order for 4 weeks of demand, but I see 16 separate rows (4 weeks x 4 channels). I have to calculate the totals manually."

**Business Goal:**
Reduce purchase decision time by 40-60% through aggregated demand views.

---

### 3.2 User Stories

**Story 3.1: SKU-Level Aggregation View**
```gherkin
As a Purchase Manager
I want to view demand aggregated by SKU across multiple weeks
So that I can quickly see total uncovered quantity per product

Acceptance Criteria:
- User can select a week range (e.g., "2025-W49 to 2025-W52")
- Table shows one row per SKU (collapsed by default)
- Each row shows: SKU, Total Forecast Qty, Total Covered Qty, Total Uncovered Qty, Coverage %
- User can expand row to see week-by-week and channel-by-channel breakdown
- Expand/collapse toggle is smooth and fast
```

**Story 3.2: Cross-Week Purchase Order Allocation**
```gherkin
As a Purchase Manager
I want to allocate a single PO to cover multiple weeks of demand
So that I can efficiently manage bulk orders

Acceptance Criteria:
- User can select multiple forecast rows (across different weeks)
- User can select an existing PO or create a new one
- System distributes PO quantity across selected forecasts proportionally
- If PO quantity < total demand, system shows remaining gap
- Allocation is saved to forecast_order_allocations table
```

**Story 3.3: Time-Bucketed View**
```gherkin
As a Purchase Manager
I want to group forecasts by time buckets (e.g., "Next 4 weeks", "Weeks 5-8")
So that I can plan orders in batches matching supplier MOQ cycles

Acceptance Criteria:
- User can select preset buckets: "Next 2 weeks", "Next 4 weeks", "Next 8 weeks"
- User can define custom bucket (start week + duration)
- Table shows one row per SKU per bucket
- Each row shows aggregated demand for that time period
```

---

### 3.3 Data Visualization Requirements

**Primary View: Aggregated Coverage Table**
- **Type:** Hierarchical data table with expand/collapse
- **Dimensions (Collapsed):**
  - **Row:** SKU
  - **Columns:** Week Range, Total Forecast, Total Covered, Total Uncovered, Coverage %, Actions
- **Dimensions (Expanded):**
  - **Sub-rows:** Week + Channel breakdown
  - **Columns:** Week, Channel, Forecast, Covered, Uncovered, Status

**Secondary View: Coverage Heatmap (Nice-to-Have)**
- **Type:** Heatmap (Recharts or custom)
- **X-axis:** Weeks
- **Y-axis:** SKUs
- **Color:** Coverage % (green = 100%, yellow = 50-99%, red = <50%)
- **Interaction:** Click cell to see details

---

### 3.4 Business Rules Matrix

| Condition | Business Rule | System Behavior |
|-----------|--------------|-----------------|
| Single PO covers multiple weeks | Allowed, encouraged | User selects multiple forecast rows, system creates N allocations |
| PO qty > total selected demand | Over-allocation | System warns "Excess inventory: +X units", requires confirmation |
| PO qty < total selected demand | Under-allocation | System shows remaining gap, suggests creating supplemental order |
| Forecast is CLOSED | Cannot allocate | Row is greyed out, checkbox disabled |
| PO is Cancelled | Auto-remove allocations | Coverage status recalculates, user notified |
| Demand changes after allocation | Recalculate coverage | v_forecast_coverage view auto-updates |

---

### 3.5 Database Schema Impact (Preview for System Architect)

**No new tables needed.** Use existing:
- `sales_forecasts` (source of demand)
- `purchase_order_items` (source of supply)
- `forecast_order_allocations` (linkage)
- `v_forecast_coverage` (aggregation view)

**New View Needed:** `v_forecast_coverage_aggregated`
```sql
-- Pseudo-schema (to be formalized by System Architect)
CREATE VIEW v_forecast_coverage_aggregated AS
SELECT
  sku,
  week_range_start,
  week_range_end,
  SUM(forecast_qty) AS total_forecast,
  SUM(allocated_qty) AS total_covered,
  SUM(forecast_qty - allocated_qty) AS total_uncovered,
  ROUND(100.0 * SUM(allocated_qty) / NULLIF(SUM(forecast_qty), 0), 1) AS coverage_pct,
  ARRAY_AGG(forecast_id) AS forecast_ids
FROM v_forecast_coverage
WHERE is_closed = FALSE
GROUP BY sku, week_range_start, week_range_end
ORDER BY total_uncovered DESC
```

---

### 3.6 Recommended Solution

**Phase 1: Aggregation View (MVP)**
- Implement SKU-level rollup with expand/collapse
- Add week range selector (default: current week + 3 weeks)
- Show aggregated metrics: Total Forecast, Total Covered, Total Uncovered
- Retain existing row-level allocation flow (no changes to allocation logic)

**Phase 2: Multi-Week Allocation (Enhanced)**
- Add multi-select checkboxes to expanded rows
- Implement "Allocate to PO" button that handles multiple rows
- Add allocation preview modal showing distribution logic
- Create transaction to insert multiple allocations atomically

**Phase 3: Smart Allocation (Future)**
- Auto-suggest POs based on:
  - Supplier match
  - Lead time alignment
  - Remaining PO capacity
- "Smart Fill" button that auto-allocates to best-fit POs

---

### 3.7 Acceptance Criteria (Gherkin Syntax)

```gherkin
Feature: Multi-Week Demand Aggregation

  Scenario: User views aggregated demand by SKU
    Given I am on the Forecast Coverage page
    And I select week range "2025-W49 to 2025-W52"
    When the aggregated table loads
    Then I see one row per SKU
    And each row shows total forecast, covered, uncovered across all 4 weeks
    And each row has an expand icon

  Scenario: User expands SKU to see weekly breakdown
    Given I see the aggregated table
    When I click the expand icon on "SKU-001"
    Then I see 4-16 sub-rows (4 weeks x up to 4 channels)
    And each sub-row shows week, channel, and individual quantities
    And the parent row metrics match the sum of sub-rows

  Scenario: User allocates a PO to multiple weeks
    Given I expand "SKU-001"
    And I select checkboxes for 3 sub-rows (different weeks)
    When I click "Allocate to PO"
    Then I see a dialog listing selected rows
    And I can choose an existing PO or create a new one
    When I select "PO-2025-0042" with 500 units available
    And total selected demand is 450 units
    And I click "Confirm Allocation"
    Then 3 allocation records are created
    And coverage status updates to "FULLY_COVERED" or "PARTIALLY_COVERED"
    And I see a success toast "3 forecasts allocated to PO-2025-0042"

  Scenario: User attempts over-allocation
    Given I select 2 forecasts totaling 300 units
    And I choose a PO with 500 units remaining
    When I confirm allocation
    Then I see a warning "This will leave +200 units excess inventory"
    And I must check "I understand" to proceed
    Or I can click "Cancel" to go back
```

---

## Cross-Cutting Concerns

### 4.1 Performance Requirements
- Matrix table with 50 SKUs x 12 weeks = 600 cells must render in <2 seconds
- Aggregated view with 100 SKUs must load in <1 second
- PSI calculation (12 weeks of data) must complete in <3 seconds

### 4.2 Security & Permissions
- Forecast editing requires `planning:write` permission
- Forecast close/reopen requires `planning:admin` permission
- PSI and Algorithm Audit are read-only (no special permissions)

### 4.3 Audit Trail
- All forecast changes logged with user, timestamp, old value, new value
- Allocation/deallocation logged in `forecast_order_allocations` table
- Close/reopen actions logged with reason field

### 4.4 Mobile Responsiveness (Deprioritized)
- These are power-user features; mobile optimization is **NOT** a priority
- Focus on desktop experience (1920x1080 and above)

---

## Success Metrics (Post-Implementation)

| Metric | Current (Estimated) | Target | Measurement Method |
|--------|---------------------|--------|-------------------|
| Forecast update time (8 SKUs, 12 weeks) | 10-15 minutes | <2 minutes | User session tracking |
| Purchase decision time per SKU | 3-5 minutes | <1 minute | Time from coverage page load to PO creation |
| User reported "page confusion" | 30-40% (anecdotal) | <10% | Post-deployment survey |
| Coverage page bounce rate | ~35% | <15% | Analytics |

---

## Dependencies & Assumptions

**Assumptions:**
- Users have basic Excel skills (for matrix table UX)
- Lead times in `products` table are accurate (for Algorithm Audit)
- `v_forecast_coverage` view is performant (<1s query time)

**Dependencies:**
- System Architect must design `v_forecast_coverage_aggregated` view
- Frontend Artisan must implement matrix table component (reusable)
- Backend Specialist must optimize PSI calculation for 100+ SKUs

**Risks:**
- Matrix table performance degrades with >200 SKUs → Mitigation: Add pagination/virtualization
- Users resist new UX → Mitigation: Keep old "Quick Edit" mode as fallback

---

## Appendix: UI Mockup Descriptions (For System Architect)

### A.1 Forecast Matrix Table (Problem 1 Solution)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 销量预测管理 - 多周编辑模式                                         │
├─────────────────────────────────────────────────────────────────────┤
│ 周次范围: [2025-W49 ▼] 至 [2025-W52 ▼]  [应用]                     │
│ SKU筛选: [全选 ☑] [SKU-001 ☑] [SKU-002 ☑] ...                       │
│ 渠道筛选: [全选 ☑] [Amazon ☑] [Walmart ☑] ...                       │
├─────────────────────────────────────────────────────────────────────┤
│ SKU/渠道         │ 2025-W49 │ 2025-W50 │ 2025-W51 │ 2025-W52 │ 合计  │ Trend │
├──────────────────┼──────────┼──────────┼──────────┼──────────┼──────┼───────┤
│ SKU-001/Amazon   │   500    │   520    │   540    │   560    │ 2120 │ ↗📈   │
│ SKU-001/Walmart  │   300    │   310    │   320    │   330    │ 1260 │ ↗📈   │
│ SKU-002/Amazon   │   800    │   850    │   900    │   950    │ 3500 │ ↗📈   │
│ ...              │   ...    │   ...    │   ...    │   ...    │  ... │ ...   │
├──────────────────┼──────────┼──────────┼──────────┼──────────┼──────┴───────┤
│ 周合计           │  1600    │  1680    │  1760    │  1840    │ 总计: 6880   │
└─────────────────────────────────────────────────────────────────────────────┘
[取消] [保存全部更改 (3个单元格已修改)]
```

**Interaction Details:**
- Click cell → number input appears
- Modified cells get yellow background
- Tab key navigates horizontally through weeks
- Enter key moves to next row

---

### A.2 Coverage Aggregated View (Problem 3 Solution)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 预测覆盖率 - 汇总视图                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ 周次范围: [2025-W49 ▼] 至 [2025-W52 ▼] (共4周)  [刷新]                 │
├─────────────────────────────────────────────────────────────────────────┤
│ [展开] SKU-001  │ 总预测: 2,500 │ 已覆盖: 2,000 │ 未覆盖: 500 │ 80% │ [分配] │
│   ├─ 2025-W49/Amazon  │   500  │   500  │    0   │ 100% │ ✓             │
│   ├─ 2025-W50/Amazon  │   520  │   400  │  120   │  77% │ [分配至PO]    │
│   ├─ 2025-W51/Amazon  │   540  │   400  │  140   │  74% │ ☐ (Select)    │
│   └─ 2025-W52/Amazon  │   560  │   300  │  260   │  54% │ ☐ (Select)    │
├─────────────────────────────────────────────────────────────────────────┤
│ [展开] SKU-002  │ 总预测: 3,600 │ 已覆盖: 3,600 │ 未覆盖:   0 │100% │ ✓      │
│ ...                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Interaction Details:**
- Click [展开] → sub-rows slide down
- Select multiple checkboxes → "Allocate to PO" button appears
- Clicking "Allocate to PO" → modal with PO selector and distribution preview

---

## Next Steps

1. **System Architect Review:**
   - Validate database view design for aggregation
   - Define API contracts for matrix save and multi-allocation
   - Estimate performance impact

2. **Frontend Artisan:**
   - Build reusable `MatrixTable` component
   - Design expand/collapse animation for aggregated table
   - Create allocation flow modal

3. **Backend Specialist:**
   - Optimize `calculatePSI` for concurrent requests
   - Create `bulkUpdateForecasts` Server Action
   - Create `bulkAllocateToOrder` Server Action with transaction safety

4. **QA Director:**
   - Define test cases for matrix table edge cases (empty cells, negative numbers, concurrent edits)
   - Performance test with 200 SKUs x 12 weeks
   - Security audit for bulk allocation (SQL injection, permission bypass)

---

## Document Approval

**Product Director:** Claude AI (Draft Complete)
**Awaiting Review From:** System Architect, Frontend Artisan, Backend Specialist, QA Director
**Target Delivery:** Q1 2026 (Phase 1), Q2 2026 (Phase 2+3)
