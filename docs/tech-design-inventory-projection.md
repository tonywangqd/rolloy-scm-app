# Technical Design: Inventory Projection 12 Weeks

**Date:** 2025-01-30
**Status:** Ready for Implementation
**System:** Rolloy SCM Supply Chain Management

---

## Executive Summary

This document defines the technical architecture for the **12-Week Inventory Projection** feature, a critical planning tool that forecasts inventory levels using a dual-track methodology (actual vs. forecast sales). The system implements a rolling calculation algorithm that considers current stock, incoming shipments, and effective sales to predict future inventory positions and identify potential stockouts.

### Key Features

- **12-Week Rolling Projection**: Calculate projected inventory for the next 12 weeks
- **Dual-Track Sales Logic**: Prioritize actual sales data over forecasts when available
- **Risk Detection**: Automatically classify weeks as OK, Risk, or Stockout
- **Replenishment Suggestions**: Generate actionable purchase recommendations with deadlines
- **Real-time Calculation**: Materialized views with efficient refresh strategy

---

## 1. Business Logic

### 1.1 Core Formula

```
Closing Stock[W] = Opening Stock[W] + Incoming[W] - Effective Sales[W]

Where:
  - Opening Stock[W] = Closing Stock[W-1]  (Week 1 uses current inventory snapshot)
  - Incoming[W] = SUM(shipment_items WHERE effective_arrival_week = W)
  - Effective Sales[W] = COALESCE(actual_qty, forecast_qty)  [Dual-track]
  - Effective Arrival Date = COALESCE(actual_arrival_date, planned_arrival_date)
```

### 1.2 Risk Level Classification

| Status | Condition | Business Meaning |
|--------|-----------|------------------|
| **Stockout** | `closing_stock < 0` | Critical: Will run out of stock |
| **Risk** | `0 <= closing_stock < safety_stock_threshold` | Warning: Below safety threshold |
| **OK** | `closing_stock >= safety_stock_threshold` | Healthy: Sufficient inventory |

### 1.3 Safety Stock Threshold

```
Safety Stock Threshold = Average Weekly Sales × Safety Stock Weeks

Where:
  - Average Weekly Sales = AVG(effective_sales) over 12-week projection period
  - Safety Stock Weeks = Configured per product (typically 4-8 weeks)
```

### 1.4 Replenishment Logic

For SKUs with Risk or Stockout status:

```
Suggested Order Qty = MAX(
  Safety Stock Threshold - Closing Stock[First Risk Week],
  Average Weekly Sales × 4 weeks  [Minimum order quantity]
)
Rounded up to nearest 100 units

Order Deadline Date = First Risk Week Start Date - (Safety Stock Weeks × 7 days)
Ship Deadline Date = First Risk Week Start Date - 14 days
```

**Priority Classification:**

| Priority | Condition | Action Required |
|----------|-----------|-----------------|
| **Critical** | Risk in weeks 0-2 | Order immediately |
| **High** | Risk in weeks 3-4 | Order within this week |
| **Medium** | Risk in weeks 5-8 | Plan order soon |
| **Low** | Risk in weeks 9-11 | Monitor and plan |

---

## 2. Database Design

### 2.1 Schema Dependencies

#### Existing Tables Used

1. **products** - Product master data (SKU, safety_stock_weeks)
2. **inventory_snapshots** - Current stock levels by warehouse
3. **shipments** - Incoming shipments with arrival dates
4. **shipment_items** - Shipment line items (SKU, quantity)
5. **sales_forecasts** - Forecasted sales by SKU/channel/week
6. **sales_actuals** - Actual sales by SKU/channel/week

### 2.2 Materialized Views

#### 2.2.1 `v_inventory_projection_12weeks`

