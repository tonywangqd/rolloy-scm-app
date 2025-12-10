# 供应链智能进销存系统 V2 - 技术设计文档 (Technical Design)
# SCM Intelligent Control Tower System V2 - Technical Design Document

**Document Version:** 2.0.0
**Author:** System Architect
**Created Date:** 2025-12-10
**Status:** Ready for Engineering Implementation
**Priority Classification:** P0 (Core System Upgrade)

---

## Document Purpose

This technical design document serves as the **blueprint** for implementing the SCM V2 upgrade. It translates business requirements from `requirements.md` into:

1. **Database Schema Design** (Tables, Enums, Relations, Indexes, RLS)
2. **Core View Design** (PSI, Reverse Schedule, Alerts)
3. **Server Action API Contracts** (CRUD + Core Algorithms)
4. **Frontend Page Architecture** (Navigation, Components, Data Flow)
5. **Migration Strategy** (Zero Downtime, Backward Compatible)

---

## Executive Summary

### System Evolution: V1 → V2

| Aspect | V1 (Current) | V2 (Target) |
|--------|-------------|-------------|
| **Role** | ERP记录工具 (Data Recording) | 决策指挥塔 (Control Tower) |
| **Document Flow** | FO → PO → PD → Shipment | FO → PO → **OF** → **OS** → **OA** |
| **Time Model** | Forward Planning (下单后推算) | **Reverse Scheduling** (销售倒推) |
| **Inventory** | 12-week projection (简单预测) | **PSI Weekly Table** (进销存核算) |
| **Variance** | Tracked in `supply_chain_variances` | **Enhanced with planned_week + priority** |
| **Traceability** | Partial (PO → Delivery → Shipment) | **Full Chain** (FO → OA with N:N linkage) |

### Key Technical Challenges

1. **Document Renaming vs New Tables**: We will **extend existing tables** (`production_deliveries`, `shipments`) rather than create new tables to avoid breaking changes.
2. **Cascade Updates**: When PO order date changes, automatically update downstream OF/OS/OA planned times.
3. **PSI Calculation Performance**: Weekly PSI for 500 SKU × 12 weeks = 6,000 rows; must compute in <3 seconds.
4. **Data Migration**: Backfill historical OA records from existing `shipments` data.

---

## 1. Database Schema Design

### 1.1 New Tables

#### Table: `order_arrivals` (到仓单 - OA)

**Business Definition:**
Records when shipments arrive at overseas warehouses and get shelved. Critical for converting "in-transit" inventory to "on-hand" inventory.

```sql
CREATE TABLE order_arrivals (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document Number
  arrival_number TEXT NOT NULL UNIQUE,  -- Format: OA-YYYY-MM-DD-XXX (e.g., OA-2025-12-10-001)

  -- Foreign Keys
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,

  -- Quantities
  shipped_qty INTEGER NOT NULL CHECK (shipped_qty > 0),      -- Expected arrival qty (from shipment)
  arrived_qty INTEGER NOT NULL CHECK (arrived_qty >= 0),      -- Actual arrival qty
  variance_qty INTEGER GENERATED ALWAYS AS (shipped_qty - arrived_qty) STORED,

  -- Time Tracking
  expected_arrival_date DATE,           -- Planned arrival date (from shipment)
  actual_arrival_date DATE NOT NULL,    -- Actual arrival date (user input)
  arrival_week_iso TEXT GENERATED ALWAYS AS (
    to_char(actual_arrival_date, 'IYYY-"W"IW')
  ) STORED,

  -- Variance Handling
  variance_reason TEXT,                 -- "Loss", "Damage", "Customs Hold", etc.
  variance_resolution_status TEXT DEFAULT 'pending' CHECK (
    variance_resolution_status IN ('pending', 'resolved', 'escalated')
  ),

  -- Metadata
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,                      -- FK to auth.users (future)

  -- Constraints
  CONSTRAINT valid_variance_resolution_status CHECK (
    variance_resolution_status IN ('pending', 'resolved', 'escalated')
  )
);

-- Indexes
CREATE INDEX idx_order_arrivals_shipment ON order_arrivals(shipment_id);
CREATE INDEX idx_order_arrivals_warehouse ON order_arrivals(warehouse_id);
CREATE INDEX idx_order_arrivals_week ON order_arrivals(arrival_week_iso);
CREATE INDEX idx_order_arrivals_date ON order_arrivals(actual_arrival_date);
CREATE INDEX idx_order_arrivals_variance ON order_arrivals(variance_qty) WHERE variance_qty != 0;

-- RLS Policies
ALTER TABLE order_arrivals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on order_arrivals"
  ON order_arrivals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert on order_arrivals"
  ON order_arrivals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on order_arrivals"
  ON order_arrivals FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated delete on order_arrivals"
  ON order_arrivals FOR DELETE
  TO authenticated
  USING (true);

-- Comments
COMMENT ON TABLE order_arrivals IS 'Migration V2: Arrival records (OA) - Tracks when shipments arrive at warehouse';
COMMENT ON COLUMN order_arrivals.arrival_number IS 'Format: OA-YYYY-MM-DD-XXX';
COMMENT ON COLUMN order_arrivals.variance_qty IS 'Calculated: shipped_qty - arrived_qty (negative = shortage, positive = overage)';
```

**Migration Function: Generate OA Number**

```sql
CREATE OR REPLACE FUNCTION get_next_oa_number(
  p_arrival_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT AS $$
DECLARE
  v_date_part TEXT;
  v_seq INTEGER;
  v_oa_number TEXT;
BEGIN
  v_date_part := to_char(p_arrival_date, 'YYYY-MM-DD');

  -- Find max sequence for this date
  SELECT COALESCE(MAX(
    SUBSTRING(arrival_number FROM 'OA-\d{4}-\d{2}-\d{2}-(\d{3})')::INTEGER
  ), 0) + 1
  INTO v_seq
  FROM order_arrivals
  WHERE arrival_number LIKE 'OA-' || v_date_part || '-%';

  v_oa_number := 'OA-' || v_date_part || '-' || LPAD(v_seq::TEXT, 3, '0');

  RETURN v_oa_number;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_oa_number IS 'Generates next OA number for arrival date (e.g., OA-2025-12-10-001)';
```

**Trigger: Update Inventory on Arrival**

```sql
CREATE OR REPLACE FUNCTION update_inventory_on_arrival()
RETURNS TRIGGER AS $$
BEGIN
  -- When OA is created, increment warehouse inventory
  -- Get SKU from shipment_items
  WITH shipment_skus AS (
    SELECT
      si.sku,
      si.shipped_qty,
      -- Proportionally allocate arrived_qty based on shipped_qty
      (si.shipped_qty::DECIMAL / s.unit_count) * NEW.arrived_qty AS allocated_arrived_qty
    FROM shipment_items si
    JOIN shipments s ON s.id = si.shipment_id
    WHERE si.shipment_id = NEW.shipment_id
  )
  INSERT INTO inventory_snapshots (sku, warehouse_id, qty_on_hand, last_counted_at)
  SELECT
    sku,
    NEW.warehouse_id,
    allocated_arrived_qty::INTEGER,
    NEW.actual_arrival_date
  FROM shipment_skus
  ON CONFLICT (sku, warehouse_id)
  DO UPDATE SET
    qty_on_hand = inventory_snapshots.qty_on_hand + EXCLUDED.qty_on_hand,
    last_counted_at = EXCLUDED.last_counted_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_inventory_on_arrival
  AFTER INSERT ON order_arrivals
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_arrival();

COMMENT ON FUNCTION update_inventory_on_arrival IS 'Automatically updates inventory_snapshots when OA is created';
```

---

#### Table: `psi_weekly_snapshots` (进销存周报表)

**Business Definition:**
Weekly Production-Sales-Inventory (PSI) table showing opening stock, arrivals, sales, closing stock for each SKU × Warehouse × Week.

```sql
CREATE TABLE psi_weekly_snapshots (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dimensions
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  week_iso TEXT NOT NULL,               -- YYYY-WW
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,

  -- Opening Stock (期初库存)
  opening_stock INTEGER NOT NULL DEFAULT 0,

  -- Inbound (到仓)
  planned_arrival_qty INTEGER DEFAULT 0,
  actual_arrival_qty INTEGER DEFAULT 0,
  effective_arrival_qty INTEGER GENERATED ALWAYS AS (
    COALESCE(actual_arrival_qty, planned_arrival_qty)
  ) STORED,

  -- Outbound (销售出库)
  forecast_sales_qty INTEGER DEFAULT 0,
  actual_sales_qty INTEGER,             -- NULL for future weeks
  effective_sales_qty INTEGER GENERATED ALWAYS AS (
    COALESCE(actual_sales_qty, forecast_sales_qty)
  ) STORED,

  -- Closing Stock (期末库存)
  closing_stock INTEGER GENERATED ALWAYS AS (
    opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)
  ) STORED,

  -- Inventory Health
  safety_stock_threshold INTEGER NOT NULL DEFAULT 0,
  stock_status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN (opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)) < 0
        THEN 'Stockout'
      WHEN (opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)) < safety_stock_threshold
        THEN 'Risk'
      ELSE 'OK'
    END
  ) STORED,

  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_psi_week UNIQUE (sku, warehouse_id, week_iso),
  CONSTRAINT valid_week_format CHECK (week_iso ~ '^\d{4}-W\d{2}$'),
  CONSTRAINT valid_stock_status CHECK (stock_status IN ('OK', 'Risk', 'Stockout'))
);

-- Indexes
CREATE INDEX idx_psi_sku_week ON psi_weekly_snapshots(sku, week_iso);
CREATE INDEX idx_psi_warehouse_week ON psi_weekly_snapshots(warehouse_id, week_iso);
CREATE INDEX idx_psi_status ON psi_weekly_snapshots(stock_status) WHERE stock_status != 'OK';
CREATE INDEX idx_psi_week ON psi_weekly_snapshots(week_iso);

-- RLS Policies
ALTER TABLE psi_weekly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated write on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on psi_weekly_snapshots"
  ON psi_weekly_snapshots FOR UPDATE
  TO authenticated
  USING (true);

-- Comments
COMMENT ON TABLE psi_weekly_snapshots IS 'Migration V2: Weekly PSI (Production-Sales-Inventory) table';
COMMENT ON COLUMN psi_weekly_snapshots.effective_arrival_qty IS 'COALESCE(actual, planned) for inventory calculation';
COMMENT ON COLUMN psi_weekly_snapshots.effective_sales_qty IS 'COALESCE(actual, forecast) for inventory calculation';
COMMENT ON COLUMN psi_weekly_snapshots.closing_stock IS 'Calculated: opening + arrival - sales';
```

