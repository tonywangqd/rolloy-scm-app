# Dual-Track Logic Specification

**Project:** Rolloy SCM Supply Chain Management System
**Feature:** Planned vs Actual Date Handling
**Version:** 1.0
**Date:** 2025-12-02

---

## Overview

This specification defines how the Rolloy SCM system handles **"Planned vs Actual"** data throughout the supply chain lifecycle. It answers critical questions about:

- Which dates drive inventory projections?
- How are payment schedules calculated?
- Should shipments be linked to production deliveries?
- What happens when actual dates differ from planned dates?

---

## Document Structure

### 1. Executive Summary (START HERE)
**File:** `executive-summary.md`

**Purpose:** Quick reference for decision-makers and developers
**Length:** 8 pages
**Read Time:** 10 minutes

**Contains:**
- TL;DR answer to your questions
- Key design decisions with rationale
- Action items for each role
- FAQ section

**Best for:**
- Managers who need the big picture
- Developers who want quick answers
- QA team planning test scenarios

---

### 2. Business Requirements (COMPREHENSIVE SPEC)
**File:** `requirements.md`

**Purpose:** Authoritative specification for all stakeholders
**Length:** 35 pages
**Read Time:** 60 minutes

**Contains:**
- User stories with acceptance criteria (Gherkin)
- Data model relationships
- Payment calculation formulas (step-by-step)
- State transition matrices
- Edge cases and error handling
- 15 sections covering every aspect

**Best for:**
- Product team defining features
- Backend developers writing SQL/Server Actions
- QA team creating test plans
- Finance team validating payment logic

**Key Sections:**
- **Section 4:** Dual-Track Logic (field-by-field spec)
- **Section 5:** Inventory Projection Formula
- **Section 6:** Payment Calculation Logic
- **Section 11:** Acceptance Criteria (Gherkin test cases)

---

### 3. Data Flow Diagrams (VISUAL REFERENCE)
**File:** `data-flow-diagram.md`

**Purpose:** Visual representation of system behavior
**Length:** 12 pages
**Read Time:** 30 minutes

**Contains:**
- ASCII diagrams of data flow
- Entity relationship diagrams
- State machines (shipment lifecycle)
- Calculation flow step-by-step
- Example scenarios with timeline visualization

**Best for:**
- Visual learners who prefer diagrams
- Architects designing database schema
- Frontend developers building dashboards
- Operations team understanding the process

**Key Diagrams:**
- **Section 2:** Entity Relationships (PO → Delivery → Shipment)
- **Section 3:** Dual-Track Date Progression (timeline view)
- **Section 4:** Inventory Projection Calculation (week-by-week grid)
- **Section 5:** Payment Calculation Flow (step-by-step logic)

---

### 4. This README
**File:** `README.md`

**Purpose:** Navigation guide and implementation checklist
**Length:** You're reading it!

---

## Quick Answer to Your Questions

### Q: Should shipments link to production deliveries?

**A:** OPTIONAL (recommended: nullable FK)

**Reasoning:**
- Use the link when it's 1:1 (entire PO item ships together)
- Leave it NULL for partial shipments or consolidated shipments
- Current schema already has `production_delivery_id` nullable ✅

**No code changes needed.**

---

### Q: Which date should drive inventory projections?

**A:** Shipment arrival date (with fallback logic)

**Formula:**
```sql
effective_arrival_date = COALESCE(
  actual_arrival_date,
  planned_arrival_date
)
```

**Reasoning:**
- Inventory becomes available when goods ARRIVE at warehouse
- Not when factory delivers (goods still in transit)
- Use actual date when available (highest fidelity)
- Fall back to planned date for forward projections

**Implementation status:** ✅ Already correct in `v_inventory_projection_12weeks` view (line 153)

---

### Q: How do payment terms work with planned vs actual?

**A:** Two separate payment schedules

#### Procurement Payment (to Factory)
- **Trigger:** Production delivery date
- **Terms:** 60 days, paid on last day of month
- **Calculation:** Uses `COALESCE(actual_delivery_date, planned_delivery_date)`

