import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, CheckCircle2, XCircle, Package } from 'lucide-react'
import type { RiskSummaryStats } from '@/lib/types/database'

interface RiskSummaryCardsProps {
  stats: RiskSummaryStats
}

export function RiskSummaryCards({ stats }: RiskSummaryCardsProps) {
  const cards = [
    {
      title: '断货 SKU',
      value: stats.stockout_count,
      icon: XCircle,
      bgColor: 'bg-red-100',
      iconColor: 'text-red-600',
      textColor: 'text-red-600',
    },
    {
      title: '风险 SKU',
      value: stats.risk_count,
      icon: AlertTriangle,
      bgColor: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      textColor: 'text-yellow-600',
    },
    {
      title: '正常 SKU',
      value: stats.ok_count,
      icon: CheckCircle2,
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600',
      textColor: 'text-green-600',
    },
    {
      title: '总 SKU 数',
      value: stats.total_skus,
      icon: Package,
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
      textColor: 'text-blue-600',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className={`rounded-lg ${card.bgColor} p-2`}>
                <card.icon className={`h-6 w-6 ${card.iconColor}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.title}</p>
                <p className={`text-2xl font-semibold ${card.textColor}`}>
                  {card.value}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
