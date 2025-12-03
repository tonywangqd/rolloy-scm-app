# Business Requirements: Algorithm Audit Page

**Document Version:** 1.0
**Date:** 2025-12-03
**Author:** Product Director
**Status:** Final Specification
**Feature Type:** Analytics & Transparency Tool

---

## Executive Summary

This document defines the requirements for an **Algorithm Audit Page** that provides full transparency into the inventory projection algorithm. The page allows users to trace every calculation step, verify data sources, and understand how the system arrives at inventory forecasts.

### Core Value Proposition

```
Enable users to AUDIT and VALIDATE the inventory projection algorithm by:
- Exposing every calculation step in a human-readable format
- Clearly identifying data sources (actual vs forecast/planned)
- Showing week-by-week inventory flow for individual SKUs
- Providing visual distinction for data quality (actual vs estimated)
```

**Business Impact:**
- Build trust in automated inventory projections
- Enable rapid troubleshooting when forecasts appear incorrect
- Support compliance and audit requirements
- Empower operations teams to understand "why" the system suggests certain actions

---

## 1. Context & Business Goals

### 1.1 Problem Statement

Currently, the system calculates inventory projections using the `v_inventory_projection_12weeks` materialized view. While this provides accurate results, users have expressed concerns:

1. **Black Box Problem:** "I see the final number, but I don't know HOW it was calculated"
2. **Data Quality Uncertainty:** "Is this number based on actual data or estimates?"
3. **Debugging Difficulty:** "Why does SKU X show stockout in Week 10? What inputs changed?"
4. **Trust Deficit:** "I need to verify the algorithm before making a $50K replenishment decision"

### 1.2 User Personas & Pain Points

**Persona 1: Inventory Planner (Primary User)**
- **Pain:** Cannot easily verify if projection is using latest shipment arrival dates
- **Need:** See the raw data behind each week's incoming quantity
- **Goal:** Validate that urgent airfreight shipment (arriving 2 weeks early) is reflected in projections

**Persona 2: Finance Manager (Secondary User)**
- **Pain:** Needs to explain inventory writedown risk to CFO
- **Need:** Show week-by-week stock depletion with supporting data
- **Goal:** Present audit-ready documentation of inventory calculation methodology

**Persona 3: Operations Manager (Secondary User)**
- **Pain:** Suppliers claim they delivered on time, but system shows delays
- **Need:** Compare planned vs actual dates side-by-side for specific SKUs
- **Goal:** Identify whether delays are in production, shipping, or data entry

### 1.3 Business Objectives

**Primary Goal:** Increase user confidence in automated inventory decisions by 80% (measured via survey)

**Secondary Goals:**
- Reduce time spent manually recalculating inventory in Excel (from 4 hours/week to 0)
- Enable self-service troubleshooting (reduce support tickets by 60%)
- Support SOC 2 compliance requirements for algorithm transparency

---

## 2. User Stories

### US-1: Single-SKU Drill-Down

**As an** Inventory Planner
**I want to** select a specific SKU and see its full inventory calculation breakdown
**So that** I can verify the algorithm is using the correct data

**Acceptance Criteria:**
- GIVEN I am on the Algorithm Audit page
- WHEN I select SKU "SKU-12345" from a dropdown
- THEN I see a table showing 16 weeks of data (4 past weeks + 12 future weeks)
- AND each row represents one ISO week (format: YYYY-WNN)
- AND the table displays all calculation components (see Section 5)

### US-2: Data Source Transparency

**As an** Operations Manager
**I want to** visually distinguish between actual data and forecast/planned data
**So that** I can assess the reliability of projections

**Acceptance Criteria:**
- GIVEN I am viewing the audit table for any SKU
- WHEN a cell contains ACTUAL data (e.g., actual_sales, actual_arrival_date)
  - THEN the cell background is GREEN
- WHEN a cell contains FORECAST/PLANNED data (e.g., forecast_sales, planned_arrival_date)
  - THEN the cell background is YELLOW
- WHEN closing_stock is NEGATIVE (stockout)
  - THEN the cell background is RED with white text
- WHEN closing_stock is below safety threshold (risk)
  - THEN the cell background is ORANGE
- AND a legend is displayed explaining the color coding

### US-3: Calculation Trace

**As a** Finance Manager
**I want to** see the formula for each calculated field
**So that** I can audit the methodology for compliance purposes

**Acceptance Criteria:**
- GIVEN I am viewing the audit table
- WHEN I hover over a calculated field (e.g., "Closing Stock")
- THEN I see a tooltip showing the formula: "Opening Stock + Incoming - Sales Outflow"
- AND the tooltip shows the specific values: "1200 + 500 - 300 = 1400"
- WHEN I hover over "Sales Outflow"
- THEN I see: "COALESCE(Actual Sales, Forecast Sales) = COALESCE(NULL, 300) = 300"

### US-4: Past Data Verification

**As an** Inventory Planner
**I want to** see the past 4 weeks of actual performance
**So that** I can validate the algorithm against known results

**Acceptance Criteria:**
- GIVEN today is in ISO week "2025-W10"
- WHEN I view the audit table
- THEN I see rows for weeks W06, W07, W08, W09 (past) AND W10 through W21 (current + future)
- AND past weeks show ONLY actual data (no forecasts)
- AND the transition point (current week) is visually highlighted

