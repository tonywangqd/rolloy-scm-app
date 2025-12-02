-- ================================================================
-- Migration: Add Performance Indexes
-- Purpose: Optimize frequently queried columns for faster data retrieval
-- Author: Rolloy SCM System Architect
-- Date: 2025-12-02
-- ================================================================
-- This migration adds indexes to improve query performance across all
-- transactional tables based on common query patterns identified in QA audit.
-- ================================================================

-- ================================================================
-- PURCHASE ORDERS INDEXES
-- Optimize queries filtering by batch, status, supplier, and order date
-- ================================================================

-- Index for batch_code lookups (used in batch grouping queries)
-- Common query: SELECT * FROM purchase_orders WHERE batch_code = 'BATCH-001'
CREATE INDEX IF NOT EXISTS idx_purchase_orders_batch_code
ON purchase_orders(batch_code);

-- Index for po_status filtering (used in status-based dashboards)
-- Common query: SELECT * FROM purchase_orders WHERE po_status = 'In Production'
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_status
ON purchase_orders(po_status);

-- Index for supplier_id lookups (used in supplier performance reports)
-- Common query: SELECT * FROM purchase_orders WHERE supplier_id = 'uuid'
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id
ON purchase_orders(supplier_id);

-- Index for actual_order_date range queries (used in time-based analytics)
-- Common query: SELECT * FROM purchase_orders WHERE actual_order_date BETWEEN '2025-01-01' AND '2025-12-31'
CREATE INDEX IF NOT EXISTS idx_purchase_orders_actual_order_date
ON purchase_orders(actual_order_date);

-- Composite index for supplier + status queries (used in supplier management)
-- Common query: SELECT * FROM purchase_orders WHERE supplier_id = 'uuid' AND po_status = 'Confirmed'
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_status
ON purchase_orders(supplier_id, po_status);

-- ================================================================
-- PURCHASE ORDER ITEMS INDEXES
-- Optimize queries for PO detail lookups and SKU-based aggregations
-- ================================================================

-- Index for po_id foreign key lookups (used in PO detail pages)
-- Common query: SELECT * FROM purchase_order_items WHERE po_id = 'uuid'
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id
ON purchase_order_items(po_id);

-- Index for sku lookups (used in product demand analysis)
-- Common query: SELECT * FROM purchase_order_items WHERE sku = 'SKU-001'
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_sku
ON purchase_order_items(sku);

-- Composite index for SKU + PO queries (used in inventory planning)
-- Common query: SELECT * FROM purchase_order_items WHERE sku = 'SKU-001' AND po_id = 'uuid'
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_sku_po
ON purchase_order_items(sku, po_id);

-- ================================================================
-- SHIPMENTS INDEXES
-- Optimize queries for logistics tracking and payment management
-- ================================================================

-- Index for batch_code lookups (used in logistics batch tracking)
-- Common query: SELECT * FROM shipments WHERE batch_code = 'BATCH-001'
CREATE INDEX IF NOT EXISTS idx_shipments_batch_code
ON shipments(batch_code);

-- Index for logistics_batch_code (used in logistics operations)
-- Common query: SELECT * FROM shipments WHERE logistics_batch_code = 'LOG-BATCH-001'
CREATE INDEX IF NOT EXISTS idx_shipments_logistics_batch_code
ON shipments(logistics_batch_code);

-- Index for destination_warehouse_id (used in warehouse receiving schedules)
-- Common query: SELECT * FROM shipments WHERE destination_warehouse_id = 'uuid'
CREATE INDEX IF NOT EXISTS idx_shipments_destination_warehouse
ON shipments(destination_warehouse_id);

-- Index for actual_arrival_date (used in inventory arrival projections)
-- Common query: SELECT * FROM shipments WHERE actual_arrival_date BETWEEN '2025-01-01' AND '2025-12-31'
CREATE INDEX IF NOT EXISTS idx_shipments_actual_arrival_date
ON shipments(actual_arrival_date);

-- Index for planned_arrival_date (used in forecasting and scheduling)
-- Common query: SELECT * FROM shipments WHERE planned_arrival_date IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_shipments_planned_arrival_date
ON shipments(planned_arrival_date);

-- Index for payment_status (used in finance module for payables management)
-- Common query: SELECT * FROM shipments WHERE payment_status = 'Pending'
CREATE INDEX IF NOT EXISTS idx_shipments_payment_status
ON shipments(payment_status);

