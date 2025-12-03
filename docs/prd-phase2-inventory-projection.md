# PRD: 供应链全链路可视化与库存预测系统

**文档版本**: v1.0
**创建日期**: 2025-11-30
**产品负责人**: Senior Product Director
**目标发布阶段**: Phase 2 - Inventory Projection & Supply Chain Visibility

---

## 执行摘要

Rolloy SCM 当前已实现基础的销量预测录入和库存快照功能，但缺乏"双轨制数据管理"的完整实现和供应链全链路可视化能力。本 PRD 定义了库存预测、供应链节点追踪、动态联动计算的完整业务逻辑，以最大化业务价值并消除用户在决策过程中的信息盲点。

---

## 1. 问题诊断

### 1.1 当前系统业务逻辑缺陷

#### 缺陷 1: 双轨制数据管理未完整实现
**严重等级**: Critical

**现状分析**:
- 数据库层已定义"预计"和"实际"字段（如 `planned_delivery_date` vs `actual_delivery_date`）
- 但前端业务逻辑中**未实现优先级读取机制**
- 库存预测计算逻辑（`inventory_projections` 表）存在但未被前端页面展示和利用

**业务影响**:
- 当实际数据偏离预计值时（如货物晚到2周），系统无法自动调整下游的库存预测
- 用户必须手动记忆偏差，无法获得可靠的决策支持
- 财务现金流预测失真（应付账款计算依赖实际日期）

**根本原因**:
- 缺少明确的"回退读取规则"文档化业务逻辑
- 缺少自动触发的"预测更新机制"


#### 缺陷 2: 全链路可视化缺失
**严重等级**: High

**现状分析**:
- 当前只有聚合的 Dashboard KPI（总库存、风险 SKU 数等）
- 销量计划页面（`/planning/page.tsx`）仅展示"周度汇总"，未细化到 SKU + 渠道维度
- 缺少"从当前周往后看 12 周"的时间轴视图
- 缺少供应链各节点（采购下单 → 生产交付 → 物流到达 → 销售）的并排对比

**业务影响**:
- 用户无法提前识别"第 8 周某 SKU 会断货"
- 无法回答"这批货如果晚 3 天到，会影响哪几周的销售？"
- 决策依赖线下 Excel 手工计算，系统价值降低


#### 缺陷 3: 销量预测录入体验不符合业务流程
**严重等级**: Medium

**现状分析**:
- 当前预测录入页面（`/planning/forecasts/page.tsx`）采用"表格逐行编辑"模式
- 缺少"显示上周/同期历史数据"作为参考依据
- 缺少批量录入能力（如"将上周数据批量复制到未来 4 周"）
- 未提供"按 SKU 纵向对比"视图（当前只能横向看一周的所有 SKU）

**业务影响**:
- 销量预测人员需要打开多个页面对比历史数据
- 录入效率低，容易漏填或错填


### 1.2 与双轨制原则的差距

#### 核心原则回顾
1. **双轨制数据管理**: 每个节点保留"预计"和"实际"两个字段
2. **运算优先级**: 计算库存/资金时，优先读取"实际值"；仅当实际值为空时，回退到"预计值"
3. **动态联动**: 上游实际值偏差，下游预计值自动顺延

#### 当前实现差距

| 供应链节点 | 数据库字段 | 读取优先级实现 | 动态联动实现 | 前端可视化 |
|---------|----------|-----------|-----------|----------|
| 采购下单 | `planned_order_date` / `actual_order_date` | ❌ 未实现 | ❌ 未实现 | ❌ 无 |
| 生产交付 | `planned_delivery_date` / `actual_delivery_date` | ❌ 未实现 | ❌ 未实现 | ❌ 无 |
| 物流到达 | `planned_arrival_date` / `actual_arrival_date` | ⚠️ 部分（库存在途） | ❌ 未实现 | ⚠️ 仅库存页 |
| 销售 | `forecast_qty` / `actual_qty` | ⚠️ 部分（周度汇总） | ❌ 未实现 | ⚠️ 仅计划页 |
| 库存预测 | `inventory_projections.effective_sales` | ❌ 未被读取 | ❌ 未实现 | ❌ 无页面 |

**结论**: 核心双轨制逻辑在数据模型层已定义，但在应用层（计算逻辑 + UI）未实现。


---

## 2. 产品目标与成功指标

### 2.1 业务目标
1. **消除决策盲点**: 用户能在一个视图中看到未来 12 周的库存预测、风险点、到货计划
2. **提升录入效率**: 销量预测录入时间从 30 分钟降至 10 分钟（通过历史对比 + 批量操作）
3. **增强预测准确性**: 系统自动根据实际偏差调整预测，减少 50% 的手动修正工作量

