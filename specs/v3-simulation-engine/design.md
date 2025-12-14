# Rolloy SCM V3 - Simulation Engine
# System Design Document (SDD)

**Document Version:** 3.0.0
**Author:** System Architect
**Created Date:** 2025-12-14
**Status:** Ready for Implementation
**Priority Classification:** P0 (Core System Upgrade)
**Codename:** "Palantir" Upgrade

---

## 1. Overview & Architecture

### 1.1 System Architecture Diagram

```
+------------------------------------------------------------------+
|                     PRESENTATION LAYER                            |
|  +----------------------------------------------------------+    |
|  |  Simulation Playground (/planning/simulation)             |    |
|  |  +----------------+  +------------------------------+     |    |
|  |  | Control Panel  |  | Visualization Area           |     |    |
|  |  | - Sliders      |  | - Cash Flow Chart (Recharts) |     |    |
|  |  | - Dropdowns    |  | - Inventory Chart            |     |    |
|  |  | - Presets      |  | - Risk Heatmap               |     |    |
|  |  | - Filters      |  | - KPI Cards                  |     |    |
|  |  +----------------+  +------------------------------+     |    |
|  +----------------------------------------------------------+    |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                     APPLICATION LAYER                             |
|  +----------------------------------------------------------+    |
|  |  Server Actions (src/lib/actions/simulation.ts)           |    |
|  |  +----------------+  +----------------+  +--------------+ |    |
|  |  | runSimulation  |  | getBaseline    |  | executeScenario| |  |
|  |  | getScenario    |  | getConstraints |  | rollback     | |    |
|  |  +----------------+  +----------------+  +--------------+ |    |
|  +----------------------------------------------------------+    |
|                              |                                    |
|  +----------------------------------------------------------+    |
|  |  SimulatorService (src/lib/services/simulator.ts)         |    |
|  |  - STATELESS Pure Calculator                               |    |
|  |  - BaselineDataProvider                                    |    |
|  |  - ScenarioCalculator                                      |    |
|  |  - ConstraintEvaluator                                     |    |
|  |  - ExecutionPlanGenerator                                  |    |
|  +----------------------------------------------------------+    |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                     DATA LAYER (Supabase PostgreSQL)              |
|  +----------------------------------------------------------+    |
|  |  Core Tables           |  V3 New Tables                   |    |
|  |  - products           |  - sku_tiers (reference)         |    |
|  |  - purchase_orders    |  - capital_constraints           |    |
|  |  - shipments          |  - logistics_routes              |    |
|  |  - sales_forecasts    |  - simulation_executions         |    |
|  |  - inventory_snapshots|                                   |    |
|  +----------------------------------------------------------+    |
|                              |                                    |
|  +----------------------------------------------------------+    |
|  |  Materialized Views & Functions                           |    |
|  |  - v_simulation_baseline (12-week snapshot)               |    |
|  |  - calculate_scenario_projection()                        |    |
|  |  - apply_capital_prioritization()                         |    |
|  +----------------------------------------------------------+    |
+------------------------------------------------------------------+
```

### 1.2 Data Flow Overview

```
User Input (ScenarioParameters)
         |
         v
+-------------------+
| 1. Fetch Baseline |  <-- Cached (1 hour TTL)
|    Data           |
+-------------------+
         |
         v
+-------------------+
| 2. Apply Scenario |  <-- Pure Calculation (no DB writes)
|    Parameters     |
+-------------------+
         |
         v
+-------------------+
| 3. Evaluate       |  <-- Capital & SKU Tier Constraints
|    Constraints    |
+-------------------+
         |
         v
+-------------------+
| 4. Generate       |  <-- Recommendations & Actions
|    Results        |
+-------------------+
         |
         v
SimulationResult (Cached 5 min)
         |
         +-- User Reviews --+
                            |
                            v
                 +-------------------+
                 | 5. Execute Actions|  <-- Actual DB Writes
                 |    (if confirmed) |
                 +-------------------+
                            |
                            v
                 +-------------------+
                 | 6. Audit Trail    |  <-- simulation_executions
                 +-------------------+
```

### 1.3 Design Principles

1. **Stateless Simulation:** SimulatorService performs pure calculations without side effects
2. **Separation of Concerns:** Baseline fetching, calculation, and execution are distinct operations
3. **Constraint-First Design:** SKU Tiers and Capital Constraints are ontology entities
4. **Audit Everything:** All executed actions are logged with rollback capability
5. **Performance by Caching:** Baseline data cached aggressively; scenario results cached briefly

---

## 2. Database Schema

### 2.1 SKU Tier System

**Design Decision: Reference Table vs Enum**

After analysis, I recommend a **Reference Table** approach over an Enum type for the following reasons:

| Factor | Enum | Reference Table | Decision |
|--------|------|-----------------|----------|
| Flexibility | Hard to add/modify values | Easy to CRUD | Reference Table |
| Business Logic | Must embed in code | Stored in DB | Reference Table |
| Prioritization Weight | Cannot store | Can include as column | Reference Table |
| Audit Trail | No history | Can add timestamps | Reference Table |
| Performance | Slightly faster | Negligible with index | Reference Table |

**SQL DDL: sku_tiers Table**

```sql
-- ================================================================
-- Table: sku_tiers
-- Purpose: Reference table for SKU classification with service levels
-- Design: Separate table allows dynamic configuration without schema changes
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
```

**SQL DDL: Add sku_tier to products table**

```sql
-- ================================================================
-- Modification: products table
-- Add: sku_tier foreign key with default 'STANDARD'
-- ================================================================

-- Add column with default value
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku_tier VARCHAR(20) NOT NULL DEFAULT 'STANDARD'
    REFERENCES sku_tiers(tier_code) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index for filtering by tier
CREATE INDEX IF NOT EXISTS idx_products_sku_tier ON products(sku_tier);

COMMENT ON COLUMN products.sku_tier IS 'SKU classification tier: HERO (priority), STANDARD (normal), ACCESSORY (low priority)';
```

---

### 2.2 Capital Constraints Table

```sql
-- ================================================================
-- Table: capital_constraints
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
```

---

### 2.3 Logistics Routes Table

```sql
-- ================================================================
-- Table: logistics_routes
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
```

**SQL DDL: Link warehouses to routes**

```sql
-- ================================================================
-- Modification: warehouses table
-- Add: default_route_id for simulation calculations
-- ================================================================

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS default_route_id UUID REFERENCES logistics_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warehouses_default_route ON warehouses(default_route_id);

COMMENT ON COLUMN warehouses.default_route_id IS 'Default logistics route for this warehouse. Used in simulation calculations.';
```

---

### 2.4 Simulation Executions Table (Audit Trail)

```sql
-- ================================================================
-- Table: simulation_executions
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
```

---

### 2.5 Entity Relationship Diagram (ERD)

