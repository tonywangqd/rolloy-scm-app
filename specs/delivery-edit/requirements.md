# Production Delivery Edit - Requirements Specification

## Document Metadata
- **Feature:** Production Delivery Record Edit/Adjustment Page
- **Role:** Product Director
- **Date:** 2025-12-05
- **Status:** Requirements Draft
- **Priority:** P1 (Core CRUD Operation Gap)
- **Related Pages:**
  - List: `/procurement`
  - Detail: `/procurement/[id]`
  - PO Edit: `/procurement/[id]/edit`
  - Delivery Create: `/procurement/deliveries/new`
  - **Missing:** Delivery Edit (this spec)

---

## 1. Executive Summary

### 1.1 Current State

**Existing Delivery Management Capabilities:**
- ✅ Create new delivery records: `/procurement/deliveries/new`
  - User selects PO, enters delivery quantities, delivery date, remarks
  - System validates delivery qty ≤ remaining qty
  - Creates records in `production_deliveries` table
- ✅ View delivery records: `/procurement/[id]` (detail page)
  - Displays delivery records table with delivery_number, SKU, qty, date, payment status
  - Read-only view, no edit capability

**Critical Gap:**
- ❌ NO way to edit/adjust existing delivery records
- ❌ NO way to correct data entry errors
- ❌ NO way to adjust quantities after factory changes delivery amount
- ❌ NO audit trail for delivery modifications

### 1.2 Business Impact of Missing Edit Functionality

**Real-World Scenarios Requiring Edits:**

1. **Data Entry Error:**
   - User enters 500 units, factory actually delivered 50
   - Current workaround: Delete record + recreate (loses history)

2. **Factory Partial Delivery:**
   - Initial delivery record: 1,000 units
   - Factory only delivered 800 units due to quality issues
   - Need to adjust quantity + add remarks

3. **Date Correction:**
   - Delivery recorded as 2025-02-10
   - Actual delivery was 2025-02-15 (invoice proves it)
   - Payment due date calculation is wrong

4. **Cost Adjustment:**
   - Unit cost initially $10.50
   - Supplier invoice shows $10.80 (price increase)
   - Need to update unit_cost_usd for accurate financial reporting

5. **Payment Status Update:**
   - Delivery marked as "Pending"
   - Payment made, need to update to "Paid"
   - Current workaround: SQL update in Supabase UI (not audited)

**Business Consequences:**
- Financial inaccuracy: Wrong payables calculations
- Inventory errors: Overstated stock levels if delivery qty was wrong
- Audit compliance: Cannot prove who changed what and when
- User frustration: Manual database edits require dev/admin access

### 1.3 Proposed Solution

**Delivery Edit Page: `/procurement/deliveries/[id]/edit`**

**Core Capabilities:**
1. Load existing delivery record by ID
2. Allow editing of: delivered_qty, actual_delivery_date, unit_cost_usd, payment_status, remarks
3. Validate business rules (e.g., new qty ≤ PO remaining + current qty)
4. Save changes to database
5. Log edit history (who, when, what changed)
6. Redirect to PO detail page after save

**Expected Business Value:**
- Eliminate manual SQL edits (reduce security risk)
- Enable self-service correction (reduce support tickets by 80%)
- Improve data accuracy (reduce financial discrepancies by 50%)
- Maintain audit trail (meet SOX compliance requirements)

---

## 2. User Stories

### Primary User Story

**As a** Procurement Manager
**I want to** edit existing delivery records when errors occur or information changes
**So that** I can maintain accurate delivery and payment data without requiring database admin access

### Secondary User Stories

**UC-1: Correct Quantity Error**
- **As a** Data Entry Clerk
- **I want to** change the delivered_qty from 500 to 50
- **So that** inventory calculations and payment amounts are correct

**UC-2: Update Delivery Date**
- **As a** Finance Officer
- **I want to** change the actual_delivery_date from 2025-02-10 to 2025-02-15
- **So that** the payment due date (60 days after delivery) is calculated correctly

