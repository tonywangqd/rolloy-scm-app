'use client'

import { Card } from '@/components/ui/card'
import { Package, AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react'

export function PSISummaryCards() {
  // Mock data - will be replaced with real API call
  const summaryData = {
    totalSKUs: 156,
    okCount: 145,
    riskCount: 8,
    stockoutCount: 3,
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total SKUs */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Package className="h-8 w-8 text-blue-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">总SKU数</p>
            <p className="text-2xl font-bold text-gray-900">{summaryData.totalSKUs}</p>
          </div>
        </div>
      </Card>

      {/* OK Count */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">正常库存</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-gray-900">{summaryData.okCount}</p>
              <span className="text-sm text-gray-500">
                ({Math.round((summaryData.okCount / summaryData.totalSKUs) * 100)}%)
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Risk Count */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">风险预警</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-gray-900">{summaryData.riskCount}</p>
              <span className="text-sm text-gray-500">
                ({Math.round((summaryData.riskCount / summaryData.totalSKUs) * 100)}%)
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Stockout Count */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <TrendingDown className="h-8 w-8 text-red-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">断货预警</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-gray-900">{summaryData.stockoutCount}</p>
              <span className="text-sm text-gray-500">
                ({Math.round((summaryData.stockoutCount / summaryData.totalSKUs) * 100)}%)
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
