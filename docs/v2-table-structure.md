# Algorithm Audit Table V2.0 - Structure Comparison

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     ALGORITHM AUDIT TABLE V2.0                                                        │
│                                   21 Columns / 7 Groups / 16 Weeks                                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ GROUP HEADER ROW (Layer 1)                                                                                            │
├─────────────┬──────────────┬───────────────────────────┬──────────────┬──────────────┬──────────────┬───────────────┤
│ Basic Info  │ Sales Data   │ Arrival Data              │ Ship Data    │ Factory Ship │ Order Data   │ Inventory     │
│ (2 cols)    │ (3 cols)     │ (5 cols)                  │ (2 cols)     │ (2 cols)     │ (2 cols)     │ (5 cols)      │
│ White BG    │ Yellow BG    │ Blue BG                   │ Purple BG    │ Orange BG    │ Green BG     │ Gray BG       │
└─────────────┴──────────────┴───────────────────────────┴──────────────┴──────────────┴──────────────┴───────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ COLUMN HEADER ROW (Layer 2)                                                                                           │
├──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┤
│ 周次  │ 周起  │ 预计  │ 实际  │ 销量  │ 预计  │ 预计  │ 实际  │ 实际  │ 到仓  │ 预计  │ 实际  │ 预计  │ 实际  │ 预计  │ 实际  │ 期初  │ 期末  │ 安全  │ 周转  │ 状态  │
│ Week │ Start│ 销量  │ 销量  │ 取值  │ 到仓周 │ 到仓量 │ 到仓周 │ 到仓量 │ 取值  │ 发货周 │ 发货周 │ 出货周 │ 出货周 │ 下单周 │ 下单周 │ 库存  │ 库存  │ 库存  │ 率   │Status│
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ DATA ROWS (16 weeks: -4 to +11)                                                                                       │
├──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┤
│ W45  │ 12-02│  50  │  48  │  48  │  -   │  -   │ W45  │ 100  │ 100↓ │  -   │  -   │  -   │  -   │  -   │  -   │ 200  │ 252  │ 100  │ 5.3x │  OK  │
│ W46  │ 12-09│  55  │  -   │  55  │  -   │  -   │  -   │  -   │  -   │  -   │  -   │  -   │  -   │  -   │  -   │ 252  │ 197  │ 110  │ 3.6x │  OK  │
│ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘

                                      ↓ Click "到仓取值" cell to expand ↓

┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 物流明细 Shipment Details (2):                                                                                        │
│ ┌──────────────┬────────────┬────────────┬────────┬──────────┐                                                      │
│ │ SH-2025-001  │ 计划: W45  │ 实际: W45  │ 50件   │ 查看详情  │                                                      │
│ │ SH-2025-002  │ 计划: W45  │ 实际: W45  │ 50件   │ 查看详情  │                                                      │
│ └──────────────┴────────────┴────────────┴────────┴──────────┘                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Color Legend

### Group Background Colors

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Basic Info       │ │ Sales Data       │ │ Arrival Data     │
│ bg-white         │ │ bg-yellow-50     │ │ bg-blue-50       │
└──────────────────┘ └──────────────────┘ └──────────────────┘

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Ship Data        │ │ Factory Ship     │ │ Order Data       │
│ bg-purple-50     │ │ bg-orange-50     │ │ bg-green-50      │
└──────────────────┘ └──────────────────┘ └──────────────────┘

┌──────────────────┐
│ Inventory        │
│ bg-gray-100      │
└──────────────────┘
```

### Data Source Colors (Cell Level)

```
Actual Value         Forecast Value      Planned Value       No Data
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│     48       │    │     50       │    │     "-"      │    │      -       │
│ bg-green-50  │    │ bg-yellow-50 │    │ bg-sky-50    │    │ bg-gray-50   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Turnover Ratio Colors

