# 供应链全链路差异追踪系统 - 技术设计

## 版本信息
- **版本**: 1.0.0
- **日期**: 2025-12-08
- **架构师**: System Architect
- **状态**: 待审批

---

## 1. 业务背景

### 1.1 问题陈述
在供应链的每个环节，都存在"计划数量"与"实际数量"的差异，产生"剩余数量"需要追踪：

**差异类型1：下单 → 工厂出货**
```
采购订单 (PO Item)
  ordered_qty: 50
  delivered_qty: 45
  → 剩余 5 件 (Pending Delivery)
```

**差异类型2：工厂出货 → 物流发货**
```
工厂交货 (Production Delivery)
  delivered_qty: 45
  shipped_qty: 40
  → 剩余 5 件 (Pending Ship)
```

**差异类型3：物流发货 → 仓库到货**
```
物流发货 (Shipment)
  shipped_qty: 40
  actual_arrival_qty: 38
  → 差异 2 件 (Variance - 损耗/短装)
```

### 1.2 业务需求
1. **可视化追踪**：在算法审计表中明确显示剩余数量及其预计处理时间
2. **用户可调整**：允许用户修改预计处理周（planned_week）
3. **自动传播**：差异数据自动传播到后续环节的计划值
4. **状态管理**：追踪差异从产生到解决的完整生命周期

---

## 2. 架构设计

### 2.1 方案选择：专用差异追踪表（方案2增强版）

**理由：**
- **职责分离**：差异管理是独立的业务逻辑，不应污染核心业务表
- **可扩展性**：支持多次差异、部分解决、状态演变
- **可追溯性**：完整记录差异的产生、调整、解决历史
- **算法独立**：算法审计可独立计算，差异数据作为补充输入

### 2.2 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      供应链核心业务表                              │
├─────────────────────────────────────────────────────────────────┤
│ purchase_order_items → production_deliveries → shipments        │
│     (下单)                  (工厂出货)            (物流发货)        │
└─────────────────┬───────────────────┬───────────────────────────┘
                  │                   │
                  ▼                   ▼
         ┌────────────────────────────────────┐
         │   supply_chain_variances (差异表)   │
         ├────────────────────────────────────┤
         │ - 自动检测数量差异                   │
         │ - 存储预计处理时间                   │
         │ - 追踪状态演变                       │
         └────────────┬───────────────────────┘
                      │
                      ▼
         ┌────────────────────────────────────┐
         │   算法审计V4 (读取差异数据)          │
         ├────────────────────────────────────┤
         │ planned_* 值 = 反推值 + 差异调整     │
         └────────────────────────────────────┘
```

---

## 3. 数据库设计

### 3.1 核心差异追踪表

```sql
-- =====================================================================
-- Table: supply_chain_variances
-- Purpose: 追踪供应链各环节的数量差异及其计划解决方案
-- =====================================================================

CREATE TABLE supply_chain_variances (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联到源头记录
  source_type TEXT NOT NULL CHECK (source_type IN (
    'order_to_delivery',    -- PO Item 下单 → 工厂出货
    'delivery_to_ship',     -- 工厂出货 → 物流发货
    'ship_to_arrival'       -- 物流发货 → 仓库到货 (损耗/短装)
  )),
  source_id UUID NOT NULL,  -- po_item_id | delivery_id | shipment_id

  -- 产品信息 (denormalized for query performance)
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  channel_code TEXT REFERENCES channels(channel_code) ON DELETE SET NULL,

  -- 数量数据
  planned_qty INTEGER NOT NULL CHECK (planned_qty >= 0),    -- 上游计划数量
  fulfilled_qty INTEGER NOT NULL DEFAULT 0 CHECK (fulfilled_qty >= 0), -- 已完成数量
  pending_qty INTEGER GENERATED ALWAYS AS (planned_qty - fulfilled_qty) STORED, -- 剩余数量 (自动计算)

  -- 计划解决时间 (用户可调整)
  planned_week TEXT,        -- ISO week format: YYYY-WW
  planned_date DATE,        -- 具体日期 (可选，用于更精确的跟踪)

  -- 状态管理
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- 待处理 (刚产生差异)
    'scheduled',    -- 已计划 (用户设置了 planned_week)
    'partial',      -- 部分完成 (fulfilled_qty > 0 且 < planned_qty)
    'completed',    -- 已完成 (fulfilled_qty = planned_qty)
    'cancelled',    -- 已取消 (短装关闭)
    'overdue'       -- 已逾期 (planned_week < 当前周 且 status = scheduled)
  )),

  -- 优先级 (自动计算，用于 UI 排序)
  priority TEXT GENERATED ALWAYS AS (
    CASE
      WHEN status = 'overdue' THEN 'Critical'
      WHEN pending_qty > 0 AND planned_week IS NOT NULL
           AND planned_week <= to_char(CURRENT_DATE, 'IYYY-"W"IW') THEN 'High'
      WHEN pending_qty > 0 THEN 'Medium'
      ELSE 'Low'
    END
  ) STORED,

  -- 备注与审计
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,          -- auth.users.id
  updated_by UUID,          -- auth.users.id
  resolved_at TIMESTAMPTZ,  -- 完成时间
  resolved_by UUID,         -- 完成人

  -- 约束：同一个源记录只能有一条差异记录
  UNIQUE (source_type, source_id)
);

