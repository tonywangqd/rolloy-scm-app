-- =====================================================================
-- Migration: Delivery-Shipment Linkage System
-- Version: 1.0.0
-- Date: 2025-12-08
--
-- Description:
--   Implements N:N relationship between production_deliveries and shipments
--   allowing:
--   - Multiple deliveries to be combined into one shipment
--   - One delivery to be split across multiple shipments (partial shipping)
--   - Full traceability and inventory reconciliation
--
-- Changes:
--   1. Create delivery_shipment_allocations table (N:N junction)
--   2. Add shipped_qty and shipment_status to production_deliveries
--   3. Create v_unshipped_deliveries view
--   4. Create/modify RPC functions for atomic operations
--   5. Create triggers for automatic state updates
-- =====================================================================

-- =====================================================================
-- STEP 1: Create delivery_shipment_allocations table
-- =====================================================================

CREATE TABLE IF NOT EXISTS delivery_shipment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  delivery_id UUID NOT NULL REFERENCES production_deliveries(id) ON DELETE RESTRICT,
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,

  -- Allocation data
  shipped_qty INTEGER NOT NULL CHECK (shipped_qty > 0),

  -- Metadata
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: One delivery + one shipment can only have one allocation record
  UNIQUE (delivery_id, shipment_id)
);

-- Create indexes for performance
CREATE INDEX idx_delivery_shipment_allocations_delivery_id ON delivery_shipment_allocations(delivery_id);
CREATE INDEX idx_delivery_shipment_allocations_shipment_id ON delivery_shipment_allocations(shipment_id);
CREATE INDEX idx_delivery_shipment_allocations_allocated_at ON delivery_shipment_allocations(allocated_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE delivery_shipment_allocations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all authenticated users to read
CREATE POLICY "Allow authenticated read on delivery_shipment_allocations"
  ON delivery_shipment_allocations FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policy: Allow all authenticated users to insert
CREATE POLICY "Allow authenticated insert on delivery_shipment_allocations"
  ON delivery_shipment_allocations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policy: Allow all authenticated users to update
CREATE POLICY "Allow authenticated update on delivery_shipment_allocations"
  ON delivery_shipment_allocations FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policy: Allow all authenticated users to delete
CREATE POLICY "Allow authenticated delete on delivery_shipment_allocations"
  ON delivery_shipment_allocations FOR DELETE
  TO authenticated
  USING (true);

COMMENT ON TABLE delivery_shipment_allocations IS 'N:N junction table linking production_deliveries to shipments, enabling flexible allocation';
COMMENT ON COLUMN delivery_shipment_allocations.shipped_qty IS 'Quantity allocated from this delivery to this shipment';
COMMENT ON COLUMN delivery_shipment_allocations.allocated_at IS 'Timestamp when allocation was created';


-- =====================================================================
-- STEP 2: Add shipment tracking fields to production_deliveries
-- =====================================================================

-- Add shipped_qty tracking field
ALTER TABLE production_deliveries
ADD COLUMN IF NOT EXISTS shipped_qty INTEGER DEFAULT 0 CHECK (shipped_qty >= 0);

-- Add shipment status field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'shipment_status_enum'
  ) THEN
    CREATE TYPE shipment_status_enum AS ENUM ('unshipped', 'partial', 'fully_shipped');
  END IF;
END $$;

ALTER TABLE production_deliveries
ADD COLUMN IF NOT EXISTS shipment_status shipment_status_enum DEFAULT 'unshipped';

-- Create index for query performance
CREATE INDEX IF NOT EXISTS idx_production_deliveries_shipment_status
  ON production_deliveries(shipment_status)
  WHERE shipment_status != 'fully_shipped';

COMMENT ON COLUMN production_deliveries.shipped_qty IS 'Total quantity shipped across all shipments (aggregated from delivery_shipment_allocations)';
COMMENT ON COLUMN production_deliveries.shipment_status IS 'Shipment status: unshipped (0%), partial (<100%), fully_shipped (100%)';


-- =====================================================================
-- STEP 3: Create v_unshipped_deliveries view
-- =====================================================================

