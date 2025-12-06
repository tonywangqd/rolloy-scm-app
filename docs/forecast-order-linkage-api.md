# API 使用指南：预测-订单关联功能

## 目录
1. [Server Actions](#server-actions)
2. [Query Functions](#query-functions)
3. [使用示例](#使用示例)
4. [错误处理](#错误处理)

---

## Server Actions

所有 Server Actions 位于 `src/lib/actions/planning.ts`，使用 `'use server'` 指令。

### 1. 交货删除

#### `deleteProductionDelivery(deliveryId, deletionReason?)`

**用途**: 删除采购交货记录（带回滚和审计）

**参数**:
- `deliveryId`: `string` - 交货记录ID
- `deletionReason?`: `string` - 删除原因（可选）

**返回**:
```typescript
{
  success: boolean
  error?: string
  errorCode?: string
}
```

**错误代码**:
- `NOT_FOUND` - 交货记录不存在
- `PAYMENT_COMPLETED` - 已付款，无法删除
- `SHIPMENT_EXISTS` - 已发货，无法删除

**前端调用示例**:
```typescript
'use client'

import { deleteProductionDelivery } from '@/lib/actions/planning'

async function handleDelete(deliveryId: string) {
  const result = await deleteProductionDelivery(deliveryId, '数据录入错误')

  if (result.success) {
    toast.success('交货记录已删除')
    router.push('/procurement')
  } else {
    if (result.errorCode === 'PAYMENT_COMPLETED') {
      toast.error('无法删除已付款的交货记录，请联系财务')
    } else {
      toast.error(result.error || '删除失败')
    }
  }
}
```

---

### 2. 手动分配

#### `createForecastAllocation(params)`

**用途**: 创建单个预测-订单分配

**参数**:
```typescript
{
  forecastId: string
  poItemId: string
  allocatedQty: number
  remarks?: string
}
```

**返回**:
```typescript
{
  success: boolean
  data?: { id: string }
  error?: string
}
```

**前端调用示例**:
```typescript
import { createForecastAllocation } from '@/lib/actions/planning'

async function handleAllocate() {
  const result = await createForecastAllocation({
    forecastId: 'forecast-uuid',
    poItemId: 'po-item-uuid',
    allocatedQty: 100,
    remarks: '手动分配'
  })

  if (result.success) {
    toast.success('分配成功')
    revalidatePath('/planning/forecast-coverage')
  } else {
    toast.error(result.error)
  }
}
```

---

### 3. 批量分配

#### `createForecastAllocations(poItemId, allocations[])`

**用途**: 批量创建多个分配

**参数**:
- `poItemId`: `string` - 订单项ID
- `allocations`: `{ forecastId: string; allocatedQty: number }[]` - 分配数组

**返回**:
```typescript
{
  success: boolean
  count?: number
  error?: string
}
```

**前端调用示例**:
```typescript
import { createForecastAllocations } from '@/lib/actions/planning'

async function handleBatchAllocate(poItemId: string) {
  const allocations = [
    { forecastId: 'forecast-1', allocatedQty: 100 },
    { forecastId: 'forecast-2', allocatedQty: 150 },
    { forecastId: 'forecast-3', allocatedQty: 50 }
  ]

  const result = await createForecastAllocations(poItemId, allocations)

  if (result.success) {
    toast.success(`成功创建 ${result.count} 条分配`)
  } else {
    toast.error(result.error)
  }
}
```

---

### 4. 自动分配

#### `autoAllocateForecasts(poItemId)`

**用途**: 使用 FIFO 算法自动分配

**参数**:
- `poItemId`: `string` - 订单项ID

**返回**:
```typescript
{
  success: boolean
  data?: { forecast_id: string; allocated_qty: number; week_iso: string }[]
  error?: string
}
```

**前端调用示例**:
```typescript
import { autoAllocateForecasts } from '@/lib/actions/planning'

async function handleAutoAllocate(poItemId: string) {
  const result = await autoAllocateForecasts(poItemId)

  if (result.success) {
    const weeks = result.data?.map(a => a.week_iso).join(', ')
    toast.success(`自动分配完成，覆盖周次: ${weeks}`)
  } else {
    toast.error(result.error)
  }
}
```

---

### 5. 更新分配

#### `updateForecastAllocation(allocationId, allocatedQty, remarks?)`

**用途**: 更新分配数量和备注

**参数**:
- `allocationId`: `string` - 分配ID
- `allocatedQty`: `number` - 新的分配数量
- `remarks?`: `string` - 备注（可选）

**返回**:
```typescript
{
  success: boolean
  error?: string
}
```

---

### 6. 删除分配

#### `deleteForecastAllocation(allocationId)`

**用途**: 删除分配关系

**参数**:
- `allocationId`: `string` - 分配ID

**返回**:
```typescript
{
  success: boolean
  error?: string
}
```

---

### 7. 解决差异

#### `resolveForecastVariance(params)`

**用途**: 处理预测差异

**参数**:
```typescript
{
  resolutionId: string
  action: ResolutionAction  // 'create_supplemental_order' | 'reallocate_to_future' | 'accept_as_safety_stock' | 'cancel_excess' | 'pending_review'
  notes?: string
}
```

**返回**:
```typescript
{
  success: boolean
  error?: string
}
```

**前端调用示例**:
```typescript
import { resolveForecastVariance } from '@/lib/actions/planning'

async function handleResolve(resolutionId: string) {
  const result = await resolveForecastVariance({
    resolutionId,
    action: 'create_supplemental_order',
    notes: '需求激增，需要补单'
  })

  if (result.success) {
    toast.success('差异已解决')
  } else {
    toast.error(result.error)
  }
}
```

---

## Query Functions

所有 Query Functions 位于 `src/lib/queries/planning.ts`，用于 Server Components。

### 1. 预测覆盖率

#### `fetchForecastCoverage(filters?)`

**用途**: 获取预测覆盖率列表

**参数**:
```typescript
{
  sku?: string
  channelCode?: string
  weekIso?: string
  status?: ForecastCoverageStatus  // 'UNCOVERED' | 'PARTIALLY_COVERED' | 'FULLY_COVERED' | 'OVER_COVERED'
}
```

**返回**: `ForecastCoverageView[]`

**Server Component 示例**:
```typescript
import { fetchForecastCoverage } from '@/lib/queries/planning'

export default async function CoveragePage() {
  const coverage = await fetchForecastCoverage({
    status: 'UNCOVERED'  // 只显示未覆盖的预测
  })

  return <CoverageTable data={coverage} />
}
```

---

#### `fetchForecastCoverageKPIs()`

**用途**: 获取覆盖率 KPI 指标

**返回**:
```typescript
{
  total: number
  uncovered: number
  partially: number
  fully: number
  over: number
  avgCoveragePercentage: number
}
```

**Server Component 示例**:
```typescript
import { fetchForecastCoverageKPIs } from '@/lib/queries/planning'

export default async function Dashboard() {
  const kpis = await fetchForecastCoverageKPIs()

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard title="未覆盖" value={kpis.uncovered} />
      <StatCard title="部分覆盖" value={kpis.partially} />
      <StatCard title="完全覆盖" value={kpis.fully} />
      <StatCard title="过度覆盖" value={kpis.over} />
    </div>
  )
}
```

---

### 2. 差异查询

#### `fetchPendingVariances()`

**用途**: 获取待处理的差异列表

**返回**: `VariancePendingActionsView[]`

**字段**:
- `resolution_id`: 差异ID
- `sku`, `channel_code`, `week_iso`: 预测信息
- `original_forecast_qty`, `adjusted_forecast_qty`: 原始/调整数量
- `variance_qty`, `variance_percentage`: 差异数量/百分比
- `days_pending`: 待处理天数
- `priority`: `'Critical' | 'High' | 'Medium' | 'Low'`

---

### 3. 分配查询

#### `fetchAllocatableForecasts(sku, channelCode, targetWeek?)`

**用途**: 获取可分配的预测列表（用于订单创建）

**参数**:
- `sku`: `string` - SKU
- `channelCode`: `string | null` - 渠道代码
- `targetWeek?`: `string` - 目标周次（可选，默认显示全部）

**返回**: `ForecastCoverageView[]` - 只包含 `uncovered_qty > 0` 的预测

**Server Component 示例**:
```typescript
import { fetchAllocatableForecasts } from '@/lib/queries/planning'

export default async function AllocationPanel({ sku, channelCode }: Props) {
  const forecasts = await fetchAllocatableForecasts(sku, channelCode, '2025-W50')

  return (
    <div>
      <h3>可分配预测</h3>
      {forecasts.map(f => (
        <div key={f.forecast_id}>
          {f.week_iso}: {f.uncovered_qty} 件未覆盖
        </div>
      ))}
    </div>
  )
}
```

---

#### `fetchPoItemAllocations(poItemId)`

**用途**: 获取订单项的所有分配

**返回**:
```typescript
(ForecastOrderAllocation & {
  forecast?: { week_iso: string; forecast_qty: number }
  product_name?: string
})[]
```

---

#### `fetchForecastAllocations(forecastId)`

**用途**: 获取预测的所有分配

**返回**:
```typescript
(ForecastOrderAllocation & {
  po_item?: { id: string; ordered_qty: number; delivered_qty: number }
  po?: { po_number: string; batch_code: string }
})[]
```

---

### 4. 审计查询

#### `fetchDeliveryDeletionLogs(options?)`

**用途**: 获取交货删除审计日志

**参数**:
```typescript
{
  deliveryId?: string
  poItemId?: string
  limit?: number
}
```

**返回**: `DeliveryDeletionAuditLog[]`

---

## 使用示例

### 完整流程示例：订单创建时分配预测

```typescript
'use client'

import { useState } from 'react'
import { createPurchaseOrder } from '@/lib/actions/procurement'
import { createForecastAllocations } from '@/lib/actions/planning'

export function CreatePOForm({ allocatableForecasts }: Props) {
  const [selectedAllocations, setSelectedAllocations] = useState<
    { forecastId: string; allocatedQty: number }[]
  >([])

  async function handleSubmit() {
    // Step 1: Create PO
    const poResult = await createPurchaseOrder({
      po_number: 'PO-2025-001',
      // ... other PO data
    })

    if (!poResult.success) {
      toast.error('订单创建失败')
      return
    }

    // Step 2: Create allocations
    if (selectedAllocations.length > 0) {
      const allocResult = await createForecastAllocations(
        poResult.data.poItemId,
        selectedAllocations
      )

      if (allocResult.success) {
        toast.success(`订单创建成功，已分配 ${allocResult.count} 个预测`)
      } else {
        toast.warning('订单已创建，但分配失败: ' + allocResult.error)
      }
    } else {
      toast.success('订单创建成功')
    }

    router.push('/procurement')
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* PO form fields */}

      <div className="mt-4">
        <h3>预测分配</h3>
        {allocatableForecasts.map(forecast => (
          <AllocationRow
            key={forecast.forecast_id}
            forecast={forecast}
            onSelect={(qty) => {
              setSelectedAllocations([
                ...selectedAllocations,
                { forecastId: forecast.forecast_id, allocatedQty: qty }
              ])
            }}
          />
        ))}
      </div>

      <Button type="submit">创建订单</Button>
    </form>
  )
}
```

---

## 错误处理

### 标准错误处理模式

所有 Server Actions 都返回 `{ success, error?, errorCode? }` 格式。

**推荐模式**:
```typescript
const result = await serverAction(params)

if (!result.success) {
  // 根据 errorCode 显示特定错误消息
  switch (result.errorCode) {
    case 'NOT_FOUND':
      toast.error('记录不存在')
      break
    case 'PAYMENT_COMPLETED':
      toast.error('无法删除已付款的记录')
      break
    default:
      toast.error(result.error || '操作失败')
  }
  return
}

// Success handling
toast.success('操作成功')
```

### 常见错误

| 错误代码 | 说明 | 建议处理 |
|---------|------|---------|
| `NOT_FOUND` | 记录不存在 | 刷新页面或返回列表 |
| `PAYMENT_COMPLETED` | 已付款 | 提示联系财务部门 |
| `SHIPMENT_EXISTS` | 已发货 | 提示无法删除 |
| `SKU mismatch` | SKU不匹配 | 检查选择的预测和订单 |
| `Channel mismatch` | 渠道不匹配 | 检查选择的预测和订单 |
| `Exceeds ordered quantity` | 超出订单数量 | 调整分配数量 |
| `Unauthorized` | 未授权 | 重新登录 |

---

## 类型定义

所有类型定义位于 `src/lib/types/database.ts`：

```typescript
import type {
  ForecastOrderAllocation,
  ForecastVarianceResolution,
  DeliveryDeletionAuditLog,
  ForecastCoverageView,
  VariancePendingActionsView,
  ForecastCoverageStatus,
  ResolutionAction,
  ResolutionStatus,
  AllocationType,
} from '@/lib/types/database'
```

---

## 相关文档

- 技术设计: `specs/forecast-order-linkage/design.md`
- 产品需求: `specs/forecast-order-linkage/requirements.md`
- 数据库迁移: `supabase/migrations/20251206000001_forecast_order_linkage.sql`
- 实施总结: `BACKEND_IMPLEMENTATION.md`

---

**文档版本**: v1.0
**更新时间**: 2025-12-06 22:15 CST
**维护者**: Backend Specialist
