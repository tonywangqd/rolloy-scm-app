# Product Requirements Document: Replenishment Action Center

**Feature Name**: Replenishment Action Center
**Document Version**: 1.0
**Author**: Product Director
**Date**: 2025-11-30
**Status**: Draft for Review

---

## 1. EXECUTIVE SUMMARY

### 1.1 Problem Statement

**Current Situation**:
- The system successfully calculates 12-week inventory projections and identifies SKUs at risk
- A materialized view `v_replenishment_suggestions` exists with complete replenishment logic
- **GAP**: Users cannot see or act on suggested purchase quantities

**Business Impact**:
- Planners manually calculate order quantities, wasting 2-3 hours per planning cycle
- Delayed purchase decisions increase stockout risk by 15-20%
- No systematic prioritization of urgent vs. non-urgent replenishment needs

**Success Metric**:
- Reduce planning cycle time from 3 hours to 30 minutes
- Zero manual calculation errors for order quantities
- 100% visibility into Critical/High priority replenishment needs within 2 weeks

---

## 2. CONTEXT & BUSINESS VALUE

### 2.1 Strategic Rationale

This feature closes the gap between **"knowing there's a problem"** (inventory projection) and **"taking action"** (purchase order creation). It transforms passive reporting into an actionable decision support system.

### 2.2 Stakeholders

| Role | Need | Success Criteria |
|------|------|------------------|
| Demand Planner | See prioritized list of SKUs needing replenishment | Can complete weekly planning review in under 30 min |
| Procurement Manager | Know exact order quantities and deadlines | Zero missed order deadlines due to information lag |
| Inventory Controller | Monitor stockout risks across portfolio | Real-time visibility into Critical/High priority SKUs |

---

## 3. USER STORIES

### 3.1 Primary User Stories

#### Story 1: View Replenishment Recommendations
```
AS A demand planner
I WANT TO see a prioritized list of replenishment recommendations
SO THAT I can quickly identify which SKUs need immediate action
```

**Acceptance Criteria**:
- GIVEN I navigate to /planning/projection
- WHEN the page loads
- THEN I see a "Replenishment Action Center" section above the 12-week projection table
- AND it displays SKUs from `v_replenishment_suggestions` ordered by priority (Critical > High > Medium > Low)
- AND each SKU shows: Product Name, Suggested Order Qty, Order Deadline, Priority Badge

#### Story 2: Understand Purchase Urgency
```
AS A procurement manager
I WANT TO see order deadlines and priority classifications
SO THAT I can schedule purchase orders without missing critical windows
```

**Acceptance Criteria**:
- GIVEN a replenishment suggestion is displayed
- WHEN I view the suggestion card/row
- THEN I see:
  - Priority badge (Critical=Red, High=Orange, Medium=Yellow, Low=Green)
  - Order deadline date in format "YYYY-MM-DD (Week ISO)"
  - Days until deadline (e.g., "5 days left" or "Overdue by 2 days")
  - Ship deadline date

#### Story 3: View Calculation Rationale
```
AS A demand planner
I WANT TO understand why a specific order quantity is suggested
SO THAT I can validate the recommendation before creating a PO
```

**Acceptance Criteria**:
- GIVEN I click "View Details" on a replenishment suggestion
- WHEN the detail panel opens
- THEN I see:
  - Current stock level
  - Risk week (when stockout/low stock occurs)
  - Safety stock threshold
  - Projected closing stock in risk week
  - Calculation formula: `Suggested Qty = CEILING((Safety Threshold - Closing Stock) / 100) * 100`
  - Minimum constraint: At least 4 weeks of sales

#### Story 4: Filter by Priority
```
AS A planner
I WANT TO filter replenishment suggestions by priority and overdue status
SO THAT I can focus on the most urgent actions first
```

**Acceptance Criteria**:
- GIVEN I am viewing the Replenishment Action Center
- WHEN I select a filter (All, Critical, High, Overdue)
- THEN the list updates to show only matching suggestions
- AND the count of visible items is displayed

