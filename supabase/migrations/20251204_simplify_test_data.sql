-- ================================================================
-- 简化测试数据脚本
-- 目标：每种数据类型只保留1条，便于测试和验证
-- 执行方式：在 Supabase SQL Editor 中运行
-- ================================================================

-- ================================================================
-- 第一步：清理所有业务数据（按依赖关系顺序删除）
-- ================================================================

-- 清理 Balance Management 相关（如果存在）
DELETE FROM balance_resolutions WHERE true;
DELETE FROM inventory_adjustments WHERE true;

-- 清理视图依赖的数据
DELETE FROM replenishment_suggestions WHERE true;

-- 清理物流数据
DELETE FROM shipment_items WHERE true;
DELETE FROM shipments WHERE true;

-- 清理采购数据
DELETE FROM production_deliveries WHERE true;
DELETE FROM purchase_order_items WHERE true;
DELETE FROM purchase_orders WHERE true;

-- 清理库存和销售数据
DELETE FROM inventory_snapshots WHERE true;
DELETE FROM inventory_projections WHERE true;
DELETE FROM sales_actuals WHERE true;
DELETE FROM sales_forecasts WHERE true;

-- 清理主数据（按依赖关系顺序）
DELETE FROM products WHERE true;
DELETE FROM channels WHERE true;
DELETE FROM warehouses WHERE true;
DELETE FROM suppliers WHERE true;

-- ================================================================
-- 第二步：插入简化的主数据（每种只保留1条）
-- ================================================================

-- 1. 供应商 (1条)
INSERT INTO suppliers (id, supplier_code, supplier_name, payment_terms_days, is_active)
VALUES
  (gen_random_uuid(), 'SUP-001', 'Default Supplier', 60, true);

-- 2. 仓库 (1条)
INSERT INTO warehouses (id, warehouse_code, warehouse_name, warehouse_type, region, is_active)
VALUES
  (gen_random_uuid(), 'WH-001', 'Main Warehouse', 'FBA', 'East', true);

-- 3. 渠道 (1条)
INSERT INTO channels (id, channel_code, channel_name, is_active)
VALUES
  (gen_random_uuid(), 'AMZ-US', 'Amazon US', true);

-- 4. 产品/SKU (1条)
INSERT INTO products (id, sku, spu, color_code, product_name, unit_cost_usd, safety_stock_weeks, production_lead_weeks, is_active)
VALUES
  (gen_random_uuid(), 'TEST-SKU-001', 'TEST-SPU-001', 'BLACK', 'Test Product', 25.00, 2, 5, true);

-- ================================================================
-- 第三步：插入初始业务数据
-- ================================================================

-- 获取刚插入的ID
DO $$
DECLARE
  v_product_id UUID;
  v_supplier_id UUID;
  v_warehouse_id UUID;
  v_channel_id UUID;
  v_po_id UUID;
  v_current_week TEXT;
BEGIN
  -- 获取主数据ID
  SELECT id INTO v_product_id FROM products WHERE sku = 'TEST-SKU-001';
  SELECT id INTO v_supplier_id FROM suppliers WHERE supplier_code = 'SUP-001';
  SELECT id INTO v_warehouse_id FROM warehouses WHERE warehouse_code = 'WH-001';
  SELECT id INTO v_channel_id FROM channels WHERE channel_code = 'AMZ-US';

  -- 计算当前ISO周
  v_current_week := to_char(CURRENT_DATE, 'IYYY') || '-' || LPAD(to_char(CURRENT_DATE, 'IW'), 2, '0');

  -- 1. 插入库存快照 (初始库存 500 件)
  INSERT INTO inventory_snapshots (id, sku, warehouse_id, qty_on_hand, updated_at)
  VALUES (gen_random_uuid(), 'TEST-SKU-001', v_warehouse_id, 500, NOW());

  -- 2. 插入销量预测 (未来12周) - 使用 channel_code 和日期字段
  FOR i IN 0..11 LOOP
    DECLARE
      v_target_date DATE := CURRENT_DATE + (i * 7);
      v_week_start DATE := v_target_date - ((EXTRACT(ISODOW FROM v_target_date)::INT - 1));
      v_week_end DATE := v_week_start + 6;
    BEGIN
      INSERT INTO sales_forecasts (id, sku, channel_code, week_iso, week_start_date, week_end_date, forecast_qty)
      VALUES (
        gen_random_uuid(),
        'TEST-SKU-001',
        'AMZ-US',
        to_char(v_target_date, 'IYYY') || '-' || LPAD(to_char(v_target_date, 'IW'), 2, '0'),
        v_week_start,
        v_week_end,
        CASE
          WHEN i < 4 THEN 100  -- 前4周每周100件
          ELSE 80             -- 之后每周80件
        END
      );
    END;
  END LOOP;

  -- 3. 插入历史实际销量 (过去4周) - 使用 channel_code 和日期字段
  FOR i IN 1..4 LOOP
    DECLARE
      v_target_date DATE := CURRENT_DATE - (i * 7);
      v_week_start DATE := v_target_date - ((EXTRACT(ISODOW FROM v_target_date)::INT - 1));
      v_week_end DATE := v_week_start + 6;
    BEGIN
      INSERT INTO sales_actuals (id, sku, channel_code, week_iso, week_start_date, week_end_date, actual_qty)
      VALUES (
        gen_random_uuid(),
        'TEST-SKU-001',
        'AMZ-US',
        to_char(v_target_date, 'IYYY') || '-' || LPAD(to_char(v_target_date, 'IW'), 2, '0'),
        v_week_start,
        v_week_end,
        90 + (i * 5)  -- 过去销量 95, 100, 105, 110
      );
    END;
  END LOOP;

  RAISE NOTICE '数据初始化完成！';
  RAISE NOTICE 'Product ID: %', v_product_id;
  RAISE NOTICE 'Supplier ID: %', v_supplier_id;
  RAISE NOTICE 'Warehouse ID: %', v_warehouse_id;
  RAISE NOTICE 'Channel ID: %', v_channel_id;
  RAISE NOTICE 'Current Week: %', v_current_week;
END $$;

-- ================================================================
-- 验证数据
-- ================================================================
SELECT 'products' as table_name, COUNT(*) as count FROM products
UNION ALL
SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL
SELECT 'warehouses', COUNT(*) FROM warehouses
UNION ALL
SELECT 'channels', COUNT(*) FROM channels
UNION ALL
SELECT 'inventory_snapshots', COUNT(*) FROM inventory_snapshots
UNION ALL
SELECT 'sales_forecasts', COUNT(*) FROM sales_forecasts
UNION ALL
SELECT 'sales_actuals', COUNT(*) FROM sales_actuals;
