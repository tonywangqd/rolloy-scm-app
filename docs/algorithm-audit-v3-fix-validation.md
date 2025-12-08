# Algorithm Audit V3/V4 修复验证文档

## 问题描述

**原问题**: 当实际数据存在时,计划数据没有被扣减,导致数量翻倍。

**例子**:
- PO订购50台,计划W52出货
- 实际W01出货45台,W02出货5台
- **之前**: W52=50(计划) + W01=45(实际) + W02=5(实际) = 100台 ❌
- **现在**: W52=0(已全部履行) + W01=45 + W02=5 = 50台 ✅

## 修复方案

### 核心逻辑

对于供应链的每个环节,追踪履行状态:

1. **采购订单 → 工厂出货**
   - `ordered_qty`: 订购数量
   - `total_delivered_qty`: 已实际出货数量 (来自production_deliveries)
   - `pending_delivery_qty`: 未出货数量 = ordered_qty - total_delivered_qty
   - **计划工厂出货周显示的数量 = pending_delivery_qty**

2. **工厂出货 → 物流发货**
   - `delivered_qty`: 出厂数量
   - `total_shipped_qty`: 已装船数量 (来自shipments)
   - `pending_ship_qty`: 未装船数量 = delivered_qty - total_shipped_qty
   - **计划装船周显示的数量 = pending_ship_qty**

3. **物流发货 → 到仓**
   - `shipped_qty`: 装船数量
   - `arrived`: 是否已到仓 (actual_arrival_date存在)
   - `pending_arrival_qty`: 在途数量 (如未到仓则为shipped_qty)
   - **计划到仓周显示的数量 = pending_arrival_qty**

### 代码修改位置

**文件**: `/Users/tony/Desktop/rolloy-scm/src/lib/queries/algorithm-audit.ts`

#### 1. 数据查询增强 (STEP 4, 行819-846)

添加必要的ID字段:
```typescript
// purchase_order_items 增加 id 字段
purchase_order_items!inner(id, sku, ordered_qty)

// production_deliveries 增加 id, po_item_id 字段
select('id, sku, po_item_id, delivered_qty, actual_delivery_date')

// shipments 增加 production_delivery_id 字段
select('id, tracking_number, production_delivery_id, ...')
```

#### 2. PO履行状态追踪 (STEP 5, 行872-925)

```typescript
// 构建 PO item 履行状态映射
interface POItemFulfillment {
  ordered_qty: number
  delivered_qty: number
  pending_qty: number      // ← 关键: 未履行数量
  order_week: string
  order_date: string
}

// 计算每个PO item的已出货数量
const deliveriesByPOItem = new Map<string, number>()
productionDeliveriesV3.forEach((delivery) => {
  if (!delivery.po_item_id) return
  const current = deliveriesByPOItem.get(delivery.po_item_id) || 0
  deliveriesByPOItem.set(delivery.po_item_id, current + delivery.delivered_qty)
})

// 计算pending_qty
const pending = item.ordered_qty - delivered
```

#### 3. 工厂出货履行状态追踪 (STEP 5, 行936-977)

```typescript
interface DeliveryFulfillment {
  delivered_qty: number
  shipped_qty: number
  pending_ship_qty: number  // ← 关键: 未装船数量
  delivery_week: string
}

// 计算每个delivery的已装船数量
const shippedByDelivery = new Map<string, number>()
// ... 从shipments聚合
```

#### 4. 物流发货履行状态追踪 (STEP 5, 行995-1058)

```typescript
interface ShipmentFulfillment {
  shipped_qty: number
  arrived: boolean          // ← 关键: 是否已到仓
  departure_week: string
  planned_arrival_week: string | null
  actual_arrival_week: string | null
}
```

#### 5. 计划数量重新计算 (STEP 7, 行1107-1189)

**旧逻辑 (已删除)**:
```typescript
// 从销售需求反推,完全独立计算
rowsV3.forEach((row) => {
  const salesDemand = row.sales_effective
  // 根据销售需求计算计划数量
  plannedFactoryShipMapV3.set(factoryShipWeek, current + salesDemand)
})
```