### 2.2 成功指标 (KPIs)
- **可视化覆盖率**: 100% 的供应链节点（采购、生产、物流、销售）都有预计/实际对比视图
- **动态联动准确率**: 上游实际值变更后，下游预测值在 1 秒内自动更新
- **用户录入效率**: 销量预测录入时长 < 15 分钟/周（当前 baseline: 30 分钟）
- **预测误差降低**: 库存预测与实际偏差 < 15%（当前 baseline: 30%）

---

## 3. 核心功能需求 (以用户故事形式)

### 3.1 场景 1: 销量预测录入增强

#### 用户故事 1.1: 历史数据对比录入
```gherkin
As a 销量预测专员
I want to 在录入本周预测时，并排显示上周、上两周、同期去年的实际销量
So that 我可以基于历史趋势做出更准确的判断，而不是凭空猜测
```

**业务规则**:
- **默认参考数据**: 显示最近 4 周的实际销量（如果没有实际值，显示预测值）
- **同比数据**: 如果系统有去年同期数据，自动计算同比增长率
- **异常高亮**: 如果本次录入值与历史平均值偏差 > 30%，标黄提示

**Acceptance Criteria**:
```gherkin
Given 我在录入 2025-W10 的销量预测
When 我选择某个 SKU + 渠道组合
Then 系统自动展示该组合在 2025-W09, W08, W07, W06 的实际销量
And 如果 2024-W10 有数据，显示同比对比
And 如果我输入的值与 4 周平均值偏差 > 30%，显示黄色提示框
```

#### 用户故事 1.2: 批量预测生成
```gherkin
As a 销量预测专员
I want to 基于历史平均值或上周数据，一键生成未来 N 周的预测草稿
So that 我只需微调特殊情况，而不是逐周从零录入
```

**业务规则**:
- **生成策略可选**:
  - 策略 A: 复制上周实际值到未来 N 周
  - 策略 B: 使用最近 4 周平均值
  - 策略 C: 应用环比增长率（如旺季每周 +10%）
- **草稿模式**: 批量生成的数据标记为"草稿"，用户确认后才正式保存
- **覆盖保护**: 如果目标周已有手动录入的预测，弹窗二次确认是否覆盖

**Acceptance Criteria**:
```gherkin
Given 当前是 2025-W10
When 我选择"批量生成预测"功能
And 选择"复制上周实际值"策略
And 设置目标周为 W11-W14（共 4 周）
Then 系统自动填充这 4 周的预测草稿（所有 SKU × 渠道组合）
And 草稿行以浅蓝色背景标识
When 我点击"确认保存"
Then 草稿正式写入 weekly_sales_forecasts 表
And 如果某行在 W12 已有手动预测，弹窗提示"是否覆盖已有数据"
```

#### 用户故事 1.3: 按 SKU 纵向视图
```gherkin
As a 销量预测专员
I want to 切换到"按 SKU 视图"，纵向查看单个 SKU 在未来 12 周的预测
So that 我可以快速检查某个核心 SKU 的趋势是否合理（如避免阶梯式断层）
```

**业务规则**:
- **视图切换**: 提供"按周查看"（当前默认）和"按 SKU 查看"两种模式切换
- **时间轴连续性**: 在 SKU 视图中，横轴是周次（W10, W11, ..., W21），纵轴是不同渠道
- **趋势可视化**: 用折线图叠加在表格上，显示该 SKU 的销量趋势

**Acceptance Criteria**:
```gherkin
Given 我在销量预测管理页面
When 我点击"切换为 SKU 视图"
Then 页面展示 SKU 选择器
When 我选择 SKU="RP-BLK-001"
Then 表格显示该 SKU 在所有渠道下，未来 12 周的预测值
And 在表格上方叠加折线图，展示总预测量趋势
And 如果某周的预测值为 0 但前后周 > 0，该单元格标红预警
```

---

### 3.2 场景 2: 全链路库存预测视图

#### 用户故事 2.1: 12 周库存预测时间轴
```gherkin
As a 供应链经理
I want to 查看从当前周开始，未来 12 周每周的库存预测（期初、到货、销量、期末）
So that 我可以提前识别哪几周会缺货，并安排补货计划
```

**核心计算逻辑 (双轨制优先级)**:
```
For each Week W in [Current Week, Current Week + 12]:
  For each SKU S:
    期初库存[W] = 期末库存[W-1]  (如果 W 是当前周，则读取 inventory_snapshots)

    预计到货[W] = SUM(
      shipments 中 effective_arrival_week = W 的 shipped_qty
      WHERE effective_arrival_date = actual_arrival_date ?? planned_arrival_date
    )

    预计销量[W] = SUM(
      weekly_sales_actuals WHERE week = W  (优先)
      ?? weekly_sales_forecasts WHERE week = W  (回退)
    )

    期末库存[W] = 期初库存[W] + 预计到货[W] - 预计销量[W]

    风险等级[W] =
      IF 期末库存[W] < 0: "断货"
      ELSE IF 期末库存[W] < safety_stock_threshold: "风险"
      ELSE: "正常"
```

