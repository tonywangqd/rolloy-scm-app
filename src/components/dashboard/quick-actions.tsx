import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Plus,
  FileSpreadsheet,
  Truck,
  BarChart,
  ArrowRight,
} from 'lucide-react'

export function QuickActions() {
  const actions = [
    {
      title: '创建采购订单',
      description: '新建 PO 单',
      icon: Plus,
      href: '/procurement/new',
      color: 'text-blue-600',
    },
    {
      title: '录入销售预测',
      description: '更新销量计划',
      icon: FileSpreadsheet,
      href: '/planning/forecasts',
      color: 'text-green-600',
    },
    {
      title: '添加物流单据',
      description: '新建发运',
      icon: Truck,
      href: '/logistics/new',
      color: 'text-purple-600',
    },
    {
      title: '查看库存投影',
      description: '27周预测',
      icon: BarChart,
      href: '/planning/projection',
      color: 'text-orange-600',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>快捷操作</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {actions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="group flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-all hover:border-blue-300 hover:bg-blue-50/50"
            >
              <div className="flex items-center space-x-3">
                <action.icon className={`h-5 w-5 ${action.color}`} />
                <div>
                  <p className="font-medium text-gray-900">{action.title}</p>
                  <p className="text-sm text-gray-500">{action.description}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
