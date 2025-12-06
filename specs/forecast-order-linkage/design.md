# Technical Design: Forecast-Order Linkage & Variance Management

## Document Information

- **Version**: 1.0
- **Created**: 2025-12-06
- **System Architect**: Claude (Chief System Architect)
- **Status**: Ready for Implementation
- **Requirements Reference**: `specs/forecast-order-linkage/requirements.md`

---

## 1. Architecture Overview

### 1.1 System Design Principles

This feature implements a **many-to-many relationship** between sales forecasts and purchase orders with the following architectural pillars:

1. **Data Integrity**: All mutations use PostgreSQL stored procedures with ACID transactions
2. **Security**: Row Level Security (RLS) policies on all new tables
3. **Performance**: Materialized views for complex aggregations with manual refresh
4. **Audit Trail**: Comprehensive logging for all critical operations (deletions, allocations, variance resolutions)

### 1.2 Technology Stack

- **Database**: PostgreSQL 15+ (via Supabase)
- **Backend**: Next.js Server Actions (TypeScript)
- **Frontend**: React 19 + ShadCN UI components
- **Real-time Calculation**: Materialized view `v_forecast_coverage` (refresh on-demand)

---

## 2. Database Schema Design

### 2.1 New Tables

#### Table 1: `forecast_order_allocations`

**Purpose**: Many-to-many linkage between forecasts and purchase order items

```sql
CREATE TABLE forecast_order_allocations (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  forecast_id UUID NOT NULL REFERENCES sales_forecasts(id) ON DELETE CASCADE,
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,

  -- Allocation Data
  allocated_qty INTEGER NOT NULL CHECK (allocated_qty > 0),

  -- Metadata
  allocation_type TEXT DEFAULT 'manual' CHECK (allocation_type IN ('manual', 'auto')),
  allocated_by UUID REFERENCES auth.users(id),
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  remarks TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_forecast_po_item UNIQUE (forecast_id, po_item_id),
  CONSTRAINT fk_forecast_id FOREIGN KEY (forecast_id) REFERENCES sales_forecasts(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_item_id FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_allocations_forecast ON forecast_order_allocations(forecast_id);
CREATE INDEX idx_allocations_po_item ON forecast_order_allocations(po_item_id);
CREATE INDEX idx_allocations_type ON forecast_order_allocations(allocation_type);
CREATE INDEX idx_allocations_allocated_at ON forecast_order_allocations(allocated_at DESC);

-- Comments
COMMENT ON TABLE forecast_order_allocations IS 'Links purchase order items to sales forecasts for demand coverage tracking';
COMMENT ON COLUMN forecast_order_allocations.allocated_qty IS 'Quantity allocated from PO item to fulfill this forecast';
COMMENT ON COLUMN forecast_order_allocations.allocation_type IS 'manual: user-created, auto: algorithm-generated';
```

**Business Rules**:
1. Total `allocated_qty` per `po_item_id` cannot exceed `purchase_order_items.ordered_qty`
2. Allocation only allowed when `forecast.sku = po_item.sku` AND `forecast.channel_code = po_item.channel_code`
3. Allocation is soft-deleted when parent PO is cancelled (via CASCADE)

---

#### Table 2: `forecast_variance_resolutions`

**Purpose**: Track and resolve forecast quantity adjustments after orders are placed

```sql
CREATE TABLE forecast_variance_resolutions (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Key
  forecast_id UUID NOT NULL REFERENCES sales_forecasts(id) ON DELETE CASCADE,

  -- Variance Data
  original_forecast_qty INTEGER NOT NULL,
  adjusted_forecast_qty INTEGER NOT NULL,
  variance_qty INTEGER NOT NULL, -- (adjusted - original)
  variance_type TEXT NOT NULL CHECK (variance_type IN ('increase', 'decrease')),
  variance_percentage DECIMAL(5,2) NOT NULL, -- ((variance_qty / original) * 100)

  -- Resolution
  resolution_action TEXT CHECK (resolution_action IN (
    'create_supplemental_order',
    'reallocate_to_future',
    'accept_as_safety_stock',
    'cancel_excess',
    'pending_review'
  )),
  resolution_status TEXT DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'resolved', 'cancelled')),
  resolution_notes TEXT,

  -- Metadata
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_variance_forecast ON forecast_variance_resolutions(forecast_id);
CREATE INDEX idx_variance_status ON forecast_variance_resolutions(resolution_status);
CREATE INDEX idx_variance_detected ON forecast_variance_resolutions(detected_at DESC);

-- Comments
COMMENT ON TABLE forecast_variance_resolutions IS 'Tracks forecast adjustments after orders placed and resolution actions';
COMMENT ON COLUMN forecast_variance_resolutions.variance_percentage IS 'Percentage change: (variance_qty / original_qty) * 100';
```

**Business Rules**:
1. Variance record created automatically when `sales_forecasts.forecast_qty` is updated AND allocations exist
2. `variance_type = 'increase'` when `adjusted_forecast_qty > original_forecast_qty`
3. `variance_type = 'decrease'` when `adjusted_forecast_qty < original_forecast_qty`
4. Auto-resolve if `ABS(variance_percentage) < 10%` (accept as minor fluctuation)

---

#### Table 3: `delivery_deletion_audit_log`

**Purpose**: Audit trail for deleted production delivery records

```sql
CREATE TABLE delivery_deletion_audit_log (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference (delivery is deleted, so no FK)
  delivery_id UUID NOT NULL,
  delivery_number TEXT NOT NULL,

  -- Snapshot of deleted record
  delivery_snapshot JSONB NOT NULL, -- Full record before deletion

  -- Deletion context
  deleted_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_reason TEXT,

  -- Rollback details
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
  rolled_back_qty INTEGER NOT NULL, -- Qty that was decremented from delivered_qty

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_delivery_deletion_delivery_id ON delivery_deletion_audit_log(delivery_id);
CREATE INDEX idx_delivery_deletion_po_item ON delivery_deletion_audit_log(po_item_id);
CREATE INDEX idx_delivery_deletion_deleted_at ON delivery_deletion_audit_log(deleted_at DESC);

-- Comments
COMMENT ON TABLE delivery_deletion_audit_log IS 'Audit trail for all deleted production delivery records';
COMMENT ON COLUMN delivery_deletion_audit_log.delivery_snapshot IS 'Full JSONB snapshot of delivery record before deletion';
```

**Business Rules**:
1. Record created BEFORE deleting `production_deliveries` record
2. Snapshot includes all fields + related PO/shipment information
3. Immutable: no updates allowed after creation

---

### 2.2 Modified Tables

#### Modification: `production_deliveries` - Add Shipment Link

**Change**: Add foreign key to track which shipment this delivery is linked to

