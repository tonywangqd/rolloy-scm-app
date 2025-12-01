# 采购管理数据库结构更新说明

**日期**: 2025-12-01
**更新内容**: PO订单号格式修改和交货数据结构优化

---

## 一、更新概述

本次更新主要实现以下功能：

1. **PO订单号格式标准化**: 从 `PO-YYYY-NNNN` 改为 `PO{YYYYMMDD}{NN}`
2. **交货数据结构完整性**: 确保 production_deliveries 表支持多次交货
3. **新增数据库函数**: 提供 PO 和交货号码自动生成功能
4. **新增查询视图**: 便于查询 PO 交货汇总信息
5. **TypeScript 类型完善**: 更新所有相关类型定义

---

## 二、修改的文件列表

### 1. 数据库迁移文件

**文件**: `/Users/tony/Desktop/rolloy-scm/supabase/migrations/20251201_update_po_number_format.sql`

**内容**:
- PO 订单号生成函数: `get_next_po_number(order_date)`
- 交货号码生成函数: `get_next_delivery_number(delivery_date)`
- PO 号码格式验证函数: `validate_po_number_format(po_num)`
- 交货查询函数: `get_deliveries_by_po(po_id_param)`
- SKU 交货查询函数: `get_deliveries_by_sku(sku_param, start_date, end_date)`
- 新增视图: `v_po_deliveries_summary`
- 新增索引优化

### 2. TypeScript 类型定义

**文件**: `/Users/tony/Desktop/rolloy-scm/src/lib/types/database.ts`

**新增类型**:
```typescript
// 新增数据库函数类型定义
Functions: {
  get_next_po_number: { Args: { order_date?: string }; Returns: string }
  get_next_delivery_number: { Args: { delivery_date?: string }; Returns: string }
  validate_po_number_format: { Args: { po_num: string }; Returns: boolean }
  get_deliveries_by_po: { Args: { po_id_param: string }; Returns: DeliveryDetail[] }
  get_deliveries_by_sku: {
    Args: { sku_param: string; start_date?: string; end_date?: string }
    Returns: DeliveryBySKU[]
  }
}

// 新增视图类型
export interface PODeliveriesSummaryView {
  po_id: string
  po_number: string
  batch_code: string
  po_status: POStatus
  actual_order_date: string | null
  supplier_name: string | null
  po_item_id: string
  sku: string
  channel_code: string | null
  ordered_qty: number
  total_delivered_qty: number
  sum_delivery_qty: number
  delivery_count: number
  remaining_qty: number
  fulfillment_percentage: number
  latest_delivery_date: string | null
  total_delivered_value_usd: number
  payment_statuses: PaymentStatus[] | null
}

// 新增交货详情类型
export interface DeliveryDetail {
  delivery_id: string
  delivery_number: string
  sku: string
  channel_code: string | null
  delivered_qty: number
  planned_delivery_date: string | null
  actual_delivery_date: string | null
  unit_cost_usd: number
  total_value_usd: number | null
  payment_status: PaymentStatus
  payment_due_date: string | null
  remarks: string | null
  created_at: string
}

// 新增 SKU 交货查询类型
export interface DeliveryBySKU {
  delivery_id: string
  delivery_number: string
  po_number: string
  batch_code: string
  supplier_name: string | null
  delivered_qty: number
  actual_delivery_date: string | null
  unit_cost_usd: number
  total_value_usd: number | null
  payment_status: PaymentStatus
}
```

### 3. 查询函数更新

**文件**: `/Users/tony/Desktop/rolloy-scm/src/lib/queries/procurement.ts`

**更新的函数**:

```typescript
// 更新：PO 订单号生成（支持日期参数）
export async function getNextPONumber(orderDate?: Date): Promise<string>

// 更新：交货号码生成（支持日期参数）
export async function getNextDeliveryNumber(deliveryDate?: Date): Promise<string>

// 新增：通过 PO ID 获取所有交货记录
export async function fetchDeliveriesByPOFunction(poId: string): Promise<DeliveryDetail[]>

// 新增：通过 SKU 获取交货记录（支持日期范围）
export async function fetchDeliveriesBySKU(
  sku: string,
  startDate?: string,
  endDate?: string
): Promise<DeliveryBySKU[]>

// 新增：获取 PO 交货汇总视图
export async function fetchPODeliveriesSummary(): Promise<PODeliveriesSummaryView[]>

// 新增：验证 PO 订单号格式
export async function validatePONumberFormat(poNumber: string): Promise<boolean>
```

