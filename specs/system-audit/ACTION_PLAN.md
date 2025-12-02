# Rolloy SCM 产品改进项目清单
**审计日期:** 2025-12-02
**系统完成度:** 51% (Alpha阶段)
**状态:** 不建议生产部署

---

## 执行摘要

### 日常工作流程阻断点

| 步骤 | 工作内容 | 状态 | 阻断原因 |
|------|---------|------|----------|
| 1 | 更新最新周销量预计 | ✅ 可用 | - |
| 2 | 更新过去几周实际销量 | ✅ 可用 | 无批量导入 |
| 3 | 更新订单下单实际数据 | ⚠️ 部分 | PO详情页缺失 |
| 4 | **记录生产交付** | 🔴 阻断 | **无UI界面** |
| 5 | **更新产品库存** | 🔴 阻断 | **无编辑功能** |
| 6 | 验证计算逻辑 | ⚠️ 部分 | 表名不一致 |
| 7 | 查看物流到货 | ⚠️ 部分 | 无一键确认 |
| 8 | 查看库存风险预警 | 🔴 阻断 | **Dashboard未显示** |
| 9 | 决定本周下单量 | ⚠️ 部分 | 无补货建议页 |
| 10 | 确定交付分配 | ⚠️ 部分 | 无渠道分配建议 |

---

## P0 紧急修复项目 (阻断用户操作)

### P0-1: 数据库表名一致性问题
**影响范围:** 整个库存预测系统可能失效

**问题描述:**
- 代码中混用 `weekly_sales_forecasts` 和 `sales_forecasts`
- 视图 `v_inventory_projection_12weeks` 查询的是 `sales_forecasts`
- 实际数据库表名需要确认

**解决方案:**
```sql
-- 在Supabase SQL Editor运行，确认实际表名
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name LIKE '%sales%'
ORDER BY table_name, ordinal_position;
```

**负责人:** System Architect + Backend Specialist
**预估工时:** 4小时

---

### P0-2: 创建生产交付录入UI
**影响范围:** 无法记录工厂交货，库存预测失效

**当前状态:**
- ✅ Server Action `createDelivery()` 已存在
- ❌ 无前端界面录入

**需求规格:**
```
页面路径: /app/procurement/deliveries/new/page.tsx

表单字段:
1. 选择PO (下拉框，显示进行中的PO)
2. 交货日期 (日期选择器，默认今天)
3. SKU明细表格:
   - SKU (从PO Items自动加载)
   - 订单数量 (只读)
   - 已交付数量 (只读)
   - 本次交付数量 (输入)
4. 交货单号 (文本)
5. 备注 (文本域)

提交后:
- 调用 createDelivery()
- 更新 purchase_order_items.delivered_qty
- 跳转到PO详情页
```

**负责人:** Frontend Artisan + Backend Specialist
**预估工时:** 6小时

---

### P0-3: 创建库存编辑功能
**影响范围:** 无法修正库存差异，盘点结果无法录入

**当前状态:**
- ✅ Server Action `updateInventorySnapshot()` 已存在
- ❌ 库存页面只读，无编辑入口

**需求规格:**
```
交互方式: 库存表格行上添加"编辑"按钮，点击打开Modal

Modal表单:
1. SKU (只读)
2. 仓库 (只读)
3. 当前数量 (只读，参考用)
4. 新数量 (数字输入)
5. 调整原因 (下拉选择):
   - Physical Count (盘点)
   - Adjustment (调整)
   - Damage (损坏)
   - Return (退货)
   - Other (其他)
6. 备注 (文本域)

提交后:
- 调用 updateInventorySnapshot()
- 刷新表格
- 显示成功提示
```

**负责人:** Frontend Artisan
**预估工时:** 4小时

---

### P0-4: 创建物流到货确认流程
**影响范围:** 物流到货后库存不能自动更新

**当前状态:**
- ✅ Server Action `processShipmentArrival()` 已存在
- ⚠️ 无明确的一键确认流程

