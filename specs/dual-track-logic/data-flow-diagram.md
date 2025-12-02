# Data Flow Diagram: Dual-Track System

**Document Version:** 1.0
**Date:** 2025-12-02
**Author:** Product Director
**Related:** `/Users/tony/Desktop/rolloy-scm/specs/dual-track-logic/requirements.md`

---

## 1. High-Level Supply Chain Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SUPPLY CHAIN STAGES                               │
└─────────────────────────────────────────────────────────────────────────┘

  [PO Created]          [Factory Handoff]      [Departure]        [Arrival]
       │                      │                    │                  │
       ▼                      ▼                    ▼                  ▼
  ┌─────────┐         ┌──────────────┐      ┌──────────┐       ┌──────────┐
  │   PO    │────────▶│  Production  │─────▶│ Shipment │──────▶│ Warehouse│
  │ Order   │         │  Delivery    │      │          │       │ Inventory│
  └─────────┘         └──────────────┘      └──────────┘       └──────────┘
       │                      │                    │                  │
       │                      │                    │                  │
  planned_dates         planned_dates        planned_dates      planned_dates
  actual_dates          actual_dates         actual_dates       actual_dates
       │                      │                    │                  │
       │                      │                    │                  │
       ▼                      ▼                    ▼                  ▼
  (No payment)          [Procurement           [Logistics         [Inventory
                         Payment               Payment             Update]
                         in 60 days]           in 30 days]
```

---

## 2. Data Relationship Diagram (Entity-Level)

```
┌────────────────────────────────────────────────────────────────────────┐
│                         ENTITY RELATIONSHIPS                            │
└────────────────────────────────────────────────────────────────────────┘

                    purchase_orders (PO)
                           │
                           │ po_id
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
    purchase_order_items     production_deliveries
         (PO Items)              (Factory Handoff)
                │                     │
                │ po_item_id          │ production_delivery_id
                │                     │ (nullable)
                └──────────┬──────────┤
                           ▼          │
                     shipments ◀──────┘
                    (Logistics)
                           │
                           │ shipment_id
                           ▼
                    shipment_items
                    (SKU + Qty)
                           │
                           └─────────────────┐
                                             ▼
                                      inventory_snapshots
                                      (Current Stock)
                                             │
                                             ▼
                                   v_inventory_projection_12weeks
                                   (Forward-Looking Forecast)


  LEGEND:
  ───────▶  One-to-Many relationship
  ◀────────  Optional foreign key (nullable)
```

---

## 3. Dual-Track Date Flow (Progressive Realization)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  PLANNED vs ACTUAL DATE PROGRESSION                      │
└─────────────────────────────────────────────────────────────────────────┘

  TIME ──────────────────────────────────────────────────────────────▶

  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
  │   T = 0      │      │  T = Handoff │      │ T = Arrival  │
  │  PO Created  │      │  (Delivery)  │      │ (Warehouse)  │
  └──────────────┘      └──────────────┘      └──────────────┘
         │                      │                      │
         │                      │                      │
  ┌──────▼──────────────────────▼──────────────────────▼──────┐
  │                 PRODUCTION DELIVERY                        │
  │                                                             │
  │  planned_delivery_date: 2025-02-15  (entered at T=0)      │
  │  actual_delivery_date:  NULL        (future event)         │
  │                                                             │
  │  [Used for calculations: planned_delivery_date]            │
  │  [Payment status: "Pending"]                               │
  └─────────────────────────────────────────────────────────────┘
                             │
                   T = 2025-02-18 (actual handoff occurs)
                             │
  ┌──────────────────────────▼──────────────────────────────────┐
  │                 PRODUCTION DELIVERY                         │
  │                                                              │
  │  planned_delivery_date: 2025-02-15  (historical reference)  │
  │  actual_delivery_date:  2025-02-18  (3-day delay recorded) │
  │                                                              │
  │  [Used for calculations: actual_delivery_date]              │
  │  [Payment due: 2025-04-30 (60 days from 2025-02-18)]       │
  │  [Payment status: "Scheduled"]                              │
  └──────────────────────────────────────────────────────────────┘


  ┌──────▼──────────────────────▼──────────────────────▼──────┐
  │                     SHIPMENT                               │
  │                                                             │
  │  planned_departure_date: 2025-02-20  (entered at T=0)     │
  │  actual_departure_date:  NULL        (future event)        │
  │  planned_arrival_date:   2025-03-05  (calculated)         │
  │  actual_arrival_date:    NULL        (future event)        │
  │                                                             │
  │  [Inventory projection uses: planned_arrival_date]         │
  │  [Payment status: "Pending"]                               │
  └─────────────────────────────────────────────────────────────┘
                             │
                   T = 2025-03-02 (goods arrive early!)
                             │
  ┌──────────────────────────▼──────────────────────────────────┐
  │                     SHIPMENT                                │
  │                                                              │
  │  planned_departure_date: 2025-02-20  (reference)            │
  │  actual_departure_date:  2025-02-22  (2-day delay)         │
  │  planned_arrival_date:   2025-03-05  (reference)           │
  │  actual_arrival_date:    2025-03-02  (3-day early!)        │
  │                                                              │
  │  [Inventory projection uses: actual_arrival_date = 2025-03-02] │
  │  [Incoming qty moved from Week 10 to Week 9]                │
  │  [Payment due: 2025-04-15 (arrived before 15th)]           │
  │  [Payment status: "Scheduled"]                              │
  └──────────────────────────────────────────────────────────────┘
```

