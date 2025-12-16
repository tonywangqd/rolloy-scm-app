# 单号生成逻辑调查报告

**调查目的**: 为统一单号命名规则做准备
**调查日期**: 2025-12-16
**调查人员**: Backend Specialist

---

## 目标单号命名规则

| 业务 | 代码 | 含义 | 单号格式 | 示例 |
|------|------|------|----------|------|
| 销量预计 | SF | Sales Forecast | SF + 年 + 周 + 序号 | SF20253801 |
| 下单预计 | PF | Purchased Forecast | PF + 年 + 周 + 序号 | PF20253802 |
| 下单 | PO | Purchase Order | PO + 年 + 周 + 序号 | PO20253803 |
| 交货/出厂 | OF | Order Fulfilled | OF + 年 + 周 + 序号 | OF20253804 |
| 物流 | OS | Order Shipment | 用户手动填写 tracking_number | (不自动生成) |

---

## 调查结果汇总

### 1. Purchase Order (PO) - 采购订单

**当前格式**: `PO{YYYYMMDD}{NN}` (基于日期 + 序号)
**示例**: `PO2025120501`, `PO2025120502`

#### 实现位置

**数据库层 (SQL)**
- **文件**: `/supabase/migrations/20251201_update_po_number_format.sql`
- **函数**: `get_next_po_number(order_date DATE)`
- **行号**: 16-55
- **逻辑**:
  ```sql
  -- 格式: PO + YYYYMMDD + NN (两位序号)
  -- 示例: PO2025120101, PO2025120102
  SELECT COALESCE(MAX(REGEXP_REPLACE(...)), 0) + 1
  FROM purchase_orders
  WHERE po_number LIKE 'PO' || date_prefix || '%';
  ```

**前端工具函数 (TypeScript)**
- **文件**: `/src/lib/utils/po-number.ts`
- **函数**:
  - `generatePONumber(date: Date, sequence: number)` (行号: 141-148)
  - `extractDateFromPO(poNumber: string)` (行号: 13-30)
  - `extractSequenceFromPO(poNumber: string)` (行号: 40-49)
  - `isValidPONumber(poNumber: string)` (行号: 77-88)
  - `parsePONumber(poNumber: string)` (行号: 98-131)
- **用途**: 客户端验证、解析、格式化显示

**Server Actions**
- **文件**: `/src/lib/actions/procurement.ts`
- **函数**: `createPurchaseOrder()`
- **行号**: 25-131
- **调用方式**: 前端传入 `po_number`，后端通过 RPC 函数 `create_purchase_order_with_items` 写入数据库

#### 需要修改的内容

**目标格式**: `PO{YYYY}{WW}{NN}` (基于周 + 序号)
**示例**: `PO20253801` (2025年第38周第1个PO)

**修改项**:
1. 修改 SQL 函数 `get_next_po_number()` 使用 ISO 周而非日期
2. 修改 `/src/lib/utils/po-number.ts` 的所有函数以支持周格式
3. 更新前端表单提示文本

---

### 2. Production Delivery (DLV) - 生产交货单

**当前格式**: `DLV-{timestamp}` (时间戳，不可读)
**示例**: `DLV-1734345678901`

#### 实现位置

**应用层 (TypeScript)**
- **文件**: `/src/lib/actions/deliveries.ts`
- **函数**: `generateDeliveryNumber()`
- **行号**: 88-91
- **逻辑**:
  ```typescript
  function generateDeliveryNumber(): string {
    const timestamp = Date.now()
    return `DLV-${timestamp}`
  }
  ```
- **调用位置**:
  - `createDeliveryWithPlan()` (行号: 198)
  - 计划单号: `${deliveryNumber}-PLAN-${planItem.week_iso}` (行号: 256)

**数据库层 (SQL) - 已存在但未使用**
- **文件**: `/supabase/migrations/20251201_update_po_number_format.sql`
- **函数**: `get_next_delivery_number(delivery_date DATE)` (行号: 63-101)
- **格式**: `DLV{YYYYMMDD}{NN}` (日期 + 序号)
- **状态**: ⚠️ **已定义但未在应用层使用！**

