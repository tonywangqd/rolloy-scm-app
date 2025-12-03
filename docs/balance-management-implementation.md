# 双轨制余额管理系统 - 后端实现完成报告

**实施日期：** 2025-12-03
**实施者：** Backend Specialist
**状态：** P0 核心功能已完成，TypeScript编译通过

---

## 实现概述

本次实现完成了双轨制余额管理系统（Dual-Track Balance Management System）的完整后端基础设施，包括数据库架构、业务逻辑函数、TypeScript类型定义和Server Actions。

### 核心设计理念

从"覆盖逻辑"转变为"余额解决逻辑"：
- **旧逻辑：** 实际值直接覆盖计划值（导致差异丢失）
- **新逻辑：** 实际值 < 计划值 → 创建余额记录 → 用户必须解决

---

## 已完成的文件清单

### 1. 数据库迁移文件

#### `/supabase/migrations/20251203000001_balance_management_schema.sql`

**功能：** 创建数据库架构、表、索引和RLS策略

**包含内容：**
- 5个新枚举类型：
  - `balance_resolution_status`: pending | deferred | short_closed | fulfilled | cancelled
  - `balance_resolution_action`: defer | create_carryover | short_close | auto_fulfilled
  - `inventory_adjustment_type`: cycle_count | logistics_loss | shipping_damage 等
  - `fulfillment_status`: pending | partial | fulfilled | short_closed
  - `shipment_status`: draft | in_transit | arrived | finalized | cancelled

- 2个新核心表：
  - **`balance_resolutions`**: 追踪所有未完成的余额及其解决历史
    - 字段：source_type, source_id, sku, planned_qty, actual_qty, variance_qty (computed), open_balance (computed)
    - 状态机：pending → deferred → short_closed/fulfilled
    - 约束：deferred_date必须大于original_planned_date

  - **`inventory_adjustments`**: 所有手动库存调整的审计追踪
    - 字段：sku, warehouse_id, adjustment_type, qty_before, qty_change, qty_after
    - 审批工作流：requires_approval (基于价值阈值 $5000)
    - 约束：qty_after = qty_before + qty_change

- 4个现有表的扩展：
  - `purchase_order_items`: 添加 fulfilled_qty, open_balance (computed), fulfillment_status, fulfillment_percentage (computed)
  - `production_deliveries`: 添加 expected_qty, variance_qty (computed), variance_reason, has_variance (computed)
  - `shipment_items`: 添加 received_qty, variance_qty (computed), receipt_status
  - `shipments`: 添加 is_finalized, finalized_at, finalized_by, shipment_status

- 6个索引用于性能优化：
  - `idx_balance_source`: 多态关系查询
  - `idx_balance_sku`: 按SKU过滤
  - `idx_balance_status`: 按状态过滤（仅pending/deferred）
  - `idx_balance_open`: 按未结余额过滤
  - `idx_balance_deferred_date`: 顺延日期查询
  - `idx_balance_created_at`: 按创建时间排序

- RLS策略：
  - 所有认证用户可读
  - 所有认证用户可写（业务逻辑在应用层）
  - 禁止删除 `inventory_adjustments`（审计追踪保护）

---

#### `/supabase/migrations/20251203000002_balance_management_functions.sql`

**功能：** 创建存储过程和触发器

**包含的函数：**

1. **`create_balance_resolution()`**
   - 用途：创建余额记录的中心化函数
   - 逻辑：仅当 actual < planned 时创建记录
   - 返回：balance_id 或 NULL
   - 安全：SECURITY DEFINER，自动使用 auth.uid()

2. **`resolve_balance()`**
   - 用途：处理余额解决操作
   - 支持的操作：
     - `defer`: 顺延决策到未来日期
     - `short_close`: 关闭余额，不再履行（需要reason）
     - `create_carryover`: 生成新的补货建议（待实现）
   - 返回：JSONB格式 `{success, action, message, impactedSku}`
   - 验证：状态转换检查（fulfilled/short_closed不可修改）

3. **`create_inventory_adjustment()`**
   - 用途：创建库存调整记录
   - 审批逻辑：调整价值 >= $5000 需要审批
   - 自动操作：如果无需审批，立即更新 `inventory_snapshots`
   - 验证：qty_after = qty_before + qty_change
   - 返回：JSONB格式 `{success, adjustment_id, requires_approval, adjustment_value_usd, qty_after}`