---

## 4. Inventory Projection Calculation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│          INVENTORY PROJECTION (12-WEEK ROLLING WINDOW)                  │
└─────────────────────────────────────────────────────────────────────────┘

  INPUT SOURCES:
  ┌───────────────────┐  ┌────────────────────┐  ┌─────────────────────┐
  │ inventory_        │  │ sales_forecasts    │  │ shipments +         │
  │ snapshots         │  │ + sales_actuals    │  │ shipment_items      │
  │                   │  │                    │  │                     │
  │ Current Stock:    │  │ Forecast: 500/wk   │  │ Tracking: TRK001    │
  │ SKU001 = 2000     │  │ Actual W49: 480    │  │ SKU001: 1000 units  │
  └─────────┬─────────┘  └──────────┬─────────┘  │ Arrival: 2025-W50   │
            │                       │             └──────────┬──────────┘
            │                       │                        │
            └───────────────────────┴────────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │  CALCULATION LOGIC   │
                        │  (SQL View)          │
                        └──────────┬───────────┘
                                   │
                                   ▼
         ┌────────────────────────────────────────────────────────┐
         │          WEEK-BY-WEEK PROJECTION GRID                  │
         └────────────────────────────────────────────────────────┘

  Week    │ Opening │ Incoming │ Effective │ Closing │ Status
  ISO     │ Stock   │ Qty      │ Sales     │ Stock   │
  ────────┼─────────┼──────────┼───────────┼─────────┼─────────
  2025-W49│  2000   │    0     │   480     │  1520   │  OK
          │         │          │ (actual)  │         │
  ────────┼─────────┼──────────┼───────────┼─────────┼─────────
  2025-W50│  1520   │  1000    │   500     │  2020   │  OK
          │(prev)   │ (TRK001) │ (forecast)│         │
  ────────┼─────────┼──────────┼───────────┼─────────┼─────────
  2025-W51│  2020   │    0     │   500     │  1520   │  OK
          │(prev)   │          │ (forecast)│         │
  ────────┼─────────┼──────────┼───────────┼─────────┼─────────
  2025-W52│  1520   │    0     │   500     │  1020   │  OK
          │(prev)   │          │ (forecast)│         │
  ────────┼─────────┼──────────┼───────────┼─────────┼─────────
  2026-W01│  1020   │    0     │   500     │   520   │  Risk
          │(prev)   │          │ (forecast)│         │ (<600)
  ────────┼─────────┼──────────┼───────────┼─────────┼─────────
  2026-W02│   520   │    0     │   500     │    20   │  Risk
          │(prev)   │          │ (forecast)│         │
  ────────┼─────────┼──────────┼───────────┼─────────┼─────────
  2026-W03│    20   │    0     │   500     │  -480   │ Stockout
          │(prev)   │          │ (forecast)│         │ (< 0)
  ────────┴─────────┴──────────┴───────────┴─────────┴─────────

  FORMULA:
  ┌─────────────────────────────────────────────────────────────┐
  │ Closing Stock[W] = Opening Stock[W]                         │
  │                  + Incoming[W]                               │
  │                  - Effective Sales[W]                        │
  │                                                              │
  │ Where:                                                       │
  │   Opening Stock[W] = Closing Stock[W-1]                     │
  │   Effective Sales[W] = COALESCE(actual_qty, forecast_qty)   │
  │   Incoming[W] = SUM(shipped_qty WHERE arrival_week = W)     │
  └─────────────────────────────────────────────────────────────┘
