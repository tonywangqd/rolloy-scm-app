-- ================================================================
-- Migration: Update PO Number Format and Add Delivery Enhancements
-- Purpose:
--   1. Support date-based PO number format (PO + YYYYMMDD + sequence)
--   2. Ensure production_deliveries table has complete structure
-- Author: Rolloy SCM System (Backend Specialist)
-- Date: 2025-12-01
-- ================================================================

-- ================================================================
-- FUNCTION: Generate Next PO Number with Date Format
-- Format: PO{YYYYMMDD}{NN}
-- Example: PO2025120101, PO2025120102, PO2025120301
-- ================================================================

CREATE OR REPLACE FUNCTION get_next_po_number(order_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
DECLARE
  date_prefix TEXT;
  next_sequence INTEGER;
  po_number TEXT;
BEGIN
  -- Generate date prefix in YYYYMMDD format
  date_prefix := TO_CHAR(order_date, 'YYYYMMDD');

  -- Find the highest sequence number for today's date
  -- Extract sequence from po_number pattern: PO{YYYYMMDD}{NN}
  SELECT COALESCE(
    MAX(
      NULLIF(
        REGEXP_REPLACE(
          po_number,
          '^PO' || date_prefix || '(\d{2})$',
          '\1'
        ),
        po_number
      )::INTEGER
    ),
    0
  ) + 1
  INTO next_sequence
  FROM purchase_orders
  WHERE po_number LIKE 'PO' || date_prefix || '%';

  -- Ensure sequence is at least 01
  IF next_sequence < 1 THEN
    next_sequence := 1;
  END IF;

  -- Build PO number: PO + YYYYMMDD + NN (zero-padded to 2 digits)
  po_number := 'PO' || date_prefix || LPAD(next_sequence::TEXT, 2, '0');

  RETURN po_number;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- FUNCTION: Generate Next Delivery Number with Date Format
-- Format: DLV{YYYYMMDD}{NN}
-- Example: DLV2025120101, DLV2025120102
-- ================================================================

CREATE OR REPLACE FUNCTION get_next_delivery_number(delivery_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
DECLARE
  date_prefix TEXT;
  next_sequence INTEGER;
  delivery_number TEXT;
BEGIN
  -- Generate date prefix in YYYYMMDD format
  date_prefix := TO_CHAR(delivery_date, 'YYYYMMDD');

  -- Find the highest sequence number for this date
  SELECT COALESCE(
    MAX(
      NULLIF(
        REGEXP_REPLACE(
          delivery_number,
          '^DLV' || date_prefix || '(\d{2})$',
          '\1'
        ),
        delivery_number
      )::INTEGER
    ),
    0
  ) + 1
  INTO next_sequence
  FROM production_deliveries
  WHERE delivery_number LIKE 'DLV' || date_prefix || '%';

  -- Ensure sequence is at least 01
  IF next_sequence < 1 THEN
    next_sequence := 1;
  END IF;

  -- Build delivery number: DLV + YYYYMMDD + NN (zero-padded to 2 digits)
  delivery_number := 'DLV' || date_prefix || LPAD(next_sequence::TEXT, 2, '0');

  RETURN delivery_number;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- FUNCTION: Validate PO Number Format
-- Ensures PO numbers follow the correct pattern
-- ================================================================

CREATE OR REPLACE FUNCTION validate_po_number_format(po_num TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if PO number matches pattern: PO{YYYYMMDD}{NN}
  -- Example: PO2025120101
  RETURN po_num ~ '^PO\d{8}\d{2}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================================================================
-- ALTER TABLE: Add constraint to validate PO number format (optional)
-- Note: Commented out to allow migration flexibility
-- Uncomment if you want strict validation at database level
-- ================================================================

-- ALTER TABLE purchase_orders
-- ADD CONSTRAINT check_po_number_format
-- CHECK (validate_po_number_format(po_number));

-- ================================================================
-- VERIFY: production_deliveries table structure
-- This table should already exist from base schema
-- Adding index optimizations for delivery queries
-- ================================================================

-- Add index on po_item_id for faster delivery lookups by PO
CREATE INDEX IF NOT EXISTS idx_production_deliveries_po_item_id
ON production_deliveries(po_item_id);

-- Add index on actual_delivery_date for date-based queries
CREATE INDEX IF NOT EXISTS idx_production_deliveries_delivery_date
ON production_deliveries(actual_delivery_date);

-- Add index on payment_status for finance queries
CREATE INDEX IF NOT EXISTS idx_production_deliveries_payment_status
ON production_deliveries(payment_status);

-- Add composite index for SKU and delivery date queries
CREATE INDEX IF NOT EXISTS idx_production_deliveries_sku_date
ON production_deliveries(sku, actual_delivery_date);

-- ================================================================
-- CREATE VIEW: PO Deliveries Summary
-- Helper view to see all deliveries grouped by PO
-- ================================================================

CREATE OR REPLACE VIEW v_po_deliveries_summary AS
SELECT
  po.id AS po_id,
  po.po_number,
  po.batch_code,
  po.po_status,
  po.actual_order_date,
  s.supplier_name,
  poi.id AS po_item_id,
  poi.sku,
  poi.channel_code,
  poi.ordered_qty,
  poi.delivered_qty AS total_delivered_qty,
  COALESCE(SUM(pd.delivered_qty), 0) AS sum_delivery_qty,
  COUNT(pd.id) AS delivery_count,
  -- Calculate remaining quantity
  poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0) AS remaining_qty,
  -- Fulfillment percentage
  CASE
    WHEN poi.ordered_qty > 0 THEN
      ROUND((COALESCE(SUM(pd.delivered_qty), 0)::NUMERIC / poi.ordered_qty * 100), 2)
    ELSE 0
  END AS fulfillment_percentage,
  -- Latest delivery date
  MAX(pd.actual_delivery_date) AS latest_delivery_date,
  -- Total value of deliveries
  COALESCE(SUM(pd.total_value_usd), 0) AS total_delivered_value_usd,
  -- Payment status summary
  ARRAY_AGG(DISTINCT pd.payment_status) FILTER (WHERE pd.payment_status IS NOT NULL) AS payment_statuses
FROM purchase_orders po
LEFT JOIN suppliers s ON po.supplier_id = s.id
LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
LEFT JOIN production_deliveries pd ON poi.id = pd.po_item_id
GROUP BY
  po.id,
  po.po_number,
  po.batch_code,
  po.po_status,
  po.actual_order_date,
  s.supplier_name,
  poi.id,
  poi.sku,
  poi.channel_code,
  poi.ordered_qty,
  poi.delivered_qty
ORDER BY po.actual_order_date DESC NULLS LAST, po.po_number;

-- ================================================================
-- HELPER FUNCTION: Get deliveries by PO with details
-- ================================================================

CREATE OR REPLACE FUNCTION get_deliveries_by_po(po_id_param UUID)
RETURNS TABLE (
  delivery_id UUID,
  delivery_number TEXT,
  sku TEXT,
  channel_code TEXT,
  delivered_qty INTEGER,
  planned_delivery_date DATE,
  actual_delivery_date DATE,
  unit_cost_usd NUMERIC,
  total_value_usd NUMERIC,
  payment_status TEXT,
  payment_due_date DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pd.id AS delivery_id,
    pd.delivery_number,
    pd.sku,
    pd.channel_code,
    pd.delivered_qty,
    pd.planned_delivery_date,
    pd.actual_delivery_date,
    pd.unit_cost_usd,
    pd.total_value_usd,
    pd.payment_status::TEXT,
    pd.payment_due_date,
    pd.remarks,
    pd.created_at
  FROM production_deliveries pd
  INNER JOIN purchase_order_items poi ON pd.po_item_id = poi.id
  WHERE poi.po_id = po_id_param
  ORDER BY pd.actual_delivery_date DESC NULLS LAST, pd.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ================================================================
-- HELPER FUNCTION: Get deliveries by SKU and date range
-- ================================================================

CREATE OR REPLACE FUNCTION get_deliveries_by_sku(
  sku_param TEXT,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  delivery_id UUID,
  delivery_number TEXT,
  po_number TEXT,
  batch_code TEXT,
  supplier_name TEXT,
  delivered_qty INTEGER,
  actual_delivery_date DATE,
  unit_cost_usd NUMERIC,
  total_value_usd NUMERIC,
  payment_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pd.id AS delivery_id,
    pd.delivery_number,
    po.po_number,
    po.batch_code,
    s.supplier_name,
    pd.delivered_qty,
    pd.actual_delivery_date,
    pd.unit_cost_usd,
    pd.total_value_usd,
    pd.payment_status::TEXT
  FROM production_deliveries pd
  INNER JOIN purchase_order_items poi ON pd.po_item_id = poi.id
  INNER JOIN purchase_orders po ON poi.po_id = po.id
  LEFT JOIN suppliers s ON po.supplier_id = s.id
  WHERE pd.sku = sku_param
    AND (start_date IS NULL OR pd.actual_delivery_date >= start_date)
    AND (end_date IS NULL OR pd.actual_delivery_date <= end_date)
  ORDER BY pd.actual_delivery_date DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE;

-- ================================================================
-- COMMENTS FOR DOCUMENTATION
-- ================================================================

COMMENT ON FUNCTION get_next_po_number(DATE) IS
'Generates next PO number in format PO{YYYYMMDD}{NN}. Example: PO2025120101 for first PO on Dec 1, 2025.';

COMMENT ON FUNCTION get_next_delivery_number(DATE) IS
'Generates next delivery number in format DLV{YYYYMMDD}{NN}. Example: DLV2025120101 for first delivery on Dec 1, 2025.';

COMMENT ON FUNCTION validate_po_number_format(TEXT) IS
'Validates that a PO number follows the required format: PO{YYYYMMDD}{NN}.';

COMMENT ON VIEW v_po_deliveries_summary IS
'Provides a summary view of all deliveries grouped by PO and PO line item, including fulfillment percentage and payment status.';

COMMENT ON FUNCTION get_deliveries_by_po(UUID) IS
'Returns all deliveries for a specific purchase order with full details.';

COMMENT ON FUNCTION get_deliveries_by_sku(TEXT, DATE, DATE) IS
'Returns all deliveries for a specific SKU, optionally filtered by date range.';

-- ================================================================
-- EXAMPLE USAGE (for testing in Supabase SQL Editor)
-- ================================================================

-- Test PO number generation
-- SELECT get_next_po_number();
-- SELECT get_next_po_number('2025-12-03'::DATE);

-- Test delivery number generation
-- SELECT get_next_delivery_number();

-- Test PO number validation
-- SELECT validate_po_number_format('PO2025120101'); -- Should return true
-- SELECT validate_po_number_format('PO-2025-0001'); -- Should return false

-- Query deliveries for a PO
-- SELECT * FROM get_deliveries_by_po('your-po-id-here');

-- Query deliveries for a SKU
-- SELECT * FROM get_deliveries_by_sku('SKU001', '2025-01-01', '2025-12-31');

-- View PO deliveries summary
-- SELECT * FROM v_po_deliveries_summary LIMIT 10;
