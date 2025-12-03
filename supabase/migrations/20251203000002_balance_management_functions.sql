-- ================================================================
-- Migration: Balance Management System - Database Functions
-- Version: 1.0
-- Date: 2025-12-03
-- Author: Backend Specialist
-- Description: Creates stored procedures and triggers for balance tracking
-- ================================================================

-- ================================================================
-- Function: create_balance_resolution
-- Purpose: Centralized function to create balance records with validation
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
  v_current_status balance_resolution_status;
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
        deferred_date = p_deferred_date,
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

      v_result := jsonb_build_object(
        'success', true,
        'action', 'short_closed',
        'message', format('Balance short closed: %s units', v_open_balance),
        'impacted_sku', v_sku
      );

    WHEN 'create_carryover' THEN
      -- Create new replenishment suggestion
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_sku;
  END IF;

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
    p_adjustment_type::inventory_adjustment_type,
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

-- ================================================================
-- Function: finalize_shipment
-- Purpose: Mark shipment as finalized after all variance resolved
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
  v_adjustments_created INTEGER := 0;
  v_adjustment_result JSONB;
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
    -- Create inventory adjustment for variance (loss)
    SELECT create_inventory_adjustment(
      p_sku := v_item.sku,
      p_warehouse_id := v_warehouse_id,
      p_adjustment_type := 'logistics_loss',
      p_qty_before := v_item.received_qty,
      p_qty_change := -v_item.variance_qty, -- Negative for loss
      p_reason := format('Shipment variance: %s units lost in transit', v_item.variance_qty),
      p_notes := NULL,
      p_source_type := 'shipment',
      p_source_id := p_shipment_id,
      p_adjusted_by := COALESCE(p_finalized_by, auth.uid())
    ) INTO v_adjustment_result;

    IF (v_adjustment_result->>'success')::boolean THEN
      v_adjustments_created := v_adjustments_created + 1;
    END IF;
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

-- ================================================================
-- Trigger: Auto-close fulfilled balances
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

DROP TRIGGER IF EXISTS trigger_auto_close_fulfilled_balance ON balance_resolutions;
CREATE TRIGGER trigger_auto_close_fulfilled_balance
  BEFORE UPDATE ON balance_resolutions
  FOR EACH ROW
  WHEN (NEW.actual_qty IS DISTINCT FROM OLD.actual_qty)
  EXECUTE FUNCTION auto_close_fulfilled_balance();

COMMENT ON FUNCTION auto_close_fulfilled_balance IS 'Automatically sets status to fulfilled when open_balance reaches zero';

-- ================================================================
-- Trigger: Refresh projections on balance status change
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
    RAISE NOTICE 'Projection refresh needed for SKU: %', NEW.sku;

    -- Note: Actual refresh logic handled by materialized view or cache invalidation
    -- in the application layer

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_refresh_projections_on_balance_change ON balance_resolutions;
CREATE TRIGGER trigger_refresh_projections_on_balance_change
  AFTER UPDATE ON balance_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION refresh_projections_on_balance_change();

COMMENT ON FUNCTION refresh_projections_on_balance_change IS 'Triggers inventory projection recalculation when balance status changes';

-- ================================================================
-- Grant execute permissions
-- ================================================================

GRANT EXECUTE ON FUNCTION create_balance_resolution TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_balance TO authenticated;
GRANT EXECUTE ON FUNCTION create_inventory_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_shipment TO authenticated;
GRANT EXECUTE ON FUNCTION get_open_balances_summary TO authenticated;

-- ================================================================
-- END OF MIGRATION
-- ================================================================
