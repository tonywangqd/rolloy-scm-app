import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Store, Warehouse, Users } from 'lucide-react'

interface MasterDataStatsProps {
  data: {
    products: number
    channels: number
    warehouses: number
    suppliers: number
  }
}

export function MasterDataStats({ data }: MasterDataStatsProps) {
  const stats = [
    {
      name: '产品 SKU',
      value: data.products,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      name: '销售渠道',
      value: data.channels,
      icon: Store,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      name: '仓库',
      value: data.warehouses,
      icon: Warehouse,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      name: '供应商',
      value: data.suppliers,
      icon: Users,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>主数据概览</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.name}
              className={`flex items-center space-x-3 rounded-lg ${stat.bgColor} p-4`}
            >
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-600">{stat.name}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