```
                                      +------------------+
                                      |    sku_tiers     |
                                      +------------------+
                                      | tier_code (PK)   |
                                      | tier_name        |
                                      | service_level    |
                                      | stockout_tolerance|
                                      | priority_weight  |
                                      +--------+---------+
                                               |
                                               | 1:N
                                               v
+------------------+    1:N    +------------------+    N:1    +------------------+
|    suppliers     |<----------|    products      |---------->|   warehouses     |
+------------------+           +------------------+           +------------------+
| id (PK)          |           | sku (PK)         |           | id (PK)          |
| supplier_code    |           | product_name     |           | warehouse_code   |
| supplier_name    |           | sku_tier (FK)    |           | warehouse_name   |
+------------------+           | unit_cost_usd    |           | default_route_id |
                               | safety_stock_weeks|          +--------+---------+
                               +--------+---------+                    |
                                        |                              | N:1
                                        |                              v
                               +--------+---------+           +------------------+
                               | purchase_orders  |           | logistics_routes |
                               +------------------+           +------------------+
                               | id (PK)          |           | id (PK)          |
                               | po_number        |           | route_code       |
                               | supplier_id (FK) |           | shipping_mode    |
                               | planned_order_date|          | transit_time_weeks|
                               +--------+---------+           | cost_per_kg_usd  |
                                        |                     +------------------+
                                        | 1:N
                                        v
                               +------------------+
                               | purchase_order_  |
                               |     items        |    +----------------------+
                               +------------------+    | capital_constraints  |
                               | id (PK)          |    +----------------------+
                               | po_id (FK)       |    | id (PK)              |
                               | sku (FK)         |    | period_type          |
                               | ordered_qty      |    | period_key           |
                               | unit_price_usd   |    | budget_cap_usd       |
                               +------------------+    +----------------------+

                               +----------------------+
                               | simulation_executions|
                               +----------------------+
                               | id (PK)              |
                               | scenario_hash        |
                               | scenario_params JSONB|
                               | execution_type       |
                               | affected_records JSONB|
                               | executed_by (FK)     |
                               | rollback_available   |
                               +----------------------+
```

---

## 3. TypeScript Interfaces

### 3.1 Core Simulation Types

```typescript
// File: src/lib/types/simulation.ts

// ================================================================
// ENUMS & CONSTANTS
// ================================================================

export type ShippingMode = 'Sea' | 'Air' | 'Express'
export type SkuTierCode = 'HERO' | 'STANDARD' | 'ACCESSORY'
export type CapitalPeriodType = 'monthly' | 'quarterly'
export type SimulationExecutionType = 'CREATE_PO' | 'UPDATE_SHIPMENT' | 'DEFER_PO' | 'BULK' | 'ROLLBACK'
export type SimulationStatus = 'completed' | 'rolled_back' | 'partial_rollback' | 'failed'
export type StockStatusType = 'OK' | 'Risk' | 'Stockout'
export type ActionRecommendation = 'INCLUDE' | 'DEFER' | 'URGENT_ORDER' | 'MODE_CHANGE'

export const SHIPPING_MODE_CONFIG = {
  Sea: { transit_weeks: 5, cost_multiplier: 1.0, display_name: 'Sea Freight (5 weeks)' },
  Air: { transit_weeks: 1, cost_multiplier: 10.0, display_name: 'Air Freight (1 week)' },
  Express: { transit_weeks: 0.5, cost_multiplier: 20.0, display_name: 'Express Air (3 days)' },
} as const

// ================================================================
// SCENARIO PARAMETERS (Input)
// ================================================================

/**
 * Complete input parameters for a simulation scenario
 */
export interface ScenarioParameters {
  // Demand modifiers
  sales_lift_percent: number          // Range: -50 to +100
  sku_scope: SkuTierCode[]            // Which tiers to include

  // Lead time modifiers
  production_lead_adjustment_weeks: number  // Range: -2 to +4
  shipping_mode_override: ShippingMode | null

  // Capital constraint settings
  capital_constraint_enabled: boolean
  capital_cap_usd: number | null
  capital_period: CapitalPeriodType

  // Filtering
  sku_filter: string[] | null         // Specific SKUs or null for all
  warehouse_filter: string[] | null   // Specific warehouses or null for all

  // Time horizon
  time_horizon_weeks: 12 | 26 | 52

  // Optional: specific POs/shipments to modify
  po_ids_to_simulate?: string[]
  shipment_ids_to_simulate?: string[]
}

/**
 * Default scenario parameters
 */
export const DEFAULT_SCENARIO_PARAMS: ScenarioParameters = {
  sales_lift_percent: 0,
  sku_scope: ['HERO', 'STANDARD', 'ACCESSORY'],
  production_lead_adjustment_weeks: 0,
  shipping_mode_override: null,
  capital_constraint_enabled: false,
  capital_cap_usd: null,
  capital_period: 'monthly',
  sku_filter: null,
  warehouse_filter: null,
  time_horizon_weeks: 12,
}

// ================================================================
// SIMULATION RESULT (Output)
// ================================================================

/**
 * Complete simulation result structure
 */
export interface SimulationResult {
  // Comparison projections
  baseline: WeeklyProjection[]
  scenario: WeeklyProjection[]

  // Delta analysis (scenario vs baseline totals)
  cash_impact_total: number           // Negative = more spending
  stockout_count_delta: number        // Positive = more stockouts in scenario
  days_of_stock_delta: number         // Negative = less runway

  // Risk assessment
  critical_stockouts: StockoutEvent[]
  acceptable_gaps: StockoutEvent[]

  // Recommendations
  recommended_actions: RecommendedAction[]

  // Capital constraint results (if enabled)
  capital_analysis: CapitalConstraintResult | null

  // Metadata
  calculated_at: string               // ISO timestamp
  parameters_hash: string             // For caching
  execution_time_ms: number
}

/**
 * Weekly projection for a single week
 */
export interface WeeklyProjection {
  week_iso: string                    // "2025-W01"
  week_start_date: string             // "2025-01-06"
  week_end_date: string               // "2025-01-12"

  // Aggregated inventory
  projections: SKUProjection[]

  // Cash flow
  cash_position: number               // Running cash balance
  cash_inflow: number                 // Revenue (simplified)
  cash_outflow_procurement: number    // PO payments due
  cash_outflow_logistics: number      // Shipment payments due
  cash_outflow_total: number

  // Summary stats
  total_stock: number
  total_safety_threshold: number
  stockout_sku_count: number
  risk_sku_count: number
}

/**
 * Per-SKU projection for a single week
 */
export interface SKUProjection {
  sku: string
  product_name: string
  sku_tier: SkuTierCode

  // Inventory calculation
  opening_stock: number
  arrival_qty: number                 // From shipments
  sales_qty: number                   // Effective sales (actual or forecast)
  closing_stock: number

  // Status
  stock_status: StockStatusType
  safety_threshold: number
  days_of_stock: number | null        // closing_stock / daily_sales

  // Traceability
  arriving_shipments: ShipmentReference[]
}

/**
 * Reference to an arriving shipment
 */
export interface ShipmentReference {
  shipment_id: string
  tracking_number: string
  arriving_qty: number
  shipping_mode: ShippingMode
}

// ================================================================
// CASH FLOW TYPES
// ================================================================

/**
 * Data point for cash flow chart
 */
export interface CashFlowDataPoint {
  week_iso: string
  baseline_cash: number
  scenario_cash: number
  baseline_outflow: number
  scenario_outflow: number
  baseline_inflow: number
  scenario_inflow: number
  capital_cap: number | null
}

// ================================================================
// STOCKOUT & RISK TYPES
// ================================================================

/**
 * Stockout event details
 */
export interface StockoutEvent {
  sku: string
  product_name: string
  sku_tier: SkuTierCode
  stockout_week: string
  duration_weeks: number
  severity: 'Critical' | 'Acceptable'
  within_tolerance: boolean
  projected_lost_sales: number
  recovery_week: string | null
}

// ================================================================
// CAPITAL CONSTRAINT TYPES
// ================================================================

/**
 * Result of capital constraint evaluation
 */
export interface CapitalConstraintResult {
  period: string                      // "2025-01" or "2025-Q1"
  period_type: CapitalPeriodType
  budget_cap: number
  planned_spend: number
  exceeds_cap: boolean
  excess_amount: number
  remaining_budget: number

  // Prioritization results
  included_pos: DeferralSuggestion[]
  deferred_pos: DeferralSuggestion[]
}

/**
 * PO deferral suggestion
 */
export interface DeferralSuggestion {
  po_id: string
  po_number: string
  sku: string
  product_name: string
  sku_tier: SkuTierCode
  priority_weight: number
  amount_usd: number
  planned_order_date: string
  stockout_impact: StockoutImpact
  recommended_action: ActionRecommendation
  defer_to_period: string | null
}

/**
 * Impact of deferring a PO
 */
export interface StockoutImpact {
  causes_stockout: boolean
  stockout_week: string | null
  stockout_duration_weeks: number
  within_tolerance: boolean
}

// ================================================================
// RECOMMENDED ACTIONS
// ================================================================

/**
 * Recommended action from simulation
 */
export interface RecommendedAction {
  action_id: string                   // UUID for tracking
  action_type: 'CREATE_PO' | 'UPDATE_SHIPMENT_MODE' | 'DEFER_PO' | 'EXPEDITE_PO'
  priority: 'Critical' | 'High' | 'Medium' | 'Low'

  // Action details
  description: string
  rationale: string

  // Target entity
  target_type: 'purchase_order' | 'shipment' | 'po_item'
  target_id: string | null            // null for CREATE actions

  // Action payload (varies by action_type)
  payload: CreatePOPayload | UpdateShipmentPayload | DeferPOPayload | null

  // Impact preview
  cash_impact: number
  stockout_prevention: boolean
  estimated_savings: number | null
}

export interface CreatePOPayload {
  sku: string
  suggested_qty: number
  unit_price_usd: number
  order_deadline: string
  expected_delivery_week: string
}

export interface UpdateShipmentPayload {
  shipment_id: string
  current_mode: ShippingMode
  new_mode: ShippingMode
  cost_delta: number
  time_saved_weeks: number
}

export interface DeferPOPayload {
  po_id: string
  current_order_date: string
  new_order_date: string
  defer_to_period: string
}

// ================================================================
// EXECUTION PLAN
// ================================================================

/**
 * Plan for executing simulation results
 */
export interface ExecutionPlan {
  scenario_hash: string
  actions_to_execute: RecommendedAction[]

  // Validation status
  all_valid: boolean
  validation_errors: ValidationError[]

  // Summary
  total_pos_to_create: number
  total_pos_to_defer: number
  total_shipments_to_update: number
  total_cash_impact: number

  // Confirmation token (prevents double-execution)
  confirmation_token: string
  token_expires_at: string
}

export interface ValidationError {
  action_id: string
  error_code: string
  error_message: string
}

// ================================================================
// AUDIT RECORD
// ================================================================

/**
 * Audit record for simulation execution
 */
export interface SimulationAuditRecord {
  id: string
  scenario_hash: string
  scenario_name: string | null
  scenario_params: ScenarioParameters
  execution_type: SimulationExecutionType
  affected_records: AffectedRecord[]
  summary: ExecutionSummary
  executed_by: string | null
  executed_at: string
  execution_duration_ms: number | null
  rollback_available: boolean
  rollback_deadline: string
  rollback_executed_at: string | null
  rollback_executed_by: string | null
  rollback_reason: string | null
  parent_execution_id: string | null
  status: SimulationStatus
  error_message: string | null
  created_at: string
}

export interface AffectedRecord {
  table: string
  id: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  field?: string
  old_value?: any
  new_value?: any
  data?: Record<string, any>
}

export interface ExecutionSummary {
  pos_created: number
  pos_deferred: number
  shipments_updated: number
  total_value_usd: number
  cash_impact_usd: number
}

// ================================================================
// REFERENCE DATA TYPES
// ================================================================

/**
 * SKU Tier configuration
 */
export interface SkuTier {
  tier_code: SkuTierCode
  tier_name: string
  description: string | null
  service_level_target: number
  stockout_tolerance_days: number
  priority_weight: number
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Capital constraint configuration
 */
export interface CapitalConstraint {
  id: string
  period_type: CapitalPeriodType
  period_key: string
  budget_cap_usd: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

/**
 * Logistics route configuration
 */
export interface LogisticsRoute {
  id: string
  route_code: string
  route_name: string
  origin_country: string
  origin_city: string | null
  destination_region: string
  destination_country: string | null
  shipping_mode: ShippingMode
  transit_time_weeks: number
  transit_time_days: number
  cost_per_kg_usd: number
  minimum_charge_usd: number
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

// ================================================================
// SCENARIO PRESETS
// ================================================================

export interface ScenarioPreset {
  id: string
  name: string
  description: string
  params: Partial<ScenarioParameters>
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Recession planning: -10% sales, +2w lead time',
    params: {
      sales_lift_percent: -10,
      production_lead_adjustment_weeks: 2,
    }
  },
  {
    id: 'aggressive',
    name: 'Aggressive Growth',
    description: 'Peak season prep: +30% sales, Air freight',
    params: {
      sales_lift_percent: 30,
      shipping_mode_override: 'Air',
    }
  },
  {
    id: 'cash_crunch',
    name: 'Cash Crunch',
    description: 'Liquidity crisis: $50K cap, defer Accessories',
    params: {
      capital_constraint_enabled: true,
      capital_cap_usd: 50000,
      sku_scope: ['HERO', 'STANDARD'],
    }
  },
  {
    id: 'supply_disruption',
    name: 'Supply Disruption',
    description: 'Factory delay: +4w production lead time',
    params: {
      production_lead_adjustment_weeks: 4,
    }
  },
  {
    id: 'peak_season',
    name: 'Peak Season',
    description: 'Black Friday: +50% sales (Hero only)',
    params: {
      sales_lift_percent: 50,
      sku_scope: ['HERO'],
    }
  },
]
```

