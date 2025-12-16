# 发货剩余追踪设计方案

**Version:** 1.0
**Date:** 2025-12-16
**Author:** System Architect

---

## 1. 问题分析

### 1.1 用户反馈的问题

**场景描述：**
- W50 出厂 5 台（`production_deliveries`）
- W51 实际发货 3 台（`shipments`）
- **问题：** 剩余的 2 台在算法验证（`reverse-schedule-audit`）中没有被追踪

**根因分析：**
当前发货流程缺少"剩余预计发货"的自动生成机制：
1. **出厂逻辑（Deliveries）有追踪：** 通过 `createDeliveryWithPlan()` 实现
   - 记录实际出厂时，用户可指定剩余量的预计出厂计划（`remaining_plan`）
   - 系统自动创建 `planned_delivery_date` 记录
2. **发货逻辑（Shipments）缺少追踪：** 当前 `createShipmentWithAllocations()` 没有类似机制
   - 只记录实际发货，不生成剩余预计
   - 导致算法验证无法追踪"已出厂但未发货"的数量

---

## 2. 数据结构分析

### 2.1 当前表结构

#### `production_deliveries` (生产交付记录)
```sql
CREATE TABLE production_deliveries (
  id UUID PRIMARY KEY,
  delivery_number TEXT UNIQUE NOT NULL,
  po_item_id UUID NOT NULL,
  sku TEXT NOT NULL,
  delivered_qty INTEGER NOT NULL,                    -- 实际出厂数量
  actual_delivery_date DATE,                         -- 实际出厂日期
  planned_delivery_date DATE,                        -- 预计出厂日期
  shipped_qty INTEGER DEFAULT 0,                     -- 已发货数量（自动计算）
  shipment_status shipment_status_enum DEFAULT 'unshipped', -- 'unshipped' | 'partial' | 'fully_shipped'
  ...
);
```

**关键字段：**
- `actual_delivery_date` 非空 = 实际出厂记录
- `planned_delivery_date` 非空 + `actual_delivery_date` 为空 = 预计出厂记录
- `shipped_qty` = 该出厂记录已分配给 shipments 的总数量（通过 `delivery_shipment_allocations` 计算）

#### `delivery_shipment_allocations` (N:N 关系表)
```sql
CREATE TABLE delivery_shipment_allocations (
  id UUID PRIMARY KEY,
  delivery_id UUID NOT NULL,    -- 出厂记录ID
  shipment_id UUID NOT NULL,    -- 发运单ID
  shipped_qty INTEGER NOT NULL, -- 本次分配数量
  ...
);
```

**核心逻辑：**
- 一个 delivery 可以分配给多个 shipments（部分发货）
- 一个 shipment 可以包含多个 deliveries（合并发货）

#### `shipments` (发运单)
```sql
CREATE TABLE shipments (
  id UUID PRIMARY KEY,
  tracking_number TEXT UNIQUE NOT NULL,
  destination_warehouse_id UUID NOT NULL,
  actual_departure_date DATE,   -- 实际发货日期
  planned_departure_date DATE,  -- 预计发货日期
  actual_arrival_date DATE,     -- 实际到仓日期
  planned_arrival_date DATE,    -- 预计到仓日期
  ...
);
```

#### `shipment_items` (发运明细)
```sql
CREATE TABLE shipment_items (
  id UUID PRIMARY KEY,
  shipment_id UUID NOT NULL,
  sku TEXT NOT NULL,
  shipped_qty INTEGER NOT NULL, -- 本次发运数量（自动聚合）
  ...
);
```

**自动聚合：** 由 `create_shipment_with_delivery_allocations()` RPC 函数从 allocations 聚合

---

### 2.2 对比：出厂 vs 发货的剩余追踪