**前端默认值**
- **文件**: `/src/app/procurement/deliveries/new/page.tsx`
- **行号**: 64
- **逻辑**:
  ```typescript
  delivery_number: `DLV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
  // 生成类似: DLV-2025-6789
  ```

#### 需要修改的内容

**目标格式**: `OF{YYYY}{WW}{NN}` (改名为 Order Fulfilled)
**示例**: `OF20253801` (2025年第38周第1个出厂单)

**修改项**:
1. **重命名代码**: `delivery_number` → `fulfillment_number`
2. **删除**: `generateDeliveryNumber()` 函数 (行号: 88-91)
3. **创建新函数**: `get_next_fulfillment_number(fulfillment_week TEXT)` 基于 ISO 周
4. **修改 Server Action**: `createDeliveryWithPlan()` 使用新函数
5. **数据库迁移**: ALTER TABLE 重命名列
6. **更新前端**: 所有引用 `delivery_number` 的地方

---

### 3. Shipment (Tracking Number) - 物流运单

**当前格式**: 用户手动输入 (不自动生成)
**示例**: `FEDEX123456`, `UPS789012`

#### 实现位置

**数据库表**
- **表名**: `shipments`
- **字段**: `tracking_number` (TEXT, NOT NULL, UNIQUE)
- **行为**: 用户在创建运单时手动填写快递单号

**Server Actions**
- **文件**: `/src/lib/actions/logistics.ts`
- **函数**:
  - `createShipment()` (行号: 40-121)
  - `createShipmentWithAllocations()` (行号: 496-587)
- **逻辑**: 直接接收前端传入的 `tracking_number`，无自动生成

#### 需要修改的内容

**目标**: 保持现有逻辑，仍然由用户手动填写
**原因**: 物流单号由物流供应商提供，无法预先生成

**可选改进** (如果未来需要内部单号):
- 添加字段 `internal_shipment_number` 格式为 `OS{YYYY}{WW}{NN}`
- 保留 `tracking_number` 用于外部物流单号

---

### 4. Sales Forecast - 销量预计

**当前格式**: 无独立单号
**唯一标识**: 组合键 `(week_iso, sku, channel_code)`

#### 实现位置

**数据库表**
- **表名**: `sales_forecasts`
- **唯一约束**: `UNIQUE (week_iso, sku, channel_code)`
- **无单号字段**: 不存在 `forecast_number` 列

**Server Actions**
- **文件**: `/src/lib/actions/planning.ts`
- **函数**:
  - `upsertSalesForecast()` (行号: 19-51)
  - `batchUpsertSalesForecasts()` (行号: 56-110)
- **逻辑**: 使用 `upsert` 基于组合键更新或插入

#### 需要修改的内容

**目标格式**: `SF{YYYY}{WW}{NN}` (新增单号字段)
**示例**: `SF20253801` (2025年第38周第1条预测)

**修改项**:
1. **数据库迁移**:
   - `ALTER TABLE sales_forecasts ADD COLUMN forecast_number TEXT UNIQUE`
2. **创建 SQL 函数**: `get_next_forecast_number(week_iso TEXT)`
3. **修改 Server Action**: `upsertSalesForecast()` 自动生成单号
4. **更新唯一约束**: 从组合键改为单号唯一
5. **数据迁移**: 为现有数据补充单号 (使用 UPDATE 语句)

**注意事项**:
- 需要决定是否保留组合键约束 (建议保留作为二级约束)
- 考虑并发插入时的序号冲突 (使用数据库序列或 RPC 函数)

---

### 5. Purchase Forecast - 下单预计

**当前格式**: 无独立单号
**状态**: ⚠️ **表不存在！**

#### 调查发现

- **数据库表**: 未找到 `purchase_forecasts` 或类似表
- **相关逻辑**: 未找到对应的 Server Actions
- **业务流程**: 当前系统没有"下单预计"功能

#### 需要修改的内容

**目标格式**: `PF{YYYY}{WW}{NN}` (新功能，需从零开发)

**开发任务**:
1. **创建数据库表**: `purchase_forecasts`
   - 字段: `forecast_number TEXT UNIQUE PRIMARY KEY`
   - 字段: `week_iso TEXT, sku TEXT, qty INTEGER, ...`
2. **创建 SQL 函数**: `get_next_purchase_forecast_number(week_iso TEXT)`
3. **创建 Server Action**: `upsertPurchaseForecast()`
4. **创建前端页面**: 下单预计管理界面
5. **定义业务逻辑**: 与 PO 的关联关系

**建议**: 暂缓开发此功能，等核心单号迁移完成后再处理

---

## 数据库函数统计

| 函数名 | 文件位置 | 状态 | 用途 |
|--------|----------|------|------|
| `get_next_po_number()` | 20251201_update_po_number_format.sql | ✅ 使用中 | 生成 PO 单号 |
| `get_next_delivery_number()` | 20251201_update_po_number_format.sql | ⚠️ 定义但未用 | 生成交货单号 (日期格式) |
| `validate_po_number_format()` | 20251201_update_po_number_format.sql | ✅ 使用中 | 验证 PO 格式 |
| `get_deliveries_by_po()` | 20251201_update_po_number_format.sql | ✅ 使用中 | 查询 PO 的所有交货单 |
| `get_deliveries_by_sku()` | 20251201_update_po_number_format.sql | ✅ 使用中 | 查询 SKU 的交货历史 |

---

## 前端工具函数统计

| 函数名 | 文件位置 | 用途 | 需要修改 |
|--------|----------|------|----------|
| `generatePONumber()` | src/lib/utils/po-number.ts:141 | 客户端生成 PO 号 | ✅ 是 (改为周格式) |
| `extractDateFromPO()` | src/lib/utils/po-number.ts:13 | 从 PO 提取日期 | ✅ 是 (改为提取周) |
| `extractSequenceFromPO()` | src/lib/utils/po-number.ts:40 | 提取序号 | ✅ 是 (调整正则) |
| `isValidPONumber()` | src/lib/utils/po-number.ts:77 | 验证格式 | ✅ 是 (更新正则) |
| `parsePONumber()` | src/lib/utils/po-number.ts:98 | 解析 PO 号 | ✅ 是 (返回周信息) |
| `formatPONumberForDisplay()` | src/lib/utils/po-number.ts:58 | 格式化显示 | ✅ 是 (调整分隔符) |
| `comparePONumbers()` | src/lib/utils/po-number.ts:156 | 比较大小 | ✅ 否 (仍可用) |
| `getPOPrefixForDate()` | src/lib/utils/po-number.ts:169 | 获取日期前缀 | ✅ 是 (改为周前缀) |

---

## 前端页面引用

### PO 单号相关
- `/src/app/procurement/new/page.tsx` - 创建采购单
- `/src/app/procurement/[id]/page.tsx` - 查看采购单详情
- `/src/app/procurement/[id]/edit/page.tsx` - 编辑采购单
- `/src/components/procurement/orders-table.tsx` - 采购单列表

### 交货单号相关
- `/src/app/procurement/deliveries/new/page.tsx` - 创建交货单 (行号: 64, 345)
- `/src/app/procurement/deliveries/[id]/page.tsx` - 查看交货单详情
- `/src/app/procurement/deliveries/[id]/edit/page.tsx` - 编辑交货单
- `/src/components/procurement/deliveries-table.tsx` - 交货单列表
- `/src/components/procurement/delivery-edit-form.tsx` - 编辑表单

### 运单号相关
- `/src/app/logistics/new/page.tsx` - 创建运单
- `/src/app/logistics/[id]/page.tsx` - 查看运单详情
- `/src/app/logistics/[id]/edit/page.tsx` - 编辑运单
- `/src/components/logistics/shipments-table.tsx` - 运单列表

---

## 迁移优先级建议

### Phase 1: 高优先级 (立即执行)
1. **PO 单号**: `PO{YYYYMMDD}{NN}` → `PO{YYYY}{WW}{NN}`
   - 影响范围: 中等 (已有完善工具函数)
   - 风险: 低 (有数据库函数支持)
   - 工作量: 2-3 小时

### Phase 2: 中优先级 (1周内完成)
2. **交货单号**: `DLV-{timestamp}` → `OF{YYYY}{WW}{NN}`
   - 影响范围: 大 (需重命名字段)
   - 风险: 中 (需数据迁移)
   - 工作量: 4-6 小时

### Phase 3: 低优先级 (按需开发)
3. **销量预计单号**: 新增 `SF{YYYY}{WW}{NN}`
   - 影响范围: 中等 (新增字段)
   - 风险: 低 (向后兼容)
   - 工作量: 3-4 小时

4. **下单预计单号**: 新增 `PF{YYYY}{WW}{NN}`
   - 影响范围: 无 (新功能)
   - 风险: 低 (从零开发)
   - 工作量: 8-10 小时 (含完整功能)

### Phase 4: 可选优化
5. **运单内部单号**: 新增 `OS{YYYY}{WW}{NN}`
   - 影响范围: 小 (不影响现有逻辑)
   - 风险: 低 (独立字段)
   - 工作量: 2-3 小时

---

## 技术实现建议

### 数据库层
```sql
-- 示例: 生成基于 ISO 周的单号
CREATE OR REPLACE FUNCTION get_next_po_number_by_week(p_week_iso TEXT)
RETURNS TEXT AS $$
DECLARE
  v_year TEXT;
  v_week TEXT;
  v_seq INTEGER;
