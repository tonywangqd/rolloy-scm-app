'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types/database'

interface EditingProduct {
  sku: string
  spu: string
  color_code: string
  product_name: string
  category: string
  unit_cost_usd: number
  unit_weight_kg: number
  safety_stock_weeks: number
  is_active: boolean
  isNew?: boolean
}

export default function ProductsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('sku')

    if (error) {
      setMessage('加载失败')
    } else {
      setProducts(data || [])
    }

    setLoading(false)
  }

  const startEdit = (product: Product) => {
    setEditingProduct({
      sku: product.sku,
      spu: product.spu || '',
      color_code: product.color_code || '',
      product_name: product.product_name,
      category: product.category || '',
      unit_cost_usd: product.unit_cost_usd || 0,
      unit_weight_kg: product.unit_weight_kg || 0,
      safety_stock_weeks: product.safety_stock_weeks || 2,
      is_active: product.is_active,
    })
  }

  const startNew = () => {
    setEditingProduct({
      sku: '',
      spu: '',
      color_code: '',
      product_name: '',
      category: '',
      unit_cost_usd: 0,
      unit_weight_kg: 0,
      safety_stock_weeks: 2,
      is_active: true,
      isNew: true,
    })
  }

  const cancelEdit = () => {
    setEditingProduct(null)
    setMessage('')
  }

  const saveProduct = async () => {
    if (!editingProduct) return
    if (!editingProduct.sku || !editingProduct.product_name) {
      setMessage('SKU 和产品名称为必填项')
      return
    }
    if (!editingProduct.unit_cost_usd || editingProduct.unit_cost_usd <= 0) {
      setMessage('单位成本必须大于 0')
      return
    }
    if (!editingProduct.safety_stock_weeks || editingProduct.safety_stock_weeks <= 0) {
      setMessage('安全库存周数必须大于 0')
      return
    }

    setSaving(true)
    setMessage('')

    const supabase = createClient()

    if (editingProduct.isNew) {
      const { error } = await (supabase.from('products') as any).insert({
        sku: editingProduct.sku,
        spu: editingProduct.spu || '',
        color_code: editingProduct.color_code || '',
        product_name: editingProduct.product_name,
        category: editingProduct.category || null,
        unit_cost_usd: editingProduct.unit_cost_usd,
        unit_weight_kg: editingProduct.unit_weight_kg || null,
        safety_stock_weeks: editingProduct.safety_stock_weeks,
        is_active: editingProduct.is_active,
      })

      if (error) {
        setMessage(`创建失败: ${error.message}`)
      } else {
        setMessage('创建成功')
        setEditingProduct(null)
        await loadProducts()
      }
    } else {
      const { error } = await (supabase
        .from('products') as any)
        .update({
          spu: editingProduct.spu || '',
          color_code: editingProduct.color_code || '',
          product_name: editingProduct.product_name,
          category: editingProduct.category || null,
          unit_cost_usd: editingProduct.unit_cost_usd,
          unit_weight_kg: editingProduct.unit_weight_kg || null,
          safety_stock_weeks: editingProduct.safety_stock_weeks,
          is_active: editingProduct.is_active,
        })
        .eq('sku', editingProduct.sku)

      if (error) {
        setMessage(`更新失败: ${error.message}`)
      } else {
        setMessage('更新成功')
        setEditingProduct(null)
        await loadProducts()
      }
    }

    setSaving(false)
  }

  const deleteProduct = async (sku: string) => {
    if (!confirm(`确定要删除产品 ${sku} 吗？`)) return

    const supabase = createClient()

    const { error } = await supabase.from('products').delete().eq('sku', sku)

    if (error) {
      setMessage(`删除失败: ${error.message}`)
    } else {
      setMessage('删除成功')
      await loadProducts()
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="产品管理" description="管理 SKU 和产品信息" />

      <div className="flex-1 space-y-6 p-6">
        {/* Back Button */}
        <Link href="/settings">
          <Button variant="ghost" type="button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回设置
          </Button>
        </Link>

        {message && (
          <div className={`rounded-lg p-4 text-sm ${message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {message}
          </div>
        )}

        {/* Edit/Add Form */}
        {editingProduct && (
          <Card>
            <CardHeader>
              <CardTitle>{editingProduct.isNew ? '添加产品' : '编辑产品'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    value={editingProduct.sku}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, sku: e.target.value })
                    }
                    disabled={!editingProduct.isNew}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spu">SPU (产品系列)</Label>
                  <Input
                    id="spu"
                    value={editingProduct.spu}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, spu: e.target.value })
                    }
                    placeholder="例: PROD-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color_code">颜色代码</Label>
                  <Input
                    id="color_code"
                    value={editingProduct.color_code}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, color_code: e.target.value })
                    }
                    placeholder="例: RED, BLU"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product_name">产品名称 *</Label>
                  <Input
                    id="product_name"
                    value={editingProduct.product_name}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, product_name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="category">类别</Label>
                  <Input
                    id="category"
                    value={editingProduct.category}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, category: e.target.value })
                    }
                    placeholder="例: 电子产品, 服装"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_cost_usd">单位成本 (USD) *</Label>
                  <Input
                    id="unit_cost_usd"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingProduct.unit_cost_usd}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        unit_cost_usd: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_weight_kg">单件重量 (Kg)</Label>
                  <Input
                    id="unit_weight_kg"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingProduct.unit_weight_kg}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        unit_weight_kg: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="safety_stock_weeks">安全库存周数 *</Label>
                  <Input
                    id="safety_stock_weeks"
                    type="number"
                    step="1"
                    min="1"
                    value={editingProduct.safety_stock_weeks}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        safety_stock_weeks: parseInt(e.target.value) || 2,
                      })
                    }
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingProduct.is_active}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, is_active: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">启用</span>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={saveProduct} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? '保存中...' : '保存'}
                </Button>
                <Button variant="outline" onClick={cancelEdit}>
                  <X className="mr-2 h-4 w-4" />
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>产品列表</CardTitle>
            {!editingProduct && (
              <Button variant="primary" size="sm" onClick={startNew}>
                <Plus className="mr-2 h-4 w-4" />
                添加产品
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                加载中...
              </div>
            ) : products.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无产品
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>SPU</TableHead>
                    <TableHead>颜色代码</TableHead>
                    <TableHead>产品名称</TableHead>
                    <TableHead>类别</TableHead>
                    <TableHead className="text-right">单位成本 (USD)</TableHead>
                    <TableHead className="text-right">单件重量 (Kg)</TableHead>
                    <TableHead className="text-right">安全库存周数</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.sku}>
                      <TableCell className="font-medium">{product.sku}</TableCell>
                      <TableCell>{product.spu || '-'}</TableCell>
                      <TableCell>{product.color_code || '-'}</TableCell>
                      <TableCell>{product.product_name}</TableCell>
                      <TableCell>{product.category || '-'}</TableCell>
                      <TableCell className="text-right">
                        ${product.unit_cost_usd?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.unit_weight_kg?.toFixed(2) || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.safety_stock_weeks}周
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.is_active ? 'success' : 'default'}>
                          {product.is_active ? '启用' : '停用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(product)}
                            disabled={!!editingProduct}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteProduct(product.sku)}
                            disabled={!!editingProduct}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
