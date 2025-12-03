# Algorithm Audit V3 - Backend Implementation Summary

## 实施日期
2025-12-03 22:45 CST

## 实施内容

### 1. TypeScript 类型定义 ✅

**文件**: `src/lib/types/database.ts`

新增类型定义：
- `SupplyChainLeadTimesV3` - 供应链提前期配置（含可配置物流周期）
- `AlgorithmAuditRowV3` - 单行审计数据（20列完整结构）
- `AlgorithmAuditResultV3` - 完整审计结果

```typescript
export interface AlgorithmAuditRowV3 {
  // 周次信息 (1列)
  week_iso: string
  week_start_date: string
  week_offset: number
  is_past: boolean
  is_current: boolean

  // 销售组 (3列): 预计、实际、取值
  sales_forecast: number
  sales_actual: number | null
  sales_effective: number

  // 下单组 (3列): 预计、实际、取值
  planned_order: number
  actual_order: number
  order_effective: number

  // 工厂出货组 (3列): 预计、实际、取值
  planned_factory_ship: number
  actual_factory_ship: number
  factory_ship_effective: number

  // 物流发货组 (3列): 预计、实际、取值
  planned_ship: number
  actual_ship: number
  ship_effective: number

  // 到仓组 (3列): 预计、实际、取值
  planned_arrival: number
  actual_arrival: number
  arrival_effective: number

  // 库存组 (4列): 期初、期末、安全、状态
  opening_stock: number
  closing_stock: number
  safety_threshold: number
  stock_status: StockStatus
}
```

### 2. 工具函数扩展 ✅

**文件**: `src/lib/utils.ts`

新增ISO周处理函数：

```typescript
// 周次加减运算（支持负数）
export function addWeeksToISOWeek(weekStr: string, numWeeks: number): string | null

// 从日期获取周次字符串
export function getWeekFromDate(date: Date): string
```

### 3. 查询函数实现 ✅

**文件**: `src/lib/queries/algorithm-audit-v3.ts`

核心查询函数：`fetchAlgorithmAuditV3(sku: string, shippingWeeks: number = 5)`

#### 实现步骤

**Step 1: 获取产品配置**
```typescript
const { data: product } = await supabase
  .from('products')
  .select('*')
  .eq('sku', sku)
  .single()
```

**Step 2: 配置提前期参数**
```typescript
const leadTimes: SupplyChainLeadTimesV3 = {
  production_weeks: product.production_lead_weeks,  // 生产周期
  loading_weeks: 1,                                 // 装柜周期（固定）
  shipping_weeks: shippingWeeks,                    // 物流周期（可配置）
  safety_stock_weeks: product.safety_stock_weeks,   // 安全库存周
}
```

**Step 3: 生成16周范围**
```typescript
// 过去4周 + 当前周 + 未来11周
const currentWeek = getCurrentWeek()
const startWeek = addWeeksToISOWeek(currentWeek, -4)
const endWeek = addWeeksToISOWeek(currentWeek, 11)
```

**Step 4: 并行获取7个数据源**
```typescript
await Promise.all([
  supabase.from('sales_forecasts').select(...),
  supabase.from('sales_actuals').select(...),
  supabase.from('purchase_orders').select(...),
  supabase.from('production_deliveries').select(...),
  supabase.from('shipments').select(...),
  supabase.from('inventory_snapshots').select(...),
])
```

**Step 5: 按周聚合实际数据**
```typescript
// 销售数据
forecastMap.set(week_iso, sum(forecast_qty))
actualSalesMap.set(week_iso, sum(actual_qty))

// 采购下单
actualOrderMap.set(getWeekFromDate(actual_order_date), sum(ordered_qty))

// 工厂出货
actualFactoryShipMap.set(getWeekFromDate(actual_delivery_date), sum(delivered_qty))

// 物流发货
actualShipMap.set(getWeekFromDate(actual_departure_date), sum(shipped_qty))

// 到仓
actualArrivalMap.set(getWeekFromDate(actual_arrival_date), sum(shipped_qty))
```

**Step 6: 初始化行数据**
```typescript
const rows: AlgorithmAuditRowV3[] = weeks.map((week, index) => ({
  week_iso: week,
  week_offset: index - 4,
  sales_effective: sales_actual ?? sales_forecast,
  actual_order: actualOrderMap.get(week) || 0,
  actual_factory_ship: actualFactoryShipMap.get(week) || 0,
  actual_ship: actualShipMap.get(week) || 0,
  actual_arrival: actualArrivalMap.get(week) || 0,
  // ... 其他字段
}))
```

**Step 7: 反推计算（核心算法）**
```typescript
rows.forEach(row => {
  const salesDemand = row.sales_effective
  if (salesDemand <= 0) return

  // 从销售周反推各节点周次
  const arrivalWeek = addWeeksToISOWeek(
    row.week_iso,
    -leadTimes.safety_stock_weeks
  )
  const shipWeek = addWeeksToISOWeek(
    arrivalWeek,
    -leadTimes.shipping_weeks
  )
  const factoryShipWeek = addWeeksToISOWeek(
    shipWeek,
    -leadTimes.loading_weeks
  )
  const orderWeek = addWeeksToISOWeek(
    factoryShipWeek,
    -leadTimes.production_weeks
  )

  // 累加数量到对应周次
  plannedArrivalMap.set(arrivalWeek, current + salesDemand)
  plannedShipMap.set(shipWeek, current + salesDemand)
  plannedFactoryShipMap.set(factoryShipWeek, current + salesDemand)
  plannedOrderMap.set(orderWeek, current + salesDemand)
})
```

