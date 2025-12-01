-- ================================================================
-- Migration: Create Inventory Projection 12 Weeks View
-- Purpose: Calculate 12-week rolling inventory projections with risk levels
-- Author: Rolloy SCM System
-- Date: 2025-01-30
-- ================================================================

-- ================================================================
-- HELPER FUNCTION: Get Week ISO String from Date
-- ================================================================
CREATE OR REPLACE FUNCTION get_week_iso(input_date DATE)
RETURNS TEXT AS $$
BEGIN
  RETURN TO_CHAR(input_date, 'IYYY"-W"IW');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Overload for timestamp
CREATE OR REPLACE FUNCTION get_week_iso(input_date TIMESTAMP)
RETURNS TEXT AS $$
BEGIN
  RETURN TO_CHAR(input_date, 'IYYY"-W"IW');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Overload for timestamp with time zone
CREATE OR REPLACE FUNCTION get_week_iso(input_date TIMESTAMPTZ)
RETURNS TEXT AS $$
BEGIN
  RETURN TO_CHAR(input_date, 'IYYY"-W"IW');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================================================================
-- HELPER FUNCTION: Get Start of ISO Week
-- ================================================================
CREATE OR REPLACE FUNCTION get_week_start_date(input_date DATE)
RETURNS DATE AS $$
BEGIN
  -- ISO week starts on Monday
  RETURN DATE_TRUNC('week', input_date::TIMESTAMP)::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Overload for timestamp
CREATE OR REPLACE FUNCTION get_week_start_date(input_date TIMESTAMP)
RETURNS DATE AS $$
BEGIN
  RETURN DATE_TRUNC('week', input_date)::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================================================================
-- HELPER FUNCTION: Get End of ISO Week
-- ================================================================
CREATE OR REPLACE FUNCTION get_week_end_date(input_date DATE)
RETURNS DATE AS $$
BEGIN
  -- ISO week ends on Sunday
  RETURN (DATE_TRUNC('week', input_date::TIMESTAMP) + INTERVAL '6 days')::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Overload for timestamp
CREATE OR REPLACE FUNCTION get_week_end_date(input_date TIMESTAMP)
RETURNS DATE AS $$
BEGIN
  RETURN (DATE_TRUNC('week', input_date) + INTERVAL '6 days')::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================================================================
-- MATERIALIZED VIEW: 12-Week Inventory Projection
-- ================================================================
-- This view implements the dual-track inventory projection logic:
--
-- Closing Stock[W] = Opening Stock[W] + Incoming[W] - Effective Sales[W]
--
-- Where:
-- - Opening Stock[W] = Closing Stock[W-1] (Week 1 reads from inventory_snapshots)
-- - Incoming[W] = SUM(shipment_items WHERE effective_arrival_week = W)
-- - Effective Sales[W] = COALESCE(actual_qty, forecast_qty)
-- - effective_arrival_date = COALESCE(actual_arrival_date, planned_arrival_date)
--
-- Risk Levels:
-- - Stockout: closing_stock < 0
-- - Risk: closing_stock < safety_stock_threshold
-- - OK: closing_stock >= safety_stock_threshold
-- ================================================================

DROP MATERIALIZED VIEW IF EXISTS v_inventory_projection_12weeks CASCADE;

CREATE MATERIALIZED VIEW v_inventory_projection_12weeks AS
WITH
-- ================================================================
-- Step 1: Generate 12 weeks from current week
-- ================================================================
week_range AS (
  SELECT
    get_week_iso(CURRENT_DATE + (n || ' weeks')::INTERVAL) AS week_iso,
    get_week_start_date(CURRENT_DATE + (n || ' weeks')::INTERVAL) AS week_start_date,
    get_week_end_date(CURRENT_DATE + (n || ' weeks')::INTERVAL) AS week_end_date,
    n AS week_offset
  FROM generate_series(0, 11) AS n
),

-- ================================================================
-- Step 2: Get all active SKUs
-- ================================================================
active_skus AS (
  SELECT
    sku,
    safety_stock_weeks,
    product_name
  FROM products
  WHERE is_active = true
),

-- ================================================================
-- Step 3: Cross join SKUs with weeks to create base projection grid
-- ================================================================
projection_base AS (
  SELECT
    s.sku,
    s.product_name,
    s.safety_stock_weeks,
    w.week_iso,
    w.week_start_date,
    w.week_end_date,
    w.week_offset
  FROM active_skus s
  CROSS JOIN week_range w
),

-- ================================================================
-- Step 4: Get current inventory from snapshots (aggregated by SKU)
-- ================================================================
current_inventory AS (
  SELECT
    sku,
    SUM(qty_on_hand) AS total_on_hand
  FROM inventory_snapshots
  GROUP BY sku
),

