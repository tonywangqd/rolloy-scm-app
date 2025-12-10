'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit, Eye, Download } from 'lucide-react'

interface OrderArrival {
  id: string
  arrivalNumber: string
  trackingNumber: string
  warehouse: string
  shippedQty: number
  arrivedQty: number
  varianceQty: number
  actualArrivalDate: string
  status: string
}

// Mock data
const mockArrivals: OrderArrival[] = [
  {
    id: '1',
    arrivalNumber: 'OA-2025-12-10-001',
    trackingNumber: 'TN-12345',
    warehouse: 'US-West',
    shippedQty: 100,
    arrivedQty: 98,
    varianceQty: -2,
    actualArrivalDate: '2025-12-10',
    status: 'resolved',
  },
  {
    id: '2',
    arrivalNumber: 'OA-2025-12-09-001',
    trackingNumber: 'TN-12346',
    warehouse: 'US-East',
    shippedQty: 80,
    arrivedQty: 80,
    varianceQty: 0,
    actualArrivalDate: '2025-12-09',
    status: 'completed',
  },
  {
    id: '3',
    arrivalNumber: 'OA-2025-12-08-001',
    trackingNumber: 'TN-12347',
    warehouse: 'US-West',
    shippedQty: 150,
    arrivedQty: 145,
    varianceQty: -5,
    actualArrivalDate: '2025-12-08',
    status: 'pending',
  },
]

function getVarianceBadge(variance: number) {
  if (variance === 0) {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">无差异</Badge>
  } else if (variance < 0) {
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">短缺 {variance}</Badge>
  } else {
    return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">多余 +{variance}</Badge>
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">已完成</Badge>
    case 'pending':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">待处理</Badge>
    case 'resolved':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">已解决</Badge>
    default:
      return <Badge>{status}</Badge>
  }
}

export function ArrivalsList() {
  const [arrivals] = useState<OrderArrival[]>(mockArrivals)

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">到仓列表</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            导出
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            新建到仓单
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                OA单号
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                运单号
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                仓库
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                发货量
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                到货量
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                差异
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                到仓日期
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                状态
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
                  {arrival.arrivalNumber}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {arrival.trackingNumber}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {arrival.warehouse}
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-900">
                  {arrival.shippedQty}
                </td>
                <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                  {arrival.arrivedQty}
                </td>
                <td className="px-4 py-3 text-center">
                  {getVarianceBadge(arrival.varianceQty)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {arrival.actualArrivalDate}
                </td>
                <td className="px-4 py-3 text-center">
                  {getStatusBadge(arrival.status)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
