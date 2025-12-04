# Rolloy SCM 数据库现状分析报告

**生成时间:** 2025-12-04
**数据库:** Supabase (PostgreSQL)
**分析范围:** 所有核心业务表

---

## 1. 数据量汇总 (Executive Summary)

| 表名 (Table) | 数据条数 (Rows) | 状态 (Status) |
|-------------|----------------|--------------|
| **基础数据 (Master Data)** | | |
| products (产品/SKU) | 9 | ✓ 已有数据 |
| warehouses (仓库) | 83 | ✓ 已有数据 |
| channels (渠道) | 4 | ✓ 已有数据 |
| suppliers (供应商) | 3 | ✓ 已有数据 |
| **采购链条 (Procurement)** | | |
| purchase_orders (采购订单) | 2 | ✓ 已有数据 |
| purchase_order_items (订单明细) | 5 | ✓ 已有数据 |
| production_deliveries (生产交货) | 1 | ⚠ 数据较少 |
| **物流链条 (Logistics)** | | |
| shipments (物流发货) | 2 | ✓ 已有数据 |
| shipment_items (发货明细) | 4 | ✓ 已有数据 |
| **销售数据 (Sales)** | | |
| sales_forecasts (销量预测) | 120 | ✓ 已有数据 |
| sales_actuals (实际销量) | 40 | ✓ 已有数据 |
| **库存数据 (Inventory)** | | |
| inventory_snapshots (库存快照) | 7 | ⚠ 数据较少 |

---

## 2. 基础数据详情 (Master Data Details)

### 2.1 Products (产品/SKU)

**总数:** 9 个 SKU

**SKU 列表:**

| SKU | SPU | Color | 产品名称 | 单位成本 | 安全库存周数 | 生产周期 | 状态 |
|-----|-----|-------|---------|---------|------------|---------|------|
| W1RD | W1 | RD | W1 Smartwatch - Red | $35 | 2周 | 5周 | ✓ |
| W1BK | W1 | BK | W1 Smartwatch - Black | $35 | 2周 | 5周 | ✓ |
| W2RD | W2 | RD | W2 Smartwatch - Red | $40 | 2周 | 5周 | ✓ |
| W2BK | W2 | BK | W2 Smartwatch - Black | $40 | 2周 | 5周 | ✓ |
| SKU-001 | SPU-A | BLK | Product A - Black | $25 | 2周 | 5周 | ✓ |
| SKU-002 | SPU-A | WHT | Product A - White | $25 | 2周 | 5周 | ✓ |
| SKU-003 | SPU-B | BLK | Product B - Black | $35 | 2周 | 5周 | ✓ |
| SKU-004 | SPU-B | WHT | Product B - White | $45 | 2周 | 5周 | ✓ |
| SKU-005 | SPU-C | RED | Product C - Red | $30 | 2周 | 5周 | ✓ |

**SPU 分组:**
- W1: 2个SKU (Red, Black)
- W2: 2个SKU (Red, Black)
- SPU-A: 2个SKU (Black, White)
- SPU-B: 2个SKU (Black, White)
- SPU-C: 1个SKU (Red)

### 2.2 Warehouses (仓库)

**总数:** 83 个仓库

**仓库分类:**

| 仓库类型 | 数量 | 区域分布 |
|---------|------|---------|
| FBA | ~78 | East, Central, West |
| 3PL | ~5 | East, Central, West |

**样本仓库 (前5个):**

| 仓库代码 | 仓库名称 | 类型 | 区域 | 状态 |
|---------|---------|------|------|------|
| FBA-AMA1 | Amazon FBA AMA1 | FBA | East | ✓ |
| FBA-ORD2 | Amazon FBA ORD2 | FBA | Central | ✓ |
| FBA-OAK3 | Amazon FBA OAK3 | FBA | West | ✓ |
| FBA-TEB4 | Amazon FBA TEB4 | FBA | East | ✓ |
| FBA-JAX3 | Amazon FBA JAX3 | FBA | East | ✓ |

**区域分布:**
- East (东部): ~35个仓库
- Central (中部): ~25个仓库
- West (西部): ~23个仓库

### 2.3 Channels (销售渠道)

**总数:** 4 个渠道

