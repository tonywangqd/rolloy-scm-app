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
      weekly_sales_forecasts: {
        Row: WeeklySalesForecast
        Insert: WeeklySalesForecastInsert
        Update: WeeklySalesForecastUpdate
      }
      weekly_sales_actuals: {
        Row: WeeklySalesActual
        Insert: WeeklySalesActualInsert
        Update: WeeklySalesActualUpdate
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
// WEEKLY SALES DATA TYPES
// ================================================================

export interface WeeklySalesForecast {
  id: string
  year_week: string
  sku: string
  channel_code: string
  forecast_qty: number
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface WeeklySalesForecastInsert {
  id?: string
  year_week: string
  sku: string
  channel_code: string
  forecast_qty: number
  remarks?: string | null
}

export interface WeeklySalesForecastUpdate {
  forecast_qty?: number
  remarks?: string | null
}

export interface WeeklySalesActual {
  id: string
  year_week: string
  sku: string
  channel_code: string
  actual_qty: number
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface WeeklySalesActualInsert {
  id?: string
  year_week: string
  sku: string
  channel_code: string
  actual_qty: number
  remarks?: string | null
}

export interface WeeklySalesActualUpdate {
  actual_qty?: number
  remarks?: string | null
}

// ================================================================
// TRANSACTIONAL DATA TYPES
// ================================================================

export interface SalesForecast {
  id: string
  sku: string
  channel_code: string
  week_iso: string
  week_start_date: string
  week_end_date: string
  forecast_qty: number
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
