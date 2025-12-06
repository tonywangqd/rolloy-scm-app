# 后端实现总结：预测-订单关联功能

## 实施时间
2025-12-06 22:15 (CST/UTC+8)

## 实施范围

### 1. Server Actions (`src/lib/actions/planning.ts`)

已实现以下 8 个 Server Actions：

#### 1.1 交货管理
- **`deleteProductionDelivery(deliveryId, deletionReason?)`**
  - 功能：安全删除采购交货记录
  - 验证：支付状态、发货状态
  - 回滚：自动回退 `delivered_qty`
  - 审计：记录到 `delivery_deletion_audit_log`
  - 调用：数据库存储过程 `delete_production_delivery()`

#### 1.2 分配管理
- **`createForecastAllocation(params)`**
  - 功能：创建单个预测-订单分配
  - 验证：SKU匹配、Channel匹配、总量不超限
  - 类型：手动分配 (`manual`)

- **`createForecastAllocations(poItemId, allocations[])`**
  - 功能：批量创建分配
  - 验证：总分配量不超过订单量
  - 用途：订单创建时一次性分配多个预测

- **`autoAllocateForecasts(poItemId)`**
  - 功能：自动分配（FIFO算法）
  - 调用：数据库存储过程 `auto_allocate_forecast_to_po_item()`
  - 返回：分配结果数组 `{forecast_id, allocated_qty, week_iso}[]`

- **`updateForecastAllocation(allocationId, allocatedQty, remarks?)`**
  - 功能：更新分配数量和备注
  - 验证：更新后总量不超限

- **`deleteForecastAllocation(allocationId)`**
  - 功能：删除分配关系

#### 1.3 差异解决
- **`resolveForecastVariance(params)`**
  - 功能：处理预测差异
  - 参数：`resolutionId`, `action`, `notes?`
  - 状态更新：`pending` → `resolved`
  - 记录：解决人、解决时间

---

### 2. Query Functions (`src/lib/queries/planning.ts`)

已实现以下 8 个查询函数：

#### 2.1 覆盖率查询
- **`fetchForecastCoverage(filters?)`**
  - 数据源：视图 `v_forecast_coverage`
  - 过滤器：`sku`, `channelCode`, `weekIso`, `status`
  - 排序：按 `week_iso` 升序

- **`fetchForecastCoverageKPIs()`**
  - 返回：总数、未覆盖、部分覆盖、完全覆盖、过度覆盖、平均覆盖率
  - 用途：仪表盘 KPI 卡片

#### 2.2 差异查询
- **`fetchPendingVariances()`**
  - 数据源：视图 `v_variance_pending_actions`
  - 排序：优先级 + 检测时间
  - 状态：仅 `pending`

- **`fetchVarianceResolution(resolutionId)`**
  - 功能：查询单条差异解决记录
  - 返回：`ForecastVarianceResolution | null`

#### 2.3 分配查询
- **`fetchAllocatableForecasts(sku, channelCode, targetWeek?)`**
  - 功能：获取可分配预测列表
  - 条件：`uncovered_qty > 0`
  - 范围：目标周 ±2 周
  - 用途：订单创建时选择预测

- **`fetchPoItemAllocations(poItemId)`**
  - 功能：查询订单项的所有分配
  - 关联：`sales_forecasts`, `products`
  - 排序：按分配时间倒序

- **`fetchForecastAllocations(forecastId)`**
  - 功能：查询预测的所有分配
  - 关联：`purchase_order_items`, `purchase_orders`
  - 用途：预测详情页

#### 2.4 审计查询
- **`fetchDeliveryDeletionLogs(options?)`**
  - 数据源：表 `delivery_deletion_audit_log`
  - 过滤器：`deliveryId`, `poItemId`, `limit`
  - 排序：按删除时间倒序

---

## 技术实现要点

### 3.1 业务规则验证

所有 Server Actions 都实现了以下验证：

1. **身份验证**
   ```typescript
   const authResult = await requireAuth()
   if ('error' in authResult) {
     return { success: false, error: authResult.error }
   }
   ```

2. **SKU/Channel 匹配验证**
   ```typescript
   if (forecast.sku !== poItem.sku) {
     return { success: false, error: 'SKU mismatch' }
   }
   ```

3. **数量限制验证**
   ```typescript
   if (totalAllocated > poItem.ordered_qty) {
     return { success: false, error: 'Exceeds ordered quantity' }
   }
   ```