CREATE OR REPLACE VIEW v_unshipped_deliveries AS
SELECT
  -- Delivery info
  pd.id AS delivery_id,
  pd.delivery_number,
  pd.sku,
  pd.channel_code,

  -- PO info (join from po_item_id)
  po.po_number,
  po.batch_code,
  s.supplier_name,

  -- Quantity tracking
  pd.delivered_qty,
  COALESCE(pd.shipped_qty, 0) AS shipped_qty,
  (pd.delivered_qty - COALESCE(pd.shipped_qty, 0)) AS unshipped_qty,

  -- Dates
  pd.actual_delivery_date,
  CURRENT_DATE - pd.actual_delivery_date::date AS days_since_delivery,

  -- Product info
  p.product_name,
  p.spu,

  -- Status
  pd.shipment_status,
  pd.payment_status,

  -- Metadata
  pd.created_at,
  pd.updated_at

FROM production_deliveries pd
INNER JOIN purchase_order_items poi ON pd.po_item_id = poi.id
INNER JOIN purchase_orders po ON poi.po_id = po.id
LEFT JOIN suppliers s ON po.supplier_id = s.id
LEFT JOIN products p ON pd.sku = p.sku

WHERE
  -- Only show deliveries with unshipped quantity
  (pd.delivered_qty - COALESCE(pd.shipped_qty, 0)) > 0
  -- And delivery has actually occurred
  AND pd.actual_delivery_date IS NOT NULL

ORDER BY
  pd.actual_delivery_date DESC,
  pd.delivery_number;

COMMENT ON VIEW v_unshipped_deliveries IS 'View of production deliveries with remaining unshipped quantity, sorted by delivery date';


-- =====================================================================
-- STEP 4: Create trigger to auto-update production_deliveries status
-- =====================================================================

-- Trigger function to recalculate shipped_qty and shipment_status
CREATE OR REPLACE FUNCTION update_delivery_shipment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_delivery_id UUID;
  v_total_shipped INTEGER;
  v_delivered_qty INTEGER;
  v_new_status shipment_status_enum;
BEGIN
  -- Determine which delivery_id to update
  IF TG_OP = 'DELETE' THEN
    v_delivery_id := OLD.delivery_id;
  ELSE
    v_delivery_id := NEW.delivery_id;
  END IF;

  -- Get current delivered_qty
  SELECT delivered_qty INTO v_delivered_qty
  FROM production_deliveries
  WHERE id = v_delivery_id;

  -- Calculate total shipped quantity from allocations
  SELECT COALESCE(SUM(shipped_qty), 0) INTO v_total_shipped
  FROM delivery_shipment_allocations
  WHERE delivery_id = v_delivery_id;

  -- Determine shipment status
  IF v_total_shipped = 0 THEN
    v_new_status := 'unshipped';
  ELSIF v_total_shipped >= v_delivered_qty THEN
    v_new_status := 'fully_shipped';
  ELSE
    v_new_status := 'partial';
  END IF;

  -- Update production_deliveries
  UPDATE production_deliveries
  SET
    shipped_qty = v_total_shipped,
    shipment_status = v_new_status,
    updated_at = NOW()
  WHERE id = v_delivery_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger on INSERT/UPDATE/DELETE
DROP TRIGGER IF EXISTS trg_update_delivery_shipment_status ON delivery_shipment_allocations;
CREATE TRIGGER trg_update_delivery_shipment_status
  AFTER INSERT OR UPDATE OR DELETE ON delivery_shipment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_delivery_shipment_status();

COMMENT ON FUNCTION update_delivery_shipment_status() IS 'Automatically recalculates shipped_qty and shipment_status when allocations change';


-- =====================================================================
-- STEP 5: Create validation function for allocations
-- =====================================================================

CREATE OR REPLACE FUNCTION validate_delivery_allocation(
  p_delivery_id UUID,
  p_new_shipped_qty INTEGER,
  p_exclude_shipment_id UUID DEFAULT NULL
)
RETURNS TABLE (
  is_valid BOOLEAN,
  error_message TEXT,
  delivered_qty INTEGER,
  existing_shipped_qty INTEGER,
  available_qty INTEGER
) AS $$
DECLARE
  v_delivered_qty INTEGER;
  v_existing_shipped INTEGER;
  v_available_qty INTEGER;
