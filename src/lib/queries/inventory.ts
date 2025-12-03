import { createServerSupabaseClient } from '@/lib/supabase/server'

interface InventoryItem {
  sku: string
  product_name: string
  warehouse_id: string
  warehouse_code: string
  warehouse_name: string
  warehouse_type: string
  qty_on_hand: number
  last_counted_at: string | null
}

interface InventorySummary {
  sku: string
  product_name: string
  total_stock: number
  fba_stock: number
  threepl_stock: number
  warehouse_count: number
}

/**
 * Fetch inventory by warehouse
 */
export async function fetchInventoryByWarehouse(): Promise<{
  warehouse_id: string
  warehouse_code: string
  warehouse_name: string
  warehouse_type: string
  total_qty: number
  sku_count: number
  items: { sku: string; product_name: string; qty: number }[]
}[]> {
  const supabase = await createServerSupabaseClient()

  // Fetch inventory snapshots
  const { data: inventory } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .order('warehouse_id')
    .order('sku')

  // Fetch warehouses
  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .order('warehouse_code')

  // Fetch products
  const { data: products } = await supabase
    .from('products')
    .select('sku, product_name')

  const warehouseMap = new Map((warehouses || []).map((w: any) => [w.id, w]))
  const productMap = new Map((products || []).map((p: any) => [p.sku, p.product_name]))

  // Group by warehouse
  const warehouseInventory = new Map<string, {
    warehouse_id: string
    warehouse_code: string
    warehouse_name: string
    warehouse_type: string
    total_qty: number
    items: { sku: string; product_name: string; qty: number }[]
  }>()

  ;(inventory || []).forEach((inv: any) => {
    const warehouse = warehouseMap.get(inv.warehouse_id)
    if (!warehouse) return

    if (!warehouseInventory.has(inv.warehouse_id)) {
      warehouseInventory.set(inv.warehouse_id, {
        warehouse_id: inv.warehouse_id,
        warehouse_code: warehouse.warehouse_code,
        warehouse_name: warehouse.warehouse_name,
        warehouse_type: warehouse.warehouse_type,
        total_qty: 0,
        items: [],
      })
    }

    const entry = warehouseInventory.get(inv.warehouse_id)!
    entry.total_qty += inv.qty_on_hand || 0
    entry.items.push({
      sku: inv.sku,
      product_name: productMap.get(inv.sku) || inv.sku,
      qty: inv.qty_on_hand || 0,
    })
  })

  return Array.from(warehouseInventory.values()).map((w) => ({
    ...w,
    sku_count: w.items.length,
  }))
}

/**
 * Fetch inventory summary by SKU
 */
export async function fetchInventorySummaryBySku(): Promise<InventorySummary[]> {
  const supabase = await createServerSupabaseClient()

  // Fetch inventory snapshots
  const { data: inventory } = await supabase
    .from('inventory_snapshots')
    .select('*')

  // Fetch warehouses
  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id, warehouse_type')

  // Fetch products
  const { data: products } = await supabase
    .from('products')
    .select('sku, product_name')
    .eq('is_active', true)
    .order('sku')

  const warehouseTypeMap = new Map((warehouses || []).map((w: any) => [w.id, w.warehouse_type]))
  const productMap = new Map((products || []).map((p: any) => [p.sku, p.product_name]))

  // Group by SKU
  const skuInventory = new Map<string, {
    total_stock: number
    fba_stock: number
    threepl_stock: number
    warehouse_ids: Set<string>
  }>()

  ;(inventory || []).forEach((inv: any) => {
    if (!skuInventory.has(inv.sku)) {
      skuInventory.set(inv.sku, {
        total_stock: 0,
        fba_stock: 0,
        threepl_stock: 0,
        warehouse_ids: new Set(),
      })
    }

    const entry = skuInventory.get(inv.sku)!
    const qty = inv.qty_on_hand || 0
    entry.total_stock += qty
    entry.warehouse_ids.add(inv.warehouse_id)

    const warehouseType = warehouseTypeMap.get(inv.warehouse_id)
    if (warehouseType === 'FBA') {
      entry.fba_stock += qty
    } else {
      entry.threepl_stock += qty
    }
  })

  // Build result with all active products
  return (products || []).map((p: any) => {
    const inv = skuInventory.get(p.sku)
    return {
      sku: p.sku,
      product_name: p.product_name,
      total_stock: inv?.total_stock || 0,
      fba_stock: inv?.fba_stock || 0,
      threepl_stock: inv?.threepl_stock || 0,
      warehouse_count: inv?.warehouse_ids.size || 0,
    }
  })
}

