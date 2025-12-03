# 算法验证页面重设计 - 需求文档 V2.0
## Algorithm Audit Page Redesign - Requirements Document V2.0

**版本 Version:** 2.0
**创建日期 Created:** 2025-12-03
**产品负责人 Product Director:** Rolloy SCM Team
**优先级 Priority:** High
**变更原因 Change Reason:** 用户反馈现有格式不够清晰,需要展示供应链全流程的预计与实际对比

---

## 1. 功能概述 Feature Overview

### 1.1 业务价值 Business Value

算法验证页面是供应链计划透明度的核心工具,用于逐周展示库存预测的完整计算过程。该页面帮助业务团队:

1. **验证算法准确性**: 对比预计值与实际值,验证供应链预测模型的可靠性
2. **追溯决策依据**: 清晰展示每一周的库存变化来源(销量消耗 vs 到仓补充)
3. **发现异常问题**: 快速识别预测偏差、延迟到仓、库存风险等问题
4. **优化计划流程**: 通过历史数据对比,改进未来的采购和物流计划
5. **完整流程可视化**: 展示供应链全流程(下单→出货→发货→到仓→销售)的时间节点

### 1.2 核心改进点 Core Improvements (V2.0)

**V1.0 当前问题 Current Issues:**
- 数据展示不够完整,缺少供应链全流程的时间节点
- 仅显示"到仓"环节,无法追溯上游的下单、出货、发货环节
- 预计值与实际值的对比逻辑不清晰
- 无法清晰看到"预计→实际"的数据取值优先级
- 缺少周转率等关键库存指标

**V2.0 改进目标 Improvement Goals:**
- **完整性 Completeness**: 展示供应链全流程(下单→出货→发货→到仓→销售)
- **双轨对比 Dual-Track Comparison**: 每个阶段都显示"预计 + 实际"双轨数据
- **取值逻辑透明 Value Selection Logic**: 明确显示系统使用哪个值(实际优先,预计兜底)
- **周次关联 Week Association**: 反推各阶段应该发生的周次(基于提前期参数)
- **周转率计算 Turnover Ratio**: 展示库存周转率,帮助评估库存健康度

### 1.3 供应链流程时间线 Supply Chain Timeline

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  下单    │→ │  出货    │→ │  发货    │→ │  到仓    │→ │  销售    │
│ Order   │   │ Factory  │   │  Ship   │   │ Arrive  │   │  Sell   │
│         │   │  Ship    │   │         │   │         │   │         │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
    ↓             ↓             ↓             ↓             ↓
PO表          Delivery表     Shipment表    Shipment表    Sales表
planned_      planned_       planned_      planned_      forecast_qty
order_date    delivery_date  departure_    arrival_date  / actual_qty
/actual_      /actual_       date/actual_  /actual_
order_date    delivery_date  departure_    arrival_date
                             date

提前期参数 Lead Time Parameters:
← 生产周期 8周 →← 装运 1周 →← 运输 4周 →← 安全库存 2周 →
```

---

## 2. 用户故事 User Stories

### US-1: 查看完整供应链时间线

**As a** 供应链计划员 Supply Chain Planner
**I want to** 看到某SKU在某一周的完整供应链流程时间线
**So that** 我可以理解库存来源和去向,验证计划是否合理

**验收标准 Acceptance Criteria:**
```gherkin
Given 选择了SKU "TEST-SKU-001"
And 该产品的安全库存周数为 2周
And 系统提前期参数: 生产8周, 装运1周, 运输4周
When 查看周次 "2025-W45" 的行数据
And 该周预计销量为 50台
Then 我能看到以下计算结果:
  | 列名           | 预期值      | 计算逻辑          |
  | 预计销量       | 50台        | sales_forecasts   |
  | 预计到仓周     | 2025-W47    | W45 + 2周         |
  | 预计到仓量     | 100台       | 50 × 2周          |
  | 预计发货周     | 2025-W43    | W47 - 4周         |
  | 预计出货周     | 2025-W42    | W43 - 1周         |
  | 预计下单周     | 2025-W34    | W42 - 8周         |
```

### US-2: 对比预计与实际数据

**As a** 业务分析师 Business Analyst
**I want to** 并排对比每个阶段的预计值和实际值
**So that** 我可以发现预测偏差和执行延迟

**验收标准 Acceptance Criteria:**
```gherkin
Given 某一周的行数据
When 查看各阶段列
Then 我能看到:
  - 预计销量 vs 实际销量
  - 预计到仓周/量 vs 实际到仓周/量
  - 预计发货周 vs 实际发货周
  - 预计出货周 vs 实际出货周
  - 预计下单周 vs 实际下单周
And 实际值存在时高亮显示(绿色背景)
And 实际值缺失时显示"-"(灰色)
And "取值"列根据数据源着色(绿=实际, 黄=预计)
```

### US-3: 理解库存计算逻辑

**As a** 库存经理 Inventory Manager
**I want to** 看到每周库存的详细计算步骤
**So that** 我可以验证期末库存数字的准确性

**验收标准 Acceptance Criteria:**
```gherkin
Given 某一周的行数据
When 查看库存相关列
Then 我能看到:
  - 期初库存 = 上周期末库存
  - 到仓取值 = COALESCE(实际到仓, 预计到仓)
  - 销量取值 = COALESCE(实际销量, 预计销量)
  - 期末库存 = 期初库存 + 到仓取值 - 销量取值
  - 周转率 = 期末库存 / 销量取值 (保留2位小数)
