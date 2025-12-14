/**
 * Rolloy SCM V3 - Simulation Engine Validation Schemas
 * Zod schemas for validating simulation inputs
 */

import { z } from 'zod'

// ================================================================
// COMMON PATTERNS
// ================================================================

const uuidSchema = z.string().uuid('Invalid UUID format')
const skuSchema = z.string().min(1, 'SKU is required').max(50, 'SKU too long')
const yearWeekSchema = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'Format must be YYYY-WNN (e.g., 2025-W49)')
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD')
const positiveNumber = z.number().positive('Must be positive')
const nonNegativeNumber = z.number().min(0, 'Must be non-negative')

// ================================================================
// ENUMS
// ================================================================

export const shippingModeSchema = z.enum(['Sea', 'Air', 'Express'], {
  message: 'Shipping mode must be Sea, Air, or Express',
})

export const skuTierCodeSchema = z.enum(['HERO', 'STANDARD', 'ACCESSORY'], {
  message: 'SKU tier must be HERO, STANDARD, or ACCESSORY',
})

export const capitalPeriodTypeSchema = z.enum(['monthly', 'quarterly'], {
  message: 'Period type must be monthly or quarterly',
})

export const timeHorizonSchema = z.union([
  z.literal(12),
  z.literal(26),
  z.literal(52),
], {
  message: 'Time horizon must be 12, 26, or 52 weeks',
})

// ================================================================
// SCENARIO PARAMETERS
// ================================================================

/**
 * Validation schema for ScenarioParameters
 */
export const simulationParamsSchema = z.object({
  // Demand modifiers
  sales_lift_percent: z
    .number()
    .min(-50, 'Sales lift cannot be less than -50%')
    .max(100, 'Sales lift cannot exceed 100%')
    .default(0),

  sku_scope: z
    .array(skuTierCodeSchema)
    .min(1, 'At least one SKU tier must be selected')
    .default(['HERO', 'STANDARD', 'ACCESSORY']),

  // Lead time modifiers
  production_lead_adjustment_weeks: z
    .number()
    .min(-2, 'Lead time adjustment cannot be less than -2 weeks')
    .max(4, 'Lead time adjustment cannot exceed 4 weeks')
    .default(0),

  shipping_mode_override: shippingModeSchema.nullable().default(null),

  // Capital constraint settings
  capital_constraint_enabled: z.boolean().default(false),

  capital_cap_usd: z
    .number()
    .positive('Budget cap must be positive')
    .nullable()
    .default(null),

  capital_period: capitalPeriodTypeSchema.default('monthly'),

  // Filtering
  sku_filter: z.array(skuSchema).nullable().default(null),

  warehouse_filter: z.array(uuidSchema).nullable().default(null),

  // Time horizon
  time_horizon_weeks: timeHorizonSchema.default(12),

  // Optional: specific POs/shipments to modify
  po_ids_to_simulate: z.array(uuidSchema).optional(),

  shipment_ids_to_simulate: z.array(uuidSchema).optional(),
}).refine(
  (data) => {
    // If capital constraint is enabled, cap must be provided
    if (data.capital_constraint_enabled && !data.capital_cap_usd) {
      return false
    }
    return true
  },
  {
    message: 'Budget cap is required when capital constraint is enabled',
    path: ['capital_cap_usd'],
  }
)

// ================================================================
// EXECUTION REQUEST
// ================================================================

/**
 * Validation schema for ExecuteScenarioRequest
 */
export const executeScenarioRequestSchema = z.object({
  scenario_hash: z
    .string()
    .min(1, 'Scenario hash is required')
    .max(64, 'Scenario hash too long'),

  confirmation_token: uuidSchema,

  selected_action_ids: z
    .array(uuidSchema)
    .min(1, 'At least one action must be selected'),
})

// ================================================================
// ROLLBACK REQUEST
// ================================================================

/**
 * Validation schema for RollbackRequest
 */
export const rollbackRequestSchema = z.object({
  execution_id: uuidSchema,

  reason: z
    .string()
    .min(1, 'Rollback reason is required')
    .max(500, 'Reason too long'),
})

// ================================================================
// REFERENCE DATA MANAGEMENT
// ================================================================

/**
 * Validation schema for updating product tier
 */
export const updateProductTierSchema = z.object({
  sku: skuSchema,
  tier_code: skuTierCodeSchema,
})

/**
 * Validation schema for bulk updating product tiers
 */
export const bulkUpdateTiersSchema = z.object({
  updates: z
    .array(
      z.object({
        sku: skuSchema,
        tier: skuTierCodeSchema,
      })
    )
    .min(1, 'At least one update is required')
    .max(100, 'Maximum 100 updates per batch'),
})

/**
 * Validation schema for deleting capital constraint
 */
export const deleteCapitalConstraintSchema = z.object({
  id: uuidSchema,
})

/**
 * Validation schema for deleting logistics route
 */
export const deleteLogisticsRouteSchema = z.object({
  id: uuidSchema,
})

/**
 * Validation schema for updating logistics route
 */