```sql
-- Add shipment_id column to production_deliveries
ALTER TABLE production_deliveries
ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES shipments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_deliveries_shipment
ON production_deliveries(shipment_id);

COMMENT ON COLUMN production_deliveries.shipment_id IS 'Shipment that this delivery was sent in (blocks deletion if not NULL)';
```

**Rationale**: We need to block delivery deletion if the delivery has been shipped. The `shipment_items` table links shipments to SKUs, but doesn't link to specific deliveries. This column creates a direct reference.

**Alternative Approach**: Instead of modifying schema, query `shipment_items` to check if `delivery.sku` exists in any shipment with `shipment.status != 'cancelled'`. This is chosen to avoid schema modification.

**DECISION**: Do NOT modify `production_deliveries`. Use query-based validation in deletion stored procedure.

---

### 2.3 New Views

#### View 1: `v_forecast_coverage`

**Purpose**: Real-time calculation of forecast coverage status

```sql
CREATE OR REPLACE VIEW v_forecast_coverage AS
SELECT
  -- Forecast identification
  sf.id AS forecast_id,
  sf.sku,
  sf.channel_code,
  sf.week_iso,
  sf.week_start_date,
  sf.week_end_date,

  -- Forecast quantity
  sf.forecast_qty,

  -- Allocation aggregation
  COALESCE(SUM(foa.allocated_qty), 0) AS allocated_qty,

  -- Coverage metrics
  COALESCE(SUM(foa.allocated_qty), 0) AS covered_qty,
  sf.forecast_qty - COALESCE(SUM(foa.allocated_qty), 0) AS uncovered_qty,

  -- Coverage percentage
  CASE
    WHEN sf.forecast_qty > 0 THEN
      ROUND((COALESCE(SUM(foa.allocated_qty), 0)::DECIMAL / sf.forecast_qty) * 100, 2)
    ELSE 0
  END AS coverage_percentage,

  -- Coverage status
  CASE
    WHEN COALESCE(SUM(foa.allocated_qty), 0) = 0 THEN 'UNCOVERED'
    WHEN COALESCE(SUM(foa.allocated_qty), 0) < sf.forecast_qty * 0.90 THEN 'PARTIALLY_COVERED'
    WHEN COALESCE(SUM(foa.allocated_qty), 0) > sf.forecast_qty * 1.10 THEN 'OVER_COVERED'
    ELSE 'FULLY_COVERED'
  END AS coverage_status,

  -- Order context
  COUNT(DISTINCT foa.po_item_id) AS linked_order_count,
  MAX(foa.allocated_at) AS last_allocated_at,

  -- Product info (join)
  p.product_name,
  p.spu,

  -- Metadata
  NOW() AS calculated_at

FROM sales_forecasts sf
LEFT JOIN forecast_order_allocations foa
  ON sf.id = foa.forecast_id
LEFT JOIN purchase_order_items poi
  ON foa.po_item_id = poi.id
LEFT JOIN purchase_orders po
  ON poi.po_id = po.id
LEFT JOIN products p
  ON sf.sku = p.sku

-- Exclude cancelled orders from coverage calculation
WHERE po.po_status != 'Cancelled' OR po.id IS NULL

GROUP BY
  sf.id,
  sf.sku,
  sf.channel_code,
  sf.week_iso,
  sf.week_start_date,
  sf.week_end_date,
  sf.forecast_qty,
  p.product_name,
  p.spu;

-- Indexes on underlying tables (already exist)
-- No indexes needed on views

-- Comments
COMMENT ON VIEW v_forecast_coverage IS 'Real-time forecast coverage status aggregated from allocations (excludes cancelled orders)';
```

**Performance Considerations**:
- **NOT materialized** - query is fast enough for real-time usage
- Indexed columns: `sales_forecasts(id)`, `forecast_order_allocations(forecast_id)`, `purchase_orders(po_status)`
- Expected rows: ~1000 forecasts per week × 12 weeks = 12K rows (sub-second query time)

**Coverage Status Thresholds**:
| Status | Condition | Color | Priority |
|--------|-----------|-------|----------|
| UNCOVERED | 0% | Red | High |
| PARTIALLY_COVERED | 1-89% | Yellow | Medium |
| FULLY_COVERED | 90-110% | Green | None |
| OVER_COVERED | >110% | Orange | Review |

---

#### View 2: `v_variance_pending_actions`

**Purpose**: Dashboard for pending variance resolutions (derived view)

```sql
CREATE OR REPLACE VIEW v_variance_pending_actions AS
SELECT
  fvr.id AS resolution_id,
  fvr.forecast_id,
  sf.sku,
  sf.channel_code,
  sf.week_iso,
  p.product_name,

  -- Variance details
  fvr.original_forecast_qty,
  fvr.adjusted_forecast_qty,
  fvr.variance_qty,
  fvr.variance_type,
  fvr.variance_percentage,

  -- Resolution status
  fvr.resolution_status,
  fvr.resolution_action,

  -- Urgency
  EXTRACT(DAY FROM NOW() - fvr.detected_at)::INTEGER AS days_pending,
  CASE
    WHEN ABS(fvr.variance_percentage) >= 50 THEN 'Critical'
    WHEN ABS(fvr.variance_percentage) >= 25 THEN 'High'
    WHEN ABS(fvr.variance_percentage) >= 10 THEN 'Medium'
    ELSE 'Low'
  END AS priority,

  -- Timestamps
  fvr.detected_at,
  fvr.resolved_at

FROM forecast_variance_resolutions fvr
JOIN sales_forecasts sf ON fvr.forecast_id = sf.id
JOIN products p ON sf.sku = p.sku

WHERE fvr.resolution_status = 'pending'

ORDER BY
  CASE
    WHEN ABS(fvr.variance_percentage) >= 50 THEN 1
    WHEN ABS(fvr.variance_percentage) >= 25 THEN 2
    WHEN ABS(fvr.variance_percentage) >= 10 THEN 3
    ELSE 4
  END,
  fvr.detected_at ASC;

COMMENT ON VIEW v_variance_pending_actions IS 'Pending variance resolutions sorted by priority for user dashboard';
```

---

## 3. Stored Procedures & Functions

### 3.1 Delivery Deletion with Rollback

#### Function: `delete_production_delivery()`

**Purpose**: Safely delete delivery record with business rule validation and rollback