```

---

## 5. Payment Calculation Flow

### 5.1 Procurement Payment (from Production Delivery)

```
┌────────────────────────────────────────────────────────────────────┐
│                    PROCUREMENT PAYMENT LOGIC                        │
└────────────────────────────────────────────────────────────────────┘

  INPUT:
  ┌──────────────────────────────────┐
  │ production_deliveries            │
  │                                  │
  │ delivery_number: DEL-20250115-001│
  │ actual_delivery_date: 2025-01-15 │  ◀── (If NULL, use planned)
  │ delivered_qty: 1000              │
  │ unit_cost_usd: 25.50             │
  └────────────┬─────────────────────┘
               │
               ▼
  ┌────────────────────────────────────┐
  │ STEP 1: Calculate Total Value      │
  │                                    │
  │ total_value_usd = delivered_qty    │
  │                 × unit_cost_usd    │
  │                = 1000 × 25.50      │
  │                = $25,500           │
  └────────────┬───────────────────────┘
               │
               ▼
  ┌────────────────────────────────────┐
  │ STEP 2: Determine Delivery Month   │
  │                                    │
  │ delivery_month =                   │
  │   DATE_TRUNC('month',              │
  │     COALESCE(actual_delivery_date, │
  │              planned_delivery_date)│
  │   )                                │
  │ = DATE_TRUNC('month', 2025-01-15)  │
  │ = 2025-01-01                       │
  └────────────┬───────────────────────┘
               │
               ▼
  ┌────────────────────────────────────┐
  │ STEP 3: Add 60 Days (2 months)     │
  │                                    │
  │ payment_due_month =                │
  │   delivery_month + 2 months        │
  │ = 2025-01-01 + 2 months            │
  │ = 2025-03-01                       │
  └────────────┬───────────────────────┘
               │
               ▼
  ┌────────────────────────────────────┐
  │ STEP 4: Get Last Day of Month      │
  │                                    │
  │ payment_due_date =                 │
  │   LAST_DAY(2025-03-01)             │
  │ = 2025-03-31                       │
  └────────────┬───────────────────────┘
               │
               ▼
  OUTPUT:
  ┌──────────────────────────────────┐
  │ Payable Record:                  │
  │                                  │
  │ Amount: $25,500                  │
  │ Payment Due: 2025-03-31          │
  │ Payment Month: 2025-03           │
  │ Status: "Scheduled"              │
  └──────────────────────────────────┘


  EXAMPLE SCENARIOS:
  ┌───────────────┬──────────────┬─────────────────┬──────────────┐
  │ Delivery Date │ +2 Months    │ Last Day        │ Payment Due  │
  ├───────────────┼──────────────┼─────────────────┼──────────────┤
  │ 2025-01-05    │ 2025-03-01   │ 2025-03-31      │ 2025-03-31   │
  │ 2025-01-31    │ 2025-03-01   │ 2025-03-31      │ 2025-03-31   │
  │ 2025-02-15    │ 2025-04-01   │ 2025-04-30      │ 2025-04-30   │
  │ 2025-12-20    │ 2026-02-01   │ 2026-02-28      │ 2026-02-28   │
  └───────────────┴──────────────┴─────────────────┴──────────────┘
