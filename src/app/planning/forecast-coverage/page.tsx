import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CoverageStatusBadge } from '@/components/planning/coverage-status-badge'
import Link from 'next/link'
import { Plus, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Mock data - 实际使用时从 lib/queries/planning.ts 获取
const mockCoverageData = [
  {
    forecast_id: '1',
    week_iso: '2025-W50',
    sku: 'SKU-001',
    product_name: 'Product A',
    channel_code: 'AMZ-US',
    forecast_qty: 100,
    covered_qty: 100,
    uncovered_qty: 0,
    coverage_percentage: 100,
    coverage_status: 'FULLY_COVERED' as const,
  },
  {
    forecast_id: '2',
    week_iso: '2025-W50',
    sku: 'SKU-002',
    product_name: 'Product B',
    channel_code: 'AMZ-US',
    forecast_qty: 150,
    covered_qty: 80,
    uncovered_qty: 70,
    coverage_percentage: 53,
    coverage_status: 'PARTIALLY_COVERED' as const,
  },
  {
    forecast_id: '3',
    week_iso: '2025-W51',
    sku: 'SKU-001',
    product_name: 'Product A',
    channel_code: 'AMZ-US',
    forecast_qty: 120,
    covered_qty: 0,
    uncovered_qty: 120,
    coverage_percentage: 0,
    coverage_status: 'UNCOVERED' as const,
  },
  {
    forecast_id: '4',
    week_iso: '2025-W51',
    sku: 'SKU-003',
    product_name: 'Product C',
    channel_code: 'AMZ-US',
    forecast_qty: 200,
    covered_qty: 230,
    uncovered_qty: -30,
    coverage_percentage: 115,
    coverage_status: 'OVER_COVERED' as const,
  },
]

// Calculate KPIs
const kpis = {
  total: mockCoverageData.length,
  uncovered: mockCoverageData.filter((d) => d.coverage_status === 'UNCOVERED').length,
  partially: mockCoverageData.filter((d) => d.coverage_status === 'PARTIALLY_COVERED').length,
  over: mockCoverageData.filter((d) => d.coverage_status === 'OVER_COVERED').length,
  totalUncoveredQty: mockCoverageData
    .filter((d) => d.uncovered_qty > 0)
    .reduce((sum, d) => sum + d.uncovered_qty, 0),
}

export default async function ForecastCoveragePage() {
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  总预测数 Total Forecasts
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
                  未覆盖需求 Uncovered
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{kpis.uncovered}</div>
                <p className="text-xs text-gray-500 mt-1">
                  未覆盖数量: {kpis.totalUncoveredQty} 单位
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  部分覆盖 Partial
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
                  超额覆盖 Over
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{kpis.over}</div>
                <p className="text-xs text-gray-500 mt-1">需要评估库存风险</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>筛选条件 Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">SKU</label>
                  <select className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">全部 All</option>
                    <option value="SKU-001">SKU-001</option>
                    <option value="SKU-002">SKU-002</option>
                    <option value="SKU-003">SKU-003</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">周次 Week</label>
                  <select className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">全部 All</option>
                    <option value="2025-W50">2025-W50</option>
                    <option value="2025-W51">2025-W51</option>
                    <option value="2025-W52">2025-W52</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">覆盖状态 Status</label>
                  <select className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">全部 All</option>
                    <option value="UNCOVERED">未覆盖 Uncovered</option>
                    <option value="PARTIALLY_COVERED">部分覆盖 Partial</option>
                    <option value="FULLY_COVERED">完全覆盖 Full</option>
                    <option value="OVER_COVERED">超额覆盖 Over</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <Button variant="outline" className="w-full">
                    应用筛选 Apply Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Coverage Table */}
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
                        产品名称 Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        渠道 Channel
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        预测数量 Forecast
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        已覆盖 Covered
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        未覆盖 Uncovered
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        覆盖率 Coverage %
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        状态 Status
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        操作 Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {mockCoverageData.map((row) => (
                      <tr
                        key={row.forecast_id}
                        className={
                          row.coverage_status === 'UNCOVERED'
                            ? 'bg-red-50 hover:bg-red-100'
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
                          {row.product_name}
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
                          {row.coverage_status === 'UNCOVERED' ||
                          row.coverage_status === 'PARTIALLY_COVERED' ? (
                            <Link
                              href="/procurement/purchase-orders/create"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                            >
                              <Plus className="h-4 w-4" />
                              <span className="text-xs">创建订单</span>
                            </Link>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {mockCoverageData.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">暂无预测覆盖数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
