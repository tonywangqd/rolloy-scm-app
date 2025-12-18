'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import ComparisonChart from './comparison-chart'
import type { ForecastValidationResult, ForecastSuggestion, HistoricalSalesData } from '@/lib/types/forecast-wizard'

interface Props {
  validationResult: ForecastValidationResult | null
  forecastData: ForecastSuggestion[]
  historicalData: HistoricalSalesData[]
}

export default function StepValidationReview({ validationResult, forecastData, historicalData }: Props) {
  if (!validationResult) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-muted-foreground">正在验证预测数据...</div>
        </div>
      </div>
    )
  }

  const { isValid, warnings, errors, summary } = validationResult

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">验证与审核</h2>
        <p className="text-muted-foreground">
          检查预测数据的合理性，确认无误后即可提交
        </p>
      </div>

      {/* Validation Alerts */}
      {errors.length > 0 && (
        <div className="space-y-3">
          {errors.map((error, index) => (
            <Alert key={index} variant="danger">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <div>
                  <div className="font-semibold mb-1">{error.week_iso}</div>
                  <AlertDescription>{error.message}</AlertDescription>
                </div>
              </div>
            </Alert>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              验证警告
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {warnings.map((warning, index) => (
              <Alert key={index} variant={warning.severity === 'error' ? 'danger' : warning.severity === 'warning' ? 'warning' : 'default'}>
                <div className="flex items-start gap-3">
                  {warning.severity === 'warning' && <AlertTriangle className="h-4 w-4 mt-0.5" />}
                  {warning.severity === 'info' && <Info className="h-4 w-4 mt-0.5" />}
                  <div>
                    <div className="font-semibold mb-1">{warning.week_iso}</div>
                    <AlertDescription>{warning.message}</AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>预测汇总</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">预测周数</div>
              <div className="text-2xl font-bold">{summary.totalWeeks}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">预测总量</div>
              <div className="text-2xl font-bold">{summary.totalQuantity.toLocaleString()}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">周均预测</div>
              <div className="text-2xl font-bold">{summary.averageWeekly.toLocaleString()}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">历史周均</div>
              <div className="text-2xl font-bold">{summary.historicalAverage.toLocaleString()}</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">预测 vs 历史变化</span>
              <span className={`text-lg font-semibold ${
                summary.averageWeekly > summary.historicalAverage ? 'text-green-600' : 'text-red-600'
              }`}>
                {summary.historicalAverage > 0
                  ? ((summary.averageWeekly - summary.historicalAverage) / summary.historicalAverage * 100).toFixed(1)
                  : '0'}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Chart */}
      <ComparisonChart forecastData={forecastData} historicalData={historicalData} />

      {/* Validation Status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-3">
            {isValid ? (
              <>
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-lg">验证通过</div>
                  <div className="text-sm text-muted-foreground">预测数据符合要求，可以提交保存</div>
                </div>
              </>
            ) : (
              <>
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <div className="font-semibold text-lg">验证失败</div>
                  <div className="text-sm text-muted-foreground">请修正错误后重新验证</div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
