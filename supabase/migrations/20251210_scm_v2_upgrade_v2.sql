-- =====================================================================
-- Migration: SCM V2 Upgrade - Full Schema (Fixed v2)
-- Version: 2.0.0
-- Date: 2025-12-10
-- =====================================================================

-- =====================================================================
-- STEP 1: Create new table - system_parameters
-- =====================================================================

CREATE TABLE IF NOT EXISTS system_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  param_key TEXT NOT NULL UNIQUE,
  param_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_parameters_key ON system_parameters(param_key);

ALTER TABLE system_parameters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read on system_parameters" ON system_parameters;
CREATE POLICY "Allow authenticated read on system_parameters"
  ON system_parameters FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated update on system_parameters" ON system_parameters;
CREATE POLICY "Allow authenticated update on system_parameters"
  ON system_parameters FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert on system_parameters" ON system_parameters;
CREATE POLICY "Allow authenticated insert on system_parameters"
  ON system_parameters FOR INSERT TO authenticated WITH CHECK (true);

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

-- =====================================================================
-- STEP 2: Create new table - order_arrivals (no GENERATED columns)
-- =====================================================================

CREATE TABLE IF NOT EXISTS order_arrivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arrival_number TEXT NOT NULL UNIQUE,
  shipment_id UUID REFERENCES shipments(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  planned_arrival_date DATE,
  actual_arrival_date DATE,
  arrival_week_iso TEXT,  -- Will be set by trigger
  expected_qty INTEGER DEFAULT 0,
  received_qty INTEGER DEFAULT 0,
  variance_qty INTEGER DEFAULT 0,  -- Will be set by trigger
  variance_reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'completed', 'cancelled')),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-calculate arrival_week_iso and variance_qty
