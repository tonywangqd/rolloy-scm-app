# 销量时间线功能设计文档

## 概述
销量时间线功能在计划管理页面提供一个可视化的时间线视图，同时展示过去4周的实际销量、当前周和未来12周的预测销量。

## 功能需求

### 时间范围
- **过去4周**：显示实际销量数据（已发生）
- **当前周**：2025-W49（高亮显示）
- **未来12周**：显示预测销量数据（计划）
- **总计**：17周的数据

### 数据来源
- `sales_forecasts` 表：预测数据（week_iso, sku, channel_code, forecast_qty）
- `sales_actuals` 表：实际数据（week_iso, sku, channel_code, actual_qty）
- `products` 表：产品信息（sku, product_name）

## 技术实现

### 1. 查询函数 (`/src/lib/queries/planning.ts`)

#### `fetchSalesTimeline()`
新增的异步查询函数，返回时间线数据结构。

**返回数据结构：**
```typescript
{
  weeks: {
    week_iso: string           // ISO周格式：YYYY-Www
    week_type: 'past' | 'current' | 'future'
    forecast_total: number     // 该周预测总量
    actual_total: number       // 该周实际总量
    variance: number           // 偏差（实际-预测）
    variance_pct: number       // 偏差率（%）
  }[]
  by_sku: {
    sku: string
    product_name?: string
    weeks: {
      week_iso: string
      forecast: number
      actual: number
    }[]
  }[]
}
```

**实现逻辑：**
1. 计算当前周（使用 `getCurrentWeek()`）
2. 计算周范围：当前日期 -4周 到 +12周
3. 并行查询：
   - `weekly_sales_forecasts`（指定周范围）
   - `weekly_sales_actuals`（指定周范围）
   - `products`（活跃产品）
4. 生成完整的周列表（处理可能缺失的周）
5. 按周汇总所有SKU的预测和实际数据
6. 按SKU分组数据（可选，用于详细展示）
7. 分类每周为 past/current/future
8. 计算偏差和偏差率

**辅助函数：**
- `getISOWeek(date)`: 将日期转换为ISO周格式
- `addWeeks(date, weeks)`: 日期加减周数
- `compareISOWeeks(a, b)`: 比较两个ISO周字符串
- `parseISOWeek(weekISO)`: 解析ISO周字符串（暂未使用，预留）

### 2. 时间线组件 (`/src/components/planning/sales-timeline.tsx`)

#### SalesTimeline 组件
客户端组件，使用 Recharts 库渲染时间线图表。

**Props：**
```typescript
interface SalesTimelineProps {
  data: {
    weeks: Array<{...}>
    by_sku: Array<{...}>
  }
}
```

**视觉设计：**
- **过去周**：绿色柱状图（#10b981），显示实际销量
- **当前周**：黄色/琥珀色柱状图（#f59e0b），特殊标记
- **未来周**：蓝色柱状图（#3b82f6），显示预测销量
- **参考线**：在当前周位置显示虚线标记

**图表特性：**
1. 响应式容器（ResponsiveContainer）
2. 自定义 Tooltip 显示详细信息：
   - 过去周：显示实际、预测、偏差
   - 当前周：显示预测、可能的部分实际
   - 未来周：仅显示预测
3. 柱状图使用不同颜色单元格（Cell）区分周类型
4. X轴标签旋转-45度以节省空间
5. 底部汇总统计卡片

**汇总统计：**
- 过去4周总实际销量（绿色）
- 当前周预测销量（琥珀色）
- 未来12周预测总量（蓝色）

### 3. 页面集成 (`/src/app/planning/page.tsx`)

**修改点：**
1. 导入新的查询函数和组件
2. 在服务端并行获取时间线数据
3. 在统计卡片后、快速操作按钮前插入时间线图表

**布局顺序：**
1. 页面标题
2. 统计卡片（4个KPI）
3. **销量时间线图表**（新增）
4. 快速操作按钮
5. 周度汇总表格

## 数据流程

```
用户访问 /planning
    ↓
PlanningPage (Server Component)
    ↓
fetchSalesTimeline() ← 并行查询
    ↓
- weekly_sales_forecasts
- weekly_sales_actuals
- products
    ↓
聚合 & 分类数据
    ↓
SalesTimeline (Client Component)
    ↓
Recharts BarChart 渲染
```

## 类型安全

所有函数和组件都使用完整的TypeScript类型定义：
- 查询函数返回类型明确定义
- 组件 Props 接口定义
- 内部数据结构使用类型推断

## 性能优化

1. **并行查询**：使用 `Promise.all()` 同时获取预测、实际、产品数据
2. **数据聚合**：在服务端完成聚合计算，减少客户端负担
3. **缓存策略**：页面使用 `force-dynamic` 保证数据实时性
4. **最大柱宽**：设置 `maxBarSize={60}` 避免过宽影响视觉

## 边界情况处理

1. **空数据**：显示友好的空状态提示
2. **缺失周数**：自动生成完整周列表，缺失数据填充为0
3. **当前周无实际**：仅显示预测数据
4. **跨年处理**：ISO周格式天然支持跨年场景

## 未来扩展

1. **SKU筛选**：支持选择特定SKU查看时间线
2. **可切换视图**：折线图/柱状图切换
3. **可配置范围**：用户自定义过去和未来周数
4. **数据导出**：导出时间线数据为CSV/Excel
5. **交互式编辑**：直接在图表上编辑预测值

## 测试场景

1. 正常场景：有完整的过去和未来数据
2. 边界场景：只有预测无实际 / 只有实际无预测
3. 空数据场景：完全没有数据
4. 跨年场景：当前周在年末/年初
5. 大数据量：多SKU、多渠道聚合性能

## 依赖

- Recharts: ^2.x（图表库）
- Next.js 14+：App Router
- Supabase：数据库查询
- TypeScript 5+：类型安全

## 文件清单

1. `/src/lib/queries/planning.ts` - 查询函数（新增函数）
2. `/src/components/planning/sales-timeline.tsx` - 时间线组件（新文件）
3. `/src/app/planning/page.tsx` - 计划管理页面（修改）
4. `/docs/features/sales-timeline.md` - 本设计文档

## 代码风格

遵循项目现有代码风格：
- 使用 `'use client'` 标记客户端组件
- 使用 shadcn/ui 组件库（Card, Button等）
- 使用 Tailwind CSS 样式
- 导入路径使用 `@/` 别名
- 函数使用 JSDoc 注释
- 组件使用明确的 TypeScript 接口
