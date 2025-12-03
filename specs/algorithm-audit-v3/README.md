# Algorithm Audit V3 - Project Overview

## Quick Reference

- **Status:** Design Complete, Ready for Implementation
- **Created:** 2025-12-03
- **Last Updated:** 2025-12-03
- **Version:** 3.0

---

## What is Algorithm Audit V3?

A comprehensive **20-column verification table** that validates the inventory replenishment algorithm by displaying planned vs actual milestones across the entire supply chain.

### Key Innovation: Reverse Calculation

```
销售需求 (周X, 数量Q)
    ↓ 反推计算
到仓周次 (周A) ← Q
    ↓ 减 物流周期 (5周)
发货周次 (周B) ← Q
    ↓ 减 装柜周期 (1周)
出货周次 (周C) ← Q
    ↓ 减 生产周期 (5周)
下单周次 (周D) ← Q
```

---

## Table Structure (20 Columns)

| # | Group | Columns | Description |
|---|-------|---------|-------------|
| 1 | Week | week_iso | Fixed left column, ISO format (2026-W08) |
| 2-4 | Sales | forecast, actual, effective | Demand data from sales forecasts/actuals |
| 5-7 | Order | planned, actual, effective | Purchase order timing (下单) |
| 8-10 | Factory Ship | planned, actual, effective | Production delivery (工厂出货) |
| 11-13 | Ship | planned, actual, effective | Logistics departure (物流发货) |
| 14-16 | Arrival | planned, actual, effective | Warehouse arrival (到仓) |
| 17-20 | Inventory | opening, closing, safety, status | Stock calculation and status |

**Total: 20 Columns**

---

## Documents

### 1. requirements.md (14 KB)
**Product Director's Specification**
- Business requirements and user stories
- Functional requirements (FR-1 to FR-9)
- Acceptance criteria
- Timeline and milestones

### 2. design.md (46 KB)
**System Architect's Technical Design**
- Data flow architecture
- TypeScript type definitions
- Reverse calculation algorithm (detailed pseudocode)
- Backend query function design (step-by-step)
- Frontend component design
- Performance optimization strategies
- Testing strategy

---

## Visual Summary

### Data Flow

```
┌──────────────────────────────────────────────────────┐
│              DATABASE (Supabase)                     │
├──────────────────────────────────────────────────────┤
│ 7 Tables:                                            │
│ • sales_forecasts        (预计销售)                  │
│ • sales_actuals          (实际销售)                  │
│ • purchase_orders        (采购订单)                  │
│ • production_deliveries  (工厂出货)                  │
│ • shipments              (物流发货+到仓)             │
│ • products               (提前期配置)                │
│ • inventory_snapshots    (期初库存)                  │
└──────────────────────────────────────────────────────┘
                    ▼
┌──────────────────────────────────────────────────────┐
│      BACKEND: fetchAlgorithmAuditV3()                │
├──────────────────────────────────────────────────────┤
│ Step 1: Fetch product configuration                 │
│ Step 2: Generate 16-week range                      │
│ Step 3: Parallel fetch all data (7 queries)         │
│ Step 4: Build weekly aggregation maps               │
│ Step 5: Run reverse calculation                     │
│ Step 6: Calculate rolling inventory                 │
│ Step 7: Determine stock status                      │
└──────────────────────────────────────────────────────┘
                    ▼
┌──────────────────────────────────────────────────────┐
│      FRONTEND: AlgorithmAuditTableV3.tsx             │
├──────────────────────────────────────────────────────┤
│ • 20-column table with sticky first column          │
│ • Color-coded cells (green = actual, gray = planned)│
│ • Stock status badges (OK/Risk/Stockout)            │
│ • Configurable shipping weeks input                 │
│ • Horizontal scroll support                         │
└──────────────────────────────────────────────────────┘
```

---

## Example Calculation

### Scenario
- **SKU:** D-001
- **Week W08 Sales:** 373 units
- **Lead Times:**
  - Safety Stock: 2 weeks
  - Shipping: 5 weeks
  - Loading: 1 week
  - Production: 5 weeks

### Reverse Calculation

```
销售周次: W08 (373 units)
    ↓ 反推 2 周 (safety_stock_weeks)
到仓周次: W06 ← 累加 373
    ↓ 反推 5 周 (shipping_weeks)
发货周次: W01 ← 累加 373
    ↓ 反推 1 周 (loading_weeks)
出货周次: 2025-W52 ← 累加 373
    ↓ 反推 5 周 (production_weeks)
下单周次: 2025-W47 ← 累加 373
```

### Result in Table

| Week | Sales | Order | Factory Ship | Ship | Arrival | Stock |
|------|-------|-------|--------------|------|---------|-------|
| 2025-W47 | 0 | **373** | 0 | 0 | 0 | 2000 |
| 2025-W52 | 0 | 0 | **373** | 0 | 0 | 2000 |
| 2026-W01 | 0 | 0 | 0 | **373** | 0 | 2000 |
| 2026-W06 | 0 | 0 | 0 | 0 | **373** | 2373 |
| 2026-W08 | **373** | 0 | 0 | 0 | 0 | 2000 |