And 计算公式在UI Tooltip中可查看
```

### US-4: 识别库存风险

**As a** 运营经理 Operations Manager
**I want to** 快速识别哪些周存在库存风险
**So that** 我可以提前采取补货措施

**验收标准 Acceptance Criteria:**
```gherkin
Given 12周预测数据
When 查看表格
Then 期末库存列根据风险状态着色:
  - 红色底 + 白字: 期末库存 <= 0 (缺货 Stockout)
  - 橙色底 + 深橙字: 0 < 期末库存 < 安全库存 (风险 Risk)
  - 无特殊颜色: 期末库存 >= 安全库存 (正常 OK)
And 状态列显示徽章(Badge)
And 周转率 < 1 时显示警告图标
```

---

## 3. 数据来源与表结构 Data Sources & Schema

### 3.1 核心数据表

| 表名 Table | 用途 Purpose | 关键字段 Key Fields |
|-----------|-------------|-------------------|
| `sales_forecasts` | 销量预测 | `sku`, `week_iso`, `forecast_qty` |
| `sales_actuals` | 实际销量 | `sku`, `week_iso`, `actual_qty` |
| `purchase_orders` | 采购订单(下单) | `po_number`, `planned_order_date`, `actual_order_date` |
| `purchase_order_items` | 采购明细 | `po_id`, `sku`, `ordered_qty` |
| `production_deliveries` | 生产交付(出货) | `po_item_id`, `planned_delivery_date`, `actual_delivery_date`, `delivered_qty` |
| `shipments` | 发运单(发货+到仓) | `tracking_number`, `planned_departure_date`, `actual_departure_date`, `planned_arrival_date`, `actual_arrival_date` |
| `shipment_items` | 发运明细 | `shipment_id`, `sku`, `shipped_qty` |
| `inventory_snapshots` | 当前库存快照 | `sku`, `warehouse_id`, `qty_on_hand` |
| `products` | 产品主数据 | `sku`, `safety_stock_weeks` |

### 3.2 数据关联逻辑

**关联链路 Relationship Chain:**
```
purchase_orders (1) ←→ (N) purchase_order_items
purchase_order_items (1) ←→ (N) production_deliveries
production_deliveries (1) ←→ (1) shipments (可选关联)
shipments (1) ←→ (N) shipment_items
```

**关键业务规则 Key Business Rules:**
1. 一个PO可以有多个PO Item(不同SKU)
2. 一个PO Item可以分多次交付(production_deliveries)
3. 一次交付可以对应一个发运单(shipment)
4. 一个发运单可以包含多个SKU(shipment_items)
5. **销售数据独立**: 不直接关联采购/物流数据,仅通过 `sku` + `week_iso` 匹配

### 3.3 数据聚合粒度

**周级聚合 Weekly Aggregation:**
所有数据按 ISO周 聚合,通过 `week_iso` 字段匹配。对于有日期字段的表,使用 `get_week_from_date()` 函数转换。

**示例查询 Sample Query:**
```sql
-- 查询某SKU在某周的实际下单量
SELECT
  get_week_from_date(po.actual_order_date) AS order_week,
  SUM(poi.ordered_qty) AS actual_order_qty
FROM purchase_orders po
JOIN purchase_order_items poi ON po.id = poi.po_id
WHERE poi.sku = 'SKU123'
  AND get_week_from_date(po.actual_order_date) = '2025-W34'
GROUP BY order_week;

-- 查询某SKU在某周的实际到仓量
SELECT
  get_week_from_date(s.actual_arrival_date) AS arrival_week,
  SUM(si.shipped_qty) AS actual_arrival_qty
FROM shipments s
JOIN shipment_items si ON s.id = si.shipment_id
WHERE si.sku = 'SKU123'
  AND get_week_from_date(s.actual_arrival_date) = '2025-W47'