### US-5: Shipment Traceability

**As an** Operations Manager
**I want to** see which shipments contribute to each week's incoming quantity
**So that** I can verify logistics data accuracy

**Acceptance Criteria:**
- GIVEN I am viewing the audit table for SKU "SKU-12345"
- WHEN I click on an "Incoming Qty" cell (e.g., Week W12 shows 500 units)
- THEN I see an expandable section listing:
  - Shipment tracking number (e.g., "TRK-20250305-001")
  - Planned arrival date (e.g., "2025-03-12")
  - Actual arrival date (e.g., "2025-03-10" - highlighted in green)
  - Quantity from this shipment (e.g., 500 units)
- AND if multiple shipments arrive in the same week, all are listed
- AND each shipment row links to the full shipment detail page

---

## 3. Data Requirements

### 3.1 Data Sources (Read-Only)

**Primary Tables:**
- `products` - SKU metadata, safety stock configuration
- `sales_forecasts` - Planned sales by SKU, channel, week
- `sales_actuals` - Actual sales by SKU, channel, week
- `shipments` - Planned and actual arrival dates
- `shipment_items` - Quantity per SKU per shipment
- `inventory_snapshots` - Opening stock for Week 0

**Derived Data:**
- `v_inventory_projection_12weeks` - Reference for validation (optional)

### 3.2 Data Transformation Logic

The page will re-implement the projection algorithm from `v_inventory_projection_12weeks` in a step-by-step format:

```
FOR each SKU:
  opening_stock[W0] = SUM(inventory_snapshots.qty_on_hand WHERE sku = SKU)

  FOR each week W in [W-3 to W+11]:
    // Step 1: Calculate Sales Outflow
    sales_forecast[W] = SUM(sales_forecasts.forecast_qty WHERE week_iso = W AND sku = SKU)
    sales_actual[W] = SUM(sales_actuals.actual_qty WHERE week_iso = W AND sku = SKU)
    sales_outflow[W] = COALESCE(sales_actual[W], sales_forecast[W])

    // Step 2: Calculate Incoming Qty
    incoming_forecast[W] = SUM(shipment_items.shipped_qty
                               WHERE sku = SKU
                               AND get_week_iso(planned_arrival_date) = W
                               AND actual_arrival_date IS NULL)
    incoming_actual[W] = SUM(shipment_items.shipped_qty
                             WHERE sku = SKU
                             AND get_week_iso(actual_arrival_date) = W)
    incoming_qty[W] = incoming_actual[W] + incoming_forecast[W]

    // Step 3: Calculate Closing Stock
    closing_stock[W] = opening_stock[W] + incoming_qty[W] - sales_outflow[W]

    // Step 4: Set next week's opening stock
    opening_stock[W+1] = closing_stock[W]

    // Step 5: Determine Status
    safety_threshold = avg_weekly_sales * safety_stock_weeks
    stock_status[W] = CASE
      WHEN closing_stock[W] < 0 THEN 'Stockout'
      WHEN closing_stock[W] < safety_threshold THEN 'Risk'
      ELSE 'OK'
    END
```

### 3.3 Data Granularity

**Time Dimension:**
- ISO Week format: `YYYY-WNN` (e.g., "2025-W49")
- Range: 4 past weeks + 1 current week + 11 future weeks = 16 weeks total
- Week boundaries: Monday 00:00 to Sunday 23:59

**SKU Dimension:**
- Single SKU selection (no multi-SKU view on this page)
- SKU selector includes search by SKU code and product name

---

## 4. Functional Requirements

### 4.1 Page Layout

**Navigation Path:**
- Main Menu → "Inventory" → "Algorithm Audit" (库存管理 → 算法验证)

**Page Structure:**
```
┌─────────────────────────────────────────────────────┐
│ Header: "Algorithm Audit (算法验证)"                  │
├─────────────────────────────────────────────────────┤
│ SKU Selector: [Dropdown: Search SKU...]   [Refresh] │
├─────────────────────────────────────────────────────┤
│ Product Info Card:                                  │
│   SKU: SKU-12345                                    │
│   Name: Premium Widget (CN: 高级小部件)              │
│   Safety Stock: 3 weeks                             │
│   Avg Weekly Sales: 250 units                       │
│   Current On Hand: 1,200 units (as of 2025-12-01)   │
├─────────────────────────────────────────────────────┤
│ Legend:                                             │
│   [Green] Actual Data  [Yellow] Forecast/Planned    │
│   [Red] Stockout  [Orange] Risk                     │
├─────────────────────────────────────────────────────┤
│ Calculation Table (scrollable, 16 weeks × 13 cols)  │
│ [See Section 5 for column definitions]             │
├─────────────────────────────────────────────────────┤
│ Footer: Last Updated: 2025-12-03 14:30 UTC         │
│         Data Source: v_inventory_projection_12weeks │
└─────────────────────────────────────────────────────┘
```

### 4.2 SKU Selection

**Behavior:**
- Dropdown with typeahead search (search by SKU code OR product name)
- Shows only active SKUs (`products.is_active = true`)
- Default selection: First SKU alphabetically (or last viewed SKU if stored in user preferences)
- On selection, table auto-refreshes

