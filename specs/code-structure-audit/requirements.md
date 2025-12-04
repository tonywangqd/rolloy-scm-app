# 代码结构审计报告 (Code Structure Audit Report)

**Generated:** 2025-12-04
**Scope:** 文件命名、目录组织、一致性审计
**Audit Type:** Product Management Perspective

---

## Executive Summary

对 Rolloy SCM 项目进行全面的文件结构审计，从**产品视角**识别命名不一致、组织不合理、可维护性问题。本审计覆盖 `src/app/`、`src/components/` 和 `src/lib/` 三个核心目录，以及 `specs/` 文档目录。

**关键发现:**
- **严重问题 (P0):** 5 项 - 影响开发效率和代码可维护性
- **重要问题 (P1):** 8 项 - 存在一致性风险
- **次要问题 (P2):** 6 项 - 可优化的改进点

---

## 1. 严重问题 (P0 - Critical)

### P0-1: 组件目录出现业务概念不一致

**问题描述:**
- 存在 `components/balance/` 目录，但业务模块中没有 "Balance" 这个顶级模块
- 根据业务定义，模块应为: Dashboard, Planning, Procurement, Logistics, Inventory, Finance, Settings
- "Balance" (库存对账) 实际上是 **Inventory (库存管理)** 的子功能

**影响:**
- 新开发者无法从业务模块快速定位组件
- 违反了 "组件应按业务模块组织" 的架构原则
- 造成概念混淆：Balance 看起来像独立模块，但页面路由在 `app/inventory/balances/`

**当前状态:**
```
components/balance/          # ❌ 业务概念不存在
├── balance-resolution-dialog.tsx
├── balance-summary-cards.tsx
├── balance-warning-banner.tsx
└── open-balance-list.tsx

app/inventory/balances/page.tsx  # ✅ 路由正确归属于 Inventory
```

**整改建议:**
- **重命名:** `components/balance/` → `components/inventory/balance/`
- **理由:** 明确 Balance 是 Inventory 的子功能，而非独立模块

---

### P0-2: 文件命名出现版本号后缀 (v3)

**问题描述:**
在多个地方出现 `algorithm-audit-v3` 这种版本号后缀命名：
- `app/inventory/algorithm-audit-v3/page.tsx`
- `app/inventory/algorithm-audit/page.tsx` (旧版本)
- `components/inventory/algorithm-audit-table-v3.tsx`
- `components/inventory/algorithm-audit-v3-filters.tsx`
- `lib/queries/algorithm-audit-v3.ts`
- `lib/queries/algorithm-audit.ts`

**影响:**
- **用户体验问题:** 用户看到两个"算法验证"页面，不知道应该用哪个
- **技术债务:** 旧版本未清理，代码库膨胀
- **命名混乱:** 组件命名不统一 (`-v3` 后缀位置不一致)

**整改建议:**
1. **确认 V3 为正式版本**后，执行以下操作：
   - 删除旧版本文件 (`algorithm-audit/` 无后缀的旧版本)
   - 将 V3 升级为正式版本 (去掉 `-v3` 后缀)
2. **如果需要保留旧版本**用于对比：
   - 重命名为 `algorithm-audit-legacy/`
   - 在页面标题明确标注 "已弃用" 或 "仅供对比"

---

### P0-3: 页面文件命名不一致 (`page-client.tsx`)

**问题描述:**
在 `app/planning/projection/` 目录下，同时存在：
- `page.tsx` (Server Component)
- `page-client.tsx` (Client Component)

**影响:**
- **Next.js 路由规范:** Next.js App Router 不支持 `page-client.tsx` 作为路由文件
- **架构不清晰:** 应该将客户端逻辑封装为普通组件，而非特殊命名的页面文件
- **可维护性差:** 其他开发者会误以为这是特殊的 Next.js 约定

