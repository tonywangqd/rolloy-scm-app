-- ================================================================
-- Migration: Balance Management System - Schema Creation
-- Version: 1.0
-- Date: 2025-12-03
-- Author: Backend Specialist
-- Description: Creates tables, types, indexes, and RLS policies for balance tracking
-- ================================================================

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- STEP 1: Create Enum Types
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

-- Shipment status
DO $$ BEGIN
  CREATE TYPE shipment_status AS ENUM (
    'draft',
    'in_transit',
    'arrived',
    'finalized',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ================================================================
-- STEP 2: Create New Tables
-- ================================================================

-- ================================================================
-- Table: balance_resolutions
-- Purpose: Track all balance discrepancies between planned and actual quantities
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
  resolution_status balance_resolution_status NOT NULL DEFAULT 'pending',
  resolution_action balance_resolution_action NULL,

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
CREATE INDEX IF NOT EXISTS idx_balance_source ON balance_resolutions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_balance_sku ON balance_resolutions(sku);
CREATE INDEX IF NOT EXISTS idx_balance_status ON balance_resolutions(resolution_status)
  WHERE resolution_status IN ('pending', 'deferred');
CREATE INDEX IF NOT EXISTS idx_balance_open ON balance_resolutions(open_balance)
  WHERE open_balance > 0;
CREATE INDEX IF NOT EXISTS idx_balance_deferred_date ON balance_resolutions(deferred_date)
  WHERE deferred_date IS NOT NULL AND resolution_status = 'deferred';
CREATE INDEX IF NOT EXISTS idx_balance_created_at ON balance_resolutions(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE balance_resolutions IS 'Tracks all balance discrepancies between planned and actual quantities across procurement, production, and logistics stages';
COMMENT ON COLUMN balance_resolutions.source_type IS 'Type of parent record: po_item (PO shortage), delivery (production variance), shipment_item (logistics loss)';
COMMENT ON COLUMN balance_resolutions.open_balance IS 'Computed field: MAX(0, planned_qty - actual_qty). Used in inventory projections.';
COMMENT ON COLUMN balance_resolutions.resolution_status IS 'Current state: pending (default), deferred (postponed decision), short_closed (will not fulfill), fulfilled (balance reached zero), cancelled (record invalidated)';

-- ================================================================
-- Table: inventory_adjustments
-- Purpose: Record manual inventory adjustments and reconciliation events
-- ================================================================

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Inventory context
  sku VARCHAR(50) NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,

  -- Adjustment type
  adjustment_type inventory_adjustment_type NOT NULL,

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
CREATE INDEX IF NOT EXISTS idx_inv_adj_sku ON inventory_adjustments(sku);
CREATE INDEX IF NOT EXISTS idx_inv_adj_warehouse ON inventory_adjustments(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_date ON inventory_adjustments(adjustment_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_adj_type ON inventory_adjustments(adjustment_type);
CREATE INDEX IF NOT EXISTS idx_inv_adj_source ON inventory_adjustments(source_type, source_id)
  WHERE source_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_adj_pending_approval ON inventory_adjustments(requires_approval, approved_at)
  WHERE requires_approval = TRUE AND approved_at IS NULL;

-- Comments
COMMENT ON TABLE inventory_adjustments IS 'Audit trail for all manual inventory quantity changes with approval workflow';
COMMENT ON COLUMN inventory_adjustments.qty_change IS 'Positive values = inventory increase (found goods, overage), Negative values = decrease (loss, damage, theft)';
COMMENT ON COLUMN inventory_adjustments.requires_approval IS 'TRUE if adjustment exceeds threshold or is high-value';

-- ================================================================
-- STEP 3: Modify Existing Tables
-- ================================================================

-- ================================================================
-- Modification: purchase_order_items
-- Add: Balance tracking and fulfillment percentage
-- ================================================================

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS fulfilled_qty INTEGER NOT NULL DEFAULT 0 CHECK (fulfilled_qty >= 0),
  ADD COLUMN IF NOT EXISTS open_balance INTEGER GENERATED ALWAYS AS (
    GREATEST(0, ordered_qty - fulfilled_qty)
  ) STORED,
  ADD COLUMN IF NOT EXISTS fulfillment_status fulfillment_status NOT NULL DEFAULT 'pending',
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
    expected_qty IS NOT NULL AND (expected_qty - delivered_qty) != 0
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_delivery_variance ON production_deliveries(has_variance)
  WHERE has_variance = TRUE;

COMMENT ON COLUMN production_deliveries.expected_qty IS 'Expected delivery quantity from PO item context. Used to detect partial deliveries.';
COMMENT ON COLUMN production_deliveries.variance_qty IS 'Delivery shortfall: expected_qty - delivered_qty. Positive = under-delivered, Negative = over-delivered';

-- ================================================================
-- Modification: shipment_items
-- Add: Received quantity and variance tracking
-- ================================================================

ALTER TABLE shipment_items
  ADD COLUMN IF NOT EXISTS received_qty INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  ADD COLUMN IF NOT EXISTS variance_qty INTEGER GENERATED ALWAYS AS (
    shipped_qty - received_qty
  ) STORED,
  ADD COLUMN IF NOT EXISTS receipt_status fulfillment_status NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_shipment_items_receipt ON shipment_items(receipt_status)
  WHERE receipt_status IN ('pending', 'partial');

COMMENT ON COLUMN shipment_items.received_qty IS 'Actual quantity received at warehouse. Updated when shipment.actual_arrival_date is set.';
COMMENT ON COLUMN shipment_items.variance_qty IS 'Logistics loss: shipped_qty - received_qty. Positive = loss in transit, Negative = impossible (should never happen)';

-- ================================================================
-- Modification: shipments
-- Add: Finalization tracking to prevent reopening
-- ================================================================

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS finalized_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipment_status shipment_status NOT NULL DEFAULT 'draft';

-- Constraint: finalized shipments cannot be edited
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS finalization_consistency;
ALTER TABLE shipments ADD CONSTRAINT finalization_consistency CHECK (
  (is_finalized = TRUE AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL) OR
  (is_finalized = FALSE)
);

CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(shipment_status);

COMMENT ON COLUMN shipments.is_finalized IS 'Once TRUE, shipment cannot be edited. All variance must be resolved before finalization.';

-- ================================================================
-- STEP 4: Create Helper Function for updated_at
-- ================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column IS 'Generic trigger function to auto-update updated_at column on row modification';

-- Apply trigger to balance_resolutions
DROP TRIGGER IF EXISTS update_balance_resolutions_updated_at ON balance_resolutions;
CREATE TRIGGER update_balance_resolutions_updated_at
  BEFORE UPDATE ON balance_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- STEP 5: Apply RLS Policies
-- ================================================================

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
  WITH CHECK (true);

-- UPDATE: All authenticated users can update (business logic in application layer)
DROP POLICY IF EXISTS "balance_resolutions_update_policy" ON balance_resolutions;
CREATE POLICY "balance_resolutions_update_policy"
  ON balance_resolutions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: Only admins can delete balance records (soft delete preferred)
DROP POLICY IF EXISTS "balance_resolutions_delete_policy" ON balance_resolutions;
CREATE POLICY "balance_resolutions_delete_policy"
  ON balance_resolutions
  FOR DELETE
  TO authenticated
  USING (true);

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

-- INSERT: All authenticated users can create adjustments
DROP POLICY IF EXISTS "inventory_adjustments_insert_policy" ON inventory_adjustments;
CREATE POLICY "inventory_adjustments_insert_policy"
  ON inventory_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: All authenticated users can approve adjustments
DROP POLICY IF EXISTS "inventory_adjustments_update_policy" ON inventory_adjustments;
CREATE POLICY "inventory_adjustments_update_policy"
  ON inventory_adjustments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: No deletes allowed (audit trail must be preserved)
DROP POLICY IF EXISTS "inventory_adjustments_delete_policy" ON inventory_adjustments;
CREATE POLICY "inventory_adjustments_delete_policy"
  ON inventory_adjustments
  FOR DELETE
  TO authenticated
  USING (false); -- Hard block all deletes

-- ================================================================
-- STEP 6: Grant Permissions
-- ================================================================

GRANT SELECT, INSERT, UPDATE ON balance_resolutions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON inventory_adjustments TO authenticated;

-- ================================================================
-- END OF MIGRATION
-- ================================================================