| 维度 | 出厂 (Deliveries) | 发货 (Shipments) |
|------|-------------------|------------------|
| **实际记录** | `actual_delivery_date` 非空 | `actual_departure_date` 非空 |
| **预计记录** | `planned_delivery_date` 非空 | `planned_departure_date` 非空 |
| **剩余追踪** | ✅ 有：通过 `createDeliveryWithPlan()` 自动生成 | ❌ 无：没有类似机制 |
| **追踪字段** | `shipped_qty` (已发货)<br>`shipment_status` (状态) | N/A（没有"已到仓数量"字段） |
| **算法验证** | `planned_factory_ship` 可读取预计出厂 | `planned_ship` 缺少预计发货数据 |

---

## 3. 设计方案

### 3.1 核心策略

**借鉴出厂逻辑，为发货流程增加剩余追踪：**

1. **数据库层面：** 无需新增表或字段（当前结构已足够）
2. **Server Action 层面：** 扩展 `createShipmentWithAllocations()` 增加剩余处理
3. **算法验证层面：** 修改查询逻辑，读取剩余预计发货

---

### 3.2 方案详情

#### 方案 A：自动生成剩余预计发货 (推荐)

**实现思路：**
1. 用户创建实际发运单时，系统自动计算剩余未发货量
2. 为剩余量创建"预计发运单"记录：
   - `actual_departure_date = NULL`（未实际发货）
   - `planned_departure_date = 计算值`（预计下周发货）
   - `tracking_number = 原单号-REMAINING`（标记为剩余）

**优点：**
- ✅ 逻辑简单，与出厂逻辑一致
- ✅ 算法验证无需修改查询逻辑（自动读取预计发货记录）
- ✅ 用户无需额外操作

**缺点：**
- ❌ 会产生"虚拟发运单"，可能混淆用户
- ❌ 需要定期清理过期的预计发运单

---

#### 方案 B：基于 Delivery 状态推算 (简洁方案)

**实现思路：**
1. 不创建预计发运单，直接从 `production_deliveries` 推算
2. 算法验证查询逻辑：
   ```typescript
   // 预计发货 = 已出厂但未发货的数量
   const remainingToShip = delivery.delivered_qty - delivery.shipped_qty

   // 分配到最近的预计发货周
   if (remainingToShip > 0 && delivery.actual_delivery_date) {
     const shipWeek = addWeeksToISOWeek(deliveryWeek, leadTimes.loading_weeks)
     plannedShipByWeek.set(shipWeek, remainingToShip)
   }
   ```

**优点：**
- ✅ 不产生额外数据，数据库简洁
- ✅ 实时计算，无需清理
- ✅ 逻辑直观（剩余 = 已出厂 - 已发货）

**缺点：**
- ❌ 无法精确指定剩余的预计发货周次
- ❌ 算法验证逻辑复杂度略增

---

#### 方案 C：用户手动指定剩余计划 (最灵活)

**实现思路：**
1. 用户创建实际发运单时，可选填"剩余发货计划"：
   ```typescript
   interface RemainingShipmentPlan {
     week_iso: string      // "2025-W51"
     planned_qty: number   // 2
   }
   ```
2. 系统自动创建预计发运单（类似 `createDeliveryWithPlan`）

**优点：**
- ✅ 用户可精确控制剩余计划
- ✅ 与出厂逻辑完全一致

**缺点：**
- ❌ 用户操作复杂度增加
- ❌ 如果用户不填，仍然无法追踪

---

### 3.3 推荐方案：方案 B + 方案 C 混合

**设计思路：**
1. **默认行为（方案 B）：** 系统自动从 `production_deliveries` 推算剩余预计发货
2. **可选行为（方案 C）：** 用户可手动指定剩余发货计划（高级功能）

**实现步骤：**

#### 步骤 1：扩展 `createShipmentWithAllocations()` Server Action

