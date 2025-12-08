-- =====================================================================
-- Migration: Fix auto_allocate_forecast_to_po_item function
-- Version: 1.0.0
-- Date: 2025-12-08
--
-- Description:
--   修复自动分配函数的列名冲突问题，并确保正确授权
-- =====================================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS auto_allocate_forecast_to_po_item(UUID, UUID);

-- Recreate function with fixed column naming
CREATE OR REPLACE FUNCTION auto_allocate_forecast_to_po_item(
  p_po_item_id UUID,
  p_allocated_by UUID
)
RETURNS TABLE (
  out_forecast_id UUID,
  out_allocated_qty INTEGER,
  out_week_iso TEXT
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
    COALESCE(p.production_lead_weeks, 8)
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
      fc.forecast_id AS fid,
      fc.week_iso AS wiso,
      fc.uncovered_qty AS uqty
    FROM v_forecast_coverage fc
    WHERE fc.sku = v_po_item.sku
      AND (v_po_item.channel_code IS NULL OR fc.channel_code = v_po_item.channel_code)
      AND fc.uncovered_qty > 0
      AND fc.week_iso >= v_target_week
      AND fc.is_closed = FALSE  -- Skip closed forecasts
    ORDER BY fc.week_iso ASC
  ) LOOP
    EXIT WHEN v_remaining_qty = 0;

    v_allocate_qty := LEAST(v_remaining_qty, v_forecast.uqty);

    -- Insert allocation record
    INSERT INTO forecast_order_allocations (
      forecast_id,
      po_item_id,
      allocated_qty,
      allocation_type,
      allocated_by
    )
    VALUES (
      v_forecast.fid,
      p_po_item_id,
      v_allocate_qty,
      'auto',
      p_allocated_by
    )
    ON CONFLICT (forecast_id, po_item_id) DO UPDATE
    SET
      allocated_qty = forecast_order_allocations.allocated_qty + v_allocate_qty,
      updated_at = NOW();

    -- Return allocation result
    out_forecast_id := v_forecast.fid;
    out_allocated_qty := v_allocate_qty;
    out_week_iso := v_forecast.wiso;
    RETURN NEXT;

    v_remaining_qty := v_remaining_qty - v_allocate_qty;
  END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION auto_allocate_forecast_to_po_item(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_allocate_forecast_to_po_item(UUID, UUID) TO anon;

COMMENT ON FUNCTION auto_allocate_forecast_to_po_item IS
  'Auto-allocates PO item qty to uncovered forecasts using FIFO (earliest week first). Fixed column naming issue.';

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
