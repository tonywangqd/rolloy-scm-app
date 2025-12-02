-- ================================================================
-- Migration: Row Level Security (RLS) Policies
-- Tables: 14 tables based on actual database schema
-- Date: 2025-12-02
-- ================================================================

-- ================================================================
-- MASTER DATA TABLES (4)
-- ================================================================

-- products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_select_policy" ON products;
DROP POLICY IF EXISTS "products_insert_policy" ON products;
DROP POLICY IF EXISTS "products_update_policy" ON products;
DROP POLICY IF EXISTS "products_delete_policy" ON products;
CREATE POLICY "products_select_policy" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert_policy" ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "products_update_policy" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "products_delete_policy" ON products FOR DELETE TO authenticated USING (true);

-- channels
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channels_select_policy" ON channels;
DROP POLICY IF EXISTS "channels_insert_policy" ON channels;
DROP POLICY IF EXISTS "channels_update_policy" ON channels;
DROP POLICY IF EXISTS "channels_delete_policy" ON channels;
CREATE POLICY "channels_select_policy" ON channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "channels_insert_policy" ON channels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "channels_update_policy" ON channels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "channels_delete_policy" ON channels FOR DELETE TO authenticated USING (true);

-- warehouses
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouses_select_policy" ON warehouses;
DROP POLICY IF EXISTS "warehouses_insert_policy" ON warehouses;
DROP POLICY IF EXISTS "warehouses_update_policy" ON warehouses;
DROP POLICY IF EXISTS "warehouses_delete_policy" ON warehouses;
CREATE POLICY "warehouses_select_policy" ON warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "warehouses_insert_policy" ON warehouses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "warehouses_update_policy" ON warehouses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "warehouses_delete_policy" ON warehouses FOR DELETE TO authenticated USING (true);

-- suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_select_policy" ON suppliers;
DROP POLICY IF EXISTS "suppliers_insert_policy" ON suppliers;
DROP POLICY IF EXISTS "suppliers_update_policy" ON suppliers;
DROP POLICY IF EXISTS "suppliers_delete_policy" ON suppliers;
CREATE POLICY "suppliers_select_policy" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_insert_policy" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "suppliers_update_policy" ON suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "suppliers_delete_policy" ON suppliers FOR DELETE TO authenticated USING (true);

-- ================================================================
-- SALES PLANNING TABLES (2)
-- ================================================================

-- sales_forecasts
ALTER TABLE sales_forecasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_forecasts_select_policy" ON sales_forecasts;
DROP POLICY IF EXISTS "sales_forecasts_insert_policy" ON sales_forecasts;
DROP POLICY IF EXISTS "sales_forecasts_update_policy" ON sales_forecasts;
DROP POLICY IF EXISTS "sales_forecasts_delete_policy" ON sales_forecasts;
CREATE POLICY "sales_forecasts_select_policy" ON sales_forecasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_forecasts_insert_policy" ON sales_forecasts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sales_forecasts_update_policy" ON sales_forecasts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_forecasts_delete_policy" ON sales_forecasts FOR DELETE TO authenticated USING (true);

-- sales_actuals
ALTER TABLE sales_actuals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_actuals_select_policy" ON sales_actuals;
DROP POLICY IF EXISTS "sales_actuals_insert_policy" ON sales_actuals;
DROP POLICY IF EXISTS "sales_actuals_update_policy" ON sales_actuals;
DROP POLICY IF EXISTS "sales_actuals_delete_policy" ON sales_actuals;
CREATE POLICY "sales_actuals_select_policy" ON sales_actuals FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_actuals_insert_policy" ON sales_actuals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sales_actuals_update_policy" ON sales_actuals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_actuals_delete_policy" ON sales_actuals FOR DELETE TO authenticated USING (true);

-- ================================================================
-- INVENTORY TABLES (3)
-- ================================================================

-- inventory_snapshots
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_snapshots_select_policy" ON inventory_snapshots;
DROP POLICY IF EXISTS "inventory_snapshots_insert_policy" ON inventory_snapshots;
DROP POLICY IF EXISTS "inventory_snapshots_update_policy" ON inventory_snapshots;
DROP POLICY IF EXISTS "inventory_snapshots_delete_policy" ON inventory_snapshots;
CREATE POLICY "inventory_snapshots_select_policy" ON inventory_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_snapshots_insert_policy" ON inventory_snapshots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inventory_snapshots_update_policy" ON inventory_snapshots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inventory_snapshots_delete_policy" ON inventory_snapshots FOR DELETE TO authenticated USING (true);

