# Delivery-Shipment Linkage System - Technical Design

**Version:** 1.0.0
**Date:** 2025-12-08
**Author:** System Architect

---

## Executive Summary

This design implements a flexible **N:N relationship** between production deliveries (采购交货) and shipments (物流发货), enabling:

1. **Multiple deliveries → One shipment** (Consolidation)
2. **One delivery → Multiple shipments** (Partial shipping)
3. **Full traceability** from procurement to logistics
4. **Automatic status tracking** with database triggers

---

## Business Requirements

### Current Limitations
- Legacy `shipments.production_delivery_id` only supports 1:1 relationship
- Cannot merge multiple deliveries into one shipment
- Cannot split one delivery across multiple shipments

### New Capabilities
✅ **Consolidation:** Combine 3 deliveries (SKU A+B+C) into 1 shipment
✅ **Partial Shipping:** Ship 100 units from a 500-unit delivery in Week 1, ship remaining 400 in Week 2
✅ **Status Tracking:** Auto-update delivery status (unshipped → partial → fully_shipped)
✅ **Validation:** Prevent over-allocation (cannot ship more than delivered)

---

## Database Schema Design

### 1. New Junction Table: `delivery_shipment_allocations`

```sql
CREATE TABLE delivery_shipment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES production_deliveries(id),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  shipped_qty INTEGER NOT NULL CHECK (shipped_qty > 0),
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (delivery_id, shipment_id)
);
```

**Indexes:**
- `idx_delivery_shipment_allocations_delivery_id`
- `idx_delivery_shipment_allocations_shipment_id`
- `idx_delivery_shipment_allocations_allocated_at`

**RLS Policies:** All authenticated users can CRUD (for MVP)

---

### 2. Extended Fields: `production_deliveries`

```sql
ALTER TABLE production_deliveries
ADD COLUMN shipped_qty INTEGER DEFAULT 0 CHECK (shipped_qty >= 0),
ADD COLUMN shipment_status shipment_status_enum DEFAULT 'unshipped';

CREATE TYPE shipment_status_enum AS ENUM (
  'unshipped',      -- 0% shipped
  'partial',        -- 0% < shipped < 100%
  'fully_shipped'   -- 100% shipped
);
```

**Business Rules:**
- `shipped_qty` = SUM of all `delivery_shipment_allocations.shipped_qty` for this delivery
- `shipment_status` auto-calculated by trigger:
  - `shipped_qty = 0` → `unshipped`
  - `0 < shipped_qty < delivered_qty` → `partial`
  - `shipped_qty >= delivered_qty` → `fully_shipped`

---

### 3. View: `v_unshipped_deliveries`

**Purpose:** Show all deliveries with remaining unshipped quantity

```sql
CREATE VIEW v_unshipped_deliveries AS
SELECT
  pd.id AS delivery_id,
  pd.delivery_number,
  pd.sku,
  po.po_number,
  po.batch_code,
  s.supplier_name,
  pd.delivered_qty,
  COALESCE(pd.shipped_qty, 0) AS shipped_qty,
  (pd.delivered_qty - COALESCE(pd.shipped_qty, 0)) AS unshipped_qty,
  pd.actual_delivery_date,
  CURRENT_DATE - pd.actual_delivery_date::date AS days_since_delivery,
  p.product_name,
  pd.shipment_status,
  pd.payment_status
FROM production_deliveries pd
INNER JOIN purchase_order_items poi ON pd.po_item_id = poi.id
INNER JOIN purchase_orders po ON poi.po_id = po.id
LEFT JOIN suppliers s ON po.supplier_id = s.id
LEFT JOIN products p ON pd.sku = p.sku
WHERE (pd.delivered_qty - COALESCE(pd.shipped_qty, 0)) > 0
  AND pd.actual_delivery_date IS NOT NULL
ORDER BY pd.actual_delivery_date DESC;
```

**Use Case:** Source data for "Create Shipment" form

---

## API Design

### 1. RPC Function: `create_shipment_with_delivery_allocations`

**Purpose:** Atomically create a shipment with multiple delivery allocations

**Input Signature:**
```typescript
{
  // Shipment metadata
  p_tracking_number: string,
  p_batch_code?: string,
  p_destination_warehouse_id: UUID,
  p_planned_departure_date?: Date,
  p_actual_departure_date?: Date,
  // ... other shipment fields

  // Delivery allocations (JSONB array)
  p_allocations: [
    {
      delivery_id: UUID,
      shipped_qty: number,
      remarks?: string
    },
    // ... more allocations
  ]
}
```

