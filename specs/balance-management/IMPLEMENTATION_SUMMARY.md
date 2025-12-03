# Balance Management System - Implementation Summary

**Quick Reference Guide for Development Team**

---

## Overview

This system transforms Rolloy SCM from "overwrite logic" to "balance resolution logic," ensuring all planned quantities are tracked until explicitly closed.

**Key Concept:** When actual < planned → Create Balance → User Must Resolve

---

## Core Components

### 1. New Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `balance_resolutions` | Track all balance discrepancies | `source_type`, `planned_qty`, `actual_qty`, `open_balance`, `resolution_status` |
| `inventory_adjustments` | Audit trail for inventory changes | `adjustment_type`, `qty_change`, `reason`, `requires_approval` |

### 2. Modified Tables

| Table | Added Fields | Purpose |
|-------|--------------|---------|
| `purchase_order_items` | `fulfilled_qty`, `open_balance`, `fulfillment_status` | Track PO fulfillment progress |
| `production_deliveries` | `expected_qty`, `variance_qty`, `variance_reason` | Detect partial deliveries |
| `shipment_items` | `received_qty`, `variance_qty`, `receipt_status` | Track logistics losses |
| `shipments` | `is_finalized`, `finalized_at`, `shipment_status` | Prevent editing after finalization |

### 3. Key Functions

```sql
-- Create balance when variance detected
create_balance_resolution(source_type, source_id, sku, planned_qty, actual_qty, ...)

-- Process user resolution action
resolve_balance(balance_id, action, deferred_date, reason, ...)

-- Create inventory adjustment with auto-approval logic
create_inventory_adjustment(sku, warehouse_id, adjustment_type, qty_change, ...)

-- Finalize shipment and create variance adjustments
finalize_shipment(shipment_id, finalized_by)

-- Get dashboard KPIs
get_open_balances_summary(sku)
```

### 4. Server Actions

**File:** `/src/lib/actions/balance-management.ts`

```typescript
// Resolve a balance (defer, short_close, create_carryover)
await resolveBalance({ balanceId, action, deferredDate, reason })

// Create inventory adjustment
await createInventoryAdjustment({ sku, warehouseId, adjustmentType, qtyChange, reason })

// Finalize shipment (locks editing, creates adjustments)
await finalizeShipment(shipmentId)

// Get open balances with filters
await getOpenBalances({ sku, status, priority })

// Get dashboard KPIs
await getBalanceSummaryKPIs(sku)

// Update balance actual qty (triggers auto-close if fulfilled)
await updateBalanceActualQty(balanceId, newActualQty)
```

---

## Implementation Priorities

### P0 - Must Have (Weeks 1-5)

1. **Database Schema** (Week 1)
   - Create `balance_resolutions`, `inventory_adjustments` tables
   - Modify existing tables
   - Create functions, triggers, RLS policies

2. **TypeScript Integration** (Week 2)
   - Add types to `database.ts`
   - Implement Server Actions

3. **Core UI Components** (Weeks 3-4)
   - `BalanceResolutionDialog` - Modal for user decisions
   - `BalanceSummaryCards` - Dashboard KPIs
   - `BalanceListTable` - Balance management table
   - `/balance-management` page

4. **Procurement Integration** (Week 5)
   - Modify PO creation to detect variance
   - Integrate balance modal
   - Add fulfillment progress to PO detail page

### P1 - Should Have (Weeks 6-8)

5. **Inventory Projection Enhancement** (Week 6)
   - Update projection view to include pending balances
   - Add balance indicators to planning dashboard

6. **Logistics Integration** (Week 7)
   - Track shipment variance
   - Implement shipment finalization

7. **Adjustment UI** (Week 8)
   - Create adjustment list page
   - Manual adjustment form

### P2 - Nice to Have (Later)

8. Historical data backfill
9. Advanced analytics
10. Bulk operations

---

## Data Flow Examples

### Example 1: PO Creation with Variance

```
1. User creates PO: ordered 100 (suggested 200)
2. System detects variance: 100 units
3. create_balance_resolution() → balance_id
4. Show modal: "100 units unfulfilled. What to do?"
5. User selects "Defer" → deferred_date = +7 days
6. resolve_balance(balance_id, 'defer', deferred_date)
7. Balance status: pending → deferred
8. Inventory projection includes 100 units in future supply
```

### Example 2: Partial Delivery

```
1. PO ordered: 100 units
2. Factory delivers 50 units (Batch 1)
3. Update balance: actual_qty = 50, open_balance = 50
4. PO status: pending → partial (50%)
5. Factory delivers 50 units (Batch 2)
6. Update balance: actual_qty = 100, open_balance = 0
7. TRIGGER: auto_close_fulfilled_balance
8. Balance status: pending → fulfilled
9. PO status: partial → fulfilled (100%)
```

### Example 3: Shipment Finalization

