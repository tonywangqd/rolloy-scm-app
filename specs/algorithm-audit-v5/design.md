# Algorithm Audit V5 - Technical Design Document

**Document Version:** 1.0
**Created Date:** 2025-12-09
**System Architect:** Backend Specialist
**Status:** Ready for Implementation

---

## 1. Executive Summary

### 1.1 Design Philosophy

The V5 system architecture is built on three core principles:

1. **Document-Centric Design:** Five documents (FO → PO → OF → OS → OA) form the backbone of data lineage
2. **Dual-Track Reality:** Every planned value has a corresponding actual value (COALESCE pattern)
3. **Immutable Audit Trail:** All linkages stored in junction tables with timestamp + user tracking

**Key Technical Decisions:**
- **Database Pattern:** PostgreSQL with Row Level Security (RLS) + Generated Columns
- **Calculation Strategy:** Materialized Views (refreshed hourly) + Server Actions (mutations)
- **Data Flow:** Read via Queries → Mutate via Server Actions → Validate via Database Constraints

---

## 2. Data Model Design

### 2.1 Document Mapping to Existing Tables

| Document Code | Database Table | Key Fields | Business Entity |
|---------------|----------------|------------|-----------------|
| **FO** (Forecast Order) | `sales_forecasts` | `sku`, `week_iso`, `forecast_qty`, `channel_code` | Sales demand signal |
| **PO** (Purchase Order) | `purchase_orders` + `purchase_order_items` | `po_number`, `supplier_id`, `actual_order_date` | Procurement commitment |
| **OF** (Order Fulfillment) | `production_deliveries` | `delivery_number`, `po_item_id`, `actual_delivery_date`, `delivered_qty` | Factory production output |
| **OS** (Order Shipment) | `shipments` + `shipment_items` | `tracking_number`, `actual_departure_date`, `actual_arrival_date` | Logistics container |
| **OA** (Order Arrived) | `shipments` + `shipment_items` (same as OS) | `actual_arrival_date`, `destination_warehouse_id` | Warehouse receipt |

**Design Note:** OS and OA are modeled as lifecycle states of the same `shipments` table, differentiated by:
- **OS State:** `actual_departure_date IS NOT NULL AND actual_arrival_date IS NULL`
- **OA State:** `actual_arrival_date IS NOT NULL`

---

### 2.2 Core Schema Design

#### 2.2.1 Existing Tables (No Changes Required)

**Table: `sales_forecasts` (FO)**
```sql
-- EXISTING STRUCTURE (No changes)
CREATE TABLE sales_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL REFERENCES products(sku),
  channel_code TEXT NOT NULL REFERENCES channels(channel_code),
  week_iso TEXT NOT NULL,  -- "YYYY-WW" format
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  forecast_qty INTEGER NOT NULL DEFAULT 0,
  is_closed BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  close_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sku, channel_code, week_iso)
);

-- RLS Policy: Users can read all forecasts
ALTER TABLE sales_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated users" ON sales_forecasts FOR SELECT USING (auth.role() = 'authenticated');
```

**Table: `purchase_orders` (PO) + `purchase_order_items`**
```sql
-- EXISTING STRUCTURE (No changes)
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  batch_code TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  po_status po_status_enum NOT NULL DEFAULT 'Draft',
  planned_order_date DATE,
  actual_order_date DATE,  -- ✅ Key field for V5 (PO week calculation)
  planned_ship_date DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES products(sku),
  channel_code TEXT REFERENCES channels(channel_code),
  ordered_qty INTEGER NOT NULL CHECK (ordered_qty > 0),
  delivered_qty INTEGER DEFAULT 0 CHECK (delivered_qty >= 0),
  unit_price_usd NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- ✅ Critical constraint for V5 (prevents over-delivery)
  CONSTRAINT delivered_not_exceed_ordered CHECK (delivered_qty <= ordered_qty)
);
```

**Table: `production_deliveries` (OF)**
```sql
-- EXISTING STRUCTURE (Key fields for V5)
CREATE TABLE production_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number TEXT UNIQUE NOT NULL,
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
  sku TEXT NOT NULL REFERENCES products(sku),
  channel_code TEXT REFERENCES channels(channel_code),
  delivered_qty INTEGER NOT NULL CHECK (delivered_qty > 0),
  planned_delivery_date DATE,
  actual_delivery_date DATE,  -- ✅ Key field for V5 (OF week calculation)
  unit_cost_usd NUMERIC(10,2) NOT NULL,

  -- Computed fields (auto-updated by triggers)
  delivery_month TEXT GENERATED ALWAYS AS (to_char(COALESCE(actual_delivery_date, planned_delivery_date), 'YYYY-MM')) STORED,
  total_value_usd NUMERIC(12,2) GENERATED ALWAYS AS (delivered_qty * unit_cost_usd) STORED,

  -- Payment tracking
  payment_status payment_status_enum DEFAULT 'Pending',
  payment_due_date DATE GENERATED ALWAYS AS (COALESCE(actual_delivery_date, planned_delivery_date) + INTERVAL '60 days') STORED,
  payment_month TEXT GENERATED ALWAYS AS (to_char(COALESCE(actual_delivery_date, planned_delivery_date) + INTERVAL '60 days', 'YYYY-MM')) STORED,

  -- Shipment tracking (updated by triggers)
  shipped_qty INTEGER DEFAULT 0,
  shipment_status delivery_shipment_status_enum DEFAULT 'unshipped',

  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ✅ Critical index for V5 (week-based queries)
CREATE INDEX idx_production_deliveries_actual_date_week ON production_deliveries(
  EXTRACT(ISOYEAR FROM actual_delivery_date),
  EXTRACT(WEEK FROM actual_delivery_date)
) WHERE actual_delivery_date IS NOT NULL;
```

