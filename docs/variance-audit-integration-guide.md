# 差异追踪与算法审计集成指南

## 概述

本文档说明如何将 `supply_chain_variances` 表的数据集成到算法审计V4中，实现"剩余数量"的计划处理时间追踪。

---

## 集成原理

### 数据流

```
供应链差异追踪
  ↓
supply_chain_variances
  - source_type: 'order_to_delivery' | 'delivery_to_ship'
  - pending_qty: 剩余数量
  - planned_week: 用户设置的预计处理周
  ↓
算法审计V4查询
  - 读取差异数据
  - 根据 planned_week 调整 planned_* 值
  ↓
算法审计表展示
  - 显示修正后的 planned_factory_ship / planned_ship
  - Hover Tooltip 显示差异来源
```

---

## 集成步骤

### Step 1: 修改算法审计查询函数

在 `src/lib/queries/algorithm-audit-v4.ts` 中添加差异数据获取：

```typescript
import { fetchVarianceAdjustmentsForAudit } from '@/lib/queries/supply-chain-variances'
import type { VarianceAdjustment } from '@/lib/types/database'

/**
 * 获取算法审计数据 (V4 - 带差异调整)
 */
export async function fetchAlgorithmAuditV4(
  sku: string,
  shippingWeeks: number = 5
): Promise<AlgorithmAuditResultV4> {
  // 1. 生成周范围
  const weeks = generateWeekRange(-4, 11) // ["2025-W49", "2025-W50", ...]

  // 2. 获取差异调整数据
  const varianceAdjustments = await fetchVarianceAdjustmentsForAudit(sku, weeks)

  // 3. 获取基础数据 (销售、订单、交货、发货等)
  const baseData = await fetchBaseAuditData(sku, weeks)

  // 4. 生成算法审计行
  const rows: AlgorithmAuditRowV4[] = weeks.map((week, index) => {
    const baseRow = calculateBaseRow(week, index, baseData)

    // 应用差异调整
    const adjustment = varianceAdjustments.get(week)
    return applyVarianceAdjustment(baseRow, adjustment)
  })

  return {
    product: baseData.product,
    rows,
    leadTimes: baseData.leadTimes,
    metadata: { /* ... */ }
  }
}
```

### Step 2: 应用差异调整逻辑

```typescript
/**
 * 应用差异调整到算法审计行
 */
function applyVarianceAdjustment(
  row: AlgorithmAuditRowV4,
  adjustment: VarianceAdjustment | undefined
): AlgorithmAuditRowV4 {
  if (!adjustment) return row

  return {
    ...row,

    // 修正 planned_factory_ship (下单→出货差异)
    planned_factory_ship: row.planned_factory_ship + adjustment.factory_ship_adjustment,

    // 修正 planned_ship (出货→发货差异)
    planned_ship: row.planned_ship + adjustment.ship_adjustment,

    // 添加差异来源标记 (用于 Hover Tooltip)
    variance_adjustments: adjustment.variances.map(v => ({
      variance_id: v.id,
      source_type: v.source_type,
      pending_qty: v.pending_qty,
      planned_week: v.planned_week,
      remarks: v.remarks,
      source_reference: getSourceReference(v) // "PO#2025-001-A (5件待出货)"
    }))
  }
}

/**
 * 获取差异来源引用 (用于显示)
 */
function getSourceReference(variance: SupplyChainVariance): string {
  // 根据 source_type 查询关联记录，返回可读的引用字符串
  // 例如: "PO#2025-001-A (5件待出货)" 或 "DL#D-2025-001 (3件待发货)"
  return `${variance.source_type} - ${variance.pending_qty}件`
}
```

### Step 3: 前端展示集成

在算法审计表的 Hover Tooltip 中显示差异信息：