**数据结构 (前端视图)**:
```typescript
interface WeeklyInventoryProjection {
  sku: string
  product_name: string
  week_iso: string  // "2025-W10"
  week_start_date: string
  week_end_date: string

  // 库存流
  opening_stock: number
  incoming_qty: number
  sales_qty: number  // effective_sales (实际 ?? 预测)
  closing_stock: number

  // 风险状态
  safety_stock_threshold: number
  risk_level: 'OK' | 'Risk' | 'Stockout'

  // 元数据（用于溯源）
  incoming_source: 'actual' | 'planned'  // 到货数据来源
  sales_source: 'actual' | 'forecast'    // 销量数据来源
}
```

**Acceptance Criteria**:
```gherkin
Given 当前周是 2025-W10
When 我访问"库存预测"页面
Then 页面默认展示所有 SKU 在 W10-W21（12 周）的库存预测表格
And 表格列包括: SKU, 产品名, 周次, 期初, 到货, 销量, 期末, 状态
And 状态列用颜色标识: 绿色=正常, 橙色=风险, 红色=断货

When 我点击某个单元格的"到货"数字
Then 显示 Tooltip: "来源: 3 个物流批次 (2 个已实际到达, 1 个预计)"
And 点击 Tooltip 可跳转到物流管理页面查看详情

When 我筛选 SKU="RP-BLK-001"
Then 表格只显示该 SKU 的 12 周数据
And 在表格上方显示库存趋势折线图（期初、期末两条线）
```

#### 用户故事 2.2: 库存预警自动触发
```gherkin
As a 供应链经理
I want to 系统自动识别未来 12 周内会断货的 SKU，并推荐补货量和截止日期
So that 我不需要逐个 SKU 检查，系统主动告诉我风险点
```

**业务规则 (补货建议逻辑)**:
```
For each SKU S:
  识别风险周 R = 第一个 closing_stock < safety_stock_threshold 的周

  IF R exists:
    计算需求缺口 Gap = (safety_stock_threshold - closing_stock[R])

    计算订单截止周 DeadlineWeek = R - lead_time_weeks
    WHERE lead_time_weeks = (
      生产周期 (从 suppliers 表) +
      物流周期 (从 shipments.planned_arrival_days 历史平均)
    )

    生成补货建议:
      suggested_order_qty = Gap + BUFFER(10%)
      order_deadline_date = DeadlineWeek 的周末日期
      priority =
        IF DeadlineWeek < CurrentWeek: "Critical" (已错过)
        ELSE IF DeadlineWeek = CurrentWeek: "High"
        ELSE IF DeadlineWeek <= CurrentWeek + 2: "Medium"
        ELSE: "Low"
```

**Acceptance Criteria**:
```gherkin
Given SKU "RP-BLK-001" 在 2025-W15 的预测期末库存是 -50 (断货)
And 该 SKU 的安全库存阈值是 200
And 生产周期 4 周 + 物流周期 2 周 = 总提前期 6 周
When 系统运行库存预警计算
Then 生成补货建议:
  - risk_week: 2025-W15
  - suggested_order_qty: 275 (缺口 250 + 10% buffer)
  - order_deadline_week: 2025-W09 (W15 - 6周)
  - order_deadline_date: 2025-03-02 (W09 的周日)
  - priority: "Critical" (因为当前周是 W10，已错过 W09)

When 我在 Dashboard 或库存预测页查看
Then 该 SKU 的 W15 单元格标红
And 在页面顶部显示红色警告条: "1 个 SKU 已错过补货截止日期"
And 点击警告条跳转到"补货建议"Tab
```

#### 用户故事 2.3: 多维度筛选与导出
```gherkin
As a 供应链经理
I want to 按 SKU、渠道、仓库类型筛选库存预测，并导出 Excel
So that 我可以只关注特定子集（如只看 FBA 库存）并分享给团队
```

**筛选维度**:
- SKU (多选下拉)
- 渠道 (多选: Amazon, Walmart, etc.)
- 仓库类型 (FBA / 3PL)
- 风险等级 (只看"风险"或"断货"的周)
- 时间范围 (默认 12 周，可调整为 4/8/16 周)

**Acceptance Criteria**:
```gherkin
Given 我在库存预测页面
When 我勾选筛选器: "仓库类型=FBA" AND "风险等级=断货"
Then 表格只显示会在 FBA 仓库断货的 SKU 和对应周次
And 表格右上角显示"共 3 个 SKU, 5 个风险周"

When 我点击"导出 Excel"
Then 下载文件包含当前筛选结果
And Excel 文件包含 3 个 Sheet: "库存预测", "补货建议", "原始数据"
```

