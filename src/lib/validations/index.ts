/**
 * Rolloy SCM - Zod Validation Schemas
 * Input validation for all Server Actions
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
const nonNegativeInt = z.number().int('Must be integer').min(0, 'Must be non-negative')
const positiveInt = z.number().int('Must be integer').positive('Must be positive')

// ================================================================
// ENUMS
// ================================================================

export const warehouseTypeSchema = z.enum(['FBA', '3PL'], {
  message: 'Warehouse type must be FBA or 3PL',
})

export const regionSchema = z.enum(['East', 'Central', 'West'], {
  message: 'Region must be East, Central, or West',
})

export const poStatusSchema = z.enum(
  ['Draft', 'Confirmed', 'In Production', 'Delivered', 'Cancelled'],
  {
    message: 'Invalid PO status',
  }
)

export const paymentStatusSchema = z.enum(['Pending', 'Scheduled', 'Paid'], {
  message: 'Payment status must be Pending, Scheduled, or Paid',
})

export const suggestionStatusSchema = z.enum(['Active', 'Planned', 'Ordered', 'Dismissed'], {
  message: 'Invalid suggestion status',
})

// ================================================================
// MASTER DATA VALIDATION
// ================================================================

export const productInsertSchema = z.object({
  id: uuidSchema.optional(),
  sku: skuSchema,
  spu: z.string().max(50).optional().default(''),
  color_code: z.string().max(20).optional().default(''),
  product_name: z.string().min(1, 'Product name is required').max(200, 'Product name too long'),
  category: z.string().max(100).nullable().optional(),
  unit_cost_usd: nonNegativeNumber.optional().default(0),
  unit_weight_kg: nonNegativeNumber.nullable().optional(),
  safety_stock_weeks: z
    .number()
    .int('Safety stock weeks must be integer')
    .min(0, 'Safety stock weeks must be non-negative')
    .max(52, 'Safety stock weeks cannot exceed 52')
    .optional()
    .default(4),
  is_active: z.boolean().optional().default(true),
})

export const productUpdateSchema = productInsertSchema.partial().omit({ id: true })

export const channelInsertSchema = z.object({
  id: uuidSchema.optional(),
  channel_code: z.string().min(1, 'Channel code is required').max(50, 'Channel code too long'),
  channel_name: z.string().min(1, 'Channel name is required').max(200, 'Channel name too long'),
  platform: z.string().max(100).nullable().optional(),
  region: z.string().max(50).nullable().optional(),
  is_active: z.boolean().optional().default(true),
})

export const channelUpdateSchema = channelInsertSchema.partial().omit({ id: true })

export const warehouseInsertSchema = z.object({
  id: uuidSchema.optional(),
  warehouse_code: z
    .string()
    .min(1, 'Warehouse code is required')
    .max(50, 'Warehouse code too long'),
  warehouse_name: z
    .string()
    .min(1, 'Warehouse name is required')
    .max(200, 'Warehouse name too long'),
  warehouse_type: warehouseTypeSchema,
  region: regionSchema,
  state: z.string().max(50).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  is_active: z.boolean().optional().default(true),
})

export const warehouseUpdateSchema = warehouseInsertSchema.partial().omit({ id: true })

export const supplierInsertSchema = z.object({
  id: uuidSchema.optional(),
  supplier_code: z
    .string()
    .min(1, 'Supplier code is required')
    .max(50, 'Supplier code too long'),
  supplier_name: z
    .string()
    .min(1, 'Supplier name is required')
    .max(200, 'Supplier name too long'),
  contact_name: z.string().max(100).nullable().optional(),
  contact_email: z.string().email('Invalid email format').max(100).nullable().optional(),
  contact_phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  payment_terms_days: z
    .number()
    .int('Payment terms must be integer')
    .min(0, 'Payment terms must be non-negative')
    .max(365, 'Payment terms cannot exceed 365 days')
    .optional()
    .default(60),
  is_active: z.boolean().optional().default(true),
})

export const supplierUpdateSchema = supplierInsertSchema.partial().omit({ id: true })

// ================================================================
// SALES PLANNING VALIDATION
// ================================================================

export const weeklySalesForecastInsertSchema = z.object({
  id: uuidSchema.optional(),
  year_week: yearWeekSchema,
  sku: skuSchema,
  channel_code: z.string().min(1, 'Channel code is required'),
  forecast_qty: nonNegativeInt,
  remarks: z.string().max(500).nullable().optional(),
})

export const weeklySalesForecastUpdateSchema = z.object({
  forecast_qty: nonNegativeInt.optional(),
  remarks: z.string().max(500).nullable().optional(),
})

export const weeklySalesActualInsertSchema = z.object({
  id: uuidSchema.optional(),
  year_week: yearWeekSchema,
  sku: skuSchema,
  channel_code: z.string().min(1, 'Channel code is required'),
  actual_qty: nonNegativeInt,
  remarks: z.string().max(500).nullable().optional(),
})

export const weeklySalesActualUpdateSchema = z.object({
  actual_qty: nonNegativeInt.optional(),
  remarks: z.string().max(500).nullable().optional(),
})

// Batch validation
export const batchSalesForecastsSchema = z
  .array(weeklySalesForecastInsertSchema)
  .min(1, 'At least one forecast is required')
  .max(1000, 'Cannot process more than 1000 forecasts at once')

export const batchSalesActualsSchema = z
  .array(weeklySalesActualInsertSchema)
  .min(1, 'At least one actual is required')
  .max(1000, 'Cannot process more than 1000 actuals at once')

// Copy forecasts validation
export const copyForecastsSchema = z.object({
  fromWeek: yearWeekSchema,
  toWeek: yearWeekSchema,
})

// ================================================================
// PROCUREMENT VALIDATION
// ================================================================

export const purchaseOrderInsertSchema = z.object({
  id: uuidSchema.optional(),
  po_number: z.string().min(1, 'PO number is required').max(50, 'PO number too long'),
  batch_code: z.string().min(1, 'Batch code is required').max(50, 'Batch code too long'),
  supplier_id: uuidSchema.nullable().optional(),
  po_status: poStatusSchema.optional().default('Draft'),
  planned_order_date: isoDateSchema.nullable().optional(),
  actual_order_date: isoDateSchema.nullable().optional(),
  planned_ship_date: isoDateSchema.nullable().optional(),
  remarks: z.string().max(500).nullable().optional(),
})

export const purchaseOrderItemInsertSchema = z.object({
  id: uuidSchema.optional(),
  po_id: uuidSchema,
  sku: skuSchema,
  channel_code: z.string().max(50).nullable().optional(),
  ordered_qty: positiveInt,
  delivered_qty: nonNegativeInt.optional().default(0),
  unit_price_usd: nonNegativeNumber,
})

// For creating PO with items
export const createPurchaseOrderSchema = z.object({
  order: purchaseOrderInsertSchema,
  items: z
    .array(purchaseOrderItemInsertSchema.omit({ po_id: true }))
    .min(1, 'At least one item is required'),
})

export const productionDeliveryInsertSchema = z.object({
  id: uuidSchema.optional(),
  delivery_number: z
    .string()
    .min(1, 'Delivery number is required')
    .max(50, 'Delivery number too long'),
  po_item_id: uuidSchema,
  sku: skuSchema,
  channel_code: z.string().max(50).nullable().optional(),
  delivered_qty: positiveInt,
  planned_delivery_date: isoDateSchema.nullable().optional(),
  actual_delivery_date: isoDateSchema.nullable().optional(),
  unit_cost_usd: nonNegativeNumber,
  payment_status: paymentStatusSchema.optional().default('Pending'),
  remarks: z.string().max(500).nullable().optional(),
})

// ================================================================
// LOGISTICS VALIDATION
// ================================================================

export const shipmentInsertSchema = z.object({
  id: uuidSchema.optional(),
  tracking_number: z
    .string()
    .min(1, 'Tracking number is required')
    .max(100, 'Tracking number too long'),
  production_delivery_id: uuidSchema.nullable().optional(),
  batch_code: z.string().max(50).nullable().optional(),
  logistics_batch_code: z.string().max(50).nullable().optional(),
  destination_warehouse_id: uuidSchema,
  customs_clearance: z.boolean().optional().default(false),
  logistics_plan: z.string().max(100).nullable().optional(),
  logistics_region: regionSchema.nullable().optional(),
  planned_departure_date: isoDateSchema.nullable().optional(),
  actual_departure_date: isoDateSchema.nullable().optional(),
  planned_arrival_days: positiveInt.max(365, 'Planned arrival days cannot exceed 365').nullable().optional(),
  planned_arrival_date: isoDateSchema.nullable().optional(),
  actual_arrival_date: isoDateSchema.nullable().optional(),
  weight_kg: positiveNumber.nullable().optional(),
  unit_count: positiveInt.nullable().optional(),
  cost_per_kg_usd: nonNegativeNumber.nullable().optional(),
  surcharge_usd: nonNegativeNumber.optional().default(0),
  tax_refund_usd: nonNegativeNumber.optional().default(0),
  payment_status: paymentStatusSchema.optional().default('Pending'),
  remarks: z.string().max(500).nullable().optional(),
})

export const shipmentItemInsertSchema = z.object({
  id: uuidSchema.optional(),
  shipment_id: uuidSchema,
  sku: skuSchema,
  shipped_qty: positiveInt,
})

// For creating shipment with items
export const createShipmentSchema = z.object({
  shipment: shipmentInsertSchema.omit({ id: true }),
  items: z
    .array(shipmentItemInsertSchema.omit({ id: true, shipment_id: true }))
    .min(1, 'At least one item is required'),
})

// ================================================================
// INVENTORY VALIDATION
// ================================================================

export const inventorySnapshotUpsertSchema = z.object({
  sku: skuSchema,
  warehouse_id: uuidSchema,
  qty_on_hand: nonNegativeInt,
  last_counted_at: z.string().datetime().nullable().optional(),
})

export const batchInventorySnapshotsSchema = z
  .array(inventorySnapshotUpsertSchema)
  .min(1, 'At least one inventory update is required')
  .max(1000, 'Cannot process more than 1000 inventory updates at once')

// ================================================================
// FINANCE VALIDATION
// ================================================================

export const updatePaymentStatusSchema = z.object({
  id: uuidSchema,
  status: paymentStatusSchema,
})

export const batchUpdatePaymentStatusSchema = z.object({
  items: z
    .array(
      z.object({
        id: uuidSchema,
        type: z.enum(['procurement', 'logistics'], {
          message: 'Type must be procurement or logistics',
        }),
      })
    )
    .min(1, 'At least one item is required'),
  status: paymentStatusSchema,
})

// ================================================================
// DELETION VALIDATION
// ================================================================

export const deleteBySkuSchema = z.object({
  sku: skuSchema,
})

export const deleteByIdSchema = z.object({
  id: uuidSchema,
})

export const deleteByCodeSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50, 'Code too long'),
})

export const deleteSalesForecastSchema = z.object({
  yearWeek: yearWeekSchema,
  sku: skuSchema,
  channelCode: z.string().min(1, 'Channel code is required'),
})

export const deleteInventorySnapshotSchema = z.object({
  sku: skuSchema,
  warehouseId: uuidSchema,
})

// ================================================================
// TYPE EXPORTS (for TypeScript usage)
// ================================================================

export type ProductInsertInput = z.infer<typeof productInsertSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>
export type ChannelInsertInput = z.infer<typeof channelInsertSchema>
export type ChannelUpdateInput = z.infer<typeof channelUpdateSchema>
export type WarehouseInsertInput = z.infer<typeof warehouseInsertSchema>
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateSchema>
export type SupplierInsertInput = z.infer<typeof supplierInsertSchema>
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>
export type WeeklySalesForecastInsertInput = z.infer<typeof weeklySalesForecastInsertSchema>
export type WeeklySalesActualInsertInput = z.infer<typeof weeklySalesActualInsertSchema>
export type PurchaseOrderInsertInput = z.infer<typeof purchaseOrderInsertSchema>
export type PurchaseOrderItemInsertInput = z.infer<typeof purchaseOrderItemInsertSchema>
export type ProductionDeliveryInsertInput = z.infer<typeof productionDeliveryInsertSchema>
export type ShipmentInsertInput = z.infer<typeof shipmentInsertSchema>
export type ShipmentItemInsertInput = z.infer<typeof shipmentItemInsertSchema>
export type InventorySnapshotUpsertInput = z.infer<typeof inventorySnapshotUpsertSchema>
