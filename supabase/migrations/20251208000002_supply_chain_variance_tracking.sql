-- =====================================================================
-- Migration: Supply Chain Variance Tracking System
-- Version: 1.0.0
-- Date: 2025-12-08
--
-- Description:
--   供应链全链路差异追踪系统 - 追踪下单→出货→发货→到货各环节的数量差异
--
-- Changes:
--   1. Create supply_chain_variances table (差异追踪表)
--   2. Create auto-update triggers (自动更新触发器)
--   3. Create upsert functions (差异检测与创建函数)
--   4. Create v_variance_overview view (差异总览视图)
--   5. Create RLS policies (安全策略)
--   6. Backfill existing variances (回填现有差异)
-- =====================================================================

-- =====================================================================
-- STEP 1: Create main table
-- =====================================================================

CREATE TABLE supply_chain_variances (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联到源头记录
  source_type TEXT NOT NULL CHECK (source_type IN (
    'order_to_delivery',    -- PO Item 下单 → 工厂出货
    'delivery_to_ship',     -- 工厂出货 → 物流发货
    'ship_to_arrival'       -- 物流发货 → 仓库到货 (损耗/短装)
  )),
  source_id UUID NOT NULL,  -- po_item_id | delivery_id | shipment_id

  -- 产品信息 (denormalized for query performance)
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  channel_code TEXT REFERENCES channels(channel_code) ON DELETE SET NULL,

  -- 数量数据
  planned_qty INTEGER NOT NULL CHECK (planned_qty >= 0),    -- 上游计划数量
  fulfilled_qty INTEGER NOT NULL DEFAULT 0 CHECK (fulfilled_qty >= 0), -- 已完成数量
  -- pending_qty will be calculated in view/trigger (cannot use generated column referencing other generated column)

  -- 计划解决时间 (用户可调整)
  planned_week TEXT,        -- ISO week format: YYYY-WW
  planned_date DATE,        -- 具体日期 (可选，用于更精确的跟踪)

  -- 状态管理
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- 待处理 (刚产生差异)
    'scheduled',    -- 已计划 (用户设置了 planned_week)
    'partial',      -- 部分完成 (fulfilled_qty > 0 且 < planned_qty)
    'completed',    -- 已完成 (fulfilled_qty = planned_qty)
    'cancelled',    -- 已取消 (短装关闭)
    'overdue'       -- 已逾期 (planned_week < 当前周 且 status = scheduled)
  )),

  -- 优先级 (will be calculated in view)
  priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),

  -- 备注与审计
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,          -- auth.users.id
  updated_by UUID,          -- auth.users.id
  resolved_at TIMESTAMPTZ,  -- 完成时间
  resolved_by UUID,         -- 完成人

  -- 约束：同一个源记录只能有一条差异记录
  UNIQUE (source_type, source_id)
);

-- =====================================================================
-- STEP 2: Create indexes
-- =====================================================================

CREATE INDEX idx_sc_variances_sku ON supply_chain_variances(sku);
CREATE INDEX idx_sc_variances_status ON supply_chain_variances(status) WHERE status IN ('pending', 'scheduled', 'partial', 'overdue');
CREATE INDEX idx_sc_variances_planned_week ON supply_chain_variances(planned_week) WHERE planned_week IS NOT NULL;
CREATE INDEX idx_sc_variances_source ON supply_chain_variances(source_type, source_id);
CREATE INDEX idx_sc_variances_priority ON supply_chain_variances(priority, created_at DESC);
CREATE INDEX idx_sc_variances_pending ON supply_chain_variances((planned_qty - fulfilled_qty)) WHERE (planned_qty - fulfilled_qty) > 0;

-- =====================================================================
-- STEP 3: Create triggers
-- =====================================================================

-- Trigger 1: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sc_variance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sc_variance_updated_at
  BEFORE UPDATE ON supply_chain_variances
  FOR EACH ROW
  EXECUTE FUNCTION update_sc_variance_updated_at();

-- Trigger 2: Auto-update status and priority based on pending_qty and planned_week
CREATE OR REPLACE FUNCTION auto_update_variance_status()
RETURNS TRIGGER AS $$
DECLARE
  v_current_week TEXT;
  v_pending_qty INTEGER;
