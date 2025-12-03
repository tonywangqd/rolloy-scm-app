# Algorithm Audit V3 - Reverse Calculation Algorithm

## Document Purpose
This document provides a detailed explanation of the **reverse calculation algorithm** - the core logic that powers Algorithm Audit V3.

---

## 1. Algorithm Overview

### 1.1 What is Reverse Calculation?

Traditional forward planning asks: "If I order today, when will it arrive?"

Reverse calculation asks: "To meet sales demand in week X, when should I have ordered?"

### 1.2 The Supply Chain Timeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   下单      │ → │  工厂出货   │ → │  物流发货   │ → │    到仓     │ → │    销售     │
│   ORDER     │    │ FACTORY SHIP│    │    SHIP     │    │  ARRIVAL    │    │   SALES     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      ▲                  ▲                  ▲                  ▲                  ▲
      │                  │                  │                  │                  │
      │◄─── 5周 ────────│◄─── 1周 ────────│◄─── 5周 ────────│◄─── 2周 ────────│
      │   (生产周期)     │   (装柜周期)     │   (物流周期)     │  (安全库存周数) │
```

**Reverse calculation moves from right to left**, subtracting lead times at each step.

---

## 2. Mathematical Formulation

### 2.1 Variables

| Symbol | Description | Example |
|--------|-------------|---------|
| `W_s` | Sales week (ISO format) | "2026-W08" |
| `Q_s` | Sales quantity | 373 units |
| `S` | Safety stock weeks | 2 weeks |
| `T_ship` | Shipping lead time | 5 weeks |
| `T_load` | Loading lead time | 1 week |
| `T_prod` | Production lead time | 5 weeks |

### 2.2 Timeline Calculation Formulas

```
W_arrival = W_s - S
W_ship = W_arrival - T_ship
W_factory = W_ship - T_load
W_order = W_factory - T_prod
```

### 2.3 Quantity Accumulation

For each milestone week, accumulate quantities from all sales demands that map to it:

```
planned_arrival[W_arrival] += Q_s
planned_ship[W_ship] += Q_s
planned_factory_ship[W_factory] += Q_s
planned_order[W_order] += Q_s
```

---

## 3. Step-by-Step Algorithm

### 3.1 Pseudocode

```typescript
function reverseCalculation(
  rows: AlgorithmAuditRowV3[],
  leadTimes: SupplyChainLeadTimesV3
): void {
  // Step 1: Initialize accumulation maps
  const plannedOrderMap = new Map<string, number>()
  const plannedFactoryShipMap = new Map<string, number>()
  const plannedShipMap = new Map<string, number>()
  const plannedArrivalMap = new Map<string, number>()

  // Step 2: For each week's sales demand
  for (const row of rows) {
    const salesDemand = row.sales_effective
    if (salesDemand <= 0) continue  // Skip weeks with no sales

    const salesWeek = row.week_iso

    // Step 3: Calculate target weeks (backward from sales week)
    const arrivalWeek = addWeeks(salesWeek, -leadTimes.safety_stock_weeks)
    const shipWeek = addWeeks(arrivalWeek, -leadTimes.shipping_weeks)
    const factoryShipWeek = addWeeks(shipWeek, -leadTimes.loading_weeks)
    const orderWeek = addWeeks(factoryShipWeek, -leadTimes.production_weeks)

    // Step 4: Accumulate quantities in respective weeks
    plannedArrivalMap[arrivalWeek] += salesDemand
    plannedShipMap[shipWeek] += salesDemand
    plannedFactoryShipMap[factoryShipWeek] += salesDemand
    plannedOrderMap[orderWeek] += salesDemand
  }

  // Step 5: Populate planned quantities back into rows
  for (const row of rows) {
    row.planned_arrival = plannedArrivalMap[row.week_iso] || 0
    row.planned_ship = plannedShipMap[row.week_iso] || 0
    row.planned_factory_ship = plannedFactoryShipMap[row.week_iso] || 0
    row.planned_order = plannedOrderMap[row.week_iso] || 0
  }
}
```

### 3.2 Edge Cases

#### Case 1: Week calculation goes negative (before Year 1)
```typescript
// Example: Current week is 2026-W02, need to go back 15 weeks
// Result: 2025-W39 (previous year)

