-- =====================================================================
-- Migration: Planned Shipment Support for Partial Shipping
-- Version: 1.0.0
-- Date: 2025-12-19
--
-- Description:
--   Extends shipment creation to support planned shipment records for
--   remaining unshipped quantities, improving 12-week inventory projection
--   accuracy.
--
-- Changes:
--   1. Add shipment_status enum and column (if not exists)
--   2. Create create_shipment_with_planned_remaining() RPC function
--   3. Add helper function for ISO week to date conversion
--
-- Design Reference: /specs/shipment-planned-date/design.md
-- =====================================================================

-- =====================================================================
-- STEP 1: Ensure shipment_status enum and column exist
-- =====================================================================

-- Create shipment_status enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'shipment_status'
  ) THEN
    CREATE TYPE shipment_status AS ENUM (
      'draft',         -- Planned shipment, not yet departed
      'in_transit',    -- Departed but not arrived
      'arrived',       -- Arrived at warehouse
      'finalized',     -- Finalized with inventory adjustment
      'cancelled'      -- Cancelled shipment
    );
    COMMENT ON TYPE shipment_status IS 'Shipment lifecycle status: draft (planned) | in_transit | arrived | finalized | cancelled';
  END IF;
END $$;

-- Add shipment_status column to shipments table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipments' AND column_name = 'shipment_status'
  ) THEN
    ALTER TABLE shipments
    ADD COLUMN shipment_status shipment_status DEFAULT 'draft';

    COMMENT ON COLUMN shipments.shipment_status IS 'Shipment status: draft (planned) | in_transit (departed) | arrived | finalized | cancelled';
  END IF;
END $$;

-- Create index for query performance
CREATE INDEX IF NOT EXISTS idx_shipments_shipment_status
  ON shipments(shipment_status)
  WHERE shipment_status IN ('draft', 'in_transit');

-- Create index on planned_departure_date for projection queries
CREATE INDEX IF NOT EXISTS idx_shipments_planned_departure_date
  ON shipments(planned_departure_date)
  WHERE planned_departure_date IS NOT NULL;


-- =====================================================================
-- STEP 2: Helper function to convert ISO week to date
-- =====================================================================

CREATE OR REPLACE FUNCTION iso_week_to_date(p_week_iso TEXT)
RETURNS DATE AS $$
DECLARE
  v_year INTEGER;
  v_week INTEGER;
  v_jan4_date DATE;
  v_jan4_dow INTEGER;
  v_week1_monday DATE;
  v_result_date DATE;
BEGIN
  -- Parse "2025-W05" -> year=2025, week=5
  v_year := split_part(p_week_iso, '-W', 1)::INTEGER;
  v_week := split_part(p_week_iso, '-W', 2)::INTEGER;

  -- Validate week number
  IF v_week < 1 OR v_week > 53 THEN
    RAISE EXCEPTION 'Invalid ISO week number: %. Must be between 1 and 53.', v_week;
  END IF;

  -- ISO week calculation:
  -- Week 1 is the week containing the first Thursday of the year
  -- Equivalent to: week containing Jan 4
  v_jan4_date := make_date(v_year, 1, 4);

  -- Get day of week (1=Monday, 7=Sunday in ISO)
  v_jan4_dow := EXTRACT(ISODOW FROM v_jan4_date);

  -- Find Monday of week 1
  v_week1_monday := v_jan4_date - (v_jan4_dow - 1);

  -- Add (week - 1) weeks to get target Monday
  v_result_date := v_week1_monday + ((v_week - 1) * INTERVAL '7 days');

  RETURN v_result_date::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION iso_week_to_date IS 'Converts ISO week format (YYYY-Wnn) to Monday date of that week';


-- =====================================================================
-- STEP 3: Create RPC function for shipment creation with planned remaining
-- =====================================================================

