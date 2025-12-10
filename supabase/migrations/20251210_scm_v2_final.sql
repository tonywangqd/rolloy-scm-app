-- =====================================================================
-- Migration: SCM V2 Upgrade - Final Version
-- Version: 2.0.0
-- Date: 2025-12-10
--
-- 经过完整测试，修复所有问题：
-- 1. 移除 GENERATED 列，改用触发器
-- 2. 修复 CTE 列名不匹配问题
-- 3. 使用 DROP POLICY IF EXISTS + CREATE POLICY 模式
-- =====================================================================

-- =====================================================================
-- STEP 1: system_parameters 表
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

DROP POLICY IF EXISTS "system_parameters_select" ON system_parameters;
CREATE POLICY "system_parameters_select" ON system_parameters FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "system_parameters_insert" ON system_parameters;
CREATE POLICY "system_parameters_insert" ON system_parameters FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "system_parameters_update" ON system_parameters;
CREATE POLICY "system_parameters_update" ON system_parameters FOR UPDATE TO authenticated USING (true);

-- 插入默认参数
INSERT INTO system_parameters (param_key, param_value, description) VALUES
  ('lead_times', '{"production_weeks": 5, "loading_weeks": 1, "shipping_weeks": 5, "inbound_weeks": 2}'::jsonb, '供应链周期参数'),
  ('safety_stock_default_weeks', '2'::jsonb, '默认安全库存周数'),
  ('variance_alert_threshold_percentage', '20'::jsonb, '差异预警阈值百分比'),
  ('overdue_days_critical', '14'::jsonb, '逾期天数-紧急'),
  ('overdue_days_high', '7'::jsonb, '逾期天数-高优先级')
ON CONFLICT (param_key) DO NOTHING;

-- =====================================================================
-- STEP 2: order_arrivals 表 (到仓单)
-- =====================================================================

CREATE TABLE IF NOT EXISTS order_arrivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arrival_number TEXT NOT NULL UNIQUE,
  shipment_id UUID REFERENCES shipments(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  planned_arrival_date DATE,
  actual_arrival_date DATE,
  arrival_week_iso TEXT,
  expected_qty INTEGER DEFAULT 0,
  received_qty INTEGER DEFAULT 0,
  variance_qty INTEGER DEFAULT 0,
  variance_reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'completed', 'cancelled')),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自动计算触发器
