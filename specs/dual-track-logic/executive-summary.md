# Executive Summary: Dual-Track Logic Design

**Date:** 2025-12-02
**For:** Development Team, Finance Manager, Operations Manager
**Status:** Approved for Implementation

---

## TL;DR

Your question: **"Should shipments link to deliveries? Which date drives projections?"**

**Answer:**
1. **Shipment-to-Delivery Link:** OPTIONAL (nullable FK) - Use when convenient, not mandatory
2. **Inventory Projections:** Use shipment `actual_arrival_date` (or `planned_arrival_date` as fallback)
3. **Payment Calculations:** Use the ACTUAL date when available, fall back to PLANNED date

**Current Implementation Status:** ✅ Already correct in `v_inventory_projection_12weeks` view (lines 152-160)

---

## Core Business Rule (The Golden Rule)

```
effective_value = COALESCE(actual_value, planned_value)
```

Apply this principle to ALL date-based calculations:
- Inventory projections
- Payment due dates
- Performance metrics

---

## Key Design Decisions

### Decision 1: Flexible Shipment-Delivery Relationship

**Shipment ─[optional]─▶ Production Delivery**

| Scenario | Link? | Why? |
|----------|-------|------|
| 1:1 fulfillment (entire PO item ships together) | Yes | Easier tracking |
| Partial shipments (split one delivery into multiple) | No | Avoids complexity |
| Consolidated shipments (combine multiple deliveries) | No | Many-to-many impossible with FK |
| Early shipment entry (before delivery confirmation) | No | Don't block data entry |

**Result:** `production_delivery_id` remains **nullable**. No code changes needed.

---

### Decision 2: Inventory Uses Shipment Arrival Dates

**Why not use delivery dates?**
- Inventory becomes available when goods ARRIVE at warehouse, not when factory hands off
- Shipments are the "last mile" - they determine when you can sell

**Formula:**
```sql
arrival_week = get_week_iso(
  COALESCE(shipments.actual_arrival_date,
           shipments.planned_arrival_date)
)

incoming_qty[week] = SUM(shipment_items.shipped_qty
                         WHERE arrival_week = week)
```

**Implementation Status:** ✅ Already correct (no changes needed)

---

### Decision 3: Dual Payment Schedules

#### Procurement (Factory Payment)
- **Trigger:** Production delivery (factory hands off goods)
- **Terms:** 60 days from delivery, paid on last day of month
- **Calculation:**
  ```
  delivery_date = COALESCE(actual_delivery_date, planned_delivery_date)
  payment_due = last_day_of(delivery_month + 2 months)
  ```
- **Example:** Delivery on Jan 15 → Pay on Mar 31

#### Logistics (Freight Payment)
- **Trigger:** Warehouse arrival
- **Terms:**
  - If arrival ≤ 15th of month → Pay on 15th of next month
  - If arrival > 15th of month → Pay on last day of next month
- **Calculation:**
  ```
  arrival_date = COALESCE(actual_arrival_date, planned_arrival_date)
  IF DAY(arrival_date) <= 15:
    payment_due = next_month + 14 days
  ELSE:
    payment_due = last_day_of(next_month)
  ```
- **Example:**
  - Arrival Jan 10 → Pay Feb 15
  - Arrival Jan 20 → Pay Feb 28

---

## Data Flow Summary

```
PO Created → Production Delivery → Shipment → Warehouse Arrival
   (no payment)   (60-day terms)     (30-day terms)   (inventory +)

Each stage has:
- planned_*_date (entered upfront)
- actual_*_date (filled as events occur)

System always uses: COALESCE(actual, planned)
```

---

## What Changes Are Needed?

### Current State Audit

| Component | Status | Action |
|-----------|--------|--------|
| Inventory projection logic | ✅ Correct | None - already uses `COALESCE(actual_arrival_date, planned_arrival_date)` |
| Database schema | ✅ Correct | `production_delivery_id` already nullable in shipments table |
| Payment calculation (procurement) | ⚠️ To verify | System Architect to confirm computed columns exist |
| Payment calculation (logistics) | ⚠️ To verify | System Architect to confirm logic matches spec |
| Frontend display | 📝 Enhancement | Show "Planned vs Actual" comparison on dashboards |

### Recommended Next Steps

1. **System Architect:** Review payment calculation logic in database
2. **Backend Specialist:** Verify triggers/functions for payment_due_date calculation
3. **QA Director:** Run test scenarios from Acceptance Criteria (Section 11 of requirements.md)
4. **Frontend Artisan:** Add visual indicators for delayed shipments (actual > planned)