---

#### Table: `system_parameters` (系统参数配置)

**Business Definition:**
Stores configurable supply chain parameters (lead times, buffers) that affect reverse scheduling calculations.

```sql
CREATE TABLE system_parameters (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parameter Identification
  parameter_key TEXT NOT NULL UNIQUE,   -- e.g., "default_production_lead_weeks"
  parameter_value TEXT NOT NULL,        -- Stored as TEXT, cast as needed
  parameter_type TEXT NOT NULL CHECK (parameter_type IN ('integer', 'decimal', 'text', 'boolean', 'json')),

  -- Metadata
  description TEXT,
  category TEXT,                        -- e.g., "lead_times", "safety_stock", "thresholds"
  is_system_level BOOLEAN DEFAULT true, -- true = global, false = can be overridden per product

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

-- Indexes
CREATE INDEX idx_system_parameters_key ON system_parameters(parameter_key);
CREATE INDEX idx_system_parameters_category ON system_parameters(category);

-- RLS Policies
ALTER TABLE system_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on system_parameters"
  ON system_parameters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated update on system_parameters"
  ON system_parameters FOR UPDATE
  TO authenticated
  USING (true);

-- Seed default parameters
INSERT INTO system_parameters (parameter_key, parameter_value, parameter_type, description, category, is_system_level)
VALUES
  ('default_production_lead_weeks', '5', 'integer', 'Default production cycle (PO → OF)', 'lead_times', true),
  ('default_loading_buffer_weeks', '1', 'integer', 'Default booking buffer (OF → OS)', 'lead_times', true),
  ('default_transit_time_weeks', '5', 'integer', 'Default shipping time (OS → OA)', 'lead_times', true),
  ('default_inbound_buffer_weeks', '2', 'integer', 'Default shelving buffer (OA → Available)', 'lead_times', true),
  ('default_safety_stock_weeks', '2', 'integer', 'Default safety stock weeks', 'safety_stock', true),
  ('variance_alert_threshold_percentage', '20', 'integer', 'Alert if variance > X%', 'thresholds', true),
  ('overdue_days_critical', '14', 'integer', 'Days overdue to mark as Critical priority', 'thresholds', true),
  ('overdue_days_high', '7', 'integer', 'Days overdue to mark as High priority', 'thresholds', true)
ON CONFLICT (parameter_key) DO NOTHING;

COMMENT ON TABLE system_parameters IS 'Migration V2: Configurable supply chain parameters (lead times, thresholds)';
```

---

### 1.2 Modified Existing Tables

#### A. Extend `sales_forecasts` (销量预测单 - FO)

**Changes:**
1. Add `coverage_status` (computed from `forecast_order_allocations`)
2. Add `allocated_qty` (denormalized sum for quick queries)

```sql
-- Add coverage status (computed from allocations)
ALTER TABLE sales_forecasts
  ADD COLUMN IF NOT EXISTS coverage_status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN is_closed = true THEN 'closed'
      WHEN allocated_qty >= forecast_qty THEN 'fully_covered'
      WHEN allocated_qty > 0 THEN 'partially_covered'
      ELSE 'uncovered'
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS allocated_qty INTEGER DEFAULT 0 CHECK (allocated_qty >= 0),
  ADD CONSTRAINT valid_coverage_status CHECK (
    coverage_status IN ('uncovered', 'partially_covered', 'fully_covered', 'closed')
  );

-- Create index for coverage queries
CREATE INDEX IF NOT EXISTS idx_sales_forecasts_coverage
  ON sales_forecasts(coverage_status)
  WHERE coverage_status IN ('uncovered', 'partially_covered');

-- Trigger to auto-update allocated_qty from forecast_order_allocations
CREATE OR REPLACE FUNCTION update_forecast_allocated_qty()
RETURNS TRIGGER AS $$
DECLARE
  v_forecast_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_forecast_id := OLD.forecast_id;
  ELSE
    v_forecast_id := NEW.forecast_id;
  END IF;

  UPDATE sales_forecasts
  SET allocated_qty = (
    SELECT COALESCE(SUM(allocated_qty), 0)
    FROM forecast_order_allocations
    WHERE forecast_id = v_forecast_id
  )
  WHERE id = v_forecast_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_forecast_allocated_qty
  AFTER INSERT OR UPDATE OR DELETE ON forecast_order_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_forecast_allocated_qty();

COMMENT ON COLUMN sales_forecasts.coverage_status IS 'Coverage status: uncovered | partially_covered | fully_covered | closed';
COMMENT ON COLUMN sales_forecasts.allocated_qty IS 'Denormalized sum from forecast_order_allocations (auto-updated by trigger)';
```

---

#### B. Extend `purchase_orders` (采购订单 - PO)

**Changes:**
1. Add `expected_fulfillment_week` (calculated from reverse scheduling)
2. Add `fulfillment_status` (computed from `production_deliveries`)
3. Add `remaining_qty` (computed from PO items)

```sql
-- Add fulfillment tracking fields
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS expected_fulfillment_week TEXT,  -- ISO week format: YYYY-WW
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'pending' CHECK (
    fulfillment_status IN ('pending', 'partial', 'fulfilled', 'short_closed')
  ),
  ADD COLUMN IF NOT EXISTS remaining_qty INTEGER;

-- Create index
CREATE INDEX IF NOT EXISTS idx_purchase_orders_fulfillment_status
  ON purchase_orders(fulfillment_status)
  WHERE fulfillment_status IN ('pending', 'partial');

-- Trigger to auto-calculate expected_fulfillment_week from actual_order_date
CREATE OR REPLACE FUNCTION calculate_po_fulfillment_week()
RETURNS TRIGGER AS $$
DECLARE
  v_production_lead_weeks INTEGER;
BEGIN
  IF NEW.actual_order_date IS NOT NULL THEN
    -- Get production_lead_weeks from first PO item's SKU (or use default)
    SELECT COALESCE(p.production_lead_weeks, 5) INTO v_production_lead_weeks
    FROM purchase_order_items poi
    JOIN products p ON p.sku = poi.sku
    WHERE poi.po_id = NEW.id
    LIMIT 1;

    NEW.expected_fulfillment_week := to_char(
      (NEW.actual_order_date::DATE + (v_production_lead_weeks * 7))::DATE,
      'IYYY-"W"IW'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_po_fulfillment_week
  BEFORE INSERT OR UPDATE OF actual_order_date ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION calculate_po_fulfillment_week();

-- Trigger to update fulfillment_status from production_deliveries
CREATE OR REPLACE FUNCTION update_po_fulfillment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_po_id UUID;
  v_total_ordered INTEGER;
  v_total_delivered INTEGER;
  v_new_status TEXT;
BEGIN
  -- Get PO ID from po_item_id
  SELECT poi.po_id INTO v_po_id
  FROM purchase_order_items poi
  WHERE poi.id = COALESCE(NEW.po_item_id, OLD.po_item_id);

  -- Calculate totals
  SELECT
    SUM(poi.ordered_qty),
    SUM(poi.delivered_qty)
  INTO v_total_ordered, v_total_delivered
  FROM purchase_order_items poi
  WHERE poi.po_id = v_po_id;

  -- Determine status
  IF v_total_delivered = 0 THEN
    v_new_status := 'pending';
  ELSIF v_total_delivered >= v_total_ordered THEN
    v_new_status := 'fulfilled';
  ELSE
    v_new_status := 'partial';
  END IF;

  -- Update PO
  UPDATE purchase_orders
  SET
    fulfillment_status = v_new_status,
    remaining_qty = v_total_ordered - v_total_delivered,
    updated_at = NOW()
  WHERE id = v_po_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_po_fulfillment_status
  AFTER INSERT OR UPDATE OR DELETE ON production_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_po_fulfillment_status();

COMMENT ON COLUMN purchase_orders.expected_fulfillment_week IS 'Calculated: actual_order_date + production_lead_weeks (ISO week format)';
COMMENT ON COLUMN purchase_orders.fulfillment_status IS 'Fulfillment status: pending | partial | fulfilled | short_closed';
COMMENT ON COLUMN purchase_orders.remaining_qty IS 'Total remaining undelivered qty across all PO items';
```

---

#### C. Extend `production_deliveries` (完工申报单 - OF)

**Semantic Changes** (Field Renaming for V2):

| V1 Field Name | V2 Semantic Name | Purpose |
|--------------|------------------|---------|
| `delivery_number` | `fulfillment_number` | "完工单号" (OF-YYYY-MM-DD-XXX) |
| `delivered_qty` | `fulfilled_qty` | "完工数量" |
| `actual_delivery_date` | `fulfillment_date` | "实际完工日期" |
| `planned_delivery_date` | `expected_fulfillment_date` | "预计完工日期" |

