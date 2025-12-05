'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createPurchaseOrder } from '@/lib/actions/procurement'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Product, Channel } from '@/lib/types/database'

interface POItem {
  sku: string
  channel_code: string
  ordered_qty: number
  unit_price_usd: number
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dataLoading, setDataLoading] = useState(true)

  // 从数据库加载的产品和渠道
  const [products, setProducts] = useState<Product[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const [formData, setFormData] = useState({
    po_number: `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    batch_code: '',
    planned_order_date: new Date().toISOString().split('T')[0],
    actual_order_date: '',
    planned_ship_date: '',
    remarks: '',
  })

  const [items, setItems] = useState<POItem[]>([])

  // 加载产品和渠道数据
  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()

      const [productsResult, channelsResult] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true).order('sku'),
        supabase.from('channels').select('*').eq('is_active', true).order('channel_code'),
      ])

      const loadedProducts = (productsResult.data || []) as Product[]
      const loadedChannels = (channelsResult.data || []) as Channel[]

      setProducts(loadedProducts)
      setChannels(loadedChannels)

      // 设置默认的第一个订单项
      if (loadedProducts.length > 0 && loadedChannels.length > 0) {
        setItems([
          {
            sku: loadedProducts[0].sku,
            channel_code: loadedChannels[0].channel_code,
            ordered_qty: 100,
            unit_price_usd: loadedProducts[0].unit_cost_usd || 0,
          },
        ])
      }

      setDataLoading(false)
    }

    loadData()
  }, [])

  const addItem = () => {
    if (products.length === 0 || channels.length === 0) return
    setItems([
      ...items,
      {
        sku: products[0].sku,
        channel_code: channels[0].channel_code,
        ordered_qty: 100,
        unit_price_usd: products[0].unit_cost_usd || 0,
      },
    ])
  }

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index: number, field: keyof POItem, value: string | number) => {
    const newItems = [...items]
    if (field === 'sku') {
      const product = products.find((p) => p.sku === value)
      newItems[index] = {
        ...newItems[index],
        sku: value as string,
        unit_price_usd: product?.unit_cost_usd || 0,
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value }
    }
    setItems(newItems)
  }

  const totalQty = items.reduce((sum, item) => sum + item.ordered_qty, 0)
  const totalValue = items.reduce(
    (sum, item) => sum + item.ordered_qty * item.unit_price_usd,
    0
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await createPurchaseOrder(
        {
          po_number: formData.po_number,
          batch_code: formData.batch_code,
          po_status: 'Draft',
          planned_order_date: formData.planned_order_date || null,
          actual_order_date: formData.actual_order_date || null,
          planned_ship_date: formData.planned_ship_date || null,
          remarks: formData.remarks || null,
        },
        items.map((item) => ({
          sku: item.sku,
          channel_code: item.channel_code,
          ordered_qty: item.ordered_qty,
          unit_price_usd: item.unit_price_usd,
        }))
      )

      if (result.success) {
        router.push('/procurement')
      } else {
        setError(result.error || '创建失败')
      }
    } catch (err) {
      setError('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="创建采购订单" description="新建 PO 单" />

      <div className="flex-1 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Back Button */}
          <Link href="/procurement">
            <Button variant="ghost" type="button">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回列表
            </Button>
          </Link>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Order Info */}
          <Card>
            <CardHeader>
              <CardTitle>订单信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="po_number">订单号</Label>
                  <Input
                    id="po_number"
                    value={formData.po_number}
                    onChange={(e) =>
                      setFormData({ ...formData, po_number: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="batch_code">批次号</Label>
                  <Input
                    id="batch_code"
                    value={formData.batch_code}
                    onChange={(e) =>
                      setFormData({ ...formData, batch_code: e.target.value })
                    }
                    placeholder="例: 2025年1月订单"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planned_order_date">计划下单日期</Label>
                  <Input
                    id="planned_order_date"
                    type="date"
                    value={formData.planned_order_date}
                    onChange={(e) =>
                      setFormData({ ...formData, planned_order_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual_order_date">实际下单日期</Label>
                  <Input
                    id="actual_order_date"
                    type="date"
                    value={formData.actual_order_date}
                    onChange={(e) =>
                      setFormData({ ...formData, actual_order_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planned_ship_date">预计出货日期</Label>
                  <Input
                    id="planned_ship_date"
                    type="date"
                    value={formData.planned_ship_date}
                    onChange={(e) =>
                      setFormData({ ...formData, planned_ship_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="remarks">备注</Label>
                <Textarea
                  id="remarks"
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData({ ...formData, remarks: e.target.value })
                  }
                  placeholder="订单备注..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>订购明细</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                disabled={dataLoading || products.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                添加行
              </Button>
            </CardHeader>
            <CardContent>
              {dataLoading ? (
                <div className="flex h-32 items-center justify-center text-gray-500">
                  加载中...
                </div>
              ) : products.length === 0 || channels.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-gray-500">
                  请先在设置中添加产品和渠道
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {items.map((item, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 p-4 md:grid-cols-5"
                      >
                        <div className="space-y-2">
                          <Label>SKU</Label>
                          <Select
                            value={item.sku}
                            onChange={(e) => updateItem(index, 'sku', e.target.value)}
                          >
                            {products.map((p) => (
                              <option key={p.sku} value={p.sku}>
                                {p.sku} - {p.product_name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>渠道</Label>
                          <Select
                            value={item.channel_code}
                            onChange={(e) =>
                              updateItem(index, 'channel_code', e.target.value)
                            }
                          >
                            {channels.map((ch) => (
                              <option key={ch.channel_code} value={ch.channel_code}>
                                {ch.channel_name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>数量</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.ordered_qty}
                            onChange={(e) =>
                              updateItem(index, 'ordered_qty', parseInt(e.target.value) || 0)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>单价 (USD)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price_usd}
                            onChange={(e) =>
                              updateItem(index, 'unit_price_usd', parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                            disabled={items.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="mt-6 flex justify-end space-x-8 border-t border-gray-200 pt-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">总数量</p>
                      <p className="text-xl font-semibold">{totalQty}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">总金额</p>
                      <p className="text-xl font-semibold text-green-600">
                        ${totalValue.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end space-x-4">
            <Link href="/procurement">
              <Button type="button" variant="outline">
                取消
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? '创建中...' : '创建订单'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
