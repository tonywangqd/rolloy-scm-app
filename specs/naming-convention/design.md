# Rolloy SCM 命名规范设计文档

**制定时间:** 2025-12-04
**角色:** System Architect
**目标:** 统一项目中的文件、文件夹、变量、类型命名规范

---

## 一、当前命名问题分析

### 1.1 现存问题

通过扫描项目结构，发现以下命名不一致问题：

#### 问题 1: 路由文件夹命名混乱
- **现状:**
  - 大部分使用 `kebab-case`: `algorithm-audit-v3`, `calculation-audit`
  - 但存在单词命名: `actuals`, `forecasts`, `balances`
- **问题:** 同一层级的路由文件夹没有统一风格

#### 问题 2: 页面辅助文件命名不规范
- **现状:**
  - `/planning/projection/page-client.tsx` 使用 `page-client` 命名
- **问题:** Next.js App Router 有 `page.tsx` 保留名，辅助文件应明确区分

#### 问题 3: 组件文件命名不统一
- **现状:**
  - 大部分组件使用 `kebab-case`: `inventory-edit-modal.tsx`, `sales-trend-chart.tsx`
  - UI 组件也使用 `kebab-case`: `data-table-pagination.tsx`
- **结论:** 组件命名已统一，但需明确是否符合 React 最佳实践

#### 问题 4: lib 工具类命名混合
- **现状:**
  - 查询文件: `algorithm-audit-v3.ts` (kebab-case)
  - 工具文件: `po-number.ts` (kebab-case)
  - 类型文件: `database.ts`, `replenishment.ts` (单词)
- **问题:** 类型文件和其他工具文件风格不统一

---

## 二、命名规范设计 (The Golden Rules)

### 2.1 设计原则

1. **一致性优先:** 同类文件必须使用相同命名风格
2. **语义清晰:** 文件名必须准确表达其用途
3. **框架兼容:** 遵循 Next.js/React/TypeScript 官方惯例
4. **可扩展性:** 命名规则应支持项目长期演进

---

### 2.2 文件夹命名规范

| 层级 | 规范 | 示例 | 说明 |
|------|------|------|------|
| **App Router 路由** | `kebab-case` | `algorithm-audit`, `sales-forecasts` | Next.js 路由直接映射 URL，使用 kebab-case 符合 URL 惯例 |
| **动态路由** | `[param]` | `[id]`, `[slug]` | Next.js 保留语法 |
| **组件模块文件夹** | `kebab-case` | `planning/`, `dashboard/` | 与业务模块名称对齐 |
| **lib 子文件夹** | `kebab-case` | `queries/`, `actions/`, `types/` | 功能分类文件夹 |

**核心规则:**
- 所有文件夹统一使用 `kebab-case`（中划线连接）
- 禁止使用 `camelCase`, `PascalCase`, `snake_case`

---

### 2.3 文件命名规范

#### 2.3.1 页面路由文件 (App Router)

| 文件类型 | 命名规范 | 示例 | 说明 |
|---------|---------|------|------|
| **页面组件** | `page.tsx` | `app/planning/page.tsx` | Next.js 保留文件名 |
| **布局组件** | `layout.tsx` | `app/layout.tsx` | Next.js 保留文件名 |
| **加载组件** | `loading.tsx` | `app/loading.tsx` | Next.js 保留文件名 |
| **错误组件** | `error.tsx` | `app/error.tsx` | Next.js 保留文件名 |
| **API 路由** | `route.ts` | `app/auth/callback/route.ts` | Next.js 保留文件名 |
| **客户端分离组件** | `[page-name].client.tsx` | `projection.client.tsx` | 明确标注客户端组件 |

**重要规则:**
- Next.js 保留文件名 (page, layout, loading, error, route) 必须使用小写
- 如需拆分客户端逻辑，使用 `[name].client.tsx` 而非 `page-client.tsx`

---

#### 2.3.2 React 组件文件

| 组件类型 | 命名规范 | 示例 | 说明 |
|---------|---------|------|------|
| **业务组件** | `kebab-case.tsx` | `inventory-edit-modal.tsx` | 业务逻辑组件 |
| **UI 基础组件** | `kebab-case.tsx` | `button.tsx`, `data-table.tsx` | ShadCN UI 组件 |
| **布局组件** | `kebab-case.tsx` | `header.tsx`, `sidebar.tsx` | 布局结构组件 |

**核心规则:**
- 所有 React 组件文件使用 `kebab-case`
- 组件内的导出名称使用 `PascalCase`（React 惯例）
- 禁止文件名使用 `PascalCase`（与 ShadCN 生态对齐）

**示例:**
```typescript
// 文件: inventory-edit-modal.tsx
export function InventoryEditModal() { ... }
```

---

#### 2.3.3 TypeScript 类型文件

| 文件类型 | 命名规范 | 示例 | 说明 |
|---------|---------|------|------|
| **数据库类型** | `database.ts` | `lib/types/database.ts` | 数据库表结构类型 |
| **业务领域类型** | `[domain].ts` | `replenishment.ts` | 特定业务领域类型 |
| **通用类型** | `index.ts` 或 `types.ts` | `lib/types/index.ts` | 聚合导出 |

**核心规则:**
- 类型文件使用语义化单词命名（不带连字符）
- 文件内类型定义使用 `PascalCase`
- Interface 使用 `PascalCase`，Type Alias 使用 `PascalCase`

---

#### 2.3.4 工具函数文件

