'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { startOfISOWeek } from 'date-fns'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

/**
 * Remaining delivery plan allocation
 * Used when recording actual delivery to specify planned future deliveries
 */
export interface RemainingDeliveryPlan {
  week_iso: string // "2025-W04"
  planned_qty: number // 25
}

/**
 * Enhanced delivery creation payload
 * Extends existing ProductionDeliveryInsert with remaining plan
 */
export interface DeliveryWithPlanInput {
  // Actual delivery fields
  po_item_id: string
  sku: string
  channel_code?: string | null
  delivered_qty: number // Actual delivered quantity
  actual_delivery_date: string // ISO date string
  unit_cost_usd: number
  remarks?: string | null

  // Remaining delivery plan (optional)
  remaining_plan?: RemainingDeliveryPlan[] // Array of week allocations
}

// ================================================================
// VALIDATION SCHEMAS
// ================================================================

const remainingPlanItemSchema = z.object({
  week_iso: z.string().regex(/^\d{4}-W\d{2}$/, 'Invalid ISO week format'),
  planned_qty: z.number().int().positive(),
})

const deliveryWithPlanSchema = z.object({
  po_item_id: z.string().uuid(),
  sku: z.string().min(1),
  channel_code: z.string().nullable().optional(),
  delivered_qty: z.number().int().positive(),
  actual_delivery_date: z.string(),
  unit_cost_usd: z.number().positive().max(10000),
  remarks: z.string().max(1000).nullable().optional(),
  remaining_plan: z.array(remainingPlanItemSchema).optional(),
})

// ================================================================
// HELPER FUNCTIONS
// ================================================================

/**
 * Convert ISO week to date (Monday of that week)
 * @param weekIso - "2025-W04"
 * @returns "2025-01-27"
 */
function isoWeekToDate(weekIso: string): string {
  const [yearStr, weekStr] = weekIso.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)

  // Create a date in the first week of the year
  const jan4 = new Date(year, 0, 4) // Jan 4 is always in week 1
  const monday = startOfISOWeek(jan4)

  // Add (week - 1) weeks
  monday.setDate(monday.getDate() + (week - 1) * 7)

  return monday.toISOString().split('T')[0]
}

/**
 * Generate unique delivery number with timestamp
 * @returns "DLV-{timestamp}"
 */
function generateDeliveryNumber(): string {
  const timestamp = Date.now()
  return `DLV-${timestamp}`
}

// ================================================================
// SERVER ACTIONS
// ================================================================

/**
 * Create production delivery with optional remaining delivery plan
 *
 * Business Logic:
 * 1. Insert actual delivery record (actual_delivery_date populated)
 * 2. For each remaining plan item, insert planned delivery record (planned_delivery_date populated)
 * 3. Update purchase_order_items.delivered_qty (only count actual, not planned)
 * 4. Validate total quantities don't exceed ordered_qty
 *
 * @param payload - Delivery data with optional remaining_plan
 * @returns Success/error response with delivery IDs
 */
