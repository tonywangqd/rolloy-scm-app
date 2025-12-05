# Algorithm Audit V4 - Executive Summary

## What's Wrong with V3?

### Critical Bug 1: Sales-to-Order Mismatch
```
预计销量 55 → 系统计算应下单 55
实际下单 35 → 但系统继续用 55 计算后续环节

结果:
  ✗ 工厂出货显示 55 (错误!)
  ✗ 物流发货显示 55 (错误!)
  ✗ 到仓显示 55 (错误!)
  ✗ 库存增加 55 (错误!)

实际应该:
  ✓ 只有 35 会最终到仓
  ✓ 库存应该增加 35
  ✓ 20件缺口应标记为"未覆盖需求"
```

### Critical Bug 2: Double Counting
```
当前逻辑:
  planned_arrival = 35 (从销量反推)
  actual_arrival = 10 (从物流记录)
  arrival_effective = COALESCE(10, 35) = 10 ✓

但如果同时存在:
  planned_arrival = 55 (从预计销量反推)
  actual_arrival = 35 (从实际下单正向传播)

系统可能错误地:
  - 显示两个数字都存在
  - 或者选错数字
  - 导致库存计算偏差
```

### Critical Bug 3: No Traceability
```
用户看到 "下单 35"
问题: 这35来自哪个PO?
答案: 不知道!

用户看到 "交付 10"
问题: 这10来自哪个交货单?
答案: 不知道!

无法:
  ✗ 审计数据来源
  ✗ 排查差异
  ✗ 追溯责任人
  ✗ 满足财务合规
```

---

## V4 Solution: 3 Major Fixes

### Fix 1: Forward Propagation (正向传播)

**New Logic:**
```
一旦实际下单,就启动正向传播:

W02: 实际下单 35
  ↓ +5周 (生产周期)
W07: 预计工厂出货 35
  ↓ +1周 (装柜周期)
W08: 预计物流发货 35
  ↓ +5周 (物流周期)
W13: 预计到仓 35

覆盖原来的反向计算值!
```

**Business Rule:**
```python
if actual_order > 0:
    # 从实际订单正向传播
    planned_factory_ship = forward_propagate(actual_order, +5 weeks)
    planned_ship = forward_propagate(actual_order, +6 weeks)
    planned_arrival = forward_propagate(actual_order, +11 weeks)
else:
    # 从销量反向计算
    planned_order = backward_calculate(sales_demand, -11 weeks)
```

### Fix 2: Coverage Tracking (覆盖率追踪)

**New Column: Sales Coverage Status**
```
销售需求 55
实际下单 35
-----------
覆盖状态: ⚠ 部分覆盖
缺口: 20件
```

**Visual Indicator:**
```
✓ 全部覆盖 (Fully Covered)    - Green badge
⚠ 部分覆盖 (Partially, -20)   - Yellow badge with gap
✗ 未覆盖 (Uncovered)           - Red badge
```

**User Action:**
点击徽章 → 显示详情:
```
需求来源: W08 销售预测 55件
订单覆盖:
  • PO-2025-001: 20件
  • PO-2025-002: 15件
  合计: 35件
缺口: 20件 (建议立即补单)
```

### Fix 3: Data Lineage (数据溯源)

**New Table: supply_chain_lineage**
```sql
CREATE TABLE supply_chain_lineage (
  id uuid PRIMARY KEY,
  sku text,
  sales_week_iso text,
  sales_demand numeric,

  -- 采购环节
  po_id uuid,
  po_number text,          -- "PO-2025-001"
  ordered_qty numeric,     -- 35

  -- 交付环节
  delivery_id uuid,
  delivery_number text,    -- "DEL-2025-001"
  delivered_qty numeric,   -- 10
  pending_qty numeric,     -- 25

  -- 物流环节
  shipment_id uuid,
  tracking_number text,    -- "TRK-20250315-001"
  shipped_qty numeric,     -- 10
  arrival_date date,

  -- 状态
  coverage_status text,    -- "Partially Covered"
  fulfillment_status text, -- "Partial"
  shipment_status text     -- "In Transit"
);
```

**Expandable UI:**
```
Row W06: [+] 下单: 预计 723 | 实际 800 | 取值 800

Click [+] →

┌───────────────────────────────────────────────────────────────┐
│ PO号         │ 下单量 │ 下单日期    │ 已交付 │ 待交付 │ 状态 │
├───────────────────────────────────────────────────────────────┤
│ PO-2025-001  │ 500    │ 2025-02-03  │ 500    │ 0      │ ✓完成 │
│ PO-2025-002  │ 300    │ 2025-02-05  │ 100    │ 200    │ ⚠部分 │
└───────────────────────────────────────────────────────────────┘
```