```sql
CREATE OR REPLACE FUNCTION delete_production_delivery(
  p_delivery_id UUID,
  p_deleted_by UUID,
  p_deletion_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  error_code TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery production_deliveries%ROWTYPE;
  v_shipment_exists BOOLEAN;
  v_rollback_qty INTEGER;
BEGIN
  -- ================================================================
  -- STEP 1: Fetch delivery record (with row lock)
  -- ================================================================
  SELECT * INTO v_delivery
  FROM production_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE; -- Lock row for transaction

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'NOT_FOUND', 'Delivery record not found';
    RETURN;
  END IF;

  -- ================================================================
  -- STEP 2: Validate deletion safeguards
  -- ================================================================

  -- Safeguard A: Check if delivery has been paid
  IF v_delivery.payment_status = 'Paid' THEN
    RETURN QUERY SELECT FALSE, 'PAYMENT_COMPLETED', 'Cannot delete delivery with completed payment. Contact finance to reverse.';
    RETURN;
  END IF;

  -- Safeguard B: Check if delivery has been shipped
  -- Query shipment_items to see if this delivery's SKU has been shipped
  SELECT EXISTS (
    SELECT 1
    FROM shipments sh
    JOIN shipment_items si ON sh.id = si.shipment_id
    WHERE si.sku = v_delivery.sku
      AND sh.actual_departure_date IS NOT NULL
      AND sh.batch_code = (
        SELECT po.batch_code
        FROM purchase_orders po
        JOIN purchase_order_items poi ON po.id = poi.po_id
        WHERE poi.id = v_delivery.po_item_id
      )
  ) INTO v_shipment_exists;

  IF v_shipment_exists THEN
    RETURN QUERY SELECT FALSE, 'SHIPMENT_EXISTS', 'Cannot delete delivery that has been shipped';
    RETURN;
  END IF;

  -- ================================================================
  -- STEP 3: Create audit log BEFORE deletion
  -- ================================================================
  INSERT INTO delivery_deletion_audit_log (
    delivery_id,
    delivery_number,
    delivery_snapshot,
    deleted_by,
    deletion_reason,
    po_item_id,
    rolled_back_qty
  )
  VALUES (
    v_delivery.id,
    v_delivery.delivery_number,
    row_to_json(v_delivery)::JSONB,
    p_deleted_by,
    p_deletion_reason,
    v_delivery.po_item_id,
    v_delivery.delivered_qty
  );

  -- ================================================================
  -- STEP 4: Rollback delivered_qty in purchase_order_items
  -- ================================================================
  UPDATE purchase_order_items
  SET
    delivered_qty = delivered_qty - v_delivery.delivered_qty,
    updated_at = NOW()
  WHERE id = v_delivery.po_item_id;

  -- ================================================================
  -- STEP 5: Delete delivery record
  -- ================================================================
  DELETE FROM production_deliveries
  WHERE id = p_delivery_id;

  -- ================================================================
  -- STEP 6: Return success
  -- ================================================================
  RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION delete_production_delivery IS 'Deletes production delivery with safeguards, audit trail, and qty rollback';
```

**Error Codes**:
| Code | Meaning | User Action |
|------|---------|-------------|
| NOT_FOUND | Delivery ID doesn't exist | Check ID |
| PAYMENT_COMPLETED | Payment status = 'Paid' | Contact finance |
| SHIPMENT_EXISTS | Delivery has been shipped | Cannot delete |

---

### 3.2 Auto-Allocation Algorithm

#### Function: `auto_allocate_forecast_to_po_item()`

**Purpose**: Automatically allocate PO item quantity to uncovered forecasts using FIFO

```sql
CREATE OR REPLACE FUNCTION auto_allocate_forecast_to_po_item(
  p_po_item_id UUID,
  p_allocated_by UUID
)
RETURNS TABLE (
  forecast_id UUID,
  allocated_qty INTEGER,
  week_iso TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_po_item purchase_order_items%ROWTYPE;
  v_remaining_qty INTEGER;
  v_forecast RECORD;
  v_allocate_qty INTEGER;
BEGIN
  -- ================================================================
  -- STEP 1: Fetch PO item details
  -- ================================================================
  SELECT * INTO v_po_item
  FROM purchase_order_items
  WHERE id = p_po_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO item not found: %', p_po_item_id;
  END IF;

  v_remaining_qty := v_po_item.ordered_qty;

  -- ================================================================
  -- STEP 2: Query uncovered forecasts (FIFO by week)
  -- ================================================================
  FOR v_forecast IN (
    SELECT
      fc.forecast_id,
      fc.week_iso,
      fc.uncovered_qty
    FROM v_forecast_coverage fc
    WHERE fc.sku = v_po_item.sku
      AND fc.channel_code = v_po_item.channel_code
      AND fc.uncovered_qty > 0
      AND fc.week_iso >= (
        -- Start from week of PO order date + production lead time
        SELECT to_char(
          (po.actual_order_date::DATE + (p.production_lead_weeks * 7))::DATE,
          'IYYY-"W"IW'
        )
        FROM purchase_orders po
        JOIN products p ON p.sku = v_po_item.sku
        WHERE po.id = v_po_item.po_id
      )
    ORDER BY fc.week_iso ASC -- FIFO: earliest week first
  ) LOOP
    -- Exit if no remaining qty to allocate
    EXIT WHEN v_remaining_qty = 0;

    -- Calculate allocation for this forecast
    v_allocate_qty := LEAST(v_remaining_qty, v_forecast.uncovered_qty);

    -- Insert allocation record
    INSERT INTO forecast_order_allocations (
      forecast_id,
      po_item_id,
      allocated_qty,
      allocation_type,
      allocated_by
    )
    VALUES (
      v_forecast.forecast_id,
      p_po_item_id,
      v_allocate_qty,
      'auto', -- Mark as auto-allocated
      p_allocated_by
    )
    ON CONFLICT (forecast_id, po_item_id) DO UPDATE
    SET allocated_qty = forecast_order_allocations.allocated_qty + v_allocate_qty;

    -- Return allocation record
    RETURN QUERY SELECT
      v_forecast.forecast_id,
      v_allocate_qty,
      v_forecast.week_iso;

    -- Decrement remaining
    v_remaining_qty := v_remaining_qty - v_allocate_qty;
  END LOOP;

END;
$$;

COMMENT ON FUNCTION auto_allocate_forecast_to_po_item IS 'Auto-allocates PO item qty to uncovered forecasts using FIFO (earliest week first)';
```

**Algorithm Logic**:
1. Start with `ordered_qty` as remaining budget
2. Query uncovered forecasts starting from `order_date + production_lead_weeks`
3. Allocate to each forecast in chronological order (FIFO)
4. Stop when `remaining_qty = 0` OR no more uncovered forecasts

---

### 3.3 Variance Detection Trigger

#### Trigger: `trg_detect_forecast_variance`

**Purpose**: Auto-create variance resolution record when forecast quantity changes