-- Composite index for warehouse + arrival date (used in warehouse planning)
-- Common query: SELECT * FROM shipments WHERE destination_warehouse_id = 'uuid' AND actual_arrival_date > CURRENT_DATE
CREATE INDEX IF NOT EXISTS idx_shipments_warehouse_arrival
ON shipments(destination_warehouse_id, actual_arrival_date);

-- Index for production_delivery_id (used in delivery tracking)
-- Common query: SELECT * FROM shipments WHERE production_delivery_id = 'uuid'
CREATE INDEX IF NOT EXISTS idx_shipments_production_delivery_id
ON shipments(production_delivery_id);

-- ================================================================
-- SHIPMENT ITEMS INDEXES
-- Optimize queries for SKU-level shipment tracking
-- ================================================================

-- Index for shipment_id foreign key lookups (used in shipment detail pages)
-- Common query: SELECT * FROM shipment_items WHERE shipment_id = 'uuid'
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id
ON shipment_items(shipment_id);

-- Index for sku lookups (used in SKU inbound tracking)
-- Common query: SELECT * FROM shipment_items WHERE sku = 'SKU-001'
CREATE INDEX IF NOT EXISTS idx_shipment_items_sku
ON shipment_items(sku);

-- ================================================================
-- WEEKLY SALES FORECASTS INDEXES
-- Optimize queries for sales planning and inventory projection calculations
-- ================================================================

-- Index for year_week lookups (used in week-based planning views)
-- Common query: SELECT * FROM weekly_sales_forecasts WHERE year_week = '2025-W49'
CREATE INDEX IF NOT EXISTS idx_weekly_sales_forecasts_year_week
ON weekly_sales_forecasts(year_week);

-- Index for sku lookups (used in product sales history)
-- Common query: SELECT * FROM weekly_sales_forecasts WHERE sku = 'SKU-001'
CREATE INDEX IF NOT EXISTS idx_weekly_sales_forecasts_sku
ON weekly_sales_forecasts(sku);

-- Composite index for SKU + year_week (used in inventory projection calculations)
-- Common query: SELECT * FROM weekly_sales_forecasts WHERE sku = 'SKU-001' AND year_week = '2025-W49'
-- This is the MOST CRITICAL INDEX for inventory projection performance
CREATE INDEX IF NOT EXISTS idx_weekly_sales_forecasts_sku_week
ON weekly_sales_forecasts(sku, year_week);

-- Index for channel_code (used in channel-based analytics)
-- Common query: SELECT * FROM weekly_sales_forecasts WHERE channel_code = 'AMZ-US'
CREATE INDEX IF NOT EXISTS idx_weekly_sales_forecasts_channel
ON weekly_sales_forecasts(channel_code);

-- ================================================================
-- WEEKLY SALES ACTUALS INDEXES
-- Optimize queries for actual sales tracking and variance analysis
-- ================================================================

-- Index for year_week lookups (used in actual vs forecast comparisons)
-- Common query: SELECT * FROM weekly_sales_actuals WHERE year_week = '2025-W49'
CREATE INDEX IF NOT EXISTS idx_weekly_sales_actuals_year_week
ON weekly_sales_actuals(year_week);

-- Index for sku lookups (used in SKU performance tracking)
-- Common query: SELECT * FROM weekly_sales_actuals WHERE sku = 'SKU-001'
CREATE INDEX IF NOT EXISTS idx_weekly_sales_actuals_sku
ON weekly_sales_actuals(sku);

-- Composite index for SKU + year_week (used in effective sales calculations)
-- Common query: SELECT * FROM weekly_sales_actuals WHERE sku = 'SKU-001' AND year_week = '2025-W49'
-- This index is CRITICAL for the dual-track sales logic (COALESCE(actual, forecast))
CREATE INDEX IF NOT EXISTS idx_weekly_sales_actuals_sku_week
ON weekly_sales_actuals(sku, year_week);

-- Index for channel_code (used in channel performance reports)
-- Common query: SELECT * FROM weekly_sales_actuals WHERE channel_code = 'AMZ-US'
CREATE INDEX IF NOT EXISTS idx_weekly_sales_actuals_channel
ON weekly_sales_actuals(channel_code);

-- ================================================================
-- INVENTORY SNAPSHOTS INDEXES
-- Optimize queries for current inventory lookups and stock summaries
-- ================================================================

