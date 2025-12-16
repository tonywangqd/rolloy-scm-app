'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { updatePurchaseOrder } from '@/lib/actions/procurement'
import type { POStatus } from '@/lib/types/database'

interface EditPurchaseOrderPageProps {
  params: Promise<{ id: string }>
}

interface OrderData {
  id: string
  po_number: string
  batch_code: string
  po_status: POStatus
  planned_order_date: string | null
  actual_order_date: string | null
  planned_ship_date: string | null
  remarks: string | null
}

const PO_STATUSES: { value: POStatus; label: string }[] = [
  { value: 'Draft', label: '草稿' },
  { value: 'Confirmed', label: '已确认' },
  { value: 'In Production', label: '生产中' },
  { value: 'Delivered', label: '已交付' },
  { value: 'Cancelled', label: '已取消' },
]

export default function EditPurchaseOrderPage({ params }: EditPurchaseOrderPageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState<string>('')
  const [order, setOrder] = useState<OrderData | null>(null)

  const [formData, setFormData] = useState({
    batch_code: '',
    po_status: 'Draft' as POStatus,
    planned_order_date: '',
    actual_order_date: '',
    planned_ship_date: '',
    remarks: '',
  })

  // Load order data
  useEffect(() => {
    const loadOrder = async () => {
      const resolvedParams = await params
      setOrderId(resolvedParams.id)

      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', resolvedParams.id)
        .single()

      if (fetchError || !data) {
        setError('无法加载订单数据')
        setLoading(false)
        return
      }

      setOrder(data as OrderData)
      setFormData({
        batch_code: data.batch_code || '',
        po_status: data.po_status as POStatus,
        planned_order_date: data.planned_order_date || '',
        actual_order_date: data.actual_order_date || '',
        planned_ship_date: data.planned_ship_date || '',
        remarks: data.remarks || '',
      })
      setLoading(false)
    }

    loadOrder()
  }, [params])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const result = await updatePurchaseOrder(orderId, {
        batch_code: formData.batch_code,
        po_status: formData.po_status,
        planned_order_date: formData.planned_order_date || null,
        actual_order_date: formData.actual_order_date || null,
        planned_ship_date: formData.planned_ship_date || null,
        remarks: formData.remarks || null,
      })

      if (result.success) {
        router.push(`/procurement/${orderId}`)
      } else {
        setError(result.error || '保存失败')
      }
    } catch (err) {
      setError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="编辑采购订单" description="加载中..." />
        <div className="flex-1 p-6">
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col">
        <Header title="编辑采购订单" description="订单不存在" />
        <div className="flex-1 p-6">
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
            {error || '无法找到该订单'}
          </div>
          <Link href="/procurement" className="mt-4 inline-block">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回列表
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header
        title={`编辑采购订单 - ${order.po_number}`}
        description="Edit Purchase Order"
      />

      <div className="flex-1 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Back Button */}
          <Link href={`/procurement/${orderId}`}>
            <Button variant="ghost" type="button">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回详情
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
                    value={order.po_number}
                    disabled
                    className="bg-gray-50"
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
                  <Label htmlFor="po_status">订单状态</Label>
                  <Select
                    id="po_status"
                    value={formData.po_status}
                    onChange={(e) =>
                      setFormData({ ...formData, po_status: e.target.value as POStatus })
                    }
                  >
                    {PO_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planned_order_date">计划下单日期</Label>
                  <DateInput
                    id="planned_order_date"
                    value={formData.planned_order_date}
                    onChange={(value) =>
                      setFormData({ ...formData, planned_order_date: value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual_order_date">实际下单日期</Label>
                  <DateInput
                    id="actual_order_date"
                    value={formData.actual_order_date}
                    onChange={(value) =>
                      setFormData({ ...formData, actual_order_date: value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planned_ship_date">预计出货日期</Label>
                  <DateInput
                    id="planned_ship_date"
                    value={formData.planned_ship_date}
                    onChange={(value) =>
                      setFormData({ ...formData, planned_ship_date: value })
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

          {/* Submit */}
          <div className="flex justify-end space-x-4">
            <Link href={`/procurement/${orderId}`}>
              <Button type="button" variant="outline">
                取消
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  保存修改
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
