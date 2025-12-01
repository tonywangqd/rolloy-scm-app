# 库存预测 12 周视图 - 实现文档

## 概述
已成功实现库存预测12周视图的完整前端页面，包括风险汇总、数据筛选、趋势图表和明细表格。

## 访问路径
页面 URL: `http://localhost:3000/planning/projection`

从主导航进入: **计划管理** → **库存预测**

## 创建的文件

### 1. 核心页面
- `/src/app/planning/projection/page.tsx` - 主页面（服务端组件）

### 2. UI 组件
- `/src/components/planning/risk-summary-cards.tsx` - 风险汇总卡片
- `/src/components/planning/sku-filter.tsx` - SKU 筛选器
- `/src/components/planning/inventory-projection-chart.tsx` - 库存趋势图（Recharts）
- `/src/components/planning/inventory-projection-table.tsx` - 12周明细表格
- `/src/components/planning/inventory-projection-wrapper.tsx` - 客户端包装器

### 3. 公共组件（新增）
- `/src/components/ui/alert.tsx` - 提示框组件

## 功能特性

### 1. 风险汇总卡片
- 断货 SKU 数量（红色）
- 风险 SKU 数量（黄色）
- 正常 SKU 数量（绿色）
- 总 SKU 数量（蓝色）

### 2. SKU 筛选
- 下拉选择框支持筛选特定 SKU
- 刷新按钮重新加载数据

### 3. 库存趋势图表
- 使用 Recharts 的 LineChart
- 显示期初库存和期末库存趋势
- 安全库存阈值参考线
- 交互式 Tooltip 显示详细信息
- 支持单个 SKU 或全部 SKU 视图

### 4. 分周明细表格
- 按 SKU 分组显示
- 每周数据包含:
  - 周次（W01, W02...）
  - 期初库存
  - 到货数量（绿色显示）
  - 销量（红色显示）
  - 期末库存
  - 安全库存阈值
  - 状态徽章（正常/风险/断货）

## 技术栈
- **框架**: Next.js 14 App Router
- **类型**: TypeScript
- **样式**: Tailwind CSS
- **图表**: Recharts
- **组件**: 基于项目现有的 UI 组件库

## 数据依赖

### 后端查询函数
- `fetchInventoryProjection12Weeks()` - 获取12周预测数据
- `fetchRiskSummary()` - 获取风险汇总统计

### 数据库视图
需要先运行以下迁移创建视图:
```bash
supabase migration up
```

迁移文件:
- `supabase/migrations/20250130_create_inventory_projection_12weeks_view.sql`

## 错误处理

### 视图不存在
如果数据库视图尚未创建，页面会显示友好提示:
- 黄色警告框说明原因
- 提供解决方案（运行迁移命令）
- 显示默认的空状态

### 无数据
如果没有预测数据，显示:
- 空状态占位符
- 提示需要先录入基础数据

## 设计特点

### 1. 服务端渲染
- 主页面使用 Server Components
- 初始数据在服务端获取
- `dynamic = 'force-dynamic'` 确保数据实时性

### 2. 客户端交互
- 筛选器和图表使用 Client Components
- 轻量级状态管理（useState）
- 刷新通过 window.location.reload()

### 3. 响应式设计
- 移动优先的 Tailwind CSS
- 卡片网格自适应布局
- 表格支持横向滚动

### 4. 一致性
- 遵循项目现有设计规范
- 使用统一的颜色系统
- 复用现有 UI 组件

## 使用示例

### 查看所有 SKU 预测
1. 访问 `/planning/projection`
2. 默认显示所有 SKU 的数据
3. 顶部卡片显示风险汇总
4. 图表显示所有 SKU 的库存趋势
5. 表格按 SKU 分组展示明细

### 查看单个 SKU
1. 使用 SKU 筛选器选择特定 SKU
2. 图表自动更新为该 SKU 的趋势
3. 表格只显示该 SKU 的 12 周数据

### 刷新数据
- 点击"刷新数据"按钮重新加载最新数据

## 后续优化建议

1. **性能优化**
   - 添加数据缓存策略
   - 实现增量刷新而非整页重载

2. **功能增强**
   - 添加导出 Excel 功能
   - 支持多个状态同时筛选
   - 添加周范围选择器

3. **可视化**
   - 添加更多图表类型（堆叠柱状图、面积图）
   - 显示历史对比数据
   - 添加预警标记

4. **交互改进**
   - 表格排序和分页
   - 点击图表数据点跳转到对应周
   - 添加键盘快捷键

## 构建验证
项目已通过 Next.js 构建验证:
```bash
npm run build
✓ Compiled successfully
```

## 注意事项
1. 页面需要数据库视图支持，首次使用需运行迁移
2. 需要先录入产品、销量预测、采购订单等基础数据
3. 刷新按钮会重新加载整个页面，短期体验可能不够流畅
4. 图表库 Recharts 已在项目中配置，生产环境正常显示

---

创建时间: 2025-11-30
创建者: Claude Code
