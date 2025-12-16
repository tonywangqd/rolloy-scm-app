# 到仓管理修复方案 (Warehouse Arrival Management Fix)

**Product Director Output**
**Version:** 1.0
**Date:** 2025-12-16
**Status:** Spec Ready

---

## 1. Context & Goals

### 1.1 Business Context

到仓管理是物流管理模块的核心功能之一,负责记录货物从海外仓或FBA仓的实际到货情况。当前系统存在以下关键问题:

1. **功能缺失**: "新建到仓单"按钮无响应,无法创建新的到货记录
2. **数据污染**: 系统中存在24个测试到仓单和2450条测试数据,影响实际业务数据的准确性
3. **业务断层**: 到仓单与发货单(Shipments)未建立关联关系,导致数据无法串联

### 1.2 Business Goals

- **Goal 1 (Primary)**: 恢复到仓单创建功能,实现从发货单到到仓单的完整业务流程
- **Goal 2 (Critical)**: 清理测试数据,确保系统数据准确性
- **Goal 3 (Strategic)**: 建立发货单-到仓单关联,实现差异追踪和库存更新自动化

### 1.3 Business Value

- **减少手工工作**: 从发货单自动生成到仓单,减少重复录入
- **提高数据准确性**: 自动对比发货量和到货量,立即识别物流损耗
- **库存实时性**: 到货后自动更新库存,无需手动操作
- **财务合规**: 精确记录实际到货数量,支持应付账款计算

---

## 2. Problem Space Analysis

### 2.1 Current State (As-Is)

**页面结构 (Current Implementation):**

```
/logistics/arrivals (到仓管理页面)
├── ArrivalsStats (统计卡片 - Mock数据)
└── ArrivalsList (到仓单列表)
    ├── 显示24条Mock数据
    ├── "新建到仓单"按钮 (无onClick事件)
    ├── "导出"按钮 (无功能)
    └── 操作按钮 (查看/编辑 - 无功能)
```

**数据源问题:**
- 组件使用 `mockArrivals` 硬编码数据,未连接数据库
- 无Server Action用于到仓单CRUD操作
- 无数据库表或View支持到仓单业务

**业务断层:**
- 发货单 (`shipments` 表) 有 `actual_arrival_date` 字段,但无"到仓差异"记录
- 库存更新逻辑在 `processShipmentArrival` Server Action中,但无法从UI触发
- 缺少到仓差异的审计记录(物流损耗、丢件)

### 2.2 Root Cause Analysis (5 Whys)

**问题1: 新建到仓单按钮无响应**
1. 为什么按钮不工作? → 未绑定onClick事件
2. 为什么没有绑定事件? → 组件尚未实现创建逻辑
3. 为什么没有创建逻辑? → 后端无到仓单创建的Server Action
4. 为什么没有Server Action? → 数据库未设计到仓单独立表
5. **根本原因**: 业务设计中,到仓被视为发货单的一个状态更新,而非独立实体

**问题2: 测试数据污染**
- 开发阶段使用Mock数据进行UI验证
- 未实施数据库清理流程
- **根本原因**: 缺少环境隔离策略(开发环境 vs 生产环境)

**问题3: 到仓与发货未挂钩**
- 当前设计: 发货单有 `actual_arrival_date` 字段标记到货
- 缺失设计: 无独立到仓记录表,无法记录差异明细(shipped_qty vs received_qty)
- **根本原因**: 需要引入 `order_arrivals` 表或复用 `shipment_items.received_qty` 字段

---

## 3. User Stories

### 3.1 Primary User Stories

#### US-01: 创建到仓单 (Create Arrival Record)

**As a** 仓库操作员 (Warehouse Operator)
**I want to** 从发货单创建到仓单,并记录实际到货数量
**So that** 系统可以自动更新库存并标记差异

**Acceptance Criteria (Given/When/Then):**

```gherkin
Given 存在一个状态为"已发货"的发货单 (shipment.status = 'Shipped')
  And 该发货单尚未到货 (actual_arrival_date IS NULL)
When 我点击"新建到仓单"按钮
  And 系统弹出到仓单创建表单
  And 表单预填充发货单信息:
    | 字段 | 数据源 |
    | 发货单号 | shipments.tracking_number |
    | 目的仓库 | warehouses.name (via destination_warehouse_id) |
    | SKU明细 | shipment_items[].sku |
    | 发货数量 | shipment_items[].shipped_qty |
  And 我为每个SKU录入"实际到货数量" (received_qty)
  And 系统自动计算差异 (variance_qty = received_qty - shipped_qty)
  And 我填写"实际到货日期"和"备注"
When 我提交表单
Then 系统执行以下操作:
  1. 更新 shipment_items.received_qty
  2. 更新 shipments.actual_arrival_date
  3. 调用 processShipmentArrival Server Action 更新库存
  4. 如果存在差异 (variance_qty != 0), 创建 balance_resolutions 记录
  5. 刷新页面,显示新创建的到仓单
  6. 显示成功提示: "到仓单 [OA-XXX] 创建成功,库存已更新"
```