BEGIN
  -- Get delivered quantity
  SELECT pd.delivered_qty INTO v_delivered_qty
  FROM production_deliveries pd
  WHERE pd.id = p_delivery_id;

  IF v_delivered_qty IS NULL THEN
    RETURN QUERY SELECT false, 'Delivery not found'::TEXT, 0, 0, 0;
    RETURN;
  END IF;

  -- Calculate existing shipped quantity (excluding current shipment if updating)
  SELECT COALESCE(SUM(shipped_qty), 0) INTO v_existing_shipped
  FROM delivery_shipment_allocations
  WHERE delivery_id = p_delivery_id
    AND (p_exclude_shipment_id IS NULL OR shipment_id != p_exclude_shipment_id);

  v_available_qty := v_delivered_qty - v_existing_shipped;

  -- Validate
  IF p_new_shipped_qty > v_available_qty THEN
    RETURN QUERY SELECT
      false,
      format('Cannot allocate %s units. Only %s units available (delivered: %s, already shipped: %s)',
        p_new_shipped_qty, v_available_qty, v_delivered_qty, v_existing_shipped),
      v_delivered_qty,
      v_existing_shipped,
      v_available_qty;
    RETURN;
  END IF;

  -- Valid
  RETURN QUERY SELECT
    true,
    'Valid allocation'::TEXT,
    v_delivered_qty,
    v_existing_shipped,
    v_available_qty;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_delivery_allocation IS 'Validates if a delivery has sufficient unshipped quantity for allocation';


-- =====================================================================
-- STEP 6: Create atomic shipment creation function with allocations
-- =====================================================================

CREATE OR REPLACE FUNCTION create_shipment_with_delivery_allocations(
  -- Shipment main info
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

  -- Delivery allocations: JSONB array of {delivery_id: UUID, shipped_qty: INTEGER, remarks: TEXT}
  p_allocations JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  shipment_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_shipment_id UUID;
  v_allocation JSONB;
  v_delivery_id UUID;
  v_shipped_qty INTEGER;
  v_allocation_remarks TEXT;
  v_validation RECORD;
  v_sku TEXT;
  v_total_qty INTEGER;
BEGIN
  -- Validate allocations are provided
  IF jsonb_array_length(p_allocations) = 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'No delivery allocations provided'::TEXT;
    RETURN;
  END IF;

  -- Validate each allocation
  FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_delivery_id := (v_allocation->>'delivery_id')::UUID;
    v_shipped_qty := (v_allocation->>'shipped_qty')::INTEGER;

    -- Check validation
    SELECT * INTO v_validation
    FROM validate_delivery_allocation(v_delivery_id, v_shipped_qty, NULL);

    IF NOT v_validation.is_valid THEN
      RETURN QUERY SELECT false, NULL::UUID, v_validation.error_message;
      RETURN;
    END IF;
  END LOOP;

  -- Create shipment record
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
    production_delivery_id -- Legacy field, set to NULL for multi-delivery shipments
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
    NULL -- production_delivery_id is now deprecated
  )
  RETURNING id INTO v_shipment_id;

  -- Create delivery allocations
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
      v_shipment_id,
      v_shipped_qty,
      v_allocation_remarks
    );
  END LOOP;

  -- Aggregate shipment_items by SKU from all allocated deliveries
  INSERT INTO shipment_items (shipment_id, sku, shipped_qty)
  SELECT
    v_shipment_id,
    pd.sku,
    SUM(dsa.shipped_qty) AS total_shipped_qty
  FROM delivery_shipment_allocations dsa
  INNER JOIN production_deliveries pd ON dsa.delivery_id = pd.id
  WHERE dsa.shipment_id = v_shipment_id
  GROUP BY pd.sku;

  -- Success
  RETURN QUERY SELECT true, v_shipment_id, 'Shipment created successfully with delivery allocations'::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_shipment_with_delivery_allocations IS 'Atomically creates a shipment with multiple delivery allocations and aggregated shipment_items';


-- =====================================================================
-- STEP 7: Create helper function to get delivery allocation details
-- =====================================================================

