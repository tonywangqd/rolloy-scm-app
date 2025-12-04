# 命名规范速查表 (Quick Reference)

**快速决策指南 - 2秒查找你需要的命名规则**

---

## 我要创建什么？

### 1. 页面路由 (App Router)

```
我要创建一个新页面？
→ src/app/[module]/page.tsx

示例:
✅ src/app/inventory/page.tsx
✅ src/app/sales-forecast/page.tsx
❌ src/app/SalesForecast/page.tsx
```

---

### 2. 客户端组件分离

```
我要把 page.tsx 的客户端逻辑分离出来？
→ src/app/[module]/[page-name].client.tsx

示例:
✅ src/app/planning/projection/projection.client.tsx
❌ src/app/planning/projection/page-client.tsx (不要用 page- 前缀)
```

---

### 3. React 业务组件

```
我要创建一个业务组件？
→ src/components/[module]/[component-name].tsx

命名规则: kebab-case

示例:
✅ src/components/inventory/inventory-edit-modal.tsx
✅ src/components/dashboard/sales-trend-chart.tsx
❌ src/components/inventory/InventoryEditModal.tsx
```

**组件内部:**
```typescript
// 文件: inventory-edit-modal.tsx
export function InventoryEditModal() {
  // ✅ 导出名使用 PascalCase
}
```

---

### 4. UI 基础组件 (ShadCN)

```
我要添加一个 ShadCN UI 组件？
→ src/components/ui/[component-name].tsx

命名规则: kebab-case

示例:
✅ src/components/ui/button.tsx
✅ src/components/ui/data-table.tsx
❌ src/components/ui/Button.tsx
```

---

### 5. TypeScript 类型文件

```
我要定义类型？
→ src/lib/types/[domain].ts

命名规则: 单词（无连字符）

示例:
✅ src/lib/types/database.ts
✅ src/lib/types/replenishment.ts
❌ src/lib/types/database-types.ts
```

**类型内部:**
```typescript
// 文件: replenishment.ts
export interface ReplenishmentAction {
  // ✅ 类型名使用 PascalCase
}
```

---

### 6. 查询函数 (Queries)

```
我要写数据查询逻辑？
→ src/lib/queries/[module].ts

命名规则: 按模块命名（单词）

示例:
✅ src/lib/queries/inventory.ts
✅ src/lib/queries/planning.ts
❌ src/lib/queries/get-inventory.ts
```

**函数内部:**
```typescript
// 文件: inventory.ts
export async function getInventoryByWarehouse() {
  // ✅ 函数名使用 camelCase
}
```

---

### 7. Server Actions

```
我要写数据变更逻辑？
→ src/lib/actions/[module].ts

命名规则: 按模块命名（单词）

示例:
✅ src/lib/actions/planning.ts
✅ src/lib/actions/procurement.ts
❌ src/lib/actions/create-purchase-order.ts
```

**函数内部:**
```typescript
'use server'

// 文件: procurement.ts
export async function createPurchaseOrder() {
  // ✅ 函数名使用 camelCase
}
```

---

### 8. 工具函数

```
我要写通用工具函数？
→ src/lib/utils/[function].ts

命名规则: kebab-case

示例:
✅ src/lib/utils/date.ts
✅ src/lib/utils/po-number.ts
✅ src/lib/utils/replenishment-utils.ts
❌ src/lib/utils/dateHelpers.ts
```

---

### 9. 自定义 Hook

```
我要写自定义 Hook？
→ src/hooks/use-[name].ts

命名规则: use- 前缀 + kebab-case

示例:
✅ src/hooks/use-pagination.ts
✅ src/lib/hooks/use-toast.tsx
❌ src/hooks/pagination.ts
❌ src/hooks/usePagination.ts (文件名不要用 camelCase)
```

**Hook 内部:**
```typescript
// 文件: use-pagination.ts
export function usePagination() {
  // ✅ Hook 函数名使用 camelCase
}
```

---

### 10. 验证逻辑 (Zod)

```
我要写验证规则？
→ src/lib/validations/index.ts 或 [module].ts

示例:
✅ src/lib/validations/index.ts
✅ src/lib/validations/auth.ts
```

---

## 快速判断流程图

```
创建新文件
  |
  ├─ 是页面吗？ → page.tsx (Next.js 保留名)
  |
  ├─ 是组件吗？ → kebab-case.tsx
  |
  ├─ 是类型吗？ → 单词.ts (database.ts)
  |
  ├─ 是 Hook 吗？ → use-[name].ts
  |
  ├─ 是工具函数吗？ → kebab-case.ts
  |
  └─ 是查询/Action 吗？ → [module].ts
```

---

## 常见错误对照表

| 错误命名 | 正确命名 | 类型 |
|---------|---------|------|
| `InventoryTable.tsx` | `inventory-table.tsx` | 组件 |
| `page-client.tsx` | `projection.client.tsx` | 客户端分离组件 |
| `database-types.ts` | `database.ts` | 类型文件 |
| `get-inventory.ts` | `inventory.ts` | 查询文件 |
| `dateHelpers.ts` | `date.ts` 或 `date-helpers.ts` | 工具函数 |
| `pagination.ts` | `use-pagination.ts` | Hook 文件 |
| `SalesForecast/` | `sales-forecast/` | 路由文件夹 |

---

## 文件名检查清单

创建文件前，问自己：

1. 文件夹是 `kebab-case` 吗？
2. 组件文件是 `kebab-case.tsx` 吗？
3. 类型文件是单词 `.ts` 吗？
4. Hook 文件有 `use-` 前缀吗？
5. Next.js 保留名（page, layout, route）用小写了吗？

---

## 导入路径规范

**永远使用 `@/` 别名:**

```typescript
✅ import { Button } from '@/components/ui/button'
✅ import { getInventory } from '@/lib/queries/inventory'
✅ import type { Database } from '@/lib/types/database'

❌ import { Button } from '../../components/ui/button'
❌ import { Button } from 'src/components/ui/button'
```

---

**最后更新:** 2025-12-04
**版本:** 1.0.0