```
Danger (<0.5x)      Warning (0.5-1x)    Normal (≥1.0x)      No Data
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    0.3x      │    │    0.8x      │    │    2.5x      │    │      -       │
│ bg-red-100   │    │ bg-yellow-100│    │ bg-green-50  │    │ bg-gray-50   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## Column Details

### ✅ Implemented (Showing Real Data)

| Col | Name | Data Source | Logic |
|-----|------|-------------|-------|
| 1 | 周次 Week | System | `week_iso` from query |
| 2 | 周起始日 Start Date | System | `week_start_date` formatted |
| 3 | 预计销量 Forecast | `sales_forecasts` | Aggregated by week |
| 4 | 实际销量 Actual | `sales_actuals` | Aggregated by week |
| 5 | 销量取值 Effective | Calculated | `COALESCE(actual, forecast)` |
| 8 | 实际到仓周 Actual Week | `shipments` | Week when shipments arrived |
| 9 | 实际到仓量 Actual Qty | `shipment_items` | Sum of `shipped_qty` |
| 10 | 到仓取值 Effective | Calculated | Sum of arrivals (clickable) |
| 17 | 期初库存 Opening | Calculated | Previous closing stock |
| 18 | 期末库存 Closing | Calculated | `opening + arrivals - sales` |
| 19 | 安全库存 Safety | `products` | `avg_sales × safety_weeks` |
| 20 | 周转率 Turnover | **NEW ✅** | `closing / sales` |
| 21 | 状态 Status | Calculated | Based on closing vs safety |

### ⏳ Pending Backend Implementation

| Col | Name | Data Source | Logic |
|-----|------|-------------|-------|
| 6 | 预计到仓周 Plan Week | **Backtracking** | `current_week + safety_buffer` |
| 7 | 预计到仓量 Plan Qty | **Backtracking** | `forecast × safety_buffer` |
| 11 | 预计发货周 Plan Week | **Backtracking** | `arrival_week - 4 weeks` |
| 12 | 实际发货周 Actual Week | `shipments` | `actual_departure_date` |
| 13 | 预计出货周 Plan Week | **Backtracking** | `ship_week - 1 week` |
| 14 | 实际出货周 Actual Week | `production_deliveries` | `actual_delivery_date` |
| 15 | 预计下单周 Plan Week | **Backtracking** | `factory_ship_week - 8 weeks` |
| 16 | 实际下单周 Actual Week | `purchase_orders` | `actual_order_date` |

---

## Supply Chain Timeline (Backtracking Algorithm)

```
Time flows from right to left ←━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                                                                        Current Week
                                                                             ↓
┌────────────┐  8 weeks   ┌────────────┐  1 week  ┌────────────┐  4 weeks  ┌────────────┐  2 weeks  ┌────────────┐
│   Order    │ ─────────→ │ Factory    │ ───────→ │   Ship     │ ────────→ │  Arrive    │ ────────→ │   Sale     │
│  下单周     │ Production │ Ship 出货周 │ Loading  │  发货周     │  Transit  │  到仓周     │  Buffer   │  销售周     │
└────────────┘            └────────────┘          └────────────┘           └────────────┘           └────────────┘

Example:
W34           ────────────→ W42         ─────────→ W43         ────────────→ W47         ─────────→ W49 (current)
```

**Backtracking Formula:**
```
given: current_week = W49, safety_buffer = 2 weeks

planned_arrival_week = W49 + 2 = W51
planned_ship_week = W51 - 4 = W47
planned_factory_ship_week = W47 - 1 = W46
planned_order_week = W46 - 8 = W38
```

---

## Before vs After

### V1.0 (13 Columns)

```
┌─────┬──────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬──────┐
│ Week│ Start│ Open│ FCst│ Act │ Eff │ShipP│ShipA│ Incm│ Net │Close│ Safe│Status│
└─────┴──────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴──────┘
```

### V2.0 (21 Columns) ✨

```
┌─────┬──────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬──────┐
│ Week│ Start│ SFor│ SAct│ SEff│APWeek│APQty│AAWeek│AAQty│AEff│SPWeek│SAWeek│FPWeek│FAWeek│OPWeek│OAWeek│ Open│Close│ Safe│Turn│Status│
└─────┴──────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴──────┘
        Basic         Sales Data         Arrival Data        Ship    Factory    Order      Inventory
