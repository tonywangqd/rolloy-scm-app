'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getVersionDisplay } from '@/lib/version'
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
  ChevronDown,
  Calculator,
  Target,
  AlertTriangle,
  TrendingUp,
  Boxes,
  ShipIcon,
  ClipboardCheck,
  Sliders,
  TableProperties,
  PackageOpen,
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
    name: '计划管理',
    href: '/planning',
    icon: BarChart3,
    description: 'Planning',
    subItems: [
      {
        name: '销量预测',
        href: '/planning/forecasts',
        icon: TrendingUp,
      },
      {
        name: '需求覆盖',
        href: '/planning/demand-coverage',
        icon: Target,
      },
      {
        name: '补货建议',
        href: '/planning/replenishment',
        icon: Boxes,
      },
    ],
  },
  {
    name: '采购管理',
    href: '/procurement',
    icon: ShoppingCart,
    description: 'Procurement',
    subItems: [
      {
        name: '采购订单',
        href: '/procurement',
        icon: ShoppingCart,
      },
      {
        name: '完工管理',
        href: '/procurement/fulfillment',
        icon: ClipboardCheck,
      },
      {
        name: '履约追踪',
        href: '/procurement/fulfillment-variance',
        icon: AlertTriangle,
      },
    ],
  },
  {
    name: '物流管理',
    href: '/logistics',
    icon: Truck,
    description: 'Logistics',
    subItems: [
      {
        name: '发货管理',
        href: '/logistics/shipments',
        icon: ShipIcon,
      },
      {
        name: '到仓管理',
        href: '/logistics/arrivals',
        icon: PackageOpen,
      },
    ],
  },
  {
    name: '库存管理',
    href: '/inventory',
    icon: Package,
    description: 'Inventory',
    subItems: [
      {
        name: '库存总览',
        href: '/inventory',
        icon: Package,
      },
      {
        name: 'PSI周报表',
        href: '/inventory/psi-table',
        icon: TableProperties,
      },
      {
        name: '算法验证',
        href: '/inventory/algorithm-audit',
        icon: Calculator,
      },
    ],
  },
  {
    name: '资金管理',
    href: '/finance',
    icon: DollarSign,
    description: 'Finance',
  },
  {
    name: '系统设置',
    href: '/settings',
    icon: Settings,
    description: 'Settings',
    subItems: [
      {
        name: '主数据',
        href: '/settings',
        icon: Settings,
      },
      {
        name: '系统参数',
        href: '/settings/parameters',
        icon: Sliders,
      },
    ],
  },
]

interface SubItem {
  name: string
  href: string
  icon: React.ElementType
}

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  description: string
  subItems?: SubItem[]
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['库存管理', '计划管理', '采购管理', '物流管理', '系统设置']))

  const toggleExpand = (itemName: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(itemName)) {
      newExpanded.delete(itemName)
    } else {
      newExpanded.add(itemName)
    }
    setExpandedItems(newExpanded)
  }

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
        {(navigation as NavItem[]).map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          const hasSubItems = item.subItems && item.subItems.length > 0
          const isExpanded = expandedItems.has(item.name)

          if (hasSubItems && !collapsed) {
            return (
              <div key={item.name}>
                <button
                  onClick={() => toggleExpand(item.name)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <div className="flex items-center">
                    <item.icon
                      className={cn(
                        'h-5 w-5 flex-shrink-0',
                        isActive ? 'text-blue-700' : 'text-gray-400'
                      )}
                    />
                    <span className="ml-3">{item.name}</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform',
                      isExpanded ? 'rotate-180' : ''
                    )}
                  />
                </button>
                {isExpanded && (
                  <div className="ml-6 mt-1 space-y-1">
                    {item.subItems!.map((subItem) => {
                      const isSubActive = pathname === subItem.href
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={cn(
                            'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                            isSubActive
                              ? 'bg-blue-100 text-blue-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-100'
                          )}
                        >
                          <subItem.icon
                            className={cn(
                              'h-4 w-4 flex-shrink-0',
                              isSubActive ? 'text-blue-700' : 'text-gray-400'
                            )}
                          />
                          <span className="ml-2">{subItem.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

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

      {/* Version Info - 从 src/lib/version.ts 读取 */}
      {!collapsed && (
        <div className="border-t border-gray-200 px-3 py-3">
          <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-700">{getVersionDisplay().full}</span>
              <span className="text-[10px] text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">{getVersionDisplay().tag}</span>
            </div>
            <div className="mt-1 text-[10px] text-gray-500">
              {getVersionDisplay().date}
            </div>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="border-t border-gray-200 px-2 py-2">
          <div className="flex items-center justify-center">
            <span className="text-[10px] font-semibold text-blue-600">{getVersionDisplay().short}</span>
          </div>
        </div>
      )}

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
