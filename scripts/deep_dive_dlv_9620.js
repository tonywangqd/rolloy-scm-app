/**
 * 深度调查：DLV-2025-9620 的 shipped_qty 为什么是 42 而不是 45?
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mliqjmoylepdwokzjfwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saXFqbW95bGVwZHdva3pqZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NjgyNzIsImV4cCI6MjA4MDA0NDI3Mn0.bJWzEzDu0HSibbGjxeVF20j6ry3cKyQAsfyF3d7Ays8'
);

async function deepDive() {
  console.log('='.repeat(100));
  console.log('深度调查：DLV-2025-9620');
  console.log('='.repeat(100));
  console.log();

  // 1. 查询交货单详情
  const { data: delivery } = await supabase
    .from('production_deliveries')
    .select('*')
    .eq('delivery_number', 'DLV-2025-9620')
    .single();

  console.log('【交货单详情】');
  console.log(`交货单号: ${delivery.delivery_number}`);
  console.log(`ID: ${delivery.id}`);
  console.log(`SKU: ${delivery.sku}`);
  console.log(`交货数量 (delivered_qty): ${delivery.delivered_qty}`);
  console.log(`已发货数量 (shipped_qty): ${delivery.shipped_qty}`);
  console.log(`发货状态 (shipment_status): ${delivery.shipment_status}`);
  console.log();

  // 2. 查询关联的shipments (通过production_delivery_id)
  console.log('【关联的运单 (通过production_delivery_id)】');
  const { data: linkedShipments } = await supabase
    .from('shipments')
    .select('*')
    .eq('production_delivery_id', delivery.id);

  console.log(`找到 ${linkedShipments.length} 条运单记录:`);
  linkedShipments.forEach(s => {
    console.log(`  - 运单: ${s.tracking_number}`);
    console.log(`    ID: ${s.id}`);
    console.log(`    实际发货: ${s.actual_departure_date || '未发货'}`);
  });
  console.log();

  // 3. 查询所有TEST-SKU-001的shipment_items
  console.log('【所有TEST-SKU-001的运单明细】');
  const { data: allItems } = await supabase
    .from('shipment_items')
    .select(`
      *,
      shipments (
        tracking_number,
        production_delivery_id,
        actual_departure_date
      )
    `)
    .eq('sku', 'TEST-SKU-001');

  console.log(`找到 ${allItems.length} 条运单明细:`);
  allItems.forEach(item => {
    console.log(`  运单: ${item.shipments.tracking_number}`);
    console.log(`    - shipment_id: ${item.shipment_id}`);
    console.log(`    - production_delivery_id: ${item.shipments.production_delivery_id || 'null'}`);
    console.log(`    - 数量: ${item.shipped_qty}`);
    console.log(`    - 实际发货: ${item.shipments.actual_departure_date || '未发货'}`);
    console.log(`    - 是否关联到DLV-2025-9620: ${item.shipments.production_delivery_id === delivery.id ? '✅ 是' : '❌ 否'}`);
    console.log();
  });

  // 4. 查询delivery_shipment_allocations (新表)
  console.log('【delivery_shipment_allocations 分配记录】');
  const { data: allocations } = await supabase
    .from('delivery_shipment_allocations')
    .select('*')
    .eq('delivery_id', delivery.id);

  console.log(`找到 ${allocations.length} 条分配记录`);
  if (allocations.length > 0) {
    allocations.forEach(a => {
      console.log(`  - shipment_id: ${a.shipment_id}`);
      console.log(`    shipped_qty: ${a.shipped_qty}`);
      console.log();
    });
  }

  // 5. 分析
  console.log('='.repeat(100));
  console.log('【分析】');
  console.log('='.repeat(100));
  console.log();

  console.log('关键发现:');
  console.log(`1. DLV-2025-9620 的 delivered_qty = ${delivery.delivered_qty}`);
  console.log(`2. DLV-2025-9620 的 shipped_qty = ${delivery.shipped_qty}`);
  console.log(`3. 差异: ${delivery.delivered_qty - delivery.shipped_qty}`);
  console.log();

  const linkedItems = allItems.filter(item => item.shipments.production_delivery_id === delivery.id);
  const unlinkedItems = allItems.filter(item => item.shipments.production_delivery_id !== delivery.id);

  console.log(`4. 通过production_delivery_id直接关联的运单明细: ${linkedItems.length} 条`);
  if (linkedItems.length > 0) {
    const linkedTotal = linkedItems.reduce((sum, item) => sum + item.shipped_qty, 0);
    console.log(`   总数量: ${linkedTotal}`);
  }
  console.log();

  console.log(`5. 未关联的运单明细: ${unlinkedItems.length} 条`);
  if (unlinkedItems.length > 0) {
    unlinkedItems.forEach(item => {
      console.log(`   - ${item.shipments.tracking_number}: ${item.shipped_qty} 件`);
    });
    const unlinkedTotal = unlinkedItems.reduce((sum, item) => sum + item.shipped_qty, 0);
    console.log(`   总数量: ${unlinkedTotal}`);
  }
  console.log();

  console.log('推论:');
  console.log('- 如果 shipped_qty=42 是正确的，那么只有42件被分配到运单');
  console.log('- 如果实际运单有45件，那么 shipped_qty 字段没有正确更新');
  console.log('- 需要检查运单创建/更新时，production_deliveries.shipped_qty 的更新逻辑');
  console.log();

  // 6. 查询审计日志 (如果有)
  console.log('【检查是否有更新历史】');
  console.log('查询 delivery_deletion_audit_log...');
  const { data: auditLogs } = await supabase
    .from('delivery_deletion_audit_log')
    .select('*')
    .eq('delivery_id', delivery.id);

  if (auditLogs && auditLogs.length > 0) {
    console.log(`找到 ${auditLogs.length} 条审计日志`);
    auditLogs.forEach(log => {
      console.log(`  - 操作: ${log.operation || 'N/A'}`);
      console.log(`    时间: ${log.deleted_at || 'N/A'}`);
      console.log(`    操作人: ${log.deleted_by || 'N/A'}`);
      console.log();
    });
  } else {
    console.log('未找到审计日志');
  }

  console.log();
  console.log('='.repeat(100));
}

deepDive()
  .then(() => {
    console.log('\n✅ 调查完成');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ 调查失败:', err);
    process.exit(1);
  });
