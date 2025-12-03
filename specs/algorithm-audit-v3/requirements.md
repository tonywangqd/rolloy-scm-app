# Algorithm Audit V3 - Requirements Summary

## Document Metadata
- **Feature:** Algorithm Verification Table V3.0
- **Role:** Product Director
- **Date:** 2025-12-03
- **Status:** Requirements Complete

---

## 1. Business Need

### 1.1 Problem Statement
The current inventory projection system needs a comprehensive verification tool that can:
1. **Validate Algorithm Accuracy**: Verify that the replenishment algorithm correctly calculates procurement timing
2. **Track Dual-Track Data**: Show both planned (calculated) vs actual (recorded) values across the entire supply chain
3. **Support Root Cause Analysis**: When stockouts occur, trace back to identify which milestone was missed

### 1.2 User Story
**As a** Supply Chain Manager
**I want** to see a week-by-week breakdown of planned vs actual milestones (ordering, factory shipping, logistics shipping, and arrival)
**So that** I can validate the algorithm's recommendations and identify execution gaps

---

## 2. Feature Overview

### 2.1 The 20-Column Algorithm Verification Table

A comprehensive table displaying **5 milestone groups** across the supply chain:

| Group | Columns | Purpose |
|-------|---------|---------|
| Week | 1 column | ISO week identifier (fixed left column) |
| Sales | 3 columns | Forecast, Actual, Effective (demand data) |
| Order | 3 columns | Planned, Actual, Effective (purchase order timing) |
| Factory Ship | 3 columns | Planned, Actual, Effective (production delivery) |
| Ship | 3 columns | Planned, Actual, Effective (logistics departure) |
| Arrival | 3 columns | Planned, Actual, Effective (warehouse arrival) |
| Inventory | 4 columns | Opening, Closing, Safety Threshold, Status |

**Total: 20 Columns**

### 2.2 Key Concepts

**Reverse Calculation**
From each week's sales demand, calculate backwards to determine when procurement should have occurred:

```
销售 (周X) → 到仓 (周A) → 发货 (周B) → 出货 (周C) → 下单 (周D)
            ↑ -2周        ↑ -5周       ↑ -1周       ↑ -5周
         (安全库存)    (物流周期)   (装柜周期)   (生产周期)
```

**Aggregation**
When multiple sales demands map to the same week, quantities accumulate:
- Week W08 sales 373 → W06 arrival +373
- Week W10 sales 350 → W06 arrival +350
- **Result:** W06 planned arrival = 723

**Effective Values**
Each milestone shows 3 values:
- **Planned**: Reverse-calculated from sales demand
- **Actual**: Recorded in database (POs, deliveries, shipments)
- **Effective**: `COALESCE(Actual, Planned)` - actual takes precedence

---

## 3. Functional Requirements

### 3.1 Must Have (P0)

1. **FR-1: 20-Column Table Display**
   - Display all 20 columns in a horizontally scrollable table
   - First column (week_iso) must be sticky/fixed during horizontal scroll
   - Support 16-week window (4 past + current + 11 future)

2. **FR-2: Reverse Calculation Engine**
   - Calculate planned quantities by backtracking from sales demands
   - Use configurable lead times from product table
   - Accumulate quantities when multiple demands map to same week

3. **FR-3: Dual-Track Data Integration**
   - Fetch actual data from 5 database tables (POs, deliveries, shipments, sales actuals)
   - Aggregate actual data by ISO week
   - Apply COALESCE logic to determine effective values

4. **FR-4: Rolling Inventory Calculation**
   - Calculate week-over-week inventory: `closing = opening + arrival_effective - sales_effective`
   - Determine safety threshold per week: `sales_effective × safety_stock_weeks`
   - Classify stock status: OK (green), Risk (yellow), Stockout (red)

5. **FR-5: Lead Time Configuration**
   - Read safety_stock_weeks and production_lead_weeks from products table
   - Allow user to configure shipping_weeks (range: 4-6 weeks, default: 5)
   - Fixed loading_weeks = 1 week

### 3.2 Should Have (P1)

6. **FR-6: Visual Differentiation**
   - Highlight actual values with green background
   - Show current week with badge
   - Color-code stock status cells

7. **FR-7: Metadata Display**
   - Show lead time summary at top (production, loading, shipping, safety stock)
   - Show data range and average weekly sales at bottom