---

## 4. Simulation Algorithm Specification

### 4.1 Overview

The simulation algorithm follows a **4-phase pipeline**:

```
Phase 1: Baseline Extraction
    |
    v
Phase 2: Parameter Application
    |
    v
Phase 3: Constraint Evaluation
    |
    v
Phase 4: Result Aggregation
```

### 4.2 Phase 1: Baseline Data Extraction

**Purpose:** Fetch current state data efficiently

```typescript
// File: src/lib/services/simulator/baseline.ts

interface BaselineData {
  // Current inventory state
  inventory: Map<string, number>  // SKU -> qty_on_hand

  // Sales data (next 12/26/52 weeks)
  forecasts: Map<string, Map<string, number>>  // SKU -> week_iso -> qty
  actuals: Map<string, Map<string, number>>    // SKU -> week_iso -> qty

  // Pipeline: pending POs and shipments
  pending_po_items: POItemPipeline[]
  pending_shipments: ShipmentPipeline[]

  // Reference data
  products: Map<string, ProductWithTier>
  routes: Map<string, LogisticsRoute>
  warehouses: Map<string, WarehouseWithRoute>

  // Constraints
  capital_constraints: Map<string, number>  // period_key -> cap
  sku_tiers: Map<SkuTierCode, SkuTier>
}

async function fetchBaseline(
  horizon_weeks: number
): Promise<BaselineData> {
  // Use parallel queries for efficiency
  const [
    inventory,
    forecasts,
    actuals,
    pendingPOs,
    pendingShipments,
    products,
    routes,
    warehouses,
    capitalConstraints,
    skuTiers
  ] = await Promise.all([
    fetchCurrentInventory(),
    fetchForecastsForHorizon(horizon_weeks),
    fetchActualsForHorizon(horizon_weeks),
    fetchPendingPOItems(),
    fetchPendingShipments(),
    fetchProductsWithTier(),
    fetchActiveRoutes(),
    fetchWarehousesWithRoutes(),
    fetchActiveCapitalConstraints(),
    fetchSkuTiers(),
  ])

  return {
    inventory,
    forecasts,
    actuals,
    pending_po_items: pendingPOs,
    pending_shipments: pendingShipments,
    products,
    routes,
    warehouses,
    capital_constraints: capitalConstraints,
    sku_tiers: skuTiers,
  }
}
```

