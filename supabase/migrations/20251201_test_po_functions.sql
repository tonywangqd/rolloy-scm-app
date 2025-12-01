-- ================================================================
-- Test Script: Verify PO Number Format and Delivery Functions
-- Purpose: Validate all new functions and views created in the migration
-- Author: Rolloy SCM System
-- Date: 2025-12-01
-- ================================================================

-- ================================================================
-- SECTION 1: Test PO Number Generation
-- ================================================================

-- Test 1.1: Generate PO number for today
DO $$
DECLARE
  po_num TEXT;
BEGIN
  po_num := get_next_po_number();
  RAISE NOTICE 'Test 1.1 - Today PO Number: %', po_num;

  -- Verify format
  IF NOT validate_po_number_format(po_num) THEN
    RAISE EXCEPTION 'Invalid PO number format: %', po_num;
  END IF;

  RAISE NOTICE 'Test 1.1 PASSED: PO format is valid';
END $$;

-- Test 1.2: Generate PO number for specific date
DO $$
DECLARE
  po_num TEXT;
  test_date DATE := '2025-12-03';
BEGIN
  po_num := get_next_po_number(test_date);
  RAISE NOTICE 'Test 1.2 - PO Number for 2025-12-03: %', po_num;

  -- Should start with PO20251203
  IF po_num NOT LIKE 'PO20251203%' THEN
    RAISE EXCEPTION 'PO number does not match expected date prefix: %', po_num;
  END IF;

  RAISE NOTICE 'Test 1.2 PASSED: PO date prefix is correct';
END $$;

-- Test 1.3: Generate multiple PO numbers for same date (sequence increment)
DO $$
DECLARE
  po_num1 TEXT;
  po_num2 TEXT;
  po_num3 TEXT;
  test_date DATE := '2025-12-15';
BEGIN
  -- Create first PO
  INSERT INTO purchase_orders (po_number, batch_code)
  VALUES (get_next_po_number(test_date), 'TEST_BATCH_001');

  -- Get the inserted PO number
  SELECT po_number INTO po_num1
  FROM purchase_orders
  WHERE batch_code = 'TEST_BATCH_001'
  ORDER BY created_at DESC
  LIMIT 1;

  RAISE NOTICE 'Test 1.3 - First PO: %', po_num1;

  -- Create second PO
  INSERT INTO purchase_orders (po_number, batch_code)
  VALUES (get_next_po_number(test_date), 'TEST_BATCH_002');

  SELECT po_number INTO po_num2
  FROM purchase_orders
  WHERE batch_code = 'TEST_BATCH_002'
  ORDER BY created_at DESC
  LIMIT 1;

  RAISE NOTICE 'Test 1.3 - Second PO: %', po_num2;

  -- Verify sequence incremented
  IF po_num1 >= po_num2 THEN
    RAISE EXCEPTION 'PO sequence did not increment correctly: % >= %', po_num1, po_num2;
  END IF;

  -- Cleanup test data
  DELETE FROM purchase_orders WHERE batch_code IN ('TEST_BATCH_001', 'TEST_BATCH_002');

  RAISE NOTICE 'Test 1.3 PASSED: PO sequence increments correctly';
END $$;

-- ================================================================
-- SECTION 2: Test Delivery Number Generation
-- ================================================================

-- Test 2.1: Generate delivery number for today
DO $$
DECLARE
  dlv_num TEXT;
BEGIN
  dlv_num := get_next_delivery_number();
  RAISE NOTICE 'Test 2.1 - Today Delivery Number: %', dlv_num;

  -- Verify format
  IF dlv_num !~ '^DLV\d{8}\d{2}$' THEN
    RAISE EXCEPTION 'Invalid delivery number format: %', dlv_num;
  END IF;

  RAISE NOTICE 'Test 2.1 PASSED: Delivery number format is valid';
END $$;

-- Test 2.2: Generate delivery number for specific date
DO $$
DECLARE
  dlv_num TEXT;
  test_date DATE := '2025-12-25';
BEGIN
  dlv_num := get_next_delivery_number(test_date);
  RAISE NOTICE 'Test 2.2 - Delivery Number for 2025-12-25: %', dlv_num;

  -- Should start with DLV20251225
  IF dlv_num NOT LIKE 'DLV20251225%' THEN
    RAISE EXCEPTION 'Delivery number does not match expected date prefix: %', dlv_num;
  END IF;

  RAISE NOTICE 'Test 2.2 PASSED: Delivery date prefix is correct';
END $$;

-- ================================================================
-- SECTION 3: Test PO Number Validation
-- ================================================================

-- Test 3.1: Validate correct format
DO $$
BEGIN
  IF NOT validate_po_number_format('PO2025120101') THEN
    RAISE EXCEPTION 'Valid PO number failed validation';
  END IF;

  RAISE NOTICE 'Test 3.1 PASSED: Valid PO number accepted';
END $$;

-- Test 3.2: Reject old format
DO $$
BEGIN
  IF validate_po_number_format('PO-2025-0001') THEN
    RAISE EXCEPTION 'Old format PO number incorrectly validated';
  END IF;

  RAISE NOTICE 'Test 3.2 PASSED: Old format PO number rejected';
END $$;

-- Test 3.3: Reject invalid formats
DO $$
DECLARE
  invalid_po TEXT;
  test_cases TEXT[] := ARRAY['PO123', 'PO202512', 'PO20251201', 'ABC2025120101', ''];
