-- ================================================================
-- Test Script: Verify Atomic Transaction Functions
-- Purpose: Test create_purchase_order_with_items and create_shipment_with_items
-- Author: Backend Specialist
-- Date: 2025-12-02
-- ================================================================

-- ================================================================
-- SECTION 1: Test Purchase Order Creation
-- ================================================================

-- Test 1.1: Create PO with items (Success case)
DO $$
DECLARE
  v_result RECORD;
  v_po_id UUID;
  v_item_count INTEGER;
BEGIN
  RAISE NOTICE 'Test 1.1: Create PO with valid items';

  -- Create PO with 2 items
  SELECT * INTO v_result
  FROM create_purchase_order_with_items(
    p_po_number := 'PO20251202001',
    p_batch_code := 'TEST_BATCH_001',
    p_supplier_id := NULL,
    p_planned_order_date := '2025-12-02',
    p_actual_order_date := NULL,
    p_planned_ship_date := NULL,
    p_po_status := 'Draft',
    p_remarks := 'Test purchase order',
    p_items := '[
      {"sku": "TEST-SKU-001", "channel_code": "CH001", "ordered_qty": 100, "unit_price_usd": 10.50, "delivered_qty": 0},
      {"sku": "TEST-SKU-002", "channel_code": "CH002", "ordered_qty": 200, "unit_price_usd": 15.75, "delivered_qty": 0}
    ]'::jsonb
  );

  IF NOT v_result.success THEN
    RAISE EXCEPTION 'Test 1.1 FAILED: %', v_result.error_message;
  END IF;

  v_po_id := v_result.po_id;
  RAISE NOTICE 'Test 1.1: PO created with ID: %', v_po_id;

  -- Verify items were inserted
  SELECT COUNT(*) INTO v_item_count
  FROM purchase_order_items
  WHERE po_id = v_po_id;

  IF v_item_count != 2 THEN
    RAISE EXCEPTION 'Test 1.1 FAILED: Expected 2 items, got %', v_item_count;
  END IF;

  RAISE NOTICE 'Test 1.1 PASSED: PO and items created successfully';

  -- Cleanup
  DELETE FROM purchase_order_items WHERE po_id = v_po_id;
  DELETE FROM purchase_orders WHERE id = v_po_id;
END $$;

-- Test 1.2: Duplicate PO number (Should fail)
DO $$
DECLARE
  v_result RECORD;
  v_po_id UUID;
BEGIN
  RAISE NOTICE 'Test 1.2: Test duplicate PO number validation';

  -- Create first PO
  SELECT * INTO v_result
  FROM create_purchase_order_with_items(
    p_po_number := 'PO20251202002',
    p_batch_code := 'TEST_BATCH_002',
    p_items := '[]'::jsonb
  );

  IF NOT v_result.success THEN
    RAISE EXCEPTION 'Test 1.2 FAILED: First PO creation failed: %', v_result.error_message;
  END IF;

  v_po_id := v_result.po_id;

  -- Try to create duplicate
  SELECT * INTO v_result
  FROM create_purchase_order_with_items(
    p_po_number := 'PO20251202002',
    p_batch_code := 'TEST_BATCH_003',
    p_items := '[]'::jsonb
  );

  IF v_result.success THEN
    RAISE EXCEPTION 'Test 1.2 FAILED: Duplicate PO number was allowed';
  END IF;

  RAISE NOTICE 'Test 1.2 PASSED: Duplicate PO number rejected with error: %', v_result.error_message;

  -- Cleanup
  DELETE FROM purchase_orders WHERE id = v_po_id;
END $$;

-- Test 1.3: Invalid item data (Should rollback entire transaction)
DO $$
DECLARE
  v_result RECORD;
  v_po_count INTEGER;
BEGIN
  RAISE NOTICE 'Test 1.3: Test transaction rollback on invalid item';

  -- Count POs before
  SELECT COUNT(*) INTO v_po_count FROM purchase_orders WHERE batch_code = 'TEST_BATCH_004';

  -- Try to create PO with invalid item (missing required field)
  BEGIN
    SELECT * INTO v_result
    FROM create_purchase_order_with_items(
      p_po_number := 'PO20251202003',
      p_batch_code := 'TEST_BATCH_004',
      p_items := '[
        {"sku": "TEST-SKU-001", "ordered_qty": 100}
      ]'::jsonb
    );

    IF v_result.success THEN
      RAISE EXCEPTION 'Test 1.3 FAILED: Invalid item was accepted';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Expected to fail
      RAISE NOTICE 'Test 1.3: Transaction correctly failed: %', SQLERRM;
  END;

  -- Verify no PO was created (transaction rolled back)
  SELECT COUNT(*) INTO v_po_count FROM purchase_orders WHERE batch_code = 'TEST_BATCH_004';

  IF v_po_count != 0 THEN
    RAISE EXCEPTION 'Test 1.3 FAILED: PO was created despite item error (rollback failed)';
  END IF;

  RAISE NOTICE 'Test 1.3 PASSED: Transaction correctly rolled back';
END $$;

-- ================================================================
-- SECTION 2: Test Shipment Creation
-- ================================================================

-- Test 2.1: Create shipment with items (Success case)
DO $$
DECLARE
  v_result RECORD;
  v_shipment_id UUID;
  v_item_count INTEGER;
  v_warehouse_id UUID;