**Table: `shipments` (OS/OA) + `shipment_items`**
```sql
-- EXISTING STRUCTURE (Key fields for V5)
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number TEXT UNIQUE NOT NULL,
  production_delivery_id UUID REFERENCES production_deliveries(id),  -- ❌ DEPRECATED: Old 1:1 model
  batch_code TEXT,
  logistics_batch_code TEXT,
  destination_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  customs_clearance BOOLEAN DEFAULT false,
  logistics_plan TEXT,
  logistics_region region_enum,

  -- OS stage: Departure tracking
  planned_departure_date DATE,
  actual_departure_date DATE,  -- ✅ Key field for V5 (OS week calculation)

  -- Transit tracking
  planned_arrival_days INTEGER,
  planned_arrival_date DATE,

  -- OA stage: Arrival tracking
  actual_arrival_date DATE,  -- ✅ Key field for V5 (OA week calculation)

  -- Computed fields
  actual_transit_days INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN actual_departure_date IS NOT NULL AND actual_arrival_date IS NOT NULL
      THEN actual_arrival_date - actual_departure_date
      ELSE NULL
    END
  ) STORED,
  effective_arrival_date DATE GENERATED ALWAYS AS (COALESCE(actual_arrival_date, planned_arrival_date)) STORED,
  arrival_week_iso TEXT GENERATED ALWAYS AS (
    to_char(COALESCE(actual_arrival_date, planned_arrival_date), 'IYYY-IW')
  ) STORED,

  -- Cost tracking
  weight_kg NUMERIC(10,2),
  unit_count INTEGER,
  cost_per_kg_usd NUMERIC(10,2),
  surcharge_usd NUMERIC(10,2) DEFAULT 0,
  tax_refund_usd NUMERIC(10,2) DEFAULT 0,
  freight_cost_usd NUMERIC(12,2) GENERATED ALWAYS AS (weight_kg * cost_per_kg_usd) STORED,
  total_cost_usd NUMERIC(12,2) GENERATED ALWAYS AS (weight_kg * cost_per_kg_usd + surcharge_usd - tax_refund_usd) STORED,

  -- Payment tracking
  payment_status payment_status_enum DEFAULT 'Pending',
  payment_due_date DATE GENERATED ALWAYS AS (COALESCE(actual_arrival_date, planned_arrival_date) + INTERVAL '30 days') STORED,
  payment_month TEXT GENERATED ALWAYS AS (
    to_char(COALESCE(actual_arrival_date, planned_arrival_date) + INTERVAL '30 days', 'YYYY-MM')
  ) STORED,

  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES products(sku),
  shipped_qty INTEGER NOT NULL CHECK (shipped_qty > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ✅ Critical indexes for V5 (week-based queries)
CREATE INDEX idx_shipments_departure_week ON shipments(
  EXTRACT(ISOYEAR FROM actual_departure_date),
  EXTRACT(WEEK FROM actual_departure_date)
) WHERE actual_departure_date IS NOT NULL;

CREATE INDEX idx_shipments_arrival_week ON shipments(
  EXTRACT(ISOYEAR FROM actual_arrival_date),
  EXTRACT(WEEK FROM actual_arrival_date)
) WHERE actual_arrival_date IS NOT NULL;
```

**Table: `delivery_shipment_allocations` (N:N Junction)**
```sql
-- EXISTING STRUCTURE (Handles split/merge scenarios)
CREATE TABLE delivery_shipment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES production_deliveries(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  shipped_qty INTEGER NOT NULL CHECK (shipped_qty > 0),
  allocated_at TIMESTAMPTZ DEFAULT now(),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- ✅ Prevent duplicate allocations
  UNIQUE(delivery_id, shipment_id)
);

-- ✅ Critical constraint for V5 (prevent over-shipping)
-- Note: This must be validated at application level due to aggregation complexity
-- Trigger function will enforce: SUM(shipped_qty) <= delivery.delivered_qty
```

---

### 2.2.2 New Tables for V5

#### Table: `forecast_order_linkage` (FO → PO Traceability)

```sql
-- NEW: Links purchase orders to forecast demand (M:N relationship)
CREATE TABLE forecast_order_linkage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES sales_forecasts(id) ON DELETE CASCADE,
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,
  allocated_qty INTEGER NOT NULL CHECK (allocated_qty > 0),
  allocation_type TEXT NOT NULL DEFAULT 'auto' CHECK (allocation_type IN ('auto', 'manual')),
  allocated_by UUID REFERENCES auth.users(id),
  allocated_at TIMESTAMPTZ DEFAULT now(),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- ✅ Prevent duplicate allocations
  UNIQUE(forecast_id, po_item_id)
);

-- RLS Policy
ALTER TABLE forecast_order_linkage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated users" ON forecast_order_linkage
  FOR SELECT USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_forecast_order_linkage_forecast ON forecast_order_linkage(forecast_id);
CREATE INDEX idx_forecast_order_linkage_po_item ON forecast_order_linkage(po_item_id);
```

**Business Rule Implementation:**
- **Auto-allocation logic** runs when PO is created (Server Action: `autoAllocateForecastsToPO`)
- Allocation strategy: Earliest unfulfilled forecast weeks first (FIFO)
- Constraint validation: `SUM(allocated_qty) ≤ po_item.ordered_qty` (enforced in Server Action)

---

### 2.3 Materialized View Design

#### View: `v_psi_calculation_12weeks` (PSI Matrix)

