-- ================================================================
-- V3 Simulation Engine Migration
-- Created: 2025-12-14
-- Purpose: Add tables and functions for the simulation engine
-- ================================================================

-- ================================================================
-- 1. SKU TIERS TABLE
-- Purpose: Reference table for SKU classification with service levels
-- ================================================================

CREATE TABLE IF NOT EXISTS sku_tiers (
  -- Primary identifier (short code for joins)
  tier_code VARCHAR(20) PRIMARY KEY,

  -- Display information
  tier_name VARCHAR(50) NOT NULL,
  description TEXT,

  -- Service level configuration
  service_level_target NUMERIC(5,2) NOT NULL DEFAULT 95.00,  -- Percentage (e.g., 99.00)
  stockout_tolerance_days INTEGER NOT NULL DEFAULT 0,         -- Days of acceptable stockout

  -- Prioritization for capital constraints
  priority_weight INTEGER NOT NULL DEFAULT 50,                -- Higher = more important (0-100)

  -- Ordering for UI display
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_service_level CHECK (service_level_target BETWEEN 0 AND 100),
  CONSTRAINT valid_tolerance CHECK (stockout_tolerance_days >= 0),
  CONSTRAINT valid_priority CHECK (priority_weight BETWEEN 0 AND 100)
);

-- Insert default tiers
INSERT INTO sku_tiers (tier_code, tier_name, description, service_level_target, stockout_tolerance_days, priority_weight, display_order) VALUES
  ('HERO', 'Hero SKU', 'Top revenue drivers with zero stockout tolerance', 99.00, 0, 100, 1),
  ('STANDARD', 'Standard SKU', 'Regular products with standard service levels', 95.00, 7, 50, 2),
  ('ACCESSORY', 'Accessory SKU', 'Low-priority accessories with flexible service', 85.00, 14, 10, 3)
ON CONFLICT (tier_code) DO NOTHING;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_sku_tiers_active ON sku_tiers(is_active) WHERE is_active = true;

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_sku_tiers_updated_at ON sku_tiers;
CREATE TRIGGER update_sku_tiers_updated_at
  BEFORE UPDATE ON sku_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE sku_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sku_tiers_select" ON sku_tiers;
CREATE POLICY "sku_tiers_select" ON sku_tiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sku_tiers_insert" ON sku_tiers;
CREATE POLICY "sku_tiers_insert" ON sku_tiers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sku_tiers_update" ON sku_tiers;
CREATE POLICY "sku_tiers_update" ON sku_tiers FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "sku_tiers_delete" ON sku_tiers;
CREATE POLICY "sku_tiers_delete" ON sku_tiers FOR DELETE TO authenticated USING (false); -- Prevent deletion

COMMENT ON TABLE sku_tiers IS 'Reference table for SKU classification. Used by simulation engine for prioritization.';
COMMENT ON COLUMN sku_tiers.priority_weight IS 'Prioritization weight for capital-constrained scenarios. Higher = more important (0-100)';
COMMENT ON COLUMN sku_tiers.stockout_tolerance_days IS 'Acceptable days of stockout. 0 = never stock out (Hero SKUs)';

-- ================================================================
-- 2. MODIFY PRODUCTS TABLE - Add sku_tier FK
-- ================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku_tier VARCHAR(20) NOT NULL DEFAULT 'STANDARD'
    REFERENCES sku_tiers(tier_code) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index for filtering by tier
CREATE INDEX IF NOT EXISTS idx_products_sku_tier ON products(sku_tier);

COMMENT ON COLUMN products.sku_tier IS 'SKU classification tier: HERO (priority), STANDARD (normal), ACCESSORY (low priority)';

-- ================================================================
-- 3. CAPITAL CONSTRAINTS TABLE
-- Purpose: Define monthly/quarterly budget caps for procurement
-- ================================================================

