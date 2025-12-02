-- ================================================================
-- Migration: Row Level Security (RLS) Policies - SAFE VERSION
-- Purpose: Only adds policies to tables that exist
-- Uses DO blocks with exception handling to skip non-existent tables
-- ================================================================

-- ================================================================
-- MASTER DATA TABLES (These should definitely exist)
-- ================================================================

-- Table: products
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "products_select_policy" ON products;
    DROP POLICY IF EXISTS "products_insert_policy" ON products;
    DROP POLICY IF EXISTS "products_update_policy" ON products;
    DROP POLICY IF EXISTS "products_delete_policy" ON products;

    CREATE POLICY "products_select_policy" ON products FOR SELECT TO authenticated USING (true);
    CREATE POLICY "products_insert_policy" ON products FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "products_update_policy" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "products_delete_policy" ON products FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: products';
  END IF;
END $$;

-- Table: channels
ALTER TABLE IF EXISTS channels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channels' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "channels_select_policy" ON channels;
    DROP POLICY IF EXISTS "channels_insert_policy" ON channels;
    DROP POLICY IF EXISTS "channels_update_policy" ON channels;
    DROP POLICY IF EXISTS "channels_delete_policy" ON channels;

    CREATE POLICY "channels_select_policy" ON channels FOR SELECT TO authenticated USING (true);
    CREATE POLICY "channels_insert_policy" ON channels FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "channels_update_policy" ON channels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "channels_delete_policy" ON channels FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: channels';
  END IF;
END $$;

-- Table: warehouses
ALTER TABLE IF EXISTS warehouses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "warehouses_select_policy" ON warehouses;
    DROP POLICY IF EXISTS "warehouses_insert_policy" ON warehouses;
    DROP POLICY IF EXISTS "warehouses_update_policy" ON warehouses;
    DROP POLICY IF EXISTS "warehouses_delete_policy" ON warehouses;

    CREATE POLICY "warehouses_select_policy" ON warehouses FOR SELECT TO authenticated USING (true);
    CREATE POLICY "warehouses_insert_policy" ON warehouses FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "warehouses_update_policy" ON warehouses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "warehouses_delete_policy" ON warehouses FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: warehouses';
  END IF;
END $$;

-- Table: suppliers
ALTER TABLE IF EXISTS suppliers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "suppliers_select_policy" ON suppliers;
    DROP POLICY IF EXISTS "suppliers_insert_policy" ON suppliers;
    DROP POLICY IF EXISTS "suppliers_update_policy" ON suppliers;
    DROP POLICY IF EXISTS "suppliers_delete_policy" ON suppliers;

    CREATE POLICY "suppliers_select_policy" ON suppliers FOR SELECT TO authenticated USING (true);
    CREATE POLICY "suppliers_insert_policy" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "suppliers_update_policy" ON suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "suppliers_delete_policy" ON suppliers FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: suppliers';
  END IF;
END $$;

-- ================================================================
-- SALES PLANNING TABLES (weekly format)
-- ================================================================

-- Table: weekly_sales_forecasts
ALTER TABLE IF EXISTS weekly_sales_forecasts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_sales_forecasts' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "weekly_sales_forecasts_select_policy" ON weekly_sales_forecasts;
    DROP POLICY IF EXISTS "weekly_sales_forecasts_insert_policy" ON weekly_sales_forecasts;
    DROP POLICY IF EXISTS "weekly_sales_forecasts_update_policy" ON weekly_sales_forecasts;
    DROP POLICY IF EXISTS "weekly_sales_forecasts_delete_policy" ON weekly_sales_forecasts;

    CREATE POLICY "weekly_sales_forecasts_select_policy" ON weekly_sales_forecasts FOR SELECT TO authenticated USING (true);
    CREATE POLICY "weekly_sales_forecasts_insert_policy" ON weekly_sales_forecasts FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "weekly_sales_forecasts_update_policy" ON weekly_sales_forecasts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "weekly_sales_forecasts_delete_policy" ON weekly_sales_forecasts FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: weekly_sales_forecasts';
  END IF;
END $$;