---

## 4. BUSINESS RULES & DATA DEFINITIONS

### 4.1 Data Source

**Source**: `v_replenishment_suggestions` (materialized view)
**Refresh Cadence**: Daily at 06:00 UTC or on-demand via "Refresh" button

### 4.2 Suggested Order Quantity Calculation

**Formula** (already implemented in SQL view):
```
suggested_order_qty = CEILING(
  MAX(
    safety_stock_threshold - closing_stock,
    effective_sales * 4  // Minimum 4 weeks of sales
  ) / 100
) * 100
```

**Business Rules**:
- **Rounding Rule**: Always round up to nearest 100 units (supplier MOQ constraint)
- **Minimum Order**: At least 4 weeks of projected sales
- **Cap**: No maximum cap (business assumption: supplier has unlimited capacity)

### 4.3 Priority Classification Matrix

| Priority | Trigger Condition | Action Required | Color Code |
|----------|------------------|-----------------|------------|
| **Critical** | Risk week offset <= 2 weeks | Order IMMEDIATELY (within 24 hours) | Red (#EF4444) |
| **High** | Risk week offset 3-4 weeks | Order THIS WEEK | Orange (#F97316) |
| **Medium** | Risk week offset 5-8 weeks | Order within 2 weeks | Yellow (#EAB308) |
| **Low** | Risk week offset 9-12 weeks | Monitor, plan for next cycle | Green (#22C55E) |

### 4.4 Deadline Calculation Logic

**Order Deadline** (already implemented):
```
order_deadline_date = risk_week_start - (safety_stock_weeks * 7 days)
```

**Ship Deadline** (already implemented):
```
ship_deadline_date = risk_week_start - 14 days
```

**Overdue Status**:
```
is_overdue = (order_deadline_date < CURRENT_DATE)
```

### 4.5 Data Fields to Display

| Field Name | Data Type | Display Format | Source Column | Business Logic |
|------------|-----------|----------------|---------------|----------------|
| SKU | string | As-is | `sku` | Primary key |
| Product Name | string | As-is | `product_name` | From products table |
| Suggested Order Qty | integer | "1,200 units" | `suggested_order_qty` | Formatted with commas |
| Priority | enum | Badge component | `priority` | Color-coded |
| Order Deadline | date | "2025-12-15 (W50)" | `order_deadline_date`, `order_deadline_week` | ISO week in parentheses |
| Days Until Deadline | integer | "5 days left" / "Overdue by 2 days" | `days_until_deadline` | Conditional formatting |
| Risk Week | string | "2025-W52" | `risk_week_iso` | ISO week format |
| Current Stock | integer | "850 units" | `opening_stock` | Formatted with commas |
| Safety Threshold | integer | "1,500 units" | `safety_stock_threshold` | Formatted with commas |
| Projected Closing Stock | integer | "320 units" | `closing_stock` | Formatted with commas |

---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Replenishment Action Center Component

**Location**: `/planning/projection` page, positioned ABOVE the "12-Week Projection Table"

**Layout Specification**:

```
┌─────────────────────────────────────────────────────────────┐
│ Replenishment Action Center                    [Filter] [Refresh]│
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SKU-A001 | Product Name Alpha                          │ │
│ │ [CRITICAL]  Suggested Order: 1,200 units               │ │
│ │ Order Deadline: 2025-12-05 (W49) - 3 days left        │ │
│ │                                        [View Details]   │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SKU-B002 | Product Name Beta                           │ │
│ │ [HIGH]      Suggested Order: 800 units                 │ │
│ │ Order Deadline: 2025-12-10 (W50) - 8 days left        │ │
│ │                                        [View Details]   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Interaction Requirements**:
- Click "View Details" → Expand inline detail panel showing calculation breakdown
- Click "Refresh" → Call `refreshInventoryProjectionViews()` RPC and reload data
- Click Filter Chips → Filter list dynamically (no page reload)

### 5.2 Empty State

**Condition**: `v_replenishment_suggestions` returns no rows

**Display**:
```
┌─────────────────────────────────────────────────────────────┐
│          No Replenishment Suggestions                       │
│          All SKUs are adequately stocked for the next       │
│          12 weeks. No action required.                      │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Error State

**Condition**: Query fails or view doesn't exist

**Display**:
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ Unable to load replenishment suggestions                  │
│ Error: [error message]                                      │
│ Please contact support if this persists.                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. NON-FUNCTIONAL REQUIREMENTS

### 6.1 Performance

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Page Load Time | < 2 seconds | Lighthouse Performance Score > 90 |
| Query Execution Time | < 500ms | Supabase query logs |
| Refresh Operation | < 10 seconds | UI feedback with loading spinner |

### 6.2 Scalability

- Must handle up to 500 active SKUs without pagination
- If > 100 suggestions, implement virtualized scrolling (not initial scope)

### 6.3 Data Freshness

- Materialized view refreshes daily at 06:00 UTC (scheduled job)
- Manual refresh available via UI button (triggers `refresh_inventory_projections()`)
- Display "Last Updated" timestamp from `calculated_at` column

---

## 7. UI/UX REQUIREMENTS (GENERIC)

### 7.1 Information Hierarchy

**Priority Order** (top to bottom):
1. Critical priority items (always visible at top)
2. High priority items
3. Overdue items (regardless of original priority)
4. Medium/Low priority items

**Visual Hierarchy**:
- Priority badge: Most prominent visual element (color + icon)
- Suggested Order Qty: Large, bold typography
- Deadline info: Secondary prominence with urgency indicator

### 7.2 Accessibility

- Priority badges must have ARIA labels: `aria-label="Critical priority: immediate action required"`
- Overdue items must have `role="alert"` for screen readers
- All interactive elements must support keyboard navigation (Tab, Enter, Escape)
- Color is NOT the only indicator (use icons + text)

### 7.3 Responsive Behavior

- Desktop (>1024px): Card grid layout, 2 columns
- Tablet (768-1024px): Card grid layout, 1 column
- Mobile (<768px): List layout with collapsible details

---

## 8. DATA VISUALIZATION REQUIREMENTS

### 8.1 Priority Distribution Chart (FUTURE ENHANCEMENT)

**Type**: Donut Chart
**Data Source**: Aggregate count of suggestions by priority
**Purpose**: Show overall replenishment workload distribution

**Specification**:
- X-axis: Not applicable (donut chart)
- Y-axis: Not applicable (donut chart)
- Segments: Critical (red), High (orange), Medium (yellow), Low (green)
- Center Text: Total count of suggestions
- Tooltip: `"Critical: 3 SKUs (25%)"`

**Aggregation Rules**:
```sql
SELECT
  priority,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM v_replenishment_suggestions
GROUP BY priority
```

### 8.2 Timeline View (FUTURE ENHANCEMENT)

**Type**: Gantt-style timeline showing order deadlines
**Out of Scope for V1**: Defer to future release

---

## 9. ACCEPTANCE CRITERIA (GHERKIN)

```gherkin
Feature: Replenishment Action Center

Scenario: View prioritized replenishment suggestions
  Given I am a logged-in demand planner
  And there are SKUs in v_replenishment_suggestions
  When I navigate to /planning/projection
  Then I see a "Replenishment Action Center" section
  And suggestions are ordered by priority (Critical first)
  And each suggestion shows SKU, Product Name, Suggested Qty, Deadline, Priority

Scenario: Filter by Critical priority
  Given I am viewing the Replenishment Action Center
  And there are 5 Critical and 10 High priority suggestions
  When I click the "Critical" filter chip
  Then I see only 5 suggestions
  And all displayed suggestions have "Critical" badge
  And the filter chip shows "Critical (5)"

Scenario: View calculation details
  Given I am viewing a replenishment suggestion for SKU-A001
  When I click "View Details"
  Then I see a detail panel with:
    | Field | Value |
    | Current Stock | 850 units |
    | Safety Threshold | 1,500 units |
    | Risk Week | 2025-W52 |
    | Projected Closing Stock | 320 units |
    | Calculation Formula | CEILING((1500-320)/100)*100 = 1,200 |

Scenario: Refresh suggestions on-demand
  Given I am viewing the Replenishment Action Center
  When I click the "Refresh" button
  Then I see a loading spinner
  And the system calls refresh_inventory_projections()
  And the suggestion list updates within 10 seconds
  And I see "Last updated: [timestamp]" message

Scenario: No suggestions available (empty state)
  Given there are no SKUs at risk in the next 12 weeks
  When I navigate to /planning/projection
  Then I see "No Replenishment Suggestions" message
  And I see "All SKUs are adequately stocked" explanation

Scenario: Handle overdue suggestions
  Given there is a suggestion with order_deadline_date = 2025-11-25
  And today's date is 2025-11-30
  When I view the Replenishment Action Center
  Then the suggestion shows "Overdue by 5 days"
  And the deadline text is styled in red color
  And the suggestion appears at the top of the list (above non-overdue)
```

---

## 10. OUT OF SCOPE (V1)

The following are explicitly NOT included in the initial release:

1. **Direct PO Creation**: Users cannot create purchase orders directly from suggestions (requires separate PO management feature)
2. **Quantity Editing**: Users cannot modify suggested quantities in the UI (must trust the algorithm)
3. **Historical Tracking**: No audit log of accepted/rejected suggestions
4. **Supplier Integration**: No automatic PO dispatch to suppliers
5. **Multi-Warehouse Logic**: Assumes single warehouse; multi-location replenishment deferred
6. **Advanced Filtering**: V1 supports Priority and Overdue filters only (no date range, SKU search)

---

## 11. DEPENDENCIES

### 11.1 Data Dependencies

- **MUST EXIST**: `v_replenishment_suggestions` materialized view
- **MUST EXIST**: `refresh_inventory_projections()` RPC function
- **MUST HAVE DATA**: At least 1 SKU with stock_status = 'Risk' or 'Stockout'

### 11.2 Technical Dependencies

- Supabase client configured with RLS policies for view access
- Query function `fetchReplenishmentSuggestions()` (already exists in codebase)
- Type definitions for `ReplenishmentSuggestionView` (already exists)

### 11.3 UI Component Dependencies

- Badge component (from UI library)
- Card component (from UI library)
- Tooltip component (for "View Details" hover states)
- Alert component (for empty/error states)

---

## 12. METRICS & SUCCESS MEASUREMENT

### 12.1 Leading Indicators (Week 1-4 after launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Feature Adoption Rate | >80% of planners view the section weekly | Google Analytics event tracking |
| "View Details" Click Rate | >50% of suggestions clicked | Event tracking |
| Manual Refresh Rate | <5% of page loads (indicates auto-refresh works) | Event tracking |

### 12.2 Lagging Indicators (Month 2-3 after launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Planning Cycle Time | Reduced from 3h to <30min | User survey + time tracking |
| Stockout Incidents | Reduced by 25% | Inventory reports |
| Order Deadline Miss Rate | <5% of Critical/High priority suggestions | PO data analysis |

---

## 13. RISK ASSESSMENT

### 13.1 Data Quality Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Materialized view returns empty data | HIGH | Add data validation step; show clear error message if no base data exists |
| `safety_stock_weeks` not set in products table | HIGH | Require this field during product setup; default to 4 weeks if null |
| Incorrect lead time assumptions | MEDIUM | Document assumption (14 days ship time) in UI tooltip |

### 13.2 User Adoption Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Users don't trust suggested quantities | HIGH | Provide transparent calculation details; allow exporting data for manual review |
| Overwhelming number of suggestions | MEDIUM | Default to Critical/High filter; add pagination if >50 items |

---

## 14. IMPLEMENTATION PHASES

### Phase 1: Foundation (Week 1)
- Query integration: Wire up `fetchReplenishmentSuggestions()`
- Basic card list component with priority badges
- Empty state and error handling

### Phase 2: Core Features (Week 2)
- "View Details" expandable panel
- Priority filter chips
- Refresh button with loading state

### Phase 3: Polish (Week 3)
- Responsive layout testing
- Accessibility audit (WCAG 2.1 AA)
- Performance optimization (query caching)

### Phase 4: Rollout (Week 4)
- UAT with 3 demand planners
- Production deployment
- User training documentation

---

## 15. OPEN QUESTIONS

1. **MOQ Constraints**: Should we display supplier minimum order quantities if they differ from the 100-unit rounding?
   - **Decision Required By**: Product team + Procurement lead
   - **Impact**: May require additional `supplier_moq` field in products table

2. **Multi-Channel Considerations**: If a SKU sells through multiple channels with different lead times, which takes priority?
   - **Decision Required By**: Business logic review
   - **Impact**: May require channel-specific replenishment suggestions

3. **Currency Display**: Should order quantities show cost estimates (Qty × Unit Cost)?
   - **Decision Required By**: Finance team
   - **Impact**: Requires integration with pricing data

---

## 16. APPENDIX

### 16.1 SQL View Schema Reference

```sql
-- v_replenishment_suggestions columns
sku                      TEXT
product_name             TEXT
risk_week_iso            TEXT
risk_week_start          DATE
risk_week_end            DATE
suggested_order_qty      INTEGER
order_deadline_week      TEXT
order_deadline_date      DATE
ship_deadline_week       TEXT
ship_deadline_date       DATE
priority                 TEXT ('Critical'|'High'|'Medium'|'Low')
opening_stock            INTEGER
closing_stock            INTEGER
safety_stock_threshold   INTEGER
effective_sales          INTEGER
stock_status             TEXT ('Stockout'|'Risk')
is_overdue               BOOLEAN
days_until_deadline      INTEGER
calculated_at            TIMESTAMP
```

### 16.2 Calculation Examples

**Example 1: Critical Priority**
- SKU: A001
- Risk Week: 2025-W50 (starts 2025-12-09)
- Closing Stock in W50: 150 units
- Safety Threshold: 1,200 units
- Weekly Sales: 300 units
- **Calculation**:
  - Gap = 1200 - 150 = 1,050
  - Min 4 weeks sales = 300 × 4 = 1,200
  - Suggested Qty = CEILING(MAX(1050, 1200) / 100) × 100 = **1,200 units**
- Order Deadline: W50 start - (4 weeks × 7 days) = 2025-11-11
- Priority: Critical (week offset = 1)

**Example 2: Low Priority**
- SKU: B002
- Risk Week: 2025-W62 (starts 2026-02-16)
- Closing Stock in W62: 800 units
- Safety Threshold: 1,500 units
- Weekly Sales: 150 units
- **Calculation**:
  - Gap = 1500 - 800 = 700
  - Min 4 weeks sales = 150 × 4 = 600
  - Suggested Qty = CEILING(MAX(700, 600) / 100) × 100 = **700 units**
- Order Deadline: W62 start - (4 weeks × 7 days) = 2026-01-19
- Priority: Low (week offset = 11)

---

## DOCUMENT SIGN-OFF

| Role | Name | Approval Status | Date |
|------|------|----------------|------|
| Product Director | [Your Name] | Draft Complete | 2025-11-30 |
| Engineering Lead | TBD | Pending Review | - |
| UX Designer | TBD | Pending Review | - |
| Demand Planning Lead | TBD | Pending Review | - |

---

**END OF DOCUMENT**
