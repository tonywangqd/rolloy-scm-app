-- ================================================================
-- Migration: Forecast Close Feature
-- Version: 1.0
-- Date: 2025-12-06
-- Description: Add ability to close/finalize forecasts
-- ================================================================

-- ================================================================
-- STEP 1: Add is_closed column to sales_forecasts
-- ================================================================

ALTER TABLE sales_forecasts
ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE;

ALTER TABLE sales_forecasts
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE sales_forecasts
ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id);

ALTER TABLE sales_forecasts
ADD COLUMN IF NOT EXISTS close_reason TEXT;

-- Index for filtering closed forecasts
CREATE INDEX IF NOT EXISTS idx_sales_forecasts_is_closed
ON sales_forecasts(is_closed);

COMMENT ON COLUMN sales_forecasts.is_closed IS 'Whether this forecast week has been finalized/closed';
COMMENT ON COLUMN sales_forecasts.closed_at IS 'Timestamp when the forecast was closed';
COMMENT ON COLUMN sales_forecasts.closed_by IS 'User who closed the forecast';
COMMENT ON COLUMN sales_forecasts.close_reason IS 'Optional reason for closing the forecast';

-- ================================================================
-- STEP 2: Update v_forecast_coverage view to include is_closed
-- ================================================================

DROP VIEW IF EXISTS v_forecast_coverage;

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

  -- Coverage status (consider is_closed)
  CASE
    WHEN sf.is_closed = TRUE THEN 'CLOSED'
    WHEN COALESCE(SUM(foa.allocated_qty), 0) = 0 THEN 'UNCOVERED'
    WHEN COALESCE(SUM(foa.allocated_qty), 0) < sf.forecast_qty * 0.90 THEN 'PARTIALLY_COVERED'
    WHEN COALESCE(SUM(foa.allocated_qty), 0) > sf.forecast_qty * 1.10 THEN 'OVER_COVERED'
    ELSE 'FULLY_COVERED'
  END AS coverage_status,

  -- Close status
  sf.is_closed,
  sf.closed_at,
  sf.close_reason,

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
WHERE (po.po_status != 'Cancelled' OR po.id IS NULL)

GROUP BY
  sf.id,
  sf.sku,
  sf.channel_code,
  sf.week_iso,
  sf.week_start_date,
  sf.week_end_date,
  sf.forecast_qty,
  sf.is_closed,
  sf.closed_at,
  sf.close_reason,
  p.product_name,
  p.spu;

COMMENT ON VIEW v_forecast_coverage IS 'Real-time forecast coverage status with close/finalize support';

-- ================================================================
-- STEP 3: Create close_forecast function
-- ================================================================

CREATE OR REPLACE FUNCTION close_forecast(
  p_forecast_id UUID,
  p_closed_by UUID,
  p_close_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if forecast exists
  IF NOT EXISTS (SELECT 1 FROM sales_forecasts WHERE id = p_forecast_id) THEN
    RETURN QUERY SELECT FALSE, 'Forecast not found';
    RETURN;
  END IF;

  -- Check if already closed
  IF EXISTS (SELECT 1 FROM sales_forecasts WHERE id = p_forecast_id AND is_closed = TRUE) THEN
    RETURN QUERY SELECT FALSE, 'Forecast is already closed';
    RETURN;
  END IF;

  -- Close the forecast
  UPDATE sales_forecasts
  SET
    is_closed = TRUE,
    closed_at = NOW(),
    closed_by = p_closed_by,
    close_reason = p_close_reason,
    updated_at = NOW()
  WHERE id = p_forecast_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION close_forecast IS 'Close/finalize a forecast week, marking it as done regardless of coverage';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION close_forecast(UUID, UUID, TEXT) TO authenticated;

-- ================================================================
-- END OF MIGRATION
-- ================================================================