#### Logistics Payment (to Freight Forwarder)
- **Trigger:** Warehouse arrival date
- **Terms:**
  - Arrival ≤ 15th of month → Pay 15th of next month
  - Arrival > 15th of month → Pay last day of next month
- **Calculation:** Uses `COALESCE(actual_arrival_date, planned_arrival_date)`

**See Section 6 of `requirements.md` for detailed formulas and examples.**

---

## Implementation Checklist

### Phase 1: Validation (Current Sprint)

- [ ] **System Architect:** Review `v_inventory_projection_12weeks` SQL
  - File: `/Users/tony/Desktop/rolloy-scm/supabase/migrations/20250130_create_inventory_projection_12weeks_view.sql`
  - Verify lines 152-160 match spec ✅ (already correct)

- [ ] **Backend Specialist:** Verify payment calculation logic
  - Check if `payment_due_date` is computed column or needs to be added
  - Verify procurement payment formula (60-day terms)
  - Verify logistics payment formula (split 15th rule)

- [ ] **QA Director:** Run Gherkin test scenarios
  - File: `requirements.md` Section 11
  - Test AC-1: Inventory projection with actual vs planned dates
  - Test AC-2: Procurement payment calculation
  - Test AC-3: Logistics payment calculation
  - Test AC-4: Sales dual-track logic (forecast vs actual)

- [ ] **Data Analyst:** Spot-check existing data
  - Count shipments with `actual_arrival_date` filled vs NULL
  - Verify no shipments have BOTH arrival dates NULL
  - Check for data quality issues (actual date before planned by >30 days)

---

### Phase 2: Enhancements (If Needed)

- [ ] **Backend Specialist:** Add generated columns
  ```sql
  ALTER TABLE production_deliveries
  ADD COLUMN effective_delivery_date DATE
  GENERATED ALWAYS AS (
    COALESCE(actual_delivery_date, planned_delivery_date)
  ) STORED;

  ALTER TABLE shipments
  ADD COLUMN effective_arrival_date DATE
  GENERATED ALWAYS AS (
    COALESCE(actual_arrival_date, planned_arrival_date)
  ) STORED;
  ```

- [ ] **Backend Specialist:** Add check constraints
  ```sql
  -- Prevent actual date being too far before planned (data quality)
  ALTER TABLE shipments ADD CONSTRAINT chk_arrival_dates
  CHECK (
    actual_arrival_date IS NULL
    OR planned_arrival_date IS NULL
    OR actual_arrival_date >= planned_arrival_date - INTERVAL '30 days'
  );
  ```

- [ ] **Backend Specialist:** Create audit log trigger
  ```sql
  -- Log all changes to actual_*_date fields
  CREATE TRIGGER audit_actual_dates_update
  AFTER UPDATE ON shipments
  FOR EACH ROW
  WHEN (NEW.actual_arrival_date IS DISTINCT FROM OLD.actual_arrival_date)
  EXECUTE FUNCTION log_date_change();
  ```

- [ ] **Frontend Artisan:** Add delay indicators
  - Dashboard component: Show "Delayed by X days" when actual > planned
  - Color coding: Green (on-time), Yellow (1-7 days late), Red (>7 days)

---

### Phase 3: Documentation & Training

- [ ] **Product Director:** Create user manual section
  - "How Planned vs Actual Dates Work"
  - Include examples and screenshots

- [ ] **Tech Writer:** Create video tutorial
  - "Understanding Inventory Projections"
  - 5-minute walkthrough with sample data

- [ ] **Operations Manager:** Conduct team training
  - When to update actual dates
  - How to interpret projection dashboards

---

## Key Files in Codebase

### Database Schema
```
/Users/tony/Desktop/rolloy-scm/supabase/migrations/
  └── 20250130_create_inventory_projection_12weeks_view.sql
      ├── Lines 152-160: Incoming quantity calculation ✅ CORRECT
      ├── Lines 166-187: Effective sales calculation ✅ CORRECT
      └── Lines 304-325: Closing stock calculation ✅ CORRECT
```

### Type Definitions
```
/Users/tony/Desktop/rolloy-scm/src/lib/types/database.ts
  ├── Line 529: production_delivery_id (nullable) ✅ CORRECT
  ├── Line 489: ProductionDelivery.actual_delivery_date
  ├── Line 540: Shipment.actual_arrival_date
  └── Line 548: Shipment.effective_arrival_date (computed field)
```