---

### 3.3 场景 3: 供应链节点追踪 (预计 vs 实际对比)

#### 用户故事 3.1: 采购订单执行监控
```gherkin
As a 采购经理
I want to 查看所有 PO 的预计下单日 vs 实际下单日，并标识延迟订单
So that 我可以及时催促团队确认订单，避免影响后续生产排期
```

**数据源**: `purchase_orders` 表
- `planned_order_date` (预计)
- `actual_order_date` (实际)

**计算逻辑**:
```
For each PO:
  延迟天数 = actual_order_date - planned_order_date  (如果 actual 已填)
  OR
  风险天数 = TODAY - planned_order_date  (如果 actual 未填且已过期)

  状态 =
    IF actual_order_date IS NULL AND planned_order_date < TODAY: "逾期未下单"
    ELSE IF 延迟天数 > 7: "严重延迟"
    ELSE IF 延迟天数 > 0: "轻微延迟"
    ELSE: "按时"
```

**Acceptance Criteria**:
```gherkin
Given PO-2025-001 的 planned_order_date 是 2025-02-01
And actual_order_date 是 2025-02-08 (延迟 7 天)
When 我访问"采购执行监控"页面
Then 该 PO 显示状态: "严重延迟"
And 延迟天数列显示: "+7 天" (红色)

Given PO-2025-002 的 planned_order_date 是 2025-03-10
And actual_order_date 为空
And 今天是 2025-03-15
When 我访问页面
Then 该 PO 显示状态: "逾期未下单"
And 风险天数列显示: "已逾期 5 天" (红色闪烁)
```

#### 用户故事 3.2: 生产交付准时率分析
```gherkin
As a 供应链总监
I want to 查看各供应商的生产交付准时率（实际 vs 预计交付日）
So that 我可以评估供应商绩效，并为下次采购决策提供依据
```

**数据源**: `production_deliveries` 表
- `planned_delivery_date` (预计)
- `actual_delivery_date` (实际)

**聚合视图**:
```typescript
interface SupplierPerformance {
  supplier_id: string
  supplier_name: string
  total_deliveries: number
  on_time_deliveries: number  // 延迟 <= 0 天
  delayed_deliveries: number
  avg_delay_days: number
  on_time_rate: number  // %
}
```

**Acceptance Criteria**:
```gherkin
Given 供应商 "ABC Manufacturing" 有 10 笔交付记录
And 其中 7 笔按时, 3 笔平均延迟 5 天
When 我访问"供应商绩效"页面
Then 表格显示:
  - 供应商名称: ABC Manufacturing
  - 总交付: 10
  - 准时交付: 7
  - 延迟交付: 3
  - 平均延迟: 5 天
  - 准时率: 70% (橙色标识, 因为 < 80%)

When 我点击该行
Then 展开详情，显示 10 笔交付的明细表（预计日期 vs 实际日期）
```

#### 用户故事 3.3: 物流到货偏差追踪
```gherkin
As a 物流协调员
I want to 查看所有在途货物的预计到达日 vs 实际到达日（如果已到）
So that 我可以及时更新仓库接收计划，并识别物流服务商的延迟模式
```

**数据源**: `shipments` 表
- `planned_arrival_date` (预计)
- `actual_arrival_date` (实际)

**计算逻辑**:
```
For each Shipment:
  状态 =
    IF actual_arrival_date IS NOT NULL: "已到达"
    ELSE IF actual_departure_date IS NULL: "未发货"
    ELSE: "在途"

  IF 状态 = "已到达":
    延迟天数 = actual_arrival_date - planned_arrival_date
  ELSE IF 状态 = "在途":
    预计剩余天数 = planned_arrival_date - TODAY
    IF 预计剩余天数 < 0: 风险标记 = "已超预期"
```

**Acceptance Criteria**:
```gherkin
Given 物流单 TRK-2025-001 的 planned_arrival_date 是 2025-03-10
And actual_arrival_date 是 2025-03-13 (延迟 3 天)
When 我访问"物流追踪"页面
Then 该物流单显示状态: "已到达 (延迟)"
And 延迟天数列显示: "+3 天" (橙色)

Given 物流单 TRK-2025-002 的 planned_arrival_date 是 2025-03-01
And actual_arrival_date 为空 (仍在途)
And 今天是 2025-03-05
When 我访问页面
Then 该物流单显示状态: "在途 (超预期)"
And 风险提示: "预计到达日已过 4 天" (红色)
```

---

### 3.4 场景 4: 动态联动计算 (核心双轨制实现)

#### 用户故事 4.1: 到货日期偏差自动调整库存预测
```gherkin
As a 系统
I want to 当物流实际到达日晚于预计日时，自动重新计算受影响周的库存预测
So that 用户看到的库存预测始终基于最新实际数据，无需手动刷新
```