| 渠道代码 | 渠道名称 | 状态 |
|---------|---------|------|
| AMZ-US | Amazon-US | ✓ |
| SPF-US | Shopify-US | ✓ |
| WMT-US | Walmart-US | ✓ |
| SHOP-US | Shopify US | ✓ |

注意: SPF-US 和 SHOP-US 可能是重复数据，需要清理。

### 2.4 Suppliers (供应商)

**总数:** 3 个供应商

| 供应商代码 | 供应商名称 | 账期 | 状态 |
|----------|----------|------|------|
| SUP-001 | Default Supplier | 60天 | ✓ |
| SUP001 | Default Supplier | 60天 | ✓ |
| SUP-002 | Guangzhou Factory B | 60天 | ✓ |

注意: SUP-001 和 SUP001 可能是重复数据，需要清理。

---

## 3. 采购链条数据 (Procurement Chain)

### 3.1 Purchase Orders (采购订单)

**总数:** 2 个订单

| PO 编号 | 批次号 | 供应商ID | 状态 | 计划下单日期 | 实际下单日期 | 计划发货日期 |
|---------|-------|---------|------|------------|------------|------------|
| PO-2025-001 | BATCH-2025-Q1-01 | b3b2a1ce-... | Confirmed | 2025-11-18 | 2025-11-18 | 2025-12-09 |
| PO-2025-002 | BATCH-2025-Q1-02 | f98771ee-... | In Production | 2025-11-25 | 2025-11-25 | 2025-12-16 |

### 3.2 Purchase Order Items (订单明细)

**总数:** 5 个明细行

| PO ID | SKU | 渠道 | 订购数量 | 已交货数量 | 单价 |
|-------|-----|------|---------|-----------|------|
| 6ade23ca-... | SKU-002 | AMZ-US | 800 | 0 | $25 |
| 6ade23ca-... | SKU-003 | SHOP-US | 500 | 0 | $35 |
| eb27914c-... | SKU-004 | AMZ-US | 600 | 0 | $45 |
| eb27914c-... | SKU-005 | SHOP-US | 700 | 0 | $30 |
| 6ade23ca-... | SKU-001 | AMZ-US | 1000 | 30 | $25 |

**订单金额统计:**
- PO-2025-001: (800×$25) + (500×$35) + (1000×$25) = $62,500
- PO-2025-002: (600×$45) + (700×$30) = $48,000
- **总计:** $110,500

### 3.3 Production Deliveries (生产交货)

**总数:** 1 个交货记录

| 交货单号 | PO Item ID | SKU | 渠道 | 交货数量 | 实际交货日期 | 付款状态 |
|---------|-----------|-----|------|---------|------------|---------|
| DLV-2025-3467 | 83c91a08-... | SKU-001 | AMZ-US | 30 | 2025-12-02 | Paid |

**交货进度分析:**
- SKU-001 已交货: 30/1000 = 3%
- SKU-002 已交货: 0/800 = 0%
- SKU-003 已交货: 0/500 = 0%
- SKU-004 已交货: 0/600 = 0%
- SKU-005 已交货: 0/700 = 0%

---

## 4. 物流链条数据 (Logistics Chain)

### 4.1 Shipments (物流发货)

**总数:** 2 个发货记录

| 运单号 | 批次号 | 目的仓库ID | 计划发货日期 | 实际发货日期 | 计划到达日期 | 实际到达日期 | 重量(kg) |
|-------|-------|-----------|------------|------------|------------|------------|---------|
| TRK-2025-001 | BATCH-2025-Q1-01 | e0c72030-... | 2025-11-27 | 2025-11-27 | 2025-12-12 | - | 500 |
| TRK-2025-002 | BATCH-2025-Q1-01 | 01a43702-... | 2025-11-22 | 2025-11-22 | 2025-11-29 | 2025-12-01 | 200 |

**物流状态:**
- TRK-2025-001: 运输中 (已发货，未到达)
- TRK-2025-002: 已到达 (提前2天到达)

### 4.2 Shipment Items (发货明细)

**总数:** 4 个明细行

| 运单ID | SKU | 发货数量 |
|-------|-----|---------|
| 0835fd35-... | SKU-001 | 300 |
| 0835fd35-... | SKU-002 | 250 |
| 814f604c-... | SKU-003 | 200 |
| 814f604c-... | SKU-004 | 150 |