**Purpose:** Calculate 12-week rolling inventory projection for all active SKUs

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `sku` | text | Product SKU |
| `product_name` | text | Product name |
| `week_iso` | text | ISO week (e.g., '2025-W05') |
| `week_start_date` | date | Monday of the week |
| `week_end_date` | date | Sunday of the week |
| `week_offset` | int | 0-11 (0 = current week) |
| `opening_stock` | numeric | Stock at start of week |
| `incoming_qty` | numeric | Expected arrivals this week |
| `effective_sales` | numeric | COALESCE(actual, forecast) |
| `forecast_qty` | numeric | Forecasted sales |
| `actual_qty` | numeric | Actual sales (null if future) |
| `closing_stock` | numeric | Stock at end of week |
| `safety_stock_threshold` | numeric | Minimum safe stock level |
| `stock_status` | text | 'OK', 'Risk', or 'Stockout' |
| `weeks_until_stockout` | int | Estimated weeks until zero |
| `calculated_at` | timestamp | View refresh timestamp |

**Calculation Strategy:**

1. Generate 12-week range from `CURRENT_DATE`
2. Cross join with active SKUs to create projection grid
3. Aggregate current inventory by SKU
4. Calculate incoming qty per week using `COALESCE(actual_arrival_date, planned_arrival_date)`
5. Calculate effective sales using dual-track logic
6. Use window functions (`LAG`, `SUM OVER`) to compute rolling stock
7. Classify risk levels

**Indexes:**

```sql
CREATE INDEX idx_inv_proj_12w_sku ON v_inventory_projection_12weeks(sku);
CREATE INDEX idx_inv_proj_12w_week ON v_inventory_projection_12weeks(week_iso);
CREATE INDEX idx_inv_proj_12w_status ON v_inventory_projection_12weeks(stock_status);
CREATE INDEX idx_inv_proj_12w_sku_week ON v_inventory_projection_12weeks(sku, week_iso);
```

#### 2.2.2 `v_replenishment_suggestions`

**Purpose:** Identify SKUs at risk and calculate replenishment recommendations

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `sku` | text | Product SKU |
| `product_name` | text | Product name |
| `risk_week_iso` | text | First week with risk/stockout |
| `risk_week_start` | date | Start date of risk week |
| `suggested_order_qty` | numeric | Recommended order quantity |
| `order_deadline_week` | text | Week to place order by |
| `order_deadline_date` | date | Date to place order by |
| `ship_deadline_week` | text | Week shipment must depart |
| `ship_deadline_date` | date | Date shipment must depart |
| `priority` | text | 'Critical', 'High', 'Medium', 'Low' |
| `is_overdue` | boolean | Deadline has passed |
| `days_until_deadline` | numeric | Days until order deadline |
| `opening_stock` | numeric | Stock at risk week start |
| `closing_stock` | numeric | Stock at risk week end |
| `safety_stock_threshold` | numeric | Target stock level |
| `calculated_at` | timestamp | View refresh timestamp |

**Calculation Strategy:**

1. Filter projections to Risk/Stockout status
2. Identify first risk week per SKU using `ROW_NUMBER()`
3. Calculate suggested order quantity (rounded to 100s)
4. Compute deadlines based on lead time (safety_stock_weeks)
5. Classify priority based on week_offset
6. Filter out very old deadlines (keep last 7 days for visibility)

**Indexes:**

```sql
CREATE INDEX idx_replen_sugg_sku ON v_replenishment_suggestions(sku);
CREATE INDEX idx_replen_sugg_priority ON v_replenishment_suggestions(priority);
CREATE INDEX idx_replen_sugg_deadline ON v_replenishment_suggestions(order_deadline_date);
CREATE INDEX idx_replen_sugg_overdue ON v_replenishment_suggestions(is_overdue);
```

### 2.3 Helper Functions

```sql
-- Get ISO week string from date (e.g., '2025-W05')
CREATE FUNCTION get_week_iso(input_date DATE) RETURNS TEXT

-- Get Monday of ISO week
CREATE FUNCTION get_week_start_date(input_date DATE) RETURNS DATE

-- Get Sunday of ISO week
CREATE FUNCTION get_week_end_date(input_date DATE) RETURNS DATE

-- Refresh both materialized views
CREATE FUNCTION refresh_inventory_projections() RETURNS void
```

### 2.4 Data Refresh Strategy

**Frequency:** Daily at 2:00 AM (or after major data updates)

**Trigger Events:**
- New shipment arrivals recorded
- Sales actuals imported
- Forecast data updated
- Manual refresh requested by user