**Implementation Strategy:** To avoid breaking changes, we will:
1. Keep existing column names in database
2. Create **SQL views** with V2 semantic names
3. Update TypeScript types to use V2 names

```sql
-- Add shipment allocation fields (already added in delivery_shipment_linkage.sql)
-- No schema changes needed, fields already exist:
-- - shipped_qty (tracks total shipped from this delivery)
-- - shipment_status ('unshipped' | 'partial' | 'fully_shipped')

-- Create V2 semantic view
CREATE OR REPLACE VIEW v_production_deliveries_v2 AS
SELECT
  id,
  delivery_number AS fulfillment_number,          -- Rename for V2
  po_item_id,
  sku,
  channel_code,
  delivered_qty AS fulfilled_qty,                 -- Rename for V2
  planned_delivery_date AS expected_fulfillment_date,  -- Rename for V2
  actual_delivery_date AS fulfillment_date,       -- Rename for V2
  unit_cost_usd,

  -- Computed fields
  delivery_month,
  total_value_usd,
  payment_due_date,
  payment_month,
  payment_status,
  remarks,

  -- Shipment tracking fields
  shipped_qty,
  shipment_status,
  (delivered_qty - COALESCE(shipped_qty, 0)) AS unshipped_qty,  -- New computed field

  created_at,
  updated_at
FROM production_deliveries;

COMMENT ON VIEW v_production_deliveries_v2 IS 'V2 semantic view: Uses "fulfillment" terminology instead of "delivery"';
```

---

#### D. Extend `shipments` (发货单 - OS)

**Changes:**
1. Rename semantic fields (via view)
2. Add `expected_shipment_date` (planned ship date)
3. Add `channel_allocation` (JSONB for multi-channel split)

```sql
-- Add V2 fields
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS expected_shipment_date DATE,     -- Planned ship date (for future tracking)
  ADD COLUMN IF NOT EXISTS shipment_date DATE,              -- Actual ship date (alias for actual_departure_date)
  ADD COLUMN IF NOT EXISTS channel_allocation JSONB;        -- Multi-channel split: {"Amazon": 90, "Shopify": 10}

-- Backfill shipment_date from actual_departure_date
UPDATE shipments
SET shipment_date = actual_departure_date
WHERE shipment_date IS NULL AND actual_departure_date IS NOT NULL;

-- Create V2 semantic view
CREATE OR REPLACE VIEW v_shipments_v2 AS
SELECT
  id,
  tracking_number,
  batch_code,
  logistics_batch_code,
  destination_warehouse_id,
  customs_clearance,
  logistics_plan,
  logistics_region,

  -- V2 renamed fields
  planned_departure_date AS expected_shipment_date,   -- Rename for consistency
  actual_departure_date AS shipment_date,             -- Rename for consistency

  planned_arrival_days,
  planned_arrival_date AS expected_arrival_date,      -- Rename for consistency
  actual_arrival_date,

  weight_kg,
  unit_count,
  cost_per_kg_usd,
  surcharge_usd,
  tax_refund_usd,

  -- Computed fields
  actual_transit_days,
  effective_arrival_date,
  arrival_week_iso,
  freight_cost_usd,
  total_cost_usd,
  payment_due_date,
  payment_month,
  payment_status,

  -- V2 new fields
  channel_allocation,

  remarks,
  created_at,
  updated_at
FROM shipments;

COMMENT ON VIEW v_shipments_v2 IS 'V2 semantic view: Uses consistent "expected/actual" terminology';
COMMENT ON COLUMN shipments.channel_allocation IS 'JSONB: Multi-channel allocation {channel_code: qty}, e.g., {"Amazon": 90, "Shopify": 10}';
```

---

### 1.3 Core Views for V2

#### View: `v_psi_weekly_projection` (PSI周预测视图 - 核心)

**Business Purpose:**
Real-time PSI calculation for all SKUs × Warehouses × Weeks (past 4 + future 12 = 16 weeks).

```sql
CREATE OR REPLACE VIEW v_psi_weekly_projection AS
WITH
  -- Generate week series (past 4 + future 12 = 16 weeks)
  week_series AS (
    SELECT
      to_char(date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL, 'IYYY-"W"IW') AS week_iso,
      date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL AS week_start_date,
      date_trunc('week', CURRENT_DATE) + (n || ' weeks')::INTERVAL + INTERVAL '6 days' AS week_end_date,
      n AS week_offset
    FROM generate_series(-4, 11) AS n
  ),

  -- Cross join SKU × Warehouse × Week
  sku_warehouse_weeks AS (
    SELECT
      p.sku,
      w.id AS warehouse_id,
      ws.week_iso,
      ws.week_start_date::DATE,
      ws.week_end_date::DATE,
      ws.week_offset,
      p.safety_stock_weeks
    FROM products p
    CROSS JOIN warehouses w
    CROSS JOIN week_series ws
    WHERE p.is_active = true AND w.is_active = true
  ),

  -- Aggregate sales forecasts by week
  weekly_forecasts AS (
    SELECT
      sku,
      week_iso,
      SUM(forecast_qty) AS forecast_qty
    FROM sales_forecasts
    WHERE is_closed = false
    GROUP BY sku, week_iso
  ),

  -- Aggregate actual sales by week
  weekly_actuals AS (
    SELECT
      sku,
      week_iso,
      SUM(actual_qty) AS actual_qty
    FROM sales_actuals
    GROUP BY sku, week_iso
  ),

  -- Aggregate planned arrivals (from shipments without actual_arrival_date)
  planned_arrivals AS (
    SELECT
      si.sku,
      s.destination_warehouse_id,
      to_char(COALESCE(s.planned_arrival_date, s.actual_departure_date + (s.planned_arrival_days || ' days')::INTERVAL), 'IYYY-"W"IW') AS week_iso,
      SUM(si.shipped_qty) AS planned_arrival_qty
    FROM shipment_items si
    JOIN shipments s ON s.id = si.shipment_id
    WHERE s.actual_arrival_date IS NULL  -- Only future arrivals
    GROUP BY si.sku, s.destination_warehouse_id, week_iso
  ),

  -- Aggregate actual arrivals (from order_arrivals)
  actual_arrivals AS (
    SELECT
      si.sku,
      oa.warehouse_id,
      oa.arrival_week_iso AS week_iso,
      SUM(oa.arrived_qty) AS actual_arrival_qty
    FROM order_arrivals oa
    JOIN shipments s ON s.id = oa.shipment_id
    JOIN shipment_items si ON si.shipment_id = s.id
    GROUP BY si.sku, oa.warehouse_id, oa.arrival_week_iso
  )

-- Main query
SELECT
  sww.sku,
  p.product_name,
  sww.warehouse_id,
  w.warehouse_name,
  sww.week_iso,
  sww.week_start_date,
  sww.week_end_date,
  sww.week_offset,

  -- Period start stock (opening_stock)
  COALESCE(
    LAG(
      -- Closing stock calculation
      COALESCE(inv.qty_on_hand, 0) +
      COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) -
      COALESCE(wa.actual_qty, wf.forecast_qty, 0)
    ) OVER (PARTITION BY sww.sku, sww.warehouse_id ORDER BY sww.week_offset),
    (SELECT qty_on_hand FROM inventory_snapshots WHERE sku = sww.sku AND warehouse_id = sww.warehouse_id)
  ) AS opening_stock,

  -- Inbound
  COALESCE(pa.planned_arrival_qty, 0) AS planned_arrival_qty,
  COALESCE(aa.actual_arrival_qty, 0) AS actual_arrival_qty,
  COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) AS effective_arrival_qty,

  -- Outbound
  COALESCE(wf.forecast_qty, 0) AS forecast_sales_qty,
  wa.actual_qty AS actual_sales_qty,
  COALESCE(wa.actual_qty, wf.forecast_qty, 0) AS effective_sales_qty,

  -- Closing stock
  COALESCE(inv.qty_on_hand, 0) +
  COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) -
  COALESCE(wa.actual_qty, wf.forecast_qty, 0) AS closing_stock,

  -- Safety stock threshold
  COALESCE(wf.forecast_qty, 0) * sww.safety_stock_weeks AS safety_stock_threshold,

  -- Stock status
  CASE
    WHEN (
      COALESCE(inv.qty_on_hand, 0) +
      COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) -
      COALESCE(wa.actual_qty, wf.forecast_qty, 0)
    ) < 0 THEN 'Stockout'
    WHEN (
      COALESCE(inv.qty_on_hand, 0) +
      COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) -
      COALESCE(wa.actual_qty, wf.forecast_qty, 0)
    ) < (COALESCE(wf.forecast_qty, 0) * sww.safety_stock_weeks) THEN 'Risk'
    ELSE 'OK'
  END AS stock_status,

  NOW() AS calculated_at

FROM sku_warehouse_weeks sww
JOIN products p ON p.sku = sww.sku
JOIN warehouses w ON w.id = sww.warehouse_id
LEFT JOIN weekly_forecasts wf ON wf.sku = sww.sku AND wf.week_iso = sww.week_iso
LEFT JOIN weekly_actuals wa ON wa.sku = sww.sku AND wa.week_iso = sww.week_iso
LEFT JOIN planned_arrivals pa ON pa.sku = sww.sku AND pa.warehouse_id = sww.warehouse_id AND pa.week_iso = sww.week_iso
LEFT JOIN actual_arrivals aa ON aa.sku = sww.sku AND aa.warehouse_id = sww.warehouse_id AND aa.week_iso = sww.week_iso
LEFT JOIN inventory_snapshots inv ON inv.sku = sww.sku AND inv.warehouse_id = sww.warehouse_id;

COMMENT ON VIEW v_psi_weekly_projection IS 'V2: Real-time weekly PSI projection (past 4 + future 12 weeks)';
```