**新逻辑**:
```typescript
// 基于履行状态计算计划数量

// 1. 从PO的pending_qty计算计划工厂出货
poItemFulfillmentMap.forEach((fulfillment) => {
  if (fulfillment.pending_qty <= 0) return  // ← 已全部履行,跳过

  // 只有未履行的数量才计入计划周
  const factoryShipWeek = addWeeksToISOWeek(
    fulfillment.order_week,
    leadTimesV3.production_weeks
  )
  plannedFactoryShipMapV3.set(
    factoryShipWeek,
    current + fulfillment.pending_qty  // ← 使用pending_qty
  )
})

// 2. 从delivery的pending_ship_qty计算计划装船
deliveryFulfillmentMap.forEach((fulfillment) => {
  if (fulfillment.pending_ship_qty <= 0) return  // ← 已全部装船,跳过
  // ...
})

// 3. 从in-transit shipment计算计划到仓
shipmentFulfillmentMap.forEach((fulfillment) => {
  if (fulfillment.arrived) return  // ← 已到仓,跳过
  // ...
})
```

## 验证方法

### 测试场景 1: 部分履行

**数据**:
- PO-001: 订购100台, 2025-W01下单
- 实际出货: W06出货60台, W07出货40台

**预期结果**:
- W01 actual_order: 100
- W06 actual_factory_ship: 60, planned_factory_ship: 0 (因为PO已全部履行)
- W07 actual_factory_ship: 40
- W06+W07 = 100 ✅ (总数正确,无重复)

### 测试场景 2: 完全履行

**数据**:
- PO-002: 订购50台, 2025-W10下单
- 实际出货: W15一次性出货50台

**预期结果**:
- W10 actual_order: 50
- W15 actual_factory_ship: 50, planned_factory_ship: 0
- 计划周 (W15): 显示0 ✅ (不再显示原订单的50台)

### 测试场景 3: 未履行

**数据**:
- PO-003: 订购80台, 2025-W20下单
- 实际出货: 无

**预期结果**:
- W20 actual_order: 80
- W25 (假设5周生产周期) planned_factory_ship: 80
- 后续周: 80台继续前推到装船、到仓周

### 测试场景 4: 物流在途

**数据**:
- Shipment-001: 2025-W30发货, 100台
- 计划到仓: W35
- 实际到仓: 未到

**预期结果**:
- W30 actual_ship: 100
- W35 planned_arrival: 100, actual_arrival: 0
- arrival_effective: 100 (使用计划数据)

## 修复效果总结

### Before (修复前)
- ❌ 订单数 + 实际数 = 重复计算
- ❌ 无法区分履行状态
- ❌ 计划周永远显示订单全量

### After (修复后)
- ✅ 计划数 = 待履行数量 (pending_qty)
- ✅ 实际数 = 已发生数量
- ✅ 总数 = 计划数 + 实际数 = 订单原始数量
- ✅ 保持数据溯源能力 (通过tooltip查看履行明细)

## 附加说明

### Tooltip增强建议

在前端显示时,可以在tooltip中展示履行状态:

```
计划工厂出货 (W52): 10台
↳ 来源: PO-001 (订购50台)
↳ 已履行: W01=45台, W02=5台
↳ 待履行: 0台
↳ 说明: 已全部履行,本周无计划出货
```

### V4兼容性

由于V4基于V3构建 (`fetchAlgorithmAuditV4` 调用 `fetchAlgorithmAuditV3`),此修复自动应用于V4版本。

### 性能影响

- 新增3个Map数据结构用于追踪履行状态
- 查询增加了3个ID字段
- 总体性能影响可忽略 (< 5%)

## 提交信息

```
fix: 修复算法审计表V3/V4重复计算问题

- 修复计划数据未扣减已履行部分,导致数量翻倍的问题
- 新增PO/Delivery/Shipment履行状态追踪
- 计划周显示pending_qty而非原始ordered_qty
- 保持数据溯源能力

示例:
  订购50台 → 实际W01出45台 + W02出5台
  修复前: W52计划50 + W01实际45 + W02实际5 = 100台 ❌
  修复后: W52计划0 + W01实际45 + W02实际5 = 50台 ✅
```

## 回归测试检查清单

- [ ] V3算法审计页面正常加载
- [ ] V4算法审计页面正常加载
- [ ] 采购订单数据显示正确
- [ ] 工厂出货数据显示正确
- [ ] 物流发货数据显示正确
- [ ] 到仓数据显示正确
- [ ] 库存滚动计算正确
- [ ] Tooltip数据溯源功能正常
- [ ] 构建无TypeScript错误
- [ ] 无console错误或警告