GROUP BY arrival_week;
```

---

## 4. 新表格列设计 New Table Column Design

### 4.1 列结构 (从左到右 21列)

| 列序号 | 列名(中文) | 列名(英文) | 数据类型 | 数据来源 | 计算逻辑 | 视觉提示 |
|-------|-----------|-----------|---------|---------|---------|---------|
| **基础信息 (2列)** |
| 1 | 周次 | Week ISO | `string` | 生成(当前周±N) | ISO格式: `2025-W45` | 固定列,当前周蓝色标记 |
| 2 | 周起始日 | Week Start Date | `date` | 计算 | 周一日期: `parseWeekString()` | 灰色字体 |
| **销售数据 (3列)** |
| 3 | 预计销量 | Forecast Sales | `number` | `sales_forecasts.forecast_qty` | SUM by week_iso + sku | 黄色背景 |
| 4 | 实际销量 | Actual Sales | `number \| null` | `sales_actuals.actual_qty` | SUM by week_iso + sku | 绿色背景(有值),灰色"-"(无值) |
| 5 | **销量取值** | **Effective Sales** | `number` | 计算 | `COALESCE(实际, 预计)` | **绿底=实际,黄底=预计** |
| **到仓数据 (5列)** |
| 6 | 预计到仓周 | Planned Arrival Week | `string` | 反推计算 | 当前周 + 安全库存周数 | 淡蓝色背景 |
| 7 | 预计到仓量 | Planned Arrival Qty | `number` | 反推计算 | 基于销量×安全库存周数 | 黄色背景 |
| 8 | 实际到仓周 | Actual Arrival Week | `string \| null` | `shipments.actual_arrival_date` | 转为week_iso | 绿色背景(有值) |
| 9 | 实际到仓量 | Actual Arrival Qty | `number` | `shipment_items.shipped_qty` | SUM where arrival week = current | 绿色背景(有值) |
| 10 | **到仓取值** | **Effective Arrival** | `number` | 计算 | `COALESCE(实际, 预计)` | **绿底=实际,黄底=预计** |
| **发货数据 (2列)** |
| 11 | 预计发货周 | Planned Ship Week | `string` | 反推计算 | 到仓周 - 运输周数 | 淡蓝色背景 |
| 12 | 实际发货周 | Actual Ship Week | `string \| null` | `shipments.actual_departure_date` | 转为week_iso | 绿色背景(有值) |
| **出货数据 (2列)** |
| 13 | 预计出货周 | Planned Factory Ship Week | `string` | 反推计算 | 发货周 - 装运准备周数 | 淡蓝色背景 |
| 14 | 实际出货周 | Actual Factory Ship Week | `string \| null` | `production_deliveries.actual_delivery_date` | 转为week_iso | 绿色背景(有值) |
| **下单数据 (2列)** |
| 15 | 预计下单周 | Planned Order Week | `string` | 反推计算 | 出货周 - 生产周期 | 淡蓝色背景 |
| 16 | 实际下单周 | Actual Order Week | `string \| null` | `purchase_orders.actual_order_date` | 转为week_iso | 绿色背景(有值) |
| **库存计算 (5列)** |
| 17 | **期初库存** | **Opening Stock** | `number` | 滚动计算 | 上周期末库存(第一周=快照值) | 白色背景 |
| 18 | **期末库存** | **Closing Stock** | `number` | 计算 | 期初 + 到仓取值 - 销量取值 | **红底=缺货,橙底=风险,白底=正常** |
| 19 | 安全库存 | Safety Threshold | `number` | 计算 | 平均周销 × 安全库存周数 | 灰色字体 |
| 20 | **周转率** | **Turnover Ratio** | `number` | 计算 | 期末库存 / 销量取值 | 2位小数 |
| 21 | 库存状态 | Stock Status | `Badge` | 判断 | 基于期末库存 vs 安全库存 | 徽章:红色"缺货"/橙色"风险"/绿色"正常" |

### 4.2 列分组 (视觉分隔)

为提高可读性,表格应使用**竖线分隔**将列分组:

```
┃ 基础信息 ┃ 销售数据 ┃ 到仓数据 ┃ 发货数据 ┃ 出货数据 ┃ 下单数据 ┃ 库存计算 ┃
┃ Week Info ┃ Sales    ┃ Arrival  ┃ Ship     ┃ Factory  ┃ Order    ┃ Stock    ┃
│  2列      │  3列     │  5列     │  2列     │  2列     │  2列     │  5列     │
```

### 4.3 简化版 (MVP阶段可选)

如果21列过多,可以先实现14列简化版:

```
保留列: 1-5 (基础+销售), 8-10 (实际到仓+取值), 17-21 (库存计算)
隐藏列: 6-7 (预计到仓周), 11-16 (发货/出货/下单反推)
后续Phase 2再添加完整供应链时间线
```

---

## 5. 关键计算逻辑 Calculation Logic

### 5.1 反推周次算法 (核心新增功能)

**业务背景 Business Context:**
用户希望看到"如果W45周销售50台,那么应该在哪一周到仓?哪一周发货?哪一周下单?"

**计算步骤 Calculation Steps:**

**1. 输入参数 Input Parameters:**
```typescript
const params = {
  current_week: '2025-W45',
  forecast_sales: 50,
  safety_stock_weeks: 2,    // 来自 products.safety_stock_weeks
  transit_weeks: 4,         // 常量: 运输周数 (发货→到仓)
  loading_weeks: 1,         // 常量: 装运准备周数 (出货→发货)
  production_weeks: 8,      // 常量: 生产周期 (下单→出货)
}
```

**2. 反推流程 Backward Calculation:**
```typescript
// 步骤1: 计算预计到仓周
planned_arrival_week = addWeeksToWeekString(current_week, safety_stock_weeks)
// 例如: 2025-W45 + 2 = 2025-W47

// 步骤2: 计算预计到仓量
planned_arrival_qty = forecast_sales * safety_stock_weeks
// 例如: 50 × 2 = 100台