```

---

### 5.2 Logistics Payment (from Shipment)

```
┌────────────────────────────────────────────────────────────────────┐
│                     LOGISTICS PAYMENT LOGIC                         │
└────────────────────────────────────────────────────────────────────┘

  INPUT:
  ┌──────────────────────────────────┐
  │ shipments                        │
  │                                  │
  │ tracking_number: TRK-2025-001    │
  │ actual_arrival_date: 2025-01-10  │  ◀── (If NULL, use planned)
  │ weight_kg: 500                   │
  │ cost_per_kg_usd: 3.50            │
  │ surcharge_usd: 200               │
  │ tax_refund_usd: 50               │
  └────────────┬─────────────────────┘
               │
               ▼
  ┌────────────────────────────────────┐
  │ STEP 1: Calculate Total Cost       │
  │                                    │
  │ freight_cost = weight_kg           │
  │              × cost_per_kg_usd     │
  │              = 500 × 3.50          │
  │              = $1,750              │
  │                                    │
  │ total_cost = freight_cost          │
  │            + surcharge_usd         │
  │            - tax_refund_usd        │
  │            = 1750 + 200 - 50       │
  │            = $1,900                │
  └────────────┬───────────────────────┘
               │
               ▼
  ┌────────────────────────────────────┐
  │ STEP 2: Extract Arrival Day        │
  │                                    │
  │ effective_arrival_date =           │
  │   COALESCE(actual_arrival_date,    │
  │            planned_arrival_date)   │
  │ = 2025-01-10                       │
  │                                    │
  │ arrival_day =                      │
  │   EXTRACT(DAY FROM 2025-01-10)     │
  │ = 10                               │
  └────────────┬───────────────────────┘
               │
               ▼
  ┌────────────────────────────────────┐
  │ STEP 3: Determine Payment Rule     │
  │                                    │
  │ IF arrival_day <= 15:              │
  │   payment_due =                    │
  │     Next Month, 15th               │
  │ ELSE:                              │
  │   payment_due =                    │
  │     Next Month, Last Day           │
  └────────────┬───────────────────────┘
               │
               ▼ (arrival_day = 10, so <= 15)
  ┌────────────────────────────────────┐
  │ STEP 4: Calculate Payment Date     │
  │                                    │
  │ payment_due_date =                 │
  │   DATE_TRUNC('month', 2025-01-10)  │
  │   + 1 month                        │
  │   + 14 days                        │
  │ = 2025-01-01 + 1 month + 14 days   │
  │ = 2025-02-15                       │
  └────────────┬───────────────────────┘
               │
               ▼
  OUTPUT:
  ┌──────────────────────────────────┐
  │ Payable Record:                  │
  │                                  │
  │ Amount: $1,900                   │
  │ Payment Due: 2025-02-15          │
  │ Payment Month: 2025-02           │
  │ Status: "Scheduled"              │
  └──────────────────────────────────┘


  EXAMPLE SCENARIOS:
  ┌───────────────┬────────────┬─────────────────┬──────────────┐
  │ Arrival Date  │ Day of Mo. │ Payment Rule    │ Payment Due  │
  ├───────────────┼────────────┼─────────────────┼──────────────┤
  │ 2025-01-10    │ 10 (≤15)   │ Next Mo. 15th   │ 2025-02-15   │
  │ 2025-01-15    │ 15 (≤15)   │ Next Mo. 15th   │ 2025-02-15   │  ◀── Boundary
  │ 2025-01-16    │ 16 (>15)   │ Next Mo. Last   │ 2025-02-28   │
  │ 2025-01-25    │ 25 (>15)   │ Next Mo. Last   │ 2025-02-28   │
  │ 2025-02-08    │  8 (≤15)   │ Next Mo. 15th   │ 2025-03-15   │
  │ 2025-02-20    │ 20 (>15)   │ Next Mo. Last   │ 2025-03-31   │
  └───────────────┴────────────┴─────────────────┴──────────────┘
```

---

## 6. System State Machine

```
┌────────────────────────────────────────────────────────────────────┐
│             SHIPMENT STATE TRANSITIONS                              │
└────────────────────────────────────────────────────────────────────┘

  Initial State:  PLANNED
  ┌──────────────────────────────────────┐
  │ planned_arrival_date: SET            │
  │ actual_arrival_date: NULL            │
  │ payment_status: "Pending"            │
  └─────────────┬────────────────────────┘
                │
                │ EVENT: Goods Depart
                │ ACTION: Set actual_departure_date
                │
                ▼
  ┌──────────────────────────────────────┐
  │          IN TRANSIT                  │
  │ actual_departure_date: SET           │
  │ actual_arrival_date: NULL            │
  │ payment_status: "Pending"            │
  └─────────────┬────────────────────────┘
                │
                │ EVENT: Goods Arrive
                │ ACTION: Set actual_arrival_date
                │         Refresh inventory_projections
                │         Calculate payment_due_date
                │
                ▼
  ┌──────────────────────────────────────┐
  │          ARRIVED                     │
  │ actual_arrival_date: SET             │
  │ payment_due_date: CALCULATED         │
  │ payment_status: "Scheduled"          │
  └─────────────┬────────────────────────┘
                │
                │ EVENT: Payment Due Date Passes
                │ ACTION: Update payment_status
                │
                ▼
  ┌──────────────────────────────────────┐
  │          PAYMENT DUE                 │
  │ payment_status: "Due"                │
  │ (Awaiting finance team action)       │
  └─────────────┬────────────────────────┘
                │
                │ EVENT: Payment Processed
                │ ACTION: Mark as "Paid"
                │
                ▼
  ┌──────────────────────────────────────┐
  │          COMPLETED                   │
  │ payment_status: "Paid"               │
  │ (End state - archived)               │
  └──────────────────────────────────────┘


  PARALLEL STATE: DELAY TRACKING
  ┌────────────────────────────────────────────────────────────┐
  │ If actual_arrival_date > planned_arrival_date:             │
  │   - Calculate delay_days = actual - planned                │
  │   - Flag shipment as "Delayed"                             │
  │   - Trigger alert if delay > 7 days                        │
  │   - Update supplier performance metrics                    │
  └────────────────────────────────────────────────────────────┘
