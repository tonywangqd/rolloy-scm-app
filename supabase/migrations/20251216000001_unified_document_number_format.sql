-- ================================================================
-- Migration: Unified Document Number Format (Week-based)
-- Purpose: Update document number generation to use week-based format
--   Format: XX + YYYY + WW + NN
--   XX = Document type prefix (SF, PF, PO, OF, OS)
--   YYYY = ISO Week Year
--   WW = ISO Week Number (01-53)
--   NN = Sequence Number (01-99)
--
-- Examples:
--   PO20253801 = Purchase Order, Year 2025, Week 38, Sequence 01
--   OF20255101 = Order Fulfilled, Year 2025, Week 51, Sequence 01
--
-- Author: Rolloy SCM System (Backend Specialist)
-- Date: 2025-12-16
-- ================================================================

-- ================================================================
-- FUNCTION: Get ISO Week Year and Week Number
-- PostgreSQL uses ISO 8601 standard for week numbering
-- ================================================================

-- ================================================================
-- FUNCTION: Generate Next PO Number with Week Format
-- Format: PO{YYYY}{WW}{NN}
-- Example: PO20255101, PO20255102, PO20260101
-- ================================================================

CREATE OR REPLACE FUNCTION get_next_po_number(order_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
DECLARE
  week_year INTEGER;
  week_number INTEGER;
  week_prefix TEXT;
  next_sequence INTEGER;
  po_number TEXT;
BEGIN
  -- Get ISO week year and week number
  week_year := EXTRACT(ISOYEAR FROM order_date);
  week_number := EXTRACT(WEEK FROM order_date);

  -- Build week prefix: PO + YYYY + WW
  week_prefix := 'PO' || week_year::TEXT || LPAD(week_number::TEXT, 2, '0');

  -- Find the highest sequence number for this week
  SELECT COALESCE(
    MAX(
      NULLIF(
        REGEXP_REPLACE(
          po_number,
          '^' || week_prefix || '(\d{2})$',
          '\1'
        ),
        po_number
      )::INTEGER
    ),
    0
  ) + 1
  INTO next_sequence
  FROM purchase_orders
  WHERE po_number LIKE week_prefix || '%'
    AND LENGTH(po_number) = 12; -- PO + 4 + 2 + 2 = 10 characters, but PO = 2, so total 10

  -- Ensure sequence is at least 01
  IF next_sequence < 1 THEN
    next_sequence := 1;
  END IF;

  -- Cap at 99
  IF next_sequence > 99 THEN
    RAISE EXCEPTION 'Maximum PO number sequence (99) exceeded for week %', week_prefix;
  END IF;

  -- Build PO number: PO + YYYY + WW + NN
  po_number := week_prefix || LPAD(next_sequence::TEXT, 2, '0');

  RETURN po_number;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- FUNCTION: Generate Next Delivery Number with Week Format
-- Format: OF{YYYY}{WW}{NN}
-- Example: OF20255101, OF20255102
-- ================================================================

CREATE OR REPLACE FUNCTION get_next_delivery_number(delivery_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
DECLARE
  week_year INTEGER;
  week_number INTEGER;
  week_prefix TEXT;
  next_sequence INTEGER;
  delivery_number TEXT;
BEGIN
  -- Get ISO week year and week number
  week_year := EXTRACT(ISOYEAR FROM delivery_date);
  week_number := EXTRACT(WEEK FROM delivery_date);

  -- Build week prefix: OF + YYYY + WW
  week_prefix := 'OF' || week_year::TEXT || LPAD(week_number::TEXT, 2, '0');

  -- Find the highest sequence number for this week
  SELECT COALESCE(
    MAX(
      NULLIF(
        REGEXP_REPLACE(
          delivery_number,
          '^' || week_prefix || '(\d{2})$',
          '\1'
        ),
        delivery_number
      )::INTEGER
    ),
    0
  ) + 1
  INTO next_sequence
  FROM production_deliveries
  WHERE delivery_number LIKE week_prefix || '%'
    AND LENGTH(delivery_number) = 10; -- OF + 4 + 2 + 2 = 10 characters

  -- Ensure sequence is at least 01
  IF next_sequence < 1 THEN
    next_sequence := 1;
  END IF;

  -- Cap at 99
  IF next_sequence > 99 THEN
    RAISE EXCEPTION 'Maximum delivery number sequence (99) exceeded for week %', week_prefix;
  END IF;

  -- Build delivery number: OF + YYYY + WW + NN
  delivery_number := week_prefix || LPAD(next_sequence::TEXT, 2, '0');

  RETURN delivery_number;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- FUNCTION: Validate New Document Number Format
-- Returns true if format matches: XX{YYYY}{WW}{NN}
-- ================================================================

CREATE OR REPLACE FUNCTION validate_document_number_format(doc_number TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Pattern: 2 letter prefix + 4 digit year + 2 digit week + 2 digit sequence
  -- Valid prefixes: SF, PF, PO, OF, OS
  RETURN doc_number ~ '^(SF|PF|PO|OF|OS)\d{4}(0[1-9]|[1-4]\d|5[0-3])\d{2}$';
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- FUNCTION: Parse Document Number into Components
-- Returns JSON with prefix, year, week, sequence
-- ================================================================

CREATE OR REPLACE FUNCTION parse_document_number(doc_number TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
  prefix TEXT;
  year_str TEXT;
  week_str TEXT;
  seq_str TEXT;
BEGIN
  IF NOT validate_document_number_format(doc_number) THEN
    RETURN NULL;
  END IF;

  prefix := SUBSTRING(doc_number FROM 1 FOR 2);
  year_str := SUBSTRING(doc_number FROM 3 FOR 4);
  week_str := SUBSTRING(doc_number FROM 7 FOR 2);
  seq_str := SUBSTRING(doc_number FROM 9 FOR 2);

  result := json_build_object(
    'prefix', prefix,
    'year', year_str::INTEGER,
    'week', week_str::INTEGER,
    'sequence', seq_str::INTEGER,
    'full', doc_number
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- COMMENTS: Document the new format
-- ================================================================

COMMENT ON FUNCTION get_next_po_number(DATE) IS
'Generate next PO number in week-based format: PO{YYYY}{WW}{NN}
Example: PO20255101 for year 2025, week 51, sequence 01';

COMMENT ON FUNCTION get_next_delivery_number(DATE) IS
'Generate next delivery number in week-based format: OF{YYYY}{WW}{NN}
Example: OF20255101 for year 2025, week 51, sequence 01';

COMMENT ON FUNCTION validate_document_number_format(TEXT) IS
'Validate document number format: XX{YYYY}{WW}{NN}
Valid prefixes: SF (Sales Forecast), PF (Purchased Forecast), PO (Purchase Order), OF (Order Fulfilled), OS (Order Shipment)';

-- ================================================================
-- NOTE: Existing data migration
-- Old format numbers (PO2025120101, DLV-xxx) will remain as-is
-- New numbers will use the new format going forward
-- ================================================================