// Solution: Use date-fns addWeeks() which handles year boundaries
const targetWeek = addWeeks(currentWeek, -15)  // Automatically wraps to 2025
```

#### Case 2: Zero or negative sales
```typescript
// Skip weeks with no sales demand
if (salesDemand <= 0) continue
```

#### Case 3: Multiple demands mapping to same week
```typescript
// Use Map to accumulate quantities
const current = plannedArrivalMap.get(arrivalWeek) || 0
plannedArrivalMap.set(arrivalWeek, current + salesDemand)
```

---

## 4. Worked Example

### 4.1 Input Data

**Product Configuration:**
- SKU: D-001
- Safety stock weeks: 2
- Production lead weeks: 5
- Loading weeks: 1
- Shipping weeks: 5

**Sales Demands (16-week window):**

| Week | Sales Forecast | Sales Actual | Sales Effective |
|------|----------------|--------------|-----------------|
| 2026-W05 | 350 | null | 350 |
| 2026-W06 | 400 | 373 | 373 |
| 2026-W07 | 350 | null | 350 |
| 2026-W08 | 380 | null | 380 |
| 2026-W09 | 400 | null | 400 |
| 2026-W10 | 350 | null | 350 |
| ... | ... | ... | ... |

### 4.2 Calculation for Week W08 (380 units)

**Step 1: Calculate Arrival Week**
```
W_arrival = W08 - 2 weeks (safety stock)
W_arrival = W06
```
Action: `plannedArrivalMap["2026-W06"] += 380`

**Step 2: Calculate Ship Week**
```
W_ship = W06 - 5 weeks (shipping)
W_ship = W01
```
Action: `plannedShipMap["2026-W01"] += 380`

**Step 3: Calculate Factory Ship Week**
```
W_factory = W01 - 1 week (loading)
W_factory = 2025-W52  // Previous year!
```
Action: `plannedFactoryShipMap["2025-W52"] += 380`

**Step 4: Calculate Order Week**
```
W_order = 2025-W52 - 5 weeks (production)
W_order = 2025-W47
```
Action: `plannedOrderMap["2025-W47"] += 380`

### 4.3 Calculation for Week W10 (350 units)

**Following same logic:**
```
W10 sales (350 units)
  → W08 arrival (350)
  → W03 ship (350)
  → W02 factory ship (350)
  → 2025-W49 order (350)
```

### 4.4 Aggregation Example

**Week W06 receives contributions from multiple sales weeks:**

| Sales Week | Sales Qty | Arrival Week |
|------------|-----------|--------------|
| W08 | 380 | W06 (+380) |
| W09 | 400 | W07 (different week) |
| (Another demand) | 343 | W06 (+343) |

**Result:**
```
plannedArrivalMap["2026-W06"] = 380 + 343 = 723 units
```

### 4.5 Final Output Table (Selected Rows)

| Week | Sales | Order | Factory Ship | Ship | Arrival |
|------|-------|-------|--------------|------|---------|
| 2025-W47 | 0 / - / 0 | **380** / 0 / 380 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2025-W49 | 0 / - / 0 | **350** / 0 / 350 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2025-W52 | 0 / - / 0 | 0 / 0 / 0 | **380** / 0 / 380 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2026-W01 | 0 / - / 0 | 0 / 0 / 0 | 0 / 0 / 0 | **380** / 0 / 380 | 0 / 0 / 0 |
| 2026-W03 | 0 / - / 0 | 0 / 0 / 0 | 0 / 0 / 0 | **350** / 0 / 350 | 0 / 0 / 0 |
| 2026-W06 | 400 / 373 / 373 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | **723** / 800 / 800 |
| 2026-W08 | 380 / - / 380 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2026-W10 | 350 / - / 350 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

**Format:** `planned / actual / effective`

**Observation:**
- Week 2026-W06 shows actual arrival of 800 units vs planned 723 units
- This indicates we over-ordered (good for safety stock!)

---

## 5. Algorithm Complexity

### 5.1 Time Complexity

**Reverse Calculation Loop:**
```
O(n) where n = number of weeks (16)
```

**Accumulation in Map:**
```
O(1) per insertion (Map.set)
O(n) total for all weeks
```

**Total Complexity:**
```
O(n) = O(16) = Constant time for fixed 16-week window
```

### 5.2 Space Complexity

**Accumulation Maps:**
```
4 maps × 16 weeks = 64 entries max
O(n) = O(16) = Constant space
```

### 5.3 Performance Characteristics

| Operation | Time | Memory |
|-----------|------|--------|
| Reverse calculation | O(16) | O(64) |
| Weekly aggregation | O(shipments) | O(shipments) |
| Rolling inventory | O(16) | O(1) |
| **Total** | **O(n + m)** | **O(m)** |

Where:
- `n` = 16 weeks (constant)
- `m` = number of shipments/transactions for this SKU

**Expected Performance:**
- Typical SKU: ~50 transactions → <10ms calculation time
- High-volume SKU: ~500 transactions → <50ms calculation time

---

## 6. Validation Logic

### 6.1 Data Quality Checks

```typescript
// Check 1: Valid week format
if (!isValidWeekString(week_iso)) {
  throw new Error(`Invalid week format: ${week_iso}`)
}

// Check 2: Non-negative quantities
if (salesDemand < 0) {
  throw new Error(`Negative sales demand: ${salesDemand}`)
}

// Check 3: Lead time constraints
if (leadTimes.production_weeks < 1 || leadTimes.production_weeks > 52) {
  throw new Error(`Invalid production weeks: ${leadTimes.production_weeks}`)
}
```

### 6.2 Business Logic Validation

```typescript
// Validation 1: Safety stock coverage
if (closing_stock < safety_threshold) {
  stock_status = 'Risk'
}