```sql
-- NEW: Pre-computed PSI table for 12-week rolling window
CREATE MATERIALIZED VIEW v_psi_calculation_12weeks AS
WITH
-- Step 1: Generate 12-week horizon per SKU
week_range AS (
  SELECT
    p.sku,
    w.week_iso,
    w.week_start_date,
    w.week_end_date,
    ROW_NUMBER() OVER (PARTITION BY p.sku ORDER BY w.week_iso) - 1 AS week_offset
  FROM products p
  CROSS JOIN LATERAL (
    SELECT
      to_char(CURRENT_DATE + (n || ' weeks')::INTERVAL, 'IYYY-IW') AS week_iso,
      date_trunc('week', CURRENT_DATE + (n || ' weeks')::INTERVAL) AS week_start_date,
      date_trunc('week', CURRENT_DATE + (n || ' weeks')::INTERVAL) + INTERVAL '6 days' AS week_end_date
    FROM generate_series(0, 11) AS n
  ) w
  WHERE p.is_active = true
),

-- Step 2: Aggregate sales forecast/actual by week
sales_data AS (
  SELECT
    sku,
    week_iso,
    SUM(forecast_qty) AS sales_forecast,
    COALESCE((
      SELECT SUM(actual_qty)
      FROM sales_actuals sa
      WHERE sa.sku = sf.sku AND sa.week_iso = sf.week_iso
    ), 0) AS sales_actual
  FROM sales_forecasts sf
  GROUP BY sku, week_iso
),

-- Step 3: Aggregate planned arrivals (from PO planned dates)
planned_arrivals AS (
  SELECT
    poi.sku,
    to_char(po.planned_ship_date + (p.production_lead_weeks + 1 + 5) * INTERVAL '7 days', 'IYYY-IW') AS arrival_week_iso,
    SUM(poi.ordered_qty - poi.delivered_qty) AS planned_arrival_qty
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.po_id
  JOIN products p ON p.sku = poi.sku
  WHERE poi.delivered_qty < poi.ordered_qty  -- Only pending orders
    AND po.planned_ship_date IS NOT NULL
  GROUP BY poi.sku, arrival_week_iso
),

-- Step 4: Aggregate actual arrivals (from shipments)
actual_arrivals AS (
  SELECT
    si.sku,
    to_char(s.actual_arrival_date, 'IYYY-IW') AS arrival_week_iso,
    SUM(si.shipped_qty) AS actual_arrival_qty
  FROM shipment_items si
  JOIN shipments s ON s.id = si.shipment_id
  WHERE s.actual_arrival_date IS NOT NULL
  GROUP BY si.sku, arrival_week_iso
),

-- Step 5: Calculate beginning inventory (current stock)
current_inventory AS (
  SELECT
    sku,
    SUM(qty_on_hand) AS beginning_inventory
  FROM inventory_snapshots
  GROUP BY sku
)

-- Final PSI calculation
SELECT
  wr.sku,
  p.product_name,
  p.spu,
  p.safety_stock_weeks,
  wr.week_iso,
  wr.week_start_date,
  wr.week_end_date,
  wr.week_offset,

  -- Beginning Inventory (recursive from previous week)
  COALESCE(ci.beginning_inventory, 0) + COALESCE(
    SUM(aa.actual_arrival_qty - COALESCE(sd.sales_actual, sd.sales_forecast, 0))
      OVER (PARTITION BY wr.sku ORDER BY wr.week_iso ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    0
  ) AS beginning_inventory,

  -- Arrival Data
  COALESCE(pa.planned_arrival_qty, 0) AS planned_arrival,
  COALESCE(aa.actual_arrival_qty, 0) AS actual_arrival,
  COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) AS effective_arrival,

  -- Sales Data
  COALESCE(sd.sales_forecast, 0) AS sales_forecast,
  sd.sales_actual,
  COALESCE(sd.sales_actual, sd.sales_forecast, 0) AS effective_sales,

  -- Calculated Inventory
  COALESCE(ci.beginning_inventory, 0) + COALESCE(
    SUM(aa.actual_arrival_qty - COALESCE(sd.sales_actual, sd.sales_forecast, 0))
      OVER (PARTITION BY wr.sku ORDER BY wr.week_iso ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    0
  ) + COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) - COALESCE(sd.sales_actual, sd.sales_forecast, 0) AS ending_inventory,

  -- Safety Stock Calculation
  COALESCE(sd.sales_actual, sd.sales_forecast, 0) * p.safety_stock_weeks AS safety_threshold,

  -- Weeks of Supply
  CASE
    WHEN COALESCE(sd.sales_actual, sd.sales_forecast, 0) > 0
    THEN (COALESCE(ci.beginning_inventory, 0) + COALESCE(
      SUM(aa.actual_arrival_qty - COALESCE(sd.sales_actual, sd.sales_forecast, 0))
        OVER (PARTITION BY wr.sku ORDER BY wr.week_iso ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
      0
    ) + COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) - COALESCE(sd.sales_actual, sd.sales_forecast, 0))::NUMERIC
      / NULLIF(COALESCE(sd.sales_actual, sd.sales_forecast, 0), 0)
    ELSE NULL
  END AS weeks_of_supply,

  -- Stock Status
  CASE
    WHEN (COALESCE(ci.beginning_inventory, 0) + COALESCE(
      SUM(aa.actual_arrival_qty - COALESCE(sd.sales_actual, sd.sales_forecast, 0))
        OVER (PARTITION BY wr.sku ORDER BY wr.week_iso ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
      0
    ) + COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) - COALESCE(sd.sales_actual, sd.sales_forecast, 0)) <= 0
    THEN 'Stockout'::stock_status
    WHEN (COALESCE(ci.beginning_inventory, 0) + COALESCE(
      SUM(aa.actual_arrival_qty - COALESCE(sd.sales_actual, sd.sales_forecast, 0))
        OVER (PARTITION BY wr.sku ORDER BY wr.week_iso ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
      0
    ) + COALESCE(aa.actual_arrival_qty, pa.planned_arrival_qty, 0) - COALESCE(sd.sales_actual, sd.sales_forecast, 0))
      < (COALESCE(sd.sales_actual, sd.sales_forecast, 0) * p.safety_stock_weeks)
    THEN 'Risk'::stock_status
    ELSE 'OK'::stock_status
  END AS stock_status,

  now() AS calculated_at

FROM week_range wr
JOIN products p ON p.sku = wr.sku
LEFT JOIN sales_data sd ON sd.sku = wr.sku AND sd.week_iso = wr.week_iso
LEFT JOIN planned_arrivals pa ON pa.sku = wr.sku AND pa.arrival_week_iso = wr.week_iso
LEFT JOIN actual_arrivals aa ON aa.sku = wr.sku AND aa.arrival_week_iso = wr.week_iso
LEFT JOIN current_inventory ci ON ci.sku = wr.sku;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_psi_sku_week ON v_psi_calculation_12weeks(sku, week_iso);
CREATE INDEX idx_psi_week ON v_psi_calculation_12weeks(week_iso);
CREATE INDEX idx_psi_stock_status ON v_psi_calculation_12weeks(stock_status) WHERE stock_status != 'OK';

-- Auto-refresh every hour (via pg_cron or scheduled job)
CREATE OR REPLACE FUNCTION refresh_psi_calculation()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_psi_calculation_12weeks;
END;
$$ LANGUAGE plpgsql;
```

**Refresh Strategy:**
- **Trigger:** Run `refresh_psi_calculation()` every hour via cron job
- **Manual Refresh:** Provide admin UI button "Refresh PSI" (calls Server Action)
- **Incremental Refresh:** PostgreSQL `CONCURRENTLY` option ensures zero downtime

---

#### View: `v_audit_traceability` (FO → OA Chain)

