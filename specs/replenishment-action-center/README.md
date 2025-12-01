# Replenishment Action Center - Specification Package

**Status**: ✅ Implementation Complete
**Version**: 2.0 (Implementation Phase)
**Last Updated**: 2025-11-30

---

## 🎯 Implementation Status

- ✅ **Technical Design**: Complete ([design.md](./design.md))
- ✅ **Code Implementation**: Complete
- ✅ **Type Safety**: All TypeScript checks passed
- ⏳ **Testing**: Pending
- ⏳ **Deployment**: Pending

---

## 📚 Document Index

This specification package contains comprehensive documentation for the Replenishment Action Center feature:

### 1. [Executive Summary](./executive-summary.md)
**Audience**: Executives, Stakeholders, Business Decision Makers
**Purpose**: Quick overview of business problem, solution, ROI, and resource requirements
**Reading Time**: 5 minutes

**Key Sections**:
- The Problem (current pain points)
- The Solution (high-level UX)
- Business Value ($160K annual impact)
- Timeline & Resource Needs

---

### 2. [Product Requirements Document (PRD)](./requirements.md)
**Audience**: Product Managers, UX Designers, Engineering Leads
**Purpose**: Comprehensive functional and non-functional requirements
**Reading Time**: 30 minutes

**Key Sections**:
- User Stories (Gherkin-style acceptance criteria)
- Business Rules (priority classification, calculation formulas)
- Data Fields Definition (complete schema mapping)
- UI/UX Requirements (generic, not prescriptive)
- Success Metrics & KPIs

---

### 3. [Business Rules Matrix](./business-rules-matrix.md)
**Audience**: Engineers, QA, Business Analysts
**Purpose**: Exhaustive decision tables and edge case handling
**Reading Time**: 20 minutes

**Key Sections**:
- Priority Classification Rules (when to mark Critical vs. High)
- Order Quantity Calculation Rules (formula + constraints)
- Deadline Calculation Logic (order vs. ship deadlines)
- Error Handling Rules (data validation, user messages)
- Testing Matrix (test cases mapped to rules)

### 4. [Technical Design Specification](./design.md) ✨ NEW
**Audience**: System Architects, Engineers, Tech Leads
**Purpose**: Complete system architecture and implementation blueprint
**Reading Time**: 40 minutes

**Key Sections**:
- Database Design (Schema, RLS Policies, Indexes)
- TypeScript Interface Definitions
- Component Layer Architecture
- Data Flow Design
- Performance Optimization Strategies
- Security Considerations

### 5. [Implementation Summary](./implementation-summary.md) ✨ NEW
**Audience**: Developers, QA Engineers, DevOps
**Purpose**: Detailed implementation documentation and deployment guide
**Reading Time**: 30 minutes

**Key Sections**:
- File Structure & Components
- Code Architecture
- Data Flow Examples
- Performance Benchmarks
- Testing Strategies
- Deployment Checklist
- Maintenance Guide

---

## Quick Reference

### What is "Replenishment Action Center"?

A UI component that displays **actionable purchase recommendations** by:
1. Identifying SKUs at risk of stockout (from `v_inventory_projection_12weeks`)
2. Calculating suggested order quantities (formula: `CEILING(MAX(gap, 4_weeks_sales) / 100) * 100`)
3. Assigning priority levels (Critical/High/Medium/Low based on urgency)
4. Showing order deadlines (risk_week_start - safety_stock_weeks)

### Why Build This?

**Problem**: Planners waste 3 hours/week manually calculating order quantities
**Solution**: Auto-calculate and present prioritized recommendations
**Impact**: $160K annual value (time savings + prevented stockouts)

### Where Does It Live?

**Page**: `/planning/projection`
**Position**: Above the 12-week projection table
**Data Source**: `v_replenishment_suggestions` materialized view (already exists in database)

---

## Implementation Checklist

Use this checklist to track implementation progress:

### Phase 1: Foundation
- [ ] Query integration: Wire `fetchReplenishmentSuggestions()` to UI
- [ ] Create `ReplenishmentActionCenter` React component
- [ ] Implement empty state ("No suggestions" message)
- [ ] Implement error state (view not found, query failed)

### Phase 2: Core Features
- [ ] Priority badge component (Critical=Red, High=Orange, etc.)
- [ ] Card/list layout with SKU, Product Name, Suggested Qty, Deadline
- [ ] "View Details" expandable panel (calculation breakdown)
- [ ] Priority filter chips (All, Critical, High, Overdue)
- [ ] Refresh button with loading state

### Phase 3: Polish
- [ ] Responsive layout (desktop 2-col, mobile 1-col)
- [ ] Accessibility audit (WCAG 2.1 AA compliance)
- [ ] Performance testing (load time <2s with 100 suggestions)
- [ ] "Last Updated" timestamp display

### Phase 4: UAT & Rollout
- [ ] User acceptance testing with 3 demand planners
- [ ] Training documentation
- [ ] Production deployment
- [ ] Week 1 usage analytics review

---

## Key Design Decisions

### Decision 1: Why Auto-Calculate Instead of Manual Input?
**Rationale**: Eliminates human error and ensures consistency. Safety stock formula is deterministic.
**Trade-off**: Users can't override suggestions in V1 (deferred to V2 based on feedback).

### Decision 2: Why Prioritize by Week Offset, Not Stock Level?
**Rationale**: Time urgency is more actionable than stock depth. "Order by Friday" is clearer than "800 units short."
**Trade-off**: A SKU with -500 units might rank lower than one with -50 if the latter's deadline is sooner.