#### US-02: 查看到仓单列表 (View Arrival List)

**As a** 物流经理 (Logistics Manager)
**I want to** 查看所有到仓单及其差异状态
**So that** 我可以追踪物流损耗并调查异常

**Acceptance Criteria:**

```gherkin
Given 系统中存在多个已完成到仓的发货单
When 我访问 /logistics/arrivals 页面
Then 系统显示到仓单列表,包含以下列:
  | 列名 | 数据源 | 说明 |
  | OA单号 | Generated: "OA-" + YYYYMMDD + "-" + seq | 到仓单号 |
  | 发货单号 | shipments.tracking_number | 关联的发货单 |
  | 目的仓库 | warehouses.name | 到货仓库 |
  | SKU汇总 | COUNT(DISTINCT shipment_items.sku) | SKU数量 |
  | 发货总量 | SUM(shipped_qty) | 所有SKU发货数 |
  | 到货总量 | SUM(received_qty) | 所有SKU到货数 |
  | 差异总量 | SUM(variance_qty) | 正=多货,负=短缺 |
  | 实际到仓日期 | shipments.actual_arrival_date | 到货日期 |
  | 差异状态 | Badge: 无差异/短缺/多余 | 基于variance_qty |

And 列表默认按到货日期倒序排列
And 短缺差异行标记为红色Badge "短缺 -X"
And 多余差异行标记为黄色Badge "多余 +X"
And 无差异行标记为绿色Badge "无差异"
```

#### US-03: 清理测试数据 (Data Cleanup)

**As a** 系统管理员 (System Admin)
**I want to** 一键清空测试数据
**So that** 生产环境只保留真实业务数据

**Acceptance Criteria:**

```gherkin
Given 系统中存在测试数据 (通过特定标识识别)
When 我在设置页面执行"清理测试数据"操作
  And 系统弹出确认对话框: "此操作将删除所有测试数据,包括发货单、到仓单、库存快照。是否继续?"
  And 我确认操作
Then 系统执行以下SQL清理:
  1. DELETE FROM shipment_items WHERE shipment_id IN (测试发货单ID)
  2. DELETE FROM shipments WHERE remarks LIKE '%测试%' OR created_at < '2025-01-01'
  3. DELETE FROM balance_resolutions WHERE created_at < '2025-01-01'
  4. REFRESH MATERIALIZED VIEW v_inventory_projection_12weeks
And 系统显示清理结果: "已删除 X 个发货单, Y 条明细, Z 条差异记录"
And 系统记录操作日志到audit_logs表
```

---

## 4. Data Visualization Requirements

### 4.1 到仓管理概览 (Arrivals Dashboard)

**Chart Type:** 3个统计卡片 (Stat Cards)

**Metrics & Dimensions:**

| 卡片名称 | Metric | Aggregation | SQL Source |
|---------|--------|-------------|-----------|
| 本月到仓单数 | COUNT(*) | 月度汇总 | `SELECT COUNT(*) FROM shipments WHERE actual_arrival_date >= DATE_TRUNC('month', CURRENT_DATE)` |
| 本月到货总量 | SUM(received_qty) | 月度汇总 | `SELECT SUM(si.received_qty) FROM shipment_items si JOIN shipments s WHERE s.actual_arrival_date >= DATE_TRUNC('month', CURRENT_DATE)` |
| 差异单数 | COUNT(*) | 条件计数 | `SELECT COUNT(DISTINCT source_id) FROM balance_resolutions WHERE status = 'pending' AND source_type = 'shipment_item'` |

### 4.2 差异趋势图 (Variance Trend - Future Enhancement)

**Chart Type:** 折线图 (Line Chart)

**X轴:** 到货周次 (ISO Week)
**Y轴:** 差异率 (Variance Rate %) = SUM(ABS(variance_qty)) / SUM(shipped_qty) * 100
**目的:** 追踪物流商质量趋势

---

## 5. Business Rules Matrix

### 5.1 到仓单状态机 (Arrival Status State Machine)

