'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CoverageStatusBadge } from '@/components/planning/coverage-status-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { closeForecast, reopenForecast } from '@/lib/actions/planning'
import { Plus, CheckCircle, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import type { ForecastCoverageView } from '@/lib/types/database'

interface ForecastCoverageTableProps {
  data: ForecastCoverageView[]
}

export function ForecastCoverageTable({ data }: ForecastCoverageTableProps) {
  const router = useRouter()
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [selectedForecast, setSelectedForecast] = useState<ForecastCoverageView | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCloseClick = (forecast: ForecastCoverageView) => {
    setSelectedForecast(forecast)
    setCloseDialogOpen(true)
  }

  const handleCloseConfirm = async () => {
    if (!selectedForecast) return

    setLoading(true)
    const result = await closeForecast(selectedForecast.forecast_id)

    if (result.success) {
      toast.success('预测已完结')
      router.refresh()
    } else {
      toast.error(result.error || '完结失败')
    }

    setLoading(false)
    setCloseDialogOpen(false)
    setSelectedForecast(null)
  }

  const handleReopen = async (forecastId: string) => {
    setLoading(true)
    const result = await reopenForecast(forecastId)

    if (result.success) {
      toast.success('预测已重新开启')
      router.refresh()
    } else {
      toast.error(result.error || '重新开启失败')
    }

    setLoading(false)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>预测覆盖详情 Forecast Coverage Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    周次 Week
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    SKU
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    产品名称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    渠道
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    预测数量
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    已覆盖
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    未覆盖
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    覆盖率 %
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    状态
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.map((row) => (
                  <tr
                    key={row.forecast_id}
                    className={
                      row.coverage_status === 'UNCOVERED'
                        ? 'bg-red-50 hover:bg-red-100'
                        : row.coverage_status === 'CLOSED'
                        ? 'bg-gray-50 hover:bg-gray-100'
                        : 'hover:bg-gray-50'
                    }
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {row.week_iso}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-900">
                      {row.sku}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {row.product_name || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {row.channel_code}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      {row.forecast_qty.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-green-700">
                      {row.covered_qty.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-red-700">
                      {row.uncovered_qty > 0 ? row.uncovered_qty.toLocaleString() : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {row.coverage_percentage}%
                    </td>
                    <td className="px-4 py-3">
                      <CoverageStatusBadge
                        status={row.coverage_status}
                        coveragePercentage={row.coverage_percentage}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                      <div className="flex items-center justify-center gap-2">
                        {row.coverage_status === 'CLOSED' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReopen(row.forecast_id)}
                            disabled={loading}
                            title="重新开启 Reopen"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            {(row.coverage_status === 'UNCOVERED' ||
                              row.coverage_status === 'PARTIALLY_COVERED') && (
                              <Link
                                href={`/procurement/new?sku=${row.sku}&channel=${row.channel_code}&week=${row.week_iso}`}
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                                title="创建采购订单"
                              >
                                <Plus className="h-4 w-4" />
                              </Link>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCloseClick(row)}
                              disabled={loading}
                              title="完结此预测 Close forecast"
                            >
                              <CheckCircle className="h-4 w-4 text-gray-500 hover:text-green-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500">暂无预测覆盖数据</p>
              <p className="text-xs text-gray-400 mt-2">
                请先在「销量预测」页面创建预测数据
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Close Forecast Confirmation Dialog */}
      <ConfirmDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        title="完结预测"
        description={
          selectedForecast
            ? `确定要完结 ${selectedForecast.week_iso} / ${selectedForecast.sku} 的预测吗？完结后表示该周预测已处理完毕，无论实际覆盖情况如何。`
            : ''
        }
        confirmText="确认完结"
        cancelText="取消"
        variant="warning"
        loading={loading}
        onConfirm={handleCloseConfirm}
      />
    </>
  )
}
