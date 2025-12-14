'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  DollarSign,
  AlertTriangle,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react'
import type { SimulationResult, CapitalConstraintResult } from '@/lib/types/simulation'
import { cn } from '@/lib/utils'

interface KPISummaryCardsProps {
  result: SimulationResult | null
  capitalCap?: number | null
}

interface KPICardData {
  title: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  status?: 'good' | 'warning' | 'danger' | 'neutral'
  icon: React.ReactNode
  progress?: number // 0-100 for progress bar
}

export function KPISummaryCards({ result, capitalCap }: KPISummaryCardsProps) {
  const kpiData = useMemo((): KPICardData[] => {
    if (!result) {
      return [
        {
          title: 'Cash Impact',
          value: '--',
          subtitle: 'vs baseline',
          status: 'neutral',
          icon: <DollarSign className="h-5 w-5" />,
        },
        {
          title: 'Stockout SKUs',
          value: '--',
          subtitle: 'scenario count',
          status: 'neutral',
          icon: <AlertTriangle className="h-5 w-5" />,
        },
        {
          title: 'Days of Stock',
          value: '--',
          subtitle: 'average',
          status: 'neutral',
          icon: <Package className="h-5 w-5" />,
        },
        {
          title: 'Capital Utilization',
          value: '--',
          subtitle: 'of budget',
          status: 'neutral',
          icon: <TrendingUp className="h-5 w-5" />,
        },
      ]
    }

    const { baseline, scenario, cash_impact_total, stockout_count_delta, days_of_stock_delta, capital_analysis } = result

    // Calculate scenario totals
    const scenarioStockoutCount = scenario.reduce((sum, w) => sum + w.stockout_sku_count, 0)
    const baselineStockoutCount = baseline.reduce((sum, w) => sum + w.stockout_sku_count, 0)

    // Calculate average days of stock
    const scenarioDaysOfStock = scenario.length > 0
      ? scenario.reduce((sum, w) => {
          const avgDays = w.projections.reduce((pSum, p) => pSum + (p.days_of_stock ?? 0), 0) / (w.projections.length || 1)
          return sum + avgDays
        }, 0) / scenario.length
      : 0

    // Capital utilization
    let capitalUtilization = 0
    let budgetCap = capitalCap ?? capital_analysis?.budget_cap ?? 0
    if (budgetCap > 0 && capital_analysis) {
      capitalUtilization = (capital_analysis.planned_spend / budgetCap) * 100
    }

    return [
      // Cash Impact
      {
        title: 'Cash Impact',
        value: `$${Math.abs(cash_impact_total).toLocaleString()}`,
        subtitle: 'scenario vs baseline',
        trend: cash_impact_total > 0 ? 'down' : cash_impact_total < 0 ? 'up' : 'neutral',
        trendValue: cash_impact_total > 0 ? 'less spend' : cash_impact_total < 0 ? 'more spend' : 'no change',
        status: cash_impact_total > 0 ? 'good' : cash_impact_total < 0 ? 'danger' : 'neutral',
        icon: <DollarSign className="h-5 w-5" />,
      },
      // Stockout SKUs
      {
        title: 'Stockout SKUs',
        value: scenarioStockoutCount,
        subtitle: `${stockout_count_delta > 0 ? '+' : ''}${stockout_count_delta} vs baseline`,
        trend: stockout_count_delta > 0 ? 'up' : stockout_count_delta < 0 ? 'down' : 'neutral',
        status: scenarioStockoutCount === 0 ? 'good' : scenarioStockoutCount > baselineStockoutCount ? 'danger' : 'warning',
        icon: <AlertTriangle className="h-5 w-5" />,
      },
      // Days of Stock
      {
        title: 'Avg Days of Stock',
        value: Math.round(scenarioDaysOfStock),
        subtitle: `${days_of_stock_delta > 0 ? '+' : ''}${Math.round(days_of_stock_delta)} days vs baseline`,
        trend: days_of_stock_delta > 0 ? 'up' : days_of_stock_delta < 0 ? 'down' : 'neutral',
        status: scenarioDaysOfStock >= 21 ? 'good' : scenarioDaysOfStock >= 14 ? 'warning' : 'danger',
        icon: <Package className="h-5 w-5" />,
      },
      // Capital Utilization
      {
        title: 'Capital Utilization',
        value: budgetCap > 0 ? `${Math.round(capitalUtilization)}%` : 'N/A',
        subtitle: budgetCap > 0 ? `of $${budgetCap.toLocaleString()} budget` : 'no constraint',
        status: capitalUtilization > 100 ? 'danger' : capitalUtilization > 80 ? 'warning' : 'good',
        progress: budgetCap > 0 ? Math.min(capitalUtilization, 100) : undefined,
        icon: <TrendingUp className="h-5 w-5" />,
      },
    ]
  }, [result, capitalCap])

  const getStatusColor = (status: KPICardData['status']) => {
    switch (status) {
      case 'good':
        return 'text-green-600 bg-green-50'
      case 'warning':
        return 'text-amber-600 bg-amber-50'
      case 'danger':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getProgressColor = (status: KPICardData['status']) => {
    switch (status) {
      case 'good':
        return 'bg-green-500'
      case 'warning':
        return 'bg-amber-500'
      case 'danger':
        return 'bg-red-500'
      default:
        return 'bg-gray-400'
    }
  }

  const getTrendIcon = (trend: KPICardData['trend']) => {
    switch (trend) {
      case 'up':
        return <ArrowUp className="h-3 w-3" />
      case 'down':
        return <ArrowDown className="h-3 w-3" />
      default:
        return <Minus className="h-3 w-3" />
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpiData.map((kpi, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">{kpi.title}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">{kpi.value}</span>
                  {kpi.trend && kpi.trend !== 'neutral' && (
                    <span
                      className={cn(
                        'inline-flex items-center text-xs font-medium',
                        kpi.trend === 'up' && kpi.status === 'danger'
                          ? 'text-red-600'
                          : kpi.trend === 'up'
                            ? 'text-green-600'
                            : kpi.trend === 'down' && kpi.status === 'good'
                              ? 'text-green-600'
                              : 'text-red-600'
                      )}
                    >
                      {getTrendIcon(kpi.trend)}
                    </span>
                  )}
                </div>
                {kpi.subtitle && (
                  <p className="mt-0.5 text-xs text-gray-500">{kpi.subtitle}</p>
                )}
                {kpi.trendValue && (
                  <p
                    className={cn(
                      'mt-1 text-xs font-medium',
                      kpi.status === 'good'
                        ? 'text-green-600'
                        : kpi.status === 'danger'
                          ? 'text-red-600'
                          : 'text-gray-600'
                    )}
                  >
                    {kpi.trendValue}
                  </p>
                )}
                {kpi.progress !== undefined && (
                  <div className="mt-2">
                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full transition-all duration-500',
                          getProgressColor(kpi.status)
                        )}
                        style={{ width: `${kpi.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div
                className={cn(
                  'p-2 rounded-lg',
                  getStatusColor(kpi.status)
                )}
              >
                {kpi.icon}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