| Current State | Trigger Event | Validation Rules | Next State | Side Effects |
|---------------|---------------|------------------|-----------|--------------|
| **发货单已发货** | 创建到仓单 | 1. actual_arrival_date IS NULL<br>2. 所有SKU的received_qty必须录入<br>3. received_qty >= 0 | **已到货** | 1. 更新shipments.actual_arrival_date<br>2. 更新inventory_snapshots<br>3. 如有差异,创建balance_resolutions |
| **已到货** | 差异解决 | balance_resolutions.status = 'pending' | **差异已解决** | 更新balance_resolutions.status = 'resolved' |
| **已到货** | 查看明细 | N/A | (无状态变化) | 显示到仓单详情弹窗 |

### 5.2 差异处理规则 (Variance Handling Rules)

| Variance Type | Condition | Balance Resolution Action | Inventory Action |
|---------------|-----------|--------------------------|------------------|
| **无差异** | received_qty = shipped_qty | 不创建记录 | 增加库存 = received_qty |
| **短缺** | received_qty < shipped_qty | 创建pending记录,source_type='shipment_item' | 增加库存 = received_qty (实际到货数) |
| **多余** | received_qty > shipped_qty | 创建pending记录,source_type='shipment_item' | 增加库存 = received_qty (多出部分也入库) |

**数据完整性约束:**
- `shipment_items.received_qty` <= `purchase_order_items.ordered_qty` (不能超过采购订单量)
- `received_qty` 必须为非负整数

---

## 6. Integration Requirements

### 6.1 Upstream Dependencies (数据来源)

| Source System | Entity | Fields Consumed | Purpose |
|--------------|--------|-----------------|---------|
| **Logistics** | shipments | id, tracking_number, destination_warehouse_id, actual_arrival_date | 到仓单主记录 |
| **Logistics** | shipment_items | shipment_id, sku, shipped_qty, received_qty | SKU明细和差异计算 |
| **Settings** | warehouses | id, name | 显示目的仓库名称 |
| **Procurement** | purchase_order_items | ordered_qty | 验证received_qty不超过采购量 |

### 6.2 Downstream Impacts (影响下游)

| Target System | Impact | Trigger Condition |
|--------------|--------|-------------------|
| **Inventory** | 更新inventory_snapshots.qty_on_hand | 到仓单提交时 (processShipmentArrival) |
| **Finance** | 触发应付账款计算 (基于实际到货量) | actual_arrival_date填写后30天 |
| **Balance Management** | 创建差异解决记录 | variance_qty != 0 |

---

## 7. Acceptance Criteria (Gherkin Syntax)

### 7.1 Feature: 创建到仓单

```gherkin
Feature: 创建到仓单
  As a warehouse operator
  I want to record actual received quantities
  So that inventory is updated accurately

  Background:
    Given 用户已登录系统
    And 存在一个已发货的发货单 "SH-2025-W50-01"
    And 该发货单包含2个SKU:
      | SKU | shipped_qty |
      | ABC-001 | 100 |
      | DEF-002 | 50 |
    And 该发货单尚未到货 (actual_arrival_date IS NULL)

  Scenario: 正常到货无差异
    Given 我在 /logistics/arrivals 页面
    When 我点击"新建到仓单"按钮
    Then 系统显示到仓单创建对话框
    And 表单预填充发货单号 "SH-2025-W50-01"
    When 我录入以下到货数据:
      | SKU | received_qty |
      | ABC-001 | 100 |
      | DEF-002 | 50 |
    And 我选择实际到货日期 "2025-12-15"
    And 我点击"提交"按钮
    Then 系统显示成功提示 "到仓单创建成功,库存已更新"
    And 发货单 "SH-2025-W50-01" 的 actual_arrival_date 更新为 "2025-12-15"
    And 仓库 "US-West" 的库存增加:
      | SKU | qty_increase |
      | ABC-001 | +100 |
      | DEF-002 | +50 |
    And 不创建任何 balance_resolutions 记录 (无差异)

  Scenario: 到货短缺 (物流损耗)
    Given 我在创建到仓单表单
    When 我录入以下到货数据:
      | SKU | received_qty |
      | ABC-001 | 95 |  # 短缺5件
      | DEF-002 | 50 |
    And 系统自动计算差异:
      | SKU | variance_qty |
      | ABC-001 | -5 |
      | DEF-002 | 0 |
    And 我填写备注 "ABC-001外箱破损,实际收货95件"
    When 我提交表单
    Then 系统创建 balance_resolutions 记录:
      | source_type | sku | variance_qty | status |
      | shipment_item | ABC-001 | -5 | pending |
    And 库存更新基于实际到货量:
      | SKU | qty_increase |
      | ABC-001 | +95 |  # 只增加实际到货数
      | DEF-002 | +50 |

  Scenario: 到货多余 (供应商多发)
    Given 我在创建到仓单表单
    When 我录入以下到货数据:
      | SKU | received_qty |
      | ABC-001 | 105 |  # 多5件
      | DEF-002 | 50 |
    Then 系统显示警告: "SKU ABC-001 到货量超过发货量,请确认是否供应商多发"
    When 我确认并提交
    Then 系统创建 balance_resolutions 记录:
      | source_type | sku | variance_qty | status |
      | shipment_item | ABC-001 | +5 | pending |
    And 多余的5件也入库 (待后续处理是否退货或调整账单)
```

