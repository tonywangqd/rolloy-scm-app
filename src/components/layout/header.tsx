'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, Search, User, Settings, LogOut, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface HeaderProps {
  title: string
  description?: string
}

export function Header({ title, description }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false)

  // Mock notifications - will be replaced with real data later
  const notifications = [
    { id: 1, message: 'SKU-001 库存预警：低于安全库存', time: '5分钟前', type: 'warning' },
    { id: 2, message: '采购订单 PO-2024-001 已确认', time: '1小时前', type: 'success' },
    { id: 3, message: '物流单 TRK-001 已到港', time: '2小时前', type: 'info' },
  ]

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {description && (
          <p className="text-sm text-gray-500">{description}</p>
        )}
      </div>

      <div className="flex items-center space-x-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索..."
            className="h-9 w-64 rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="relative"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className="h-5 w-5 text-gray-500" />
            {notifications.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                {notifications.length}
              </span>
            )}
          </Button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <span className="font-medium text-gray-900">通知 Notifications</span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="border-b border-gray-100 px-4 py-3 hover:bg-gray-50 cursor-pointer last:border-0"
                  >
                    <p className="text-sm text-gray-900">{notification.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 px-4 py-2">
                <Link
                  href="/notifications"
                  className="text-sm text-blue-600 hover:text-blue-800"
                  onClick={() => setShowNotifications(false)}
                >
                  查看全部通知
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="cursor-pointer">
              <User className="h-5 w-5 text-gray-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-sm font-medium text-gray-900">
              管理员 Admin
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.location.href = '/settings'}>
              <Settings className="mr-2 h-4 w-4" />
              系统设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.location.href = '/login'}>
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