---

## Example Scenario Walkthrough

**Case: E-commerce retailer orders SKU "HAT-001"**

### Timeline:

**Week 0 (Today: 2025-02-03 / Week 06)**
- Create PO for 2000 units
- `planned_delivery_date` = 2025-02-20 (Week 08)
- `planned_arrival_date` = 2025-03-05 (Week 10)

**Inventory Projection (Initial):**
- Week 10: incoming = 2000 units (uses planned arrival)

---

**Week 7 (Factory confirms delivery early)**
- Update `actual_delivery_date` = 2025-02-15 (Week 07)
- **Payment due date calculated:** Mar 31, 2025 (60 days from Feb 15)

---

**Week 8 (Goods arrive early!)**
- Update `actual_arrival_date` = 2025-02-28 (Week 09)
- **Inventory projection refreshed:**
  - Week 10: incoming = 0 (removed)
  - Week 09: incoming = 2000 (moved)
- **Logistics payment calculated:** Mar 31, 2025 (arrived after 15th → last day of next month)

---

**Week 12 (Payments processed)**
- Mark procurement payment as "Paid" (Mar 31)
- Mark logistics payment as "Paid" (Mar 31)
- Both payments show in March cash flow report

---

## Risk Mitigation

### Data Quality Risks

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Missing `planned_arrival_date` | Database constraint: NOT NULL | Backend Specialist |
| Actual date before planned by >30 days | Check constraint + warning | Backend Specialist |
| Duplicate shipment entry | Unique index on `tracking_number` | Already exists ✅ |
| Late actual date updates | Dashboard flag for unconfirmed shipments | Frontend Artisan |

### Business Process Risks

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Users forget to update actual dates | Weekly reminder email (future enhancement) | Product Manager |
| Inventory projections not refreshed | Cron job: `SELECT refresh_inventory_projections()` daily | DevOps |
| Payment calculation errors | Automated tests (Gherkin scenarios in requirements.md) | QA Director |

---

## Key Performance Indicators (KPIs)

Track these to measure system effectiveness:

1. **On-Time Arrival Rate:** `COUNT(actual_arrival <= planned_arrival) / COUNT(*)`
   - Target: >85%
   - Action if <70%: Review supplier/logistics partners

2. **Forecast Accuracy:** `1 - ABS(actual_qty - forecast_qty) / actual_qty`
   - Target: >90%
   - Action if <80%: Review sales forecasting process

3. **Data Completeness:** `COUNT(actual_date IS NOT NULL) / COUNT(planned_date)`
   - Target: 100% for past dates
   - Action if <95%: Operations team training

4. **Stockout Prevention:** `COUNT(stock_status = 'Stockout') / COUNT(*)`
   - Target: <5% of SKU-weeks
   - Action if >10%: Review safety stock levels

---

## FAQ

### Q1: What if a delivery splits into 3 shipments?
**A:** Leave `production_delivery_id` as NULL for all 3 shipments. Link via `batch_code` instead.

### Q2: What if actual arrival date is earlier than planned?
**A:** No problem! System recalculates projections. Shows as "positive variance" in reports.

### Q3: What if we enter actual date wrong and need to fix it?
**A:** Update the record. System logs the change in audit trail. Refresh projections after update.

### Q4: Can planned dates be updated after PO is confirmed?
**A:** Yes, but best practice is to create a new planned date and keep original for performance tracking.

### Q5: What happens to payment if actual date is never entered?
**A:** Payment calculation uses `planned_date` indefinitely. Status stays "Pending" until actual date is set.

---

## Documents in This Specification

1. **requirements.md** (35 pages)
   - Full business logic specification
   - User stories, acceptance criteria
   - Payment calculation formulas
   - Gherkin test scenarios

2. **data-flow-diagram.md** (12 pages)
   - Visual ASCII diagrams
   - State machines
   - Step-by-step calculation flows

3. **executive-summary.md** (this document)
   - Quick reference for team
   - Decision rationale
   - Action items

---

## Approval & Sign-Off

| Role | Name | Status | Date |
|------|------|--------|------|
| Product Director | (Author) | ✅ Approved | 2025-12-02 |
| System Architect | (Pending Review) | ⏳ | - |
| Finance Manager | (Pending Review) | ⏳ | - |
| Operations Manager | (Pending Review) | ⏳ | - |

---

**Next Action:** System Architect creates `design.md` with:
- SQL schema validation
- Migration scripts (if needed)
- Generated columns for computed fields
- RLS policy updates

**Estimated Implementation Time:** 2-3 days (mostly testing and validation)