**需求规格:**
```
交互方式: 物流列表中，对于 actual_arrival_date 为空的记录显示"确认到货"按钮

确认流程:
1. 点击"确认到货"按钮
2. 弹出确认对话框:
   "确认物流单 [tracking_number] 已到货？
    到货日期: [今天日期]
    目的仓库: [warehouse_name]
    货物数量: [总件数]

    确认后将自动更新仓库库存。"
3. 点击确认:
   - 更新 actual_arrival_date = 今天
   - 调用 processShipmentArrival(shipmentId)
   - 刷新页面
   - 显示成功提示

新增Server Action:
async function markShipmentArrived(shipmentId: string) {
  await updateShipmentDates(shipmentId, { actual_arrival_date: new Date() })
  await processShipmentArrival(shipmentId)
  revalidatePath('/logistics')
  revalidatePath('/inventory')
}
```

**负责人:** Frontend Artisan + Backend Specialist
**预估工时:** 3小时

---

### P0-5: Dashboard显示库存风险预警
**影响范围:** 用户无法直观看到哪些SKU即将缺货

**当前状态:**
- ✅ 视图 `v_inventory_projection_12weeks` 计算正确
- ❌ Dashboard未展示风险数据

**需求规格:**
```
Dashboard顶部添加"紧急预警"卡片:

+------------------------------------------+
| 🚨 紧急预警                    查看全部 > |
+------------------------------------------+
| ⚠️ 3个SKU将在2周内缺货                   |
| • SKU-001 (预计W50缺货)                  |
| • SKU-002 (预计W50缺货)                  |
| • SKU-003 (预计W51缺货)                  |
+------------------------------------------+
| 📋 5条补货建议待处理                      |
+------------------------------------------+

数据来源:
- 缺货预警: SELECT * FROM v_inventory_projection_12weeks WHERE stock_status IN ('Stockout', 'Risk') AND week_offset <= 2
- 补货建议: SELECT COUNT(*) FROM replenishment_suggestions WHERE suggestion_status = 'Active'

点击行为:
- 点击SKU -> 跳转到库存详情
- 点击"查看全部" -> 跳转到补货建议页
```

**负责人:** Frontend Artisan
**预估工时:** 3小时

---

## P1 高优先级功能 (用户体验缺失)

### P1-1: 创建补货建议页面
**路径:** `/app/planning/replenishment/page.tsx`

**功能:**
- 显示所有补货建议列表
- 按优先级排序 (Critical > High > Medium > Low)
- 显示: SKU, 风险周, 建议订购量, 下单截止日, 发货截止日
- "创建PO"按钮 - 一键跳转到新建PO页面并预填数据
- 筛选: 优先级、是否逾期

**预估工时:** 5小时

---

### P1-2: 创建PO详情页
**路径:** `/app/procurement/[id]/page.tsx`

**功能:**
- 显示PO头信息 (PO号、批次、供应商、状态、日期)
- 显示Items明细表:
  - SKU, 订单数量, 已交付数量, 剩余数量
  - 进度条显示完成度
- 显示交货历史记录
- "记录交货"按钮
- 编辑日期功能

**预估工时:** 6小时

---

### P1-3: 添加批量Excel导入
**适用页面:** `/app/planning/forecasts` 和 `/app/planning/actuals`

**功能:**
- "导入Excel"按钮
- 上传文件 (xlsx/csv)
- 预览数据表格
- 确认后批量写入
- 支持格式: Week | SKU | Channel | Quantity

**预估工时:** 6小时

---

### P1-4: 创建缺失的数据库视图
**需要创建:**