CREATE TABLE IF NOT EXISTS capital_constraints (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Period definition
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('monthly', 'quarterly')),
  period_key VARCHAR(10) NOT NULL,  -- "2025-01" for monthly, "2025-Q1" for quarterly

  -- Budget configuration
  budget_cap_usd NUMERIC(14,2) NOT NULL CHECK (budget_cap_usd > 0),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Optional notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT unique_period UNIQUE (period_type, period_key),
  CONSTRAINT valid_period_key CHECK (
    (period_type = 'monthly' AND period_key ~ '^\d{4}-(0[1-9]|1[0-2])$') OR
    (period_type = 'quarterly' AND period_key ~ '^\d{4}-Q[1-4]$')
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_capital_constraints_period ON capital_constraints(period_type, period_key);
CREATE INDEX IF NOT EXISTS idx_capital_constraints_active ON capital_constraints(is_active) WHERE is_active = true;

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_capital_constraints_updated_at ON capital_constraints;
CREATE TRIGGER update_capital_constraints_updated_at
  BEFORE UPDATE ON capital_constraints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE capital_constraints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capital_constraints_select" ON capital_constraints;
CREATE POLICY "capital_constraints_select" ON capital_constraints FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "capital_constraints_insert" ON capital_constraints;
CREATE POLICY "capital_constraints_insert" ON capital_constraints FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "capital_constraints_update" ON capital_constraints;
CREATE POLICY "capital_constraints_update" ON capital_constraints FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "capital_constraints_delete" ON capital_constraints;
CREATE POLICY "capital_constraints_delete" ON capital_constraints FOR DELETE TO authenticated USING (true);

-- Example data
INSERT INTO capital_constraints (period_type, period_key, budget_cap_usd, notes) VALUES
  ('monthly', '2025-01', 80000.00, 'Q1 conservative budget'),
  ('monthly', '2025-02', 100000.00, 'Q1 moderate budget'),
  ('monthly', '2025-03', 120000.00, 'Q1 growth budget'),
  ('quarterly', '2025-Q1', 300000.00, 'Q1 total budget cap')
ON CONFLICT (period_type, period_key) DO NOTHING;

COMMENT ON TABLE capital_constraints IS 'Budget caps for procurement spending by period. Used by simulation engine for capital-constrained scenarios.';
COMMENT ON COLUMN capital_constraints.period_key IS 'Period identifier: YYYY-MM for monthly, YYYY-QN for quarterly';

-- ================================================================
-- 4. LOGISTICS ROUTES TABLE
-- Purpose: Define shipping routes with mode-specific transit times and costs
-- ================================================================

CREATE TABLE IF NOT EXISTS logistics_routes (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Route identification
  route_code VARCHAR(30) NOT NULL UNIQUE,  -- e.g., "CN-US-WEST-SEA"
  route_name VARCHAR(100) NOT NULL,

  -- Origin definition
  origin_country VARCHAR(3) NOT NULL,      -- ISO 3166-1 alpha-2 (e.g., "CN")
  origin_city VARCHAR(50),                  -- Optional city (e.g., "Shenzhen")

  -- Destination definition
  destination_region VARCHAR(30) NOT NULL,  -- e.g., "US-West", "US-East", "Europe"
  destination_country VARCHAR(3),           -- ISO 3166-1 alpha-2 (optional)

  -- Shipping mode
  shipping_mode VARCHAR(20) NOT NULL CHECK (shipping_mode IN ('Sea', 'Air', 'Express')),

  -- Transit configuration
  transit_time_weeks NUMERIC(4,1) NOT NULL CHECK (transit_time_weeks > 0),
  transit_time_days INTEGER GENERATED ALWAYS AS (CEIL(transit_time_weeks * 7)::INTEGER) STORED,

  -- Cost configuration
  cost_per_kg_usd NUMERIC(10,4) NOT NULL CHECK (cost_per_kg_usd > 0),
  minimum_charge_usd NUMERIC(10,2) DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,  -- Default route for destination

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Business constraints
  CONSTRAINT unique_route_mode UNIQUE (origin_country, destination_region, shipping_mode)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_routes_origin ON logistics_routes(origin_country);
CREATE INDEX IF NOT EXISTS idx_routes_destination ON logistics_routes(destination_region);
CREATE INDEX IF NOT EXISTS idx_routes_mode ON logistics_routes(shipping_mode);
CREATE INDEX IF NOT EXISTS idx_routes_active ON logistics_routes(is_active) WHERE is_active = true;

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_logistics_routes_updated_at ON logistics_routes;
CREATE TRIGGER update_logistics_routes_updated_at
  BEFORE UPDATE ON logistics_routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE logistics_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logistics_routes_select" ON logistics_routes;
CREATE POLICY "logistics_routes_select" ON logistics_routes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "logistics_routes_insert" ON logistics_routes;
CREATE POLICY "logistics_routes_insert" ON logistics_routes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "logistics_routes_update" ON logistics_routes;
CREATE POLICY "logistics_routes_update" ON logistics_routes FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "logistics_routes_delete" ON logistics_routes;
CREATE POLICY "logistics_routes_delete" ON logistics_routes FOR DELETE TO authenticated USING (true);

-- Example data
INSERT INTO logistics_routes (route_code, route_name, origin_country, destination_region, shipping_mode, transit_time_weeks, cost_per_kg_usd, is_default) VALUES
  ('CN-US-WEST-SEA', 'China to US West Coast (Sea)', 'CN', 'US-West', 'Sea', 4.0, 0.50, true),
  ('CN-US-EAST-SEA', 'China to US East Coast (Sea)', 'CN', 'US-East', 'Sea', 6.0, 0.55, true),
  ('CN-US-WEST-AIR', 'China to US West Coast (Air)', 'CN', 'US-West', 'Air', 1.0, 5.00, false),
  ('CN-US-EAST-AIR', 'China to US East Coast (Air)', 'CN', 'US-East', 'Air', 1.0, 5.50, false),
  ('CN-US-WEST-EXP', 'China to US West Coast (Express)', 'CN', 'US-West', 'Express', 0.5, 10.00, false),
  ('CN-US-EAST-EXP', 'China to US East Coast (Express)', 'CN', 'US-East', 'Express', 0.5, 11.00, false),
  ('CN-EU-SEA', 'China to Europe (Sea)', 'CN', 'Europe', 'Sea', 7.0, 0.60, true),
  ('CN-EU-AIR', 'China to Europe (Air)', 'CN', 'Europe', 'Air', 1.5, 6.00, false)
ON CONFLICT (route_code) DO NOTHING;

COMMENT ON TABLE logistics_routes IS 'Shipping route definitions with mode-specific transit times and costs. Used by simulation engine for logistics planning.';
COMMENT ON COLUMN logistics_routes.transit_time_weeks IS 'Transit time in weeks. Decimal supported (e.g., 0.5 for 3.5 days).';
COMMENT ON COLUMN logistics_routes.is_default IS 'Default route for this origin-destination pair. Only one per origin-destination.';

-- ================================================================
-- 5. MODIFY WAREHOUSES TABLE - Add default_route_id FK
-- ================================================================

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS default_route_id UUID REFERENCES logistics_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warehouses_default_route ON warehouses(default_route_id);

COMMENT ON COLUMN warehouses.default_route_id IS 'Default logistics route for this warehouse. Used in simulation calculations.';

-- ================================================================
-- 6. SIMULATION EXECUTIONS TABLE (Audit Trail)
-- Purpose: Audit trail for all simulation write-back actions
-- ================================================================

CREATE TABLE IF NOT EXISTS simulation_executions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scenario identification
  scenario_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash of parameters
  scenario_name VARCHAR(100),           -- Optional user-friendly name

  -- Full scenario parameters (JSONB for flexibility)
  scenario_params JSONB NOT NULL,

  -- Execution type
  execution_type VARCHAR(30) NOT NULL CHECK (
    execution_type IN ('CREATE_PO', 'UPDATE_SHIPMENT', 'DEFER_PO', 'BULK', 'ROLLBACK')
  ),

  -- Affected records (array of actions taken)
  affected_records JSONB NOT NULL DEFAULT '[]',
  /*
    Example structure:
    [
      {"table": "purchase_orders", "id": "uuid-001", "action": "CREATE", "data": {...}},
      {"table": "purchase_orders", "id": "uuid-002", "action": "UPDATE", "field": "planned_order_date", "old": "2025-01-15", "new": "2025-02-01"},
      {"table": "shipments", "id": "uuid-003", "action": "UPDATE", "field": "logistics_plan", "old": "Sea", "new": "Air"}
    ]
  */

  -- Summary statistics
  summary JSONB NOT NULL DEFAULT '{}',
  /*
    Example:
    {
      "pos_created": 2,
      "pos_deferred": 1,
      "shipments_updated": 1,
      "total_value_usd": 45000,
      "cash_impact_usd": -12500
    }
  */

  -- Execution metadata
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_duration_ms INTEGER,

  -- Rollback capability
  rollback_available BOOLEAN NOT NULL DEFAULT true,
  rollback_deadline TIMESTAMPTZ GENERATED ALWAYS AS (executed_at + INTERVAL '24 hours') STORED,
  rollback_executed_at TIMESTAMPTZ,
  rollback_executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rollback_reason TEXT,

  -- Reference to parent execution (for rollback records)
  parent_execution_id UUID REFERENCES simulation_executions(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (
    status IN ('completed', 'rolled_back', 'partial_rollback', 'failed')
  ),
  error_message TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sim_exec_hash ON simulation_executions(scenario_hash);
CREATE INDEX IF NOT EXISTS idx_sim_exec_date ON simulation_executions(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_exec_user ON simulation_executions(executed_by);
CREATE INDEX IF NOT EXISTS idx_sim_exec_type ON simulation_executions(execution_type);
CREATE INDEX IF NOT EXISTS idx_sim_exec_rollback ON simulation_executions(rollback_available, rollback_deadline)
  WHERE rollback_available = true;
CREATE INDEX IF NOT EXISTS idx_sim_exec_status ON simulation_executions(status);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_sim_exec_params ON simulation_executions USING GIN (scenario_params);
CREATE INDEX IF NOT EXISTS idx_sim_exec_affected ON simulation_executions USING GIN (affected_records);

-- RLS Policies
ALTER TABLE simulation_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "simulation_executions_select" ON simulation_executions;
CREATE POLICY "simulation_executions_select" ON simulation_executions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "simulation_executions_insert" ON simulation_executions;
CREATE POLICY "simulation_executions_insert" ON simulation_executions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "simulation_executions_update" ON simulation_executions;
CREATE POLICY "simulation_executions_update" ON simulation_executions FOR UPDATE TO authenticated USING (true);

-- No delete policy - audit records must be preserved
DROP POLICY IF EXISTS "simulation_executions_delete" ON simulation_executions;
CREATE POLICY "simulation_executions_delete" ON simulation_executions FOR DELETE TO authenticated USING (false);

COMMENT ON TABLE simulation_executions IS 'Audit trail for all simulation write-back actions. Supports rollback within 24 hours.';
COMMENT ON COLUMN simulation_executions.scenario_hash IS 'SHA-256 hash of scenario_params for caching and deduplication';
COMMENT ON COLUMN simulation_executions.affected_records IS 'JSONB array of all records created/updated with before/after values';
COMMENT ON COLUMN simulation_executions.rollback_deadline IS 'Auto-calculated: 24 hours after execution. Rollback disabled after this time.';

-- ================================================================
-- 7. MATERIALIZED VIEW: v_simulation_baseline
-- Purpose: Pre-aggregated baseline data for simulation
-- ================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS v_simulation_baseline AS
WITH
  current_inventory AS (
    SELECT
      sku,
      SUM(qty_on_hand) AS total_stock
    FROM inventory_snapshots
    GROUP BY sku
  ),

  weekly_forecasts AS (
    SELECT
      sku,
      week_iso,
      SUM(forecast_qty) AS forecast_qty
    FROM sales_forecasts
    WHERE is_closed = false
      AND week_iso >= to_char(CURRENT_DATE, 'IYYY-"W"IW')
      AND week_iso <= to_char(CURRENT_DATE + INTERVAL '52 weeks', 'IYYY-"W"IW')
    GROUP BY sku, week_iso
  ),

  pending_arrivals AS (
    SELECT
      si.sku,
      COALESCE(
        to_char(s.actual_arrival_date, 'IYYY-"W"IW'),
        to_char(s.planned_arrival_date, 'IYYY-"W"IW')
      ) AS arrival_week,
      SUM(si.shipped_qty) AS arrival_qty,
      s.logistics_plan AS shipping_mode
    FROM shipments s
    JOIN shipment_items si ON s.id = si.shipment_id
    WHERE s.actual_arrival_date IS NULL OR s.actual_arrival_date >= CURRENT_DATE
    GROUP BY si.sku, arrival_week, s.logistics_plan
  )

SELECT
  p.sku,
  p.product_name,
  p.sku_tier,
  p.unit_cost_usd,
  p.safety_stock_weeks,
  p.production_lead_weeks,
  st.priority_weight,
  st.stockout_tolerance_days,
  st.service_level_target,
  COALESCE(inv.total_stock, 0) AS current_stock,
  NOW() AS calculated_at
FROM products p
LEFT JOIN sku_tiers st ON p.sku_tier = st.tier_code
LEFT JOIN current_inventory inv ON p.sku = inv.sku
WHERE p.is_active = true;

-- Index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_baseline_sku ON v_simulation_baseline(sku);
CREATE INDEX IF NOT EXISTS idx_sim_baseline_tier ON v_simulation_baseline(sku_tier);

-- ================================================================
-- 8. FUNCTION: refresh_simulation_baseline()
-- Purpose: Refresh the materialized view
-- ================================================================

CREATE OR REPLACE FUNCTION refresh_simulation_baseline()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_simulation_baseline;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_simulation_baseline() IS 'Refreshes the v_simulation_baseline materialized view. Call this after significant data changes.';

-- ================================================================
-- 9. FUNCTION: get_simulation_baseline(p_skus, p_weeks)
-- Purpose: Batch fetch baseline data for simulation
-- ================================================================

CREATE OR REPLACE FUNCTION get_simulation_baseline(
  p_skus TEXT[] DEFAULT NULL,
  p_weeks TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'products', (
      SELECT COALESCE(jsonb_agg(row_to_json(p.*)), '[]'::jsonb)
      FROM v_simulation_baseline p
      WHERE (p_skus IS NULL OR p.sku = ANY(p_skus))
    ),
    'forecasts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sku', sf.sku,
        'week_iso', sf.week_iso,
        'qty', SUM(sf.forecast_qty)
      )), '[]'::jsonb)
      FROM sales_forecasts sf
      WHERE (p_skus IS NULL OR sf.sku = ANY(p_skus))
        AND (p_weeks IS NULL OR sf.week_iso = ANY(p_weeks))
        AND sf.is_closed = false
      GROUP BY sf.sku, sf.week_iso
    ),
    'actuals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sku', sa.sku,
        'week_iso', sa.week_iso,
        'qty', SUM(sa.actual_qty)
      )), '[]'::jsonb)
      FROM sales_actuals sa
      WHERE (p_skus IS NULL OR sa.sku = ANY(p_skus))
        AND (p_weeks IS NULL OR sa.week_iso = ANY(p_weeks))
      GROUP BY sa.sku, sa.week_iso
    ),
    'pending_shipments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'shipment_id', s.id,
        'tracking_number', s.tracking_number,
        'sku', si.sku,
        'shipped_qty', si.shipped_qty,
        'shipping_mode', s.logistics_plan,
        'planned_arrival_date', s.planned_arrival_date,
        'actual_arrival_date', s.actual_arrival_date,
        'arrival_week', COALESCE(
          to_char(s.actual_arrival_date, 'IYYY-"W"IW'),
          to_char(s.planned_arrival_date, 'IYYY-"W"IW')
        )
      )), '[]'::jsonb)
      FROM shipments s
      JOIN shipment_items si ON s.id = si.shipment_id
      WHERE (p_skus IS NULL OR si.sku = ANY(p_skus))
        AND (s.actual_arrival_date IS NULL OR s.actual_arrival_date >= CURRENT_DATE)
    ),
    'pending_po_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'po_item_id', poi.id,
        'po_id', po.id,
        'po_number', po.po_number,
        'sku', poi.sku,
        'ordered_qty', poi.ordered_qty,
        'delivered_qty', poi.delivered_qty,
        'pending_qty', poi.ordered_qty - poi.delivered_qty,
        'unit_price_usd', poi.unit_price_usd,
        'planned_order_date', po.planned_order_date,
        'planned_ship_date', po.planned_ship_date,
        'po_status', po.po_status
      )), '[]'::jsonb)
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.po_id = po.id
      WHERE (p_skus IS NULL OR poi.sku = ANY(p_skus))
        AND po.po_status NOT IN ('Delivered', 'Cancelled')
        AND poi.ordered_qty > poi.delivered_qty
    ),
    'capital_constraints', (
      SELECT COALESCE(jsonb_agg(row_to_json(cc.*)), '[]'::jsonb)
      FROM capital_constraints cc
      WHERE cc.is_active = true
    ),
    'sku_tiers', (
      SELECT COALESCE(jsonb_agg(row_to_json(st.*)), '[]'::jsonb)
      FROM sku_tiers st
      WHERE st.is_active = true
    ),
    'logistics_routes', (
      SELECT COALESCE(jsonb_agg(row_to_json(lr.*)), '[]'::jsonb)
      FROM logistics_routes lr
      WHERE lr.is_active = true
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_simulation_baseline(TEXT[], TEXT[]) IS 'Batch fetch baseline data for simulation. Returns products, forecasts, actuals, pending shipments, PO items, and constraints.';

-- ================================================================
-- 10. Grant execute permissions on functions
-- ================================================================

GRANT EXECUTE ON FUNCTION refresh_simulation_baseline() TO authenticated;
GRANT EXECUTE ON FUNCTION get_simulation_baseline(TEXT[], TEXT[]) TO authenticated;
