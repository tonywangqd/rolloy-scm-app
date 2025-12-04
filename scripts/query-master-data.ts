/**
 * Query Master Data Script
 * 快速查询主数据列表 (SKU, 仓库, 渠道, 供应商)
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function main() {
  console.log('='.repeat(80))
  console.log('Rolloy SCM Master Data Quick Reference')
  console.log('='.repeat(80))
  console.log()

  // 1. Products (SKU列表)
  console.log('1. PRODUCTS (产品/SKU列表)')
  console.log('-'.repeat(80))
  const { data: products } = await supabase
    .from('products')
    .select('sku, spu, color_code, product_name, unit_cost_usd, safety_stock_weeks, production_lead_weeks, is_active')
    .order('spu', { ascending: true })
    .order('sku', { ascending: true })

  if (products && products.length > 0) {
    console.log(`Total SKUs: ${products.length}\n`)
    console.log('SKU        | SPU   | Color | Product Name                | Cost   | Safe Stock | Lead Time | Active')
    console.log('-'.repeat(110))
    products.forEach(p => {
      const sku = p.sku.padEnd(10)
      const spu = p.spu.padEnd(5)
      const color = p.color_code.padEnd(5)
      const name = p.product_name.padEnd(27)
      const cost = `$${p.unit_cost_usd}`.padStart(6)
      const safe = `${p.safety_stock_weeks}wk`.padStart(10)
      const lead = `${p.production_lead_weeks}wk`.padStart(9)
      const active = p.is_active ? '✓' : '✗'
      console.log(`${sku} | ${spu} | ${color} | ${name} | ${cost} | ${safe} | ${lead} | ${active}`)
    })
  }

  console.log('\n')

  // 2. Warehouses (仓库列表 - 仅前20个)
  console.log('2. WAREHOUSES (仓库列表 - Top 20)')
  console.log('-'.repeat(80))
  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('warehouse_code, warehouse_name, warehouse_type, region, is_active')
    .order('warehouse_code', { ascending: true })
    .limit(20)

  if (warehouses && warehouses.length > 0) {
    const { count: totalWarehouses } = await supabase
      .from('warehouses')
      .select('*', { count: 'exact', head: true })

    console.log(`Total Warehouses: ${totalWarehouses} (showing first 20)\n`)
    console.log('Code         | Name                      | Type | Region  | Active')
    console.log('-'.repeat(75))
    warehouses.forEach(w => {
      const code = w.warehouse_code.padEnd(12)
      const name = w.warehouse_name.padEnd(25)
      const type = w.warehouse_type.padEnd(4)
      const region = w.region.padEnd(7)
      const active = w.is_active ? '✓' : '✗'
      console.log(`${code} | ${name} | ${type} | ${region} | ${active}`)
    })
  }

  console.log('\n')

  // 3. Channels (渠道列表)
  console.log('3. CHANNELS (销售渠道列表)')
  console.log('-'.repeat(80))
  const { data: channels } = await supabase
    .from('channels')
    .select('channel_code, channel_name, is_active')
    .order('channel_code', { ascending: true })

  if (channels && channels.length > 0) {
    console.log(`Total Channels: ${channels.length}\n`)
    console.log('Code         | Channel Name          | Active')
    console.log('-'.repeat(50))
    channels.forEach(c => {
      const code = c.channel_code.padEnd(12)
      const name = c.channel_name.padEnd(21)
      const active = c.is_active ? '✓' : '✗'
      console.log(`${code} | ${name} | ${active}`)
    })
  }

  console.log('\n')

  // 4. Suppliers (供应商列表)
  console.log('4. SUPPLIERS (供应商列表)')
  console.log('-'.repeat(80))
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('supplier_code, supplier_name, payment_terms_days, is_active')
    .order('supplier_code', { ascending: true })

  if (suppliers && suppliers.length > 0) {
    console.log(`Total Suppliers: ${suppliers.length}\n`)
    console.log('Code         | Supplier Name             | Payment Terms | Active')
    console.log('-'.repeat(70))
    suppliers.forEach(s => {
      const code = s.supplier_code.padEnd(12)
      const name = s.supplier_name.padEnd(25)
      const terms = `${s.payment_terms_days} days`.padStart(13)
      const active = s.is_active ? '✓' : '✗'
      console.log(`${code} | ${name} | ${terms} | ${active}`)
    })
  }

  console.log('\n')
  console.log('='.repeat(80))
  console.log('Query Complete')
  console.log('='.repeat(80))
}

main().catch(console.error)