**Output:**
```typescript
{
  success: boolean,
  shipment_id: UUID | null,
  error_message: string | null
}
```

**Atomic Operations (Transaction):**
1. Validate each allocation (check available qty)
2. Create `shipments` record (set `production_delivery_id` to NULL)
3. Create `delivery_shipment_allocations` records
4. Aggregate and create `shipment_items` (group by SKU)
5. Trigger auto-updates `production_deliveries.shipped_qty` and `shipment_status`

**Error Handling:**
- Rollback entire transaction if any step fails
- Return detailed error message (e.g., "Cannot allocate 150 units from delivery D123. Only 100 units available.")

---

### 2. Validation Function: `validate_delivery_allocation`

**Purpose:** Check if a delivery has sufficient unshipped quantity

**Input:**
```sql
validate_delivery_allocation(
  p_delivery_id UUID,
  p_new_shipped_qty INTEGER,
  p_exclude_shipment_id UUID DEFAULT NULL  -- For update scenarios
)
```

**Output:**
```sql
TABLE (
  is_valid BOOLEAN,
  error_message TEXT,
  delivered_qty INTEGER,
  existing_shipped_qty INTEGER,
  available_qty INTEGER
)
```

**Logic:**
```
available_qty = delivered_qty - SUM(existing allocations excluding current shipment)
is_valid = (p_new_shipped_qty <= available_qty)
```

---

### 3. Helper Function: `get_delivery_allocations`

**Purpose:** Get all shipments linked to a delivery

**Input:** `p_delivery_id UUID`

**Output:**
```typescript
[
  {
    shipment_id: UUID,
    tracking_number: string,
    shipped_qty: number,
    allocated_at: timestamp,
    actual_departure_date: Date | null,
    planned_arrival_date: Date | null,
    actual_arrival_date: Date | null,
    remarks: string | null
  },
  // ... more shipments
]
```

---

### 4. Helper Function: `get_shipment_source_deliveries`

**Purpose:** Get all deliveries linked to a shipment (reverse traceability)

**Input:** `p_shipment_id UUID`

**Output:**
```typescript
[
  {
    delivery_id: UUID,
    delivery_number: string,
    po_number: string,
    batch_code: string,
    sku: string,
    shipped_qty: number,
    delivered_qty: number,
    delivery_date: Date | null,
    supplier_name: string | null,
    remarks: string | null
  },
  // ... more deliveries
]
```

---

## Trigger Design

### 1. Trigger: `trg_update_delivery_shipment_status`

**Event:** AFTER INSERT/UPDATE/DELETE on `delivery_shipment_allocations`

**Function:** `update_delivery_shipment_status()`

**Logic:**
```sql
1. Determine affected delivery_id (NEW.delivery_id or OLD.delivery_id)
2. Calculate total_shipped = SUM(shipped_qty) from all allocations
3. Determine status:
   - IF total_shipped = 0 THEN 'unshipped'
   - ELSIF total_shipped >= delivered_qty THEN 'fully_shipped'
   - ELSE 'partial'
4. UPDATE production_deliveries SET:
     shipped_qty = total_shipped,
     shipment_status = calculated_status,
     updated_at = NOW()
```

**Why Trigger?**
- Ensures data consistency across all operations (INSERT/UPDATE/DELETE)
- Eliminates need for manual status updates in application code

---

### 2. Trigger: `trg_check_delivery_allocation_limit`

**Event:** BEFORE INSERT/UPDATE on `delivery_shipment_allocations`

**Function:** `check_delivery_allocation_limit()`

**Logic:**
```sql
1. Get delivered_qty from production_deliveries
2. Calculate existing_shipped = SUM(shipped_qty) excluding current record
3. Calculate new_total = existing_shipped + NEW.shipped_qty
4. IF new_total > delivered_qty THEN
     RAISE EXCEPTION 'Cannot allocate X units. Only Y available.'
```

**Why Trigger?**
- Prevents data corruption at the database level
- Cannot be bypassed by application bugs or direct SQL manipulation

---

## Data Validation Rules

### Allocation Constraints