**UI Component:** ShadCN Combobox (from `@/components/ui/combobox`)

### 4.3 Data Refresh

**Manual Refresh:**
- Refresh button next to SKU selector
- On click: Re-fetch data from database, re-render table
- Loading state: Show spinner overlay on table

**Auto-Refresh:**
- NOT implemented (page is for audit, not real-time monitoring)
- Data freshness indicator: "Last updated: [timestamp]"

### 4.4 Table Interactivity

**Sticky Headers:**
- First column ("Week ISO") is sticky (horizontal scroll)
- Header row is sticky (vertical scroll)

**Tooltips:**
- Hover over column headers: Show formula/definition
- Hover over calculated cells: Show detailed calculation breakdown

**Expandable Rows (for Incoming Qty):**
- Click on "Incoming Qty" cell → Expand to show shipment details
- Collapse by clicking again

**Export (Future Enhancement - not in MVP):**
- Export table to CSV/Excel
- Include both displayed values and metadata (data source type)

---

## 5. Table Structure

### 5.1 Column Definitions (13 Columns)

| Column # | Column Name (EN) | Column Name (CN) | Data Type | Formula/Source | Color Logic |
|----------|-----------------|-----------------|-----------|----------------|-------------|
| 1 | Week ISO | 周次 | TEXT | ISO week (YYYY-WNN) | Header: Gray background |
| 2 | Week Start | 周起始日 | DATE | Monday of ISO week | N/A |
| 3 | Opening Stock | 期初库存 | INTEGER | Closing Stock[W-1] | Green if W≤0 (actual snapshot), White if W>0 (calculated) |
| 4 | Sales - Forecast | 预估下单 | INTEGER | SUM(sales_forecasts.forecast_qty) | Yellow always |
| 5 | Sales - Actual | 实际下单 | INTEGER | SUM(sales_actuals.actual_qty) | Green if not NULL, Gray if NULL |
| 6 | Sales - Outflow | 下单取值 | INTEGER | COALESCE(Actual, Forecast) | Green if Actual used, Yellow if Forecast used |
| 7 | Shipment - Planned | 出货预估 | INTEGER | SUM(shipment_items WHERE actual_arrival = NULL AND planned_week = W) | Yellow always |
| 8 | Shipment - Actual | 出货实际 | INTEGER | SUM(shipment_items WHERE actual_week = W) | Green if not NULL, Gray if NULL |
| 9 | Incoming Qty | 到仓数量 | INTEGER | Actual + Planned (see note below) | Green if any actual, Yellow if all planned |
| 10 | Net Change | 本周变化 | INTEGER | Incoming - Outflow | Green if positive, Red if negative, Gray if zero |
| 11 | Closing Stock | 期末库存 | INTEGER | Opening + Net Change | RED if <0, ORANGE if <safety threshold, White if OK |
| 12 | Safety Threshold | 安全库存 | INTEGER | avg_weekly_sales × safety_stock_weeks | Gray (constant) |
| 13 | Stock Status | 库存状态 | TEXT | 'Stockout' / 'Risk' / 'OK' | RED / ORANGE / GREEN badge |

**Note on Column 9 (Incoming Qty):**
- This column aggregates both actual and planned shipments in the same week
- Split into two sub-rows when expanded (see Section 5.2)

### 5.2 Expandable Incoming Qty Details

When user clicks on "Incoming Qty" cell, expand to show:

```
Week W12 - Incoming Qty: 1,500 units [Click to collapse]
├─ Shipment TRK-20250310-001
│  ├─ Planned Arrival: 2025-03-15 (Yellow)
│  ├─ Actual Arrival: 2025-03-12 (Green)
│  ├─ Quantity: 1,000 units
│  └─ [View Shipment Details] (link)
└─ Shipment TRK-20250305-002
   ├─ Planned Arrival: 2025-03-14 (Yellow)
   ├─ Actual Arrival: — (Gray)
   ├─ Quantity: 500 units
   └─ [View Shipment Details] (link)
```

**Implementation Detail:**
- Expandable section is a nested table (or card list) below the main row
- Max height: 300px with scroll if many shipments
- Each shipment row links to `/logistics?tracking_number={value}`

### 5.3 Week Offset Indicator

Add a visual separator between past and future weeks:

| Week ISO | Opening Stock | ... | Stock Status |
|----------|---------------|-----|--------------|
| 2025-W06 | 1,200 | ... | OK (past) |
| 2025-W07 | 1,150 | ... | OK (past) |
| 2025-W08 | 1,100 | ... | OK (past) |
| 2025-W09 | 1,050 | ... | OK (past) |
| **↓ CURRENT WEEK ↓** | **—** | **—** | **—** |
| 2025-W10 | 1,000 | ... | Risk (current) |
| 2025-W11 | 950 | ... | Risk (future) |
| ... | ... | ... | ... |

---

## 6. Business Rules

### 6.1 Data Source Priority Rules

**Rule 1: Sales Data (Dual-Track)**
```
IF sales_actuals.actual_qty IS NOT NULL
  THEN use sales_actuals.actual_qty (mark GREEN)
  ELSE use sales_forecasts.forecast_qty (mark YELLOW)
```