**触发条件**:
- 用户在物流管理页面更新 `shipments.actual_arrival_date`
- 新值与 `planned_arrival_date` 不一致

**联动计算逻辑**:
```
Event: shipments.actual_arrival_date 从 NULL 更新为 "2025-03-15"
       (原 planned_arrival_date 是 "2025-03-10", 延迟 5 天)

Step 1: 识别受影响的周
  - 原预计到达周: 2025-W10
  - 新实际到达周: 2025-W11
  - 受影响周范围: W10 至 W21 (当前周 + 12)

Step 2: 重新计算库存预测
  For each Week W in [W10, W21]:
    For each SKU in this Shipment:
      // 重新计算 incoming_qty
      incoming_qty[W] = SUM(
        shipments 中 effective_arrival_week = W 的 shipped_qty
        WHERE effective_arrival_date = COALESCE(actual_arrival_date, planned_arrival_date)
      )

      // 连锁更新期末库存
      closing_stock[W] = opening_stock[W] + incoming_qty[W] - effective_sales[W]
      opening_stock[W+1] = closing_stock[W]  (递推)

Step 3: 更新补货建议
  IF closing_stock[某周] 新的状态变为"风险"或"断货":
    触发 replenishment_suggestions 表的重新计算
```

**Acceptance Criteria**:
```gherkin
Given 物流单 TRK-2025-001 包含 SKU "RP-BLK-001" 数量 500
And planned_arrival_date 是 "2025-03-10" (对应 W10)
And 库存预测中, W10 的 incoming_qty 是 500, closing_stock 是 300
When 我将 actual_arrival_date 更新为 "2025-03-15" (对应 W11)
Then 系统自动重新计算:
  - W10 的 incoming_qty 变为 0 (因为该批次不再在 W10 到达)
  - W10 的 closing_stock 变为 -200 (期初 200 + 到货 0 - 销量 400)
  - W11 的 incoming_qty 变为 500
  - W11 的 closing_stock 变为 300
  - W10 的风险等级变为 "断货" (红色)
And 在库存预测页面刷新后，看到更新后的数值
And 如果 W10 新增补货建议，在 Dashboard 显示提醒
```

#### 用户故事 4.2: 销量实际值回填自动更新预测
```gherkin
As a 系统
I want to 当用户录入某周的实际销量后，自动将该周及后续周的"预计销量"从预测值切换为实际值
So that 库存预测越来越准确（因为历史周使用实际数据）
```

**触发条件**:
- 用户在"实际销量录入"页面提交 `weekly_sales_actuals` 记录

**联动计算逻辑**:
```
Event: weekly_sales_actuals 新增记录
       week = "2025-W10", sku = "RP-BLK-001", actual_qty = 450
       (原 weekly_sales_forecasts 预测是 400)

Step 1: 更新库存预测的销量源
  For Week W10:
    effective_sales = actual_qty (450)  // 从预测切换为实际

Step 2: 连锁更新期末库存
  closing_stock[W10] = opening_stock[W10] + incoming_qty[W10] - 450
  opening_stock[W11] = closing_stock[W10]  (递推)

Step 3: 如果偏差显著 (> 10%), 触发预警
  variance = (450 - 400) / 400 = 12.5%
  生成预警: "SKU RP-BLK-001 在 W10 的实际销量超预测 12.5%"
```

**Acceptance Criteria**:
```gherkin
Given SKU "RP-BLK-001" 在 W10 的预测销量是 400
And 库存预测中 W10 的 closing_stock 是 100 (基于预测 400 计算)
When 我录入 W10 的实际销量 450
Then 系统自动:
  - 更新库存预测中 W10 的 effective_sales 为 450
  - 重新计算 W10 的 closing_stock 为 50 (100 - 50)
  - 更新 W11 的 opening_stock 为 50
  - 在 Dashboard 显示提醒: "1 个 SKU 本周销量超预测 10% 以上"
And 在库存预测页面, W10 的销量单元格标记为"实际"（蓝色徽章）
```

---

## 4. 非功能性需求

### 4.1 性能要求
- **库存预测计算响应时间**: < 2 秒（100 个 SKU × 12 周）
- **动态联动更新延迟**: < 1 秒（用户保存实际值后，前端自动刷新预测）
- **并发支持**: 支持 10 个用户同时编辑不同周的预测数据

### 4.2 数据一致性
- **事务保证**: 更新实际值 + 重新计算预测 必须在同一事务中完成
- **乐观锁**: 如果两个用户同时编辑同一条预测，后提交者收到冲突提示

### 4.3 可扩展性
- **时间范围可配置**: 预测周数可从 12 周调整为 4/8/16 周（系统配置项）
- **自定义安全库存**: 允许按 SKU + 渠道设置不同的安全库存阈值

---

## 5. 界面原型建议

