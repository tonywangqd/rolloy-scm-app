# 供应链智能进销存系统 V2 - 产品需求规格文档 (PRD)
# SCM Intelligent Control Tower System V2 - Product Requirements Document

**Document Version:** 2.0.0
**Author:** Product Director
**Created Date:** 2025-12-10
**Status:** Draft for System Architect Review
**Priority Classification:** P0 (Core System Upgrade)

---

## 1. Executive Summary

### 1.1 Problem Statement & Business Context

**当前系统现状 (Current System State):**

现有 Rolloy SCM 系统已实现基础的采购-库存-销售管理功能,但存在以下核心问题:

1. **决策支持不足 (Insufficient Decision Support)**
   - 系统是"记录工具" (ERP),而非"决策指挥塔" (Control Tower)
   - 缺乏基于销售需求的倒推算法 (Reverse Scheduling)
   - 无法告知"何时下单"以确保不断货

2. **单据流转缺失 (Missing Document Workflow)**
   - 现有系统: `sales_forecasts` → `purchase_orders` → `production_deliveries` → `shipments`
   - 缺失单据:
     - **FO (Forecast Order)**: 销量预计单 (销售需求源头)
     - **OF (Order Fulfillment)**: 完工申报单 (工厂生产完成)
     - **OS (Order Shipment)**: 发货单 (货代提货/装船)
     - **OA (Order Arrived)**: 到仓单 (海外仓上架)
   - 导致: 无法追溯"为什么要下这个单" (No Traceability)

3. **差异管理缺失 (Missing Variance Management)**
   - 计划 vs 实际的缺口无法量化
   - 未完成数量(剩余量)无预计时间
   - 拆单/合单/滚存逻辑未实现

4. **库存计算不准确 (Inaccurate Inventory Projection)**
   - 现有 `v_inventory_projection_12weeks` 基于简单的到货预测
   - 未考虑: 在途库存 (In-Transit)、工厂库存 (Factory Inventory)、安全库存水位 (Safety Stock)
   - 无法实现"周粒度的进销存报表" (Weekly PSI Table)

**业务价值主张 (Business Value Proposition):**

本次 V2 升级将系统从"数据记录工具"升级为"供应链决策引擎",实现:

1. **指导 (Guidance)**: 明确告知"什么时间下单、出货、发货",确保不断货
2. **追踪 (Tracking)**: 实时监控各环节进度与异常,量化库存健康度
3. **动态平衡 (Dynamic Balancing)**: 多渠道库存分配算法,最大化资金周转效率

### 1.2 Success Metrics & KPIs

| 业务指标 (Business Metric) | 当前基线 (Baseline) | 目标值 (Target) | 测量方法 (Measurement) |
|---------------------------|-------------------|----------------|----------------------|
| 断货率 (Stockout Rate) | TBD (历史平均) | < 2% | 每周库存为负的 SKU 占比 |
| 库存周转天数 (DOI) | TBD | < 60 天 | 期末库存 / 日均销量 |
| 采购决策时效 (Order Timeliness) | TBD | > 95% | 按建议时间下单的 PO 占比 |
| 预测准确率 (Forecast Accuracy) | TBD | > 85% | `MIN(Actual / Forecast, 100%)` |
| 异常单据率 (Anomaly Rate) | TBD | < 5% | 已逾期未生成的 OF/OA 占比 |

---

## 2. Domain Model & Core Concepts

### 2.1 时间模型: 倒排排程 (Reverse Scheduling)

**核心原理:**
所有时间节点计算均基于"未来销售需求"向前倒推,而非传统的"下单后推算到货"。

**基础参数 (Configurable Lead Times):**

```typescript
interface SupplyChainLeadTimes {
  production_lead_weeks: number      // 生产周期: 默认 5 周 (PO → OF)
  loading_buffer_weeks: number       // 订舱缓冲: 默认 1 周 (OF → OS)
  transit_time_weeks: number         // 物流周期: 默认 5 周 (OS → OA)
  inbound_buffer_weeks: number       // 上架缓冲: 默认 2 周 (OA → Available)
}
```

**倒推逻辑示例:**

```
目标: 2025年第50周 (W50) 需销售 100台
倒推链条:
  W50 (销售周)  ← 目标周
    ↓ -2周 (上架缓冲)
  W48 (到仓周 OA)  ← 必须到仓
    ↓ -5周 (物流周期)
  W43 (发货周 OS)  ← 必须发货
    ↓ -1周 (订舱缓冲)
  W42 (完工周 OF)  ← 必须完工
    ↓ -5周 (生产周期)
  W37 (下单周 PO)  ← 必须下单

结论: 若要在 W50 销售 100台,必须在 W37 下单
```

**关键业务规则 (MECE):**

| 规则 ID | 条件 | 预期行为 | 错误处理 |
|---------|------|----------|----------|
| **TR-001** | 修改 PO 实际下单时间 | 自动级联更新下游所有节点(OF/OS/OA)的预计时间 | 触发后台异步任务,更新关联单据 |
| **TR-002** | 修改产品的 `production_lead_weeks` | 重新计算所有未完成 PO 的下游时间节点 | 需用户确认影响的 PO 数量 |
| **TR-003** | 实际时间晚于预计时间 > 1周 | 系统自动标记"延迟预警" | 在仪表盘显示红色预警 |

### 2.2 单据流转模型 (Document Workflow)

**五单据流转链 (Five-Document Chain):**

```
[FO] 销量预计单 (Forecast Order)
  ↓ 1:N (一个 FO 可触发多个 PO)
[PO] 采购订单 (Purchase Order)
  ↓ 1:N (一个 PO 可分批完工)
[OF] 完工申报单 (Order Fulfillment)
  ↓ N:1 or N:N (多个 OF 可合并到一个 OS,或拆分到多个 OS)
[OS] 发货单 (Order Shipment)
  ↓ 1:1 or 1:N (一个 OS 可分配到多个仓库)
[OA] 到仓单 (Order Arrived)
```

**单据详细规格:**

#### A. FO - 销量预计单 (Forecast Order)

**业务定义:**
- **来源**: 系统根据销售预测自动生成,或手动导入
- **作用**: 作为供应链的源头,触发后续所有建议
- **时间粒度**: 按周 (ISO Week) 汇总

**数据结构 (与现有 `sales_forecasts` 对比):**

| 字段 | 现有系统 (`sales_forecasts`) | V2 新增/修改 | 说明 |
|------|---------------------------|------------|------|
| `id` | ✅ 存在 | - | UUID 主键 |
| `sku` | ✅ 存在 | - | 产品 SKU |
| `channel_code` | ✅ 存在 | - | 销售渠道 |
| `week_iso` | ✅ 存在 | - | ISO周格式 `YYYY-WW` |
| `forecast_qty` | ✅ 存在 | - | 预测销量 |
| `is_closed` | ✅ 存在 | ⚠️ 语义修改 | V2: 标记该 FO 是否已"结束",不再生成建议 |
| `closed_reason` | ✅ 存在 | ⚠️ 新增枚举 | 可选值: `fulfilled` / `cancelled` / `short_closed` |
| `coverage_status` | ❌ 不存在 | 🆕 新增字段 | 枚举: `uncovered` / `partial` / `fully_covered` |
| `allocated_qty` | ❌ 不存在 | 🆕 新增计算字段 | 关联 `forecast_order_allocations` 的总和 |

**业务规则:**

| 规则 ID | 条件 | 预期行为 | 影响 |
|---------|------|----------|------|
| **FO-001** | `is_closed = true` | 不再为该 FO 生成采购建议 | 采购决策引擎跳过该记录 |
| **FO-002** | `coverage_status = 'fully_covered'` | 自动标记为已满足,但不关闭 | 允许后续调整 |
| **FO-003** | 实际销量 > 预测销量 | 触发"预测偏差警报" | 记录到 `forecast_variance_resolutions` |

#### B. PO - 采购订单 (Purchase Order)

**与现有系统对比:**

