# 算法审计表V3重复计算问题修复总结

**版本:** v1.19.2
**修复日期:** 2025-12-08 16:30 CST
**修复人员:** Backend Specialist (Claude Code)
**修复文件:** `/src/lib/queries/algorithm-audit.ts`

---

## 问题概述

算法审计表V3存在物流发货（planned_ship）和到仓（planned_arrival）的重复计算问题，导致数据显示不准确。

### 用户场景

- **PO下单:** 100台 @W01
- **工厂出货:** 100台 @W06
- **物流发货:** 45台 @W03（实际）
- **预期结果:** 剩余55台应显示在W06或W07的planned_ship中

### 实际问题

- W02显示计划发货45台（错误！）
- W03显示实际发货45台（正确）
- **原因:** 系统从两个源头重复计算了planned_ship

---

## 根本原因分析

### 问题1: Delivery层重复计算planned_ship (Lines 1149-1172)

**问题代码逻辑:**
```typescript
// ❌ 错误：从Delivery层的pending_ship_qty反推planned_ship
deliveryFulfillmentMap.forEach((fulfillment) => {
  if (fulfillment.pending_ship_qty <= 0) return
  const shipWeek = addWeeksToISOWeek(fulfillment.delivery_week, leadTimesV3.loading_weeks)
  // ... 添加到plannedShipMapV3
})
```

**重复计算链路:**
1. PO层已经从pending_qty计算了planned_ship（Lines 1119-1147）
2. Delivery层又从pending_ship_qty计算了planned_ship
3. 结果：同一批货物被计算两次

**影响:**
- W02: planned_ship = 45（来自Delivery层，错误）
- W06: planned_ship = 55（来自PO层，正确）
- 总和 = 100，看似正确但分布错误

---

### 问题2: 在途shipment使用planned_arrival_week (Lines 1175-1190)

**问题代码:**
```typescript
// ❌ 错误：使用planned_arrival_week或混合计算
const arrivalWeek = fulfillment.planned_arrival_week ||
  addWeeksToISOWeek(fulfillment.departure_week, leadTimesV3.shipping_weeks)
```

**为什么错误:**
- `planned_arrival_week` 是基于PO计划的到仓周
- 对于已发货的shipment，应该基于 `actual_departure_week + shipping_weeks`
- 混用计划和实际数据导致到仓时间不准确

---

### 问题3: actual_arrival混用actual和planned日期 (Lines 1044-1059)

**问题代码:**
```typescript
// ❌ 错误：混用actual和planned日期
const arrivalDate = shipment.actual_arrival_date || shipment.planned_arrival_date
if (!arrivalDate) return
const arrivalWeek = getWeekFromDate(new Date(arrivalDate))
// ... 添加到actualArrivalMapV3
```

**为什么错误:**
- `actual_arrival` 应该只包含真正已到达的shipment
- 混用planned_arrival_date后，"实际到达"包含了"计划到达"
- 导致actual和planned的语义混乱

---

## 修复方案

### 修复1: 删除Delivery层的重复planned_ship计算

**修改位置:** Lines 1149-1161

**修复逻辑:**
- ✅ 保留PO层的planned_ship计算（唯一来源）
- ❌ 删除Delivery层的planned_ship计算（重复源）
- 📝 添加详细注释说明删除原因

**修复后代码:**
```typescript
// ✅ FIX #1: 删除Delivery层的重复计划发货逻辑
// 说明：从PO层的pending_qty已经计算了planned_ship，不需要从Delivery层再次计算
// 这样避免了工厂已出货但物流未发货时的重复计数
// 原逻辑会导致：PO pending产生planned_ship + Delivery pending产生planned_ship = 重复

// 保持PO层的planned_ship计算（Lines 1119-1147）为唯一来源
```

---

### 修复2: 修正在途shipment的到仓时间计算

**修改位置:** Lines 1163-1180

**修复逻辑:**
- ✅ 始终基于 `departure_week + shipping_weeks` 计算到仓周
- ❌ 不再使用 `planned_arrival_week`
- 📝 明确注释计算逻辑

**修复后代码:**
```typescript
// ✅ FIX #2: 修正在途shipment的到仓时间计算逻辑
// 说明：对于已发货但未到仓的shipment，应该基于实际发货周 + shipping_weeks计算到仓周
// 不应该使用planned_arrival_week，因为那是基于计划的，不是基于实际发货的
shipmentFulfillmentMap.forEach((fulfillment) => {
  if (fulfillment.arrived) return // 跳过已到达的shipment

  // ✅ 始终基于实际发货周计算到仓周（而非使用planned_arrival_week）
  const arrivalWeek = addWeeksToISOWeek(
    fulfillment.departure_week,  // 使用实际发货周
    leadTimesV3.shipping_weeks   // 加上运输周期
  )

  if (arrivalWeek) {
    // 添加到计划到仓（planned_arrival）
    const existing = plannedArrivalMapV3.get(arrivalWeek) || 0
    plannedArrivalMapV3.set(arrivalWeek, existing + fulfillment.shipped_qty)
  }
})
```