### 4.3 Phase 2: Parameter Application

**Formulas:**

```typescript
// File: src/lib/services/simulator/calculator.ts

/**
 * Apply sales lift to forecast
 */
function calculateScenarioSales(
  baseline_forecast: number,
  sales_lift_percent: number
): number {
  return Math.round(baseline_forecast * (1 + sales_lift_percent / 100))
}

/**
 * Calculate scenario arrival week
 */
function calculateScenarioArrivalWeek(
  order_week: string,
  production_lead_weeks: number,
  lead_time_adjustment: number,
  base_shipping_weeks: number,
  mode_override: ShippingMode | null,
  route: LogisticsRoute
): string {
  // Determine effective transit time
  const effective_transit = mode_override
    ? SHIPPING_MODE_CONFIG[mode_override].transit_weeks
    : base_shipping_weeks

  // Total lead time calculation
  const total_lead_time =
    (production_lead_weeks + lead_time_adjustment) +  // Production
    1 +                                                // Loading buffer
    effective_transit +                                // Transit
    2                                                  // Inbound buffer

  return addWeeksToWeekISO(order_week, Math.ceil(total_lead_time))
}

/**
 * Calculate freight cost for shipping mode change
 */
function calculateFreightCost(
  weight_kg: number,
  current_mode: ShippingMode,
  new_mode: ShippingMode,
  route: LogisticsRoute
): { current_cost: number; new_cost: number; delta: number } {
  const base_rate = route.cost_per_kg_usd

  const current_cost = weight_kg * base_rate * SHIPPING_MODE_CONFIG[current_mode].cost_multiplier
  const new_cost = weight_kg * base_rate * SHIPPING_MODE_CONFIG[new_mode].cost_multiplier

  return {
    current_cost,
    new_cost,
    delta: new_cost - current_cost,
  }
}

/**
 * Project inventory for a single SKU across all weeks
 */
function projectSKUInventory(
  sku: string,
  starting_stock: number,
  weekly_arrivals: Map<string, number>,  // week_iso -> qty
  weekly_sales: Map<string, number>,      // week_iso -> qty (scenario-adjusted)
  safety_stock_weeks: number,
  weeks: string[]                          // Ordered list of week_iso
): SKUProjection[] {
  const projections: SKUProjection[] = []
  let running_stock = starting_stock

  for (const week_iso of weeks) {
    const arrival_qty = weekly_arrivals.get(week_iso) || 0
    const sales_qty = weekly_sales.get(week_iso) || 0
    const avg_weekly_sales = calculateAverageWeeklySales(weekly_sales)

    const opening_stock = running_stock
    const closing_stock = opening_stock + arrival_qty - sales_qty
    const safety_threshold = avg_weekly_sales * safety_stock_weeks

    // Determine stock status
    let stock_status: StockStatusType
    if (closing_stock < 0) {
      stock_status = 'Stockout'
    } else if (closing_stock < safety_threshold) {
      stock_status = 'Risk'
    } else {
      stock_status = 'OK'
    }

    const days_of_stock = avg_weekly_sales > 0
      ? Math.round((closing_stock / avg_weekly_sales) * 7)
      : null

    projections.push({
      sku,
      product_name: '', // Filled by caller
      sku_tier: 'STANDARD', // Filled by caller
      opening_stock,
      arrival_qty,
      sales_qty,
      closing_stock,
      stock_status,
      safety_threshold,
      days_of_stock,
      arriving_shipments: [],
    })

    running_stock = closing_stock
  }

  return projections
}
```

### 4.4 Phase 3: Constraint Evaluation

**Capital Prioritization Algorithm:**

```typescript
// File: src/lib/services/simulator/constraints.ts

interface POCandidate {
  po_id: string
  po_number: string
  sku: string
  sku_tier: SkuTierCode
  tier_weight: number
  amount_usd: number
  planned_order_date: string
  period_key: string
  stockout_date: string | null
}

/**
 * Prioritize POs within budget constraint
 * Algorithm: Sort by tier weight DESC, then stockout date ASC
 */
function prioritizePOsWithinBudget(
  candidates: POCandidate[],
  budget_cap: number
): CapitalConstraintResult {
  // Sort by priority: higher tier weight first, earlier stockout first
  const sorted = [...candidates].sort((a, b) => {
    if (a.tier_weight !== b.tier_weight) {
      return b.tier_weight - a.tier_weight  // Higher weight first
    }
    // If same tier, prioritize by stockout risk
    if (a.stockout_date && b.stockout_date) {
      return a.stockout_date.localeCompare(b.stockout_date)
    }
    if (a.stockout_date) return -1
    if (b.stockout_date) return 1
    return 0
  })

  let remaining_budget = budget_cap
  const included: DeferralSuggestion[] = []
  const deferred: DeferralSuggestion[] = []

  for (const po of sorted) {
    if (po.amount_usd <= remaining_budget) {
      included.push({
        po_id: po.po_id,
        po_number: po.po_number,
        sku: po.sku,
        product_name: '',
        sku_tier: po.sku_tier,
        priority_weight: po.tier_weight,
        amount_usd: po.amount_usd,
        planned_order_date: po.planned_order_date,
        stockout_impact: calculateStockoutImpact(po),
        recommended_action: 'INCLUDE',
        defer_to_period: null,
      })
      remaining_budget -= po.amount_usd
    } else {
      const next_period = getNextPeriod(po.period_key)
      deferred.push({
        po_id: po.po_id,
        po_number: po.po_number,
        sku: po.sku,
        product_name: '',
        sku_tier: po.sku_tier,
        priority_weight: po.tier_weight,
        amount_usd: po.amount_usd,
        planned_order_date: po.planned_order_date,
        stockout_impact: calculateStockoutImpact(po),
        recommended_action: 'DEFER',
        defer_to_period: next_period,
      })
    }
  }

  const total_planned = candidates.reduce((sum, po) => sum + po.amount_usd, 0)

  return {
    period: candidates[0]?.period_key || '',
    period_type: 'monthly',
    budget_cap,
    planned_spend: total_planned,
    exceeds_cap: total_planned > budget_cap,
    excess_amount: Math.max(0, total_planned - budget_cap),
    remaining_budget,
    included_pos: included,
    deferred_pos: deferred,
  }
}

/**
 * Evaluate stockout tolerance for a SKU tier
 */
function isStockoutWithinTolerance(
  stockout_duration_days: number,
  sku_tier: SkuTier
): boolean {
  return stockout_duration_days <= sku_tier.stockout_tolerance_days
}
```

### 4.5 Phase 4: Cash Flow Projection

```typescript
// File: src/lib/services/simulator/cashflow.ts

interface CashFlowInput {
  initial_cash: number
  weekly_projections: WeeklyProjection[]
  procurement_payment_terms_days: number  // Default: 60
  logistics_payment_terms_days: number    // Default: 30
}

/**
 * Calculate cash flow projection
 */
function calculateCashFlow(input: CashFlowInput): CashFlowDataPoint[] {
  let running_cash = input.initial_cash
  const results: CashFlowDataPoint[] = []

  for (const week of input.weekly_projections) {
    // Calculate outflows
    const procurement_outflow = calculateProcurementOutflow(
      week,
      input.procurement_payment_terms_days
    )
    const logistics_outflow = calculateLogisticsOutflow(
      week,
      input.logistics_payment_terms_days
    )

    // Simplified inflow (could be based on sales)
    const inflow = week.projections.reduce(
      (sum, p) => sum + p.sales_qty * getAverageSellingPrice(p.sku),
      0
    )

    running_cash = running_cash + inflow - procurement_outflow - logistics_outflow

    results.push({
      week_iso: week.week_iso,
      baseline_cash: 0, // Filled by comparison
      scenario_cash: running_cash,
      baseline_outflow: 0,
      scenario_outflow: procurement_outflow + logistics_outflow,
      baseline_inflow: 0,
      scenario_inflow: inflow,
      capital_cap: null,
    })
  }

  return results
}
```