| 字段 | 现有系统 (`purchase_orders`) | V2 新增/修改 | 说明 |
|------|---------------------------|------------|------|
| `planned_order_date` | ✅ 存在 | - | 计划下单日期 |
| `actual_order_date` | ✅ 存在 | - | 实际下单日期 |
| `planned_ship_date` | ✅ 存在 | ⚠️ 语义修改 | V2: 此字段改为"计划工厂出货日期"(OF 预计时间) |
| `expected_fulfillment_week` | ❌ 不存在 | 🆕 新增字段 | 倒推算法计算的"预计完工周" (ISO Week) |
| `fulfillment_status` | ❌ 不存在 | 🆕 新增枚举 | `pending` / `partial` / `fulfilled` / `short_closed` |
| `remaining_qty` | ❌ 不存在 | 🆕 新增计算字段 | `ordered_qty - delivered_qty` (关联 OF 汇总) |

**业务规则:**

| 规则 ID | 条件 | 预期行为 | 错误处理 |
|---------|------|----------|----------|
| **PO-001** | 修改 `actual_order_date` | 自动重新计算 `expected_fulfillment_week` (基于 production_lead_weeks) | 触发后台任务,更新关联单据 |
| **PO-002** | 用户标记 PO 为"结束" | 剩余数量的需求缺口直接清零 | 在库存预警模块提示未来可能缺货 |
| **PO-003** | `remaining_qty > 0` 且 当前时间 > `expected_fulfillment_week + 1周` | 系统自动标记"逾期未完工" | 在仪表盘显示异常追踪 |

#### C. OF - 完工申报单 (Order Fulfillment)

**业务定义:**
- **来源**: 工厂生产完成后,系统或工厂录入
- **作用**: 标记实际产出数量和时间
- **关键逻辑**: 支持拆单 (一个 PO 多次完工)

**数据结构 (映射到现有 `production_deliveries`):**

| 字段 | 现有系统 (`production_deliveries`) | V2 新增/修改 | 说明 |
|------|---------------------------------|------------|------|
| `id` | ✅ 存在 | - | UUID 主键 |
| `delivery_number` | ✅ 存在 | ⚠️ 重命名为 `fulfillment_number` | 格式: `OF-YYYY-MM-DD-XXX` |
| `po_item_id` | ✅ 存在 | - | 关联 PO Item |
| `delivered_qty` | ✅ 存在 | ⚠️ 重命名为 `fulfilled_qty` | 实际完工数量 |
| `actual_delivery_date` | ✅ 存在 | ⚠️ 重命名为 `fulfillment_date` | 实际完工日期 |
| `planned_delivery_date` | ✅ 存在 | ⚠️ 重命名为 `expected_fulfillment_date` | 计划完工日期 |
| `remaining_unshipped_qty` | ❌ 不存在 | 🆕 新增计算字段 | `fulfilled_qty - shipped_qty` (工厂库存) |
| `shipment_allocation_status` | ❌ 不存在 | 🆕 新增枚举 | `unshipped` / `partial` / `fully_shipped` |

**业务规则:**

| 规则 ID | 条件 | 预期行为 | 影响 |
|---------|------|----------|------|
| **OF-001** | 本周产出 35台,剩余 25台 | 生成 OF (35台),关联原 PO | 系统提示用户输入剩余 25台的"新预计完工时间" |
| **OF-002** | 用户未输入剩余部分的预计时间 | 默认顺延至 下周 | 仪表盘标记"待排期" |
| **OF-003** | OF 单中有未发货库存 | 系统自动将其预计发货时间顺延至 本OF完工周 + 1 | 待发列表实时更新 |

#### D. OS - 发货单 (Order Shipment)

**业务定义:**
- **来源**: 货代提货/装船时录入
- **作用**: 标记物流发货时间和数量
- **关键逻辑**:
  - 支持合单 (多个 OF → 一个 OS)
  - 支持分配到不同仓库/渠道 (Amazon/Shopify)

**数据结构 (映射到现有 `shipments`):**

| 字段 | 现有系统 (`shipments`) | V2 新增/修改 | 说明 |
|------|---------------------|------------|------|
| `tracking_number` | ✅ 存在 | - | 物流单号 |
| `actual_departure_date` | ✅ 存在 | ⚠️ 重命名为 `shipment_date` | 实际发货日期 |
| `planned_departure_date` | ✅ 存在 | ⚠️ 重命名为 `expected_shipment_date` | 计划发货日期 |
| `destination_warehouse_id` | ✅ 存在 | - | 目标仓库 |
| `channel_allocation` | ❌ 不存在 | 🆕 新增 JSONB 字段 | 多渠道分配详情: `{Amazon: 90, Shopify: 10}` |
| `source_fulfillments` | ❌ 不存在 | 🆕 新增关联表 | N:N 关联 `delivery_shipment_allocations` |

**业务规则:**

| 规则 ID | 条件 | 预期行为 | 影响 |
|---------|------|----------|------|
| **OS-001** | 一个 OS 包含多个 OF | 系统自动计算总发货量 = SUM(OF.qty) | 校验: 总量不能超过 OF 可用量 |
| **OS-002** | 指定发往 Amazon 90台,Shopify 10台 | 渠道调拨引擎计算建议 | 用户可手动调整 |
| **OS-003** | 若 OF 有未发货库存 | 剩余滚存,预计发货时间顺延 +1周 | 待发列表自动更新 |

#### E. OA - 到仓单 (Order Arrived)

**业务定义:**
- **来源**: 海外仓接收上架时录入
- **作用**: 标记实际到货数量和时间
- **关键逻辑**: 库存转化 (在途 → 现有库存)

**数据结构 (新增表 `order_arrivals`):**

```typescript
interface OrderArrival {
  id: string                          // UUID 主键
  arrival_number: string              // 格式: OA-YYYY-MM-DD-XXX
  shipment_id: string                 // FK → shipments.id
  warehouse_id: string                // FK → warehouses.id
  arrived_qty: number                 // 实际到货数量
  expected_arrival_date: string       // 计划到仓日期 (DATE)
  actual_arrival_date: string         // 实际到仓日期 (DATE)
  arrival_week_iso: string            // 到仓周 (YYYY-WW)
  variance_qty: number                // 差异数量 (shipped_qty - arrived_qty)
  variance_reason: string | null      // 差异原因 (丢失/损坏)
  remarks: string | null
  created_at: string
  updated_at: string
}
```

**业务规则:**

| 规则 ID | 条件 | 预期行为 | 影响 |
|---------|------|----------|------|
| **OA-001** | 输入实际到货数量与日期 | 库存从"在途"扣除,计入"现有库存" | 触发库存快照更新 |
| **OA-002** | 当前时间 > 预计到仓时间 且未生成 OA | 系统自动顺延预计到仓时间 +1周 | 标记预警 |
| **OA-003** | `arrived_qty < shipped_qty` | 记录差异,提示用户填写原因 | 生成库存调整单 |

### 2.3 库存计算核心算法 (PSI Table Logic)

**进销存报表结构 (Production-Sales-Inventory Table):**

以"周 (Week)"为维度,每个 SKU × 每个仓库 × 每周一行。

**字段定义 (MECE):**

| 列名 | 计算公式 | 数据来源 | 业务逻辑 |
|------|---------|----------|----------|
| **期初库存 (Opening Stock)** | = 上周的期末库存 | 递归计算 | 初始值来自 `inventory_snapshots` |
| **(+) 预计到仓 (Planned Arrival)** | = SUM(OS.qty) WHERE `planned_arrival_week = current_week` | 基于 OS 倒推 | 仅用于未来周 |
| **(+) 实际到仓 (Actual Arrival)** | = SUM(OA.arrived_qty) WHERE `arrival_week = current_week` | `order_arrivals` | 仅用于过去周 |
| **(-) 销售出库 (Sales Outbound)** | = COALESCE(Actual Sales, Forecast Sales) | 判定规则见下方 | - |
| **(=) 期末库存 (Closing Stock)** | = 期初 + 实际到仓/预计到仓 - 销售出库 | 计算字段 | - |
| **库存周转 (DOI - Days of Inventory)** | = 期末库存 / 未来 N 周的平均预测销量 | 计算字段 | N = 4周滑动平均 |
| **库存状态 (Stock Status)** | 基于安全库存水位判定 | 计算字段 | 'OK' / 'Risk' / 'Stockout' |