**Execution:**
```sql
SELECT refresh_inventory_projections();
-- Runs: REFRESH MATERIALIZED VIEW CONCURRENTLY v_inventory_projection_12weeks;
-- Then:  REFRESH MATERIALIZED VIEW CONCURRENTLY v_replenishment_suggestions;
```

**Performance Considerations:**
- Use `CONCURRENTLY` to avoid locking during refresh
- Requires unique indexes on views
- Estimated refresh time: 2-10 seconds for 1000 SKUs

---

## 3. API Layer Design

### 3.1 Query Functions

Location: `/src/lib/queries/inventory-projection.ts`

#### 3.1.1 Inventory Projection Queries

```typescript
// Fetch 12-week projection with filters
fetchInventoryProjection12Weeks(
  filters?: InventoryProjectionFilters
): Promise<InventoryProjection12WeeksView[]>

// Fetch projection for single SKU
fetchProjectionBySku(
  sku: string
): Promise<InventoryProjection12WeeksView[]>

// Fetch projections grouped by SKU
fetchProjectionsGroupedBySku(): Promise<
  Map<string, InventoryProjection12WeeksView[]>
>

// Fetch projections for specific week
fetchProjectionByWeek(
  week_iso: string
): Promise<InventoryProjection12WeeksView[]>

// Fetch SKUs at risk (any risk in 12 weeks)
fetchSkusAtRisk(): Promise<{
  sku: string
  product_name: string
  first_risk_week: string
  first_risk_week_offset: number
  stock_status: 'Stockout' | 'Risk'
  closing_stock: number
}[]>

// Fetch risk summary statistics
fetchRiskSummary(): Promise<RiskSummaryStats>
```

#### 3.1.2 Replenishment Suggestion Queries

```typescript
// Fetch replenishment suggestions with filters
fetchReplenishmentSuggestions(
  filters?: ReplenishmentSuggestionFilters
): Promise<ReplenishmentSuggestionView[]>

// Fetch suggestions for single SKU
fetchReplenishmentBySku(
  sku: string
): Promise<ReplenishmentSuggestionView[]>

// Fetch critical replenishments (Critical/High priority)
fetchCriticalReplenishments(): Promise<
  ReplenishmentSuggestionView[]
>

// Fetch overdue replenishments
fetchOverdueReplenishments(): Promise<
  ReplenishmentSuggestionView[]
>
```

#### 3.1.3 Admin Functions

```typescript
// Manually refresh materialized views
refreshInventoryProjectionViews(): Promise<void>

// Get last calculated timestamp
getLastCalculatedTimestamp(): Promise<string | null>
```

### 3.2 Filter Types

```typescript
interface InventoryProjectionFilters {
  sku?: string                    // Single SKU filter
  skus?: string[]                 // Multiple SKUs filter
  week_iso?: string               // Specific week
  stock_status?: 'Stockout' | 'Risk' | 'OK' | 'All'
  min_week_offset?: number        // Filter by week range
  max_week_offset?: number
}

interface ReplenishmentSuggestionFilters {
  sku?: string
  priority?: 'Critical' | 'High' | 'Medium' | 'Low'
  is_overdue?: boolean
  max_days_until_deadline?: number  // e.g., 7 for next week
}
```

---

## 4. Data Flow Architecture

