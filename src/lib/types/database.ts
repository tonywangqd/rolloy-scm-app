/**
 * Rolloy SCM System - Database Type Definitions
 * Generated from PostgreSQL schema
 */

// ================================================================
// ENUMS
// ================================================================

export type WarehouseType = 'FBA' | '3PL'
export type Region = 'East' | 'Central' | 'West'
export type POStatus = 'Draft' | 'Confirmed' | 'In Production' | 'Delivered' | 'Cancelled'
export type PaymentStatus = 'Pending' | 'Scheduled' | 'Paid'
export type StockStatus = 'Stockout' | 'Risk' | 'OK'
export type SuggestionStatus = 'Active' | 'Planned' | 'Ordered' | 'Dismissed'
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'
export type FulfillmentStatus = 'pending' | 'partial' | 'fulfilled' | 'short_closed'

// Balance Management Types
export type BalanceResolutionStatus = 'pending' | 'deferred' | 'short_closed' | 'fulfilled' | 'cancelled'
export type BalanceResolutionAction = 'defer' | 'create_carryover' | 'short_close' | 'auto_fulfilled'
export type BalanceSourceType = 'po_item' | 'delivery' | 'shipment_item'
export type InventoryAdjustmentType = 'cycle_count' | 'logistics_loss' | 'shipping_damage' | 'quality_hold' | 'theft' | 'found' | 'system_correction' | 'supplier_overage' | 'manual'
export type ShipmentStatus = 'draft' | 'in_transit' | 'arrived' | 'finalized' | 'cancelled'
export type DeliveryShipmentStatus = 'unshipped' | 'partial' | 'fully_shipped'

// Forecast-Order Linkage Types
export type ForecastCoverageStatus = 'UNCOVERED' | 'PARTIALLY_COVERED' | 'FULLY_COVERED' | 'OVER_COVERED' | 'CLOSED'
export type VarianceType = 'increase' | 'decrease'
export type ResolutionAction =
  | 'create_supplemental_order'
  | 'reallocate_to_future'
  | 'accept_as_safety_stock'
  | 'cancel_excess'
  | 'pending_review'
export type ResolutionStatus = 'pending' | 'resolved' | 'cancelled'
export type AllocationType = 'manual' | 'auto'

// ================================================================
// DATABASE TYPES (for Supabase client typing)
// ================================================================

export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product
        Insert: ProductInsert
        Update: ProductUpdate
      }
      channels: {
        Row: Channel
        Insert: ChannelInsert
        Update: ChannelUpdate
      }
      warehouses: {
        Row: Warehouse
        Insert: WarehouseInsert
        Update: WarehouseUpdate
      }
      suppliers: {
        Row: Supplier
        Insert: SupplierInsert
        Update: SupplierUpdate
      }
      sales_forecasts: {
        Row: SalesForecast
        Insert: SalesForecastInsert
        Update: SalesForecastUpdate
      }
      sales_actuals: {
        Row: SalesActual
        Insert: SalesActualInsert
        Update: SalesActualUpdate
      }
      inventory_snapshots: {
        Row: InventorySnapshot
        Insert: InventorySnapshotInsert
        Update: InventorySnapshotUpdate
      }
      purchase_orders: {
        Row: PurchaseOrder
        Insert: PurchaseOrderInsert
        Update: PurchaseOrderUpdate
      }
      purchase_order_items: {
        Row: PurchaseOrderItem
        Insert: PurchaseOrderItemInsert
        Update: PurchaseOrderItemUpdate
      }
      production_deliveries: {
        Row: ProductionDelivery
        Insert: ProductionDeliveryInsert
        Update: ProductionDeliveryUpdate
      }
      shipments: {
        Row: Shipment
        Insert: ShipmentInsert
        Update: ShipmentUpdate
      }
      shipment_items: {
        Row: ShipmentItem
        Insert: ShipmentItemInsert
        Update: ShipmentItemUpdate
      }
      inventory_projections: {
        Row: InventoryProjection
        Insert: InventoryProjectionInsert
        Update: InventoryProjectionUpdate
      }
      replenishment_suggestions: {
        Row: ReplenishmentSuggestion
        Insert: ReplenishmentSuggestionInsert
        Update: ReplenishmentSuggestionUpdate
      }
      forecast_order_allocations: {
        Row: ForecastOrderAllocation
        Insert: ForecastOrderAllocationInsert
        Update: ForecastOrderAllocationUpdate
      }
      forecast_variance_resolutions: {
        Row: ForecastVarianceResolution
        Insert: ForecastVarianceResolutionInsert
        Update: ForecastVarianceResolutionUpdate
      }
      delivery_deletion_audit_log: {
        Row: DeliveryDeletionAuditLog
        Insert: DeliveryDeletionAuditLogInsert
        Update: never
      }
      delivery_shipment_allocations: {
        Row: DeliveryShipmentAllocation
        Insert: DeliveryShipmentAllocationInsert
        Update: DeliveryShipmentAllocationUpdate
      }
    }
    Views: {
      v_inventory_summary: {
        Row: InventorySummaryView
      }
      v_pending_payables: {
        Row: PendingPayablesView
      }
      v_po_fulfillment: {
        Row: POFulfillmentView
      }
      v_weekly_sales: {
        Row: WeeklySalesView
      }
      v_inventory_projection_12weeks: {
        Row: InventoryProjection12WeeksView
      }
      v_replenishment_suggestions: {
        Row: ReplenishmentSuggestionView
      }
      v_po_deliveries_summary: {
        Row: PODeliveriesSummaryView
      }
      v_forecast_coverage: {
        Row: ForecastCoverageView
      }
      v_variance_pending_actions: {
        Row: VariancePendingActionsView
      }
      v_unshipped_deliveries: {
        Row: UnshippedDeliveriesView
      }
    }
    Functions: {
      get_next_po_number: {
        Args: { order_date?: string }
        Returns: string
      }
      get_next_delivery_number: {
        Args: { delivery_date?: string }
        Returns: string
      }
      validate_po_number_format: {
        Args: { po_num: string }
        Returns: boolean
      }
      get_deliveries_by_po: {
        Args: { po_id_param: string }
        Returns: DeliveryDetail[]
      }
      get_deliveries_by_sku: {
        Args: {
          sku_param: string
          start_date?: string
          end_date?: string
        }
        Returns: DeliveryBySKU[]
      }
      create_purchase_order_with_items: {
        Args: {
          p_po_number: string
          p_batch_code: string
          p_supplier_id?: string
          p_planned_order_date?: string
          p_actual_order_date?: string
          p_planned_ship_date?: string
          p_po_status?: string
          p_remarks?: string
          p_items?: unknown
        }
        Returns: {
          success: boolean
          po_id: string | null
          error_message: string | null
        }[]
      }
      create_shipment_with_items: {
        Args: {
          p_tracking_number: string
          p_batch_code?: string
          p_logistics_batch_code?: string
          p_destination_warehouse_id?: string
          p_customs_clearance?: boolean
          p_logistics_plan?: string
          p_logistics_region?: string
          p_planned_departure_date?: string
          p_actual_departure_date?: string
          p_planned_arrival_days?: number
          p_planned_arrival_date?: string
          p_actual_arrival_date?: string
          p_weight_kg?: number
          p_unit_count?: number
          p_cost_per_kg_usd?: number
          p_surcharge_usd?: number
          p_tax_refund_usd?: number
          p_remarks?: string
          p_items?: unknown
        }
        Returns: {
          success: boolean
          shipment_id: string | null
          error_message: string | null
        }[]
      }
      delete_production_delivery: {
        Args: {
          p_delivery_id: string
          p_deleted_by: string
          p_deletion_reason?: string
        }
        Returns: {
          success: boolean
          error_code: string | null
          error_message: string | null
        }[]
      }
      auto_allocate_forecast_to_po_item: {
        Args: {
          p_po_item_id: string
          p_allocated_by: string
        }
        Returns: {
          forecast_id: string
          allocated_qty: number
          week_iso: string
        }[]
      }
      validate_delivery_allocation: {
        Args: {
          p_delivery_id: string
          p_new_shipped_qty: number
          p_exclude_shipment_id?: string | null
        }
        Returns: {
          is_valid: boolean
          error_message: string
          delivered_qty: number
          existing_shipped_qty: number
          available_qty: number
        }[]
      }
      create_shipment_with_delivery_allocations: {
        Args: {
          p_tracking_number: string
          p_batch_code?: string | null
          p_logistics_batch_code?: string | null
          p_destination_warehouse_id?: string | null
          p_customs_clearance?: boolean
          p_logistics_plan?: string | null
          p_logistics_region?: string | null
          p_planned_departure_date?: string | null
          p_actual_departure_date?: string | null
          p_planned_arrival_days?: number | null
          p_planned_arrival_date?: string | null
          p_actual_arrival_date?: string | null
          p_weight_kg?: number | null
          p_unit_count?: number | null
          p_cost_per_kg_usd?: number | null
          p_surcharge_usd?: number
          p_tax_refund_usd?: number
          p_remarks?: string | null
          p_allocations?: unknown
        }
        Returns: {
          success: boolean
          shipment_id: string | null
          error_message: string | null
        }[]
      }
      get_delivery_allocations: {
        Args: {
          p_delivery_id: string
        }
        Returns: {
          shipment_id: string
          tracking_number: string
          shipped_qty: number
          allocated_at: string
          actual_departure_date: string | null
          planned_arrival_date: string | null
          actual_arrival_date: string | null
          remarks: string | null
        }[]
      }
      get_shipment_source_deliveries: {
        Args: {
          p_shipment_id: string
        }
        Returns: {
          delivery_id: string
          delivery_number: string
          po_number: string
          batch_code: string
          sku: string
          shipped_qty: number
          delivered_qty: number
          delivery_date: string | null
          supplier_name: string | null
          remarks: string | null
        }[]
      }
    }
  }
}

