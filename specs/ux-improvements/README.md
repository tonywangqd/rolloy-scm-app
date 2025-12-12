# UX Improvements Specification

**Project:** Rolloy SCM - User Experience Optimization
**Phase:** Product Requirements & Analysis
**Date:** 2025-12-11
**Status:** Awaiting Team Review

---

## Document Index

### 1. [Executive Summary](./executive-summary.md)
**Quick 5-minute read for decision makers**
- TL;DR of all three problems
- ROI analysis and priority ranking
- Key recommendations and next steps

**Target Audience:** Product Manager, Engineering Manager, Stakeholders

---

### 2. [Full Requirements Document](./requirements.md)
**Complete product requirements specification (30-minute read)**
- Detailed user stories with Gherkin acceptance criteria
- Data visualization requirements
- Business rules matrices
- Database impact analysis
- Phase-based implementation roadmap

**Target Audience:** System Architect, Frontend/Backend Developers, QA Director

---

### 3. [Page Differentiation Guide](./page-differentiation-guide.md)
**Visual guide to eliminate PSI vs Algorithm Audit confusion (15-minute read)**
- Decision trees for page selection
- UI design differentiation strategy
- User training materials
- Implementation checklist

**Target Audience:** UX Designer, Frontend Developer, User Training Team

---

## Problems Overview

### Problem 1: Forecast Management - Single-Week Editing Bottleneck
**Current Pain:** Users can only edit one week at a time, requiring 10-15 minutes to update 8 SKUs across 12 weeks.

**Proposed Solution:** Matrix table view (SKU rows x Week columns) with bulk editing.

**Expected Impact:** 5-10x efficiency improvement (reduce to <2 minutes).

**Priority:** P1 (High Value, Medium Complexity)

---

### Problem 2: PSI Table vs Algorithm Audit - Unclear Positioning
**Current Pain:** Users perceive 30-40% overlap between two pages, causing confusion about which to use.

**Root Cause:** Both pages reference similar data (POs, forecasts) but serve different purposes:
- **PSI Table:** Historical analysis (past 12 weeks) → for SC analysts, finance
- **Algorithm Audit:** Future planning (current + 12 weeks) → for purchase managers

**Proposed Solution:**
1. Rename pages to clarify purpose
2. Visual differentiation (color schemes, icons)
3. Add contextual help text
4. Feature segregation (PSI adds turnover metrics, Algorithm adds what-if analysis)

**Expected Impact:** Reduce user confusion from 40% to <10%.

**Priority:** P0 (High Value, Low Complexity - Quick Win!)

---

### Problem 3: Forecast Coverage - Multi-Week Demand Aggregation
**Current Pain:** Purchase orders often cover multiple weeks, but coverage table shows one row per (week, SKU, channel), forcing manual summation.

**Proposed Solution:**
- **Phase 1:** Aggregated view with expand/collapse (SKU-level rollup)
- **Phase 2:** Multi-select and bulk allocation to single PO
- **Phase 3:** Smart PO matching recommendations

**Expected Impact:** Reduce purchase decision time by 40-60% (from 5 min to <1 min per SKU).

**Priority:**
- Phase 1: P0 (Critical for purchase workflow)
- Phase 2: P2 (Enhancement)
- Phase 3: P4 (Nice-to-have)

---

## Key Metrics & ROI

| Metric | Current | Target | Annual ROI |
|--------|---------|--------|-----------|
| Forecast update time (8 SKUs, 12 weeks) | 10-15 min | <2 min | 62 hrs/year saved |
| Purchase decision time per SKU | 3-5 min | <1 min | 125 hrs/year saved |
| User confusion rate (PSI vs Algorithm) | ~40% | <10% | 13 hrs/year saved |
| **Total Time Savings** | - | - | **200 hrs/year** |
| **Financial Value** | - | - | **¥40,000/year** (at ¥200/hr) |

**Qualitative Benefits:**
- Improved decision quality (fewer stockouts/overstocks)
- Better employee satisfaction (less repetitive work)
- Reusable components (matrix table can be used elsewhere)

---

## Implementation Roadmap

### Phase 0: Quick Wins (1 Week)
- [x] Complete product requirements (this document)
- [ ] Problem 2: Rename pages and add help text
- [ ] Problem 2: Update color schemes and icons
- [ ] Deploy and gather user feedback

**Effort:** 2-3 days (Frontend only, no backend changes)

---

### Phase 1: Core Functionality (Q1 2026)
- [ ] Problem 3 Phase 1: Aggregated coverage view
- [ ] Problem 1: Matrix table component (reusable)
- [ ] Problem 1: Multi-week forecast editing MVP

**Effort:** 4-5 weeks (2 backend, 3 frontend)

---

### Phase 2: Enhanced Workflows (Q2 2026)
- [ ] Problem 3 Phase 2: Multi-week allocation
- [ ] Problem 1: Add trend sparklines
- [ ] Problem 2: Add inventory turnover metrics to PSI

**Effort:** 3-4 weeks

---

### Phase 3: Advanced Features (Future)
- [ ] Problem 3 Phase 3: Smart PO recommendations
- [ ] Problem 2: What-if scenario builder in Algorithm Audit
- [ ] Problem 1: Forecast template library (seasonal patterns)

**Effort:** TBD (depends on ML/AI resources)

---

## Technical Impact Summary

### Database Changes
- **New Tables:** None
- **New Views:** `v_forecast_coverage_aggregated` (Problem 3)
- **Schema Changes:** None
- **Index Additions:** On `sales_forecasts(sku, week_iso)` and `forecast_order_allocations(forecast_id)`

