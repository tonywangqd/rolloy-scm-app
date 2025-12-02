'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { Product } from '@/lib/types/database'

interface SKUSelectorProps {
  products: Product[]
  currentSKU?: string
}

export function SKUSelector({ products, currentSKU }: SKUSelectorProps) {
  const router = useRouter()
  const [selectedSKU, setSelectedSKU] = useState(currentSKU || '')

  const handleSelect = (value: string) => {
    setSelectedSKU(value)
    router.push(`/planning/calculation-audit?sku=${encodeURIComponent(value)}`)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="sku-select">选择SKU</Label>
      <RadixSelect value={selectedSKU} onValueChange={handleSelect}>
        <SelectTrigger id="sku-select" className="w-full">
          <SelectValue placeholder="请选择一个SKU" />
        </SelectTrigger>
        <SelectContent>
          {products.map((product) => (
            <SelectItem key={product.sku} value={product.sku}>
              {product.sku} - {product.product_name}
            </SelectItem>
          ))}
        </SelectContent>
      </RadixSelect>
      {selectedSKU && (
        <p className="text-sm text-gray-500">
          已选择: {products.find(p => p.sku === selectedSKU)?.product_name}
        </p>
      )}
    </div>
  )
}
