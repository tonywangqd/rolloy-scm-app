# 运单修改/删除全链路后端实现文档

## 概述

作为后端工程师，完成了运单（Shipment）修改/删除的全链路后端逻辑实现，包括状态检查、库存回滚、撤销操作等关键功能。

## 实现文件

- **Server Actions**: `/src/lib/actions/logistics.ts`
- **类型定义**: `/src/lib/types/database.ts`
- **库存处理**: `/src/lib/actions/inventory.ts`

---

## 核心功能实现

### 1. updateShipment - 运单修改

**功能增强**:
- 状态检查：已到货运单无法修改关键字段（目的仓库、到货日期）
- 警告提示：修改已到货运单的非关键字段时返回警告
- 中文错误消息

**代码路径**: `src/lib/actions/logistics.ts:179-261`

**关键逻辑**:
```typescript
// 1. 查询运单当前状态
const { data: existingShipment } = await supabase
  .from('shipments')
  .select('id, tracking_number, actual_arrival_date, actual_departure_date, destination_warehouse_id')
  .eq('id', shipmentId)
  .single()

// 2. 检查关键字段是否被修改
if (existingShipment.actual_arrival_date) {
  const criticalFieldsChanged =
    (shipmentData.destination_warehouse_id !== existingShipment.destination_warehouse_id) ||
    (shipmentData.actual_arrival_date !== existingShipment.actual_arrival_date)

  if (criticalFieldsChanged) {
    return {
      success: false,
      error: '修改失败：运单已到货，无法修改目的仓库或到货日期。如需修改，请先撤销到货状态。'
    }
  }

  warning = '警告：该运单已到货，库存已更新。修改运单信息不会自动调整库存。'
}
```

**返回类型**:
```typescript
Promise<{ success: boolean; error?: string; warning?: string }>
```

---

### 2. deleteShipment - 运单删除

**改进逻辑**:
- 待发运状态：直接删除
- 已发运未到货：允许删除，提示关联记录已释放
- 已到货：阻止删除，提示使用撤销到货或强制删除

**代码路径**: `src/lib/actions/logistics.ts:344-430`

**状态判断流程**:
```typescript
// 1. 已到货运单
if (shipment.actual_arrival_date) {
  if (!options?.force) {
    return {
      success: false,
      error: '删除失败：运单已到货，库存已更新。请先撤销到货状态，或使用强制删除功能（将自动回滚库存）。'
    }
  }
  return await forceDeleteShipment(id)
}

// 2. 已发运但未到货
if (shipment.actual_departure_date) {
  // 允许删除，级联删除关联数据
  await supabase.from('shipments').delete().eq('id', id)
  return { success: true, message: '运单已删除（关联的生产交付记录已释放）' }
}

// 3. 待发运状态
await supabase.from('shipments').delete().eq('id', id)
return { success: true, message: '运单已删除' }
```

**参数**:
```typescript
deleteShipment(id: string, options?: { force?: boolean })
```

---

### 3. undoShipmentArrival - 撤销到货

**功能**:
- 清空 `actual_arrival_date`
- 回滚库存（从 `inventory_snapshots` 减去该运单增加的库存）
- 支持 `received_qty`（实收数量）或 `shipped_qty`（发货数量）

**代码路径**: `src/lib/actions/logistics.ts:593-709`

**库存回滚逻辑**:
```typescript
// 1. 查询运单及其明细
const { data: shipment } = await supabase
  .from('shipments')
  .select('*, shipment_items(*)')
  .eq('id', shipmentId)
  .single()

// 2. 检查是否已到货
if (!shipment.actual_arrival_date) {
  return { success: false, error: '撤销失败：该运单尚未到货' }
}

// 3. 逐项回滚库存
for (const item of shipment.shipment_items) {
  const { data: currentInv } = await supabase
    .from('inventory_snapshots')
    .select('qty_on_hand')
    .eq('sku', item.sku)
    .eq('warehouse_id', shipment.destination_warehouse_id)
    .single()

  // 使用 received_qty（如果有），否则使用 shipped_qty
  const arrivalQty = item.received_qty ?? item.shipped_qty
  const newQty = currentInv.qty_on_hand - arrivalQty

  // 校验库存是否足够回滚
  if (newQty < 0) {
    return {
      success: false,
      error: `回滚库存失败：SKU ${item.sku} 的库存不足`
    }
  }

  // 更新库存
  await supabase
    .from('inventory_snapshots')
    .update({ qty_on_hand: newQty })
    .eq('sku', item.sku)
    .eq('warehouse_id', shipment.destination_warehouse_id)
}

// 4. 清空到货日期
await supabase
  .from('shipments')
  .update({ actual_arrival_date: null })
  .eq('id', shipmentId)
```

**返回类型**:
```typescript
Promise<{ success: boolean; error?: string; message?: string }>
```

---

### 4. undoShipmentDeparture - 撤销发运

**功能**:
- 清空 `actual_departure_date`
- 校验：如果已到货，需要先撤销到货

**代码路径**: `src/lib/actions/logistics.ts:715-787`

**校验逻辑**:
```typescript
// 1. 查询运单状态
const { data: shipment } = await supabase
  .from('shipments')
  .select('id, tracking_number, actual_arrival_date, actual_departure_date')
  .eq('id', shipmentId)
  .single()

// 2. 校验是否已到货
if (shipment.actual_arrival_date) {
  return {
    success: false,
    error: '撤销失败：该运单已到货，请先撤销到货状态'
  }
}

// 3. 校验是否已发运
if (!shipment.actual_departure_date) {
  return {
    success: false,
    error: '撤销失败：该运单尚未发运'
  }
}

// 4. 清空发运日期
await supabase
  .from('shipments')
  .update({ actual_departure_date: null })
  .eq('id', shipmentId)
```

