'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateShipment } from '@/lib/actions/logistics'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Warehouse, WarehouseType, Shipment, ShipmentItem } from '@/lib/types/database'

const LOGISTICS_PLANS = [
  '极速20日达',
  '全美25日达',
  '奥克兰30日达',
  '纽约海铁30日达',
  '芝加哥45日达',
  '纽约45日达',
  '萨瓦纳45日达',
  '美森特快',
]
const REGIONS = ['East', 'Central', 'West']

interface EditShipmentPageProps {
  params: Promise<{ id: string }>
}

export default function EditShipmentPage({ params }: EditShipmentPageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [shipmentId, setShipmentId] = useState<string>('')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseType, setWarehouseType] = useState<WarehouseType | ''>('')
  const [items, setItems] = useState<ShipmentItem[]>([])

  const [formData, setFormData] = useState({
    tracking_number: '',
    destination_warehouse_id: '',
    logistics_plan: '',
    logistics_region: '' as 'East' | 'Central' | 'West' | '',
    planned_departure_date: '',
    actual_departure_date: '',
    planned_arrival_date: '',
    actual_arrival_date: '',
    weight_kg: 0,
    cost_per_kg_usd: 0,
    surcharge_usd: 0,
    tax_refund_usd: 0,
    remarks: '',
  })

  // Unwrap params and load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const resolvedParams = await params
        setShipmentId(resolvedParams.id)

        const supabase = createClient()

        // Fetch shipment and items
        const [shipmentResult, itemsResult, warehousesResult] = await Promise.all([
          supabase.from('shipments').select('*').eq('id', resolvedParams.id).single(),
          supabase.from('shipment_items').select('*').eq('shipment_id', resolvedParams.id).order('sku'),
          supabase.from('warehouses').select('*').eq('is_active', true).order('warehouse_code'),
        ])

        if (shipmentResult.error || !shipmentResult.data) {
          setError('发运单不存在')
          setLoading(false)
          return
        }

        const shipment = shipmentResult.data as Shipment
        setItems(itemsResult.data || [])
        setWarehouses(warehousesResult.data || [])

        // Get warehouse type for filtering
        const warehouse = warehousesResult.data?.find(w => w.id === shipment.destination_warehouse_id)
        if (warehouse) {
          setWarehouseType(warehouse.warehouse_type)
        }

        // Populate form
        setFormData({
          tracking_number: shipment.tracking_number || '',
          destination_warehouse_id: shipment.destination_warehouse_id || '',
          logistics_plan: shipment.logistics_plan || '',
          logistics_region: shipment.logistics_region || '',
          planned_departure_date: shipment.planned_departure_date || '',
          actual_departure_date: shipment.actual_departure_date || '',
          planned_arrival_date: shipment.planned_arrival_date || '',
          actual_arrival_date: shipment.actual_arrival_date || '',
          weight_kg: shipment.weight_kg || 0,
          cost_per_kg_usd: shipment.cost_per_kg_usd || 0,
          surcharge_usd: shipment.surcharge_usd || 0,
          tax_refund_usd: shipment.tax_refund_usd || 0,
          remarks: shipment.remarks || '',
        })

        setLoading(false)
      } catch (err) {
        console.error('Error loading shipment:', err)
        setError('加载失败')
        setLoading(false)
      }
    }

    loadData()
  }, [params])

  // Filter warehouses by type
  const filteredWarehouses = warehouseType
    ? warehouses.filter((w) => w.warehouse_type === warehouseType)
    : warehouses

  const freightCost = formData.weight_kg * formData.cost_per_kg_usd
  const totalCost = freightCost + formData.surcharge_usd - formData.tax_refund_usd

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!formData.destination_warehouse_id) {
      setError('请选择目的仓库')
      setSaving(false)
      return
    }

    try {
      const result = await updateShipment(shipmentId, {
        tracking_number: formData.tracking_number,
        destination_warehouse_id: formData.destination_warehouse_id,
        logistics_plan: formData.logistics_plan || null,
        logistics_region: formData.logistics_region || null,
        planned_departure_date: formData.planned_departure_date || null,
        actual_departure_date: formData.actual_departure_date || null,
        planned_arrival_date: formData.planned_arrival_date || null,
        actual_arrival_date: formData.actual_arrival_date || null,
        weight_kg: formData.weight_kg || null,
        cost_per_kg_usd: formData.cost_per_kg_usd || null,
        surcharge_usd: formData.surcharge_usd,
        tax_refund_usd: formData.tax_refund_usd,
        remarks: formData.remarks || null,
      })

      if (result.success) {
        router.push('/logistics')
      } else {
        setError(result.error || '更新失败')
      }
    } catch (err) {
      setError('更新失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="编辑发运单" description="编辑物流发运记录" />
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    )
  }

  if (error && !formData.tracking_number) {
    return (
      <div className="flex flex-col">
        <Header title="编辑发运单" description="编辑物流发运记录" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Link href="/logistics">
              <Button variant="outline">返回列表</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header title="编辑发运单" description="编辑物流发运记录" />

      <div className="flex-1 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Back Button */}
          <Link href="/logistics">
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

          {/* Info Notice */}
          <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-600">
            注意：货物明细（SKU和数量）无法编辑，如需修改请删除后重新创建
          </div>

          {/* Shipment Info */}
          <Card>
            <CardHeader>
              <CardTitle>发运信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="tracking_number">运单号 *</Label>
                  <Input
                    id="tracking_number"
                    value={formData.tracking_number}
                    onChange={(e) =>
                      setFormData({ ...formData, tracking_number: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warehouse_type">仓库类型</Label>
                  <select
                    id="warehouse_type"
                    value={warehouseType}
                    onChange={(e) => {
                      setWarehouseType(e.target.value as WarehouseType | '')
                      // Reset warehouse selection when type changes
                      setFormData({ ...formData, destination_warehouse_id: '' })
                    }}
                    className="flex h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">请选择仓库类型</option>
                    <option value="FBA">FBA仓</option>
                    <option value="3PL">海外仓(3PL)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination_warehouse_id">目的仓库 *</Label>
                  <select
                    id="destination_warehouse_id"
                    value={formData.destination_warehouse_id}
                    onChange={(e) =>
                      setFormData({ ...formData, destination_warehouse_id: e.target.value })
                    }
                    required
                    className="flex h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">选择仓库</option>
                    {filteredWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.warehouse_code} - {w.warehouse_name} ({w.warehouse_type})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logistics_plan">物流方案</Label>
                  <select
                    id="logistics_plan"
                    value={formData.logistics_plan}
                    onChange={(e) =>
                      setFormData({ ...formData, logistics_plan: e.target.value })
                    }
                    className="flex h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">选择方案</option>
                    {LOGISTICS_PLANS.map((plan) => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logistics_region">区域</Label>
                  <select
                    id="logistics_region"
                    value={formData.logistics_region}
                    onChange={(e) =>
                      setFormData({ ...formData, logistics_region: e.target.value as 'East' | 'Central' | 'West' | '' })
                    }
                    className="flex h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">选择区域</option>
                    {REGIONS.map((region) => (
                      <option key={region} value={region}>
                        {region === 'East' ? '东部' : region === 'Central' ? '中部' : '西部'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle>时间安排</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="planned_departure_date">预计开船日期</Label>
                  <Input
                    id="planned_departure_date"
                    type="date"
                    value={formData.planned_departure_date}
                    onChange={(e) =>
                      setFormData({ ...formData, planned_departure_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual_departure_date">实际开船日期</Label>
                  <Input
                    id="actual_departure_date"
                    type="date"
                    value={formData.actual_departure_date}
                    onChange={(e) =>
                      setFormData({ ...formData, actual_departure_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planned_arrival_date">预计到达日期</Label>
                  <Input
                    id="planned_arrival_date"
                    type="date"
                    value={formData.planned_arrival_date}
                    onChange={(e) =>
                      setFormData({ ...formData, planned_arrival_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual_arrival_date">实际签收日期</Label>
                  <Input
                    id="actual_arrival_date"
                    type="date"
                    value={formData.actual_arrival_date}
                    onChange={(e) =>
                      setFormData({ ...formData, actual_arrival_date: e.target.value })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost */}
          <Card>
            <CardHeader>
              <CardTitle>费用明细</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="weight_kg">计费重量 (Kg)</Label>
                  <Input
                    id="weight_kg"
                    type="number"
                    step="0.01"
                    value={formData.weight_kg}
                    onChange={(e) =>
                      setFormData({ ...formData, weight_kg: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost_per_kg_usd">公斤单价 (CNY)</Label>
                  <Input
                    id="cost_per_kg_usd"
                    type="number"
                    step="0.01"
                    value={formData.cost_per_kg_usd}
                    onChange={(e) =>
                      setFormData({ ...formData, cost_per_kg_usd: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="surcharge_usd">杂费 (CNY)</Label>
                  <Input
                    id="surcharge_usd"
                    type="number"
                    step="0.01"
                    value={formData.surcharge_usd}
                    onChange={(e) =>
                      setFormData({ ...formData, surcharge_usd: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax_refund_usd">退税 (CNY)</Label>
                  <Input
                    id="tax_refund_usd"
                    type="number"
                    step="0.01"
                    value={formData.tax_refund_usd}
                    onChange={(e) =>
                      setFormData({ ...formData, tax_refund_usd: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>总费用 (CNY)</Label>
                  <div className="flex h-10 items-center rounded-lg bg-gray-100 px-3 font-semibold text-green-600">
                    ¥{totalCost.toFixed(2)}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                注：费用以人民币（CNY）计价，数据库字段保持原有格式
              </p>
            </CardContent>
          </Card>

          {/* Items (Read-only) */}
          <Card>
            <CardHeader>
              <CardTitle>货物明细（只读）</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-gray-500 text-sm">暂无货物明细</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-4 font-semibold text-sm text-gray-600 pb-2 border-b">
                    <div>SKU</div>
                    <div>数量</div>
                    <div>备注</div>
                  </div>
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-3 gap-4 py-2 border-b border-gray-100"
                    >
                      <div className="font-mono">{item.sku}</div>
                      <div>{item.shipped_qty}</div>
                      <div className="text-gray-500 text-sm">-</div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">总数量</p>
                      <p className="text-xl font-semibold">
                        {items.reduce((sum, item) => sum + item.shipped_qty, 0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Remarks */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="remarks">备注</Label>
                <Textarea
                  id="remarks"
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData({ ...formData, remarks: e.target.value })
                  }
                  placeholder="发运备注..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end space-x-4">
            <Link href="/logistics">
              <Button type="button" variant="outline">
                取消
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? '保存中...' : '保存更改'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