```typescript
// components/algorithm-audit/AuditTableCell.tsx

function PlannedFactoryShipCell({ row }: { row: AlgorithmAuditRowV4 }) {
  const hasVarianceAdjustment = row.variance_adjustments && row.variance_adjustments.length > 0

  return (
    <HoverCard>
      <HoverCardTrigger>
        <div className={hasVarianceAdjustment ? "text-orange-600 font-semibold" : ""}>
          {row.planned_factory_ship}
          {hasVarianceAdjustment && <span className="ml-1">*</span>}
        </div>
      </HoverCardTrigger>

      <HoverCardContent>
        <div className="space-y-2">
          <p className="text-sm font-semibold">计划工厂出货</p>
          <p className="text-sm text-muted-foreground">
            基础值: {row.planned_factory_ship - (row.variance_adjustments?.[0]?.pending_qty || 0)}
          </p>

          {row.variance_adjustments?.map(adj => (
            <div key={adj.variance_id} className="text-sm border-t pt-2">
              <p className="font-medium text-orange-600">+ {adj.pending_qty} (差异调整)</p>
              <p className="text-muted-foreground">来源: {adj.source_reference}</p>
              {adj.remarks && <p className="text-xs italic">{adj.remarks}</p>}
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
```

---

## 使用场景

### 场景1: 采购订单部分交货

**业务流程:**
1. 采购订单 `PO-2025-001-A` 下单 50 件
2. 工厂第一次交货 45 件
3. 系统自动创建差异记录:
   - `source_type`: `order_to_delivery`
   - `planned_qty`: 50
   - `fulfilled_qty`: 45
   - `pending_qty`: 5 (自动计算)
   - `status`: `pending`

**用户操作:**
4. 用户在差异管理页面设置 `planned_week = 2026-W10`
5. 状态自动更新为 `scheduled`

**算法审计展示:**
6. 在 2026-W10 的 `planned_factory_ship` 列显示额外的 5 件
7. Hover 显示："来自 PO#2025-001-A 的待出货差异"

### 场景2: 工厂交货后部分发货

**业务流程:**
1. 工厂交货 `DL-2025-001` 交付 45 件
2. 物流发货 `SH-001` 仅装载 40 件
3. 系统自动创建差异记录:
   - `source_type`: `delivery_to_ship`
   - `planned_qty`: 45
   - `fulfilled_qty`: 40
   - `pending_qty`: 5

**用户操作:**
4. 用户设置 `planned_week = 2026-W11` (下一批发货)

**算法审计展示:**
5. 在 2026-W11 的 `planned_ship` 列显示额外的 5 件
6. Hover 显示："来自 DL#D-2025-001 的待发货差异"

---

## 数据查询示例

### 查询某个 SKU 的所有差异

```typescript
import { fetchVariancesBySKU } from '@/lib/queries/supply-chain-variances'

const variances = await fetchVariancesBySKU('SKU-001', false) // 不包含已完成
console.log(variances)
/*
[
  {
    id: 'uuid-1',
    source_type: 'order_to_delivery',
    source_reference: 'PO#2025-001-A (50 ordered)',
    sku: 'SKU-001',
    pending_qty: 5,
    planned_week: '2026-W10',
    status: 'scheduled',
    priority: 'Medium',
    age_days: 7
  }
]
*/
```

### 更新差异的预计处理周

```typescript
import { updateVariancePlannedWeek } from '@/lib/actions/supply-chain-variances'

const result = await updateVariancePlannedWeek(
  'variance-uuid',
  '2026-W12',
  '供应商承诺第12周出货'
)

console.log(result.success) // true
```

### 批量设置预计处理周

```typescript
import { batchUpdateVariancePlannedWeek } from '@/lib/actions/supply-chain-variances'

const result = await batchUpdateVariancePlannedWeek([
  { variance_id: 'uuid-1', planned_week: '2026-W10' },
  { variance_id: 'uuid-2', planned_week: '2026-W11' },
  { variance_id: 'uuid-3', planned_week: '2026-W12' }
])

console.log(result.updated_count) // 3
```

---

## 算法审计类型扩展

为了支持差异显示，需要扩展 `AlgorithmAuditRowV4` 类型：

