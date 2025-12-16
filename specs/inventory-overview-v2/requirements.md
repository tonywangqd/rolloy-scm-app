# 库存总览V2 - 时序可视化重构 (Inventory Overview V2 - Time Series Visualization)

**Product Director Output**
**Version:** 2.0
**Date:** 2025-12-16
**Status:** Spec Ready

---

## 1. Context & Goals

### 1.1 Business Context

当前库存总览页面 (`/inventory/page.tsx`) 采用传统的"卡片+表格"布局,仅展示静态库存快照数据。用户反馈需要一个**时序可视化视图**,用于:

1. **趋势分析**: 查看单个SKU在未来12周的库存变化曲线
2. **断货预警**: 直观识别何时会发生断货(closing_stock < 0)
3. **补货决策**: 基于安全库存天数、采购时效、头程时效做出补货判断
4. **渠道聚合**: 按渠道维度查看库存(亚马逊汇总=所有FBA仓,海外仓汇总=所有3PL仓)

**用户提供的目标样式:**
- 分周显示的条形图 (Weekly Bar Chart)
- 顶部SKU+渠道选择器 (Filters)
- 库存升降来源标注 (Incoming/Outgoing Annotations)
- 未来库存预测曲线 (Projection Line)
- 断货时间点标记 (Stockout Alert)
- 颜色区间: 采购时效、头程时效、安全天数 (Color Zones)

### 1.2 Business Goals

- **Goal 1 (Primary)**: 重构库存总览页面为时序可视化视图,支持单SKU+渠道维度的12周库存投影
- **Goal 2 (UX)**: 提供直观的图形界面,降低运营人员理解库存状态的认知负担
- **Goal 3 (Strategic)**: 复用现有 `v_inventory_projection_12weeks` 视图,无需新增数据库表

### 1.3 Business Value

- **提升决策效率**: 从"看表格计算"变为"看图表秒懂"
- **降低断货风险**: 提前12周预警,留足补货时间
- **优化资金占用**: 基于预测曲线,避免过度采购

---

## 2. Problem Space Analysis

### 2.1 Current State (As-Is)

**现有页面结构 (`/inventory/page.tsx`):**

```
库存管理页面
├── 统计卡片 (5个)
│   ├── 总库存 (total_stock)
│   ├── FBA库存 (total_fba)
│   ├── 3PL库存 (total_3pl)
│   ├── SKU数 (sku_count)
│   └── 在途数量 (incoming_qty)
├── 在途货物表格 (IncomingShipmentsTable)
├── 按SKU汇总表格 (SkuSummaryTable)
└── 按仓库明细表格 (InventoryByWarehouse)
```

**问题诊断:**
1. **时间维度缺失**: 只显示当前库存快照,无法看到未来趋势
2. **断货预警不直观**: 需要人工对比表格数据才能发现风险
3. **渠道聚合缺失**: FBA仓分散在多个记录中,无法快速汇总
4. **无可视化图表**: 纯表格展示,信息密度高但难以理解

### 2.2 Desired State (To-Be)

**新页面结构 (V2):**

```
库存总览V2页面 (/inventory/overview-v2)
├── 顶部筛选器 (Filters)
│   ├── SKU选择器 (Dropdown: 所有SKU列表)
│   └── 渠道选择器 (Radio: 全部/亚马逊FBA/海外仓/单独仓库)
├── 12周库存投影图表 (Projection Chart)
│   ├── X轴: ISO Week (2025-W50, 2025-W51, ...)
│   ├── Y轴: 库存数量 (Closing Stock)
│   ├── 柱状图: 每周期末库存 (Bar Chart)
│   ├── 折线图: 库存趋势 (Line Overlay)
│   ├── 颜色区间:
│   │   ├── 红色区 (< 0): 断货
│   │   ├── 黄色区 (0 ~ safety_stock): 风险
│   │   └── 绿色区 (> safety_stock): 安全
│   ├── 标注点:
│   │   ├── 预计到货 (incoming_qty > 0): 绿色向上箭头
│   │   └── 实际到货 (actual arrival): 蓝色星标
│   └── 断货警告线: 水平虚线 Y=0
└── 明细数据表 (Detail Table - 可折叠)
    ├── Week ISO
    ├── Opening Stock
    ├── Incoming (到货)
    ├── Sales (销售)
    ├── Closing Stock
    └── Status (OK/Risk/Stockout)
```

