/**
 * Database Analysis Script
 * 分析数据库中各表的数据量和内容
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface TableStats {
  tableName: string
  count: number
  sampleData?: any[]
  error?: string
}

async function analyzeTable(tableName: string, selectFields: string = '*'): Promise<TableStats> {
  try {
    // 获取总数
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (countError) {
      return { tableName, count: 0, error: countError.message }
    }

    // 获取前5条样本数据
    const { data: sampleData, error: dataError } = await supabase
      .from(tableName)
      .select(selectFields)
      .limit(5)

    if (dataError) {
      return { tableName, count: count || 0, error: dataError.message }
    }

    return {
      tableName,
      count: count || 0,
      sampleData: sampleData || []
    }
  } catch (error) {
    return {
      tableName,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function main() {
  console.log('========================================')
  console.log('Rolloy SCM Database Analysis Report')
  console.log('========================================\n')

  const tables = [
    { name: 'products', fields: 'sku, spu, color_code, product_name, unit_cost_usd, safety_stock_weeks, production_lead_weeks, is_active' },
    { name: 'warehouses', fields: 'warehouse_code, warehouse_name, warehouse_type, region, postal_code, is_active' },
    { name: 'channels', fields: 'channel_code, channel_name, is_active' },
    { name: 'suppliers', fields: 'supplier_code, supplier_name, contact_email, payment_terms_days, is_active' },
    { name: 'purchase_orders', fields: 'po_number, batch_code, supplier_id, po_status, planned_order_date, actual_order_date, planned_ship_date' },
    { name: 'purchase_order_items', fields: 'po_id, sku, channel_code, ordered_qty, delivered_qty, unit_price_usd' },
    { name: 'production_deliveries', fields: 'delivery_number, po_item_id, sku, channel_code, delivered_qty, planned_delivery_date, actual_delivery_date, payment_status' },
    { name: 'shipments', fields: 'tracking_number, batch_code, destination_warehouse_id, planned_departure_date, actual_departure_date, planned_arrival_date, actual_arrival_date, weight_kg, unit_count' },
    { name: 'shipment_items', fields: 'shipment_id, sku, shipped_qty' },
    { name: 'sales_forecasts', fields: 'sku, channel_code, week_iso, week_start_date, forecast_qty' },
    { name: 'sales_actuals', fields: 'sku, channel_code, week_iso, week_start_date, actual_qty' },
    { name: 'inventory_snapshots', fields: 'sku, warehouse_id, qty_on_hand, last_counted_at' },
  ]

  const results: TableStats[] = []

  for (const table of tables) {
    const stats = await analyzeTable(table.name, table.fields)
    results.push(stats)
  }

  // 打印结果
  console.log('1. 数据量统计 (Table Row Counts)\n')
  console.log('┌─────────────────────────────┬────────────┐')
  console.log('│ Table Name                  │ Row Count  │')
  console.log('├─────────────────────────────┼────────────┤')

  results.forEach(({ tableName, count, error }) => {
    const displayName = tableName.padEnd(27)
    const displayCount = error ? 'ERROR'.padStart(10) : count.toString().padStart(10)
    console.log(`│ ${displayName} │ ${displayCount} │`)
  })

  console.log('└─────────────────────────────┴────────────┘\n')

  // 打印详细内容
  console.log('\n2. 样本数据详情 (Sample Data Details)\n')

  results.forEach(({ tableName, count, sampleData, error }) => {
    console.log(`\n[${tableName}] - Total: ${count} rows`)
    console.log('─'.repeat(80))

    if (error) {
      console.log(`❌ Error: ${error}`)
    } else if (count === 0) {
      console.log('⚠️  Empty table')
    } else if (sampleData && sampleData.length > 0) {
      console.log(JSON.stringify(sampleData, null, 2))
    }
  })

  // 分析关联关系
  console.log('\n\n3. 数据关联关系分析 (Relationship Analysis)\n')
  console.log('─'.repeat(80))

  const productsCount = results.find(r => r.tableName === 'products')?.count || 0
  const warehousesCount = results.find(r => r.tableName === 'warehouses')?.count || 0
  const channelsCount = results.find(r => r.tableName === 'channels')?.count || 0
  const suppliersCount = results.find(r => r.tableName === 'suppliers')?.count || 0
  const posCount = results.find(r => r.tableName === 'purchase_orders')?.count || 0
  const poItemsCount = results.find(r => r.tableName === 'purchase_order_items')?.count || 0
  const shipmentsCount = results.find(r => r.tableName === 'shipments')?.count || 0
  const shipmentItemsCount = results.find(r => r.tableName === 'shipment_items')?.count || 0
  const forecastsCount = results.find(r => r.tableName === 'sales_forecasts')?.count || 0
  const actualsCount = results.find(r => r.tableName === 'sales_actuals')?.count || 0

  console.log(`✓ 基础数据 (Master Data):`)
  console.log(`  - Products: ${productsCount} SKUs`)
  console.log(`  - Warehouses: ${warehousesCount} locations`)
  console.log(`  - Channels: ${channelsCount} channels`)
  console.log(`  - Suppliers: ${suppliersCount} suppliers`)

  console.log(`\n✓ 采购链条 (Procurement Chain):`)
  console.log(`  - Purchase Orders: ${posCount} POs`)
  console.log(`  - Purchase Order Items: ${poItemsCount} line items`)
  console.log(`  - Average items per PO: ${posCount > 0 ? (poItemsCount / posCount).toFixed(1) : 'N/A'}`)

  console.log(`\n✓ 物流链条 (Logistics Chain):`)
  console.log(`  - Shipments: ${shipmentsCount} shipments`)
  console.log(`  - Shipment Items: ${shipmentItemsCount} line items`)
  console.log(`  - Average items per shipment: ${shipmentsCount > 0 ? (shipmentItemsCount / shipmentsCount).toFixed(1) : 'N/A'}`)

  console.log(`\n✓ 销售数据 (Sales Data):`)
  console.log(`  - Forecasts: ${forecastsCount} forecast records`)
  console.log(`  - Actuals: ${actualsCount} actual records`)

  console.log('\n========================================')
  console.log('Analysis Complete')
  console.log('========================================\n')
}

main().catch(console.error)