// ================================================================
// MASTER DATA TYPES
// ================================================================

export interface Product {
  id: string
  sku: string
  spu: string
  color_code: string
  product_name: string
  category: string | null
  unit_cost_usd: number
  unit_weight_kg: number | null
  safety_stock_weeks: number
  production_lead_weeks: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductInsert {
  id?: string
  sku: string
  spu?: string
  color_code?: string
  product_name: string
  category?: string | null
  unit_cost_usd?: number
  unit_weight_kg?: number | null
  safety_stock_weeks?: number
  production_lead_weeks?: number
  is_active?: boolean
}

export interface ProductUpdate {
  sku?: string
  spu?: string
  color_code?: string
  product_name?: string
  category?: string | null
  unit_cost_usd?: number
  unit_weight_kg?: number | null
  safety_stock_weeks?: number
  production_lead_weeks?: number
  is_active?: boolean
}

export interface Channel {
  id: string
  channel_code: string
  channel_name: string
  platform: string | null
  region: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ChannelInsert {
  id?: string
  channel_code: string
  channel_name: string
  platform?: string | null
  region?: string | null
  is_active?: boolean
}

export interface ChannelUpdate {
  channel_code?: string
  channel_name?: string
  platform?: string | null
  region?: string | null
  is_active?: boolean
}

export interface Warehouse {
  id: string
  warehouse_code: string
  warehouse_name: string
  warehouse_type: WarehouseType
  region: Region
  state: string | null
  postal_code: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface WarehouseInsert {
  id?: string
  warehouse_code: string
  warehouse_name: string
  warehouse_type: WarehouseType
  region: Region
  state?: string | null
  postal_code?: string | null
  is_active?: boolean
}

export interface WarehouseUpdate {
  warehouse_code?: string
  warehouse_name?: string
  warehouse_type?: WarehouseType
  region?: Region
  state?: string | null
  postal_code?: string | null
  is_active?: boolean
}

export interface Supplier {
  id: string
  supplier_code: string
  supplier_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  payment_terms_days: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SupplierInsert {
  id?: string
  supplier_code: string
  supplier_name: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  address?: string | null
  payment_terms_days?: number
  is_active?: boolean
}

export interface SupplierUpdate {
  supplier_code?: string
  supplier_name?: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  address?: string | null
  payment_terms_days?: number
  is_active?: boolean
}

// ================================================================
// SALES DATA TYPES
// ================================================================

export interface SalesForecast {
  id: string
  sku: string
  channel_code: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  forecast_qty: number
  is_closed: boolean
  closed_at: string | null
  closed_by: string | null
  close_reason: string | null
  created_at: string
  updated_at: string
}

export interface SalesForecastInsert {
  id?: string
  sku: string
  channel_code: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  forecast_qty?: number
}

export interface SalesForecastUpdate {
  forecast_qty?: number
}

export interface SalesActual {
  id: string
  sku: string
  channel_code: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  actual_qty: number
  created_at: string
  updated_at: string
}

export interface SalesActualInsert {
  id?: string
  sku: string
  channel_code: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  actual_qty: number
}

export interface SalesActualUpdate {
  actual_qty?: number
}

export interface InventorySnapshot {
  id: string
  sku: string
  warehouse_id: string
  qty_on_hand: number
  last_counted_at: string | null
  created_at: string
  updated_at: string
}

export interface InventorySnapshotInsert {
  id?: string
  sku: string
  warehouse_id: string
  qty_on_hand?: number
  last_counted_at?: string | null
}

export interface InventorySnapshotUpdate {
  qty_on_hand?: number
  last_counted_at?: string | null
}

export interface PurchaseOrder {
  id: string
  po_number: string
  batch_code: string
  supplier_id: string | null
  po_status: POStatus
  planned_order_date: string | null
  actual_order_date: string | null
  planned_ship_date: string | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrderInsert {
  id?: string
  po_number: string
  batch_code: string
  supplier_id?: string | null
  po_status?: POStatus
  planned_order_date?: string | null
  actual_order_date?: string | null
  planned_ship_date?: string | null
  remarks?: string | null
}

export interface PurchaseOrderUpdate {
  po_number?: string
  batch_code?: string
  supplier_id?: string | null
  po_status?: POStatus
  planned_order_date?: string | null
  actual_order_date?: string | null
  planned_ship_date?: string | null
  remarks?: string | null
}

export interface PurchaseOrderItem {
  id: string
  po_id: string
  sku: string
  channel_code: string | null
  ordered_qty: number
  delivered_qty: number
  unit_price_usd: number
  created_at: string
  updated_at: string
}

export interface PurchaseOrderItemInsert {
  id?: string
  po_id: string
  sku: string
  channel_code?: string | null
  ordered_qty: number
  delivered_qty?: number
  unit_price_usd: number
}

export interface PurchaseOrderItemUpdate {
  ordered_qty?: number
  delivered_qty?: number
  unit_price_usd?: number
  channel_code?: string | null
}

export interface ProductionDelivery {
  id: string
  delivery_number: string
  po_item_id: string
  sku: string
  channel_code: string | null
  delivered_qty: number
  planned_delivery_date: string | null
  actual_delivery_date: string | null
  unit_cost_usd: number
  // Computed fields
  delivery_month: string | null
  total_value_usd: number | null
  payment_due_date: string | null
  payment_month: string | null
  payment_status: PaymentStatus
  remarks: string | null
  // Shipment tracking fields (new)
  shipped_qty: number
  shipment_status: DeliveryShipmentStatus
  created_at: string
  updated_at: string
}

export interface ProductionDeliveryInsert {
  id?: string
  delivery_number: string
  po_item_id: string
  sku: string
  channel_code?: string | null
  delivered_qty: number
  planned_delivery_date?: string | null
  actual_delivery_date?: string | null
  unit_cost_usd: number
  payment_status?: PaymentStatus
  remarks?: string | null
}

export interface ProductionDeliveryUpdate {
  delivered_qty?: number
  planned_delivery_date?: string | null
  actual_delivery_date?: string | null
  unit_cost_usd?: number
  payment_status?: PaymentStatus
  remarks?: string | null
}

// ================================================================
// REMAINING DELIVERY PLAN TYPES
// ================================================================

/**
 * Remaining delivery plan allocation
 * Used when recording actual delivery to specify planned future deliveries
 */
export interface RemainingDeliveryPlan {
  week_iso: string          // "2025-W04"
  planned_qty: number       // 25
  planned_date?: string     // "2025-01-27" (computed from week_iso)
}

/**
 * Enhanced delivery creation payload
 * Extends existing ProductionDeliveryInsert with remaining plan
 */
export interface DeliveryWithPlanInsert {
  // Actual delivery fields (existing)
  delivery_number: string
  po_item_id: string
  sku: string
  channel_code?: string | null
  delivered_qty: number              // Actual delivered quantity
  actual_delivery_date: string       // ISO date string
  unit_cost_usd: number
  payment_status?: PaymentStatus
  remarks?: string | null