---

## 3. User Stories

### 3.1 Primary User Stories

#### US-01: 查看单SKU库存投影 (View SKU Projection)

**As a** 运营经理 (Operations Manager)
**I want to** 查看单个SKU在未来12周的库存变化趋势图
**So that** 我可以快速判断是否需要补货

**Acceptance Criteria (Given/When/Then):**

```gherkin
Given 我在 /inventory/overview-v2 页面
  And 系统中存在SKU "ABC-001" 的12周投影数据
When 我从SKU选择器中选择 "ABC-001"
  And 我选择渠道 "全部"
Then 系统显示12周库存投影图表:
  | Week | Opening Stock | Incoming | Sales | Closing Stock | Status |
  | 2025-W50 | 100 | 50 | 30 | 120 | OK |
  | 2025-W51 | 120 | 0 | 35 | 85 | OK |
  | 2025-W52 | 85 | 0 | 40 | 45 | Risk |
  | 2026-W01 | 45 | 0 | 50 | -5 | Stockout |
  | ... | ... | ... | ... | ... | ... |

And 图表以柱状图显示 Closing Stock
And 第4周 (2026-W01) 的柱子为红色 (closing_stock = -5 < 0)
And 第3周 (2025-W52) 的柱子为黄色 (closing_stock = 45 < safety_stock)
And 图表上方显示警告: "预计在 2026-W01 发生断货,请立即补货"
```

#### US-02: 按渠道聚合库存 (Channel Aggregation)

**As a** 采购经理 (Procurement Manager)
**I want to** 按渠道维度查看库存投影 (亚马逊FBA / 海外仓)
**So that** 我可以分别管理不同渠道的补货策略

**Acceptance Criteria:**

```gherkin
Given SKU "ABC-001" 在多个仓库有库存:
  | Warehouse | Type | Qty |
  | US-FBA-West | FBA | 50 |
  | US-FBA-East | FBA | 30 |
  | US-3PL-NJ | 3PL | 20 |

When 我选择渠道 "亚马逊FBA"
Then 系统聚合所有FBA仓库的投影数据:
  - Opening Stock = 50 + 30 = 80 (FBA仓库汇总)
  - Incoming = 所有FBA仓库的incoming_qty汇总
  - Sales = 所有FBA渠道的sales汇总
  - Closing Stock = 基于聚合数据计算

And 图表标题显示 "ABC-001 - 亚马逊FBA渠道"
And 不显示 "US-3PL-NJ" 的数据

When 我选择渠道 "海外仓"
Then 系统只聚合所有3PL仓库的数据
And 不显示FBA仓库数据
```

#### US-03: 识别断货时间点 (Identify Stockout Week)

**As a** 仓库经理 (Warehouse Manager)
**I want to** 系统自动标注断货时间点
**So that** 我可以提前预留安全库存

**Acceptance Criteria:**

```gherkin
Given SKU "DEF-002" 的12周投影中:
  - 2025-W50: closing_stock = 120 (OK)
  - 2025-W51: closing_stock = 80 (OK)
  - 2025-W52: closing_stock = 30 (Risk, < safety_stock = 50)
  - 2026-W01: closing_stock = -10 (Stockout)

When 我查看该SKU的投影图表
Then 系统在 2026-W01 的柱子上标记红色
And 柱子上方显示图标: "⚠️ 断货"
And 页面顶部显示警告卡片:
  "警告: DEF-002 预计在 2026-W01 (1月1日) 断货,
   剩余 X 天,建议立即下单采购至少 Y 件"
```