### 5.1 销量预测录入页面改版

**布局结构**:
```
┌─────────────────────────────────────────────────────────┐
│ 销量预测管理                                              │
├─────────────────────────────────────────────────────────┤
│ 视图切换: [● 按周查看]  [○ 按 SKU 查看]                   │
│ 选择周次: [2025-W10 ▼]  [批量生成预测] [保存]             │
├─────────────────────────────────────────────────────────┤
│ ┌─ 历史参考 ───────────────────────────────────────────┐ │
│ │ SKU: RP-BLK-001  渠道: Amazon                        │ │
│ │                                                       │ │
│ │ W09   W08   W07   W06   平均   同比(2024-W10)        │ │
│ │ 420   410   405   415   412    380 (+8.4%)           │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─ 本周预测录入 (2025-W10) ────────────────────────────┐ │
│ │ SKU          渠道      预测数量   历史平均   偏差      │ │
│ │ RP-BLK-001   Amazon     450       412      +9.2% ⚠️  │ │
│ │ RP-BLK-001   Walmart    200       -         -        │ │
│ │ RP-WHT-002   Amazon     300       285      +5.3%     │ │
│ └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**交互说明**:
- 点击表格某行 → 右侧"历史参考"面板自动加载该 SKU + 渠道的历史数据
- 偏差 > 30% 的单元格自动标黄色警告图标
- 批量生成弹窗提供 3 种策略选择 + 目标周范围设置

### 5.2 全链路库存预测视图

**布局结构**:
```
┌─────────────────────────────────────────────────────────┐
│ 库存预测 (未来 12 周)                                     │
├─────────────────────────────────────────────────────────┤
│ 筛选: SKU [全部 ▼]  渠道 [全部 ▼]  仓库类型 [全部 ▼]      │
│       风险等级 [全部 ▼]  时间范围 [12 周 ▼]               │
│ [导出 Excel]  [刷新数据]                                 │
├─────────────────────────────────────────────────────────┤
│ ⚠️ 警告: 3 个 SKU 在未来 12 周内会断货  [查看详情]       │
├─────────────────────────────────────────────────────────┤
│ ┌─ 库存趋势图 (RP-BLK-001) ────────────────────────────┐ │
│ │   ^                                                   │ │
│ │ 600│     ╱────╲                                       │ │
│ │ 400│   ╱        ╲____                                 │ │
│ │ 200│ ╱                ╲____                           │ │
│ │   0│                       ╲____  ⚠️ 断货             │ │
│ │    └─W10─W11─W12─W13─W14─W15─W16─>                   │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─ 分周明细表 ──────────────────────────────────────────┐ │
│ │ SKU   产品名   周次   期初  到货  销量  期末  状态    │ │
│ │ RP... Roller  W10    200   300   400   100   ✅ 正常 │ │
│ │ RP... Roller  W11    100   0     400   -300  🔴 断货 │ │
│ │ RP... Roller  W12    -300  500   400   -200  🔴 断货 │ │
│ │ ...                                                   │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ Tab: [库存预测] [补货建议] [节点追踪]                     │
└─────────────────────────────────────────────────────────┘
```

**交互说明**:
- 点击"到货"单元格 → Tooltip 显示来源（如"3 个物流批次: TRK-001, TRK-002, TRK-003"）
- 点击"销量"单元格 → Tooltip 显示来源（"实际"或"预测"）
- 断货行自动高亮红色背景
- 点击"查看详情"按钮 → 跳转到"补货建议" Tab

### 5.3 供应链节点追踪页面

**布局结构**:
```
┌─────────────────────────────────────────────────────────┐
│ 供应链节点追踪                                            │
├─────────────────────────────────────────────────────────┤
│ Tab: [采购订单] [生产交付] [物流到货] [销售对比]          │
├─────────────────────────────────────────────────────────┤
│ ── 生产交付节点 (Planned vs Actual) ────────────────────│
│                                                           │
│ 筛选: 供应商 [全部 ▼]  批次 [全部 ▼]  状态 [全部 ▼]      │
│                                                           │
│ ┌─ 交付准时率概览 ──────────────────────────────────────┐ │
│ │ 总交付: 45   按时: 32 (71%)   延迟: 13 (29%)          │ │
│ │ 平均延迟: 3.5 天                                      │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─ 明细表 ──────────────────────────────────────────────┐ │
│ │ 交付单号    SKU     预计交付    实际交付    延迟  状态│ │
│ │ DEL-001   RP-BLK  2025-02-10  2025-02-10   0天  ✅   │ │
│ │ DEL-002   RP-WHT  2025-02-15  2025-02-20  +5天  ⚠️   │ │
│ │ DEL-003   RP-BLK  2025-02-20  (未交付)    -    🔴   │ │
│ │           (已逾期 5 天)                              │ │
│ └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**交互说明**:
- 红色闪烁效果标识"已逾期未交付"的记录
- 点击某行 → 展开显示该交付单的所有 SKU 明细
- 提供"导出延迟报告"按钮，生成 PDF 给供应商