// Validation 2: Stockout detection
if (closing_stock <= 0) {
  stock_status = 'Stockout'
}

// Validation 3: Effective value priority
arrival_effective = actual_arrival || planned_arrival
```

---

## 7. Algorithm Extensions (Future)

### 7.1 Multi-SKU Batch Processing

Process multiple SKUs in parallel:
```typescript
async function batchReverseCalculation(skus: string[]) {
  return Promise.all(skus.map(sku => fetchAlgorithmAuditV3(sku)))
}
```

### 7.2 Dynamic Lead Time Scenarios

Calculate multiple scenarios with different lead times:
```typescript
function calculateScenarios(sku: string, shippingWeekOptions: number[]) {
  return shippingWeekOptions.map(weeks =>
    fetchAlgorithmAuditV3(sku, weeks)
  )
}
```

### 7.3 Variance Alert Threshold

Flag weeks where actual deviates significantly from planned:
```typescript
function detectVariance(row: AlgorithmAuditRowV3, threshold: number = 0.2) {
  const variance = Math.abs(row.actual_arrival - row.planned_arrival)
  const variancePercent = variance / row.planned_arrival
  return variancePercent > threshold
}
```

---

## 8. Algorithm Comparison: V2 vs V3

| Aspect | V2 (Forward) | V3 (Reverse) |
|--------|--------------|--------------|
| **Calculation Direction** | Forward (order → arrival) | Reverse (sales → order) |
| **Purpose** | Forecasting inventory | Validating algorithm |
| **Planned Columns** | Based on PO planned dates | Calculated from sales demand |
| **Aggregation** | By shipment | By sales demand |
| **Primary Use Case** | "When will my order arrive?" | "When should I have ordered?" |
| **Validation Focus** | Shipment tracking | Algorithm accuracy |

---

## 9. Common Questions

### Q1: Why not just use PO planned dates?
**A:** Because PO planned dates may be wrong if the algorithm failed. V3 independently calculates what the dates *should be* based on sales demand, allowing us to identify algorithm errors.

### Q2: What if multiple sales demands map to the same week?
**A:** This is expected and correct! The algorithm accumulates all quantities, showing total procurement needed for that week.

### Q3: Can planned quantities be zero?
**A:** Yes. If no future sales demand maps back to a particular week, that week's planned columns will show 0.

### Q4: What if actual data exists but planned is 0?
**A:** This indicates unplanned procurement (e.g., emergency orders, safety stock buffers, or forecast errors).

### Q5: How do I interpret a week with planned > 0 but actual = 0?
**A:** This suggests an execution gap - the algorithm recommended procurement, but no actual order was placed. Investigate why!

---

## 10. References

### Related Algorithms
- Inventory Projection V1: See `src/lib/queries/inventory-projection.ts`
- Replenishment Suggestions: See `src/lib/queries/replenishment.ts`

### Date Utilities
- ISO Week Functions: See `src/lib/utils/date.ts`
- Week arithmetic: `addWeeksToWeekString()`, `parseWeekString()`

### Database Schema
- Sales forecasts: See `supabase/migrations/20250101_sales_forecasts.sql`
- Purchase orders: See `supabase/migrations/20250101_purchase_orders.sql`

---

## Appendix: Implementation Code Snippet

```typescript
// Core reverse calculation implementation
function calculateBacktrackTimeline(
  salesWeek: string,
  salesQuantity: number,
  leadTimes: SupplyChainLeadTimesV3,
  accumulationMaps: {
    order: Map<string, number>
    factoryShip: Map<string, number>
    ship: Map<string, number>
    arrival: Map<string, number>
  }
): void {
  // Calculate target weeks
  const arrivalWeek = addWeeksToWeekString(salesWeek, -leadTimes.safety_stock_weeks)
  if (!arrivalWeek) return

  const shipWeek = addWeeksToWeekString(arrivalWeek, -leadTimes.shipping_weeks)
  if (!shipWeek) return

  const factoryShipWeek = addWeeksToWeekString(shipWeek, -leadTimes.loading_weeks)
  if (!factoryShipWeek) return

  const orderWeek = addWeeksToWeekString(factoryShipWeek, -leadTimes.production_weeks)
  if (!orderWeek) return

  // Accumulate quantities
  accumulationMaps.arrival.set(
    arrivalWeek,
    (accumulationMaps.arrival.get(arrivalWeek) || 0) + salesQuantity
  )
  accumulationMaps.ship.set(
    shipWeek,
    (accumulationMaps.ship.get(shipWeek) || 0) + salesQuantity
  )
  accumulationMaps.factoryShip.set(
    factoryShipWeek,
    (accumulationMaps.factoryShip.get(factoryShipWeek) || 0) + salesQuantity
  )
  accumulationMaps.order.set(
    orderWeek,
    (accumulationMaps.order.get(orderWeek) || 0) + salesQuantity
  )
}
```

---

**Document Version:** 1.0
**Last Updated:** 2025-12-03
**Status:** Complete