-- inventory_projections
ALTER TABLE inventory_projections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_projections_select_policy" ON inventory_projections;
DROP POLICY IF EXISTS "inventory_projections_insert_policy" ON inventory_projections;
DROP POLICY IF EXISTS "inventory_projections_update_policy" ON inventory_projections;
DROP POLICY IF EXISTS "inventory_projections_delete_policy" ON inventory_projections;
CREATE POLICY "inventory_projections_select_policy" ON inventory_projections FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_projections_insert_policy" ON inventory_projections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inventory_projections_update_policy" ON inventory_projections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inventory_projections_delete_policy" ON inventory_projections FOR DELETE TO authenticated USING (true);

-- replenishment_suggestions
ALTER TABLE replenishment_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "replenishment_suggestions_select_policy" ON replenishment_suggestions;
DROP POLICY IF EXISTS "replenishment_suggestions_insert_policy" ON replenishment_suggestions;
DROP POLICY IF EXISTS "replenishment_suggestions_update_policy" ON replenishment_suggestions;
DROP POLICY IF EXISTS "replenishment_suggestions_delete_policy" ON replenishment_suggestions;
CREATE POLICY "replenishment_suggestions_select_policy" ON replenishment_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "replenishment_suggestions_insert_policy" ON replenishment_suggestions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "replenishment_suggestions_update_policy" ON replenishment_suggestions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "replenishment_suggestions_delete_policy" ON replenishment_suggestions FOR DELETE TO authenticated USING (true);

-- ================================================================
-- PROCUREMENT TABLES (3)
-- ================================================================

-- purchase_orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_orders_select_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete_policy" ON purchase_orders;
CREATE POLICY "purchase_orders_select_policy" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_orders_insert_policy" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchase_orders_update_policy" ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "purchase_orders_delete_policy" ON purchase_orders FOR DELETE TO authenticated USING (true);

-- purchase_order_items
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_order_items_select_policy" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_insert_policy" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_update_policy" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_delete_policy" ON purchase_order_items;
CREATE POLICY "purchase_order_items_select_policy" ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_order_items_insert_policy" ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchase_order_items_update_policy" ON purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "purchase_order_items_delete_policy" ON purchase_order_items FOR DELETE TO authenticated USING (true);

-- production_deliveries
ALTER TABLE production_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "production_deliveries_select_policy" ON production_deliveries;
DROP POLICY IF EXISTS "production_deliveries_insert_policy" ON production_deliveries;
DROP POLICY IF EXISTS "production_deliveries_update_policy" ON production_deliveries;
DROP POLICY IF EXISTS "production_deliveries_delete_policy" ON production_deliveries;
CREATE POLICY "production_deliveries_select_policy" ON production_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "production_deliveries_insert_policy" ON production_deliveries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "production_deliveries_update_policy" ON production_deliveries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "production_deliveries_delete_policy" ON production_deliveries FOR DELETE TO authenticated USING (true);

-- ================================================================
-- LOGISTICS TABLES (2)
-- ================================================================

-- shipments
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipments_select_policy" ON shipments;
DROP POLICY IF EXISTS "shipments_insert_policy" ON shipments;
DROP POLICY IF EXISTS "shipments_update_policy" ON shipments;
DROP POLICY IF EXISTS "shipments_delete_policy" ON shipments;
CREATE POLICY "shipments_select_policy" ON shipments FOR SELECT TO authenticated USING (true);
CREATE POLICY "shipments_insert_policy" ON shipments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "shipments_update_policy" ON shipments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shipments_delete_policy" ON shipments FOR DELETE TO authenticated USING (true);

-- shipment_items
ALTER TABLE shipment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipment_items_select_policy" ON shipment_items;
DROP POLICY IF EXISTS "shipment_items_insert_policy" ON shipment_items;
DROP POLICY IF EXISTS "shipment_items_update_policy" ON shipment_items;
DROP POLICY IF EXISTS "shipment_items_delete_policy" ON shipment_items;
CREATE POLICY "shipment_items_select_policy" ON shipment_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "shipment_items_insert_policy" ON shipment_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "shipment_items_update_policy" ON shipment_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shipment_items_delete_policy" ON shipment_items FOR DELETE TO authenticated USING (true);

-- ================================================================
-- DONE: 14 tables, 56 policies created
-- ================================================================
