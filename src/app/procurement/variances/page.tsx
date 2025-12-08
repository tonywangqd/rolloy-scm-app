import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { VarianceTable } from '@/components/procurement/variance-table'
import { fetchVariances, fetchVarianceSummaryKPIs } from '@/lib/queries/supply-chain-variances'
import { AlertTriangle, Clock, CheckCircle2, AlertCircle, Package } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function VariancesPage() {
  const [variances, kpis] = await Promise.all([
    fetchVariances(),
    fetchVarianceSummaryKPIs(),
  ])

  return (
    <div className="flex flex-col">
      <Header
        title="差异追踪"
        description="供应链全链路差异管理 - 追踪下单/出货/发货差异"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">待处理差异</p>
                  <p className="text-xl font-semibold">{kpis.total_variances}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-red-100 p-2">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">紧急/高优先级</p>
                  <p className="text-xl font-semibold text-red-600">
                    {kpis.critical_count + kpis.high_count}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-yellow-100 p-2">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">已逾期</p>
                  <p className="text-xl font-semibold text-yellow-600">
                    {kpis.overdue_count}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <CheckCircle2 className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">已计划</p>
                  <p className="text-xl font-semibold text-blue-600">
                    {kpis.scheduled_count}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Package className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">待处理数量</p>
                  <p className="text-xl font-semibold text-purple-600">
                    {kpis.total_pending_qty.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        {kpis.critical_count > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="font-medium text-red-800">
                有 {kpis.critical_count} 个紧急差异需要立即处理
              </span>
            </div>
            <p className="mt-1 text-sm text-red-700">
              请及时设置计划周或取消差异，避免影响库存计算
            </p>
          </div>
        )}

        {/* Variance Table */}
        <VarianceTable data={variances} />

        {/* Legend */}
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">差异类型说明</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                  待出货
                </span>
                <span className="text-gray-600">
                  采购订单已下单但工厂尚未完成出货的数量
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800">
                  工厂库存
                </span>
                <span className="text-gray-600">
                  工厂已出货但尚未发往仓库的数量（工厂暂存）
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
                  运输差异
                </span>
                <span className="text-gray-600">
                  物流发货与到货之间的差异（损耗/短装）
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
