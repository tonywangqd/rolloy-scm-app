'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  VarianceStatusBadge,
  VariancePriorityBadge,
  VarianceSourceBadge,
} from '@/components/procurement/variance-status-badge'
import { updateVariancePlannedWeek, cancelVariance } from '@/lib/actions/supply-chain-variances'
import { Calendar, X, Check, Filter, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { VarianceOverview } from '@/lib/types/database'

interface VarianceTableProps {
  data: VarianceOverview[]
}

export function VarianceTable({ data }: VarianceTableProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedVariance, setSelectedVariance] = useState<VarianceOverview | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')

  // Apply filters
  const filteredData = data.filter((v) => {
    if (statusFilter && v.status !== statusFilter) return false
    if (sourceFilter && v.source_type !== sourceFilter) return false
    if (priorityFilter && v.priority !== priorityFilter) return false
    return true
  })

  const handleEditClick = (variance: VarianceOverview) => {
    setEditingId(variance.id)
    setEditValue(variance.planned_week || '')
  }

  const handleSave = async (varianceId: string) => {
    setLoading(true)
    const result = await updateVariancePlannedWeek(
      varianceId,
      editValue || null
    )

    if (result.success) {
      toast.success('计划周已更新')
      router.refresh()
    } else {
      toast.error(result.error || '更新失败')
    }

    setLoading(false)
    setEditingId(null)
  }

  const handleCancelClick = (variance: VarianceOverview) => {
    setSelectedVariance(variance)
    setCancelReason('')
    setCancelDialogOpen(true)
  }

  const handleCancelConfirm = async () => {
    if (!selectedVariance || !cancelReason.trim()) {
      toast.error('请输入取消原因')
      return
    }

    setLoading(true)
    const result = await cancelVariance(selectedVariance.id, cancelReason)

    if (result.success) {
      toast.success('差异已取消')
      router.refresh()
    } else {
      toast.error(result.error || '取消失败')
    }

    setLoading(false)
    setCancelDialogOpen(false)
    setSelectedVariance(null)
  }

  // Generate week options for the dropdown
  const generateWeekOptions = () => {
    const options: string[] = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() + i * 7)
      const year = date.getFullYear()
      const week = getISOWeek(date)
      options.push(`${year}-W${String(week).padStart(2, '0')}`)
    }
    return options
  }

  const weekOptions = generateWeekOptions()

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              差异追踪 Variance Tracking
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-32"
              >
                <option value="">全部状态</option>
                <option value="pending">待处理</option>
                <option value="scheduled">已计划</option>
                <option value="partial">部分完成</option>
                <option value="overdue">已逾期</option>
              </Select>
              <Select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-32"
              >
                <option value="">全部类型</option>
                <option value="order_to_delivery">待出货</option>
                <option value="delivery_to_ship">工厂库存</option>
                <option value="ship_to_arrival">运输差异</option>
              </Select>
              <Select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-28"
              >
                <option value="">全部优先级</option>
                <option value="Critical">紧急</option>
                <option value="High">高</option>
                <option value="Medium">中</option>
                <option value="Low">低</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    优先级
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    SKU
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    产品名称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    类型
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    来源
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    计划数量
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    已完成
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    剩余
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    计划周
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    状态
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    年龄(天)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredData.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      row.priority === 'Critical'
                        ? 'bg-red-50 hover:bg-red-100'
                        : row.priority === 'High'
                        ? 'bg-orange-50 hover:bg-orange-100'
                        : row.status === 'overdue'
                        ? 'bg-yellow-50 hover:bg-yellow-100'
                        : 'hover:bg-gray-50'
                    }
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <VariancePriorityBadge priority={row.priority} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-900">
                      {row.sku}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate">
                      {row.product_name || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <VarianceSourceBadge sourceType={row.source_type as 'order_to_delivery' | 'delivery_to_ship' | 'ship_to_arrival'} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate" title={row.source_reference}>
                      {row.source_reference}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                      {row.planned_qty.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-green-700">
                      {row.fulfilled_qty.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-red-700">
                      {row.pending_qty.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {editingId === row.id ? (
                        <div className="flex items-center gap-1">
                          <Select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-28 text-xs"
                          >
                            <option value="">未设置</option>
                            {weekOptions.map((week) => (
                              <option key={week} value={week}>
                                {week}
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSave(row.id)}
                            disabled={loading}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4 text-gray-400" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEditClick(row)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <Calendar className="h-3 w-3" />
                          {row.planned_week || '点击设置'}
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <VarianceStatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                      {row.age_days}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      {row.status !== 'completed' && row.status !== 'cancelled' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelClick(row)}
                          disabled={loading}
                          title="取消此差异 (短装关闭)"
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredData.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500">暂无差异数据</p>
              <p className="text-xs text-gray-400 mt-2">
                当采购订单和交货记录产生差异时，会自动显示在此处
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      {cancelDialogOpen && selectedVariance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setCancelDialogOpen(false)} />
          <div className="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-red-100 p-2">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">取消差异</h3>
                <p className="mt-2 text-sm text-gray-600">
                  确定要取消 {selectedVariance.sku} 的差异吗？
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  剩余数量: {selectedVariance.pending_qty} (取消后将不再追踪)
                </p>
                <div className="mt-4">
                  <label className="text-sm font-medium text-gray-700">取消原因</label>
                  <Input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="例: 供应商短装，无法补货"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setCancelDialogOpen(false)}
                disabled={loading}
              >
                返回
              </Button>
              <Button
                variant="danger"
                onClick={handleCancelConfirm}
                disabled={loading || !cancelReason.trim()}
              >
                {loading ? '处理中...' : '确认取消'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Helper function to get ISO week number
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