```typescript
// src/lib/actions/logistics.ts

interface RemainingShipmentPlan {
  delivery_id: string
  week_iso: string
  planned_qty: number
}

export async function createShipmentWithAllocations(
  shipmentData: ShipmentData,
  allocations: ShipmentAllocationInput[],
  remainingPlans?: RemainingShipmentPlan[]  // 新增：可选的剩余计划
): Promise<{ success: boolean; error?: string; data?: { id: string } }> {
  // ... 现有逻辑创建 shipment + allocations ...

  // 新增：处理剩余计划
  if (remainingPlans && remainingPlans.length > 0) {
    for (const plan of remainingPlans) {
      // 创建预计发运单
      const plannedShipmentNumber = `${shipmentData.tracking_number}-REM-${plan.week_iso}`
      const plannedDepartureDate = isoWeekToDate(plan.week_iso)

      await supabase.from('shipments').insert({
        tracking_number: plannedShipmentNumber,
        destination_warehouse_id: shipmentData.destination_warehouse_id,
        planned_departure_date: plannedDepartureDate,
        actual_departure_date: null, // 预计记录
        remarks: `自动创建：来自 ${shipmentData.tracking_number} 的剩余计划`,
        // ... 其他字段 ...
      })

      // 创建 allocation 关联
      await supabase.from('delivery_shipment_allocations').insert({
        delivery_id: plan.delivery_id,
        shipment_id: plannedShipmentId,
        shipped_qty: plan.planned_qty,
        remarks: '剩余预计发货',
      })
    }
  }

  return { success: true, data: { id: result.shipment_id } }
}
```

#### 步骤 2：修改算法验证查询逻辑

```typescript
// src/lib/queries/reverse-schedule-audit.ts

// 7.2 预计发货（正推）：追踪部分履约
const plannedShipByWeek = new Map<string, number>()

// 优先级1：从预计发运单读取（用户手动指定）
const { data: plannedShipments } = await supabase
  .from('shipments')
  .select(`
    planned_departure_date,
    shipment_items!inner(sku, shipped_qty)
  `)
  .eq('shipment_items.sku', sku)
  .is('actual_departure_date', null) // 未实际发货
  .not('planned_departure_date', 'is', null) // 有预计日期

;(plannedShipments || []).forEach((s: any) => {
  const week = getWeekFromDate(new Date(s.planned_departure_date))
  const items = Array.isArray(s.shipment_items) ? s.shipment_items : [s.shipment_items]
  items.forEach((item: any) => {
    if (item?.sku === sku) {
      const current = plannedShipByWeek.get(week) || 0
      plannedShipByWeek.set(week, current + item.shipped_qty)
    }
  })
})

// 优先级2：从 production_deliveries 推算剩余
// 计算总已出厂但未完全发货的 deliveries
const { data: partialDeliveries } = await supabase
  .from('production_deliveries')
  .select('id, delivered_qty, shipped_qty, actual_delivery_date')
  .eq('sku', sku)
  .not('actual_delivery_date', 'is', null)
  .neq('shipment_status', 'fully_shipped') // 排除已完全发货

;(partialDeliveries || []).forEach((d: any) => {
  const remainingQty = d.delivered_qty - (d.shipped_qty || 0)
  if (remainingQty > 0) {
    // 推算预计发货周 = 出厂周 + 装柜周期
    const deliveryWeek = getWeekFromDate(new Date(d.actual_delivery_date))
    const shipWeek = addWeeksToISOWeek(deliveryWeek, leadTimes.loading_weeks)
    if (shipWeek && !plannedShipByWeek.has(shipWeek)) {
      // 只在没有手动指定的情况下使用推算值
      const current = plannedShipByWeek.get(shipWeek) || 0
      plannedShipByWeek.set(shipWeek, current + remainingQty)
    }
  }
})

// 优先级3：从实际出厂正推（原有逻辑保留）
// ... 现有代码 ...
```

#### 步骤 3：前端 UI 增强（可选）

在 `/logistics/new/page.tsx` 的步骤 2（确认数量）后增加"剩余计划"步骤：

```typescript
// 步骤 2.5：为部分发货的 delivery 指定剩余计划
{selectedArray.some(d => d.userShippedQty < d.unshipped_qty) && (
  <Card>
    <CardHeader>
      <CardTitle>剩余发货计划（可选）</CardTitle>
    </CardHeader>
    <CardContent>
      {selectedArray
        .filter(d => d.userShippedQty < d.unshipped_qty)
        .map(delivery => {
          const remainingQty = delivery.unshipped_qty - delivery.userShippedQty
          return (
            <div key={delivery.delivery_id}>
              <p>SKU {delivery.sku} 剩余 {remainingQty} 台</p>
              <WeekSelector
                label="预计发货周次"
                onChange={(week) => handleRemainingPlanChange(delivery.delivery_id, week, remainingQty)}
              />
            </div>
          )
        })}
    </CardContent>
  </Card>
)}
```