### 3.3 Nice to Have (P2)

8. **FR-8: Expandable Details** (Future)
   - Click on arrival cells to see shipment tracking details
   - Show which shipments contributed to that week's arrival

9. **FR-9: Export Functionality** (Future)
   - Export table to Excel with formatting preserved

---

## 4. Data Sources

### 4.1 Database Tables Required

| Table | Fields Used | Purpose |
|-------|-------------|---------|
| `products` | sku, safety_stock_weeks, production_lead_weeks | Lead time configuration |
| `sales_forecasts` | sku, week_iso, forecast_qty | Planned sales demand |
| `sales_actuals` | sku, week_iso, actual_qty | Actual sales (overrides forecast) |
| `purchase_orders` + `purchase_order_items` | actual_order_date, sku, ordered_qty | Actual order timing |
| `production_deliveries` | sku, actual_delivery_date, delivered_qty | Actual factory shipments |
| `shipments` + `shipment_items` | actual_departure_date, actual_arrival_date, planned_arrival_date, sku, shipped_qty | Actual logistics data |
| `inventory_snapshots` | sku, qty_on_hand | Current stock (starting point) |

### 4.2 Data Transformation

**Weekly Aggregation**
```sql
-- Example: Aggregate orders by week
SELECT
  date_trunc('week', actual_order_date)::date as week_start,
  SUM(ordered_qty) as total_ordered
FROM purchase_orders po
JOIN purchase_order_items poi ON po.id = poi.po_id
WHERE poi.sku = 'D-001'
  AND po.actual_order_date IS NOT NULL
GROUP BY date_trunc('week', actual_order_date)
```

---

## 5. User Interface Mockup

### 5.1 Table Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SKU: D-001  |  Product Name: Product A                                        物流周期: [5] 周              │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 生产周期: 5周  |  装柜周期: 1周  |  物流周期: 5周  |  安全库存: 2周                                        │
├───────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────────────────┤
│ 周次  │   销售       │   下单       │  工厂出货    │  物流发货    │    到仓      │       库存               │
│ (固定)│  预 实 取   │  预 实 取   │  预 实 取   │  预 实 取   │  预 实 取   │  期初 期末 安全 状态    │
├───────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────────────────┤
│W05    │ 350  - 350  │ 723  800 800│  0   0   0  │  0   0   0  │  0   0   0  │ 1500 1150  700  OK      │
│W06 ✓ │ 400 373 373  │ 400  0  400 │ 723  0  723 │  0   0   0  │ 723  0  723 │ 1150 1500  746  OK      │
│W07    │ 350  -  350  │  0   0   0  │ 400  0  400 │ 723  0  723 │  0   0   0  │ 1500 1150  700  OK      │
└───────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────────────────┘

