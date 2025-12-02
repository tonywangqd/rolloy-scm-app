-- ================================================================
-- Test Data Generation Script (Safe Version)
-- Purpose: Generate sample data for algorithm validation
-- Run in Supabase SQL Editor
-- ================================================================

-- Step 1: Clear existing transactional data (keep master data)
TRUNCATE TABLE shipment_items CASCADE;
TRUNCATE TABLE shipments CASCADE;
TRUNCATE TABLE production_deliveries CASCADE;
TRUNCATE TABLE purchase_order_items CASCADE;
TRUNCATE TABLE purchase_orders CASCADE;
TRUNCATE TABLE sales_actuals CASCADE;
TRUNCATE TABLE sales_forecasts CASCADE;
TRUNCATE TABLE inventory_snapshots CASCADE;

-- ================================================================
-- MASTER DATA - Using only basic required columns
-- ================================================================

-- Products (5 SKUs for testing)
INSERT INTO products (sku, spu, color_code, product_name, unit_cost_usd, safety_stock_weeks, is_active)
VALUES
  ('SKU-001', 'SPU-A', 'BLK', 'Product A - Black', 25.00, 2, true),
  ('SKU-002', 'SPU-A', 'WHT', 'Product A - White', 25.00, 2, true),
  ('SKU-003', 'SPU-B', 'BLK', 'Product B - Black', 35.00, 3, true),
  ('SKU-004', 'SPU-C', 'RED', 'Product C - Red', 45.00, 2, true),
  ('SKU-005', 'SPU-D', 'BLU', 'Product D - Blue', 30.00, 2, true)
ON CONFLICT (sku) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  unit_cost_usd = EXCLUDED.unit_cost_usd;

-- Channels
INSERT INTO channels (channel_code, channel_name, is_active)
VALUES
  ('AMZ-US', 'Amazon US', true),
  ('SHOP-US', 'Shopify US', true)
ON CONFLICT (channel_code) DO NOTHING;

-- Warehouses
INSERT INTO warehouses (warehouse_code, warehouse_name, warehouse_type, region, is_active)
VALUES
  ('FBA-ONT8', 'FBA Ontario 8', 'FBA', 'West', true),
  ('FBA-LGB8', 'FBA Long Beach 8', 'FBA', 'West', true),
  ('3PL-LA', '3PL Los Angeles', '3PL', 'West', true)
ON CONFLICT (warehouse_code) DO NOTHING;

-- Suppliers (minimal columns)
INSERT INTO suppliers (supplier_code, supplier_name, is_active)
VALUES
  ('SUP-001', 'Shenzhen Factory A', true),
  ('SUP-002', 'Guangzhou Factory B', true)
ON CONFLICT (supplier_code) DO NOTHING;

-- ================================================================
-- CURRENT INVENTORY (Week 0 starting point)
-- ================================================================

DO $$
DECLARE
  v_fba_ont8_id UUID;
  v_fba_lgb8_id UUID;
  v_3pl_la_id UUID;
BEGIN
  SELECT id INTO v_fba_ont8_id FROM warehouses WHERE warehouse_code = 'FBA-ONT8';
  SELECT id INTO v_fba_lgb8_id FROM warehouses WHERE warehouse_code = 'FBA-LGB8';
  SELECT id INTO v_3pl_la_id FROM warehouses WHERE warehouse_code = '3PL-LA';

  -- Insert inventory snapshots
  INSERT INTO inventory_snapshots (sku, warehouse_id, qty_on_hand, last_counted_at)
  VALUES
    ('SKU-001', v_fba_ont8_id, 500, NOW()),
    ('SKU-001', v_3pl_la_id, 300, NOW()),
    ('SKU-002', v_fba_ont8_id, 400, NOW()),
    ('SKU-002', v_fba_lgb8_id, 200, NOW()),
    ('SKU-003', v_fba_ont8_id, 600, NOW()),
    ('SKU-004', v_fba_lgb8_id, 350, NOW()),
    ('SKU-005', v_3pl_la_id, 450, NOW())
  ON CONFLICT (sku, warehouse_id) DO UPDATE SET
    qty_on_hand = EXCLUDED.qty_on_hand,
    last_counted_at = NOW();
END $$;

-- ================================================================
-- SALES FORECASTS (Next 12 weeks)
-- ================================================================

INSERT INTO sales_forecasts (sku, channel_code, week_iso, week_start_date, week_end_date, forecast_qty)
SELECT
  sku,
  channel_code,
  TO_CHAR(week_start, 'IYYY-"W"IW') as week_iso,
  week_start::date as week_start_date,
  (week_start + INTERVAL '6 days')::date as week_end_date,
  FLOOR(RANDOM() * 150 + 50)::integer as forecast_qty
FROM
  (SELECT UNNEST(ARRAY['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004', 'SKU-005']) as sku) skus,
  (SELECT UNNEST(ARRAY['AMZ-US', 'SHOP-US']) as channel_code) channels,
  (SELECT generate_series(
    date_trunc('week', CURRENT_DATE),
    date_trunc('week', CURRENT_DATE) + INTERVAL '11 weeks',
    INTERVAL '1 week'
  ) as week_start) weeks
ON CONFLICT (sku, channel_code, week_iso) DO UPDATE SET
  forecast_qty = EXCLUDED.forecast_qty;

-- ================================================================
-- SALES ACTUALS (Past 4 weeks)
-- ================================================================

INSERT INTO sales_actuals (sku, channel_code, week_iso, week_start_date, week_end_date, actual_qty)
SELECT
  sku,
  channel_code,
  TO_CHAR(week_start, 'IYYY-"W"IW') as week_iso,
  week_start::date as week_start_date,
  (week_start + INTERVAL '6 days')::date as week_end_date,
  FLOOR(RANDOM() * 180 + 40)::integer as actual_qty