### 4.1 System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA SOURCES                                 │
├─────────────────────────────────────────────────────────────────┤
│  inventory_snapshots  │  shipments  │  sales_forecasts  │       │
│  (current stock)      │  (incoming) │  (forecasted)     │       │
│                       │             │                   │       │
│                       │  shipment_  │  sales_actuals    │       │
│                       │  items      │  (actual sales)   │       │
└───────────┬───────────┴─────┬───────┴────────┬──────────────────┘
            │                 │                │
            │    ┌────────────▼────────────────▼───────────────┐
            │    │     DUAL-TRACK SALES LOGIC                  │
            │    │  COALESCE(actual_qty, forecast_qty)         │
            │    └────────────┬────────────────────────────────┘
            │                 │
            ▼                 ▼
    ┌───────────────────────────────────────────────────────────┐
    │   MATERIALIZED VIEW: v_inventory_projection_12weeks       │
    │                                                            │
    │   Calculation Steps:                                      │
    │   1. Generate 12-week range (week_offset 0-11)            │
    │   2. Cross join with active SKUs                          │
    │   3. Aggregate current inventory                          │
    │   4. Calculate incoming qty by effective arrival week     │
    │   5. Calculate effective sales (dual-track)               │
    │   6. Rolling calculation using window functions:          │
    │      - LAG(closing_stock) as next opening_stock           │
    │      - SUM OVER for cumulative changes                    │
    │   7. Classify risk levels (Stockout/Risk/OK)              │
    │                                                            │
    │   Refresh: Daily 2AM or on-demand                         │
    └───────────────┬───────────────────────────────────────────┘
                    │
                    │ (Filter: stock_status IN ('Risk', 'Stockout'))
                    │
                    ▼
    ┌───────────────────────────────────────────────────────────┐
    │   MATERIALIZED VIEW: v_replenishment_suggestions          │
    │                                                            │
    │   Calculation Steps:                                      │
    │   1. Identify first risk week per SKU                     │
    │   2. Calculate suggested_order_qty                        │
    │      = MAX(safety_threshold - closing_stock, min_order)   │
    │      Rounded to nearest 100                               │
    │   3. Calculate deadlines:                                 │
    │      - order_deadline = risk_week - lead_time             │
    │      - ship_deadline = risk_week - 14 days                │
    │   4. Classify priority (Critical/High/Medium/Low)         │
    │   5. Mark overdue if order_deadline < CURRENT_DATE        │
    │                                                            │
    │   Refresh: Cascade from projection view                   │
    └───────────────┬───────────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────────────────────────┐
    │              API QUERY LAYER                              │
    │         (inventory-projection.ts)                         │
    │                                                            │
    │  - fetchInventoryProjection12Weeks()                      │
    │  - fetchProjectionBySku()                                 │
    │  - fetchRiskSummary()                                     │
    │  - fetchReplenishmentSuggestions()                        │
    │  - fetchCriticalReplenishments()                          │
    └───────────────┬───────────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────────────────────────┐
    │            NEXT.JS SERVER COMPONENTS                      │
    │                                                            │
    │  - 12-Week Projection Table View                          │
    │  - SKU Detail Projection Chart                            │
    │  - Replenishment Dashboard                                │
    │  - Risk Summary Cards                                     │
    └───────────────────────────────────────────────────────────┘
```

### 4.2 Calculation Flow (Detailed)

#### Step 1: Initialize Week Range

```sql
WITH week_range AS (
  SELECT
    get_week_iso(CURRENT_DATE + (n || ' weeks')::INTERVAL) AS week_iso,
    get_week_start_date(CURRENT_DATE + (n || ' weeks')::INTERVAL) AS week_start_date,
    get_week_end_date(CURRENT_DATE + (n || ' weeks')::INTERVAL) AS week_end_date,
    n AS week_offset
  FROM generate_series(0, 11) AS n
)
```

**Output:** 12 rows with weeks 0-11

#### Step 2: Create Projection Grid

```sql
projection_base AS (
  SELECT
    s.sku,
    s.product_name,
    w.week_iso,
    w.week_offset
  FROM active_skus s
  CROSS JOIN week_range w
)
```

**Output:** N_skus × 12 rows (e.g., 500 SKUs = 6,000 rows)

#### Step 3: Aggregate Incoming Quantities

```sql
incoming_by_week AS (
  SELECT
    si.sku,
    get_week_iso(COALESCE(s.actual_arrival_date, s.planned_arrival_date)) AS arrival_week_iso,
    SUM(si.shipped_qty) AS incoming_qty
  FROM shipment_items si
  INNER JOIN shipments s ON si.shipment_id = s.id
  WHERE effective_arrival_date BETWEEN CURRENT_DATE AND CURRENT_DATE + '12 weeks'
  GROUP BY si.sku, arrival_week_iso
)
```

**Key Logic:**
- Uses `COALESCE(actual, planned)` for arrival date
- Only includes shipments arriving in next 12 weeks
- Groups by SKU and arrival week

#### Step 4: Calculate Effective Sales (Dual-Track)

```sql
effective_sales_by_week AS (
  SELECT
    sf.sku,
    sf.week_iso,
    COALESCE(SUM(sf.forecast_qty), 0) AS total_forecast_qty,
    COALESCE(SUM(sa.actual_qty), 0) AS total_actual_qty,
    COALESCE(
      NULLIF(SUM(sa.actual_qty), 0),  -- Use actual if > 0
      SUM(sf.forecast_qty)            -- Otherwise use forecast
    ) AS effective_sales
  FROM sales_forecasts sf
  LEFT JOIN sales_actuals sa
    ON sf.sku = sa.sku
    AND sf.channel_code = sa.channel_code
    AND sf.week_iso = sa.week_iso
  WHERE sf.week_start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + '12 weeks'
  GROUP BY sf.sku, sf.week_iso
)
```

**Key Logic:**
- Sums across all channels per SKU per week
- Uses actual sales if available (even partial)
- Falls back to forecast if no actual data

#### Step 5: Rolling Calculation with Window Functions

```sql
rolling_projection AS (
  SELECT
    sku,
    week_iso,
    week_offset,
    incoming_qty,
    effective_sales,
    -- Opening stock calculation
    CASE
      WHEN week_offset = 0 THEN current_stock
      ELSE LAG(closing_stock) OVER (PARTITION BY sku ORDER BY week_offset)
    END AS opening_stock
  FROM weekly_data
)

