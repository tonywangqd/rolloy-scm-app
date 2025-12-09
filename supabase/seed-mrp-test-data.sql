-- ============================================================
-- MRP算法验证测试数据 (基于用户提供的案例)
-- ============================================================
-- 案例背景：
-- - 需求端: W50 需要销售100台
-- - 生产周期: 5周, 装柜缓冲: 1周, 海运: 5周, 上架缓冲: 2周
-- - 下单周 W37 → 完工周 W42 → 发货周 W43 → 到仓周 W48
--
-- 实际执行偏差：
-- - PO: W38 下单60台 (晚1周，少40台), 生产周期变更为6周
-- - OF: W44 完工35台, W45 完工剩余25台 (分批)
-- - OS: W46 发货50台 (合并: 30台来自OF1 + 20台来自OF2)
-- - OA: W50 到仓50台 (提前1周到货)
-- ============================================================

-- 0. 清理旧测试数据 (可选, 谨慎使用)
-- DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE tracking_number LIKE 'MRP-TEST%');
-- DELETE FROM shipments WHERE tracking_number LIKE 'MRP-TEST%';
-- DELETE FROM delivery_shipment_allocations WHERE delivery_id IN (SELECT id FROM production_deliveries WHERE delivery_number LIKE 'MRP-TEST%');
-- DELETE FROM production_deliveries WHERE delivery_number LIKE 'MRP-TEST%';
-- DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE 'MRP-TEST%');
-- DELETE FROM purchase_orders WHERE po_number LIKE 'MRP-TEST%';
-- DELETE FROM sales_forecasts WHERE sku = 'MRP-TEST-SKU';
-- DELETE FROM inventory_snapshots WHERE sku = 'MRP-TEST-SKU';
-- DELETE FROM products WHERE sku = 'MRP-TEST-SKU';

-- ============================================================
-- 1. 创建测试产品
-- ============================================================
INSERT INTO products (
  sku, spu, color_code, product_name,
  unit_cost_usd, safety_stock_weeks, is_active
) VALUES (
  'MRP-TEST-SKU',
  'MRP-TEST',
  'BLK',
  'MRP算法验证测试产品',
  10.00,
  2,       -- 安全库存 2周
  true
) ON CONFLICT (sku) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  safety_stock_weeks = EXCLUDED.safety_stock_weeks;

-- ============================================================
-- 2. 创建销售预测 (FO - Forecast Order)
-- ============================================================
-- 案例: W50 需求 100台
-- 系统倒推: W37 应下单 (但实际案例中FO未被完全转化)

-- W50 销量预测
INSERT INTO sales_forecasts (
  sku, channel_code, week_iso, week_start_date, week_end_date,
  forecast_qty, is_closed, close_reason
) VALUES (
  'MRP-TEST-SKU',
  'FBA',
  '2025-W50',
  '2025-12-08',  -- W50 周一
  '2025-12-14',  -- W50 周日
  100,
  false,
  NULL
) ON CONFLICT (sku, channel_code, week_iso) DO UPDATE SET
  forecast_qty = EXCLUDED.forecast_qty;

-- 额外添加 W49-W52 的预测，便于观察周转周数
INSERT INTO sales_forecasts (sku, channel_code, week_iso, week_start_date, week_end_date, forecast_qty, is_closed)
VALUES
  ('MRP-TEST-SKU', 'FBA', '2025-W49', '2025-12-01', '2025-12-07', 80, false),
  ('MRP-TEST-SKU', 'FBA', '2025-W51', '2025-12-15', '2025-12-21', 90, false),
  ('MRP-TEST-SKU', 'FBA', '2025-W52', '2025-12-22', '2025-12-28', 85, false)
ON CONFLICT (sku, channel_code, week_iso) DO UPDATE SET
  forecast_qty = EXCLUDED.forecast_qty;

-- ============================================================
-- 3. 设置期初库存
-- ============================================================
-- 假设 W47 期初库存 50台
INSERT INTO inventory_snapshots (
  sku, channel_code, warehouse_id, qty_on_hand, snapshot_date
)
SELECT
  'MRP-TEST-SKU',
  'FBA',
  w.id,
  50,  -- 期初库存 50台
  '2025-11-17'  -- W47 周一
FROM warehouses w
WHERE w.warehouse_code = 'FBA-ONT8'  -- 使用 Ontario 仓库
LIMIT 1
ON CONFLICT (sku, channel_code, warehouse_id, snapshot_date) DO UPDATE SET
  qty_on_hand = EXCLUDED.qty_on_hand;

-- ============================================================
-- 4. 创建采购订单 (PO - Purchase Order)
-- ============================================================
-- 案例: 实际 W38 下单 60台 (原计划 W37 下单 100台)

DO $$
DECLARE
  v_supplier_id UUID;
  v_po_id UUID;
  v_warehouse_id UUID;
