'use client'

import { Card } from '@/components/ui/card'
import { PackageOpen, TrendingUp, AlertCircle, Clock } from 'lucide-react'

export function ArrivalsStats() {
  // Mock data - will be replaced with real API call
  const stats = {
    totalArrivals: 24,
    totalQty: 2450,
    varianceCount: 3,
    avgVarianceDays: 2.5,
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Arrivals */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <PackageOpen className="h-8 w-8 text-blue-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">本月到仓单</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalArrivals}</p>
          </div>
        </div>
      </Card>

      {/* Total Quantity */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">总到仓数量</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalQty.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* Variance Count */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <AlertCircle className="h-8 w-8 text-yellow-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">存在差异</p>
            <p className="text-2xl font-bold text-gray-900">{stats.varianceCount}</p>
          </div>
        </div>
      </Card>

      {/* Avg Variance Days */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Clock className="h-8 w-8 text-purple-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">平均延迟</p>
            <p className="text-2xl font-bold text-gray-900">{stats.avgVarianceDays} 天</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