Click "PO-2025-002" →
```
采购订单详情
PO号: PO-2025-002
SKU: D-001
数量: 300件
供应商: 广州工厂A
下单日期: 2025-02-05

交付记录:
  • DEL-2025-010: 100件 (已装柜)
  • 待交付: 200件 (预计 2025-03-20)

物流跟踪:
  • TRK-001: 100件 → 在途 (预计到仓 2025-03-25)
```

---

## New UI Layout (25 Columns)

**Current V3: 20 Columns**
```
周次 | 销售(3) | 下单(3) | 工厂(3) | 发货(3) | 到仓(3) | 库存(4)
```

**New V4: 25 Columns**
```
周次 | 销售(4) | 下单(4) | 工厂(4) | 发货(4) | 到仓(4) | 库存(4)
       ↓          ↓         ↓         ↓         ↓
     +覆盖状态   +详情    +详情     +详情     +详情
```

**Each Group Now Has:**
1. 预计 (Planned)
2. 实际 (Actual)
3. 取值 (Effective)
4. **[NEW] 详情/状态 (Details/Status)** ← Expandable!

---

## Business Impact

### Before V4 (Current Pain Points)
| Problem | Impact | Cost |
|---------|--------|------|
| 无法追溯PO | 审计失败 | 2天人工核对 |
| 预计与实际不对应 | 库存误差30% | 缺货或积压 |
| 无法识别缺口 | 错失补单时机 | 销售损失 |
| 数据黑盒 | 用户不信任系统 | 弃用风险 |

### After V4 (Expected Benefits)
| Benefit | Metric | Timeline |
|---------|--------|----------|
| 完整追溯 | 100%可溯源 | 立即 |
| 库存准确 | 误差<5% | 3个月 |
| 缺口可见 | 100%覆盖率监控 | 立即 |
| 用户信任 | 满意度>4.5/5 | 3个月 |
| 审计合规 | 通过外部审计 | 6个月 |

---

## Implementation Timeline

```
Week 1-2: Backend (数据模型 + 正向传播算法)
  - Create supply_chain_lineage table
  - Implement forward propagation
  - Write refresh function

Week 3: Frontend (UI增强 + 可展开明细)
  - Add coverage status column
  - Implement expandable rows
  - Add traceability links

Week 4: Validation (验证 + 优化)
  - Data consistency checks
  - Performance tuning
  - User acceptance testing

Week 5: Rollout (上线 + 培训)
  - User training
  - Gradual rollout
  - Monitor metrics
```

---

## Key Decisions Needed

### Decision 1: Lineage Table Strategy
**Option A: Materialized Table (Recommended)**
- Pros: Fast queries, supports complex joins
- Cons: Requires refresh job

**Option B: Dynamic View**
- Pros: Always up-to-date
- Cons: Slow for large datasets

**Recommendation:** Option A, refresh every 5 minutes

### Decision 2: Historical Data Backfill
**Question:** What about POs created before this system?
**Answer:** Mark as `legacy_data = true`, exclude from coverage calculations

### Decision 3: Multi-PO Shipments
**Question:** What if one shipment contains items from 3 different POs?
**Answer:** Allow M:N relationship, split shipped_qty proportionally

---

## Success Criteria

**Must Have (P0):**
- ✓ No double counting in inventory
- ✓ 100% traceability for new orders
- ✓ Coverage status visible for all SKUs
- ✓ Expandable details work for all milestones

**Should Have (P1):**
- ✓ Data refresh completes in <5 minutes
- ✓ Page load time <2 seconds
- ✓ User satisfaction >4/5

**Nice to Have (P2):**
- Export to Excel with lineage
- Real-time notifications
- Mobile support

---

## Questions for Review

1. **Business Logic:** Is the forward propagation algorithm correct?
2. **Data Model:** Should we add more fields to lineage table (e.g., supplier, cost)?
3. **UI/UX:** Is 25 columns too many? Should we hide some by default?
4. **Performance:** Is 5-minute refresh acceptable or need real-time?
5. **Scope:** Should we handle returns/damaged goods in V4 or V5?

---

## Next Steps

1. **Product Approval:** Review this requirements doc
2. **Technical Design:** System Architect creates `design.md`
3. **Estimation:** Engineering team estimates effort
4. **Prioritization:** Confirm V4 is higher priority than other features
5. **Kickoff:** Schedule sprint planning

---

**Document Owner:** Product Director
**Created:** 2025-12-05
**Status:** Draft for Review
**Version:** 1.0