### API Changes
- **New Server Actions:**
  - `bulkUpdateForecasts(changes: ForecastChange[])` - Problem 1
  - `bulkAllocateToOrder(forecastIds: string[], poId: string, qty: number)` - Problem 3
- **Performance Optimizations:**
  - `calculatePSI()` - support 100+ SKU concurrent queries
  - `fetchForecastCoverage()` - add caching for aggregated view

### Frontend Components
- **New Components:**
  - `<MatrixTable>` - Excel-like editable grid (Problem 1)
  - `<AggregatedTable>` - Hierarchical table with expand/collapse (Problem 3)
  - `<AllocationModal>` - PO allocation dialog (Problem 3)
- **Modified Pages:**
  - `/planning/forecasts` - add matrix view mode
  - `/inventory/psi-table` - rename + styling changes
  - `/inventory/algorithm-audit` - rename + styling changes
  - `/planning/forecast-coverage` - add aggregation layer

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Matrix table performance degrades with 200+ SKUs | High | Medium | Add virtualization + pagination |
| Users resist new matrix UI | Medium | Medium | Keep old "quick edit" as fallback |
| `v_forecast_coverage` query slow | Medium | Low | Add indexes + materialized view |
| Multi-week allocation data inconsistency | High | Low | Use DB transactions + optimistic locking |
| Users still confused after page rename | Medium | Low | Add video tutorials + in-app walkthroughs |

---

## Success Criteria (Post-Implementation)

### Quantitative Metrics (3 months post-launch)
- [ ] Forecast update time reduced to <3 minutes (currently 10-15 min)
- [ ] Purchase decision time reduced to <2 minutes per SKU (currently 3-5 min)
- [ ] Page confusion survey score: >80% users can correctly identify which page to use
- [ ] Matrix table adoption rate: >70% of forecast updates use matrix mode

### Qualitative Metrics
- [ ] User satisfaction score (NPS) increases by 15+ points
- [ ] Support tickets related to "How do I..." decrease by 30%
- [ ] Zero critical bugs related to bulk operations in first 2 weeks

---

## Stakeholder Approval

**Product Director:** Claude AI (Author)
- [x] Requirements complete
- [ ] Awaiting System Architect review

**System Architect:** TBD
- [ ] Database design approved
- [ ] API contracts approved
- [ ] Performance estimates provided

**Engineering Manager:** TBD
- [ ] Resource allocation confirmed
- [ ] Timeline approved
- [ ] Priority ranking finalized

**UX Designer:** TBD
- [ ] Design mockups approved
- [ ] User flow validated
- [ ] Accessibility checklist complete

**QA Director:** TBD
- [ ] Test strategy approved
- [ ] Automation scope defined
- [ ] Performance benchmarks set

---

## Next Steps

### For Product Team (This Week)
1. Review all three documents in this folder
2. Schedule alignment meeting with engineering team
3. Prioritize: Quick Win (Problem 2) vs High-Impact (Problem 1+3)
4. Confirm Q1 2026 roadmap commitments

### For System Architect (Next 2 Weeks)
1. Design `v_forecast_coverage_aggregated` SQL view
2. Define API contracts for bulk operations
3. Create technical design document (specs/ux-improvements/design.md)
4. Estimate performance impact and infrastructure needs

### For Frontend Team (Next 2 Weeks)
1. Create high-fidelity mockups for matrix table
2. Create interactive prototype for aggregated coverage view
3. Conduct usability testing with 5-10 real users
4. Finalize component architecture

### For QA Team (Next 2 Weeks)
1. Write test cases for matrix table edge cases
2. Define performance test scenarios (load 200 SKUs x 12 weeks)
3. Create security checklist for bulk operations
4. Set up automated regression tests

---

## Document Maintenance

**Version History:**
- v1.0 (2025-12-11): Initial requirements by Product Director

**Review Cycle:**
- After System Architect design: Update with technical constraints
- After user testing: Update with UX feedback
- After Phase 0 deployment: Update with real-world metrics
- Quarterly: Review priority ranking based on business needs

**Contact:**
- Product Questions: Product Director (Claude AI)
- Technical Questions: System Architect (TBD)
- Implementation Status: Engineering Manager (TBD)

---

## Appendix: File Locations

**Current Implementation:**
- Forecast page: `/Users/tony/Desktop/rolloy-scm/src/app/planning/forecasts/page.tsx`
- PSI page: `/Users/tony/Desktop/rolloy-scm/src/app/inventory/psi-table/page.tsx`
- Algorithm audit: `/Users/tony/Desktop/rolloy-scm/src/app/inventory/algorithm-audit/page.tsx`
- Coverage page: `/Users/tony/Desktop/rolloy-scm/src/app/planning/forecast-coverage/page.tsx`

**Database Schema:**
- Types: `/Users/tony/Desktop/rolloy-scm/src/lib/types/database.ts`
- Views: `/Users/tony/Desktop/rolloy-scm/supabase/migrations/` (multiple files)

**Related Queries:**
- Planning: `/Users/tony/Desktop/rolloy-scm/src/lib/queries/planning.ts`
- Inventory: `/Users/tony/Desktop/rolloy-scm/src/lib/queries/reverse-schedule-audit.ts`
- PSI: `/Users/tony/Desktop/rolloy-scm/src/lib/actions/psi.ts`

---

**End of README**