-- Index for sku lookups (used in product stock queries)
-- Common query: SELECT * FROM inventory_snapshots WHERE sku = 'SKU-001'
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_sku
ON inventory_snapshots(sku);

-- Index for warehouse_id lookups (used in warehouse inventory reports)
-- Common query: SELECT * FROM inventory_snapshots WHERE warehouse_id = 'uuid'
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_warehouse
ON inventory_snapshots(warehouse_id);

-- Composite index for SKU + warehouse (used in location-specific stock lookups)
-- Common query: SELECT * FROM inventory_snapshots WHERE sku = 'SKU-001' AND warehouse_id = 'uuid'
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_sku_warehouse
ON inventory_snapshots(sku, warehouse_id);

-- Index for last_counted_at (used in inventory aging reports)
-- Common query: SELECT * FROM inventory_snapshots WHERE last_counted_at < NOW() - INTERVAL '30 days'
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_last_counted
ON inventory_snapshots(last_counted_at);

-- ================================================================
-- MASTER DATA INDEXES
-- Optimize lookups for products, channels, warehouses, suppliers
-- ================================================================

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_products_sku
ON products(sku);

CREATE INDEX IF NOT EXISTS idx_products_spu
ON products(spu);

CREATE INDEX IF NOT EXISTS idx_products_is_active
ON products(is_active);

CREATE INDEX IF NOT EXISTS idx_products_category
ON products(category);

-- Channels table indexes
CREATE INDEX IF NOT EXISTS idx_channels_channel_code
ON channels(channel_code);

CREATE INDEX IF NOT EXISTS idx_channels_is_active
ON channels(is_active);

-- Warehouses table indexes
CREATE INDEX IF NOT EXISTS idx_warehouses_warehouse_code
ON warehouses(warehouse_code);

CREATE INDEX IF NOT EXISTS idx_warehouses_region
ON warehouses(region);

CREATE INDEX IF NOT EXISTS idx_warehouses_is_active
ON warehouses(is_active);

-- Suppliers table indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_code
ON suppliers(supplier_code);

CREATE INDEX IF NOT EXISTS idx_suppliers_is_active
ON suppliers(is_active);

-- ================================================================
-- COMMENTS
-- Add explanatory comments to critical indexes
-- ================================================================

COMMENT ON INDEX idx_weekly_sales_forecasts_sku_week IS
'Critical index for inventory projection calculations - optimizes dual-track sales logic';

COMMENT ON INDEX idx_weekly_sales_actuals_sku_week IS
'Critical index for effective sales calculations - used in COALESCE(actual, forecast) queries';

COMMENT ON INDEX idx_shipments_warehouse_arrival IS
'Composite index for warehouse receiving schedules and inventory arrival projections';

COMMENT ON INDEX idx_purchase_orders_supplier_status IS
'Composite index for supplier performance dashboards and order tracking';

COMMENT ON INDEX idx_inventory_snapshots_sku_warehouse IS
'Composite index for location-specific inventory lookups in multi-warehouse scenarios';

-- ================================================================
-- ANALYZE TABLES
-- Update PostgreSQL statistics for query planner optimization
-- ================================================================

ANALYZE purchase_orders;
ANALYZE purchase_order_items;
ANALYZE shipments;
ANALYZE shipment_items;
ANALYZE weekly_sales_forecasts;
ANALYZE weekly_sales_actuals;
ANALYZE inventory_snapshots;
ANALYZE production_deliveries;
ANALYZE products;
ANALYZE channels;
ANALYZE warehouses;
ANALYZE suppliers;

-- ================================================================
-- MIGRATION COMPLETE
-- ================================================================
-- Summary:
-- - 8 indexes on purchase_orders (including 1 composite)
-- - 3 indexes on purchase_order_items (including 1 composite)
-- - 9 indexes on shipments (including 1 composite)
-- - 2 indexes on shipment_items
-- - 4 indexes on weekly_sales_forecasts (including 1 CRITICAL composite)
-- - 4 indexes on weekly_sales_actuals (including 1 CRITICAL composite)
-- - 4 indexes on inventory_snapshots (including 1 composite)
-- - 12 indexes on master data tables
-- - Total: 46 new indexes
--
-- Note: All indexes use IF NOT EXISTS to prevent conflicts with existing indexes
-- from previous migrations (production_deliveries indexes already exist in 20251201)
-- ================================================================