**Performance Note:**
For 500 SKU × 3 warehouses × 16 weeks = **24,000 rows**, expect ~2-3 second calculation time. Consider:
1. **Materialized View** for production (refresh hourly)
2. **Incremental refresh** for real-time updates

---

#### View: `v_reverse_schedule_suggestions` (倒排排程建议视图)

**Business Purpose:**
Calculate "when to order" based on sales demand using reverse scheduling algorithm.

```sql
CREATE OR REPLACE FUNCTION calculate_reverse_schedule(
  p_sku TEXT,
  p_target_sales_week TEXT,
  p_target_sales_qty INTEGER
)
RETURNS TABLE (
  suggested_order_week TEXT,
  suggested_order_date DATE,
  suggested_fulfillment_week TEXT,
  suggested_ship_week TEXT,
  suggested_arrival_week TEXT,
  breakdown JSONB
) AS $$
DECLARE
  v_production_lead_weeks INTEGER;
  v_loading_buffer_weeks INTEGER;
  v_transit_time_weeks INTEGER;
  v_inbound_buffer_weeks INTEGER;

  v_target_date DATE;
  v_arrival_date DATE;
  v_ship_date DATE;
  v_fulfillment_date DATE;
  v_order_date DATE;
BEGIN
  -- Get lead time parameters
  SELECT
    COALESCE(p.production_lead_weeks,
      (SELECT parameter_value::INTEGER FROM system_parameters WHERE parameter_key = 'default_production_lead_weeks')
    ),
    (SELECT parameter_value::INTEGER FROM system_parameters WHERE parameter_key = 'default_loading_buffer_weeks'),
    (SELECT parameter_value::INTEGER FROM system_parameters WHERE parameter_key = 'default_transit_time_weeks'),
    (SELECT parameter_value::INTEGER FROM system_parameters WHERE parameter_key = 'default_inbound_buffer_weeks')
  INTO v_production_lead_weeks, v_loading_buffer_weeks, v_transit_time_weeks, v_inbound_buffer_weeks
  FROM products p
  WHERE p.sku = p_sku;

  -- Parse target week to date
  v_target_date := to_date(p_target_sales_week || '-1', 'IYYY-"W"IW-D');

  -- Backtrack calculation
  v_arrival_date := v_target_date - (v_inbound_buffer_weeks * 7);           -- W48
  v_ship_date := v_arrival_date - (v_transit_time_weeks * 7);               -- W43
  v_fulfillment_date := v_ship_date - (v_loading_buffer_weeks * 7);         -- W42
  v_order_date := v_fulfillment_date - (v_production_lead_weeks * 7);       -- W37

  RETURN QUERY SELECT
    to_char(v_order_date, 'IYYY-"W"IW')::TEXT AS suggested_order_week,
    v_order_date AS suggested_order_date,
    to_char(v_fulfillment_date, 'IYYY-"W"IW')::TEXT AS suggested_fulfillment_week,
    to_char(v_ship_date, 'IYYY-"W"IW')::TEXT AS suggested_ship_week,
    to_char(v_arrival_date, 'IYYY-"W"IW')::TEXT AS suggested_arrival_week,
    jsonb_build_object(
      'target_sales_week', p_target_sales_week,
      'target_sales_qty', p_target_sales_qty,
      'production_lead_weeks', v_production_lead_weeks,
      'loading_buffer_weeks', v_loading_buffer_weeks,
      'transit_time_weeks', v_transit_time_weeks,
      'inbound_buffer_weeks', v_inbound_buffer_weeks,
      'total_lead_time_weeks', v_production_lead_weeks + v_loading_buffer_weeks + v_transit_time_weeks + v_inbound_buffer_weeks
    ) AS breakdown;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_reverse_schedule IS 'V2: Calculate reverse schedule timeline for a sales demand';
```

**View Implementation:**

```sql
CREATE OR REPLACE VIEW v_reverse_schedule_suggestions AS
WITH uncovered_demand AS (
  SELECT
    fc.sku,
    fc.week_iso AS sales_week,
    fc.uncovered_qty,
    fc.forecast_qty,
    fc.allocated_qty,
    fc.product_name,
    fc.spu
  FROM v_forecast_coverage fc
  WHERE fc.uncovered_qty > 0
    AND fc.week_iso >= to_char(CURRENT_DATE, 'IYYY-"W"IW')  -- Future weeks only
)
SELECT
  ud.sku,
  ud.product_name,
  ud.spu,
  ud.sales_week,
  ud.forecast_qty,
  ud.allocated_qty,
  ud.uncovered_qty AS suggested_order_qty,

  rs.suggested_order_week,
  rs.suggested_order_date,
  rs.suggested_fulfillment_week,
  rs.suggested_ship_week,
  rs.suggested_arrival_week,

  -- Priority calculation
  CASE
    WHEN rs.suggested_order_week < to_char(CURRENT_DATE, 'IYYY-"W"IW') THEN 'Critical'
    WHEN rs.suggested_order_week <= to_char(CURRENT_DATE + INTERVAL '2 weeks', 'IYYY-"W"IW') THEN 'High'
    WHEN rs.suggested_order_week <= to_char(CURRENT_DATE + INTERVAL '4 weeks', 'IYYY-"W"IW') THEN 'Medium'
    ELSE 'Low'
  END AS priority,

  -- Is overdue?
  (rs.suggested_order_week < to_char(CURRENT_DATE, 'IYYY-"W"IW')) AS is_overdue,

  rs.breakdown AS lead_time_breakdown,

  NOW() AS calculated_at

FROM uncovered_demand ud
CROSS JOIN LATERAL calculate_reverse_schedule(ud.sku, ud.sales_week, ud.uncovered_qty) rs;

COMMENT ON VIEW v_reverse_schedule_suggestions IS 'V2: Purchase order suggestions based on uncovered forecasts with reverse scheduling';
```

---

#### View: `v_inventory_health_alerts` (库存健康预警视图)

**Business Purpose:**
Dashboard KPI: Show SKUs with stockout risks, overstocks, or variance issues.

```sql
CREATE OR REPLACE VIEW v_inventory_health_alerts AS
WITH
  -- Stockout risks (from PSI)
  stockout_risks AS (
    SELECT
      sku,
      product_name,
      'Stockout Risk' AS alert_type,
      week_iso AS risk_week,
      closing_stock AS current_stock,
      safety_stock_threshold,
      'Critical' AS severity,
      'Stock will be negative in ' || week_iso AS alert_message
    FROM v_psi_weekly_projection
    WHERE stock_status = 'Stockout'
      AND week_offset >= 0  -- Future weeks only
  ),

  -- Safety stock risks
  safety_stock_risks AS (
    SELECT
      sku,
      product_name,
      'Low Stock Risk' AS alert_type,
      week_iso AS risk_week,
      closing_stock AS current_stock,
      safety_stock_threshold,
      'High' AS severity,
      'Stock below safety threshold in ' || week_iso AS alert_message
    FROM v_psi_weekly_projection
    WHERE stock_status = 'Risk'
      AND week_offset BETWEEN 0 AND 4  -- Next 4 weeks
  ),

  -- Overstock risks (DOI > 90 days)
  overstock_risks AS (
    SELECT
      psi.sku,
      psi.product_name,
      'Overstock' AS alert_type,
      psi.week_iso AS risk_week,
      psi.closing_stock AS current_stock,
      psi.safety_stock_threshold,
      'Medium' AS severity,
      'Excess inventory: ' ||
        ROUND(psi.closing_stock::DECIMAL / NULLIF(psi.effective_sales_qty, 0) * 7) ||
        ' days of inventory' AS alert_message
    FROM v_psi_weekly_projection psi
    WHERE psi.week_offset = 0  -- Current week only
      AND psi.closing_stock > (psi.safety_stock_threshold * 3)  -- 3x safety stock
  ),

  -- Variance alerts (from supply_chain_variances)
  variance_alerts AS (
    SELECT
      vo.sku,
      vo.product_name,
      'Pending Variance' AS alert_type,
      vo.planned_week AS risk_week,
      vo.pending_qty AS current_stock,
      0 AS safety_stock_threshold,
      vo.priority AS severity,
      vo.source_reference || ': ' || vo.pending_qty || ' units pending' AS alert_message
    FROM v_variance_overview vo
    WHERE vo.status IN ('pending', 'scheduled', 'overdue')
  )

-- Union all alerts
SELECT * FROM stockout_risks
UNION ALL
SELECT * FROM safety_stock_risks
UNION ALL
SELECT * FROM overstock_risks
UNION ALL
SELECT * FROM variance_alerts
ORDER BY
  CASE severity
    WHEN 'Critical' THEN 1
    WHEN 'High' THEN 2
    WHEN 'Medium' THEN 3
    ELSE 4
  END,
  risk_week;

COMMENT ON VIEW v_inventory_health_alerts IS 'V2: Unified inventory health alerts (stockout, low stock, overstock, variance)';
```

---

### 1.4 Cascade Update Logic

#### Challenge: When PO `actual_order_date` Changes

**Business Rule (TR-001 from requirements.md):**
If PO actual order date changes, automatically recalculate downstream expected dates:
- OF expected_fulfillment_date = order_date + production_lead_weeks
- OS expected_shipment_date = fulfillment_date + loading_buffer_weeks
- OA expected_arrival_date = shipment_date + transit_time_weeks