-- Then calculate closing stock
SELECT
  opening_stock + incoming_qty - effective_sales AS closing_stock
```

**Key Logic:**
- Week 0: Uses `current_stock` from inventory_snapshots
- Week 1-11: Uses previous week's `closing_stock` via `LAG()`
- Window function ensures sequential calculation per SKU

#### Step 6: Risk Classification

```sql
SELECT
  *,
  CASE
    WHEN closing_stock < 0 THEN 'Stockout'
    WHEN closing_stock < safety_stock_threshold THEN 'Risk'
    ELSE 'OK'
  END AS stock_status
FROM rolling_projection
```

---

## 5. Performance Optimization

### 5.1 Indexing Strategy

**Primary Indexes:**
- `idx_inv_proj_12w_sku`: Fast SKU lookups
- `idx_inv_proj_12w_week`: Fast week-based queries
- `idx_inv_proj_12w_sku_week`: Composite for detail views
- `idx_inv_proj_12w_status`: Fast risk filtering

**Source Table Indexes Required:**
```sql
-- Ensure these exist on source tables
CREATE INDEX idx_shipments_arrival ON shipments(
  COALESCE(actual_arrival_date, planned_arrival_date)
);
CREATE INDEX idx_sales_forecasts_week ON sales_forecasts(week_iso);
CREATE INDEX idx_sales_actuals_week ON sales_actuals(week_iso);
CREATE INDEX idx_inventory_snapshots_sku ON inventory_snapshots(sku);
```

### 5.2 Query Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Materialized view refresh | < 10s | For 1000 SKUs, 12 weeks |
| Fetch all projections | < 500ms | 12,000 rows (1000 SKUs × 12) |
| Fetch single SKU | < 50ms | 12 rows |
| Fetch risk summary | < 100ms | Aggregation query |
| Fetch replenishments | < 200ms | Typically 50-200 rows |

### 5.3 Caching Strategy

**Application Layer:**
- Cache `fetchRiskSummary()` for 5 minutes
- Cache `getLastCalculatedTimestamp()` for 1 minute
- No caching for detail queries (data must be fresh)

**Database Layer:**
- Materialized views act as pre-computed cache
- Refresh concurrently to avoid query blocking

### 5.4 Scalability Considerations

**Current Design:**
- Handles 1,000 SKUs efficiently
- 12,000 rows in projection view

**Optimization for 5,000+ SKUs:**
- Consider partitioning projection view by week_offset
- Implement incremental refresh (only changed SKUs)
- Add database-level caching for complex aggregations

---

## 6. Integration Points

### 6.1 Frontend Components

**Recommended UI Components:**

1. **Projection Table Component**
   - Display: 12-week grid view
   - Features: Filter by SKU, status, week
   - Component: `ComplexTable` (from existing system)

2. **SKU Detail Chart**
   - Display: Line chart with stock levels
   - Features: Show opening, incoming, sales, closing
   - Component: `Recharts` (recommended: `LineChart`)

3. **Risk Summary Cards**
   - Display: KPI cards (Stockout count, Risk count, Critical count)
   - Component: `StatCard` (from existing system)

4. **Replenishment Dashboard**
   - Display: Priority-sorted table with deadlines
   - Features: Filter by priority, overdue status
   - Component: `ComplexTable` with conditional formatting

### 6.2 Data Update Triggers

**Automatic Refresh Triggers:**

```typescript
// After shipment arrival update
async function recordShipmentArrival(shipmentId: string, actualDate: string) {
  // ... update shipment record ...
  await refreshInventoryProjectionViews()
}