**当前架构:**
```typescript
// page.tsx (Server Component)
export default async function ProjectionPage() {
  const data = await fetchData()
  return <InventoryProjectionPageClient data={data} />
}

// page-client.tsx (Client Component)
'use client'
export function InventoryProjectionPageClient({ data }) {
  // ...interactive logic
}
```

**整改建议:**
- **重命名:** `page-client.tsx` → `_components/projection-client.tsx`
- **或者:** 直接移到 `components/planning/projection-page-client.tsx`
- **原则:** 只有 `page.tsx` 才是路由入口，其他逻辑应该是普通组件

---

### P0-4: `lib/` 下存在双重 hooks 目录

**问题描述:**
```
src/hooks/use-pagination.ts       # ❌ 顶层 hooks 目录
src/lib/hooks/use-toast.tsx       # ❌ lib 下的 hooks 目录
```

**影响:**
- **导入路径混乱:** 开发者不知道 hooks 应该放在哪里
- **违反单一职责:** 同一类型的文件应该在同一个位置
- **可发现性差:** 新 hook 应该放哪里？两个地方都有可能

**整改建议:**
- **统一路径:** 将所有 hooks 移到 `src/lib/hooks/`
- **删除:** `src/hooks/` 目录
- **理由:** `lib/` 是工具库的标准位置，保持一致性

---

### P0-5: `lib/utils/` 和 `lib/utils.ts` 共存

**问题描述:**
```
src/lib/utils.ts                  # ❌ 单文件
src/lib/utils/                    # ❌ 目录
├── date.ts
├── export.ts
├── po-number.ts
└── replenishment-utils.ts
```

**影响:**
- **架构不清晰:** utils 到底是单文件还是目录？
- **导入混乱:**
  ```typescript
  import { cn } from '@/lib/utils'           // 从文件导入
  import { formatDate } from '@/lib/utils/date'  // 从目录导入
  ```
- **扩展性差:** 随着工具函数增多，不知道应该放在哪里

**整改建议:**
**方案 A (推荐):** 统一为目录结构
- 重命名 `utils.ts` → `utils/index.ts`
- 将通用工具 (如 `cn`) 保留在 `utils/index.ts`
- 专用工具独立成文件 (date, export 等)

**方案 B:** 保持单文件，合并目录
- 将 `utils/` 下的文件合并到 `utils.ts`
- 但这不适合大型项目 (不推荐)

---

## 2. 重要问题 (P1 - High Priority)

### P1-1: 组件命名风格不一致

**问题描述:**
观察到两种命名风格混用：

**风格 A: 功能-类型 (noun-type)**
```
components/planning/inventory-projection-chart.tsx
components/planning/inventory-projection-table.tsx
components/planning/inventory-projection-wrapper.tsx
components/finance/batch-payment-form.tsx
```

**风格 B: 类型-功能 (type-noun) 或 缩写**
```
components/procurement/delete-po-button.tsx      # 动词开头
components/logistics/arrival-confirm-button.tsx  # 动词开头
components/dashboard/kpi-cards.tsx               # 缩写 KPI
components/planning/sku-filter.tsx               # 缩写 SKU
```

**影响:**
- 降低代码可读性
- IDE 自动补全效果差 (按字母排序时分散)

**整改建议:**
- **统一风格为:** `{模块}-{功能}-{类型}.tsx`
- **示例:**
  - `delete-po-button.tsx` → `po-delete-button.tsx`
  - `arrival-confirm-button.tsx` → `shipment-arrival-button.tsx`
  - `kpi-cards.tsx` → `dashboard-kpi-cards.tsx`

---

### P1-2: 缩写使用不统一

**问题描述:**

**使用缩写的地方:**
- `kpi-cards.tsx` (KPI)
- `sku-filter.tsx`, `sku-selector.tsx` (SKU)
- `po-number.ts` (PO)

**不使用缩写的地方:**
- `inventory-projection-*` (没有缩写)
- `replenishment-action-*` (没有缩写)

**影响:**
- 搜索困难 (搜 "purchase order" 找不到 "po")
- 新人学习曲线陡峭 (需要记住哪些缩写是允许的)