**Rule 2: Incoming Shipments (Dual-Track)**
```
FOR each shipment_item WHERE sku = selected_sku:
  effective_arrival_date = COALESCE(actual_arrival_date, planned_arrival_date)
  arrival_week = get_week_iso(effective_arrival_date)

  IF actual_arrival_date IS NOT NULL
    THEN mark as ACTUAL (GREEN)
    ELSE mark as PLANNED (YELLOW)
```

**Rule 3: Opening Stock (Week 0)**
```
opening_stock[W0] = SUM(inventory_snapshots.qty_on_hand
                        WHERE sku = selected_sku
                        AND snapshot_date = MAX(snapshot_date))
```

### 6.2 Stock Status Classification

```
stock_status = CASE
  WHEN closing_stock < 0 THEN 'Stockout'
  WHEN closing_stock < safety_threshold THEN 'Risk'
  ELSE 'OK'
END

safety_threshold = avg_weekly_sales × products.safety_stock_weeks

avg_weekly_sales = AVG(sales_outflow[W-3 to W+11])
```

**Visual Representation:**
- Stockout: RED badge with icon "⚠️"
- Risk: ORANGE badge with icon "⚡"
- OK: GREEN badge with icon "✓"

### 6.3 Week Range Logic

**Past Weeks (Historical View):**
- Show 4 completed weeks before current week
- Use ONLY actual data (no forecasts)
- Purpose: Validate algorithm accuracy against known results

**Current Week:**
- May have partial actual data
- If week is incomplete, use forecast for remaining days

**Future Weeks:**
- Show 11 weeks after current week
- Mix of actual shipment dates (if already updated) and planned dates

---

## 7. UI/UX Specifications

### 7.1 Color Palette (Strict)