CREATE OR REPLACE FUNCTION order_arrivals_auto_calc()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate arrival_week_iso
  IF NEW.actual_arrival_date IS NOT NULL THEN
    NEW.arrival_week_iso := to_char(NEW.actual_arrival_date, 'IYYY-"W"IW');
  ELSIF NEW.planned_arrival_date IS NOT NULL THEN
    NEW.arrival_week_iso := to_char(NEW.planned_arrival_date, 'IYYY-"W"IW');
  END IF;

  -- Calculate variance_qty
  NEW.variance_qty := COALESCE(NEW.received_qty, 0) - COALESCE(NEW.expected_qty, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_arrivals_auto_calc ON order_arrivals;
CREATE TRIGGER trg_order_arrivals_auto_calc
  BEFORE INSERT OR UPDATE ON order_arrivals
  FOR EACH ROW EXECUTE FUNCTION order_arrivals_auto_calc();

CREATE INDEX IF NOT EXISTS idx_order_arrivals_shipment ON order_arrivals(shipment_id);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_warehouse ON order_arrivals(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_week ON order_arrivals(arrival_week_iso);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_date ON order_arrivals(actual_arrival_date);

ALTER TABLE order_arrivals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read on order_arrivals" ON order_arrivals;
CREATE POLICY "Allow authenticated read on order_arrivals"
  ON order_arrivals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert on order_arrivals" ON order_arrivals;
CREATE POLICY "Allow authenticated insert on order_arrivals"
  ON order_arrivals FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update on order_arrivals" ON order_arrivals;
CREATE POLICY "Allow authenticated update on order_arrivals"
  ON order_arrivals FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated delete on order_arrivals" ON order_arrivals;
CREATE POLICY "Allow authenticated delete on order_arrivals"
  ON order_arrivals FOR DELETE TO authenticated USING (true);

-- =====================================================================
-- STEP 3: Create new table - psi_weekly_snapshots (no GENERATED columns)
-- =====================================================================

CREATE TABLE IF NOT EXISTS psi_weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  week_iso TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  opening_stock INTEGER NOT NULL DEFAULT 0,
  planned_arrival_qty INTEGER DEFAULT 0,
  actual_arrival_qty INTEGER DEFAULT 0,
  forecast_sales_qty INTEGER DEFAULT 0,
  actual_sales_qty INTEGER,
  safety_stock_threshold INTEGER NOT NULL DEFAULT 0,
  -- Calculated fields (updated by trigger)
  effective_arrival_qty INTEGER DEFAULT 0,
  effective_sales_qty INTEGER DEFAULT 0,
  closing_stock INTEGER DEFAULT 0,
  stock_status TEXT DEFAULT 'OK',
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_psi_week UNIQUE (sku, warehouse_id, week_iso),
  CONSTRAINT valid_week_format CHECK (week_iso ~ '^\d{4}-W\d{2}$'),
  CONSTRAINT valid_stock_status CHECK (stock_status IN ('OK', 'Risk', 'Stockout'))
);

-- Trigger to auto-calculate derived fields
CREATE OR REPLACE FUNCTION psi_snapshots_auto_calc()
RETURNS TRIGGER AS $$
BEGIN
  NEW.effective_arrival_qty := COALESCE(NEW.actual_arrival_qty, NEW.planned_arrival_qty, 0);
  NEW.effective_sales_qty := COALESCE(NEW.actual_sales_qty, NEW.forecast_sales_qty, 0);
  NEW.closing_stock := NEW.opening_stock + NEW.effective_arrival_qty - NEW.effective_sales_qty;

  IF NEW.closing_stock < 0 THEN
    NEW.stock_status := 'Stockout';
  ELSIF NEW.closing_stock < NEW.safety_stock_threshold THEN
    NEW.stock_status := 'Risk';
  ELSE
    NEW.stock_status := 'OK';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_psi_snapshots_auto_calc ON psi_weekly_snapshots;
CREATE TRIGGER trg_psi_snapshots_auto_calc
  BEFORE INSERT OR UPDATE ON psi_weekly_snapshots
  FOR EACH ROW EXECUTE FUNCTION psi_snapshots_auto_calc();

CREATE INDEX IF NOT EXISTS idx_psi_sku_week ON psi_weekly_snapshots(sku, week_iso);
CREATE INDEX IF NOT EXISTS idx_psi_warehouse_week ON psi_weekly_snapshots(warehouse_id, week_iso);
CREATE INDEX IF NOT EXISTS idx_psi_week ON psi_weekly_snapshots(week_iso);

ALTER TABLE psi_weekly_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read on psi_weekly_snapshots" ON psi_weekly_snapshots;
CREATE POLICY "Allow authenticated read on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated write on psi_weekly_snapshots" ON psi_weekly_snapshots;
CREATE POLICY "Allow authenticated write on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update on psi_weekly_snapshots" ON psi_weekly_snapshots;
CREATE POLICY "Allow authenticated update on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR UPDATE TO authenticated USING (true);

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

-- =====================================================================
-- STEP 6: Extend existing table - shipments
-- =====================================================================

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS channel_allocation JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shipment_status TEXT DEFAULT 'draft';

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
  -- Get lead time parameters
  SELECT param_value INTO v_lead_times
  FROM system_parameters
  WHERE param_key = 'lead_times';

  v_loading_buffer_weeks := (v_lead_times->>'loading_weeks')::INTEGER;
  v_transit_time_weeks := (v_lead_times->>'shipping_weeks')::INTEGER;
  v_inbound_buffer_weeks := (v_lead_times->>'inbound_weeks')::INTEGER;

  -- Get product-specific production lead time
  SELECT COALESCE(production_lead_weeks, (v_lead_times->>'production_weeks')::INTEGER)
  INTO v_production_lead_weeks
  FROM products
  WHERE sku = p_sku;

  IF v_production_lead_weeks IS NULL THEN
    v_production_lead_weeks := (v_lead_times->>'production_weeks')::INTEGER;
  END IF;

  -- Parse target week to date
  v_target_date := to_date(p_target_sales_week || '-1', 'IYYY-"W"IW-D');

  -- Backtrack calculation
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

-- =====================================================================
-- STEP 9: Create view - v_psi_weekly_projection
-- =====================================================================

CREATE OR REPLACE VIEW v_psi_weekly_projection AS
WITH
  week_series AS (
    SELECT
      to_char(date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL, 'IYYY-"W"IW') AS week_iso,
      (date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL)::DATE AS week_start_date,
      (date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL + INTERVAL '6 days')::DATE AS week_end_date,
      n AS week_offset
    FROM generate_series(-4, 11) AS n
  ),
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
  weekly_forecasts AS (
    SELECT sku, week_iso, SUM(forecast_qty) AS forecast_qty
    FROM sales_forecasts
    WHERE is_closed = false
    GROUP BY sku, week_iso
  ),
  weekly_actuals AS (
    SELECT sku, week_iso, SUM(actual_qty) AS actual_qty
    FROM sales_actuals
    GROUP BY sku, week_iso
  ),
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
SELECT
  sww.sku,
  p.product_name,
  sww.warehouse_id,
  w.warehouse_name,
  sww.week_iso,
  sww.week_start_date,
  sww.week_end_date,
  sww.week_offset,
  COALESCE(CASE WHEN sww.week_offset = 0 THEN inv.qty_on_hand ELSE 0 END, 0) AS opening_stock,
  COALESCE(pa.planned_arrival_qty, 0) AS planned_arrival_qty,
  COALESCE(aa.actual_arrival_qty, 0) AS actual_arrival_qty,
  COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) AS effective_arrival_qty,
  COALESCE(wf.forecast_qty, 0) AS forecast_sales_qty,
  wa.actual_qty AS actual_sales_qty,
  COALESCE(wa.actual_qty, wf.forecast_qty, 0) AS effective_sales_qty,
  COALESCE(inv.qty_on_hand, 0) +
  COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) -
  COALESCE(wa.actual_qty, wf.forecast_qty, 0) AS closing_stock,
  COALESCE(wf.forecast_qty, 0) * sww.safety_stock_weeks AS safety_stock_threshold,
  CASE
    WHEN (COALESCE(inv.qty_on_hand, 0) + COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) - COALESCE(wa.actual_qty, wf.forecast_qty, 0)) < 0 THEN 'Stockout'
    WHEN (COALESCE(inv.qty_on_hand, 0) + COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) - COALESCE(wa.actual_qty, wf.forecast_qty, 0)) < (COALESCE(wf.forecast_qty, 0) * sww.safety_stock_weeks) THEN 'Risk'
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
  CASE
    WHEN rs.suggested_order_week < to_char(CURRENT_DATE, 'IYYY-"W"IW') THEN 'Critical'
    WHEN rs.suggested_order_week <= to_char(CURRENT_DATE + INTERVAL '2 weeks', 'IYYY-"W"IW') THEN 'High'
    WHEN rs.suggested_order_week <= to_char(CURRENT_DATE + INTERVAL '4 weeks', 'IYYY-"W"IW') THEN 'Medium'
    ELSE 'Low'
  END AS priority,
  (rs.suggested_order_week < to_char(CURRENT_DATE, 'IYYY-"W"IW')) AS is_overdue,
  rs.breakdown AS lead_time_breakdown,
  NOW() AS calculated_at
FROM uncovered_demand ud
CROSS JOIN LATERAL calculate_reverse_schedule(ud.sku, ud.sales_week, ud.uncovered_qty) rs;

-- =====================================================================
-- Migration Complete!
-- =====================================================================