**销售出库判定逻辑 (CRITICAL):**

```typescript
function calculateSalesOutbound(currentWeek: string, sku: string): number {
  const now = getCurrentISOWeek()

  if (currentWeek < now) {
    // 过去周: 优先使用实际销量
    return getSalesActual(sku, currentWeek) ?? getSalesForecast(sku, currentWeek)
  } else if (currentWeek === now) {
    // 当前周: 若本周已过一半,使用实际;否则使用预测
    const dayOfWeek = getCurrentDayOfWeek()
    if (dayOfWeek >= 4) {  // 周四及以后
      return getSalesActual(sku, currentWeek) ?? getSalesForecast(sku, currentWeek)
    } else {
      return getSalesForecast(sku, currentWeek)
    }
  } else {
    // 未来周: 使用预测销量
    return getSalesForecast(sku, currentWeek)
  }
}
```

**库存状态判定规则:**

```typescript
type StockStatus = 'OK' | 'Risk' | 'Stockout'

function determineStockStatus(
  closingStock: number,
  safetyStockWeeks: number,
  avgWeeklySales: number
): StockStatus {
  const safetyStockThreshold = safetyStockWeeks * avgWeeklySales

  if (closingStock < 0) {
    return 'Stockout'
  } else if (closingStock < safetyStockThreshold) {
    return 'Risk'
  } else {
    return 'OK'
  }
}
```

---

## 3. User Stories & Acceptance Criteria

### Epic 1: 倒推算法与采购决策引擎 (Reverse Scheduling & Buying Engine)

#### US-1.1: As a 需求计划员 (Demand Planner), I want to 查看基于销售预测的采购建议, so that 我知道何时下单以确保不断货

**Acceptance Criteria (Gherkin):**

```gherkin
Given 系统中存在以下销售预测:
  | SKU     | Week     | Forecast Qty |
  | SKU-001 | 2025-W50 | 100          |
And SKU-001 的供应链参数为:
  | production_lead_weeks | loading_buffer_weeks | transit_time_weeks | inbound_buffer_weeks |
  | 5                     | 1                    | 5                  | 2                    |
And SKU-001 当前库存为 0
When 我打开"采购决策引擎"页面
Then 我应该看到采购建议:
  | 建议下单周 | 建议下单量 | 目标到仓周 | 风险等级 |
  | 2025-W37  | 100        | 2025-W48   | Critical |
And 点击"查看倒推链条"应显示:
  """
  W50 (销售周) ← 目标周 (100台)
    ↓ -2周 (上架缓冲)
  W48 (到仓周 OA) ← 必须到仓
    ↓ -5周 (物流周期)
  W43 (发货周 OS) ← 必须发货
    ↓ -1周 (订舱缓冲)
  W42 (完工周 OF) ← 必须完工
    ↓ -5周 (生产周期)
  W37 (下单周 PO) ← 建议下单周
  """
```

**Priority:** P0 (Must-Have)

**Technical Requirements for Engineers:**
- 实现 PostgreSQL 函数 `calculate_suggested_order_week(target_sales_week, lead_times)`
- 创建物化视图 `v_replenishment_suggestions_v2`
- 添加后台定时任务,每天凌晨 1 点刷新建议

---

#### US-1.2: As a 采购经理 (Procurement Manager), I want to 在 PO 详情页看到实际 vs 预计的缺口, so that 我可以及时调整采购计划

**Acceptance Criteria:**

```gherkin
Given 存在 PO-2025-001-A:
  | Ordered Qty | Expected Fulfillment Week | Actual Fulfillment Week | Fulfilled Qty |
  | 100         | 2025-W42                 | 2025-W43 (+1周延迟)    | 60            |
When 我查看该 PO 详情页
Then 我应该看到"履约进度"区块:
  """
  下单数量: 100 台
  已完工数量: 60 台 (60%)
  未完工数量: 40 台

  完工记录:
  - OF-001: 60台 (完工周: W43, 延迟 1周)

  待完工计划:
  - 剩余 40台 未排期 ⚠️
  [+ 设置预计完工时间]
  """
And 点击"设置预计完工时间"应弹出模态框:
  - 输入: 剩余数量 (默认 40,可修改)
  - 输入: 预计完工周 (Week Picker)
  - 输入: 备注 (可选)
  - 按钮: [取消] [确认]
```

**Priority:** P0 (Must-Have)

**UI Components Needed:**
- `<POFulfillmentProgressCard>` (新增组件)
- `<DeliveryPlanModal>` (复用现有 Modal 组件)

---

#### US-1.3: As a 系统用户 (System User), I want to 修改 PO 实际下单时间后,系统自动更新下游时间节点, so that 时间计划始终准确

**Acceptance Criteria:**

```gherkin
Given 存在 PO-2025-001-A:
  | Actual Order Date | Expected Fulfillment Week | Expected Ship Week | Expected Arrival Week |
  | 2025-09-09 (W37) | W42                       | W43                | W48                   |
When 我将 Actual Order Date 修改为 2025-09-23 (W39, 延迟 2周)
And 点击"保存"
Then 系统应自动重新计算:
  | Expected Fulfillment Week | Expected Ship Week | Expected Arrival Week |
  | W44 (+2周)               | W45 (+2周)        | W50 (+2周)           |
And 应弹出确认提示:
  """
  修改下单时间将影响以下下游节点:
  - 预计完工周: W42 → W44 (延迟 2周)
  - 预计发货周: W43 → W45 (延迟 2周)
  - 预计到仓周: W48 → W50 (延迟 2周)

  是否继续? [取消] [确认]
  """
And 点击"确认"后,相关 OF/OS/OA 的预计时间应同步更新
```

**Priority:** P1 (Important)

**Technical Requirements:**
- 实现数据库触发器或 Server Action 中的级联更新逻辑
- 使用事务 (Transaction) 确保原子性

---

### Epic 2: 单据拆分/合并/滚存逻辑 (Split/Merge/Rollover)

#### US-2.1: As a 采购经理, I want to 拆分 PO 的完工申报, so that 我可以记录分批交货

**Acceptance Criteria:**

```gherkin
Given PO-2025-001-A 下单 100台
When 工厂本周只完工 35台
And 我创建 OF-001:
  | Fulfilled Qty | Fulfillment Date |
  | 35            | 2025-10-15 (W42) |
Then 系统应提示:
  """
  该 PO 还有 65台未完工。是否为剩余数量设置预计完工时间?
  [稍后设置] [立即设置]
  """
And 若我选择"立即设置",应弹出:
  - 剩余数量: 65台 (只读)
  - 预计完工周: [Week Picker] (默认: W43)
  - 备注: [TextArea]
  - [创建待完工计划]
And 创建后,PO 详情页应显示:
  """
  履约状态: 部分完工 (35%)
  已完工: 35台 (OF-001)
  待完工: 65台 (预计 W43)
  """
```

**Priority:** P0 (Must-Have)

---

#### US-2.2: As a 物流协调员 (Logistics Coordinator), I want to 合并多个 OF 到一个 OS, so that 我可以整柜发货

**Acceptance Criteria:**

```gherkin
Given 存在以下完工记录:
  | OF Number | SKU     | Fulfilled Qty | Fulfillment Date |
  | OF-001    | SKU-001 | 30            | 2025-10-15       |
  | OF-002    | SKU-001 | 20            | 2025-10-18       |
And OF-001 和 OF-002 都有未发货库存
When 我创建新的 OS-001
And 我在"发货来源"中选择:
  - OF-001: 发货 30台
  - OF-002: 发货 20台
And 点击"创建发货单"
Then 系统应创建:
  | OS Number | Total Shipped Qty | Source Fulfillments |
  | OS-001    | 50                | OF-001 (30), OF-002 (20) |
And OF-001 的 shipment_allocation_status 应变为 'fully_shipped'
And OF-002 的 shipment_allocation_status 应变为 'fully_shipped'
```

