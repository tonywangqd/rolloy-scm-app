-- ================================================================
-- Migration: Comprehensive Row Level Security (RLS) Policies
-- Purpose: Enable RLS on all tables and add authentication-based policies
-- Architecture: Single-tenant with authenticated user access
-- Author: System Architect - Rolloy SCM
-- Date: 2025-12-02
-- ================================================================

-- ================================================================
-- DESIGN NOTES:
--
-- Current Implementation (Single-tenant):
-- - All authenticated users can access all data
-- - No organization_id or tenant_id segmentation yet
--
-- Future Enhancement (Multi-tenant):
-- - Add organization_id to master/transactional tables
-- - Replace auth.uid() policies with organization-based policies
-- - Add organization membership junction table
-- ================================================================

-- ================================================================
-- MASTER DATA TABLES
-- ================================================================

-- Table: products
-- Purpose: Product master data (SKU, cost, safety stock)
-- ================================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_policy"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "products_insert_policy"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "products_update_policy"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "products_delete_policy"
  ON products FOR DELETE
  TO authenticated
  USING (true);

-- Table: channels
-- Purpose: Sales channel master data (Amazon, eBay, etc.)
-- ================================================================
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels_select_policy"
  ON channels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "channels_insert_policy"
  ON channels FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "channels_update_policy"
  ON channels FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "channels_delete_policy"
  ON channels FOR DELETE
  TO authenticated
  USING (true);

-- Table: warehouses
-- Purpose: Warehouse master data (FBA, 3PL locations)
-- ================================================================
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouses_select_policy"
  ON warehouses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "warehouses_insert_policy"
  ON warehouses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "warehouses_update_policy"
  ON warehouses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "warehouses_delete_policy"
  ON warehouses FOR DELETE
  TO authenticated
  USING (true);

-- Table: suppliers
-- Purpose: Supplier master data (factories, vendors)
-- ================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select_policy"
  ON suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "suppliers_insert_policy"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "suppliers_update_policy"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "suppliers_delete_policy"
  ON suppliers FOR DELETE
  TO authenticated
  USING (true);

-- ================================================================
-- PLANNING DATA TABLES
-- ================================================================

-- Table: sales_forecasts
-- Purpose: Weekly sales forecasts by SKU and channel
-- ================================================================
ALTER TABLE sales_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_forecasts_select_policy"
  ON sales_forecasts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sales_forecasts_insert_policy"
  ON sales_forecasts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "sales_forecasts_update_policy"
  ON sales_forecasts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "sales_forecasts_delete_policy"
  ON sales_forecasts FOR DELETE
  TO authenticated
  USING (true);

-- Table: sales_actuals
-- Purpose: Actual weekly sales data by SKU and channel
-- ================================================================
ALTER TABLE sales_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_actuals_select_policy"
  ON sales_actuals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sales_actuals_insert_policy"
  ON sales_actuals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "sales_actuals_update_policy"
  ON sales_actuals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "sales_actuals_delete_policy"
  ON sales_actuals FOR DELETE
  TO authenticated
  USING (true);

-- Table: weekly_sales_forecasts
-- Purpose: Legacy weekly sales forecast format (YYYY-WW)
-- ================================================================
ALTER TABLE weekly_sales_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_sales_forecasts_select_policy"
  ON weekly_sales_forecasts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "weekly_sales_forecasts_insert_policy"
  ON weekly_sales_forecasts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "weekly_sales_forecasts_update_policy"
  ON weekly_sales_forecasts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "weekly_sales_forecasts_delete_policy"
  ON weekly_sales_forecasts FOR DELETE
  TO authenticated
  USING (true);

-- Table: weekly_sales_actuals
-- Purpose: Legacy weekly actual sales format (YYYY-WW)
-- ================================================================
ALTER TABLE weekly_sales_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_sales_actuals_select_policy"
  ON weekly_sales_actuals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "weekly_sales_actuals_insert_policy"
  ON weekly_sales_actuals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "weekly_sales_actuals_update_policy"
  ON weekly_sales_actuals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "weekly_sales_actuals_delete_policy"
  ON weekly_sales_actuals FOR DELETE
  TO authenticated
  USING (true);

-- ================================================================
-- INVENTORY DATA TABLES
-- ================================================================

-- Table: inventory_snapshots
-- Purpose: Current on-hand inventory by SKU and warehouse
-- ================================================================
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_snapshots_select_policy"
  ON inventory_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "inventory_snapshots_insert_policy"
  ON inventory_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_snapshots_update_policy"
  ON inventory_snapshots FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_snapshots_delete_policy"
  ON inventory_snapshots FOR DELETE
  TO authenticated
  USING (true);

-- Table: inventory_projections
-- Purpose: Computed weekly inventory projections (if table exists)
-- ================================================================
ALTER TABLE inventory_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_projections_select_policy"
  ON inventory_projections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "inventory_projections_insert_policy"
  ON inventory_projections FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_projections_update_policy"
  ON inventory_projections FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_projections_delete_policy"
  ON inventory_projections FOR DELETE
  TO authenticated
  USING (true);

-- Table: replenishment_suggestions
-- Purpose: Automated replenishment recommendations
-- ================================================================
ALTER TABLE replenishment_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replenishment_suggestions_select_policy"
  ON replenishment_suggestions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "replenishment_suggestions_insert_policy"
  ON replenishment_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "replenishment_suggestions_update_policy"
  ON replenishment_suggestions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "replenishment_suggestions_delete_policy"
  ON replenishment_suggestions FOR DELETE
  TO authenticated
  USING (true);

-- ================================================================
-- PROCUREMENT TRANSACTIONAL TABLES
-- ================================================================