| Rule | Enforcement | Error Message |
|------|-------------|---------------|
| `shipped_qty > 0` | CHECK constraint | "Shipped quantity must be greater than 0" |
| `SUM(allocations.shipped_qty) <= delivery.delivered_qty` | Trigger | "Total allocated (X) exceeds delivered (Y)" |
| `delivery_id + shipment_id` is unique | UNIQUE constraint | "Allocation already exists for this delivery-shipment pair" |
| Delivery must have `actual_delivery_date` | View filter | Hidden from `v_unshipped_deliveries` if NULL |

---

## Migration Strategy

### Phase 1: Schema Migration (Backward Compatible)
```sql
-- Run migration: 20251208000001_delivery_shipment_linkage.sql
-- ✅ Adds new table, fields, views, functions
-- ✅ Does NOT break existing code (legacy production_delivery_id still works)
-- ✅ Triggers only activate on new allocations
```

### Phase 2: Data Migration (Optional)
```sql
-- Backfill existing shipments into new allocation table
INSERT INTO delivery_shipment_allocations (delivery_id, shipment_id, shipped_qty)
SELECT
  production_delivery_id,
  id AS shipment_id,
  (SELECT SUM(shipped_qty) FROM shipment_items WHERE shipment_id = shipments.id)
FROM shipments
WHERE production_delivery_id IS NOT NULL;

-- Update production_deliveries status
UPDATE production_deliveries SET
  shipped_qty = delivered_qty,
  shipment_status = 'fully_shipped'
WHERE id IN (SELECT production_delivery_id FROM shipments WHERE production_delivery_id IS NOT NULL);
```

### Phase 3: Deprecation (Future)
```sql
-- After all shipments use new system:
ALTER TABLE shipments DROP COLUMN production_delivery_id;
```

---

## TypeScript Types

### Core Types

```typescript
// Enum
export type DeliveryShipmentStatus = 'unshipped' | 'partial' | 'fully_shipped'

// Table row
export interface DeliveryShipmentAllocation {
  id: string
  delivery_id: string
  shipment_id: string
  shipped_qty: number
  allocated_at: string
  remarks: string | null
  created_at: string
  updated_at: string
}

// View row
export interface UnshippedDeliveriesView {
  delivery_id: string
  delivery_number: string
  sku: string
  channel_code: string | null
  po_number: string
  batch_code: string
  supplier_name: string | null
  delivered_qty: number
  shipped_qty: number
  unshipped_qty: number
  actual_delivery_date: string | null
  days_since_delivery: number | null
  product_name: string | null
  spu: string | null
  shipment_status: DeliveryShipmentStatus
  payment_status: PaymentStatus
  created_at: string
  updated_at: string
}

// API request
export interface ShipmentAllocationItem {
  delivery_id: string
  shipped_qty: number
  remarks?: string | null
}
```

### Extended Types for UI

```typescript
// Delivery with allocation history
export interface DeliveryWithAllocations extends ProductionDelivery {
  allocations: {
    shipment_id: string
    tracking_number: string
    shipped_qty: number
    allocated_at: string
    actual_departure_date: string | null
    planned_arrival_date: string | null
    actual_arrival_date: string | null
    remarks: string | null
  }[]
  unshipped_qty: number
}

// Shipment with source traceability
export interface ShipmentWithSourceDeliveries extends Shipment {
  source_deliveries: {
    delivery_id: string
    delivery_number: string
    po_number: string
    batch_code: string
    sku: string
    shipped_qty: number
    delivered_qty: number
    delivery_date: string | null
    supplier_name: string | null
    remarks: string | null
  }[]
}
```

---

## UI Component Strategy

### 1. Shipment Creation Page (`/logistics/shipments/new`)

**Data Source:** `v_unshipped_deliveries`

**Form Structure:**
```
┌─ Shipment Metadata ─────────────────────┐
│ Tracking Number: [TEXT]                 │
│ Destination Warehouse: [SELECT]         │
│ Departure Date: [DATE]                  │
└──────────────────────────────────────────┘

┌─ Delivery Selection (Multi-select) ─────┐
│ [ ] Delivery D-2025-123 | PO-2025-001   │
│     SKU: A001 | Available: 500 units    │
│     Allocate: [150] units                │
│                                          │
│ [ ] Delivery D-2025-124 | PO-2025-002   │
│     SKU: B002 | Available: 300 units    │
│     Allocate: [300] units                │
│                                          │
│ [+ Add Delivery]                         │
└──────────────────────────────────────────┘

Total Shipping: 450 units
[Create Shipment]
```

**Validation Logic:**
- Call `validate_delivery_allocation()` before submit
- Show real-time error if allocation exceeds available qty
- Disable submit button if validation fails