```

---

## 7. Dashboard Data Aggregation Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                DASHBOARD: FINANCIAL OVERVIEW (资金管理)             │
└────────────────────────────────────────────────────────────────────┘

  RAW DATA SOURCES:
  ┌───────────────────────┐        ┌─────────────────────┐
  │ production_deliveries │        │ shipments           │
  │                       │        │                     │
  │ - actual_delivery_date│        │ - actual_arrival_date│
  │ - total_value_usd     │        │ - total_cost_usd    │
  │ - payment_due_date    │        │ - payment_due_date  │
  │ - payment_status      │        │ - payment_status    │
  └───────────┬───────────┘        └──────────┬──────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │ AGGREGATION LOGIC     │
                  │ (SQL View)            │
                  │                       │
                  │ GROUP BY:             │
                  │   payment_month       │
                  │   payable_type        │
                  │                       │
                  │ METRICS:              │
                  │   SUM(amount_usd)     │
                  │   COUNT(*)            │
                  └───────────┬───────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  v_pending_payables (VIEW)    │
              ├───────────────────────────────┤
              │ payment_month │ payable_type │
              │ total_amount  │ record_count │
              ├───────────────────────────────┤
              │ 2025-02       │ Procurement  │
              │ $125,000      │ 5            │
              ├───────────────────────────────┤
              │ 2025-02       │ Logistics    │
              │ $18,500       │ 8            │
              ├───────────────────────────────┤
              │ 2025-03       │ Procurement  │
              │ $200,000      │ 12           │
              └───────────────┬───────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │ FRONTEND COMPONENT    │
                  │                       │
                  │ <BarChart>            │
                  │   X-axis: Month       │
                  │   Y-axis: Amount USD  │
                  │   Stacked: Type       │
                  │ </BarChart>           │
                  │                       │
                  │ <DataTable>           │
                  │   Filter: Status      │
                  │   Sort: Due Date      │
                  │ </DataTable>          │
                  └───────────────────────┘
```

---

## 8. Error Handling & Data Quality Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                  DATA VALIDATION PIPELINE                           │
└────────────────────────────────────────────────────────────────────┘

  USER INPUT:
  ┌──────────────────────────┐
  │ Shipment Form Submission │
  │                          │
  │ actual_arrival_date:     │
  │   "2025-01-10"           │
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────────┐
  │ VALIDATION LAYER 1:          │
  │ Frontend (Zod Schema)        │
  │                              │
  │ ✓ Date format valid?         │
  │ ✓ Date not in future?        │
  │ ✓ Date not too far in past?  │
  └──────────┬───────────────────┘
             │ PASS
             ▼
  ┌──────────────────────────────┐
  │ VALIDATION LAYER 2:          │
  │ Server Action (TypeScript)   │
  │                              │
  │ ✓ User authenticated?        │
  │ ✓ RLS policies pass?         │
  │ ✓ Warehouse exists?          │
  └──────────┬───────────────────┘
             │ PASS
             ▼
  ┌──────────────────────────────┐
  │ VALIDATION LAYER 3:          │
  │ Database Constraints         │
  │                              │
  │ ✓ Foreign key valid?         │
  │ ✓ Check constraint (dates)?  │
  │ ✓ Unique constraint?         │
  └──────────┬───────────────────┘
             │ PASS
             ▼
  ┌──────────────────────────────┐
  │ DATABASE WRITE               │
  │ Shipment record updated      │
  └──────────┬───────────────────┘
             │
             ▼
  ┌──────────────────────────────┐
  │ TRIGGER: After Update        │
  │                              │
  │ 1. Audit log entry created   │
  │ 2. Payment date recalculated │
  │ 3. Inventory projection      │
  │    refresh scheduled         │
  └──────────┬───────────────────┘
             │
             ▼
  ┌──────────────────────────────┐
  │ SUCCESS RESPONSE             │
  │                              │
  │ { success: true,             │
  │   data: { shipment_id },     │
  │   message: "Updated" }       │
  └──────────────────────────────┘


  ERROR PATH:
  ┌──────────────────────────────┐
  │ FAIL at any layer            │
  └──────────┬───────────────────┘
             │
             ▼
  ┌──────────────────────────────┐
  │ ERROR RESPONSE               │
  │                              │
  │ { success: false,            │
  │   error: "Description",      │
  │   field: "arrival_date" }    │
  └──────────┬───────────────────┘
             │
             ▼
  ┌──────────────────────────────┐
  │ FRONTEND: Display Error      │
  │ - Toast notification         │
  │ - Field highlight            │
  │ - Rollback optimistic update │
  └──────────────────────────────┘