```sql
CREATE OR REPLACE FUNCTION fn_detect_forecast_variance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_allocations BOOLEAN;
  v_variance_qty INTEGER;
  v_variance_pct DECIMAL(5,2);
BEGIN
  -- Only trigger if forecast_qty changed
  IF OLD.forecast_qty = NEW.forecast_qty THEN
    RETURN NEW;
  END IF;

  -- Check if forecast has any allocations
  SELECT EXISTS (
    SELECT 1 FROM forecast_order_allocations
    WHERE forecast_id = NEW.id
  ) INTO v_has_allocations;

  -- Only create variance if allocations exist
  IF v_has_allocations THEN
    v_variance_qty := NEW.forecast_qty - OLD.forecast_qty;
    v_variance_pct := (v_variance_qty::DECIMAL / OLD.forecast_qty) * 100;

    -- Only create record if variance >= 10%
    IF ABS(v_variance_pct) >= 10 THEN
      INSERT INTO forecast_variance_resolutions (
        forecast_id,
        original_forecast_qty,
        adjusted_forecast_qty,
        variance_qty,
        variance_type,
        variance_percentage,
        resolution_action,
        resolution_status
      )
      VALUES (
        NEW.id,
        OLD.forecast_qty,
        NEW.forecast_qty,
        v_variance_qty,
        CASE WHEN v_variance_qty > 0 THEN 'increase' ELSE 'decrease' END,
        v_variance_pct,
        'pending_review', -- Require user decision
        'pending'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detect_forecast_variance
AFTER UPDATE ON sales_forecasts
FOR EACH ROW
EXECUTE FUNCTION fn_detect_forecast_variance();

COMMENT ON FUNCTION fn_detect_forecast_variance IS 'Detects forecast qty changes and creates variance resolution record if allocations exist';
```

**Trigger Conditions**:
- Only fires on `UPDATE` of `sales_forecasts.forecast_qty`
- Only creates variance record if:
  1. Forecast has allocations (`forecast_order_allocations` rows exist)
  2. Variance >= 10% of original quantity

---

## 4. Row Level Security (RLS) Policies

### 4.1 `forecast_order_allocations` Policies

```sql
-- Enable RLS
ALTER TABLE forecast_order_allocations ENABLE ROW LEVEL SECURITY;

-- Policy 1: All authenticated users can read allocations
CREATE POLICY "Allocations readable by authenticated users"
  ON forecast_order_allocations FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy 2: Users with procurement:write can create allocations
CREATE POLICY "Allocations creatable by procurement team"
  ON forecast_order_allocations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy 3: Users with procurement:write can update allocations
CREATE POLICY "Allocations updatable by procurement team"
  ON forecast_order_allocations FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy 4: Users with procurement:write can delete allocations
CREATE POLICY "Allocations deletable by procurement team"
  ON forecast_order_allocations FOR DELETE
  USING (auth.role() = 'authenticated');
```

**Note**: Fine-grained permissions (procurement:write vs planning:read) will be handled in Server Actions, not RLS.

---

### 4.2 `forecast_variance_resolutions` Policies

```sql
-- Enable RLS
ALTER TABLE forecast_variance_resolutions ENABLE ROW LEVEL SECURITY;

-- Policy 1: All authenticated users can read variance resolutions
CREATE POLICY "Variance resolutions readable by authenticated users"
  ON forecast_variance_resolutions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy 2: System can create variance resolutions (via trigger)
CREATE POLICY "Variance resolutions creatable by system"
  ON forecast_variance_resolutions FOR INSERT
  WITH CHECK (true);

-- Policy 3: Users with planning:write can update resolutions
CREATE POLICY "Variance resolutions updatable by planning team"
  ON forecast_variance_resolutions FOR UPDATE
  USING (auth.role() = 'authenticated');
```

---

### 4.3 `delivery_deletion_audit_log` Policies

```sql
-- Enable RLS
ALTER TABLE delivery_deletion_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy 1: Audit logs readable by authenticated users
CREATE POLICY "Audit logs readable by authenticated users"
  ON delivery_deletion_audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy 2: System can insert audit logs (via stored procedure)
CREATE POLICY "Audit logs insertable by system"
  ON delivery_deletion_audit_log FOR INSERT
  WITH CHECK (true);

-- No UPDATE or DELETE policies (audit logs are immutable)
```

---

## 5. TypeScript Type Definitions

### 5.1 New Types for `src/lib/types/database.ts`

Add these types to the existing file:

```typescript
// ================================================================
// FORECAST-ORDER LINKAGE TYPES
// ================================================================

export type CoverageStatus = 'UNCOVERED' | 'PARTIALLY_COVERED' | 'FULLY_COVERED' | 'OVER_COVERED'
export type VarianceType = 'increase' | 'decrease'
export type ResolutionAction =
  | 'create_supplemental_order'
  | 'reallocate_to_future'
  | 'accept_as_safety_stock'
  | 'cancel_excess'
  | 'pending_review'
export type ResolutionStatus = 'pending' | 'resolved' | 'cancelled'
export type AllocationType = 'manual' | 'auto'

// ================================================================
// TABLE: forecast_order_allocations
// ================================================================

export interface ForecastOrderAllocation {
  id: string
  forecast_id: string
  po_item_id: string
  allocated_qty: number
  allocation_type: AllocationType
  allocated_by: string | null
  allocated_at: string
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface ForecastOrderAllocationInsert {
  id?: string
  forecast_id: string
  po_item_id: string
  allocated_qty: number
  allocation_type?: AllocationType
  allocated_by?: string | null
  remarks?: string | null
}

export interface ForecastOrderAllocationUpdate {
  allocated_qty?: number
  remarks?: string | null
}

// ================================================================
// TABLE: forecast_variance_resolutions
// ================================================================

export interface ForecastVarianceResolution {
  id: string
  forecast_id: string
  original_forecast_qty: number
  adjusted_forecast_qty: number
  variance_qty: number
  variance_type: VarianceType
  variance_percentage: number
  resolution_action: ResolutionAction | null
  resolution_status: ResolutionStatus
  resolution_notes: string | null
  detected_at: string
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

export interface ForecastVarianceResolutionInsert {
  id?: string
  forecast_id: string
  original_forecast_qty: number
  adjusted_forecast_qty: number
  variance_qty: number
  variance_type: VarianceType
  variance_percentage: number
  resolution_action?: ResolutionAction | null
  resolution_status?: ResolutionStatus
  resolution_notes?: string | null
}

export interface ForecastVarianceResolutionUpdate {
  resolution_action?: ResolutionAction | null
  resolution_status?: ResolutionStatus
  resolution_notes?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
}

// ================================================================
// TABLE: delivery_deletion_audit_log
// ================================================================

export interface DeliveryDeletionAuditLog {
  id: string
  delivery_id: string
  delivery_number: string
  delivery_snapshot: Record<string, unknown> // JSONB
  deleted_by: string | null
  deleted_at: string
  deletion_reason: string | null
  po_item_id: string
  rolled_back_qty: number
  created_at: string
}

export interface DeliveryDeletionAuditLogInsert {
  id?: string
  delivery_id: string
  delivery_number: string
  delivery_snapshot: Record<string, unknown>
  deleted_by?: string | null
  deletion_reason?: string | null
  po_item_id: string
  rolled_back_qty: number
}

// ================================================================
// VIEW: v_forecast_coverage
// ================================================================

export interface ForecastCoverageView {
  forecast_id: string
  sku: string
  channel_code: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  forecast_qty: number
  allocated_qty: number
  covered_qty: number
  uncovered_qty: number
  coverage_percentage: number
  coverage_status: CoverageStatus
  linked_order_count: number
  last_allocated_at: string | null
  product_name: string
  spu: string
  calculated_at: string
}

// ================================================================
// VIEW: v_variance_pending_actions
// ================================================================

export interface VariancePendingActionsView {
  resolution_id: string
  forecast_id: string
  sku: string
  channel_code: string
  week_iso: string
  product_name: string
  original_forecast_qty: number
  adjusted_forecast_qty: number
  variance_qty: number
  variance_type: VarianceType
  variance_percentage: number
  resolution_status: ResolutionStatus
  resolution_action: ResolutionAction | null
  days_pending: number
  priority: Priority
  detected_at: string
  resolved_at: string | null
}
```