  // NEW: Remaining delivery plan (optional)
  remaining_plan?: RemainingDeliveryPlan[]  // Array of week allocations
}

export interface Shipment {
  id: string
  tracking_number: string
  production_delivery_id: string | null
  batch_code: string | null
  logistics_batch_code: string | null
  destination_warehouse_id: string
  customs_clearance: boolean
  logistics_plan: string | null
  logistics_region: Region | null
  planned_departure_date: string | null
  actual_departure_date: string | null
  planned_arrival_days: number | null
  planned_arrival_date: string | null
  actual_arrival_date: string | null
  weight_kg: number | null
  unit_count: number | null
  cost_per_kg_usd: number | null
  surcharge_usd: number
  tax_refund_usd: number
  // Computed fields
  actual_transit_days: number | null
  effective_arrival_date: string | null
  arrival_week_iso: string | null
  freight_cost_usd: number | null
  total_cost_usd: number | null
  payment_due_date: string | null
  payment_month: string | null
  payment_status: PaymentStatus
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface ShipmentInsert {
  id?: string
  tracking_number: string
  production_delivery_id?: string | null
  batch_code?: string | null
  logistics_batch_code?: string | null
  destination_warehouse_id: string
  customs_clearance?: boolean
  logistics_plan?: string | null
  logistics_region?: Region | null
  planned_departure_date?: string | null
  actual_departure_date?: string | null
  planned_arrival_days?: number | null
  planned_arrival_date?: string | null
  actual_arrival_date?: string | null
  weight_kg?: number | null
  unit_count?: number | null
  cost_per_kg_usd?: number | null
  surcharge_usd?: number
  tax_refund_usd?: number
  payment_status?: PaymentStatus
  remarks?: string | null
}

export interface ShipmentUpdate {
  tracking_number?: string
  destination_warehouse_id?: string
  customs_clearance?: boolean
  logistics_plan?: string | null
  logistics_region?: Region | null
  planned_departure_date?: string | null
  actual_departure_date?: string | null
  planned_arrival_days?: number | null
  planned_arrival_date?: string | null
  actual_arrival_date?: string | null
  weight_kg?: number | null
  unit_count?: number | null
  cost_per_kg_usd?: number | null
  surcharge_usd?: number
  tax_refund_usd?: number
  payment_status?: PaymentStatus
  remarks?: string | null
}

export interface ShipmentItem {
  id: string
  shipment_id: string
  sku: string
  shipped_qty: number
  created_at: string
  updated_at: string
}

export interface ShipmentItemInsert {
  id?: string
  shipment_id: string
  sku: string
  shipped_qty: number
}

export interface ShipmentItemUpdate {
  shipped_qty?: number
}

// ================================================================
// COMPUTED/PROJECTION TYPES
// ================================================================

export interface InventoryProjection {
  id: string
  sku: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  start_stock: number
  incoming_qty: number
  sales_forecast: number
  sales_actual: number | null
  safety_stock_threshold: number
  // Computed fields
  effective_sales: number | null
  end_stock: number | null
  stock_status: StockStatus | null
  calculated_at: string
}

export interface InventoryProjectionInsert {
  id?: string
  sku: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  start_stock: number
  incoming_qty?: number
  sales_forecast?: number
  sales_actual?: number | null
  safety_stock_threshold: number
}

export interface InventoryProjectionUpdate {
  start_stock?: number
  incoming_qty?: number
  sales_forecast?: number
  sales_actual?: number | null
  safety_stock_threshold?: number
}

export interface ReplenishmentSuggestion {
  id: string
  sku: string
  risk_week_iso: string
  suggested_order_qty: number
  order_deadline_week: string
  order_deadline_date: string
  ship_deadline_week: string
  ship_deadline_date: string
  priority: Priority | null
  suggestion_status: SuggestionStatus
  created_at: string
  updated_at: string
}

export interface ReplenishmentSuggestionInsert {
  id?: string
  sku: string
  risk_week_iso: string
  suggested_order_qty: number
  order_deadline_week: string
  order_deadline_date: string
  ship_deadline_week: string
  ship_deadline_date: string
  suggestion_status?: SuggestionStatus
}

export interface ReplenishmentSuggestionUpdate {
  suggested_order_qty?: number
  suggestion_status?: SuggestionStatus
}

// ================================================================
// VIEW TYPES
// ================================================================

export interface InventorySummaryView {
  sku: string
  product_name: string
  spu: string
  unit_cost_usd: number
  total_stock: number
  stock_value_usd: number
  warehouse_count: number
  last_counted: string | null
}

export interface PendingPayablesView {
  payment_month: string
  payable_type: 'Procurement' | 'Logistics'
  record_count: number
  total_amount_usd: number
}

export interface POFulfillmentView {
  po_id: string
  po_number: string
  batch_code: string
  po_status: POStatus
  actual_order_date: string | null
  supplier_name: string | null
  line_item_count: number
  total_ordered: number
  total_delivered: number
  remaining_qty: number
  fulfillment_percentage: number
}

export interface WeeklySalesView {
  sku: string
  channel_code: string
  week_iso: string
  forecast_qty: number
  actual_qty: number | null
  effective_qty: number
}

export interface InventoryProjection12WeeksView {
  sku: string
  product_name: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  week_offset: number
  opening_stock: number
  incoming_qty: number
  effective_sales: number
  forecast_qty: number
  actual_qty: number
  closing_stock: number
  safety_stock_threshold: number
  stock_status: 'Stockout' | 'Risk' | 'OK'
  weeks_until_stockout: number | null
  calculated_at: string
}

export interface ReplenishmentSuggestionView {
  sku: string
  product_name: string
  risk_week_iso: string
  risk_week_start: string
  risk_week_end: string
  suggested_order_qty: number
  order_deadline_week: string
  order_deadline_date: string
  ship_deadline_week: string
  ship_deadline_date: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  opening_stock: number
  closing_stock: number
  safety_stock_threshold: number
  effective_sales: number
  stock_status: 'Stockout' | 'Risk' | 'OK'
  is_overdue: boolean
  days_until_deadline: number
  calculated_at: string
}

export interface PODeliveriesSummaryView {
  po_id: string
  po_number: string
  batch_code: string
  po_status: POStatus
  actual_order_date: string | null
  supplier_name: string | null
  po_item_id: string
  sku: string
  channel_code: string | null
  ordered_qty: number
  total_delivered_qty: number
  sum_delivery_qty: number
  delivery_count: number
  remaining_qty: number
  fulfillment_percentage: number
  latest_delivery_date: string | null
  total_delivered_value_usd: number
  payment_statuses: PaymentStatus[] | null
}

export interface DeliveryDetail {
  delivery_id: string
  delivery_number: string
  sku: string
  channel_code: string | null
  delivered_qty: number
  planned_delivery_date: string | null
  actual_delivery_date: string | null
  unit_cost_usd: number
  total_value_usd: number | null
  payment_status: PaymentStatus
  payment_due_date: string | null
  remarks: string | null
  created_at: string
}

export interface DeliveryBySKU {
  delivery_id: string
  delivery_number: string
  po_number: string
  batch_code: string
  supplier_name: string | null
  delivered_qty: number
  actual_delivery_date: string | null
  unit_cost_usd: number
  total_value_usd: number | null
  payment_status: PaymentStatus
}

// Extended type for delivery edit page context
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

// Audit log entry for delivery edits
export interface DeliveryEditAuditLog {
  id: string
  delivery_id: string
  changed_by: string | null // user_id
  changed_at: string // timestamptz
  changed_fields: Record<string, { old: any; new: any }>
  change_reason: string | null
  created_at: string
}

// ================================================================
// QUERY FILTER TYPES
// ================================================================

export interface InventoryProjectionFilters {
  sku?: string
  skus?: string[]
  week_iso?: string
  stock_status?: 'Stockout' | 'Risk' | 'OK' | 'All'
  min_week_offset?: number
  max_week_offset?: number
}

export interface ReplenishmentSuggestionFilters {
  sku?: string
  priority?: 'Critical' | 'High' | 'Medium' | 'Low'
  is_overdue?: boolean
  max_days_until_deadline?: number
}

export interface RiskSummaryStats {
  total_skus: number
  ok_count: number
  risk_count: number
  stockout_count: number
  critical_priority_count: number
  high_priority_count: number
  overdue_count: number
}

// ================================================================
// DASHBOARD AGGREGATED TYPES
// ================================================================

export interface DashboardKPIs {
  total_stock: number
  total_stock_value: number
  risk_sku_count: number
  pending_suggestions: number
  next_month_payables: number
}

export interface WeeklyTrendData {
  week_iso: string
  total_stock: number
  total_safety_threshold: number
  total_sales: number
  total_incoming: number
  risk_count: number
  stockout_count: number
}

export interface SKURiskSummary {
  sku: string
  product_name: string
  current_stock: number
  next_risk_week: string | null
  weeks_until_risk: number | null
  suggested_order_qty: number | null
  status: 'OK' | 'Risk' | 'Critical'
}

// ================================================================
// ALGORITHM AUDIT V2 TYPES
// ================================================================

/**
 * Supply chain lead time configuration
 * Used for backtrack calculation in algorithm audit
 */
export interface SupplyChainLeadTimes {
  production_weeks: number      // Production cycle (from product.production_lead_weeks, default: 5 weeks)
  loading_weeks: number         // Loading preparation (default: 1 week)
  shipping_weeks: number        // Shipping time (default: 4-5 weeks)
  safety_stock_weeks: number    // Safety stock (from product.safety_stock_weeks)
  inbound_weeks?: number        // Inbound buffer (default: 2 weeks) - optional for backward compatibility
}

/**
 * Algorithm Audit Row V2.0
 * Enhanced with procurement/logistics timeline tracking
 */
export interface AlgorithmAuditRowV2 {
  // Basic week information
  week_iso: string
  week_start_date: string
  week_offset: number
  is_past: boolean
  is_current: boolean