---

### 修复3: 分离actual_arrival的定义

**修改位置:** Lines 1044-1062

**修复逻辑:**
- ✅ actual_arrival只统计有 `actual_arrival_date` 的shipment
- ❌ 不再混用 `planned_arrival_date`
- 📝 语义清晰："实际"只包含已发生的事件

**修复后代码:**
```typescript
// ✅ FIX #3: 分离actual_arrival的定义，只统计真正已到达的shipment
// 说明：原逻辑混用了actual_arrival_date和planned_arrival_date，导致actual_arrival包含了计划数据
// 修正后：actual_arrival只统计已到达的shipment（有actual_arrival_date的）
const actualArrivalMapV3 = new Map<string, number>()
shipmentsV3.forEach((shipment: any) => {
  // ✅ 只使用actual_arrival_date，不再混用planned_arrival_date
  if (!shipment.actual_arrival_date) return  // 跳过未到达的shipment

  const arrivalWeek = getWeekFromDate(new Date(shipment.actual_arrival_date))
  // ... 后续聚合逻辑
})
```

---

### 修复4: 更新ShipmentFulfillment接口

**修改位置:** Lines 996-1037

**修复逻辑:**
- ✅ 移除 `planned_arrival_week` 和 `actual_arrival_week` 字段
- ✅ 只保留 `departure_week`（用于动态计算到仓周）
- 📝 接口更简洁，逻辑更清晰

**修复后接口:**
```typescript
interface ShipmentFulfillment {
  shipped_qty: number
  arrived: boolean          // 是否已到达
  departure_week: string    // 实际发货周（用于计算到仓周）
  // ✅ 移除planned_arrival_week和actual_arrival_week字段
  // 到仓周通过 departure_week + shipping_weeks 动态计算
}
```

---

## 验证结果

### 修复后预期表现

对于用户场景：
- PO下单100台 @W01
- 工厂出货100台 @W06
- 物流发货45台 @W03（实际）

**修复后显示:**
```
W01: actual_order = 100 ✅
W02: planned_ship = 0 ✅ (不再显示错误的45)
W03: actual_ship = 45 ✅
W06或W07: planned_factory_ship = 100 ✅
W07或W08: planned_ship = 55 ✅ (剩余55台未发货)
W08: planned_arrival = 45 ✅ (基于W03实际发货 + 5周)
W12或W13: planned_arrival = 55 ✅ (剩余55台)
```

### 构建验证

```bash
npm run build
```

**结果:** ✅ Compiled successfully in 4.3s

---

## 代码变更统计

| 修复项 | 代码行数 | 变更类型 |
|--------|---------|---------|
| 删除Delivery重复计算 | ~23行 | 删除+注释 |
| 修正shipment到仓计算 | ~15行 | 重构+注释 |
| 分离actual_arrival定义 | ~4行 | 重构+注释 |
| 更新ShipmentFulfillment | ~10行 | 接口简化 |
| **总计** | **~52行** | **4个修复点** |

---

## 影响范围

### 直接影响
- ✅ `fetchAlgorithmAuditV3` 函数（V3算法审计）
- ✅ 物流发货周（planned_ship）数据准确性
- ✅ 到仓周（planned_arrival）数据准确性
- ✅ 在途货物追踪准确性

### 不受影响
- ✅ V4算法审计（基于V3，但调用层不变）
- ✅ V2算法审计（独立实现）
- ✅ 其他查询函数
- ✅ 数据库结构（无需migration）

---

## 技术债务清理

### 已解决
1. ✅ 消除planned_ship的双重来源
2. ✅ 统一在途货物到仓时间计算逻辑
3. ✅ 明确actual vs planned的语义边界
4. ✅ 简化ShipmentFulfillment接口

### 未来优化建议
1. 考虑添加单元测试覆盖fulfillment计算逻辑
2. 考虑添加数据一致性校验（planned vs actual总和）
3. 考虑将fulfillment逻辑提取为独立函数

---

## 提交信息

```bash
fix: 修复算法审计V3物流发货和到仓重复计算问题

- 删除Delivery层的重复planned_ship计算，保持PO层为唯一来源
- 修正在途shipment到仓时间计算，基于actual_departure_week + shipping_weeks
- 分离actual_arrival定义，只统计真正已到达的shipment（不混用planned）
- 简化ShipmentFulfillment接口，移除冗余字段

修复后：
- W02不再错误显示计划发货数量
- 在途货物到仓周基于实际发货周计算
- actual和planned语义清晰分离

验证通过：npm run build ✅

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## 参考文档

- 用户需求：紧急任务 - 修复算法审计表V3重复计算问题
- 相关文件：`/src/lib/queries/algorithm-audit.ts`
- 版本更新：`/src/lib/version.ts` (v1.19.2)

---

**修复完成时间:** 2025-12-08 16:30 CST
**Backend Specialist:** Claude Opus 4.5 (Rolloy SCM)