### 4. 工具函数（新增）

**文件**: `/Users/tony/Desktop/rolloy-scm/src/lib/utils/po-number.ts`

**提供的工具函数**:

```typescript
// 从 PO 号码提取日期
extractDateFromPO(poNumber: string): Date | null

// 从 PO 号码提取序号
extractSequenceFromPO(poNumber: string): number | null

// 格式化 PO 号码用于显示
formatPONumberForDisplay(poNumber: string): string

// 验证 PO 号码格式（客户端）
isValidPONumber(poNumber: string): boolean

// 解析 PO 号码为组件
parsePONumber(poNumber: string): { date, sequence, year, month, day } | null

// 生成 PO 号码（客户端辅助）
generatePONumber(date: Date, sequence: number): string

// 比较两个 PO 号码
comparePONumbers(po1: string, po2: string): number

// 获取指定日期的 PO 前缀
getPOPrefixForDate(date: Date): string
```

---

## 三、PO订单号格式详解

### 旧格式
```
PO-2025-0001
PO-2025-0002
```

### 新格式
```
PO2025120101  (2025年12月01日的第1个PO)
PO2025120102  (2025年12月01日的第2个PO)
PO2025120301  (2025年12月03日的第1个PO)
```

### 格式规则
- **前缀**: `PO` (固定)
- **日期部分**: `YYYYMMDD` (8位数字，年月日)
- **序号部分**: `NN` (2位数字，01-99)
- **总长度**: 12个字符

### 优势
1. **可读性**: 从订单号直接看出下单日期
2. **排序性**: 字符串排序即为时间顺序
3. **唯一性**: 日期+序号保证每天最多99个PO
4. **查询性**: 便于按日期范围查询

---

## 四、数据库函数说明

### 1. get_next_po_number(order_date)

**功能**: 生成下一个 PO 订单号

**参数**:
- `order_date` (DATE, 可选): 下单日期，默认为当前日期

**返回**: TEXT - PO 订单号

**示例**:
```sql
SELECT get_next_po_number();                    -- PO2025120101
SELECT get_next_po_number('2025-12-03'::DATE);  -- PO2025120301
```

**逻辑**:
1. 提取日期部分 (YYYYMMDD)
2. 查询该日期已有的最大序号
3. 序号+1，不足2位补零
4. 拼接成完整 PO 号码

### 2. get_next_delivery_number(delivery_date)

**功能**: 生成下一个交货号码

**参数**:
- `delivery_date` (DATE, 可选): 交货日期，默认为当前日期

**返回**: TEXT - 交货号码

**示例**:
```sql
SELECT get_next_delivery_number();  -- DLV2025120101
```

### 3. validate_po_number_format(po_num)

**功能**: 验证 PO 号码格式是否正确

**参数**:
- `po_num` (TEXT): 待验证的 PO 号码

**返回**: BOOLEAN - true 表示格式正确

**示例**:
```sql
SELECT validate_po_number_format('PO2025120101');  -- true
SELECT validate_po_number_format('PO-2025-0001');  -- false
```

### 4. get_deliveries_by_po(po_id_param)

**功能**: 获取指定 PO 的所有交货记录

**参数**:
- `po_id_param` (UUID): PO 的 ID

**返回**: TABLE - 交货详情列表

**示例**:
```sql
SELECT * FROM get_deliveries_by_po('your-po-id-here');
```

### 5. get_deliveries_by_sku(sku_param, start_date, end_date)

**功能**: 获取指定 SKU 的交货记录，可按日期范围过滤

**参数**:
- `sku_param` (TEXT): SKU 代码
- `start_date` (DATE, 可选): 开始日期
- `end_date` (DATE, 可选): 结束日期

**返回**: TABLE - 交货记录列表

**示例**:
```sql
SELECT * FROM get_deliveries_by_sku('SKU001', '2025-01-01', '2025-12-31');
SELECT * FROM get_deliveries_by_sku('SKU001', NULL, NULL);  -- 全部记录
```

---

## 五、数据库视图说明

### v_po_deliveries_summary

**功能**: 提供 PO 交货汇总信息，包括履约百分比和付款状态

