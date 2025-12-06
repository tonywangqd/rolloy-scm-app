-- ================================================================
-- Migration: Forecast-Order Linkage & Variance Management
-- Version: 1.0
-- Date: 2025-12-06
-- Author: System Architect
-- Description: Creates tables, views, triggers, and RLS for forecast coverage tracking
-- ================================================================

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- STEP 1: Create Tables
-- ================================================================

-- ================================================================
-- Table: forecast_order_allocations
-- Purpose: Many-to-many linkage between forecasts and purchase order items
-- ================================================================

CREATE TABLE IF NOT EXISTS forecast_order_allocations (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  forecast_id UUID NOT NULL,
  po_item_id UUID NOT NULL,

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
  CONSTRAINT fk_forecast_id FOREIGN KEY (forecast_id) REFERENCES sales_forecasts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_po_item_id FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_allocations_forecast ON forecast_order_allocations(forecast_id);
CREATE INDEX idx_allocations_po_item ON forecast_order_allocations(po_item_id);
CREATE INDEX idx_allocations_type ON forecast_order_allocations(allocation_type);
CREATE INDEX idx_allocations_allocated_at ON forecast_order_allocations(allocated_at DESC);

-- Comments
COMMENT ON TABLE forecast_order_allocations IS 'Links purchase order items to sales forecasts for demand coverage tracking';
COMMENT ON COLUMN forecast_order_allocations.allocated_qty IS 'Quantity allocated from PO item to fulfill this forecast';
COMMENT ON COLUMN forecast_order_allocations.allocation_type IS 'manual: user-created, auto: algorithm-generated';

-- ================================================================
-- Table: forecast_variance_resolutions
-- Purpose: Track and resolve forecast quantity adjustments after orders are placed
-- ================================================================

CREATE TABLE IF NOT EXISTS forecast_variance_resolutions (
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

-- ================================================================
-- Table: delivery_deletion_audit_log
-- Purpose: Audit trail for deleted production delivery records
-- ================================================================

CREATE TABLE IF NOT EXISTS delivery_deletion_audit_log (
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

-- ================================================================
-- STEP 2: Create Views
-- ================================================================

-- ================================================================
-- View: v_forecast_coverage
-- Purpose: Real-time calculation of forecast coverage status
-- ================================================================

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

COMMENT ON VIEW v_forecast_coverage IS 'Real-time forecast coverage status aggregated from allocations (excludes cancelled orders)';

-- ================================================================
-- View: v_variance_pending_actions
-- Purpose: Dashboard for pending variance resolutions
-- ================================================================

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

-- ================================================================
-- STEP 3: Create Stored Procedures
-- ================================================================

-- ================================================================
-- Function: delete_production_delivery
-- Purpose: Safely delete delivery record with business rule validation and rollback
-- ================================================================

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

-- ================================================================
-- Function: auto_allocate_forecast_to_po_item
-- Purpose: Automatically allocate PO item quantity to uncovered forecasts using FIFO
-- ================================================================

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
  v_order_date DATE;
  v_production_lead_weeks INTEGER;
  v_target_week TEXT;
BEGIN
  -- ================================================================
  -- STEP 1: Fetch PO item details
  -- ================================================================
  SELECT poi.* INTO v_po_item
  FROM purchase_order_items poi
  WHERE poi.id = p_po_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO item not found: %', p_po_item_id;
  END IF;

  v_remaining_qty := v_po_item.ordered_qty;

  -- Get PO order date and product lead time
  SELECT
    COALESCE(po.actual_order_date::DATE, po.planned_order_date::DATE, CURRENT_DATE),
    COALESCE(p.production_lead_weeks, 8) -- Default 8 weeks if not set
  INTO v_order_date, v_production_lead_weeks
  FROM purchase_orders po
  LEFT JOIN products p ON p.sku = v_po_item.sku
  WHERE po.id = v_po_item.po_id;

  -- Calculate target week (order date + production lead time)
  v_target_week := to_char(
    (v_order_date + (v_production_lead_weeks * 7))::DATE,
    'IYYY-"W"IW'
  );

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
      AND (v_po_item.channel_code IS NULL OR fc.channel_code = v_po_item.channel_code)
      AND fc.uncovered_qty > 0
      AND fc.week_iso >= v_target_week
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
    SET
      allocated_qty = forecast_order_allocations.allocated_qty + v_allocate_qty,
      updated_at = NOW();

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

-- ================================================================
-- STEP 4: Create Triggers
-- ================================================================

-- ================================================================
-- Trigger: Detect forecast variance on quantity update
-- ================================================================

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
    v_variance_pct := (v_variance_qty::DECIMAL / NULLIF(OLD.forecast_qty, 0)) * 100;

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

-- ================================================================
-- Trigger: Auto-update updated_at timestamp
-- ================================================================

CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_allocations_updated_at
BEFORE UPDATE ON forecast_order_allocations
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_variance_updated_at
BEFORE UPDATE ON forecast_variance_resolutions
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- ================================================================
-- STEP 5: Create RLS Policies
-- ================================================================

-- ================================================================
-- RLS: forecast_order_allocations
-- ================================================================

ALTER TABLE forecast_order_allocations ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read allocations
CREATE POLICY "Allocations readable by authenticated users"
  ON forecast_order_allocations FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Authenticated users can create allocations
CREATE POLICY "Allocations creatable by authenticated users"
  ON forecast_order_allocations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Authenticated users can update allocations
CREATE POLICY "Allocations updatable by authenticated users"
  ON forecast_order_allocations FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: Authenticated users can delete allocations
CREATE POLICY "Allocations deletable by authenticated users"
  ON forecast_order_allocations FOR DELETE
  USING (auth.role() = 'authenticated');

-- ================================================================
-- RLS: forecast_variance_resolutions
-- ================================================================

ALTER TABLE forecast_variance_resolutions ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read variance resolutions
CREATE POLICY "Variance resolutions readable by authenticated users"
  ON forecast_variance_resolutions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: System can create variance resolutions (via trigger)
CREATE POLICY "Variance resolutions creatable by system"
  ON forecast_variance_resolutions FOR INSERT
  WITH CHECK (true);

-- Policy: Authenticated users can update resolutions
CREATE POLICY "Variance resolutions updatable by authenticated users"
  ON forecast_variance_resolutions FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ================================================================
-- RLS: delivery_deletion_audit_log
-- ================================================================

ALTER TABLE delivery_deletion_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Audit logs readable by authenticated users
CREATE POLICY "Audit logs readable by authenticated users"
  ON delivery_deletion_audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: System can insert audit logs (via stored procedure)
CREATE POLICY "Audit logs insertable by system"
  ON delivery_deletion_audit_log FOR INSERT
  WITH CHECK (true);

-- No UPDATE or DELETE policies (audit logs are immutable)

-- ================================================================
-- STEP 6: Grant Permissions
-- ================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON forecast_order_allocations TO authenticated;
GRANT SELECT, UPDATE ON forecast_variance_resolutions TO authenticated;
GRANT SELECT ON delivery_deletion_audit_log TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION delete_production_delivery(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_allocate_forecast_to_po_item(UUID, UUID) TO authenticated;

-- ================================================================
-- STEP 7: Verification Queries (Comment out in production)
-- ================================================================

-- Verify tables created
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name LIKE 'forecast_%'
-- OR table_name = 'delivery_deletion_audit_log';

-- Verify RLS enabled
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- AND (tablename LIKE 'forecast_%' OR tablename = 'delivery_deletion_audit_log');

-- Verify views created
-- SELECT table_name FROM information_schema.views
-- WHERE table_schema = 'public'
-- AND table_name LIKE 'v_%variance%' OR table_name LIKE 'v_%coverage%';

-- ================================================================
-- END OF MIGRATION
-- ================================================================
