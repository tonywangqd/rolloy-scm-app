import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell, Package, Truck, AlertTriangle, DollarSign, CheckCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Mock notifications - 未来可接入真实数据源
const notifications = [
  {
    id: '1',
    type: 'warning',
    icon: AlertTriangle,
    title: '库存预警',
    message: 'SKU-001 库存低于安全库存阈值，当前库存 150 件，安全库存 200 件',
    time: '5分钟前',
    read: false,
  },
  {
    id: '2',
    type: 'success',
    icon: CheckCircle,
    title: '订单确认',
    message: '采购订单 PO-2024-001 已确认，供应商已开始生产',
    time: '1小时前',
    read: false,
  },
  {
    id: '3',
    type: 'info',
    icon: Truck,
    title: '物流更新',
    message: '运单 TRK-001 已到港，预计明日完成清关',
    time: '2小时前',
    read: true,
  },
  {
    id: '4',
    type: 'info',
    icon: Package,
    title: '交货通知',
    message: '交货单 DEL-2024-005 已确认收货，入库数量 500 件',
    time: '3小时前',
    read: true,
  },
  {
    id: '5',
    type: 'warning',
    icon: DollarSign,
    title: '付款提醒',
    message: '有 3 笔采购款将于下周到期，总金额 $15,000',
    time: '1天前',
    read: true,
  },
]

const getTypeStyles = (type: string) => {
  switch (type) {
    case 'warning':
      return 'border-l-yellow-500 bg-yellow-50'
    case 'success':
      return 'border-l-green-500 bg-green-50'
    case 'info':
    default:
      return 'border-l-blue-500 bg-blue-50'
  }
}

const getIconStyles = (type: string) => {
  switch (type) {
    case 'warning':
      return 'text-yellow-600'
    case 'success':
      return 'text-green-600'
    case 'info':
    default:
      return 'text-blue-600'
  }
}

export default function NotificationsPage() {
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="flex flex-col">
      <Header title="通知中心" description="查看系统通知和提醒" />

      <div className="flex-1 space-y-6 p-6">
        {/* Summary Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Bell className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">未读通知</p>
                  <p className="text-xl font-semibold">{unreadCount}</p>
                </div>
              </div>
              <Badge variant={unreadCount > 0 ? 'warning' : 'success'}>
                {unreadCount > 0 ? `${unreadCount} 条未读` : '全部已读'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Notifications List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              全部通知
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications.map((notification) => {
              const Icon = notification.icon
              return (
                <div
                  key={notification.id}
                  className={`rounded-lg border-l-4 p-4 ${getTypeStyles(notification.type)} ${
                    !notification.read ? 'ring-2 ring-blue-200' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${getIconStyles(notification.type)}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">{notification.title}</h4>
                        <span className="text-xs text-gray-500">{notification.time}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                    </div>
                    {!notification.read && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