// 步骤3: 计算预计发货周
planned_ship_week = addWeeksToWeekString(planned_arrival_week, -transit_weeks)
// 例如: 2025-W47 - 4 = 2025-W43

// 步骤4: 计算预计出货周 (工厂交付)
planned_factory_ship_week = addWeeksToWeekString(planned_ship_week, -loading_weeks)
// 例如: 2025-W43 - 1 = 2025-W42

// 步骤5: 计算预计下单周
planned_order_week = addWeeksToWeekString(planned_factory_ship_week, -production_weeks)
// 例如: 2025-W42 - 8 = 2025-W34
```

**3. 周次加减工具函数 Week Arithmetic Utility:**
```typescript
// 已有工具 (在 lib/utils/date.ts)
addWeeksToWeekString(weekIso: string, offset: number): string
// 例如: addWeeksToWeekString('2025-W45', -8) => '2025-W37'

// 新增工具 (需要实现)
getWeekFromDate(date: Date | string): string
// 例如: getWeekFromDate('2025-11-17') => '2025-W47'
```

### 5.2 实际值匹配逻辑

**问题 Challenge:**
如何将数据库中的"某个PO"、"某个Shipment"与"某一周"关联起来?

**解决方案 Solution:**
通过 `sku` + `week_iso` 匹配,而不是精确的订单编号匹配。

**示例查询 Sample Queries:**
```sql
-- 查询某SKU在某周的实际下单量
SELECT
  get_week_from_date(po.actual_order_date) AS order_week,
  SUM(poi.ordered_qty) AS actual_order_qty,
  COUNT(DISTINCT po.id) AS order_count
FROM purchase_orders po
JOIN purchase_order_items poi ON po.id = poi.po_id
WHERE poi.sku = 'SKU123'
  AND get_week_from_date(po.actual_order_date) = '2025-W34'
GROUP BY order_week;

-- 查询某SKU在某周的实际出货量
SELECT
  get_week_from_date(pd.actual_delivery_date) AS delivery_week,
  SUM(pd.delivered_qty) AS actual_delivery_qty,
  COUNT(DISTINCT pd.id) AS delivery_count
FROM production_deliveries pd
JOIN purchase_order_items poi ON pd.po_item_id = poi.id
WHERE poi.sku = 'SKU123'
  AND get_week_from_date(pd.actual_delivery_date) = '2025-W42'
GROUP BY delivery_week;

-- 查询某SKU在某周的实际发货周
SELECT DISTINCT
  get_week_from_date(s.actual_departure_date) AS ship_week
FROM shipments s
JOIN shipment_items si ON s.id = si.shipment_id
WHERE si.sku = 'SKU123'
  AND get_week_from_date(s.actual_departure_date) = '2025-W43'
LIMIT 1; -- 只需要周次,不需要数量

-- 查询某SKU在某周的实际到仓量
SELECT
  get_week_from_date(s.actual_arrival_date) AS arrival_week,
  SUM(si.shipped_qty) AS actual_arrival_qty,
  COUNT(DISTINCT s.id) AS shipment_count
FROM shipments s
JOIN shipment_items si ON s.id = si.shipment_id
WHERE si.sku = 'SKU123'
  AND get_week_from_date(s.actual_arrival_date) = '2025-W47'
GROUP BY arrival_week;
```

**取值优先级 Value Priority:**
```typescript
// 销量取值
effective_sales = sales_actual ?? sales_forecast
sales_source = sales_actual !== null ? 'actual' : 'forecast'

// 到仓取值
effective_arrival = actual_arrival_qty > 0 ? actual_arrival_qty : planned_arrival_qty
arrival_source = actual_arrival_qty > 0 ? 'actual' : 'planned'
```

### 5.3 库存滚动计算

**逻辑 Logic:**
```typescript
let running_stock = initial_stock // 从 inventory_snapshots 获取