---

## 6. 技术实现建议 (仅供参考，非 PM 决定)

### 6.1 数据库层优化

**新增计算视图**:
```sql
-- 库存预测视图 (优先读取实际值)
CREATE VIEW v_inventory_projection_12weeks AS
SELECT
  sku,
  week_iso,
  -- 期初库存 (递推计算)
  LAG(closing_stock) OVER (PARTITION BY sku ORDER BY week_iso) as opening_stock,

  -- 到货 (优先实际)
  COALESCE(
    SUM(actual_incoming_qty),
    SUM(planned_incoming_qty)
  ) as incoming_qty,

  -- 销量 (优先实际)
  COALESCE(
    actual_sales_qty,
    forecast_sales_qty
  ) as effective_sales,

  -- 期末库存
  (opening_stock + incoming_qty - effective_sales) as closing_stock,

  -- 风险等级
  CASE
    WHEN closing_stock < 0 THEN 'Stockout'
    WHEN closing_stock < safety_stock_threshold THEN 'Risk'
    ELSE 'OK'
  END as risk_level
FROM ...
WHERE week_iso BETWEEN current_week AND (current_week + 12 weeks)
```

### 6.2 动态联动触发器

**Supabase Edge Function**:
```typescript
// 触发器: 当 shipments.actual_arrival_date 更新时
export async function onShipmentArrivalUpdate(shipment: Shipment) {
  // 1. 识别受影响的 SKU 和周
  const affectedWeeks = getWeekRange(
    shipment.planned_arrival_date,
    shipment.actual_arrival_date
  )

  // 2. 重新计算库存预测
  await recalculateInventoryProjections(
    shipment.sku,
    affectedWeeks
  )

  // 3. 更新补货建议
  await updateReplenishmentSuggestions(shipment.sku)

  // 4. 发送实时通知 (WebSocket)
  await notifyFrontend({
    type: 'inventory_projection_updated',
    sku: shipment.sku,
    weeks: affectedWeeks
  })
}
```

### 6.3 前端状态管理

**Redux Slice 示例**:
```typescript
// features/inventoryProjection/slice.ts
interface InventoryProjectionState {
  weeks: WeeklyInventoryProjection[]
  filters: {
    sku: string[]
    channel: string[]
    riskLevel: string[]
  }
  loading: boolean
  lastUpdated: string
}

// Thunk: 自动刷新当用户在其他页面更新实际值
export const subscribeToProjectionUpdates = createAsyncThunk(
  'inventoryProjection/subscribe',
  async (_, { dispatch }) => {
    const channel = supabase
      .channel('inventory_updates')
      .on('broadcast', { event: 'inventory_projection_updated' }, (payload) => {
        dispatch(refreshProjections(payload.weeks))
      })
      .subscribe()
  }
)
```

---

## 7. 开发优先级 (MoSCoW)

### Must Have (P0 - 第一迭代，2 周)
1. **库存预测 12 周视图** (用户故事 2.1)
   - 基础表格展示 (SKU × 周 × 期初/到货/销量/期末)
   - 双轨制优先级读取逻辑（actual ?? planned）
   - 风险等级标识（红/橙/绿）

2. **销量预测历史对比** (用户故事 1.1)
   - 显示最近 4 周历史数据
   - 偏差 > 30% 的黄色警告

3. **动态联动核心逻辑** (用户故事 4.1, 4.2)
   - 到货日期变更 → 库存预测自动更新
   - 销量实际值录入 → 切换数据源

### Should Have (P1 - 第二迭代，1 周)
4. **库存预警自动生成** (用户故事 2.2)
   - 识别断货周
   - 计算补货建议（数量 + 截止日期）
   - Dashboard 红色警告条

5. **供应链节点追踪 - 生产交付** (用户故事 3.2)
   - Planned vs Actual 对比表格
   - 延迟天数计算
   - 供应商准时率统计

6. **批量预测生成** (用户故事 1.2)
   - 复制上周实际值策略
   - 草稿模式 + 确认保存

### Could Have (P2 - 第三迭代，1 周)
7. **SKU 纵向视图** (用户故事 1.3)
   - 视图切换器
   - 折线图趋势叠加

8. **供应链节点追踪 - 完整版** (用户故事 3.1, 3.3)
   - 采购订单执行监控
   - 物流到货偏差追踪

9. **多维度筛选与导出** (用户故事 2.3)
   - SKU/渠道/仓库类型筛选
   - Excel 导出（3 个 Sheet）

### Won't Have (暂不实现)
10. **AI 销量预测**
    - 理由: 需要积累至少 1 年历史数据训练模型，当前数据量不足