**整改建议:**
- **制定缩写白名单:**
  - **允许:** SKU, PO, KPI (行业通用缩写)
  - **禁止:** 自创缩写 (如 InventProj)
- **文档化:** 在 CLAUDE.md 中明确列出

---

### P1-3: 组件类型后缀不完整

**问题描述:**

**有类型后缀的组件:**
```
*-table.tsx
*-chart.tsx
*-form.tsx
*-dialog.tsx
*-button.tsx
*-filter.tsx
```

**缺少类型后缀的组件:**
```
components/planning/replenishment-action-center.tsx  # 是什么类型？
components/planning/inventory-projection-wrapper.tsx # Wrapper 不是标准类型
components/dashboard/quick-actions.tsx               # 是 Panel? Card? List?
components/dashboard/risk-alerts.tsx                 # 同上
```

**影响:**
- 无法从文件名判断组件类型
- 降低代码可预测性

**整改建议:**
- **补充类型后缀:**
  - `replenishment-action-center.tsx` → `replenishment-action-panel.tsx` (或 `-section`)
  - `quick-actions.tsx` → `quick-actions-panel.tsx`
  - `risk-alerts.tsx` → `risk-alerts-list.tsx` (或 `-panel`)
- **Wrapper 的处理:**
  - 如果是容器组件，应该叫 `-container.tsx`
  - 如果是 HOC，应该放在 `lib/hoc/`

---

### P1-4: Query 文件命名与页面不对应

**问题描述:**

**Queries 文件:**
```
lib/queries/algorithm-audit.ts
lib/queries/algorithm-audit-v3.ts
lib/queries/calculation-audit.ts
lib/queries/inventory-projection.ts
```

**对应的页面路由:**
```
app/inventory/algorithm-audit/page.tsx
app/inventory/algorithm-audit-v3/page.tsx
app/planning/calculation-audit/page.tsx
app/planning/projection/page.tsx
```

**不一致点:**
- `inventory-projection.ts` 但路由是 `planning/projection` (不是 inventory)
- 没有 `balance.ts`，但有 `app/inventory/balances/page.tsx`

**影响:**
- 开发者找不到对应的 query 文件
- 页面和数据层脱节

**整改建议:**
- **重命名:** `inventory-projection.ts` → `planning-projection.ts`
- **补充:** 创建 `inventory-balances.ts` (如果现在是从 `inventory.ts` 导出的话)

---

### P1-5: Actions 缺少领域划分

**问题描述:**
```
lib/actions/
├── auth.ts
├── balance.ts          # ← 不应该是独立模块
├── finance.ts
├── inventory.ts
├── logistics.ts
├── planning.ts
├── procurement.ts
└── settings.ts
```

**不一致点:**
- `balance.ts` 独立存在，但业务上 Balance 属于 Inventory
- 与 `components/balance/` 的问题类似 (P0-1)

**整改建议:**
- **合并:** `balance.ts` → `inventory.ts` (作为导出的一部分)
- **或者:** 重命名为 `inventory-balance.ts` 明确归属

---

### P1-6: 缺少统一的页面命名约定

**问题描述:**

**观察到的页面结构模式:**
- **模式 A:** `app/planning/page.tsx` (索引页)
- **模式 B:** `app/planning/forecasts/page.tsx` (子页面)
- **模式 C:** `app/procurement/[id]/page.tsx` (动态路由)
- **模式 D:** `app/procurement/deliveries/new/page.tsx` (嵌套子功能)

**不一致点:**
- `deliveries` 是 `procurement` 的子功能，但放在了同级目录
- 按理说应该是 `procurement/orders/` 和 `procurement/deliveries/` 并列

