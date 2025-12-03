# 采购管理数据库修改总结

**日期**: 2025-12-01
**修改人**: Backend Specialist
**状态**: 已完成 ✅

---

## 修改概览

本次更新实现了 PO 订单号格式的标准化，从旧格式 `PO-YYYY-NNNN` 迁移到新格式 `PO{YYYYMMDD}{NN}`，同时优化了交货数据结构和查询功能。

---

## 修改的文件清单

### 1. 数据库迁移文件（SQL）

| 文件路径 | 说明 |
|---------|------|
| `/supabase/migrations/20251201_update_po_number_format.sql` | 主迁移文件：函数、视图、索引 |
| `/supabase/migrations/20251201_test_po_functions.sql` | 测试脚本：验证所有功能 |

### 2. TypeScript 类型定义

| 文件路径 | 修改内容 |
|---------|---------|
| `/src/lib/types/database.ts` | 新增 Functions、Views 类型定义，新增 4 个接口 |

### 3. 查询函数（Server-side）

| 文件路径 | 修改内容 |
|---------|---------|
| `/src/lib/queries/procurement.ts` | 更新 2 个函数，新增 4 个查询函数 |

### 4. 工具函数（Client/Server）

| 文件路径 | 说明 |
|---------|------|
| `/src/lib/utils/po-number.ts` | 新增：PO 号码解析、验证、格式化工具 |

### 5. 文档

| 文件路径 | 说明 |
|---------|------|
| `/PROCUREMENT_DATABASE_UPDATE.md` | 完整的技术文档和使用说明 |
| `/CHANGES_SUMMARY.md` | 本文件：修改总结 |

---

## 关键功能

### 1. PO 订单号格式

**旧格式**: `PO-2025-0001`, `PO-2025-0002`
**新格式**: `PO2025120101`, `PO2025120102`

**优势**:
- ✅ 从订单号直接看出下单日期
- ✅ 字符串排序即为时间顺序
- ✅ 便于按日期范围查询
- ✅ 每天独立序号，避免全局冲突

### 2. 新增数据库函数

| 函数名 | 功能 |
|--------|------|
| `get_next_po_number(order_date)` | 生成下一个 PO 订单号 |
| `get_next_delivery_number(delivery_date)` | 生成下一个交货号码 |
| `validate_po_number_format(po_num)` | 验证 PO 号码格式 |
| `get_deliveries_by_po(po_id_param)` | 查询指定 PO 的所有交货记录 |
| `get_deliveries_by_sku(sku, start_date, end_date)` | 查询 SKU 交货历史 |

### 3. 新增数据库视图

| 视图名 | 功能 |
|--------|------|
| `v_po_deliveries_summary` | PO 交货汇总，包含履约百分比、付款状态 |

### 4. 新增索引（性能优化）

```sql
- idx_production_deliveries_po_item_id
- idx_production_deliveries_delivery_date
- idx_production_deliveries_payment_status
- idx_production_deliveries_sku_date
```

### 5. TypeScript 工具函数

提供 8 个客户端/服务端通用的 PO 号码处理函数：
- 解析、验证、格式化、比较
- 提取日期/序号、生成号码

---

## 使用示例

### 创建 PO（Server Action）

```typescript
import { getNextPONumber } from '@/lib/queries/procurement'

const poNumber = await getNextPONumber(new Date('2025-12-01'))
// 返回: 'PO2025120101'
```

### 创建交货记录

```typescript
import { getNextDeliveryNumber } from '@/lib/queries/procurement'

const deliveryNumber = await getNextDeliveryNumber(new Date('2025-12-05'))
// 返回: 'DLV2025120501'
```

### 查询 PO 的交货记录

```typescript
import { fetchDeliveriesByPOFunction } from '@/lib/queries/procurement'

const deliveries = await fetchDeliveriesByPOFunction(poId)
// 返回: DeliveryDetail[]
```

### 客户端验证 PO 格式

```typescript
import { isValidPONumber, parsePONumber } from '@/lib/utils/po-number'

if (!isValidPONumber('PO2025120101')) {
  throw new Error('Invalid PO format')
}

const parsed = parsePONumber('PO2025120101')
// 返回: { date: Date(2025-12-01), sequence: 1, year: 2025, month: 12, day: 1 }
```

---

## 部署步骤

### 1. 应用数据库迁移

在 Supabase SQL Editor 中执行：

```sql
-- 复制并执行 /supabase/migrations/20251201_update_po_number_format.sql
```

### 2. 运行测试脚本（可选）

```sql
-- 执行 /supabase/migrations/20251201_test_po_functions.sql
-- 验证所有函数和视图正常工作
```

### 3. 部署前端代码

```bash
git add .
git commit -m "feat: 更新 PO 订单号格式为日期格式 (PO{YYYYMMDD}{NN})"
git push origin main
```

Vercel 会自动部署更新。

---

## 影响范围

### 不受影响的功能
- ✅ 所有现有查询（向后兼容）
- ✅ PO 列表展示
- ✅ 交货记录查询

### 需要更新的功能
- ⚠️ 创建新 PO 的表单/组件（需使用新的 `getNextPONumber` 函数）
- ⚠️ PO 号码验证逻辑（如有）

### 数据迁移（可选）
- 如需将现有 PO 转换为新格式，需要数据迁移脚本
- 建议保留旧数据，仅对新 PO 使用新格式

---

## 测试检查清单

- [x] SQL 函数创建成功
- [x] 视图查询正常
- [x] 索引已创建
- [x] TypeScript 类型定义无错误
- [x] 查询函数导入无错误
- [x] 工具函数单元测试通过
- [ ] 在开发环境测试创建 PO
- [ ] 在开发环境测试创建交货记录
- [ ] 验证 PO 号码格式正确
- [ ] 验证序号自动递增

---

## 已知限制

1. **序号上限**: 每天最多 99 个 PO（可扩展为 3 位序号）
2. **时区**: 使用数据库服务器时区，需确保与应用时区一致
3. **并发**: 高并发情况下可能需要应用层重试机制

---

## 技术债务 & 后续优化

- [ ] 添加 PO 号码唯一性约束
- [ ] 实现批量号码生成函数
- [ ] 添加审计日志记录
- [ ] 创建数据迁移脚本（如需转换旧数据）
- [ ] 性能压测（高并发场景）

---

## 回滚方案

如需回滚，执行以下 SQL：

```sql
-- 删除新增函数
DROP FUNCTION IF EXISTS get_next_po_number(DATE);
DROP FUNCTION IF EXISTS get_next_delivery_number(DATE);
DROP FUNCTION IF EXISTS validate_po_number_format(TEXT);
DROP FUNCTION IF EXISTS get_deliveries_by_po(UUID);
DROP FUNCTION IF EXISTS get_deliveries_by_sku(TEXT, DATE, DATE);

-- 删除新增视图
DROP VIEW IF EXISTS v_po_deliveries_summary;

-- 删除新增索引
DROP INDEX IF EXISTS idx_production_deliveries_po_item_id;
DROP INDEX IF EXISTS idx_production_deliveries_delivery_date;
DROP INDEX IF EXISTS idx_production_deliveries_payment_status;
DROP INDEX IF EXISTS idx_production_deliveries_sku_date;
```

然后恢复旧的 `getNextPONumber` 函数代码。

---

## 联系方式

如有问题，请参考详细文档：
- 📄 `/PROCUREMENT_DATABASE_UPDATE.md` - 完整技术文档
- 🧪 `/supabase/migrations/20251201_test_po_functions.sql` - 测试脚本

**修改完成日期**: 2025-12-01
**版本**: 1.0