-- Table: weekly_sales_actuals
ALTER TABLE IF EXISTS weekly_sales_actuals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_sales_actuals' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "weekly_sales_actuals_select_policy" ON weekly_sales_actuals;
    DROP POLICY IF EXISTS "weekly_sales_actuals_insert_policy" ON weekly_sales_actuals;
    DROP POLICY IF EXISTS "weekly_sales_actuals_update_policy" ON weekly_sales_actuals;
    DROP POLICY IF EXISTS "weekly_sales_actuals_delete_policy" ON weekly_sales_actuals;

    CREATE POLICY "weekly_sales_actuals_select_policy" ON weekly_sales_actuals FOR SELECT TO authenticated USING (true);
    CREATE POLICY "weekly_sales_actuals_insert_policy" ON weekly_sales_actuals FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "weekly_sales_actuals_update_policy" ON weekly_sales_actuals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "weekly_sales_actuals_delete_policy" ON weekly_sales_actuals FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: weekly_sales_actuals';
  END IF;
END $$;

-- ================================================================
-- INVENTORY TABLES
-- ================================================================

-- Table: inventory_snapshots
ALTER TABLE IF EXISTS inventory_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_snapshots' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "inventory_snapshots_select_policy" ON inventory_snapshots;
    DROP POLICY IF EXISTS "inventory_snapshots_insert_policy" ON inventory_snapshots;
    DROP POLICY IF EXISTS "inventory_snapshots_update_policy" ON inventory_snapshots;
    DROP POLICY IF EXISTS "inventory_snapshots_delete_policy" ON inventory_snapshots;

    CREATE POLICY "inventory_snapshots_select_policy" ON inventory_snapshots FOR SELECT TO authenticated USING (true);
    CREATE POLICY "inventory_snapshots_insert_policy" ON inventory_snapshots FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "inventory_snapshots_update_policy" ON inventory_snapshots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "inventory_snapshots_delete_policy" ON inventory_snapshots FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: inventory_snapshots';
  END IF;
END $$;

-- ================================================================
-- PROCUREMENT TABLES
-- ================================================================

-- Table: purchase_orders
ALTER TABLE IF EXISTS purchase_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "purchase_orders_select_policy" ON purchase_orders;
    DROP POLICY IF EXISTS "purchase_orders_insert_policy" ON purchase_orders;
    DROP POLICY IF EXISTS "purchase_orders_update_policy" ON purchase_orders;
    DROP POLICY IF EXISTS "purchase_orders_delete_policy" ON purchase_orders;

    CREATE POLICY "purchase_orders_select_policy" ON purchase_orders FOR SELECT TO authenticated USING (true);
    CREATE POLICY "purchase_orders_insert_policy" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "purchase_orders_update_policy" ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "purchase_orders_delete_policy" ON purchase_orders FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: purchase_orders';
  END IF;
END $$;

-- Table: purchase_order_items
ALTER TABLE IF EXISTS purchase_order_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "purchase_order_items_select_policy" ON purchase_order_items;
    DROP POLICY IF EXISTS "purchase_order_items_insert_policy" ON purchase_order_items;
    DROP POLICY IF EXISTS "purchase_order_items_update_policy" ON purchase_order_items;
    DROP POLICY IF EXISTS "purchase_order_items_delete_policy" ON purchase_order_items;

    CREATE POLICY "purchase_order_items_select_policy" ON purchase_order_items FOR SELECT TO authenticated USING (true);
    CREATE POLICY "purchase_order_items_insert_policy" ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "purchase_order_items_update_policy" ON purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "purchase_order_items_delete_policy" ON purchase_order_items FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: purchase_order_items';
  END IF;
END $$;

-- Table: production_deliveries
ALTER TABLE IF EXISTS production_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'production_deliveries' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "production_deliveries_select_policy" ON production_deliveries;
    DROP POLICY IF EXISTS "production_deliveries_insert_policy" ON production_deliveries;
    DROP POLICY IF EXISTS "production_deliveries_update_policy" ON production_deliveries;
    DROP POLICY IF EXISTS "production_deliveries_delete_policy" ON production_deliveries;

    CREATE POLICY "production_deliveries_select_policy" ON production_deliveries FOR SELECT TO authenticated USING (true);
    CREATE POLICY "production_deliveries_insert_policy" ON production_deliveries FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "production_deliveries_update_policy" ON production_deliveries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "production_deliveries_delete_policy" ON production_deliveries FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: production_deliveries';
  END IF;