### 5.2 Update Database Type Definition

```typescript
// Add to Database.public.Tables
export type Database = {
  public: {
    Tables: {
      // ... existing tables ...
      forecast_order_allocations: {
        Row: ForecastOrderAllocation
        Insert: ForecastOrderAllocationInsert
        Update: ForecastOrderAllocationUpdate
      }
      forecast_variance_resolutions: {
        Row: ForecastVarianceResolution
        Insert: ForecastVarianceResolutionInsert
        Update: ForecastVarianceResolutionUpdate
      }
      delivery_deletion_audit_log: {
        Row: DeliveryDeletionAuditLog
        Insert: DeliveryDeletionAuditLogInsert
        Update: never // Immutable
      }
    }
    Views: {
      // ... existing views ...
      v_forecast_coverage: {
        Row: ForecastCoverageView
      }
      v_variance_pending_actions: {
        Row: VariancePendingActionsView
      }
    }
    Functions: {
      // ... existing functions ...
      delete_production_delivery: {
        Args: {
          p_delivery_id: string
          p_deleted_by: string
          p_deletion_reason?: string
        }
        Returns: {
          success: boolean
          error_code: string | null
          error_message: string | null
        }[]
      }
      auto_allocate_forecast_to_po_item: {
        Args: {
          p_po_item_id: string
          p_allocated_by: string
        }
        Returns: {
          forecast_id: string
          allocated_qty: number
          week_iso: string
        }[]
      }
    }
  }
}
```

---

## 6. Server Actions API Contracts

All Server Actions follow the pattern:

```typescript
export async function actionName(params) {
  'use server'
  try {
    // Business logic
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
```

### 6.1 Delivery Management Actions

#### Action: `deleteDelivery`

**File**: `src/lib/actions/procurement.ts`

```typescript
export async function deleteDelivery(
  deliveryId: string,
  deletionReason?: string
): Promise<{
  success: boolean
  error?: string
  errorCode?: string
}> {
  'use server'

  try {
    const supabase = createServerSupabaseClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call stored procedure
    const { data, error } = await supabase.rpc('delete_production_delivery', {
      p_delivery_id: deliveryId,
      p_deleted_by: user.id,
      p_deletion_reason: deletionReason
    })

    if (error) throw error

    const result = data[0]
    if (!result.success) {
      return {
        success: false,
        error: result.error_message,
        errorCode: result.error_code
      }
    }

    revalidatePath('/procurement')
    return { success: true }

  } catch (error) {
    console.error('Delete delivery error:', error)
    return { success: false, error: 'Database error' }
  }
}
```

---

### 6.2 Allocation Actions

#### Action: `createManualAllocation`

**File**: `src/lib/actions/planning.ts`

```typescript
export async function createManualAllocation(params: {
  forecastId: string
  poItemId: string
  allocatedQty: number
  remarks?: string
}): Promise<{
  success: boolean
  data?: ForecastOrderAllocation
  error?: string
}> {
  'use server'

  try {
    const supabase = createServerSupabaseClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Validate: Check SKU and channel match
    const { data: forecast } = await supabase
      .from('sales_forecasts')
      .select('sku, channel_code')
      .eq('id', params.forecastId)
      .single()

    const { data: poItem } = await supabase
      .from('purchase_order_items')
      .select('sku, channel_code, ordered_qty')
      .eq('id', params.poItemId)
      .single()

    if (forecast.sku !== poItem.sku || forecast.channel_code !== poItem.channel_code) {
      return { success: false, error: 'SKU or channel mismatch' }
    }

    // Validate: Check total allocation doesn't exceed ordered_qty
    const { data: existingAllocations } = await supabase
      .from('forecast_order_allocations')
      .select('allocated_qty')
      .eq('po_item_id', params.poItemId)

    const totalAllocated = (existingAllocations || [])
      .reduce((sum, a) => sum + a.allocated_qty, 0) + params.allocatedQty

    if (totalAllocated > poItem.ordered_qty) {
      return {
        success: false,
        error: `Total allocation (${totalAllocated}) exceeds ordered quantity (${poItem.ordered_qty})`
      }
    }

    // Insert allocation
    const { data, error } = await supabase
      .from('forecast_order_allocations')
      .insert({
        forecast_id: params.forecastId,
        po_item_id: params.poItemId,
        allocated_qty: params.allocatedQty,
        allocation_type: 'manual',
        allocated_by: user.id,
        remarks: params.remarks
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/planning/forecast-coverage')
    return { success: true, data }

  } catch (error) {
    console.error('Create allocation error:', error)
    return { success: false, error: 'Failed to create allocation' }
  }
}
```

---

#### Action: `autoAllocateToForecasts`

**File**: `src/lib/actions/planning.ts`

```typescript
export async function autoAllocateToForecasts(
  poItemId: string
): Promise<{
  success: boolean
  data?: { forecast_id: string; allocated_qty: number; week_iso: string }[]
  error?: string
}> {
  'use server'

  try {
    const supabase = createServerSupabaseClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call stored procedure
    const { data, error } = await supabase.rpc('auto_allocate_forecast_to_po_item', {
      p_po_item_id: poItemId,
      p_allocated_by: user.id
    })

    if (error) throw error

    revalidatePath('/planning/forecast-coverage')
    return { success: true, data }

  } catch (error) {
    console.error('Auto-allocate error:', error)
    return { success: false, error: 'Auto-allocation failed' }
  }
}
```

---

### 6.3 Variance Resolution Actions

#### Action: `resolveVariance`

**File**: `src/lib/actions/planning.ts`

