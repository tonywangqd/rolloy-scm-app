# 补货行动中心 - 技术设计规格

## 一、系统概述

### 1.1 功能定位
补货行动中心是库存预测页面的核心行动区域，将数据洞察转化为可执行的采购建议。

### 1.2 数据源
- 物化视图: `v_replenishment_suggestions`
- 查询函数: `fetchReplenishmentSuggestions()` (已存在于 `/src/lib/queries/inventory-projection.ts`)
- 类型定义: `ReplenishmentSuggestionView` (已存在于 `/src/lib/types/database.ts`)

---

## 二、数据库设计

### 2.1 Schema (已存在)
```sql
-- 物化视图: v_replenishment_suggestions
-- 字段映射 (来自视图定义):
sku                      TEXT
product_name             TEXT
risk_week_iso            TEXT      -- 首次风险周 (ISO 格式: 2025-W05)
risk_week_start          DATE      -- 风险周开始日期
risk_week_end            DATE      -- 风险周结束日期
suggested_order_qty      INTEGER   -- 建议采购数量
order_deadline_week      TEXT      -- 下单截止周
order_deadline_date      DATE      -- 下单截止日期
ship_deadline_week       TEXT      -- 出货截止周
ship_deadline_date       DATE      -- 出货截止日期
priority                 TEXT      -- Critical/High/Medium/Low
opening_stock            INTEGER   -- 风险周期初库存
closing_stock            INTEGER   -- 风险周期末库存
safety_stock_threshold   INTEGER   -- 安全库存阈值
effective_sales          INTEGER   -- 实际/预测销量
stock_status             TEXT      -- Stockout/Risk/OK
is_overdue               BOOLEAN   -- 是否已超期
days_until_deadline      INTEGER   -- 距离截止日天数
calculated_at            TIMESTAMP -- 计算时间
```

### 2.2 RLS Policies
补货建议视图继承库存预测的 RLS 策略：
```sql
-- 策略: 所有认证用户可读取
CREATE POLICY "Enable read access for authenticated users"
ON v_replenishment_suggestions FOR SELECT
TO authenticated
USING (true);
```

### 2.3 索引优化
物化视图已自动创建以下索引：
- `(priority, order_deadline_date)` - 用于优先级排序
- `(sku)` - 用于 SKU 筛选
- `(is_overdue)` - 用于过期筛选

---

## 三、TypeScript 接口定义

### 3.1 视图类型 (已存在)
```typescript
// 文件: /src/lib/types/database.ts
export interface ReplenishmentSuggestionView {
  sku: string
  product_name: string
  risk_week_iso: string
  risk_week_start: string
  risk_week_end: string
  suggested_order_qty: number
  order_deadline_week: string
  order_deadline_date: string
  ship_deadline_week: string
  ship_deadline_date: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  opening_stock: number
  closing_stock: number
  safety_stock_threshold: number
  effective_sales: number
  stock_status: 'Stockout' | 'Risk' | 'OK'
  is_overdue: boolean
  days_until_deadline: number
  calculated_at: string
}
```

### 3.2 筛选条件类型 (已存在)
```typescript
export interface ReplenishmentSuggestionFilters {
  sku?: string
  priority?: 'Critical' | 'High' | 'Medium' | 'Low'
  is_overdue?: boolean
  max_days_until_deadline?: number
}
```

### 3.3 UI 状态类型 (新增)
```typescript
// 文件: /src/lib/types/replenishment.ts
export interface ReplenishmentActionFilters {
  priority: 'All' | 'Critical' | 'High' | 'Medium' | 'Low'
  overdueOnly: boolean
  searchSku: string
}

export interface ReplenishmentRowAction {
  type: 'create_po' | 'dismiss' | 'view_projection'
  suggestionId: string
  sku: string
}
```

---

## 四、查询函数设计

### 4.1 现有查询函数
文件: `/src/lib/queries/inventory-projection.ts`

已实现的函数:
- `fetchReplenishmentSuggestions(filters?)` - 基础查询
- `fetchReplenishmentBySku(sku)` - 单 SKU 查询
- `fetchCriticalReplenishments()` - 高优先级查询
- `fetchOverdueReplenishments()` - 过期查询

### 4.2 无需新增查询
现有函数已完全覆盖需求，组合使用即可。

---

## 五、组件层次结构