BEGIN
  -- 获取供应商ID (使用第一个供应商)
  SELECT id INTO v_supplier_id FROM suppliers LIMIT 1;

  -- 获取仓库ID
  SELECT id INTO v_warehouse_id FROM warehouses WHERE warehouse_code = 'FBA-ONT8' LIMIT 1;

  -- 创建PO
  INSERT INTO purchase_orders (
    po_number, batch_code, supplier_id, po_status,
    planned_order_date, actual_order_date,
    planned_ship_date, remarks
  ) VALUES (
    'MRP-TEST-PO-2025W38',
    '2025-W38-TEST',
    v_supplier_id,
    'In Production',
    '2025-09-08',  -- W37 计划下单日
    '2025-09-15',  -- W38 实际下单日 (晚1周)
    '2025-10-20',  -- W43 计划发货日 (基于原始推算)
    '【MRP测试】原计划100台，实际下单60台。生产周期变更为6周。'
  )
  ON CONFLICT (po_number) DO UPDATE SET
    remarks = EXCLUDED.remarks
  RETURNING id INTO v_po_id;

  -- 创建PO Item
  INSERT INTO purchase_order_items (
    po_id, sku, channel_code, ordered_qty, delivered_qty, unit_price_usd
  ) VALUES (
    v_po_id,
    'MRP-TEST-SKU',
    'FBA',
    60,   -- 实际下单量
    60,   -- 已全部交付 (35 + 25 = 60)
    10.00
  )
  ON CONFLICT DO NOTHING;

  -- 输出结果
  RAISE NOTICE 'Created PO: % with ID: %', 'MRP-TEST-PO-2025W38', v_po_id;
END $$;

-- ============================================================
-- 5. 创建生产交付 (OF - Order Fulfillment)
-- ============================================================
-- 案例:
-- - OF1: W44 实际完工 35台
-- - OF2: W45 实际完工 25台 (延迟1周)

DO $$
DECLARE
  v_po_item_id UUID;
  v_delivery_id_1 UUID;
  v_delivery_id_2 UUID;