CREATE OR REPLACE FUNCTION create_shipment_with_planned_remaining(
  -- Actual shipment parameters
  p_tracking_number TEXT,
  p_batch_code TEXT DEFAULT NULL,
  p_logistics_batch_code TEXT DEFAULT NULL,
  p_destination_warehouse_id UUID DEFAULT NULL,
  p_customs_clearance BOOLEAN DEFAULT false,
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

  -- Delivery allocations (JSONB array)
  -- Format: [{"delivery_id": "uuid", "shipped_qty": 50, "remarks": "text"}]
  p_allocations JSONB DEFAULT '[]'::JSONB,

  -- NEW: Planned remaining shipment (JSONB array or NULL)
  -- Format: [{"delivery_id": "uuid", "remaining_qty": 50, "planned_week_iso": "2025-W05"}]
  p_planned_remaining JSONB DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  actual_shipment_id UUID,
  planned_shipment_ids UUID[],
  error_message TEXT
) AS $$
DECLARE
  v_actual_shipment_id UUID;
  v_planned_shipment_ids UUID[] := ARRAY[]::UUID[];
  v_allocation JSONB;
  v_delivery_id UUID;
  v_shipped_qty INTEGER;
  v_allocation_remarks TEXT;
  v_validation RECORD;

  -- Planned remaining variables
  v_planned_item JSONB;
  v_planned_delivery_id UUID;
  v_remaining_qty INTEGER;
  v_planned_week_iso TEXT;
  v_planned_departure_date DATE;
  v_planned_arrival_days INTEGER;
  v_planned_arrival_date DATE;
  v_planned_tracking_number TEXT;
  v_planned_shipment_id UUID;
  v_delivery_number TEXT;
  v_delivery_sku TEXT;
  v_delivered_qty INTEGER;
  v_existing_shipped INTEGER;
  v_available_qty INTEGER;