**Implementation Strategy:**
Use **PostgreSQL trigger** on `purchase_orders` to cascade updates.

```sql
CREATE OR REPLACE FUNCTION cascade_update_po_timeline()
RETURNS TRIGGER AS $$
DECLARE
  v_production_lead_weeks INTEGER;
  v_loading_buffer_weeks INTEGER;
  v_transit_time_weeks INTEGER;
  v_new_fulfillment_date DATE;
  v_new_ship_date DATE;
  v_new_arrival_date DATE;
BEGIN
  -- Only trigger if actual_order_date changed
  IF OLD.actual_order_date IS DISTINCT FROM NEW.actual_order_date THEN
    -- Get lead time parameters
    SELECT
      COALESCE(p.production_lead_weeks, 5),
      sp_loading.parameter_value::INTEGER,
      sp_transit.parameter_value::INTEGER
    INTO v_production_lead_weeks, v_loading_buffer_weeks, v_transit_time_weeks
    FROM purchase_order_items poi
    JOIN products p ON p.sku = poi.sku
    CROSS JOIN (SELECT parameter_value FROM system_parameters WHERE parameter_key = 'default_loading_buffer_weeks') sp_loading
    CROSS JOIN (SELECT parameter_value FROM system_parameters WHERE parameter_key = 'default_transit_time_weeks') sp_transit
    WHERE poi.po_id = NEW.id
    LIMIT 1;

    -- Calculate new dates
    v_new_fulfillment_date := NEW.actual_order_date + (v_production_lead_weeks * 7);
    v_new_ship_date := v_new_fulfillment_date + (v_loading_buffer_weeks * 7);
    v_new_arrival_date := v_new_ship_date + (v_transit_time_weeks * 7);

    -- Update production_deliveries (OF) expected dates
    UPDATE production_deliveries
    SET planned_delivery_date = v_new_fulfillment_date
    WHERE po_item_id IN (SELECT id FROM purchase_order_items WHERE po_id = NEW.id)
      AND actual_delivery_date IS NULL;  -- Only update future deliveries

    -- Update shipments (OS) expected dates
    UPDATE shipments s
    SET planned_departure_date = v_new_ship_date
    FROM delivery_shipment_allocations dsa
    JOIN production_deliveries pd ON dsa.delivery_id = pd.id
    JOIN purchase_order_items poi ON pd.po_item_id = poi.id
    WHERE poi.po_id = NEW.id
      AND s.id = dsa.shipment_id
      AND s.actual_departure_date IS NULL;

    -- Update order_arrivals (OA) expected dates
    UPDATE order_arrivals oa
    SET expected_arrival_date = v_new_arrival_date
    FROM shipments s
    JOIN delivery_shipment_allocations dsa ON s.id = dsa.shipment_id
    JOIN production_deliveries pd ON dsa.delivery_id = pd.id
    JOIN purchase_order_items poi ON pd.po_item_id = poi.id
    WHERE poi.po_id = NEW.id
      AND oa.shipment_id = s.id
      AND oa.actual_arrival_date IS NULL;

    RAISE NOTICE 'Cascade update triggered: PO % order date changed to %. Updated downstream OF/OS/OA expected dates.',
      NEW.po_number, NEW.actual_order_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_update_po_timeline
  AFTER UPDATE OF actual_order_date ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION cascade_update_po_timeline();

COMMENT ON FUNCTION cascade_update_po_timeline IS 'V2: Cascades PO order date changes to downstream OF/OS/OA expected dates';
```

**User Confirmation (Frontend):**
Before triggering the update, show a modal:

```
⚠️ Modify PO Order Date

Changing the order date from 2025-09-09 (W37) to 2025-09-23 (W39) will affect:

- Expected Fulfillment (OF): W42 → W44 (+2 weeks)
- Expected Shipment (OS): W43 → W45 (+2 weeks)
- Expected Arrival (OA): W48 → W50 (+2 weeks)

Affected records:
- 2 Production Deliveries (OF)
- 1 Shipment (OS)
- 1 Arrival (OA)

[Cancel] [Confirm Update]
```

---

## 2. Server Action API Design

### 2.1 Document CRUD Actions

#### A. Order Arrivals (OA) CRUD

**File:** `src/lib/actions/order-arrivals.ts`

```typescript
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface CreateOARequest {
  shipmentId: string
  warehouseId: string
  shippedQty: number
  arrivedQty: number
  actualArrivalDate: string  // YYYY-MM-DD
  expectedArrivalDate?: string | null
  varianceReason?: string | null
  remarks?: string | null
}

interface CreateOAResponse {
  success: boolean
  data?: {
    id: string
    arrivalNumber: string
  }
  error?: string
}

export async function createOrderArrival(
  req: CreateOARequest
): Promise<CreateOAResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    // Generate OA number
    const { data: oaNumber, error: oaNumberError } = await supabase.rpc(
      'get_next_oa_number',
      { p_arrival_date: req.actualArrivalDate }
    )

    if (oaNumberError) throw oaNumberError

    // Insert OA record
    const { data, error } = await supabase
      .from('order_arrivals')
      .insert({
        arrival_number: oaNumber,
        shipment_id: req.shipmentId,
        warehouse_id: req.warehouseId,
        shipped_qty: req.shippedQty,
        arrived_qty: req.arrivedQty,
        actual_arrival_date: req.actualArrivalDate,
        expected_arrival_date: req.expectedArrivalDate,
        variance_reason: req.varianceReason,
        remarks: req.remarks
      })
      .select('id, arrival_number')
      .single()

    if (error) throw error

    revalidatePath('/logistics')
    revalidatePath('/inventory')

    return {
      success: true,
      data: {
        id: data.id,
        arrivalNumber: data.arrival_number
      }
    }
  } catch (error) {
    console.error('[createOrderArrival] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order arrival'
    }
  }
}

// Similar pattern for:
// - updateOrderArrival()
// - deleteOrderArrival() (with safeguards)
// - getOrderArrivalById()
// - getOrderArrivalsByShipment()
```

---

#### B. PSI Calculation Action

**File:** `src/lib/actions/psi.ts`

```typescript
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

interface CalculatePSIRequest {
  sku?: string           // Optional: calculate for specific SKU
  warehouseId?: string   // Optional: calculate for specific warehouse
  startWeek?: string     // Optional: custom start week (default: current week - 4)
  endWeek?: string       // Optional: custom end week (default: current week + 11)
}

interface PSIRow {
  sku: string
  productName: string
  warehouseId: string
  warehouseName: string
  weekIso: string
  weekStartDate: string
  weekEndDate: string
  weekOffset: number
  openingStock: number
  plannedArrivalQty: number
  actualArrivalQty: number
  effectiveArrivalQty: number
  forecastSalesQty: number
  actualSalesQty: number | null
  effectiveSalesQty: number
  closingStock: number
  safetyStockThreshold: number
  stockStatus: 'OK' | 'Risk' | 'Stockout'
}

interface CalculatePSIResponse {
  success: boolean
  data?: PSIRow[]
  metadata?: {
    totalRows: number
    calculationTime: number  // milliseconds
    filters: CalculatePSIRequest
  }
  error?: string
}

export async function calculatePSI(
  req: CalculatePSIRequest = {}
): Promise<CalculatePSIResponse> {
  const startTime = Date.now()

  try {
    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('v_psi_weekly_projection')
      .select('*')
      .order('week_offset', { ascending: true })

    // Apply filters
    if (req.sku) {
      query = query.eq('sku', req.sku)
    }
    if (req.warehouseId) {
      query = query.eq('warehouse_id', req.warehouseId)
    }
    if (req.startWeek) {
      query = query.gte('week_iso', req.startWeek)
    }
    if (req.endWeek) {
      query = query.lte('week_iso', req.endWeek)
    }

    const { data, error } = await query

    if (error) throw error

    const calculationTime = Date.now() - startTime

    return {
      success: true,
      data: data as PSIRow[],
      metadata: {
        totalRows: data.length,
        calculationTime,
        filters: req
      }
    }
  } catch (error) {
    console.error('[calculatePSI] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate PSI'
    }
  }
}
```

---

#### C. Reverse Schedule Calculation Action

**File:** `src/lib/actions/reverse-schedule.ts`

```typescript
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

interface ReverseScheduleRequest {
  sku: string
  targetSalesWeek: string  // YYYY-WW
  targetSalesQty: number
}

interface ReverseScheduleResponse {
  success: boolean
  data?: {
    suggestedOrderWeek: string
    suggestedOrderDate: string
    suggestedFulfillmentWeek: string
    suggestedShipWeek: string
    suggestedArrivalWeek: string
    breakdown: {
      targetSalesWeek: string
      targetSalesQty: number
      productionLeadWeeks: number
      loadingBufferWeeks: number
      transitTimeWeeks: number
      inboundBufferWeeks: number
      totalLeadTimeWeeks: number
    }
  }
  error?: string
}

export async function calculateReverseSchedule(
  req: ReverseScheduleRequest
): Promise<ReverseScheduleResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc('calculate_reverse_schedule', {
      p_sku: req.sku,
      p_target_sales_week: req.targetSalesWeek,
      p_target_sales_qty: req.targetSalesQty
    }).single()

    if (error) throw error

    return {
      success: true,
      data: {
        suggestedOrderWeek: data.suggested_order_week,
        suggestedOrderDate: data.suggested_order_date,
        suggestedFulfillmentWeek: data.suggested_fulfillment_week,
        suggestedShipWeek: data.suggested_ship_week,
        suggestedArrivalWeek: data.suggested_arrival_week,
        breakdown: data.breakdown
      }
    }
  } catch (error) {
    console.error('[calculateReverseSchedule] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate reverse schedule'
    }
  }
}

// Batch version for multiple SKUs
export async function calculateReverseScheduleBatch(
  requests: ReverseScheduleRequest[]
): Promise<ReverseScheduleResponse[]> {
  return Promise.all(requests.map(req => calculateReverseSchedule(req)))
}
```