---

## 4. 实施计划

### 4.1 Phase 1：最小可行方案（推荐立即实施）

**目标：** 解决当前算法验证无法追踪剩余的问题

**实施内容：**
1. ✅ 修改 `reverse-schedule-audit.ts` 查询逻辑
   - 增加从 `production_deliveries` 推算剩余发货的逻辑
   - 优先读取预计发运单（为 Phase 2 预留）

**工作量：** 2 小时
**风险：** 低（只读查询，不影响现有数据）

---

### 4.2 Phase 2：增加用户手动指定剩余计划（可选）

**目标：** 提升剩余追踪的精确度

**实施内容：**
1. 扩展 `createShipmentWithAllocations()` Server Action
2. 前端 UI 增加"剩余计划"步骤（可折叠）
3. 创建预计发运单记录

**工作量：** 8 小时
**风险：** 中（需要测试预计发运单的生命周期管理）

---

### 4.3 Phase 3：数据清理与监控（长期优化）

**目标：** 防止过期预计发运单堆积

**实施内容：**
1. 定时任务：清理超期未发货的预计发运单
2. Dashboard 监控：显示"剩余待发货"统计
3. 报警机制：超期未发货的交货记录

**工作量：** 8 小时
**风险：** 低（运维级优化）

---

## 5. 验证测试

### 5.1 测试场景

**场景 1：完整发货**
1. W50 出厂 5 台
2. W51 发货 5 台（100%）
3. 验证：算法验证中 W51 预计发货应显示 0（已完全发货）

**场景 2：部分发货（核心场景）**
1. W50 出厂 5 台
2. W51 发货 3 台（60%）
3. 验证：
   - W51 预计发货应显示 3 台（实际）
   - W52 预计发货应显示 2 台（剩余推算）
   - delivery 的 `shipment_status` = 'partial'

**场景 3：多次部分发货**
1. W50 出厂 5 台
2. W51 发货 2 台
3. W52 发货 2 台
4. 验证：
   - W51 预计 2，实际 2
   - W52 预计 3（剩余），实际 2
   - W53 预计 1（剩余）

---

## 6. 风险与注意事项

### 6.1 数据一致性

**风险：** 预计发运单可能与实际不符（用户临时调整发货计划）

**缓解措施：**
1. 预计发运单的 `remarks` 字段标注"自动生成，仅供参考"
2. 算法验证显示"预计"时使用不同颜色（灰色/虚线）
3. 定期清理过期预计发运单

---

### 6.2 用户体验

**风险：** 用户可能困惑"为什么有预计发运单"

**缓解措施：**
1. UI 中明确标注"预计"与"实际"
2. 提供"删除预计发运单"功能
3. 文档说明剩余追踪逻辑

---

## 7. 总结

### 7.1 核心改动

1. **算法验证查询逻辑（必须）：** 增加从 `production_deliveries` 推算剩余发货
2. **Server Action（可选）：** 支持用户手动指定剩余计划
3. **前端 UI（可选）：** 增加剩余计划输入界面

### 7.2 对比出厂逻辑

| 特性 | 出厂 (Deliveries) | 发货 (Shipments) |
|------|-------------------|------------------|
| **实际记录** | `actual_delivery_date` | `actual_departure_date` |
| **预计记录** | `planned_delivery_date` | `planned_departure_date` |
| **剩余追踪** | ✅ `createDeliveryWithPlan()` | ✅ 方案 B + 方案 C |
| **算法验证** | ✅ `planned_factory_ship` | ✅ `planned_ship`（修复后） |

---

### 7.3 建议

**立即实施：** Phase 1（修改算法验证查询逻辑）
**评估后实施：** Phase 2（用户手动指定剩余计划）
**长期优化：** Phase 3（数据清理与监控）

---

**文档结束**