  // Sales data (forecast vs actual)
  sales_forecast: number
  sales_actual: number | null
  sales_effective: number
  sales_source: 'actual' | 'forecast'

  // Backtrack timeline (calculated from current week)
  planned_arrival_week: string       // Planned arrival week = current week + safety_stock_weeks
  planned_ship_week: string          // Planned ship week = arrival week - shipping_weeks
  planned_factory_ship_week: string  // Planned factory ship week = ship week - loading_weeks
  planned_order_week: string         // Planned order week = factory ship week - production_weeks
  planned_arrival_qty: number        // Planned arrival qty = sales_effective * safety_stock_weeks

  // Actual data (aggregated by week)
  actual_order_week: string | null   // Week when PO was actually ordered
  actual_order_qty: number           // Quantity ordered this week
  actual_factory_ship_week: string | null  // Week when goods shipped from factory
  actual_factory_ship_qty: number    // Quantity shipped from factory this week
  actual_ship_week: string | null    // Week when shipment departed
  actual_ship_qty: number            // Quantity shipped this week
  actual_arrival_week: string | null // Week when shipment arrived
  actual_arrival_qty: number         // Quantity arrived this week

  // Inventory calculation
  opening_stock: number
  arrival_effective: number          // Effective arrival = COALESCE(actual_arrival_qty, 0)
  closing_stock: number              // closing = opening + arrival_effective - sales_effective
  safety_threshold: number
  turnover_ratio: number | null      // Turnover = closing_stock / sales_effective
  stock_status: StockStatus