CREATE OR REPLACE FUNCTION get_delivery_allocations(p_delivery_id UUID)
RETURNS TABLE (
  shipment_id UUID,
  tracking_number TEXT,
  shipped_qty INTEGER,
  allocated_at TIMESTAMPTZ,
  actual_departure_date DATE,
  planned_arrival_date DATE,
  actual_arrival_date DATE,
  remarks TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dsa.shipment_id,
    s.tracking_number,
    dsa.shipped_qty,
    dsa.allocated_at,
    s.actual_departure_date,
    s.planned_arrival_date,
    s.actual_arrival_date,
    dsa.remarks
  FROM delivery_shipment_allocations dsa
  INNER JOIN shipments s ON dsa.shipment_id = s.id
  WHERE dsa.delivery_id = p_delivery_id
  ORDER BY dsa.allocated_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_delivery_allocations IS 'Returns all shipment allocations for a given production delivery';


-- =====================================================================
-- STEP 8: Create helper function to get shipment source deliveries
-- =====================================================================

CREATE OR REPLACE FUNCTION get_shipment_source_deliveries(p_shipment_id UUID)
RETURNS TABLE (
  delivery_id UUID,
  delivery_number TEXT,
  po_number TEXT,
  batch_code TEXT,
  sku TEXT,
  shipped_qty INTEGER,
  delivered_qty INTEGER,
  delivery_date DATE,
  supplier_name TEXT,
  remarks TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pd.id AS delivery_id,
    pd.delivery_number,
    po.po_number,
    po.batch_code,
    pd.sku,
    dsa.shipped_qty,
    pd.delivered_qty,
    pd.actual_delivery_date,
    s.supplier_name,
    dsa.remarks
  FROM delivery_shipment_allocations dsa
  INNER JOIN production_deliveries pd ON dsa.delivery_id = pd.id
  INNER JOIN purchase_order_items poi ON pd.po_item_id = poi.id
  INNER JOIN purchase_orders po ON poi.po_id = po.id
  LEFT JOIN suppliers s ON po.supplier_id = s.id
  WHERE dsa.shipment_id = p_shipment_id
  ORDER BY pd.actual_delivery_date DESC, pd.delivery_number;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_shipment_source_deliveries IS 'Returns all source deliveries for a given shipment';


-- =====================================================================
-- STEP 9: Update timestamp trigger for delivery_shipment_allocations
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_delivery_shipment_allocations_updated_at ON delivery_shipment_allocations;
CREATE TRIGGER trg_update_delivery_shipment_allocations_updated_at
  BEFORE UPDATE ON delivery_shipment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- =====================================================================
-- STEP 10: Add constraint to prevent over-allocation
-- =====================================================================

-- Add constraint function
CREATE OR REPLACE FUNCTION check_delivery_allocation_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_delivered_qty INTEGER;
  v_total_shipped INTEGER;
BEGIN
  -- Get delivered quantity
  SELECT delivered_qty INTO v_delivered_qty
  FROM production_deliveries
  WHERE id = NEW.delivery_id;

  -- Calculate total shipped including this new/updated allocation
  SELECT COALESCE(SUM(shipped_qty), 0) INTO v_total_shipped
  FROM delivery_shipment_allocations
  WHERE delivery_id = NEW.delivery_id
    AND (TG_OP = 'INSERT' OR id != NEW.id); -- Exclude self on UPDATE

  -- Add current allocation
  v_total_shipped := v_total_shipped + NEW.shipped_qty;

  -- Check constraint
  IF v_total_shipped > v_delivered_qty THEN
    RAISE EXCEPTION 'Total allocated quantity (%) exceeds delivered quantity (%) for delivery %',
      v_total_shipped, v_delivered_qty, NEW.delivery_id
      USING HINT = 'Cannot allocate more than what was delivered';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_delivery_allocation_limit ON delivery_shipment_allocations;
CREATE TRIGGER trg_check_delivery_allocation_limit
  BEFORE INSERT OR UPDATE ON delivery_shipment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION check_delivery_allocation_limit();

COMMENT ON FUNCTION check_delivery_allocation_limit IS 'Prevents total allocated quantity from exceeding delivered quantity';


-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Summary comment
COMMENT ON TABLE delivery_shipment_allocations IS
'N:N relationship table enabling flexible delivery-to-shipment allocation.
Key features:
- Multiple deliveries can be merged into one shipment
- One delivery can be split across multiple shipments
- Automatic status tracking via triggers
- Data validation to prevent over-allocation
- Full traceability between procurement and logistics';