**发货汇总:**
- 运单 TRK-2025-001: 550件 (300+250)
- 运单 TRK-2025-002: 350件 (200+150)
- **总发货量:** 900件

---

## 5. 销售数据 (Sales Data)

### 5.1 Sales Forecasts (销量预测)

**总数:** 120 条预测记录

**数据范围:**
- 时间: 2025-W49 开始 (12周预测)
- SKU: 5个活跃SKU
- 渠道: 2个主要渠道 (AMZ-US, SHOP-US)

**样本数据 (2025-W49):**

| SKU | 渠道 | 周次 | 预测数量 |
|-----|------|------|---------|
| SKU-001 | AMZ-US | 2025-W49 | 171 |
| SKU-001 | SHOP-US | 2025-W49 | 195 |
| SKU-002 | AMZ-US | 2025-W49 | 163 |
| SKU-002 | SHOP-US | 2025-W49 | 92 |
| SKU-003 | AMZ-US | 2025-W49 | 144 |

**预测数据完整性:**
- 覆盖周数: 12周 (W49-W60)
- SKU覆盖率: 5/9 = 55.6%
- 渠道覆盖率: 2/4 = 50%

### 5.2 Sales Actuals (实际销量)

**总数:** 40 条实际销量记录

**数据范围:**
- 时间: 2025-W45 开始 (历史4周数据)
- SKU: 5个活跃SKU
- 渠道: 2个主要渠道 (AMZ-US, SHOP-US)

**样本数据 (2025-W45):**

| SKU | 渠道 | 周次 | 实际数量 |
|-----|------|------|---------|
| SKU-001 | AMZ-US | 2025-W45 | 183 |
| SKU-001 | SHOP-US | 2025-W45 | 119 |
| SKU-002 | AMZ-US | 2025-W45 | 143 |
| SKU-002 | SHOP-US | 2025-W45 | 173 |
| SKU-003 | AMZ-US | 2025-W45 | 127 |

**实际销量分析:**
- 覆盖周数: 4周 (W45-W48)
- SKU覆盖率: 5/9 = 55.6%
- 渠道覆盖率: 2/4 = 50%

---

## 6. 库存数据 (Inventory Data)

### 6.1 Inventory Snapshots (库存快照)

**总数:** 7 条库存记录

| SKU | 仓库ID | 现有库存 | 最后盘点时间 |
|-----|-------|---------|------------|
| SKU-001 | e0c72030-... | 500 | 2025-12-02 15:49:04 |
| SKU-001 | 01a43702-... | 300 | 2025-12-02 15:49:04 |
| SKU-002 | e0c72030-... | 400 | 2025-12-02 15:49:04 |
| SKU-002 | 26e2696e-... | 200 | 2025-12-02 15:49:04 |
| SKU-003 | e0c72030-... | 600 | 2025-12-02 15:49:04 |
| SKU-004 | e0c72030-... | 300 | 2025-12-02 15:49:04 |
| SKU-005 | e0c72030-... | 250 | 2025-12-02 15:49:04 |

**库存分布:**
- SKU-001: 2个仓库，总计 800件
- SKU-002: 2个仓库，总计 600件
- SKU-003: 1个仓库，总计 600件
- SKU-004: 1个仓库，总计 300件
- SKU-005: 1个仓库，总计 250件

**总库存:** 2,550件

---

## 7. 数据关联关系验证 (Relationship Validation)

### 7.1 采购链条完整性

| 关联关系 | 状态 | 说明 |
|---------|------|------|
| PO → PO Items | ✓ 完整 | 2个PO，5个明细行，平均2.5行/PO |
| PO Items → Deliveries | ⚠ 部分 | 5个PO Items，仅1个有交货记录 (20%) |
| PO → Supplier | ✓ 完整 | 所有PO都有关联的供应商ID |
| PO Items → SKU | ✓ 完整 | 所有明细行都有有效SKU |

### 7.2 物流链条完整性

| 关联关系 | 状态 | 说明 |
|---------|------|------|
| Shipment → Shipment Items | ✓ 完整 | 2个运单，4个明细行，平均2.0行/运单 |
| Shipment → Warehouse | ✓ 完整 | 所有运单都有目的仓库ID |
| Shipment Items → SKU | ✓ 完整 | 所有明细行都有有效SKU |
| Delivery → Shipment | ✗ 缺失 | production_deliveries表无shipment_id字段关联 |