**UC-3: Adjust Unit Cost**
- **As a** Procurement Analyst
- **I want to** update the unit_cost_usd from $10.50 to $10.80
- **So that** the total payable amount matches the supplier invoice

**UC-4: Update Payment Status**
- **As a** Finance Manager
- **I want to** change payment_status from "Pending" to "Paid" after payment is made
- **So that** the payables report accurately reflects outstanding obligations

**UC-5: Add Correction Note**
- **As a** Operations Manager
- **I want to** add remarks explaining why the delivery quantity was adjusted
- **So that** future auditors understand the context of the change

**UC-6: View Edit History**
- **As a** Supply Chain Director
- **I want to** see who edited this delivery record and when
- **So that** I can trace accountability for data changes

---

## 3. Functional Requirements

### 3.1 Page Access & Routing

**FR-1: URL Pattern**
- Edit page URL: `/procurement/deliveries/[id]/edit`
- `[id]` is the `production_deliveries.id` (UUID)
- Example: `/procurement/deliveries/550e8400-e29b-41d4-a716-446655440000/edit`

**FR-2: Access Points**
- From PO detail page `/procurement/[po_id]`:
  - Add "Edit" icon/button in each delivery record row in Delivery Records table
  - Clicking "Edit" navigates to `/procurement/deliveries/[delivery_id]/edit`
- From delivery list (if future feature adds dedicated delivery list page)

**FR-3: Authorization**
- Only users with role `procurement_manager` or `admin` can access edit page
- Unauthorized users see 403 Forbidden or redirect to `/procurement`

### 3.2 Data Loading

**FR-4: Fetch Delivery Record**
- On page load, fetch delivery record by ID from `production_deliveries` table
- Include related data:
  - PO number (from `purchase_orders` via `po_id`)
  - SKU (from delivery record)
  - Channel code (from delivery record)
  - Original PO item: ordered_qty, delivered_qty (from `purchase_order_items`)
- If delivery ID not found, show 404 page

**FR-5: Display Current Values**
- Pre-populate form fields with current values:
  - Delivery Number (read-only, display only)
  - PO Number (read-only, display only)
  - SKU (read-only, display only)
  - Channel Code (read-only, display only)
  - Delivered Qty (editable)
  - Actual Delivery Date (editable)
  - Unit Cost USD (editable)
  - Payment Status (editable dropdown)
  - Remarks (editable textarea)

### 3.3 Editable Fields

**FR-6: Delivered Quantity (delivered_qty)**
- **Type:** Number input
- **Validation:**
  - Must be > 0
  - Must be ≤ (PO ordered_qty - other_deliveries_qty)
    - Other deliveries qty = SUM(delivered_qty) for same PO item, excluding current record
  - Example: PO item ordered 1000, other deliveries = 300, current delivery = 500
    - Max allowed new value = 1000 - 300 = 700
    - User can increase to 700 or decrease to 1
- **Error Message:** "交付数量不能超过订单剩余量。当前订单量: {ordered_qty}, 其他交付: {other_deliveries_qty}, 最大允许: {max_allowed}"

**FR-7: Actual Delivery Date (actual_delivery_date)**
- **Type:** Date input (YYYY-MM-DD)
- **Validation:**
  - Cannot be future date (must be ≤ today)
  - Should be ≥ PO actual_order_date (warning, not blocking)
  - Warning message: "交付日期早于下单日期，请确认是否正确。"
- **Business Impact:** Changes payment_due_date calculation (delivery date + 60 days)

**FR-8: Unit Cost USD (unit_cost_usd)**
- **Type:** Number input (2 decimal places)
- **Validation:**
  - Must be > 0
  - Must be ≤ $10,000 (sanity check, can be configured)
  - If new cost differs from PO unit price by >20%, show warning
  - Warning: "单价与订单价格差异超过20% ({po_unit_price} vs {new_cost})，请确认。"
- **Business Impact:** Changes total_value_usd and payables calculations

**FR-9: Payment Status (payment_status)**
- **Type:** Dropdown select
- **Options:**
  - Pending (待支付)
  - Scheduled (已排期)
  - Paid (已支付)