```sql
-- NEW: Pre-computed traceability chain for instant lookup
CREATE MATERIALIZED VIEW v_audit_traceability AS
SELECT
  -- OA level (leaf node)
  s.id AS oa_shipment_id,
  s.tracking_number AS oa_tracking_number,
  s.actual_arrival_date AS oa_arrival_date,
  to_char(s.actual_arrival_date, 'IYYY-IW') AS oa_arrival_week,
  si.sku AS oa_sku,
  si.shipped_qty AS oa_qty,
  w.warehouse_code AS oa_warehouse,

  -- OS level (parent of OA)
  s.id AS os_shipment_id,
  s.tracking_number AS os_tracking_number,
  s.actual_departure_date AS os_departure_date,
  to_char(s.actual_departure_date, 'IYYY-IW') AS os_departure_week,

  -- OF level (via N:N allocation)
  dsa.delivery_id AS of_delivery_id,
  pd.delivery_number AS of_delivery_number,
  pd.actual_delivery_date AS of_delivery_date,
  to_char(pd.actual_delivery_date, 'IYYY-IW') AS of_delivery_week,
  pd.delivered_qty AS of_total_qty,
  dsa.shipped_qty AS of_allocated_to_os_qty,

  -- PO level
  poi.id AS po_item_id,
  po.id AS po_id,
  po.po_number,
  po.actual_order_date AS po_order_date,
  to_char(po.actual_order_date, 'IYYY-IW') AS po_order_week,
  poi.ordered_qty AS po_ordered_qty,
  sup.supplier_name AS po_supplier,

  -- FO level (via forecast linkage)
  fol.forecast_id AS fo_forecast_id,
  sf.week_iso AS fo_demand_week,
  sf.forecast_qty AS fo_demand_qty,
  fol.allocated_qty AS fo_allocated_to_po_qty,
  ch.channel_name AS fo_channel,

  -- Variance metrics (Planned vs Actual weeks)
  EXTRACT(WEEK FROM po.planned_ship_date) - EXTRACT(WEEK FROM po.actual_order_date) AS po_week_variance,
  EXTRACT(WEEK FROM pd.planned_delivery_date) - EXTRACT(WEEK FROM pd.actual_delivery_date) AS of_week_variance,
  EXTRACT(WEEK FROM s.planned_arrival_date) - EXTRACT(WEEK FROM s.actual_arrival_date) AS oa_week_variance,

  now() AS calculated_at

FROM shipments s
JOIN shipment_items si ON si.shipment_id = s.id
JOIN warehouses w ON w.id = s.destination_warehouse_id
LEFT JOIN delivery_shipment_allocations dsa ON dsa.shipment_id = s.id
LEFT JOIN production_deliveries pd ON pd.id = dsa.delivery_id
LEFT JOIN purchase_order_items poi ON poi.id = pd.po_item_id
LEFT JOIN purchase_orders po ON po.id = poi.po_id
LEFT JOIN suppliers sup ON sup.id = po.supplier_id
LEFT JOIN forecast_order_linkage fol ON fol.po_item_id = poi.id
LEFT JOIN sales_forecasts sf ON sf.id = fol.forecast_id
LEFT JOIN channels ch ON ch.channel_code = sf.channel_code

WHERE s.actual_arrival_date IS NOT NULL;  -- Only completed shipments

-- Indexes
CREATE UNIQUE INDEX idx_traceability_oa_id ON v_audit_traceability(oa_shipment_id, oa_sku);
CREATE INDEX idx_traceability_sku_week ON v_audit_traceability(oa_sku, oa_arrival_week);
CREATE INDEX idx_traceability_po_number ON v_audit_traceability(po_number);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_audit_traceability()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_audit_traceability;
END;
$$ LANGUAGE plpgsql;
```

---

## 3. TypeScript Interface Definitions

### 3.1 Core Document Types

```typescript
// File: src/lib/types/database.ts (additions to existing file)

/**
 * V5: Forecast-Order Linkage (FO → PO)
 */
export interface ForecastOrderLinkage {
  id: string
  forecast_id: string
  po_item_id: string
  allocated_qty: number
  allocation_type: 'auto' | 'manual'
  allocated_by: string | null
  allocated_at: string
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface ForecastOrderLinkageInsert {
  id?: string
  forecast_id: string
  po_item_id: string
  allocated_qty: number
  allocation_type?: 'auto' | 'manual'
  allocated_by?: string | null
  remarks?: string | null
}

/**
 * V5: PSI Calculation Row (12-week projection)
 */
export interface PSICalculationRow {
  sku: string
  product_name: string
  spu: string
  safety_stock_weeks: number
  week_iso: string
  week_start_date: string
  week_end_date: string
  week_offset: number  // 0 = current week, 1-11 = future weeks

  // Inventory flow
  beginning_inventory: number
  planned_arrival: number
  actual_arrival: number
  effective_arrival: number

  // Sales flow
  sales_forecast: number
  sales_actual: number | null
  effective_sales: number

  // Calculated inventory
  ending_inventory: number
  safety_threshold: number
  weeks_of_supply: number | null
  stock_status: 'OK' | 'Risk' | 'Stockout'

  calculated_at: string
}

/**
 * V5: Audit Traceability Chain (FO → PO → OF → OS → OA)
 */
export interface AuditTraceabilityChain {
  // OA (Arrival)
  oa_shipment_id: string
  oa_tracking_number: string
  oa_arrival_date: string
  oa_arrival_week: string
  oa_sku: string
  oa_qty: number
  oa_warehouse: string

  // OS (Shipment)
  os_shipment_id: string
  os_tracking_number: string
  os_departure_date: string | null
  os_departure_week: string | null

  // OF (Fulfillment)
  of_delivery_id: string | null
  of_delivery_number: string | null
  of_delivery_date: string | null
  of_delivery_week: string | null
  of_total_qty: number | null
  of_allocated_to_os_qty: number | null

  // PO (Purchase Order)
  po_item_id: string | null
  po_id: string | null
  po_number: string | null
  po_order_date: string | null
  po_order_week: string | null
  po_ordered_qty: number | null
  po_supplier: string | null

  // FO (Forecast)
  fo_forecast_id: string | null
  fo_demand_week: string | null
  fo_demand_qty: number | null
  fo_allocated_to_po_qty: number | null
  fo_channel: string | null

  // Variance metrics
  po_week_variance: number | null
  of_week_variance: number | null
  oa_week_variance: number | null

  calculated_at: string
}

/**
 * V5: Document Stage Summary (for Sankey diagram)
 */
export interface DocumentFlowMetrics {
  // Aggregate metrics per stage
  fo_total_demand: number
  po_total_ordered: number
  of_total_delivered: number
  os_total_shipped: number
  oa_total_arrived: number

  // Quantity lost between stages
  fo_to_po_gap: number  // Unfulfilled forecasts
  po_to_of_gap: number  // Pending deliveries
  of_to_os_gap: number  // Awaiting shipment
  os_to_oa_gap: number  // In-transit

  // Time metrics (average days at each stage)
  avg_po_to_of_days: number
  avg_of_to_os_days: number
  avg_os_to_oa_days: number
  avg_total_cycle_days: number
}
```

---

### 3.2 PSI Calculation Function Interface

```typescript
// File: src/lib/queries/psi-calculation.ts (NEW)

import { PSICalculationRow } from '@/lib/types/database'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Fetch PSI calculation data for a specific SKU (12-week projection)
 *
 * @param sku - Product SKU to analyze
 * @param warehouseId - Optional warehouse filter (null = all warehouses aggregated)
 * @returns Array of PSI rows (one per week)
 */
export async function fetchPSICalculation(
  sku: string,
  warehouseId?: string | null
): Promise<PSICalculationRow[]> {
  const supabase = await createServerSupabaseClient()

  // Query materialized view
  let query = supabase
    .from('v_psi_calculation_12weeks')
    .select('*')
    .eq('sku', sku)
    .order('week_iso')

  // Note: Warehouse filtering requires join with inventory_snapshots
  // For now, view aggregates all warehouses

  const { data, error } = await query

  if (error) {
    console.error('[PSI Calculation] Query failed:', error)
    return []
  }

  return data || []
}

/**
 * Fetch PSI summary for all SKUs (for heatmap view)
 *
 * @param filters - Filter criteria (category, stock_status, etc.)
 * @returns Array of PSI rows for all SKUs
 */
export async function fetchPSISummary(filters?: {
  category?: string
  stock_status?: 'OK' | 'Risk' | 'Stockout'
  show_at_risk_only?: boolean
}): Promise<PSICalculationRow[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_psi_calculation_12weeks')
    .select('*')
    .order('sku', { ascending: true })
    .order('week_iso', { ascending: true })

  // Apply filters
  if (filters?.category) {
    query = query.eq('category', filters.category)  // Requires join with products
  }

  if (filters?.stock_status) {
    query = query.eq('stock_status', filters.stock_status)
  }

  if (filters?.show_at_risk_only) {
    query = query.neq('stock_status', 'OK')
  }

  const { data, error } = await query

  if (error) {
    console.error('[PSI Summary] Query failed:', error)
    return []
  }

  return data || []
}

/**
 * Trigger manual refresh of PSI materialized view
 * (Use sparingly - should be on hourly cron by default)
 */
export async function refreshPSICalculation(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.rpc('refresh_psi_calculation')

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
```