---

## Implementation Checklist

### Backend (2 days)
- [ ] Add V3 types to `src/lib/types/database.ts`
  - [ ] `SupplyChainLeadTimesV3`
  - [ ] `AlgorithmAuditRowV3`
  - [ ] `AlgorithmAuditResultV3`
- [ ] Create `src/lib/queries/algorithm-audit-v3.ts`
  - [ ] Implement `fetchAlgorithmAuditV3()` function
  - [ ] Add reverse calculation logic
  - [ ] Add weekly aggregation logic
  - [ ] Add rolling inventory calculation

### Frontend (2 days)
- [ ] Create `src/components/inventory/algorithm-audit-table-v3.tsx`
  - [ ] 20-column table component
  - [ ] Sticky first column
  - [ ] Color-coded cells
  - [ ] Stock status badges
  - [ ] Lead time summary section
- [ ] Create `src/app/inventory/algorithm-audit-v3/page.tsx`
  - [ ] Next.js Server Component page
  - [ ] SKU selector
  - [ ] Shipping weeks input
  - [ ] Integration with query function

### Testing (1 day)
- [ ] Unit tests for reverse calculation
- [ ] Unit tests for aggregation logic
- [ ] Integration test with sample SKU
- [ ] Manual test with real data

### Documentation (1 day)
- [ ] Add inline code comments
- [ ] Create user guide
- [ ] Update main README

---

## Key Files to Create

| File Path | Lines | Purpose |
|-----------|-------|---------|
| `src/lib/types/database.ts` | +80 | Add V3 TypeScript types |
| `src/lib/queries/algorithm-audit-v3.ts` | ~400 | Backend query function |
| `src/components/inventory/algorithm-audit-table-v3.tsx` | ~300 | Frontend table component |
| `src/app/inventory/algorithm-audit-v3/page.tsx` | ~50 | Next.js page route |

**Total Estimated LOC:** ~830 lines

---

## API Reference

### Query Function

```typescript
// src/lib/queries/algorithm-audit-v3.ts

export async function fetchAlgorithmAuditV3(
  sku: string,
  shippingWeeks: number = 5
): Promise<AlgorithmAuditResultV3>
```

**Input:**
- `sku`: Product SKU (e.g., "D-001")
- `shippingWeeks`: Logistics lead time (4-6 weeks, default: 5)

**Output:**
```typescript
{
  product: Product | null,
  rows: AlgorithmAuditRowV3[],  // 16 weeks
  leadTimes: {
    production_weeks: 5,
    loading_weeks: 1,
    shipping_weeks: 5,
    safety_stock_weeks: 2
  },
  metadata: {
    current_week: "2026-W01",
    start_week: "2025-W49",
    end_week: "2026-W12",
    total_weeks: 16,
    avg_weekly_sales: 385.5,
    safety_stock_weeks: 2,
    production_lead_weeks: 5,
    shipping_weeks: 5
  }
}
```

---

## Performance Notes

### Query Optimization
- Parallel data fetching (7 queries in `Promise.all`)
- 16-week window limit (not full dataset)
- In-memory aggregation using Map structures

### Rendering Optimization
- Server Component for initial render
- Fixed first column (CSS `sticky`)
- Lazy rendering for expandable details (future)

### Expected Performance
- Query time: <500ms (for typical SKU)
- Render time: <100ms (16 rows)
- Total page load: <600ms

---

## Questions & Answers

### Q1: Why reverse calculation instead of forward?
**A:** Because we want to determine "when should we have ordered?" based on known sales demand, not "what will happen if we order now?". This is a validation tool, not a planning tool.

### Q2: Why accumulate quantities in planned columns?
**A:** Because one week's arrival may serve multiple future weeks' sales demands. The algorithm needs to aggregate all contributing demands to show total required quantity.

### Q3: Why 16 weeks (4 past + current + 11 future)?
**A:**
- 4 past weeks: Verify recent execution accuracy
- Current week: Reference point
- 11 future weeks: Cover full supply chain lead time (2 + 5 + 1 + 5 = 13 weeks with buffer)

### Q4: Why not include planned data in arrivals like V2?
**A:** V3 focuses on validation (actual vs algorithm), not forecasting. If no actual arrival occurred, the "planned" column shows what the algorithm expected, and we can see the gap.

### Q5: Can I change production lead weeks dynamically?
**A:** In V3.0, no. It reads from the `products` table. Dynamic changes are planned for V3.1+.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.0 | 2025-12-03 | Initial design with 20-column structure |

---

## Related Documents

- **V2 Design:** See `/specs/algorithm-audit-v2/` for previous iteration
- **Database Schema:** See `supabase/migrations/` for table structures
- **Date Utilities:** See `src/lib/utils/date.ts` for ISO week functions

---

## Contact

**System Architect:** Claude (Anthropic)
**Project:** Rolloy SCM - Supply Chain Management System

---

## License

Internal use only - Rolloy SCM Project