### 5.1 组件树
```
/planning/projection (Page)
├── RiskSummaryCards (已存在)
├── InventoryProjectionWrapper (已存在)
└── ReplenishmentActionCenter (新增)
    ├── ReplenishmentActionHeader (新增)
    │   ├── Title + Description
    │   ├── Filter Controls (Priority, Overdue Toggle)
    │   └── SKU Search Input
    ├── ReplenishmentActionStats (新增)
    │   ├── Critical Count Badge
    │   ├── High Priority Count Badge
    │   └── Overdue Count Badge
    └── ReplenishmentActionTable (新增)
        ├── Table Header (SKU, Risk Week, Qty, Deadline, Priority, Status)
        ├── Table Rows
        │   ├── Priority Badge
        │   ├── Stock Status Badge
        │   ├── Days Until Deadline Indicator
        │   └── Action Buttons
        └── Empty State
```

### 5.2 组件职责划分

#### 5.2.1 ReplenishmentActionCenter (Container)
- **路径**: `/src/components/planning/replenishment-action-center.tsx`
- **类型**: Client Component ('use client')
- **职责**:
  - 管理筛选状态 (useState)
  - 数据过滤逻辑
  - 组合子组件
- **Props**:
  ```typescript
  interface ReplenishmentActionCenterProps {
    suggestions: ReplenishmentSuggestionView[]
    riskStats: RiskSummaryStats
  }
  ```

#### 5.2.2 ReplenishmentActionHeader (Presentation)
- **路径**: `/src/components/planning/replenishment-action-header.tsx`
- **类型**: Client Component
- **职责**:
  - 展示标题和描述
  - 渲染筛选控件
  - 触发筛选回调
- **Props**:
  ```typescript
  interface ReplenishmentActionHeaderProps {
    onFilterChange: (filters: ReplenishmentActionFilters) => void
    currentFilters: ReplenishmentActionFilters
  }
  ```

#### 5.2.3 ReplenishmentActionStats (Presentation)
- **路径**: `/src/components/planning/replenishment-action-stats.tsx`
- **类型**: Client Component
- **职责**:
  - 展示补货统计 Badge
  - 提供快速筛选按钮
- **Props**:
  ```typescript
  interface ReplenishmentActionStatsProps {
    stats: {
      critical_count: number
      high_count: number
      overdue_count: number
      total_count: number
    }
    onQuickFilter: (priority: Priority | 'overdue') => void
  }
  ```

#### 5.2.4 ReplenishmentActionTable (Presentation)
- **路径**: `/src/components/planning/replenishment-action-table.tsx`
- **类型**: Client Component
- **职责**:
  - 渲染补货建议表格
  - 处理行内操作
- **Props**:
  ```typescript
  interface ReplenishmentActionTableProps {
    data: ReplenishmentSuggestionView[]
    onAction: (action: ReplenishmentRowAction) => void
  }
  ```

---

## 六、数据流设计

### 6.1 Server-Side Data Flow
```
page.tsx (Server Component)
  ↓
fetchReplenishmentSuggestions()
  ↓ (Supabase Query)
v_replenishment_suggestions (Materialized View)
  ↓ (Props)
ReplenishmentActionCenter (Client Component)
```

### 6.2 Client-Side State Flow
```
ReplenishmentActionCenter (State Container)
  │
  ├─ filters: ReplenishmentActionFilters
  │   ├─ priority: 'All' | 'Critical' | 'High' | 'Medium' | 'Low'
  │   ├─ overdueOnly: boolean
  │   └─ searchSku: string
  │
  ├─ filteredData: ReplenishmentSuggestionView[]
  │   (Computed via useMemo)
  │
  └─ handleAction(action: ReplenishmentRowAction)
      ├─ 'create_po' → Navigate to /planning/purchase-orders/new?sku={sku}&qty={qty}
      ├─ 'dismiss' → Future: Update suggestion status
      └─ 'view_projection' → Scroll to InventoryProjectionWrapper + Filter to SKU
```

### 6.3 数据流时序图
```
1. Page Load
   Server: Fetch suggestions → Pass to Client Component

2. User Filters
   Client: Update filters → useMemo recompute → Re-render table

3. User Actions
   Client: Click "Create PO" → router.push('/planning/purchase-orders/new?...')
   Client: Click "View Details" → Scroll + Update parent SKU filter (via callback)
```