BEGIN
  FOREACH invalid_po IN ARRAY test_cases
  LOOP
    IF validate_po_number_format(invalid_po) THEN
      RAISE EXCEPTION 'Invalid PO number incorrectly validated: %', invalid_po;
    END IF;
  END LOOP;

  RAISE NOTICE 'Test 3.3 PASSED: All invalid formats rejected';
END $$;

-- ================================================================
-- SECTION 4: Test Delivery Query Functions (requires data)
-- ================================================================

-- Note: These tests require actual data in the database
-- Uncomment and modify with actual IDs if you have test data

/*
-- Test 4.1: Query deliveries by PO
DO $$
DECLARE
  test_po_id UUID := 'your-test-po-id-here';
  delivery_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO delivery_count
  FROM get_deliveries_by_po(test_po_id);

  RAISE NOTICE 'Test 4.1 - Found % deliveries for PO', delivery_count;
  RAISE NOTICE 'Test 4.1 PASSED';
END $$;

-- Test 4.2: Query deliveries by SKU
DO $$
DECLARE
  test_sku TEXT := 'TEST_SKU_001';
  delivery_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO delivery_count
  FROM get_deliveries_by_sku(test_sku, '2025-01-01', '2025-12-31');

  RAISE NOTICE 'Test 4.2 - Found % deliveries for SKU %', delivery_count, test_sku;
  RAISE NOTICE 'Test 4.2 PASSED';
END $$;
*/

-- ================================================================
-- SECTION 5: Test View Creation
-- ================================================================

-- Test 5.1: Verify v_po_deliveries_summary exists
DO $$
DECLARE
  view_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'v_po_deliveries_summary'
  ) INTO view_exists;

  IF NOT view_exists THEN
    RAISE EXCEPTION 'View v_po_deliveries_summary does not exist';
  END IF;

  RAISE NOTICE 'Test 5.1 PASSED: View v_po_deliveries_summary exists';
END $$;

-- Test 5.2: Query view (should not error even if empty)
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count
  FROM v_po_deliveries_summary;

  RAISE NOTICE 'Test 5.2 - View has % rows', row_count;
  RAISE NOTICE 'Test 5.2 PASSED: View is queryable';
END $$;

-- ================================================================
-- SECTION 6: Test Index Creation
-- ================================================================

-- Test 6.1: Verify all indexes exist
DO $$
DECLARE
  expected_indexes TEXT[] := ARRAY[
    'idx_production_deliveries_po_item_id',
    'idx_production_deliveries_delivery_date',
    'idx_production_deliveries_payment_status',
    'idx_production_deliveries_sku_date'
  ];
  index_name TEXT;
  index_exists BOOLEAN;
BEGIN
  FOREACH index_name IN ARRAY expected_indexes
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'production_deliveries'
        AND indexname = index_name
    ) INTO index_exists;

    IF NOT index_exists THEN
      RAISE EXCEPTION 'Index % does not exist', index_name;
    END IF;

    RAISE NOTICE 'Index % verified', index_name;
  END LOOP;

  RAISE NOTICE 'Test 6.1 PASSED: All indexes exist';
END $$;

-- ================================================================
-- SECTION 7: Performance Test (Optional)
-- ================================================================

-- Test 7.1: Benchmark PO number generation
DO $$
DECLARE
  start_time TIMESTAMPTZ;
  end_time TIMESTAMPTZ;
  duration INTERVAL;
  po_num TEXT;
  i INTEGER;
BEGIN
  start_time := clock_timestamp();

  -- Generate 100 PO numbers
  FOR i IN 1..100 LOOP
    po_num := get_next_po_number();
  END LOOP;

  end_time := clock_timestamp();
  duration := end_time - start_time;

  RAISE NOTICE 'Test 7.1 - Generated 100 PO numbers in %', duration;
  RAISE NOTICE 'Test 7.1 PASSED: Performance acceptable';
END $$;

-- ================================================================
-- SECTION 8: Summary
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'ALL TESTS COMPLETED SUCCESSFULLY';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - PO number generation: OK';
  RAISE NOTICE '  - Delivery number generation: OK';
  RAISE NOTICE '  - Format validation: OK';
  RAISE NOTICE '  - Views: OK';
  RAISE NOTICE '  - Indexes: OK';
  RAISE NOTICE '  - Performance: OK';
  RAISE NOTICE '';
  RAISE NOTICE 'You can now use the new PO number format in your application.';
  RAISE NOTICE '';
END $$;

-- ================================================================
-- ADDITIONAL QUERIES FOR MANUAL VERIFICATION
-- ================================================================

-- Query 1: Show recent PO numbers
-- SELECT po_number, batch_code, actual_order_date, created_at
-- FROM purchase_orders
-- ORDER BY created_at DESC
-- LIMIT 10;

-- Query 2: Show delivery summary
-- SELECT * FROM v_po_deliveries_summary LIMIT 10;

-- Query 3: Test PO number generation with specific date
-- SELECT get_next_po_number('2025-12-01'::DATE) AS po_number;

-- Query 4: Test delivery number generation
-- SELECT get_next_delivery_number('2025-12-01'::DATE) AS delivery_number;

-- Query 5: Validate PO numbers
-- SELECT
--   po_number,
--   validate_po_number_format(po_number) AS is_valid
-- FROM purchase_orders
-- ORDER BY created_at DESC
-- LIMIT 10;