weeks.forEach((week, index) => {
  // 期初库存
  opening_stock = running_stock

  // 本周到仓
  incoming_qty = effective_arrival // COALESCE(actual, planned)

  // 本周销售
  outgoing_qty = effective_sales // COALESCE(actual, forecast)

  // 期末库存
  closing_stock = opening_stock + incoming_qty - outgoing_qty

  // 更新滚动值 (用于下一周)
  running_stock = closing_stock

  // 周转率
  turnover_ratio = outgoing_qty > 0 ? closing_stock / outgoing_qty : null

  // 安全库存阈值
  safety_threshold = avg_weekly_sales * safety_stock_weeks

  // 库存状态
  if (closing_stock <= 0) {
    stock_status = 'Stockout'
  } else if (closing_stock < safety_threshold) {
    stock_status = 'Risk'
  } else {
    stock_status = 'OK'
  }
})
```

### 5.4 提前期参数配置

**当前阶段 Current Phase:**
在需求阶段,我们定义**硬编码常量**作为初始实现:

```typescript
// lib/constants/supply-chain-params.ts
export const SUPPLY_CHAIN_LEAD_TIMES = {
  PRODUCTION_WEEKS: 8,        // 下单 → 出货
  LOADING_PREP_WEEKS: 1,      // 出货 → 发货
  TRANSIT_WEEKS: 4,           // 发货 → 到仓
  SAFETY_BUFFER_WEEKS: 2,     // 默认安全库存周数 (可被产品主数据覆盖)
} as const
```

**未来扩展 Future Enhancement:**
- [ ] 在设置页面添加"供应链参数配置"模块
- [ ] 支持按产品类别/供应商设置不同提前期
- [ ] 支持按季节调整 (如旺季延长提前期)

---

## 6. 数据窗口与查询范围 Data Window & Query Scope

### 6.1 时间窗口

**当前实现 Current (V1.0):**
- 16周窗口: 当前周 - 4周 (历史) + 当前周 + 11周 (未来)

**V2.0 保持一致 New Design Keeps Same:**
- 16周窗口不变
- 历史4周用于验证过去的预测准确性
- 未来12周用于库存风险预警

### 6.2 数据聚合粒度

**周级聚合 Weekly Aggregation:**
所有数据按 ISO周 聚合,通过 `week_iso` 字段或 `get_week_from_date()` 函数匹配。

---

## 7. 验收标准 (Gherkin格式) Acceptance Criteria

### Scenario 1: 查看完整供应链时间线

```gherkin
Feature: 算法验证页面 - 供应链时间线展示

Scenario: 查看某SKU某周的完整供应链反推
  Given 我选择了SKU "TEST-SKU-001"
  And 该产品的安全库存周数为 2
  And 系统提前期参数: 生产8周, 装运1周, 运输4周
  When 我查看周次 "2025-W45" 的行数据
  And 该周预计销量为 50台
  Then 我应该看到以下计算结果:
    | 列名         | 预期值          | 计算逻辑                |
    | 预计销量     | 50台           | sales_forecasts         |
    | 预计到仓周   | 2025-W47       | W45 + 2周              |
    | 预计到仓量   | 100台          | 50 × 2周               |
    | 预计发货周   | 2025-W43       | W47 - 4周              |
    | 预计出货周   | 2025-W42       | W43 - 1周              |
    | 预计下单周   | 2025-W34       | W42 - 8周              |
```

### Scenario 2: 对比预计与实际数据

```gherkin
Scenario: 显示实际数据覆盖预计数据
  Given SKU "TEST-SKU-001" 在 "2025-W45"
  And 预计销量为 50台
  And 实际销量为 48台
  And 预计到仓100台
  And 实际到仓105台
  When 我查看表格
  Then "实际销量" 列应该显示 48, 背景为绿色
  And "销量取值" 列应该显示 48, 背景为绿色
  And "实际到仓量" 列应该显示 105, 背景为绿色
  And "到仓取值" 列应该显示 105, 背景为绿色
  And "到仓取值" 列的Tooltip显示: "使用实际到仓数据"
```

### Scenario 3: 库存滚动计算

```gherkin
Scenario: 验证期末库存计算准确性
  Given SKU "TEST-SKU-001" 的期初库存为 200台
  And 本周到仓取值为 100台
  And 本周销量取值为 50台
  When 系统计算期末库存
  Then 期末库存应该为 250台 (200 + 100 - 50)
  And 周转率应该为 5.00 (250 / 50)
  And Tooltip显示: "期末库存 = 200 + 100 - 50 = 250"
```

### Scenario 4: 库存状态判断

```gherkin
Scenario: 根据安全库存判断库存状态
  Given 平均周销为 50台
  And 安全库存周数为 2周
  And 安全库存阈值为 100台 (50 × 2)
  When 期末库存为 80台
  Then 库存状态应该为 "Risk" (风险)
  And 期末库存单元格背景应该为橙色
  And 状态列应该显示橙色徽章 "风险"

  When 期末库存为 0台
  Then 库存状态应该为 "Stockout" (缺货)
  And 期末库存单元格背景应该为红色, 文字为白色

  When 期末库存为 120台
  Then 库存状态应该为 "OK" (正常)
  And 期末库存单元格无特殊背景色
```

### Scenario 5: 处理缺失数据

```gherkin
Scenario: 实际数据缺失时使用预计数据
  Given SKU "TEST-SKU-001" 在 "2025-W50" (未来周)
  And 预计销量为 60台
  And 实际销量为 NULL (未发生)
  When 我查看表格
  Then "实际销量" 列应该显示 "-", 背景为灰色
  And "销量取值" 列应该显示 60, 背景为黄色
  And Tooltip显示: "使用预计销量 (实际数据未录入)"
