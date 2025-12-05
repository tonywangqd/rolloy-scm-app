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
  shipping_weeks: number        // Shipping time (default: 4 weeks)
  safety_stock_weeks: number    // Safety stock (from product.safety_stock_weeks)
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
  }
}