---

## 5. Performance & Caching Strategy

### 5.1 Baseline Data Caching

**Strategy:** Cache baseline data aggressively since it changes infrequently

```typescript
// File: src/lib/services/simulator/cache.ts

interface CacheConfig {
  // Baseline data: changes only when underlying data changes
  baseline: {
    ttl_seconds: 3600,  // 1 hour
    key_prefix: 'sim:baseline:',
    invalidation_triggers: [
      'purchase_orders:*',
      'shipments:*',
      'sales_forecasts:*',
      'inventory_snapshots:*',
    ]
  },

  // Scenario results: short-lived
  scenario: {
    ttl_seconds: 300,   // 5 minutes
    key_prefix: 'sim:scenario:',
    invalidation_triggers: [] // Auto-expire only
  },

  // Reference data: long-lived
  reference: {
    ttl_seconds: 86400, // 24 hours
    key_prefix: 'sim:ref:',
    invalidation_triggers: [
      'sku_tiers:*',
      'capital_constraints:*',
      'logistics_routes:*',
    ]
  }
}

/**
 * Generate cache key for scenario
 */
function generateScenarioHash(params: ScenarioParameters): string {
  const normalized = {
    sales_lift: params.sales_lift_percent,
    mode: params.shipping_mode_override,
    lead_adj: params.production_lead_adjustment_weeks,
    cap: params.capital_constraint_enabled ? params.capital_cap_usd : null,
    cap_period: params.capital_period,
    skus: params.sku_filter?.sort().join(',') || 'ALL',
    tiers: params.sku_scope.sort().join(','),
    horizon: params.time_horizon_weeks,
  }

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .substring(0, 16)
}
```

### 5.2 Query Optimization

**Materialized View for Baseline**

```sql
-- ================================================================
-- Materialized View: v_simulation_baseline
-- Purpose: Pre-aggregated baseline data for simulation
-- Refresh: On-demand or scheduled (every 15 minutes)
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
  COALESCE(inv.total_stock, 0) AS current_stock,
  NOW() AS calculated_at
FROM products p
LEFT JOIN sku_tiers st ON p.sku_tier = st.tier_code
LEFT JOIN current_inventory inv ON p.sku = inv.sku
WHERE p.is_active = true;

-- Index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_baseline_sku ON v_simulation_baseline(sku);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_simulation_baseline()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_simulation_baseline;
END;
$$ LANGUAGE plpgsql;
```

### 5.3 Batch Fetching Pattern

```typescript
// File: src/lib/services/simulator/fetcher.ts

/**
 * Batch fetch pattern to minimize DB round trips
 */
async function fetchBaselineEfficiently(
  skus: string[],
  weeks: string[]
): Promise<BaselineData> {
  const supabase = await createServerSupabaseClient()

  // Single query with JSON aggregation
  const { data, error } = await supabase.rpc('get_simulation_baseline', {
    p_skus: skus.length > 0 ? skus : null,
    p_weeks: weeks,
  })

  if (error) throw error

  // Transform to Map structures for O(1) lookups
  return transformToBaselineData(data)
}

// SQL Function for batch baseline
/*
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
      SELECT jsonb_agg(row_to_json(p.*))
      FROM v_simulation_baseline p
      WHERE (p_skus IS NULL OR p.sku = ANY(p_skus))
    ),
    'forecasts', (
      SELECT jsonb_agg(jsonb_build_object(
        'sku', sf.sku,
        'week_iso', sf.week_iso,
        'qty', SUM(sf.forecast_qty)
      ))
      FROM sales_forecasts sf
      WHERE (p_skus IS NULL OR sf.sku = ANY(p_skus))
        AND (p_weeks IS NULL OR sf.week_iso = ANY(p_weeks))
        AND sf.is_closed = false
      GROUP BY sf.sku, sf.week_iso
    ),
    'pending_shipments', (
      SELECT jsonb_agg(row_to_json(s.*))
      FROM shipments s
      JOIN shipment_items si ON s.id = si.shipment_id
      WHERE (p_skus IS NULL OR si.sku = ANY(p_skus))
        AND (s.actual_arrival_date IS NULL OR s.actual_arrival_date >= CURRENT_DATE)
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
*/
```

---

## 6. API Contracts (Server Actions)

### 6.1 Run Simulation

```typescript
// File: src/lib/actions/simulation.ts

'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { simulationParamsSchema } from '@/lib/validations/simulation'
import type { ScenarioParameters, SimulationResult } from '@/lib/types/simulation'
import { SimulatorService } from '@/lib/services/simulator'

export interface RunSimulationResponse {
  success: boolean
  result: SimulationResult | null
  error: string | null
  cache_hit: boolean
  execution_time_ms: number
}

/**
 * Run a simulation with given parameters
 * Does NOT modify database - pure calculation
 */
export async function runSimulation(
  params: ScenarioParameters
): Promise<RunSimulationResponse> {
  const start = performance.now()

  try {
    // Validate parameters
    const validation = simulationParamsSchema.safeParse(params)
    if (!validation.success) {
      return {
        success: false,
        result: null,
        error: `Validation error: ${validation.error.issues.map(e => e.message).join(', ')}`,
        cache_hit: false,
        execution_time_ms: performance.now() - start,
      }
    }

    // Initialize service
    const simulator = new SimulatorService()

    // Check cache
    const cached = await simulator.getCachedResult(params)
    if (cached) {
      return {
        success: true,
        result: cached,
        error: null,
        cache_hit: true,
        execution_time_ms: performance.now() - start,
      }
    }

    // Run simulation
    const result = await simulator.runSimulation(params)

    // Cache result
    await simulator.cacheResult(params, result)

    return {
      success: true,
      result,
      error: null,
      cache_hit: false,
      execution_time_ms: performance.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      result: null,
      error: `Simulation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      cache_hit: false,
      execution_time_ms: performance.now() - start,
    }
  }
}
```

### 6.2 Get Execution Plan

```typescript
/**
 * Get execution plan for a simulation result
 * Validates all actions before execution
 */