**字段**:
- `po_id`: PO ID
- `po_number`: PO 订单号
- `batch_code`: 批次代码
- `po_status`: PO 状态
- `actual_order_date`: 实际下单日期
- `supplier_name`: 供应商名称
- `po_item_id`: PO 行项目 ID
- `sku`: SKU 代码
- `channel_code`: 渠道代码
- `ordered_qty`: 订购数量
- `total_delivered_qty`: 总交货数量
- `sum_delivery_qty`: 交货汇总数量
- `delivery_count`: 交货次数
- `remaining_qty`: 剩余数量
- `fulfillment_percentage`: 履约百分比
- `latest_delivery_date`: 最新交货日期
- `total_delivered_value_usd`: 总交货价值（美元）
- `payment_statuses`: 付款状态数组

**查询示例**:
```sql
SELECT * FROM v_po_deliveries_summary
WHERE po_status = 'In Production'
ORDER BY actual_order_date DESC
LIMIT 10;
```

---

## 六、使用示例

### 1. 创建新 PO（前端/Server Action）

```typescript
import { getNextPONumber } from '@/lib/queries/procurement'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function createPurchaseOrder(orderData: any) {
  const supabase = await createServerSupabaseClient()

  // 生成 PO 号码（基于下单日期）
  const orderDate = new Date(orderData.actual_order_date)
  const poNumber = await getNextPONumber(orderDate)

  // 插入 PO
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      po_number: poNumber,
      batch_code: orderData.batch_code,
      supplier_id: orderData.supplier_id,
      actual_order_date: orderData.actual_order_date,
      // ... 其他字段
    })
    .select()
    .single()

  return { data, error }
}
```

### 2. 创建交货记录

```typescript
import { getNextDeliveryNumber } from '@/lib/queries/procurement'

export async function createDelivery(deliveryData: any) {
  const supabase = await createServerSupabaseClient()

  // 生成交货号码（基于交货日期）
  const deliveryDate = new Date(deliveryData.actual_delivery_date)
  const deliveryNumber = await getNextDeliveryNumber(deliveryDate)

  // 插入交货记录
  const { data, error } = await supabase
    .from('production_deliveries')
    .insert({
      delivery_number: deliveryNumber,
      po_item_id: deliveryData.po_item_id,
      sku: deliveryData.sku,
      delivered_qty: deliveryData.delivered_qty,
      actual_delivery_date: deliveryData.actual_delivery_date,
      unit_cost_usd: deliveryData.unit_cost_usd,
      // ... 其他字段
    })
    .select()
    .single()

  return { data, error }
}
```

### 3. 查询 PO 的所有交货记录

```typescript
import { fetchDeliveriesByPOFunction } from '@/lib/queries/procurement'

export async function getPODeliveries(poId: string) {
  const deliveries = await fetchDeliveriesByPOFunction(poId)

  console.log(`找到 ${deliveries.length} 条交货记录`)
  deliveries.forEach(d => {
    console.log(`${d.delivery_number}: ${d.delivered_qty} units on ${d.actual_delivery_date}`)
  })

  return deliveries
}
```

### 4. 查询 SKU 的交货历史

```typescript
import { fetchDeliveriesBySKU } from '@/lib/queries/procurement'

export async function getSKUDeliveryHistory(sku: string) {
  // 查询最近6个月的交货记录
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const deliveries = await fetchDeliveriesBySKU(sku, startDate, endDate)

  return deliveries
}
```

### 5. 使用工具函数解析 PO 号码

```typescript
import { parsePONumber, isValidPONumber } from '@/lib/utils/po-number'

// 验证格式
if (!isValidPONumber('PO2025120101')) {
  throw new Error('Invalid PO number format')
}

// 解析 PO 号码
const parsed = parsePONumber('PO2025120101')
if (parsed) {
  console.log(`下单日期: ${parsed.date}`)
  console.log(`序号: ${parsed.sequence}`)
  console.log(`年: ${parsed.year}, 月: ${parsed.month}, 日: ${parsed.day}`)
}
```

---

## 七、部署步骤

### 1. 应用 SQL 迁移

在 Supabase SQL Editor 中执行：

```sql
-- 方式一：直接执行迁移文件
-- 复制 /supabase/migrations/20251201_update_po_number_format.sql 的内容
-- 粘贴到 SQL Editor 并执行

-- 方式二：使用 Supabase CLI
supabase db reset  -- 开发环境
-- 或
supabase db push   -- 推送到远程
```