4. **`finalize_shipment()`**
   - 用途：标记发运完结，创建variance调整
   - 防止重复：检查 is_finalized 状态
   - 自动调整：为所有 variance_qty != 0 的shipment_items创建 inventory_adjustment
   - 返回：JSONB格式 `{success, shipment_id, adjustments_created, finalized_at}`

5. **`get_open_balances_summary()`**
   - 用途：仪表板KPI汇总
   - 返回字段：
     - total_open_balances, total_open_qty
     - critical_count (age > 45天), high_priority_count (15-45天)
     - pending_count, deferred_count
     - avg_age_days, oldest_balance_days
   - 可选参数：p_sku (按SKU过滤)

**触发器：**

1. **`auto_close_fulfilled_balance()`**
   - 触发条件：actual_qty更新导致 open_balance = 0
   - 操作：自动设置 status = 'fulfilled', action = 'auto_fulfilled', closed_at = NOW()

2. **`refresh_projections_on_balance_change()`**
   - 触发条件：resolution_status变更为 short_closed 或 fulfilled
   - 操作：发出通知（实际刷新由应用层处理）

---

### 2. TypeScript类型定义

#### `/src/lib/types/database.ts` (已更新)

**新增类型：**

**枚举类型（顶层定义）：**
```typescript
export type FulfillmentStatus = 'pending' | 'partial' | 'fulfilled' | 'short_closed'
export type BalanceResolutionStatus = 'pending' | 'deferred' | 'short_closed' | 'fulfilled' | 'cancelled'
export type BalanceResolutionAction = 'defer' | 'create_carryover' | 'short_close' | 'auto_fulfilled'
export type BalanceSourceType = 'po_item' | 'delivery' | 'shipment_item'
export type InventoryAdjustmentType = 'cycle_count' | 'logistics_loss' | 'shipping_damage' | ...
export type ShipmentStatus = 'draft' | 'in_transit' | 'arrived' | 'finalized' | 'cancelled'
```

**数据库表类型：**
- `BalanceResolution` / `BalanceResolutionInsert` / `BalanceResolutionUpdate`
- `InventoryAdjustment` / `InventoryAdjustmentInsert` / `InventoryAdjustmentUpdate`

**扩展现有类型：**
- `PurchaseOrderItemExtended`: 添加 fulfilled_qty, open_balance, fulfillment_status, fulfillment_percentage
- `ProductionDeliveryExtended`: 添加 expected_qty, variance_qty, variance_reason, has_variance
- `ShipmentItemExtended`: 添加 received_qty, variance_qty, receipt_status
- `ShipmentExtended`: 添加 is_finalized, finalized_at, finalized_by, shipment_status

**API请求/响应类型：**
- `ResolveBalanceRequest` / `ResolveBalanceResponse`
- `CreateAdjustmentRequest` / `CreateAdjustmentResponse`
- `FinalizeShipmentResponse`

**仪表板类型：**
- `BalanceSummaryKPIs`: 总览KPI指标
- `BalanceListItem`: 余额列表项（含enriched字段：productName, ageDays, priority, parentReference）
- `BalanceFilters`: 筛选条件

---

### 3. Server Actions

#### `/src/lib/actions/balance.ts` (新文件)

**已实现的Server Actions：**

1. **`resolveBalance(request: ResolveBalanceRequest)`**
   - 认证检查
   - 输入验证（defer需要日期，short_close需要reason）
   - 调用 `resolve_balance()` RPC函数
   - 路径重验证：`/balance-management`, `/planning`, `/procurement`
   - 返回：`{success, data?: ResolveBalanceResponse, error?: string}`

2. **`createInventoryAdjustment(request: CreateAdjustmentRequest)`**
   - 认证检查
   - 必填字段验证：sku, warehouseId, reason
   - qty_change != 0 验证
   - 调用 `create_inventory_adjustment()` RPC函数
   - 路径重验证：`/inventory`, `/balance-management`
   - 返回：`{success, data?: CreateAdjustmentResponse, error?: string}`

3. **`finalizeShipment(shipmentId: string)`**
   - 认证检查
   - shipmentId验证
   - 调用 `finalize_shipment()` RPC函数
   - 路径重验证：`/logistics`, `/inventory`
   - 返回：`{success, data?: FinalizeShipmentResponse, error?: string}`