### 3.2 错误处理模式

所有函数统一使用 try/catch + 标准返回格式：

```typescript
try {
  // Business logic
  return { success: true, data }
} catch (error) {
  console.error('Error:', error)
  return { success: false, error: 'Error message' }
}
```

### 3.3 缓存刷新

所有变更操作都调用 `revalidatePath()`:

```typescript
revalidatePath('/planning/forecast-coverage')
revalidatePath('/procurement')
```

### 3.4 数据库调用

- 直接查询：使用 Supabase client `.from()`, `.select()`, `.insert()`, `.update()`, `.delete()`
- 存储过程：使用 `.rpc()` 调用
  - `delete_production_delivery()`
  - `auto_allocate_forecast_to_po_item()`

---

## 文件清单

### 修改的文件
1. `src/lib/actions/planning.ts` - 新增 8 个 Server Actions
2. `src/lib/queries/planning.ts` - 新增 8 个 Query Functions
3. `src/lib/version.ts` - 版本号更新 (1.12.0 → 1.13.0)

### 新增的文件
4. `specs/forecast-order-linkage/design.md` - 技术设计文档
5. `specs/forecast-order-linkage/requirements.md` - 产品需求文档
6. `supabase/migrations/20251206000001_forecast_order_linkage.sql` - 数据库迁移

---

## 代码风格合规性

✅ 符合项目代码风格 (`CLAUDE.md` 规范)：
- 使用 `'use server'` 指令
- 返回 `{ success, data?, error? }` 格式
- 使用 `createServerSupabaseClient()`
- 使用 `requireAuth()` 验证身份
- 使用 `revalidatePath()` 刷新缓存
- 完整的 TypeScript 类型注解
- 详细的 JSDoc 注释

---

## 依赖关系

### 数据库依赖
- 表：`forecast_order_allocations`, `forecast_variance_resolutions`, `delivery_deletion_audit_log`
- 视图：`v_forecast_coverage`, `v_variance_pending_actions`
- 函数：`delete_production_delivery()`, `auto_allocate_forecast_to_po_item()`

### 类型依赖
- `src/lib/types/database.ts` 已包含所有必需类型定义：
  - `ForecastOrderAllocation`
  - `ForecastVarianceResolution`
  - `DeliveryDeletionAuditLog`
  - `ForecastCoverageView`
  - `VariancePendingActionsView`
  - `ForecastCoverageStatus`
  - `ResolutionAction`
  - `ResolutionStatus`
  - `AllocationType`

---

## 下一步工作

前端实现（由 Frontend Artisan 负责）：

1. **预测覆盖率页面** (`/planning/forecast-coverage`)
   - 组件：`CoverageKPICards`, `CoverageTable`, `CoverageStatusBadge`
   - 调用：`fetchForecastCoverage()`, `fetchForecastCoverageKPIs()`

2. **差异解决页面** (`/planning/variance-resolutions`)
   - 组件：`VarianceTable`, `ResolutionDialog`
   - 调用：`fetchPendingVariances()`, `resolveForecastVariance()`

3. **采购订单创建页面** (`/procurement/purchase-orders/create`)
   - 组件：`ForecastAllocationPanel`
   - 调用：`fetchAllocatableForecasts()`, `createForecastAllocations()`, `autoAllocateForecasts()`

4. **交货编辑页面** (`/procurement/deliveries/[id]/edit`)
   - 功能：删除按钮 + 确认对话框
   - 调用：`deleteProductionDelivery()`

---

## 测试建议

### 单元测试
- [ ] Server Actions 参数验证
- [ ] 业务规则验证 (SKU匹配、数量限制)
- [ ] 错误处理逻辑

### 集成测试
- [ ] 数据库存储过程调用
- [ ] RLS 策略验证
- [ ] 事务回滚验证

### 端到端测试
- [ ] 手动分配流程
- [ ] 自动分配流程
- [ ] 交货删除流程
- [ ] 差异解决流程

---

## 版本信息

- **版本号**: v1.13.0
- **更新时间**: 2025-12-06 22:15 CST
- **Git Commit**: feat: 预测-订单关联功能后端实现

---

**实施人**: Claude (Senior Backend Engineer)
**审核状态**: ✅ 代码已提交并推送至远程仓库