**Priority:** P0 (Must-Have)

**Technical Requirements:**
- 扩展 `delivery_shipment_allocations` 表,支持 N:N 关联
- 实现 Server Action `createShipmentWithMultipleSources()`

---

#### US-2.3: As a 物流协调员, I want to 未发货的 OF 库存自动顺延预计发货时间, so that 待发列表始终准确

**Acceptance Criteria:**

```gherkin
Given OF-001 完工 50台 (完工周: W42)
And 本周 (W43) 只发货 40台 (OS-001)
And OF-001 剩余 10台未发货
When 系统每日定时任务运行
Then 应自动创建"工厂库存发货计划" (Factory Inventory Shipment Plan):
  | Delivery ID | Remaining Qty | Expected Ship Week | Status  |
  | OF-001      | 10            | W44 (+1周)        | Pending |
And 在"待发货列表"中应显示:
  """
  OF-001 | SKU-001 | 工厂库存: 10台 | 预计发货: W44
  [立即发货] [调整预计时间]
  """
```

**Priority:** P1 (Important)

---

### Epic 3: 库存健康度监控与风险预警 (Inventory Health & Risk Alerts)

#### US-3.1: As a 供应链分析师 (Supply Chain Analyst), I want to 在首页仪表盘看到断货预警, so that 我可以提前应对

**Acceptance Criteria:**

```gherkin
Given 系统计算出以下库存预测:
  | SKU     | Week     | Closing Stock | Safety Threshold | Stock Status |
  | SKU-001 | 2025-W48 | 50            | 100              | Risk         |
  | SKU-001 | 2025-W49 | 10            | 100              | Risk         |
  | SKU-001 | 2025-W50 | -30           | 100              | Stockout     |
When 我打开首页仪表盘
Then 应显示"断货预警"卡片:
  """
  ⚠️ 断货预警 (3个 SKU 有风险)

  紧急 (Stockout):
  - SKU-001: 预计 W50 缺货 30台
    原因: W48 到仓量不足
    建议: 紧急补单 30台 (需在 W43 下单)

  风险 (Risk):
  - SKU-002: W51 库存低于安全线
  - SKU-003: W52 库存低于安全线

  [查看详细报表]
  """
```

**Priority:** P0 (Must-Have)

---

#### US-3.2: As a 仓库经理, I want to 查看"呆滞库存预警", so that 我可以调整销售策略

**Acceptance Criteria:**

```gherkin
Given SKU-005 的库存周转天数 (DOI) 为 120天
And 系统设定的呆滞阈值为 90天
When 我打开"库存健康度"报表
Then 应看到:
  """
  呆滞预警 (Slow-Moving):

  | SKU     | 当前库存 | 周销量 | DOI (天) | 状态   |
  | SKU-005 | 600     | 5      | 120     | 呆滞 🔴 |
  | SKU-006 | 400     | 4.5    | 89      | 正常 ✅ |

  建议操作:
  - SKU-005: 考虑促销或清仓
  """
```

**Priority:** P2 (Nice-to-Have)

---

#### US-3.3: As a 系统管理员, I want to 查看"异常追踪"列表, so that 我可以发现数据问题

**Acceptance Criteria:**

```gherkin
Given 存在以下异常:
  - PO-001: 预计完工周 W42,但已过 W44 仍未生成 OF
  - OS-003: 预计到仓周 W48,但已过 W49 仍未生成 OA
When 我打开"异常追踪"页面
Then 应显示:
  """
  异常单据追踪 (Anomaly Tracking)

  已逾期未完工 (Overdue Fulfillment):
  | PO Number | Expected Week | Current Week | Days Overdue |
  | PO-001    | W42          | W44          | 14 days      |
  [手动创建 OF] [标记为已取消]

  已逾期未到仓 (Overdue Arrival):
  | OS Number | Expected Week | Current Week | Days Overdue |
  | OS-003    | W48          | W49          | 7 days       |
  [手动创建 OA] [标记为延迟]
  """
```

**Priority:** P1 (Important)

---

### Epic 4: 渠道调拨引擎 (Multi-Channel Allocation Engine)

#### US-4.1: As a 运营经理 (Operations Manager), I want to 系统自动建议渠道分配比例, so that 各渠道库存周转率均衡

**Acceptance Criteria:**

```gherkin
Given 创建 OS-001,总发货量 100台
And 目标渠道为 Amazon 和 Shopify
And 当前库存状态:
  | Channel  | Current Stock | Weekly Sales | DOI (天) |
  | Amazon   | 50            | 10           | 35       |
  | Shopify  | 40            | 2            | 140      |
When 系统计算渠道分配建议
Then 应显示:
  """
  渠道调拨建议 (Allocation Suggestion):

  目标: 使各渠道的库存可售天数尽量一致

  | Channel  | 建议分配 | 分配后库存 | 分配后 DOI |
  | Amazon   | 90台     | 140台      | 98天       |
  | Shopify  | 10台     | 50台       | 175天      |

  算法: 供需平衡 (Days of Supply Balancing)
  [接受建议] [手动调整]
  """
And 用户可手动修改分配数量
```

**Priority:** P1 (Important)

**Algorithm Specification (for Engineers):**

```typescript
function calculateChannelAllocation(
  totalQty: number,
  channels: Array<{
    channelCode: string
    currentStock: number
    weeklySales: number
  }>
): Record<string, number> {
  // 目标: 分配后各渠道的 DOI 尽量接近
  // 算法: 迭代优化 (Iterative Balancing)

  const allocations: Record<string, number> = {}
  let remaining = totalQty

  // 步骤 1: 计算各渠道当前 DOI
  const currentDOI = channels.map(ch => ({
    ...ch,
    doi: ch.currentStock / ch.weeklySales
  }))

  // 步骤 2: 优先分配给 DOI 最低的渠道
  const sorted = currentDOI.sort((a, b) => a.doi - b.doi)

  // 步骤 3: 迭代分配,每次给 DOI 最低的渠道分配 1单位,直至用完
  while (remaining > 0) {
    for (const channel of sorted) {
      if (remaining <= 0) break
      allocations[channel.channelCode] = (allocations[channel.channelCode] || 0) + 1
      remaining--
      // 重新计算该渠道的 DOI
      channel.doi = (channel.currentStock + allocations[channel.channelCode]) / channel.weeklySales
    }
    // 重新排序
    sorted.sort((a, b) => a.doi - b.doi)
  }

  return allocations
}
```

---

## 4. Data Model Specification

### 4.1 新增表 (New Tables)

#### Table: `order_arrivals` (到仓单)

```sql
CREATE TABLE order_arrivals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  arrival_number TEXT NOT NULL UNIQUE,  -- 格式: OA-YYYY-MM-DD-XXX
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),

  -- 数量
  shipped_qty INTEGER NOT NULL,         -- 发货数量 (来自 OS)
  arrived_qty INTEGER NOT NULL,         -- 实际到货数量
  variance_qty INTEGER GENERATED ALWAYS AS (shipped_qty - arrived_qty) STORED,

  -- 时间
  expected_arrival_date DATE,           -- 计划到仓日期
  actual_arrival_date DATE NOT NULL,    -- 实际到仓日期
  arrival_week_iso TEXT GENERATED ALWAYS AS (
    to_char(actual_arrival_date, 'IYYY-"W"IW')
  ) STORED,

  -- 差异处理
  variance_reason TEXT,                 -- 差异原因 (丢失/损坏/海关扣留)
  variance_resolution_status TEXT DEFAULT 'pending',  -- pending/resolved/escalated

  -- 元数据
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,                      -- FK to auth.users (future)

  -- 约束
  CONSTRAINT valid_arrived_qty CHECK (arrived_qty >= 0),
  CONSTRAINT valid_variance_resolution_status CHECK (
    variance_resolution_status IN ('pending', 'resolved', 'escalated')
  )
);

-- 索引
CREATE INDEX idx_order_arrivals_shipment ON order_arrivals(shipment_id);
CREATE INDEX idx_order_arrivals_warehouse ON order_arrivals(warehouse_id);
CREATE INDEX idx_order_arrivals_week ON order_arrivals(arrival_week_iso);
CREATE INDEX idx_order_arrivals_date ON order_arrivals(actual_arrival_date);

-- 触发器: 到仓时更新库存快照
CREATE TRIGGER trg_update_inventory_on_arrival
  AFTER INSERT ON order_arrivals
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_snapshot_on_arrival();
```