```typescript
export async function resolveVariance(params: {
  resolutionId: string
  action: ResolutionAction
  notes?: string
}): Promise<{
  success: boolean
  error?: string
}> {
  'use server'

  try {
    const supabase = createServerSupabaseClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update resolution
    const { error } = await supabase
      .from('forecast_variance_resolutions')
      .update({
        resolution_action: params.action,
        resolution_status: 'resolved',
        resolution_notes: params.notes,
        resolved_by: user.id,
        resolved_at: new Date().toISOString()
      })
      .eq('id', params.resolutionId)

    if (error) throw error

    revalidatePath('/planning/variance-resolutions')
    return { success: true }

  } catch (error) {
    console.error('Resolve variance error:', error)
    return { success: false, error: 'Failed to resolve variance' }
  }
}
```

---

## 7. Query Functions

### 7.1 Forecast Coverage Queries

**File**: `src/lib/queries/planning.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ForecastCoverageView } from '@/lib/types/database'

export async function getForecastCoverageList(filters?: {
  sku?: string
  channelCode?: string
  weekIso?: string
  status?: CoverageStatus
}): Promise<ForecastCoverageView[]> {
  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('v_forecast_coverage')
    .select('*')
    .order('week_iso', { ascending: true })

  if (filters?.sku) query = query.eq('sku', filters.sku)
  if (filters?.channelCode) query = query.eq('channel_code', filters.channelCode)
  if (filters?.weekIso) query = query.eq('week_iso', filters.weekIso)
  if (filters?.status) query = query.eq('coverage_status', filters.status)

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function getForecastCoverageKPIs() {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_forecast_coverage')
    .select('coverage_status')

  if (error) throw error

  const kpis = {
    total: data.length,
    uncovered: data.filter(d => d.coverage_status === 'UNCOVERED').length,
    partially: data.filter(d => d.coverage_status === 'PARTIALLY_COVERED').length,
    fully: data.filter(d => d.coverage_status === 'FULLY_COVERED').length,
    over: data.filter(d => d.coverage_status === 'OVER_COVERED').length
  }

  return kpis
}
```

---

## 8. Component Design Strategy

### 8.1 Forecast Coverage Dashboard Page

**Route**: `/planning/forecast-coverage`

**Components**:
1. `CoverageKPICards` - 4 stat cards (Total, Uncovered, Partially, Over)
2. `CoverageFilterBar` - Filters: SKU, Week, Channel, Status
3. `CoverageTable` - Complex table with:
   - Columns: Week, SKU, Product, Forecast, Covered, Uncovered, Status, Actions
   - Row actions: "Create Order" (for uncovered), "View Details" (for all)
4. `CoverageStatusBadge` - Colored badge component

**Data Flow**:
```
Page (Server Component)
  → getForecastCoverageList()
  → CoverageTable (Client Component with filter state)
```

---

### 8.2 PO Creation with Allocation Panel

**Route**: `/procurement/purchase-orders/create`

**New Component**: `ForecastAllocationPanel`

**Props**:
```typescript
interface ForecastAllocationPanelProps {
  sku: string
  channelCode: string
  orderedQty: number
  onAllocationsChange: (allocations: AllocationInput[]) => void
}
```

**Features**:
1. Fetch uncovered forecasts on mount
2. Display forecast list with input fields
3. Validate total allocation <= orderedQty
4. "Auto Allocate" button → calls `autoAllocateToForecasts()`
5. Submit allocations when PO is created

---

### 8.3 Delivery Edit Page with Delete Button

**Route**: `/procurement/deliveries/[id]/edit`

**Modifications**:
1. Add "Delete" button (red, destructive variant)
2. On click → show confirmation dialog with:
   - Warning text about rollback
   - "Type DELETE to confirm" input
   - Safeguard checks (pre-flight API call)
3. On confirm → call `deleteDelivery()` action
4. On success → redirect to PO detail page

**Safeguard UI Flow**:
```
User clicks Delete
  → Pre-check API: GET /api/delivery/[id]/can-delete
  → If blocked → Show error modal
  → If allowed → Show confirmation dialog
  → User types "DELETE" → Enable confirm button
  → Call deleteDelivery() → Redirect
```

---

## 9. Data Flow Diagrams

### 9.1 Manual Allocation Flow

```
User Action: Create PO with allocations
  ↓
[PO Creation Form]
  - SKU: SKU-001
  - Channel: AMZ-US
  - Ordered Qty: 300
  ↓
[ForecastAllocationPanel]
  - Fetch uncovered forecasts for SKU-001 + AMZ-US
  - Display: W50 (100), W51 (150), W52 (80)
  - User inputs: 100, 150, 50
  ↓
[Validation]
  - Total allocated (300) <= Ordered (300) ✓
  - SKU match ✓
  - Channel match ✓
  ↓
[Submit]
  - createPOWithItems() → Creates PO + PO Items
  - createManualAllocation() × 3 → Creates allocations
  ↓
[Result]
  - v_forecast_coverage updates (real-time view)
  - W50: FULLY_COVERED
  - W51: FULLY_COVERED
  - W52: PARTIALLY_COVERED (50/80 = 63%)
```

---

### 9.2 Variance Detection Flow

```
User Action: Update forecast quantity
  ↓
[Forecast Edit Form]
  - Original: 100 units
  - Updated: 150 units
  ↓
[Database Trigger: trg_detect_forecast_variance]
  - Detects: OLD.forecast_qty (100) → NEW.forecast_qty (150)
  - Checks: Allocations exist? YES (100 units allocated)
  - Calculates: variance_qty = 50, variance_pct = 50%
  - Condition: ABS(50%) >= 10% → TRUE
  ↓
[Create Variance Record]
  INSERT INTO forecast_variance_resolutions
    - variance_type: 'increase'
    - resolution_status: 'pending'
  ↓
[User Notification]
  - Dashboard shows alert: "Uncovered demand: 50 units for SKU-001 W50"
  - User navigates to /planning/variance-resolutions
  ↓
[User Action: Resolve]
  - Selects action: "create_supplemental_order"
  - Adds notes: "Market demand surge, need urgent replenishment"
  - Submits → resolveVariance()
  ↓
[Result]
  - resolution_status: 'resolved'
  - System suggests: Create PO for 50 units
```

---

### 9.3 Delivery Deletion Flow

```
User Action: Delete delivery record
  ↓
[Delivery Edit Page]
  - User clicks "Delete" button
  ↓
[Pre-Flight Validation (Client-side check)]
  - Query: Check payment_status
  - Query: Check if shipped (shipment_items lookup)
  ↓
  IF payment_status = 'Paid' → BLOCK
  IF shipped → BLOCK
  ELSE → Show confirmation dialog
  ↓
[Confirmation Dialog]
  - Warning: "This will decrement delivered_qty by 500 units"
  - Input: Type "DELETE" to confirm
  - User confirms
  ↓
[Call Server Action: deleteDelivery()]
  ↓
[Stored Procedure: delete_production_delivery()]
  TRANSACTION START
  1. Lock delivery row
  2. Re-validate safeguards
  3. Create audit log (delivery_deletion_audit_log)
  4. UPDATE purchase_order_items SET delivered_qty = delivered_qty - 500
  5. DELETE FROM production_deliveries WHERE id = ...
  TRANSACTION COMMIT
  ↓
[Result]
  - Success → Redirect to PO detail page
  - Error → Show error toast
```