**整改建议:**
- **明确子模块结构规范:**
  ```
  procurement/
  ├── page.tsx                    # 采购总览
  ├── orders/                     # 采购订单
  │   ├── page.tsx               # 订单列表
  │   ├── [id]/page.tsx          # 订单详情
  │   └── new/page.tsx           # 新建订单
  └── deliveries/                 # 生产交货
      ├── page.tsx               # 交货列表
      └── new/page.tsx           # 新建交货
  ```

---

### P1-7: 缺少一致的 Tab 组件命名

**问题描述:**
```
components/procurement/procurement-tabs.tsx
components/finance/finance-tabs.tsx
```

**疑问:**
- 其他模块有 Tabs 吗？为什么 Planning 和 Inventory 没有？
- 是否应该统一为 `{module}-tabs.tsx` 格式？

**整改建议:**
- **检查是否所有需要 Tabs 的模块都有对应组件**
- **统一命名:** 如果是模块级别的 Tab，都应该叫 `{module}-tabs.tsx`

---

### P1-8: Specs 目录命名不一致

**问题描述:**

**功能型命名:**
```
specs/algorithm-audit/
specs/algorithm-audit-v3/
specs/balance-management/
specs/replenishment-action-center/
```

**概念型命名:**
```
specs/dual-track-logic/
specs/security/
specs/product-review/
specs/system-audit/
```

**版本型命名:**
```
specs/v1.2.2-fixes/
```

**影响:**
- 新需求不知道应该用哪种命名风格
- 不利于文档归档和检索

**整改建议:**
- **制定 Specs 命名规范:**
  - **功能需求:** `feature-{name}/` (如 `feature-replenishment-center/`)
  - **架构设计:** `arch-{name}/` (如 `arch-dual-track-logic/`)
  - **安全审计:** `security-{topic}/`
  - **版本修复:** `release-{version}/` (如 `release-v1.2.2/`)

---

## 3. 次要问题 (P2 - Medium Priority)

### P2-1: 缺少组件索引文件 (index.ts)

**问题描述:**
大部分组件目录没有 `index.ts` 文件，导致导入语句冗长：

**当前导入:**
```typescript
import { ReplenishmentActionCenter } from '@/components/planning/replenishment-action-center'
import { ReplenishmentActionHeader } from '@/components/planning/replenishment-action-header'
import { ReplenishmentActionStats } from '@/components/planning/replenishment-action-stats'
```

**理想导入:**
```typescript
import {
  ReplenishmentActionCenter,
  ReplenishmentActionHeader,
  ReplenishmentActionStats,
} from '@/components/planning'
```

**整改建议:**
- 在每个组件模块目录下添加 `index.ts`
- 导出该模块的所有公共组件

---

### P2-2: UI 组件缺少分类

**问题描述:**
`components/ui/` 下所有组件平铺，随着组件增多会难以管理：

**当前:**
```
components/ui/
├── alert-dialog.tsx
├── alert.tsx
├── badge.tsx
├── button.tsx
├── card.tsx
├── checkbox.tsx
├── confirm-dialog.tsx
├── data-table-pagination.tsx
├── data-table-toolbar.tsx
...
```

**建议分类:**
```
components/ui/
├── feedback/          # Alert, Toast, Dialog
├── forms/             # Input, Select, Checkbox, Textarea
├── layout/            # Card, Tabs
├── data-display/      # Table, Badge, Label
└── actions/           # Button, Dropdown Menu
```

---

### P2-3: 类型文件缺少领域划分

**问题描述:**
```
lib/types/
├── database.ts         # 包含所有数据库类型 (巨大文件)
└── replenishment.ts    # 只有这一个业务类型文件
```

**影响:**
- `database.ts` 会随着项目增长变得巨大
- 缺少业务领域类型的组织

**整改建议:**
- **拆分 database.ts:**
  ```
  lib/types/
  ├── database/
  │   ├── index.ts        # 导出所有类型
  │   ├── product.ts
  │   ├── sales.ts
  │   ├── procurement.ts
  │   ├── logistics.ts
  │   └── inventory.ts
  ├── business/
  │   ├── replenishment.ts
  │   └── dashboard.ts
  └── common/
      └── api.ts          # API 响应类型
  ```