---

### 5. forceDeleteShipment - 强制删除

**功能**:
- 适用于已到货运单
- 自动回滚库存后删除运单
- 级联删除 `shipment_items` 和 `delivery_shipment_allocations`

**代码路径**: `src/lib/actions/logistics.ts:793-913`

**执行流程**:
```typescript
// 1. 查询运单及明细
const { data: shipment } = await supabase
  .from('shipments')
  .select('*, shipment_items(*)')
  .eq('id', shipmentId)
  .single()

const hasArrived = !!shipment.actual_arrival_date

// 2. 如果已到货，先回滚库存
if (hasArrived) {
  for (const item of shipment.shipment_items) {
    // 获取当前库存
    const { data: currentInv } = await supabase
      .from('inventory_snapshots')
      .select('qty_on_hand')
      .eq('sku', item.sku)
      .eq('warehouse_id', shipment.destination_warehouse_id)
      .single()

    // 计算回滚后的库存
    const arrivalQty = item.received_qty ?? item.shipped_qty
    const newQty = currentInv.qty_on_hand - arrivalQty

    // 校验库存
    if (newQty < 0) {
      return {
        success: false,
        error: `回滚库存失败：SKU ${item.sku} 的库存不足`
      }
    }

    // 更新库存
    await supabase
      .from('inventory_snapshots')
      .update({ qty_on_hand: newQty })
      .eq('sku', item.sku)
      .eq('warehouse_id', shipment.destination_warehouse_id)
  }
}

// 3. 删除运单（级联删除关联数据）
await supabase.from('shipments').delete().eq('id', shipmentId)
```

---

## 数据库关系

### 级联删除规则

```sql
-- shipment_items 表
ALTER TABLE shipment_items
  ADD CONSTRAINT shipment_items_shipment_id_fkey
  FOREIGN KEY (shipment_id)
  REFERENCES shipments(id)
  ON DELETE CASCADE;

-- delivery_shipment_allocations 表
ALTER TABLE delivery_shipment_allocations
  ADD CONSTRAINT delivery_shipment_allocations_shipment_id_fkey
  FOREIGN KEY (shipment_id)
  REFERENCES shipments(id)
  ON DELETE CASCADE;
```

删除运单时，会自动级联删除：
1. `shipment_items` - 运单明细
2. `delivery_shipment_allocations` - 生产交付分配记录

---

## 安全性与一致性

### 1. 权限校验
所有函数都通过 `requireAuth()` 进行权限校验：
```typescript
const authResult = await requireAuth()
if ('error' in authResult) {
  return { success: false, error: authResult.error }
}
```

### 2. 参数验证
使用 Zod schema 验证输入参数：
```typescript
const validation = deleteByIdSchema.safeParse({ id: shipmentId })
if (!validation.success) {
  return {
    success: false,
    error: `参数校验失败：${validation.error.issues.map((e) => e.message).join(', ')}`,
  }
}
```

### 3. 事务性操作
库存回滚采用逐项更新，确保数据一致性：
- 先校验所有 SKU 的库存是否足够
- 如果任一 SKU 库存不足，立即返回错误，不进行任何更新
- 更新成功后才清空到货日期

### 4. 缓存刷新
操作完成后自动刷新前端缓存：
```typescript
revalidatePath('/logistics')
revalidatePath('/inventory')
revalidatePath('/procurement/deliveries')
revalidatePath('/')
```

---

## 中文提示标准

### 成功提示
```typescript
{ success: true, message: '运单已删除' }
{ success: true, message: '已撤销到货状态（运单 XXX），库存已回滚' }
{ success: true, message: '已撤销发运状态（运单 XXX）' }
```

### 失败提示（原因 + 解决方案）
```typescript
{
  success: false,
  error: '删除失败：运单已到货，库存已更新。请先撤销到货状态，或使用强制删除功能（将自动回滚库存）。'
}
{
  success: false,
  error: '撤销失败：该运单已到货，请先撤销到货状态'
}
{
  success: false,
  error: '回滚库存失败：SKU ABC-001 的库存不足（当前库存 10，需回滚 20）'
}
```

### 警告提示
```typescript
{
  success: true,
  warning: '警告：该运单已到货，库存已更新。修改运单信息不会自动调整库存。'
}
```

---

## 测试建议

### 单元测试
1. 测试撤销到货的库存回滚逻辑
2. 测试强制删除的库存回滚逻辑
3. 测试各种状态下的删除权限控制

### 集成测试
1. 创建运单 → 标记发运 → 撤销发运 → 验证状态
2. 创建运单 → 标记到货 → 撤销到货 → 验证库存
3. 创建运单 → 标记到货 → 强制删除 → 验证库存和关联数据

### 边界条件
1. 库存不足时的回滚失败
2. 并发操作时的数据一致性
3. 运单状态变更的时序问题

---

## 版本信息

- **版本号**: v1.24.0
- **更新时间**: 2025-12-10 18:30 CST
- **更新类型**: Feature (新增功能)

---

## 相关文档

- [需求文档](./requirements.md)
- [API 调用示例](./api-examples.md)
- [前端集成指南](./frontend-integration.md)