BEGIN
  v_current_week := to_char(CURRENT_DATE, 'IYYY-"W"IW');
  v_pending_qty := NEW.planned_qty - NEW.fulfilled_qty;

  -- 根据 pending_qty 更新状态
  IF v_pending_qty <= 0 THEN
    NEW.status := 'completed';
    NEW.resolved_at := NOW();
    NEW.priority := 'Low';
  ELSIF v_pending_qty > 0 AND NEW.fulfilled_qty > 0 THEN
    NEW.status := 'partial';
  ELSIF NEW.status = 'cancelled' THEN
    -- 保持 cancelled 状态不变
    NEW.priority := 'Low';
  ELSIF NEW.planned_week IS NOT NULL AND NEW.planned_week < v_current_week THEN
    NEW.status := 'overdue';
    NEW.priority := 'Critical';
  ELSIF NEW.planned_week IS NOT NULL THEN
    NEW.status := 'scheduled';
    -- Check if planned week is current week
    IF NEW.planned_week <= v_current_week THEN
      NEW.priority := 'High';
    ELSE
      NEW.priority := 'Medium';
    END IF;
  ELSE
    NEW.status := 'pending';
    NEW.priority := 'Medium';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_update_variance_status
  BEFORE INSERT OR UPDATE OF planned_qty, fulfilled_qty, planned_week, status
  ON supply_chain_variances
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_variance_status();

-- =====================================================================
-- STEP 4: Create upsert functions
-- =====================================================================