/**
 * Fetch total inventory statistics
 */
export async function fetchInventoryStats(): Promise<{
  total_stock: number
  total_fba: number
  total_3pl: number
  sku_count: number
  warehouse_count: number
}> {
  const supabase = await createServerSupabaseClient()

  const { data: inventory } = await supabase
    .from('inventory_snapshots')
    .select('sku, warehouse_id, qty_on_hand')

  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id, warehouse_type')

  const warehouseTypeMap = new Map((warehouses || []).map((w: any) => [w.id, w.warehouse_type]))

  let total_stock = 0
  let total_fba = 0
  let total_3pl = 0
  const skus = new Set<string>()
  const warehouseIds = new Set<string>()

  ;(inventory || []).forEach((inv: any) => {
    const qty = inv.qty_on_hand || 0
    total_stock += qty
    skus.add(inv.sku)
    warehouseIds.add(inv.warehouse_id)

    const warehouseType = warehouseTypeMap.get(inv.warehouse_id)
    if (warehouseType === 'FBA') {
      total_fba += qty
    } else {
      total_3pl += qty
    }
  })

  return {
    total_stock,
    total_fba,
    total_3pl,
    sku_count: skus.size,
    warehouse_count: warehouseIds.size,
  }
}

/**
 * Fetch incoming inventory (shipments in transit)
 *
 * P0 BUG FIX (2025-12-03):
 * - BUG-003: Use received_qty when available to account for expected variances
 *   For in-transit shipments (not yet arrived), shipped_qty is the expected quantity.
 *   If received_qty has been pre-set (e.g., partial receipt expected), use that instead.
 */
export async function fetchIncomingInventory(): Promise<{
  tracking_number: string
  destination_warehouse: string
  logistics_plan: string | null
  planned_arrival_date: string | null
  items: { sku: string; qty: number; shipped_qty: number; received_qty: number }[]
  total_qty: number
}[]> {
  const supabase = await createServerSupabaseClient()

  // Fetch shipments that have departed but not arrived
  const { data: shipments } = await supabase
    .from('shipments')
    .select('*')
    .not('actual_departure_date', 'is', null)
    .is('actual_arrival_date', null)
    .order('planned_arrival_date')

  // Fetch shipment items with received_qty for BUG-003 fix
  const shipmentIds = (shipments || []).map((s: any) => s.id)
  const { data: items } = await supabase
    .from('shipment_items')
    .select('shipment_id, sku, shipped_qty, received_qty')
    .in('shipment_id', shipmentIds)

  // Fetch warehouses
  const warehouseIds = [...new Set((shipments || []).map((s: any) => s.destination_warehouse_id))]
  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id, warehouse_code, warehouse_name')
    .in('id', warehouseIds)

  const warehouseMap = new Map((warehouses || []).map((w: any) => [w.id, `${w.warehouse_code} - ${w.warehouse_name}`]))

  // Group items by shipment
  // BUG-003 FIX: Include both shipped_qty and received_qty for transparency
  const itemsByShipment = new Map<string, { sku: string; qty: number; shipped_qty: number; received_qty: number }[]>()
  ;(items || []).forEach((item: any) => {
    if (!itemsByShipment.has(item.shipment_id)) {
      itemsByShipment.set(item.shipment_id, [])
    }
    // BUG-003 FIX: Use received_qty if set and > 0, otherwise use shipped_qty
    // For in-transit items, received_qty may be 0 (not yet received), so we fall back to shipped_qty
    const effectiveQty = (item.received_qty !== null && item.received_qty > 0)
      ? item.received_qty
      : item.shipped_qty
    itemsByShipment.get(item.shipment_id)!.push({
      sku: item.sku,
      qty: effectiveQty,
      shipped_qty: item.shipped_qty || 0,
      received_qty: item.received_qty || 0,
    })
  })

  return (shipments || []).map((s: any) => {
    const shipmentItems = itemsByShipment.get(s.id) || []
    return {
      tracking_number: s.tracking_number,
      destination_warehouse: warehouseMap.get(s.destination_warehouse_id) || '-',
      logistics_plan: s.logistics_plan,
      planned_arrival_date: s.planned_arrival_date,
      items: shipmentItems,
      total_qty: shipmentItems.reduce((sum, i) => sum + i.qty, 0),
    }
  })
}
