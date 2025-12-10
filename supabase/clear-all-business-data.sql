-- =====================================================================
-- Clear All Business Data Script
-- SCM V2 升级前数据清理脚本
--
-- 目的: 清空所有业务数据，保留主数据(products, channels, warehouses, suppliers)
-- 日期: 2025-12-10
--
-- 注意: 此脚本将永久删除所有业务数据，请确保已备份!
-- =====================================================================

-- 禁用外键约束检查
SET session_replication_role = 'replica';

-- 清理关联表
TRUNCATE TABLE delivery_shipment_allocations CASCADE;
TRUNCATE TABLE forecast_order_allocations CASCADE;

-- 清理差异管理表
TRUNCATE TABLE supply_chain_variances CASCADE;
TRUNCATE TABLE forecast_variance_resolutions CASCADE;

-- 清理审计日志
TRUNCATE TABLE delivery_deletion_audit_log CASCADE;

-- 清理物流表
TRUNCATE TABLE shipment_items CASCADE;
TRUNCATE TABLE shipments CASCADE;

-- 清理采购表
TRUNCATE TABLE production_deliveries CASCADE;
TRUNCATE TABLE purchase_order_items CASCADE;
TRUNCATE TABLE purchase_orders CASCADE;

-- 清理库存表
TRUNCATE TABLE inventory_snapshots CASCADE;
TRUNCATE TABLE inventory_projections CASCADE;
TRUNCATE TABLE replenishment_suggestions CASCADE;

-- 清理销售表
TRUNCATE TABLE sales_actuals CASCADE;
TRUNCATE TABLE sales_forecasts CASCADE;

-- 恢复外键约束
SET session_replication_role = 'origin';

-- 验证结果
SELECT 'delivery_shipment_allocations' as table_name, COUNT(*) as row_count FROM delivery_shipment_allocations
UNION ALL SELECT 'forecast_order_allocations', COUNT(*) FROM forecast_order_allocations
UNION ALL SELECT 'shipments', COUNT(*) FROM shipments
UNION ALL SELECT 'production_deliveries', COUNT(*) FROM production_deliveries
UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
UNION ALL SELECT 'sales_forecasts', COUNT(*) FROM sales_forecasts
UNION ALL SELECT 'inventory_snapshots', COUNT(*) FROM inventory_snapshots
UNION ALL SELECT '--- MASTER DATA ---', 0
UNION ALL SELECT 'products (保留)', COUNT(*) FROM products
UNION ALL SELECT 'channels (保留)', COUNT(*) FROM channels
UNION ALL SELECT 'warehouses (保留)', COUNT(*) FROM warehouses
UNION ALL SELECT 'suppliers (保留)', COUNT(*) FROM suppliers;