---

## 七、UI 设计规范

### 7.1 优先级颜色映射
```typescript
const PRIORITY_STYLES = {
  Critical: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
    badge: 'destructive', // shadcn/ui variant
  },
  High: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-300',
    badge: 'warning',
  },
  Medium: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
    badge: 'secondary',
  },
  Low: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    badge: 'outline',
  },
}
```

### 7.2 状态指示器
```typescript
// 库存状态 Badge
Stockout → Red Badge "断货"
Risk     → Yellow Badge "风险"
OK       → Green Badge "正常"

// 超期状态
is_overdue: true  → Red Alert Icon + "已超期 {days} 天"
is_overdue: false → Countdown Timer "{days} 天内下单"
```

### 7.3 表格列定义
| 列名             | 宽度   | 对齐   | 内容                                      |
|------------------|--------|--------|-------------------------------------------|
| SKU              | 120px  | Left   | product_name (SKU)                        |
| 风险周           | 100px  | Center | risk_week_iso (Tooltip: 日期范围)         |
| 建议采购         | 80px   | Right  | suggested_order_qty 件                    |
| 下单截止         | 120px  | Center | order_deadline_date + 天数倒计时          |
| 优先级           | 80px   | Center | Priority Badge                            |
| 库存状态         | 80px   | Center | Stock Status Badge                        |
| 操作             | 200px  | Center | [创建采购单] [查看详情] [忽略]            |

---

## 八、实现计划

### 8.1 文件清单

#### 新增文件
1. `/src/lib/types/replenishment.ts` - UI 状态类型
2. `/src/components/planning/replenishment-action-center.tsx` - 容器组件
3. `/src/components/planning/replenishment-action-header.tsx` - 筛选控件
4. `/src/components/planning/replenishment-action-stats.tsx` - 统计 Badge
5. `/src/components/planning/replenishment-action-table.tsx` - 数据表格

#### 修改文件
1. `/src/app/planning/projection/page.tsx` - 添加数据查询和组件引用
2. `/src/components/planning/inventory-projection-wrapper.tsx` - 添加 ref 支持外部控制 SKU 筛选

### 8.2 实施步骤
1. 创建类型定义文件
2. 创建展示组件 (Stats, Header, Table)
3. 创建容器组件 (Center)
4. 修改页面集成组件
5. 添加交互逻辑 (筛选、操作)

---

## 九、性能优化策略

### 9.1 数据层优化
- 物化视图已预计算关键字段 (priority, days_until_deadline)
- Server-Side 数据获取 (减少客户端请求)
- 使用 `useMemo` 缓存过滤结果

### 9.2 渲染优化
```typescript
// 1. 避免内联函数导致的重渲染
const handleFilterChange = useCallback((filters) => {...}, [])

// 2. 使用 useMemo 缓存过滤数据
const filteredData = useMemo(() => {
  return suggestions.filter(...)
}, [suggestions, filters])

// 3. 表格虚拟化 (如果数据 > 100 行)
// 使用 @tanstack/react-virtual
```

---

## 十、安全性考虑

### 10.1 数据访问控制
- 所有查询通过 Server Components 执行
- Supabase RLS 强制执行 `authenticated` 用户访问
- 客户端组件仅接收序列化后的数据

### 10.2 操作权限
- 创建采购单: 跳转到 PO 表单 (表单层再验证权限)
- 忽略建议: 未来实现时需要 Row-Level 权限检查

---

## 十一、测试策略

### 11.1 单元测试
- 筛选逻辑测试 (priority, overdue, search)
- 日期格式化工具函数测试
- Badge 颜色映射测试

### 11.2 集成测试
- 端到端筛选流程
- 操作按钮导航测试
- 空状态渲染测试

### 11.3 数据边界测试
- 空数据集
- 单条记录
- 大数据集 (100+ 条)
- 过期数据处理

---

## 十二、未来扩展

### 12.1 短期增强 (Phase 2)
- 批量操作 (批量创建 PO, 批量忽略)
- 导出 Excel 功能
- 补货建议历史记录

### 12.2 中期增强 (Phase 3)
- AI 智能推荐 (基于历史采购周期)
- 供应商智能匹配
- 邮件通知提醒

### 12.3 长期愿景 (Phase 4)
- 自动下单工作流
- 供应商协同平台
- 预测模型持续优化