---

#### D. Channel Allocation Algorithm Action

**File:** `src/lib/actions/channel-allocation.ts`

```typescript
'use server'

interface ChannelAllocationRequest {
  totalQty: number
  channels: Array<{
    channelCode: string
    currentStock: number
    weeklySales: number
  }>
}

interface ChannelAllocationResponse {
  success: boolean
  data?: Record<string, number>  // { channelCode: allocatedQty }
  metadata?: {
    targetDOI: number
    algorithm: 'DOI_BALANCING'
  }
  error?: string
}

export async function calculateChannelAllocation(
  req: ChannelAllocationRequest
): Promise<ChannelAllocationResponse> {
  try {
    // Implementation of DOI balancing algorithm from requirements.md (US-4.1)
    const allocations: Record<string, number> = {}
    let remaining = req.totalQty

    // Step 1: Calculate current DOI for each channel
    const channelsWithDOI = req.channels.map(ch => ({
      ...ch,
      doi: ch.currentStock / ch.weeklySales
    }))

    // Step 2: Sort by DOI ascending (prioritize channels with lowest DOI)
    const sorted = channelsWithDOI.sort((a, b) => a.doi - b.doi)

    // Step 3: Iteratively allocate to channel with lowest DOI
    while (remaining > 0) {
      for (const channel of sorted) {
        if (remaining <= 0) break

        allocations[channel.channelCode] = (allocations[channel.channelCode] || 0) + 1
        remaining--

        // Recalculate DOI
        channel.doi = (channel.currentStock + allocations[channel.channelCode]) / channel.weeklySales
      }
      // Re-sort after each allocation round
      sorted.sort((a, b) => a.doi - b.doi)
    }

    return {
      success: true,
      data: allocations,
      metadata: {
        targetDOI: Math.max(...channelsWithDOI.map(ch =>
          (ch.currentStock + (allocations[ch.channelCode] || 0)) / ch.weeklySales
        )),
        algorithm: 'DOI_BALANCING'
      }
    }
  } catch (error) {
    console.error('[calculateChannelAllocation] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate channel allocation'
    }
  }
}
```

---

### 2.2 Query Functions

**File:** `src/lib/queries/psi.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { PSIRow } from '@/lib/types/database'

export async function getPSIForSKU(
  sku: string,
  warehouseId?: string
): Promise<PSIRow[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_psi_weekly_projection')
    .select('*')
    .eq('sku', sku)
    .order('week_offset', { ascending: true })

  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId)
  }

  const { data, error } = await query

  if (error) throw error
  return data as PSIRow[]
}

export async function getPSISummary(): Promise<{
  totalSKUs: number
  okCount: number
  riskCount: number
  stockoutCount: number
}> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_psi_weekly_projection')
    .select('sku, stock_status')
    .eq('week_offset', 0)  // Current week only

  if (error) throw error

  const summary = {
    totalSKUs: new Set(data.map(d => d.sku)).size,
    okCount: data.filter(d => d.stock_status === 'OK').length,
    riskCount: data.filter(d => d.stock_status === 'Risk').length,
    stockoutCount: data.filter(d => d.stock_status === 'Stockout').length
  }

  return summary
}
```

---

## 3. Frontend Page Architecture

### 3.1 Navigation Structure (Updated)

**File:** `src/components/layout/Sidebar.tsx`

```
┌─────────────────────────────────────────┐
│  Rolloy SCM V2 Navigation               │
├─────────────────────────────────────────┤
│  📊 决策总览 (Dashboard)                  │
│    ├─ 首页 KPI 卡片                       │
│    ├─ 库存健康度预警                       │
│    └─ 异常追踪                             │
├─────────────────────────────────────────┤
│  📈 计划管理 (Planning)                   │
│    ├─ 销售预测 (Sales Forecasts)          │
│    ├─ 需求覆盖 (Demand Coverage) 🆕       │
│    └─ 采购建议 (Replenishment) 🆕         │
├─────────────────────────────────────────┤
│  🛒 采购管理 (Procurement)                │
│    ├─ 采购订单 (Purchase Orders)          │
│    ├─ 完工申报 (Production Deliveries)    │
│    └─ 履约差异 (Fulfillment Variance) 🆕 │
├─────────────────────────────────────────┤
│  🚚 物流管理 (Logistics)                  │
│    ├─ 发货单 (Shipments)                 │
│    ├─ 到仓单 (Order Arrivals) 🆕          │
│    └─ 在途跟踪 (In-Transit Tracking) 🆕   │
├─────────────────────────────────────────┤
│  📦 库存管理 (Inventory)                  │
│    ├─ 库存快照 (Inventory Snapshots)     │
│    ├─ PSI 报表 (PSI Table) 🆕             │
│    └─ 库存健康度 (Inventory Health) 🆕    │
├─────────────────────────────────────────┤
│  💰 资金管理 (Finance)                    │
│    └─ 应付账款 (Pending Payables)         │
├─────────────────────────────────────────┤
│  ⚙️ 设置 (Settings)                      │
│    ├─ 产品主数据 (Products)               │
│    ├─ 渠道/仓库/供应商 (Master Data)      │
│    └─ 系统参数 (System Parameters) 🆕    │
└─────────────────────────────────────────┘
```

---

### 3.2 Core Pages Design

#### Page: `/planning/demand-coverage` (需求覆盖页面 - 🆕)

**Purpose:** Show forecast coverage status (UNCOVERED, PARTIALLY_COVERED, FULLY_COVERED) with ability to manually allocate PO items to forecasts.

**Components:**

```
┌────────────────────────────────────────────────────────────────┐
│  需求覆盖总览 (Demand Coverage Overview)                          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐│
│  │ 📊 总需求量   │ ✅ 已覆盖量   │ ⚠️ 未覆盖量   │ 📦 覆盖率     ││
│  │              │              │              │              ││
│  │   5,000      │    3,800     │    1,200     │     76%      ││
│  │              │              │              │              ││
│  └──────────────┴──────────────┴──────────────┴──────────────┘│
│                                                                 │
│  筛选器: [SKU筛选] [周范围] [覆盖状态] [渠道]                     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ 需求清单 (Demand List)                                      ││
│  ├─────┬──────┬─────┬────────┬────────┬────────┬────────────┤│
│  │ SKU │ 周次 │ 需求│ 已分配 │ 未覆盖 │ 覆盖率 │ 操作       ││
│  ├─────┼──────┼─────┼────────┼────────┼────────┼────────────┤│
│  │ A01 │W48   │ 100 │   60   │   40   │  60%  │[+ 分配PO] ││
│  │ A01 │W49   │ 120 │    0   │  120   │   0%  │[+ 分配PO] ││
│  │ B02 │W50   │  80 │   80   │    0   │ 100%  │ ✅ 已满足  ││
│  └─────┴──────┴─────┴────────┴────────┴────────┴────────────┘│
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Data Source:** `v_forecast_coverage` view

**Server Action:** `allocatePOItemToForecast()`

---

#### Page: `/planning/replenishment` (采购建议页面 - Enhanced)

**Purpose:** Show reverse-scheduled purchase order suggestions based on uncovered demand.

**Components:**

```
┌────────────────────────────────────────────────────────────────┐
│  采购建议 (Replenishment Suggestions)                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐│
│  │ 🔴 紧急      │ 🟡 高优先级   │ 🟢 中优先级   │ 总建议数量   ││
│  │              │              │              │              ││
│  │    3 SKU     │    12 SKU    │    8 SKU     │   23 SKU     ││
│  │              │              │              │              ││
│  └──────────────┴──────────────┴──────────────┴──────────────┘│
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ 建议清单 (Suggestions List)                                 ││
│  ├─────┬────────┬────────┬────────┬────────┬──────┬─────────┤│
│  │ SKU │ 销售周 │ 缺口量 │ 建议下单│ 建议到仓│ 优先│ 操作    ││
│  │     │        │        │ 周      │ 周      │ 级  │         ││
│  ├─────┼────────┼────────┼────────┼────────┼──────┼─────────┤│
│  │ A01 │W50     │  40    │  W37   │  W48   │ 🔴  │[创建PO] ││
│  │     │        │        │         │        │     │[查看倒推]││
│  ├─────┼────────┼────────┼────────┼────────┼──────┼─────────┤│
│  │ B02 │W51     │  80    │  W38   │  W49   │ 🟡  │[创建PO] ││
│  │     │        │        │         │        │     │[查看倒推]││
│  └─────┴────────┴────────┴────────┴────────┴──────┴─────────┘│
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Data Source:** `v_reverse_schedule_suggestions` view

**Server Action:** `calculateReverseSchedule()`

**Modal: "查看倒推链条"**

```
┌─────────────────────────────────────────────┐
│  倒排排程详情 (Reverse Schedule Detail)      │
├─────────────────────────────────────────────┤
│                                              │
│  SKU: A01 | 销售需求周: W50 | 需求量: 40台  │
│                                              │
│  W50 (销售周) ← 目标周 (40台)                │
│    ↓ -2周 (上架缓冲)                         │
│  W48 (到仓周 OA) ← 必须到仓                  │
│    ↓ -5周 (物流周期)                         │
│  W43 (发货周 OS) ← 必须发货                  │
│    ↓ -1周 (订舱缓冲)                         │
│  W42 (完工周 OF) ← 必须完工                  │
│    ↓ -5周 (生产周期)                         │
│  W37 (下单周 PO) ← 建议下单周 ⚠️ 已逾期     │
│                                              │
│  参数配置:                                    │
│  - 生产周期: 5周 (可调整)                    │
│  - 订舱缓冲: 1周                             │
│  - 物流周期: 5周                             │
│  - 上架缓冲: 2周                             │
│                                              │
│  [关闭] [立即创建PO]                         │
└─────────────────────────────────────────────┘
```

