-- =====================================================================
-- Migration: Auto-sync Variance Triggers
-- Version: 1.0.0
-- Date: 2025-12-08
--
-- Description:
--   自动同步差异的触发器 - 当源表数据变化时自动创建/更新/删除差异记录
--
-- Dependencies:
--   - 20251208000002_supply_chain_variance_tracking.sql (upsert functions)
--
-- Changes:
--   1. Add trigger on purchase_order_items.delivered_qty
--      → Auto-call upsert_po_item_variance()
--   2. Add trigger on production_deliveries.shipped_qty
--      → Auto-call upsert_delivery_variance()
-- =====================================================================

-- =====================================================================
-- TRIGGER 1: PO Item 差异同步
-- =====================================================================

-- 触发器函数：当 delivered_qty 变化时同步差异
CREATE OR REPLACE FUNCTION sync_po_item_variance()
RETURNS TRIGGER AS $$
BEGIN
  -- 调用 upsert 函数
  -- 如果 ordered_qty > delivered_qty → 创建/更新差异
  -- 如果 ordered_qty <= delivered_qty → 删除差异
  PERFORM upsert_po_item_variance(
    p_po_item_id := NEW.id,
    p_sku := NEW.sku,
    p_channel_code := NEW.channel_code,
    p_ordered_qty := NEW.ordered_qty,
    p_delivered_qty := NEW.delivered_qty,
    p_planned_week := NULL  -- 初次创建不设置 planned_week，由用户手动设置
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_po_item_variance IS 'Auto-sync variance when purchase_order_items.delivered_qty changes';

-- 创建触发器
CREATE TRIGGER trigger_sync_po_item_variance
  AFTER INSERT OR UPDATE OF ordered_qty, delivered_qty, sku, channel_code
  ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_po_item_variance();

COMMENT ON TRIGGER trigger_sync_po_item_variance ON purchase_order_items IS 'Trigger: Auto-sync variance to supply_chain_variances when delivered_qty changes';

-- =====================================================================
-- TRIGGER 2: Production Delivery 差异同步
-- =====================================================================

-- 触发器函数：当 shipped_qty 变化时同步差异
CREATE OR REPLACE FUNCTION sync_delivery_variance()
RETURNS TRIGGER AS $$
BEGIN
  -- 调用 upsert 函数
  -- 如果 delivered_qty > shipped_qty → 创建/更新差异
  -- 如果 delivered_qty <= shipped_qty → 删除差异
  PERFORM upsert_delivery_variance(
    p_delivery_id := NEW.id,
    p_sku := NEW.sku,
    p_channel_code := NEW.channel_code,
    p_delivered_qty := NEW.delivered_qty,
    p_shipped_qty := NEW.shipped_qty,
    p_planned_week := NULL  -- 初次创建不设置 planned_week，由用户手动设置
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_delivery_variance IS 'Auto-sync variance when production_deliveries.shipped_qty changes';

-- 创建触发器
CREATE TRIGGER trigger_sync_delivery_variance
  AFTER INSERT OR UPDATE OF delivered_qty, shipped_qty, sku, channel_code
  ON production_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION sync_delivery_variance();

COMMENT ON TRIGGER trigger_sync_delivery_variance ON production_deliveries IS 'Trigger: Auto-sync variance to supply_chain_variances when shipped_qty changes';

-- =====================================================================
-- TESTING (Optional - 可选测试)
-- =====================================================================

-- 测试说明：
-- 1. 当 PO Item 的 delivered_qty 从 0 增加到 50 (ordered_qty=100):
--    → 应该创建一条 'order_to_delivery' 差异记录，pending_qty = 50
--
-- 2. 当 delivered_qty 继续增加到 100:
--    → 差异记录应该被删除（已完成）
--
-- 3. 当 Production Delivery 的 shipped_qty 从 0 增加到 30 (delivered_qty=50):
--    → 应该创建一条 'delivery_to_ship' 差异记录，pending_qty = 20
--
-- 4. 当 shipped_qty 继续增加到 50:
--    → 差异记录应该被删除

-- 测试用 SQL（需要在 Supabase SQL Editor 中手动执行）:
/*
-- Test 1: Update PO Item delivered_qty
UPDATE purchase_order_items
SET delivered_qty = 50
WHERE id = (SELECT id FROM purchase_order_items WHERE ordered_qty > delivered_qty LIMIT 1);

-- 检查差异表
SELECT * FROM v_variance_overview WHERE source_type = 'order_to_delivery';

-- Test 2: Complete delivery
UPDATE purchase_order_items
SET delivered_qty = ordered_qty
WHERE id = (SELECT id FROM purchase_order_items WHERE ordered_qty > delivered_qty LIMIT 1);

-- 检查差异是否删除
SELECT * FROM v_variance_overview WHERE source_type = 'order_to_delivery';

-- Test 3: Update Production Delivery shipped_qty
UPDATE production_deliveries
SET shipped_qty = 30
WHERE id = (SELECT id FROM production_deliveries WHERE delivered_qty > shipped_qty LIMIT 1);

-- 检查差异表
SELECT * FROM v_variance_overview WHERE source_type = 'delivery_to_ship';

-- Test 4: Complete shipment
UPDATE production_deliveries
SET shipped_qty = delivered_qty
WHERE id = (SELECT id FROM production_deliveries WHERE delivered_qty > shipped_qty LIMIT 1);

-- 检查差异是否删除
SELECT * FROM v_variance_overview WHERE source_type = 'delivery_to_ship';
*/

-- =====================================================================
-- Migration complete
-- =====================================================================