---

### 2. Delivery Detail Page (`/procurement/deliveries/[id]`)

**New Section:** "Shipment History"

```
┌─ Shipment History ──────────────────────┐
│ Delivered: 500 units                    │
│ Shipped: 350 units (70%)                │
│ Remaining: 150 units                    │
│                                         │
│ Shipments:                              │
│ 1. TRK-001 | 150 units | 2025-12-01     │
│    Status: Arrived                      │
│ 2. TRK-002 | 200 units | 2025-12-05     │
│    Status: In Transit                   │
└──────────────────────────────────────────┘
```

**Data Source:** `get_delivery_allocations(delivery_id)`

---

### 3. Shipment Detail Page (`/logistics/shipments/[id]`)

**New Section:** "Source Deliveries"

```
┌─ Source Deliveries ─────────────────────┐
│ This shipment consolidates 2 deliveries:│
│                                         │
│ 1. D-2025-123 | PO-2025-001 | 150 units│
│    Delivered: 2025-11-28               │
│                                         │
│ 2. D-2025-124 | PO-2025-002 | 200 units│
│    Delivered: 2025-11-30               │
│                                         │
│ Total: 350 units                        │
└──────────────────────────────────────────┘
```

**Data Source:** `get_shipment_source_deliveries(shipment_id)`

---

## Query Examples

### Query 1: Find all unshipped deliveries older than 7 days

```sql
SELECT *
FROM v_unshipped_deliveries
WHERE days_since_delivery > 7
ORDER BY days_since_delivery DESC;
```

---

### Query 2: Get shipment allocation summary for a delivery

```sql
SELECT
  pd.delivery_number,
  pd.delivered_qty,
  pd.shipped_qty,
  pd.shipment_status,
  json_agg(
    json_build_object(
      'tracking_number', s.tracking_number,
      'shipped_qty', dsa.shipped_qty,
      'departure_date', s.actual_departure_date
    )
  ) AS shipments
FROM production_deliveries pd
LEFT JOIN delivery_shipment_allocations dsa ON pd.id = dsa.delivery_id
LEFT JOIN shipments s ON dsa.shipment_id = s.id
WHERE pd.id = 'YOUR_DELIVERY_ID'
GROUP BY pd.id;
```

---

### Query 3: Calculate total unshipped value by supplier

```sql
SELECT
  s.supplier_name,
  SUM(ud.unshipped_qty * p.unit_cost_usd) AS unshipped_value_usd
FROM v_unshipped_deliveries ud
INNER JOIN products p ON ud.sku = p.sku
LEFT JOIN suppliers s ON ud.supplier_name = s.supplier_name
GROUP BY s.supplier_name
ORDER BY unshipped_value_usd DESC;
```

---

## Testing Strategy

### Unit Tests (SQL Level)

1. **Test Allocation Validation**
   ```sql
   -- Should FAIL: Over-allocation
   INSERT INTO delivery_shipment_allocations (delivery_id, shipment_id, shipped_qty)
   VALUES ('delivery-with-100-units', 'shipment-1', 150);
   -- Expected: EXCEPTION "Total allocated (150) exceeds delivered (100)"
   ```

2. **Test Status Transitions**
   ```sql
   -- Scenario: Partial → Fully Shipped
   -- Given: Delivery has 100 units, shipped 50
   -- When: Allocate remaining 50
   -- Then: shipment_status = 'fully_shipped'
   ```

3. **Test Trigger Rollback**
   ```sql
   -- Should ROLLBACK: Invalid allocation in multi-delivery shipment
   -- Verify: No shipment record created, no allocations created
   ```

---

### Integration Tests (Application Level)

1. **Create Multi-Delivery Shipment**
   - Input: 3 deliveries (SKU A, B, C)
   - Expected: 1 shipment with 3 allocations, 3 shipment_items

2. **Partial Shipping Flow**
   - Step 1: Ship 100 units from 500-unit delivery
   - Step 2: Verify status = 'partial', unshipped_qty = 400
   - Step 3: Ship remaining 400 units
   - Step 4: Verify status = 'fully_shipped', unshipped_qty = 0

3. **View Consistency**
   - After allocation: Verify delivery disappears from `v_unshipped_deliveries` when fully shipped
   - After deletion: Verify delivery reappears if allocation is deleted

---

## Performance Considerations

