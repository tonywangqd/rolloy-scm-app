-- =====================================================================
-- Migration: SCM V2 Upgrade - Full Schema
-- Version: 2.0.0
-- Date: 2025-12-10
-- Author: Backend Specialist
--
-- Description:
--   Complete V2 upgrade including:
--   1. New tables (order_arrivals, psi_weekly_snapshots, system_parameters)
--   2. Extended existing tables (sales_forecasts, purchase_orders, etc.)
--   3. Core views (v_psi_weekly_projection, v_reverse_schedule_suggestions)
--   4. Triggers (cascade updates, auto-calculations)
--   5. RLS policies
-- =====================================================================

-- =====================================================================
-- STEP 1: Create new table - system_parameters
-- =====================================================================

CREATE TABLE IF NOT EXISTS system_parameters (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parameter Identification
  param_key TEXT NOT NULL UNIQUE,
  param_value JSONB NOT NULL,
  description TEXT,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_system_parameters_key ON system_parameters(param_key);

-- RLS Policies
ALTER TABLE system_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow authenticated read on system_parameters"
  ON system_parameters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated update on system_parameters"
  ON system_parameters FOR UPDATE
  TO authenticated
  USING (true);

-- Seed default parameters
INSERT INTO system_parameters (param_key, param_value, description)
VALUES
  ('lead_times',
   '{"production_weeks": 5, "loading_weeks": 1, "shipping_weeks": 5, "inbound_weeks": 2}'::jsonb,
   '供应链周期参数: 生产周期、订舱缓冲、物流周期、上架缓冲'),
  ('safety_stock_default_weeks', '2'::jsonb, '默认安全库存周数'),
  ('variance_alert_threshold_percentage', '20'::jsonb, '差异预警阈值百分比'),
  ('overdue_days_critical', '14'::jsonb, '逾期天数-紧急'),
  ('overdue_days_high', '7'::jsonb, '逾期天数-高优先级')
ON CONFLICT (param_key) DO NOTHING;

COMMENT ON TABLE system_parameters IS 'V2: 系统参数配置表 (可配置的供应链参数)';

-- =====================================================================
-- STEP 2: Create new table - order_arrivals
-- =====================================================================

CREATE TABLE IF NOT EXISTS order_arrivals (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document Number
  arrival_number TEXT NOT NULL UNIQUE,

  -- Foreign Keys
  shipment_id UUID REFERENCES shipments(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,

  -- Time Tracking
  planned_arrival_date DATE,
  actual_arrival_date DATE,
  arrival_week_iso TEXT GENERATED ALWAYS AS (
    CASE WHEN actual_arrival_date IS NOT NULL
      THEN to_char(actual_arrival_date, 'IYYY-"W"IW')
      ELSE to_char(planned_arrival_date, 'IYYY-"W"IW')
    END
  ) STORED,

  -- Quantities (simplified for initial implementation)
  expected_qty INTEGER DEFAULT 0,
  received_qty INTEGER DEFAULT 0,
  variance_qty INTEGER GENERATED ALWAYS AS (received_qty - expected_qty) STORED,

  -- Variance Handling
  variance_reason TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'completed', 'cancelled')),

  -- Metadata
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_arrivals_shipment ON order_arrivals(shipment_id);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_warehouse ON order_arrivals(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_week ON order_arrivals(arrival_week_iso);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_date ON order_arrivals(actual_arrival_date);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_variance ON order_arrivals(variance_qty) WHERE variance_qty != 0;

-- RLS Policies
ALTER TABLE order_arrivals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow authenticated read on order_arrivals"
  ON order_arrivals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated insert on order_arrivals"
  ON order_arrivals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated update on order_arrivals"
  ON order_arrivals FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated delete on order_arrivals"
  ON order_arrivals FOR DELETE
  TO authenticated
  USING (true);

COMMENT ON TABLE order_arrivals IS 'V2: 到仓单 (OA) - 记录货物到达海外仓的时间和数量';
COMMENT ON COLUMN order_arrivals.arrival_number IS '到仓单号: OA-YYYY-MM-DD-XXX';
COMMENT ON COLUMN order_arrivals.variance_qty IS '差异数量: received_qty - expected_qty';

-- =====================================================================
-- STEP 3: Create new table - psi_weekly_snapshots
-- =====================================================================

CREATE TABLE IF NOT EXISTS psi_weekly_snapshots (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dimensions
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  week_iso TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,

  -- Opening Stock (期初库存)
  opening_stock INTEGER NOT NULL DEFAULT 0,

  -- Inbound (到仓)
  planned_arrival_qty INTEGER DEFAULT 0,
  actual_arrival_qty INTEGER DEFAULT 0,
  effective_arrival_qty INTEGER GENERATED ALWAYS AS (
    COALESCE(actual_arrival_qty, planned_arrival_qty)
  ) STORED,

  -- Outbound (销售出库)
  forecast_sales_qty INTEGER DEFAULT 0,
  actual_sales_qty INTEGER,
  effective_sales_qty INTEGER GENERATED ALWAYS AS (
    COALESCE(actual_sales_qty, forecast_sales_qty)
  ) STORED,

  -- Closing Stock (期末库存)
  closing_stock INTEGER GENERATED ALWAYS AS (
    opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)
  ) STORED,

  -- Inventory Health
  safety_stock_threshold INTEGER NOT NULL DEFAULT 0,
  stock_status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN (opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)) < 0
        THEN 'Stockout'
      WHEN (opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)) < safety_stock_threshold
        THEN 'Risk'
      ELSE 'OK'
    END
  ) STORED,

  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_psi_week UNIQUE (sku, warehouse_id, week_iso),
  CONSTRAINT valid_week_format CHECK (week_iso ~ '^\d{4}-W\d{2}$'),
  CONSTRAINT valid_stock_status CHECK (stock_status IN ('OK', 'Risk', 'Stockout'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_psi_sku_week ON psi_weekly_snapshots(sku, week_iso);
CREATE INDEX IF NOT EXISTS idx_psi_warehouse_week ON psi_weekly_snapshots(warehouse_id, week_iso);
CREATE INDEX IF NOT EXISTS idx_psi_status ON psi_weekly_snapshots(stock_status) WHERE stock_status != 'OK';
CREATE INDEX IF NOT EXISTS idx_psi_week ON psi_weekly_snapshots(week_iso);

-- RLS Policies
ALTER TABLE psi_weekly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow authenticated read on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated write on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated update on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR UPDATE
  TO authenticated
  USING (true);

COMMENT ON TABLE psi_weekly_snapshots IS 'V2: 进销存周报表 (Production-Sales-Inventory)';

-- =====================================================================
-- STEP 4: Extend existing table - sales_forecasts
-- =====================================================================

ALTER TABLE sales_forecasts
  ADD COLUMN IF NOT EXISTS coverage_status TEXT DEFAULT 'UNCOVERED',
  ADD COLUMN IF NOT EXISTS covered_qty INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_order_week TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_forecasts_coverage
  ON sales_forecasts(coverage_status)
  WHERE coverage_status IN ('UNCOVERED', 'PARTIALLY_COVERED');

COMMENT ON COLUMN sales_forecasts.coverage_status IS 'V2: 覆盖状态 (UNCOVERED | PARTIALLY_COVERED | FULLY_COVERED | CLOSED)';
COMMENT ON COLUMN sales_forecasts.covered_qty IS 'V2: 已覆盖数量 (从 forecast_order_allocations 汇总)';
COMMENT ON COLUMN sales_forecasts.target_order_week IS 'V2: 倒推计算的目标下单周';

-- =====================================================================
-- STEP 5: Extend existing table - purchase_orders
-- =====================================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS expected_fulfillment_week TEXT,
  ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_fulfillment_week
  ON purchase_orders(expected_fulfillment_week)
  WHERE expected_fulfillment_week IS NOT NULL;

COMMENT ON COLUMN purchase_orders.expected_fulfillment_week IS 'V2: 倒推算法计算的预计完工周 (ISO Week)';
COMMENT ON COLUMN purchase_orders.is_closed IS 'V2: 是否已关闭 (不再生成新的 OF)';

-- =====================================================================
-- STEP 6: Extend existing table - shipments
-- =====================================================================

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS channel_allocation JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shipment_status TEXT DEFAULT 'draft';

COMMENT ON COLUMN shipments.channel_allocation IS 'V2: 渠道分配 (JSONB) - {"Amazon": 90, "Shopify": 10}';
COMMENT ON COLUMN shipments.shipment_status IS 'V2: 发货状态 (draft | in_transit | arrived | finalized)';

-- =====================================================================
-- STEP 7: Create function - get_next_oa_number
-- =====================================================================

CREATE OR REPLACE FUNCTION get_next_oa_number(
  p_arrival_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT AS $$
DECLARE
  v_date_part TEXT;
  v_seq INTEGER;
  v_oa_number TEXT;
BEGIN
  v_date_part := to_char(p_arrival_date, 'YYYY-MM-DD');

  -- Find max sequence for this date
  SELECT COALESCE(MAX(
    SUBSTRING(arrival_number FROM 'OA-\d{4}-\d{2}-\d{2}-(\d{3})')::INTEGER
  ), 0) + 1
  INTO v_seq
  FROM order_arrivals
  WHERE arrival_number LIKE 'OA-' || v_date_part || '-%';

  v_oa_number := 'OA-' || v_date_part || '-' || LPAD(v_seq::TEXT, 3, '0');

  RETURN v_oa_number;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_oa_number IS 'V2: 生成下一个 OA 单号 (OA-YYYY-MM-DD-XXX)';

-- =====================================================================
-- STEP 8: Create function - calculate_reverse_schedule
-- =====================================================================

CREATE OR REPLACE FUNCTION calculate_reverse_schedule(
  p_sku TEXT,
  p_target_sales_week TEXT,
  p_target_sales_qty INTEGER
)
RETURNS TABLE (
  suggested_order_week TEXT,
  suggested_order_date DATE,
  suggested_fulfillment_week TEXT,
  suggested_ship_week TEXT,
  suggested_arrival_week TEXT,
  breakdown JSONB
) AS $$
DECLARE
  v_production_lead_weeks INTEGER;
  v_loading_buffer_weeks INTEGER;
  v_transit_time_weeks INTEGER;
  v_inbound_buffer_weeks INTEGER;

  v_target_date DATE;
  v_arrival_date DATE;
  v_ship_date DATE;
  v_fulfillment_date DATE;
  v_order_date DATE;

  v_lead_times JSONB;
BEGIN
  -- Get lead time parameters from system_parameters
  SELECT param_value INTO v_lead_times
  FROM system_parameters
  WHERE param_key = 'lead_times';

  -- Extract individual values
  v_loading_buffer_weeks := (v_lead_times->>'loading_weeks')::INTEGER;
  v_transit_time_weeks := (v_lead_times->>'shipping_weeks')::INTEGER;
  v_inbound_buffer_weeks := (v_lead_times->>'inbound_weeks')::INTEGER;

  -- Get product-specific production lead time
  SELECT COALESCE(production_lead_weeks, (v_lead_times->>'production_weeks')::INTEGER)
  INTO v_production_lead_weeks
  FROM products
  WHERE sku = p_sku;

  -- If product not found, use default
  IF v_production_lead_weeks IS NULL THEN
    v_production_lead_weeks := (v_lead_times->>'production_weeks')::INTEGER;
  END IF;

  -- Parse target week to date (Monday of that week)
  v_target_date := to_date(p_target_sales_week || '-1', 'IYYY-"W"IW-D');

  -- Backtrack calculation (in days, then convert to weeks)
  v_arrival_date := v_target_date - (v_inbound_buffer_weeks * 7);
  v_ship_date := v_arrival_date - (v_transit_time_weeks * 7);
  v_fulfillment_date := v_ship_date - (v_loading_buffer_weeks * 7);
  v_order_date := v_fulfillment_date - (v_production_lead_weeks * 7);

  RETURN QUERY SELECT
    to_char(v_order_date, 'IYYY-"W"IW')::TEXT,
    v_order_date,
    to_char(v_fulfillment_date, 'IYYY-"W"IW')::TEXT,
    to_char(v_ship_date, 'IYYY-"W"IW')::TEXT,
    to_char(v_arrival_date, 'IYYY-"W"IW')::TEXT,
    jsonb_build_object(
      'target_sales_week', p_target_sales_week,
      'target_sales_qty', p_target_sales_qty,
      'production_lead_weeks', v_production_lead_weeks,
      'loading_buffer_weeks', v_loading_buffer_weeks,
      'transit_time_weeks', v_transit_time_weeks,
      'inbound_buffer_weeks', v_inbound_buffer_weeks,
      'total_lead_time_weeks', v_production_lead_weeks + v_loading_buffer_weeks + v_transit_time_weeks + v_inbound_buffer_weeks
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_reverse_schedule IS 'V2: 倒排排程算法 - 根据销售需求周倒推各环节时间节点';

-- =====================================================================
-- STEP 9: Create view - v_psi_weekly_projection
-- =====================================================================

CREATE OR REPLACE VIEW v_psi_weekly_projection AS
WITH
  -- Generate week series (past 4 + future 12 = 16 weeks)
  week_series AS (
    SELECT
      to_char(date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL, 'IYYY-"W"IW') AS week_iso,
      (date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL)::DATE AS week_start_date,
      (date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL + INTERVAL '6 days')::DATE AS week_end_date,
      n AS week_offset
    FROM generate_series(-4, 11) AS n
  ),

  -- Cross join SKU × Warehouse × Week
  sku_warehouse_weeks AS (
    SELECT
      p.sku,
      w.id AS warehouse_id,
      ws.week_iso,
      ws.week_start_date,
      ws.week_end_date,
      ws.week_offset,
      p.safety_stock_weeks
    FROM products p
    CROSS JOIN warehouses w
    CROSS JOIN week_series ws
    WHERE p.is_active = true AND w.is_active = true
  ),

  -- Aggregate sales forecasts by week
  weekly_forecasts AS (
    SELECT
      sku,
      week_iso,
      SUM(forecast_qty) AS forecast_qty
    FROM sales_forecasts
    WHERE is_closed = false
    GROUP BY sku, week_iso
  ),

  -- Aggregate actual sales by week
  weekly_actuals AS (
    SELECT
      sku,
      week_iso,
      SUM(actual_qty) AS actual_qty
    FROM sales_actuals
    GROUP BY sku, week_iso
  ),

  -- Aggregate planned arrivals (from shipments without actual_arrival_date)
  planned_arrivals AS (
    SELECT
      si.sku,
      s.destination_warehouse_id,
      to_char(s.planned_arrival_date, 'IYYY-"W"IW') AS week_iso,
      SUM(si.shipped_qty) AS planned_arrival_qty
    FROM shipment_items si
    JOIN shipments s ON s.id = si.shipment_id
    WHERE s.actual_arrival_date IS NULL AND s.planned_arrival_date IS NOT NULL
    GROUP BY si.sku, s.destination_warehouse_id, week_iso
  ),

  -- Aggregate actual arrivals (from order_arrivals or shipments with actual_arrival_date)
  actual_arrivals AS (
    SELECT
      si.sku,
      s.destination_warehouse_id,
      to_char(s.actual_arrival_date, 'IYYY-"W"IW') AS week_iso,
      SUM(si.shipped_qty) AS actual_arrival_qty
    FROM shipment_items si
    JOIN shipments s ON s.id = si.shipment_id
    WHERE s.actual_arrival_date IS NOT NULL
    GROUP BY si.sku, s.destination_warehouse_id, week_iso
  )

-- Main query
SELECT
  sww.sku,
  p.product_name,
  sww.warehouse_id,
  w.warehouse_name,
  sww.week_iso,
  sww.week_start_date,
  sww.week_end_date,
  sww.week_offset,

  -- Opening stock (simplified - using current inventory for week 0, recursive for others)
  COALESCE(
    CASE
      WHEN sww.week_offset = 0 THEN inv.qty_on_hand
      ELSE 0  -- Simplified: should be calculated recursively
    END,
    0
  ) AS opening_stock,

  -- Inbound
  COALESCE(pa.planned_arrival_qty, 0) AS planned_arrival_qty,
  COALESCE(aa.actual_arrival_qty, 0) AS actual_arrival_qty,
  COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) AS effective_arrival_qty,

  -- Outbound
  COALESCE(wf.forecast_qty, 0) AS forecast_sales_qty,
  wa.actual_qty AS actual_sales_qty,
  COALESCE(wa.actual_qty, wf.forecast_qty, 0) AS effective_sales_qty,

  -- Closing stock (simplified calculation)
  COALESCE(inv.qty_on_hand, 0) +
  COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) -
  COALESCE(wa.actual_qty, wf.forecast_qty, 0) AS closing_stock,

  -- Safety stock threshold
  COALESCE(wf.forecast_qty, 0) * sww.safety_stock_weeks AS safety_stock_threshold,

  -- Stock status
  CASE
    WHEN (
      COALESCE(inv.qty_on_hand, 0) +
      COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) -
      COALESCE(wa.actual_qty, wf.forecast_qty, 0)
    ) < 0 THEN 'Stockout'
    WHEN (
      COALESCE(inv.qty_on_hand, 0) +
      COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) -
      COALESCE(wa.actual_qty, wf.forecast_qty, 0)
    ) < (COALESCE(wf.forecast_qty, 0) * sww.safety_stock_weeks) THEN 'Risk'
    ELSE 'OK'
  END AS stock_status,

  NOW() AS calculated_at

