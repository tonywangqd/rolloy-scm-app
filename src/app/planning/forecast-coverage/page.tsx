import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CoverageStatusBadge } from '@/components/planning/coverage-status-badge'
import { ForecastCoverageTable } from '@/components/planning/forecast-coverage-table'
import Link from 'next/link'
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, Lock } from 'lucide-react'
import { fetchForecastCoverage, fetchForecastCoverageKPIs } from '@/lib/queries/planning'

export default async function ForecastCoveragePage() {
  // Fetch real data from database
  const coverageData = await fetchForecastCoverage()

  // Calculate KPIs from real data
  const kpis = {
    total: coverageData.length,
    uncovered: coverageData.filter((d) => d.coverage_status === 'UNCOVERED').length,
    partially: coverageData.filter((d) => d.coverage_status === 'PARTIALLY_COVERED').length,
    over: coverageData.filter((d) => d.coverage_status === 'OVER_COVERED').length,
    closed: coverageData.filter((d) => d.coverage_status === 'CLOSED').length,
    totalUncoveredQty: coverageData
      .filter((d) => d.uncovered_qty > 0 && d.coverage_status !== 'CLOSED')
      .reduce((sum, d) => sum + d.uncovered_qty, 0),
  }

  return (
    <>
      <Header
        title="预测覆盖率仪表板"
        description="Forecast Coverage Dashboard - Track demand coverage by purchase orders"
      />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                预测覆盖率中心 Forecast Coverage Center
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                监控销售预测的采购覆盖情况，及时发现未覆盖需求
              </p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  总预测数
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpis.total}</div>
                <p className="text-xs text-gray-500 mt-1">当前活跃预测记录</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  未覆盖需求
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{kpis.uncovered}</div>
                <p className="text-xs text-gray-500 mt-1">
                  未覆盖数量: {kpis.totalUncoveredQty.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  部分覆盖
                </CardTitle>
                <TrendingDown className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{kpis.partially}</div>
                <p className="text-xs text-gray-500 mt-1">需要补充采购订单</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  超额覆盖
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{kpis.over}</div>
                <p className="text-xs text-gray-500 mt-1">需要评估库存风险</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  已完结
                </CardTitle>
                <Lock className="h-4 w-4 text-gray-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-600">{kpis.closed}</div>
                <p className="text-xs text-gray-500 mt-1">已完结的预测周</p>
              </CardContent>
            </Card>
          </div>

          {/* Coverage Table with Client Component for interactions */}
          <ForecastCoverageTable data={coverageData} />
        </div>
      </div>
    </>
  )
}
