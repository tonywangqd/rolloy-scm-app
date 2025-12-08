/**
 * 简化版数据追踪脚本：调查 TEST-SKU-001 的数量差异
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mliqjmoylepdwokzjfwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saXFqbW95bGVwZHdva3pqZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NjgyNzIsImV4cCI6MjA4MDA0NDI3Mn0.bJWzEzDu0HSibbGjxeVF20j6ry3cKyQAsfyF3d7Ays8'
);

async function investigateSKU() {
  console.log('='.repeat(80));
  console.log('数据追踪报告: TEST-SKU-001');
  console.log('='.repeat(80));
  console.log();

  // 1. 查询采购订单项
  console.log('【第1层】采购订单项 (purchase_order_items)');
  console.log('-'.repeat(80));

  const { data: poItems, error: poError } = await supabase
    .from('purchase_order_items')
    .select(`
      *,
      purchase_orders!inner(po_number, po_status)
    `)
    .eq('sku', 'TEST-SKU-001')
    .order('purchase_orders(po_number)');

  if (poError) {
    console.error('❌ 查询失败:', poError);
    return;
  }

  let totalOrdered = 0;
  let totalDelivered = 0;

  poItems.forEach(item => {
    const pending = item.ordered_qty - item.delivered_qty;
    totalOrdered += item.ordered_qty;
    totalDelivered += item.delivered_qty;

    console.log(`订单: ${item.purchase_orders.po_number}`);
    console.log(`  - 订购数量: ${item.ordered_qty}`);
    console.log(`  - 已交货数量: ${item.delivered_qty}`);
    console.log(`  - 待交货数量: ${pending}`);
  });

  console.log();
  console.log(`汇总: 订购=${totalOrdered}, 已交货=${totalDelivered}, 待交货=${totalOrdered - totalDelivered}`);
  console.log();

  // 2. 查询生产交货记录
  console.log('【第2层】生产交货记录 (production_deliveries)');
  console.log('-'.repeat(80));

  const { data: deliveries, error: delError } = await supabase
    .from('production_deliveries')
    .select('*')
    .eq('sku', 'TEST-SKU-001')
    .order('actual_delivery_date');

  if (delError) {
    console.error('❌ 查询失败:', delError);
    return;
  }

  let totalDeliveryQty = 0;
  let totalShippedFromFactory = 0;

  deliveries.forEach(del => {
    const pending = del.delivered_qty - (del.shipped_qty || 0);
    totalDeliveryQty += del.delivered_qty;
    totalShippedFromFactory += del.shipped_qty || 0;

    console.log(`交货记录: ${del.delivery_number}`);
    console.log(`  - 交货日期: ${del.actual_delivery_date || del.planned_delivery_date}`);
    console.log(`  - 交货数量: ${del.delivered_qty}`);
    console.log(`  - 已发货数量: ${del.shipped_qty || 0}`);
    console.log(`  - 待发货数量: ${pending}`);
    console.log(`  - 发货状态: ${del.shipment_status}`);
  });

  console.log();
  console.log(`汇总: 工厂交货总量=${totalDeliveryQty}, 已发往物流=${totalShippedFromFactory}, 待发货=${totalDeliveryQty - totalShippedFromFactory}`);
  console.log();

  // 3. 查询发货分配记录
  console.log('【第3层】发货分配记录 (delivery_shipment_allocations)');
  console.log('-'.repeat(80));

  const { data: allocations, error: allocError } = await supabase
    .from('delivery_shipment_allocations')
    .select(`
      *,
      shipments (
        tracking_number,
        planned_departure_date,
        actual_departure_date
      )
    `)
    .in('delivery_id', deliveries.map(d => d.id))
    .order('shipment_id');

  if (allocError) {
    console.error('❌ 查询失败:', allocError);
    return;
  }

  let totalAllocatedQty = 0;
  let actualShippedQty = 0;

  const groupedByShipment = {};
  allocations.forEach(alloc => {
    const trackingNumber = alloc.shipments.tracking_number;
    if (!groupedByShipment[trackingNumber]) {
      groupedByShipment[trackingNumber] = {
        ...alloc.shipments,
        allocations: []
      };
    }
    groupedByShipment[trackingNumber].allocations.push(alloc);
  });

  Object.entries(groupedByShipment).forEach(([trackingNumber, shipment]) => {
    const totalQty = shipment.allocations.reduce((sum, alloc) => sum + alloc.shipped_qty, 0);
    totalAllocatedQty += totalQty;

    const isActuallyShipped = shipment.actual_departure_date !== null;
    if (isActuallyShipped) {
      actualShippedQty += totalQty;
    }

    console.log(`运单: ${trackingNumber}`);
    console.log(`  - 计划发货日期: ${shipment.planned_departure_date || 'N/A'}`);
    console.log(`  - 实际发货日期: ${shipment.actual_departure_date || '尚未发货'}`);
    console.log(`  - 分配数量: ${totalQty}`);
    console.log(`  - 是否已实际发货: ${isActuallyShipped ? '✅ 是' : '❌ 否'}`);

    shipment.allocations.forEach(alloc => {
      const delivery = deliveries.find(d => d.id === alloc.delivery_id);
      console.log(`    └─ 来自交货单: ${delivery?.delivery_number}, 数量: ${alloc.shipped_qty}`);
    });
  });

  console.log();
  console.log(`汇总: 分配总数量=${totalAllocatedQty}, 实际已发货=${actualShippedQty}, 待发货=${totalAllocatedQty - actualShippedQty}`);
  console.log();

  // 4. 数据一致性检查
  console.log('【数据一致性检查】');
  console.log('='.repeat(80));

  console.log(`\n第1层 → 第2层:`);
  console.log(`  采购已交货 (${totalDelivered}) vs 生产交货总量 (${totalDeliveryQty})`);
  console.log(`  差异: ${Math.abs(totalDelivered - totalDeliveryQty)} ${totalDelivered === totalDeliveryQty ? '✅ 一致' : '❌ 不一致'}`);

  console.log(`\n第2层 → 第3层:`);
  console.log(`  生产已发货 (${totalShippedFromFactory}) vs 分配总量 (${totalAllocatedQty})`);
  console.log(`  差异: ${Math.abs(totalShippedFromFactory - totalAllocatedQty)} ${totalShippedFromFactory === totalAllocatedQty ? '✅ 一致' : '❌ 不一致'}`);

  console.log(`\n第3层内部检查:`);
  console.log(`  分配总量 (${totalAllocatedQty}) vs 实际已发货 (${actualShippedQty})`);
  console.log(`  待发货: ${totalAllocatedQty - actualShippedQty}`);

  console.log(`\n待发货计算验证:`);
  const calculatedPending = totalDeliveryQty - actualShippedQty;
  console.log(`  工厂交货总量 (${totalDeliveryQty}) - 物流实际已发货 (${actualShippedQty}) = ${calculatedPending}`);
  console.log(`  用户预期: 3`);
  console.log(`  系统显示: 5`);
  console.log(`  实际计算: ${calculatedPending}`);

  if (calculatedPending !== 3 && calculatedPending !== 5) {
    console.log(`  ⚠️  计算结果与用户报告均不匹配!`);
  } else if (calculatedPending === 5) {
    console.log(`  ✅ 计算结果与系统显示一致 (5)`);
    console.log(`  ❌ 但与用户预期不符 (预期3)`);
  } else {
    console.log(`  ✅ 计算结果与用户预期一致 (3)`);
  }

  // 5. 详细分解
  console.log();
  console.log('【详细分解】');
  console.log('='.repeat(80));

  console.log('\n各交货单的发货情况:');
  deliveries.forEach(del => {
    console.log(`\n${del.delivery_number}:`);
    console.log(`  交货数量: ${del.delivered_qty}`);
    console.log(`  shipped_qty字段: ${del.shipped_qty || 0}`);

    const relatedAllocs = allocations.filter(a => a.delivery_id === del.id);
    const allocatedTotal = relatedAllocs.reduce((sum, a) => sum + a.shipped_qty, 0);
    const actualShippedFromAllocs = relatedAllocs
      .filter(a => a.shipments.actual_departure_date !== null)
      .reduce((sum, a) => sum + a.shipped_qty, 0);

    console.log(`  分配记录总量: ${allocatedTotal}`);
    console.log(`  实际已发货 (actual_departure_date不为空): ${actualShippedFromAllocs}`);
    console.log(`  待发货: ${del.delivered_qty - actualShippedFromAllocs}`);

    if (relatedAllocs.length > 0) {
      console.log(`  分配详情:`);
      relatedAllocs.forEach(a => {
        console.log(`    - 运单: ${a.shipments.tracking_number}, 数量: ${a.shipped_qty}, 实际发货: ${a.shipments.actual_departure_date || '未发货'}`);
      });
    }
  });

  console.log();
  console.log('='.repeat(80));
}

investigateSKU()
  .then(() => {
    console.log('\n✅ 调查完成');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ 调查失败:', err);
    process.exit(1);
  });