```

**Added:**
- 8 new columns (6 pending backend, 1 calculated, 1 placeholder)
- Color-coded groups
- Double-layer header
- Turnover ratio calculation

**Kept:**
- All existing V1 functionality
- Expandable shipment details
- SKU selector
- Summary stats

---

## Responsive Behavior

### Desktop (>1280px)
```
┌────────────────────────────────────────────────────────────────┐
│ SKU Selector                                                   │
├────────────────────────────────────────────────────────────────┤
│ ┌────────┬────────┬─────────────────────────────────────────┐ │
│ │ Week*  │ Start  │ [All 19 columns visible]                │ │
│ │ (Fixed)│        │                                         │ │
│ └────────┴────────┴─────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Tablet/Mobile (<1280px)
```
┌──────────────────────────────────┐
│ SKU Selector                     │
├──────────────────────────────────┤
│ ┌────────┬─────────────────────┐ │
│ │ Week*  │ [Scroll right ───→] │ │
│ │ (Fixed)│                     │ │
│ └────────┴─────────────────────┘ │
│ ← Horizontal Scrolling Enabled   │
└──────────────────────────────────┘
```

---

## Implementation Stats

### Code Metrics
- **File:** `src/components/inventory/algorithm-audit-table.tsx`
- **Lines:** 599 (vs 374 in V1)
- **Added:** 225 lines (+60%)
- **Columns:** 21 (vs 13 in V1)
- **Groups:** 7 (vs 1 in V1)

### Feature Coverage
- ✅ Basic Info: 2/2 (100%)
- ✅ Sales Data: 3/3 (100%)
- ⚠️  Arrival Data: 3/5 (60%) - 2 pending backend
- ⚠️  Ship Data: 0/2 (0%) - 2 pending backend
- ⚠️  Factory Ship: 0/2 (0%) - 2 pending backend
- ⚠️  Order Data: 0/2 (0%) - 2 pending backend
- ✅ Inventory: 5/5 (100%)

**Overall:** 13/21 columns (62%) showing real data

---

## Testing Scenarios

### ✅ Verified
1. Table renders without errors
2. 21 columns display in correct order
3. Group headers show correct colors
4. Turnover ratio calculates correctly
5. Color coding works for actual/forecast
6. Expandable details work
7. Fixed "Week" column scrolls correctly
8. Legend displays all information
9. Build passes TypeScript checks

### 🧪 Manual Testing Needed
1. Select different SKUs - verify data changes
2. Expand shipment details - verify links work
3. Scroll horizontally - verify UI remains stable
4. Test on mobile - verify responsive layout
5. Test with edge cases:
   - SKU with no shipments
   - SKU with no forecasts
   - Week with stockout status

### ⏰ Future Testing (Backend Ready)
1. Verify backtracking algorithm accuracy
2. Verify cross-year week calculations
3. Verify actual ship/factory/order week matching
4. Performance test with 52-week view

---

## Migration Path

### Phase 1: Frontend (Complete ✅)
- [x] Update table component
- [x] Add 21 columns
- [x] Implement color coding
- [x] Add turnover ratio
- [x] Add legend
- [x] Test build

### Phase 2: Backend (In Progress ⏳)
- [ ] Implement backtracking algorithm
- [ ] Add planned arrival week/qty
- [ ] Aggregate actual ship week
- [ ] Aggregate actual factory ship week
- [ ] Aggregate actual order week
- [ ] Update AlgorithmAuditRow type

### Phase 3: Integration (Pending)
- [ ] Connect frontend to new backend data
- [ ] Remove placeholder "-" values
- [ ] Add loading states
- [ ] Add error handling
- [ ] Update documentation

### Phase 4: Enhancement (Future)
- [ ] Add column visibility toggle
- [ ] Add export to Excel
- [ ] Add mobile-optimized view
- [ ] Add tooltips for calculations
- [ ] Add drill-down to source records

---

**Version:** 2.0
**Status:** Phase 1 Complete
**Next:** Backend Implementation (Phase 2)
**Updated:** 2025-12-03