| 文件类型 | 命名规范 | 示例 | 说明 |
|---------|---------|------|------|
| **通用工具** | `utils.ts` | `lib/utils.ts` | 通用辅助函数 |
| **领域工具** | `[domain]-utils.ts` | `replenishment-utils.ts` | 特定领域工具 |
| **专项工具** | `[function].ts` | `date.ts`, `export.ts` | 单一职责工具 |
| **编号生成器** | `[type]-number.ts` | `po-number.ts` | 编号生成逻辑 |

**核心规则:**
- 工具文件使用 `kebab-case`
- 主导出函数名使用 `camelCase`
- 多用途文件统一命名 `utils.ts`

---

#### 2.3.5 数据层文件

| 文件类型 | 命名规范 | 示例 | 说明 |
|---------|---------|------|------|
| **查询函数** | `[module].ts` | `lib/queries/inventory.ts` | 数据读取逻辑 |
| **Server Actions** | `[module].ts` | `lib/actions/planning.ts` | 数据变更逻辑 |
| **Supabase 客户端** | `client.ts`, `server.ts` | `lib/supabase/client.ts` | 客户端初始化 |

**核心规则:**
- 按业务模块拆分，一个模块一个文件
- 文件内函数使用 `camelCase`
- Server Actions 必须带 `'use server'` 指令

---

#### 2.3.6 Hook 文件

| 文件类型 | 命名规范 | 示例 | 说明 |
|---------|---------|------|------|
| **自定义 Hook** | `use-[name].ts` | `use-pagination.ts` | React Hooks |
| **UI Hook** | `use-[name].tsx` | `use-toast.tsx` | 带 JSX 的 Hook |

**核心规则:**
- 所有 Hook 文件必须以 `use-` 开头（React 惯例）
- 使用 `kebab-case`
- Hook 函数名使用 `camelCase`（如 `usePagination`）

---

#### 2.3.7 验证文件

| 文件类型 | 命名规范 | 示例 | 说明 |
|---------|---------|------|------|
| **Zod 验证** | `index.ts` | `lib/validations/index.ts` | 集中管理验证规则 |

**核心规则:**
- 验证逻辑统一放在 `validations/` 文件夹
- 可按模块拆分为多个文件（如 `auth.ts`, `planning.ts`）

---

## 三、重命名建议清单

### 3.1 需要立即修正的文件

| 优先级 | 旧路径 | 新路径 | 理由 |
|-------|--------|--------|------|
| **P0** | `src/app/planning/projection/page-client.tsx` | `src/app/planning/projection/projection.client.tsx` | 避免与 Next.js 保留名冲突 |

### 3.2 可选优化建议（保持现状也可）

当前项目的命名已经较为统一，以下文件**无需强制修改**，但记录备案：

| 文件类型 | 现状 | 建议 | 说明 |
|---------|------|------|------|
| 路由文件夹 | `actuals`, `forecasts` | 保持单词命名 | 路由本身就是单词，无需改为 `sales-actuals` |
| 类型文件 | `database.ts`, `replenishment.ts` | 保持不变 | 类型文件使用单词是标准做法 |
| 组件文件 | 全部 `kebab-case` | 保持不变 | 已符合规范 |

---

## 四、命名检查清单 (Checklist)

在创建新文件时，请参考此清单：

### 4.1 文件夹
- [ ] 是否使用 `kebab-case`？
- [ ] 文件夹名是否与业务模块对齐？

### 4.2 页面组件
- [ ] 是否使用 Next.js 保留名称（page, layout, route）？
- [ ] 客户端分离组件是否使用 `[name].client.tsx`？

### 4.3 React 组件
- [ ] 文件名是否使用 `kebab-case`？
- [ ] 组件导出名是否使用 `PascalCase`？

### 4.4 类型文件
- [ ] 是否使用语义化单词命名（无连字符）？
- [ ] 类型定义是否使用 `PascalCase`？

### 4.5 工具函数
- [ ] 是否使用 `kebab-case`？
- [ ] 函数名是否使用 `camelCase`？

### 4.6 Hook 文件
- [ ] 是否以 `use-` 开头？
- [ ] 是否使用 `kebab-case`？

---

## 五、ESLint / Prettier 配置建议

为了自动化检查，建议添加以下工具配置：

### 5.1 文件名检查

可使用 `eslint-plugin-filename-case` 插件：

```json
{
  "plugins": ["filename-case"],
  "rules": {
    "filename-case/filename-case": [
      "error",
      {
        "cases": {
          "kebabCase": true
        },
        "ignore": [
          "page.tsx",
          "layout.tsx",
          "route.ts",
          "loading.tsx",
          "error.tsx"
        ]
      }
    ]
  }
}
```

---

## 六、总结

### 6.1 核心原则

1. **文件夹:** 统一使用 `kebab-case`
2. **组件文件:** 统一使用 `kebab-case`，内部导出 `PascalCase`
3. **类型文件:** 使用语义化单词，类型定义 `PascalCase`
4. **工具函数:** 文件 `kebab-case`，函数 `camelCase`
5. **Hook 文件:** `use-[name].ts`
6. **Next.js 保留名:** 必须使用官方小写命名（page, layout, route）

### 6.2 立即行动项

只有 **1 个文件** 需要重命名：

```
src/app/planning/projection/page-client.tsx
→ src/app/planning/projection/projection.client.tsx
```

其他文件已符合规范，无需修改。

### 6.3 未来新增文件标准

所有新增文件必须严格遵循此文档规范，由 System Architect 和 QA Director 共同审核。

---

**文档版本:** 1.0.0
**制定人:** System Architect
**审核状态:** 待 QA Director 审核