---

## 10. Testing Strategy

### 10.1 Database Test Cases

**Test File**: `supabase/migrations/20251206_test_forecast_linkage.sql`

```sql
-- Test 1: Manual allocation validation
DO $$
DECLARE
  v_forecast_id UUID;
  v_po_item_id UUID;
BEGIN
  -- Create test data
  -- ... (insert forecast, PO, PO item)

  -- Test: Allocate 100 units
  INSERT INTO forecast_order_allocations (forecast_id, po_item_id, allocated_qty)
  VALUES (v_forecast_id, v_po_item_id, 100);

  -- Assert: Allocation created
  ASSERT (SELECT COUNT(*) FROM forecast_order_allocations WHERE forecast_id = v_forecast_id) = 1;

  RAISE NOTICE 'Test 1 passed: Manual allocation';
END $$;

-- Test 2: Auto-allocation FIFO
-- Test 3: Variance detection trigger
-- Test 4: Delivery deletion rollback
```

---

### 10.2 Server Action Test Cases

**Test File**: `src/lib/actions/__tests__/planning.test.ts`

```typescript
describe('createManualAllocation', () => {
  it('should create allocation with valid inputs', async () => {
    const result = await createManualAllocation({
      forecastId: 'forecast-1',
      poItemId: 'po-item-1',
      allocatedQty: 100
    })
    expect(result.success).toBe(true)
  })

  it('should reject allocation with SKU mismatch', async () => {
    // ... test setup with mismatched SKU
    const result = await createManualAllocation({ ... })
    expect(result.success).toBe(false)
    expect(result.error).toContain('SKU mismatch')
  })

  it('should reject over-allocation', async () => {
    // ... test setup with ordered_qty = 100, trying to allocate 150
    const result = await createManualAllocation({ ... })
    expect(result.success).toBe(false)
    expect(result.error).toContain('exceeds ordered quantity')
  })
})
```

---

## 11. Performance Optimization

### 11.1 Indexing Strategy

**Critical Indexes** (already in migration):
```sql
-- Allocation lookups
CREATE INDEX idx_allocations_forecast ON forecast_order_allocations(forecast_id);
CREATE INDEX idx_allocations_po_item ON forecast_order_allocations(po_item_id);

-- Variance queries
CREATE INDEX idx_variance_status ON forecast_variance_resolutions(resolution_status);
CREATE INDEX idx_variance_detected ON forecast_variance_resolutions(detected_at DESC);

-- Audit log queries
CREATE INDEX idx_delivery_deletion_delivery_id ON delivery_deletion_audit_log(delivery_id);
CREATE INDEX idx_delivery_deletion_deleted_at ON delivery_deletion_audit_log(deleted_at DESC);
```

**Query Performance Targets**:
| Query | Target Time | Expected Rows |
|-------|-------------|---------------|
| v_forecast_coverage (all) | < 500ms | ~12,000 |
| v_forecast_coverage (filtered by week) | < 100ms | ~1,000 |
| auto_allocate_forecast_to_po_item() | < 200ms | ~10 allocations |
| delete_production_delivery() | < 150ms | 1 row + audit |

---

### 11.2 Caching Strategy

**Server Component Caching**:
- Forecast coverage list: Cache for 5 minutes (Next.js automatic)
- Variance pending list: No cache (real-time)

**Revalidation Triggers**:
```typescript
// After allocation creation
revalidatePath('/planning/forecast-coverage')
revalidatePath('/procurement/[id]') // PO detail page

// After variance resolution
revalidatePath('/planning/variance-resolutions')
```

---

## 12. Migration Execution Plan

### 12.1 Migration File Naming

**File**: `supabase/migrations/20251206000001_forecast_order_linkage.sql`

**Structure**:
```sql
-- ================================================================
-- Migration: Forecast-Order Linkage & Variance Management
-- Version: 1.0
-- Date: 2025-12-06
-- Author: System Architect
-- Description: Creates tables, views, triggers, and RLS for forecast coverage tracking
-- ================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- STEP 1: Create Enums (if needed)
-- ================================================================
-- (No new enums needed - using TEXT with CHECK constraints)

-- ================================================================
-- STEP 2: Create Tables
-- ================================================================
-- 2.1: forecast_order_allocations
-- 2.2: forecast_variance_resolutions
-- 2.3: delivery_deletion_audit_log

-- ================================================================
-- STEP 3: Create Views
-- ================================================================
-- 3.1: v_forecast_coverage
-- 3.2: v_variance_pending_actions

-- ================================================================
-- STEP 4: Create Stored Procedures
-- ================================================================
-- 4.1: delete_production_delivery()
-- 4.2: auto_allocate_forecast_to_po_item()
-- 4.3: fn_detect_forecast_variance() + trigger

-- ================================================================
-- STEP 5: Create RLS Policies
-- ================================================================
-- 5.1: forecast_order_allocations policies
-- 5.2: forecast_variance_resolutions policies
-- 5.3: delivery_deletion_audit_log policies

-- ================================================================
-- STEP 6: Grant Permissions
-- ================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON forecast_order_allocations TO authenticated;
GRANT SELECT, UPDATE ON forecast_variance_resolutions TO authenticated;
GRANT SELECT ON delivery_deletion_audit_log TO authenticated;
```

---

### 12.2 Rollback Plan

**File**: `supabase/migrations/20251206000002_rollback_forecast_linkage.sql`

```sql
-- Rollback: Drop in reverse order

-- Drop RLS policies
DROP POLICY IF EXISTS "Allocations readable by authenticated users" ON forecast_order_allocations;
-- ... (all policies)

-- Drop triggers
DROP TRIGGER IF EXISTS trg_detect_forecast_variance ON sales_forecasts;
DROP FUNCTION IF EXISTS fn_detect_forecast_variance();

-- Drop stored procedures
DROP FUNCTION IF EXISTS delete_production_delivery(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS auto_allocate_forecast_to_po_item(UUID, UUID);

-- Drop views
DROP VIEW IF EXISTS v_variance_pending_actions;
DROP VIEW IF EXISTS v_forecast_coverage;

-- Drop tables
DROP TABLE IF EXISTS delivery_deletion_audit_log;
DROP TABLE IF EXISTS forecast_variance_resolutions;
DROP TABLE IF EXISTS forecast_order_allocations;
```

---

## 13. Security Considerations

### 13.1 SQL Injection Prevention

- All stored procedures use parameterized queries
- No dynamic SQL construction with string concatenation
- Input validation in Server Actions before calling stored procedures

### 13.2 Authorization Checks