-- ================================================================
-- Step 5: Calculate incoming qty per week per SKU
-- ================================================================
incoming_by_week AS (
  SELECT
    si.sku,
    get_week_iso(
      COALESCE(s.actual_arrival_date, s.planned_arrival_date)::DATE
    ) AS arrival_week_iso,
    SUM(si.shipped_qty) AS incoming_qty
  FROM shipment_items si
  INNER JOIN shipments s ON si.shipment_id = s.id
  WHERE COALESCE(s.actual_arrival_date, s.planned_arrival_date) >= CURRENT_DATE
    AND COALESCE(s.actual_arrival_date, s.planned_arrival_date) <= CURRENT_DATE + INTERVAL '12 weeks'
  GROUP BY si.sku, get_week_iso(COALESCE(s.actual_arrival_date, s.planned_arrival_date)::DATE)
),

-- ================================================================
-- Step 6: Calculate effective sales per week per SKU (dual-track)
-- ================================================================
effective_sales_by_week AS (
  SELECT
    sf.sku,
    sf.week_iso,
    -- Sum forecasts for this SKU and week across all channels
    COALESCE(SUM(sf.forecast_qty), 0) AS total_forecast_qty,
    -- Sum actuals for this SKU and week across all channels
    COALESCE(SUM(sa.actual_qty), 0) AS total_actual_qty,
    -- Dual-track: If any channel has actual data, use actual; otherwise use forecast
    COALESCE(
      NULLIF(SUM(sa.actual_qty), 0),
      SUM(sf.forecast_qty)
    ) AS effective_sales
  FROM sales_forecasts sf
  LEFT JOIN sales_actuals sa
    ON sf.sku = sa.sku
    AND sf.channel_code = sa.channel_code
    AND sf.week_iso = sa.week_iso
  WHERE sf.week_start_date >= CURRENT_DATE
    AND sf.week_start_date <= CURRENT_DATE + INTERVAL '12 weeks'
  GROUP BY sf.sku, sf.week_iso
),

-- ================================================================
-- Step 7: Calculate weekly average sales for safety stock threshold
-- ================================================================
avg_weekly_sales AS (
  SELECT
    sku,
    AVG(effective_sales) AS avg_sales_per_week
  FROM effective_sales_by_week
  GROUP BY sku
),

-- ================================================================
-- Step 8: Combine all weekly data
-- ================================================================
weekly_data AS (
  SELECT
    pb.sku,
    pb.product_name,
    pb.week_iso,
    pb.week_start_date,
    pb.week_end_date,
    pb.week_offset,
    pb.safety_stock_weeks,
    COALESCE(ci.total_on_hand, 0) AS current_stock,
    COALESCE(ib.incoming_qty, 0) AS incoming_qty,
    COALESCE(es.total_forecast_qty, 0) AS forecast_qty,
    COALESCE(es.total_actual_qty, 0) AS actual_qty,
    COALESCE(es.effective_sales, 0) AS effective_sales,
    COALESCE(aws.avg_sales_per_week, 0) AS avg_weekly_sales
  FROM projection_base pb
  LEFT JOIN current_inventory ci ON pb.sku = ci.sku
  LEFT JOIN incoming_by_week ib ON pb.sku = ib.sku AND pb.week_iso = ib.arrival_week_iso
  LEFT JOIN effective_sales_by_week es ON pb.sku = es.sku AND pb.week_iso = es.week_iso
  LEFT JOIN avg_weekly_sales aws ON pb.sku = aws.sku
),

-- ================================================================
-- Step 9: Calculate net flow per week (incoming - sales)
-- ================================================================
weekly_net_flow AS (
  SELECT
    sku,
    product_name,
    week_iso,
    week_start_date,
    week_end_date,
    week_offset,
    safety_stock_weeks,
    current_stock,
    incoming_qty,
    forecast_qty,
    actual_qty,
    effective_sales,
    avg_weekly_sales,
    -- Net flow = incoming - outgoing (sales)
    incoming_qty - effective_sales AS net_flow,
    -- Safety stock threshold = avg weekly sales * safety stock weeks
    ROUND(avg_weekly_sales * safety_stock_weeks) AS safety_stock_threshold
  FROM weekly_data
),