---

### 3.3 Traceability Query Interface

```typescript
// File: src/lib/queries/audit-traceability.ts (NEW)

import { AuditTraceabilityChain, DocumentFlowMetrics } from '@/lib/types/database'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Fetch full traceability chain for a specific OA (arrived shipment)
 *
 * @param shipmentId - Shipment ID (OA record)
 * @param sku - Optional SKU filter (for multi-SKU shipments)
 * @returns Array of traceability chains (one per SKU in shipment)
 */
export async function fetchTraceabilityChain(
  shipmentId: string,
  sku?: string
): Promise<AuditTraceabilityChain[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_audit_traceability')
    .select('*')
    .eq('oa_shipment_id', shipmentId)

  if (sku) {
    query = query.eq('oa_sku', sku)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Traceability] Query failed:', error)
    return []
  }

  return data || []
}

/**
 * Fetch traceability chains for a date range (for variance analysis)
 *
 * @param startWeek - Start week (YYYY-WW)
 * @param endWeek - End week (YYYY-WW)
 * @param filters - Optional filters (sku, supplier, warehouse)
 * @returns Array of traceability chains
 */
export async function fetchTraceabilityByDateRange(
  startWeek: string,
  endWeek: string,
  filters?: {
    sku?: string
    po_supplier?: string
    oa_warehouse?: string
  }
): Promise<AuditTraceabilityChain[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_audit_traceability')
    .select('*')
    .gte('oa_arrival_week', startWeek)
    .lte('oa_arrival_week', endWeek)
    .order('oa_arrival_week')

  if (filters?.sku) {
    query = query.eq('oa_sku', filters.sku)
  }

  if (filters?.po_supplier) {
    query = query.eq('po_supplier', filters.po_supplier)
  }

  if (filters?.oa_warehouse) {
    query = query.eq('oa_warehouse', filters.oa_warehouse)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Traceability Range] Query failed:', error)
    return []
  }

  return data || []
}

/**
 * Calculate document flow metrics (for Sankey diagram)
 *
 * @param startWeek - Start week (YYYY-WW)
 * @param endWeek - End week (YYYY-WW)
 * @returns Aggregated metrics for each document stage
 */
export async function fetchDocumentFlowMetrics(
  startWeek: string,
  endWeek: string
): Promise<DocumentFlowMetrics> {
  const supabase = await createServerSupabaseClient()

  // Aggregate metrics from traceability view
  const { data, error } = await supabase.rpc('calculate_document_flow_metrics', {
    p_start_week: startWeek,
    p_end_week: endWeek
  })

  if (error) {
    console.error('[Flow Metrics] Query failed:', error)
    return {
      fo_total_demand: 0,
      po_total_ordered: 0,
      of_total_delivered: 0,
      os_total_shipped: 0,
      oa_total_arrived: 0,
      fo_to_po_gap: 0,
      po_to_of_gap: 0,
      of_to_os_gap: 0,
      os_to_oa_gap: 0,
      avg_po_to_of_days: 0,
      avg_of_to_os_days: 0,
      avg_os_to_oa_days: 0,
      avg_total_cycle_days: 0,
    }
  }

  return data
}
```

**Database Function:**
```sql
-- NEW: Calculate document flow metrics (for Sankey diagram)
CREATE OR REPLACE FUNCTION calculate_document_flow_metrics(
  p_start_week TEXT,
  p_end_week TEXT
)
RETURNS TABLE(
  fo_total_demand BIGINT,
  po_total_ordered BIGINT,
  of_total_delivered BIGINT,
  os_total_shipped BIGINT,
  oa_total_arrived BIGINT,
  fo_to_po_gap BIGINT,
  po_to_of_gap BIGINT,
  of_to_os_gap BIGINT,
  os_to_oa_gap BIGINT,
  avg_po_to_of_days NUMERIC,
  avg_of_to_os_days NUMERIC,
  avg_os_to_oa_days NUMERIC,
  avg_total_cycle_days NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH metrics AS (
    SELECT
      COALESCE(SUM(fo_demand_qty), 0) AS fo_demand,
      COALESCE(SUM(po_ordered_qty), 0) AS po_ordered,
      COALESCE(SUM(of_total_qty), 0) AS of_delivered,
      COALESCE(SUM(of_allocated_to_os_qty), 0) AS os_shipped,
      COALESCE(SUM(oa_qty), 0) AS oa_arrived,
      AVG(EXTRACT(DAY FROM of_delivery_date - po_order_date)) AS avg_po_to_of,
      AVG(EXTRACT(DAY FROM os_departure_date - of_delivery_date)) AS avg_of_to_os,
      AVG(EXTRACT(DAY FROM oa_arrival_date - os_departure_date)) AS avg_os_to_oa,
      AVG(EXTRACT(DAY FROM oa_arrival_date - po_order_date)) AS avg_total
    FROM v_audit_traceability
    WHERE oa_arrival_week BETWEEN p_start_week AND p_end_week
  )
  SELECT
    m.fo_demand::BIGINT,
    m.po_ordered::BIGINT,
    m.of_delivered::BIGINT,
    m.os_shipped::BIGINT,
    m.oa_arrived::BIGINT,
    (m.fo_demand - m.po_ordered)::BIGINT AS fo_to_po_gap,
    (m.po_ordered - m.of_delivered)::BIGINT AS po_to_of_gap,
    (m.of_delivered - m.os_shipped)::BIGINT AS of_to_os_gap,
    (m.os_shipped - m.oa_arrived)::BIGINT AS os_to_oa_gap,
    ROUND(m.avg_po_to_of, 1),
    ROUND(m.avg_of_to_os, 1),
    ROUND(m.avg_os_to_oa, 1),
    ROUND(m.avg_total, 1)
  FROM metrics m;
END;
$$ LANGUAGE plpgsql;
```

---

## 4. Data Validation Rules

### 4.1 Constraint Implementation

#### Rule BR-001: OF Quantity ≤ PO Quantity

**Implementation:** Database Trigger (prevents over-delivery)

