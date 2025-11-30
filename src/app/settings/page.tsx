import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getMasterDataCounts } from '@/lib/queries/settings'
import { Package, Store, Warehouse, Users, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const counts = await getMasterDataCounts()

  const settingsItems = [
    {
      title: '产品管理',
      description: '管理 SKU 和产品信息',
      icon: Package,
      href: '/settings/products',
      count: counts.products,
      color: 'blue',
    },
    {
      title: '渠道管理',
      description: '管理销售渠道',
      icon: Store,
      href: '/settings/channels',
      count: counts.channels,
      color: 'green',
    },
    {
      title: '仓库管理',
      description: '管理海外仓库',
      icon: Warehouse,
      href: '/settings/warehouses',
      count: counts.warehouses,
      color: 'purple',
    },
    {
      title: '供应商管理',
      description: '管理供应商信息',
      icon: Users,
      href: '/settings/suppliers',
      count: counts.suppliers,
      color: 'orange',
    },
  ]

  const colorClasses: Record<string, { bg: string; icon: string }> = {
    blue: { bg: 'bg-blue-100', icon: 'text-blue-600' },
    green: { bg: 'bg-green-100', icon: 'text-green-600' },
    purple: { bg: 'bg-purple-100', icon: 'text-purple-600' },
    orange: { bg: 'bg-orange-100', icon: 'text-orange-600' },
  }

  return (
    <div className="flex flex-col">
      <Header
        title="系统设置"
        description="管理基础数据"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Master Data Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {settingsItems.map((item) => {
            const Icon = item.icon
            const colors = colorClasses[item.color]

            return (
              <Link key={item.href} href={item.href}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`rounded-lg ${colors.bg} p-3`}>
                          <Icon className={`h-6 w-6 ${colors.icon}`} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">{item.title}</h3>
                          <p className="text-sm text-gray-500">{item.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl font-bold text-gray-700">
                          {item.count}
                        </span>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle>系统信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-500">数据库</p>
                <p className="text-lg font-semibold">Supabase</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-500">时区</p>
                <p className="text-lg font-semibold">UTC</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-500">采购账期</p>
                <p className="text-lg font-semibold">60 天</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-500">物流账期</p>
                <p className="text-lg font-semibold">30 天</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