```

---

## 9. Temporal Consistency Model

```
┌────────────────────────────────────────────────────────────────────┐
│          HOW SYSTEM HANDLES "TIME TRAVEL" UPDATES                   │
└────────────────────────────────────────────────────────────────────┘

  SCENARIO: User updates actual_arrival_date AFTER initial projection

  T = Week 0 (Current Week: 2025-W06)
  ┌──────────────────────────────────────────────────────────┐
  │ INITIAL STATE:                                           │
  │ Shipment TRK001:                                         │
  │   - planned_arrival_date: 2025-02-20 (Week 8)           │
  │   - actual_arrival_date: NULL                            │
  │                                                          │
  │ Inventory Projection:                                    │
  │   Week 8: incoming_qty = 1000 (based on planned date)   │
  └──────────────────────────────────────────────────────────┘

  T = Week 9 (User realizes goods arrived early)
  ┌──────────────────────────────────────────────────────────┐
  │ USER ACTION:                                             │
  │ Update actual_arrival_date to 2025-02-10 (Week 7)       │
  │                                                          │
  │ SYSTEM RESPONSE:                                         │
  │ 1. Audit log: Record change (old: NULL, new: 2025-02-10)│
  │ 2. Calculate new payment_due_date                       │
  │ 3. Queue inventory projection refresh                   │
  └────────────┬─────────────────────────────────────────────┘
               │
               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ REFRESH MATERIALIZED VIEW:                               │
  │ REFRESH MATERIALIZED VIEW CONCURRENTLY                   │
  │   v_inventory_projection_12weeks;                        │
  │                                                          │
  │ NEW STATE:                                               │
  │   Week 7: incoming_qty = 1000 (moved from Week 8)       │
  │   Week 8: incoming_qty = 0                               │
  │                                                          │
  │ CASCADING EFFECTS:                                       │
  │   - Closing stock for Week 7 increases                  │
  │   - Closing stock for Week 8-11 recalculated            │
  │   - Stock status may change from "Risk" to "OK"         │
  └──────────────────────────────────────────────────────────┘

  HISTORICAL INTEGRITY:
  ┌──────────────────────────────────────────────────────────┐
  │ Week 0-6 (Past weeks):                                   │
  │   - NOT recalculated                                     │
  │   - Historical snapshots preserved                       │
  │   - Audit trail shows original projections vs actuals    │
  │                                                          │
  │ Week 7-11 (Future weeks):                                │
  │   - Recalculated with new arrival date                   │
  │   - Users see updated projections immediately           │
  └──────────────────────────────────────────────────────────┘
```

---

## 10. Glossary of Symbols

| Symbol | Meaning |
|--------|---------|
| `──▶`  | Data flow direction |
| `◀──`  | Reverse reference / Nullable FK |
| `┌─┐`  | Container / Entity boundary |
| `[W]`  | Week variable (e.g., Week 10) |
| `NULL` | Database null value (no data yet) |
| `✓`    | Validation check / Requirement met |
| `▼`    | Process flow continuation |
| `T =`  | Time point (timeline marker) |

---

**Navigation:**
- **Requirements Doc:** `/Users/tony/Desktop/rolloy-scm/specs/dual-track-logic/requirements.md`
- **Next Step:** System Architect creates `design.md` with SQL schema and migration plan