export async function createDeliveryWithPlan(
  payload: DeliveryWithPlanInput
): Promise<{
  success: boolean
  error?: string
  data?: {
    actual_delivery_id: string
    planned_delivery_ids: string[]
  }
}> {
  try {
    // 1. Authentication check
    const authResult = await requireAuth()
    if (authResult.error) {
      return { success: false, error: authResult.error }
    }

    // 2. Validate input
    const validation = deliveryWithPlanSchema.safeParse(payload)
    if (!validation.success) {
      return {
        success: false,
        error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      }
    }

    const validatedData = validation.data
    const supabase = await createServerSupabaseClient()

    // 3. Fetch PO item to validate quantities
    const { data: poItem, error: poItemError } = await supabase
      .from('purchase_order_items')
      .select('id, po_id, ordered_qty, delivered_qty')
      .eq('id', validatedData.po_item_id)
      .single()

    if (poItemError || !poItem) {
      return { success: false, error: 'PO item not found' }
    }

    // 4. Calculate remaining quantity
    const currentDeliveredQty = poItem.delivered_qty || 0
    const newActualQty = validatedData.delivered_qty
    const remainingQty = poItem.ordered_qty - currentDeliveredQty - newActualQty

    if (remainingQty < 0) {
      return {
        success: false,
        error: `交付总量 (${currentDeliveredQty + newActualQty}) 超过订单量 (${poItem.ordered_qty})`,
      }
    }

    // 5. Validate remaining plan matches remaining quantity
    if (validatedData.remaining_plan && validatedData.remaining_plan.length > 0) {
      const plannedTotal = validatedData.remaining_plan.reduce(
        (sum, item) => sum + item.planned_qty,
        0
      )

      if (plannedTotal !== remainingQty) {
        return {
          success: false,
          error: `计划分配总量 (${plannedTotal}) 不等于剩余待出厂量 (${remainingQty})。请调整分配数量。`,
        }
      }

      // Validate each week is unique
      const weekSet = new Set(validatedData.remaining_plan.map((p) => p.week_iso))
      if (weekSet.size !== validatedData.remaining_plan.length) {
        return {
          success: false,
          error: '计划分配中存在重复的周次，请检查。',
        }
      }

      // Validate weeks are in the future
      const today = new Date()
      for (const planItem of validatedData.remaining_plan) {
        const plannedDate = new Date(isoWeekToDate(planItem.week_iso))
        if (plannedDate < today) {
          return {
            success: false,
            error: `计划周次 ${planItem.week_iso} 不能是过去的日期。`,
          }
        }
      }
    }

    // 6. Generate delivery number
    const deliveryNumber = generateDeliveryNumber()

    // 7. Insert actual delivery record
    const { data: actualDelivery, error: actualError } = await supabase
      .from('production_deliveries')
      .insert({
        delivery_number: deliveryNumber,
        po_item_id: validatedData.po_item_id,
        sku: validatedData.sku,
        channel_code: validatedData.channel_code || null,
        delivered_qty: validatedData.delivered_qty,
        actual_delivery_date: validatedData.actual_delivery_date,
        planned_delivery_date: null, // Actual record has no planned date
        unit_cost_usd: validatedData.unit_cost_usd,
        payment_status: 'Pending',
        remarks: validatedData.remarks || null,
      })
      .select('id')
      .single()

    if (actualError || !actualDelivery) {
      return {
        success: false,
        error: `Failed to create actual delivery: ${actualError?.message || 'Unknown error'}`,
      }
    }

    // 8. Insert planned delivery records (if remaining_plan provided)
    const plannedDeliveryIds: string[] = []

    if (validatedData.remaining_plan && validatedData.remaining_plan.length > 0) {
      for (const planItem of validatedData.remaining_plan) {
        const plannedDate = isoWeekToDate(planItem.week_iso)

        // Generate unique delivery number for planned record
        const plannedDeliveryNumber = `${deliveryNumber}-PLAN-${planItem.week_iso}`

        const { data: plannedDelivery, error: plannedError } = await supabase
          .from('production_deliveries')
          .insert({
            delivery_number: plannedDeliveryNumber,
            po_item_id: validatedData.po_item_id,
            sku: validatedData.sku,
            channel_code: validatedData.channel_code || null,
            delivered_qty: planItem.planned_qty,
            actual_delivery_date: null, // Planned record has no actual date yet
            planned_delivery_date: plannedDate,
            unit_cost_usd: validatedData.unit_cost_usd,
            payment_status: 'Pending',
            remarks: `自动创建：来自 ${deliveryNumber} 的剩余计划分配`,
          })
          .select('id')
          .single()

        if (plannedError || !plannedDelivery) {
          console.error(`Failed to create planned delivery for ${planItem.week_iso}:`, plannedError)
          // Don't fail the whole transaction, log and continue
          // In production, consider rolling back or using database transaction
        } else {
          plannedDeliveryIds.push(plannedDelivery.id)
        }
      }
    }

    // 9. Update purchase_order_items.delivered_qty
    // IMPORTANT: Only count actual deliveries, not planned ones
    const { data: allActualDeliveries } = await supabase
      .from('production_deliveries')
      .select('delivered_qty')
      .eq('po_item_id', validatedData.po_item_id)
      .not('actual_delivery_date', 'is', null) // Only count actual deliveries

    const newTotalDeliveredQty =
      allActualDeliveries?.reduce((sum, d) => sum + d.delivered_qty, 0) || 0

    const { error: poItemUpdateError } = await supabase
      .from('purchase_order_items')
      .update({
        delivered_qty: newTotalDeliveredQty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.po_item_id)

    if (poItemUpdateError) {
      console.error('Failed to update PO item delivered_qty:', poItemUpdateError)
      return {
        success: false,
        error: 'Cascade update failed. Please contact support.',
      }
    }

    // 10. Revalidate cache
    revalidatePath('/procurement')
    revalidatePath(`/procurement/${poItem.po_id}`)

    return {
      success: true,
      data: {
        actual_delivery_id: actualDelivery.id,
        planned_delivery_ids: plannedDeliveryIds,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to create delivery: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