// After sales actual import
async function importSalesActuals(data: SalesActual[]) {
  // ... insert sales actuals ...
  await refreshInventoryProjectionViews()
}

// After forecast batch update
async function updateForecastBatch(forecasts: SalesForecast[]) {
  // ... update forecasts ...
  await refreshInventoryProjectionViews()
}
```

**Manual Refresh:**
- Admin page with "Refresh Projections" button
- Display last calculated timestamp
- Show refresh status indicator

### 6.3 Background Job Scheduling

**Recommended Setup (Vercel Cron):**

```typescript
// app/api/cron/refresh-projections/route.ts
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await refreshInventoryProjectionViews()
    return Response.json({ success: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Cron refresh failed:', error)
    return Response.json({ success: false, error: error.message }, { status: 500 })
  }
}
```

**Vercel Cron Configuration (vercel.json):**

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-projections",
      "schedule": "0 2 * * *"
    }
  ]
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**Database Functions:**
```sql
-- Test week ISO calculation
SELECT get_week_iso('2025-01-30'::DATE); -- Expected: '2025-W05'

-- Test week start/end
SELECT get_week_start_date('2025-01-30'::DATE); -- Expected: 2025-01-27
SELECT get_week_end_date('2025-01-30'::DATE);   -- Expected: 2025-02-02
```

**Query Functions:**
```typescript
// Test SKU filtering
const projections = await fetchProjectionBySku('SKU-001')
expect(projections).toHaveLength(12)
expect(projections.every(p => p.sku === 'SKU-001')).toBe(true)

// Test risk summary
const summary = await fetchRiskSummary()
expect(summary.total_skus).toBeGreaterThan(0)
expect(summary.ok_count + summary.risk_count + summary.stockout_count)
  .toBeLessThanOrEqual(summary.total_skus * 12)
