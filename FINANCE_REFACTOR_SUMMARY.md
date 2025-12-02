# Finance Module Refactor Summary

## Overview
Successfully refactored the finance module to split procurement (USD) and logistics (CNY) payments into separate tabs with proper payment term calculations and batch payment functionality.

## Changes Made

### 1. Date Utility Functions (`src/lib/utils.ts`)
Added payment date calculation functions:
- `getLastBusinessDay(date)`: Finds the last business day of a month (excluding weekends)
- `getProcurementPaymentDate(deliveryDate)`: Calculates payment date for procurement (delivery + 2 months, on last business day)
- `getLogisticsPaymentDate(arrivalDate)`: Calculates payment date for logistics based on half-month rules:
  - Arrival day <= 15: Payment on 15th of next month
  - Arrival day > 15: Payment on last business day of next month

### 2. Query Functions (`src/lib/queries/finance.ts`)
Completely rewrote the finance queries module:
- **`fetchProcurementPayments()`**: Fetches procurement payments from `production_deliveries` table
  - Joins with `purchase_order_items` -> `purchase_orders` -> `suppliers`
  - Groups by payment month (YYYY-MM format)
  - Shows PO number and supplier name
  - Payment terms: 60 days (2 months) after delivery

- **`fetchLogisticsPayments()`**: Fetches logistics payments from `shipments` table
  - Groups by payment period (YYYY-MM上/下 format for first/second half of month)
  - Shows amounts in both CNY and USD (exchange rate: 1 USD = 7.2 CNY)
  - Payment terms: Based on arrival date (15th or last business day of next month)

- **`fetchPaymentSummary()`**: Returns summary statistics
  - `procurement_pending_usd`: Total pending procurement payments
  - `logistics_pending_usd`: Total pending logistics payments in USD
  - `logistics_pending_cny`: Total pending logistics payments in CNY
  - `next_month_due_usd`: Payments due next month
  - `overdue_amount_usd`: Overdue payments

### 3. Action Functions (`src/lib/actions/finance.ts`)
Rewrote server actions with batch payment functionality:
- **`updateProcurementPaymentStatus(id, status)`**: Update single procurement payment
- **`updateLogisticsPaymentStatus(id, status)`**: Update single logistics payment
- **`batchMarkProcurementPaid(deliveryNumbers)`**: Batch mark procurement payments as paid
  - Accepts newline, comma, or space-separated delivery numbers
  - Returns success count and list of not-found numbers
- **`batchMarkLogisticsPaid(trackingNumbers)`**: Batch mark logistics payments as paid
  - Same parsing logic as procurement

### 4. Client Components

#### `src/components/finance/batch-payment-form.tsx`
- Client component for batch payment marking
- Textarea for pasting multiple reference numbers
- Real-time feedback on success/failure
- Shows count of updated records and any not-found numbers

#### `src/components/finance/finance-tabs.tsx`
- Client wrapper for controlled Tabs component
- Separate tabs for procurement and logistics
- Each tab includes:
  - Batch payment form at the top
  - Grouped payment records (by month for procurement, by period for logistics)
  - Detailed tables with all relevant information

### 5. Main Page (`src/app/finance/page.tsx`)
- Server component that fetches data
- Summary cards showing:
  - Total pending amount (USD)
  - Procurement pending (USD)
  - Logistics pending (CNY)
  - Next month due
  - Overdue amount
- Renders `FinanceTabs` client component with data

## Data Structure

### Procurement Payment Table Columns:
- 交货单号 (Delivery Number)
- PO号 (PO Number)
- 供应商 (Supplier Name)
- 交货日期 (Delivery Date)
- 付款日期 (Payment Date)
- 金额 (USD)
- 状态 (Status: Pending/Scheduled/Paid)

### Logistics Payment Table Columns:
- 运单号 (Tracking Number)
- 到货日期 (Arrival Date)
- 付款日期 (Payment Date)
- 金额 (CNY)
- 金额 (USD)
- 状态 (Status: Pending/Scheduled/Paid)

## Payment Logic

### Procurement (USD):
```
Payment Month = Delivery Month + 2 months
Payment Date = Last business day of Payment Month
```

Example: Delivery on 2025-01-15 → Payment on 2025-03-31 (or 03-28 if 31st is weekend)

### Logistics (CNY):
```
If Arrival Day <= 15:
  Payment Date = 15th of Next Month
Else:
  Payment Date = Last business day of Next Month
```

Examples:
- Arrival on 2025-01-10 → Payment on 2025-02-15
- Arrival on 2025-01-20 → Payment on 2025-02-28 (or 02-28 if last business day)

## Exchange Rate
- Hardcoded: 1 USD = 7.2 CNY
- Used for logistics payment display (stored in USD, shown in CNY)

## Batch Payment Feature
Users can paste multiple reference numbers (delivery numbers or tracking numbers) in the batch payment form:
```
DEL-2025-001
DEL-2025-002
DEL-2025-003
```

The system will:
1. Parse the input (supports newline, comma, or space separation)
2. Find matching records in the database
3. Update all found records to "Paid" status
4. Show success count and list any not-found numbers
5. Auto-refresh the page data

## Files Modified
1. `/src/lib/utils.ts` - Added date calculation functions
2. `/src/lib/queries/finance.ts` - Completely rewritten
3. `/src/lib/actions/finance.ts` - Completely rewritten
4. `/src/app/finance/page.tsx` - Completely rewritten
5. `/src/components/finance/batch-payment-form.tsx` - New file
6. `/src/components/finance/finance-tabs.tsx` - New file

## Testing Checklist
- [ ] Verify procurement payments show correct PO and supplier info
- [ ] Verify logistics payments show correct CNY amounts
- [ ] Test payment date calculations for edge cases (month-end, weekends)
- [ ] Test batch payment with valid delivery/tracking numbers
- [ ] Test batch payment with invalid numbers (should show not-found list)
- [ ] Test batch payment with mixed valid/invalid numbers
- [ ] Verify summary cards show correct totals
- [ ] Verify tab switching works properly
- [ ] Test with empty data (no pending payments)
- [ ] Verify overdue calculations are correct

## Next Steps (Optional Enhancements)
1. Make USD to CNY exchange rate configurable (database setting)
2. Add payment date picker to manually adjust due dates
3. Add export functionality (CSV/Excel) for payment records
4. Add payment history view (already paid items)
5. Add email notifications for upcoming payments
6. Add payment reminder system based on due dates
7. Integrate with actual payment systems (bank APIs)
