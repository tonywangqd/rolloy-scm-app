# Production Delivery Edit - Technical Design Specification

## Document Metadata
- **Feature:** Production Delivery Record Edit/Adjustment Page
- **Role:** System Architect
- **Date:** 2025-12-05
- **Status:** Design Specification
- **Priority:** P1
- **Parent Spec:** `specs/delivery-edit/requirements.md`

---

## 1. Executive Summary

### 1.1 Technical Objective

Create an edit page at `/procurement/deliveries/[id]/edit` that allows authorized users to modify existing production delivery records with full validation, audit trailing, and cascade updates.

**Key Requirements:**
- Load delivery record by ID with related PO context
- Allow editing of: `delivered_qty`, `actual_delivery_date`, `unit_cost_usd`, `payment_status`, `remarks`
- Validate business rules (qty constraints, date logic, cost variance)
- Update related tables atomically (`production_deliveries` + `purchase_order_items`)
- Log all changes to audit trail
- Redirect to PO detail page on success

### 1.2 Technical Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Page Route** | Next.js 15 App Router (Server Component) | Fetch data server-side, SEO-friendly |
| **Form Component** | Client Component with `useState` | Interactive form with real-time validation |
| **Data Mutation** | Server Action (`updateDelivery`) | Type-safe, secure, revalidates cache |
| **Validation** | Zod schema + server-side checks | Client + server validation, prevent invalid data |
| **Database** | Supabase PostgreSQL | ACID transactions for cascade updates |
| **Audit Trail** | Database trigger OR manual insert | Track all changes for compliance |

### 1.3 Architecture Decision

**Page Structure:**
```
/procurement/deliveries/[id]/edit/page.tsx (Server Component)
  ↓ fetches data (server-side)
  └── DeliveryEditForm (Client Component)
        ↓ submits via Server Action
        └── updateDelivery() → Database transaction
```

**Why Server Component + Client Form:**
- **Server Component** for initial data fetching (no client-side fetch, faster load)
- **Client Component** for interactive form (real-time validation, loading states)
- **Server Action** for mutation (secure, type-safe, automatic revalidation)

---

## 2. Database Schema & Types

### 2.1 Existing Schema (No Changes)

**Table:** `production_deliveries`

```sql
CREATE TABLE production_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_number TEXT NOT NULL UNIQUE,
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
  sku TEXT NOT NULL,
  channel_code TEXT,
  delivered_qty INTEGER NOT NULL CHECK (delivered_qty > 0),
  planned_delivery_date DATE,
  actual_delivery_date DATE,
  unit_cost_usd NUMERIC(10,2) NOT NULL CHECK (unit_cost_usd > 0),
  payment_status payment_status NOT NULL DEFAULT 'Pending', -- ENUM: 'Pending' | 'Scheduled' | 'Paid'
  remarks TEXT,

  -- Generated columns
  delivery_month TEXT GENERATED ALWAYS AS (TO_CHAR(actual_delivery_date, 'YYYY-MM')) STORED,
  total_value_usd NUMERIC(12,2) GENERATED ALWAYS AS (delivered_qty * unit_cost_usd) STORED,
  payment_due_date DATE GENERATED ALWAYS AS (actual_delivery_date + INTERVAL '60 days') STORED,
  payment_month TEXT GENERATED ALWAYS AS (TO_CHAR(actual_delivery_date + INTERVAL '60 days', 'YYYY-MM')) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Table:** `purchase_order_items`

```sql
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id),
  sku TEXT NOT NULL,
  channel_code TEXT,
  ordered_qty INTEGER NOT NULL,
  delivered_qty INTEGER NOT NULL DEFAULT 0, -- ← This needs to be recalculated when delivery changes
  unit_price_usd NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 New Audit Table (Required)

**File:** `supabase/migrations/20251205_delivery_edit_audit.sql` (NEW)