### Indexes
- Primary workload: Lookup allocations by `delivery_id` or `shipment_id`
- Both foreign keys are indexed for fast JOINs
- `allocated_at` indexed for chronological queries

### Query Optimization
- `v_unshipped_deliveries` filters out fully shipped deliveries to reduce result set
- Trigger functions use single UPDATE (not multiple) for efficiency

### Scalability
- N:N junction table scales linearly (1 row per allocation)
- Trigger overhead: ~2-5ms per allocation (acceptable for transactional operations)

---

## Security & RLS

### Current Policy (MVP)
```sql
-- All authenticated users can CRUD on delivery_shipment_allocations
CREATE POLICY "Allow authenticated read" ON delivery_shipment_allocations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON delivery_shipment_allocations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON delivery_shipment_allocations
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete" ON delivery_shipment_allocations
  FOR DELETE TO authenticated USING (true);
```

### Future Enhancement
```sql
-- Restrict by user role (e.g., only logistics team can create allocations)
CREATE POLICY "Allow logistics team insert" ON delivery_shipment_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('logistics_manager', 'admin')
    )
  );
```

---

## Audit & Compliance

### Change Tracking
- All allocations have `created_at` and `updated_at` timestamps
- Consider adding `created_by` and `updated_by` fields in future

### Deletion Policy
- `ON DELETE RESTRICT` prevents cascade deletion
- Must manually remove allocations before deleting deliveries/shipments

### Audit Log (Future Enhancement)
```sql
CREATE TABLE delivery_shipment_allocation_audit (
  id UUID PRIMARY KEY,
  allocation_id UUID,
  action TEXT, -- 'created', 'updated', 'deleted'
  changed_by UUID,
  changed_at TIMESTAMPTZ,
  old_value JSONB,
  new_value JSONB
);
```

---

## Rollback Plan

### If Migration Fails
```sql
-- Drop in reverse order
DROP TRIGGER IF EXISTS trg_update_delivery_shipment_status ON delivery_shipment_allocations;
DROP TRIGGER IF EXISTS trg_check_delivery_allocation_limit ON delivery_shipment_allocations;
DROP FUNCTION IF EXISTS update_delivery_shipment_status();
DROP FUNCTION IF EXISTS check_delivery_allocation_limit();
DROP FUNCTION IF EXISTS create_shipment_with_delivery_allocations;
DROP FUNCTION IF EXISTS validate_delivery_allocation;
DROP FUNCTION IF EXISTS get_delivery_allocations;
DROP FUNCTION IF EXISTS get_shipment_source_deliveries;
DROP VIEW IF EXISTS v_unshipped_deliveries;
DROP TABLE IF EXISTS delivery_shipment_allocations;
ALTER TABLE production_deliveries DROP COLUMN IF EXISTS shipped_qty;
ALTER TABLE production_deliveries DROP COLUMN IF EXISTS shipment_status;
DROP TYPE IF EXISTS shipment_status_enum;
```

### If Application Issues Occur
- **Fallback:** Continue using legacy `shipments.production_delivery_id` for 1:1 relationships
- **Dual Mode:** Support both old and new systems until transition is complete

---

## File Checklist

### SQL Migration
✅ `/supabase/migrations/20251208000001_delivery_shipment_linkage.sql`

### TypeScript Types
✅ `/src/lib/types/database.ts` (updated)

### Documentation
✅ `/specs/delivery-shipment-linkage/design.md` (this file)

### Next Steps (Implementation)
- [ ] Create Server Actions in `/src/lib/actions/shipments.ts`
- [ ] Create Query functions in `/src/lib/queries/shipments.ts`
- [ ] Build UI components in `/src/components/logistics/`
- [ ] Add validation logic in form components
- [ ] Write integration tests

---

## Summary

This design provides a **robust, scalable, and maintainable** solution for linking deliveries and shipments. Key achievements:

1. **Flexibility:** Supports all consolidation and splitting scenarios
2. **Data Integrity:** Triggers and constraints prevent invalid states
3. **Traceability:** Full bidirectional lookup between deliveries and shipments
4. **Performance:** Indexed for fast queries, optimized for transactional workload
5. **Backward Compatibility:** Does not break existing code during migration

**Migration Script:** `supabase/migrations/20251208000001_delivery_shipment_linkage.sql`
**Type Definitions:** `src/lib/types/database.ts` (updated)
**Ready for Implementation:** Frontend developers can now build UI using provided types and RPC functions.

---

**End of Technical Design Document**