### Decision 3: Why Round to Nearest 100?
**Rationale**: Assumes supplier MOQ = 100 units (common in manufacturing).
**Trade-off**: May over-order for slow-moving SKUs. Future enhancement: Per-supplier MOQ.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA SOURCES                              │
├─────────────────────────────────────────────────────────────┤
│ • inventory_snapshots (current stock)                       │
│ • sales_forecasts + sales_actuals (demand)                  │
│ • shipment_items + shipments (incoming supply)              │
│ • products (safety_stock_weeks, is_active)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│        v_inventory_projection_12weeks (Materialized)        │
│  • Calculates closing_stock for each SKU × Week            │
│  • Classifies stock_status (OK/Risk/Stockout)              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│      v_replenishment_suggestions (Materialized)             │
│  • Identifies first risk week for each SKU                 │
│  • Calculates suggested_order_qty                          │
│  • Assigns priority (Critical/High/Medium/Low)             │
│  • Calculates order_deadline_date, ship_deadline_date      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│      Frontend: Replenishment Action Center Component       │
│  • Fetches data via fetchReplenishmentSuggestions()        │
│  • Filters by priority (Critical, High, Overdue)           │
│  • Displays cards with "View Details" expansion            │
└─────────────────────────────────────────────────────────────┘
```

---

## FAQ

### Q1: What happens if a SKU has no `safety_stock_weeks` configured?
**A**: System uses default of 4 weeks and logs a warning. Planner sees a yellow flag in the UI.

### Q2: Can users edit the suggested quantity before creating a PO?
**A**: Not in V1. They must copy the data to the PO form and edit there. V2 may add inline editing.

### Q3: How often is the data refreshed?
**A**: Automatically daily at 06:00 UTC. Users can manually refresh via UI button (max 1x per 5 min).

### Q4: What if there are 200+ suggestions?
**A**: Default filter shows only Critical/High. Users can click "All" to see full list. Future: Add pagination.

### Q5: Does this integrate with purchase order creation?
**A**: Not in V1. Users manually copy data. V2 may add "Create PO" button that pre-fills PO form.

---

## Technical Dependencies

### Backend (Already Implemented)
- ✅ `v_replenishment_suggestions` materialized view
- ✅ `refresh_inventory_projections()` RPC function
- ✅ `fetchReplenishmentSuggestions()` query function
- ✅ TypeScript types: `ReplenishmentSuggestionView`

### Frontend (Implemented - 2025-11-30)
- ✅ `ReplenishmentActionCenter` container component
- ✅ `ReplenishmentActionHeader` filter controls
- ✅ `ReplenishmentActionStats` statistics display
- ✅ `ReplenishmentActionTable` data table
- ✅ Priority filter logic (All/Critical/High/Medium/Low)
- ✅ Overdue filter toggle
- ✅ SKU search functionality
- ✅ Quick filter buttons
- ✅ View details integration (scroll + filter)
- ✅ Create PO navigation (with pre-filled data)
- ✅ TypeScript type definitions
- ✅ Utility functions (filter, sort, calculate)

---

## Success Criteria Summary

### Week 1-4 (Adoption Metrics)
| Metric | Target | How to Measure |
|--------|--------|---------------|
| Feature usage rate | >80% of planners | Google Analytics |
| "View Details" click rate | >50% of suggestions | Event tracking |
| Manual refresh rate | <5% of page loads | Event tracking |

### Month 2-3 (Business Impact)
| Metric | Target | How to Measure |
|--------|--------|---------------|
| Planning cycle time | <30 min (from 3h) | User survey + time tracking |
| Stockout reduction | -25% incidents | Inventory reports |
| Deadline miss rate | <5% | PO data analysis |

---

## Contact & Approvals

**Feature Owner**: Product Director
**Technical Lead**: [TBD]
**UX Designer**: [TBD]

**Approval Status**:
- [x] Product Director - Requirements Approved (2025-11-30)
- [x] System Architect - Design Complete (2025-11-30)
- [x] System Architect - Implementation Complete (2025-11-30)
- [ ] Frontend Engineer - Code Review Pending
- [ ] QA Engineer - Testing Pending
- [ ] DevOps - Deployment Pending

**Questions?** Contact product@rolloy.com

---

## 🚀 Quick Start for Developers

### Run Development Server
```bash
npm run dev
```

### Check TypeScript
```bash
npx tsc --noEmit --skipLibCheck
```

### View the Page
Navigate to: `http://localhost:3000/planning/projection`

### Test Data Requirements
Ensure database has:
- Products with `safety_stock_weeks` configured
- Sales forecasts/actuals for next 12 weeks
- Inventory snapshots
- Shipment data (optional)

### Refresh Materialized Views
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY v_inventory_projection_12weeks;
REFRESH MATERIALIZED VIEW CONCURRENTLY v_replenishment_suggestions;
```

---

## 📁 Implementation Files Reference

### Core Components
```
src/components/planning/
├── replenishment-action-center.tsx      # Main container (state + logic)
├── replenishment-action-header.tsx      # Filter controls
├── replenishment-action-stats.tsx       # Statistics badges
└── replenishment-action-table.tsx       # Data table

src/app/planning/projection/
├── page.tsx                              # Server component (data fetch)
└── page-client.tsx                       # Client component (coordination)
```

### Types & Utils
```
src/lib/types/
└── replenishment.ts                      # UI state types

src/lib/utils/
└── replenishment-utils.ts                # Filter, sort, format functions
```

### Documentation
```
specs/replenishment-action-center/
├── README.md                             # This file
├── design.md                             # Technical architecture
├── implementation-summary.md             # Detailed implementation
├── requirements.md                       # PRD
├── executive-summary.md                  # Business overview
└── business-rules-matrix.md              # Decision rules
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-30 | Product Director | Initial specification package |
| 2.0 | 2025-11-30 | System Architect | Implementation complete, added technical docs |

---

**END OF README**