export const updateLogisticsRouteByIdSchema = z.object({
  id: uuidSchema,
  transit_time_weeks: z.number().positive().max(52).optional(),
  cost_per_kg_usd: positiveNumber.optional(),
  is_active: z.boolean().optional(),
  route_name: z.string().min(1).max(100).optional(),
  minimum_charge_usd: nonNegativeNumber.optional(),
}).refine(
  (data) => {
    // At least one field to update
    return (
      data.transit_time_weeks !== undefined ||
      data.cost_per_kg_usd !== undefined ||
      data.is_active !== undefined ||
      data.route_name !== undefined ||
      data.minimum_charge_usd !== undefined
    )
  },
  {
    message: 'At least one field must be provided for update',
  }
)

/**
 * Validation schema for upserting capital constraint
 */
export const upsertCapitalConstraintSchema = z.object({
  period_type: capitalPeriodTypeSchema,

  period_key: z
    .string()
    .min(1, 'Period key is required')
    .refine(
      (val) => {
        // Monthly: YYYY-MM
        const monthlyPattern = /^\d{4}-(0[1-9]|1[0-2])$/
        // Quarterly: YYYY-QN
        const quarterlyPattern = /^\d{4}-Q[1-4]$/
        return monthlyPattern.test(val) || quarterlyPattern.test(val)
      },
      {
        message: 'Period key must be YYYY-MM for monthly or YYYY-QN for quarterly',
      }
    ),

  budget_cap_usd: positiveNumber,

  is_active: z.boolean().default(true),

  notes: z.string().max(500).nullable().default(null),

  created_by: uuidSchema.nullable().optional(),

  updated_by: uuidSchema.nullable().optional(),
})

/**
 * Validation schema for creating logistics route
 */
export const createLogisticsRouteSchema = z.object({
  route_code: z
    .string()
    .min(1, 'Route code is required')
    .max(30, 'Route code too long')
    .regex(/^[A-Z0-9-]+$/, 'Route code must be uppercase alphanumeric with hyphens'),

  route_name: z
    .string()
    .min(1, 'Route name is required')
    .max(100, 'Route name too long'),

  origin_country: z
    .string()
    .length(2, 'Origin country must be 2-letter ISO code')
    .toUpperCase(),

  origin_city: z.string().max(50).nullable().default(null),

  destination_region: z
    .string()
    .min(1, 'Destination region is required')
    .max(30, 'Destination region too long'),

  destination_country: z
    .string()
    .length(2, 'Destination country must be 2-letter ISO code')
    .nullable()
    .default(null),

  shipping_mode: shippingModeSchema,

  transit_time_weeks: z
    .number()
    .positive('Transit time must be positive')
    .max(52, 'Transit time cannot exceed 52 weeks'),

  cost_per_kg_usd: positiveNumber,

  minimum_charge_usd: nonNegativeNumber.default(0),

  is_active: z.boolean().default(true),

  is_default: z.boolean().default(false),
})

/**
 * Validation schema for updating logistics route
 */
export const updateLogisticsRouteSchema = createLogisticsRouteSchema.partial().omit({
  route_code: true,
})

// ================================================================
// ACTION PAYLOADS
// ================================================================

/**
 * Validation schema for CreatePOPayload
 */
export const createPOPayloadSchema = z.object({
  sku: skuSchema,

  suggested_qty: z
    .number()
    .int('Quantity must be integer')
    .positive('Quantity must be positive'),

  unit_price_usd: nonNegativeNumber,

  order_deadline: isoDateSchema,

  expected_delivery_week: yearWeekSchema,
})

/**
 * Validation schema for UpdateShipmentPayload
 */
export const updateShipmentPayloadSchema = z.object({
  shipment_id: uuidSchema,

  current_mode: shippingModeSchema,

  new_mode: shippingModeSchema,

  cost_delta: z.number(),

  time_saved_weeks: z.number(),
})

/**
 * Validation schema for DeferPOPayload
 */
export const deferPOPayloadSchema = z.object({
  po_id: uuidSchema,

  current_order_date: isoDateSchema,

  new_order_date: isoDateSchema,

  defer_to_period: z.string().min(1),
})

// ================================================================
// TYPE EXPORTS
// ================================================================

export type SimulationParamsInput = z.infer<typeof simulationParamsSchema>
export type ExecuteScenarioRequestInput = z.infer<typeof executeScenarioRequestSchema>
export type RollbackRequestInput = z.infer<typeof rollbackRequestSchema>
export type UpdateProductTierInput = z.infer<typeof updateProductTierSchema>
export type BulkUpdateTiersInput = z.infer<typeof bulkUpdateTiersSchema>
export type UpsertCapitalConstraintInput = z.infer<typeof upsertCapitalConstraintSchema>
export type DeleteCapitalConstraintInput = z.infer<typeof deleteCapitalConstraintSchema>
export type CreateLogisticsRouteInput = z.infer<typeof createLogisticsRouteSchema>
export type UpdateLogisticsRouteInput = z.infer<typeof updateLogisticsRouteSchema>
export type UpdateLogisticsRouteByIdInput = z.infer<typeof updateLogisticsRouteByIdSchema>
export type DeleteLogisticsRouteInput = z.infer<typeof deleteLogisticsRouteSchema>
export type CreatePOPayloadInput = z.infer<typeof createPOPayloadSchema>
export type UpdateShipmentPayloadInput = z.infer<typeof updateShipmentPayloadSchema>
export type DeferPOPayloadInput = z.infer<typeof deferPOPayloadSchema>