```sql
-- Trigger: Validate delivery quantity does not exceed PO ordered quantity
CREATE OR REPLACE FUNCTION validate_delivery_qty_constraint()
RETURNS TRIGGER AS $$
DECLARE
  v_ordered_qty INTEGER;
  v_total_delivered INTEGER;
BEGIN
  -- Get PO item ordered quantity
  SELECT ordered_qty INTO v_ordered_qty
  FROM purchase_order_items
  WHERE id = NEW.po_item_id;

  -- Calculate total delivered (including this new delivery)
  SELECT COALESCE(SUM(delivered_qty), 0) + NEW.delivered_qty
  INTO v_total_delivered
  FROM production_deliveries
  WHERE po_item_id = NEW.po_item_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  -- Validate constraint
  IF v_total_delivered > v_ordered_qty THEN
    RAISE EXCEPTION 'Total delivered quantity (%) exceeds PO ordered quantity (%)',
      v_total_delivered, v_ordered_qty;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_delivery_qty
  BEFORE INSERT OR UPDATE ON production_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION validate_delivery_qty_constraint();
```

---

#### Rule BR-002: OA Quantity ≤ OS Quantity

**Implementation:** Database Trigger (prevents over-receiving)

```sql
-- Trigger: Validate allocation quantity does not exceed delivery quantity
CREATE OR REPLACE FUNCTION validate_allocation_qty_constraint()
RETURNS TRIGGER AS $$
DECLARE
  v_delivered_qty INTEGER;
  v_total_allocated INTEGER;
BEGIN
  -- Get delivery quantity
  SELECT delivered_qty INTO v_delivered_qty
  FROM production_deliveries
  WHERE id = NEW.delivery_id;

  -- Calculate total allocated (including this new allocation)
  SELECT COALESCE(SUM(shipped_qty), 0) + NEW.shipped_qty
  INTO v_total_allocated
  FROM delivery_shipment_allocations
  WHERE delivery_id = NEW.delivery_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  -- Validate constraint
  IF v_total_allocated > v_delivered_qty THEN
    RAISE EXCEPTION 'Total allocated quantity (%) exceeds delivery quantity (%)',
      v_total_allocated, v_delivered_qty;
  END IF;

  -- Update production_deliveries.shipped_qty
  UPDATE production_deliveries
  SET
    shipped_qty = v_total_allocated,
    shipment_status = CASE
      WHEN v_total_allocated = v_delivered_qty THEN 'fully_shipped'::delivery_shipment_status_enum
      WHEN v_total_allocated > 0 THEN 'partial'::delivery_shipment_status_enum
      ELSE 'unshipped'::delivery_shipment_status_enum
    END
  WHERE id = NEW.delivery_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_allocation_qty
  BEFORE INSERT OR UPDATE ON delivery_shipment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION validate_allocation_qty_constraint();
```

---

#### Rule BR-003: Prevent PO Deletion with Linked OF

**Implementation:** Database Foreign Key Policy

```sql
-- Already enforced by existing foreign key constraint:
-- production_deliveries.po_item_id REFERENCES purchase_order_items(id)

-- Additional soft-delete pattern (recommended)
ALTER TABLE purchase_orders ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE purchase_order_items ADD COLUMN deleted_at TIMESTAMPTZ;

-- Update RLS policies to exclude deleted records
CREATE POLICY "Exclude deleted POs" ON purchase_orders
  FOR SELECT USING (deleted_at IS NULL);
```

---

### 4.2 Time Logic Validation

#### Rule BR-101: OF Date < PO Date (Anomaly Detection)

**Implementation:** Application-level validation (non-blocking warning)

```typescript
// File: src/lib/actions/production-delivery.ts

export async function validateDeliveryDates(
  poOrderDate: string | null,
  deliveryDate: string | null
): Promise<{ valid: boolean; warning?: string }> {
  if (!poOrderDate || !deliveryDate) {
    return { valid: true }
  }

  const poDate = new Date(poOrderDate)
  const ofDate = new Date(deliveryDate)

  if (ofDate < poDate) {
    return {
      valid: true, // Non-blocking
      warning: `Delivery date (${deliveryDate}) is earlier than PO order date (${poOrderDate}). Please verify.`
    }
  }

  return { valid: true }
}
```

---

#### Rule BR-102: OA Date < OS Date (Hard Error)

**Implementation:** Database Trigger

```sql
-- Trigger: Prevent arrival date earlier than departure date
CREATE OR REPLACE FUNCTION validate_shipment_date_sequence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.actual_arrival_date IS NOT NULL
     AND NEW.actual_departure_date IS NOT NULL
     AND NEW.actual_arrival_date < NEW.actual_departure_date THEN
    RAISE EXCEPTION 'Arrival date (%) cannot be earlier than departure date (%)',
      NEW.actual_arrival_date, NEW.actual_departure_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_shipment_dates
  BEFORE INSERT OR UPDATE ON shipments
  FOR EACH ROW
  EXECUTE FUNCTION validate_shipment_date_sequence();
```

---

## 5. Server Action Specifications

### 5.1 Auto-Allocation: Forecast → PO

```typescript
// File: src/lib/actions/forecast-allocation.ts (NEW)

'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Automatically allocate forecasts to a PO item
 * Strategy: FIFO (earliest unfulfilled forecast weeks first)
 *
 * @param poItemId - Purchase order item ID
 * @param allocatedBy - User ID performing the allocation
 * @returns Success status + allocated forecast IDs
 */
export async function autoAllocateForecastsToPO(
  poItemId: string,
  allocatedBy: string
): Promise<{
  success: boolean
  error?: string
  allocations?: {
    forecast_id: string
    week_iso: string
    allocated_qty: number
  }[]
}> {
  const supabase = await createServerSupabaseClient()

  // Step 1: Get PO item details
  const { data: poItem, error: poItemError } = await supabase
    .from('purchase_order_items')
    .select('id, sku, channel_code, ordered_qty, purchase_orders!inner(actual_order_date)')
    .eq('id', poItemId)
    .single()

  if (poItemError || !poItem) {
    return { success: false, error: 'PO item not found' }
  }

  // Step 2: Find matching forecasts (unfulfilled, earliest first)
  const { data: forecasts, error: forecastError } = await supabase
    .from('sales_forecasts')
    .select('id, week_iso, forecast_qty')
    .eq('sku', poItem.sku)
    .eq('channel_code', poItem.channel_code)
    .eq('is_closed', false)
    .order('week_iso', { ascending: true })

  if (forecastError || !forecasts || forecasts.length === 0) {
    return { success: false, error: 'No matching forecasts found' }
  }

  // Step 3: Calculate unallocated quantities per forecast
  const unallocatedForecasts: Array<{
    forecast_id: string
    week_iso: string
    remaining_qty: number
  }> = []

  for (const forecast of forecasts) {
    const { data: existingAllocations } = await supabase
      .from('forecast_order_linkage')
      .select('allocated_qty')
      .eq('forecast_id', forecast.id)

    const totalAllocated = existingAllocations?.reduce((sum, a) => sum + a.allocated_qty, 0) || 0
    const remaining = forecast.forecast_qty - totalAllocated

    if (remaining > 0) {
      unallocatedForecasts.push({
        forecast_id: forecast.id,
        week_iso: forecast.week_iso,
        remaining_qty: remaining
      })
    }
  }

  // Step 4: Allocate PO quantity to forecasts (FIFO)
  let remainingPOQty = poItem.ordered_qty
  const allocations: Array<{
    forecast_id: string
    week_iso: string
    allocated_qty: number
  }> = []

  for (const forecast of unallocatedForecasts) {
    if (remainingPOQty <= 0) break

    const qtyToAllocate = Math.min(remainingPOQty, forecast.remaining_qty)

    // Insert linkage
    const { error: insertError } = await supabase
      .from('forecast_order_linkage')
      .insert({
        forecast_id: forecast.forecast_id,
        po_item_id: poItemId,
        allocated_qty: qtyToAllocate,
        allocation_type: 'auto',
        allocated_by: allocatedBy
      })

    if (insertError) {
      console.error('[Auto Allocate] Insert failed:', insertError)
      continue
    }

    allocations.push({
      forecast_id: forecast.forecast_id,
      week_iso: forecast.week_iso,
      allocated_qty: qtyToAllocate
    })

    remainingPOQty -= qtyToAllocate
  }

  revalidatePath('/procurement')

  return { success: true, allocations }
}
```