---

#### Page: `/procurement/fulfillment-variance` (履约差异页面 - 🆕)

**Purpose:** Show PO items with unfulfilled quantities and allow scheduling expected fulfillment times.

**Components:**

```
┌────────────────────────────────────────────────────────────────┐
│  履约差异追踪 (Fulfillment Variance Tracking)                   │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐│
│  │ 待完工订单   │ 待完工数量   │ 逾期订单     │ 平均延迟     ││
│  │              │              │              │              ││
│  │    15        │    850       │     3        │   5.2天      ││
│  │              │              │              │              ││
│  └──────────────┴──────────────┴──────────────┴──────────────┘│
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ 差异清单 (Variance List) - 来源: v_po_fulfillment_variance ││
│  ├────────┬─────┬────────┬────────┬────────┬──────┬─────────┤│
│  │ PO号   │ SKU │ 下单量 │ 已完工 │ 未完工 │ 状态 │ 操作    ││
│  ├────────┼─────┼────────┼────────┼────────┼──────┼─────────┤│
│  │PO-001-A│ A01 │  100   │   60   │   40   │ 部分 │[设置预期]││
│  │        │     │        │        │        │      │[短装关闭]││
│  ├────────┼─────┼────────┼────────┼────────┼──────┼─────────┤│
│  │PO-002-B│ B02 │   80   │    0   │   80   │ 待定 │[设置预期]││
│  │        │     │        │ 逾期2周│        │ ⚠️  │         ││
│  └────────┴─────┴────────┴────────┴────────┴──────┴─────────┘│
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Data Source:** `v_po_fulfillment_variance` view (from migration)

**Server Action:** `setExpectedFulfillmentTime()`, `shortClosePOItem()`

---

#### Page: `/logistics/arrivals` (到仓单页面 - 🆕)

**Purpose:** Record warehouse arrivals (OA) and track variance.

**Components:**

```
┌────────────────────────────────────────────────────────────────┐
│  到仓管理 (Order Arrivals)                                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [+ 新建到仓单] [导入Excel] [导出]                               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ 到仓列表 (Arrival List)                                     ││
│  ├─────────┬────────┬──────┬────────┬────────┬──────┬───────┤│
│  │ OA号    │ 运单号 │ 仓库 │ 发货量 │ 到货量 │ 差异 │ 操作  ││
│  ├─────────┼────────┼──────┼────────┼────────┼──────┼───────┤│
│  │OA-001   │TN-12345│ US-W │  100   │   98   │  -2  │ [编辑]││
│  │         │        │      │        │        │      │ [查看]││
│  ├─────────┼────────┼──────┼────────┼────────┼──────┼───────┤│
│  │OA-002   │TN-12346│ US-E │   80   │   80   │   0  │ [查看]││
│  └─────────┴────────┴──────┴────────┴────────┴──────┴───────┘│
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Data Source:** `order_arrivals` table

**Server Action:** `createOrderArrival()`, `updateOrderArrival()`

---

#### Page: `/inventory/psi-table` (PSI报表页面 - 🆕)

**Purpose:** Show weekly PSI table with drill-down capability.

**Components:**

```
┌────────────────────────────────────────────────────────────────┐
│  进销存报表 (PSI Table)                                          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  筛选: [SKU] [仓库] [周范围: W48-W51] [仅显示风险SKU]           │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ PSI周报表 (Weekly PSI) - SKU: A01 | 仓库: US-West          ││
│  ├──────┬──────┬──────┬──────┬──────┬──────┬──────┬────────┤│
│  │ 周次 │ 期初 │ 到仓 │ 销售 │ 期末 │安全库│ 状态 │ 操作   ││
│  │      │ 库存 │      │      │ 库存 │存    │      │        ││
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼────────┤│
│  │ W48  │  150 │  100 │  120 │  130 │  100 │  ✅  │ [详情] ││
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼────────┤│
│  │ W49  │  130 │    0 │  120 │   10 │  100 │  ⚠️  │ [详情] ││
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼────────┤│
│  │ W50  │   10 │    0 │  120 │ -110 │  100 │  🔴  │ [详情] ││
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼────────┤│
│  │ W51  │ -110 │  200 │  120 │  -30 │  100 │  🔴  │ [详情] ││
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┴────────┘│
│                                                                 │
│  [导出Excel] [刷新] [查看热力图]                                 │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Data Source:** `v_psi_weekly_projection` view

**Server Action:** `calculatePSI()`

**Visualization:** Use Recharts for heatmap (future enhancement)

---

#### Page: `/settings/system-parameters` (系统参数页面 - 🆕)

**Purpose:** Configure supply chain lead times and thresholds.

**Components:**

```
┌────────────────────────────────────────────────────────────────┐
│  系统参数配置 (System Parameters)                                │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ 供应链周期参数 (Supply Chain Lead Times) ─────────────────┐│
│  │                                                             ││
│  │  生产周期 (Production Lead Weeks)                           ││
│  │  [5] 周  (默认值,可在产品主数据中覆盖)                       ││
│  │                                                             ││
│  │  订舱缓冲 (Loading Buffer Weeks)                            ││
│  │  [1] 周                                                     ││
│  │                                                             ││
│  │  物流周期 (Transit Time Weeks)                              ││
│  │  [5] 周                                                     ││
│  │                                                             ││
│  │  上架缓冲 (Inbound Buffer Weeks)                            ││
│  │  [2] 周                                                     ││
│  │                                                             ││
│  │  [保存参数]                                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ 预警阈值 (Alert Thresholds) ──────────────────────────────┐│
│  │                                                             ││
│  │  差异预警阈值 (Variance Alert Threshold)                    ││
│  │  [20] %                                                     ││
│  │                                                             ││
│  │  逾期天数 - 紧急 (Overdue Days - Critical)                  ││
│  │  [14] 天                                                    ││
│  │                                                             ││
│  │  逾期天数 - 高优先级 (Overdue Days - High)                  ││
│  │  [7] 天                                                     ││
│  │                                                             ││
│  │  [保存参数]                                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Data Source:** `system_parameters` table

**Server Action:** `updateSystemParameter()`

---

## 4. Data Migration Strategy

### 4.1 Migration Phases

**Phase 1: Schema Extensions (Non-Breaking)**
- Add new tables (`order_arrivals`, `psi_weekly_snapshots`, `system_parameters`)
- Add new columns to existing tables
- Create new views (`v_psi_weekly_projection`, `v_reverse_schedule_suggestions`, etc.)
- Deploy triggers

**Phase 2: Data Backfill**
- Backfill `order_arrivals` from existing `shipments` (where `actual_arrival_date` exists)
- Seed `system_parameters` with default values
- Calculate initial `psi_weekly_snapshots` for current week

**Phase 3: Frontend Rollout**
- Deploy new pages (feature-flagged)
- Update navigation
- Add new Server Actions

**Phase 4: Deprecation (Future)**
- Mark old fields as deprecated in TypeScript types
- Gradual migration of queries to use V2 views

---

### 4.2 Migration SQL Script

**File:** `supabase/migrations/20251210000001_scm_v2_upgrade.sql`

```sql
-- =====================================================================
-- Migration: SCM V2 Upgrade - Full Schema
-- Version: 2.0.0
-- Date: 2025-12-10
-- Author: System Architect
--
-- Description:
--   Complete V2 upgrade including:
--   1. New tables (order_arrivals, psi_weekly_snapshots, system_parameters)
--   2. Extended existing tables (sales_forecasts, purchase_orders, etc.)
--   3. Core views (v_psi_weekly_projection, v_reverse_schedule_suggestions, etc.)
--   4. Triggers (cascade updates, auto-calculations)
--   5. RLS policies
--   6. Data backfill
-- =====================================================================

-- [Insert all SQL from sections 1.1, 1.2, 1.3, 1.4 above]

-- =====================================================================
-- STEP: Data Backfill
-- =====================================================================

-- Backfill order_arrivals from shipments
INSERT INTO order_arrivals (
  arrival_number,
  shipment_id,
  warehouse_id,
  shipped_qty,
  arrived_qty,
  expected_arrival_date,
  actual_arrival_date,
  remarks,
  created_at
)
SELECT
  'OA-' || to_char(s.actual_arrival_date, 'YYYY-MM-DD') || '-' ||
    LPAD(ROW_NUMBER() OVER (PARTITION BY s.actual_arrival_date ORDER BY s.id)::TEXT, 3, '0'),
  s.id,
  s.destination_warehouse_id,
  COALESCE(s.unit_count, (SELECT SUM(shipped_qty) FROM shipment_items WHERE shipment_id = s.id)),
  COALESCE(s.unit_count, (SELECT SUM(shipped_qty) FROM shipment_items WHERE shipment_id = s.id)),  -- Assume no variance
  s.planned_arrival_date,
  s.actual_arrival_date,
  'Backfilled from shipments table',
  s.updated_at
FROM shipments s
WHERE s.actual_arrival_date IS NOT NULL
ON CONFLICT (shipment_id) DO NOTHING;

-- Seed system_parameters (already done in section 1.1)

-- Calculate initial PSI snapshots for current week (optional)
-- (Can be done on-demand via Server Action)

-- =====================================================================
-- Migration Complete
-- =====================================================================
COMMENT ON SCHEMA public IS 'SCM V2 Upgrade Complete - Migration 20251210000001';
```