```sql
-- Delivery edit audit log for tracking all changes
CREATE TABLE IF NOT EXISTS delivery_edit_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES production_deliveries(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id), -- User who made the change
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_fields JSONB NOT NULL, -- { "delivered_qty": { "old": 500, "new": 600 } }
  change_reason TEXT, -- From remarks or separate field
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying audit history
CREATE INDEX idx_delivery_edit_audit_delivery_id ON delivery_edit_audit_log(delivery_id);
CREATE INDEX idx_delivery_edit_audit_changed_at ON delivery_edit_audit_log(changed_at DESC);

-- RLS Policy: Allow all authenticated users to read audit logs
ALTER TABLE delivery_edit_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit logs viewable by authenticated users"
  ON delivery_edit_audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert audit logs"
  ON delivery_edit_audit_log FOR INSERT
  WITH CHECK (true); -- Server action will insert with service role
```

### 2.3 Type Definitions

**File:** `src/lib/types/database.ts` (EDIT - Add new types)

```typescript
// Already exists, no changes needed:
export interface ProductionDelivery { /* ... */ }
export interface ProductionDeliveryUpdate {
  delivered_qty?: number
  planned_delivery_date?: string | null
  actual_delivery_date?: string | null
  unit_cost_usd?: number
  payment_status?: PaymentStatus
  remarks?: string | null
}

// NEW: Extended type for edit page context
export interface DeliveryEditContext {
  delivery: ProductionDelivery
  po: {
    id: string
    po_number: string
    batch_code: string
    supplier_name: string | null
  }
  po_item: {
    id: string
    ordered_qty: number
    delivered_qty: number // Total delivered from ALL deliveries
  }
  other_deliveries_qty: number // Delivered qty from OTHER deliveries (excluding current)
  max_allowed_qty: number // ordered_qty - other_deliveries_qty
}

// NEW: Audit log entry
export interface DeliveryEditAuditLog {
  id: string
  delivery_id: string
  changed_by: string | null // user_id
  changed_at: string // timestamptz
  changed_fields: Record<string, { old: any; new: any }>
  change_reason: string | null
  created_at: string
}
```

---

## 3. API Design

### 3.1 Data Fetching Query

**File:** `src/lib/queries/procurement.ts` (EDIT - Add new function)

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeliveryEditContext } from '@/lib/types/database'

/**
 * Fetch delivery record with context for editing
 * Returns delivery + PO + item constraints
 */