**Function: `update_inventory_snapshot_on_arrival()`**

```sql
CREATE OR REPLACE FUNCTION update_inventory_snapshot_on_arrival()
RETURNS TRIGGER AS $$
BEGIN
  -- 获取发货单中的 SKU 详情
  WITH shipment_items AS (
    SELECT
      si.sku,
      si.shipped_qty,
      (si.shipped_qty * NEW.arrived_qty / s.total_shipped_qty) AS allocated_arrived_qty
    FROM shipment_items si
    JOIN shipments s ON s.id = si.shipment_id
    WHERE si.shipment_id = NEW.shipment_id
  )
  -- 更新或插入库存快照
  INSERT INTO inventory_snapshots (sku, warehouse_id, qty_on_hand, last_counted_at)
  SELECT
    sku,
    NEW.warehouse_id,
    allocated_arrived_qty,
    NEW.actual_arrival_date
  FROM shipment_items
  ON CONFLICT (sku, warehouse_id)
  DO UPDATE SET
    qty_on_hand = inventory_snapshots.qty_on_hand + EXCLUDED.qty_on_hand,
    last_counted_at = EXCLUDED.last_counted_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

#### Table: `psi_weekly_snapshots` (进销存周报表)

```sql
CREATE TABLE psi_weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL REFERENCES products(sku),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  week_iso TEXT NOT NULL,               -- YYYY-WW
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,

  -- 期初库存
  opening_stock INTEGER NOT NULL,

  -- 到仓 (实际 vs 预计)
  planned_arrival_qty INTEGER DEFAULT 0,
  actual_arrival_qty INTEGER DEFAULT 0,
  effective_arrival_qty INTEGER GENERATED ALWAYS AS (
    COALESCE(actual_arrival_qty, planned_arrival_qty)
  ) STORED,

  -- 销售 (实际 vs 预测)
  forecast_sales_qty INTEGER DEFAULT 0,
  actual_sales_qty INTEGER,             -- NULL for future weeks
  effective_sales_qty INTEGER GENERATED ALWAYS AS (
    COALESCE(actual_sales_qty, forecast_sales_qty)
  ) STORED,

  -- 期末库存
  closing_stock INTEGER GENERATED ALWAYS AS (
    opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)
  ) STORED,

  -- 库存健康度
  safety_stock_threshold INTEGER NOT NULL,
  stock_status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN (opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)) < 0 THEN 'Stockout'
      WHEN (opening_stock + COALESCE(actual_arrival_qty, planned_arrival_qty) - COALESCE(actual_sales_qty, forecast_sales_qty)) < safety_stock_threshold THEN 'Risk'
      ELSE 'OK'
    END
  ) STORED,

  -- 元数据
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 约束
  CONSTRAINT unique_psi_week UNIQUE (sku, warehouse_id, week_iso),
  CONSTRAINT valid_week_format CHECK (week_iso ~ '^\d{4}-W\d{2}$'),
  CONSTRAINT valid_stock_status CHECK (stock_status IN ('OK', 'Risk', 'Stockout'))
);

-- 索引
CREATE INDEX idx_psi_sku_week ON psi_weekly_snapshots(sku, week_iso);
CREATE INDEX idx_psi_warehouse_week ON psi_weekly_snapshots(warehouse_id, week_iso);
CREATE INDEX idx_psi_status ON psi_weekly_snapshots(stock_status);
```

---

### 4.2 修改现有表 (Modified Tables)

#### Table: `sales_forecasts` (扩展)

```sql
-- 新增字段
ALTER TABLE sales_forecasts
  ADD COLUMN coverage_status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN is_closed = true THEN 'closed'
      WHEN allocated_qty >= forecast_qty THEN 'fully_covered'
      WHEN allocated_qty > 0 THEN 'partially_covered'
      ELSE 'uncovered'
    END
  ) STORED,
  ADD COLUMN allocated_qty INTEGER DEFAULT 0,  -- 从 forecast_order_allocations 计算
  ADD CONSTRAINT valid_coverage_status CHECK (
    coverage_status IN ('uncovered', 'partially_covered', 'fully_covered', 'closed')
  );
```

---

#### Table: `purchase_orders` (扩展)

```sql
-- 新增字段
ALTER TABLE purchase_orders
  ADD COLUMN expected_fulfillment_week TEXT,  -- 倒推算法计算的预计完工周
  ADD COLUMN fulfillment_status TEXT DEFAULT 'pending',
  ADD COLUMN remaining_qty INTEGER,           -- 从 PO items 汇总计算
  ADD CONSTRAINT valid_fulfillment_status CHECK (
    fulfillment_status IN ('pending', 'partial', 'fulfilled', 'short_closed')
  );

-- 触发器: 更新 fulfillment_status
CREATE TRIGGER trg_update_po_fulfillment_status
  AFTER INSERT OR UPDATE OR DELETE ON production_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_po_fulfillment_status();
```

---

#### Table: `production_deliveries` (字段重命名 + 扩展)

```sql
-- 重命名字段 (保持向后兼容,先新增后弃用)
ALTER TABLE production_deliveries
  ADD COLUMN fulfillment_number TEXT,         -- 新字段 (对应 delivery_number)
  ADD COLUMN fulfilled_qty INTEGER,           -- 新字段 (对应 delivered_qty)
  ADD COLUMN fulfillment_date DATE,           -- 新字段 (对应 actual_delivery_date)
  ADD COLUMN expected_fulfillment_date DATE,  -- 新字段 (对应 planned_delivery_date)
  ADD COLUMN remaining_unshipped_qty INTEGER GENERATED ALWAYS AS (
    delivered_qty - shipped_qty
  ) STORED,
  ADD COLUMN shipment_allocation_status TEXT DEFAULT 'unshipped',
  ADD CONSTRAINT valid_allocation_status CHECK (
    shipment_allocation_status IN ('unshipped', 'partial', 'fully_shipped')
  );

-- 数据迁移 (一次性脚本)
UPDATE production_deliveries SET
  fulfillment_number = delivery_number,
  fulfilled_qty = delivered_qty,
  fulfillment_date = actual_delivery_date,
  expected_fulfillment_date = planned_delivery_date;
```

---

#### Table: `shipments` (字段重命名 + 扩展)

```sql
-- 新增字段
ALTER TABLE shipments
  ADD COLUMN expected_shipment_date DATE,     -- 计划发货日期
  ADD COLUMN shipment_date DATE,              -- 实际发货日期 (对应 actual_departure_date)
  ADD COLUMN channel_allocation JSONB,        -- 多渠道分配 {Amazon: 90, Shopify: 10}
  ADD COLUMN total_shipped_qty INTEGER;       -- 从 shipment_items 汇总

-- 数据迁移
UPDATE shipments SET
  shipment_date = actual_departure_date,
  expected_shipment_date = planned_departure_date;