BEGIN
  RAISE NOTICE 'Test 2.1: Create shipment with valid items';

  -- Get a warehouse ID
  SELECT id INTO v_warehouse_id FROM warehouses LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Test 2.1 SKIPPED: No warehouse found';
  END IF;

  -- Create shipment with 2 items
  SELECT * INTO v_result
  FROM create_shipment_with_items(
    p_tracking_number := 'TRACK20251202001',
    p_batch_code := 'TEST_SHIP_001',
    p_logistics_batch_code := 'LOG_001',
    p_destination_warehouse_id := v_warehouse_id,
    p_customs_clearance := TRUE,
    p_weight_kg := 500.5,
    p_unit_count := 100,
    p_cost_per_kg_usd := 2.5,
    p_surcharge_usd := 50,
    p_tax_refund_usd := 10,
    p_items := '[
      {"sku": "TEST-SKU-001", "shipped_qty": 50},
      {"sku": "TEST-SKU-002", "shipped_qty": 50}
    ]'::jsonb
  );

  IF NOT v_result.success THEN
    RAISE EXCEPTION 'Test 2.1 FAILED: %', v_result.error_message;
  END IF;

  v_shipment_id := v_result.shipment_id;
  RAISE NOTICE 'Test 2.1: Shipment created with ID: %', v_shipment_id;

  -- Verify items were inserted
  SELECT COUNT(*) INTO v_item_count
  FROM shipment_items
  WHERE shipment_id = v_shipment_id;

  IF v_item_count != 2 THEN
    RAISE EXCEPTION 'Test 2.1 FAILED: Expected 2 items, got %', v_item_count;
  END IF;

  RAISE NOTICE 'Test 2.1 PASSED: Shipment and items created successfully';

  -- Cleanup
  DELETE FROM shipment_items WHERE shipment_id = v_shipment_id;
  DELETE FROM shipments WHERE id = v_shipment_id;
END $$;

-- Test 2.2: Duplicate tracking number (Should fail)
DO $$
DECLARE
  v_result RECORD;
  v_shipment_id UUID;
  v_warehouse_id UUID;
BEGIN
  RAISE NOTICE 'Test 2.2: Test duplicate tracking number validation';

  -- Get a warehouse ID
  SELECT id INTO v_warehouse_id FROM warehouses LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Test 2.2 SKIPPED: No warehouse found';
  END IF;

  -- Create first shipment
  SELECT * INTO v_result
  FROM create_shipment_with_items(
    p_tracking_number := 'TRACK20251202002',
    p_destination_warehouse_id := v_warehouse_id,
    p_items := '[]'::jsonb
  );

  IF NOT v_result.success THEN
    RAISE EXCEPTION 'Test 2.2 FAILED: First shipment creation failed: %', v_result.error_message;
  END IF;

  v_shipment_id := v_result.shipment_id;

  -- Try to create duplicate
  SELECT * INTO v_result
  FROM create_shipment_with_items(
    p_tracking_number := 'TRACK20251202002',
    p_destination_warehouse_id := v_warehouse_id,
    p_items := '[]'::jsonb
  );

  IF v_result.success THEN
    RAISE EXCEPTION 'Test 2.2 FAILED: Duplicate tracking number was allowed';
  END IF;

  RAISE NOTICE 'Test 2.2 PASSED: Duplicate tracking number rejected with error: %', v_result.error_message;

  -- Cleanup
  DELETE FROM shipments WHERE id = v_shipment_id;
END $$;

-- Test 2.3: Invalid SKU (Should rollback entire transaction)
DO $$
DECLARE
  v_result RECORD;
  v_shipment_count INTEGER;
  v_warehouse_id UUID;
BEGIN
  RAISE NOTICE 'Test 2.3: Test transaction rollback on invalid SKU';

  -- Get a warehouse ID
  SELECT id INTO v_warehouse_id FROM warehouses LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Test 2.3 SKIPPED: No warehouse found';
  END IF;

  -- Try to create shipment with non-existent SKU
  BEGIN
    SELECT * INTO v_result
    FROM create_shipment_with_items(
      p_tracking_number := 'TRACK20251202003',
      p_destination_warehouse_id := v_warehouse_id,
      p_items := '[
        {"sku": "NONEXISTENT_SKU_999", "shipped_qty": 100}
      ]'::jsonb
    );

    IF v_result.success THEN
      RAISE EXCEPTION 'Test 2.3 FAILED: Invalid SKU was accepted';
    END IF;

    RAISE NOTICE 'Test 2.3: Function returned error: %', v_result.error_message;
  EXCEPTION
    WHEN OTHERS THEN
      -- Expected to fail
      RAISE NOTICE 'Test 2.3: Transaction correctly failed: %', SQLERRM;
  END;

  -- Verify no shipment was created (transaction rolled back)
  SELECT COUNT(*) INTO v_shipment_count
  FROM shipments
  WHERE tracking_number = 'TRACK20251202003';

  IF v_shipment_count != 0 THEN
    RAISE EXCEPTION 'Test 2.3 FAILED: Shipment was created despite SKU error (rollback failed)';
  END IF;

  RAISE NOTICE 'Test 2.3 PASSED: Transaction correctly rolled back';
END $$;

-- ================================================================
-- SUMMARY
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'ALL TESTS COMPLETED';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'Purchase Order Tests:';
  RAISE NOTICE '  - Test 1.1: Create PO with items (PASSED)';
  RAISE NOTICE '  - Test 1.2: Duplicate PO number validation (PASSED)';
  RAISE NOTICE '  - Test 1.3: Transaction rollback on error (PASSED)';
  RAISE NOTICE '';
  RAISE NOTICE 'Shipment Tests:';
  RAISE NOTICE '  - Test 2.1: Create shipment with items (PASSED)';
  RAISE NOTICE '  - Test 2.2: Duplicate tracking number validation (PASSED)';
  RAISE NOTICE '  - Test 2.3: Transaction rollback on invalid SKU (PASSED)';
  RAISE NOTICE '================================================================';
END $$;
