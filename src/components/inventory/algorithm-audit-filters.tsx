'use client'

import { useRouter, usePathname } from 'next/navigation'
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
}

export function AlgorithmAuditFilters({
  products,
  selectedSku,
  shippingWeeks,
}: AlgorithmAuditFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handleSkuChange = (value: string) => {
    const params = new URLSearchParams()
    params.set('sku', value)
    params.set('shipping_weeks', shippingWeeks.toString())
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleShippingWeeksChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (value >= 3 && value <= 8) {
      const params = new URLSearchParams()
      params.set('sku', selectedSku)
      params.set('shipping_weeks', value.toString())
      router.push(`${pathname}?${params.toString()}`)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-end gap-4">
          {/* SKU Selector */}
          <div className="flex-1 max-w-md">
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

          {/* Shipping Weeks Input */}
          <div className="w-40">
            <Label className="mb-2 block">物流周期</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={3}
                max={8}
                value={shippingWeeks}
                onChange={handleShippingWeeksChange}
                className="w-20"
              />
              <span className="text-sm text-gray-500">周</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
