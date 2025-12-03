# 12周库存预测功能 - 快速实施指南

## 概览

本指南帮助您快速部署和使用12周库存预测功能。完整技术设计请参考 [TechDesign-InventoryProjection.md](./TechDesign-InventoryProjection.md)

---

## 步骤 1: 运行数据库迁移

### 1.1 连接到 Supabase

```bash
# 确保已安装 Supabase CLI
supabase login

# 链接到你的项目
supabase link --project-ref YOUR_PROJECT_REF
```

### 1.2 运行迁移文件

```bash
# 应用迁移
supabase db push

# 或者手动执行 SQL
psql -h YOUR_DB_HOST -U postgres -d postgres -f supabase/migrations/20250130_create_inventory_projection_12weeks_view.sql
```

### 1.3 验证迁移成功

在 Supabase SQL Editor 中运行：

```sql
-- 检查视图是否创建
SELECT COUNT(*) FROM v_inventory_projection_12weeks;
-- 预期: SKU数量 × 12

SELECT COUNT(*) FROM v_replenishment_suggestions;
-- 预期: 处于风险状态的SKU数量

-- 检查辅助函数
SELECT get_week_iso(CURRENT_DATE);
-- 预期: '2025-W05' (根据当前日期)

-- 测试刷新功能
SELECT refresh_inventory_projections();
-- 预期: 无错误返回
```

---

## 步骤 2: 测试 API 查询函数

### 2.1 创建测试页面

创建文件 `/app/test-projection/page.tsx`:

```tsx
import { fetchInventoryProjection12Weeks, fetchRiskSummary } from '@/lib/queries/inventory-projection'

export default async function TestProjectionPage() {
  // 测试基础查询
  const projections = await fetchInventoryProjection12Weeks({
    max_week_offset: 3  // 只获取前4周
  })

  // 测试风险汇总
  const summary = await fetchRiskSummary()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">库存预测测试</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">风险汇总</h2>
        <pre className="bg-gray-100 p-4 rounded">
          {JSON.stringify(summary, null, 2)}
        </pre>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">前4周预测 (前10条)</h2>
        <pre className="bg-gray-100 p-4 rounded overflow-auto">
          {JSON.stringify(projections.slice(0, 10), null, 2)}
        </pre>
      </div>
    </div>
  )
}
```

访问 `http://localhost:3000/test-projection` 验证数据是否正确返回。

---

## 步骤 3: 创建前端展示页面

### 3.1 12周预测表格页面

创建文件 `/app/inventory/projection/page.tsx`:

```tsx
import { fetchInventoryProjection12Weeks, fetchRiskSummary } from '@/lib/queries/inventory-projection'
import { ComplexTable } from '@/components/tables/ComplexTable'

export default async function InventoryProjectionPage() {
  const projections = await fetchInventoryProjection12Weeks()
  const summary = await fetchRiskSummary()

  const columns = [
    { key: 'sku', label: 'SKU', sortable: true },
    { key: 'product_name', label: '产品名称' },
    { key: 'week_iso', label: '周次', sortable: true },
    { key: 'opening_stock', label: '期初库存', align: 'right' },
    { key: 'incoming_qty', label: '预计到货', align: 'right' },
    { key: 'effective_sales', label: '有效销量', align: 'right' },
    { key: 'closing_stock', label: '期末库存', align: 'right' },
    {
      key: 'stock_status',
      label: '状态',
      render: (row: any) => (
        <span className={`
          px-2 py-1 rounded text-sm font-medium
          ${row.stock_status === 'OK' ? 'bg-green-100 text-green-800' : ''}
          ${row.stock_status === 'Risk' ? 'bg-yellow-100 text-yellow-800' : ''}
          ${row.stock_status === 'Stockout' ? 'bg-red-100 text-red-800' : ''}
        `}>
          {row.stock_status}
        </span>
      )
    },
  ]

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">12周库存预测</h1>

      {/* KPI 汇总卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-gray-500 text-sm">总SKU数</div>
          <div className="text-2xl font-bold">{summary.total_skus}</div>
        </div>
        <div className="bg-green-50 p-4 rounded shadow">
          <div className="text-gray-500 text-sm">正常</div>
          <div className="text-2xl font-bold text-green-600">{summary.ok_count}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded shadow">
          <div className="text-gray-500 text-sm">风险</div>
          <div className="text-2xl font-bold text-yellow-600">{summary.risk_count}</div>
        </div>
        <div className="bg-red-50 p-4 rounded shadow">
          <div className="text-gray-500 text-sm">断货</div>
          <div className="text-2xl font-bold text-red-600">{summary.stockout_count}</div>
        </div>
      </div>

      {/* 预测表格 */}
      <ComplexTable
        data={projections}
        columns={columns}
        searchable
        exportable
        itemsPerPage={50}
      />
    </div>
  )
}
```