```

### 7.2 Integration Tests

**Scenario 1: New Shipment Arrival**
```typescript
test('Projection updates after shipment arrival', async () => {
  // 1. Record initial projection
  const before = await fetchProjectionBySku('SKU-001')
  const week5Before = before.find(p => p.week_offset === 5)

  // 2. Add shipment arriving in week 5
  await createShipment({
    sku: 'SKU-001',
    qty: 1000,
    arrival_date: week5Before.week_start_date
  })

  // 3. Refresh projections
  await refreshInventoryProjectionViews()

  // 4. Verify incoming qty increased
  const after = await fetchProjectionBySku('SKU-001')
  const week5After = after.find(p => p.week_offset === 5)
  expect(week5After.incoming_qty).toBe(week5Before.incoming_qty + 1000)
})
```

**Scenario 2: Actual vs Forecast Override**
```typescript
test('Actual sales override forecast', async () => {
  // 1. Set forecast = 100
  await upsertSalesForecast({ sku: 'SKU-001', week: '2025-W05', qty: 100 })
  await refreshInventoryProjectionViews()

  const withForecast = await fetchProjectionByWeek('2025-W05')
  const sku001Forecast = withForecast.find(p => p.sku === 'SKU-001')
  expect(sku001Forecast.effective_sales).toBe(100)

  // 2. Add actual = 120
  await insertSalesActual({ sku: 'SKU-001', week: '2025-W05', qty: 120 })
  await refreshInventoryProjectionViews()

  const withActual = await fetchProjectionByWeek('2025-W05')
  const sku001Actual = withActual.find(p => p.sku === 'SKU-001')
  expect(sku001Actual.effective_sales).toBe(120) // Actual overrides forecast
})
```

### 7.3 Edge Cases

**Test Cases:**

1. **Zero inventory scenario**
   - Current stock = 0
   - No incoming shipments
   - Verify immediate stockout classification

2. **High safety stock weeks**
   - Safety stock weeks = 12
   - Verify risk threshold = 12 weeks of sales

3. **Multiple channels per SKU**
   - 5 channels × 100 units/week = 500 effective sales
   - Verify correct aggregation

4. **Shipment date changes**
   - Planned: Week 5, Actual: Week 3
   - Verify incoming qty moves to week 3

5. **Replenishment deadline in past**
   - Risk week = current week
   - Verify `is_overdue = true`

---

## 8. Migration & Deployment

### 8.1 Migration Checklist

1. **Pre-Migration Validation**
   - [ ] Verify source tables have data (inventory_snapshots, shipments, sales_forecasts)
   - [ ] Check for NULL values in critical fields (sku, week_iso, dates)
   - [ ] Validate date formats are consistent

2. **Migration Execution**
   - [ ] Run migration: `20250130_create_inventory_projection_12weeks_view.sql`
   - [ ] Verify helper functions created successfully
   - [ ] Verify materialized views created
   - [ ] Check initial view refresh completed

3. **Post-Migration Validation**
   - [ ] Query `SELECT COUNT(*) FROM v_inventory_projection_12weeks`
     - Expected: ~(active_sku_count × 12)
   - [ ] Query `SELECT COUNT(*) FROM v_replenishment_suggestions`
     - Expected: Number of at-risk SKUs
   - [ ] Verify indexes created
   - [ ] Test `refresh_inventory_projections()` function

4. **API Deployment**
   - [ ] Deploy `inventory-projection.ts` to production
   - [ ] Test API endpoints via Postman/curl
   - [ ] Verify error handling (invalid SKU, etc.)

5. **Frontend Integration**
   - [ ] Deploy projection table view
   - [ ] Deploy replenishment dashboard
   - [ ] Test filters and sorting
   - [ ] Verify loading states and error messages

### 8.2 Rollback Plan

**If migration fails:**

```sql
-- Drop materialized views
DROP MATERIALIZED VIEW IF EXISTS v_replenishment_suggestions CASCADE;
DROP MATERIALIZED VIEW IF EXISTS v_inventory_projection_12weeks CASCADE;