**Step 8: 计算滚动库存**
```typescript
let runningStock = initialStock
rows.forEach(row => {
  row.opening_stock = runningStock
  row.closing_stock = runningStock + row.arrival_effective - row.sales_effective
  row.safety_threshold = row.sales_effective * leadTimes.safety_stock_weeks

  // 更新下一周的期初
  runningStock = row.closing_stock

  // 判断库存状态
  if (row.closing_stock <= 0) {
    row.stock_status = 'Stockout'
  } else if (row.closing_stock < row.safety_threshold) {
    row.stock_status = 'Risk'
  } else {
    row.stock_status = 'OK'
  }
})
```

## 算法验证示例

### 输入
- SKU: D-001
- 销售需求: W08 (373件), W09 (400件), W10 (350件)
- 提前期配置:
  - 生产周期: 5周
  - 装柜周期: 1周
  - 物流周期: 5周
  - 安全库存: 2周

### 反推计算过程

**W08销售需求 (373件):**
```
销售周: W08
  ↓ 减 2周 (安全库存)
到仓周: W06 (累加 373)
  ↓ 减 5周 (物流周期)
发货周: W01 (累加 373)
  ↓ 减 1周 (装柜周期)
出货周: 2025-W52 (累加 373)
  ↓ 减 5周 (生产周期)
下单周: 2025-W47 (累加 373)
```

**W09销售需求 (400件):**
```
销售周: W09
  ↓ 减 2周
到仓周: W07 (累加 400)
  ↓ 减 5周
发货周: W02 (累加 400)
  ↓ 减 1周
出货周: W01 (累加 400)
  ↓ 减 5周
下单周: 2025-W48 (累加 400)
```

**聚合结果:**
- W01出货周: 373 + 400 = 773件（多个销售需求汇聚）
- W06到仓周: 373件
- W07到仓周: 400件

## 数据流图

```
销售预测/实际 ────┐
采购订单 ─────────┼──→ 周次聚合 ──→ 反推计算 ──→ 库存计算 ──→ 状态判断
工厂出货 ─────────┤
物流发货 ─────────┤
到仓记录 ─────────┤
当前库存 ─────────┘
```

## 性能优化

1. **并行查询**: 7个数据源使用 `Promise.all` 并行获取
2. **周次过滤**: 仅查询16周范围内的数据
3. **Map结构**: 使用 `Map<week_iso, qty>` 快速聚合和查找
4. **单次遍历**: 反推计算和库存计算各遍历一次行数组

## API 接口

### 函数签名
```typescript
export async function fetchAlgorithmAuditV3(
  sku: string,
  shippingWeeks: number = 5
): Promise<AlgorithmAuditResultV3>
```

### 返回结果结构
```typescript
{
  product: Product | null,
  rows: AlgorithmAuditRowV3[],  // 16行数据
  leadTimes: {
    production_weeks: 5,
    loading_weeks: 1,
    shipping_weeks: 5,
    safety_stock_weeks: 2
  },
  metadata: {
    current_week: "2026-W01",
    start_week: "2025-W49",
    end_week: "2026-W12",
    total_weeks: 16,
    avg_weekly_sales: 385.5,
    safety_stock_weeks: 2,
    production_lead_weeks: 5,
    shipping_weeks: 5
  }
}
```

## 测试建议

### 单元测试
- [ ] `addWeeksToISOWeek()` 跨年边界测试
- [ ] 反推计算正确性验证
- [ ] 聚合逻辑测试（多周汇聚到同一周）
- [ ] 库存状态判断逻辑

### 集成测试
- [ ] 完整查询流程（含真实SKU数据）
- [ ] 物流周期可配置性验证（4-6周）
- [ ] 空数据情况处理
- [ ] 16周范围边界测试

### 验收测试
- [ ] 使用真实SKU D-001测试
- [ ] 对比V2和V3结果差异
- [ ] 验证反推计算与实际采购计划的匹配度
- [ ] 前端表格展示测试

## 下一步工作

### 前端开发（Frontend Artisan）
1. 创建 `AlgorithmAuditTableV3.tsx` 组件
2. 实现20列表格布局（固定第一列）
3. 添加物流周期配置输入框
4. 实现单元格颜色编码（实际数据高亮）
5. 创建页面路由 `app/inventory/algorithm-audit-v3/page.tsx`

### 数据库优化（可选）
```sql
-- 推荐索引
CREATE INDEX IF NOT EXISTS idx_sales_forecasts_sku_week
  ON sales_forecasts(sku, week_iso);

CREATE INDEX IF NOT EXISTS idx_sales_actuals_sku_week
  ON sales_actuals(sku, week_iso);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_actual_order_date
  ON purchase_orders(actual_order_date)
  WHERE actual_order_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_production_deliveries_sku_date
  ON production_deliveries(sku, actual_delivery_date)
  WHERE actual_delivery_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_departure_date
  ON shipments(actual_departure_date)
  WHERE actual_departure_date IS NOT NULL;
```

## 文件清单

### 已创建 ✅
- `src/lib/types/database.ts` (更新)
- `src/lib/utils.ts` (更新)
- `src/lib/queries/algorithm-audit-v3.ts` (新建)
- `src/lib/version.ts` (更新: v1.4.0)

### 待创建 ⏳
- `src/components/inventory/algorithm-audit-table-v3.tsx`
- `src/app/inventory/algorithm-audit-v3/page.tsx`

## 版本信息
- 版本号: v1.4.0
- 更新时间: 2025-12-03 22:45 CST
- 变更类型: 新功能（MINOR版本升级）
- 更新说明: 算法验证V3后端实现：20列反推计算、可配置物流周期、完整类型定义

## 备注
- 所有类型均严格遵循TypeScript类型定义
- 代码已通过构建验证（`npm run build`）
- 核心算法基于设计文档 `specs/algorithm-audit-v3/design.md` 实现
- 反推计算支持跨年周次处理（如2025-W52 → 2026-W01）
