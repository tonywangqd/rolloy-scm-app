/**
 * Data Relationship Verification Script
 * 验证数据库中的关联关系完整性
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface VerificationResult {
  check: string
  status: 'PASS' | 'FAIL' | 'WARNING'
  details: string
}

async function main() {
  console.log('='.repeat(80))
  console.log('Data Relationship Verification Report')
  console.log('='.repeat(80))
  console.log()

  const results: VerificationResult[] = []

  // 1. Verify PO → Supplier relationship
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, po_number, supplier_id')

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id')

  const supplierIds = new Set(suppliers?.map(s => s.id) || [])
  let invalidPoSuppliers = 0

  pos?.forEach(po => {
    if (po.supplier_id && !supplierIds.has(po.supplier_id)) {
      invalidPoSuppliers++
    }
  })

  results.push({
    check: 'Purchase Orders → Suppliers',
    status: invalidPoSuppliers === 0 ? 'PASS' : 'FAIL',
    details: `${pos?.length || 0} POs checked, ${invalidPoSuppliers} invalid supplier references`
  })

  // 2. Verify PO Items → PO relationship
  const { data: poItems } = await supabase
    .from('purchase_order_items')
    .select('id, po_id, sku')

  const poIds = new Set(pos?.map(p => p.id) || [])
  let invalidPoItems = 0

  poItems?.forEach(item => {
    if (!poIds.has(item.po_id)) {
      invalidPoItems++
    }
  })

  results.push({
    check: 'PO Items → Purchase Orders',
    status: invalidPoItems === 0 ? 'PASS' : 'FAIL',
    details: `${poItems?.length || 0} items checked, ${invalidPoItems} orphaned items`
  })

  // 3. Verify PO Items → SKU relationship
  const { data: products } = await supabase
    .from('products')
    .select('sku')

  const validSkus = new Set(products?.map(p => p.sku) || [])
  let invalidPoItemSkus = 0

  poItems?.forEach(item => {
    if (!validSkus.has(item.sku)) {
      invalidPoItemSkus++
    }
  })

  results.push({
    check: 'PO Items → Products (SKU)',
    status: invalidPoItemSkus === 0 ? 'PASS' : 'FAIL',
    details: `${poItems?.length || 0} items checked, ${invalidPoItemSkus} invalid SKU references`
  })

  // 4. Verify Production Deliveries → PO Items
  const { data: deliveries } = await supabase
    .from('production_deliveries')
    .select('id, po_item_id, sku')

  const poItemIds = new Set(poItems?.map(item => item.id) || [])
  let invalidDeliveries = 0

  deliveries?.forEach(delivery => {
    if (!poItemIds.has(delivery.po_item_id)) {
      invalidDeliveries++
    }
  })

  results.push({
    check: 'Production Deliveries → PO Items',
    status: invalidDeliveries === 0 ? 'PASS' : 'FAIL',
    details: `${deliveries?.length || 0} deliveries checked, ${invalidDeliveries} invalid PO item references`
  })

  // 5. Verify Shipments → Warehouse relationship
  const { data: shipments } = await supabase
    .from('shipments')
    .select('id, tracking_number, destination_warehouse_id')

  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id')

  const warehouseIds = new Set(warehouses?.map(w => w.id) || [])
  let invalidShipmentWarehouses = 0

  shipments?.forEach(shipment => {
    if (!warehouseIds.has(shipment.destination_warehouse_id)) {
      invalidShipmentWarehouses++
    }
  })

  results.push({
    check: 'Shipments → Warehouses',
    status: invalidShipmentWarehouses === 0 ? 'PASS' : 'FAIL',
    details: `${shipments?.length || 0} shipments checked, ${invalidShipmentWarehouses} invalid warehouse references`
  })

  // 6. Verify Shipment Items → Shipments
  const { data: shipmentItems } = await supabase
    .from('shipment_items')
    .select('id, shipment_id, sku')

  const shipmentIds = new Set(shipments?.map(s => s.id) || [])
  let invalidShipmentItems = 0

  shipmentItems?.forEach(item => {
    if (!shipmentIds.has(item.shipment_id)) {
      invalidShipmentItems++
    }
  })

  results.push({
    check: 'Shipment Items → Shipments',
    status: invalidShipmentItems === 0 ? 'PASS' : 'FAIL',
    details: `${shipmentItems?.length || 0} items checked, ${invalidShipmentItems} orphaned items`
  })

  // 7. Verify Shipment Items → SKU
  let invalidShipmentItemSkus = 0

  shipmentItems?.forEach(item => {
    if (!validSkus.has(item.sku)) {
      invalidShipmentItemSkus++
    }
  })

  results.push({
    check: 'Shipment Items → Products (SKU)',
    status: invalidShipmentItemSkus === 0 ? 'PASS' : 'FAIL',
    details: `${shipmentItems?.length || 0} items checked, ${invalidShipmentItemSkus} invalid SKU references`
  })

  // 8. Verify Sales Forecasts → SKU
  const { data: forecasts } = await supabase
    .from('sales_forecasts')
    .select('id, sku, channel_code')

  let invalidForecastSkus = 0

  forecasts?.forEach(forecast => {
    if (!validSkus.has(forecast.sku)) {
      invalidForecastSkus++
    }
  })

  results.push({
    check: 'Sales Forecasts → Products (SKU)',
    status: invalidForecastSkus === 0 ? 'PASS' : 'FAIL',
    details: `${forecasts?.length || 0} forecasts checked, ${invalidForecastSkus} invalid SKU references`
  })

  // 9. Verify Sales Forecasts → Channels
  const { data: channels } = await supabase
    .from('channels')
    .select('channel_code')

  const validChannels = new Set(channels?.map(c => c.channel_code) || [])
  let invalidForecastChannels = 0

  forecasts?.forEach(forecast => {
    if (!validChannels.has(forecast.channel_code)) {
      invalidForecastChannels++
    }
  })

  results.push({
    check: 'Sales Forecasts → Channels',
    status: invalidForecastChannels === 0 ? 'PASS' : 'FAIL',
    details: `${forecasts?.length || 0} forecasts checked, ${invalidForecastChannels} invalid channel references`
  })

  // 10. Verify Sales Actuals → SKU
  const { data: actuals } = await supabase
    .from('sales_actuals')
    .select('id, sku, channel_code')

  let invalidActualSkus = 0

  actuals?.forEach(actual => {
    if (!validSkus.has(actual.sku)) {
      invalidActualSkus++
    }
  })

  results.push({
    check: 'Sales Actuals → Products (SKU)',
    status: invalidActualSkus === 0 ? 'PASS' : 'FAIL',
    details: `${actuals?.length || 0} actuals checked, ${invalidActualSkus} invalid SKU references`
  })

  // 11. Verify Sales Actuals → Channels
  let invalidActualChannels = 0

  actuals?.forEach(actual => {
    if (!validChannels.has(actual.channel_code)) {
      invalidActualChannels++
    }
  })

  results.push({
    check: 'Sales Actuals → Channels',
    status: invalidActualChannels === 0 ? 'PASS' : 'FAIL',
    details: `${actuals?.length || 0} actuals checked, ${invalidActualChannels} invalid channel references`
  })

  // 12. Verify Inventory Snapshots → SKU
  const { data: snapshots } = await supabase
    .from('inventory_snapshots')
    .select('id, sku, warehouse_id')

  let invalidSnapshotSkus = 0

  snapshots?.forEach(snapshot => {
    if (!validSkus.has(snapshot.sku)) {
      invalidSnapshotSkus++
    }
  })

  results.push({
    check: 'Inventory Snapshots → Products (SKU)',
    status: invalidSnapshotSkus === 0 ? 'PASS' : 'FAIL',
    details: `${snapshots?.length || 0} snapshots checked, ${invalidSnapshotSkus} invalid SKU references`
  })

  // 13. Verify Inventory Snapshots → Warehouses
  let invalidSnapshotWarehouses = 0

  snapshots?.forEach(snapshot => {
    if (!warehouseIds.has(snapshot.warehouse_id)) {
      invalidSnapshotWarehouses++
    }
  })

  results.push({
    check: 'Inventory Snapshots → Warehouses',
    status: invalidSnapshotWarehouses === 0 ? 'PASS' : 'FAIL',
    details: `${snapshots?.length || 0} snapshots checked, ${invalidSnapshotWarehouses} invalid warehouse references`
  })

  // 14. Coverage checks (Warnings)
  const skuCount = validSkus.size
  const skusWithInventory = new Set(snapshots?.map(s => s.sku) || []).size
  const inventoryCoverage = ((skusWithInventory / skuCount) * 100).toFixed(1)

  results.push({
    check: 'Inventory Coverage',
    status: skusWithInventory === skuCount ? 'PASS' : 'WARNING',
    details: `${skusWithInventory}/${skuCount} SKUs have inventory data (${inventoryCoverage}%)`
  })

  const skusWithForecasts = new Set(forecasts?.map(f => f.sku) || []).size
  const forecastCoverage = ((skusWithForecasts / skuCount) * 100).toFixed(1)

  results.push({
    check: 'Sales Forecast Coverage',
    status: skusWithForecasts === skuCount ? 'PASS' : 'WARNING',
    details: `${skusWithForecasts}/${skuCount} SKUs have forecast data (${forecastCoverage}%)`
  })

  const poItemsWithDelivery = new Set(deliveries?.map(d => d.po_item_id) || []).size
  const deliveryCoverage = ((poItemsWithDelivery / (poItems?.length || 1)) * 100).toFixed(1)

  results.push({
    check: 'PO Delivery Coverage',
    status: poItemsWithDelivery === poItems?.length ? 'PASS' : 'WARNING',
    details: `${poItemsWithDelivery}/${poItems?.length || 0} PO items have delivery records (${deliveryCoverage}%)`
  })

  // Print results
  console.log('VERIFICATION RESULTS:')
  console.log('-'.repeat(80))
  console.log()

  const passCount = results.filter(r => r.status === 'PASS').length
  const failCount = results.filter(r => r.status === 'FAIL').length
  const warnCount = results.filter(r => r.status === 'WARNING').length

  results.forEach((result, index) => {
    const statusSymbol = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '⚠'
    const statusColor = result.status === 'PASS' ? 'PASS' : result.status === 'FAIL' ? 'FAIL' : 'WARN'

    console.log(`${(index + 1).toString().padStart(2)}. [${statusSymbol} ${statusColor}] ${result.check}`)
    console.log(`    ${result.details}`)
    console.log()
  })

  console.log('-'.repeat(80))
  console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed, ${warnCount} Warnings`)
  console.log('-'.repeat(80))

  if (failCount > 0) {
    console.log('\n⚠ CRITICAL: Data integrity issues detected! Please fix failed checks.')
  } else if (warnCount > 0) {
    console.log('\n⚠ WARNING: Some data coverage is incomplete. Consider adding more data.')
  } else {
    console.log('\n✓ SUCCESS: All relationship checks passed!')
  }

  console.log()
  console.log('='.repeat(80))
  console.log('Verification Complete')
  console.log('='.repeat(80))
}

main().catch(console.error)
