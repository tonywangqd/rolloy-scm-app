-- ================================================================
-- Migration: Update PO Number Format to support YYYY-MM-DD format
-- Purpose: Support user-friendly date format (PO2025-12-05-001)
-- Author: Rolloy SCM System
-- Date: 2025-12-05
-- ================================================================

-- ================================================================
-- FUNCTION: Validate PO Number Format (Updated)
-- Now supports both formats:
--   1. PO{YYYYMMDD}{NN} - e.g., PO2025120501 (old format)
--   2. PO{YYYY-MM-DD}-{NNN} - e.g., PO2025-12-05-001 (new format)
-- ================================================================

CREATE OR REPLACE FUNCTION validate_po_number_format(po_num TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if PO number matches either pattern:
  -- Pattern 1: PO{YYYYMMDD}{NN} - e.g., PO2025120501
  -- Pattern 2: PO{YYYY-MM-DD}-{NNN} - e.g., PO2025-12-05-001
  RETURN po_num ~ '^PO\d{8}\d{2}$' OR po_num ~ '^PO\d{4}-\d{2}-\d{2}-\d{3}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================================================================
-- FUNCTION: Generate Next PO Number (New Format)
-- Format: PO{YYYY-MM-DD}-{NNN}
-- Example: PO2025-12-05-001, PO2025-12-05-002
-- ================================================================

CREATE OR REPLACE FUNCTION get_next_po_number_v2(order_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
DECLARE
  date_str TEXT;
  next_sequence INTEGER;
  po_number TEXT;
  prefix TEXT;
BEGIN
  -- Generate date string in YYYY-MM-DD format
  date_str := TO_CHAR(order_date, 'YYYY-MM-DD');
  prefix := 'PO' || date_str || '-';

  -- Find the highest sequence number for this date
  SELECT COALESCE(
    MAX(
      NULLIF(
        REGEXP_REPLACE(
          po_number,
          '^PO' || date_str || '-(\d{3})$',
          '\1'
        ),
        po_number
      )::INTEGER
    ),
    0
  ) + 1
  INTO next_sequence
  FROM purchase_orders
  WHERE po_number LIKE prefix || '%';

  -- Ensure sequence is at least 1
  IF next_sequence < 1 THEN
    next_sequence := 1;
  END IF;

  -- Build PO number: PO + YYYY-MM-DD + NNN (zero-padded to 3 digits)
  po_number := prefix || LPAD(next_sequence::TEXT, 3, '0');

  RETURN po_number;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION validate_po_number_format(TEXT) IS
'Validates PO number format. Supports: PO{YYYYMMDD}{NN} (old) or PO{YYYY-MM-DD}-{NNN} (new)';

COMMENT ON FUNCTION get_next_po_number_v2(DATE) IS
'Generates next PO number in new format: PO{YYYY-MM-DD}-{NNN}. Example: PO2025-12-05-001';