```

---

### 4.3 新增视图 (New Views)

#### View: `v_po_fulfillment_variance` (PO 履约差异视图)

```sql
CREATE OR REPLACE VIEW v_po_fulfillment_variance AS
SELECT
  po.id AS po_id,
  po.po_number,
  po.batch_code,
  po.actual_order_date,
  po.expected_fulfillment_week,
  poi.id AS po_item_id,
  poi.sku,
  p.product_name,
  poi.channel_code,

  -- 数量统计
  poi.ordered_qty,
  COALESCE(SUM(pd.delivered_qty), 0) AS total_fulfilled_qty,
  poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0) AS remaining_qty,

  -- 履约状态
  CASE
    WHEN poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0) = 0 THEN 'fulfilled'
    WHEN COALESCE(SUM(pd.delivered_qty), 0) > 0 THEN 'partial'
    ELSE 'pending'
  END AS variance_status,

  -- 时间差异
  CASE
    WHEN MAX(pd.fulfillment_date) IS NOT NULL THEN
      extract(days from (MAX(pd.fulfillment_date) - to_date(po.expected_fulfillment_week || '-1', 'IYYY-"W"IW-D')))
    ELSE NULL
  END AS days_delayed,

  -- 是否逾期
  CASE
    WHEN po.expected_fulfillment_week < to_char(CURRENT_DATE, 'IYYY-"W"IW')
      AND poi.ordered_qty - COALESCE(SUM(pd.delivered_qty), 0) > 0
    THEN true
    ELSE false
  END AS is_overdue

FROM purchase_orders po
JOIN purchase_order_items poi ON poi.po_id = po.id
JOIN products p ON p.sku = poi.sku
LEFT JOIN production_deliveries pd ON pd.po_item_id = poi.id
GROUP BY po.id, poi.id, p.product_name;
```

---

#### View: `v_factory_inventory_pending_shipment` (工厂库存待发货视图)

```sql
CREATE OR REPLACE VIEW v_factory_inventory_pending_shipment AS
SELECT
  pd.id AS delivery_id,
  pd.delivery_number AS fulfillment_number,
  pd.sku,
  p.product_name,
  pd.po_item_id,
  poi.po_id,
  po.po_number,
  po.batch_code,

  -- 数量
  pd.delivered_qty AS fulfilled_qty,
  COALESCE(SUM(dsa.shipped_qty), 0) AS total_shipped_qty,
  pd.delivered_qty - COALESCE(SUM(dsa.shipped_qty), 0) AS factory_inventory_qty,

  -- 时间
  pd.actual_delivery_date AS fulfillment_date,
  CURRENT_DATE - pd.actual_delivery_date::date AS days_in_factory,

  -- 状态
  pd.shipment_allocation_status,

  -- 预计发货时间 (从 factory_inventory_shipment_plans 获取)
  (
    SELECT MIN(expected_ship_week)
    FROM factory_inventory_shipment_plans fisp
    WHERE fisp.delivery_id = pd.id
      AND fisp.plan_status IN ('pending', 'partial')
  ) AS next_expected_ship_week

FROM production_deliveries pd
JOIN purchase_order_items poi ON poi.id = pd.po_item_id
JOIN purchase_orders po ON po.id = poi.po_id
JOIN products p ON p.sku = pd.sku
LEFT JOIN delivery_shipment_allocations dsa ON dsa.delivery_id = pd.id
GROUP BY pd.id, poi.id, po.id, p.product_name
HAVING pd.delivered_qty - COALESCE(SUM(dsa.shipped_qty), 0) > 0;
```

---

## 5. Business Rules Matrix (MECE)

### 5.1 单据数量完整性规则 (Document Quantity Integrity)

| 规则 ID | 条件 | 预期行为 | 错误处理 | 优先级 |
|---------|------|----------|----------|--------|
| **BR-QTY-001** | `SUM(OF.qty) > PO.ordered_qty` | 拒绝创建新 OF | 显示错误: "累计完工数量不能超过下单数量" | P0 |
| **BR-QTY-002** | `SUM(OS.shipped_qty) > SUM(OF.qty)` | 拒绝创建新 OS | 显示错误: "发货数量不能超过完工数量" | P0 |
| **BR-QTY-003** | `SUM(OA.arrived_qty) > OS.shipped_qty` | 拒绝创建新 OA | 显示错误: "到货数量不能超过发货数量" | P0 |
| **BR-QTY-004** | 用户尝试删除有下游单据的 PO | 阻止删除 | 显示错误: "存在关联的完工单,请先处理或归档" | P0 |
| **BR-QTY-005** | OF 中的 `fulfilled_qty` 修改 | 检查是否已有 OS 关联 | 若已发货,禁止修改;若未发货,允许修改但记录审计日志 | P1 |

---

### 5.2 时间逻辑验证规则 (Time Logic Validation)

| 规则 ID | 条件 | 预期行为 | 错误处理 | 优先级 |
|---------|------|----------|----------|--------|
| **BR-TIME-001** | `OF.fulfillment_date < PO.actual_order_date` | 标记异常 | 显示警告: "完工日期早于下单日期,请检查数据" | P1 |
| **BR-TIME-002** | `OA.arrival_date < OS.shipment_date` | 拒绝创建 OA | 显示错误: "到仓日期不能早于发货日期" | P0 |
| **BR-TIME-003** | `expected_arrival_week` 与倒推计算值偏差 > 4周 | 显示警告图标 | Tooltip: "手动覆盖检测,原计算周: W45" | P2 |
| **BR-TIME-004** | 当前时间 > `expected_fulfillment_week + 1周` 且无 OF | 自动标记"逾期未完工" | 在异常追踪列表显示 | P1 |
| **BR-TIME-005** | 修改 PO 的 `actual_order_date` | 触发级联更新 | 弹出确认框,显示影响的下游节点 | P0 |

---

### 5.3 PSI 计算边界情况处理 (PSI Calculation Edge Cases)

| 场景 | 处理规则 | 显示逻辑 | 优先级 |
|------|----------|----------|--------|
| **未来周无销售预测** | `forecast_sales_qty = 0` | 显示为空白单元格,非 0 | P1 |
| **期末库存为负** | 正常计算,允许负数 | 显示红色,标签"(断货)" | P0 |
| **期初库存 = 0 且无到货计划** | 跳过该周,不生成 PSI 行 | 不显示在表格中 | P2 |
| **多仓库同一 SKU** | 分别计算每个仓库的 PSI | 提供"合并视图"切换按钮 | P1 |
| **实际销量超过预测 50%+** | 触发"预测偏差警报" | 记录到 `forecast_variance_resolutions` | P1 |

---

### 5.4 差异处理规则 (Variance Management Rules)

| 差异类型 | 触发条件 | 自动处理 | 手动介入 | 优先级 |
|---------|---------|---------|---------|--------|
| **PO 未完工缺口** | `ordered_qty - fulfilled_qty > 0` | 提示用户设置"预计完工时间" | 用户可标记"结束",缺口清零 | P0 |
| **OF 未发货库存** | `fulfilled_qty - shipped_qty > 0` | 自动创建"工厂库存发货计划",预计周 = 完工周 + 1 | 用户可调整预计发货周 | P0 |
| **OS/OA 数量差异** | `arrived_qty < shipped_qty` | 记录差异,提示用户填写原因 | 生成库存调整单,标记损失 | P1 |
| **预测 vs 实际销量差异 > 20%** | 每周对比计算 | 自动记录到差异表 | 需求计划员审核,调整未来预测参数 | P2 |

---

## 6. Data Visualization Requirements (图表规格)

### 6.1 仪表盘 KPI 卡片 (Dashboard KPIs)

**Chart Type:** Metric Cards (Statistic Cards)

**Data Source Logic:**

```typescript
interface DashboardKPIs {
  // KPI 1: 断货预警数量
  stockout_alerts: {
    count: number                     // 未来 12 周内预测断货的 SKU 数量
    critical_skus: string[]           // 紧急 SKU 列表 (W+1 ~ W+4 断货)
    sql: "SELECT COUNT(DISTINCT sku) FROM psi_weekly_snapshots WHERE stock_status = 'Stockout' AND week_iso > current_week"
  }

  // KPI 2: 呆滞库存金额
  slow_moving_value: {
    total_value_usd: number           // DOI > 90天的库存总金额
    sku_count: number                 // 呆滞 SKU 数量
    sql: "SELECT SUM(closing_stock * unit_cost_usd) FROM psi_weekly_snapshots JOIN products WHERE doi_days > 90"
  }