✓ = 当前周
绿色背景 = 实际数据
黄色 = Risk
红色 = Stockout
```

### 5.2 Color Coding

| Element | Color | Meaning |
|---------|-------|---------|
| Green background | `bg-green-50` | Actual data exists |
| Gray background | `bg-gray-50` | Planned data (no actual yet) |
| Bold text | `font-bold` | Effective value column |
| Green badge | `badge-success` | Stock status: OK |
| Yellow badge | `badge-warning` | Stock status: Risk |
| Red badge | `badge-destructive` | Stock status: Stockout |

---

## 6. Validation Rules

### 6.1 Lead Time Constraints

| Parameter | Min | Max | Default | Source |
|-----------|-----|-----|---------|--------|
| Safety Stock Weeks | 1 | 10 | 2 | `products.safety_stock_weeks` |
| Production Lead Weeks | 1 | 52 | 5 | `products.production_lead_weeks` |
| Loading Weeks | 1 | 1 | 1 | Fixed constant |
| Shipping Weeks | 4 | 6 | 5 | User input |

### 6.2 Data Quality Rules

1. **Week Range**: Must use ISO week format (YYYY-WNN)
2. **Quantity Validation**: All quantities must be >= 0
3. **Stock Calculation**: `closing_stock` can be negative (indicates stockout)
4. **Effective Logic**: Always prioritize actual over planned

---

## 7. Success Metrics

### 7.1 Accuracy Metrics
- **Algorithm Accuracy**: Compare planned vs actual arrival quantities (target: <10% variance)
- **Data Completeness**: Percentage of weeks with actual data vs planned data (target: >80% for past weeks)

### 7.2 User Adoption Metrics
- **Usage Frequency**: Number of SKU queries per week (target: >50)
- **Time Spent**: Average session duration on audit table (target: >5 minutes)

### 7.3 Business Impact
- **Stockout Prevention**: Reduction in stockout incidents after using audit tool (target: -20%)
- **Execution Compliance**: Percentage of orders placed on time vs planned (target: >90%)

---

## 8. Out of Scope (Phase 1)

The following features are explicitly **not included** in V3.0:

1. Real-time notifications when actual deviates from planned
2. Automated email reports of algorithm variance
3. Multi-SKU comparison view (side-by-side)
4. Historical trend analysis (algorithm accuracy over time)
5. What-if scenario modeling (change lead times and see impact)
6. Integration with procurement approval workflows

These may be considered for future phases (V3.1+).

---

## 9. Dependencies

### 9.1 Technical Dependencies
- Next.js 16 App Router with Server Components
- Supabase PostgreSQL database
- TypeScript strict mode
- date-fns library for ISO week calculations

### 9.2 Data Dependencies
- `products` table must have `production_lead_weeks` column (migration required if missing)
- All transactional tables must use ISO week format for time-based queries
- Inventory snapshots must be current (within 7 days)

### 9.3 User Dependencies
- User must understand dual-track data concept (actual vs planned)
- User must understand reverse calculation logic
- User must have access to inventory module

---

## 10. Acceptance Criteria

### AC-1: Display 20-Column Table
- **Given** a valid SKU
- **When** user navigates to Algorithm Audit V3 page
- **Then** table displays 20 columns with correct headers
- **And** first column (week_iso) is sticky during horizontal scroll
- **And** table shows 16 weeks of data

### AC-2: Reverse Calculation
- **Given** SKU "D-001" with sales in W08 (373 units)
- **And** safety_stock_weeks = 2, shipping_weeks = 5, loading_weeks = 1, production_weeks = 5
- **When** reverse calculation runs
- **Then** W06 shows planned_arrival = 373
- **And** W01 shows planned_ship = 373
- **And** previous year W52 shows planned_factory_ship = 373
- **And** previous year W47 shows planned_order = 373

### AC-3: Aggregation
- **Given** multiple sales demands mapping to same arrival week
- **When** W08 sales 373 and W10 sales 350 both map to W06 arrival
- **Then** W06 planned_arrival = 723

### AC-4: Dual-Track Data
- **Given** actual_arrival data exists for W06 (800 units)
- **And** planned_arrival for W06 = 723 units
- **When** effective value is calculated
- **Then** arrival_effective = 800 (actual takes precedence)
- **And** W06 arrival actual cell has green background

### AC-5: Rolling Inventory
- **Given** W05 closing_stock = 1150
- **And** W06 arrival_effective = 723
- **And** W06 sales_effective = 373
- **When** inventory is calculated
- **Then** W06 opening_stock = 1150
- **And** W06 closing_stock = 1500 (1150 + 723 - 373)

### AC-6: Stock Status
- **Given** W06 closing_stock = 1500
- **And** W06 sales_effective = 373
- **And** safety_stock_weeks = 2
- **When** status is determined
- **Then** safety_threshold = 746 (373 × 2)
- **And** stock_status = "OK" (1500 > 746)

### AC-7: Configurable Shipping Weeks
- **Given** default shipping_weeks = 5
- **When** user changes to 4 weeks
- **Then** all planned_ship calculations shift by 1 week earlier
- **And** table re-renders with new values

---

## 11. Timeline and Milestones

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Design | 1 day | Complete technical design document |
| Backend | 2 days | Query function + TypeScript types |
| Frontend | 2 days | Table component + page integration |
| Testing | 1 day | Unit tests + integration tests |
| Documentation | 1 day | User guide + inline comments |
| **Total** | **7 days** | Fully functional Algorithm Audit V3 |

---

## End of Requirements Document

**Approval Required From:**
- Product Manager (Business Logic)
- Engineering Lead (Technical Feasibility)
- Supply Chain Manager (User Acceptance)

**Next Step:** Proceed to technical design (`design.md`)