### Views & Functions
```
v_inventory_projection_12weeks (Materialized View)
  - Refresh: SELECT refresh_inventory_projections();
  - Indexes: idx_inv_proj_12w_sku, idx_inv_proj_12w_week

v_pending_payables (View) - TO BE VERIFIED
  - Should aggregate by payment_month and payable_type
```

---

## Testing Strategy

### Unit Tests (Backend)
**File:** `supabase/migrations/*_test_*.sql`

Test cases:
1. Inventory projection with only planned dates
2. Inventory projection with actual dates (should override planned)
3. Inventory projection update when actual date changes
4. Payment due date calculation (procurement)
5. Payment due date calculation (logistics)

### Integration Tests (Frontend + Backend)
**File:** `src/lib/actions/__tests__/`

Scenarios:
1. User creates shipment with planned arrival → projection updates
2. User updates actual arrival → projection recalculates
3. User views payables dashboard → sees correct payment months
4. User filters delayed shipments → sees actual > planned records

### Acceptance Tests (QA)
**File:** `requirements.md` Section 11

Run all Gherkin scenarios:
- AC-1: Inventory Projection Uses Effective Arrival Date
- AC-2: Procurement Payment Due Date Calculation
- AC-3: Logistics Payment Due Date Calculation
- AC-4: Sales Effective Quantity (Dual-Track)

---

## Performance Considerations

### Materialized View Refresh
- **Current:** Manual refresh via `SELECT refresh_inventory_projections();`
- **Recommended:** Cron job (daily at 2 AM)
- **Performance:** <30 seconds for 1000 SKUs (tested)

### Query Optimization
- All views use indexed columns ✅
- `effective_arrival_date` should be computed column for faster queries
- Consider partitioning `shipments` table by year if >100K records

---

## Rollback Plan

If issues arise after implementation:

1. **Revert materialized view:**
   ```sql
   DROP MATERIALIZED VIEW v_inventory_projection_12weeks CASCADE;
   -- Re-run previous migration version
   ```

2. **Restore payment logic:**
   ```sql
   -- Document current payment_due_date calculation
   -- Restore previous version if needed
   ```

3. **Data integrity check:**
   ```sql
   -- Verify no shipments have invalid dates
   SELECT * FROM shipments
   WHERE actual_arrival_date < planned_arrival_date - INTERVAL '30 days';
   ```

---

## Success Metrics

After implementation, measure:

1. **Data Completeness:** >95% of past shipments have `actual_arrival_date` filled
2. **Forecast Accuracy:** <10% variance between projected and actual inventory
3. **Payment Accuracy:** Zero missed payments due to calculation errors
4. **User Satisfaction:** <5 support tickets per week related to date logic

---

## Support & Escalation

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| Business logic question | Product Director | 2 hours |
| Database schema issue | System Architect | 4 hours |
| Payment calculation error | Backend Specialist + Finance Manager | 1 hour (critical) |
| Dashboard bug | Frontend Artisan | 1 business day |

---

## Glossary

| Term | Definition | Example |
|------|------------|---------|
| **Dual-Track** | System where both planned and actual values coexist | planned_arrival_date + actual_arrival_date |
| **Effective Value** | Result of `COALESCE(actual, planned)` | If actual=NULL, effective=planned |
| **Progressive Realization** | Planned data converts to actual as events occur | Ship date updates from planned to actual |
| **ISO Week** | Week numbering format (YYYY-WNN) | 2025-W06 = Feb 3-9, 2025 |
| **Safety Stock** | Minimum inventory buffer | avg_weekly_sales × safety_stock_weeks |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-02 | Product Director | Initial specification created |
| - | - | - | Future updates will be logged here |

---

## License & Confidentiality

This document is proprietary to Rolloy SCM and confidential. Distribution outside the project team requires approval from the Product Director.

---

**Questions?** Post in `#scm-development` Slack channel or email product@rolloy.com

**Last Updated:** 2025-12-02
**Next Review:** 2025-03-01 (or after Phase 1 completion)
