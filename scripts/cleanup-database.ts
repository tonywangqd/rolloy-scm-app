/**
 * 数据库清理脚本
 * 简化测试数据，每种数据类型只保留1条
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// 手动加载 .env.local 文件
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      process.env[match[1].trim()] = match[2].trim()
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 环境变量未设置。请确保 .env.local 文件存在且包含 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// 获取当前 ISO 周
function getCurrentWeek(): string {
  const now = new Date()
  const jan1 = new Date(now.getFullYear(), 0, 1)
  const days = Math.floor((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000))
  const weekNum = Math.ceil((days + jan1.getDay() + 1) / 7)
  return `${now.getFullYear()}-${weekNum.toString().padStart(2, '0')}`
}

// 计算 ISO 周 + offset
function addWeeks(weekStr: string, offset: number): string {
  const [year, week] = weekStr.split('-').map(Number)
  let newWeek = week + offset
  let newYear = year

  while (newWeek > 52) {
    newWeek -= 52
    newYear++
  }
  while (newWeek < 1) {
    newWeek += 52
    newYear--
  }

  return `${newYear}-${newWeek.toString().padStart(2, '0')}`
}

// 从 ISO 周获取周的开始和结束日期
function getWeekDates(weekStr: string): { start: string; end: string } {
  const [year, week] = weekStr.split('-').map(Number)
  // 找到该年第一天
  const jan4 = new Date(year, 0, 4) // 1月4日总在第一周
  const dayOfWeek = jan4.getDay() || 7
  // 计算第一周的周一
  const firstMonday = new Date(jan4)
  firstMonday.setDate(jan4.getDate() - dayOfWeek + 1)
  // 计算目标周的周一
  const targetMonday = new Date(firstMonday)
  targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7)
  // 计算周日
  const targetSunday = new Date(targetMonday)
  targetSunday.setDate(targetMonday.getDate() + 6)

  const formatDate = (d: Date) => d.toISOString().split('T')[0]
  return { start: formatDate(targetMonday), end: formatDate(targetSunday) }
}

async function cleanupDatabase() {
  console.log('🧹 开始清理数据库...\n')

  // 第一步：删除所有业务数据
  console.log('📍 第一步：清理现有数据...')

  const tablesToClean = [
    'balance_resolutions',
    'inventory_adjustments',
    'replenishment_suggestions',
    'shipment_items',
    'shipments',
    'production_deliveries',
    'purchase_order_items',
    'purchase_orders',
    'inventory_snapshots',
    'inventory_projections',
    'sales_actuals',
    'sales_forecasts',
    'products',
    'channels',
    'warehouses',
    'suppliers',
  ]

  for (const table of tablesToClean) {
    try {
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error && !error.message.includes('does not exist')) {
        console.log(`  ⚠️  ${table}: ${error.message}`)
      } else {
        console.log(`  ✓ ${table} 已清空`)
      }
    } catch (e: any) {
      console.log(`  ⚠️  ${table}: ${e.message}`)
    }
  }

  // 第二步：插入简化的主数据
  console.log('\n📍 第二步：插入简化主数据...')

  // 1. 供应商
  const { data: supplier, error: supplierError } = await supabase
    .from('suppliers')
    .insert({
      supplier_code: 'SUP-001',
      supplier_name: 'Default Supplier',
      payment_terms_days: 60,
      is_active: true,
    })
    .select()
    .single()

  if (supplierError) {
    console.log(`  ❌ 供应商: ${supplierError.message}`)
    return
  }
  console.log(`  ✓ 供应商: ${supplier.supplier_code}`)

  // 2. 仓库
  const { data: warehouse, error: warehouseError } = await supabase
    .from('warehouses')
    .insert({
      warehouse_code: 'WH-001',
      warehouse_name: 'Main Warehouse',
      warehouse_type: 'FBA',
      region: 'East',
      is_active: true,
    })
    .select()
    .single()

  if (warehouseError) {
    console.log(`  ❌ 仓库: ${warehouseError.message}`)
    return
  }
  console.log(`  ✓ 仓库: ${warehouse.warehouse_code}`)

  // 3. 渠道 (只使用基础字段)
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .insert({
      channel_code: 'AMZ-US',
      channel_name: 'Amazon US',
      is_active: true,
    })
    .select()
    .single()

  if (channelError) {
    console.log(`  ❌ 渠道: ${channelError.message}`)
    return
  }
  console.log(`  ✓ 渠道: ${channel.channel_code}`)

  // 4. 产品 (使用正确的字段名，包含必需字段)
  const { data: product, error: productError } = await supabase
    .from('products')
    .insert({
      sku: 'TEST-SKU-001',
      spu: 'TEST-SPU-001',
      color_code: 'BLACK',
      product_name: 'Test Product',
      unit_cost_usd: 25.00,
      safety_stock_weeks: 2,
      production_lead_weeks: 5,
      is_active: true,
    })
    .select()
    .single()

  if (productError) {
    console.log(`  ❌ 产品: ${productError.message}`)
    return
  }
  console.log(`  ✓ 产品: ${product.sku}`)

  // 第三步：插入业务数据
  console.log('\n📍 第三步：插入业务数据...')

  const currentWeek = getCurrentWeek()
  console.log(`  当前周: ${currentWeek}`)

  // 1. 库存快照 (初始库存 500 件)
  const { error: snapshotError } = await supabase
    .from('inventory_snapshots')
    .insert({
      sku: 'TEST-SKU-001',
      warehouse_id: warehouse.id,
      qty_on_hand: 500,
    })

  if (snapshotError) {
    console.log(`  ❌ 库存快照: ${snapshotError.message}`)
  } else {
    console.log(`  ✓ 库存快照: 500 件`)
  }

  // 2. 销量预测 (未来12周) - 使用 channel_code 和日期
  const forecasts = []
  for (let i = 0; i < 12; i++) {
    const week = addWeeks(currentWeek, i)
    const dates = getWeekDates(week)
    forecasts.push({
      sku: 'TEST-SKU-001',
      channel_code: channel.channel_code,
      week_iso: week,
      week_start_date: dates.start,
      week_end_date: dates.end,
      forecast_qty: i < 4 ? 100 : 80,  // 前4周100件，之后80件
    })
  }

  const { error: forecastError } = await supabase
    .from('sales_forecasts')
    .insert(forecasts)

  if (forecastError) {
    console.log(`  ❌ 销量预测: ${forecastError.message}`)
  } else {
    console.log(`  ✓ 销量预测: ${forecasts.length} 条 (未来12周)`)
  }

  // 3. 历史实际销量 (过去4周) - 使用 channel_code 和日期
  const actuals = []
  for (let i = 1; i <= 4; i++) {
    const week = addWeeks(currentWeek, -i)
    const dates = getWeekDates(week)
    actuals.push({
      sku: 'TEST-SKU-001',
      channel_code: channel.channel_code,
      week_iso: week,
      week_start_date: dates.start,
      week_end_date: dates.end,
      actual_qty: 90 + (i * 5),  // 95, 100, 105, 110
    })
  }

  const { error: actualsError } = await supabase
    .from('sales_actuals')
    .insert(actuals)

  if (actualsError) {
    console.log(`  ❌ 实际销量: ${actualsError.message}`)
  } else {
    console.log(`  ✓ 实际销量: ${actuals.length} 条 (过去4周)`)
  }

  // 验证结果
  console.log('\n📍 验证结果...')

  const tables = ['products', 'suppliers', 'warehouses', 'channels', 'inventory_snapshots', 'sales_forecasts', 'sales_actuals']

  for (const table of tables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
    console.log(`  ${table}: ${count} 条`)
  }

  console.log('\n✅ 数据库清理和初始化完成！')
  console.log('\n📋 测试数据概要:')
  console.log('  - 1 个 SKU: TEST-SKU-001')
  console.log('  - 1 个仓库: WH-001 (Main Warehouse)')
  console.log('  - 1 个渠道: AMZ-US (Amazon US)')
  console.log('  - 1 个供应商: SUP-001 (Default Supplier)')
  console.log('  - 初始库存: 500 件')
  console.log('  - 销量预测: 12 周')
  console.log('  - 历史销量: 4 周')
}

cleanupDatabase().catch(console.error)