  // KPI 3: 逾期未完工订单
  overdue_fulfillments: {
    count: number                     // 逾期 OF 数量
    total_qty: number                 // 逾期总数量
    sql: "SELECT COUNT(*) FROM v_po_fulfillment_variance WHERE is_overdue = true"
  }

  // KPI 4: 工厂库存待发货
  factory_inventory_pending: {
    total_qty: number                 // 工厂待发货总量
    days_avg: number                  // 平均滞留天数
    sql: "SELECT SUM(factory_inventory_qty), AVG(days_in_factory) FROM v_factory_inventory_pending_shipment"
  }
}
```

**UI Design:**

```
┌─────────────────────────────────────────────────────────────────┐
│  供应链健康度仪表盘 (Supply Chain Health Dashboard)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │ ⚠️ 断货预警   │ 💰 呆滞库存   │ 🕐 逾期完工   │ 🏭 工厂库存   │ │
│  │              │              │              │              │ │
│  │   5 SKU      │  $50,000     │   3 订单     │  1,200 台    │ │
│  │   紧急 2个    │  (8 SKU)     │  (500台)     │  平均 18天   │ │
│  │              │              │              │              │ │
│  │ [查看详情]    │ [查看详情]    │ [查看详情]    │ [查看详情]    │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.2 PSI 热力图 (PSI Heatmap)

**Chart Type:** Weekly Grid (Rows = SKUs, Columns = Weeks)

**Cell Color Logic:**

```typescript
function getCellColor(closingStock: number, safetyThreshold: number): string {
  if (closingStock < 0) {
    return 'bg-red-600'       // 断货 (Stockout)
  } else if (closingStock < safetyThreshold) {
    return 'bg-yellow-500'    // 风险 (Risk)
  } else if (closingStock >= safetyThreshold * 2) {
    return 'bg-green-500'     // 健康 (OK)
  } else {
    return 'bg-blue-400'      // 正常 (Normal)
  }
}
```

**Cell Content:**

```
┌──────────────┐
│  150         │  ← 期末库存 (粗体)
│  3.2w        │  ← 库存周转周数 (小字)
└──────────────┘
```

**Filters:**
- 仓库选择器 (Warehouse Dropdown)
- 产品分类 (Product Category Multi-Select)
- "仅显示风险 SKU" (Show Only At-Risk Toggle)

**Export:**
- "导出 Excel"按钮 (包含完整 PSI 表格,带公式)

---

### 6.3 单据流转追溯图 (Document Traceability Sankey)

**Chart Type:** Horizontal Sankey Diagram

**Nodes (5 stages):**
1. FO (销量预计)
2. PO (采购订单)
3. OF (工厂完工)
4. OS (物流发货)
5. OA (仓库到货)

**Edges (Quantity Flow):**
- 边的粗细 = 数量大小
- 颜色: 正常流转 (蓝色),异常 (红色,如数量减少 > 10%)

**Metrics Display:**
- 每个节点显示: 总数量,文档数量
- 每条边显示: 流转数量,损耗率 (若有)

**User Interaction:**
- 点击节点 → 显示该阶段的所有单据列表
- 点击边 → 显示流转详情 (如 PO-001 → OF-001, OF-002)
- Hover → 显示 Tooltip (数量,百分比,时间)

---

### 6.4 时间差异趋势图 (Variance Trend Chart)

**Chart Type:** Combo Chart (Bar + Line)

**X-Axis:** ISO Weeks (e.g., W45, W46, W47...)

**Y-Axis (Left):** 单据数量 (Number of Documents)

**Y-Axis (Right):** 准时率 (%) (On-Time Rate)

**Data Series:**
- **蓝色柱状图**: 本周到仓的 OA 总数
- **红色柱状图**: 延迟到仓的 OA 数 (variance > 0)
- **绿色折线图**: 准时到仓率 = (准时 OA / 总 OA) × 100%

**Filters:**
- 日期范围选择器 (Date Range Picker)
- 供应商多选 (Supplier Multi-Select)
- 路线多选 (Route Multi-Select, e.g., "中国 → 美国西海岸")

**Insights Panel:**
- 显示: "平均延迟: 1.2 周"
- 显示: "最延迟路线: 中国 → 欧洲 (平均 +2.3 周)"

---

## 7. Non-Functional Requirements (NFRs)

### 7.1 Performance (性能要求)

| 指标 | 目标值 | 测量方法 | 优先级 |
|------|-------|---------|--------|
| **PSI 计算速度** | < 3秒 (500 SKU × 12 周) | 页面加载时间 (Chrome DevTools) | P0 |
| **单据追溯查询** | < 500ms | 点击"查看追溯链"到弹窗显示 | P0 |
| **差异报表生成** | < 5秒 (1000 条记录) | 导出 Excel 完成时间 | P1 |
| **仪表盘刷新** | < 2秒 | 实时 KPI 更新 | P1 |
| **倒推算法计算** | < 1秒 (单个 SKU) | Server Action 响应时间 | P0 |

**Implementation Guidance for Engineers:**

1. **使用 PostgreSQL 物化视图 (Materialized Views)**
   - `v_psi_weekly_snapshots` → 每小时刷新一次
   - `v_po_fulfillment_variance` → 实时刷新 (CONCURRENTLY)

2. **数据库索引优化**
   ```sql
   CREATE INDEX idx_psi_sku_week ON psi_weekly_snapshots(sku, week_iso);
   CREATE INDEX idx_deliveries_po_item ON production_deliveries(po_item_id);
   CREATE INDEX idx_shipments_delivery ON delivery_shipment_allocations(delivery_id);
   ```

3. **缓存策略**
   - 倒推算法结果缓存 24 小时 (Redis)
   - 仪表盘 KPI 缓存 5 分钟 (Next.js ISR)

---

### 7.2 Data Integrity (数据完整性)

| 要求 | 验证方法 | 实现策略 | 优先级 |
|------|---------|---------|--------|
| **每个 OA 必须关联一个 OS** | 数据库外键约束 | `FOREIGN KEY (shipment_id) REFERENCES shipments(id)` | P0 |
| **OF 总量 ≤ PO 总量** | 数据库 CHECK 约束或应用层校验 | Server Action 中添加验证逻辑 | P0 |
| **无孤立 OF (PO 删除后 OF 保留)** | 级联删除或软删除 | `ON DELETE CASCADE` 或 `deleted_at` 字段 | P1 |
| **PSI 计算结果可复现** | 保存计算快照 | `calculated_at` 字段记录计算时间 | P1 |

---

### 7.3 Scalability (可扩展性)

**预期数据量 (Year 1):**
- 产品 (Products): 500 SKU
- 采购订单 (PO): 2,000 张/年
- 完工单 (OF): 4,000 张/年 (平均每 PO 拆 2 次)
- 发货单 (OS): 1,500 张/年
- 到仓单 (OA): 3,000 张/年
- PSI 周报表: 500 SKU × 52 周 × 3 仓库 = 78,000 行/年

**增长预测 (Year 3):**
- 数据量 × 3 倍
- 并发用户: 50+ (当前 10+)

**Database Strategy:**
- 分区 (Partitioning): `psi_weekly_snapshots` 按年分区
- 归档 (Archiving): 2 年以上的审计记录迁移到冷存储
- 时序数据库 (Time-Series DB): 考虑使用 TimescaleDB 扩展

---

## 8. Out of Scope (V2 阶段明确排除)

以下功能明确不包含在 V2 版本中,将在后续版本考虑:

1. **多币种支持 (Multi-Currency)**
   - V2 假设: 所有金额以 USD 计价
   - 未来: 支持 RMB, EUR 等多币种

2. **自动下单 (Automated PO Generation)**
   - V2: 系统仅生成"采购建议",需人工确认
   - 未来: 基于规则自动创建 PO

3. **供应商门户集成 (Supplier Portal)**
   - V2: 供应商通过 CSV 上传 OF 数据
   - 未来: 供应商直接登录系统录入