| Element | Background Color | Text Color | Border |
|---------|-----------------|-----------|--------|
| Actual Data (Green) | `bg-green-50` (#F0FDF4) | `text-green-900` | `border-green-200` |
| Forecast/Planned (Yellow) | `bg-yellow-50` (#FEFCE8) | `text-yellow-900` | `border-yellow-200` |
| Stockout (Red) | `bg-red-600` (#DC2626) | `text-white` | `border-red-700` |
| Risk (Orange) | `bg-orange-100` (#FFEDD5) | `text-orange-900` | `border-orange-300` |
| OK Status | `bg-white` | `text-gray-900` | `border-gray-200` |
| Header (Gray) | `bg-gray-100` | `text-gray-700` | `border-gray-300` |
| Current Week Separator | `bg-blue-100` | `text-blue-900` | `border-blue-400` (3px) |

**Tailwind Classes (from v4):**
- Use Tailwind utility classes directly
- ShadCN Table component base styles

### 7.2 Typography

| Element | Font Size | Font Weight | Line Height |
|---------|-----------|-------------|-------------|
| Page Title | `text-2xl` (24px) | `font-bold` | `leading-8` |
| Column Headers | `text-sm` (14px) | `font-semibold` | `leading-5` |
| Table Cells (Numbers) | `text-sm` (14px) | `font-mono` | `leading-5` |
| Table Cells (Text) | `text-sm` (14px) | `font-normal` | `leading-5` |
| Tooltips | `text-xs` (12px) | `font-normal` | `leading-4` |
| Legend | `text-xs` (12px) | `font-medium` | `leading-4` |

**Font Family:**
- Numbers: `font-mono` (tabular-nums for alignment)
- Text: System default (Inter)

### 7.3 Responsive Behavior

**Desktop (≥1024px):**
- Table width: 100% of content area
- Horizontal scroll if columns exceed viewport width
- Sticky first column and header row

**Tablet (768px - 1023px):**
- Reduce padding in cells
- Hide "Safety Threshold" column (can show in tooltip)
- Horizontal scroll required

**Mobile (<768px):**
- NOT OPTIMIZED (show "Please use desktop" message)
- This page is not intended for mobile due to data density

### 7.4 Loading States

**Initial Page Load:**
- Show skeleton table (ShadCN Skeleton component)
- Shimmer effect on 16 rows

**SKU Change:**
- Fade out old table data
- Show loading spinner overlay
- Fade in new data

**Shipment Expansion:**
- Instant expand/collapse (data pre-loaded)
- If shipment details not loaded, show inline spinner

---

## 8. Interaction Flows

### 8.1 Happy Path: Verify Weekly Projection

1. User navigates to "Algorithm Audit" page
2. Page loads with default SKU (e.g., "SKU-10001")
3. User sees 16-week table with color-coded cells
4. User identifies Week W14 showing "Risk" status
5. User hovers over "Closing Stock" cell → Sees tooltip: "950 = 1000 + 200 - 250"
6. User clicks on "Incoming Qty" cell in W14 → Expands to show 2 shipments
7. User sees one shipment has actual arrival date (green), one is planned (yellow)
8. User clicks "View Shipment Details" → Opens logistics page in new tab
9. User returns to audit page, confident in projection accuracy

### 8.2 Edge Case: SKU with No Future Shipments

**Scenario:** SKU has zero incoming shipments in next 12 weeks

**System Behavior:**
- "Shipment - Planned" column shows 0 for all future weeks (no yellow highlighting)
- "Shipment - Actual" column shows 0 or NULL (gray)
- "Incoming Qty" column shows 0
- "Closing Stock" decreases every week (based on sales outflow)
- Multiple weeks likely show "Stockout" status (RED)
- User sees clear visual indicator of replenishment urgency

**UI Note:** Consider adding an alert banner at top: "⚠️ No incoming shipments scheduled for this SKU in next 12 weeks"

### 8.3 Edge Case: Past Week with Missing Actual Sales

**Scenario:** Week W07 (past) has forecast but no actual sales recorded

**System Behavior:**
- "Sales - Actual" cell shows NULL or 0 (gray background)
- "Sales - Outflow" cell uses forecast data (YELLOW background)
- Add warning icon in "Sales - Outflow" cell with tooltip: "Using forecast for past week - actual data missing"

**Business Implication:** Data quality issue - flag for operations team to backfill

---

## 9. Non-Functional Requirements

### 9.1 Performance

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Page Load Time | <2 seconds | Time to interactive (TTI) |
| SKU Switch Time | <500ms | From selection to table render |
| Table Render Time | <1 second | For 16 weeks × 13 columns |
| Database Query Time | <300ms | Server-side data fetch |
| Tooltip Display Latency | <50ms | Hover to tooltip visible |

**Optimization Strategies:**
- Pre-calculate all 16 weeks of data in single query (no lazy loading per week)
- Use indexed columns for WHERE clauses (sku, week_iso, actual_arrival_date)
- Cache product metadata (SKU list, safety stock) in client state
- Virtualize table rows if expanding to >50 weeks in future

### 9.2 Data Accuracy

**Requirement:** Algorithm results MUST match `v_inventory_projection_12weeks` exactly

**Validation Method:**
- System Architect will create automated test comparing:
  - Audit page calculation for SKU X, Week W
  - vs. Corresponding row in `v_inventory_projection_12weeks` view
- Tolerance: 0 units difference (exact match required)
- Test frequency: Run on every deployment

### 9.3 Security

**Access Control:**
- Page requires authenticated user (Supabase Auth)
- RLS policies apply to all data fetches (user can only see their tenant's data)
- No mutation operations (read-only page)

**Data Privacy:**
- No PII displayed
- SKU codes and product names only (no customer data)

### 9.4 Accessibility (WCAG 2.1 Level AA)

**Color Contrast:**
- Green/Yellow/Orange backgrounds with dark text: Contrast ratio ≥4.5:1
- Red background with white text: Contrast ratio ≥4.5:1
- Use color + icon combination (not color alone) for stock status

**Keyboard Navigation:**
- All interactive elements (SKU dropdown, expandable rows) are keyboard-accessible
- Tab order: SKU selector → Refresh button → Table → Expandable shipments
- Enter key to expand/collapse shipment details

**Screen Reader Support:**
- Table has proper `<thead>`, `<tbody>` semantic structure
- Column headers use `scope="col"`
- ARIA labels for color-coded cells: `aria-label="Actual sales: 300 units"`

---

## 10. Data Visualization Requirements

### 10.1 Table as Primary Visualization

**Rationale:** Tables are optimal for detailed audit/traceability use cases

**Alternative Considered (Rejected for MVP):**
- Line chart of closing stock over 16 weeks
  - **Reason for rejection:** Chart hides intermediate calculation steps
  - **Future enhancement:** Add chart above table as summary view

### 10.2 Future Enhancements (Out of Scope)

**Enhancement 1: Sparkline in Table**
- Add mini line chart in "Closing Stock" column header
- Shows trend across all 16 weeks at a glance

**Enhancement 2: Heatmap View**
- Multi-SKU comparison (rows = SKUs, columns = weeks)
- Cell color = stock status
- Use case: Identify which SKUs have concurrent stockout risks

**Enhancement 3: Side-by-Side Comparison**
- Compare two SKUs simultaneously
- Use case: Analyze substitution options when primary SKU is stocked out

---

## 11. Integration Points

### 11.1 Data Dependencies

**Upstream Systems (Read):**
- `products` table → Product metadata
- `sales_forecasts` → Planning module input
- `sales_actuals` → Channel integration (e.g., Shopify, Amazon APIs)
- `shipments` → Logistics module
- `shipment_items` → Logistics module
- `inventory_snapshots` → Manual entry or warehouse API

**Downstream Systems (None):**
- This page is read-only
- No data writes to database

### 11.2 Cross-Module Navigation

**Link to Algorithm Audit FROM:**
- Inventory Projection page (`/inventory`) → "View Calculation Details" button per SKU
- Replenishment Action Center → "Audit Suggestion" link

**Link FROM Algorithm Audit TO:**
- Logistics page (`/logistics?tracking_number={id}`) → From expanded shipment rows
- Product detail page (`/settings/products/{sku}`) → From SKU header

---

## 12. Acceptance Criteria (Gherkin)

### AC-1: Display 16-Week Calculation Table

```gherkin
Feature: Algorithm Audit Page - Basic Display

  Scenario: View audit table for active SKU
    Given I am an authenticated user
    And SKU "SKU-12345" is active in the database
    And I navigate to "/inventory/algorithm-audit"
    When I select SKU "SKU-12345" from the dropdown
    Then I see a table with 16 rows (4 past weeks + 12 future weeks)
    And I see 13 columns as defined in Section 5.1
    And the first row shows week ISO "2025-W06" (assuming today is 2025-W10)
    And the last row shows week ISO "2025-W21"
    And column headers are sticky when scrolling vertically
    And the "Week ISO" column is sticky when scrolling horizontally
```

### AC-2: Color-Code Data Sources

```gherkin
Feature: Data Source Visual Distinction

  Scenario: Actual sales data is highlighted green
    Given I am viewing the audit table for SKU "SKU-12345"
    And sales_actuals has a record for week "2025-W10" with qty 300
    When I look at the "Sales - Actual" cell for week "2025-W10"
    Then the cell background is green (bg-green-50)
    And the cell text is "300"
    And the cell has green border (border-green-200)

  Scenario: Forecast sales data is highlighted yellow
    Given I am viewing the audit table for SKU "SKU-12345"
    And sales_forecasts has a record for week "2025-W15" with qty 250
    And sales_actuals has NO record for week "2025-W15"
    When I look at the "Sales - Forecast" cell for week "2025-W15"
    Then the cell background is yellow (bg-yellow-50)
    And the "Sales - Outflow" cell also has yellow background
    And the "Sales - Actual" cell is gray (NULL)

  Scenario: Stockout status is highlighted red
    Given I am viewing the audit table for SKU "SKU-12345"
    And the calculated closing stock for week "2025-W18" is -50
    When I look at the "Closing Stock" cell for week "2025-W18"
    Then the cell background is red (bg-red-600)
    And the cell text is white (text-white)
    And the "Stock Status" cell shows a red badge with "Stockout"
```

### AC-3: Expandable Shipment Details

```gherkin
Feature: Incoming Quantity Drill-Down

  Scenario: Expand to show shipment details
    Given I am viewing the audit table for SKU "SKU-12345"
    And week "2025-W12" has 2 shipments arriving with total qty 1500
    And shipment "TRK-001" has actual_arrival_date "2025-03-12" with qty 1000
    And shipment "TRK-002" has only planned_arrival_date "2025-03-14" with qty 500
    When I click on the "Incoming Qty" cell for week "2025-W12"
    Then the cell expands to show 2 shipment rows
    And shipment "TRK-001" row shows actual arrival date in green
    And shipment "TRK-002" row shows planned arrival date in yellow
    And each shipment row has a "View Shipment Details" link
    When I click "View Shipment Details" for "TRK-001"
    Then I am navigated to "/logistics?tracking_number=TRK-001" in a new tab
```

### AC-4: Calculation Tooltip

```gherkin
Feature: Calculation Transparency

  Scenario: Hover over closing stock to see formula
    Given I am viewing the audit table for SKU "SKU-12345"
    And week "2025-W10" has:
      | Opening Stock | Incoming Qty | Sales Outflow | Closing Stock |
      | 1000          | 200          | 250           | 950           |
    When I hover over the "Closing Stock" cell for week "2025-W10"
    Then I see a tooltip displaying:
      """
      Formula: Opening Stock + Incoming Qty - Sales Outflow
      Calculation: 1000 + 200 - 250 = 950
      """
    And the tooltip appears within 50ms of hover
```

### AC-5: Past vs Future Week Separator

```gherkin
Feature: Week Offset Visual Indicator

  Scenario: Current week is visually distinguished
    Given today is 2025-03-10 (week "2025-W10")
    And I am viewing the audit table for any SKU
    When I scroll to the row for week "2025-W10"
    Then I see a blue border above this row (border-blue-400)
    And I see a label "↓ CURRENT WEEK ↓" in the row
    And rows above (W06-W09) have gray background (past weeks)
    And rows below (W11-W21) have white background (future weeks)
```

### AC-6: Stock Status Classification

```gherkin
Feature: Stock Status Logic

  Scenario: OK status when stock above safety threshold
    Given SKU "SKU-12345" has safety_stock_weeks = 3
    And avg_weekly_sales = 250 units
    And safety_threshold = 3 × 250 = 750 units
    And week "2025-W12" has closing_stock = 1000
    When I view the "Stock Status" cell for week "2025-W12"
    Then I see a green badge with text "OK"
    And the "Closing Stock" cell has white background

  Scenario: Risk status when stock below safety threshold
    Given the same SKU setup as above
    And week "2025-W15" has closing_stock = 600 (below 750 threshold)
    When I view the "Stock Status" cell for week "2025-W15"
    Then I see an orange badge with text "Risk"
    And the "Closing Stock" cell has orange background (bg-orange-100)

  Scenario: Stockout status when stock negative
    Given the same SKU setup as above
    And week "2025-W18" has closing_stock = -100
    When I view the "Stock Status" cell for week "2025-W18"
    Then I see a red badge with text "Stockout"
    And the "Closing Stock" cell has red background (bg-red-600)
    And the cell text is white (text-white)
```

---

## 13. Open Questions & Decisions Required

### 13.1 Resolved Questions

**Q1: Should we show production delivery dates in addition to shipment arrivals?**
**Decision:** NO. Focus on warehouse arrival dates only (what matters for inventory).
**Rationale:** Production deliveries are intermediate events. Incoming qty is triggered by warehouse arrival.

**Q2: Should we aggregate sales by channel or show per-channel breakdown?**
**Decision:** Aggregate by SKU. Show per-channel breakdown in a future enhancement.
**Rationale:** Algorithm uses aggregated sales. Channel breakdown adds complexity without immediate value.

**Q3: Should users be able to edit data from this page (e.g., fix missing actual dates)?**
**Decision:** NO. This is a READ-ONLY audit page. Editing happens in source modules (Logistics, Planning).
**Rationale:** Separation of concerns. Audit ≠ Data Entry.

### 13.2 Open Questions (Deferred to Design Phase)

**Q4: How to handle SKUs with >50 shipments in a single week?**
**Proposed Answer:** Paginate expandable shipment list (show first 10, "View All" button)
**Assigned To:** System Architect (design.md)

**Q5: Should we cache calculation results on client side?**
**Proposed Answer:** Use React Query with 5-minute cache TTL
**Assigned To:** Frontend Artisan (implementation)

**Q6: Should we log when users access this page for compliance audits?**
**Proposed Answer:** YES, log to `audit_logs` table (user_id, sku, timestamp)
**Assigned To:** Backend Specialist (Server Action)

---

## 14. Success Metrics

### 14.1 Adoption Metrics (30 days post-launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Weekly Active Users | ≥80% of inventory planners | Google Analytics |
| Avg Session Duration | ≥3 minutes | GA (indicates deep engagement) |
| SKU Audits per User | ≥5 per week | Database query count |
| Bounce Rate | <20% | GA (low bounce = page is useful) |

### 14.2 Business Impact Metrics (90 days post-launch)

| Metric | Target | Baseline | Measurement Method |
|--------|--------|----------|-------------------|
| User Trust Score | ≥4.5/5 | 3.2/5 (from recent survey) | Quarterly survey question: "I trust the inventory projections" |
| Manual Excel Calculations | <1 hour/week per planner | 4 hours/week | Self-reported time log |
| Projection Accuracy | ≥90% | 85% | Compare projected stock vs actual stock (4 weeks later) |
| Support Tickets (Inventory) | Reduce by 60% | 10 tickets/month | Zendesk tag analysis |

### 14.3 Technical Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Page Load Speed (P95) | <2 seconds | Vercel Analytics |
| Error Rate | <0.1% | Sentry error tracking |
| Data Accuracy Test Pass Rate | 100% | Automated test suite |
| Accessibility Score | ≥95/100 | Lighthouse audit |

---

## 15. Risks & Mitigation

### 15.1 Risk Matrix

| Risk | Probability | Impact | Severity | Mitigation Strategy |
|------|------------|--------|----------|---------------------|
| **Algorithm mismatch** (page calc ≠ view) | Medium | High | **CRITICAL** | Automated testing, QA review before launch |
| **Performance degradation** (SKUs with 100+ shipments/week) | Low | Medium | MEDIUM | Query optimization, pagination for expandable rows |
| **User confusion** (too many columns) | Medium | Low | LOW | User training video, in-app tooltips, legend |
| **Data quality issues** (missing actual dates) | High | Medium | MEDIUM | Add data validation alerts, backfill process for ops team |
| **Mobile access attempts** | Low | Low | LOW | Show responsive message: "Use desktop for best experience" |

### 15.2 Rollback Plan

**Trigger:** >5% error rate OR algorithm mismatch detected in production

**Rollback Steps:**
1. Hide "Algorithm Audit" link from navigation menu (feature flag)
2. Redirect `/inventory/algorithm-audit` to `/inventory` with notice: "Page under maintenance"
3. Investigate root cause in staging environment
4. Fix and re-deploy after QA validation
5. Re-enable feature flag

**Rollback Time:** <15 minutes

---

## 16. Dependencies & Constraints

### 16.1 Technical Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|-----------|---------|---------|---------------------|
| `date-fns` | ≥3.0 | ISO week calculations | Cannot calculate week boundaries |
| ShadCN Table | Latest | Table UI component | Must use native HTML table (ugly) |
| Supabase client | ≥2.0 | Data fetching | Page non-functional |
| `v_inventory_projection_12weeks` view | Existing | Reference for validation | Cannot validate accuracy |

### 16.2 Data Constraints

**Minimum Data Requirements:**
- At least 1 active SKU in `products` table
- At least 1 inventory snapshot (for opening stock)
- Sales forecasts for next 12 weeks (else projections are zero)

**Data Quality Assumptions:**
- Inventory snapshots are updated weekly (manual or automated)
- Shipment arrival dates are entered within 48 hours of actual arrival
- Sales actuals are backfilled within 1 week of order date

**What Happens if Constraints Violated:**
- If SKU has no inventory snapshot → Opening stock defaults to 0 (show warning)
- If shipment has no planned arrival date → Excluded from calculations (show error)
- If sales forecast missing → Effective sales = 0 (acceptable for new products)

### 16.3 Timeline Constraints

**Must Launch By:** 2025-12-31 (end of Q4)
**Reason:** Q1 2026 is peak replenishment planning season

**Critical Path:**
1. Product spec finalization: 2025-12-05 (THIS DOCUMENT)
2. System architecture design: 2025-12-08
3. Frontend implementation: 2025-12-15
4. Backend implementation: 2025-12-15 (parallel with frontend)
5. QA testing: 2025-12-20
6. User acceptance testing: 2025-12-23
7. Production deployment: 2025-12-27
8. Buffer for holidays: 2025-12-28 to 2025-12-31

---

## 17. Glossary

| Term | Definition |
|------|------------|
| **Algorithm Audit** | Process of verifying inventory projection calculations by examining each step |
| **Dual-Track Data** | System design where both planned and actual values coexist; actual overrides planned when available |
| **Effective Value** | The authoritative value chosen by COALESCE(actual, planned) logic |
| **ISO Week** | ISO 8601 week numbering (YYYY-WNN), weeks start Monday, W01 contains first Thursday of year |
| **Opening Stock** | Inventory quantity at the START of a week (= closing stock of previous week) |
| **Closing Stock** | Inventory quantity at the END of a week (= opening + incoming - outflow) |
| **Incoming Qty** | Units arriving at warehouse during a week (from shipments) |
| **Sales Outflow** | Units sold during a week (effective sales = COALESCE(actual, forecast)) |
| **Safety Threshold** | Minimum stock level = avg_weekly_sales × safety_stock_weeks |
| **Stock Status** | Classification: Stockout (stock <0), Risk (stock < safety threshold), OK (stock ≥ threshold) |
| **Materialized View** | Pre-calculated database view stored as table for performance |

---

## 18. Related Documents

**This Document Depends On:**
- `/Users/tony/Desktop/rolloy-scm/specs/dual-track-logic/requirements.md` (Business logic foundation)
- `/Users/tony/Desktop/rolloy-scm/supabase/migrations/20250130_create_inventory_projection_12weeks_view.sql` (Algorithm implementation)

**Next Documents to Create:**
- `/Users/tony/Desktop/rolloy-scm/specs/algorithm-audit/design.md` (System Architect - database queries, API contracts)
- `/Users/tony/Desktop/rolloy-scm/specs/algorithm-audit/test-plan.md` (QA Director - test scenarios)

**Cross-References:**
- Inventory Projection Dashboard: `/Users/tony/Desktop/rolloy-scm/specs/replenishment-action-center/requirements.md`
- RLS Security Policies: `/Users/tony/Desktop/rolloy-scm/specs/security/*`

---

## 19. Appendix: Example Data Scenario

### 19.1 Sample SKU: SKU-WIDGET-001

**Product Details:**
- SKU Code: SKU-WIDGET-001
- Product Name: Premium Widget (高级小部件)
- Safety Stock Weeks: 3
- Current On Hand: 1,200 units (as of 2025-12-01)

**Sales Data (Weeks W10-W13):**

| Week | Channel | Forecast Qty | Actual Qty |
|------|---------|-------------|-----------|
| 2025-W10 | Amazon | 100 | 95 |
| 2025-W10 | Shopify | 50 | 48 |
| 2025-W11 | Amazon | 110 | NULL |
| 2025-W11 | Shopify | 55 | NULL |
| 2025-W12 | Amazon | 105 | NULL |
| 2025-W12 | Shopify | 52 | NULL |

**Shipments (Incoming):**

| Tracking Number | Planned Arrival | Actual Arrival | Qty |
|----------------|----------------|----------------|-----|
| TRK-20250310-001 | 2025-03-15 (W11) | 2025-03-12 (W11) | 1,000 |
| TRK-20250320-002 | 2025-03-22 (W12) | NULL | 500 |

### 19.2 Expected Audit Table Output (Excerpt)

| Week ISO | Opening Stock | Sales-Forecast | Sales-Actual | Sales-Outflow | Shipment-Planned | Shipment-Actual | Incoming Qty | Net Change | Closing Stock | Status |
|----------|--------------|---------------|-------------|---------------|-----------------|----------------|--------------|-----------|--------------|--------|
| 2025-W10 | 1,200 | 150 | **143** (Green) | **143** (Green) | 0 | 0 | 0 | -143 (Red) | 1,057 | OK |
| 2025-W11 | 1,057 | 165 (Yellow) | NULL (Gray) | 165 (Yellow) | 0 | **1,000** (Green) | **1,000** (Green) | +835 (Green) | 1,892 | OK |
| 2025-W12 | 1,892 | 157 (Yellow) | NULL (Gray) | 157 (Yellow) | **500** (Yellow) | 0 | 500 (Yellow) | +343 (Green) | 2,235 | OK |

**Notes on This Example:**
- Week W10: Uses actual sales (143 = 95 + 48), no incoming shipments
- Week W11: Uses forecast sales (165 total), but incoming qty uses ACTUAL arrival date (W11 instead of planned W11)
- Week W12: All forecast data, shipment still planned (yellow)

---

**Document Control:**
- **Status:** FINAL - Ready for System Architect Review
- **Next Action:** System Architect creates `/Users/tony/Desktop/rolloy-scm/specs/algorithm-audit/design.md`
- **Approvers Required:** Engineering Lead, Product Manager, Head of Operations
- **Review Cycle:** Bi-weekly until launch

---

**END OF DOCUMENT**