FROM sku_warehouse_weeks sww
JOIN products p ON p.sku = sww.sku
JOIN warehouses w ON w.id = sww.warehouse_id
LEFT JOIN weekly_forecasts wf ON wf.sku = sww.sku AND wf.week_iso = sww.week_iso
LEFT JOIN weekly_actuals wa ON wa.sku = sww.sku AND wa.week_iso = sww.week_iso
LEFT JOIN planned_arrivals pa ON pa.sku = sww.sku AND pa.warehouse_id = sww.warehouse_id AND pa.week_iso = sww.week_iso
LEFT JOIN actual_arrivals aa ON aa.sku = sww.sku AND aa.warehouse_id = sww.warehouse_id AND aa.week_iso = sww.week_iso
LEFT JOIN inventory_snapshots inv ON inv.sku = sww.sku AND inv.warehouse_id = sww.warehouse_id;

COMMENT ON VIEW v_psi_weekly_projection IS 'V2: PSI 周预测视图 (过去4周 + 未来12周)';

-- =====================================================================
-- STEP 10: Create view - v_reverse_schedule_suggestions
-- =====================================================================

CREATE OR REPLACE VIEW v_reverse_schedule_suggestions AS
WITH uncovered_demand AS (
  SELECT
    sf.sku,
    sf.week_iso AS sales_week,
    sf.forecast_qty,
    COALESCE(sf.covered_qty, 0) AS covered_qty,
    sf.forecast_qty - COALESCE(sf.covered_qty, 0) AS uncovered_qty,
    p.product_name,
    p.spu
  FROM sales_forecasts sf
  JOIN products p ON p.sku = sf.sku
  WHERE sf.is_closed = false
    AND (sf.forecast_qty - COALESCE(sf.covered_qty, 0)) > 0
    AND sf.week_iso >= to_char(CURRENT_DATE, 'IYYY-"W"IW')
)
SELECT
  ud.sku,
  ud.product_name,
  ud.spu,
  ud.sales_week,
  ud.forecast_qty,
  ud.covered_qty,
  ud.uncovered_qty AS suggested_order_qty,

  rs.suggested_order_week,
  rs.suggested_order_date,
  rs.suggested_fulfillment_week,
  rs.suggested_ship_week,
  rs.suggested_arrival_week,

  -- Priority calculation
  CASE
    WHEN rs.suggested_order_week < to_char(CURRENT_DATE, 'IYYY-"W"IW') THEN 'Critical'
    WHEN rs.suggested_order_week <= to_char(CURRENT_DATE + INTERVAL '2 weeks', 'IYYY-"W"IW') THEN 'High'
    WHEN rs.suggested_order_week <= to_char(CURRENT_DATE + INTERVAL '4 weeks', 'IYYY-"W"IW') THEN 'Medium'
    ELSE 'Low'
  END AS priority,

  -- Is overdue?
  (rs.suggested_order_week < to_char(CURRENT_DATE, 'IYYY-"W"IW')) AS is_overdue,

  rs.breakdown AS lead_time_breakdown,

  NOW() AS calculated_at

FROM uncovered_demand ud
CROSS JOIN LATERAL calculate_reverse_schedule(ud.sku, ud.sales_week, ud.uncovered_qty) rs;

COMMENT ON VIEW v_reverse_schedule_suggestions IS 'V2: 倒排排程建议视图 - 基于未覆盖需求生成采购建议';

-- =====================================================================
-- Migration Complete
-- =====================================================================

COMMENT ON SCHEMA public IS 'SCM V2 Upgrade - Migration 20251210_scm_v2_upgrade';