### 3.2 补货建议页面

创建文件 `/app/inventory/replenishment/page.tsx`:

```tsx
import { fetchReplenishmentSuggestions } from '@/lib/queries/inventory-projection'
import { ComplexTable } from '@/components/tables/ComplexTable'

export default async function ReplenishmentPage() {
  const suggestions = await fetchReplenishmentSuggestions()

  const columns = [
    {
      key: 'priority',
      label: '优先级',
      render: (row: any) => (
        <span className={`
          px-2 py-1 rounded text-sm font-bold
          ${row.priority === 'Critical' ? 'bg-red-100 text-red-800' : ''}
          ${row.priority === 'High' ? 'bg-orange-100 text-orange-800' : ''}
          ${row.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' : ''}
          ${row.priority === 'Low' ? 'bg-blue-100 text-blue-800' : ''}
        `}>
          {row.priority}
        </span>
      )
    },
    { key: 'sku', label: 'SKU' },
    { key: 'product_name', label: '产品名称' },
    { key: 'suggested_order_qty', label: '建议订货量', align: 'right' },
    {
      key: 'order_deadline_date',
      label: '下单截止日期',
      render: (row: any) => (
        <span className={row.is_overdue ? 'text-red-600 font-bold' : ''}>
          {row.order_deadline_date}
          {row.is_overdue && ' (已逾期)'}
        </span>
      )
    },
    { key: 'days_until_deadline', label: '剩余天数', align: 'right' },
    { key: 'risk_week_iso', label: '风险周次' },
    { key: 'closing_stock', label: '预计库存', align: 'right' },
  ]

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">补货建议</h1>

      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <p className="text-sm text-yellow-700">
          共有 <strong>{suggestions.length}</strong> 个SKU需要补货。
          其中 <strong>{suggestions.filter(s => s.is_overdue).length}</strong> 个已逾期，
          <strong>{suggestions.filter(s => s.priority === 'Critical').length}</strong> 个紧急优先级。
        </p>
      </div>

      <ComplexTable
        data={suggestions}
        columns={columns}
        searchable
        exportable
        itemsPerPage={25}
      />
    </div>
  )
}
```

---

## 步骤 4: 配置自动刷新

### 4.1 创建 Cron API 路由

创建文件 `/app/api/cron/refresh-projections/route.ts`:

```typescript
import { refreshInventoryProjectionViews } from '@/lib/queries/inventory-projection'

export async function GET(request: Request) {
  // 验证 Vercel Cron 密钥
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await refreshInventoryProjectionViews()
    return Response.json({
      success: true,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Cron refresh failed:', error)
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
```

### 4.2 配置 Vercel Cron

在项目根目录创建/更新 `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-projections",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### 4.3 设置环境变量

在 Vercel Dashboard 或 `.env.local` 中添加：

```bash
CRON_SECRET=your-random-secret-string-here
```

---

## 步骤 5: 日常使用

### 5.1 查看预测数据

访问: `/inventory/projection`

- 查看所有SKU的12周预测
- 筛选风险状态 (Stockout/Risk/OK)
- 导出 Excel 报表

### 5.2 处理补货建议

访问: `/inventory/replenishment`

1. 查看优先级列表
2. 关注 "Critical" 和 "High" 优先级
3. 检查逾期项目
4. 根据建议创建采购订单

### 5.3 手动刷新数据

当有重要数据更新时（如新到货记录、实际销量导入），可以手动刷新：

```typescript
// 在 Server Action 或 API 路由中
import { refreshInventoryProjectionViews } from '@/lib/queries/inventory-projection'

export async function handleDataUpdate() {
  // ... 更新数据操作 ...

  // 刷新预测视图
  await refreshInventoryProjectionViews()
}
```

---

## 常见问题

### Q1: 视图数据为空怎么办？

**A:** 检查源数据表是否有数据：

```sql
-- 检查库存快照
SELECT COUNT(*) FROM inventory_snapshots;

-- 检查销售预测
SELECT COUNT(*) FROM sales_forecasts
WHERE week_start_date >= CURRENT_DATE;

-- 检查在途货运
SELECT COUNT(*) FROM shipments
WHERE actual_arrival_date IS NULL;
```

如果源表为空，需要先导入基础数据。

### Q2: 刷新视图很慢怎么办？

**A:** 检查索引是否创建成功：

```sql
SELECT indexname FROM pg_indexes
WHERE tablename IN (
  'inventory_snapshots',
  'shipments',
  'shipment_items',
  'sales_forecasts',
  'sales_actuals'
);
```

建议添加以下索引：

```sql
CREATE INDEX IF NOT EXISTS idx_shipments_arrival
ON shipments(COALESCE(actual_arrival_date, planned_arrival_date));

CREATE INDEX IF NOT EXISTS idx_sales_forecasts_week
ON sales_forecasts(week_iso);

CREATE INDEX IF NOT EXISTS idx_sales_actuals_week
ON sales_actuals(week_iso);
```

### Q3: 双轨制逻辑如何工作？

**A:** 系统优先使用实际销量，当实际数据不存在时使用预测数据：

```sql
-- 如果任何渠道有实际数据，使用实际数据之和
-- 否则使用预测数据之和
COALESCE(
  NULLIF(SUM(actual_qty), 0),  -- 实际销量 (如果 > 0)
  SUM(forecast_qty)            -- 否则用预测
) AS effective_sales
```

这意味着：
- 本周或过去周次：通常使用实际销量
- 未来周次：使用预测销量
- 混合情况：只要有部分实际数据就全部用实际数据

### Q4: 如何调整安全库存周数？

**A:** 在 `products` 表中更新 `safety_stock_weeks` 字段：

```sql
UPDATE products
SET safety_stock_weeks = 6  -- 改为6周
WHERE sku = 'SKU-001';

-- 然后刷新视图
SELECT refresh_inventory_projections();
```

---

## 性能优化建议

### 1. 定期 VACUUM 和 ANALYZE

```sql
-- 每周运行一次
VACUUM ANALYZE inventory_snapshots;
VACUUM ANALYZE shipments;
VACUUM ANALYZE sales_forecasts;
VACUUM ANALYZE sales_actuals;
```

### 2. 监控视图刷新时间

```sql
-- 检查最后刷新时间
SELECT calculated_at FROM v_inventory_projection_12weeks LIMIT 1;

-- 如果超过24小时，手动刷新
SELECT refresh_inventory_projections();
```

### 3. 使用分页查询

在前端获取大量数据时使用分页：

```typescript
// 不推荐: 一次获取所有数据
const allData = await fetchInventoryProjection12Weeks()

// 推荐: 分页或按SKU筛选
const pageData = await fetchInventoryProjection12Weeks({
  skus: ['SKU-001', 'SKU-002', ...],  // 只获取需要的SKU
  max_week_offset: 4  // 只获取前5周
})
```

---

## 下一步

1. 部署到生产环境
2. 设置监控告警 (Critical 补货建议)
3. 培训用户使用系统
4. 收集反馈优化功能

需要帮助？参考完整技术文档: [TechDesign-InventoryProjection.md](./TechDesign-InventoryProjection.md)