-- 索引
CREATE INDEX idx_sc_variances_sku ON supply_chain_variances(sku);
CREATE INDEX idx_sc_variances_status ON supply_chain_variances(status) WHERE status IN ('pending', 'scheduled', 'partial', 'overdue');
CREATE INDEX idx_sc_variances_planned_week ON supply_chain_variances(planned_week) WHERE planned_week IS NOT NULL;
CREATE INDEX idx_sc_variances_source ON supply_chain_variances(source_type, source_id);
CREATE INDEX idx_sc_variances_priority ON supply_chain_variances(priority, created_at DESC);

-- 注释
COMMENT ON TABLE supply_chain_variances IS '供应链差异追踪：记录下单→出货→发货→到货各环节的数量差异及计划解决方案';
COMMENT ON COLUMN supply_chain_variances.source_type IS '差异类型：order_to_delivery | delivery_to_ship | ship_to_arrival';
COMMENT ON COLUMN supply_chain_variances.pending_qty IS '剩余待解决数量 (自动计算 = planned_qty - fulfilled_qty)';
COMMENT ON COLUMN supply_chain_variances.planned_week IS '用户可调整的预计处理周 (ISO format: YYYY-WW)';
```

### 3.2 自动更新触发器

```sql
-- =====================================================================
-- Trigger: 自动更新 updated_at 时间戳
-- =====================================================================

CREATE OR REPLACE FUNCTION update_sc_variance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sc_variance_updated_at
  BEFORE UPDATE ON supply_chain_variances
  FOR EACH ROW
  EXECUTE FUNCTION update_sc_variance_updated_at();

-- =====================================================================
-- Trigger: 自动更新状态 (根据 pending_qty 和 planned_week)
-- =====================================================================

CREATE OR REPLACE FUNCTION auto_update_variance_status()
RETURNS TRIGGER AS $$
DECLARE
  v_current_week TEXT;
BEGIN
  v_current_week := to_char(CURRENT_DATE, 'IYYY-"W"IW');

  -- 根据 pending_qty 更新状态
  IF NEW.pending_qty = 0 THEN
    NEW.status := 'completed';
    NEW.resolved_at := NOW();
  ELSIF NEW.pending_qty > 0 AND NEW.pending_qty < NEW.planned_qty THEN
    NEW.status := 'partial';
  ELSIF NEW.status = 'cancelled' THEN
    -- 保持 cancelled 状态不变
    NULL;
  ELSIF NEW.planned_week IS NOT NULL AND NEW.planned_week < v_current_week THEN
    NEW.status := 'overdue';
  ELSIF NEW.planned_week IS NOT NULL THEN
    NEW.status := 'scheduled';
  ELSE
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_update_variance_status
  BEFORE INSERT OR UPDATE OF planned_qty, fulfilled_qty, planned_week, status
  ON supply_chain_variances
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_variance_status();
```

### 3.3 差异检测与创建函数

```sql
-- =====================================================================
-- Function: 检测并创建 PO Item 差异记录
-- 当 purchase_order_items.delivered_qty < ordered_qty 时自动创建差异
-- =====================================================================