```

---

## 8. 非功能性需求 Non-Functional Requirements

### 8.1 性能要求 Performance

| 指标 Metric | 目标 Target | 测量方法 Measurement |
|------------|------------|---------------------|
| 首次加载时间 | < 2秒 | Time to Interactive (TTI) |
| SKU切换响应 | < 1秒 | 选择到渲染完成 |
| 表格滚动流畅度 | 60 FPS | Chrome DevTools Performance |
| 数据库查询时间 | < 500ms | Server-side logging |

**优化策略 Optimization Strategies:**
- 使用并行查询 (Promise.all) 获取多表数据
- 前端缓存已加载的SKU数据 (React Query, TTL=5分钟)
- 数据库索引优化 (`sku`, `week_iso`, `actual_arrival_date`)

### 8.2 可用性要求 Usability

**横向滚动 Horizontal Scroll:**
- 固定周次列 (sticky left column)
- 固定表头 (sticky header row)

**色盲友好 Color Blind Friendly:**
- 不仅依赖颜色,还使用图标/文字标识
- 实际值: 绿色 + "✓" 图标
- 预计值: 黄色 + "~" 图标

**移动端支持 Mobile Support:**
- 响应式设计,小屏幕下隐藏部分中间列
- 提供"详情模态框"查看完整数据

### 8.3 数据完整性 Data Integrity

**缺失值处理 Missing Values:**
- 实际值为NULL时,显示"-",不使用0
- 预计值缺失时,使用0作为兜底

**异常值警告 Anomaly Warning:**
- 实际销量 > 预计销量 × 2: 显示⚠️警告图标
- 实际到仓 < 预计到仓 × 0.5: 显示⚠️警告图标
- 周转率 < 1: 显示警告 "库存不足1周销量"

---

## 9. UI/UX设计指导原则 UI/UX Design Guidelines

### 9.1 视觉层次 Visual Hierarchy

**优先级1 (最重要) - 粗体高亮:**
- 销量取值 Effective Sales
- 到仓取值 Effective Arrival
- 期末库存 Closing Stock
- 周转率 Turnover Ratio

**优先级2 (次要) - 常规字体:**
- 预计值列 (黄色背景)
- 实际值列 (绿色背景)

**优先级3 (辅助) - 灰色小字:**
- 周起始日
- 安全库存阈值
- 反推周次 (淡蓝色背景)

### 9.2 颜色编码 Color Coding

**数据类型着色 Data Type Colors:**
```css
/* 实际值 (已发生) */
--color-actual: #dcfce7; /* green-100 */
--color-actual-border: #86efac; /* green-300 */

/* 预计值 (计划/预测) */
--color-forecast: #fef9c3; /* yellow-100 */
--color-forecast-border: #fde047; /* yellow-300 */

/* 计算值 (取值结果) */
--color-effective-actual: #bbf7d0; /* green-200 */
--color-effective-forecast: #fef08a; /* yellow-200 */

/* 反推值 (推算周次) */
--color-backtrack: #e0f2fe; /* sky-100 */
--color-backtrack-border: #bae6fd; /* sky-200 */
```

**风险状态着色 Risk Status Colors:**
```css
/* 缺货 Stockout */
--color-stockout-bg: #dc2626; /* red-600 */
--color-stockout-text: #ffffff;

/* 风险 Risk */
--color-risk-bg: #fed7aa; /* orange-200 */
--color-risk-text: #c2410c; /* orange-800 */

/* 正常 OK */
--color-ok-bg: #ffffff;
--color-ok-text: #000000;
```

### 9.3 表格布局 Table Layout

**固定列 Fixed Columns:**
- 周次 (Week ISO) - 左侧固定
- 库存状态 (Stock Status) - 右侧固定 (可选)

**列宽分配 Column Width:**
```typescript
const COLUMN_WIDTHS = {
  week_iso: '100px',          // 固定宽度
  week_start_date: '120px',
  forecast_sales: '100px',
  actual_sales: '100px',
  effective_sales: '120px',   // 稍宽 (重要)
  // ... 其他列类似
  closing_stock: '140px',     // 最宽 (最重要)
  turnover_ratio: '100px',
  stock_status: '100px',
}
```

---

## 10. 数据查询接口设计 Query Interface Design

### 10.1 主查询函数签名

```typescript
/**
 * 获取算法验证数据 (V2.0)
 * @param sku - 产品SKU
 * @returns 16周完整供应链数据
 */
export async function fetchAlgorithmAuditV2(
  sku: string
): Promise<AlgorithmAuditResultV2>

interface AlgorithmAuditResultV2 {
  product: Product | null
  rows: AlgorithmAuditRowV2[]
  metadata: {
    current_week: string
    start_week: string
    end_week: string
    total_weeks: number
    avg_weekly_sales: number
    safety_stock_weeks: number
    // 新增: 提前期参数
    lead_times: {
      production_weeks: number
      loading_weeks: number
      transit_weeks: number
    }
  }
}
```

### 10.2 行数据结构 (扩展版)

```typescript
interface AlgorithmAuditRowV2 {
  // 基础信息
  week_iso: string
  week_start_date: string
  week_offset: number
  is_past: boolean
  is_current: boolean

  // ===== 销售数据 =====
  sales_forecast: number
  sales_actual: number | null
  sales_effective: number
  sales_source: 'actual' | 'forecast'

  // ===== 到仓数据 =====
  // 预计 (反推)
  planned_arrival_week: string      // 新增
  planned_arrival_qty: number       // 新增

  // 实际 (数据库)
  actual_arrival_week: string | null  // 新增
  actual_arrival_qty: number          // 新增