#### US-04: 显示库存变化来源 (Show Incoming/Outgoing Sources)

**As a** 数据分析师 (Data Analyst)
**I want to** 在图表上标注库存变化的来源 (到货/销售)
**So that** 我可以理解库存升降的原因

**Acceptance Criteria:**

```gherkin
Given 2025-W51 周有以下数据:
  - incoming_qty = 100 (预计到货)
  - actual_incoming_qty = 95 (实际到货)
  - effective_sales = 50 (销售)

When 我查看该周的柱状图
Then 柱子上方显示绿色向上箭头 "↑ +95" (实际到货)
And 柱子下方显示红色向下箭头 "↓ -50" (销售)
And 鼠标悬停时显示Tooltip:
  """
  2025-W51 库存变化:
  - 期初库存: 120
  - 预计到货: +100 (实际: +95)
  - 销售出库: -50
  - 期末库存: 165
  """
```

#### US-05: 显示时效区间 (Show Lead Time Zones)

**As a** 供应链经理 (Supply Chain Manager)
**I want to** 在图表上显示采购时效、头程时效、安全天数的颜色区间
**So that** 我可以判断何时必须下单

**Acceptance Criteria:**

```gherkin
Given 系统配置:
  - 采购时效 (procurement_lead_time): 8周
  - 头程时效 (logistics_lead_time): 4周
  - 安全库存天数 (safety_stock_weeks): 2周

When 我查看库存投影图表
Then 图表背景显示3个颜色区间:
  | 区间名称 | 周次范围 | 背景色 | 说明 |
  | 红色紧急区 | W0 ~ W2 | 浅红色 | 断货风险,已无法通过常规补货解决 |
  | 黄色警告区 | W3 ~ W6 | 浅黄色 | 必须立即下单,才能在断货前到货 |
  | 绿色安全区 | W7 ~ W12 | 浅绿色 | 库存充足,可按计划补货 |

And 区间边界线为虚线
And 区间标签显示在Y轴右侧
```

---

## 4. Data Visualization Requirements

### 4.1 主图表: 12周库存投影 (12-Week Projection Chart)

**Chart Type:** 组合图 (Combo Chart: Bar + Line)

**Data Source:** `v_inventory_projection_12weeks` 视图

**X轴 (Dimension):**
- Field: `week_iso` (ISO Week String, e.g., "2025-W50")
- Type: Category (Discrete)
- Range: 12 weeks from current week
- Label: 显示周次 + 日期范围 (e.g., "W50\n12/09-12/15")

**Y轴 (Metric):**
- Field: `closing_stock` (Integer)
- Type: Continuous
- Range: Auto-scale (min: lowest closing_stock, max: highest opening_stock)
- Label: "库存数量 (件)"

