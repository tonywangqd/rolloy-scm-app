'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  BarChart3,
  DollarSign,
  Settings,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  {
    name: '决策总览',
    href: '/',
    icon: LayoutDashboard,
    description: 'Dashboard',
  },
  {
    name: '采购管理',
    href: '/procurement',
    icon: ShoppingCart,
    description: 'Procurement',
  },
  {
    name: '物流管理',
    href: '/logistics',
    icon: Truck,
    description: 'Logistics',
  },
  {
    name: '计划管理',
    href: '/planning',
    icon: BarChart3,
    description: 'Planning',
  },
  {
    name: '资金管理',
    href: '/finance',
    icon: DollarSign,
    description: 'Finance',
  },
  {
    name: '库存管理',
    href: '/inventory',
    icon: Package,
    description: 'Inventory',
  },
  {
    name: '系统设置',
    href: '/settings',
    icon: Settings,
    description: 'Settings',
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={cn(
        'flex flex-col border-r border-gray-200 bg-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
        {!collapsed && (
          <Link href="/" className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="font-semibold text-gray-900">Rolloy SCM</span>
          </Link>
        )}
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-sm">R</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon
                className={cn(
                  'h-5 w-5 flex-shrink-0',
                  isActive ? 'text-blue-700' : 'text-gray-400'
                )}
              />
              {!collapsed && (
                <span className="ml-3">{item.name}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Collapse Button */}
      <div className="border-t border-gray-200 p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span className="ml-2">收起</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