  // 取值
  arrival_effective: number         // 新增
  arrival_source: 'actual' | 'planned'  // 新增

  // ===== 发货数据 =====
  planned_ship_week: string         // 新增
  actual_ship_week: string | null   // 新增

  // ===== 出货数据 =====
  planned_factory_ship_week: string     // 新增
  actual_factory_ship_week: string | null  // 新增

  // ===== 下单数据 =====
  planned_order_week: string        // 新增
  actual_order_week: string | null  // 新增
  actual_order_qty: number          // 新增

  // ===== 库存计算 =====
  opening_stock: number
  closing_stock: number
  safety_threshold: number
  turnover_ratio: number | null     // 新增
  stock_status: StockStatus

  // 明细列表 (可展开)
  shipment_details: ShipmentDetail[]
  order_details: OrderDetail[]      // 新增
  delivery_details: DeliveryDetail[] // 新增
}
```

### 10.3 辅助工具函数

**周次转换 Week Conversion:**
```typescript
/**
 * 将日期转换为周次
 */
function getWeekFromDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = getISOWeekYear(d)
  const week = getISOWeek(d)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * 周次加减 (支持跨年)
 */
function addWeeksToWeekString(weekIso: string, offset: number): string {
  // 已实现于 lib/utils/date.ts
}
```

**反推计算 Backward Calculation:**
```typescript
/**
 * 反推供应链各阶段周次
 */
function backtrackSupplyChainWeeks(params: {
  current_week: string
  safety_stock_weeks: number
  transit_weeks: number
  loading_weeks: number
  production_weeks: number
}): {
  planned_arrival_week: string
  planned_ship_week: string
  planned_factory_ship_week: string
  planned_order_week: string
} {
  const { current_week, safety_stock_weeks, transit_weeks, loading_weeks, production_weeks } = params

  const planned_arrival_week = addWeeksToWeekString(current_week, safety_stock_weeks)
  const planned_ship_week = addWeeksToWeekString(planned_arrival_week, -transit_weeks)
  const planned_factory_ship_week = addWeeksToWeekString(planned_ship_week, -loading_weeks)
  const planned_order_week = addWeeksToWeekString(planned_factory_ship_week, -production_weeks)

  return {
    planned_arrival_week,
    planned_ship_week,
    planned_factory_ship_week,
    planned_order_week,
  }
}
```

---

## 11. 边界情况处理 Edge Case Handling

### 11.1 跨年周次

**问题 Problem:**
`2025-W52` + 2周 = `2026-W02` (跨年)

**解决方案 Solution:**
使用 `date-fns` 的 ISO Week 函数,自动处理跨年:
```typescript
import { addWeeks, getISOWeek, getISOWeekYear } from 'date-fns'