  // Shipment details (for expandable view)
  shipments: ShipmentDetail[]
}

/**
 * Shipment detail for V2 algorithm audit
 */
export interface ShipmentDetail {
  tracking_number: string
  planned_departure_date: string | null
  actual_departure_date: string | null
  planned_arrival_date: string | null
  actual_arrival_date: string | null
  shipped_qty: number
  arrival_source: 'actual' | 'planned'
}

/**
 * Complete V2 audit result for a SKU
 */
export interface AlgorithmAuditResultV2 {
  product: Product | null
  rows: AlgorithmAuditRowV2[]
  leadTimes: SupplyChainLeadTimes
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    safety_stock_weeks: number
  }
}

// ================================================================
// FORECAST-ORDER LINKAGE TYPES
// ================================================================

// Table: forecast_order_allocations
export interface ForecastOrderAllocation {
  id: string
  forecast_id: string
  po_item_id: string
  allocated_qty: number
  allocation_type: AllocationType
  allocated_by: string | null
  allocated_at: string
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface ForecastOrderAllocationInsert {
  id?: string
  forecast_id: string
  po_item_id: string
  allocated_qty: number
  allocation_type?: AllocationType
  allocated_by?: string | null
  remarks?: string | null
}

export interface ForecastOrderAllocationUpdate {
  allocated_qty?: number
  remarks?: string | null
}

// Table: forecast_variance_resolutions
export interface ForecastVarianceResolution {
  id: string
  forecast_id: string
  original_forecast_qty: number
  adjusted_forecast_qty: number
  variance_qty: number
  variance_type: VarianceType
  variance_percentage: number
  resolution_action: ResolutionAction | null
  resolution_status: ResolutionStatus
  resolution_notes: string | null
  detected_at: string
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

export interface ForecastVarianceResolutionInsert {
  id?: string
  forecast_id: string
  original_forecast_qty: number
  adjusted_forecast_qty: number
  variance_qty: number
  variance_type: VarianceType
  variance_percentage: number
  resolution_action?: ResolutionAction | null
  resolution_status?: ResolutionStatus
  resolution_notes?: string | null
}

export interface ForecastVarianceResolutionUpdate {
  resolution_action?: ResolutionAction | null
  resolution_status?: ResolutionStatus
  resolution_notes?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
}

// Table: delivery_deletion_audit_log
export interface DeliveryDeletionAuditLog {
  id: string
  delivery_id: string
  delivery_number: string
  delivery_snapshot: Record<string, unknown>
  deleted_by: string | null
  deleted_at: string
  deletion_reason: string | null
  po_item_id: string
  rolled_back_qty: number
  created_at: string
}

export interface DeliveryDeletionAuditLogInsert {
  id?: string
  delivery_id: string
  delivery_number: string
  delivery_snapshot: Record<string, unknown>
  deleted_by?: string | null
  deletion_reason?: string | null
  po_item_id: string
  rolled_back_qty: number
}

// View: v_forecast_coverage
export interface ForecastCoverageView {
  forecast_id: string
  sku: string
  channel_code: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  forecast_qty: number
  allocated_qty: number
  covered_qty: number
  uncovered_qty: number
  coverage_percentage: number
  coverage_status: ForecastCoverageStatus
  is_closed: boolean
  closed_at: string | null
  close_reason: string | null
  linked_order_count: number
  last_allocated_at: string | null
  product_name: string | null
  spu: string | null
  calculated_at: string
}

// View: v_variance_pending_actions
export interface VariancePendingActionsView {
  resolution_id: string
  forecast_id: string
  sku: string
  channel_code: string
  week_iso: string
  product_name: string
  original_forecast_qty: number
  adjusted_forecast_qty: number
  variance_qty: number
  variance_type: VarianceType
  variance_percentage: number
  resolution_status: ResolutionStatus
  resolution_action: ResolutionAction | null
  days_pending: number
  priority: Priority
  detected_at: string
  resolved_at: string | null
}

// ================================================================
// ALGORITHM AUDIT V3 TYPES
// ================================================================

/**
 * Supply chain lead time configuration for V3
 * Extended from V2 to include configurable shipping weeks
 */
export interface SupplyChainLeadTimesV3 {
  production_weeks: number      // From products.production_lead_weeks (default: 5 weeks)
  loading_weeks: number          // Fixed: 1 week (container loading time)
  shipping_weeks: number         // User-configurable: default 5 weeks (can be 4-6 weeks)
  safety_stock_weeks: number     // From products.safety_stock_weeks (default: 2 weeks)
}

/**
 * Single row in the Algorithm Audit V3 table
 * Represents one week's data across 20 columns
 */
export interface AlgorithmAuditRowV3 {
  // Column 1: Week identifier (fixed column)
  week_iso: string               // "2026-W08"
  week_start_date: string        // "2026-02-16" (Monday)
  week_offset: number            // -4 to +11 (0 = current week)
  is_past: boolean               // week_offset < 0
  is_current: boolean            // week_offset === 0

  // Columns 2-4: Sales Group
  sales_forecast: number         // Sum from sales_forecasts for this week
  sales_actual: number | null    // Sum from sales_actuals for this week (null if no data)
  sales_effective: number        // COALESCE(sales_actual, sales_forecast)

  // Columns 5-7: Order Group (下单)
  planned_order: number          // Reverse-calculated quantity (accumulated from multiple sales demands)
  actual_order: number           // Sum from purchase_orders aggregated by actual_order_date week
  order_effective: number        // COALESCE(actual_order, planned_order)

  // Columns 8-10: Factory Ship Group (工厂出货)
  planned_factory_ship: number   // Reverse-calculated quantity
  actual_factory_ship: number    // Sum from production_deliveries aggregated by actual_delivery_date week
  factory_ship_effective: number // COALESCE(actual_factory_ship, planned_factory_ship)

  // Columns 11-13: Ship Group (物流发货)
  planned_ship: number           // Reverse-calculated quantity
  actual_ship: number            // Sum from shipments aggregated by actual_departure_date week
  ship_effective: number         // COALESCE(actual_ship, planned_ship)

  // Columns 14-16: Arrival Group (到仓)
  planned_arrival: number        // Reverse-calculated quantity
  actual_arrival: number         // Sum from shipments aggregated by effective arrival week
  arrival_effective: number      // COALESCE(actual_arrival, planned_arrival) - used for inventory calculation

  // Columns 17-20: Inventory Group (库存)
  opening_stock: number          // Period start stock (= last week's closing_stock)
  closing_stock: number          // opening_stock + arrival_effective - sales_effective
  safety_threshold: number       // sales_effective × safety_stock_weeks
  stock_status: StockStatus      // 'OK' | 'Risk' | 'Stockout'
}

/**
 * Complete V3 audit result for a SKU
 */
export interface AlgorithmAuditResultV3 {
  product: Product | null
  rows: AlgorithmAuditRowV3[]
  leadTimes: SupplyChainLeadTimesV3
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    safety_stock_weeks: number
    production_lead_weeks: number
    shipping_weeks: number         // User-provided parameter
  }
}

// ================================================================
// BALANCE MANAGEMENT TYPES
// ================================================================

// Note: BalanceResolutionStatus, BalanceResolutionAction, BalanceSourceType,
// and ShipmentStatus are now defined at the top of the file with other enums

// Table row types
export interface BalanceResolution {
  id: string
  source_type: BalanceSourceType
  source_id: string
  sku: string
  planned_qty: number
  actual_qty: number
  variance_qty: number // Computed
  open_balance: number // Computed
  resolution_status: BalanceResolutionStatus
  resolution_action: BalanceResolutionAction | null
  original_planned_date: string // DATE
  deferred_to_week: string | null // YYYY-WW
  deferred_date: string | null // DATE
  closed_at: string | null // TIMESTAMPTZ
  closed_by: string | null // UUID
  close_reason: string | null
  created_at: string // TIMESTAMPTZ
  updated_at: string // TIMESTAMPTZ
  created_by: string | null // UUID
}

export interface BalanceResolutionInsert {
  id?: string
  source_type: BalanceSourceType
  source_id: string
  sku: string
  planned_qty: number
  actual_qty?: number
  original_planned_date: string
  resolution_status?: BalanceResolutionStatus
  resolution_action?: BalanceResolutionAction | null
  deferred_to_week?: string | null
  deferred_date?: string | null
  close_reason?: string | null
  created_by?: string | null
}

export interface BalanceResolutionUpdate {
  actual_qty?: number
  resolution_status?: BalanceResolutionStatus
  resolution_action?: BalanceResolutionAction | null
  deferred_to_week?: string | null
  deferred_date?: string | null
  closed_at?: string | null
  closed_by?: string | null
  close_reason?: string | null
}

export interface InventoryAdjustment {
  id: string
  sku: string
  warehouse_id: string
  adjustment_type: InventoryAdjustmentType
  qty_before: number
  qty_change: number
  qty_after: number
  source_type: string | null
  source_id: string | null
  adjustment_date: string // DATE
  reason: string
  notes: string | null
  adjusted_by: string // UUID
  approved_by: string | null // UUID
  approved_at: string | null // TIMESTAMPTZ
  requires_approval: boolean
  created_at: string // TIMESTAMPTZ
}

export interface InventoryAdjustmentInsert {
  id?: string
  sku: string
  warehouse_id: string
  adjustment_type: InventoryAdjustmentType
  qty_before: number
  qty_change: number
  qty_after: number
  reason: string
  notes?: string | null
  source_type?: string | null
  source_id?: string | null
  adjusted_by?: string
  requires_approval?: boolean
}

export interface InventoryAdjustmentUpdate {
  approved_by?: string
  approved_at?: string
}

// Extended types for existing tables
export interface PurchaseOrderItemExtended extends PurchaseOrderItem {
  fulfilled_qty: number
  open_balance: number // Computed
  fulfillment_status: FulfillmentStatus
  fulfillment_percentage: number // Computed
}

export interface ProductionDeliveryExtended extends ProductionDelivery {
  expected_qty: number | null
  variance_qty: number | null // Computed
  variance_reason: string | null
  has_variance: boolean // Computed
}

export interface ShipmentItemExtended extends ShipmentItem {
  received_qty: number
  variance_qty: number // Computed
  receipt_status: FulfillmentStatus
}

export interface ShipmentExtended extends Shipment {
  is_finalized: boolean
  finalized_at: string | null
  finalized_by: string | null
  shipment_status: ShipmentStatus
}

// ================================================================
// ALGORITHM AUDIT V3 TYPES
// ================================================================

/**
 * Supply chain lead time configuration for V3
 * Extended from V2 to include configurable shipping weeks
 */
export interface SupplyChainLeadTimesV3 {
  production_weeks: number      // From products.production_lead_weeks (default: 5 weeks)
  loading_weeks: number          // Fixed: 1 week (container loading time)
  shipping_weeks: number         // User-configurable: default 5 weeks (can be 4-6 weeks)
  safety_stock_weeks: number     // From products.safety_stock_weeks (default: 2 weeks)
}

/**
 * Single row in the Algorithm Audit V3 table
 * Represents one week's data across 20 columns
 */
export interface AlgorithmAuditRowV3 {
  // Column 1: Week identifier (fixed column)
  week_iso: string               // "2026-W08"
  week_start_date: string        // "2026-02-16" (Monday)
  week_offset: number            // -4 to +11 (0 = current week)
  is_past: boolean               // week_offset < 0
  is_current: boolean            // week_offset === 0

