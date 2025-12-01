import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchSalesForecasts, fetchSalesActuals, getCurrentWeek, fetchSalesTimeline } from '@/lib/queries/planning'
import { fetchInventoryProjection12Weeks } from '@/lib/queries/inventory-projection'
import { formatNumber, getSalesForecastStatusVariant } from '@/lib/utils'
import { Calendar, TrendingUp, TrendingDown, BarChart3, FileEdit, FileCheck, Package } from 'lucide-react'
import { SalesTimeline } from '@/components/planning/sales-timeline'
import { InventoryProjectionChart } from '@/components/planning/inventory-projection-chart'

export const dynamic = 'force-dynamic'

export default async function PlanningPage() {
  const currentWeek = getCurrentWeek()

  // Fetch recent forecasts and actuals, timeline data, and inventory projections
  const [forecasts, actuals, timelineData, inventoryProjections] = await Promise.all([
    fetchSalesForecasts(),
    fetchSalesActuals(),
    fetchSalesTimeline(),
    fetchInventoryProjection12Weeks().catch(() => []), // Gracefully handle if view doesn't exist
  ])

  // Group by week for summary
  const forecastByWeek = new Map<string, number>()
  const actualByWeek = new Map<string, number>()

  forecasts.forEach((f) => {
    const current = forecastByWeek.get(f.year_week) || 0
    forecastByWeek.set(f.year_week, current + f.forecast_qty)
  })

  actuals.forEach((a) => {
    const current = actualByWeek.get(a.year_week) || 0
    actualByWeek.set(a.year_week, current + a.actual_qty)
  })

  // Get unique weeks sorted
  const allWeeks = [...new Set([...forecastByWeek.keys(), ...actualByWeek.keys()])]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 12)

  // Calculate totals
  const totalForecast = forecasts.reduce((sum, f) => sum + f.forecast_qty, 0)
  const totalActual = actuals.reduce((sum, a) => sum + a.actual_qty, 0)
  const variance = totalActual - totalForecast
  const variancePct = totalForecast > 0 ? (variance / totalForecast) * 100 : 0

  return (
    <div className="flex flex-col">
      <Header
        title="计划管理"
        description="销量预测与实际数据管理"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">当前周</p>
                  <p className="text-xl font-semibold">{currentWeek}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <BarChart3 className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">预测总量</p>
                  <p className="text-xl font-semibold">{formatNumber(totalForecast)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">实际总量</p>
                  <p className="text-xl font-semibold">{formatNumber(totalActual)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className={`rounded-lg p-2 ${variance >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  {variance >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500">偏差率</p>
                  <p className={`text-xl font-semibold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sales Timeline Chart */}
        <SalesTimeline data={timelineData} />

        {/* Inventory Projection Chart */}
        {inventoryProjections.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Package className="h-5 w-5 text-purple-600" />
                <h2 className="text-lg font-semibold">库存预测趋势</h2>
              </div>
              <Link href="/planning/projection">
                <Button variant="outline" size="sm">
                  查看详情
                </Button>
              </Link>
            </div>
            <InventoryProjectionChart data={inventoryProjections} />
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              共 {allWeeks.length} 周数据
            </span>
          </div>
          <div className="flex space-x-2">
            <Link href="/planning/forecasts">
              <Button variant="outline">
                <FileEdit className="mr-2 h-4 w-4" />
                管理预测
              </Button>
            </Link>
            <Link href="/planning/actuals">
              <Button variant="primary">
                <FileCheck className="mr-2 h-4 w-4" />
                录入实际
              </Button>
            </Link>
          </div>
        </div>

        {/* Weekly Summary Table */}
        <Card>
          <CardHeader>
            <CardTitle>周度汇总</CardTitle>
          </CardHeader>
          <CardContent>
            {allWeeks.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无数据，请先录入预测或实际销量
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>周次</TableHead>
                    <TableHead className="text-right">预测数量</TableHead>
                    <TableHead className="text-right">实际数量</TableHead>
                    <TableHead className="text-right">偏差</TableHead>
                    <TableHead className="text-right">偏差率</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allWeeks.map((week) => {
                    const forecast = forecastByWeek.get(week) || 0
                    const actual = actualByWeek.get(week) || 0
                    const weekVariance = actual - forecast
                    const weekVariancePct = forecast > 0 ? (weekVariance / forecast) * 100 : 0
                    const hasActual = actualByWeek.has(week)
                    const hasForecast = forecastByWeek.has(week)

                    return (
                      <TableRow key={week}>
                        <TableCell className="font-medium">{week}</TableCell>
                        <TableCell className="text-right">
                          {hasForecast ? formatNumber(forecast) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasActual ? formatNumber(actual) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasActual && hasForecast ? (
                            <span className={weekVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {weekVariance >= 0 ? '+' : ''}{formatNumber(weekVariance)}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasActual && hasForecast ? (
                            <span className={weekVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {weekVariancePct >= 0 ? '+' : ''}{weekVariancePct.toFixed(1)}%
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getSalesForecastStatusVariant(hasActual, hasForecast)}>
                            {hasActual ? '已录入' : hasForecast ? '待录入' : '无数据'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