- **Business Logic:**
  - If status changed to "Paid", optionally prompt for payment_date (future enhancement)
  - If status changed from "Paid" to "Pending", show confirmation dialog

**FR-10: Remarks (remarks)**
- **Type:** Textarea
- **Validation:**
  - Max length: 500 characters
  - Optional field
- **Best Practice:** Encourage users to explain WHY they edited (e.g., "Corrected qty per supplier invoice #INV-2025-001")

### 3.4 Read-Only Fields

**FR-11: Non-Editable Display Fields**
The following fields are displayed for context but CANNOT be edited:
- Delivery Number (delivery_number)
- PO Number (po_number, linked to PO detail page)
- SKU (sku)
- Channel Code (channel_code)
- PO Ordered Qty (for reference)
- Other Deliveries Qty (calculated, for reference)

**Rationale:** Changing these would break referential integrity or require complex re-linking logic.

### 3.5 Form Actions

**FR-12: Save Button**
- Label: "保存 Save"
- Behavior:
  1. Validate all fields
  2. If validation fails, show error messages inline
  3. If validation passes:
     - Call Server Action `updateDelivery(delivery_id, updated_fields)`
     - Show loading state on button ("保存中...")
     - On success:
       - Show success toast: "交付记录已更新 Delivery record updated"
       - Redirect to PO detail page `/procurement/[po_id]`
     - On error:
       - Show error message: "更新失败: {error_message}"
       - Keep user on page to retry

**FR-13: Cancel Button**
- Label: "取消 Cancel"
- Behavior:
  - If user has unsaved changes, show confirmation dialog: "确定放弃更改吗？"
  - If confirmed or no changes, redirect to PO detail page