11. **移动端 App**
    - 理由: 用户主要在办公室使用，响应式 Web 已足够

12. **多语言支持**
    - 理由: 当前团队仅中文用户

---

## 8. 验收标准 (Definition of Done)

每个用户故事完成时必须满足:
1. ✅ 所有 Acceptance Criteria 中的 Given-When-Then 场景通过测试
2. ✅ 双轨制优先级读取逻辑在代码中有明确注释（如 `// COALESCE(actual, planned)`）
3. ✅ 数据库查询性能 < 2 秒（100 SKU × 12 周）
4. ✅ 前端页面响应式适配（桌面 1920px + 笔记本 1366px）
5. ✅ 关键操作有错误处理和用户友好提示（如"数据加载失败，请刷新重试"）
6. ✅ 代码 Review 通过，符合项目 ESLint 规范

---

## 9. 风险与依赖

### 9.1 技术风险
| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 库存预测计算耗时过长 (> 5 秒) | 用户体验差 | 使用 Postgres 物化视图预计算；前端增加 Loading 骨架屏 |
| 并发编辑导致数据覆盖 | 数据不一致 | 实现乐观锁 (version 字段) + 冲突提示 |
| 动态联动触发死循环 | 系统崩溃 | 在 Edge Function 中增加递归深度限制（max 3 层） |

### 9.2 数据依赖
- **历史数据完整性**: 如果 `planned_*_date` 字段大量为空，双轨制逻辑失效
  → **解决**: 在数据迁移时，将现有日期字段映射到 `planned` 字段

- **物流到货数据时效性**: 如果物流公司 API 延迟更新，预测不准
  → **解决**: 允许用户手动修正 `actual_arrival_date`

### 9.3 团队依赖
- 需要后端工程师实现 Edge Function 触发器 (依赖 Supabase Functions)
- 需要 UI/UX 设计师确认"库存趋势图"的视觉规范

---

## 10. 后续扩展方向 (Roadmap)

### Phase 3: 智能决策支持 (3 个月后)
- **What-If 场景模拟**: 用户调整销量预测后，实时看到对库存的影响
- **成本优化建议**: 结合物流成本、仓储费用，推荐最优补货策略
- **供应商评分系统**: 基于准时率、成本、质量自动打分

### Phase 4: 协作与审批流 (6 个月后)
- **多角色权限**: 销量预测员只能编辑预测，采购经理才能确认 PO
- **审批工作流**: 补货建议需总监批准后才能转为 PO
- **消息通知**: Slack/企业微信集成，自动推送"断货预警"

---

## 附录 A: 术语表

| 术语 | 定义 |
|------|------|
| 双轨制 | 每个业务节点同时保留"预计"和"实际"两个时间/数量字段的数据管理模式 |
| 优先级读取 | 计算时优先使用实际值，仅当实际值为空时才回退到预计值的逻辑 |
| 动态联动 | 上游节点的实际值变化后，自动触发下游节点预测值的重新计算 |
| Effective Sales | 有效销量 = COALESCE(actual_qty, forecast_qty) |
| Lead Time | 提前期 = 生产周期 + 物流周期 |
| Safety Stock | 安全库存 = 销量标准差 × 服务水平系数 (简化为固定周数) |

---

## 附录 B: 数据流图

```
用户录入销量预测 (weekly_sales_forecasts)
  ↓
库存预测计算引擎 (inventory_projections)
  ← 读取实际到货 (shipments.actual_arrival_date)
  ← 读取实际销量 (weekly_sales_actuals)
  ↓
识别风险周 (closing_stock < safety_stock)
  ↓
生成补货建议 (replenishment_suggestions)
  ↓
Dashboard 预警展示
```

---

## 附录 C: 业务规则矩阵

### 库存风险等级判定规则

| 期末库存 (closing_stock) | 安全库存阈值 (safety_stock) | 风险等级 | 颜色 | 操作建议 |
|-------------------------|----------------------------|---------|------|---------|
| < 0 | - | Stockout (断货) | 红色 | 立即下单 |
| 0 ~ safety_stock | - | Risk (风险) | 橙色 | 3 天内下单 |
| > safety_stock | - | OK (正常) | 绿色 | 无需操作 |

### 补货建议优先级规则

| 订单截止周 (order_deadline_week) | 当前周 (current_week) | 优先级 | 操作 |
|--------------------------------|---------------------|-------|------|
| < current_week | - | Critical | 已错过，紧急协调 |
| = current_week | - | High | 本周必须下单 |
| current_week + 1 ~ +2 | - | Medium | 提前规划 |
| > current_week + 2 | - | Low | 正常跟进 |

---

**文档结束**

下一步: 请开发团队根据 MoSCoW 优先级，创建 JIRA Task 并分配迭代周期。