```typescript
// src/lib/types/database.ts

export interface AlgorithmAuditRowV4 extends AlgorithmAuditRowV3 {
  // ... 原有字段 ...

  // 差异调整信息 (新增)
  variance_adjustments?: {
    variance_id: string
    source_type: VarianceSourceType
    pending_qty: number
    planned_week: string
    remarks: string | null
    source_reference: string  // "PO#2025-001-A (5件待出货)"
  }[]
}
```

---

## 数据库触发器 (可选 - 自动同步)

如果希望在 PO/Delivery 更新时自动同步差异表，可以添加触发器：

```sql
-- 自动同步 PO Item 差异
CREATE OR REPLACE FUNCTION sync_po_item_variance()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM upsert_po_item_variance(
    NEW.id,
    NEW.sku,
    NEW.channel_code,
    NEW.ordered_qty,
    NEW.delivered_qty
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_po_item_variance
  AFTER INSERT OR UPDATE OF delivered_qty
  ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_po_item_variance();

-- 自动同步 Delivery 差异
CREATE OR REPLACE FUNCTION sync_delivery_variance()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM upsert_delivery_variance(
    NEW.id,
    NEW.sku,
    NEW.channel_code,
    NEW.delivered_qty,
    NEW.shipped_qty
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_delivery_variance
  AFTER INSERT OR UPDATE OF shipped_qty
  ON production_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION sync_delivery_variance();
```

**注意**: 这些触发器会在每次更新时执行，需要评估性能影响。

---

## 测试清单

### 单元测试

- [ ] `fetchVarianceAdjustmentsForAudit` 返回正确的调整数据
- [ ] `applyVarianceAdjustment` 正确修正 planned_* 值
- [ ] 差异 `status` 自动更新逻辑正确

### 集成测试

- [ ] 创建 PO → 部分交货 → 差异记录自动生成
- [ ] 设置 `planned_week` → 算法审计表反映变化
- [ ] 完成交货 → 差异记录自动关闭 (`status = completed`)
- [ ] 逾期检测正确 (planned_week < 当前周 → `status = overdue`)

### UI测试

- [ ] 算法审计表 Hover Tooltip 显示差异信息
- [ ] 差异管理页面可以批量设置 `planned_week`
- [ ] Dashboard KPI 显示"待处理差异数量"

---

## 性能优化建议

1. **索引优化**: 已创建关键索引 (`sku`, `status`, `planned_week`, `source`)
2. **批量查询**: 使用 `in()` 查询多周差异数据
3. **缓存**: 对于不常变化的差异数据，可以缓存 5 分钟
4. **异步同步**: 差异记录的创建/更新可以异步处理，不阻塞主流程

---

## 常见问题 (FAQ)

**Q1: 如果用户不设置 `planned_week`，算法审计表如何显示？**

A: 不做任何调整，使用默认的反推逻辑。差异记录保持 `status = pending`。

**Q2: 一个 PO Item 产生多次差异怎么办？**

A: 使用 `UNIQUE (source_type, source_id)` 约束，同一个源记录只有一条差异记录。多次部分交货会更新 `fulfilled_qty`。

**Q3: 如何处理已取消的差异？**

A: 调用 `cancelVariance()` 设置 `status = cancelled`。算法审计查询会忽略 `cancelled` 状态的差异。

**Q4: 差异数据会自动传播到下游吗？**

A: 不会自动传播。差异调整只影响用户设置的 `planned_week`。如果需要连锁调整，需要手动设置每个环节的差异。

---

## 相关文档

- `/specs/supply-chain-variance-management/design.md` - 完整设计文档
- `/supabase/migrations/20251208000002_supply_chain_variance_tracking.sql` - 迁移脚本
- `/docs/algorithm-audit-v4-usage.md` - 算法审计V4使用文档

---

**文档版本**: 1.0.0
**创建日期**: 2025-12-08
**最后更新**: 2025-12-08