BEGIN
  -- 解析 week_iso: "2025-W38" -> year=2025, week=38
  v_year := SUBSTRING(p_week_iso FROM 1 FOR 4);
  v_week := SUBSTRING(p_week_iso FROM 7 FOR 2);

  -- 查找本周最大序号
  SELECT COALESCE(MAX(
    REGEXP_REPLACE(po_number, '^PO' || v_year || v_week || '(\d{2})$', '\1')::INTEGER
  ), 0) + 1
  INTO v_seq
  FROM purchase_orders
  WHERE po_number LIKE 'PO' || v_year || v_week || '%';

  -- 生成单号: PO + YYYY + WW + NN
  RETURN 'PO' || v_year || v_week || LPAD(v_seq::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql;
```

### 应用层
```typescript
// 示例: 生成单号的 Server Action
export async function generatePONumberByWeek(weekIso: string): Promise<string> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_next_po_number_by_week', {
    p_week_iso: weekIso
  })

  if (error) throw new Error(`Failed to generate PO number: ${error.message}`)

  return data as string
}
```

---

## 数据迁移注意事项

### PO 单号迁移
```sql
-- 警告: 此操作不可逆！建议先备份数据
-- 将现有 PO 单号从日期格式转为周格式

-- 示例: PO2025120501 -> PO20254901 (2025年第49周第1个PO)
UPDATE purchase_orders
SET po_number = 'PO' ||
  to_char(actual_order_date, 'IYYY') ||
  to_char(actual_order_date, 'IW') ||
  LPAD(
    ROW_NUMBER() OVER (
      PARTITION BY to_char(actual_order_date, 'IYYY-"W"IW')
      ORDER BY created_at
    )::TEXT,
    2,
    '0'
  )