CREATE OR REPLACE FUNCTION upsert_po_item_variance(
  p_po_item_id UUID,
  p_sku TEXT,
  p_channel_code TEXT,
  p_ordered_qty INTEGER,
  p_delivered_qty INTEGER,
  p_planned_week TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_variance_id UUID;
  v_pending_qty INTEGER;
BEGIN
  v_pending_qty := p_ordered_qty - p_delivered_qty;

  -- 如果没有差异，删除旧记录并返回
  IF v_pending_qty <= 0 THEN
    DELETE FROM supply_chain_variances
    WHERE source_type = 'order_to_delivery' AND source_id = p_po_item_id;
    RETURN NULL;
  END IF;

  -- Upsert 差异记录
  INSERT INTO supply_chain_variances (
    source_type,
    source_id,
    sku,
    channel_code,
    planned_qty,
    fulfilled_qty,
    planned_week
  )
  VALUES (
    'order_to_delivery',
    p_po_item_id,
    p_sku,
    p_channel_code,
    p_ordered_qty,
    p_delivered_qty,
    p_planned_week
  )
  ON CONFLICT (source_type, source_id)
  DO UPDATE SET
    planned_qty = EXCLUDED.planned_qty,
    fulfilled_qty = EXCLUDED.fulfilled_qty,
    planned_week = COALESCE(EXCLUDED.planned_week, supply_chain_variances.planned_week),
    updated_at = NOW()
  RETURNING id INTO v_variance_id;

  RETURN v_variance_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Function: 检测并创建 Delivery 差异记录
-- 当 production_deliveries.shipped_qty < delivered_qty 时自动创建差异
-- =====================================================================

CREATE OR REPLACE FUNCTION upsert_delivery_variance(
  p_delivery_id UUID,
  p_sku TEXT,
  p_channel_code TEXT,
  p_delivered_qty INTEGER,
  p_shipped_qty INTEGER,
  p_planned_week TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_variance_id UUID;
  v_pending_qty INTEGER;
BEGIN
  v_pending_qty := p_delivered_qty - p_shipped_qty;

  IF v_pending_qty <= 0 THEN
    DELETE FROM supply_chain_variances
    WHERE source_type = 'delivery_to_ship' AND source_id = p_delivery_id;
    RETURN NULL;
  END IF;

  INSERT INTO supply_chain_variances (
    source_type,
    source_id,
    sku,
    channel_code,
    planned_qty,
    fulfilled_qty,
    planned_week
  )
  VALUES (
    'delivery_to_ship',
    p_delivery_id,
    p_sku,
    p_channel_code,
    p_delivered_qty,
    p_shipped_qty,
    p_planned_week
  )
  ON CONFLICT (source_type, source_id)
  DO UPDATE SET
    planned_qty = EXCLUDED.planned_qty,
    fulfilled_qty = EXCLUDED.fulfilled_qty,
    planned_week = COALESCE(EXCLUDED.planned_week, supply_chain_variances.planned_week),
    updated_at = NOW()
  RETURNING id INTO v_variance_id;

  RETURN v_variance_id;
END;
$$ LANGUAGE plpgsql;
```

### 3.4 视图：差异总览

```sql
-- =====================================================================
-- View: 差异总览 - 带产品信息和关联来源
-- =====================================================================

CREATE OR REPLACE VIEW v_variance_overview AS
SELECT
  v.id,
  v.source_type,
  v.source_id,
  v.sku,
  p.product_name,
  p.spu,
  v.channel_code,
  v.planned_qty,
  v.fulfilled_qty,
  v.pending_qty,
  v.planned_week,
  v.planned_date,
  v.status,
  v.priority,
  v.remarks,
  v.created_at,
  v.updated_at,

  -- 关联源记录信息 (用于显示)
  CASE v.source_type
    WHEN 'order_to_delivery' THEN (
      SELECT CONCAT('PO#', po.po_number, ' (', poi.ordered_qty, ' ordered)')
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE poi.id = v.source_id
    )
    WHEN 'delivery_to_ship' THEN (
      SELECT CONCAT('DL#', pd.delivery_number, ' (', pd.delivered_qty, ' delivered)')
      FROM production_deliveries pd
      WHERE pd.id = v.source_id
    )
    WHEN 'ship_to_arrival' THEN (
      SELECT CONCAT('SH#', s.tracking_number)
      FROM shipments s
      WHERE s.id = v.source_id
    )
  END AS source_reference,

  -- 计算距今天数
  EXTRACT(DAY FROM NOW() - v.created_at) AS age_days,

  -- 计算距 planned_week 的周差
  CASE
    WHEN v.planned_week IS NOT NULL THEN
      (
        EXTRACT(YEAR FROM to_date(v.planned_week || '-1', 'IYYY-IW-ID'))::INTEGER * 52 +
        EXTRACT(WEEK FROM to_date(v.planned_week || '-1', 'IYYY-IW-ID'))::INTEGER
      ) - (
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER * 52 +
        EXTRACT(WEEK FROM CURRENT_DATE)::INTEGER
      )
    ELSE NULL
  END AS weeks_until_planned

FROM supply_chain_variances v
JOIN products p ON p.sku = v.sku;

COMMENT ON VIEW v_variance_overview IS '差异总览：包含产品信息、源记录引用、优先级、年龄等计算字段';
```

### 3.5 RLS 策略

```sql
-- Enable RLS
ALTER TABLE supply_chain_variances ENABLE ROW LEVEL SECURITY;

-- Policy: 所有认证用户可读
CREATE POLICY "Allow authenticated read on supply_chain_variances"
  ON supply_chain_variances FOR SELECT
  TO authenticated
  USING (true);

-- Policy: 所有认证用户可写 (创建/更新)
CREATE POLICY "Allow authenticated insert on supply_chain_variances"
  ON supply_chain_variances FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on supply_chain_variances"
  ON supply_chain_variances FOR UPDATE
  TO authenticated
  USING (true);

-- Policy: 只允许更新自己创建的记录的 planned_week/remarks
-- (可选，根据业务需求定制)
```

---

## 4. TypeScript 类型定义

```typescript
// src/lib/types/database.ts (追加)

// ================================================================
// SUPPLY CHAIN VARIANCE TYPES
// ================================================================

/**
 * 差异来源类型
 */
export type VarianceSourceType =
  | 'order_to_delivery'    // PO 下单 → 工厂出货
  | 'delivery_to_ship'     // 工厂出货 → 物流发货
  | 'ship_to_arrival'      // 物流发货 → 仓库到货

/**
 * 差异状态
 */
export type VarianceStatus =
  | 'pending'      // 待处理
  | 'scheduled'    // 已计划
  | 'partial'      // 部分完成
  | 'completed'    // 已完成
  | 'cancelled'    // 已取消
  | 'overdue'      // 已逾期

/**
 * 差异优先级 (自动计算)
 */
export type VariancePriority = 'Critical' | 'High' | 'Medium' | 'Low'

/**
 * 供应链差异记录
 */
export interface SupplyChainVariance {
  id: string
  source_type: VarianceSourceType
  source_id: string
  sku: string
  channel_code: string | null
  planned_qty: number
  fulfilled_qty: number
  pending_qty: number           // Computed (generated column)
  planned_week: string | null   // YYYY-WW (user-adjustable)
  planned_date: string | null   // DATE
  status: VarianceStatus
  priority: VariancePriority    // Computed (generated column)
  remarks: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  resolved_at: string | null
  resolved_by: string | null
}

export interface SupplyChainVarianceInsert {
  id?: string
  source_type: VarianceSourceType
  source_id: string
  sku: string
  channel_code?: string | null
  planned_qty: number
  fulfilled_qty?: number
  planned_week?: string | null
  planned_date?: string | null
  status?: VarianceStatus
  remarks?: string | null
  created_by?: string | null
}

export interface SupplyChainVarianceUpdate {
  planned_week?: string | null
  planned_date?: string | null
  fulfilled_qty?: number
  remarks?: string | null
  status?: VarianceStatus
  updated_by?: string | null
}

/**
 * 差异总览 (带产品信息)
 */
export interface VarianceOverview extends SupplyChainVariance {
  product_name: string
  spu: string
  source_reference: string  // "PO#2025-001-A (50 ordered)"
  age_days: number
  weeks_until_planned: number | null
}

/**
 * 差异汇总 KPI
 */
export interface VarianceSummaryKPIs {
  total_variances: number
  total_pending_qty: number
  critical_count: number    // priority = Critical
  high_count: number        // priority = High
  overdue_count: number     // status = overdue
  scheduled_count: number   // status = scheduled
  avg_age_days: number
  oldest_variance_days: number
}
```

---

## 5. 算法审计V4集成

### 5.1 集成策略

**原则：差异数据作为"补充修正"而非"直接替换"**

算法审计V4的 `planned_*` 值计算逻辑：

```
1. 基础反推值 (Baseline Reverse Calculation)
   planned_factory_ship = reverse_calc_from_sales_demand(safety_stock_weeks, lead_times)

2. 差异修正 (Variance Adjustment)
   IF 存在 supply_chain_variances:
     - source_type = 'order_to_delivery' AND planned_week = current_week
     - 则将 pending_qty 加入到 planned_factory_ship

   最终值:
   planned_factory_ship_adjusted = planned_factory_ship_baseline + variance_pending_qty
```

### 5.2 修改算法审计查询

```typescript
// src/lib/queries/algorithm-audit-v4.ts (伪代码)

/**
 * 为算法审计V4添加差异数据修正
 */
async function fetchVarianceAdjustments(
  sku: string,
  weekRange: string[]
): Promise<Map<string, VarianceAdjustment>> {
  const supabase = await createServerSupabaseClient()

  // 查询该 SKU 在未来周的差异计划
  const { data: variances } = await supabase
    .from('supply_chain_variances')
    .select('*')
    .eq('sku', sku)
    .in('status', ['pending', 'scheduled', 'overdue', 'partial'])
    .not('planned_week', 'is', null)
    .in('planned_week', weekRange)

  // 构建 week -> adjustment 映射
  const adjustmentMap = new Map<string, VarianceAdjustment>()

  variances?.forEach(v => {
    if (!v.planned_week) return

    const existing = adjustmentMap.get(v.planned_week) || {
      factory_ship_adjustment: 0,
      ship_adjustment: 0,
      variances: []
    }

    // 根据 source_type 分类调整
    if (v.source_type === 'order_to_delivery') {
      // 下单→出货差异：调整 planned_factory_ship
      existing.factory_ship_adjustment += v.pending_qty
    } else if (v.source_type === 'delivery_to_ship') {
      // 出货→发货差异：调整 planned_ship
      existing.ship_adjustment += v.pending_qty
    }

    existing.variances.push(v)
    adjustmentMap.set(v.planned_week, existing)
  })

  return adjustmentMap
}

/**
 * 在生成 AlgorithmAuditRowV4 时应用差异调整
 */
function applyVarianceAdjustment(
  row: AlgorithmAuditRowV4,
  adjustment: VarianceAdjustment | undefined
): AlgorithmAuditRowV4 {
  if (!adjustment) return row

  return {
    ...row,
    // 修正计划值
    planned_factory_ship: row.planned_factory_ship + adjustment.factory_ship_adjustment,
    planned_ship: row.planned_ship + adjustment.ship_adjustment,

    // 添加差异来源标记
    variance_adjustments: adjustment.variances.map(v => ({
      variance_id: v.id,
      source_type: v.source_type,
      pending_qty: v.pending_qty,
      planned_week: v.planned_week,
      remarks: v.remarks
    }))
  }
}
```

### 5.3 类型扩展

```typescript
/**
 * 差异调整数据 (用于算法审计)
 */
export interface VarianceAdjustment {
  factory_ship_adjustment: number  // 工厂出货调整量
  ship_adjustment: number          // 物流发货调整量
  variances: SupplyChainVariance[] // 关联的差异记录
}

/**
 * 算法审计行 V4 - 扩展差异信息
 */
export interface AlgorithmAuditRowV4 extends AlgorithmAuditRowV3 {
  // ... 原有字段 ...

  // 差异调整信息 (新增)
  variance_adjustments?: {
    variance_id: string
    source_type: VarianceSourceType
    pending_qty: number
    planned_week: string
    remarks: string | null
  }[]
}
```

---

## 6. API 设计

### 6.1 Server Actions

```typescript
// src/lib/actions/supply-chain-variances.ts

'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { SupplyChainVariance, SupplyChainVarianceUpdate } from '@/lib/types/database'

/**
 * 更新差异的预计处理周
 */
export async function updateVariancePlannedWeek(
  varianceId: string,
  plannedWeek: string | null,
  remarks?: string
): Promise<{
  success: boolean
  error?: string
  data?: SupplyChainVariance
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // 验证 week 格式
    if (plannedWeek && !/^\d{4}-W\d{2}$/.test(plannedWeek)) {
      return { success: false, error: 'Invalid week format. Expected YYYY-WW' }
    }

    const { data, error } = await supabase
      .from('supply_chain_variances')
      .update({
        planned_week: plannedWeek,
        remarks: remarks || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', varianceId)
      .select()
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (err) {
    console.error('Error updating variance planned week:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * 批量更新差异预计周 (用于批量操作)
 */
export async function batchUpdateVariancePlannedWeek(
  updates: Array<{ variance_id: string; planned_week: string | null }>
): Promise<{
  success: boolean
  error?: string
  updated_count: number
}> {
  try {
    const supabase = await createServerSupabaseClient()
    let updated_count = 0

    for (const { variance_id, planned_week } of updates) {
      const { error } = await supabase
        .from('supply_chain_variances')
        .update({ planned_week, updated_at: new Date().toISOString() })
        .eq('id', variance_id)

      if (!error) updated_count++
    }

    return { success: true, updated_count }
  } catch (err) {
    console.error('Error batch updating variances:', err)
    return { success: false, error: String(err), updated_count: 0 }
  }
}

/**
 * 标记差异为已取消 (短装关闭)
 */
export async function cancelVariance(
  varianceId: string,
  reason: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('supply_chain_variances')
      .update({
        status: 'cancelled',
        remarks: reason,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', varianceId)

    if (error) throw error

    return { success: true }
  } catch (err) {
    console.error('Error cancelling variance:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * 手动创建差异记录 (用于修正)
 */
export async function createManualVariance(
  variance: {
    source_type: string
    source_id: string
    sku: string
    channel_code?: string | null
    planned_qty: number
    fulfilled_qty?: number
    planned_week?: string | null
    remarks?: string
  }
): Promise<{
  success: boolean
  error?: string
  data?: SupplyChainVariance
}> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('supply_chain_variances')
      .insert(variance)
      .select()
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (err) {
    console.error('Error creating manual variance:', err)
    return { success: false, error: String(err) }
  }
}
```

### 6.2 查询函数

```typescript
// src/lib/queries/supply-chain-variances.ts

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { VarianceOverview, VarianceSummaryKPIs } from '@/lib/types/database'

/**
 * 获取差异列表 (带筛选)
 */
export async function fetchVariances(filters?: {
  sku?: string
  status?: string
  priority?: string
  min_pending_qty?: number
}): Promise<VarianceOverview[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('v_variance_overview')
    .select('*')
    .order('priority', { ascending: true })
    .order('age_days', { ascending: false })

  if (filters?.sku) {
    query = query.eq('sku', filters.sku)
  }

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority)
  }

  if (filters?.min_pending_qty) {
    query = query.gte('pending_qty', filters.min_pending_qty)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching variances:', error)
    return []
  }

  return data || []
}

/**
 * 获取差异汇总 KPI
 */
export async function fetchVarianceSummaryKPIs(): Promise<VarianceSummaryKPIs> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_variance_overview')
    .select('*')
    .in('status', ['pending', 'scheduled', 'overdue', 'partial'])

  if (error || !data) {
    return {
      total_variances: 0,
      total_pending_qty: 0,
      critical_count: 0,
      high_count: 0,
      overdue_count: 0,
      scheduled_count: 0,
      avg_age_days: 0,
      oldest_variance_days: 0
    }
  }

  return {
    total_variances: data.length,
    total_pending_qty: data.reduce((sum, v) => sum + v.pending_qty, 0),
    critical_count: data.filter(v => v.priority === 'Critical').length,
    high_count: data.filter(v => v.priority === 'High').length,
    overdue_count: data.filter(v => v.status === 'overdue').length,
    scheduled_count: data.filter(v => v.status === 'scheduled').length,
    avg_age_days: data.reduce((sum, v) => sum + v.age_days, 0) / data.length || 0,
    oldest_variance_days: Math.max(...data.map(v => v.age_days), 0)
  }
}

/**
 * 获取单个差异的详细信息
 */
export async function fetchVarianceById(
  varianceId: string
): Promise<VarianceOverview | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_variance_overview')
    .select('*')
    .eq('id', varianceId)
    .single()

  if (error) {
    console.error('Error fetching variance:', error)
    return null
  }

  return data
}
```

---

## 7. 迁移脚本

完整的 SQL 迁移脚本：

```sql
-- File: supabase/migrations/20251208000002_supply_chain_variance_tracking.sql

-- =====================================================================
-- Migration: Supply Chain Variance Tracking System
-- Version: 1.0.0
-- Date: 2025-12-08
-- Description: 供应链全链路差异追踪系统
-- =====================================================================

-- Step 1: Create main table
CREATE TABLE supply_chain_variances (
  -- 完整代码见 3.1 节
  -- ...
);

-- Step 2: Create indexes
-- 完整代码见 3.1 节
-- ...

-- Step 3: Create triggers
-- 完整代码见 3.2 节
-- ...

-- Step 4: Create upsert functions
-- 完整代码见 3.3 节
-- ...

-- Step 5: Create views
-- 完整代码见 3.4 节
-- ...

-- Step 6: Create RLS policies
-- 完整代码见 3.5 节
-- ...

-- Step 7: Backfill existing variances (optional)
-- 为现有的 PO Items 和 Deliveries 创建差异记录
INSERT INTO supply_chain_variances (
  source_type,
  source_id,
  sku,
  channel_code,
  planned_qty,
  fulfilled_qty
)
SELECT
  'order_to_delivery'::TEXT AS source_type,
  poi.id AS source_id,
  poi.sku,
  poi.channel_code,
  poi.ordered_qty AS planned_qty,
  poi.delivered_qty AS fulfilled_qty
FROM purchase_order_items poi
WHERE poi.ordered_qty > poi.delivered_qty
ON CONFLICT (source_type, source_id) DO NOTHING;

-- Backfill delivery variances
INSERT INTO supply_chain_variances (
  source_type,
  source_id,
  sku,
  channel_code,
  planned_qty,
  fulfilled_qty
)
SELECT
  'delivery_to_ship'::TEXT AS source_type,
  pd.id AS source_id,
  pd.sku,
  pd.channel_code,
  pd.delivered_qty AS planned_qty,
  pd.shipped_qty AS fulfilled_qty
FROM production_deliveries pd
WHERE pd.delivered_qty > pd.shipped_qty
ON CONFLICT (source_type, source_id) DO NOTHING;

COMMENT ON TABLE supply_chain_variances IS 'Migration 20251208000002: Supply chain variance tracking system';
```

---

## 8. 前端界面建议 (不在此次设计范围)

**建议界面位置：**
1. **差异管理页面**: `/procurement/variances` - 专门管理所有差异
2. **算法审计表集成**: 在算法审计表的 Hover Tooltip 中显示相关差异
3. **Dashboard KPI**: 显示"待处理差异数量"作为关键指标

**核心操作：**
- 批量选择差异，设置 planned_week
- 单个差异快速编辑 (inline edit)
- 筛选：按 SKU、状态、优先级
- 排序：按优先级、年龄、剩余数量

---

## 9. 测试计划

### 9.1 单元测试

```typescript
// tests/lib/actions/supply-chain-variances.test.ts

describe('Supply Chain Variance Actions', () => {
  test('should update variance planned week', async () => {
    const result = await updateVariancePlannedWeek('variance-id', '2025-W52')
    expect(result.success).toBe(true)
    expect(result.data?.planned_week).toBe('2025-W52')
  })

  test('should reject invalid week format', async () => {
    const result = await updateVariancePlannedWeek('variance-id', '2025-52')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid week format')
  })

  test('should cancel variance with reason', async () => {
    const result = await cancelVariance('variance-id', '供应商短装')
    expect(result.success).toBe(true)
  })
})
```

### 9.2 集成测试

1. **创建 PO → 部分交货 → 验证差异生成**
2. **更新 planned_week → 验证算法审计表反映变化**
3. **完成交货 → 验证差异自动关闭 (status = completed)**

### 9.3 性能测试

- 10,000 条差异记录的查询性能
- 批量更新 100 条差异的响应时间
- 算法审计表加入差异数据后的计算时间

---

## 10. 部署与回滚

### 10.1 部署步骤

```bash
# 1. 应用迁移
supabase db push

# 2. 验证表结构
supabase db diff

# 3. 回填数据 (可选)
psql -f scripts/backfill_variances.sql

# 4. 验证数据
SELECT COUNT(*) FROM supply_chain_variances;
SELECT * FROM v_variance_overview LIMIT 10;
```

### 10.2 回滚脚本

```sql
-- rollback_20251208000002.sql

-- 警告：此操作会删除所有差异数据
DROP VIEW IF EXISTS v_variance_overview;
DROP FUNCTION IF EXISTS upsert_po_item_variance;
DROP FUNCTION IF EXISTS upsert_delivery_variance;
DROP FUNCTION IF EXISTS auto_update_variance_status;
DROP FUNCTION IF EXISTS update_sc_variance_updated_at;
DROP TABLE IF EXISTS supply_chain_variances CASCADE;
DROP TYPE IF EXISTS shipment_status_enum;
```

---

## 11. 总结

### 11.1 技术优势

1. **职责分离**: 差异管理是独立的领域模型，不污染核心业务表
2. **自动化**: 触发器自动计算 `pending_qty` 和 `status`
3. **可扩展**: 轻松支持新的差异类型 (如 `ship_to_arrival`)
4. **可追溯**: 完整的审计日志 (created_at, updated_at, resolved_at)
5. **高性能**: 索引优化查询，generated columns 减少计算开销

### 11.2 业务价值

1. **透明化**: 供应链所有"黑箱"环节的差异一目了然
2. **可控性**: 用户可调整预计处理时间，系统自动提醒逾期
3. **准确性**: 算法审计表的 planned_* 值更贴近实际
4. **效率**: 批量操作减少人工逐条处理的时间

### 11.3 下一步行动

1. **Review**: 产品经理审阅业务逻辑
2. **Implement**: 后端工程师执行迁移脚本
3. **Test**: QA 执行集成测试
4. **Frontend**: 前端工程师实现差异管理 UI
5. **Deploy**: 灰度上线，监控性能

---

## 附录

### A. 相关文档

- `specs/algorithm-audit-v4-ux/requirements.md` - 算法审计V4需求
- `docs/algorithm-audit-v4-usage.md` - 算法审计V4使用文档
- `supabase/migrations/20251208000001_delivery_shipment_linkage.sql` - 交货发货关联

### B. 数据字典

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| source_type | TEXT | 差异类型 | `order_to_delivery` |
| pending_qty | INTEGER | 剩余数量 (自动计算) | 5 |
| planned_week | TEXT | 预计处理周 (用户可调) | `2025-W52` |
| status | TEXT | 差异状态 | `scheduled` |
| priority | TEXT | 优先级 (自动计算) | `High` |

### C. FAQ

**Q1: 为什么不直接在 purchase_order_items 表加 planned_week 字段？**
A: 因为一个 PO Item 可能产生多次差异（多次部分交货），独立表可以支持这种场景。

**Q2: 如果用户不设置 planned_week，系统如何处理？**
A: 状态保持为 `pending`，算法审计表使用默认的反推逻辑，不做差异调整。

**Q3: 差异数据会自动同步到算法审计表吗？**
A: 是的，算法审计查询会读取 `supply_chain_variances` 表并自动调整 planned_* 值。

---

**文档版本**: 1.0.0
**创建日期**: 2025-12-08
**最后更新**: 2025-12-08
**下次审阅**: 2025-12-15