**FR-14: Delete Button (Optional, High Risk)**
- Label: "删除 Delete" (Red button, secondary position)
- Behavior:
  1. Show confirmation dialog: "确定删除此交付记录吗？此操作不可恢复。"
  2. Require user to type "DELETE" to confirm (prevent accidental deletion)
  3. On confirm:
     - Call Server Action `deleteDelivery(delivery_id)`
     - Update `purchase_order_items.delivered_qty` (subtract this delivery's qty)
     - Soft delete (set `deleted_at` timestamp) OR hard delete based on business policy
     - Redirect to PO detail page
- **Risk:** Deleting deliveries can break financial reports if payment already made
- **Recommendation:** Only allow delete if `payment_status = 'Pending'`

---

## 4. Business Rules

### 4.1 Validation Rules

**BR-1: Quantity Constraint**
```
For a given PO item:
  total_delivered = SUM(delivered_qty) for all deliveries linked to po_item_id

  Constraint: total_delivered ≤ ordered_qty

  When editing delivery D:
    other_deliveries = total_delivered - D.current_delivered_qty
    max_allowed_new_qty = ordered_qty - other_deliveries

    Validation: D.new_delivered_qty ≤ max_allowed_new_qty
```

**BR-2: Date Logic**
```
actual_delivery_date ≤ today
actual_delivery_date should be ≥ PO.actual_order_date (warning, not blocking)

payment_due_date = actual_delivery_date + 60 days
  (Recalculated automatically on save)
```

**BR-3: Cost Threshold Alert**
```
IF ABS(new_unit_cost - po_item.unit_price_usd) / po_item.unit_price_usd > 0.20 THEN
  Show warning: "Price variance >20%, please confirm"
  (Not blocking, just warning)
```

**BR-4: Payment Status Transitions**
```
Allowed transitions:
  Pending → Scheduled → Paid
  Pending → Paid (skip Scheduled)
  Scheduled → Pending (rollback)
  Paid → Pending (with confirmation: "Are you sure? This may affect financial reports.")

Blocked transitions: None (all reversals allowed with warning)
```

### 4.2 Data Integrity Rules

**BR-5: Audit Trail Requirement**
- Every edit MUST be logged to an audit table (or use Supabase triggers)
- Log fields:
  - delivery_id
  - changed_by (user_id)
  - changed_at (timestamp with timezone)
  - changed_fields (JSON: { field: { old_value, new_value } })
  - change_reason (from remarks or separate field)

**BR-6: Recalculation on Save**
When delivery record is updated, recalculate:
1. `purchase_order_items.delivered_qty` = SUM(production_deliveries.delivered_qty) for that po_item_id
2. `payment_due_date` = actual_delivery_date + 60 days
3. `total_value_usd` = delivered_qty × unit_cost_usd

**BR-7: Cascade Updates**
- If delivered_qty changes, update PO item's delivered_qty aggregate
- If payment_status changes to "Paid", update payables view
- If unit_cost changes, recalculate total_value_usd

### 4.3 Authorization Rules

**BR-8: Role-Based Access**
```
Roles allowed to edit:
  - admin (full access)
  - procurement_manager (full access)
  - finance_officer (can edit payment_status only, not qty/cost)

Roles NOT allowed:
  - viewer (read-only)
  - warehouse_staff (can view, cannot edit procurement data)
```

**BR-9: Time-Based Lock (Future Enhancement)**
- Deliveries older than 90 days require additional approval to edit
- Show warning: "此记录超过90天，编辑需要财务审批。"

---

## 5. User Interface Specifications

### 5.1 Page Layout

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ Header: 编辑交付记录 Edit Delivery Record                     │
│ Subtitle: Delivery #DEL-2025-001 | PO #PO-2025-001           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ [← 返回订单详情 Back to PO]                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Card: 基本信息 Basic Information                             │
├─────────────────────────────────────────────────────────────┤
│ [Read-Only Fields]                                          │
│ Delivery Number: DEL-2025-001                               │
│ PO Number: PO-2025-001 [View PO →]                          │
│ SKU: D-001-RED                                              │
│ Channel: Amazon-US                                           │
│                                                              │
│ [Reference Info]                                            │
│ PO Ordered Quantity: 1,000                                  │
│ Other Deliveries: 300 (from 2 other delivery records)      │
│ Available to Deliver: 700 (max allowed for this edit)      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Card: 交付信息 Delivery Information (Editable)               │
├─────────────────────────────────────────────────────────────┤
│ Delivered Quantity *                                        │
│ [Input: 500] (Current: 500, Max: 700)                       │
│                                                              │
│ Actual Delivery Date *                                      │
│ [Date Input: 2025-02-10]                                    │
│                                                              │
│ Unit Cost (USD) *                                           │
│ [Input: 10.50] (PO price: 10.00, Variance: +5%)             │
│                                                              │
│ Payment Status *                                            │
│ [Dropdown: Pending ▼]                                        │
│                                                              │
│ Remarks (Optional)                                          │
│ [Textarea: "Corrected quantity per supplier invoice..."]   │
│ (0/500 characters)                                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Card: 影响预览 Impact Preview                                │
├─────────────────────────────────────────────────────────────┤
│ Total Value: $5,250.00 (was $5,000.00)                     │
│ Payment Due Date: 2025-04-11 (60 days after delivery)      │
│ PO Fulfillment: 80% (800/1000)                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ [取消 Cancel]   [删除 Delete (Red)]   [保存 Save (Primary)] │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Validation Feedback

**Inline Error Messages:**
- Show below each field with error
- Red text, small font
- Icon: ⚠️

**Warning Messages:**
- Show below field with warning (non-blocking)
- Yellow/orange text
- Icon: ⚠️

**Success Feedback:**
- Toast notification (top-right corner)
- Green background, white text
- Auto-dismiss after 3 seconds
- Message: "✓ 交付记录已更新 Delivery record updated"

### 5.3 Loading States

**Page Load:**
- Show skeleton loaders for form fields
- Loading text: "加载中... Loading delivery record"

**Save in Progress:**
- Disable all inputs
- Save button shows spinner + "保存中... Saving"
- Prevent double submission

---

## 6. Technical Specifications

### 6.1 Database Operations

**Query: Fetch Delivery for Edit**
```sql
SELECT
  pd.id,
  pd.delivery_number,
  pd.po_item_id,
  pd.sku,
  pd.channel_code,
  pd.delivered_qty,
  pd.actual_delivery_date,
  pd.unit_cost_usd,
  pd.payment_status,
  pd.payment_due_date,
  pd.remarks,
  po.id AS po_id,
  po.po_number,
  poi.ordered_qty,
  (SELECT COALESCE(SUM(delivered_qty), 0)
   FROM production_deliveries
   WHERE po_item_id = pd.po_item_id AND id != pd.id) AS other_deliveries_qty
FROM production_deliveries pd
JOIN purchase_orders po ON pd.po_id = po.id
JOIN purchase_order_items poi ON pd.po_item_id = poi.id
WHERE pd.id = :delivery_id
```

**Mutation: Update Delivery**
```sql
UPDATE production_deliveries
SET
  delivered_qty = :delivered_qty,
  actual_delivery_date = :actual_delivery_date,
  unit_cost_usd = :unit_cost_usd,
  payment_status = :payment_status,
  payment_due_date = :actual_delivery_date + INTERVAL '60 days',
  remarks = :remarks,
  updated_at = NOW()
WHERE id = :delivery_id
RETURNING *;

-- Also update PO item aggregate
UPDATE purchase_order_items
SET
  delivered_qty = (
    SELECT COALESCE(SUM(delivered_qty), 0)
    FROM production_deliveries
    WHERE po_item_id = :po_item_id
  ),
  updated_at = NOW()
WHERE id = :po_item_id;
```

**Audit Log Insert (Trigger or Manual)**
```sql
INSERT INTO delivery_edit_audit_log (
  delivery_id,
  changed_by,
  changed_at,
  changed_fields,
  change_reason
) VALUES (
  :delivery_id,
  :user_id,
  NOW(),
  :changed_fields_json, -- { "delivered_qty": { "old": 500, "new": 550 } }
  :change_reason
);
```

### 6.2 Server Action Signature

**File:** `src/lib/actions/procurement.ts`

```typescript
export async function updateDelivery(
  deliveryId: string,
  updates: {
    delivered_qty?: number
    actual_delivery_date?: string
    unit_cost_usd?: number
    payment_status?: PaymentStatus
    remarks?: string | null
  }
): Promise<{
  success: boolean
  error?: string
  data?: ProductionDelivery
}> {
  'use server'

  try {
    // 1. Validate user permissions
    // 2. Fetch current delivery + PO item constraints
    // 3. Validate business rules (qty constraint, date logic)
    // 4. Update production_deliveries
    // 5. Update purchase_order_items.delivered_qty
    // 6. Log to audit trail
    // 7. Return success
  } catch (error) {
    return { success: false, error: error.message }
  }
}
```

### 6.3 Type Definitions

**File:** `src/lib/types/database.ts`

```typescript
export interface ProductionDeliveryUpdate {
  delivered_qty?: number
  actual_delivery_date?: string
  unit_cost_usd?: number
  payment_status?: PaymentStatus
  remarks?: string | null
}

export interface DeliveryEditContext {
  delivery: ProductionDelivery
  po: PurchaseOrder
  po_item: PurchaseOrderItem
  other_deliveries_qty: number
  max_allowed_qty: number
}

export interface DeliveryEditAuditLog {
  id: string
  delivery_id: string
  changed_by: string // user_id
  changed_at: string // timestamptz
  changed_fields: Record<string, { old: any; new: any }>
  change_reason: string | null
}
```

---

## 7. Success Metrics

### 7.1 Adoption Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Edit Page Usage | >30 edits/month | Analytics tracking |
| Edit Success Rate | >95% (successful saves) | Server action logs |
| Edit Error Rate | <5% | Server action error logs |
| Average Edit Time | <2 minutes per edit | Session duration |

### 7.2 Business Impact Metrics

| Metric | Baseline (Manual SQL) | Target (Edit Page) | Timeline |
|--------|----------------------|-------------------|----------|
| Data Correction Time | 30 min (requires dev) | 2 min (self-service) | Immediate |
| Support Tickets for Edits | 10/month | <2/month | 3 months |
| Financial Discrepancies | $50K/quarter | <$10K/quarter | 6 months |
| Audit Trail Completeness | 0% (no logs) | 100% (all edits logged) | Immediate |

### 7.3 Quality Metrics

| Metric | Target | Critical Threshold |
|--------|--------|--------------------|
| Validation Error Rate | <10% of edit attempts | <20% |
| Data Integrity Violations | 0 | 0 |
| Unauthorized Access Attempts | 0 | 0 |

---

## 8. Acceptance Criteria

### AC-1: Page Load
- **Given** user with `procurement_manager` role
- **When** user navigates to `/procurement/deliveries/[valid_id]/edit`
- **Then** page loads within 2 seconds
- **And** all form fields are pre-populated with current values
- **And** read-only fields display PO number, SKU, channel, reference quantities
- **And** no console errors

### AC-2: Edit Delivered Quantity (Valid)
- **Given** delivery record with delivered_qty = 500, PO ordered_qty = 1000, other_deliveries = 300
- **When** user changes delivered_qty to 600 (within allowed range 1-700)
- **And** clicks Save
- **Then** delivery record updates successfully
- **And** PO item delivered_qty updates to 900 (600 + 300)
- **And** user redirected to PO detail page
- **And** success toast appears

### AC-3: Edit Delivered Quantity (Invalid)
- **Given** delivery record with delivered_qty = 500, max_allowed_qty = 700
- **When** user changes delivered_qty to 800 (exceeds max)
- **And** clicks Save
- **Then** validation error appears: "交付数量不能超过订单剩余量..."
- **And** form does NOT submit
- **And** user remains on page to correct

### AC-4: Edit Delivery Date
- **Given** delivery record with actual_delivery_date = 2025-02-10
- **When** user changes date to 2025-02-15
- **And** clicks Save
- **Then** delivery record updates
- **And** payment_due_date recalculates to 2025-04-16 (60 days after new date)
- **And** audit log records date change

### AC-5: Edit Unit Cost with Warning
- **Given** delivery with unit_cost_usd = $10.00, PO unit price = $10.00
- **When** user changes unit_cost to $12.50 (+25% variance)
- **Then** warning message appears: "单价与订单价格差异超过20%..."
- **And** user can still Save (warning is non-blocking)
- **When** user clicks Save
- **Then** update succeeds with new cost

### AC-6: Update Payment Status
- **Given** delivery with payment_status = "Pending"
- **When** user changes status to "Paid"
- **And** clicks Save
- **Then** payment_status updates to "Paid"
- **And** payables report no longer shows this delivery as outstanding

### AC-7: Cancel without Changes
- **Given** user is on edit page
- **When** user has NOT made any changes
- **And** clicks Cancel
- **Then** user immediately redirects to PO detail page (no confirmation)

### AC-8: Cancel with Unsaved Changes
- **Given** user has changed delivered_qty from 500 to 600
- **When** user clicks Cancel
- **Then** confirmation dialog appears: "确定放弃更改吗?"
- **When** user clicks "Confirm"
- **Then** redirect to PO detail page, changes discarded

### AC-9: Audit Trail Logging
- **Given** user edits delivered_qty from 500 to 600
- **When** user saves successfully
- **Then** audit log inserts record:
  - delivery_id: [uuid]
  - changed_by: [user_id]
  - changed_at: [timestamp]
  - changed_fields: { "delivered_qty": { "old": 500, "new": 600 } }
- **And** audit log is queryable by admins

### AC-10: Unauthorized Access
- **Given** user with role "viewer" (not authorized)
- **When** user attempts to access `/procurement/deliveries/[id]/edit`
- **Then** redirect to `/procurement` with error message: "您没有权限编辑交付记录 You don't have permission to edit deliveries"

### AC-11: 404 for Invalid ID
- **Given** user navigates to `/procurement/deliveries/[nonexistent_id]/edit`
- **When** page loads
- **Then** 404 page displays: "交付记录不存在 Delivery record not found"

### AC-12: Delete Delivery (Optional Feature)
- **Given** delivery with payment_status = "Pending" (delete allowed)
- **When** user clicks Delete button
- **Then** confirmation dialog appears: "确定删除此交付记录吗？此操作不可恢复。请输入 DELETE 确认。"
- **When** user types "DELETE" and confirms
- **Then** delivery record soft-deletes (sets deleted_at)
- **And** PO item delivered_qty decrements
- **And** user redirects to PO detail page

---

## 9. Dependencies & Risks

### 9.1 Technical Dependencies

| Dependency | Version | Risk Level | Mitigation |
|------------|---------|------------|------------|
| Supabase RLS policies | - | Medium | Ensure edit policies allow procurement_manager role |
| Server Actions | Next.js 15+ | Low | Use standard patterns |
| Date handling | date-fns 3.0+ | Low | Already in use |
| Audit logging | Custom table | High | Create migration for audit table |

### 9.2 Data Dependencies

| Dependency | Owner | Risk Level | Mitigation |
|------------|-------|------------|------------|
| Referential integrity (PO → Delivery) | Backend Specialist | Medium | Add ON UPDATE CASCADE |
| Aggregated delivered_qty accuracy | Backend Specialist | High | Use database trigger or transaction |
| Payment due date calculation | Finance team | Low | Documented formula (delivery + 60 days) |

### 9.3 Known Risks

**Risk R-1: Concurrent Edits**
- **Impact:** Two users edit same delivery simultaneously, last write wins
- **Probability:** Low (10%)
- **Mitigation:** Implement optimistic locking (check `updated_at` on save)

**Risk R-2: Cascade Update Failures**
- **Impact:** Delivery updates but PO item aggregate doesn't update
- **Probability:** Medium (20%)
- **Mitigation:** Use database transaction, rollback all changes if any step fails

**Risk R-3: Audit Log Growing Large**
- **Impact:** Audit table may grow to millions of rows
- **Probability:** High (over 1-2 years)
- **Mitigation:** Partition by month, archive logs older than 2 years

---

## 10. Out of Scope (V1.0)

The following features are **excluded** from initial release:

1. Bulk edit of multiple deliveries at once
2. Edit history comparison UI (diff view of old vs new)
3. Approval workflow for edits (e.g., finance must approve cost changes >20%)
4. Automated alerts when edit violates threshold (e.g., email to finance if cost changes)
5. Export edit history to Excel
6. Rollback to previous version (one-click undo)
7. Comments/discussion thread on delivery record
8. Attach files (invoices, packing lists) to delivery

These may be considered for V1.1+ based on user feedback.

---

## 11. Implementation Phases

### Phase 1: Core Edit Page (Week 1)
- Create page route `/procurement/deliveries/[id]/edit`
- Implement data fetching (load delivery + PO context)
- Build form UI with editable fields
- Add validation (frontend + backend)

### Phase 2: Server Action & Database (Week 2)
- Implement `updateDelivery` Server Action
- Add database migration for audit table
- Implement cascade update logic (update PO item aggregate)
- Add transaction support

### Phase 3: Authorization & Security (Week 2)
- Implement role-based access control
- Add Supabase RLS policies for edit operations
- Test unauthorized access scenarios

### Phase 4: Polish & Testing (Week 3)
- Add loading states, error handling
- Implement confirmation dialogs
- Add success/error toasts
- User acceptance testing with 3 procurement managers

### Phase 5: Optional Delete Feature (Week 4)
- Implement delete button with confirmation
- Add soft delete logic
- Test cascade effects

---

## 12. Approval & Sign-off

**Required Approvals:**

| Role | Name | Approval Criteria | Status |
|------|------|------------------|--------|
| Product Manager | [Name] | Functional completeness | Pending |
| Engineering Lead | [Name] | Technical feasibility | Pending |
| Procurement Manager | [Name] | Solves real pain points | Pending |
| Finance Director | [Name] | Audit trail meets compliance | Pending |
| Security Officer | [Name] | Authorization controls adequate | Pending |

**Next Step:** Proceed to System Architect for technical design (`specs/delivery-edit/design.md`)

---

## End of Requirements Document

**Version:** 1.0
**Last Updated:** 2025-12-05
**Author:** Product Director (AI Agent)
**Reviewers:** [To be assigned]
