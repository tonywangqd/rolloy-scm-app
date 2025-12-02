-- ================================================================
-- Migration: Atomic Transaction Functions
-- Purpose: Create PostgreSQL functions for atomic operations
-- Author: Backend Specialist
-- Date: 2025-12-02
-- ================================================================

-- ================================================================
-- Function: create_purchase_order_with_items
-- Purpose: Atomically creates a PO and its items in a single transaction
-- Returns: success status, po_id, and error message
-- ================================================================

CREATE OR REPLACE FUNCTION create_purchase_order_with_items(
  p_po_number TEXT,
  p_batch_code TEXT,
  p_supplier_id UUID DEFAULT NULL,
  p_planned_order_date DATE DEFAULT NULL,
  p_actual_order_date DATE DEFAULT NULL,
  p_planned_ship_date DATE DEFAULT NULL,
  p_po_status TEXT DEFAULT 'Draft',
  p_remarks TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  success BOOLEAN,
  po_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_po_id UUID;
  v_item JSONB;
  v_error_msg TEXT;
BEGIN
  -- Start implicit transaction (function body is atomic by default)

  -- Validate inputs
  IF p_po_number IS NULL OR p_po_number = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'PO number is required'::TEXT;
    RETURN;
  END IF;

  IF p_batch_code IS NULL OR p_batch_code = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Batch code is required'::TEXT;
    RETURN;
  END IF;

  -- Validate PO number format if function exists
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_po_number_format') THEN
    IF NOT validate_po_number_format(p_po_number) THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid PO number format'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Check for duplicate PO number
  IF EXISTS (SELECT 1 FROM purchase_orders WHERE po_number = p_po_number) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'PO number already exists'::TEXT;
    RETURN;
  END IF;

  -- Insert purchase order
  INSERT INTO purchase_orders (
    po_number,
    batch_code,
    supplier_id,
    planned_order_date,
    actual_order_date,
    planned_ship_date,
    po_status,
    remarks
  )
  VALUES (
    p_po_number,
    p_batch_code,
    p_supplier_id,
    p_planned_order_date,
    p_actual_order_date,
    p_planned_ship_date,
    p_po_status::text,
    p_remarks
  )
  RETURNING id INTO v_po_id;

  -- Insert items if provided
  IF jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      -- Validate item has required fields
      IF NOT (v_item ? 'sku' AND v_item ? 'ordered_qty' AND v_item ? 'unit_price_usd') THEN
        RAISE EXCEPTION 'Invalid item data: missing required fields (sku, ordered_qty, unit_price_usd)';
      END IF;

      -- Insert item
      INSERT INTO purchase_order_items (
        po_id,
        sku,
        channel_code,
        ordered_qty,
        unit_price_usd,
        delivered_qty
      )
      VALUES (
        v_po_id,
        (v_item->>'sku')::TEXT,
        (v_item->>'channel_code')::TEXT,
        (v_item->>'ordered_qty')::INTEGER,
        (v_item->>'unit_price_usd')::NUMERIC,
        COALESCE((v_item->>'delivered_qty')::INTEGER, 0)
      );
    END LOOP;
  END IF;

  -- Success
  RETURN QUERY SELECT TRUE, v_po_id, NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    -- On any error, transaction automatically rolls back
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    RETURN QUERY SELECT FALSE, NULL::UUID, v_error_msg;
END;
$$;

-- Add comment
COMMENT ON FUNCTION create_purchase_order_with_items IS
'Atomically creates a purchase order with its items. All operations succeed or fail together.';

-- ================================================================
-- Function: create_shipment_with_items
-- Purpose: Atomically creates a shipment and its items in a single transaction
-- Returns: success status, shipment_id, and error message
-- ================================================================

CREATE OR REPLACE FUNCTION create_shipment_with_items(
  p_tracking_number TEXT,
  p_batch_code TEXT DEFAULT NULL,
  p_logistics_batch_code TEXT DEFAULT NULL,
  p_destination_warehouse_id UUID DEFAULT NULL,
  p_customs_clearance BOOLEAN DEFAULT FALSE,
  p_logistics_plan TEXT DEFAULT NULL,
  p_logistics_region TEXT DEFAULT NULL,
  p_planned_departure_date DATE DEFAULT NULL,
  p_actual_departure_date DATE DEFAULT NULL,
  p_planned_arrival_days INTEGER DEFAULT NULL,
  p_planned_arrival_date DATE DEFAULT NULL,
  p_actual_arrival_date DATE DEFAULT NULL,
  p_weight_kg NUMERIC DEFAULT NULL,
  p_unit_count INTEGER DEFAULT NULL,
  p_cost_per_kg_usd NUMERIC DEFAULT NULL,
  p_surcharge_usd NUMERIC DEFAULT 0,
  p_tax_refund_usd NUMERIC DEFAULT 0,
  p_remarks TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  success BOOLEAN,
  shipment_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shipment_id UUID;
  v_item JSONB;
  v_error_msg TEXT;
  v_freight_cost NUMERIC;
  v_total_cost NUMERIC;
BEGIN
  -- Validate inputs
  IF p_tracking_number IS NULL OR p_tracking_number = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Tracking number is required'::TEXT;
    RETURN;
  END IF;

  IF p_destination_warehouse_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Destination warehouse is required'::TEXT;
    RETURN;
  END IF;

  -- Check for duplicate tracking number
  IF EXISTS (SELECT 1 FROM shipments WHERE tracking_number = p_tracking_number) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Tracking number already exists'::TEXT;
    RETURN;
  END IF;

  -- Verify warehouse exists
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = p_destination_warehouse_id) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Destination warehouse does not exist'::TEXT;
    RETURN;
  END IF;

  -- Calculate costs
  v_freight_cost := COALESCE(p_weight_kg, 0) * COALESCE(p_cost_per_kg_usd, 0);
  v_total_cost := v_freight_cost + COALESCE(p_surcharge_usd, 0) - COALESCE(p_tax_refund_usd, 0);

  -- Insert shipment
  INSERT INTO shipments (
    tracking_number,
    batch_code,
    logistics_batch_code,
    destination_warehouse_id,
    customs_clearance,
    logistics_plan,
    logistics_region,
    planned_departure_date,
    actual_departure_date,
    planned_arrival_days,
    planned_arrival_date,
    actual_arrival_date,
    weight_kg,
    unit_count,
    cost_per_kg_usd,
    surcharge_usd,
    tax_refund_usd,
    total_cost_usd,
    payment_status,
    remarks
  )
  VALUES (
    p_tracking_number,
    p_batch_code,
    p_logistics_batch_code,
    p_destination_warehouse_id,
    p_customs_clearance,
    p_logistics_plan,
    p_logistics_region::text,
    p_planned_departure_date,
    p_actual_departure_date,
    p_planned_arrival_days,
    p_planned_arrival_date,
    p_actual_arrival_date,
    p_weight_kg,
    p_unit_count,
    p_cost_per_kg_usd,
    p_surcharge_usd,
    p_tax_refund_usd,
    v_total_cost,
    'Pending',
    p_remarks
  )
  RETURNING id INTO v_shipment_id;

  -- Insert items if provided
  IF jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      -- Validate item has required fields
      IF NOT (v_item ? 'sku' AND v_item ? 'shipped_qty') THEN
        RAISE EXCEPTION 'Invalid item data: missing required fields (sku, shipped_qty)';
      END IF;

      -- Verify SKU exists
      IF NOT EXISTS (SELECT 1 FROM products WHERE sku = (v_item->>'sku')::TEXT) THEN
        RAISE EXCEPTION 'SKU does not exist: %', (v_item->>'sku')::TEXT;
      END IF;

      -- Insert item
      INSERT INTO shipment_items (
        shipment_id,
        sku,
        shipped_qty
      )
      VALUES (
        v_shipment_id,
        (v_item->>'sku')::TEXT,
        (v_item->>'shipped_qty')::INTEGER
      );
    END LOOP;
  END IF;

  -- Success
  RETURN QUERY SELECT TRUE, v_shipment_id, NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    -- On any error, transaction automatically rolls back
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    RETURN QUERY SELECT FALSE, NULL::UUID, v_error_msg;
END;
$$;

-- Add comment
COMMENT ON FUNCTION create_shipment_with_items IS
'Atomically creates a shipment with its items. All operations succeed or fail together.';

-- ================================================================
-- Grant permissions
-- ================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_purchase_order_with_items TO authenticated;
GRANT EXECUTE ON FUNCTION create_shipment_with_items TO authenticated;

-- ================================================================
-- END OF MIGRATION
-- ================================================================