### 2. 验证函数和视图

```sql
-- 测试 PO 号码生成
SELECT get_next_po_number();
SELECT get_next_po_number('2025-12-03'::DATE);

-- 测试交货号码生成
SELECT get_next_delivery_number();

-- 测试格式验证
SELECT validate_po_number_format('PO2025120101');  -- 应返回 true
SELECT validate_po_number_format('PO-2025-0001');  -- 应返回 false

-- 查看视图数据
SELECT * FROM v_po_deliveries_summary LIMIT 5;
```

### 3. 更新现有数据（可选）

如果需要将现有的 PO 号码迁移到新格式：

```sql
-- 警告：这会修改现有数据，请先备份！
-- 仅在测试环境执行，生产环境需要更谨慎的迁移策略

UPDATE purchase_orders
SET po_number = 'PO' || TO_CHAR(actual_order_date, 'YYYYMMDD') || '01'
WHERE actual_order_date IS NOT NULL
  AND po_number NOT LIKE 'PO_________%';  -- 只更新旧格式
```

### 4. 部署前端代码

```bash
# 提交代码
git add .
git commit -m "feat: 更新 PO 订单号格式为日期格式 (PO{YYYYMMDD}{NN})"

# 推送到仓库
git push origin main

# Vercel 会自动部署
```

---

## 八、索引优化

迁移文件已添加以下索引以提升查询性能：

```sql
-- production_deliveries 表索引
CREATE INDEX idx_production_deliveries_po_item_id ON production_deliveries(po_item_id);
CREATE INDEX idx_production_deliveries_delivery_date ON production_deliveries(actual_delivery_date);
CREATE INDEX idx_production_deliveries_payment_status ON production_deliveries(payment_status);
CREATE INDEX idx_production_deliveries_sku_date ON production_deliveries(sku, actual_delivery_date);
```

这些索引优化了以下查询场景：
- 通过 PO 查询交货记录
- 按交货日期范围查询
- 按付款状态筛选
- SKU + 日期的组合查询

---

## 九、注意事项

### 1. 向后兼容性
- 新格式不兼容旧格式的 PO 号码
- 如果数据库中存在旧格式 PO，需要数据迁移
- 建议在测试环境先验证

### 2. 序号限制
- 每天最多支持 99 个 PO（01-99）
- 如果超过，需要联系管理员调整格式（可改为3位序号）

### 3. 时区问题
- 函数使用数据库服务器时区
- 前端传递日期时需要确保时区一致
- 建议统一使用 UTC 或固定时区

### 4. 性能考虑
- 生成 PO 号码的函数使用了正则表达式，性能良好
- 索引已优化，支持高并发查询
- 视图使用 LEFT JOIN，大数据量时注意性能

---

## 十、故障排查

### 问题 1: RPC 函数调用失败

**错误**: `Error generating PO number: function get_next_po_number does not exist`

**解决**:
1. 确认迁移文件已执行
2. 检查 Supabase 函数列表：Database > Functions
3. 手动在 SQL Editor 执行函数创建语句

### 问题 2: PO 号码重复

**原因**: 并发创建 PO 时可能出现序号冲突

**解决**:
1. 数据库函数已使用事务保护
2. 如遇重复，可在应用层重试
3. 考虑添加唯一约束：
   ```sql
   ALTER TABLE purchase_orders ADD CONSTRAINT unique_po_number UNIQUE (po_number);
   ```

### 问题 3: 日期解析错误

**错误**: Invalid date format

**解决**:
1. 确保传递 ISO 8601 格式日期字符串 (YYYY-MM-DD)
2. 使用 `date.toISOString().split('T')[0]` 格式化日期
3. 检查时区设置

---

## 十一、后续优化建议

1. **批量导入**: 如果需要批量创建 PO，可以添加批量号码生成函数
2. **审计日志**: 记录 PO 号码生成历史，便于追踪
3. **自动序号重置**: 考虑每月或每年重置序号（需求确认）
4. **报表优化**: 基于新视图创建更多统计报表
5. **权限控制**: 为数据库函数添加 RLS 策略

---

## 十二、联系方式

如有问题或需要支持，请联系开发团队。

**文档版本**: 1.0
**最后更新**: 2025-12-01