**柱状图 (Bar Series):**
- Data: `closing_stock` per week
- Color Rules:
  - Red (#EF4444): closing_stock < 0 (Stockout)
  - Yellow (#F59E0B): 0 <= closing_stock < safety_stock_threshold (Risk)
  - Green (#10B981): closing_stock >= safety_stock_threshold (OK)

**折线图 (Line Series - Overlay):**
- Data: `closing_stock` per week
- Color: Blue (#3B82F6)
- Type: Smooth curve (Spline interpolation)
- Purpose: 显示趋势方向

**标注点 (Annotations):**
1. **到货标注 (Incoming Marker):**
   - Condition: `incoming_qty > 0`
   - Symbol: Green upward arrow (↑)
   - Position: 柱子上方
   - Label: "+{incoming_qty}"

2. **断货警告 (Stockout Alert):**
   - Condition: `stock_status = 'Stockout'`
   - Symbol: Red warning icon (⚠️)
   - Position: 柱子顶端
   - Label: "断货"

3. **安全库存线 (Safety Stock Line):**
   - Type: Horizontal dashed line
   - Y Value: `safety_stock_threshold`
   - Color: Orange (#F97316)
   - Label: "安全库存线 ({safety_stock_weeks}周)"

### 4.2 辅助数据表: 明细数据 (Detail Table)

**Table Type:** 可折叠数据表 (Collapsible Data Table)

**Columns:**

| 列名 | Data Field | Format | 说明 |
|-----|-----------|--------|------|
| 周次 | week_iso | Text | 2025-W50 |
| 期初库存 | opening_stock | Number | 100 |
| 预计到货 | incoming_qty | Number (Green if > 0) | 50 |
| 销售出库 | effective_sales | Number (Red) | -30 |
| 期末库存 | closing_stock | Number (Bold) | 120 |
| 状态 | stock_status | Badge | OK/Risk/Stockout |

**Data Source SQL:**
```sql
SELECT
  week_iso,
  opening_stock,
  incoming_qty,
  effective_sales,
  closing_stock,
  stock_status
FROM v_inventory_projection_12weeks
WHERE sku = :selected_sku
  AND (:channel = 'All'
       OR (channel_code IN (:fba_channels) AND :channel = 'FBA')
       OR (channel_code IN (:warehouse_channels) AND :channel = 'Warehouse'))
ORDER BY week_offset ASC
```

### 4.3 顶部筛选器 (Filters)

**Component 1: SKU选择器**
- Type: Searchable Dropdown (ShadCN Combobox)
- Data Source: `SELECT DISTINCT sku, product_name FROM products ORDER BY sku`
- Display Format: "ABC-001 - Product Name"
- Default: 第一个SKU

**Component 2: 渠道选择器**
- Type: Radio Group (ShadCN Radio)
- Options:
  - "全部" (All)
  - "亚马逊FBA" (FBA) - 汇总所有 `warehouse_type = 'FBA'` 的仓库
  - "海外仓" (3PL) - 汇总所有 `warehouse_type = '3PL'` 的仓库
  - "单独仓库" (Individual) - 显示仓库列表,可多选
- Default: "全部"

---

## 5. Business Rules Matrix

### 5.1 渠道聚合规则 (Channel Aggregation Rules)

| Channel Filter | Warehouse Filter Logic | Aggregation Rule |
|----------------|------------------------|------------------|
| **全部** | 所有仓库 | SUM(opening_stock), SUM(incoming_qty), SUM(effective_sales) for ALL warehouses |
| **亚马逊FBA** | warehouse_type = 'FBA' | SUM for FBA warehouses only |
| **海外仓** | warehouse_type = '3PL' | SUM for 3PL warehouses only |
| **单独仓库** | warehouse_id IN (:selected_ids) | SUM for selected warehouses |

**SQL Implementation:**
```sql
-- Example: FBA Channel Aggregation
SELECT
  week_iso,
  SUM(opening_stock) AS opening_stock,
  SUM(incoming_qty) AS incoming_qty,
  SUM(effective_sales) AS effective_sales,
  SUM(closing_stock) AS closing_stock
FROM v_inventory_projection_12weeks
WHERE sku = :sku
  AND warehouse_id IN (
    SELECT id FROM warehouses WHERE warehouse_type = 'FBA'
  )
GROUP BY week_iso
ORDER BY week_offset ASC
```

### 5.2 库存状态颜色规则 (Stock Status Color Rules)

| Stock Status | Condition | Bar Color | Text Color | Badge |
|-------------|-----------|-----------|-----------|-------|
| **OK** | closing_stock >= safety_stock_threshold | Green (#10B981) | Green-800 | 绿色Badge "安全" |
| **Risk** | 0 <= closing_stock < safety_stock_threshold | Yellow (#F59E0B) | Yellow-800 | 黄色Badge "风险" |
| **Stockout** | closing_stock < 0 | Red (#EF4444) | Red-800 | 红色Badge "断货" |

### 5.3 时效区间计算规则 (Lead Time Zone Rules)

| Zone Name | Week Range | Calculation | Color | Action Required |
|-----------|-----------|-------------|-------|-----------------|
| **红色紧急区** | W0 ~ W(safety) | 0 到 safety_stock_weeks | rgba(239, 68, 68, 0.1) | 空运补货或接受断货 |
| **黄色警告区** | W(safety+1) ~ W(safety+logistics+procurement) | safety + 1 到 total_lead_time | rgba(245, 158, 11, 0.1) | 必须立即下单 |
| **绿色安全区** | W(total_lead_time+1) ~ W12 | total_lead_time + 1 到 12 | rgba(16, 185, 129, 0.1) | 按计划补货 |

**Example Calculation:**
- safety_stock_weeks = 2
- logistics_lead_time = 4
- procurement_lead_time = 8
- total_lead_time = 4 + 8 = 12

结果:
- 红色区: W0 ~ W2 (当前周到安全库存周)
- 黄色区: W3 ~ W12 (安全库存周到总时效周)
- 绿色区: W13+ (超过总时效,本例中无绿色区,因为投影只有12周)

**注意**: 如果 total_lead_time > 12 周,则整个12周投影都应显示为警告区。

---

## 6. Technical Requirements

### 6.1 Data Query Logic

**Query Function Signature:**
```typescript
// src/lib/queries/inventory-overview-v2.ts

interface InventoryProjectionV2Params {
  sku: string
  channel: 'All' | 'FBA' | '3PL' | 'Individual'
  warehouseIds?: string[] // Only for 'Individual' channel
}

interface InventoryProjectionV2Row {
  week_iso: string
  week_offset: number
  opening_stock: number
  incoming_qty: number
  effective_sales: number
  closing_stock: number
  stock_status: 'OK' | 'Risk' | 'Stockout'
}

async function fetchInventoryProjectionV2(
  params: InventoryProjectionV2Params
): Promise<InventoryProjectionV2Row[]>
```

**Implementation Strategy:**
1. 从 `v_inventory_projection_12weeks` 读取原始数据
2. 根据 `channel` 参数过滤仓库维度
3. 按 `week_iso` 分组聚合 (SUM)
4. 计算聚合后的 `stock_status`:
   - If closing_stock < 0: 'Stockout'
   - Else if closing_stock < safety_stock_threshold: 'Risk'
   - Else: 'OK'

### 6.2 Chart Library Selection

**Recommended:** Recharts (已在Tech Stack中)

**Component Structure:**
```tsx
<ResponsiveContainer width="100%" height={400}>
  <ComposedChart data={projectionData}>
    {/* X轴: ISO Week */}
    <XAxis dataKey="week_iso" />

    {/* Y轴: 库存数量 */}
    <YAxis />

    {/* 背景颜色区间 (使用ReferenceArea) */}
    <ReferenceArea y1={0} y2={safetyStock} fill="rgba(245, 158, 11, 0.1)" />
    <ReferenceArea y1={safetyStock} y2="dataMax" fill="rgba(16, 185, 129, 0.1)" />

    {/* 安全库存线 */}
    <ReferenceLine y={safetyStock} stroke="#F97316" strokeDasharray="3 3" />

    {/* 断货警告线 */}
    <ReferenceLine y={0} stroke="#EF4444" strokeWidth={2} />

    {/* 柱状图 */}
    <Bar dataKey="closing_stock" fill="#3B82F6">
      {/* 动态颜色 */}
      {projectionData.map((entry, index) => (
        <Cell key={index} fill={getBarColor(entry.stock_status)} />
      ))}
    </Bar>

    {/* 折线图 */}
    <Line
      type="monotone"
      dataKey="closing_stock"
      stroke="#3B82F6"
      strokeWidth={2}
      dot={{ r: 4 }}
    />

    {/* Tooltip */}
    <Tooltip content={<CustomTooltip />} />
  </ComposedChart>
</ResponsiveContainer>
```

---

## 7. Acceptance Criteria (Gherkin Syntax)

### 7.1 Feature: 查看库存投影图表

```gherkin
Feature: 查看库存投影图表
  As an operations manager
  I want to view 12-week inventory projection chart
  So that I can make replenishment decisions

  Background:
    Given 用户已登录系统
    And 系统中存在SKU "ABC-001" 的12周投影数据
    And 该SKU在FBA和3PL仓库都有库存

  Scenario: 查看全渠道投影
    Given 我访问 /inventory/overview-v2 页面
    When 页面加载完成
    Then SKU选择器默认选中第一个SKU "ABC-001"
    And 渠道选择器默认选中 "全部"
    And 系统显示12个柱状图 (W50 ~ W61)
    And 每个柱子颜色根据stock_status显示:
      | Week | Closing Stock | Color |
      | W50 | 150 | Green |
      | W51 | 120 | Green |
      | W52 | 40 | Yellow (< 50) |
      | W53 | -10 | Red (< 0) |

  Scenario: 切换到FBA渠道
    Given 我在库存投影页面
    When 我选择渠道 "亚马逊FBA"
    Then 图表只显示FBA仓库的聚合数据
    And 图表标题显示 "ABC-001 - 亚马逊FBA渠道"
    And Y轴数值更新为FBA渠道的库存量
    And 3PL仓库的数据不显示

  Scenario: 识别断货周
    Given 我选择SKU "DEF-002"
    And 该SKU在 2026-W01 发生断货 (closing_stock = -10)
    When 图表渲染完成
    Then 2026-W01 的柱子为红色
    And 柱子上方显示 "⚠️ 断货" 标签
    And 页面顶部显示警告卡片:
      """
      警告: DEF-002 预计在 2026-W01 (2026年1月1日) 断货
      剩余 16 天,建议立即下单采购至少 100 件
      """

  Scenario: 查看明细数据表
    Given 我在库存投影页面
    When 我点击 "显示明细数据" 按钮
    Then 图表下方展开明细表格
    And 表格显示12行数据,每行对应一周
    And 列包括: 周次、期初库存、预计到货、销售出库、期末库存、状态
```

---

## 8. Out of Scope (明确不做)

以下功能**不在V2范围内**,留待后续迭代:

1. **历史回溯**: 不显示过去12周的历史数据(只显示未来)
2. **多SKU对比**: 不支持在同一图表中对比多个SKU
3. **编辑投影数据**: 不支持手动调整预测销量(只读视图)
4. **导出图表**: 不支持导出为PDF/图片
5. **移动端优化**: 暂不优化手机端图表展示(桌面端优先)

---

## 9. Non-Functional Requirements

### 9.1 Performance

- 图表渲染时间 < 1秒 (12周数据,单SKU)
- SKU切换响应时间 < 500ms (使用客户端缓存)
- 渠道切换响应时间 < 200ms (客户端计算,无需请求后端)

### 9.2 Accessibility

- 图表配色支持色盲模式 (Red/Green 替换为 Red/Blue)
- 图表数据可通过明细表格访问(屏幕阅读器友好)

### 9.3 Browser Support

- Chrome 100+
- Safari 16+
- Firefox 100+

---

## 10. UI/UX Guidelines

### 10.1 Layout Specification

**页面布局 (Desktop):**
```
┌─────────────────────────────────────────────────────────┐
│ Header: 库存总览V2 - 时序可视化                           │
├─────────────────────────────────────────────────────────┤
│ Filters:                                                │
│ [SKU选择器 ▼] [渠道选择器: ○全部 ○FBA ○海外仓]          │
├─────────────────────────────────────────────────────────┤
│ Alert Card (if stockout detected):                      │
│ ⚠️ 警告: ABC-001 预计在 2026-W01 断货...                │
├─────────────────────────────────────────────────────────┤
│ Chart Container (Height: 400px)                         │
│                                                         │
│  ┌─── 12-Week Projection Chart (Recharts) ────┐        │
│  │  Y: 库存数量                                │        │
│  │    ┃▓▓▓┃▓▓┃▓▓┃▓┃░░░░                       │        │
│  │    ┃▓▓▓┃▓▓┃▓▓┃▓┃░░░░  ← Line overlay       │        │
│  │  0 ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │        │
│  │     W50 W51 W52 W53 ... W61 (X: 周次)       │        │
│  └──────────────────────────────────────────┘        │
│                                                         │
│ [显示明细数据 ▼]                                        │
├─────────────────────────────────────────────────────────┤
│ Detail Table (Collapsible):                            │
│ ┌──────┬─────┬─────┬─────┬─────┬──────┐              │
│ │ Week │ Open│ In  │ Out │Close│Status│              │
│ ├──────┼─────┼─────┼─────┼─────┼──────┤              │
│ │W50   │ 100 │ 50  │ 30  │ 120 │ OK   │              │
│ │W51   │ 120 │ 0   │ 35  │ 85  │ OK   │              │
│ └──────┴─────┴─────┴─────┴─────┴──────┘              │
└─────────────────────────────────────────────────────────┘
```

### 10.2 Color Palette (Tailwind CSS)

| Element | Tailwind Class | Hex Code | Usage |
|---------|---------------|----------|-------|
| OK Bar | bg-green-500 | #10B981 | closing_stock >= safety_stock |
| Risk Bar | bg-yellow-500 | #F59E0B | 0 <= closing_stock < safety_stock |
| Stockout Bar | bg-red-500 | #EF4444 | closing_stock < 0 |
| Trend Line | stroke-blue-500 | #3B82F6 | Projection line overlay |
| Safety Line | stroke-orange-500 | #F97316 | Safety stock threshold |

---

## 11. Success Metrics (如何验证成功)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **图表可用性** | SKU选择器和渠道选择器正常工作,图表实时更新 | 手动测试 |
| **断货识别准确性** | 100%断货周被标记为红色 | 单元测试 + SQL验证 |
| **渠道聚合准确性** | FBA/3PL聚合数据与手工计算一致 | SQL审计 |
| **页面加载性能** | 图表渲染 < 1秒 | Chrome DevTools Performance |
| **用户满意度** | 运营团队反馈"比表格更直观" | 用户访谈 |

---

## 12. Dependencies & Risks

### 12.1 Technical Dependencies

- **数据源**: 依赖 `v_inventory_projection_12weeks` 视图数据完整性
- **图表库**: Recharts (已安装)
- **UI组件**: ShadCN Combobox, Radio, Badge

### 12.2 Risk Assessment

| Risk | Impact (H/M/L) | Probability (H/M/L) | Mitigation |
|------|----------------|---------------------|-----------|
| 投影数据未刷新 | H | M | 添加"最后更新时间"显示,提示用户手动刷新 |
| 渠道聚合逻辑错误 | M | L | 编写单元测试覆盖所有渠道组合 |
| 图表渲染性能差 | M | M | 限制最多显示12周,使用Recharts懒加载 |

---

## 13. Next Steps (交付给架构师)

本需求文档完成后,请**System Architect**进行以下工作:

1. **数据查询设计**:
   - 设计 `fetchInventoryProjectionV2` 函数,支持渠道聚合
   - 确认 `v_inventory_projection_12weeks` 是否需要添加 `warehouse_type` 字段

2. **图表组件设计**:
   - 选择Recharts组件 (ComposedChart vs LineChart + BarChart)
   - 设计动态颜色逻辑 (Cell fill based on stock_status)

3. **页面路由**:
   - 确认新页面路径: `/inventory/overview-v2` 还是覆盖现有 `/inventory`?

4. **输出文档**: `specs/inventory-overview-v2/design.md`

---

**Document Control**
- **Version**: 2.0
- **Author**: Product Director (Claude)
- **Approved By**: (Pending)
- **Next Review Date**: 2025-12-20
