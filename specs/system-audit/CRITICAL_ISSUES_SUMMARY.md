# CRITICAL ISSUES SUMMARY
**Date:** 2025-12-02
**System:** Rolloy SCM Supply Chain Management

---

## 🔴 SHOWSTOPPER ISSUES (Must Fix Immediately)

### 1. Table Naming Schema Conflict
**File:** Multiple (queries vs views)
**Impact:** System may be completely broken
**Evidence:**
- UI uses: `weekly_sales_forecasts` / `weekly_sales_actuals`
- Views use: `sales_forecasts` / `sales_actuals`
- Database RLS policies use: `sales_forecasts`

**Action:** Run in Supabase SQL Editor:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%sales%';
```

**Fix:** Standardize ALL code to use ONE naming convention

---

### 2. Missing Production Delivery Recording
**Impact:** Cannot track factory deliveries
**Blocked User Story:**
> "As a procurement manager, I want to record when factory delivers goods"

**What's Missing:**
- ❌ No UI page to record deliveries
- ✅ Backend action exists (`createDelivery`)
- ❌ No update to `purchase_order_items.delivered_qty`

**Required Files:**
- Create: `/src/app/procurement/deliveries/new/page.tsx`
- Update: `/src/lib/actions/procurement.ts` (add delivered_qty logic)

---

### 3. Missing Inventory Update UI
**Impact:** Cannot maintain accurate inventory
**Blocked User Story:**
> "As a warehouse manager, I want to update stock quantities after physical count"

**What's Missing:**
- ❌ No edit modal or page
- ✅ Backend action exists (`updateInventorySnapshot`)

**Required:**
- Add edit modal to `/src/app/inventory/page.tsx`
- Form: SKU, Warehouse, New Qty, Reason, Notes

---

### 4. Dashboard Views Don't Exist
**Impact:** Dashboard shows empty data
**Missing Views:**
- `v_inventory_summary` (queried by dashboard.ts line 19)
- `v_pending_payables` (queried by dashboard.ts line 24)

**Existing Views:**
- ✅ `v_inventory_projection_12weeks`
- ✅ `v_replenishment_suggestions`

**Action:** Create views or update query references

---

### 5. Projection Data Not Shown to Users
**Impact:** Critical risk alerts invisible
**What Exists:**
- ✅ Database view calculates projections
- ✅ Query functions exist
- ❌ NOT displayed in dashboard or inventory page

**Required:**
- Add risk alerts to dashboard
- Show 12-week projection in planning module
- Create replenishment suggestions page

---

## 🟡 HIGH PRIORITY GAPS (Blocks Daily Workflow)

### 6. No Shipment Arrival Workflow
**Current:** User must manually update arrival date
**Missing:** One-click "Mark as Arrived" → auto-update inventory

**Required Action:**
```typescript
async function markShipmentArrived(shipmentId: string) {
  await updateShipmentDates(shipmentId, { actual_arrival_date: today })
  await processShipmentArrival(shipmentId) // Updates inventory
  await refreshInventoryProjectionViews() // Recalculates
  revalidatePath('/logistics')
}
```

---

### 7. No Replenishment Suggestions Page
**Impact:** Users can't act on system recommendations
**Required:** Create `/app/planning/replenishment/page.tsx`
- Query `v_replenishment_suggestions`
- Show SKU, risk week, suggested qty, deadlines
- "Create PO" action button

---

### 8. No PO Detail/Edit Page
**Impact:** Cannot view or update PO after creation
**Required:** `/app/procurement/[id]/page.tsx`
- Show PO items with delivery progress
- Edit planned/actual dates
- Link to delivery recording

---

## ⚠️ DATA QUALITY RISKS

### Field Name Inconsistency
- Types use: `year_week` vs `week_iso`
- Views expect: `week_iso`
- Queries may use: `year_week`
→ **Must standardize**

### No Audit History
- Inventory changes not logged
- Cannot track who changed what
- Cannot undo mistakes

### No Automatic View Refresh
- `v_inventory_projection_12weeks` must be manually refreshed
- Recommendation: Daily CRON job or trigger on data changes

---

## 📊 SYSTEM COMPLETENESS SCORE

| Module | Completeness | Critical Blockers |
|--------|--------------|-------------------|
| Planning | 85% | Table naming issue |
| Procurement | 40% | No delivery UI |
| Inventory | 30% | No edit UI, no projections shown |
| Logistics | 70% | No arrival workflow |
| Dashboard | 50% | Missing views, no alerts |
| **OVERALL** | **51%** | **5 showstoppers** |

---

## 🚦 GO/NO-GO DECISION

**Recommendation: DO NOT DEPLOY TO PRODUCTION**

**Reasons:**
1. Table naming conflict may cause data loss
2. Critical workflows blocked (delivery recording, inventory update)
3. Users cannot complete weekly operations
4. Dashboard may show incorrect data

**Minimum Viable System Requires:**
1. ✅ Fix table naming (2 hours)
2. ✅ Create delivery recording UI (6 hours)
3. ✅ Create inventory edit UI (4 hours)
4. ✅ Create missing views (2 hours)
5. ✅ Add dashboard alerts (3 hours)

**Total Effort:** ~17 hours (2-3 days)

---

## 📋 IMMEDIATE ACTION PLAN

### Day 1: Schema Verification
1. Run SQL queries to verify table names
2. Fix naming conflicts across codebase
3. Test projection view refresh
4. Verify all queries return data

### Day 2: Critical UI Pages
1. Build production delivery recording page
2. Build inventory edit modal
3. Test end-to-end delivery workflow

### Day 3: Dashboard & Polish
1. Create missing database views
2. Add risk alerts to dashboard
3. Implement shipment arrival workflow
4. User acceptance testing

---

## 📞 STAKEHOLDER COMMUNICATION

**Message to Business Users:**

> The system is 51% complete. Core data entry for forecasts and actuals works, but critical workflows for recording deliveries and updating inventory are missing. Dashboard exists but doesn't show risk alerts yet.
>
> **Timeline:** Need 2-3 more days of development before you can use this for daily operations.
>
> **What Works Today:**
> - ✅ Enter sales forecasts
> - ✅ Enter sales actuals
> - ✅ Create purchase orders
> - ✅ View inventory snapshots
> - ✅ Create shipments
>
> **What's Blocked:**
> - ❌ Record factory deliveries
> - ❌ Update inventory counts
> - ❌ See risk alerts
> - ❌ One-click mark shipment arrived

---

**End of Summary**
For detailed analysis, see: `/specs/system-audit/requirements.md`
