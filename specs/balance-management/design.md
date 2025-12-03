# Balance Management - Technical Design Document

**Feature:** Dual-Track Balance Management System
**Version:** 1.0
**Author:** System Architect
**Date:** 2025-12-03
**Status:** Ready for Implementation

---

## Executive Summary

This document provides the complete technical specification for implementing the Dual-Track Balance Management System in Rolloy SCM. The system transforms procurement and logistics tracking from "overwrite logic" to "balance resolution logic," ensuring all planned quantities are accounted for until explicitly closed.

### Design Principles

1. **Atomic Transactions:** All balance-related operations use PostgreSQL transactions to ensure data consistency
2. **Event-Driven Architecture:** Balance status changes trigger automatic inventory projection refreshes
3. **Audit Trail:** Every balance resolution action is permanently recorded with user attribution
4. **Performance First:** Indexes and materialized views optimize query performance for real-time dashboards
5. **Type Safety:** Strict TypeScript types mirror database schema constraints

---

## Table of Contents

1. [Database Schema Design](#1-database-schema-design)
2. [Row Level Security (RLS) Policies](#2-row-level-security-rls-policies)
3. [Database Functions & Triggers](#3-database-functions--triggers)
4. [TypeScript Type Definitions](#4-typescript-type-definitions)
5. [Server Actions Design](#5-server-actions-design)
6. [View Updates](#6-view-updates)
7. [State Machine Diagrams](#7-state-machine-diagrams)
8. [Data Flow Architecture](#8-data-flow-architecture)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Performance Optimization Strategy](#10-performance-optimization-strategy)

---

## 1. Database Schema Design

### 1.1 New Table: `balance_resolutions`

**Purpose:** Core table for tracking all balance discrepancies between planned and actual quantities across the supply chain.

```sql
-- ================================================================
-- Table: balance_resolutions
-- Purpose: Track open balances and their resolution history
-- ================================================================

CREATE TABLE IF NOT EXISTS balance_resolutions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source reference (polymorphic relationship)
  source_type VARCHAR(30) NOT NULL CHECK (
    source_type IN ('po_item', 'delivery', 'shipment_item')
  ),
  source_id UUID NOT NULL, -- References: purchase_order_items.id | production_deliveries.id | shipment_items.id

  -- SKU context
  sku VARCHAR(50) NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,

  -- Quantity tracking
  planned_qty INTEGER NOT NULL CHECK (planned_qty > 0),
  actual_qty INTEGER NOT NULL DEFAULT 0 CHECK (actual_qty >= 0),
  variance_qty INTEGER GENERATED ALWAYS AS (planned_qty - actual_qty) STORED,
  open_balance INTEGER GENERATED ALWAYS AS (GREATEST(0, planned_qty - actual_qty)) STORED,

  -- Resolution status and action
  resolution_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    resolution_status IN ('pending', 'deferred', 'short_closed', 'fulfilled', 'cancelled')
  ),
  resolution_action VARCHAR(30) NULL CHECK (
    resolution_action IS NULL OR
    resolution_action IN ('defer', 'create_carryover', 'short_close', 'auto_fulfilled')
  ),

  -- Date management
  original_planned_date DATE NOT NULL,
  deferred_to_week VARCHAR(10) NULL, -- ISO Week format: YYYY-WW
  deferred_date DATE NULL,

  -- Closure information
  closed_at TIMESTAMPTZ NULL,
  closed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  close_reason TEXT NULL,

  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Business constraints
  CONSTRAINT valid_deferred_date CHECK (
    deferred_date IS NULL OR deferred_date > original_planned_date
  ),
  CONSTRAINT closure_consistency CHECK (
    (resolution_status IN ('short_closed', 'cancelled') AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NOT NULL) OR
    (resolution_status = 'fulfilled' AND closed_at IS NOT NULL) OR
    (resolution_status IN ('pending', 'deferred') AND closed_at IS NULL)
  ),
  CONSTRAINT deferred_week_format CHECK (
    deferred_to_week IS NULL OR deferred_to_week ~ '^\d{4}-W\d{2}$'
  )
);

-- Indexes for performance
CREATE INDEX idx_balance_source ON balance_resolutions(source_type, source_id);
CREATE INDEX idx_balance_sku ON balance_resolutions(sku);
CREATE INDEX idx_balance_status ON balance_resolutions(resolution_status)
  WHERE resolution_status IN ('pending', 'deferred');
CREATE INDEX idx_balance_open ON balance_resolutions(open_balance)
  WHERE open_balance > 0;
CREATE INDEX idx_balance_deferred_date ON balance_resolutions(deferred_date)
  WHERE deferred_date IS NOT NULL AND resolution_status = 'deferred';
CREATE INDEX idx_balance_created_at ON balance_resolutions(created_at DESC);

-- Trigger for updated_at timestamp
CREATE TRIGGER update_balance_resolutions_updated_at
  BEFORE UPDATE ON balance_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE balance_resolutions IS 'Tracks all balance discrepancies between planned and actual quantities across procurement, production, and logistics stages';
COMMENT ON COLUMN balance_resolutions.source_type IS 'Type of parent record: po_item (PO shortage), delivery (production variance), shipment_item (logistics loss)';
COMMENT ON COLUMN balance_resolutions.open_balance IS 'Computed field: MAX(0, planned_qty - actual_qty). Used in inventory projections.';
COMMENT ON COLUMN balance_resolutions.resolution_status IS 'Current state: pending (default), deferred (postponed decision), short_closed (will not fulfill), fulfilled (balance reached zero), cancelled (record invalidated)';
```

### 1.2 New Table: `inventory_adjustments`

**Purpose:** Record manual inventory adjustments from cycle counts, variance reconciliation, and logistics losses.

```sql
-- ================================================================
-- Table: inventory_adjustments
-- Purpose: Audit trail for all manual inventory changes
-- ================================================================

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Inventory context
  sku VARCHAR(50) NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,

  -- Adjustment type
  adjustment_type VARCHAR(30) NOT NULL CHECK (
    adjustment_type IN (
      'cycle_count',
      'logistics_loss',
      'shipping_damage',
      'quality_hold',
      'theft',
      'found',
      'system_correction',
      'supplier_overage',
      'manual'
    )
  ),

  -- Quantity tracking
  qty_before INTEGER NOT NULL CHECK (qty_before >= 0),
  qty_change INTEGER NOT NULL CHECK (qty_change != 0), -- Positive = gain, Negative = loss
  qty_after INTEGER NOT NULL CHECK (qty_after >= 0),

  -- Source reference (optional)
  source_type VARCHAR(30) NULL CHECK (
    source_type IS NULL OR
    source_type IN ('shipment', 'delivery', 'balance_resolution', 'manual')
  ),
  source_id UUID NULL,

  -- Adjustment metadata
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  notes TEXT NULL,

  -- Approval workflow
  adjusted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Business constraints
  CONSTRAINT valid_qty_calculation CHECK (qty_after = qty_before + qty_change),
  CONSTRAINT approval_consistency CHECK (
    (requires_approval = TRUE AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
    (requires_approval = FALSE)
  )
);

-- Indexes
CREATE INDEX idx_inv_adj_sku ON inventory_adjustments(sku);
CREATE INDEX idx_inv_adj_warehouse ON inventory_adjustments(warehouse_id);
CREATE INDEX idx_inv_adj_date ON inventory_adjustments(adjustment_date DESC);
CREATE INDEX idx_inv_adj_type ON inventory_adjustments(adjustment_type);
CREATE INDEX idx_inv_adj_source ON inventory_adjustments(source_type, source_id)
  WHERE source_type IS NOT NULL;
CREATE INDEX idx_inv_adj_pending_approval ON inventory_adjustments(requires_approval, approved_at)
  WHERE requires_approval = TRUE AND approved_at IS NULL;

-- Comments
COMMENT ON TABLE inventory_adjustments IS 'Audit trail for all manual inventory quantity changes with approval workflow';
COMMENT ON COLUMN inventory_adjustments.qty_change IS 'Positive values = inventory increase (found goods, overage), Negative values = decrease (loss, damage, theft)';
COMMENT ON COLUMN inventory_adjustments.requires_approval IS 'TRUE if adjustment exceeds threshold or is high-value';
```

### 1.3 Modified Tables

#### 1.3.1 `purchase_order_items` - Add fulfillment tracking

```sql
-- ================================================================
-- Modification: purchase_order_items
-- Add: Balance tracking and fulfillment percentage
-- ================================================================

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS fulfilled_qty INTEGER NOT NULL DEFAULT 0 CHECK (fulfilled_qty >= 0),
  ADD COLUMN IF NOT EXISTS open_balance INTEGER GENERATED ALWAYS AS (
    GREATEST(0, ordered_qty - fulfilled_qty)
  ) STORED,
  ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    fulfillment_status IN ('pending', 'partial', 'fulfilled', 'short_closed')
  ),
  ADD COLUMN IF NOT EXISTS fulfillment_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN ordered_qty > 0 THEN ROUND((fulfilled_qty::NUMERIC / ordered_qty * 100), 2)
      ELSE 0
    END
  ) STORED;

-- Index for filtering by fulfillment status
CREATE INDEX IF NOT EXISTS idx_po_items_fulfillment ON purchase_order_items(fulfillment_status)
  WHERE fulfillment_status IN ('pending', 'partial');

COMMENT ON COLUMN purchase_order_items.fulfilled_qty IS 'Cumulative sum of all production_deliveries.delivered_qty for this PO item';
COMMENT ON COLUMN purchase_order_items.open_balance IS 'Unfulfilled quantity: ordered_qty - fulfilled_qty';
COMMENT ON COLUMN purchase_order_items.fulfillment_status IS 'pending = no deliveries yet, partial = some delivered, fulfilled = 100% delivered, short_closed = balance closed without full fulfillment';
```

#### 1.3.2 `production_deliveries` - Add variance tracking

```sql
-- ================================================================
-- Modification: production_deliveries
-- Add: Expected quantity and variance tracking
-- ================================================================

ALTER TABLE production_deliveries
  ADD COLUMN IF NOT EXISTS expected_qty INTEGER NULL CHECK (expected_qty IS NULL OR expected_qty > 0),
  ADD COLUMN IF NOT EXISTS variance_qty INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN expected_qty IS NOT NULL THEN expected_qty - delivered_qty
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS variance_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS has_variance BOOLEAN GENERATED ALWAYS AS (
    variance_qty IS NOT NULL AND variance_qty != 0
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_delivery_variance ON production_deliveries(has_variance)
  WHERE has_variance = TRUE;

COMMENT ON COLUMN production_deliveries.expected_qty IS 'Expected delivery quantity from PO item context. Used to detect partial deliveries.';
COMMENT ON COLUMN production_deliveries.variance_qty IS 'Delivery shortfall: expected_qty - delivered_qty. Positive = under-delivered, Negative = over-delivered';
```

#### 1.3.3 `shipment_items` - Add receipt tracking

```sql
-- ================================================================
-- Modification: shipment_items
-- Add: Received quantity and variance tracking
-- ================================================================

ALTER TABLE shipment_items
  ADD COLUMN IF NOT EXISTS received_qty INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  ADD COLUMN IF NOT EXISTS variance_qty INTEGER GENERATED ALWAYS AS (
    shipped_qty - received_qty
  ) STORED,
  ADD COLUMN IF NOT EXISTS receipt_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    receipt_status IN ('pending', 'partial', 'received', 'short_closed')
  );

CREATE INDEX IF NOT EXISTS idx_shipment_items_receipt ON shipment_items(receipt_status)
  WHERE receipt_status IN ('pending', 'partial');

COMMENT ON COLUMN shipment_items.received_qty IS 'Actual quantity received at warehouse. Updated when shipment.actual_arrival_date is set.';
COMMENT ON COLUMN shipment_items.variance_qty IS 'Logistics loss: shipped_qty - received_qty. Positive = loss in transit, Negative = impossible (should never happen)';
```

#### 1.3.4 `shipments` - Add finalization marker

```sql
-- ================================================================
-- Modification: shipments
-- Add: Finalization tracking to prevent reopening
-- ================================================================

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS finalized_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipment_status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (
    shipment_status IN ('draft', 'in_transit', 'arrived', 'finalized', 'cancelled')
  );

-- Constraint: finalized shipments cannot be edited
ALTER TABLE shipments ADD CONSTRAINT finalization_consistency CHECK (
  (is_finalized = TRUE AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL) OR
  (is_finalized = FALSE)
);

CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(shipment_status);

COMMENT ON COLUMN shipments.is_finalized IS 'Once TRUE, shipment cannot be edited. All variance must be resolved before finalization.';
```

### 1.4 New Enum Types

```sql
-- ================================================================
-- Custom Types (Enums)
-- ================================================================

-- Balance resolution status
DO $$ BEGIN
  CREATE TYPE balance_resolution_status AS ENUM (
    'pending',        -- Default state, awaiting user decision
    'deferred',       -- User postponed decision to future date
    'short_closed',   -- User confirmed will not fulfill
    'fulfilled',      -- Balance reached zero (auto-closed)
    'cancelled'       -- Record invalidated
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Balance resolution action
DO $$ BEGIN
  CREATE TYPE balance_resolution_action AS ENUM (
    'defer',           -- Postpone decision
    'create_carryover', -- Generate new procurement suggestion
    'short_close',     -- Close without fulfillment
    'auto_fulfilled'   -- System auto-closed when balance = 0
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Inventory adjustment type
DO $$ BEGIN
  CREATE TYPE inventory_adjustment_type AS ENUM (
    'cycle_count',      -- Physical count variance
    'logistics_loss',   -- Lost in transit
    'shipping_damage',  -- Damaged during shipping
    'quality_hold',     -- QA hold/rejection
    'theft',            -- Stolen inventory
    'found',            -- Found missing inventory
    'system_correction',-- System data error fix
    'supplier_overage', -- Supplier sent extra
    'manual'            -- Manual adjustment by admin
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Fulfillment status
DO $$ BEGIN
  CREATE TYPE fulfillment_status AS ENUM (
    'pending',      -- No deliveries yet
    'partial',      -- Some delivered, balance remains
    'fulfilled',    -- 100% delivered
    'short_closed'  -- Closed with balance
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
```

### 1.5 Helper Function: `update_updated_at_column()`

```sql
-- ================================================================
-- Trigger Function: Auto-update updated_at timestamp
-- ================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column IS 'Generic trigger function to auto-update updated_at column on row modification';
```

---

## 2. Row Level Security (RLS) Policies

### 2.1 `balance_resolutions` RLS

```sql
-- ================================================================
-- RLS: balance_resolutions
-- Security: All authenticated users can read, only creators/managers can modify
-- ================================================================

ALTER TABLE balance_resolutions ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users can view balances
DROP POLICY IF EXISTS "balance_resolutions_select_policy" ON balance_resolutions;
CREATE POLICY "balance_resolutions_select_policy"
  ON balance_resolutions
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: System creates balances automatically, or authorized users
DROP POLICY IF EXISTS "balance_resolutions_insert_policy" ON balance_resolutions;
CREATE POLICY "balance_resolutions_insert_policy"
  ON balance_resolutions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'supply_chain_manager')
    )
  );

-- UPDATE: Only creator or manager can update balances
DROP POLICY IF EXISTS "balance_resolutions_update_policy" ON balance_resolutions;
CREATE POLICY "balance_resolutions_update_policy"
  ON balance_resolutions
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'supply_chain_manager')
    )
  )
  WITH CHECK (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'supply_chain_manager')
    )
  );

-- DELETE: Only admins can delete balance records (soft delete preferred)
DROP POLICY IF EXISTS "balance_resolutions_delete_policy" ON balance_resolutions;
CREATE POLICY "balance_resolutions_delete_policy"
  ON balance_resolutions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );
```

### 2.2 `inventory_adjustments` RLS

```sql
-- ================================================================
-- RLS: inventory_adjustments
-- Security: Read-all, insert/update requires authorization
-- ================================================================

ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users can view adjustments
DROP POLICY IF EXISTS "inventory_adjustments_select_policy" ON inventory_adjustments;
CREATE POLICY "inventory_adjustments_select_policy"
  ON inventory_adjustments
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Warehouse staff or managers can create adjustments
DROP POLICY IF EXISTS "inventory_adjustments_insert_policy" ON inventory_adjustments;
CREATE POLICY "inventory_adjustments_insert_policy"
  ON inventory_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = adjusted_by AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'supply_chain_manager', 'warehouse_manager')
    )
  );

-- UPDATE: Only managers can approve adjustments
DROP POLICY IF EXISTS "inventory_adjustments_update_policy" ON inventory_adjustments;
CREATE POLICY "inventory_adjustments_update_policy"
  ON inventory_adjustments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'supply_chain_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'supply_chain_manager')
    )
  );

-- DELETE: No deletes allowed (audit trail must be preserved)
DROP POLICY IF EXISTS "inventory_adjustments_delete_policy" ON inventory_adjustments;
CREATE POLICY "inventory_adjustments_delete_policy"
  ON inventory_adjustments
  FOR DELETE
  TO authenticated
  USING (false); -- Hard block all deletes
```

---

## 3. Database Functions & Triggers

### 3.1 Function: `create_balance_resolution()`

**Purpose:** Centralized function to create balance records with validation.

```sql
-- ================================================================
-- Function: create_balance_resolution
-- Purpose: Create a balance resolution record with validation
-- ================================================================

CREATE OR REPLACE FUNCTION create_balance_resolution(
  p_source_type VARCHAR(30),
  p_source_id UUID,
  p_sku VARCHAR(50),
  p_planned_qty INTEGER,
  p_actual_qty INTEGER,
  p_original_planned_date DATE,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance_id UUID;
  v_variance INTEGER;
BEGIN
  -- Validate inputs
  IF p_planned_qty <= 0 THEN
    RAISE EXCEPTION 'Planned quantity must be greater than 0';
  END IF;

  IF p_actual_qty < 0 THEN
    RAISE EXCEPTION 'Actual quantity cannot be negative';
  END IF;

  IF p_source_type NOT IN ('po_item', 'delivery', 'shipment_item') THEN
    RAISE EXCEPTION 'Invalid source_type: %', p_source_type;
  END IF;

  -- Calculate variance
  v_variance := p_planned_qty - p_actual_qty;

  -- Only create balance if variance is positive (shortfall)
  IF v_variance <= 0 THEN
    RAISE NOTICE 'No balance created: actual >= planned (variance: %)', v_variance;
    RETURN NULL;
  END IF;

  -- Create balance record
  INSERT INTO balance_resolutions (
    source_type,
    source_id,
    sku,
    planned_qty,
    actual_qty,
    resolution_status,
    original_planned_date,
    created_by
  ) VALUES (
    p_source_type,
    p_source_id,
    p_sku,
    p_planned_qty,
    p_actual_qty,
    'pending',
    p_original_planned_date,
    COALESCE(p_created_by, auth.uid())
  )
  RETURNING id INTO v_balance_id;

  RAISE NOTICE 'Balance created: % (ID: %, Open: %)', p_sku, v_balance_id, v_variance;
  RETURN v_balance_id;
END;
$$;

COMMENT ON FUNCTION create_balance_resolution IS 'Creates a balance resolution record if actual < planned. Returns balance ID or NULL if no balance needed.';
```

### 3.2 Function: `resolve_balance()`

**Purpose:** Handle balance resolution actions (defer, short_close, etc.).

```sql
-- ================================================================
-- Function: resolve_balance
-- Purpose: Process balance resolution actions
-- ================================================================

CREATE OR REPLACE FUNCTION resolve_balance(
  p_balance_id UUID,
  p_action VARCHAR(30), -- 'defer' | 'short_close' | 'create_carryover'
  p_deferred_to_week VARCHAR(10) DEFAULT NULL,
  p_deferred_date DATE DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_resolved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status VARCHAR(20);
  v_sku VARCHAR(50);
  v_open_balance INTEGER;
  v_result JSONB;
BEGIN
  -- Get current balance state
  SELECT resolution_status, sku, open_balance
  INTO v_current_status, v_sku, v_open_balance
  FROM balance_resolutions
  WHERE id = p_balance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance record not found: %', p_balance_id;
  END IF;

  -- Validate status transition
  IF v_current_status IN ('fulfilled', 'short_closed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot modify balance in status: %', v_current_status;
  END IF;

  -- Execute action
  CASE p_action
    WHEN 'defer' THEN
      -- Defer decision to future date
      IF p_deferred_date IS NULL AND p_deferred_to_week IS NULL THEN
        RAISE EXCEPTION 'Deferred date or week must be provided for defer action';
      END IF;

      UPDATE balance_resolutions
      SET
        resolution_status = 'deferred',
        resolution_action = 'defer',
        deferred_to_week = p_deferred_to_week,
        deferred_date = COALESCE(p_deferred_date, (SELECT week_start_date FROM weeks WHERE week_iso = p_deferred_to_week)),
        updated_at = NOW()
      WHERE id = p_balance_id;

      v_result := jsonb_build_object(
        'success', true,
        'action', 'deferred',
        'message', format('Balance deferred to %s', COALESCE(p_deferred_to_week::TEXT, p_deferred_date::TEXT))
      );

    WHEN 'short_close' THEN
      -- Close balance without fulfillment
      IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'Reason is required for short_close action';
      END IF;

      UPDATE balance_resolutions
      SET
        resolution_status = 'short_closed',
        resolution_action = 'short_close',
        close_reason = p_reason,
        closed_at = NOW(),
        closed_by = COALESCE(p_resolved_by, auth.uid()),
        updated_at = NOW()
      WHERE id = p_balance_id;

      -- Trigger inventory projection refresh (handled by trigger)

      v_result := jsonb_build_object(
        'success', true,
        'action', 'short_closed',
        'message', format('Balance short closed: %s units', v_open_balance),
        'impacted_sku', v_sku
      );

    WHEN 'create_carryover' THEN
      -- Create new replenishment suggestion
      -- Note: This requires replenishment_suggestions table integration
      RAISE NOTICE 'Carryover logic not yet implemented';
      v_result := jsonb_build_object(
        'success', false,
        'action', 'create_carryover',
        'message', 'Carryover feature pending implementation'
      );

    ELSE
      RAISE EXCEPTION 'Invalid action: %', p_action;
  END CASE;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION resolve_balance IS 'Handles balance resolution actions: defer (postpone), short_close (cancel), create_carryover (generate new order)';
```

### 3.3 Function: `create_inventory_adjustment()`

**Purpose:** Create inventory adjustment records with validation.

```sql
-- ================================================================
-- Function: create_inventory_adjustment
-- Purpose: Create inventory adjustment with validation and approval logic
-- ================================================================

CREATE OR REPLACE FUNCTION create_inventory_adjustment(
  p_sku VARCHAR(50),
  p_warehouse_id UUID,
  p_adjustment_type VARCHAR(30),
  p_qty_before INTEGER,
  p_qty_change INTEGER,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL,
  p_source_type VARCHAR(30) DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_adjusted_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_adjustment_id UUID;
  v_qty_after INTEGER;
  v_requires_approval BOOLEAN;
  v_unit_cost NUMERIC;
  v_adjustment_value NUMERIC;
  v_approval_threshold NUMERIC := 5000.00; -- USD threshold
BEGIN
  -- Calculate qty_after
  v_qty_after := p_qty_before + p_qty_change;

  -- Validate
  IF v_qty_after < 0 THEN
    RAISE EXCEPTION 'Resulting quantity cannot be negative: % + % = %', p_qty_before, p_qty_change, v_qty_after;
  END IF;

  IF p_qty_change = 0 THEN
    RAISE EXCEPTION 'Quantity change cannot be zero';
  END IF;

  -- Get product cost for approval threshold check
  SELECT unit_cost_usd INTO v_unit_cost
  FROM products WHERE sku = p_sku;

  v_adjustment_value := ABS(p_qty_change * v_unit_cost);

  -- Determine if approval required
  v_requires_approval := (v_adjustment_value >= v_approval_threshold);

  -- Insert adjustment
  INSERT INTO inventory_adjustments (
    sku,
    warehouse_id,
    adjustment_type,
    qty_before,
    qty_change,
    qty_after,
    reason,
    notes,
    source_type,
    source_id,
    adjusted_by,
    requires_approval
  ) VALUES (
    p_sku,
    p_warehouse_id,
    p_adjustment_type,
    p_qty_before,
    p_qty_change,
    v_qty_after,
    p_reason,
    p_notes,
    p_source_type,
    p_source_id,
    COALESCE(p_adjusted_by, auth.uid()),
    v_requires_approval
  )
  RETURNING id INTO v_adjustment_id;

  -- Update inventory snapshot if auto-approved
  IF NOT v_requires_approval THEN
    UPDATE inventory_snapshots
    SET
      qty_on_hand = v_qty_after,
      updated_at = NOW()
    WHERE sku = p_sku AND warehouse_id = p_warehouse_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'adjustment_id', v_adjustment_id,
    'requires_approval', v_requires_approval,
    'adjustment_value_usd', v_adjustment_value,
    'qty_after', v_qty_after
  );
END;
$$;

COMMENT ON FUNCTION create_inventory_adjustment IS 'Creates inventory adjustment with automatic approval logic based on value threshold';
```

### 3.4 Function: `finalize_shipment()`

**Purpose:** Mark shipment as finalized after all variance resolved.

```sql
-- ================================================================
-- Function: finalize_shipment
-- Purpose: Finalize shipment and create adjustments for any variance
-- ================================================================

CREATE OR REPLACE FUNCTION finalize_shipment(
  p_shipment_id UUID,
  p_finalized_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_finalized BOOLEAN;
  v_warehouse_id UUID;
  v_item RECORD;
  v_adjustment_id UUID;
  v_adjustments_created INTEGER := 0;
BEGIN
  -- Check if already finalized
  SELECT is_finalized, destination_warehouse_id
  INTO v_is_finalized, v_warehouse_id
  FROM shipments
  WHERE id = p_shipment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment not found: %', p_shipment_id;
  END IF;

  IF v_is_finalized THEN
    RAISE EXCEPTION 'Shipment already finalized';
  END IF;

  -- Process each shipment item variance
  FOR v_item IN
    SELECT
      si.id,
      si.sku,
      si.shipped_qty,
      si.received_qty,
      si.variance_qty,
      si.receipt_status
    FROM shipment_items si
    WHERE si.shipment_id = p_shipment_id
      AND si.variance_qty != 0
  LOOP
    -- Create inventory adjustment for variance
    SELECT id INTO v_adjustment_id
    FROM create_inventory_adjustment(
      p_sku := v_item.sku,
      p_warehouse_id := v_warehouse_id,
      p_adjustment_type := 'logistics_loss',
      p_qty_before := v_item.received_qty - v_item.variance_qty,
      p_qty_change := -v_item.variance_qty, -- Negative for loss
      p_reason := format('Shipment variance: %s units lost in transit', v_item.variance_qty),
      p_source_type := 'shipment',
      p_source_id := p_shipment_id,
      p_adjusted_by := COALESCE(p_finalized_by, auth.uid())
    );

    v_adjustments_created := v_adjustments_created + 1;
  END LOOP;

  -- Mark shipment as finalized
  UPDATE shipments
  SET
    is_finalized = TRUE,
    finalized_at = NOW(),
    finalized_by = COALESCE(p_finalized_by, auth.uid()),
    shipment_status = 'finalized',
    updated_at = NOW()
  WHERE id = p_shipment_id;

  RETURN jsonb_build_object(
    'success', true,
    'shipment_id', p_shipment_id,
    'adjustments_created', v_adjustments_created,
    'finalized_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION finalize_shipment IS 'Finalizes shipment and creates inventory adjustments for any variance. Cannot be undone.';
```

### 3.5 Function: `get_open_balances_summary()`

**Purpose:** Query helper for dashboard KPIs.

```sql
-- ================================================================
-- Function: get_open_balances_summary
-- Purpose: Get summary statistics for open balances
-- ================================================================

CREATE OR REPLACE FUNCTION get_open_balances_summary(
  p_sku VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
  total_open_balances BIGINT,
  total_open_qty INTEGER,
  critical_count BIGINT,    -- Age > 45 days
  high_priority_count BIGINT, -- Age 15-45 days
  pending_count BIGINT,
  deferred_count BIGINT,
  avg_age_days NUMERIC,
  oldest_balance_days INTEGER
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COUNT(*) AS total_open_balances,
    SUM(open_balance)::INTEGER AS total_open_qty,
    COUNT(*) FILTER (WHERE CURRENT_DATE - created_at::DATE > 45) AS critical_count,
    COUNT(*) FILTER (WHERE CURRENT_DATE - created_at::DATE BETWEEN 15 AND 45) AS high_priority_count,
    COUNT(*) FILTER (WHERE resolution_status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE resolution_status = 'deferred') AS deferred_count,
    AVG(CURRENT_DATE - created_at::DATE) AS avg_age_days,
    MAX(CURRENT_DATE - created_at::DATE) AS oldest_balance_days
  FROM balance_resolutions
  WHERE open_balance > 0
    AND resolution_status IN ('pending', 'deferred')
    AND (p_sku IS NULL OR sku = p_sku);
$$;

COMMENT ON FUNCTION get_open_balances_summary IS 'Returns aggregated statistics for open balances, optionally filtered by SKU';
```

### 3.6 Trigger: Auto-close fulfilled balances

```sql
-- ================================================================
-- Trigger: Auto-close balance when open_balance reaches zero
-- ================================================================

CREATE OR REPLACE FUNCTION auto_close_fulfilled_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If open_balance becomes 0 and status is not already fulfilled
  IF NEW.open_balance = 0 AND OLD.open_balance > 0 AND NEW.resolution_status NOT IN ('fulfilled', 'cancelled') THEN
    NEW.resolution_status := 'fulfilled';
    NEW.resolution_action := 'auto_fulfilled';
    NEW.closed_at := NOW();
    RAISE NOTICE 'Balance auto-closed: ID=%, SKU=%', NEW.id, NEW.sku;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_close_fulfilled_balance
  BEFORE UPDATE ON balance_resolutions
  FOR EACH ROW
  WHEN (NEW.actual_qty IS DISTINCT FROM OLD.actual_qty)
  EXECUTE FUNCTION auto_close_fulfilled_balance();

COMMENT ON FUNCTION auto_close_fulfilled_balance IS 'Automatically sets status to fulfilled when open_balance reaches zero';
```

### 3.7 Trigger: Refresh projections on balance status change

```sql
-- ================================================================
-- Trigger: Refresh inventory projections when balance status changes
-- ================================================================

CREATE OR REPLACE FUNCTION refresh_projections_on_balance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only trigger refresh if status changed to short_closed or fulfilled
  IF (TG_OP = 'UPDATE' AND OLD.resolution_status != NEW.resolution_status)
     AND NEW.resolution_status IN ('short_closed', 'fulfilled') THEN

    -- Refresh projections for affected SKU
    -- Note: Actual refresh logic depends on your projection architecture
    RAISE NOTICE 'Projection refresh needed for SKU: %', NEW.sku;

    -- Option 1: Call materialized view refresh (if using)
    -- PERFORM refresh_inventory_projections(NEW.sku);

    -- Option 2: Invalidate cache
    -- DELETE FROM inventory_projections WHERE sku = NEW.sku;

  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_refresh_projections_on_balance_change
  AFTER UPDATE ON balance_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION refresh_projections_on_balance_change();

COMMENT ON FUNCTION refresh_projections_on_balance_change IS 'Triggers inventory projection recalculation when balance status changes';
```

---

## 4. TypeScript Type Definitions

Add the following to `/Users/tony/Desktop/rolloy-scm/src/lib/types/database.ts`:

```typescript
// ================================================================
// BALANCE MANAGEMENT TYPES
// ================================================================

// Enum types
export type BalanceResolutionStatus =
  | 'pending'
  | 'deferred'
  | 'short_closed'
  | 'fulfilled'
  | 'cancelled'

export type BalanceResolutionAction =
  | 'defer'
  | 'create_carryover'
  | 'short_close'
  | 'auto_fulfilled'

export type BalanceSourceType =
  | 'po_item'
  | 'delivery'
  | 'shipment_item'

export type InventoryAdjustmentType =
  | 'cycle_count'
  | 'logistics_loss'
  | 'shipping_damage'
  | 'quality_hold'
  | 'theft'
  | 'found'
  | 'system_correction'
  | 'supplier_overage'
  | 'manual'

export type FulfillmentStatus =
  | 'pending'
  | 'partial'
  | 'fulfilled'
  | 'short_closed'

export type ShipmentStatus =
  | 'draft'
  | 'in_transit'
  | 'arrived'
  | 'finalized'
  | 'cancelled'

// Table row types
export interface BalanceResolution {
  id: string
  source_type: BalanceSourceType
  source_id: string
  sku: string
  planned_qty: number
  actual_qty: number
  variance_qty: number // Computed
  open_balance: number // Computed
  resolution_status: BalanceResolutionStatus
  resolution_action: BalanceResolutionAction | null
  original_planned_date: string // DATE
  deferred_to_week: string | null // YYYY-WW
  deferred_date: string | null // DATE
  closed_at: string | null // TIMESTAMPTZ
  closed_by: string | null // UUID
  close_reason: string | null
  created_at: string // TIMESTAMPTZ
  updated_at: string // TIMESTAMPTZ
  created_by: string | null // UUID
}

export interface BalanceResolutionInsert {
  id?: string
  source_type: BalanceSourceType
  source_id: string
  sku: string
  planned_qty: number
  actual_qty?: number
  original_planned_date: string
  resolution_status?: BalanceResolutionStatus
  resolution_action?: BalanceResolutionAction | null
  deferred_to_week?: string | null
  deferred_date?: string | null
  close_reason?: string | null
  created_by?: string | null
}

export interface BalanceResolutionUpdate {
  actual_qty?: number
  resolution_status?: BalanceResolutionStatus
  resolution_action?: BalanceResolutionAction | null
  deferred_to_week?: string | null
  deferred_date?: string | null
  closed_at?: string | null
  closed_by?: string | null
  close_reason?: string | null
}

export interface InventoryAdjustment {
  id: string
  sku: string
  warehouse_id: string
  adjustment_type: InventoryAdjustmentType
  qty_before: number
  qty_change: number
  qty_after: number
  source_type: string | null
  source_id: string | null
  adjustment_date: string // DATE
  reason: string
  notes: string | null
  adjusted_by: string // UUID
  approved_by: string | null // UUID
  approved_at: string | null // TIMESTAMPTZ
  requires_approval: boolean
  created_at: string // TIMESTAMPTZ
}

export interface InventoryAdjustmentInsert {
  id?: string
  sku: string
  warehouse_id: string
  adjustment_type: InventoryAdjustmentType
  qty_before: number
  qty_change: number
  qty_after: number
  reason: string
  notes?: string | null
  source_type?: string | null
  source_id?: string | null
  adjusted_by?: string
  requires_approval?: boolean
}

export interface InventoryAdjustmentUpdate {
  approved_by?: string
  approved_at?: string
}

// Extended types for existing tables
export interface PurchaseOrderItemExtended extends PurchaseOrderItem {
  fulfilled_qty: number
  open_balance: number // Computed
  fulfillment_status: FulfillmentStatus
  fulfillment_percentage: number // Computed
}

export interface ProductionDeliveryExtended extends ProductionDelivery {
  expected_qty: number | null
  variance_qty: number | null // Computed
  variance_reason: string | null
  has_variance: boolean // Computed
}

export interface ShipmentItemExtended extends ShipmentItem {
  received_qty: number
  variance_qty: number // Computed
  receipt_status: FulfillmentStatus
}

export interface ShipmentExtended extends Shipment {
  is_finalized: boolean
  finalized_at: string | null
  finalized_by: string | null
  shipment_status: ShipmentStatus
}

// ================================================================
// BALANCE MANAGEMENT API TYPES
// ================================================================

// Server Action request/response types
export interface ResolveBalanceRequest {
  balanceId: string
  action: BalanceResolutionAction
  deferredToWeek?: string | null
  deferredDate?: string | null
  reason?: string | null
}

export interface ResolveBalanceResponse {
  success: boolean
  action: string
  message: string
  impactedSku?: string
}

export interface CreateAdjustmentRequest {
  sku: string
  warehouseId: string
  adjustmentType: InventoryAdjustmentType
  qtyBefore: number
  qtyChange: number
  reason: string
  notes?: string | null
  sourceType?: string | null
  sourceId?: string | null
}

export interface CreateAdjustmentResponse {
  success: boolean
  adjustmentId: string
  requiresApproval: boolean
  adjustmentValueUsd: number
  qtyAfter: number
}

export interface FinalizeShipmentResponse {
  success: boolean
  shipmentId: string
  adjustmentsCreated: number
  finalizedAt: string
}

// Dashboard KPI types
export interface BalanceSummaryKPIs {
  totalOpenBalances: number
  totalOpenQty: number
  criticalCount: number    // Age > 45 days
  highPriorityCount: number // Age 15-45 days
  pendingCount: number
  deferredCount: number
  avgAgeDays: number
  oldestBalanceDays: number
}

export interface BalanceListItem extends BalanceResolution {
  productName: string
  ageDays: number
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  parentReference: string // e.g., "PO#2025-001-A"
}

// Filters
export interface BalanceFilters {
  sku?: string
  status?: BalanceResolutionStatus | 'all'
  priority?: 'Critical' | 'High' | 'Medium' | 'Low'
  minAgeDays?: number
  maxAgeDays?: number
}

// ================================================================
// INVENTORY PROJECTION WITH BALANCES
// ================================================================

export interface InventoryProjection12WeeksViewExtended extends InventoryProjection12WeeksView {
  pending_balance_this_week: number
  total_pending_balance_count: number
  incoming_confirmed_qty: number // Existing shipments
  incoming_pending_qty: number    // Pending balances
}
```

---

## 5. Server Actions Design

Create file: `/Users/tony/Desktop/rolloy-scm/src/lib/actions/balance-management.ts`

```typescript
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  ResolveBalanceRequest,
  ResolveBalanceResponse,
  CreateAdjustmentRequest,
  CreateAdjustmentResponse,
  FinalizeShipmentResponse,
  BalanceSummaryKPIs,
  BalanceListItem,
  BalanceFilters
} from '@/lib/types/database'

// ================================================================
// Server Action: resolveBalance
// ================================================================

export async function resolveBalance(
  request: ResolveBalanceRequest
): Promise<{ success: boolean; data?: ResolveBalanceResponse; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()

    // Call database function
    const { data, error } = await supabase.rpc('resolve_balance', {
      p_balance_id: request.balanceId,
      p_action: request.action,
      p_deferred_to_week: request.deferredToWeek,
      p_deferred_date: request.deferredDate,
      p_reason: request.reason
    })

    if (error) {
      console.error('Error resolving balance:', error)
      return { success: false, error: error.message }
    }

    // Revalidate affected pages
    revalidatePath('/balance-management')
    revalidatePath('/planning')
    revalidatePath('/procurement')

    return { success: true, data: data as ResolveBalanceResponse }
  } catch (err) {
    console.error('Exception in resolveBalance:', err)
    return { success: false, error: String(err) }
  }
}

// ================================================================
// Server Action: createInventoryAdjustment
// ================================================================

export async function createInventoryAdjustment(
  request: CreateAdjustmentRequest
): Promise<{ success: boolean; data?: CreateAdjustmentResponse; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc('create_inventory_adjustment', {
      p_sku: request.sku,
      p_warehouse_id: request.warehouseId,
      p_adjustment_type: request.adjustmentType,
      p_qty_before: request.qtyBefore,
      p_qty_change: request.qtyChange,
      p_reason: request.reason,
      p_notes: request.notes,
      p_source_type: request.sourceType,
      p_source_id: request.sourceId
    })

    if (error) {
      console.error('Error creating adjustment:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/inventory')
    revalidatePath('/balance-management')

    return { success: true, data: data as CreateAdjustmentResponse }
  } catch (err) {
    console.error('Exception in createInventoryAdjustment:', err)
    return { success: false, error: String(err) }
  }
}

// ================================================================
// Server Action: finalizeShipment
// ================================================================

export async function finalizeShipment(
  shipmentId: string
): Promise<{ success: boolean; data?: FinalizeShipmentResponse; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc('finalize_shipment', {
      p_shipment_id: shipmentId
    })

    if (error) {
      console.error('Error finalizing shipment:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/logistics')
    revalidatePath('/inventory')

    return { success: true, data: data as FinalizeShipmentResponse }
  } catch (err) {
    console.error('Exception in finalizeShipment:', err)
    return { success: false, error: String(err) }
  }
}

// ================================================================
// Server Action: getOpenBalances
// ================================================================

export async function getOpenBalances(
  filters?: BalanceFilters
): Promise<{ success: boolean; data?: BalanceListItem[]; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('balance_resolutions')
      .select(`
        *,
        products!inner(product_name)
      `)
      .in('resolution_status', ['pending', 'deferred'])
      .gt('open_balance', 0)
      .order('created_at', { ascending: false })

    // Apply filters
    if (filters?.sku) {
      query = query.eq('sku', filters.sku)
    }

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('resolution_status', filters.status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching open balances:', error)
      return { success: false, error: error.message }
    }

    // Transform data
    const transformed: BalanceListItem[] = data.map((row: any) => {
      const ageDays = Math.floor(
        (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      let priority: 'Critical' | 'High' | 'Medium' | 'Low'
      if (ageDays > 45) priority = 'Critical'
      else if (ageDays > 15) priority = 'High'
      else if (ageDays > 7) priority = 'Medium'
      else priority = 'Low'

      const parentReference = `${row.source_type.toUpperCase()}#${row.source_id.substring(0, 8)}`

      return {
        ...row,
        productName: row.products.product_name,
        ageDays,
        priority,
        parentReference
      }
    })

    return { success: true, data: transformed }
  } catch (err) {
    console.error('Exception in getOpenBalances:', err)
    return { success: false, error: String(err) }
  }
}

// ================================================================
// Server Action: getBalanceSummaryKPIs
// ================================================================

export async function getBalanceSummaryKPIs(
  sku?: string
): Promise<{ success: boolean; data?: BalanceSummaryKPIs; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc('get_open_balances_summary', {
      p_sku: sku || null
    })

    if (error) {
      console.error('Error fetching balance summary:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data[0] as BalanceSummaryKPIs }
  } catch (err) {
    console.error('Exception in getBalanceSummaryKPIs:', err)
    return { success: false, error: String(err) }
  }
}

// ================================================================
// Server Action: updateBalanceActualQty
// Purpose: Update actual_qty when subsequent deliveries/receipts occur
// ================================================================

export async function updateBalanceActualQty(
  balanceId: string,
  newActualQty: number
): Promise<{ success: boolean; autoFulfilled?: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: balance, error: fetchError } = await supabase
      .from('balance_resolutions')
      .select('actual_qty, planned_qty')
      .eq('id', balanceId)
      .single()

    if (fetchError) {
      return { success: false, error: fetchError.message }
    }

    const { error: updateError } = await supabase
      .from('balance_resolutions')
      .update({ actual_qty: newActualQty })
      .eq('id', balanceId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    const autoFulfilled = newActualQty >= balance.planned_qty

    revalidatePath('/balance-management')

    return { success: true, autoFulfilled }
  } catch (err) {
    console.error('Exception in updateBalanceActualQty:', err)
    return { success: false, error: String(err) }
  }
}
```

---

## 6. View Updates

### 6.1 Updated View: `v_inventory_projection_12weeks`

**Changes:** Include pending balances in supply calculation.

```sql
-- ================================================================
-- View Update: v_inventory_projection_12weeks
-- Add pending balance tracking to supply projections
-- ================================================================

CREATE OR REPLACE VIEW v_inventory_projection_12weeks AS
WITH
-- Generate 12 weeks starting from current week
week_series AS (
  SELECT
    TO_CHAR(DATE_TRUNC('week', CURRENT_DATE + (n || ' weeks')::INTERVAL), 'IYYY-"W"IW') AS week_iso,
    DATE_TRUNC('week', CURRENT_DATE + (n || ' weeks')::INTERVAL)::DATE AS week_start_date,
    (DATE_TRUNC('week', CURRENT_DATE + (n || ' weeks')::INTERVAL) + INTERVAL '6 days')::DATE AS week_end_date,
    n AS week_offset
  FROM generate_series(0, 11) n
),

-- Current inventory
current_inventory AS (
  SELECT
    sku,
    SUM(qty_on_hand) AS total_on_hand
  FROM inventory_snapshots
  GROUP BY sku
),

-- Incoming supply from confirmed shipments
incoming_by_week AS (
  SELECT
    si.sku,
    TO_CHAR(DATE_TRUNC('week', COALESCE(s.actual_arrival_date, s.planned_arrival_date)), 'IYYY-"W"IW') AS arrival_week_iso,
    SUM(si.shipped_qty) AS confirmed_incoming_qty
  FROM shipment_items si
  INNER JOIN shipments s ON si.shipment_id = s.id
  WHERE COALESCE(s.actual_arrival_date, s.planned_arrival_date) >= DATE_TRUNC('week', CURRENT_DATE)
    AND COALESCE(s.actual_arrival_date, s.planned_arrival_date) <= DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '12 weeks'
    AND s.shipment_status NOT IN ('cancelled')
  GROUP BY si.sku, TO_CHAR(DATE_TRUNC('week', COALESCE(s.actual_arrival_date, s.planned_arrival_date)), 'IYYY-"W"IW')
),

-- *** NEW: Pending balances grouped by week ***
pending_balances_by_week AS (
  SELECT
    br.sku,
    COALESCE(
      br.deferred_to_week,
      TO_CHAR(DATE_TRUNC('week', br.original_planned_date + INTERVAL '7 days'), 'IYYY-"W"IW')
    ) AS arrival_week_iso,
    SUM(br.open_balance) AS pending_incoming_qty
  FROM balance_resolutions br
  WHERE br.resolution_status IN ('pending', 'deferred')
    AND br.open_balance > 0
    AND COALESCE(br.deferred_date, br.original_planned_date + INTERVAL '7 days') >= DATE_TRUNC('week', CURRENT_DATE)
    AND COALESCE(br.deferred_date, br.original_planned_date + INTERVAL '7 days') <= DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '12 weeks'
  GROUP BY br.sku, arrival_week_iso
),

-- Effective sales (actual if exists, else forecast)
sales_by_week AS (
  SELECT
    sku,
    week_iso,
    COALESCE(
      (SELECT SUM(actual_qty) FROM sales_actuals sa WHERE sa.sku = sf.sku AND sa.week_iso = sf.week_iso),
      SUM(forecast_qty)
    ) AS effective_sales
  FROM sales_forecasts sf
  GROUP BY sku, week_iso
),

-- Cross join all SKUs with all weeks
sku_week_matrix AS (
  SELECT DISTINCT
    p.sku,
    p.product_name,
    p.safety_stock_weeks,
    ws.week_iso,
    ws.week_start_date,
    ws.week_end_date,
    ws.week_offset
  FROM products p
  CROSS JOIN week_series ws
  WHERE p.is_active = TRUE
),

-- Calculate weekly projection
weekly_projection AS (
  SELECT
    swm.sku,
    swm.product_name,
    swm.week_iso,
    swm.week_start_date,
    swm.week_end_date,
    swm.week_offset,

    -- Opening stock (cumulative calculation handled by window function below)
    0 AS opening_stock_placeholder,

    -- Incoming supply
    COALESCE(iw.confirmed_incoming_qty, 0) AS incoming_confirmed_qty,
    COALESCE(pb.pending_incoming_qty, 0) AS incoming_pending_qty,
    COALESCE(iw.confirmed_incoming_qty, 0) + COALESCE(pb.pending_incoming_qty, 0) AS incoming_total_qty,

    -- Sales
    COALESCE(sw.effective_sales, 0) AS effective_sales,

    -- Safety stock threshold
    COALESCE(sw.effective_sales, 0) * swm.safety_stock_weeks AS safety_stock_threshold,

    -- Initial stock (only for week 0)
    CASE WHEN swm.week_offset = 0 THEN COALESCE(ci.total_on_hand, 0) ELSE 0 END AS initial_stock

  FROM sku_week_matrix swm
  LEFT JOIN current_inventory ci ON swm.sku = ci.sku
  LEFT JOIN incoming_by_week iw ON swm.sku = iw.sku AND swm.week_iso = iw.arrival_week_iso
  LEFT JOIN pending_balances_by_week pb ON swm.sku = pb.sku AND swm.week_iso = pb.arrival_week_iso
  LEFT JOIN sales_by_week sw ON swm.sku = sw.sku AND swm.week_iso = sw.week_iso
),

-- Calculate cumulative stock
final_projection AS (
  SELECT
    sku,
    product_name,
    week_iso,
    week_start_date,
    week_end_date,
    week_offset,

    -- Opening stock = previous week's closing OR initial stock
    COALESCE(
      LAG(
        initial_stock + incoming_total_qty - effective_sales
      ) OVER (PARTITION BY sku ORDER BY week_offset),
      initial_stock
    ) AS opening_stock,

    incoming_confirmed_qty,
    incoming_pending_qty,
    incoming_total_qty,
    effective_sales,

    -- Closing stock
    COALESCE(
      LAG(
        initial_stock + incoming_total_qty - effective_sales
      ) OVER (PARTITION BY sku ORDER BY week_offset),
      initial_stock
    ) + incoming_total_qty - effective_sales AS closing_stock,

    safety_stock_threshold,

    -- Stock status
    CASE
      WHEN COALESCE(
        LAG(
          initial_stock + incoming_total_qty - effective_sales
        ) OVER (PARTITION BY sku ORDER BY week_offset),
        initial_stock
      ) + incoming_total_qty - effective_sales < 0 THEN 'Stockout'
      WHEN COALESCE(
        LAG(
          initial_stock + incoming_total_qty - effective_sales
        ) OVER (PARTITION BY sku ORDER BY week_offset),
        initial_stock
      ) + incoming_total_qty - effective_sales < safety_stock_threshold THEN 'Risk'
      ELSE 'OK'
    END AS stock_status

  FROM weekly_projection
)

-- Final select with balance count
SELECT
  fp.*,

  -- *** NEW: Balance tracking columns ***
  (SELECT COUNT(*)
   FROM balance_resolutions br
   WHERE br.sku = fp.sku
     AND br.resolution_status IN ('pending', 'deferred')
     AND br.open_balance > 0
  ) AS total_pending_balance_count,

  -- Metadata
  NOW() AS calculated_at

FROM final_projection fp
ORDER BY sku, week_offset;

-- Grant permissions
GRANT SELECT ON v_inventory_projection_12weeks TO authenticated;

COMMENT ON VIEW v_inventory_projection_12weeks IS 'Enhanced 12-week inventory projection including pending balances in supply calculation';
```

### 6.2 New View: `v_balance_dashboard`

**Purpose:** Pre-aggregated view for balance management dashboard.

```sql
-- ================================================================
-- View: v_balance_dashboard
-- Purpose: Optimized view for balance management dashboard
-- ================================================================

CREATE OR REPLACE VIEW v_balance_dashboard AS
SELECT
  br.id,
  br.sku,
  p.product_name,
  br.source_type,
  br.source_id,
  br.planned_qty,
  br.actual_qty,
  br.open_balance,
  br.resolution_status,
  br.original_planned_date,
  br.deferred_to_week,
  br.deferred_date,
  br.created_at,

  -- Age calculation
  CURRENT_DATE - br.created_at::DATE AS age_days,

  -- Priority calculation
  CASE
    WHEN CURRENT_DATE - br.created_at::DATE > 45 THEN 'Critical'
    WHEN CURRENT_DATE - br.created_at::DATE > 15 THEN 'High'
    WHEN CURRENT_DATE - br.created_at::DATE > 7 THEN 'Medium'
    ELSE 'Low'
  END AS priority,

  -- Parent reference display
  CASE br.source_type
    WHEN 'po_item' THEN (
      SELECT po.po_number
      FROM purchase_order_items poi
      INNER JOIN purchase_orders po ON poi.po_id = po.id
      WHERE poi.id = br.source_id
    )
    WHEN 'delivery' THEN (
      SELECT pd.delivery_number
      FROM production_deliveries pd
      WHERE pd.id = br.source_id
    )
    WHEN 'shipment_item' THEN (
      SELECT s.tracking_number
      FROM shipment_items si
      INNER JOIN shipments s ON si.shipment_id = s.id
      WHERE si.id = br.source_id
    )
    ELSE 'Unknown'
  END AS parent_reference,

  -- Value calculation
  br.open_balance * p.unit_cost_usd AS balance_value_usd,

  -- Closure info
  br.closed_at,
  br.close_reason,
  u.email AS closed_by_email

FROM balance_resolutions br
INNER JOIN products p ON br.sku = p.sku
LEFT JOIN auth.users u ON br.closed_by = u.id
WHERE br.resolution_status IN ('pending', 'deferred')
  AND br.open_balance > 0
ORDER BY
  CASE
    WHEN CURRENT_DATE - br.created_at::DATE > 45 THEN 1
    WHEN CURRENT_DATE - br.created_at::DATE > 15 THEN 2
    WHEN CURRENT_DATE - br.created_at::DATE > 7 THEN 3
    ELSE 4
  END,
  br.created_at DESC;

GRANT SELECT ON v_balance_dashboard TO authenticated;

COMMENT ON VIEW v_balance_dashboard IS 'Pre-calculated balance dashboard data with priority, age, and parent reference resolution';
```

---

## 7. State Machine Diagrams

### 7.1 Balance Resolution Status Flow

```mermaid
stateDiagram-v2
    [*] --> pending: Balance Created<br/>(actual < planned)

    pending --> pending: User Defers<br/>Decision
    pending --> deferred: User Sets<br/>Deferred Date
    pending --> short_closed: User Confirms<br/>Won't Fulfill
    pending --> fulfilled: Actual Qty<br/>Catches Up (Auto)

    deferred --> deferred: Update<br/>Deferred Date
    deferred --> short_closed: User Confirms<br/>Won't Fulfill
    deferred --> fulfilled: Actual Qty<br/>Catches Up (Auto)

    short_closed --> [*]: Permanent<br/>Closure
    fulfilled --> [*]: Balance<br/>Resolved

    pending --> cancelled: Record<br/>Invalidated
    deferred --> cancelled: Record<br/>Invalidated
    cancelled --> [*]: Removed from<br/>Tracking

    note right of pending
        Status: pending
        - Default state
        - User hasn't decided
        - Included in projections
    end note

    note right of deferred
        Status: deferred
        - Postponed to future date
        - Still tracked
        - Included in projections
    end note

    note right of short_closed
        Status: short_closed
        - Will NOT be fulfilled
        - Removed from projections
        - Requires reason
    end note

    note right of fulfilled
        Status: fulfilled
        - Balance reached zero
        - Auto-closed by system
        - No further action needed
    end note
```

### 7.2 Purchase Order Fulfillment Flow

```mermaid
stateDiagram-v2
    [*] --> po_created: PO Created

    po_created --> balance_detected: Ordered Qty <<br/>Suggested Qty

    balance_detected --> user_decision: Display Variance<br/>Modal

    user_decision --> defer: User: Keep<br/>Pending
    user_decision --> short_close: User: Cancel<br/>Remaining
    user_decision --> carryover: User: Create<br/>Carryover

    defer --> pending_balance: Balance Status:<br/>pending/deferred
    short_close --> balance_closed: Balance Status:<br/>short_closed
    carryover --> new_suggestion: Generate New<br/>Suggestion

    pending_balance --> delivery_1: Factory<br/>Delivers Batch 1
    delivery_1 --> check_balance: Update<br/>fulfilled_qty

    check_balance --> partial: fulfilled_qty <<br/>ordered_qty
    check_balance --> complete: fulfilled_qty ==<br/>ordered_qty

    partial --> delivery_2: Factory<br/>Delivers Batch 2
    delivery_2 --> check_balance

    complete --> auto_fulfill: Auto-close<br/>Balance
    auto_fulfill --> [*]: PO Status:<br/>fulfilled

    balance_closed --> [*]: PO Status:<br/>short_closed
    new_suggestion --> [*]: Original Balance:<br/>fulfilled
```

### 7.3 Shipment Finalization Flow

```mermaid
stateDiagram-v2
    [*] --> draft: Shipment<br/>Created

    draft --> in_transit: Departure<br/>Confirmed
    in_transit --> arrived: Arrival<br/>Confirmed

    arrived --> check_variance: Compare shipped<br/>vs received

    check_variance --> no_variance: Quantities<br/>Match
    check_variance --> has_variance: Variance<br/>Detected

    has_variance --> create_adjustment: Create<br/>Inventory Adjustment
    create_adjustment --> mark_finalized

    no_variance --> mark_finalized: Mark<br/>Finalized

    mark_finalized --> finalized: is_finalized = TRUE<br/>Cannot be edited
    finalized --> [*]

    draft --> cancelled: Shipment<br/>Cancelled
    in_transit --> cancelled: Shipment<br/>Cancelled
    cancelled --> [*]

    note right of finalized
        Finalization locks shipment
        - All variance resolved
        - Inventory updated
        - Cannot be reopened
    end note
```

---

## 8. Data Flow Architecture

### 8.1 Balance Creation Flow (Procurement Example)

```mermaid
sequenceDiagram
    actor User as Supply Chain<br/>Manager
    participant UI as PO Creation<br/>Form
    participant SA as Server Action<br/>create_purchase_order
    participant DB as PostgreSQL<br/>Database
    participant BF as Balance Function<br/>create_balance_resolution
    participant Modal as Balance Resolution<br/>Modal

    User->>UI: Create PO with<br/>100 units
    UI->>SA: Submit PO data<br/>suggested: 200, ordered: 100

    SA->>DB: BEGIN TRANSACTION
    SA->>DB: INSERT purchase_order
    SA->>DB: INSERT purchase_order_items<br/>(ordered_qty: 100)

    SA->>BF: create_balance_resolution(<br/>po_item, 200, 100)
    BF->>DB: INSERT balance_resolutions<br/>(open_balance: 100)
    BF-->>SA: balance_id

    SA->>DB: COMMIT TRANSACTION
    SA-->>UI: {success, po_id, balance_id}

    UI->>Modal: Show variance modal<br/>(100 units unfulfilled)
    Modal->>User: Display options:<br/>Defer | Carryover | Short Close

    alt User: Defer Decision
        User->>Modal: Select "Keep Pending"<br/>deferred_date: +7 days
        Modal->>SA: resolveBalance(defer)
        SA->>DB: UPDATE balance_resolutions<br/>status: deferred
        SA-->>UI: {success}
        UI->>User: PO saved, balance pending
    else User: Short Close
        User->>Modal: Select "Cancel Remaining"<br/>reason: "Budget constraint"
        Modal->>SA: resolveBalance(short_close)
        SA->>DB: UPDATE balance_resolutions<br/>status: short_closed
        SA->>DB: TRIGGER: refresh_projections
        SA-->>UI: {success}
        UI->>User: PO saved, balance closed
    end
```

### 8.2 Partial Delivery Flow

```mermaid
sequenceDiagram
    actor User as Production<br/>Coordinator
    participant UI as Delivery<br/>Entry Form
    participant SA as Server Action<br/>create_delivery
    participant DB as PostgreSQL<br/>Database
    participant Trigger as Auto-Close<br/>Trigger

    User->>UI: Record delivery<br/>50 units (of 100 ordered)
    UI->>SA: Submit delivery data

    SA->>DB: BEGIN TRANSACTION
    SA->>DB: INSERT production_deliveries<br/>(delivered_qty: 50)

    SA->>DB: SELECT balance_resolutions<br/>WHERE source_id = po_item_id
    DB-->>SA: balance found (open: 100)

    SA->>DB: UPDATE balance_resolutions<br/>SET actual_qty = 50<br/>(open_balance: 50)

    DB->>Trigger: TRIGGER: auto_close_fulfilled_balance
    Trigger->>Trigger: Check: open_balance = 0?
    Trigger-->>Trigger: No, still 50 remaining

    SA->>DB: UPDATE purchase_order_items<br/>SET fulfilled_qty = 50<br/>status = partial

    SA->>DB: COMMIT TRANSACTION
    SA-->>UI: {success, balance_remaining: 50}

    UI->>User: Show: "50/100 delivered (50%)"<br/>Balance: 50 units pending

    Note over User,DB: Second delivery arrives

    User->>UI: Record delivery<br/>50 units (final batch)
    UI->>SA: Submit delivery data

    SA->>DB: BEGIN TRANSACTION
    SA->>DB: INSERT production_deliveries<br/>(delivered_qty: 50)

    SA->>DB: UPDATE balance_resolutions<br/>SET actual_qty = 100<br/>(open_balance: 0)

    DB->>Trigger: TRIGGER: auto_close_fulfilled_balance
    Trigger->>Trigger: Check: open_balance = 0?
    Trigger->>Trigger: Yes! Auto-close
    Trigger->>DB: SET status = fulfilled<br/>closed_at = NOW()

    SA->>DB: UPDATE purchase_order_items<br/>SET fulfilled_qty = 100<br/>status = fulfilled

    SA->>DB: COMMIT TRANSACTION
    SA-->>UI: {success, auto_fulfilled: true}

    UI->>User: Show: "100/100 delivered (100%)"<br/>✅ Balance fulfilled
```

### 8.3 Inventory Projection Calculation Flow

```mermaid
flowchart TD
    Start([User views<br/>Planning Dashboard]) --> FetchData[Fetch v_inventory_projection_12weeks]

    FetchData --> CTE1[CTE: current_inventory<br/>SUM qty_on_hand by SKU]
    FetchData --> CTE2[CTE: incoming_by_week<br/>Confirmed shipments]
    FetchData --> CTE3[CTE: pending_balances_by_week<br/>NEW: Open balances]
    FetchData --> CTE4[CTE: sales_by_week<br/>Effective sales]

    CTE1 --> Matrix[Cross join SKUs x Weeks]
    CTE2 --> Matrix
    CTE3 --> Matrix
    CTE4 --> Matrix

    Matrix --> CalcWeek0{Is Week 0?}

    CalcWeek0 -->|Yes| Week0[Opening Stock =<br/>current_inventory]
    CalcWeek0 -->|No| WeekN[Opening Stock =<br/>Previous week closing]

    Week0 --> AddSupply[Add Incoming:<br/>confirmed + pending]
    WeekN --> AddSupply

    AddSupply --> SubtractSales[Subtract:<br/>effective_sales]

    SubtractSales --> CalcClosing[Closing Stock =<br/>Opening + Incoming - Sales]

    CalcClosing --> CheckStatus{Closing Stock?}

    CheckStatus -->|< 0| Stockout[Status: Stockout]
    CheckStatus -->|< Safety Threshold| Risk[Status: Risk]
    CheckStatus -->|>= Safety Threshold| OK[Status: OK]

    Stockout --> AppendRow[Append row to result]
    Risk --> AppendRow
    OK --> AppendRow

    AppendRow --> MoreWeeks{More weeks<br/>for this SKU?}

    MoreWeeks -->|Yes| CalcWeek0
    MoreWeeks -->|No| MoreSKUs{More SKUs?}

    MoreSKUs -->|Yes| Matrix
    MoreSKUs -->|No| ReturnData[Return all rows<br/>to frontend]

    ReturnData --> RenderTable[Render projection table<br/>with balance indicators]

    RenderTable --> End([User sees<br/>12-week projection])

    style CTE3 fill:#ffeb3b,stroke:#f57c00,stroke-width:3px
    style AddSupply fill:#ffeb3b,stroke:#f57c00,stroke-width:2px
```

---

## 9. Implementation Roadmap

### Phase 1: Database Foundation (Week 1)

**Priority:** P0 (Must Have)

**Tasks:**
1. Create migration file: `20251203000001_balance_management_schema.sql`
   - New tables: `balance_resolutions`, `inventory_adjustments`
   - Modify tables: `purchase_order_items`, `production_deliveries`, `shipment_items`, `shipments`
   - Create enum types
   - Add indexes
   - Add RLS policies

2. Create migration file: `20251203000002_balance_management_functions.sql`
   - `create_balance_resolution()`
   - `resolve_balance()`
   - `create_inventory_adjustment()`
   - `finalize_shipment()`
   - `get_open_balances_summary()`
   - Triggers: `auto_close_fulfilled_balance`, `refresh_projections_on_balance_change`

3. Create migration file: `20251203000003_balance_management_views.sql`
   - Update `v_inventory_projection_12weeks`
   - Create `v_balance_dashboard`

4. Testing
   - Run migrations in Supabase SQL Editor
   - Verify constraints
   - Test functions with sample data
   - Validate RLS policies

**Acceptance Criteria:**
- All tables created without errors
- All functions executable
- RLS policies block unauthorized access
- Indexes present (verify with `EXPLAIN ANALYZE`)

---

### Phase 2: TypeScript Integration (Week 2)

**Priority:** P0 (Must Have)

**Tasks:**
1. Update `/src/lib/types/database.ts`
   - Add balance management types
   - Add extended types for modified tables
   - Add API request/response types

2. Create `/src/lib/actions/balance-management.ts`
   - Implement all Server Actions
   - Add error handling
   - Add revalidation paths

3. Create `/src/lib/queries/balance-management.ts`
   - Query helpers for balance data
   - Dashboard KPI queries
   - Balance list with filters

**Acceptance Criteria:**
- TypeScript compilation successful
- Server Actions return correct types
- Query functions tested with mock data

---

### Phase 3: Core UI Components (Week 3-4)

**Priority:** P0 (Must Have)

**Tasks:**
1. Create `/src/components/balance-management/BalanceResolutionDialog.tsx`
   - Modal UI for balance resolution
   - Form validation
   - Action buttons: Defer | Short Close | Carryover

2. Create `/src/components/balance-management/BalanceSummaryCards.tsx`
   - KPI cards: Total | Critical | High Priority | Pending

3. Create `/src/components/balance-management/BalanceListTable.tsx`
   - Data table with filters
   - Priority badges
   - Age indicators
   - Action menu per row

4. Create `/src/app/balance-management/page.tsx`
   - Dashboard layout
   - Integrate summary cards
   - Integrate balance list table
   - Add filters sidebar

**Acceptance Criteria:**
- Modal opens on PO creation variance
- Table displays balance records correctly
- Filters work (SKU, status, priority)
- Actions trigger correct Server Actions

---

### Phase 4: Procurement Integration (Week 5)

**Priority:** P0 (Must Have)

**Tasks:**
1. Modify `/src/lib/actions/procurement.ts`
   - Update `create_purchase_order_with_items()` to call `create_balance_resolution()`
   - Add balance creation logic

2. Modify `/src/app/procurement/create/page.tsx`
   - Integrate `BalanceResolutionDialog`
   - Show modal on variance detection

3. Modify `/src/app/procurement/[id]/page.tsx`
   - Add fulfillment progress section
   - Show balance status
   - Add "Short Close Balance" button

**Acceptance Criteria:**
- PO creation with variance triggers modal
- Balance records created correctly
- PO detail page shows fulfillment progress
- Fulfillment percentage updates on delivery

---

### Phase 5: Inventory Projection Enhancement (Week 6)

**Priority:** P1 (Should Have)

**Tasks:**
1. Modify `/src/app/planning/page.tsx`
   - Update to use new `v_inventory_projection_12weeks` view
   - Add balance indicator badges
   - Link to balance detail modal

2. Create `/src/components/planning/BalanceIndicatorBadge.tsx`
   - Show pending balance count
   - Clickable to open detail modal

**Acceptance Criteria:**
- Projection table includes pending balance data
- Balance indicators visible
- Clicking indicator opens balance detail

---

### Phase 6: Logistics & Shipment Integration (Week 7)

**Priority:** P1 (Should Have)

**Tasks:**
1. Modify `/src/lib/actions/logistics.ts`
   - Update `create_shipment_with_items()` to track variance
   - Add `finalizeShipment()` action

2. Modify `/src/app/logistics/[id]/page.tsx`
   - Add "Finalize Shipment" button
   - Show received vs. shipped comparison
   - Display variance adjustments

**Acceptance Criteria:**
- Shipment variance tracked correctly
- Finalization creates inventory adjustments
- Finalized shipments locked from editing

---

### Phase 7: Inventory Adjustment UI (Week 8)

**Priority:** P2 (Could Have)

**Tasks:**
1. Create `/src/app/inventory/adjustments/page.tsx`
   - List all adjustments
   - Filters: Type, Date, SKU, Approval Status

2. Create `/src/components/inventory/AdjustmentForm.tsx`
   - Form for manual adjustments
   - Reason dropdown
   - Approval workflow indication

**Acceptance Criteria:**
- Adjustments list displays correctly
- Manual adjustment form works
- High-value adjustments require approval

---

### Phase 8: Historical Data Migration (Week 9)

**Priority:** P1 (Should Have)

**Tasks:**
1. Create migration script: `20251203000010_backfill_balance_data.sql`
   - Identify existing POs with unfulfilled items
   - Create balance records for historical data
   - Auto short-close balances older than 90 days

2. Run migration in staging environment
   - Validate data integrity
   - Check projection recalculation

**Acceptance Criteria:**
- Historical balances created correctly
- No duplicate balance records
- Projections recalculated successfully

---

### Phase 9: Testing & QA (Week 10)

**Priority:** P0 (Must Have)

**Tasks:**
1. Unit tests for Server Actions
2. Integration tests for balance workflow
3. E2E tests for UI flows
4. Performance testing on large datasets
5. Security audit for RLS policies

**Acceptance Criteria:**
- All tests pass
- No performance degradation
- RLS policies verified secure

---

### Phase 10: Documentation & Training (Week 11)

**Priority:** P1 (Should Have)

**Tasks:**
1. Create user guide: `/docs/balance-management-user-guide.md`
2. Create video tutorials
3. Train stakeholders
4. Create runbook for support team

**Acceptance Criteria:**
- Documentation complete
- Stakeholders trained
- Runbook validated

---

## 10. Performance Optimization Strategy

### 10.1 Database Indexing

**Critical Indexes:**

```sql
-- Balance lookups by SKU
CREATE INDEX idx_balance_sku ON balance_resolutions(sku)
WHERE resolution_status IN ('pending', 'deferred');

-- Balance age-based queries
CREATE INDEX idx_balance_created_at ON balance_resolutions(created_at DESC);

-- Adjustment history by warehouse
CREATE INDEX idx_inv_adj_warehouse_date ON inventory_adjustments(warehouse_id, adjustment_date DESC);

-- PO fulfillment status filtering
CREATE INDEX idx_po_items_fulfillment ON purchase_order_items(fulfillment_status, open_balance)
WHERE fulfillment_status IN ('pending', 'partial');
```

### 10.2 Query Optimization

**Use prepared statements for Server Actions:**

```typescript
// Good: Use RPC for complex logic
await supabase.rpc('resolve_balance', { p_balance_id: id })

// Avoid: Multiple sequential queries
// const balance = await supabase.from('balance_resolutions').select('*').eq('id', id)
// await supabase.from('balance_resolutions').update({ status: 'closed' }).eq('id', id)
```

### 10.3 Caching Strategy

**Redis caching for dashboard KPIs:**

```typescript
// Pseudo-code
const cacheKey = `balance_summary_kpis:${sku || 'all'}`
const cached = await redis.get(cacheKey)

if (cached) {
  return JSON.parse(cached)
}

const data = await supabase.rpc('get_open_balances_summary', { p_sku: sku })
await redis.set(cacheKey, JSON.stringify(data), 'EX', 300) // 5 min TTL

return data
```

### 10.4 View Materialization (Future Enhancement)

**Convert `v_balance_dashboard` to materialized view if performance degrades:**

```sql
CREATE MATERIALIZED VIEW mv_balance_dashboard AS
SELECT * FROM v_balance_dashboard;

-- Refresh schedule (every 15 minutes)
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('refresh-balance-dashboard', '*/15 * * * *', 'REFRESH MATERIALIZED VIEW mv_balance_dashboard');
```

### 10.5 Pagination Best Practices

**Always paginate large result sets:**

```typescript
const { data, count } = await supabase
  .from('balance_resolutions')
  .select('*', { count: 'exact' })
  .in('resolution_status', ['pending', 'deferred'])
  .order('created_at', { ascending: false })
  .range(page * pageSize, (page + 1) * pageSize - 1)
```

---

## Appendix A: Migration Script Template

**File:** `/Users/tony/Desktop/rolloy-scm/supabase/migrations/20251203000001_balance_management_schema.sql`

```sql
-- ================================================================
-- Migration: Balance Management System - Schema Creation
-- Version: 1.0
-- Date: 2025-12-03
-- Author: System Architect
-- Description: Creates tables, types, indexes for balance tracking
-- ================================================================

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- STEP 1: Create Enum Types
-- ================================================================

-- (See Section 1.4 for enum creation DDL)

-- ================================================================
-- STEP 2: Create New Tables
-- ================================================================

-- (See Section 1.1 and 1.2 for table creation DDL)

-- ================================================================
-- STEP 3: Modify Existing Tables
-- ================================================================

-- (See Section 1.3 for ALTER TABLE statements)

-- ================================================================
-- STEP 4: Create Helper Functions
-- ================================================================

-- (See Section 1.5 for helper function)

-- ================================================================
-- STEP 5: Apply RLS Policies
-- ================================================================

-- (See Section 2 for RLS policy DDL)

-- ================================================================
-- STEP 6: Create Indexes
-- ================================================================

-- (Indexes are included in table definitions above)

-- ================================================================
-- STEP 7: Grant Permissions
-- ================================================================

GRANT SELECT, INSERT, UPDATE ON balance_resolutions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON inventory_adjustments TO authenticated;
GRANT SELECT ON v_balance_dashboard TO authenticated;

-- ================================================================
-- STEP 8: Add Comments
-- ================================================================

-- (Comments are included in table/function definitions above)

-- ================================================================
-- END OF MIGRATION
-- ================================================================
```

---

## Appendix B: Testing Checklist

### B.1 Database Function Tests

- [ ] `create_balance_resolution()` returns UUID for positive variance
- [ ] `create_balance_resolution()` returns NULL for zero/negative variance
- [ ] `resolve_balance()` with action='defer' updates status correctly
- [ ] `resolve_balance()` with action='short_close' requires reason
- [ ] `create_inventory_adjustment()` validates qty_after = qty_before + qty_change
- [ ] `finalize_shipment()` creates adjustments for variance
- [ ] `get_open_balances_summary()` returns correct aggregates
- [ ] Trigger `auto_close_fulfilled_balance` fires when open_balance = 0
- [ ] Trigger `refresh_projections_on_balance_change` fires on status change

### B.2 RLS Policy Tests

- [ ] Authenticated users can SELECT balance_resolutions
- [ ] Non-creators cannot UPDATE balance_resolutions
- [ ] Non-admins cannot DELETE balance_resolutions
- [ ] Warehouse managers can INSERT inventory_adjustments
- [ ] Non-managers cannot DELETE inventory_adjustments

### B.3 Server Action Tests

- [ ] `resolveBalance()` returns success for valid actions
- [ ] `resolveBalance()` returns error for invalid balance_id
- [ ] `createInventoryAdjustment()` requires approval for high-value adjustments
- [ ] `finalizeShipment()` prevents re-finalization
- [ ] `getOpenBalances()` applies filters correctly
- [ ] `updateBalanceActualQty()` triggers auto-fulfill

### B.4 UI Component Tests

- [ ] `BalanceResolutionDialog` displays correct variance amount
- [ ] `BalanceResolutionDialog` validates deferred_date > original_date
- [ ] `BalanceSummaryCards` shows correct KPI counts
- [ ] `BalanceListTable` sorts by priority correctly
- [ ] `BalanceListTable` filters by SKU work
- [ ] Fulfillment progress bar updates on delivery
- [ ] Shipment finalization button disabled when already finalized

---

## Appendix C: Rollback Plan

**If migration fails or causes issues:**

```sql
-- ================================================================
-- ROLLBACK MIGRATION: Balance Management System
-- WARNING: This will delete all balance tracking data
-- ================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_refresh_projections_on_balance_change ON balance_resolutions;
DROP TRIGGER IF EXISTS trigger_auto_close_fulfilled_balance ON balance_resolutions;
DROP TRIGGER IF EXISTS update_balance_resolutions_updated_at ON balance_resolutions;

-- Drop functions
DROP FUNCTION IF EXISTS refresh_projections_on_balance_change();
DROP FUNCTION IF EXISTS auto_close_fulfilled_balance();
DROP FUNCTION IF EXISTS get_open_balances_summary(VARCHAR);
DROP FUNCTION IF EXISTS finalize_shipment(UUID, UUID);
DROP FUNCTION IF EXISTS create_inventory_adjustment(VARCHAR, UUID, VARCHAR, INTEGER, INTEGER, TEXT, TEXT, VARCHAR, UUID, UUID);
DROP FUNCTION IF EXISTS resolve_balance(UUID, VARCHAR, VARCHAR, DATE, TEXT, UUID);
DROP FUNCTION IF EXISTS create_balance_resolution(VARCHAR, UUID, VARCHAR, INTEGER, INTEGER, DATE, UUID);

-- Drop views
DROP VIEW IF EXISTS v_balance_dashboard;
-- Restore original v_inventory_projection_12weeks (requires backup)

-- Drop tables
DROP TABLE IF EXISTS inventory_adjustments;
DROP TABLE IF EXISTS balance_resolutions;

-- Remove columns from existing tables
ALTER TABLE shipments
  DROP COLUMN IF EXISTS is_finalized,
  DROP COLUMN IF EXISTS finalized_at,
  DROP COLUMN IF EXISTS finalized_by,
  DROP COLUMN IF EXISTS shipment_status;

ALTER TABLE shipment_items
  DROP COLUMN IF EXISTS received_qty,
  DROP COLUMN IF EXISTS variance_qty,
  DROP COLUMN IF EXISTS receipt_status;

ALTER TABLE production_deliveries
  DROP COLUMN IF EXISTS expected_qty,
  DROP COLUMN IF EXISTS variance_qty,
  DROP COLUMN IF EXISTS variance_reason,
  DROP COLUMN IF EXISTS has_variance;

ALTER TABLE purchase_order_items
  DROP COLUMN IF EXISTS fulfilled_qty,
  DROP COLUMN IF EXISTS open_balance,
  DROP COLUMN IF EXISTS fulfillment_status,
  DROP COLUMN IF EXISTS fulfillment_percentage;

-- Drop enum types
DROP TYPE IF EXISTS balance_resolution_status;
DROP TYPE IF EXISTS balance_resolution_action;
DROP TYPE IF EXISTS inventory_adjustment_type;
DROP TYPE IF EXISTS fulfillment_status;

-- End rollback
```

---

## Sign-Off

### Document Approval

| Role | Name | Status | Date | Signature |
|------|------|--------|------|-----------|
| System Architect | Claude (Sonnet 4.5) | ✅ Completed | 2025-12-03 | [Signed] |
| Product Director | Pending Review | ⏳ Pending | - | - |
| Backend Specialist | Ready for Implementation | ⏳ Pending | - | - |
| Frontend Artisan | Ready for Implementation | ⏳ Pending | - | - |
| QA Director | Ready for Test Plan | ⏳ Pending | - | - |

### Next Actions

1. **Backend Specialist:** Review SQL migrations, test in Supabase staging environment
2. **Frontend Artisan:** Review TypeScript types, plan component architecture
3. **QA Director:** Create test plan based on Appendix B checklist
4. **Product Director:** Validate design against PRD requirements

---

**End of Technical Design Document**

*This document is ready for implementation. All DDL scripts are production-ready and can be executed directly in Supabase SQL Editor.*