---

### P2-4: 缺少组件文档注释标准

**问题描述:**
部分组件有详细的文档注释，部分没有：

**好的示例:**
```typescript
/**
 * Replenishment Action Center Component
 * Main container for replenishment suggestions
 */
```

**缺少注释的文件:**
大部分组件文件没有顶部注释

**整改建议:**
- 制定文件注释模板 (已有 `.cursorrules`)
- 要求所有组件文件包含：用途、关键 Props、使用场景

---

### P2-5: 缺少 README 文件

**问题描述:**
以下目录缺少 README.md 说明文档：
- `src/components/` (各子目录)
- `src/lib/queries/`
- `src/lib/actions/`
- `src/lib/utils/`

**整改建议:**
- 在每个核心目录下添加 `README.md`
- 说明该目录的用途、组织方式、命名规范

---

### P2-6: 缺少 E2E 测试目录规划

**问题描述:**
项目中没有看到测试文件 (`*.test.ts` 或 `*.spec.ts`)

**影响:**
- 无法保证代码质量
- 重构风险高

**整改建议:**
- 规划测试目录结构:
  ```
  tests/
  ├── unit/              # 单元测试
  │   ├── lib/
  │   └── components/
  └── e2e/               # 端到端测试
      ├── planning/
      ├── procurement/
      └── inventory/
  ```

---

## 4. 整改建议的大方向

### 4.1 命名规范统一化 (Naming Convention Standardization)

**目标:** 建立统一的文件、目录、组件命名规范

**行动清单:**
1. **制定命名规范文档** (`docs/NAMING_CONVENTIONS.md`)
   - 页面路由命名规范
   - 组件命名规范 (格式、后缀、缩写白名单)
   - Query/Action 文件命名规范
   - Types 命名规范

2. **执行批量重命名**
   - P0 级问题优先 (Balance 目录、Version 后缀、双重 utils)
   - P1 级问题跟进 (组件类型后缀、Query 对应关系)

3. **建立 Lint 规则**
   - 使用 ESLint 插件检查文件命名 (如 `eslint-plugin-filename-rules`)
   - 在 CI/CD 中强制执行

---

### 4.2 目录结构扁平化 (Directory Structure Flattening)

**目标:** 减少不必要的嵌套，提高可发现性

**行动清单:**
1. **合并子功能目录**
   - `components/balance/` → `components/inventory/balance/`
   - `lib/hooks/` + `hooks/` → 统一到 `lib/hooks/`

2. **引入模块索引文件**
   - 每个组件目录添加 `index.ts`
   - 简化导入路径

3. **拆分巨大文件**
   - `lib/types/database.ts` → `lib/types/database/*`
   - 按领域拆分

---

### 4.3 版本管理清理 (Version Management Cleanup)

**目标:** 清理技术债务，统一版本策略

**行动清单:**
1. **清理 V3 问题**
   - 确认 `algorithm-audit-v3` 为正式版本
   - 删除或归档旧版本
   - 去掉 `-v3` 后缀

2. **建立版本管理规范**
   - 禁止在文件名中使用版本号
   - 使用 Git Tags 管理版本
   - 旧版本通过 Git History 查找

---

### 4.4 文档补全 (Documentation Completion)

**目标:** 让代码自解释，降低新人学习成本

**行动清单:**
1. **补充 README 文件**
   - 每个核心目录都有 README.md
   - 说明目录用途、组织方式、示例

2. **补充组件文档注释**
   - 统一使用 JSDoc 格式
   - 包含: 用途、Props、示例

3. **更新 CLAUDE.md**
   - 添加命名规范章节
   - 添加缩写白名单
   - 添加组件类型后缀列表

---

### 4.5 技术债务优先级排期 (Technical Debt Prioritization)