END $$;

-- ================================================================
-- LOGISTICS TABLES
-- ================================================================

-- Table: shipments
ALTER TABLE IF EXISTS shipments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipments' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "shipments_select_policy" ON shipments;
    DROP POLICY IF EXISTS "shipments_insert_policy" ON shipments;
    DROP POLICY IF EXISTS "shipments_update_policy" ON shipments;
    DROP POLICY IF EXISTS "shipments_delete_policy" ON shipments;

    CREATE POLICY "shipments_select_policy" ON shipments FOR SELECT TO authenticated USING (true);
    CREATE POLICY "shipments_insert_policy" ON shipments FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "shipments_update_policy" ON shipments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "shipments_delete_policy" ON shipments FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: shipments';
  END IF;
END $$;

-- Table: shipment_items
ALTER TABLE IF EXISTS shipment_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipment_items' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "shipment_items_select_policy" ON shipment_items;
    DROP POLICY IF EXISTS "shipment_items_insert_policy" ON shipment_items;
    DROP POLICY IF EXISTS "shipment_items_update_policy" ON shipment_items;
    DROP POLICY IF EXISTS "shipment_items_delete_policy" ON shipment_items;

    CREATE POLICY "shipment_items_select_policy" ON shipment_items FOR SELECT TO authenticated USING (true);
    CREATE POLICY "shipment_items_insert_policy" ON shipment_items FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "shipment_items_update_policy" ON shipment_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "shipment_items_delete_policy" ON shipment_items FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: shipment_items';
  END IF;
END $$;

-- ================================================================
-- PROJECTION TABLES (may or may not exist)
-- ================================================================

-- Table: inventory_projections
ALTER TABLE IF EXISTS inventory_projections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_projections' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "inventory_projections_select_policy" ON inventory_projections;
    DROP POLICY IF EXISTS "inventory_projections_insert_policy" ON inventory_projections;
    DROP POLICY IF EXISTS "inventory_projections_update_policy" ON inventory_projections;
    DROP POLICY IF EXISTS "inventory_projections_delete_policy" ON inventory_projections;

    CREATE POLICY "inventory_projections_select_policy" ON inventory_projections FOR SELECT TO authenticated USING (true);
    CREATE POLICY "inventory_projections_insert_policy" ON inventory_projections FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "inventory_projections_update_policy" ON inventory_projections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "inventory_projections_delete_policy" ON inventory_projections FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: inventory_projections';
  END IF;
END $$;

-- Table: replenishment_suggestions
ALTER TABLE IF EXISTS replenishment_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'replenishment_suggestions' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "replenishment_suggestions_select_policy" ON replenishment_suggestions;
    DROP POLICY IF EXISTS "replenishment_suggestions_insert_policy" ON replenishment_suggestions;
    DROP POLICY IF EXISTS "replenishment_suggestions_update_policy" ON replenishment_suggestions;
    DROP POLICY IF EXISTS "replenishment_suggestions_delete_policy" ON replenishment_suggestions;

    CREATE POLICY "replenishment_suggestions_select_policy" ON replenishment_suggestions FOR SELECT TO authenticated USING (true);
    CREATE POLICY "replenishment_suggestions_insert_policy" ON replenishment_suggestions FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "replenishment_suggestions_update_policy" ON replenishment_suggestions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "replenishment_suggestions_delete_policy" ON replenishment_suggestions FOR DELETE TO authenticated USING (true);
    RAISE NOTICE 'RLS policies created for: replenishment_suggestions';
  END IF;
END $$;

-- ================================================================
-- SUMMARY
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '======================================';
  RAISE NOTICE 'RLS Migration Complete!';
  RAISE NOTICE 'Check NOTICE messages above for which tables were configured.';
  RAISE NOTICE '======================================';
END $$;