BEGIN
  -- 1. Validate allocations are provided
  IF jsonb_array_length(p_allocations) = 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::UUID[], 'No delivery allocations provided'::TEXT;
    RETURN;
  END IF;

  -- 2. Validate each allocation
  FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_delivery_id := (v_allocation->>'delivery_id')::UUID;
    v_shipped_qty := (v_allocation->>'shipped_qty')::INTEGER;

    SELECT * INTO v_validation
    FROM validate_delivery_allocation(v_delivery_id, v_shipped_qty, NULL);

    IF NOT v_validation.is_valid THEN
      RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::UUID[], v_validation.error_message;
      RETURN;
    END IF;
  END LOOP;

  -- 3. Create actual shipment record
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
    remarks,
    production_delivery_id,
    shipment_status
  ) VALUES (
    p_tracking_number,
    p_batch_code,
    p_logistics_batch_code,
    p_destination_warehouse_id,
    p_customs_clearance,
    p_logistics_plan,
    p_logistics_region,
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
    p_remarks,
    NULL, -- production_delivery_id deprecated
    CASE
      WHEN p_actual_arrival_date IS NOT NULL THEN 'arrived'::shipment_status
      WHEN p_actual_departure_date IS NOT NULL THEN 'in_transit'::shipment_status
      ELSE 'draft'::shipment_status
    END
  )
  RETURNING id INTO v_actual_shipment_id;

  -- 4. Create actual shipment allocations
  FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_delivery_id := (v_allocation->>'delivery_id')::UUID;
    v_shipped_qty := (v_allocation->>'shipped_qty')::INTEGER;
    v_allocation_remarks := v_allocation->>'remarks';

    INSERT INTO delivery_shipment_allocations (
      delivery_id,
      shipment_id,
      shipped_qty,
      remarks
    ) VALUES (
      v_delivery_id,
      v_actual_shipment_id,
      v_shipped_qty,
      v_allocation_remarks
    );
  END LOOP;

  -- 5. Aggregate shipment_items from allocations
  INSERT INTO shipment_items (shipment_id, sku, shipped_qty)
  SELECT
    v_actual_shipment_id,
    pd.sku,
    SUM(dsa.shipped_qty) AS total_shipped_qty
  FROM delivery_shipment_allocations dsa
  INNER JOIN production_deliveries pd ON dsa.delivery_id = pd.id
  WHERE dsa.shipment_id = v_actual_shipment_id
  GROUP BY pd.sku;

  -- 6. NEW: Create planned shipment(s) for remaining quantity (if specified)
  IF p_planned_remaining IS NOT NULL AND jsonb_array_length(p_planned_remaining) > 0 THEN
    FOR v_planned_item IN SELECT * FROM jsonb_array_elements(p_planned_remaining)
    LOOP
      -- Extract planned remaining parameters
      v_planned_delivery_id := (v_planned_item->>'delivery_id')::UUID;
      v_remaining_qty := (v_planned_item->>'remaining_qty')::INTEGER;
      v_planned_week_iso := v_planned_item->>'planned_week_iso';
      v_planned_arrival_days := COALESCE((v_planned_item->>'planned_arrival_days')::INTEGER, 40);

      -- Get delivery info
      SELECT
        delivery_number,
        sku,
        delivered_qty
      INTO
        v_delivery_number,
        v_delivery_sku,
        v_delivered_qty
      FROM production_deliveries
      WHERE id = v_planned_delivery_id;

      IF v_delivery_number IS NULL THEN
        RETURN QUERY SELECT
          false,
          v_actual_shipment_id,
          v_planned_shipment_ids,
          format('Delivery not found: %s', v_planned_delivery_id)::TEXT;
        RETURN;
      END IF;

      -- Calculate existing shipped quantity (including what we just allocated)
      SELECT COALESCE(SUM(shipped_qty), 0) INTO v_existing_shipped
      FROM delivery_shipment_allocations
      WHERE delivery_id = v_planned_delivery_id;

      v_available_qty := v_delivered_qty - v_existing_shipped;

      -- Validate planned quantity matches available remaining
      IF v_remaining_qty != v_available_qty THEN
        RETURN QUERY SELECT
          false,
          v_actual_shipment_id,
          v_planned_shipment_ids,
          format('Planned quantity (%s) does not match remaining unshipped quantity (%s) for delivery %s',
            v_remaining_qty, v_available_qty, v_delivery_number)::TEXT;
        RETURN;
      END IF;

      -- Validate planned quantity is positive
      IF v_remaining_qty <= 0 THEN
        RETURN QUERY SELECT
          false,
          v_actual_shipment_id,
          v_planned_shipment_ids,
          format('Planned quantity must be positive, got %s for delivery %s',
            v_remaining_qty, v_delivery_number)::TEXT;
        RETURN;
      END IF;

      -- Convert ISO week to date (Monday of that week)
      BEGIN
        v_planned_departure_date := iso_week_to_date(v_planned_week_iso);
      EXCEPTION
        WHEN OTHERS THEN
          RETURN QUERY SELECT
            false,
            v_actual_shipment_id,
            v_planned_shipment_ids,
            format('Invalid ISO week format: %s. Error: %s', v_planned_week_iso, SQLERRM)::TEXT;
          RETURN;
      END;

      -- Calculate planned arrival date
      v_planned_arrival_date := v_planned_departure_date + (v_planned_arrival_days || ' days')::INTERVAL;

      -- Generate tracking number for planned shipment
      v_planned_tracking_number := format('PLANNED-%s-%s',
        v_planned_week_iso,
        v_delivery_number
      );

      -- Insert planned shipment record
      INSERT INTO shipments (
        tracking_number,
        destination_warehouse_id,
        customs_clearance,
        planned_departure_date,
        actual_departure_date,
        planned_arrival_days,
        planned_arrival_date,
        actual_arrival_date,
        remarks,
        production_delivery_id,
        shipment_status
      ) VALUES (
        v_planned_tracking_number,
        p_destination_warehouse_id,
        p_customs_clearance,
        v_planned_departure_date,
        NULL,  -- Actual date not set yet
        v_planned_arrival_days,
        v_planned_arrival_date,
        NULL,  -- Actual arrival not set yet
        format('自动创建：来自 %s 的剩余计划发运 (%s 件, SKU: %s)',
          v_delivery_number,
          v_remaining_qty,
          v_delivery_sku
        ),
        NULL,  -- production_delivery_id deprecated
        'draft'::shipment_status  -- Planned shipment status
      )
      RETURNING id INTO v_planned_shipment_id;

      -- Add to planned shipment IDs array
      v_planned_shipment_ids := array_append(v_planned_shipment_ids, v_planned_shipment_id);

      -- Create allocation for planned shipment
      INSERT INTO delivery_shipment_allocations (
        delivery_id,
        shipment_id,
        shipped_qty,
        remarks
      ) VALUES (
        v_planned_delivery_id,
        v_planned_shipment_id,
        v_remaining_qty,
        format('计划发运 - %s', v_planned_week_iso)
      );

      -- Create shipment_items for planned shipment
      INSERT INTO shipment_items (shipment_id, sku, shipped_qty)
      SELECT
        v_planned_shipment_id,
        pd.sku,
        v_remaining_qty
      FROM production_deliveries pd
      WHERE pd.id = v_planned_delivery_id;
    END LOOP;
  END IF;

  -- 7. Success
  RETURN QUERY SELECT
    true,
    v_actual_shipment_id,
    v_planned_shipment_ids,
    format('Shipment created successfully. Actual: 1, Planned: %s', array_length(v_planned_shipment_ids, 1))::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      ARRAY[]::UUID[],
      format('Error creating shipment: %s', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_shipment_with_planned_remaining IS
'Creates actual shipment with delivery allocations, plus optional planned shipment(s) for remaining unshipped quantity.
This enables 12-week inventory projection to include planned shipments for better accuracy.';


-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Summary comment
COMMENT ON COLUMN shipments.shipment_status IS
'Shipment lifecycle status:
- draft: Planned shipment, not yet departed (used for planned remaining quantities)
- in_transit: Departed but not arrived
- arrived: Arrived at warehouse (actual_arrival_date set)
- finalized: Finalized with inventory adjustment
- cancelled: Cancelled shipment';
