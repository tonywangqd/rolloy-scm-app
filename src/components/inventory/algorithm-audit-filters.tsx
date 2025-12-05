'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Product } from '@/lib/types/database'

interface AlgorithmAuditFiltersProps {
  products: Product[]
  selectedSku: string
  shippingWeeks: number
  startWeek: string
  endWeek: string
}

// 生成周次选项列表 (2025-W01 到 2026-W52)
function generateWeekOptions(): string[] {
  const weeks: string[] = []
  // 2025年 (ISO周最多53周)
  for (let w = 1; w <= 52; w++) {
    weeks.push(`2025-W${w.toString().padStart(2, '0')}`)
  }
  // 2026年
  for (let w = 1; w <= 52; w++) {
    weeks.push(`2026-W${w.toString().padStart(2, '0')}`)
  }
  return weeks
}

export function AlgorithmAuditFilters({
  products,
  selectedSku,
  shippingWeeks,
  startWeek,
  endWeek,
}: AlgorithmAuditFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  // 生成周次选项
  const weekOptions = useMemo(() => generateWeekOptions(), [])

  // 更新URL参数的通用函数
  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams()
    params.set('sku', selectedSku)
    params.set('shipping_weeks', shippingWeeks.toString())
    params.set('start_week', startWeek)
    params.set('end_week', endWeek)
    // 应用更新
    Object.entries(updates).forEach(([key, value]) => {
      params.set(key, value)
    })
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleSkuChange = (value: string) => {
    updateParams({ sku: value })
  }

  const handleShippingWeeksChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (value >= 3 && value <= 8) {
      updateParams({ shipping_weeks: value.toString() })
    }
  }

  const handleStartWeekChange = (value: string) => {
    // 确保起始周不能大于结束周
    if (value <= endWeek) {
      updateParams({ start_week: value })
    }
  }

  const handleEndWeekChange = (value: string) => {
    // 确保结束周不能小于起始周
    if (value >= startWeek) {
      updateParams({ end_week: value })
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* SKU Selector */}
          <div className="flex-1 min-w-[200px] max-w-md">
            <Label className="mb-2 block">选择 SKU</Label>
            <RadixSelect value={selectedSku} onValueChange={handleSkuChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择产品..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.sku} value={p.sku}>
                    {p.sku} - {p.product_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </RadixSelect>
          </div>

          {/* Start Week Selector */}
          <div className="w-36">
            <Label className="mb-2 block">起始周</Label>
            <RadixSelect value={startWeek} onValueChange={handleStartWeekChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {weekOptions.map((week) => (
                  <SelectItem key={week} value={week} disabled={week > endWeek}>
                    {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </RadixSelect>
          </div>

          {/* End Week Selector */}
          <div className="w-36">
            <Label className="mb-2 block">结束周</Label>
            <RadixSelect value={endWeek} onValueChange={handleEndWeekChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {weekOptions.map((week) => (
                  <SelectItem key={week} value={week} disabled={week < startWeek}>
                    {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </RadixSelect>
          </div>

          {/* Shipping Weeks Input */}
          <div className="w-32">
            <Label className="mb-2 block">物流周期</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={3}
                max={8}
                value={shippingWeeks}
                onChange={handleShippingWeeksChange}
                className="w-16"
              />
              <span className="text-sm text-gray-500">周</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