WHERE po_number LIKE 'PO%';
```

### 交货单号迁移
```sql
-- 1. 添加新列
ALTER TABLE production_deliveries ADD COLUMN fulfillment_number TEXT;

-- 2. 生成新单号
UPDATE production_deliveries
SET fulfillment_number = 'OF' ||
  to_char(actual_delivery_date, 'IYYY') ||
  to_char(actual_delivery_date, 'IW') ||
  LPAD(
    ROW_NUMBER() OVER (
      PARTITION BY to_char(actual_delivery_date, 'IYYY-"W"IW')
      ORDER BY created_at
    )::TEXT,
    2,
    '0'
  )
WHERE actual_delivery_date IS NOT NULL;

-- 3. 设置唯一约束
ALTER TABLE production_deliveries ADD CONSTRAINT uk_fulfillment_number UNIQUE (fulfillment_number);

-- 4. 删除旧列 (谨慎操作！)
-- ALTER TABLE production_deliveries DROP COLUMN delivery_number;
```

---

## 测试检查清单

### 单号生成测试
- [ ] 同一周内连续生成单号序号递增 (01, 02, 03...)
- [ ] 跨周后序号重置为 01
- [ ] 并发生成时无重复单号
- [ ] 格式验证函数能正确识别新旧格式

### 数据迁移测试
- [ ] 备份现有数据
- [ ] 迁移脚本在测试环境验证通过
- [ ] 迁移后所有关联关系完整
- [ ] 前端页面正常显示新单号

### 回归测试
- [ ] 创建 PO 流程正常
- [ ] 创建交货单流程正常
- [ ] 列表页排序/筛选功能正常
- [ ] 详情页显示正常
- [ ] 导出功能正常

---

## 风险评估

| 风险项 | 严重性 | 可能性 | 缓解措施 |
|--------|--------|--------|----------|
| 迁移后历史数据无法关联 | 高 | 低 | 保留旧字段作为备份 |
| 并发生成导致单号重复 | 高 | 中 | 使用数据库函数 + 唯一约束 |
| 前端缓存导致显示错误 | 中 | 中 | 清理缓存 + 版本号强制刷新 |
| 用户习惯改变导致混淆 | 低 | 高 | 提供用户培训文档 |

---

## 下一步行动

1. **决策**: Product Director 确认是否执行迁移
2. **设计**: System Architect 审核数据库迁移方案
3. **实施**: Backend Specialist 编写迁移脚本和新函数
4. **测试**: QA Director 执行完整测试
5. **部署**: 选择低峰期执行生产环境迁移

---

**报告结束**
**如有疑问，请联系 Backend Specialist**
