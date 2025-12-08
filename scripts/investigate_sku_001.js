/**
 * 数据追踪脚本：调查 TEST-SKU-001 的数量差异
 *
 * 用户报告：
 * - 工厂总出货: 50
 * - 物流实际发货: 47 (45+2)
 * - 剩余应该是 3，但显示 5
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
      id,
      po_number,
      product_id,
      ordered_qty,
      delivered_qty,
      purchase_orders (
        po_number,
        po_status,
        order_date
      )
    `)
    .eq('product_id', 'TEST-SKU-001')
    .order('po_number');

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

    console.log(`订单: ${item.po_number}`);
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
    .select(`
      id,
      po_number,
      product_id,
      delivered_qty,
      shipped_qty,
      delivery_date,
      status
    `)
    .eq('product_id', 'TEST-SKU-001')
    .order('delivery_date');

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

    console.log(`交货记录: ${del.id} (订单: ${del.po_number})`);
    console.log(`  - 交货日期: ${del.delivery_date}`);
    console.log(`  - 交货数量: ${del.delivered_qty}`);
    console.log(`  - 已发货数量: ${del.shipped_qty || 0}`);
    console.log(`  - 待发货数量: ${pending}`);
    console.log(`  - 状态: ${del.status}`);
  });

  console.log();
  console.log(`汇总: 工厂交货总量=${totalDeliveryQty}, 已发往物流=${totalShippedFromFactory}, 待发货=${totalDeliveryQty - totalShippedFromFactory}`);
  console.log();

  // 3. 查询物流发货记录
  console.log('【第3层】物流发货记录 (shipments + shipment_items)');
  console.log('-'.repeat(80));

  const { data: shipmentItems, error: shipError } = await supabase
    .from('shipment_items')
    .select(`
      id,
      shipment_id,
      product_id,
      shipped_qty,
      shipments (
        shipment_number,
        planned_departure_date,
        actual_departure_date,
        shipment_status,
        destination_warehouse_id
      )
    `)
    .eq('product_id', 'TEST-SKU-001')
    .order('shipment_id');

  if (shipError) {
    console.error('❌ 查询失败:', shipError);
    return;
  }

  let totalShipmentQty = 0;
  let actualShippedQty = 0;

  const groupedByShipment = {};
  shipmentItems.forEach(item => {
    const shipmentNumber = item.shipments.shipment_number;
    if (!groupedByShipment[shipmentNumber]) {
      groupedByShipment[shipmentNumber] = {
        ...item.shipments,
        items: []
      };
    }
    groupedByShipment[shipmentNumber].items.push(item);
  });

  Object.entries(groupedByShipment).forEach(([shipmentNumber, shipment]) => {
    const totalQty = shipment.items.reduce((sum, item) => sum + item.shipped_qty, 0);
    totalShipmentQty += totalQty;

    const isActuallyShipped = shipment.actual_departure_date !== null;
    if (isActuallyShipped) {
      actualShippedQty += totalQty;
    }

    console.log(`运单: ${shipmentNumber}`);
    console.log(`  - 计划发货日期: ${shipment.planned_departure_date || 'N/A'}`);
    console.log(`  - 实际发货日期: ${shipment.actual_departure_date || '尚未发货'}`);
    console.log(`  - 发货数量: ${totalQty}`);
    console.log(`  - 状态: ${shipment.shipment_status}`);
    console.log(`  - 仓库: ${shipment.destination_warehouse_id || 'N/A'}`);
    console.log(`  - 是否已实际发货: ${isActuallyShipped ? '✅ 是' : '❌ 否'}`);
  });

  console.log();
  console.log(`汇总: 运单总数量=${totalShipmentQty}, 实际已发货=${actualShippedQty}, 待发货=${totalShipmentQty - actualShippedQty}`);
  console.log();

  // 4. 数据一致性检查
  console.log('【数据一致性检查】');
  console.log('='.repeat(80));

  console.log(`\n第1层 → 第2层:`);
  console.log(`  采购已交货 (${totalDelivered}) vs 生产交货总量 (${totalDeliveryQty})`);
  console.log(`  差异: ${Math.abs(totalDelivered - totalDeliveryQty)} ${totalDelivered === totalDeliveryQty ? '✅ 一致' : '❌ 不一致'}`);

  console.log(`\n第2层 → 第3层:`);
  console.log(`  生产已发货 (${totalShippedFromFactory}) vs 物流运单总量 (${totalShipmentQty})`);
  console.log(`  差异: ${Math.abs(totalShippedFromFactory - totalShipmentQty)} ${totalShippedFromFactory === totalShipmentQty ? '✅ 一致' : '❌ 不一致'}`);

  console.log(`\n第3层内部检查:`);
  console.log(`  物流运单总量 (${totalShipmentQty}) vs 实际已发货 (${actualShippedQty})`);
  console.log(`  待发货: ${totalShipmentQty - actualShippedQty}`);

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
