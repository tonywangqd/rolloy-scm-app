/**
 * 检查shipments表是否有数据
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mliqjmoylepdwokzjfwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saXFqbW95bGVwZHdva3pqZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NjgyNzIsImV4cCI6MjA4MDA0NDI3Mn0.bJWzEzDu0HSibbGjxeVF20j6ry3cKyQAsfyF3d7Ays8'
);

async function checkShipments() {
  console.log('='.repeat(80));
  console.log('检查 shipments 表');
  console.log('='.repeat(80));

  // 查询所有shipments
  const { data: shipments, error: shipError } = await supabase
    .from('shipments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (shipError) {
    console.error('❌ 查询失败:', shipError);
    return;
  }

  console.log(`\n找到 ${shipments.length} 条运单记录:\n`);
  shipments.forEach(s => {
    console.log(`运单: ${s.tracking_number}`);
    console.log(`  - ID: ${s.id}`);
    console.log(`  - production_delivery_id: ${s.production_delivery_id || 'null'}`);
    console.log(`  - 计划发货: ${s.planned_departure_date || 'N/A'}`);
    console.log(`  - 实际发货: ${s.actual_departure_date || '未发货'}`);
    console.log();
  });

  // 查询delivery_shipment_allocations表
  console.log('='.repeat(80));
  console.log('检查 delivery_shipment_allocations 表');
  console.log('='.repeat(80));

  const { data: allocations, error: allocError } = await supabase
    .from('delivery_shipment_allocations')
    .select('*')
    .limit(20);

  if (allocError) {
    console.error('❌ 查询失败:', allocError);
    return;
  }

  console.log(`\n找到 ${allocations.length} 条分配记录:\n`);
  allocations.forEach(a => {
    console.log(`分配记录: ${a.id}`);
    console.log(`  - delivery_id: ${a.delivery_id}`);
    console.log(`  - shipment_id: ${a.shipment_id}`);
    console.log(`  - shipped_qty: ${a.shipped_qty}`);
    console.log();
  });

  // 查询shipment_items表 (旧表)
  console.log('='.repeat(80));
  console.log('检查 shipment_items 表 (旧表)');
  console.log('='.repeat(80));

  const { data: shipmentItems, error: itemsError } = await supabase
    .from('shipment_items')
    .select(`
      *,
      shipments (
        tracking_number,
        actual_departure_date
      )
    `)
    .eq('sku', 'TEST-SKU-001')
    .limit(20);

  if (itemsError) {
    console.error('❌ 查询失败:', itemsError);
  } else {
    console.log(`\n找到 ${shipmentItems.length} 条shipment_items记录:\n`);
    shipmentItems.forEach(item => {
      console.log(`运单明细:`);
      console.log(`  - shipment_id: ${item.shipment_id}`);
      console.log(`  - 运单号: ${item.shipments?.tracking_number || 'N/A'}`);
      console.log(`  - SKU: ${item.sku}`);
      console.log(`  - 数量: ${item.shipped_qty}`);
      console.log(`  - 实际发货日期: ${item.shipments?.actual_departure_date || '未发货'}`);
      console.log();
    });
  }

  console.log('='.repeat(80));
}

checkShipments()
  .then(() => {
    console.log('\n✅ 检查完成');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ 检查失败:', err);
    process.exit(1);
  });
