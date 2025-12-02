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
import { createDelivery } from '@/lib/actions/procurement'
import { ArrowLeft, PackageCheck } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PurchaseOrderItem } from '@/lib/types/database'

interface POOption {
  id: string
  po_number: string
  batch_code: string
}

interface DeliveryItemForm {
  po_item_id: string
  sku: string
  channel_code: string | null
  ordered_qty: number
  delivered_qty: number
  remaining_qty: number
  delivery_qty: number
  unit_cost_usd: number
}

export default function NewDeliveryPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingPO, setLoadingPO] = useState(false)
  const [error, setError] = useState('')
  const [poOptions, setPoOptions] = useState<POOption[]>([])
  const [selectedPO, setSelectedPO] = useState<string>('')
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemForm[]>([])

  const [formData, setFormData] = useState({
    delivery_number: `DLV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    delivery_date: new Date().toISOString().split('T')[0],
    remarks: '',
  })

  // Load PO options on mount
  useEffect(() => {
    const fetchPOs = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, batch_code, po_status')
        .in('po_status', ['Confirmed', 'In Production'])
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching POs:', error)
        setError(`加载采购订单失败: ${error.message}`)
        return
      }

      console.log('Fetched POs:', data)
      setPoOptions(data || [])

      if (!data || data.length === 0) {
        console.warn('No POs found with status Confirmed or In Production')
      }
    }
    fetchPOs()
  }, [])

  // Load PO items when PO is selected
  useEffect(() => {
    if (!selectedPO) {
      setDeliveryItems([])
      return
    }

    const fetchPOItems = async () => {
      setLoadingPO(true)
      const supabase = createClient()

      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('id, po_id, sku, channel_code, ordered_qty, delivered_qty, unit_price_usd')
        .eq('po_id', selectedPO)
        .order('sku')

      if (error) {
        console.error('Error fetching PO items:', error)
        setError(`加载采购订单明细失败: ${error.message}`)
        setLoadingPO(false)
        return
      }

      console.log('Fetched PO items:', data)

      if (data) {
        const items: DeliveryItemForm[] = data.map((item: any) => ({
          po_item_id: item.id,
          sku: item.sku,
          channel_code: item.channel_code,
          ordered_qty: item.ordered_qty,
          delivered_qty: item.delivered_qty,
          remaining_qty: item.ordered_qty - item.delivered_qty,
          delivery_qty: 0,
          unit_cost_usd: item.unit_price_usd,
        }))
        setDeliveryItems(items)
      }

      setLoadingPO(false)
    }

    fetchPOItems()
  }, [selectedPO])

  const updateDeliveryQty = (index: number, qty: number) => {
    const newItems = [...deliveryItems]
    newItems[index].delivery_qty = qty
    setDeliveryItems(newItems)
  }

  const totalDeliveryQty = deliveryItems.reduce((sum, item) => sum + item.delivery_qty, 0)
  const totalDeliveryValue = deliveryItems.reduce(
    (sum, item) => sum + item.delivery_qty * item.unit_cost_usd,
    0
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!selectedPO) {
      setError('请选择采购订单')
      setLoading(false)
      return
    }

    // Validate at least one item has delivery quantity
    const itemsToDeliver = deliveryItems.filter((item) => item.delivery_qty > 0)
    if (itemsToDeliver.length === 0) {
      setError('请至少为一个SKU输入交付数量')
      setLoading(false)
      return
    }

    // Validate delivery quantities don't exceed remaining
    const invalidItems = itemsToDeliver.filter(
      (item) => item.delivery_qty > item.remaining_qty
    )
    if (invalidItems.length > 0) {
      setError(
        `交付数量超过剩余数量: ${invalidItems.map((i) => i.sku).join(', ')}`
      )
      setLoading(false)
      return
    }

    try {
      // Create a delivery record for each item with quantity > 0
      const results = await Promise.all(
        itemsToDeliver.map((item) =>
          createDelivery({
            delivery_number: formData.delivery_number,
            po_item_id: item.po_item_id,
            sku: item.sku,
            channel_code: item.channel_code,
            delivered_qty: item.delivery_qty,
            planned_delivery_date: null,
            actual_delivery_date: formData.delivery_date || null,
            unit_cost_usd: item.unit_cost_usd,
            payment_status: 'Pending',
            remarks: formData.remarks || null,
          })
        )
      )

      // Check if all succeeded
      const failures = results.filter((r) => !r.success)
      if (failures.length > 0) {
        setError(`部分交货记录创建失败: ${failures.map((f) => f.error).join(', ')}`)
      } else {
        // Success - redirect back to procurement list
        router.push('/procurement')
      }
    } catch {
      setError('创建交货记录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="新增交货记录" description="记录工厂生产交货" />

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

          {/* Delivery Info */}
          <Card>
            <CardHeader>
              <CardTitle>交货信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="po_id">选择采购订单 *</Label>
                  <Select
                    id="po_id"
                    value={selectedPO}
                    onChange={(e) => setSelectedPO(e.target.value)}
                    required
                  >
                    <option value="">-- 请选择 --</option>
                    {poOptions.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.po_number} - {po.batch_code}
                      </option>
                    ))}
                  </Select>
                  {poOptions.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">
                      暂无可用的采购订单。请先在采购管理中创建新订单并确认。
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery_date">交货日期 *</Label>
                  <Input
                    id="delivery_date"
                    type="date"
                    value={formData.delivery_date}
                    onChange={(e) =>
                      setFormData({ ...formData, delivery_date: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery_number">交货单号 (可选)</Label>
                  <Input
                    id="delivery_number"
                    value={formData.delivery_number}
                    onChange={(e) =>
                      setFormData({ ...formData, delivery_number: e.target.value })
                    }
                    placeholder="例如: DLV-2025-0001"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivery Items */}
          {selectedPO && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PackageCheck className="mr-2 h-5 w-5" />
                  SKU明细
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPO ? (
                  <div className="py-8 text-center text-gray-500">加载中...</div>
                ) : deliveryItems.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    该采购订单没有SKU明细
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                            SKU
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                            渠道
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                            订单数量
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                            已交付
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                            剩余
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                            本次交付 *
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                            单价
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveryItems.map((item, index) => (
                          <tr
                            key={item.po_item_id}
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {item.sku}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {item.channel_code || '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-900">
                              {item.ordered_qty}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              {item.delivered_qty}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-blue-600">
                              {item.remaining_qty}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Input
                                type="number"
                                min="0"
                                max={item.remaining_qty}
                                value={item.delivery_qty}
                                onChange={(e) =>
                                  updateDeliveryQty(index, parseInt(e.target.value) || 0)
                                }
                                className="w-24 text-right"
                              />
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              ${item.unit_cost_usd.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Summary */}
                    <div className="mt-6 flex justify-end space-x-8 border-t border-gray-200 pt-4">
                      <div className="text-right">
                        <p className="text-sm text-gray-500">总数量</p>
                        <p className="text-xl font-semibold">{totalDeliveryQty}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">总货值</p>
                        <p className="text-xl font-semibold text-green-600">
                          ${totalDeliveryValue.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Remarks */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="remarks">备注 (可选)</Label>
                <Textarea
                  id="remarks"
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData({ ...formData, remarks: e.target.value })
                  }
                  placeholder="可以添加关于本次交货的备注信息..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end space-x-4">
            <Link href="/procurement">
              <Button type="button" variant="outline">
                取消
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !selectedPO || deliveryItems.length === 0}
            >
              {loading ? '提交中...' : '确认交货'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