### 7.2 Feature: 清理测试数据

```gherkin
Feature: 清理测试数据
  As a system admin
  I want to clean up test data
  So that production database only contains real records

  Scenario: 执行数据清理
    Given 我在 /settings/data-management 页面
    And 系统中存在24个测试发货单 (created_at < '2025-01-01')
    When 我点击"清理测试数据"按钮
    Then 系统显示确认对话框
    When 我点击"确认删除"
    Then 系统执行清理脚本
    And 显示清理结果: "已删除 24 个发货单, 48 条明细, 0 条差异记录"
    And 到仓管理页面显示0条记录
```

---

## 8. Out of Scope (明确不做)

以下功能**不在本次需求范围内**,留待后续迭代:

1. **差异自动解决**: 不实现AI自动判断差异原因(需要人工审核)
2. **退货流程**: 到货多余时,不支持直接创建退货单
3. **批量到仓**: 不支持一次性录入多个发货单的到货
4. **到仓单编辑**: 一旦提交,不支持修改(防止库存数据错乱)
5. **物流商评分**: 不基于差异率对物流商打分

---

## 9. Non-Functional Requirements

### 9.1 Performance

- 到仓单列表加载时间 < 2秒 (100条记录内)
- 到仓单提交响应时间 < 3秒 (包含库存更新)

### 9.2 Data Integrity

- 使用数据库事务确保到仓单提交和库存更新的原子性
- `received_qty` 字段添加CHECK约束: `received_qty >= 0`

### 9.3 Audit Trail

- 所有到仓单操作记录到audit_logs表:
  - 事件类型: 'arrival_created', 'arrival_variance_detected'
  - 记录字段: user_id, shipment_id, old_value (NULL), new_value (received_qty JSON)

---

## 10. Success Metrics (如何验证成功)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **功能可用性** | "新建到仓单"按钮可点击并成功创建记录 | 手动测试通过 |
| **数据准确性** | 到仓后库存自动更新,与手工计算一致 | SQL审计查询 |
| **差异识别率** | 100%差异情况(短缺/多余)都创建balance_resolutions记录 | 单元测试覆盖 |
| **数据清洁度** | 生产环境0条测试数据 | `SELECT COUNT(*) FROM shipments WHERE created_at < '2025-01-01'` = 0 |

---

## 11. Dependencies & Risks

### 11.1 Technical Dependencies

- **数据库变更**: 需要在 `shipment_items` 表添加 `received_qty` 字段(如不存在)
- **Server Action**: 复用现有 `processShipmentArrival`,但需添加差异记录逻辑
- **UI组件**: 需创建 `ArrivalCreateDialog` 组件

### 11.2 Risk Assessment

| Risk | Impact (H/M/L) | Probability (H/M/L) | Mitigation |
|------|----------------|---------------------|-----------|
| 库存更新事务失败 | H | L | 使用数据库事务,失败回滚 |
| 清理脚本误删生产数据 | H | M | 添加WHERE条件安全检查,生产环境需二次确认 |
| 到仓与发货单数据不一致 | M | M | 添加外键约束,前端校验received_qty范围 |

---

## 12. Next Steps (交付给架构师)

本需求文档完成后,请**System Architect**进行以下工作:

1. **数据库设计**:
   - 确认 `shipment_items.received_qty` 字段是否存在
   - 设计 `order_arrivals` 表结构(如需独立表)
   - 更新 `balance_resolutions` 表,支持 `source_type='shipment_item'`

2. **API设计**:
   - Server Action: `createArrivalRecord(shipmentId, arrivalData)`
   - Server Action: `cleanupTestData(beforeDate)`
   - Query: `fetchArrivalsList(filters)`

3. **技术选型**:
   - 确认使用Dialog组件 (ShadCN Dialog)
   - 确认数据清理是SQL脚本还是Server Action

4. **输出文档**: `specs/warehouse-arrivals/design.md`

---

**Document Control**
- **Version**: 1.0
- **Author**: Product Director (Claude)
- **Approved By**: (Pending)
- **Next Review Date**: 2025-12-20