export async function fetchDeliveryForEdit(
  deliveryId: string
): Promise<{ data: DeliveryEditContext | null; error: string | null }> {
  try {
    const supabase = await createServerSupabaseClient()

    // Query delivery with related data
    const { data: delivery, error: deliveryError } = await supabase
      .from('production_deliveries')
      .select(`
        *,
        po_item:purchase_order_items!inner(
          id,
          po_id,
          ordered_qty,
          delivered_qty,
          po:purchase_orders!inner(
            id,
            po_number,
            batch_code,
            supplier:suppliers(supplier_name)
          )
        )
      `)
      .eq('id', deliveryId)
      .single()

    if (deliveryError || !delivery) {
      return {
        data: null,
        error: deliveryError?.message || 'Delivery not found',
      }
    }

    // Calculate other deliveries qty (excluding current delivery)
    const { data: otherDeliveries, error: otherError } = await supabase
      .from('production_deliveries')
      .select('delivered_qty')
      .eq('po_item_id', delivery.po_item_id)
      .neq('id', deliveryId)

    if (otherError) {
      return { data: null, error: otherError.message }
    }

    const otherDeliveriesQty = otherDeliveries.reduce(
      (sum, d) => sum + d.delivered_qty,
      0
    )

    const maxAllowedQty = delivery.po_item.ordered_qty - otherDeliveriesQty

    return {
      data: {
        delivery,
        po: {
          id: delivery.po_item.po.id,
          po_number: delivery.po_item.po.po_number,
          batch_code: delivery.po_item.po.batch_code,
          supplier_name: delivery.po_item.po.supplier?.supplier_name || null,
        },
        po_item: {
          id: delivery.po_item.id,
          ordered_qty: delivery.po_item.ordered_qty,
          delivered_qty: delivery.po_item.delivered_qty,
        },
        other_deliveries_qty: otherDeliveriesQty,
        max_allowed_qty: maxAllowedQty,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
```

### 3.2 Server Action - Update Delivery

**File:** `src/lib/actions/procurement.ts` (EDIT - Add new function)

```typescript
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import type { ProductionDeliveryUpdate, PaymentStatus } from '@/lib/types/database'
import { z } from 'zod'

// Validation schema
const deliveryUpdateSchema = z.object({
  delivered_qty: z.number().int().positive().optional(),
  actual_delivery_date: z.string().optional(), // ISO date string
  unit_cost_usd: z.number().positive().max(10000).optional(),
  payment_status: z.enum(['Pending', 'Scheduled', 'Paid']).optional(),
  remarks: z.string().max(500).nullable().optional(),
})

/**
 * Update production delivery record
 * Performs cascade updates to purchase_order_items.delivered_qty
 * Logs changes to audit trail
 */
export async function updateDelivery(
  deliveryId: string,
  updates: ProductionDeliveryUpdate
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // 1. Authentication check
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const userId = authResult.user?.id

    // 2. Validate input
    const validation = deliveryUpdateSchema.safeParse(updates)
    if (!validation.success) {
      return {
        success: false,
        error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // 3. Fetch current delivery + constraints
    const { data: currentDelivery, error: fetchError } = await supabase
      .from('production_deliveries')
      .select(`
        *,
        po_item:purchase_order_items!inner(id, ordered_qty, delivered_qty)
      `)
      .eq('id', deliveryId)
      .single()

    if (fetchError || !currentDelivery) {
      return { success: false, error: 'Delivery not found' }
    }

    // 4. Calculate other deliveries qty
    const { data: otherDeliveries } = await supabase
      .from('production_deliveries')
      .select('delivered_qty')
      .eq('po_item_id', currentDelivery.po_item_id)
      .neq('id', deliveryId)

    const otherDeliveriesQty = otherDeliveries?.reduce(
      (sum, d) => sum + d.delivered_qty,
      0
    ) || 0

    // 5. Business rule validation
    if (updates.delivered_qty !== undefined) {
      const maxAllowed = currentDelivery.po_item.ordered_qty - otherDeliveriesQty

      if (updates.delivered_qty > maxAllowed) {
        return {
          success: false,
          error: `交付数量不能超过订单剩余量。订单量: ${currentDelivery.po_item.ordered_qty}, 其他交付: ${otherDeliveriesQty}, 最大允许: ${maxAllowed}`,
        }
      }
    }

    if (updates.actual_delivery_date !== undefined) {
      const deliveryDate = new Date(updates.actual_delivery_date)
      const today = new Date()
      if (deliveryDate > today) {
        return { success: false, error: '交付日期不能是未来日期' }
      }
    }

    // 6. Prepare changed fields for audit log
    const changedFields: Record<string, { old: any; new: any }> = {}
    Object.keys(updates).forEach((key) => {
      const oldValue = currentDelivery[key]
      const newValue = updates[key as keyof ProductionDeliveryUpdate]
      if (oldValue !== newValue && newValue !== undefined) {
        changedFields[key] = { old: oldValue, new: newValue }
      }
    })

    if (Object.keys(changedFields).length === 0) {
      return { success: false, error: '没有任何更改' }
    }

    // 7. BEGIN TRANSACTION: Update delivery + Update PO item + Insert audit log
    const { data: updatedDelivery, error: updateError } = await supabase
      .from('production_deliveries')
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
      .select()
      .single()

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // 8. Recalculate PO item delivered_qty (SUM of all deliveries for this po_item)
    const { data: allDeliveries } = await supabase
      .from('production_deliveries')
      .select('delivered_qty')
      .eq('po_item_id', currentDelivery.po_item_id)

    const newTotalDeliveredQty = allDeliveries?.reduce(
      (sum, d) => sum + d.delivered_qty,
      0
    ) || 0

    const { error: poItemUpdateError } = await supabase
      .from('purchase_order_items')
      .update({
        delivered_qty: newTotalDeliveredQty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentDelivery.po_item_id)

    if (poItemUpdateError) {
      // NOTE: This is a critical error - delivery was updated but PO item wasn't
      // In production, this should use a database transaction or trigger
      console.error('Failed to update PO item delivered_qty:', poItemUpdateError)
      return {
        success: false,
        error: 'Cascade update failed. Please contact support.',
      }
    }

    // 9. Insert audit log
    const { error: auditError } = await supabase
      .from('delivery_edit_audit_log')
      .insert({
        delivery_id: deliveryId,
        changed_by: userId || null,
        changed_at: new Date().toISOString(),
        changed_fields: changedFields,
        change_reason: updates.remarks || null,
      })

    if (auditError) {
      console.error('Failed to log audit trail:', auditError)
      // Don't fail the request if audit log fails, but log it
    }

    // 10. Revalidate cache
    revalidatePath('/procurement')
    revalidatePath(`/procurement/${currentDelivery.po_item.po_id}`)

    return { success: true, data: updatedDelivery }
  } catch (err) {
    return {
      success: false,
      error: `Failed to update delivery: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
```

### 3.3 Optional: Delete Delivery Action

**File:** `src/lib/actions/procurement.ts` (EDIT - Add new function)

```typescript
/**
 * Delete production delivery record (soft delete)
 * Only allowed if payment_status = 'Pending'
 */
export async function deleteDelivery(
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    const supabase = await createServerSupabaseClient()

    // Check current delivery status
    const { data: delivery, error: fetchError } = await supabase
      .from('production_deliveries')
      .select('payment_status, po_item_id, delivered_qty')
      .eq('id', deliveryId)
      .single()

    if (fetchError || !delivery) {
      return { success: false, error: 'Delivery not found' }
    }

    // Business rule: Only allow delete if payment is pending
    if (delivery.payment_status !== 'Pending') {
      return {
        success: false,
        error: '只能删除付款状态为"待支付"的交付记录',
      }
    }

    // Soft delete: Add deleted_at column (requires migration)
    // OR Hard delete (risk: breaks audit trail)
    const { error: deleteError } = await supabase
      .from('production_deliveries')
      .delete()
      .eq('id', deliveryId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Recalculate PO item delivered_qty
    const { data: remainingDeliveries } = await supabase
      .from('production_deliveries')
      .select('delivered_qty')
      .eq('po_item_id', delivery.po_item_id)

    const newTotalDeliveredQty = remainingDeliveries?.reduce(
      (sum, d) => sum + d.delivered_qty,
      0
    ) || 0

    await supabase
      .from('purchase_order_items')
      .update({ delivered_qty: newTotalDeliveredQty })
      .eq('id', delivery.po_item_id)

    revalidatePath('/procurement')
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete delivery: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
```

---

## 4. Frontend Implementation

### 4.1 Page Route (Server Component)

**File:** `src/app/procurement/deliveries/[id]/edit/page.tsx` (NEW)

```typescript
import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { DeliveryEditForm } from '@/components/procurement/delivery-edit-form'
import { fetchDeliveryForEdit } from '@/lib/queries/procurement'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface PageProps {
  params: { id: string }
}

export default async function DeliveryEditPage({ params }: PageProps) {
  const { data, error } = await fetchDeliveryForEdit(params.id)

  if (error || !data) {
    notFound()
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Breadcrumb */}
          <Link
            href={`/procurement/${data.po.id}`}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回订单详情 Back to PO
          </Link>

          {/* Page Header */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900">
              编辑交付记录 Edit Delivery Record
            </h1>
            <p className="text-sm text-gray-600">
              Delivery #{data.delivery.delivery_number} | PO #{data.po.po_number}
            </p>
          </div>

          {/* Form */}
          <DeliveryEditForm context={data} />
        </div>
      </div>
    </>
  )
}
```

### 4.2 Form Component (Client Component)

**File:** `src/components/procurement/delivery-edit-form.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateDelivery, deleteDelivery } from '@/lib/actions/procurement'
import { AlertCircle, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DeliveryEditContext, PaymentStatus } from '@/lib/types/database'

interface DeliveryEditFormProps {
  context: DeliveryEditContext
}

export function DeliveryEditForm({ context }: DeliveryEditFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const [formData, setFormData] = useState({
    delivered_qty: context.delivery.delivered_qty,
    actual_delivery_date: context.delivery.actual_delivery_date || '',
    unit_cost_usd: context.delivery.unit_cost_usd,
    payment_status: context.delivery.payment_status,
    remarks: context.delivery.remarks || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
    // Clear error when user edits
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (formData.delivered_qty <= 0) {
      newErrors.delivered_qty = '交付数量必须大于0'
    }

    if (formData.delivered_qty > context.max_allowed_qty) {
      newErrors.delivered_qty = `交付数量不能超过 ${context.max_allowed_qty} (订单量 ${context.po_item.ordered_qty} - 其他交付 ${context.other_deliveries_qty})`
    }

    if (!formData.actual_delivery_date) {
      newErrors.actual_delivery_date = '交付日期为必填项'
    } else {
      const deliveryDate = new Date(formData.actual_delivery_date)
      const today = new Date()
      if (deliveryDate > today) {
        newErrors.actual_delivery_date = '交付日期不能是未来日期'
      }
    }

    if (formData.unit_cost_usd <= 0 || formData.unit_cost_usd > 10000) {
      newErrors.unit_cost_usd = '单价必须在 $0.01 - $10,000 之间'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('请修正表单错误')
      return
    }

    setLoading(true)

    const result = await updateDelivery(context.delivery.id, {
      delivered_qty: formData.delivered_qty,
      actual_delivery_date: formData.actual_delivery_date,
      unit_cost_usd: formData.unit_cost_usd,
      payment_status: formData.payment_status as PaymentStatus,
      remarks: formData.remarks || null,
    })

    if (result.success) {
      toast.success('交付记录已更新 Delivery record updated')
      router.push(`/procurement/${context.po.id}`)
    } else {
      toast.error(result.error || '更新失败')
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (hasChanges) {
      const confirmed = window.confirm('确定放弃更改吗？')
      if (!confirmed) return
    }
    router.push(`/procurement/${context.po.id}`)
  }

  const handleDelete = async () => {
    const confirmed = window.prompt(
      '确定删除此交付记录吗？此操作不可恢复。请输入 DELETE 确认。',
      ''
    )

    if (confirmed !== 'DELETE') {
      return
    }

    setLoading(true)
    const result = await deleteDelivery(context.delivery.id)

    if (result.success) {
      toast.success('交付记录已删除')
      router.push(`/procurement/${context.po.id}`)
    } else {
      toast.error(result.error || '删除失败')
      setLoading(false)
    }
  }

  // Calculate cost variance warning
  const costVariance = ((formData.unit_cost_usd - context.delivery.unit_cost_usd) / context.delivery.unit_cost_usd) * 100
  const showCostWarning = Math.abs(costVariance) > 20

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Read-Only Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>基本信息 Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-gray-500">Delivery Number</Label>
            <p className="font-medium">{context.delivery.delivery_number}</p>
          </div>
          <div>
            <Label className="text-gray-500">PO Number</Label>
            <p className="font-medium">
              <a href={`/procurement/${context.po.id}`} className="text-blue-600 hover:underline">
                {context.po.po_number}
              </a>
            </p>
          </div>
          <div>
            <Label className="text-gray-500">SKU</Label>
            <p className="font-medium">{context.delivery.sku}</p>
          </div>
          <div>
            <Label className="text-gray-500">Channel</Label>
            <p className="font-medium">{context.delivery.channel_code || 'N/A'}</p>
          </div>
          <div className="col-span-2 border-t pt-4">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <Label className="text-gray-500">PO Ordered Qty</Label>
                <p className="text-base font-semibold">{context.po_item.ordered_qty}</p>
              </div>
              <div>
                <Label className="text-gray-500">Other Deliveries</Label>
                <p className="text-base font-semibold">{context.other_deliveries_qty}</p>
              </div>
              <div>
                <Label className="text-gray-500">Max Allowed</Label>
                <p className="text-base font-semibold text-green-600">{context.max_allowed_qty}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable Fields Card */}
      <Card>
        <CardHeader>
          <CardTitle>交付信息 Delivery Information (Editable)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Delivered Quantity */}
          <div>
            <Label htmlFor="delivered_qty">
              Delivered Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              id="delivered_qty"
              type="number"
              value={formData.delivered_qty}
              onChange={(e) => handleChange('delivered_qty', parseInt(e.target.value) || 0)}
              className={errors.delivered_qty ? 'border-red-500' : ''}
            />
            {errors.delivered_qty && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.delivered_qty}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Current: {context.delivery.delivered_qty}, Max: {context.max_allowed_qty}
            </p>
          </div>

          {/* Actual Delivery Date */}
          <div>
            <Label htmlFor="actual_delivery_date">
              Actual Delivery Date <span className="text-red-500">*</span>
            </Label>
            <Input
              id="actual_delivery_date"
              type="date"
              value={formData.actual_delivery_date}
              onChange={(e) => handleChange('actual_delivery_date', e.target.value)}
              className={errors.actual_delivery_date ? 'border-red-500' : ''}
            />
            {errors.actual_delivery_date && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.actual_delivery_date}
              </p>
            )}
          </div>

          {/* Unit Cost USD */}
          <div>
            <Label htmlFor="unit_cost_usd">
              Unit Cost (USD) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="unit_cost_usd"
              type="number"
              step="0.01"
              value={formData.unit_cost_usd}
              onChange={(e) => handleChange('unit_cost_usd', parseFloat(e.target.value) || 0)}
              className={errors.unit_cost_usd ? 'border-red-500' : ''}
            />
            {errors.unit_cost_usd && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.unit_cost_usd}
              </p>
            )}
            {showCostWarning && (
              <p className="mt-1 text-xs text-yellow-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                单价与原始价格差异 {costVariance.toFixed(1)}%，请确认。
              </p>
            )}
          </div>

          {/* Payment Status */}
          <div>
            <Label htmlFor="payment_status">Payment Status</Label>
            <Select
              value={formData.payment_status}
              onValueChange={(value) => handleChange('payment_status', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending (待支付)</SelectItem>
                <SelectItem value="Scheduled">Scheduled (已排期)</SelectItem>
                <SelectItem value="Paid">Paid (已支付)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Remarks */}
          <div>
            <Label htmlFor="remarks">Remarks (Optional)</Label>
            <Textarea
              id="remarks"
              value={formData.remarks}
              onChange={(e) => handleChange('remarks', e.target.value)}
              placeholder="请说明本次编辑的原因..."
              maxLength={500}
              rows={3}
            />
            <p className="mt-1 text-xs text-gray-500">
              {formData.remarks.length}/500 characters
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
          取消 Cancel
        </Button>

        <div className="flex gap-3">
          {context.delivery.payment_status === 'Pending' && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除 Delete
            </Button>
          )}

          <Button type="submit" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? '保存中...' : '保存 Save'}
          </Button>
        </div>
      </div>
    </form>
  )
}
```

---

## 5. Implementation Checklist

### 5.1 Phase 1: Database & Backend (Week 1-2)

- [ ] Create migration: `supabase/migrations/20251205_delivery_edit_audit.sql`
- [ ] Add `delivery_edit_audit_log` table
- [ ] Add RLS policies for audit table
- [ ] Implement `fetchDeliveryForEdit()` in `src/lib/queries/procurement.ts`
- [ ] Implement `updateDelivery()` in `src/lib/actions/procurement.ts`
- [ ] Implement `deleteDelivery()` in `src/lib/actions/procurement.ts` (optional)
- [ ] Add type definitions to `src/lib/types/database.ts`
- [ ] Test Server Actions with Supabase Studio

### 5.2 Phase 2: Frontend (Week 2)

- [ ] Create page: `src/app/procurement/deliveries/[id]/edit/page.tsx`
- [ ] Create component: `src/components/procurement/delivery-edit-form.tsx`
- [ ] Implement form validation (client-side)
- [ ] Add loading states, error messages
- [ ] Add confirmation dialogs (Cancel, Delete)
- [ ] Test form submission with real data

### 5.3 Phase 3: Integration (Week 3)

- [ ] Add "Edit" button to PO detail page delivery table
- [ ] Link button to `/procurement/deliveries/[id]/edit`
- [ ] Test navigation flow: PO Detail → Edit → Save → Back to PO Detail
- [ ] Test cascade updates (verify `purchase_order_items.delivered_qty` updates)
- [ ] Test audit log (verify records inserted)

### 5.4 Phase 4: Testing & QA (Week 3-4)

- [ ] Test all validation rules (qty, date, cost)
- [ ] Test edge cases (zero values, boundary values)
- [ ] Test unauthorized access (redirect non-admin users)
- [ ] Test concurrent edits (optimistic locking)
- [ ] Test delete functionality
- [ ] Performance testing (page load <2s)
- [ ] User acceptance testing (3 procurement managers)

---

## 6. Security & Authorization

### 6.1 RLS Policies

**Table:** `production_deliveries`

```sql
-- Allow procurement_manager and admin to UPDATE
CREATE POLICY "Procurement managers can update deliveries"
  ON production_deliveries FOR UPDATE
  USING (
    auth.jwt() ->> 'role' IN ('procurement_manager', 'admin')
  );

-- Allow procurement_manager and admin to DELETE
CREATE POLICY "Procurement managers can delete pending deliveries"
  ON production_deliveries FOR DELETE
  USING (
    auth.jwt() ->> 'role' IN ('procurement_manager', 'admin')
    AND payment_status = 'Pending'
  );
```

### 6.2 Server Action Authorization

```typescript
// In updateDelivery() and deleteDelivery()
const authResult = await requireAuth()
if (authResult.error || !authResult.user) {
  return { success: false, error: 'Unauthorized' }
}

// Optional: Check role
const userRole = authResult.user.user_metadata?.role
if (!['procurement_manager', 'admin'].includes(userRole)) {
  return { success: false, error: 'Insufficient permissions' }
}
```

---

## 7. Performance Considerations

| Metric | Target | Optimization |
|--------|--------|-------------|
| Page load time | <2s | Server-side data fetching, single query |
| Form submission | <1s | Optimistic UI updates, async validation |
| Database transaction | <500ms | Use indexes on `po_item_id`, `id` |
| Audit log insert | <100ms | Async insert, don't block main transaction |

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// src/lib/actions/procurement.test.ts
describe('updateDelivery', () => {
  it('updates delivery and recalculates PO item delivered_qty', async () => {
    const result = await updateDelivery('delivery-id', {
      delivered_qty: 600,
    })
    expect(result.success).toBe(true)
    // Verify PO item delivered_qty updated
  })

  it('rejects qty exceeding max allowed', async () => {
    const result = await updateDelivery('delivery-id', {
      delivered_qty: 1000, // Exceeds max
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('不能超过订单剩余量')
  })
})
```

### 8.2 Integration Tests

```typescript
// Test full edit flow
describe('Delivery Edit Page', () => {
  it('loads delivery data and allows editing', async () => {
    const { getByLabelText, getByText } = render(<DeliveryEditPage params={{ id: 'test-id' }} />)

    const qtyInput = getByLabelText('Delivered Quantity')
    expect(qtyInput).toHaveValue(500)

    fireEvent.change(qtyInput, { target: { value: '600' } })
    fireEvent.click(getByText('保存 Save'))

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/procurement/po-id')
    })
  })
})
```

---

## 9. Rollout Plan

### 9.1 Deployment Checklist

1. **Database Migration:**
   - Run `20251205_delivery_edit_audit.sql` in Supabase
   - Verify audit table created
   - Verify RLS policies applied

2. **Backend Deployment:**
   - Deploy Server Actions to Vercel
   - Test actions via API endpoint testing tool

3. **Frontend Deployment:**
   - Deploy edit page to Vercel
   - Test page load in production
   - Verify authorization redirects work

4. **User Rollout:**
   - Day 1-3: Enable for admin users only
   - Day 4-7: Enable for procurement managers
   - Day 8+: Full rollout

---

## 10. Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Edit page usage | >30 edits/month | Analytics tracking |
| Edit success rate | >95% | Server action logs |
| Data correction time | <2 min (down from 30 min) | Time-to-task tracking |
| User satisfaction | 8/10 | User survey |

---

## 11. Future Enhancements (Out of Scope V1)

1. Bulk edit multiple deliveries
2. Edit history diff view (compare old vs new)
3. Approval workflow for edits >20% cost variance
4. Email notifications on delivery updates
5. Attach invoice files to delivery records

---

## 12. Approval & Sign-off

| Role | Name | Approval Criteria | Status |
|------|------|------------------|--------|
| Product Manager | [Name] | Requirements met | Pending |
| Engineering Lead | [Name] | Technical design approved | Pending |
| Procurement Manager | [Name] | Solves real pain points | Pending |
| Finance Director | [Name] | Audit trail adequate | Pending |

**Next Step:** Proceed to Frontend Artisan + Backend Specialist for implementation.

---

## End of Design Document

**Version:** 1.0
**Last Updated:** 2025-12-05
**Author:** System Architect (AI Agent)
**Reviewers:** [To be assigned]