```sql
-- v_inventory_summary (Dashboard使用)
CREATE VIEW v_inventory_summary AS
SELECT
  i.sku,
  p.product_name,
  p.spu,
  p.unit_cost_usd,
  SUM(i.qty_on_hand) as total_stock,
  SUM(i.qty_on_hand * p.unit_cost_usd) as stock_value_usd,
  COUNT(DISTINCT i.warehouse_id) as warehouse_count,
  MAX(i.last_counted_at) as last_counted
FROM inventory_snapshots i
JOIN products p ON i.sku = p.sku
GROUP BY i.sku, p.product_name, p.spu, p.unit_cost_usd;

-- v_pending_payables (财务模块使用)
CREATE VIEW v_pending_payables AS
-- 采购应付
SELECT
  to_char(pd.actual_delivery_date + INTERVAL '60 days', 'YYYY-MM') as payment_month,
  'Procurement' as payable_type,
  COUNT(*) as record_count,
  SUM(pd.delivered_qty * pd.unit_cost_usd) as total_amount_usd
FROM production_deliveries pd
WHERE pd.payment_status = 'Pending'
  AND pd.actual_delivery_date IS NOT NULL
GROUP BY payment_month
UNION ALL
-- 物流应付
SELECT
  to_char(s.actual_arrival_date + INTERVAL '30 days', 'YYYY-MM') as payment_month,
  'Logistics' as payable_type,
  COUNT(*) as record_count,
  SUM(COALESCE(s.weight_kg * s.cost_per_kg_usd, 0) + s.surcharge_usd - s.tax_refund_usd) as total_amount_usd
FROM shipments s
WHERE s.payment_status = 'Pending'
  AND s.actual_arrival_date IS NOT NULL
GROUP BY payment_month;
```

**预估工时:** 2小时

---

### P1-5: 更新交付时同步PO Items已交付数量
**问题:** 目前记录交付后，purchase_order_items.delivered_qty 不会更新

**解决方案:**
修改 `createDelivery()` 或创建数据库触发器:

```sql
-- 方案A: 数据库触发器 (推荐)
CREATE OR REPLACE FUNCTION update_po_item_delivered_qty()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_order_items
  SET delivered_qty = delivered_qty + NEW.delivered_qty
  WHERE id = NEW.po_item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_delivered_qty
AFTER INSERT ON production_deliveries
FOR EACH ROW
EXECUTE FUNCTION update_po_item_delivered_qty();
```

**预估工时:** 2小时

---

## P2 体验优化 (可延后)

| 项目 | 描述 | 工时 |
|-----|------|-----|
| P2-1 | 库存变更历史记录 | 4h |
| P2-2 | 预测准确度分析报表 | 4h |
| P2-3 | 物流详情页 (Shipment Detail) | 4h |
| P2-4 | 数据导出功能 (Excel) | 3h |
| P2-5 | 本周待办任务看板 | 3h |
| P2-6 | 渠道级别安全库存配置 | 4h |

---

## 实施计划

### 第一阶段: P0修复 (Day 1-2)
- [ ] P0-1: 确认并修复表名一致性
- [ ] P0-2: 生产交付录入UI
- [ ] P0-3: 库存编辑功能
- [ ] P0-4: 物流到货确认
- [ ] P0-5: Dashboard风险预警

**完成标准:** 用户可以完成完整的周工作流程

### 第二阶段: P1功能 (Day 3-4)
- [ ] P1-1: 补货建议页面
- [ ] P1-2: PO详情页
- [ ] P1-4: 缺失数据库视图
- [ ] P1-5: 交付数量同步

### 第三阶段: P2优化 (Day 5+)
- 根据用户反馈优先级排序

---

## 验收清单

### 周工作流程测试用例

```
1. [  ] 登录系统，打开Dashboard
2. [  ] 看到库存风险预警 (如果有)
3. [  ] 进入计划管理，更新下周销量预计
4. [  ] 进入计划管理，录入上周实际销量
5. [  ] 进入采购管理，查看PO状态
6. [  ] 记录一笔生产交付 ← P0-2
7. [  ] 进入库存管理，修正库存数量 ← P0-3
8. [  ] 进入物流管理，确认一笔物流到货 ← P0-4
9. [  ] 查看库存预测12周视图
10. [  ] 查看补货建议 ← P1-1
11. [  ] 根据建议创建新PO
12. [  ] 返回Dashboard，确认数据已更新
```

---

**文档版本:** 1.0
**创建日期:** 2025-12-02
**作者:** Product Director (AI Agent)