// 已验证可跨年
addWeeksToWeekString('2025-W52', 2) // => '2026-W02'
```

### 11.2 部分交付 (Split Deliveries)

**场景 Scenario:**
一个PO下单100台,分2次交付 (60台 + 40台),分别在不同周到仓。

**处理方式 Handling:**
- 按**实际到仓周**聚合数量
- 不关心中间的分批逻辑
- 在"到仓取值"列汇总该周所有到仓

### 11.3 无预测数据的未来周

**场景 Scenario:**
`sales_forecasts` 表只有未来4周数据,但我们需要展示12周。

**处理方式 Handling:**
- 缺失周的 `forecast_qty` 默认为 0
- UI提示: "该周暂无预测数据"
- 不影响库存滚动计算 (0销量 = 库存不变)

### 11.4 历史周的预计值已失效

**场景 Scenario:**
当前周是W45,查看W41 (过去4周) 的"预计到仓周"已经没有意义。

**处理方式 Handling:**
- 历史周仍显示"预计值"列,但**灰色淡化**
- 重点高亮"实际值"列
- Tooltip提示: "此为历史预测值,请参考实际值"

---

## 12. 里程碑与优先级 Milestones & Priorities

### Phase 1: MVP (P0 - 必须有)

**目标: 保持V1.0功能,添加关键改进**
- ✅ 基础16周表格
- ✅ 销售双轨数据 (预计/实际/取值)
- ✅ 到仓双轨数据 (预计/实际/取值)
- ✅ 库存滚动计算 (期初/期末/周转率)
- ✅ 库存状态判断 (缺货/风险/正常)
- ✅ SKU选择器
- 🆕 周转率计算与显示
- 🆕 预计到仓周/量反推计算

### Phase 2: 供应链反推 (P1 - 应该有)

**目标: 完整供应链时间线展示**
- 🔲 反推周次计算 (到仓/发货/出货/下单)
- 🔲 实际周次匹配 (从PO/Delivery/Shipment提取)
- 🔲 周次对比 (预计 vs 实际)
- 🔲 延迟警告标识 (实际周次 > 预计周次)

### Phase 3: 增强体验 (P2 - 可以有)

- 🔲 明细可展开 (点击到仓数量→显示发运单列表)
- 🔲 异常值警告 (实际与预计偏差>50%)
- 🔲 导出Excel功能
- 🔲 响应式移动端布局

### Phase 4: 高级功能 (P3 - 未来)

- 🔲 提前期参数可配置 (在设置页面)
- 🔲 多SKU对比模式 (并排显示2个SKU)
- 🔲 历史准确率分析 (预测偏差趋势图)
- 🔲 实时数据刷新 (WebSocket)

---

## 13. 依赖与风险 Dependencies & Risks

### 13.1 技术依赖

| 依赖项 | 当前版本 | 用途 | 风险 |
|-------|---------|------|------|
| `date-fns` | ^2.30.0 | 周次计算 | 低 (已验证) |
| `Supabase` | Latest | 数据查询 | 低 |
| `ShadCN Table` | Latest | 表格组件 | 低 |
| `Recharts` | Latest | 图表 (未来阶段) | 中 |

### 13.2 数据质量风险

**风险1: 历史数据不完整**
- **描述 Description:** `purchase_orders.actual_order_date` 可能为空
- **影响 Impact:** 无法展示"实际下单周"
- **缓解措施 Mitigation:** 显示"-",不影响核心功能

**风险2: 发运单与PO关联缺失**
- **描述 Description:** `shipments.production_delivery_id` 可能为NULL
- **影响 Impact:** 无法追溯发运单对应的PO
- **缓解措施 Mitigation:** 通过 `sku` + `week_iso` 聚合匹配

**风险3: 跨周分批到仓**
- **描述 Description:** 一个PO的货分多周到仓
- **影响 Impact:** 预计到仓周与实际不匹配
- **缓解措施 Mitigation:** 按周聚合,不强制一对一匹配

### 13.3 性能风险

**风险: 16周 × 多表JOIN查询过慢**
- **缓解措施 Mitigation:**
  - 使用并行查询 (Promise.all)
  - 添加数据库索引 (`sku`, `week_iso`)
  - 前端缓存 (React Query TTL=5分钟)

---

## 14. 成功指标 Success Metrics

### 14.1 功能完整性

- [ ] 所有21列数据正确展示
- [ ] 反推周次计算准确率 = 100%
- [ ] 实际值匹配准确率 ≥ 95%
- [ ] 库存计算误差 = 0

### 14.2 用户体验

- [ ] 首次加载时间 < 2秒
- [ ] SKU切换响应 < 1秒
- [ ] 无横向滚动卡顿 (60 FPS)
- [ ] 色盲用户可正常使用 (WCAG AA标准)

### 14.3 业务价值

- [ ] 用户能在5分钟内理解算法逻辑
- [ ] 库存风险识别率 ≥ 90%
- [ ] 预测偏差分析效率提升 50%

---

## 15. 文档与培训 Documentation & Training

### 15.1 用户手册

**必须包含 Must Include:**
- [ ] 页面功能说明 (中英文)
- [ ] 列名含义解释
- [ ] 颜色编码图例
- [ ] 常见问题FAQ

### 15.2 开发文档

**必须包含 Must Include:**
- [ ] 数据库Schema说明
- [ ] 查询逻辑流程图
- [ ] 反推算法伪代码
- [ ] 测试用例清单

---

## 附录 Appendix

### A. 术语表 Glossary

| 中文 | 英文 | 定义 |
|-----|------|------|
| 周次 | Week ISO | ISO 8601格式: YYYY-Www (如2025-W45) |
| 双轨数据 | Dual-Track Data | 预计值 + 实际值并存的数据模式 |
| 取值 | Effective Value | COALESCE(实际, 预计) 的结果 |
| 反推 | Backtrack | 从目标日期逆推各阶段应该发生的时间 |
| 提前期 | Lead Time | 从下单到到仓的总时间 (周数) |
| 安全库存 | Safety Stock | 用于应对需求波动的缓冲库存 |
| 周转率 | Turnover Ratio | 库存/销量,表示库存可支撑的周数 |

### B. 参考资料 References

- **现有代码 Existing Code:**
  - `/Users/tony/Desktop/rolloy-scm/src/lib/queries/algorithm-audit.ts`
  - `/Users/tony/Desktop/rolloy-scm/src/components/inventory/algorithm-audit-table.tsx`

- **相关文档 Related Docs:**
  - `CLAUDE.md` - 项目技术栈说明
  - `lib/types/database.ts` - 数据库类型定义

- **外部参考 External References:**
  - ISO 8601 Week Date: https://en.wikipedia.org/wiki/ISO_week_date
  - date-fns Documentation: https://date-fns.org/

---

**文档结束 End of Document**

---

**审批签字 Approval Signatures:**

| 角色 Role | 姓名 Name | 日期 Date | 签名 Signature |
|----------|---------|----------|---------------|
| Product Director | | 2025-12-03 | ✓ |
| System Architect | | Pending | - |
| Frontend Artisan | | Pending | - |
| Backend Specialist | | Pending | - |

**下一步 Next Steps:**
1. System Architect 评审技术可行性
2. 生成 `specs/algorithm-audit/design.md` 技术设计文档
3. Frontend Artisan 实现UI组件
4. Backend Specialist 实现数据查询逻辑
5. QA Director 执行测试验收
