# 命名规范重构执行计划

**执行时间:** 待定
**影响范围:** 1 个文件 + 5 处引用
**风险等级:** 低（仅文件重命名，无逻辑变更）

---

## 一、重构目标

将不符合命名规范的客户端分离组件重命名：

```
旧路径: src/app/planning/projection/page-client.tsx
新路径: src/app/planning/projection/projection.client.tsx
```

**原因:**
- `page-client` 与 Next.js 保留文件名 `page.tsx` 冲突
- 新命名 `projection.client.tsx` 明确表达这是 projection 页面的客户端逻辑

---

## 二、影响分析

### 2.1 文件引用关系

通过 `grep` 扫描，发现以下引用需要同步更新：

| 文件类型 | 文件路径 | 引用位置 |
|---------|---------|---------|
| **页面组件** | `src/app/planning/projection/page.tsx` | 第 3 行 import 语句 |
| **文档** | `docs/replenishment-action-center-verification.md` | 第 66, 113 行 |
| **文档** | `specs/replenishment-action-center/implementation-summary.md` | 第 63, 115, 262, 322 行 |
| **文档** | `specs/replenishment-action-center/README.md` | 第 322 行 |

---

## 三、重构步骤清单

### Step 1: 备份（可选）

```bash
# 创建备份分支（推荐）
git checkout -b refactor/naming-convention
```

---

### Step 2: 重命名文件

```bash
# 使用 git mv 保留文件历史
git mv \
  src/app/planning/projection/page-client.tsx \
  src/app/planning/projection/projection.client.tsx
```

---

### Step 3: 更新文件引用

#### 3.1 更新页面组件引用

**文件:** `src/app/planning/projection/page.tsx`

**修改:**
```diff
- import { InventoryProjectionPageClient } from './page-client'
+ import { InventoryProjectionPageClient } from './projection.client'
```

---

#### 3.2 更新文档引用（3 个文件）

**文件 1:** `docs/replenishment-action-center-verification.md`

**修改位置:**
- 第 66 行: 路径引用
- 第 113 行: 文件名称

**修改:**
```diff
- ✅ `/src/app/planning/projection/page-client.tsx` (61 行)
+ ✅ `/src/app/planning/projection/projection.client.tsx` (61 行)

-  └─ page-client.tsx (Client Component)
+  └─ projection.client.tsx (Client Component)
```

---

**文件 2:** `specs/replenishment-action-center/implementation-summary.md`

**修改位置:**
- 第 63 行: 文件路径
- 第 115 行: 文件名称
- 第 262 行: 注释
- 第 322 行: 文件树

**修改:**
```diff
- 7. `/src/app/planning/projection/page-client.tsx`
+ 7. `/src/app/planning/projection/projection.client.tsx`

- Client Component (page-client.tsx)
+ Client Component (projection.client.tsx)

- // page-client.tsx (Client Component)
+ // projection.client.tsx (Client Component)

- └── page-client.tsx                       # Client component (coordination)
+ └── projection.client.tsx                # Client component (coordination)
```

---

**文件 3:** `specs/replenishment-action-center/README.md`

**修改位置:**
- 第 322 行: 文件树

**修改:**
```diff
- └── page-client.tsx                       # Client component (coordination)
+ └── projection.client.tsx                # Client component (coordination)
```

---

### Step 4: 验证构建

```bash
# 运行 TypeScript 类型检查
npm run build

# 运行 ESLint 检查
npm run lint

# 启动开发服务器验证
npm run dev
```

---

### Step 5: 测试功能

手动测试以下页面：

1. 访问 `/planning/projection`
2. 验证页面正常渲染
3. 验证 "补货决策中心" 组件正常显示
4. 点击 "查看库存预测" 按钮，验证跳转功能

---

### Step 6: 提交变更