### 7.3 销售数据完整性

| 关联关系 | 状态 | 说明 |
|---------|------|------|
| Forecast → SKU | ✓ 完整 | 所有预测都有有效SKU |
| Forecast → Channel | ✓ 完整 | 所有预测都有有效渠道代码 |
| Actual → SKU | ✓ 完整 | 所有实际销量都有有效SKU |
| Actual → Channel | ✓ 完整 | 所有实际销量都有有效渠道代码 |

### 7.4 库存数据完整性

| 关联关系 | 状态 | 说明 |
|---------|------|------|
| Snapshot → SKU | ✓ 完整 | 所有库存记录都有有效SKU |
| Snapshot → Warehouse | ✓ 完整 | 所有库存记录都有仓库ID |
| SKU 覆盖率 | ⚠ 部分 | 7/9 SKU有库存数据 (77.8%) |

---

## 8. 数据质量问题 (Data Quality Issues)

### 8.1 重复数据

1. **Channels 表:**
   - `SPF-US` 和 `SHOP-US` 可能重复 (都是Shopify-US)
   - **建议:** 统一为一个渠道代码

2. **Suppliers 表:**
   - `SUP-001` 和 `SUP001` 重复 (都是Default Supplier)
   - **建议:** 合并为一个供应商记录

### 8.2 数据缺失

1. **Production Deliveries:**
   - 仅1条交货记录，但有5个PO Items
   - **影响:** 无法准确跟踪采购进度
   - **建议:** 补充其他PO Items的交货记录

2. **Inventory Snapshots:**
   - 仅7条记录，覆盖7/9个SKU
   - W1系列(W1RD, W1BK, W2RD, W2BK)无库存数据
   - **建议:** 补充完整库存快照

3. **Sales Data:**
   - 预测和实际销量仅覆盖5/9个SKU
   - W1/W2系列无销售数据
   - **建议:** 补充完整销售预测

### 8.3 数据一致性问题

1. **仓库数量:**
   - 83个仓库过多，可能包含测试数据
   - **建议:** 清理无效/测试仓库，保留实际使用的仓库

2. **PO Items 交货进度:**
   - SKU-001: 已交货30件，但ordered_qty=1000, delivered_qty=30 不匹配
   - **建议:** 确认delivered_qty字段是否正确更新

---

## 9. 建议 (Recommendations)

### 9.1 立即处理 (High Priority)

1. **清理重复数据:**
   - 合并重复的渠道和供应商记录
   - 统一数据标准

2. **补充关键数据:**
   - 补充Production Deliveries数据 (至少覆盖所有PO Items)
   - 补充Inventory Snapshots (覆盖所有9个SKU)

3. **验证数据准确性:**
   - 检查PO Items的delivered_qty字段更新逻辑
   - 确认物流和交货的关联关系

### 9.2 后续优化 (Medium Priority)

1. **完善销售数据:**
   - 补充W1/W2系列的销售预测和实际销量
   - 扩展销售数据到所有渠道

2. **优化仓库管理:**
   - 清理无效仓库记录
   - 规范仓库代码命名

3. **增强数据关联:**
   - 在production_deliveries表添加shipment关联
   - 建立完整的采购-生产-物流-库存链条

### 9.3 长期规划 (Low Priority)

1. **数据治理:**
   - 建立数据质量监控机制
   - 定期生成数据质量报告

2. **数据完整性:**
   - 补充所有SKU的完整业务数据
   - 确保所有业务流程数据闭环

---

## 10. 总结 (Conclusion)

**数据库整体状态:** ✓ 基本可用

**优点:**
- 核心表结构完整，数据类型正确
- 基础主数据 (Products, Warehouses, Channels, Suppliers) 齐全
- 业务链条 (采购-物流-销售-库存) 数据完整

**不足:**
- 存在重复数据 (Channels, Suppliers)
- 部分业务数据缺失 (Deliveries, Inventory Snapshots)
- 数据关联不够完整 (Delivery-Shipment关联)

**总体评估:** 数据库已具备业务运行基础，但需要进行数据清理和补充，以支持完整的业务分析和决策。

---

**报告生成:** Backend Specialist
**分析工具:** /Users/tony/Desktop/rolloy-scm/scripts/analyze-database.ts