  // Columns 2-4: Sales Group
  sales_forecast: number         // Sum from sales_forecasts for this week
  sales_actual: number | null    // Sum from sales_actuals for this week (null if no data)
  sales_effective: number        // COALESCE(sales_actual, sales_forecast)

  // Columns 5-7: Order Group (下单)
  planned_order: number          // Reverse-calculated quantity (accumulated from multiple sales demands)
  actual_order: number           // Sum from purchase_orders aggregated by actual_order_date week
  order_effective: number        // COALESCE(actual_order, planned_order)

  // Columns 8-10: Factory Ship Group (工厂出货)
  planned_factory_ship: number   // Reverse-calculated quantity
  actual_factory_ship: number    // Sum from production_deliveries aggregated by actual_delivery_date week
  factory_ship_effective: number // COALESCE(actual_factory_ship, planned_factory_ship)

  // Columns 11-13: Ship Group (物流发货)
  planned_ship: number           // Reverse-calculated quantity
  actual_ship: number            // Sum from shipments aggregated by actual_departure_date week
  ship_effective: number         // COALESCE(actual_ship, planned_ship)

  // Columns 14-16: Arrival Group (到仓)
  planned_arrival: number        // Reverse-calculated quantity
  actual_arrival: number         // Sum from shipments aggregated by effective arrival week
  arrival_effective: number      // COALESCE(actual_arrival, planned_arrival) - used for inventory calculation

  // Columns 17-20: Inventory Group (库存)
  opening_stock: number          // Period start stock (= last week's closing_stock)
  closing_stock: number          // opening_stock + arrival_effective - sales_effective
  safety_threshold: number       // sales_effective × safety_stock_weeks
  stock_status: StockStatus      // 'OK' | 'Risk' | 'Stockout'
}

/**
 * Complete V3 audit result for a SKU
 */
export interface AlgorithmAuditResultV3 {
  product: Product | null
  rows: AlgorithmAuditRowV3[]
  leadTimes: SupplyChainLeadTimesV3
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    safety_stock_weeks: number
    production_lead_weeks: number
    shipping_weeks: number         // User-provided parameter
  }
}

// ================================================================
// DELIVERY REMAINING PLAN TYPES
// ================================================================

/**
 * Remaining delivery plan allocation
 * Used when recording actual delivery to specify planned future deliveries
 */
export interface RemainingDeliveryPlan {
  week_iso: string // "2025-W04"
  planned_qty: number // 25
  planned_date?: string // "2025-01-27" (computed from week_iso)
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

/**
 * Delivery form state for UI
 */
export interface DeliveryFormData {
  // Basic info
  po_id: string
  delivery_number: string
  delivery_date: string
  remarks: string

  // Item deliveries
  items: DeliveryItemForm[]

  // Remaining plan
  show_remaining_plan: boolean
  remaining_plan_items: RemainingPlanItem[]
}

export interface DeliveryItemForm {
  id: string
  po_item_id: string
  sku: string
  channel_code: string | null
  ordered_qty: number
  delivered_qty: number
  remaining_qty: number
  delivery_qty: number
  unit_cost_usd: number
}

export interface RemainingPlanItem {
  id: string // Client-side UUID for React key
  week_iso: string
  planned_qty: number
  error?: string // Validation error message
}

// ================================================================
// BALANCE MANAGEMENT API TYPES
// ================================================================

// Server Action request/response types
export interface ResolveBalanceRequest {
  balanceId: string
  action: BalanceResolutionAction
  deferredToWeek?: string | null
  deferredDate?: string | null
  reason?: string | null
}

export interface ResolveBalanceResponse {
  success: boolean
  action: string
  message: string
  impactedSku?: string
}

export interface CreateAdjustmentRequest {
  sku: string
  warehouseId: string
  adjustmentType: InventoryAdjustmentType
  qtyBefore: number
  qtyChange: number
  reason: string
  notes?: string | null
  sourceType?: string | null
  sourceId?: string | null
}

export interface CreateAdjustmentResponse {
  success: boolean
  adjustmentId: string
  requiresApproval: boolean
  adjustmentValueUsd: number
  qtyAfter: number
}

export interface FinalizeShipmentResponse {
  success: boolean
  shipmentId: string
  adjustmentsCreated: number
  finalizedAt: string
}

// Dashboard KPI types
export interface BalanceSummaryKPIs {
  totalOpenBalances: number
  totalOpenQty: number
  criticalCount: number    // Age > 45 days
  highPriorityCount: number // Age 15-45 days
  pendingCount: number
  deferredCount: number
  avgAgeDays: number
  oldestBalanceDays: number
}

export interface BalanceListItem extends BalanceResolution {
  productName: string
  ageDays: number
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  parentReference: string // e.g., "PO#2025-001-A"
}

// Filters
export interface BalanceFilters {
  sku?: string
  status?: BalanceResolutionStatus | 'all'
  priority?: 'Critical' | 'High' | 'Medium' | 'Low'
  minAgeDays?: number
  maxAgeDays?: number
}

// ================================================================
// ALGORITHM AUDIT V4 TYPES
// ================================================================

/**
 * Coverage status for sales demand
 */
export type CoverageStatus = 'Fully Covered' | 'Partially Covered' | 'Uncovered' | 'Unknown'

/**
 * Confidence level for forward propagation
 */
export type PropagationConfidence = 'high' | 'medium' | 'low' | 'none'

/**
 * Source type for propagated quantities
 */
export type PropagationSourceType =
  | 'actual_order'
  | 'actual_factory_ship'
  | 'actual_ship'
  | 'actual_arrival'
  | 'reverse_calc'

/**
 * Propagation source metadata
 */
export interface PropagationSource {
  source_type: PropagationSourceType
  source_week: string
  confidence: PropagationConfidence
}

/**
 * Matched order within ±1 week tolerance
 */
export interface OrderMatch {
  po_numbers: string[] // e.g., ["PO-2025-001", "PO-2025-002"]
  ordered_qty: number
  order_week: string
  week_offset: number // -1, 0, +1
}

/**
 * Demand coverage analysis for a sales week
 */
export interface DemandCoverage {
  sales_week: string
  sales_demand: number
  target_order_week: string
  matching_orders: OrderMatch[]
  total_ordered_coverage: number
  uncovered_qty: number
  coverage_status: CoverageStatus
}

/**
 * Detailed order information for a specific week
 */
export interface OrderDetailV4 {
  po_id: string
  po_number: string
  ordered_qty: number
  order_date: string // YYYY-MM-DD
  order_week: string // YYYY-WW
  fulfillment_status: 'Complete' | 'Partial' | 'Pending'
  delivered_qty: number
  pending_qty: number
  supplier_name: string | null
}

/**
 * Detailed delivery information for a specific week
 */
export interface DeliveryDetailV4 {
  delivery_id: string
  delivery_number: string
  po_number: string // Traceability back to order
  delivered_qty: number
  delivery_date: string
  delivery_week: string
  shipment_status: 'Fully Shipped' | 'Partially Shipped' | 'Awaiting Shipment'
  shipped_qty: number
  unshipped_qty: number
}

/**
 * Detailed shipment information (departure)
 */
export interface ShipmentDetailV4 {
  shipment_id: string
  tracking_number: string
  delivery_number: string | null // Traceability
  shipped_qty: number
  departure_date: string | null
  arrival_date: string | null
  planned_arrival_week: string
  actual_arrival_week: string | null
  current_status: 'Arrived' | 'In Transit' | 'Departed' | 'Awaiting'
}

/**
 * Detailed arrival information
 */
export interface ArrivalDetailV4 {
  shipment_id: string
  tracking_number: string
  po_number: string | null // Full traceability (if linkable)
  arrived_qty: number
  arrival_date: string
  arrival_week: string
  warehouse_code: string
  destination_warehouse_name: string
}

/**
 * Algorithm Audit Row V4 - Extends V3 with lineage data
 */
export interface AlgorithmAuditRowV4 extends AlgorithmAuditRowV3 {
  // Sales Coverage
  sales_coverage_status: CoverageStatus
  sales_uncovered_qty: number

