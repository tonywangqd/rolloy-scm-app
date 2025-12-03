import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import {
  Package,
  AlertTriangle,
  ClipboardList,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import type { DashboardKPIs } from '@/lib/types/database'

interface KPICardsProps {
  data: DashboardKPIs
}

export function KPICards({ data }: KPICardsProps) {
  const kpis = [
    {
      title: '库存总量',
      value: formatNumber(data.total_stock),
      subtitle: `价值 ${formatCurrency(data.total_stock_value)}`,
      icon: Package,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      href: '/inventory',
    },
    {
      title: '风险 SKU',
      value: data.risk_sku_count.toString(),
      subtitle: '需要关注的产品',
      icon: AlertTriangle,
      iconBg: data.risk_sku_count > 0 ? 'bg-red-100' : 'bg-green-100',
      iconColor: data.risk_sku_count > 0 ? 'text-red-600' : 'text-green-600',
      highlight: data.risk_sku_count > 0,
      href: '/planning/projection',
    },
    {
      title: '待处理建议',
      value: data.pending_suggestions.toString(),
      subtitle: '补货建议',
      icon: ClipboardList,
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      href: '/planning/replenishment',
    },
    {
      title: '待付款项',
      value: formatCurrency(data.next_month_payables),
      subtitle: '近期应付款',
      icon: DollarSign,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      href: '/finance',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Link key={kpi.title} href={kpi.href}>
          <Card
            className={cn(
              'transition-all hover:shadow-md cursor-pointer hover:scale-105',
              kpi.highlight && 'border-red-200 bg-red-50/50'
            )}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{kpi.title}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {kpi.value}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{kpi.subtitle}</p>
                </div>
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-lg',
                    kpi.iconBg
                  )}
                >
                  <kpi.icon className={cn('h-6 w-6', kpi.iconColor)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