-- Drop helper functions
DROP FUNCTION IF EXISTS refresh_inventory_projections();
DROP FUNCTION IF EXISTS get_week_iso(DATE);
DROP FUNCTION IF EXISTS get_week_start_date(DATE);
DROP FUNCTION IF EXISTS get_week_end_date(DATE);
```

**If API issues occur:**
- Revert query file deployment
- Frontend will fall back to existing inventory views
- No data loss (source tables unchanged)

### 8.3 Monitoring

**Health Checks:**

```typescript
// app/api/health/projections/route.ts
export async function GET() {
  try {
    const lastCalculated = await getLastCalculatedTimestamp()
    const age = Date.now() - new Date(lastCalculated).getTime()
    const hoursSinceRefresh = age / (1000 * 60 * 60)

    const summary = await fetchRiskSummary()

    return Response.json({
      status: hoursSinceRefresh < 24 ? 'healthy' : 'stale',
      last_calculated: lastCalculated,
      hours_since_refresh: hoursSinceRefresh,
      total_skus: summary.total_skus,
      critical_count: summary.critical_priority_count
    })
  } catch (error) {
    return Response.json({ status: 'error', message: error.message }, { status: 500 })
  }
}
```

**Alerts:**
- Refresh job fails (email to admin)
- Data staleness > 36 hours (dashboard warning)
- Critical replenishment count > 10 (urgent notification)

---

## 9. Future Enhancements

### 9.1 Phase 2 Features

1. **Multi-Warehouse Projections**
   - Break down projections by warehouse
   - Account for inter-warehouse transfers
   - Channel-specific warehouse routing

2. **Confidence Intervals**
   - Add standard deviation to effective sales
   - Show high/low projections (P10, P50, P90)
   - Risk probability scoring

3. **What-If Analysis**
   - Simulate new shipments
   - Test different safety stock levels
   - Scenario comparison

4. **Auto-Purchase Orders**
   - Automatically create draft POs from replenishment suggestions
   - Integrate with supplier lead times
   - Batch optimization (MOQ, shipping consolidation)

### 9.2 Advanced Analytics

1. **Forecast Accuracy Tracking**
   - Compare forecast vs actual over time
   - Calculate MAPE (Mean Absolute Percentage Error)
   - Adjust future projections based on historical accuracy

2. **Seasonality Detection**
   - Identify seasonal patterns
   - Adjust safety stock by season
   - Holiday spike planning

3. **Replenishment Optimization**
   - Minimize freight costs via batch consolidation
   - Balance inventory cost vs stockout risk
   - Economic Order Quantity (EOQ) integration

---

## 10. Appendix

### 10.1 Sample Data

**Example Projection Output:**

```json
{
  "sku": "SKU-001-BLK",
  "product_name": "Premium Backpack - Black",
  "week_iso": "2025-W06",
  "week_start_date": "2025-02-03",
  "week_end_date": "2025-02-09",
  "week_offset": 1,
  "opening_stock": 850,
  "incoming_qty": 500,
  "effective_sales": 200,
  "forecast_qty": 200,
  "actual_qty": null,
  "closing_stock": 1150,
  "safety_stock_threshold": 800,
  "stock_status": "OK",
  "weeks_until_stockout": 5,
  "calculated_at": "2025-01-30T14:32:15Z"
}
```

**Example Replenishment Suggestion:**

```json
{
  "sku": "SKU-042-RED",
  "product_name": "Travel Duffel - Red",
  "risk_week_iso": "2025-W08",
  "risk_week_start": "2025-02-17",
  "suggested_order_qty": 1200,
  "order_deadline_week": "2025-W05",
  "order_deadline_date": "2025-02-03",
  "ship_deadline_week": "2025-W06",
  "ship_deadline_date": "2025-02-10",
  "priority": "High",
  "opening_stock": 450,
  "closing_stock": 150,
  "safety_stock_threshold": 600,
  "effective_sales": 300,
  "stock_status": "Risk",
  "is_overdue": false,
  "days_until_deadline": 4,
  "calculated_at": "2025-01-30T14:32:15Z"
}
```

### 10.2 SQL Query Examples

**Find all SKUs at risk in next 2 weeks:**

```sql
SELECT DISTINCT
  sku,
  product_name,
  MIN(week_offset) AS first_risk_week,
  MIN(closing_stock) AS lowest_stock
FROM v_inventory_projection_12weeks
WHERE week_offset <= 2
  AND stock_status IN ('Risk', 'Stockout')
GROUP BY sku, product_name
ORDER BY first_risk_week, lowest_stock;
```

**Compare forecast vs actual for current week:**

```sql
SELECT
  sku,
  product_name,
  forecast_qty,
  actual_qty,
  effective_sales,
  CASE
    WHEN actual_qty IS NOT NULL THEN 'Actual'
    ELSE 'Forecast'
  END AS sales_source
FROM v_inventory_projection_12weeks
WHERE week_offset = 0
ORDER BY sku;
```

**Get replenishments due this week:**

```sql
SELECT
  sku,
  product_name,
  suggested_order_qty,
  order_deadline_date,
  priority,
  EXTRACT(DAY FROM (order_deadline_date::DATE - CURRENT_DATE)) AS days_remaining
FROM v_replenishment_suggestions
WHERE order_deadline_date::DATE BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
ORDER BY priority, order_deadline_date;
```

### 10.3 References

**Related Documents:**
- Product Master Data Schema: `/docs/schema-products.md`
- Sales Forecasting Process: `/docs/process-forecasting.md`
- Shipment Management Workflow: `/docs/workflow-shipments.md`

**External Resources:**
- [PostgreSQL Window Functions](https://www.postgresql.org/docs/current/functions-window.html)
- [Materialized Views Best Practices](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [ISO 8601 Week Date](https://en.wikipedia.org/wiki/ISO_week_date)

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-30 | Rolloy Tech Team | Initial design document |

**Approval Status:** ✅ Ready for Implementation

**Next Steps:**
1. Review by Product Owner
2. Database migration in staging environment
3. API testing with sample data
4. Frontend prototype development