-- Table: purchase_orders
-- Purpose: Purchase order header data
-- ================================================================
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select_policy"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "purchase_orders_insert_policy"
  ON purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "purchase_orders_update_policy"
  ON purchase_orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "purchase_orders_delete_policy"
  ON purchase_orders FOR DELETE
  TO authenticated
  USING (true);

-- Table: purchase_order_items
-- Purpose: Line items for purchase orders (SKU quantities)
-- ================================================================
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_order_items_select_policy"
  ON purchase_order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "purchase_order_items_insert_policy"
  ON purchase_order_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "purchase_order_items_update_policy"
  ON purchase_order_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "purchase_order_items_delete_policy"
  ON purchase_order_items FOR DELETE
  TO authenticated
  USING (true);

-- Table: production_deliveries
-- Purpose: Factory delivery records linked to PO items
-- ================================================================
ALTER TABLE production_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_deliveries_select_policy"
  ON production_deliveries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "production_deliveries_insert_policy"
  ON production_deliveries FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "production_deliveries_update_policy"
  ON production_deliveries FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "production_deliveries_delete_policy"
  ON production_deliveries FOR DELETE
  TO authenticated
  USING (true);

-- ================================================================
-- LOGISTICS TRANSACTIONAL TABLES
-- ================================================================

-- Table: shipments
-- Purpose: Shipment header data (tracking, costs, dates)
-- ================================================================
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipments_select_policy"
  ON shipments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "shipments_insert_policy"
  ON shipments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "shipments_update_policy"
  ON shipments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "shipments_delete_policy"
  ON shipments FOR DELETE
  TO authenticated
  USING (true);

-- Table: shipment_items
-- Purpose: SKU quantities within each shipment
-- ================================================================
ALTER TABLE shipment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipment_items_select_policy"
  ON shipment_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "shipment_items_insert_policy"
  ON shipment_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "shipment_items_update_policy"
  ON shipment_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "shipment_items_delete_policy"
  ON shipment_items FOR DELETE
  TO authenticated
  USING (true);

-- ================================================================
-- COMMENTS FOR DOCUMENTATION
-- ================================================================

COMMENT ON POLICY "products_select_policy" ON products IS
'Single-tenant: Allow all authenticated users to view products';

COMMENT ON POLICY "channels_select_policy" ON channels IS
'Single-tenant: Allow all authenticated users to view channels';

COMMENT ON POLICY "warehouses_select_policy" ON warehouses IS
'Single-tenant: Allow all authenticated users to view warehouses';

COMMENT ON POLICY "suppliers_select_policy" ON suppliers IS
'Single-tenant: Allow all authenticated users to view suppliers';

COMMENT ON POLICY "sales_forecasts_select_policy" ON sales_forecasts IS
'Single-tenant: Allow all authenticated users to view and manage sales forecasts';

COMMENT ON POLICY "sales_actuals_select_policy" ON sales_actuals IS
'Single-tenant: Allow all authenticated users to view and manage actual sales data';

COMMENT ON POLICY "inventory_snapshots_select_policy" ON inventory_snapshots IS
'Single-tenant: Allow all authenticated users to view and update inventory';

COMMENT ON POLICY "purchase_orders_select_policy" ON purchase_orders IS
'Single-tenant: Allow all authenticated users to view and manage purchase orders';

COMMENT ON POLICY "production_deliveries_select_policy" ON production_deliveries IS
'Single-tenant: Allow all authenticated users to view and manage production deliveries';

COMMENT ON POLICY "shipments_select_policy" ON shipments IS
'Single-tenant: Allow all authenticated users to view and manage shipments';

-- ================================================================
-- MIGRATION VERIFICATION QUERY
-- ================================================================

-- Run this query to verify all tables have RLS enabled:
--
-- SELECT
--   schemaname,
--   tablename,
--   rowsecurity AS rls_enabled
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'products', 'channels', 'warehouses', 'suppliers',
--     'sales_forecasts', 'sales_actuals',
--     'weekly_sales_forecasts', 'weekly_sales_actuals',
--     'inventory_snapshots', 'inventory_projections', 'replenishment_suggestions',
--     'purchase_orders', 'purchase_order_items', 'production_deliveries',
--     'shipments', 'shipment_items'
--   )
-- ORDER BY tablename;

-- ================================================================
-- FUTURE ENHANCEMENT: Multi-tenant Migration Path
-- ================================================================

-- When adding multi-tenant support, follow these steps:
--
-- 1. Add organization_id column to master tables:
--    ALTER TABLE products ADD COLUMN organization_id UUID REFERENCES organizations(id);
--    ALTER TABLE channels ADD COLUMN organization_id UUID REFERENCES organizations(id);
--    [repeat for all master tables]
--
-- 2. Create organization membership table:
--    CREATE TABLE organization_members (
--      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--      organization_id UUID REFERENCES organizations(id),
--      user_id UUID REFERENCES auth.users(id),
--      role TEXT NOT NULL DEFAULT 'member',
--      created_at TIMESTAMPTZ DEFAULT NOW()
--    );
--
-- 3. Create helper function to get user's organization:
--    CREATE OR REPLACE FUNCTION get_user_organization_id()
--    RETURNS UUID AS $$
--      SELECT organization_id
--      FROM organization_members
--      WHERE user_id = auth.uid()
--      LIMIT 1;
--    $$ LANGUAGE sql STABLE SECURITY DEFINER;
--
-- 4. Replace policies with organization-based filtering:
--    DROP POLICY "products_select_policy" ON products;
--    CREATE POLICY "products_select_policy"
--      ON products FOR SELECT
--      TO authenticated
--      USING (organization_id = get_user_organization_id());
--
-- ================================================================