FROM
  (SELECT UNNEST(ARRAY['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004', 'SKU-005']) as sku) skus,
  (SELECT UNNEST(ARRAY['AMZ-US', 'SHOP-US']) as channel_code) channels,
  (SELECT generate_series(
    date_trunc('week', CURRENT_DATE) - INTERVAL '4 weeks',
    date_trunc('week', CURRENT_DATE) - INTERVAL '1 week',
    INTERVAL '1 week'
  ) as week_start) weeks
ON CONFLICT (sku, channel_code, week_iso) DO UPDATE SET
  actual_qty = EXCLUDED.actual_qty;

-- ================================================================
-- PURCHASE ORDERS
-- ================================================================

DO $$
DECLARE
  v_supplier1_id UUID;
  v_supplier2_id UUID;
  v_po1_id UUID;
  v_po2_id UUID;
BEGIN
  SELECT id INTO v_supplier1_id FROM suppliers WHERE supplier_code = 'SUP-001';
  SELECT id INTO v_supplier2_id FROM suppliers WHERE supplier_code = 'SUP-002';

  -- PO-1: Confirmed
  INSERT INTO purchase_orders (po_number, batch_code, supplier_id, po_status, planned_order_date, actual_order_date, planned_ship_date)
  VALUES ('PO-2025-001', 'BATCH-2025-Q1-01', v_supplier1_id, 'Confirmed',
          CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE + INTERVAL '7 days')
  RETURNING id INTO v_po1_id;

  INSERT INTO purchase_order_items (po_id, sku, channel_code, ordered_qty, delivered_qty, unit_price_usd)
  VALUES
    (v_po1_id, 'SKU-001', 'AMZ-US', 1000, 0, 25.00),
    (v_po1_id, 'SKU-002', 'AMZ-US', 800, 0, 25.00),
    (v_po1_id, 'SKU-003', 'SHOP-US', 500, 0, 35.00);

  -- PO-2: In Production
  INSERT INTO purchase_orders (po_number, batch_code, supplier_id, po_status, planned_order_date, actual_order_date, planned_ship_date)
  VALUES ('PO-2025-002', 'BATCH-2025-Q1-02', v_supplier2_id, 'In Production',
          CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE + INTERVAL '14 days')
  RETURNING id INTO v_po2_id;

  INSERT INTO purchase_order_items (po_id, sku, channel_code, ordered_qty, delivered_qty, unit_price_usd)
  VALUES
    (v_po2_id, 'SKU-004', 'AMZ-US', 600, 0, 45.00),
    (v_po2_id, 'SKU-005', 'SHOP-US', 700, 0, 30.00);
END $$;

-- ================================================================
-- SHIPMENTS
-- ================================================================

DO $$
DECLARE
  v_fba_ont8_id UUID;
  v_3pl_la_id UUID;
  v_shipment1_id UUID;
  v_shipment2_id UUID;
BEGIN
  SELECT id INTO v_fba_ont8_id FROM warehouses WHERE warehouse_code = 'FBA-ONT8';
  SELECT id INTO v_3pl_la_id FROM warehouses WHERE warehouse_code = '3PL-LA';

  -- Shipment 1: In Transit
  INSERT INTO shipments (
    tracking_number, batch_code, destination_warehouse_id,
    planned_departure_date, actual_departure_date,
    planned_arrival_date,
    weight_kg, cost_per_kg_usd, surcharge_usd, tax_refund_usd, payment_status
  ) VALUES (
    'TRK-2025-001', 'BATCH-2025-Q1-01', v_fba_ont8_id,
    CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '10 days',
    500.0, 2.5, 100.0, 50.0, 'Pending'
  ) RETURNING id INTO v_shipment1_id;

  INSERT INTO shipment_items (shipment_id, sku, shipped_qty)
  VALUES
    (v_shipment1_id, 'SKU-001', 300),
    (v_shipment1_id, 'SKU-002', 250);

  -- Shipment 2: Arrived
  INSERT INTO shipments (
    tracking_number, batch_code, destination_warehouse_id,
    planned_departure_date, actual_departure_date,
    planned_arrival_date, actual_arrival_date,
    weight_kg, cost_per_kg_usd, surcharge_usd, tax_refund_usd, payment_status
  ) VALUES (
    'TRK-2025-002', 'BATCH-2025-Q1-01', v_3pl_la_id,
    CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '10 days',
    CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE - INTERVAL '1 day',
    200.0, 8.0, 200.0, 80.0, 'Pending'
  ) RETURNING id INTO v_shipment2_id;

  INSERT INTO shipment_items (shipment_id, sku, shipped_qty)
  VALUES
    (v_shipment2_id, 'SKU-003', 200),
    (v_shipment2_id, 'SKU-004', 150);
END $$;

-- ================================================================
-- VERIFY DATA
-- ================================================================

SELECT 'Products' as table_name, COUNT(*) as count FROM products
UNION ALL SELECT 'Channels', COUNT(*) FROM channels
UNION ALL SELECT 'Warehouses', COUNT(*) FROM warehouses
UNION ALL SELECT 'Suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'Inventory Snapshots', COUNT(*) FROM inventory_snapshots
UNION ALL SELECT 'Sales Forecasts', COUNT(*) FROM sales_forecasts
UNION ALL SELECT 'Sales Actuals', COUNT(*) FROM sales_actuals
UNION ALL SELECT 'Purchase Orders', COUNT(*) FROM purchase_orders
UNION ALL SELECT 'PO Items', COUNT(*) FROM purchase_order_items
UNION ALL SELECT 'Shipments', COUNT(*) FROM shipments
UNION ALL SELECT 'Shipment Items', COUNT(*) FROM shipment_items;