-- Function 1: Upsert PO Item variance
CREATE OR REPLACE FUNCTION upsert_po_item_variance(
  p_po_item_id UUID,
  p_sku TEXT,
  p_channel_code TEXT,
  p_ordered_qty INTEGER,
  p_delivered_qty INTEGER,
  p_planned_week TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_variance_id UUID;
  v_pending_qty INTEGER;
BEGIN
  v_pending_qty := p_ordered_qty - p_delivered_qty;

  -- 如果没有差异，删除旧记录并返回
  IF v_pending_qty <= 0 THEN
    DELETE FROM supply_chain_variances
    WHERE source_type = 'order_to_delivery' AND source_id = p_po_item_id;
    RETURN NULL;
  END IF;

  -- Upsert 差异记录
  INSERT INTO supply_chain_variances (
    source_type,
    source_id,
    sku,
    channel_code,
    planned_qty,
    fulfilled_qty,
    planned_week
  )
  VALUES (
    'order_to_delivery',
    p_po_item_id,
    p_sku,
    p_channel_code,
    p_ordered_qty,
    p_delivered_qty,
    p_planned_week
  )
  ON CONFLICT (source_type, source_id)
  DO UPDATE SET
    planned_qty = EXCLUDED.planned_qty,
    fulfilled_qty = EXCLUDED.fulfilled_qty,
    planned_week = COALESCE(EXCLUDED.planned_week, supply_chain_variances.planned_week),
    updated_at = NOW()
  RETURNING id INTO v_variance_id;

  RETURN v_variance_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION upsert_po_item_variance IS 'Detect and create/update variance for PO Item (order → delivery)';

-- Function 2: Upsert Delivery variance
CREATE OR REPLACE FUNCTION upsert_delivery_variance(
  p_delivery_id UUID,
  p_sku TEXT,
  p_channel_code TEXT,
  p_delivered_qty INTEGER,
  p_shipped_qty INTEGER,
  p_planned_week TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_variance_id UUID;
  v_pending_qty INTEGER;
BEGIN
  v_pending_qty := p_delivered_qty - p_shipped_qty;

  IF v_pending_qty <= 0 THEN
    DELETE FROM supply_chain_variances
    WHERE source_type = 'delivery_to_ship' AND source_id = p_delivery_id;
    RETURN NULL;
  END IF;

  INSERT INTO supply_chain_variances (
    source_type,
    source_id,
    sku,
    channel_code,
    planned_qty,
    fulfilled_qty,
    planned_week
  )
  VALUES (
    'delivery_to_ship',
    p_delivery_id,
    p_sku,
    p_channel_code,
    p_delivered_qty,
    p_shipped_qty,
    p_planned_week
  )
  ON CONFLICT (source_type, source_id)
  DO UPDATE SET
    planned_qty = EXCLUDED.planned_qty,
    fulfilled_qty = EXCLUDED.fulfilled_qty,
    planned_week = COALESCE(EXCLUDED.planned_week, supply_chain_variances.planned_week),
    updated_at = NOW()
  RETURNING id INTO v_variance_id;

  RETURN v_variance_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION upsert_delivery_variance IS 'Detect and create/update variance for Delivery (delivery → ship)';

-- =====================================================================
-- STEP 5: Create views
-- =====================================================================

CREATE OR REPLACE VIEW v_variance_overview AS
SELECT
  v.id,
  v.source_type,
  v.source_id,
  v.sku,
  p.product_name,
  p.spu,
  v.channel_code,
  v.planned_qty,
  v.fulfilled_qty,
  (v.planned_qty - v.fulfilled_qty) AS pending_qty,  -- Calculated field
  v.planned_week,
  v.planned_date,
  v.status,
  v.priority,
  v.remarks,
  v.created_at,
  v.updated_at,

  -- 关联源记录信息 (用于显示)
  CASE v.source_type
    WHEN 'order_to_delivery' THEN (
      SELECT CONCAT('PO#', po.po_number, ' (', poi.ordered_qty, ' ordered)')
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE poi.id = v.source_id
    )
    WHEN 'delivery_to_ship' THEN (
      SELECT CONCAT('DL#', pd.delivery_number, ' (', pd.delivered_qty, ' delivered)')
      FROM production_deliveries pd
      WHERE pd.id = v.source_id
    )
    WHEN 'ship_to_arrival' THEN (
      SELECT CONCAT('SH#', s.tracking_number)
      FROM shipments s
      WHERE s.id = v.source_id
    )
  END AS source_reference,

  -- 计算距今天数
  EXTRACT(DAY FROM NOW() - v.created_at)::INTEGER AS age_days,

  -- 计算距 planned_week 的周差
  CASE
    WHEN v.planned_week IS NOT NULL THEN
      (
        EXTRACT(YEAR FROM to_date(v.planned_week || '-1', 'IYYY-IW-ID'))::INTEGER * 52 +
        EXTRACT(WEEK FROM to_date(v.planned_week || '-1', 'IYYY-IW-ID'))::INTEGER
      ) - (
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER * 52 +
        EXTRACT(WEEK FROM CURRENT_DATE)::INTEGER
      )
    ELSE NULL
  END AS weeks_until_planned

FROM supply_chain_variances v
JOIN products p ON p.sku = v.sku;

COMMENT ON VIEW v_variance_overview IS '差异总览：包含产品信息、源记录引用、优先级、年龄等计算字段';

-- =====================================================================
-- STEP 6: Create RLS policies
-- =====================================================================

-- Enable RLS
ALTER TABLE supply_chain_variances ENABLE ROW LEVEL SECURITY;

-- Policy: 所有认证用户可读
CREATE POLICY "Allow authenticated read on supply_chain_variances"
  ON supply_chain_variances FOR SELECT
  TO authenticated
  USING (true);

-- Policy: 所有认证用户可写 (创建/更新)
CREATE POLICY "Allow authenticated insert on supply_chain_variances"
  ON supply_chain_variances FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on supply_chain_variances"
  ON supply_chain_variances FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated delete on supply_chain_variances"
  ON supply_chain_variances FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================================
-- STEP 7: Backfill existing variances (optional)
-- =====================================================================

-- Backfill PO Item variances
INSERT INTO supply_chain_variances (
  source_type,
  source_id,
  sku,
  channel_code,
  planned_qty,
  fulfilled_qty
)
SELECT
  'order_to_delivery'::TEXT AS source_type,
  poi.id AS source_id,
  poi.sku,
  poi.channel_code,
  poi.ordered_qty AS planned_qty,
  poi.delivered_qty AS fulfilled_qty
FROM purchase_order_items poi
WHERE poi.ordered_qty > poi.delivered_qty
ON CONFLICT (source_type, source_id) DO NOTHING;

-- Backfill delivery variances
INSERT INTO supply_chain_variances (
  source_type,
  source_id,
  sku,
  channel_code,
  planned_qty,
  fulfilled_qty
)
SELECT
  'delivery_to_ship'::TEXT AS source_type,
  pd.id AS source_id,
  pd.sku,
  pd.channel_code,
  pd.delivered_qty AS planned_qty,
  pd.shipped_qty AS fulfilled_qty
FROM production_deliveries pd
WHERE pd.delivered_qty > pd.shipped_qty
ON CONFLICT (source_type, source_id) DO NOTHING;

-- =====================================================================
-- STEP 8: Add comments
-- =====================================================================

COMMENT ON TABLE supply_chain_variances IS 'Migration 20251208000002: Supply chain variance tracking system - 供应链差异追踪系统';
COMMENT ON COLUMN supply_chain_variances.source_type IS '差异类型：order_to_delivery (下单→出货) | delivery_to_ship (出货→发货) | ship_to_arrival (发货→到货)';
COMMENT ON COLUMN supply_chain_variances.pending_qty IS '剩余待解决数量 (自动计算 = planned_qty - fulfilled_qty)';
COMMENT ON COLUMN supply_chain_variances.planned_week IS '用户可调整的预计处理周 (ISO format: YYYY-WW)';
COMMENT ON COLUMN supply_chain_variances.status IS '状态：pending | scheduled | partial | completed | cancelled | overdue';
COMMENT ON COLUMN supply_chain_variances.priority IS '优先级 (自动计算)：Critical | High | Medium | Low';

-- =====================================================================
-- Migration complete
-- =====================================================================
