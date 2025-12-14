-- ================================================================
-- V3 Simulation Engine - Backfill Existing Data
-- Created: 2025-12-14
-- Purpose: Ensure existing products and warehouses have valid V3 references
-- ================================================================

-- ================================================================
-- 1. BACKFILL: Set all existing products to 'STANDARD' tier
-- (This handles any products that existed before the migration)
-- ================================================================

UPDATE products
SET sku_tier = 'STANDARD'
WHERE sku_tier IS NULL OR sku_tier = '';

-- Log count of updated products
DO $$
DECLARE
  product_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO product_count FROM products WHERE sku_tier = 'STANDARD';
  RAISE NOTICE 'Products with STANDARD tier: %', product_count;
END $$;

-- ================================================================
-- 2. BACKFILL: Link warehouses to default logistics route
-- (Link all US warehouses to CN-US-WEST-SEA as default)
-- ================================================================

-- First, get the route ID for CN-US-WEST-SEA
DO $$
DECLARE
  v_route_id UUID;
  v_updated_count INTEGER;
BEGIN
  -- Get the default sea freight route
  SELECT id INTO v_route_id
  FROM logistics_routes
  WHERE route_code = 'CN-US-WEST-SEA'
  LIMIT 1;

  IF v_route_id IS NOT NULL THEN
    -- Update all warehouses without a route
    UPDATE warehouses
    SET default_route_id = v_route_id
    WHERE default_route_id IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE NOTICE 'Warehouses linked to CN-US-WEST-SEA route: %', v_updated_count;
  ELSE
    RAISE NOTICE 'Warning: CN-US-WEST-SEA route not found. Warehouses not updated.';
  END IF;
END $$;

-- ================================================================
-- 3. VERIFICATION QUERIES
-- ================================================================

-- Check products tier distribution
SELECT
  sku_tier,
  COUNT(*) as product_count
FROM products
GROUP BY sku_tier
ORDER BY sku_tier;

-- Check warehouses route assignment
SELECT
  w.warehouse_code,
  w.warehouse_name,
  lr.route_code,
  lr.shipping_mode
FROM warehouses w
LEFT JOIN logistics_routes lr ON w.default_route_id = lr.id
ORDER BY w.warehouse_code;

-- ================================================================
-- 4. REFRESH MATERIALIZED VIEW
-- ================================================================

-- Refresh the simulation baseline view after backfill
SELECT refresh_simulation_baseline();

-- ================================================================
-- DONE: Backfill complete
-- ================================================================
