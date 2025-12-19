# 未发货数量预计发运日期 - 设计摘要

## 核心问题

**现状：** 创建发运单时可以部分发货（如交货100台，本次只发50台），但剩余50台没有预计发运日期，导致库存预测算法无法考虑这些货物。

**目标：** 为未发货数量指定预计发运日期，让12周库存预测算法能够准确预测未来到货量。

---

## 设计方案对比

### 方案C（推荐）：创建计划发运记录

**核心思路：** 完全参考采购交货模块的"计划交货"设计模式

```
创建发运单时：
1. 用户选择交货记录（100件），输入本次发运50件
2. 系统提示剩余50件未发，询问是否指定预计发运日期
3. 用户输入：预计发运周次 2025-W05
4. 系统创建：
   - 实际发运记录（50件，actual_departure_date = 2025-01-20）
   - 计划发运记录（50件，planned_departure_date = 2025-02-03，status = 'draft'）
```

**优势：**
- ✅ **完全复用现有表结构**（`shipments` 表已有 `planned_departure_date` 字段）
- ✅ **与采购模块一致**（planned_delivery_date 同样逻辑）
- ✅ **支持双轨查询**（`COALESCE(actual_departure_date, planned_departure_date)`）
- ✅ **无需数据库迁移**（仅需新增 RPC 函数）
- ✅ **可追溯**（计划发运记录可后续转为实际发运）

---

## 数据流程

```
┌──────────────────────────────────────┐
│ 用户操作：创建发运单                 │
│ - 选择交货 DLV-001 (100件)           │
│ - 本次发运 50件                      │
│ - 剩余 50件                          │
└──────────────────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│ 用户输入（可选）                     │
│ - 剩余50件预计发运周次: 2025-W05    │
│ - 预计运输天数: 40天                 │
└──────────────────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│ 系统创建 2条记录                     │
│                                      │
│ 1. 实际发运 (shipments)              │
│    - tracking_number: TRK-2025-001   │
│    - actual_departure_date: 今天     │
│    - shipped_qty: 50                 │
│    - status: 'in_transit'            │
│                                      │
│ 2. 计划发运 (shipments)              │
│    - tracking_number: PLANNED-W05-.. │
│    - planned_departure_date: W05周一 │
│    - shipped_qty: 50                 │
│    - status: 'draft'                 │
└──────────────────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│ 库存预测算法                         │
│ SELECT ... WHERE                     │
│   COALESCE(actual_departure_date,    │
│            planned_departure_date)   │
│   BETWEEN today AND +12weeks         │
└──────────────────────────────────────┘
```

---

## 关键技术点

### 1. 数据库设计（无需修改）

```sql
-- shipments 表已有所需字段
CREATE TABLE shipments (
  id UUID,
  tracking_number TEXT,
  actual_departure_date DATE,     -- 实际发运日期
  planned_departure_date DATE,    -- 计划发运日期 ← 已存在！
  actual_arrival_date DATE,       -- 实际到货日期
  planned_arrival_date DATE,      -- 计划到货日期 ← 已存在！
  shipment_status TEXT,           -- 'draft' | 'in_transit' | 'arrived'
  ...
);

-- 新增 RPC 函数
CREATE FUNCTION create_shipment_with_planned_remaining(
  p_tracking_number TEXT,
  p_allocations JSONB,
  p_planned_remaining JSONB  -- ← 新增参数：{"week_iso": "2025-W05", "planned_qty": 50}
) RETURNS TABLE(success BOOLEAN, actual_shipment_id UUID, planned_shipment_id UUID);
```

### 2. TypeScript 类型定义

```typescript
export interface PlannedShipmentSpec {
  week_iso: string          // "2025-W05"
  planned_qty: number       // 50
  planned_arrival_days?: number  // 40 (默认)
}

export interface ShipmentWithPlannedRemainingInput {
  tracking_number: string
  allocations: { delivery_id: string; shipped_qty: number }[]
  planned_remaining?: PlannedShipmentSpec | null  // ← 新增
}
```

### 3. 前端组件

```tsx
<PlannedRemainingSection
  remainingQty={50}  // 自动计算：已选交货总量 - 本次发运总量
  onPlanChange={(plan) => {
    if (plan) {
      setPlannedRemaining({
        week_iso: plan.week_iso,
        planned_qty: remainingQty,
        planned_arrival_days: plan.planned_arrival_days
      })
    }
  }}
/>
```

---

## 实施计划

### Phase 1: 数据库 (1周)
- [ ] 创建迁移文件：`20251219_shipment_planned_remaining.sql`
- [ ] 实现 RPC 函数：`create_shipment_with_planned_remaining`
- [ ] 测试：创建实际发运 + 计划发运记录

### Phase 2: 后端 (1周)
- [ ] 添加 TypeScript 类型定义
- [ ] 实现 Server Action：`createShipmentWithPlannedRemaining`
- [ ] 更新库存预测查询（支持计划发运日期）

### Phase 3: 前端 (1-2周)
- [ ] 创建组件：`PlannedRemainingSection`
- [ ] 修改页面：`/logistics/shipments/new`
- [ ] 表单验证（周次格式、数量匹配）

### Phase 4: 测试 & 上线 (1周)
- [ ] 集成测试（创建发运 → 验证计划记录 → 检查库存预测）
- [ ] UAT（物流团队验收）
- [ ] 生产环境部署

---

## 业务价值

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| 库存预测准确率 | 70% | 90%+ | +20% |
| 误报缺货警告 | 30次/月 | <5次/月 | -83% |
| 供应链可见性 | 2周 | 12周 | 6倍 |

---

## 与采购模块的一致性

| 维度 | 采购交货 | 物流发运 | 一致性 |
|------|----------|----------|--------|
| 计划记录 | `planned_delivery_date` | `planned_departure_date` | ✅ |
| 实际记录 | `actual_delivery_date` | `actual_departure_date` | ✅ |
| 双轨查询 | `COALESCE(actual, planned)` | `COALESCE(actual, planned)` | ✅ |
| 用户输入 | ISO周 + 数量分配 | ISO周 + 数量（自动） | ✅ |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 用户忘记填写计划日期 | 库存预测不准 | 功能可选，不填也不影响创建发运 |
| 计划日期与实际偏差 | 预测误差 | 后续支持编辑计划发运记录 |
| 计划记录混淆 | 用户分不清计划/实际 | UI标记（Badge、颜色区分） |

---

## 文件清单

```
specs/shipment-planned-date/
├── design.md                    # 完整技术设计（本文档）
├── SUMMARY.md                   # 本摘要文档
└── (后续)
    ├── implementation.md        # 实施指南
    └── testing.md               # 测试用例
```

---

**设计完成日期：** 2025-12-19
**设计文档路径：** `/Users/tony/Desktop/rolloy-scm/specs/shipment-planned-date/design.md`
**下一步：** 待 Backend Specialist 和 Frontend Artisan 实施
