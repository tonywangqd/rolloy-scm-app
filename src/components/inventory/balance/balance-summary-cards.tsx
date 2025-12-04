import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, Clock, XCircle, Package } from 'lucide-react'

interface BalanceSummaryCardsProps {
  summary: {
    totalPending: number
    totalDeferred: number
    pendingByType: {
      poItem: number
      delivery: number
      shipmentItem: number
    }
  }
}

export function BalanceSummaryCards({ summary }: BalanceSummaryCardsProps) {
  const cards = [
    {
      title: '待处理余额',
      subtitle: 'Pending Balances',
      value: summary.totalPending,
      icon: AlertCircle,
      bgColor: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      textColor: 'text-yellow-700',
    },
    {
      title: '已顺延余额',
      subtitle: 'Deferred Balances',
      value: summary.totalDeferred,
      icon: Clock,
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
      textColor: 'text-blue-700',
    },
    {
      title: '采购差异',
      subtitle: 'Procurement Variance',
      value: summary.pendingByType.poItem,
      icon: Package,
      bgColor: 'bg-purple-100',
      iconColor: 'text-purple-600',
      textColor: 'text-purple-700',
    },
    {
      title: '发货差异',
      subtitle: 'Shipment Variance',
      value: summary.pendingByType.shipmentItem,
      icon: XCircle,
      bgColor: 'bg-red-100',
      iconColor: 'text-red-600',
      textColor: 'text-red-700',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className={`rounded-lg ${card.bgColor} p-3`}>
                <card.icon className={`h-6 w-6 ${card.iconColor}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{card.subtitle}</p>
                <p className="text-sm font-medium text-gray-700">
                  {card.title}
                </p>
                <p className={`text-2xl font-bold ${card.textColor}`}>
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