---

### 5.2 PSI Drill-Down Details

```typescript
// File: src/lib/actions/psi-details.ts (NEW)

'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Fetch detailed breakdown for a PSI cell (for modal view)
 *
 * @param sku - Product SKU
 * @param weekIso - Week ISO string (YYYY-WW)
 * @returns Detailed breakdown of PSI calculation
 */
export async function fetchPSICellDetails(
  sku: string,
  weekIso: string
): Promise<{
  success: boolean
  error?: string
  details?: {
    beginning_inventory: number
    planned_arrivals: Array<{ po_number: string; qty: number }>
    actual_arrivals: Array<{ tracking_number: string; qty: number; arrival_date: string }>
    sales_forecast: number
    sales_actual: number | null
    ending_inventory: number
    weeks_of_supply: number | null
  }
}> {
  const supabase = await createServerSupabaseClient()

  // Fetch PSI row
  const { data: psiRow, error: psiError } = await supabase
    .from('v_psi_calculation_12weeks')
    .select('*')
    .eq('sku', sku)
    .eq('week_iso', weekIso)
    .single()

  if (psiError || !psiRow) {
    return { success: false, error: 'PSI data not found' }
  }

  // Fetch planned arrivals (from POs)
  const weekStart = new Date(psiRow.week_start_date)
  const weekEnd = new Date(psiRow.week_end_date)

  const { data: plannedPOs } = await supabase
    .from('purchase_order_items')
    .select(`
      ordered_qty,
      delivered_qty,
      purchase_orders!inner(po_number, planned_ship_date),
      products!inner(production_lead_weeks)
    `)
    .eq('sku', sku)
    .lt('delivered_qty', 'ordered_qty')  -- Only pending orders

  const plannedArrivals = (plannedPOs || [])
    .filter(item => {
      const po = Array.isArray(item.purchase_orders) ? item.purchase_orders[0] : item.purchase_orders
      if (!po?.planned_ship_date) return false

      const product = Array.isArray(item.products) ? item.products[0] : item.products
      const arrivalDate = new Date(po.planned_ship_date)
      arrivalDate.setDate(arrivalDate.getDate() + (product.production_lead_weeks + 1 + 5) * 7)

      return arrivalDate >= weekStart && arrivalDate <= weekEnd
    })
    .map(item => {
      const po = Array.isArray(item.purchase_orders) ? item.purchase_orders[0] : item.purchase_orders
      return {
        po_number: po.po_number,
        qty: item.ordered_qty - item.delivered_qty
      }
    })

  // Fetch actual arrivals (from shipments)
  const { data: actualShipments } = await supabase
    .from('shipments')
    .select(`
      tracking_number,
      actual_arrival_date,
      shipment_items!inner(sku, shipped_qty)
    `)
    .eq('shipment_items.sku', sku)
    .gte('actual_arrival_date', psiRow.week_start_date)
    .lte('actual_arrival_date', psiRow.week_end_date)

  const actualArrivals = (actualShipments || []).map(shipment => {
    const items = Array.isArray(shipment.shipment_items) ? shipment.shipment_items : [shipment.shipment_items]
    const totalQty = items.reduce((sum, item) => sum + (item.sku === sku ? item.shipped_qty : 0), 0)

    return {
      tracking_number: shipment.tracking_number,
      qty: totalQty,
      arrival_date: shipment.actual_arrival_date
    }
  })

  return {
    success: true,
    details: {
      beginning_inventory: psiRow.beginning_inventory,
      planned_arrivals: plannedArrivals,
      actual_arrivals: actualArrivals,
      sales_forecast: psiRow.sales_forecast,
      sales_actual: psiRow.sales_actual,
      ending_inventory: psiRow.ending_inventory,
      weeks_of_supply: psiRow.weeks_of_supply
    }
  }
}
```

---

## 6. Component Strategy

### 6.1 PSI Heatmap (Recharts)

**Component Path:** `src/components/algorithm-audit-v5/PSIHeatmap.tsx`

**Data Source:** `fetchPSISummary()` from `lib/queries/psi-calculation.ts`

**Implementation Notes:**
- Use ShadCN `Table` component for grid layout
- Each cell styled with dynamic background color based on `stock_status`
- Click handler opens modal with `fetchPSICellDetails()` data
- Export to Excel button calls Server Action `exportPSIToExcel()`

---

### 6.2 Traceability Flow Diagram (Recharts Sankey)

**Component Path:** `src/components/algorithm-audit-v5/TraceabilityFlow.tsx`

**Data Source:** `fetchDocumentFlowMetrics()` from `lib/queries/audit-traceability.ts`

**Implementation Notes:**
- Use Recharts `Sankey` chart (requires custom node positioning)
- Nodes: FO → PO → OF → OS → OA (5 stages)
- Edges: Thickness proportional to quantity
- Annotations: Show quantity lost between stages (gap metrics)
- Interactive: Click node to filter detail table below

---

### 6.3 Variance Trend Chart (Recharts Combo)

**Component Path:** `src/components/algorithm-audit-v5/VarianceTrendChart.tsx`

**Data Source:** `fetchTraceabilityByDateRange()` from `lib/queries/audit-traceability.ts`

**Implementation Notes:**
- Use Recharts `ComposedChart` (Bar + Line)
- X-axis: Week ISO (from `oa_arrival_week`)
- Y-axis (left): Number of shipments (bar chart)
- Y-axis (right): On-time rate % (line chart)
- Data processing: Calculate variance statistics per week in component

---

## 7. Migration Strategy

### 7.1 Data Migration Steps

