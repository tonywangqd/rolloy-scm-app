# Implementation Summary: Shipment Planned Week Feature

## Overview
Implemented the "剩余数量预计发运日期" (Remaining Quantity Planned Shipment Week) input functionality in the shipment creation page, following the design specification in `/specs/shipment-planned-date/design.md`.

## Modified File
- `/src/app/logistics/new/page.tsx`

## Changes Made

### 1. Updated Imports
Added necessary imports for the new functionality:
- `AlertCircle` and `Calendar` icons from `lucide-react`
- `getISOWeek`, `getISOWeekYear`, `addWeeks` from `date-fns`

### 2. Extended TypeScript Interface
Extended the `SelectedDelivery` interface to include:
```typescript
plannedWeekIso?: string // Planned shipment week for remaining quantity
```

### 3. Added Helper Functions

#### `handlePlannedWeekChange(deliveryId: string, weekIso: string)`
- Updates the planned shipment week for a specific delivery's remaining quantity
- Stores the ISO week string (e.g., "2025-W05") in the delivery state

#### `getNext12Weeks(): string[]`
- Generates an array of the next 12 weeks in ISO format
- Uses date-fns functions to calculate ISO week numbers
- Returns format: ["2025-W51", "2025-W52", "2026-W01", ...]

### 4. Added UI Component in Step 2

When a user inputs a shipped quantity that is less than the available unshipped quantity, the system now displays:

**Visual Design:**
- Amber-colored alert box (bg-amber-50, border-amber-200)
- Alert icon indicating remaining quantity
- Calendar icon next to the week selector
- Dropdown showing next 12 weeks in ISO format
- Confirmation text when a week is selected

**Functionality:**
- Only shows when `userShippedQty < unshipped_qty`
- Displays remaining quantity: `剩余 X 件未发运`
- Provides week selector with options from next 12 weeks
- Optional selection (user can skip if desired)
- Shows helper text "(用于库存预测)" when a week is selected

## User Experience Flow

1. User selects deliveries in Step 1
2. In Step 2, when entering shipped quantities:
   - If shipped quantity < available quantity
   - An amber alert box appears below the quantity input
   - Shows: "剩余 X 件未发运"
   - User can select a planned shipment week from dropdown
   - Week selection is optional

## Example Usage

**Scenario:**
- Delivery has 100 units available
- User ships 60 units
- System shows: "剩余 40 件未发运"
- User selects "2025-W05" as planned shipment week
- This data will be used for inventory projections

## Technical Notes

1. **Data Structure:**
   The `plannedWeekIso` field is stored in the `selectedDeliveries` Map state

2. **Validation:**
   No validation is currently enforced - the field is optional

3. **Integration:**
   This frontend component prepares the data structure. Backend integration (passing to Server Action) will be implemented in a subsequent phase

4. **Reference:**
   Pattern follows the procurement delivery system's remaining plan functionality in `/src/components/procurement/remaining-plan-section.tsx`

## Next Steps (Not Implemented)

1. Update the Server Action `createShipmentWithAllocations` to accept `plannedWeekIso` data
2. Create database migration for planned shipment records
3. Update RPC function to create planned shipment entries
4. Integrate with inventory projection algorithm

## Files to Review

- Main implementation: `/src/app/logistics/new/page.tsx` (lines 25, 42, 313-336, 797-829)
- Design spec: `/specs/shipment-planned-date/design.md`
- Reference implementation: `/src/components/procurement/remaining-plan-section.tsx`

## Testing Checklist

- [ ] UI displays correctly when remaining quantity exists
- [ ] UI hides when shipped qty equals available qty
- [ ] Dropdown shows correct 12-week range
- [ ] State updates correctly when week is selected
- [ ] Form can be submitted with or without planned week selection
- [ ] Draft save/restore includes plannedWeekIso field

---

**Implementation Date:** 2025-12-19
**Status:** Frontend Complete - Backend Integration Pending