  // Lineage metadata (for planned values)
  planned_factory_ship_source?: PropagationSource[]
  planned_ship_source?: PropagationSource[]
  planned_arrival_source?: PropagationSource[]

  // Detailed data (for expandable rows)
  order_details: OrderDetailV4[]
  factory_ship_details: DeliveryDetailV4[]
  ship_details: ShipmentDetailV4[]
  arrival_details: ArrivalDetailV4[]
}

/**
 * Supply Chain Data Validation - 供应链数据校验
 * Ensures quantities flow correctly through the supply chain
 */
export interface SupplyChainValidation {
  // 是否通过校验
  is_valid: boolean

  // 各层累计数量
  totals: {
    ordered: number           // 下单总量
    factory_shipped: number   // 工厂出货总量 (actual + planned pending)
    shipped: number           // 物流发货总量 (actual + planned pending)
    arrived: number           // 到仓总量 (actual + planned pending)
  }

  // 各层实际数量
  actuals: {
    ordered: number           // 实际下单
    factory_shipped: number   // 实际工厂出货
    shipped: number           // 实际物流发货
    arrived: number           // 实际到仓
  }

  // 各层待处理数量 (pending)
  pending: {
    factory_ship: number      // 工厂待出货 (ordered - factory_shipped)
    ship: number              // 物流待发货 (factory_shipped - shipped)
    arrival: number           // 在途待到仓 (shipped - arrived)
  }

  // 校验错误列表
  errors: SupplyChainValidationError[]