**Phase 1: Schema Migration (Week 1)**
1. Create new table `forecast_order_linkage`
2. Create new materialized views `v_psi_calculation_12weeks` and `v_audit_traceability`
3. Create database functions: `refresh_psi_calculation()`, `calculate_document_flow_metrics()`
4. Add database triggers for constraint validation (BR-001, BR-002, BR-102)

**Phase 2: Historical Data Backfill (Week 2)**
1. Run auto-allocation script for existing POs:
   ```sql
   -- Backfill forecast allocations (run once)
   INSERT INTO forecast_order_linkage (forecast_id, po_item_id, allocated_qty, allocation_type, allocated_by)
   SELECT
     sf.id AS forecast_id,
     poi.id AS po_item_id,
     LEAST(sf.forecast_qty, poi.ordered_qty) AS allocated_qty,
     'auto'::TEXT AS allocation_type,
     '00000000-0000-0000-0000-000000000000'::UUID AS allocated_by
   FROM sales_forecasts sf
   JOIN purchase_order_items poi ON poi.sku = sf.sku AND poi.channel_code = sf.channel_code
   WHERE sf.week_iso <= to_char(CURRENT_DATE, 'IYYY-IW')
   ON CONFLICT (forecast_id, po_item_id) DO NOTHING;
   ```

2. Refresh materialized views:
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY v_psi_calculation_12weeks;
   REFRESH MATERIALIZED VIEW CONCURRENTLY v_audit_traceability;
   ```

**Phase 3: Validation (Week 2-3)**
1. Spot-check PSI calculations against Excel baseline (20 SKUs)
2. Verify traceability chains for 100 random shipments
3. Run data integrity checks (orphaned records, constraint violations)

---

### 7.2 Rollback Plan

If critical issues are discovered post-deployment:

1. **Immediate Rollback (< 2 hours):**
   - Drop new materialized views
   - Drop new table `forecast_order_linkage`
   - Restore previous algorithm audit logic (V4)

2. **Data Preservation:**
   - Backup `forecast_order_linkage` table before rollback
   - Archive traceability data to cold storage

---

## 8. Performance Optimization

### 8.1 Indexing Strategy

**Critical Indexes (Already Covered Above):**
- `idx_production_deliveries_actual_date_week` (week-based queries)
- `idx_shipments_departure_week` (OS week queries)
- `idx_shipments_arrival_week` (OA week queries)
- `idx_forecast_order_linkage_forecast` (traceability joins)
- `idx_forecast_order_linkage_po_item` (reverse lookup)

**Composite Indexes (Advanced):**
```sql
-- Optimize PSI calculation (sku + week range)
CREATE INDEX idx_sales_forecasts_sku_week ON sales_forecasts(sku, week_iso);
CREATE INDEX idx_shipment_items_sku ON shipment_items(sku);

-- Optimize traceability queries (common filter combinations)
CREATE INDEX idx_audit_traceability_sku_week ON v_audit_traceability(oa_sku, oa_arrival_week);
```

---

### 8.2 Caching Strategy

**Materialized View Refresh Schedule:**
- **Default:** Refresh every hour via `pg_cron`:
  ```sql
  SELECT cron.schedule('refresh-psi', '0 * * * *', 'SELECT refresh_psi_calculation()');
  SELECT cron.schedule('refresh-traceability', '15 * * * *', 'SELECT refresh_audit_traceability()');
  ```
- **Manual Trigger:** Provide admin button to force refresh

**Next.js Caching:**
- PSI page: `revalidate = 3600` (1 hour)
- Traceability detail: `revalidate = 600` (10 minutes)
- Variance reports: No cache (always fresh data)

---

## 9. Data Validation Checklist

### 9.1 Pre-Deployment Tests

- [ ] PSI calculation matches Excel baseline (20 SKUs, 12 weeks each)
- [ ] Traceability chain displays correctly for 100 random shipments
- [ ] Document flow metrics aggregate correctly (Q4 2025 data)
- [ ] Constraint triggers prevent over-delivery (test BR-001, BR-002)
- [ ] Time validation triggers prevent date inversions (test BR-102)
- [ ] Auto-allocation correctly distributes PO to earliest forecasts

### 9.2 Post-Deployment Monitoring

- [ ] Monitor materialized view refresh time (target: < 5 minutes)
- [ ] Track query performance: All queries < 1s (check `pg_stat_statements`)
- [ ] Verify zero orphaned records in `forecast_order_linkage`
- [ ] Check data completeness: All POs linked to at least one forecast

---

## 10. API Contracts (Summary)

### 10.1 Query Functions

| Function | Path | Parameters | Return Type |
|----------|------|------------|-------------|
| `fetchPSICalculation` | `lib/queries/psi-calculation.ts` | `sku`, `warehouseId?` | `PSICalculationRow[]` |
| `fetchPSISummary` | `lib/queries/psi-calculation.ts` | `filters?` | `PSICalculationRow[]` |
| `fetchTraceabilityChain` | `lib/queries/audit-traceability.ts` | `shipmentId`, `sku?` | `AuditTraceabilityChain[]` |
| `fetchDocumentFlowMetrics` | `lib/queries/audit-traceability.ts` | `startWeek`, `endWeek` | `DocumentFlowMetrics` |

---

### 10.2 Server Actions

| Action | Path | Parameters | Return Type |
|--------|------|------------|-------------|
| `autoAllocateForecastsToPO` | `lib/actions/forecast-allocation.ts` | `poItemId`, `allocatedBy` | `{ success, allocations[] }` |
| `fetchPSICellDetails` | `lib/actions/psi-details.ts` | `sku`, `weekIso` | `{ success, details }` |
| `refreshPSICalculation` | `lib/queries/psi-calculation.ts` | - | `{ success, error? }` |

---

## 11. Out of Scope (V5 Phase)

1. **Multi-Warehouse PSI:** V5 aggregates all warehouses. Per-warehouse view deferred to V6.
2. **Real-Time Shipment Tracking:** Manual date updates only (no carrier API integration).
3. **What-If Scenario Simulation:** No sandbox mode for testing different lead times.
4. **Automated PO Generation:** System displays suggestions only; human approval required.
5. **Multi-Currency Support:** All calculations in single currency (USD).

---

## 12. Success Criteria

### 12.1 Functional Acceptance

- [ ] PSI heatmap loads in < 3 seconds for 500 SKUs
- [ ] Traceability chain displays in < 500ms per shipment
- [ ] Variance report generates in < 5 seconds for 1000 shipments
- [ ] All user stories (from requirements.md) pass manual testing

### 12.2 Data Integrity

- [ ] Zero constraint violations in production data
- [ ] 100% traceability coverage (all OA linked to FO)
- [ ] PSI calculations match Excel baseline (0% deviation)

---

**Document Status:** Ready for Implementation
**Next Step:** Backend Specialist implements database migrations + Server Actions
**Estimated Effort:** 3 weeks (1 week schema + 1 week queries + 1 week validation)