4. **`getOpenBalances(filters?: BalanceFilters)`**
   - 认证检查
   - 从 `balance_resolutions` 表查询（join products表获取product_name）
   - 客户端过滤：status, sku
   - 服务端计算：ageDays, priority, parentReference
   - 支持的过滤器：priority, minAgeDays, maxAgeDays
   - 返回：`{success, data?: BalanceListItem[], error?: string}`

5. **`getBalanceSummaryKPIs(sku?: string)`**
   - 认证检查
   - 调用 `get_open_balances_summary()` RPC函数
   - 可选参数：按SKU过滤
   - 无数据时返回零值KPI
   - 返回：`{success, data?: BalanceSummaryKPIs, error?: string}`

6. **`updateBalanceActualQty(balanceId: string, newActualQty: number)`**
   - 认证检查
   - 查询当前balance
   - 更新 actual_qty（触发器会自动检查是否auto-fulfill）
   - 路径重验证：`/balance-management`
   - 返回：`{success, autoFulfilled?: boolean, error?: string}`

7. **`getInventoryAdjustments(sku?, warehouseId?, adjustmentType?)`**
   - 认证检查
   - 支持多维度过滤：sku, warehouseId, adjustmentType
   - 限制100条记录
   - 返回：`{success, data?: InventoryAdjustment[], error?: string}`

**特点：**
- 所有Action使用 `requireAuth()` 进行认证
- 统一的错误处理格式
- try/catch捕获异常
- 自动路径重验证（`revalidatePath`）
- 类型安全的返回值

---

### 4. 查询函数

#### `/src/lib/queries/balance.ts` (新文件)

**已实现的查询函数：**

1. **`getEffectiveSupply(sku: string)`**
   - 用途：获取SKU的有效供给
   - 计算：onHand + inTransit + openBalance = totalSupply
   - 数据源：
     - onHand: `inventory_snapshots`
     - inTransit: `shipment_items` (未到达)
     - openBalance: `balance_resolutions` (pending/deferred)

2. **`getBalanceDashboard()`**
   - 用途：仪表板总览数据
   - 返回：totalPending, totalDeferred, totalByType (按source_type分组)

3. **`getBalanceById(balanceId: string)`**
   - 用途：获取单条余额记录
   - 返回：`BalanceResolution | null`

4. **`getBalancesBySource(sourceType, sourceId)`**
   - 用途：获取特定来源实体的所有余额
   - 参数：sourceType ('po_item' | 'delivery' | 'shipment_item')
   - 返回：`BalanceResolution[]`

5. **`getRecentAdjustments(sku: string, limit = 10)`**
   - 用途：获取SKU的最近调整记录
   - 排序：created_at DESC
   - 返回：`InventoryAdjustment[]`

6. **`getPendingApprovals()`**
   - 用途：获取待审批的调整记录
   - 筛选：requires_approval = true AND approved_at IS NULL
   - 排序：created_at ASC（先进先出）
   - 返回：`InventoryAdjustment[]`

7. **`getBalanceHistory(sku?, startDate?, endDate?)`**
   - 用途：获取已关闭的余额（用于报告/审计）
   - 筛选：status IN ('fulfilled', 'short_closed', 'cancelled')
   - 支持日期范围过滤
   - 返回：`BalanceResolution[]`

---

## 业务逻辑设计亮点

### 1. 状态机设计

**余额状态流转：**
```
[创建] → pending (默认)
       ↓
       ├─→ deferred (用户顺延)
       │   ↓
       │   ├─→ short_closed (用户确认不履行)
       │   └─→ fulfilled (actual_qty追上)
       │
       ├─→ short_closed (用户直接关闭)
       └─→ fulfilled (actual_qty追上，自动)
```

**不可逆状态：**
- fulfilled → 任何状态 ❌
- short_closed → 任何状态 ❌
- cancelled → 任何状态 ❌

### 2. 自动化逻辑

**触发器1：自动完结**
- 条件：actual_qty更新导致 open_balance = 0
- 操作：status = 'fulfilled', action = 'auto_fulfilled', closed_at = NOW()
- 好处：无需手动干预，减少运营负担

**触发器2：库存投影刷新**
- 条件：status变更为 short_closed 或 fulfilled
- 操作：发出通知（实际刷新由前端/缓存层处理）
- 解耦设计：数据库层不直接操作materialized view