4. **实时物流追踪 (Real-Time Shipment Tracking)**
   - V2: OS/OA 日期手动录入
   - 未来: 通过物流 API 自动获取

5. **场景模拟 (What-If Scenario Planning)**
   - V2: 无模拟功能
   - 未来: 测试不同 lead time 对库存的影响

6. **多语言支持 (i18n)**
   - V2: 仅支持中文/英文双语标签
   - 未来: 完整的多语言切换

7. **移动端 App (Mobile App)**
   - V2: 仅响应式 Web 界面
   - 未来: 原生 iOS/Android App

---

## 9. Success Criteria & Go-Live Checklist

### 9.1 Functional Acceptance (功能验收)

- [ ] 所有 User Stories (US-1.1 ~ US-4.1) 通过手动测试
- [ ] PSI 计算结果与 Excel 基线对比,误差 < 1%
- [ ] 单据追溯链完整显示 (抽查 100 条随机 OA 记录)
- [ ] 差异报表导出无错误 (测试 6 个月历史数据)
- [ ] 倒推算法计算结果符合业务规则 (20 个样本 SKU 验证)

### 9.2 Data Migration Validation (数据迁移验证)

- [ ] 现有 `sales_forecasts` 数据完整迁移 (100% 覆盖率)
- [ ] 现有 `purchase_orders` 扩展字段正确计算 (`fulfillment_status` 等)
- [ ] 现有 `production_deliveries` 重命名字段数据一致性检查
- [ ] 现有 `shipments` 数据关联到新表 `order_arrivals` (手动创建历史 OA 记录)
- [ ] PSI 周报表初始化 (生成过去 4 周 + 未来 12 周数据)
- [ ] 零孤立记录 (Zero Orphaned Records) 检查

### 9.3 User Training (用户培训)

- [ ] 2 小时培训: 需求计划团队 (Demand Planning Team)
  - 内容: 倒推算法,采购决策引擎,PSI 报表
- [ ] 1 小时培训: 采购团队 (Procurement Team)
  - 内容: PO 履约管理,差异处理,时间调整
- [ ] 1 小时培训: 物流团队 (Logistics Team)
  - 内容: OF/OS/OA 单据录入,工厂库存管理
- [ ] 书面文档:
  - "PSI 计算逻辑详解" (PSI Calculation Guide)
  - "单据流转常见问题" (Document Workflow FAQ)
  - "倒推算法参数配置指南" (Lead Time Configuration Guide)

### 9.4 Performance Benchmarks (性能基准测试)

- [ ] PSI 页面加载时间 < 3秒 (500 SKU)
- [ ] 差异报表导出 < 5秒 (1000 条记录)
- [ ] 数据库查询优化: 所有查询 < 1秒 (通过 `pg_stat_statements` 检查)
- [ ] 并发压力测试: 50 用户同时访问仪表盘,响应时间 < 5秒

---

## 10. Open Questions & Assumptions

### 10.1 Assumptions (已确认假设)

| 假设 | 依据 | 影响 |
|------|------|------|
| **ISO Week 边界: 周一开始** | ISO 8601 标准 | 所有周计算基于此标准 |
| **每个 OA 分配到一个仓库** | 现有业务流程 | 不支持跨仓转运 (Cross-Docking) |
| **销售预测每周更新** | 现有实践 | 每周一更新预测数据 |
| **数据保留 2 年** | 合规要求 | 2 年后归档到冷存储 |
| **单一币种 (USD)** | 当前业务范围 | V2 不支持多币种 |

### 10.2 Questions for Stakeholders (待决策问题)

| 问题 | 决策负责人 | 影响 | 期限 |
|------|-----------|------|------|
| **PSI 是否包含在途库存 (In-Transit)?** | 需求计划主管 | 改变"总供应量"公式 | 2025-12-15 |
| **OA 数量差异如何处理退货/损坏?** | 仓库经理 | 可能需要 `quantity_accepted` vs `quantity_received` | 2025-12-15 |
| **预测准确率是否排除停产 SKU?** | 产品经理 | 影响仪表盘指标计算 | 2025-12-20 |
| **差异预警的阈值如何设定?** | 供应链总监 | 定义"红色" vs "黄色"阈值 | 2025-12-20 |
| **是否需要审批流 (Approval Workflow)?** | 业务负责人 | V2 是否包含审批功能 | 2025-12-18 |

---

## 11. Risk Assessment & Mitigation (风险评估)

### 11.1 Technical Risks (技术风险)

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **级联更新性能瓶颈** | 修改 PO 时间导致系统卡顿 | Medium | High | 1. 使用后台异步任务<br>2. 添加数据库索引<br>3. 限制单次更新数量 < 100 |
| **PSI 计算复杂度过高** | 页面加载超时 | High | Medium | 1. 使用物化视图<br>2. 增量刷新策略<br>3. 分页加载 |
| **触发器循环依赖** | 数据库死锁 | High | Low | 1. 充分单元测试<br>2. 添加事务隔离级别控制<br>3. 记录所有触发器执行日志 |

### 11.2 Business Risks (业务风险)

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **用户抵触新系统** | 继续使用 Excel | High | Medium | 1. 分阶段上线 (先试点)<br>2. 提供并行期 (1 个月)<br>3. 展示清晰价值 |
| **历史数据迁移错误** | 初期数据不准确 | Medium | High | 1. 一次性批量创建历史 OA<br>2. 标记"历史数据"字段<br>3. 允许后期修正 |
| **业务规则理解偏差** | 系统逻辑不符合实际 | Medium | Medium | 1. 与业务团队深度访谈<br>2. 原型演示获取反馈<br>3. UAT 测试覆盖边界情况 |

---

## 12. Appendix: Glossary (术语表)

| 术语 (中文) | 术语 (English) | 定义 |
|------------|---------------|------|
| 倒排排程 | Reverse Scheduling | 从销售需求向前倒推计算各环节时间的方法 |
| ISO Week | ISO Week | ISO 8601 标准周编号 (W01-W53,周一开始) |
| 安全库存周数 | Safety Stock Weeks | 最小库存缓冲 (如 2 周),防止断货 |
| 库存周转 | Days of Inventory (DOI) | 库存量 / 平均日销量 |
| COALESCE | COALESCE | SQL 函数,返回第一个非空值 (用于实际 vs 计划回退) |
| 物化视图 | Materialized View | 预计算的数据库视图,存储结果以加快查询 |
| FO | Forecast Order | 销量预计单 (销售需求源头) |
| PO | Purchase Order | 采购订单 (向供应商下单) |
| OF | Order Fulfillment | 完工申报单 (工厂生产完成) |
| OS | Order Shipment | 发货单 (货代提货/装船) |
| OA | Order Arrived | 到仓单 (海外仓上架) |
| PSI | Production-Sales-Inventory | 进销存报表 (周粒度库存核算) |

---

## 13. Next Steps (后续步骤)

1. **Product Director Review** (本文档)
   - 与业务干系人确认需求完整性
   - 解答 10.2 节中的待决策问题
   - 获取最终批准

2. **System Architect Review**
   - 创建 `specs/scm-upgrade-v2/design.md`
   - 定义完整数据库 Schema (DDL)
   - 设计 API Contracts (Server Actions)
   - 评估技术可行性

3. **Frontend Artisan Review**
   - 创建 UI/UX 设计稿 (Figma)
   - 确认组件复用策略 (ShadCN)
   - 评估图表库选型 (Recharts)

4. **Backend Specialist Review**
   - 评估数据迁移策略
   - 设计数据库触发器
   - 规划性能优化方案

5. **QA Director Review**
   - 制定测试计划
   - 定义测试用例矩阵
   - 规划 UAT 流程

---

**Document Status:** 📝 Draft for System Architect Review

**Estimated Engineering Effort:** 8-12 周
- Backend (Database + API): 4 周
- Frontend (UI Components + Pages): 3 周
- Integration & Testing: 3 周
- Data Migration & UAT: 2 周

**Target Go-Live Date:** 2026-Q1 (待确认)

---

**END OF DOCUMENT**