**Server Actions Pattern**:
```typescript
export async function actionName(params) {
  'use server'

  // Step 1: Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  // Step 2: Verify role (if needed)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (profile.role !== 'procurement_manager') {
    return { success: false, error: 'Insufficient permissions' }
  }

  // Step 3: Execute action
  // ...
}
```

---

### 13.3 Audit Trail Requirements

**All Critical Operations Must Log**:
1. Delivery deletion → `delivery_deletion_audit_log`
2. Allocation creation → `forecast_order_allocations.allocated_by`
3. Variance resolution → `forecast_variance_resolutions.resolved_by`

**Audit Log Retention**: 7 years (compliance requirement)

---

## 14. Answers to Open Questions

### 14.1 Allocation Mutability

**Question**: Should allocations be immutable once PO is confirmed?

**Answer**: **No, allocations should be mutable** even after PO confirmation, because:
1. Forecasts can change after orders are placed
2. Users may need to reallocate from over-covered weeks to uncovered weeks
3. Business Rule: Allocations can be edited/deleted UNTIL delivery is created

**Implementation**:
```sql
-- Allow UPDATE/DELETE on allocations if no deliveries exist
CREATE POLICY "Allocations updatable if not delivered"
  ON forecast_order_allocations FOR UPDATE
  USING (
    NOT EXISTS (
      SELECT 1 FROM production_deliveries pd
      WHERE pd.po_item_id = forecast_order_allocations.po_item_id
    )
  );
```

---

### 14.2 Forecast Deletion Handling

**Question**: How to handle forecast deletion when allocations exist?

**Answer**: **Block forecast deletion if allocations exist**

**Implementation**:
```sql
-- Add foreign key constraint with RESTRICT
ALTER TABLE forecast_order_allocations
ADD CONSTRAINT fk_forecast_id
FOREIGN KEY (forecast_id) REFERENCES sales_forecasts(id)
ON DELETE RESTRICT; -- Prevents deletion if allocations exist
```

**User Flow**:
1. User tries to delete forecast with allocations
2. Database returns error: "Cannot delete forecast with existing allocations"
3. UI shows: "Remove all allocations before deleting forecast"

---

### 14.3 Variance Resolution Expiry

**Question**: Should variance resolutions expire if unresolved?

**Answer**: **No auto-expiry, but add priority escalation**

**Implementation**:
- Variance resolutions stay `pending` indefinitely
- Dashboard shows `days_pending` and escalates priority:
  - 0-7 days: Low
  - 8-14 days: Medium
  - 15-30 days: High
  - 30+ days: Critical (red alert)

---

### 14.4 View Materialization

**Question**: Should `v_forecast_coverage` be materialized or real-time?

**Answer**: **Real-time view (NOT materialized)**

**Rationale**:
1. Data freshness is critical (users need real-time coverage status)
2. Query performance is acceptable (<500ms for 12K rows)
3. No need for manual refresh operations

**Alternative for Large Scale** (if performance degrades):
```sql
-- Convert to materialized view and add refresh function
CREATE MATERIALIZED VIEW v_forecast_coverage AS ...;

CREATE OR REPLACE FUNCTION refresh_forecast_coverage()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_forecast_coverage;
END;
$$ LANGUAGE plpgsql;

-- Trigger refresh after allocation changes
CREATE OR REPLACE FUNCTION trg_refresh_coverage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_forecast_coverage();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

---

## 15. Implementation Checklist

### 15.1 Backend (Database + Server Actions)

- [ ] Create migration file `20251206000001_forecast_order_linkage.sql`
- [ ] Run migration in Supabase SQL Editor
- [ ] Test stored procedures with test data
- [ ] Update `src/lib/types/database.ts` with new types
- [ ] Create Server Actions in `src/lib/actions/planning.ts`
- [ ] Create query functions in `src/lib/queries/planning.ts`
- [ ] Write unit tests for Server Actions

---

### 15.2 Frontend (Pages + Components)

- [ ] Create `/planning/forecast-coverage` page
- [ ] Create `CoverageKPICards` component
- [ ] Create `CoverageTable` component
- [ ] Create `CoverageStatusBadge` component
- [ ] Create `ForecastAllocationPanel` component
- [ ] Modify `/procurement/deliveries/[id]/edit` with delete button
- [ ] Create `/planning/variance-resolutions` page
- [ ] Create `VarianceResolutionTable` component

---

### 15.3 Testing

- [ ] Database tests (SQL test file)
- [ ] Server Action unit tests
- [ ] Component integration tests (Playwright)
- [ ] End-to-end user flow tests

---

### 15.4 Documentation

- [ ] Update API documentation
- [ ] Create user guide for forecast coverage dashboard
- [ ] Create user guide for variance resolution workflow

---

## 16. Deployment Notes

### 16.1 Database Migration

```bash
# Run migration in Supabase
supabase migration up

# Or via SQL Editor (copy-paste migration file)
```

### 16.2 Environment Variables

No new environment variables required.

### 16.3 Vercel Deployment

```bash
# Build and deploy
npm run build
vercel deploy --prod
```

### 16.4 Post-Deployment Validation

```sql
-- Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'forecast_%';

-- Verify RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'forecast_%';

-- Test stored procedure
SELECT * FROM delete_production_delivery(
  '00000000-0000-0000-0000-000000000000'::UUID,
  '00000000-0000-0000-0000-000000000000'::UUID,
  'Test deletion'
);
```

---

## 17. Glossary

| Term | Definition |
|------|------------|
| Allocation | Linking a PO item quantity to a forecast demand (many-to-many) |
| Coverage | Percentage of forecast demand fulfilled by allocated orders |
| Coverage Status | UNCOVERED (0%), PARTIALLY (1-89%), FULLY (90-110%), OVER (>110%) |
| Variance | Difference between original and adjusted forecast quantity |
| Variance Resolution | User action to resolve over/under coverage after forecast change |
| FIFO Allocation | First In First Out - allocate to earliest weeks first |
| Uncovered Demand | Forecast quantity not yet backed by orders |
| Over-Coverage | Allocated quantity > forecast quantity (>110% threshold) |
| Audit Trail | Immutable log of critical operations (deletions, allocations) |

---

## 18. References

- **Requirements**: `specs/forecast-order-linkage/requirements.md`
- **Current Schema**: `src/lib/types/database.ts`
- **Migration Examples**: `supabase/migrations/20251203000001_balance_management_schema.sql`
- **Delivery Audit**: `supabase/migrations/20251205000002_delivery_edit_audit.sql`

---

**END OF TECHNICAL DESIGN DOCUMENT**

---

## Sign-Off

- **System Architect**: Claude (Chief System Architect)
- **Next Step**: Backend Specialist to implement SQL migration, Frontend Artisan to build UI components
- **Estimated Implementation Time**: 2 weeks (per requirements Phase 1-2)
- **Target Completion Date**: 2025-12-20