---

### 4.3 Rollback Plan

**If Migration Fails:**

```sql
-- Rollback script
DROP TABLE IF EXISTS order_arrivals CASCADE;
DROP TABLE IF EXISTS psi_weekly_snapshots CASCADE;
DROP TABLE IF EXISTS system_parameters CASCADE;

DROP VIEW IF EXISTS v_psi_weekly_projection CASCADE;
DROP VIEW IF EXISTS v_reverse_schedule_suggestions CASCADE;
DROP VIEW IF EXISTS v_inventory_health_alerts CASCADE;
DROP VIEW IF EXISTS v_production_deliveries_v2 CASCADE;
DROP VIEW IF EXISTS v_shipments_v2 CASCADE;

DROP FUNCTION IF EXISTS get_next_oa_number CASCADE;
DROP FUNCTION IF EXISTS update_inventory_on_arrival CASCADE;
DROP FUNCTION IF EXISTS calculate_po_fulfillment_week CASCADE;
DROP FUNCTION IF EXISTS update_po_fulfillment_status CASCADE;
DROP FUNCTION IF EXISTS cascade_update_po_timeline CASCADE;
DROP FUNCTION IF EXISTS calculate_reverse_schedule CASCADE;

DROP TRIGGER IF EXISTS trg_update_inventory_on_arrival ON order_arrivals;
DROP TRIGGER IF EXISTS trg_calculate_po_fulfillment_week ON purchase_orders;
DROP TRIGGER IF EXISTS trg_update_po_fulfillment_status ON production_deliveries;
DROP TRIGGER IF EXISTS trg_cascade_update_po_timeline ON purchase_orders;
```

---

## 5. Performance Optimization

### 5.1 Database Indexes

**Critical Indexes for V2:**

```sql
-- PSI query performance
CREATE INDEX idx_psi_sku_week ON psi_weekly_snapshots(sku, week_iso);
CREATE INDEX idx_psi_warehouse_week ON psi_weekly_snapshots(warehouse_id, week_iso);
CREATE INDEX idx_psi_status ON psi_weekly_snapshots(stock_status) WHERE stock_status != 'OK';

-- Reverse schedule performance
CREATE INDEX idx_sales_forecasts_coverage ON sales_forecasts(coverage_status) WHERE coverage_status IN ('uncovered', 'partially_covered');
CREATE INDEX idx_po_fulfillment_status ON purchase_orders(fulfillment_status) WHERE fulfillment_status IN ('pending', 'partial');

-- Order arrivals performance
CREATE INDEX idx_order_arrivals_week ON order_arrivals(arrival_week_iso);
CREATE INDEX idx_order_arrivals_warehouse ON order_arrivals(warehouse_id);
CREATE INDEX idx_order_arrivals_variance ON order_arrivals(variance_qty) WHERE variance_qty != 0;
```

---

### 5.2 Materialized View Strategy

For `v_psi_weekly_projection` (24,000+ rows), consider materialized view:

```sql
CREATE MATERIALIZED VIEW mv_psi_weekly_projection AS
SELECT * FROM v_psi_weekly_projection;

-- Create unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX mv_psi_unique_idx ON mv_psi_weekly_projection(sku, warehouse_id, week_iso);

-- Refresh strategy (hourly cron job)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_psi_weekly_projection;
```

**Frontend Query Pattern:**

```typescript
// Use materialized view for dashboard
const { data } = await supabase
  .from('mv_psi_weekly_projection')  // Materialized view
  .select('*')
  .eq('sku', sku)

// Use real-time view for detail page
const { data } = await supabase
  .from('v_psi_weekly_projection')  // Real-time view
  .select('*')
  .eq('sku', sku)
```

---

## 6. Testing Requirements

### 6.1 Unit Tests

**Database Functions:**
- `calculate_reverse_schedule()` - Test with various lead times
- `get_next_oa_number()` - Test sequence generation
- `cascade_update_po_timeline()` - Test trigger logic

**Server Actions:**
- `createOrderArrival()` - Test validation, variance handling
- `calculatePSI()` - Test calculation accuracy
- `calculateChannelAllocation()` - Test DOI balancing algorithm

---

### 6.2 Integration Tests

**End-to-End Flows:**
1. **PO → OF → OS → OA Flow:** Create PO, add delivery, create shipment, record arrival, verify PSI update
2. **Reverse Schedule Flow:** Add uncovered forecast, calculate suggestion, create PO, verify allocation
3. **Cascade Update Flow:** Change PO order date, verify downstream OF/OS/OA dates updated

---

### 6.3 Performance Tests

**Benchmarks:**
- PSI calculation for 500 SKU: < 3 seconds
- Reverse schedule calculation: < 1 second per SKU
- Dashboard KPI aggregation: < 2 seconds

---

## 7. Security & RLS Policies

All new tables have RLS enabled with policies:

```sql
-- Pattern for all V2 tables:
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on {table_name}"
  ON {table_name} FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated write on {table_name}"
  ON {table_name} FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on {table_name}"
  ON {table_name} FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated delete on {table_name}"
  ON {table_name} FOR DELETE
  TO authenticated
  USING (true);
```

**Future Enhancement:** Add role-based policies (e.g., only `procurement_manager` can delete OA records).

---

## 8. Deployment Checklist

### Pre-Deployment
- [ ] Review all SQL migrations for syntax errors
- [ ] Test migrations on staging database
- [ ] Backup production database
- [ ] Create rollback script
- [ ] Review performance impact (EXPLAIN ANALYZE)

### Deployment
- [ ] Run migration: `supabase db push`
- [ ] Verify new tables created: `\dt order_arrivals`
- [ ] Verify triggers created: `\dy`
- [ ] Backfill order_arrivals data
- [ ] Seed system_parameters

### Post-Deployment
- [ ] Test PSI calculation on production data
- [ ] Verify reverse schedule suggestions
- [ ] Check dashboard KPIs
- [ ] Monitor database performance (pg_stat_statements)
- [ ] User acceptance testing (UAT) with 3 key users

---

## 9. Future Enhancements (Out of V2 Scope)

1. **Automated PO Generation:** System auto-creates PO based on suggestions (requires approval workflow)
2. **Real-Time Shipment Tracking:** Integrate with logistics APIs (FedEx, UPS)
3. **Multi-Currency Support:** Handle RMB, EUR, GBP in addition to USD
4. **Supplier Portal:** Allow suppliers to self-report OF status
5. **Scenario Simulation:** "What-if" analysis for lead time changes
6. **Mobile App:** React Native app for warehouse managers

---

## 10. Glossary & Abbreviations

| Term | English | 中文 | Definition |
|------|---------|------|------------|
| **FO** | Forecast Order | 销量预计单 | Sales demand forecast (source of supply chain) |
| **PO** | Purchase Order | 采购订单 | Order to supplier |
| **OF** | Order Fulfillment | 完工申报单 | Factory production completion record |
| **OS** | Order Shipment | 发货单 | Logistics departure record |
| **OA** | Order Arrived | 到仓单 | Warehouse arrival record |
| **PSI** | Production-Sales-Inventory | 进销存 | Weekly inventory accounting table |
| **DOI** | Days of Inventory | 库存周转天数 | Stock / Average Daily Sales |
| **RLS** | Row Level Security | 行级安全 | PostgreSQL security feature |
| **3NF** | Third Normal Form | 第三范式 | Database normalization level |
| **FIFO** | First In First Out | 先进先出 | Allocation algorithm |

---

## 11. References

- **Requirements Document:** `specs/scm-upgrade-v2/requirements.md`
- **Existing Migrations:** `supabase/migrations/`
- **TypeScript Types:** `src/lib/types/database.ts`
- **Next.js Server Actions:** `src/lib/actions/`
- **ShadCN Components:** `src/components/ui/`

---

## 12. Appendix: SQL Function Reference

### Function: `calculate_reverse_schedule(sku, target_week, qty)`
**Returns:** Suggested order/ship/arrival weeks
**Algorithm:** Backtrack from sales week using lead times
**Performance:** < 1 second per call

### Function: `get_next_oa_number(arrival_date)`
**Returns:** Next OA number (OA-YYYY-MM-DD-XXX)
**Algorithm:** Sequential counter per date
**Performance:** < 100ms

### Function: `cascade_update_po_timeline()`
**Trigger:** After UPDATE of `actual_order_date` on `purchase_orders`
**Effect:** Updates downstream OF/OS/OA expected dates
**Performance:** < 500ms for 10 affected records

---

## Document Status

**Status:** ✅ Ready for Engineering Implementation
**Approval Required From:**
- [ ] Product Director (requirements alignment)
- [ ] Backend Specialist (database feasibility)
- [ ] Frontend Artisan (UI/UX feasibility)
- [ ] QA Director (testing coverage)

**Estimated Engineering Effort:** 8-12 weeks
- Backend (Database + API): 4 weeks
- Frontend (UI Components + Pages): 3 weeks
- Integration & Testing: 3 weeks
- Data Migration & UAT: 2 weeks

**Target Go-Live Date:** 2026-Q1 (TBD)

---

**END OF TECHNICAL DESIGN DOCUMENT**

---

**Document Metadata:**
- **Version:** 2.0.0
- **Last Updated:** 2025-12-10
- **Author:** System Architect (Claude Opus 4.5)
- **Word Count:** ~8,500 words
- **SQL LOC:** ~1,200 lines
- **TypeScript LOC:** ~800 lines (estimated)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
