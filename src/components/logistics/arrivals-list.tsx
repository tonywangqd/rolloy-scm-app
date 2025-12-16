'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, Download, Package, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import type { ArrivedShipment } from '@/lib/queries/logistics'

interface ArrivalsListProps {
  arrivals: ArrivedShipment[]
}

function getVarianceBadge(varianceDays: number | null) {
  if (varianceDays === null) {
    return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">无预计</Badge>
  } else if (varianceDays === 0) {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
        <CheckCircle className="mr-1 h-3 w-3" />
        准时
      </Badge>
    )
  } else if (varianceDays > 0) {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
        <AlertTriangle className="mr-1 h-3 w-3" />
        迟到 {varianceDays} 天
      </Badge>
    )
  } else {
    return (
      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
        <Clock className="mr-1 h-3 w-3" />
        提前 {Math.abs(varianceDays)} 天
      </Badge>
    )
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return dateStr.replace(/-/g, '/')
}

export function ArrivalsList({ arrivals }: ArrivalsListProps) {
  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export arrivals')
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">已到仓列表</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            导出
          </Button>
          <Link href="/logistics">
            <Button variant="outline" size="sm">
              <Package className="mr-2 h-4 w-4" />
              发货管理
            </Button>
          </Link>
        </div>
      </div>

      {arrivals.length === 0 ? (
        <div className="py-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">暂无到仓记录</p>
          <p className="mt-1 text-xs text-gray-400">
            在发货管理页面点击"确认到货"后，记录将显示在这里
          </p>
          <Link href="/logistics" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              前往发货管理
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  运单号
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  目的仓库
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  物流方案
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                  发货量
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  预计到仓
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  实际到仓
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                  时效差异
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {arrivals.map((arrival) => (
                <tr key={arrival.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">
                    <Link href={`/logistics/${arrival.id}`} className="hover:underline">
                      {arrival.tracking_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div>
                      {arrival.warehouse_name || '-'}
                      {arrival.warehouse_code && (
                        <span className="ml-1 text-xs text-gray-500">
                          ({arrival.warehouse_code})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {arrival.logistics_plan || '-'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                    {arrival.shipped_qty}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {formatDate(arrival.planned_arrival_date)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {formatDate(arrival.actual_arrival_date)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {getVarianceBadge(arrival.variance_days)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center">
                      <Link href={`/logistics/${arrival.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