### 3. 审批工作流

**自动审批阈值：$5000**
- 价值 < $5000：自动更新 `inventory_snapshots`
- 价值 >= $5000：设置 requires_approval = true，等待审批

**审批一致性约束：**
```sql
CHECK (
  (requires_approval = TRUE AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
  (requires_approval = FALSE)
)
```

### 4. 数据完整性保护

**约束1：日期逻辑性**
```sql
CHECK (deferred_date IS NULL OR deferred_date > original_planned_date)
```

**约束2：关闭一致性**
```sql
CHECK (
  (status IN ('short_closed', 'cancelled') AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NOT NULL) OR
  (status = 'fulfilled' AND closed_at IS NOT NULL) OR
  (status IN ('pending', 'deferred') AND closed_at IS NULL)
)
```

**约束3：ISO Week格式**
```sql
CHECK (deferred_to_week IS NULL OR deferred_to_week ~ '^\d{4}-W\d{2}$')
```

**约束4：数量计算**
```sql
CHECK (qty_after = qty_before + qty_change)
```

---

## 性能优化策略

### 1. 索引设计

**热点查询索引：**
- `idx_balance_status (resolution_status) WHERE resolution_status IN ('pending', 'deferred')`
  - 用途：仪表板主查询（仅查询未结余额）
  - 类型：Partial Index（部分索引）

- `idx_balance_open (open_balance) WHERE open_balance > 0`
  - 用途：库存投影计算（仅包含未结余额的行）

- `idx_balance_source (source_type, source_id)`
  - 用途：多态关系查询（根据父实体查询余额）

**按时间范围查询：**
- `idx_balance_created_at (created_at DESC)`
- `idx_inv_adj_date (adjustment_date DESC)`

### 2. 计算字段存储

**使用 GENERATED ALWAYS AS ... STORED：**
- `balance_resolutions.variance_qty = planned_qty - actual_qty`
- `balance_resolutions.open_balance = GREATEST(0, variance_qty)`
- `purchase_order_items.open_balance = GREATEST(0, ordered_qty - fulfilled_qty)`
- `purchase_order_items.fulfillment_percentage = (fulfilled_qty / ordered_qty * 100)`
- `shipment_items.variance_qty = shipped_qty - received_qty`

**好处：**
- 查询时无需计算，直接读取
- 索引可直接作用于计算字段
- 保证数据一致性（不会出现计算错误）

### 3. 函数安全性

**使用 SECURITY DEFINER：**
- 所有RPC函数使用 `SECURITY DEFINER`
- 函数内自动使用 `auth.uid()` 获取当前用户
- 绕过RLS策略，避免性能损耗

---

## 安全设计

### 1. 认证检查

**Server Actions层：**
- 每个Action第一行：`requireAuth()`
- 未认证返回：`{success: false, error: authResult.error}`

### 2. RLS策略

**简化策略（业务逻辑在应用层）：**
- SELECT: 所有认证用户可读
- INSERT: 所有认证用户可写
- UPDATE: 所有认证用户可写
- DELETE:
  - `balance_resolutions`: 允许（软删除优先）
  - `inventory_adjustments`: **硬禁止**（审计追踪保护）

### 3. 输入验证

**双重验证：**
1. **TypeScript类型检查**（编译时）
2. **数据库约束**（运行时）

**示例：**
```typescript
// TypeScript层
if (!request.reason || request.reason.trim() === '') {
  return { success: false, error: 'Reason is required' }
}

// 数据库层
IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
  RAISE EXCEPTION 'Reason is required for short_close action';
END IF;
```

### 4. 审计追踪

**完整记录：**
- `balance_resolutions`: created_by, created_at, updated_at, closed_by, closed_at, close_reason
- `inventory_adjustments`: adjusted_by, approved_by, approved_at, created_at

**不可删除：**
- `inventory_adjustments` RLS策略禁止DELETE
- 保证审计追踪的完整性

---

## 编译验证结果

**命令：** `npm run build`

**结果：**
```
✓ Compiled successfully in 4.5s
✓ Running TypeScript ... (无错误)
✓ Generating static pages (16/16) in 561.0ms
✓ Finalizing page optimization ...
```

**构建输出：**
- 16个静态页面成功生成
- 无TypeScript类型错误
- 无ESLint警告