BEGIN
  -- 获取PO Item ID
  SELECT poi.id INTO v_po_item_id
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.po_id
  WHERE po.po_number = 'MRP-TEST-PO-2025W38' AND poi.sku = 'MRP-TEST-SKU';

  -- 创建 OF1: W44 完工 35台
  INSERT INTO production_deliveries (
    delivery_number, po_item_id, sku, channel_code,
    delivered_qty, planned_delivery_date, actual_delivery_date,
    unit_cost_usd, payment_status, shipped_qty, shipment_status, remarks
  ) VALUES (
    'MRP-TEST-OF1-2025W44',
    v_po_item_id,
    'MRP-TEST-SKU',
    'FBA',
    35,
    '2025-10-27',  -- W44 计划 (W38 + 6周 = W44)
    '2025-10-27',  -- W44 实际完工
    10.00,
    'Pending',
    30,  -- 已发货 30台 (OF1的一部分)
    'partial',
    '【MRP测试】OF1: 第一批完工35台，已发货30台'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_delivery_id_1;

  -- 创建 OF2: W45 完工 25台 (剩余部分延期)
  INSERT INTO production_deliveries (
    delivery_number, po_item_id, sku, channel_code,
    delivered_qty, planned_delivery_date, actual_delivery_date,
    unit_cost_usd, payment_status, shipped_qty, shipment_status, remarks
  ) VALUES (
    'MRP-TEST-OF2-2025W45',
    v_po_item_id,
    'MRP-TEST-SKU',
    'FBA',
    25,
    '2025-11-03',  -- W45 计划
    '2025-11-03',  -- W45 实际完工
    10.00,
    'Pending',
    20,  -- 已发货 20台 (OF2的一部分)
    'partial',
    '【MRP测试】OF2: 第二批完工25台，已发货20台'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_delivery_id_2;

  RAISE NOTICE 'Created OF1: %, OF2: %', v_delivery_id_1, v_delivery_id_2;
END $$;

-- ============================================================
-- 6. 创建发货单 (OS - Order Shipment)
-- ============================================================
-- 案例: W46 发货 50台 (合并: OF1的30台 + OF2的20台)

DO $$
DECLARE
  v_warehouse_id UUID;
  v_shipment_id UUID;
  v_delivery_id_1 UUID;
  v_delivery_id_2 UUID;
BEGIN
  -- 获取仓库ID
  SELECT id INTO v_warehouse_id FROM warehouses WHERE warehouse_code = 'FBA-ONT8' LIMIT 1;

  -- 获取 delivery IDs
  SELECT id INTO v_delivery_id_1 FROM production_deliveries WHERE delivery_number = 'MRP-TEST-OF1-2025W44';
  SELECT id INTO v_delivery_id_2 FROM production_deliveries WHERE delivery_number = 'MRP-TEST-OF2-2025W45';

  -- 创建 Shipment (OS)
  INSERT INTO shipments (
    tracking_number, batch_code, logistics_batch_code,
    destination_warehouse_id, customs_clearance, logistics_plan, logistics_region,
    planned_departure_date, actual_departure_date,
    planned_arrival_days, planned_arrival_date,
    actual_arrival_date,
    weight_kg, unit_count, cost_per_kg_usd, surcharge_usd, tax_refund_usd,
    payment_status, remarks
  ) VALUES (
    'MRP-TEST-OS-2025W46',
    '2025-W46-TEST',
    'LOG-2025W46',
    v_warehouse_id,
    true,
    '海运直送',
    'West',
    '2025-11-10',  -- W46 计划发货
    '2025-11-10',  -- W46 实际发货
    35,            -- 计划运输天数 (5周)
    '2025-12-15',  -- 计划到达 W51
    '2025-12-08',  -- 实际到达 W50 (提前1周!)
    25.0,
    50,            -- 发货件数
    2.50,
    100.00,
    50.00,
    'Pending',
    '【MRP测试】合并发货: OF1的30台 + OF2的20台 = 50台，提前到达'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_shipment_id;

  -- 创建 Shipment Item
  INSERT INTO shipment_items (shipment_id, sku, shipped_qty)
  VALUES (v_shipment_id, 'MRP-TEST-SKU', 50)
  ON CONFLICT DO NOTHING;

  -- 创建 Delivery-Shipment 关联 (N:N)
  -- OF1 贡献 30台
  INSERT INTO delivery_shipment_allocations (delivery_id, shipment_id, shipped_qty, remarks)
  VALUES (v_delivery_id_1, v_shipment_id, 30, '【MRP测试】OF1分配30台到OS')
  ON CONFLICT (delivery_id, shipment_id) DO NOTHING;

  -- OF2 贡献 20台
  INSERT INTO delivery_shipment_allocations (delivery_id, shipment_id, shipped_qty, remarks)
  VALUES (v_delivery_id_2, v_shipment_id, 20, '【MRP测试】OF2分配20台到OS')
  ON CONFLICT (delivery_id, shipment_id) DO NOTHING;

  RAISE NOTICE 'Created Shipment: % with ID: %', 'MRP-TEST-OS-2025W46', v_shipment_id;
END $$;

-- ============================================================
-- 7. 数据验证查询
-- ============================================================

-- 查询完整数据链
SELECT '=== MRP测试数据验证 ===' AS info;

-- 7.1 产品信息
SELECT
  '产品' AS type,
  sku,
  product_name,
  safety_stock_weeks
FROM products WHERE sku = 'MRP-TEST-SKU';

-- 7.2 销售预测 (FO)
SELECT
  'FO预测' AS type,
  week_iso,
  forecast_qty,
  is_closed
FROM sales_forecasts WHERE sku = 'MRP-TEST-SKU'
ORDER BY week_iso;

-- 7.3 采购订单 (PO)
SELECT
  'PO订单' AS type,
  po.po_number,
  poi.ordered_qty,
  poi.delivered_qty,
  po.planned_order_date,
  po.actual_order_date,
  po.po_status
FROM purchase_orders po
JOIN purchase_order_items poi ON poi.po_id = po.id
WHERE po.po_number LIKE 'MRP-TEST%';

-- 7.4 生产交付 (OF)
SELECT
  'OF出货' AS type,
  delivery_number,
  delivered_qty,
  shipped_qty,
  delivered_qty - shipped_qty AS pending_ship,
  planned_delivery_date,
  actual_delivery_date,
  shipment_status
FROM production_deliveries WHERE delivery_number LIKE 'MRP-TEST%';

-- 7.5 发货单 (OS)
SELECT
  'OS发货' AS type,
  s.tracking_number,
  si.shipped_qty,
  s.planned_departure_date,
  s.actual_departure_date,
  s.planned_arrival_date,
  s.actual_arrival_date
FROM shipments s
JOIN shipment_items si ON si.shipment_id = s.id
WHERE s.tracking_number LIKE 'MRP-TEST%';

-- 7.6 N:N 分配关系
SELECT
  '分配关系' AS type,
  pd.delivery_number AS of_number,
  s.tracking_number AS os_number,
  dsa.shipped_qty AS allocated_qty
FROM delivery_shipment_allocations dsa
JOIN production_deliveries pd ON pd.id = dsa.delivery_id
JOIN shipments s ON s.id = dsa.shipment_id
WHERE pd.delivery_number LIKE 'MRP-TEST%';

-- 7.7 库存快照
SELECT
  '库存' AS type,
  sku,
  qty_on_hand,
  snapshot_date
FROM inventory_snapshots WHERE sku = 'MRP-TEST-SKU';

-- ============================================================
-- 8. 预期PSI计算结果 (手工验证)
-- ============================================================
/*
周次    期初    预计到仓    实际到仓    可销售    销量预测    期末    周转
W47     50      0          0          50       0         50      -
W48     50      0          0          50       0         50      -
W49     50      0          0          50       80        -30     Risk
W50     -30     0          50         20       100       -80     Stockout
W51     -80     10         0          -70      90        -160    Stockout
W52     -160    0          0          -160     85        -245    Stockout

说明:
- W50 实际到仓 50台 (提前从W51)
- W51 预计到仓 10台 (OF1剩5台 + OF2剩5台, 尚未发货)
- 由于下单量不足且延迟, 导致严重缺货
*/

SELECT '=== 测试数据插入完成 ===' AS status;
SELECT '请访问 /inventory/algorithm-audit 页面, 选择 SKU: MRP-TEST-SKU 进行验证' AS next_step;