CREATE OR REPLACE FUNCTION trg_order_arrivals_calc()
RETURNS TRIGGER AS $$
BEGIN
  -- 计算 arrival_week_iso
  IF NEW.actual_arrival_date IS NOT NULL THEN
    NEW.arrival_week_iso := to_char(NEW.actual_arrival_date, 'IYYY-"W"IW');
  ELSIF NEW.planned_arrival_date IS NOT NULL THEN
    NEW.arrival_week_iso := to_char(NEW.planned_arrival_date, 'IYYY-"W"IW');
  ELSE
    NEW.arrival_week_iso := NULL;
  END IF;
  -- 计算 variance_qty
  NEW.variance_qty := COALESCE(NEW.received_qty, 0) - COALESCE(NEW.expected_qty, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_arrivals_calc ON order_arrivals;
CREATE TRIGGER order_arrivals_calc BEFORE INSERT OR UPDATE ON order_arrivals
  FOR EACH ROW EXECUTE FUNCTION trg_order_arrivals_calc();

CREATE INDEX IF NOT EXISTS idx_order_arrivals_shipment ON order_arrivals(shipment_id);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_warehouse ON order_arrivals(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_order_arrivals_week ON order_arrivals(arrival_week_iso);

ALTER TABLE order_arrivals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_arrivals_select" ON order_arrivals;
CREATE POLICY "order_arrivals_select" ON order_arrivals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "order_arrivals_insert" ON order_arrivals;
CREATE POLICY "order_arrivals_insert" ON order_arrivals FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "order_arrivals_update" ON order_arrivals;
CREATE POLICY "order_arrivals_update" ON order_arrivals FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "order_arrivals_delete" ON order_arrivals;
CREATE POLICY "order_arrivals_delete" ON order_arrivals FOR DELETE TO authenticated USING (true);

-- =====================================================================
-- STEP 3: psi_weekly_snapshots 表 (PSI周快照)
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
  effective_arrival_qty INTEGER DEFAULT 0,
  effective_sales_qty INTEGER DEFAULT 0,
  closing_stock INTEGER DEFAULT 0,
  stock_status TEXT DEFAULT 'OK' CHECK (stock_status IN ('OK', 'Risk', 'Stockout')),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_psi_week UNIQUE (sku, warehouse_id, week_iso)
);

-- 自动计算触发器
CREATE OR REPLACE FUNCTION trg_psi_calc()
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

DROP TRIGGER IF EXISTS psi_calc ON psi_weekly_snapshots;
CREATE TRIGGER psi_calc BEFORE INSERT OR UPDATE ON psi_weekly_snapshots
  FOR EACH ROW EXECUTE FUNCTION trg_psi_calc();

CREATE INDEX IF NOT EXISTS idx_psi_sku_week ON psi_weekly_snapshots(sku, week_iso);
CREATE INDEX IF NOT EXISTS idx_psi_warehouse_week ON psi_weekly_snapshots(warehouse_id, week_iso);

ALTER TABLE psi_weekly_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psi_select" ON psi_weekly_snapshots;
CREATE POLICY "psi_select" ON psi_weekly_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "psi_insert" ON psi_weekly_snapshots;
CREATE POLICY "psi_insert" ON psi_weekly_snapshots FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "psi_update" ON psi_weekly_snapshots;
CREATE POLICY "psi_update" ON psi_weekly_snapshots FOR UPDATE TO authenticated USING (true);

-- =====================================================================
-- STEP 4: 扩展 sales_forecasts 表
-- =====================================================================

DO $$ BEGIN
  ALTER TABLE sales_forecasts ADD COLUMN coverage_status TEXT DEFAULT 'UNCOVERED';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sales_forecasts ADD COLUMN covered_qty INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sales_forecasts ADD COLUMN target_order_week TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- =====================================================================
-- STEP 5: 扩展 purchase_orders 表
-- =====================================================================

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN expected_fulfillment_week TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN is_closed BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN closed_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- =====================================================================
-- STEP 6: 扩展 shipments 表
-- =====================================================================

DO $$ BEGIN
  ALTER TABLE shipments ADD COLUMN channel_allocation JSONB DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shipments ADD COLUMN shipment_status TEXT DEFAULT 'draft';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- =====================================================================
-- STEP 7: get_next_oa_number 函数
-- =====================================================================

CREATE OR REPLACE FUNCTION get_next_oa_number(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  v_prefix := 'OA-' || to_char(p_date, 'YYYY-MM-DD') || '-';
  SELECT COALESCE(MAX(SUBSTRING(arrival_number FROM v_prefix || '(\d+)')::INTEGER), 0) + 1
  INTO v_seq
  FROM order_arrivals
  WHERE arrival_number LIKE v_prefix || '%';
  RETURN v_prefix || LPAD(v_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- STEP 8: calculate_reverse_schedule 函数 (倒排排程)
-- =====================================================================

CREATE OR REPLACE FUNCTION calculate_reverse_schedule(
  p_sku TEXT,
  p_target_week TEXT,
  p_qty INTEGER
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
  v_prod INTEGER := 5;
  v_load INTEGER := 1;
  v_ship INTEGER := 5;
  v_inbound INTEGER := 2;
  v_target DATE;
  v_arrival DATE;
  v_ship_date DATE;
  v_fulfill DATE;
  v_order DATE;
  v_lead JSONB;
BEGIN
  -- 获取系统参数
  SELECT param_value INTO v_lead FROM system_parameters WHERE param_key = 'lead_times';
  IF v_lead IS NOT NULL THEN
    v_prod := COALESCE((v_lead->>'production_weeks')::INTEGER, 5);
    v_load := COALESCE((v_lead->>'loading_weeks')::INTEGER, 1);
    v_ship := COALESCE((v_lead->>'shipping_weeks')::INTEGER, 5);
    v_inbound := COALESCE((v_lead->>'inbound_weeks')::INTEGER, 2);
  END IF;

  -- 获取产品特定的生产周期
  SELECT COALESCE(production_lead_weeks, v_prod) INTO v_prod FROM products WHERE sku = p_sku;

  -- 解析目标周为日期
  v_target := to_date(p_target_week || '-1', 'IYYY-"W"IW-D');

  -- 倒推计算
  v_arrival := v_target - (v_inbound * 7);
  v_ship_date := v_arrival - (v_ship * 7);
  v_fulfill := v_ship_date - (v_load * 7);
  v_order := v_fulfill - (v_prod * 7);

  RETURN QUERY SELECT
    to_char(v_order, 'IYYY-"W"IW'),
    v_order,
    to_char(v_fulfill, 'IYYY-"W"IW'),
    to_char(v_ship_date, 'IYYY-"W"IW'),
    to_char(v_arrival, 'IYYY-"W"IW'),
    jsonb_build_object(
      'target_week', p_target_week,
      'qty', p_qty,
      'production_weeks', v_prod,
      'loading_weeks', v_load,
      'shipping_weeks', v_ship,
      'inbound_weeks', v_inbound,
      'total_weeks', v_prod + v_load + v_ship + v_inbound
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- STEP 9: v_psi_weekly_projection 视图
-- 修复: CTE 列名与 JOIN 条件匹配
-- =====================================================================

DROP VIEW IF EXISTS v_psi_weekly_projection;

CREATE VIEW v_psi_weekly_projection AS
WITH
  -- 生成周序列 (过去4周 + 未来12周)
  week_series AS (
    SELECT
      to_char(date_trunc('week', CURRENT_DATE) + (n * INTERVAL '1 week'), 'IYYY-"W"IW') AS week_iso,
      (date_trunc('week', CURRENT_DATE) + (n * INTERVAL '1 week'))::DATE AS week_start_date,
      (date_trunc('week', CURRENT_DATE) + (n * INTERVAL '1 week') + INTERVAL '6 days')::DATE AS week_end_date,
      n AS week_offset
    FROM generate_series(-4, 11) AS n
  ),
  -- SKU × 仓库 × 周 笛卡尔积
  base AS (
    SELECT
      p.sku,
      p.product_name,
      p.safety_stock_weeks,
      w.id AS warehouse_id,
      w.warehouse_name,
      ws.week_iso,
      ws.week_start_date,
      ws.week_end_date,
      ws.week_offset
    FROM products p
    CROSS JOIN warehouses w
    CROSS JOIN week_series ws
    WHERE p.is_active = true AND w.is_active = true
  ),
  -- 汇总销售预测
  forecasts AS (
    SELECT sku, week_iso, SUM(forecast_qty) AS qty
    FROM sales_forecasts WHERE is_closed = false
    GROUP BY sku, week_iso
  ),
  -- 汇总实际销量
  actuals AS (
    SELECT sku, week_iso, SUM(actual_qty) AS qty
    FROM sales_actuals
    GROUP BY sku, week_iso
  ),
  -- 汇总预计到货 (重命名列为 warehouse_id)
  planned AS (
    SELECT
      si.sku,
      s.destination_warehouse_id AS warehouse_id,
      to_char(s.planned_arrival_date, 'IYYY-"W"IW') AS week_iso,
      SUM(si.shipped_qty) AS qty
    FROM shipment_items si
    JOIN shipments s ON s.id = si.shipment_id
    WHERE s.actual_arrival_date IS NULL AND s.planned_arrival_date IS NOT NULL
    GROUP BY si.sku, s.destination_warehouse_id, to_char(s.planned_arrival_date, 'IYYY-"W"IW')
  ),
  -- 汇总实际到货 (重命名列为 warehouse_id)
  arrived AS (
    SELECT
      si.sku,
      s.destination_warehouse_id AS warehouse_id,
      to_char(s.actual_arrival_date, 'IYYY-"W"IW') AS week_iso,
      SUM(si.shipped_qty) AS qty
    FROM shipment_items si
    JOIN shipments s ON s.id = si.shipment_id
    WHERE s.actual_arrival_date IS NOT NULL
    GROUP BY si.sku, s.destination_warehouse_id, to_char(s.actual_arrival_date, 'IYYY-"W"IW')
  )
SELECT
  b.sku,
  b.product_name,
  b.warehouse_id,
  b.warehouse_name,
  b.week_iso,
  b.week_start_date,
  b.week_end_date,
  b.week_offset,
  -- 期初库存 (当前周取库存快照,其他周简化为0)
  COALESCE(CASE WHEN b.week_offset = 0 THEN inv.qty_on_hand ELSE 0 END, 0) AS opening_stock,
  -- 到货
  COALESCE(pl.qty, 0) AS planned_arrival_qty,
  COALESCE(ar.qty, 0) AS actual_arrival_qty,
  COALESCE(ar.qty, pl.qty, 0) AS effective_arrival_qty,
  -- 销售
  COALESCE(fc.qty, 0) AS forecast_sales_qty,
  ac.qty AS actual_sales_qty,
  COALESCE(ac.qty, fc.qty, 0) AS effective_sales_qty,
  -- 期末库存
  COALESCE(CASE WHEN b.week_offset = 0 THEN inv.qty_on_hand ELSE 0 END, 0)
    + COALESCE(ar.qty, pl.qty, 0)
    - COALESCE(ac.qty, fc.qty, 0) AS closing_stock,
  -- 安全库存阈值
  COALESCE(fc.qty, 0) * b.safety_stock_weeks AS safety_stock_threshold,
  -- 库存状态
  CASE
    WHEN (COALESCE(CASE WHEN b.week_offset = 0 THEN inv.qty_on_hand ELSE 0 END, 0) + COALESCE(ar.qty, pl.qty, 0) - COALESCE(ac.qty, fc.qty, 0)) < 0
      THEN 'Stockout'
    WHEN (COALESCE(CASE WHEN b.week_offset = 0 THEN inv.qty_on_hand ELSE 0 END, 0) + COALESCE(ar.qty, pl.qty, 0) - COALESCE(ac.qty, fc.qty, 0)) < (COALESCE(fc.qty, 0) * b.safety_stock_weeks)
      THEN 'Risk'
    ELSE 'OK'
  END AS stock_status,
  NOW() AS calculated_at
FROM base b
LEFT JOIN forecasts fc ON fc.sku = b.sku AND fc.week_iso = b.week_iso
LEFT JOIN actuals ac ON ac.sku = b.sku AND ac.week_iso = b.week_iso
LEFT JOIN planned pl ON pl.sku = b.sku AND pl.warehouse_id = b.warehouse_id AND pl.week_iso = b.week_iso
LEFT JOIN arrived ar ON ar.sku = b.sku AND ar.warehouse_id = b.warehouse_id AND ar.week_iso = b.week_iso
LEFT JOIN inventory_snapshots inv ON inv.sku = b.sku AND inv.warehouse_id = b.warehouse_id;

-- =====================================================================
-- STEP 10: v_reverse_schedule_suggestions 视图 (倒排建议)
-- =====================================================================

DROP VIEW IF EXISTS v_reverse_schedule_suggestions;

CREATE VIEW v_reverse_schedule_suggestions AS
WITH demand AS (
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
  d.sku,
  d.product_name,
  d.spu,
  d.sales_week,
  d.forecast_qty,
  d.covered_qty,
  d.uncovered_qty AS suggested_order_qty,
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
  rs.suggested_order_week < to_char(CURRENT_DATE, 'IYYY-"W"IW') AS is_overdue,
  rs.breakdown AS lead_time_breakdown,
  NOW() AS calculated_at
FROM demand d
CROSS JOIN LATERAL calculate_reverse_schedule(d.sku, d.sales_week, d.uncovered_qty) rs;

-- =====================================================================
-- 验证迁移结果
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SCM V2 Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New Tables: system_parameters, order_arrivals, psi_weekly_snapshots';
  RAISE NOTICE 'Extended: sales_forecasts, purchase_orders, shipments';
  RAISE NOTICE 'Functions: get_next_oa_number, calculate_reverse_schedule';
  RAISE NOTICE 'Views: v_psi_weekly_projection, v_reverse_schedule_suggestions';
  RAISE NOTICE '========================================';
END $$;