```
1. Shipment: shipped 100 units, received 95 units
2. User clicks "Finalize Shipment"
3. finalize_shipment() checks variance: 5 units
4. Create inventory_adjustment:
   - type: logistics_loss
   - qty_change: -5
   - reason: "Lost in transit"
5. Update inventory_snapshots: qty_on_hand -= 5
6. Mark shipment: is_finalized = TRUE (locked)
```

---

## State Transitions

### Balance Status Flow

```
pending → deferred → fulfilled ✅
        ↘ short_closed ✅
        ↘ cancelled ✅

Rules:
- pending: Default, user hasn't decided
- deferred: Postponed to future date
- short_closed: Will NOT fulfill (requires reason)
- fulfilled: Auto-closed when open_balance = 0
- cancelled: Record invalidated

⚠️ Cannot transition FROM short_closed/fulfilled/cancelled
```

---

## Key Business Rules

1. **Balance Creation:** Only create if `actual_qty < planned_qty` (positive variance)
2. **Auto-Close:** When `open_balance` reaches 0, auto-set status = 'fulfilled'
3. **Short Close:** Requires reason, removes balance from projections, triggers recalculation
4. **Approval Threshold:** Adjustments > $5,000 require manager approval
5. **Finalization:** Shipments cannot be edited after finalization
6. **Age Escalation:** Balances > 45 days = Critical, > 15 days = High Priority

---

## Testing Checklist

### Database Tests
- [ ] `create_balance_resolution()` creates record when actual < planned
- [ ] `resolve_balance()` validates status transitions
- [ ] Trigger auto-closes when open_balance = 0
- [ ] RLS policies block unauthorized updates

### Server Action Tests
- [ ] `resolveBalance()` handles all action types
- [ ] `createInventoryAdjustment()` validates qty_change != 0
- [ ] `finalizeShipment()` prevents re-finalization
- [ ] Error handling returns user-friendly messages

### UI Tests
- [ ] Modal shows correct variance amount
- [ ] Defer action validates deferred_date > original_date
- [ ] Dashboard KPIs update in real-time
- [ ] Balance list filters work correctly

---

## Performance Considerations

### Critical Indexes (Already Included)

```sql
-- Fast balance lookups
idx_balance_sku (sku) WHERE status IN ('pending', 'deferred')
idx_balance_status (resolution_status)
idx_balance_open (open_balance) WHERE open_balance > 0

-- Fast fulfillment queries
idx_po_items_fulfillment (fulfillment_status, open_balance)

-- Fast adjustment queries
idx_inv_adj_warehouse_date (warehouse_id, adjustment_date DESC)
```

### Optimization Tips

1. Use RPC functions for complex operations (single DB round-trip)
2. Always paginate large result sets
3. Cache dashboard KPIs (5-minute TTL)
4. Use prepared statements in Server Actions
5. Avoid N+1 queries (use JOINs or batch fetching)

---

## Migration Execution

### Step 1: Run Migrations (Staging First)

```bash
# Execute in Supabase SQL Editor (Staging)
supabase/migrations/20251203000001_balance_management_schema.sql
supabase/migrations/20251203000002_balance_management_functions.sql
supabase/migrations/20251203000003_balance_management_views.sql
```

### Step 2: Verify Schema

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('balance_resolutions', 'inventory_adjustments');

-- Check indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('balance_resolutions', 'inventory_adjustments');

-- Check functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%balance%';
```

### Step 3: Test Functions

```sql
-- Test balance creation
SELECT create_balance_resolution(
  'po_item',
  'test-uuid'::UUID,
  'A-001',
  200,
  100,
  CURRENT_DATE
);

-- Test balance resolution
SELECT resolve_balance(
  'balance-id'::UUID,
  'defer',
  '2025-W50',
  CURRENT_DATE + INTERVAL '7 days',
  'Testing defer action',
  NULL
);
```

### Step 4: Deploy to Production

```bash
# After staging validation, deploy to production
# Run same migrations in Production Supabase SQL Editor
```

---

## Rollback Plan

**If issues arise, execute rollback script (Appendix C in design.md):**

```sql
-- Drops all balance management objects
-- WARNING: Deletes all balance tracking data
-- Execute only if critical issue detected
```

---

## Quick Reference URLs

- **Full Design Doc:** `specs/balance-management/design.md`
- **Requirements (PRD):** `specs/balance-management/requirements.md`
- **Server Actions:** `src/lib/actions/balance-management.ts`
- **Types:** `src/lib/types/database.ts`
- **Migrations:** `supabase/migrations/20251203*`

---

## Support Contacts

- **System Architect:** Claude (Sonnet 4.5)
- **Product Owner:** Tony
- **Tech Stack:** Next.js 16 + Supabase + TypeScript
- **Deployment:** Vercel (Serverless)

---

**Status:** ✅ Design Complete, Ready for Implementation

**Last Updated:** 2025-12-03