```bash
# 查看变更
git status
git diff

# 添加所有变更
git add .

# 提交（附带详细说明）
git commit -m "refactor: 统一客户端分离组件命名规范

- 重命名: page-client.tsx → projection.client.tsx
- 更新页面引用: src/app/planning/projection/page.tsx
- 更新文档引用: 3 个文档文件同步更新
- 理由: 避免与 Next.js 保留文件名 page.tsx 冲突

符合命名规范: specs/naming-convention/design.md

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 四、自动化重构脚本

如果您希望一键执行，可以使用以下脚本：

### 4.1 Bash 脚本

```bash
#!/bin/bash
# 文件: scripts/refactor-naming.sh

set -e  # 遇到错误立即退出

echo "📦 开始重命名 page-client.tsx → projection.client.tsx"

# Step 1: 重命名文件
echo "1️⃣ 重命名文件..."
git mv \
  src/app/planning/projection/page-client.tsx \
  src/app/planning/projection/projection.client.tsx

# Step 2: 更新页面引用
echo "2️⃣ 更新页面组件引用..."
sed -i '' "s/from '.\/page-client'/from '.\/projection.client'/" \
  src/app/planning/projection/page.tsx

# Step 3: 更新文档引用
echo "3️⃣ 更新文档引用..."

# 文档 1
sed -i '' 's/page-client\.tsx/projection.client.tsx/g' \
  docs/replenishment-action-center-verification.md

# 文档 2
sed -i '' 's/page-client\.tsx/projection.client.tsx/g' \
  specs/replenishment-action-center/implementation-summary.md

# 文档 3
sed -i '' 's/page-client\.tsx/projection.client.tsx/g' \
  specs/replenishment-action-center/README.md

# Step 4: 验证构建
echo "4️⃣ 验证 TypeScript 构建..."
npm run build

echo "✅ 重构完成！请手动测试 /planning/projection 页面"
```

---

### 4.2 运行脚本

```bash
# 赋予执行权限
chmod +x scripts/refactor-naming.sh

# 执行重构
./scripts/refactor-naming.sh
```

---

## 五、回滚方案

如果重构后出现问题，可使用以下命令回滚：

```bash
# 方案 1: 如果还未提交
git restore .
git mv \
  src/app/planning/projection/projection.client.tsx \
  src/app/planning/projection/page-client.tsx

# 方案 2: 如果已提交但未推送
git reset --hard HEAD~1

# 方案 3: 如果已推送
git revert HEAD
```

---

## 六、后续维护

### 6.1 新增客户端分离组件规则

今后创建客户端分离组件时，必须遵循以下命名：

```
✅ 正确示例:
src/app/inventory/balances/balances.client.tsx
src/app/logistics/tracking/tracking.client.tsx

❌ 错误示例:
src/app/inventory/balances/page-client.tsx
src/app/logistics/tracking/client.tsx
```

### 6.2 代码审查检查项

在 Pull Request 审查时，QA Director 必须检查：

- [ ] 是否有新的 `*-client.tsx` 文件？
- [ ] 文件名是否使用 `[page-name].client.tsx` 格式？
- [ ] 是否有 `page-client.tsx` 命名？（禁止）

---

## 七、总结

### 7.1 重构范围

- **文件变更:** 1 个文件重命名
- **代码引用:** 1 处 import 更新
- **文档引用:** 5 处路径更新
- **预计耗时:** 5-10 分钟（含测试）

### 7.2 风险评估

- **代码风险:** 极低（仅路径变更，无逻辑修改）
- **构建风险:** 无（TypeScript 会检测到错误引用）
- **运行时风险:** 无（import 路径自动解析）

### 7.3 执行建议

**推荐方式:** 手动执行（更安全）

1. 使用 `git mv` 重命名文件
2. 使用编辑器批量替换引用（VSCode: Ctrl+Shift+H）
3. 运行 `npm run build` 验证
4. 手动测试页面功能
5. 提交变更

---

**文档版本:** 1.0.0
**制定时间:** 2025-12-04
**制定人:** System Architect