-- ================================================================
-- Step 10: Calculate cumulative net flow using window function
-- ================================================================
cumulative_flow AS (
  SELECT
    sku,
    product_name,
    week_iso,
    week_start_date,
    week_end_date,
    week_offset,
    safety_stock_weeks,
    current_stock,
    incoming_qty,
    forecast_qty,
    actual_qty,
    effective_sales,
    net_flow,
    safety_stock_threshold,
    -- Cumulative net flow from week 0 to current week
    SUM(net_flow) OVER (
      PARTITION BY sku
      ORDER BY week_offset
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_net_flow
  FROM weekly_net_flow
),

-- ================================================================
-- Step 11: Calculate closing stock (current_stock + cumulative_net_flow)
-- ================================================================
with_closing_stock AS (
  SELECT
    sku,
    product_name,
    week_iso,
    week_start_date,
    week_end_date,
    week_offset,
    safety_stock_weeks,
    current_stock,
    incoming_qty,
    forecast_qty,
    actual_qty,
    effective_sales,
    safety_stock_threshold,
    -- Closing stock = initial stock + cumulative changes
    current_stock + cumulative_net_flow AS closing_stock
  FROM cumulative_flow
),

-- ================================================================
-- Step 12: Calculate opening stock using LAG on closing stock
-- ================================================================
final_projection AS (
  SELECT
    sku,
    product_name,
    week_iso,
    week_start_date,
    week_end_date,
    week_offset,
    safety_stock_weeks,
    -- Opening stock: for week 0 use current_stock, otherwise use previous week's closing
    CASE
      WHEN week_offset = 0 THEN current_stock
      ELSE LAG(closing_stock) OVER (PARTITION BY sku ORDER BY week_offset)
    END AS opening_stock,
    incoming_qty,
    forecast_qty,
    actual_qty,
    effective_sales,
    safety_stock_threshold,
    closing_stock
  FROM with_closing_stock
)

-- ================================================================
-- Final SELECT with Risk Level Classification
-- ================================================================
SELECT
  sku,
  product_name,
  week_iso,
  week_start_date,
  week_end_date,
  week_offset,
  opening_stock,
  incoming_qty,
  effective_sales,
  forecast_qty,
  actual_qty,
  closing_stock,
  safety_stock_threshold,
  -- Risk level classification
  CASE
    WHEN closing_stock < 0 THEN 'Stockout'::text
    WHEN closing_stock < safety_stock_threshold THEN 'Risk'::text
    ELSE 'OK'::text
  END AS stock_status,
  -- Calculate weeks until stockout (if trending negative)
  CASE
    WHEN closing_stock > 0 AND effective_sales > 0
    THEN FLOOR(closing_stock / NULLIF(effective_sales, 0))
    ELSE NULL
  END AS weeks_until_stockout,
  -- Metadata
  NOW() AS calculated_at
FROM final_projection
ORDER BY sku, week_offset;

-- ================================================================
-- Create Indexes for Performance
-- ================================================================
-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_inv_proj_12w_sku_week_unique ON v_inventory_projection_12weeks(sku, week_iso);
CREATE INDEX idx_inv_proj_12w_sku ON v_inventory_projection_12weeks(sku);
CREATE INDEX idx_inv_proj_12w_week ON v_inventory_projection_12weeks(week_iso);
CREATE INDEX idx_inv_proj_12w_status ON v_inventory_projection_12weeks(stock_status);

-- ================================================================
-- MATERIALIZED VIEW: Replenishment Suggestions
-- ================================================================
-- This view identifies SKUs at risk and calculates replenishment recommendations
-- ================================================================

DROP MATERIALIZED VIEW IF EXISTS v_replenishment_suggestions CASCADE;

CREATE MATERIALIZED VIEW v_replenishment_suggestions AS
WITH
-- ================================================================
-- Step 1: Identify risk weeks (Stockout or Risk status)
-- ================================================================
risk_weeks AS (
  SELECT
    sku,
    product_name,
    week_iso,
    week_start_date,
    week_end_date,
    week_offset,
    opening_stock,
    closing_stock,
    safety_stock_threshold,
    effective_sales,
    stock_status,
    -- Get the first risk week for each SKU
    ROW_NUMBER() OVER (PARTITION BY sku ORDER BY week_offset) AS risk_rank
  FROM v_inventory_projection_12weeks
  WHERE stock_status IN ('Stockout', 'Risk')
),

-- ================================================================
-- Step 2: Get first risk week for each SKU
-- ================================================================
first_risk AS (
  SELECT
    sku,
    product_name,
    week_iso AS risk_week_iso,
    week_start_date AS risk_week_start,
    week_end_date AS risk_week_end,
    week_offset AS risk_week_offset,
    opening_stock,
    closing_stock,
    safety_stock_threshold,
    effective_sales,
    stock_status
  FROM risk_weeks
  WHERE risk_rank = 1
),

-- ================================================================
-- Step 3: Calculate suggested order quantity
-- ================================================================
order_suggestions AS (
  SELECT
    fr.sku,
    fr.product_name,
    fr.risk_week_iso,
    fr.risk_week_start,
    fr.risk_week_end,
    fr.risk_week_offset,
    fr.opening_stock,
    fr.closing_stock,
    fr.safety_stock_threshold,
    fr.effective_sales,
    fr.stock_status,
    -- Suggested order qty = Safety threshold - Closing stock (rounded up to nearest 100)
    CEILING(
      GREATEST(
        fr.safety_stock_threshold - fr.closing_stock,
        fr.effective_sales * 4  -- Minimum 4 weeks of sales
      ) / 100.0
    ) * 100 AS suggested_order_qty,
    -- Get product details for lead time calculation
    p.safety_stock_weeks
  FROM first_risk fr
  INNER JOIN products p ON fr.sku = p.sku
),

-- ================================================================
-- Step 4: Calculate order and ship deadlines
-- ================================================================
deadline_calculations AS (
  SELECT
    sku,
    product_name,
    risk_week_iso,
    risk_week_start,
    risk_week_end,
    risk_week_offset,
    opening_stock,
    closing_stock,
    safety_stock_threshold,
    effective_sales,
    stock_status,
    suggested_order_qty,
    -- Order deadline = Risk week start - (safety_stock_weeks * 7 days)
    -- This assumes safety_stock_weeks includes production + shipping time
    risk_week_start - (safety_stock_weeks * 7 || ' days')::INTERVAL AS order_deadline_date,
    -- Ship deadline = Risk week start - 14 days (assumed shipping time)
    risk_week_start - INTERVAL '14 days' AS ship_deadline_date,
    safety_stock_weeks
  FROM order_suggestions
)

-- ================================================================
-- Final SELECT with Priority Classification
-- ================================================================
SELECT
  sku,
  product_name,
  risk_week_iso,
  risk_week_start,
  risk_week_end,
  suggested_order_qty,
  -- Order deadline info
  get_week_iso(order_deadline_date::DATE) AS order_deadline_week,
  order_deadline_date::DATE AS order_deadline_date,
  -- Ship deadline info
  get_week_iso(ship_deadline_date::DATE) AS ship_deadline_week,
  ship_deadline_date::DATE AS ship_deadline_date,
  -- Priority classification based on how soon risk occurs
  CASE
    WHEN risk_week_offset <= 2 THEN 'Critical'::text
    WHEN risk_week_offset <= 4 THEN 'High'::text
    WHEN risk_week_offset <= 8 THEN 'Medium'::text
    ELSE 'Low'::text
  END AS priority,
  -- Additional context
  opening_stock,
  closing_stock,
  safety_stock_threshold,
  effective_sales,
  stock_status,
  -- Check if deadline has passed
  CASE
    WHEN order_deadline_date::DATE < CURRENT_DATE THEN true
    ELSE false
  END AS is_overdue,
  -- Days until order deadline (DATE - DATE returns integer in PostgreSQL)
  (order_deadline_date::DATE - CURRENT_DATE) AS days_until_deadline,
  -- Metadata
  NOW() AS calculated_at
FROM deadline_calculations
WHERE order_deadline_date::DATE >= CURRENT_DATE - INTERVAL '7 days'
  -- Include recent past deadlines (7 days) for visibility
ORDER BY
  CASE
    WHEN risk_week_offset <= 2 THEN 1  -- Critical
    WHEN risk_week_offset <= 4 THEN 2  -- High
    WHEN risk_week_offset <= 8 THEN 3  -- Medium
    ELSE 4                              -- Low
  END,
  order_deadline_date;

-- ================================================================
-- Create Indexes for Performance
-- ================================================================
-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_replen_sugg_sku_unique ON v_replenishment_suggestions(sku);
CREATE INDEX idx_replen_sugg_priority ON v_replenishment_suggestions(priority);
CREATE INDEX idx_replen_sugg_deadline ON v_replenishment_suggestions(order_deadline_date);
CREATE INDEX idx_replen_sugg_overdue ON v_replenishment_suggestions(is_overdue);

-- ================================================================
-- REFRESH FUNCTION: Refresh materialized views
-- ================================================================
CREATE OR REPLACE FUNCTION refresh_inventory_projections()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_inventory_projection_12weeks;
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_replenishment_suggestions;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- COMMENTS FOR DOCUMENTATION
-- ================================================================
COMMENT ON MATERIALIZED VIEW v_inventory_projection_12weeks IS
'12-week rolling inventory projection with dual-track sales logic (actual vs forecast). Calculates opening stock, incoming qty, effective sales, and closing stock with risk level classification.';

COMMENT ON MATERIALIZED VIEW v_replenishment_suggestions IS
'Identifies SKUs at risk of stockout and calculates suggested replenishment quantities with order and ship deadlines based on safety stock weeks.';

COMMENT ON FUNCTION refresh_inventory_projections() IS
'Refreshes both inventory projection materialized views. Should be run daily or after major data updates (shipments, sales actuals, forecasts).';

-- ================================================================
-- INITIAL REFRESH
-- ================================================================
SELECT refresh_inventory_projections();