---

## 下一步工作（前端集成）

### P0 - 必须实现（前端）

1. **余额解决对话框组件** (`BalanceResolutionDialog.tsx`)
   - 触发时机：PO创建时 actual < planned
   - 用户选项：
     - ○ Defer Decision (顺延，设置deferred_date)
     - ○ Create Carryover (生成新建议)
     - ○ Cancel Remaining (short_close，需要reason)
   - 调用：`resolveBalance()` Server Action

2. **余额管理仪表板页面** (`/app/balance-management/page.tsx`)
   - KPI卡片：调用 `getBalanceSummaryKPIs()`
   - 余额列表：调用 `getOpenBalances(filters)`
   - 过滤器：status, sku, priority, ageDays
   - 行操作：Resolve按钮 → 打开对话框

3. **采购模块集成**
   - 修改 `createPurchaseOrder` 逻辑：
     - 如果 ordered_qty < suggested_order_qty，调用 `create_balance_resolution()`
     - 返回 balance_id，前端显示对话框
   - PO详情页：显示 fulfillment_percentage 进度条

### P1 - 应该实现（增强功能）

4. **库存投影增强** (`/app/planning/page.tsx`)
   - 表格列增加：Pending Balance（调用 `getEffectiveSupply()`）
   - 悬浮提示：显示balance详情
   - 链接：点击跳转到余额详情

5. **物流模块集成** (`/app/logistics/[id]/page.tsx`)
   - 显示 shipped_qty vs received_qty 对比
   - Finalize按钮：调用 `finalizeShipment()`
   - 防止重复：is_finalized = true时禁用编辑

### P2 - 可以实现（优化功能）

6. **库存调整管理** (`/app/inventory/adjustments/page.tsx`)
   - 调用 `getInventoryAdjustments()`
   - 审批流程：调用 `approveAdjustment()` (待实现Server Action)

---

## 测试建议

### 单元测试（建议）

1. **数据库函数测试**
   - `create_balance_resolution()`: 正向variance vs 负向variance
   - `resolve_balance()`: defer/short_close操作
   - `auto_close_fulfilled_balance()`: 触发器逻辑

2. **Server Actions测试**
   - 认证失败场景
   - 输入验证失败场景
   - RPC调用失败场景

### 集成测试

1. **端到端流程**
   - 创建PO（ordered < suggested）→ 自动创建balance → 用户defer → 后续delivery更新actual_qty → 自动fulfill

2. **边界条件**
   - actual_qty > planned_qty（无需创建balance）
   - 并发更新同一balance（乐观锁）

### 手动测试清单

- [ ] 创建PO时触发variance检测
- [ ] Defer balance到未来日期
- [ ] Short close balance（需提供reason）
- [ ] 部分delivery更新actual_qty
- [ ] 完整delivery触发auto-fulfill
- [ ] 创建库存调整（< $5000，自动审批）
- [ ] 创建库存调整（>= $5000，需审批）
- [ ] Finalize shipment创建variance调整
- [ ] 查询open balances（各种过滤器）
- [ ] 查询balance summary KPIs

---

## 关键文件路径总结

### 数据库迁移
```
/supabase/migrations/20251203000001_balance_management_schema.sql
/supabase/migrations/20251203000002_balance_management_functions.sql
```

### TypeScript代码
```
/src/lib/types/database.ts (已更新)
/src/lib/actions/balance.ts (新文件)
/src/lib/queries/balance.ts (新文件)
```

### 文档
```
/BALANCE_MANAGEMENT_IMPLEMENTATION.md (本文档)
/specs/balance-management/requirements.md (参考)
/specs/balance-management/design.md (参考)
```

---

## 签署

**后端实现者：** Backend Specialist
**日期：** 2025-12-03
**状态：** ✅ P0核心功能已完成，可以开始前端集成

**验证：**
- [x] 数据库迁移文件已创建
- [x] TypeScript类型定义已更新
- [x] Server Actions已实现
- [x] 查询函数已实现
- [x] TypeScript编译通过
- [x] 索引和约束已添加
- [x] RLS策略已配置
- [x] 触发器已创建

**下一步：**
- 前端开发团队可以开始实现UI组件
- 运行数据库迁移：`supabase db push` (在Supabase项目中)
- 如需调整，请参考 `design.md` 文档

---

**End of Report**