  // 校验警告列表
  warnings: SupplyChainValidationWarning[]
}

/**
 * 校验错误类型
 */
export interface SupplyChainValidationError {
  code: 'OVERFLOW_FACTORY_SHIP' | 'OVERFLOW_SHIP' | 'OVERFLOW_ARRIVAL' | 'NEGATIVE_PENDING' | 'DATA_MISMATCH'
  message: string
  layer: 'factory_ship' | 'ship' | 'arrival'
  expected: number
  actual: number
  diff: number
}

/**
 * 校验警告类型
 */
export interface SupplyChainValidationWarning {
  code: 'PARTIAL_FULFILLMENT' | 'DELAYED_SHIPMENT' | 'MISSING_ALLOCATION'
  message: string
  details: string
}

/**
 * Complete V4 audit result
 */
export interface AlgorithmAuditResultV4 {
  product: Product | null
  rows: AlgorithmAuditRowV4[]
  leadTimes: SupplyChainLeadTimesV3
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    safety_stock_weeks: number
    production_lead_weeks: number
    shipping_weeks: number
    // V4-specific metadata
    total_demand: number
    total_ordered: number
    overall_coverage_percentage: number
    // Variance statistics
    variance_count: number
    total_factory_ship_adjustment: number
    total_ship_adjustment: number
  }
  // 数据校验结果
  validation: SupplyChainValidation
}

// ================================================================
// DELIVERY-SHIPMENT LINKAGE TYPES
// ================================================================

/**
 * N:N junction table linking production_deliveries to shipments
 * Enables flexible allocation: multiple deliveries -> one shipment, or one delivery -> multiple shipments
 */
export interface DeliveryShipmentAllocation {
  id: string
  delivery_id: string
  shipment_id: string
  shipped_qty: number
  allocated_at: string
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface DeliveryShipmentAllocationInsert {
  id?: string
  delivery_id: string
  shipment_id: string
  shipped_qty: number
  remarks?: string | null
}

export interface DeliveryShipmentAllocationUpdate {
  shipped_qty?: number
  remarks?: string | null
}

/**
 * View of unshipped production deliveries
 * Shows deliveries with remaining unshipped quantity
 */
export interface UnshippedDeliveriesView {
  delivery_id: string
  delivery_number: string
  sku: string
  channel_code: string | null
  po_number: string
  batch_code: string
  supplier_name: string | null
  delivered_qty: number
  shipped_qty: number
  unshipped_qty: number
  actual_delivery_date: string | null
  days_since_delivery: number | null
  product_name: string | null
  spu: string | null
  shipment_status: DeliveryShipmentStatus
  payment_status: PaymentStatus
  created_at: string
  updated_at: string
}

/**
 * Allocation request item for creating shipment with deliveries
 */
export interface ShipmentAllocationItem {
  delivery_id: string
  shipped_qty: number
  remarks?: string | null
}

/**
 * Extended delivery info with allocation details
 */
export interface DeliveryWithAllocations extends ProductionDelivery {
  allocations: {
    shipment_id: string
    tracking_number: string
    shipped_qty: number
    allocated_at: string
    actual_departure_date: string | null
    planned_arrival_date: string | null
    actual_arrival_date: string | null
    remarks: string | null
  }[]
  unshipped_qty: number
}

/**
 * Extended shipment info with source delivery details
 */
export interface ShipmentWithSourceDeliveries extends Shipment {
  source_deliveries: {
    delivery_id: string
    delivery_number: string
    po_number: string
    batch_code: string
    sku: string
    shipped_qty: number
    delivered_qty: number
    delivery_date: string | null
    supplier_name: string | null
    remarks: string | null
  }[]
}

// ================================================================
// SUPPLY CHAIN VARIANCE TYPES
// ================================================================

/**
 * 差异来源类型
 */
export type VarianceSourceType =
  | 'order_to_delivery'    // PO 下单 → 工厂出货
  | 'delivery_to_ship'     // 工厂出货 → 物流发货
  | 'ship_to_arrival'      // 物流发货 → 仓库到货

/**
 * 差异状态
 */
export type VarianceStatus =
  | 'pending'      // 待处理
  | 'scheduled'    // 已计划
  | 'partial'      // 部分完成
  | 'completed'    // 已完成
  | 'cancelled'    // 已取消
  | 'overdue'      // 已逾期

/**
 * 差异优先级 (自动计算)
 */
export type VariancePriority = 'Critical' | 'High' | 'Medium' | 'Low'

/**
 * 供应链差异记录
 */
export interface SupplyChainVariance {
  id: string
  source_type: VarianceSourceType
  source_id: string
  sku: string
  channel_code: string | null
  planned_qty: number
  fulfilled_qty: number
  pending_qty: number           // Computed (generated column)
  planned_week: string | null   // YYYY-WW (user-adjustable)
  planned_date: string | null   // DATE
  status: VarianceStatus
  priority: VariancePriority    // Computed (generated column)
  remarks: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  resolved_at: string | null
  resolved_by: string | null
}

export interface SupplyChainVarianceInsert {
  id?: string
  source_type: VarianceSourceType
  source_id: string
  sku: string
  channel_code?: string | null
  planned_qty: number
  fulfilled_qty?: number
  planned_week?: string | null
  planned_date?: string | null
  status?: VarianceStatus
  remarks?: string | null
  created_by?: string | null
}

export interface SupplyChainVarianceUpdate {
  planned_week?: string | null
  planned_date?: string | null
  fulfilled_qty?: number
  remarks?: string | null
  status?: VarianceStatus
  updated_by?: string | null
}

/**
 * 差异总览 (带产品信息)
 */
export interface VarianceOverview extends SupplyChainVariance {
  product_name: string
  spu: string
  source_reference: string  // "PO#2025-001-A (50 ordered)"
  age_days: number
  weeks_until_planned: number | null
}

/**
 * 差异汇总 KPI
 */
export interface VarianceSummaryKPIs {
  total_variances: number
  total_pending_qty: number
  critical_count: number    // priority = Critical
  high_count: number        // priority = High
  overdue_count: number     // status = overdue
  scheduled_count: number   // status = scheduled
  avg_age_days: number
  oldest_variance_days: number
}

/**
 * 差异调整数据 (用于算法审计)
 */
export interface VarianceAdjustment {
  factory_ship_adjustment: number  // 工厂出货调整量
  ship_adjustment: number          // 物流发货调整量
  variances: SupplyChainVariance[] // 关联的差异记录
}

// ================================================================
// SCM V2 UPGRADE TYPES
// ================================================================

/**
 * System Parameters - 系统参数配置
 */
export interface SystemParameter {
  id: string
  param_key: string
  param_value: any // JSONB
  description: string | null
  updated_at: string
  updated_by: string | null
  created_at: string
}

export interface SystemParameterInsert {
  id?: string
  param_key: string
  param_value: any
  description?: string | null
  updated_by?: string | null
}

export interface SystemParameterUpdate {
  param_value?: any
  description?: string | null
  updated_by?: string | null
}

/**
 * Order Arrivals - 到仓单 (OA)
 */
export interface OrderArrival {
  id: string
  arrival_number: string
  shipment_id: string | null
  warehouse_id: string
  planned_arrival_date: string | null // DATE
  actual_arrival_date: string | null // DATE
  arrival_week_iso: string | null // Computed
  expected_qty: number
  received_qty: number
  variance_qty: number // Computed
  variance_reason: string | null
  status: 'pending' | 'partial' | 'completed' | 'cancelled'
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface OrderArrivalInsert {
  id?: string
  arrival_number: string
  shipment_id?: string | null
  warehouse_id: string
  planned_arrival_date?: string | null
  actual_arrival_date?: string | null
  expected_qty?: number
  received_qty?: number
  variance_reason?: string | null
  status?: 'pending' | 'partial' | 'completed' | 'cancelled'
  remarks?: string | null
}

export interface OrderArrivalUpdate {
  received_qty?: number
  actual_arrival_date?: string | null
  variance_reason?: string | null
  status?: 'pending' | 'partial' | 'completed' | 'cancelled'
  remarks?: string | null
}

/**
 * PSI Weekly Snapshots - 进销存周报表
 */
export interface PSIWeeklySnapshot {
  id: string
  sku: string
  warehouse_id: string
  week_iso: string
  week_start_date: string // DATE
  week_end_date: string // DATE
  opening_stock: number
  planned_arrival_qty: number
  actual_arrival_qty: number
  effective_arrival_qty: number // Computed
  forecast_sales_qty: number
  actual_sales_qty: number | null
  effective_sales_qty: number // Computed
  closing_stock: number // Computed
  safety_stock_threshold: number
  stock_status: 'OK' | 'Risk' | 'Stockout' // Computed
  calculated_at: string
}

export interface PSIWeeklySnapshotInsert {
  id?: string
  sku: string
  warehouse_id: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  opening_stock: number
  planned_arrival_qty?: number
  actual_arrival_qty?: number
  forecast_sales_qty?: number
  actual_sales_qty?: number | null
  safety_stock_threshold: number
}

export interface PSIWeeklySnapshotUpdate {
  opening_stock?: number
  planned_arrival_qty?: number
  actual_arrival_qty?: number
  forecast_sales_qty?: number
  actual_sales_qty?: number | null
  safety_stock_threshold?: number
}

/**
 * PSI Weekly Projection View - PSI周预测视图
 */
export interface PSIWeeklyProjectionView {
  sku: string
  product_name: string
  warehouse_id: string
  warehouse_name: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  week_offset: number
  opening_stock: number
  planned_arrival_qty: number
  actual_arrival_qty: number
  effective_arrival_qty: number
  forecast_sales_qty: number
  actual_sales_qty: number | null
  effective_sales_qty: number
  closing_stock: number
  safety_stock_threshold: number
  stock_status: 'OK' | 'Risk' | 'Stockout'
  calculated_at: string
}

/**
 * Reverse Schedule Suggestions View - 倒排排程建议视图
 */
export interface ReverseScheduleSuggestion {
  sku: string
  product_name: string
  spu: string
  sales_week: string
  forecast_qty: number
  covered_qty: number
  suggested_order_qty: number
  suggested_order_week: string
  suggested_order_date: string
  suggested_fulfillment_week: string
  suggested_ship_week: string
  suggested_arrival_week: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  is_overdue: boolean
  lead_time_breakdown: {
    target_sales_week: string
    target_sales_qty: number
    production_lead_weeks: number
    loading_buffer_weeks: number
    transit_time_weeks: number
    inbound_buffer_weeks: number
    total_lead_time_weeks: number
  }
  calculated_at: string
}

/**
 * Extended Sales Forecast (with V2 fields)
 */
export interface SalesForecastV2 extends SalesForecast {
  coverage_status?: 'UNCOVERED' | 'PARTIALLY_COVERED' | 'FULLY_COVERED' | 'CLOSED'
  covered_qty?: number
  target_order_week?: string | null
}

/**
 * Extended Purchase Order (with V2 fields)
 */
export interface PurchaseOrderV2 extends PurchaseOrder {
  expected_fulfillment_week?: string | null
  is_closed?: boolean
  closed_reason?: string | null
}

/**
 * Extended Shipment (with V2 fields)
 */
export interface ShipmentV2 extends Shipment {
  channel_allocation?: Record<string, number> // JSONB: {"Amazon": 90, "Shopify": 10}
  shipment_status?: 'draft' | 'in_transit' | 'arrived' | 'finalized'
}