export async function getExecutionPlan(
  scenario_hash: string,
  selected_action_ids: string[]
): Promise<{
  success: boolean
  plan: ExecutionPlan | null
  error: string | null
}> {
  try {
    const simulator = new SimulatorService()

    // Retrieve cached simulation result
    const result = await simulator.getCachedResultByHash(scenario_hash)
    if (!result) {
      return {
        success: false,
        plan: null,
        error: 'Simulation result not found or expired. Please run simulation again.',
      }
    }

    // Filter selected actions
    const selected_actions = result.recommended_actions.filter(
      a => selected_action_ids.includes(a.action_id)
    )

    if (selected_actions.length === 0) {
      return {
        success: false,
        plan: null,
        error: 'No actions selected for execution.',
      }
    }

    // Validate all actions
    const validation_errors = await simulator.validateActions(selected_actions)

    // Generate confirmation token
    const confirmation_token = crypto.randomUUID()
    const token_expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes

    // Store token (for preventing double-execution)
    await simulator.storeConfirmationToken(confirmation_token, {
      scenario_hash,
      action_ids: selected_action_ids,
      expires_at: token_expires_at,
    })

    const plan: ExecutionPlan = {
      scenario_hash,
      actions_to_execute: selected_actions,
      all_valid: validation_errors.length === 0,
      validation_errors,
      total_pos_to_create: selected_actions.filter(a => a.action_type === 'CREATE_PO').length,
      total_pos_to_defer: selected_actions.filter(a => a.action_type === 'DEFER_PO').length,
      total_shipments_to_update: selected_actions.filter(a => a.action_type === 'UPDATE_SHIPMENT_MODE').length,
      total_cash_impact: selected_actions.reduce((sum, a) => sum + a.cash_impact, 0),
      confirmation_token,
      token_expires_at,
    }

    return { success: true, plan, error: null }
  } catch (err) {
    return {
      success: false,
      plan: null,
      error: `Failed to generate execution plan: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
```

### 6.3 Execute Scenario

```typescript
export interface ExecuteScenarioRequest {
  scenario_hash: string
  confirmation_token: string
  selected_action_ids: string[]
}

export interface ExecuteScenarioResponse {
  success: boolean
  execution_id: string | null
  affected_records: AffectedRecord[]
  summary: ExecutionSummary | null
  error: string | null
}

/**
 * Execute selected actions from simulation
 * This is the WRITE operation - creates/updates actual records
 */
export async function executeScenario(
  request: ExecuteScenarioRequest
): Promise<ExecuteScenarioResponse> {
  const supabase = await createServerSupabaseClient()

  try {
    // Validate confirmation token
    const simulator = new SimulatorService()
    const tokenValid = await simulator.validateConfirmationToken(
      request.confirmation_token,
      request.scenario_hash,
      request.selected_action_ids
    )

    if (!tokenValid) {
      return {
        success: false,
        execution_id: null,
        affected_records: [],
        summary: null,
        error: 'Invalid or expired confirmation token. Please regenerate execution plan.',
      }
    }

    // Get cached result
    const result = await simulator.getCachedResultByHash(request.scenario_hash)
    if (!result) {
      return {
        success: false,
        execution_id: null,
        affected_records: [],
        summary: null,
        error: 'Simulation result expired. Please run simulation again.',
      }
    }

    // Filter selected actions
    const actions = result.recommended_actions.filter(
      a => request.selected_action_ids.includes(a.action_id)
    )

    // Execute in transaction
    const affected_records: AffectedRecord[] = []
    let pos_created = 0
    let pos_deferred = 0
    let shipments_updated = 0
    let total_value = 0
    let cash_impact = 0

    for (const action of actions) {
      const record = await executeAction(supabase, action)
      affected_records.push(record)

      switch (action.action_type) {
        case 'CREATE_PO':
          pos_created++
          total_value += (action.payload as CreatePOPayload)?.suggested_qty *
                        (action.payload as CreatePOPayload)?.unit_price_usd || 0
          break
        case 'DEFER_PO':
          pos_deferred++
          break
        case 'UPDATE_SHIPMENT_MODE':
          shipments_updated++
          cash_impact += (action.payload as UpdateShipmentPayload)?.cost_delta || 0
          break
      }
    }

    // Create audit record
    const execution_id = crypto.randomUUID()
    const { error: auditError } = await supabase
      .from('simulation_executions')
      .insert({
        id: execution_id,
        scenario_hash: request.scenario_hash,
        scenario_params: result.parameters_hash,
        execution_type: actions.length > 1 ? 'BULK' : actions[0]?.action_type || 'BULK',
        affected_records,
        summary: {
          pos_created,
          pos_deferred,
          shipments_updated,
          total_value_usd: total_value,
          cash_impact_usd: cash_impact,
        },
        status: 'completed',
      })

    if (auditError) {
      console.error('Failed to create audit record:', auditError)
      // Don't fail the operation, just log
    }

    // Invalidate cache
    await simulator.invalidateCache()

    return {
      success: true,
      execution_id,
      affected_records,
      summary: {
        pos_created,
        pos_deferred,
        shipments_updated,
        total_value_usd: total_value,
        cash_impact_usd: cash_impact,
      },
      error: null,
    }
  } catch (err) {
    return {
      success: false,
      execution_id: null,
      affected_records: [],
      summary: null,
      error: `Execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
```

### 6.4 Rollback Execution

```typescript
export interface RollbackRequest {
  execution_id: string
  reason: string
}

export interface RollbackResponse {
  success: boolean
  rolled_back_records: number
  error: string | null
}

/**
 * Rollback a previous execution
 * Only available within 24 hours
 */
export async function rollbackExecution(
  request: RollbackRequest
): Promise<RollbackResponse> {
  const supabase = await createServerSupabaseClient()

  try {
    // Fetch execution record
    const { data: execution, error: fetchError } = await supabase
      .from('simulation_executions')
      .select('*')
      .eq('id', request.execution_id)
      .single()

    if (fetchError || !execution) {
      return {
        success: false,
        rolled_back_records: 0,
        error: 'Execution record not found.',
      }
    }

    // Check rollback eligibility
    if (!execution.rollback_available) {
      return {
        success: false,
        rolled_back_records: 0,
        error: 'Rollback not available for this execution.',
      }
    }

    const deadline = new Date(execution.rollback_deadline)
    if (new Date() > deadline) {
      return {
        success: false,
        rolled_back_records: 0,
        error: 'Rollback deadline has passed (24 hours after execution).',
      }
    }

    // Execute rollback for each affected record
    let rolled_back = 0
    const affected = execution.affected_records as AffectedRecord[]

    for (const record of affected) {
      const success = await rollbackRecord(supabase, record)
      if (success) rolled_back++
    }

    // Update execution record
    await supabase
      .from('simulation_executions')
      .update({
        rollback_executed_at: new Date().toISOString(),
        rollback_reason: request.reason,
        status: rolled_back === affected.length ? 'rolled_back' : 'partial_rollback',
      })
      .eq('id', request.execution_id)

    return {
      success: true,
      rolled_back_records: rolled_back,
      error: null,
    }
  } catch (err) {
    return {
      success: false,
      rolled_back_records: 0,
      error: `Rollback failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
```

### 6.5 Constraint Management Actions

```typescript
/**
 * Get all SKU tiers
 */
export async function getSkuTiers(): Promise<{
  success: boolean
  tiers: SkuTier[]
  error: string | null
}> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('sku_tiers')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    return { success: false, tiers: [], error: error.message }
  }

  return { success: true, tiers: data, error: null }
}

/**
 * Update product SKU tier
 */
export async function updateProductTier(
  sku: string,
  tier_code: SkuTierCode
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('products')
    .update({ sku_tier: tier_code })
    .eq('sku', sku)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

/**
 * Get capital constraints
 */
export async function getCapitalConstraints(): Promise<{
  success: boolean
  constraints: CapitalConstraint[]
  error: string | null
}> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('capital_constraints')
    .select('*')
    .eq('is_active', true)
    .order('period_key', { ascending: true })

  if (error) {
    return { success: false, constraints: [], error: error.message }
  }

  return { success: true, constraints: data, error: null }
}

/**
 * Upsert capital constraint
 */
export async function upsertCapitalConstraint(
  constraint: Omit<CapitalConstraint, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; id: string | null; error: string | null }> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('capital_constraints')
    .upsert(
      {
        period_type: constraint.period_type,
        period_key: constraint.period_key,
        budget_cap_usd: constraint.budget_cap_usd,
        is_active: constraint.is_active,
        notes: constraint.notes,
      },
      { onConflict: 'period_type,period_key' }
    )
    .select('id')
    .single()

  if (error) {
    return { success: false, id: null, error: error.message }
  }

  return { success: true, id: data.id, error: null }
}

/**
 * Get logistics routes
 */
export async function getLogisticsRoutes(): Promise<{
  success: boolean
  routes: LogisticsRoute[]
  error: string | null
}> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('logistics_routes')
    .select('*')
    .eq('is_active', true)
    .order('destination_region', { ascending: true })
    .order('shipping_mode', { ascending: true })

  if (error) {
    return { success: false, routes: [], error: error.message }
  }

  return { success: true, routes: data, error: null }
}
```

---

## 7. Security & Validation

### 7.1 Input Validation Schema

```typescript
// File: src/lib/validations/simulation.ts

import { z } from 'zod'

export const skuTierCodeSchema = z.enum(['HERO', 'STANDARD', 'ACCESSORY'])
export const shippingModeSchema = z.enum(['Sea', 'Air', 'Express'])
export const capitalPeriodSchema = z.enum(['monthly', 'quarterly'])

export const simulationParamsSchema = z.object({
  // Demand modifiers
  sales_lift_percent: z.number()
    .min(-50, 'Sales lift cannot be less than -50%')
    .max(100, 'Sales lift cannot exceed +100%'),

  sku_scope: z.array(skuTierCodeSchema)
    .min(1, 'At least one SKU tier must be selected'),

  // Lead time modifiers
  production_lead_adjustment_weeks: z.number()
    .min(-2, 'Lead time adjustment cannot be less than -2 weeks')
    .max(4, 'Lead time adjustment cannot exceed +4 weeks'),

  shipping_mode_override: shippingModeSchema.nullable(),

  // Capital constraints
  capital_constraint_enabled: z.boolean(),
  capital_cap_usd: z.number()
    .min(0, 'Capital cap cannot be negative')
    .max(10000000, 'Capital cap cannot exceed $10M')
    .nullable(),

  capital_period: capitalPeriodSchema,

  // Filtering
  sku_filter: z.array(z.string()).nullable(),
  warehouse_filter: z.array(z.string()).nullable(),

  // Time horizon
  time_horizon_weeks: z.union([
    z.literal(12),
    z.literal(26),
    z.literal(52),
  ]),
}).refine(
  (data) => !data.capital_constraint_enabled || data.capital_cap_usd !== null,
  { message: 'Capital cap is required when constraint is enabled', path: ['capital_cap_usd'] }
)

export const executeScenarioRequestSchema = z.object({
  scenario_hash: z.string().min(1),
  confirmation_token: z.string().uuid(),
  selected_action_ids: z.array(z.string().uuid()).min(1),
})

export const rollbackRequestSchema = z.object({
  execution_id: z.string().uuid(),
  reason: z.string().min(10, 'Please provide a reason (at least 10 characters)'),
})
```

### 7.2 RLS Policy Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `sku_tiers` | All authenticated | All authenticated | All authenticated | Blocked |
| `capital_constraints` | All authenticated | All authenticated | All authenticated | All authenticated |
| `logistics_routes` | All authenticated | All authenticated | All authenticated | All authenticated |
| `simulation_executions` | All authenticated | All authenticated | All authenticated | Blocked |

### 7.3 Security Checklist

- [x] All inputs validated with Zod schemas
- [x] Server Actions use `'use server'` directive
- [x] RLS enabled on all new tables
- [x] Audit trail cannot be deleted
- [x] Confirmation tokens expire in 5 minutes
- [x] Rollback only allowed within 24 hours
- [x] No direct SQL in frontend code
- [x] UUID used for all IDs (no sequential)

---

## 8. Migration Plan

### 8.1 Migration File

```sql
-- ================================================================
-- Migration: V3 Simulation Engine
-- Version: 3.0.0
-- Date: 2025-12-14
-- Author: System Architect
-- ================================================================

-- This migration should be run AFTER all existing V2 migrations

BEGIN;

-- ================================================================
-- PART 1: SKU Tiers Reference Table
-- ================================================================

CREATE TABLE IF NOT EXISTS sku_tiers (
  tier_code VARCHAR(20) PRIMARY KEY,
  tier_name VARCHAR(50) NOT NULL,
  description TEXT,
  service_level_target NUMERIC(5,2) NOT NULL DEFAULT 95.00,
  stockout_tolerance_days INTEGER NOT NULL DEFAULT 0,
  priority_weight INTEGER NOT NULL DEFAULT 50,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_service_level CHECK (service_level_target BETWEEN 0 AND 100),
  CONSTRAINT valid_tolerance CHECK (stockout_tolerance_days >= 0),
  CONSTRAINT valid_priority CHECK (priority_weight BETWEEN 0 AND 100)
);

INSERT INTO sku_tiers (tier_code, tier_name, description, service_level_target, stockout_tolerance_days, priority_weight, display_order) VALUES
  ('HERO', 'Hero SKU', 'Top revenue drivers with zero stockout tolerance', 99.00, 0, 100, 1),
  ('STANDARD', 'Standard SKU', 'Regular products with standard service levels', 95.00, 7, 50, 2),
  ('ACCESSORY', 'Accessory SKU', 'Low-priority accessories with flexible service', 85.00, 14, 10, 3)
ON CONFLICT (tier_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_sku_tiers_active ON sku_tiers(is_active) WHERE is_active = true;

ALTER TABLE sku_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sku_tiers_select" ON sku_tiers;
CREATE POLICY "sku_tiers_select" ON sku_tiers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sku_tiers_insert" ON sku_tiers;
CREATE POLICY "sku_tiers_insert" ON sku_tiers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sku_tiers_update" ON sku_tiers;
CREATE POLICY "sku_tiers_update" ON sku_tiers FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "sku_tiers_delete" ON sku_tiers;
CREATE POLICY "sku_tiers_delete" ON sku_tiers FOR DELETE TO authenticated USING (false);

-- Add sku_tier to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku_tier VARCHAR(20) NOT NULL DEFAULT 'STANDARD'
    REFERENCES sku_tiers(tier_code) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_products_sku_tier ON products(sku_tier);

-- ================================================================
-- PART 2: Capital Constraints Table
-- ================================================================

CREATE TABLE IF NOT EXISTS capital_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('monthly', 'quarterly')),
  period_key VARCHAR(10) NOT NULL,
  budget_cap_usd NUMERIC(14,2) NOT NULL CHECK (budget_cap_usd > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT unique_period UNIQUE (period_type, period_key),
  CONSTRAINT valid_period_key CHECK (
    (period_type = 'monthly' AND period_key ~ '^\d{4}-(0[1-9]|1[0-2])$') OR
    (period_type = 'quarterly' AND period_key ~ '^\d{4}-Q[1-4]$')
  )
);

CREATE INDEX IF NOT EXISTS idx_capital_constraints_period ON capital_constraints(period_type, period_key);
CREATE INDEX IF NOT EXISTS idx_capital_constraints_active ON capital_constraints(is_active) WHERE is_active = true;

ALTER TABLE capital_constraints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "capital_constraints_select" ON capital_constraints;
CREATE POLICY "capital_constraints_select" ON capital_constraints FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "capital_constraints_insert" ON capital_constraints;
CREATE POLICY "capital_constraints_insert" ON capital_constraints FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "capital_constraints_update" ON capital_constraints;
CREATE POLICY "capital_constraints_update" ON capital_constraints FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "capital_constraints_delete" ON capital_constraints;
CREATE POLICY "capital_constraints_delete" ON capital_constraints FOR DELETE TO authenticated USING (true);

-- ================================================================
-- PART 3: Logistics Routes Table
-- ================================================================

CREATE TABLE IF NOT EXISTS logistics_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code VARCHAR(30) NOT NULL UNIQUE,
  route_name VARCHAR(100) NOT NULL,
  origin_country VARCHAR(3) NOT NULL,
  origin_city VARCHAR(50),
  destination_region VARCHAR(30) NOT NULL,
  destination_country VARCHAR(3),
  shipping_mode VARCHAR(20) NOT NULL CHECK (shipping_mode IN ('Sea', 'Air', 'Express')),
  transit_time_weeks NUMERIC(4,1) NOT NULL CHECK (transit_time_weeks > 0),
  transit_time_days INTEGER GENERATED ALWAYS AS (CEIL(transit_time_weeks * 7)::INTEGER) STORED,
  cost_per_kg_usd NUMERIC(10,4) NOT NULL CHECK (cost_per_kg_usd > 0),
  minimum_charge_usd NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_route_mode UNIQUE (origin_country, destination_region, shipping_mode)
);

CREATE INDEX IF NOT EXISTS idx_routes_origin ON logistics_routes(origin_country);
CREATE INDEX IF NOT EXISTS idx_routes_destination ON logistics_routes(destination_region);
CREATE INDEX IF NOT EXISTS idx_routes_mode ON logistics_routes(shipping_mode);
CREATE INDEX IF NOT EXISTS idx_routes_active ON logistics_routes(is_active) WHERE is_active = true;

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

ALTER TABLE logistics_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "logistics_routes_select" ON logistics_routes;
CREATE POLICY "logistics_routes_select" ON logistics_routes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "logistics_routes_insert" ON logistics_routes;
CREATE POLICY "logistics_routes_insert" ON logistics_routes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "logistics_routes_update" ON logistics_routes;
CREATE POLICY "logistics_routes_update" ON logistics_routes FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "logistics_routes_delete" ON logistics_routes;
CREATE POLICY "logistics_routes_delete" ON logistics_routes FOR DELETE TO authenticated USING (true);

-- Add default_route_id to warehouses
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS default_route_id UUID REFERENCES logistics_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warehouses_default_route ON warehouses(default_route_id);

-- ================================================================
-- PART 4: Simulation Executions Table (Audit Trail)
-- ================================================================

CREATE TABLE IF NOT EXISTS simulation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_hash VARCHAR(64) NOT NULL,
  scenario_name VARCHAR(100),
  scenario_params JSONB NOT NULL,
  execution_type VARCHAR(30) NOT NULL CHECK (
    execution_type IN ('CREATE_PO', 'UPDATE_SHIPMENT', 'DEFER_PO', 'BULK', 'ROLLBACK')
  ),
  affected_records JSONB NOT NULL DEFAULT '[]',
  summary JSONB NOT NULL DEFAULT '{}',
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_duration_ms INTEGER,
  rollback_available BOOLEAN NOT NULL DEFAULT true,
  rollback_deadline TIMESTAMPTZ GENERATED ALWAYS AS (executed_at + INTERVAL '24 hours') STORED,
  rollback_executed_at TIMESTAMPTZ,
  rollback_executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rollback_reason TEXT,
  parent_execution_id UUID REFERENCES simulation_executions(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (
    status IN ('completed', 'rolled_back', 'partial_rollback', 'failed')
  ),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sim_exec_hash ON simulation_executions(scenario_hash);
CREATE INDEX IF NOT EXISTS idx_sim_exec_date ON simulation_executions(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_exec_user ON simulation_executions(executed_by);
CREATE INDEX IF NOT EXISTS idx_sim_exec_type ON simulation_executions(execution_type);
CREATE INDEX IF NOT EXISTS idx_sim_exec_rollback ON simulation_executions(rollback_available, rollback_deadline)
  WHERE rollback_available = true;
CREATE INDEX IF NOT EXISTS idx_sim_exec_status ON simulation_executions(status);
CREATE INDEX IF NOT EXISTS idx_sim_exec_params ON simulation_executions USING GIN (scenario_params);
CREATE INDEX IF NOT EXISTS idx_sim_exec_affected ON simulation_executions USING GIN (affected_records);

ALTER TABLE simulation_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "simulation_executions_select" ON simulation_executions;
CREATE POLICY "simulation_executions_select" ON simulation_executions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "simulation_executions_insert" ON simulation_executions;
CREATE POLICY "simulation_executions_insert" ON simulation_executions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "simulation_executions_update" ON simulation_executions;
CREATE POLICY "simulation_executions_update" ON simulation_executions FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "simulation_executions_delete" ON simulation_executions;
CREATE POLICY "simulation_executions_delete" ON simulation_executions FOR DELETE TO authenticated USING (false);

-- ================================================================
-- PART 5: Triggers for updated_at
-- ================================================================

DROP TRIGGER IF EXISTS update_sku_tiers_updated_at ON sku_tiers;
CREATE TRIGGER update_sku_tiers_updated_at
  BEFORE UPDATE ON sku_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_capital_constraints_updated_at ON capital_constraints;
CREATE TRIGGER update_capital_constraints_updated_at
  BEFORE UPDATE ON capital_constraints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_logistics_routes_updated_at ON logistics_routes;
CREATE TRIGGER update_logistics_routes_updated_at
  BEFORE UPDATE ON logistics_routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- VERIFICATION
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'V3 Simulation Engine Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New Tables: sku_tiers, capital_constraints, logistics_routes, simulation_executions';
  RAISE NOTICE 'Modified: products (added sku_tier), warehouses (added default_route_id)';
  RAISE NOTICE '========================================';
END $$;

COMMIT;
```

### 8.2 Migration Execution Steps

1. **Pre-Migration Checklist:**
   - [ ] Backup production database
   - [ ] Verify `update_updated_at_column()` function exists
   - [ ] Check existing auth.users references are valid

2. **Migration Execution:**
   ```bash
   # Run from project root
   npx supabase db push
   # OR apply migration manually in Supabase SQL Editor
   ```

3. **Post-Migration Verification:**
   ```sql
   -- Verify tables created
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('sku_tiers', 'capital_constraints', 'logistics_routes', 'simulation_executions');

   -- Verify products.sku_tier column
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'products' AND column_name = 'sku_tier';

   -- Verify RLS policies
   SELECT tablename, policyname FROM pg_policies
   WHERE schemaname = 'public'
   AND tablename IN ('sku_tiers', 'capital_constraints', 'logistics_routes', 'simulation_executions');
   ```

4. **Data Seeding (Optional):**
   - Default SKU tiers are auto-seeded
   - Default logistics routes are auto-seeded
   - Capital constraints should be configured manually

---

## 9. Implementation Phases (Aligned with PRD)

| Phase | Duration | Deliverables | Dependencies |
|-------|----------|--------------|--------------|
| **Phase 1: Foundation** | Week 1-2 | Database migration, SimulatorService core, Basic API | None |
| **Phase 2: UI & Visualization** | Week 3-4 | Simulation page, Charts, KPI cards | Phase 1 |
| **Phase 3: Constraint Engine** | Week 5-6 | SKU tier CRUD, Capital constraint UI, Route config | Phase 1 |
| **Phase 4: Write-Back & Actions** | Week 7-8 | Execute workflow, Audit trail, Rollback | Phase 2, 3 |
| **Phase 5: Polish & Docs** | Week 9-10 | Performance optimization, Error handling, Documentation | Phase 4 |

---

## 10. Document Sign-Off

| Role | Name | Status | Date |
|------|------|--------|------|
| System Architect | Claude (AI) | Complete | 2025-12-14 |
| Product Director | Claude (AI) | Approved PRD | 2025-12-14 |
| CEO (Stakeholder) | Tony | Pending Review | - |
| Frontend Artisan | TBD | Pending Review | - |
| Backend Specialist | TBD | Pending Review | - |
| QA Director | TBD | Pending Review | - |

---

**END OF DOCUMENT**

*This System Design Document serves as the technical contract for implementing Rolloy SCM V3 Simulation Engine. All Frontend and Backend development should follow these specifications.*