**Phase 1 (本周完成):**
- [x] P0-1: 重命名 `components/balance/` → `components/inventory/balance/`
- [x] P0-4: 合并双重 hooks 目录
- [x] P0-5: 统一 utils 为目录结构

**Phase 2 (下周完成):**
- [ ] P0-2: 清理 V3 版本问题 (需要业务确认)
- [ ] P0-3: 重命名 `page-client.tsx`
- [ ] P1-1: 统一组件命名风格

**Phase 3 (下下周完成):**
- [ ] P1-3: 补全组件类型后缀
- [ ] P1-4: 修正 Query 文件命名
- [ ] P1-8: 统一 Specs 目录命名

**Phase 4 (长期优化):**
- [ ] P2 级问题 (添加 index.ts, 拆分 types, 补充文档)

---

## 5. 成功标准 (Success Criteria)

**1. 一致性指标:**
- [ ] 100% 的组件文件都有类型后缀 (`-table`, `-chart`, `-form` 等)
- [ ] 100% 的缩写符合白名单规范
- [ ] 100% 的业务组件归属到正确的模块目录

**2. 可发现性指标:**
- [ ] 新人可以在 30 秒内找到任意功能的组件位置
- [ ] Query/Action 文件与页面路由一一对应
- [ ] 文件名能够准确反映其功能和类型

**3. 可维护性指标:**
- [ ] 单一文件不超过 500 行 (types/database.ts 需要拆分)
- [ ] 每个模块目录都有 README.md
- [ ] 所有公共组件都有 JSDoc 注释

**4. 技术债务指标:**
- [ ] 0 个版本号后缀 (如 `-v3`)
- [ ] 0 个重复概念的目录 (如双重 hooks, balance 独立)
- [ ] 0 个孤立的 Client 文件 (`page-client.tsx`)

---

## 6. 风险评估 (Risk Assessment)

### 高风险操作:
1. **重命名 `components/balance/`**
   - 影响范围: 所有导入该目录组件的文件
   - 缓解措施: 使用 IDE 的全局重构功能 (VSCode: F2)

2. **清理 V3 版本文件**
   - 影响范围: 如果用户仍在使用旧版本功能
   - 缓解措施: 先确认业务方已完全迁移到 V3

3. **合并 utils 目录**
   - 影响范围: 所有导入 `@/lib/utils` 的文件
   - 缓解措施: 保持导入路径兼容 (通过 index.ts)

### 低风险操作:
- 添加 index.ts 文件 (不影响现有代码)
- 添加 README.md (纯文档)
- 补充 JSDoc 注释 (不影响运行时)

---

## 7. 附录: 命名规范速查表 (Quick Reference)

### 组件命名格式:
```
{模块}-{功能}-{类型}.tsx
```

**示例:**
- `inventory-projection-table.tsx` ✅
- `po-delete-button.tsx` ✅
- `shipment-arrival-button.tsx` ✅

### 允许的缩写:
- **SKU** - Stock Keeping Unit (库存单位)
- **PO** - Purchase Order (采购订单)
- **KPI** - Key Performance Indicator (关键指标)
- **RLS** - Row Level Security (行级安全)

### 组件类型后缀:
- `-table` - 表格组件
- `-chart` - 图表组件
- `-form` - 表单组件
- `-dialog` / `-modal` - 弹窗组件
- `-button` - 按钮组件
- `-card` - 卡片组件
- `-panel` / `-section` - 面板/区域组件
- `-list` - 列表组件
- `-filter` - 筛选器组件
- `-selector` - 选择器组件

### 页面路由规范:
```
app/
├── {module}/              # 模块
│   ├── page.tsx          # 模块首页
│   ├── {feature}/        # 功能
│   │   ├── page.tsx     # 功能列表页
│   │   ├── [id]/        # 详情页
│   │   └── new/         # 新建页
│   └── {sub-module}/     # 子模块
```

---

**报告生成者:** Product Director Agent
**下一步行动:** 需要开发团队确认整改优先级，并排期执行 Phase 1 任务。
