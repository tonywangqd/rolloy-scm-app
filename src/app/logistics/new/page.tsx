'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { createShipmentWithAllocations } from '@/lib/actions/logistics'
import { ArrowLeft, ArrowRight, Check, PackageCheck } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Warehouse, WarehouseType } from '@/lib/types/database'

// Type for unshipped delivery record from v_unshipped_deliveries view
interface UnshippedDelivery {
  delivery_id: string
  delivery_number: string
  sku: string
  po_number: string
  batch_code: string | null
  supplier_name: string | null
  delivered_qty: number
  shipped_qty: number
  unshipped_qty: number
  actual_delivery_date: string
  days_since_delivery: number
  product_name: string | null
  spu: string | null
  shipment_status: 'unshipped' | 'partial' | 'fully_shipped'
  payment_status: string | null
}

// Type for selected delivery with user-specified shipped quantity
interface SelectedDelivery extends UnshippedDelivery {
  userShippedQty: number // User-specified qty to ship
}

const LOGISTICS_PLANS = [
  { name: '极速20日达', days: 20 },
  { name: '全美25日达', days: 25 },
  { name: '奥克兰30日达', days: 30 },
  { name: '纽约海铁30日达', days: 30 },
  { name: '芝加哥45日达', days: 45 },
  { name: '纽约45日达', days: 45 },
  { name: '萨瓦纳45日达', days: 45 },
  { name: '美森特快', days: 30 },
]
const REGIONS = ['East', 'Central', 'West']

export default function NewShipmentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Data state
  const [unshippedDeliveries, setUnshippedDeliveries] = useState<UnshippedDelivery[]>([])
  const [selectedDeliveries, setSelectedDeliveries] = useState<Map<string, SelectedDelivery>>(new Map())
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseType, setWarehouseType] = useState<WarehouseType | ''>('')

  // Form data
  const [formData, setFormData] = useState({
    tracking_number: `SHIP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    batch_code: '',
    logistics_batch_code: '',
    destination_warehouse_id: '',
    customs_clearance: false,
    logistics_plan: '',
    logistics_region: '' as 'East' | 'Central' | 'West' | '',
    planned_departure_date: '',
    planned_arrival_days: 30,
    planned_arrival_date: '',
    weight_kg: 0,
    cost_per_kg_usd: 0,
    surcharge_usd: 0,
    tax_refund_usd: 0,
    remarks: '',
  })

  // Auto-calculate planned_arrival_date when departure date or days change
  useEffect(() => {
    if (formData.planned_departure_date && formData.planned_arrival_days > 0) {
      const departureDate = new Date(formData.planned_departure_date)
      const arrivalDate = new Date(departureDate)
      arrivalDate.setDate(arrivalDate.getDate() + formData.planned_arrival_days)
      const calculatedDate = arrivalDate.toISOString().split('T')[0]

      if (calculatedDate !== formData.planned_arrival_date) {
        setFormData(prev => ({ ...prev, planned_arrival_date: calculatedDate }))
      }
    }
  }, [formData.planned_departure_date, formData.planned_arrival_days, formData.planned_arrival_date])

  // Fetch unshipped deliveries and warehouses
  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      // Fetch unshipped deliveries
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('v_unshipped_deliveries')
        .select('*')
        .order('actual_delivery_date', { ascending: false })

      if (!deliveriesError && deliveriesData) {
        setUnshippedDeliveries(deliveriesData)
      }

      // Fetch warehouses
      const { data: warehousesData } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('warehouse_code')

      setWarehouses(warehousesData || [])
    }

    fetchData()
  }, [])

  // Filter warehouses by type
  const filteredWarehouses = warehouseType
    ? warehouses.filter((w) => w.warehouse_type === warehouseType)
    : warehouses

  // Handle delivery selection toggle
  const handleDeliveryToggle = (delivery: UnshippedDelivery, checked: boolean) => {
    const newSelected = new Map(selectedDeliveries)
    if (checked) {
      newSelected.set(delivery.delivery_id, {
        ...delivery,
        userShippedQty: delivery.unshipped_qty, // Default to full unshipped qty
      })
    } else {
      newSelected.delete(delivery.delivery_id)
    }
    setSelectedDeliveries(newSelected)
  }

  // Update user-specified shipped quantity
  const handleQtyChange = (deliveryId: string, qty: number) => {
    const newSelected = new Map(selectedDeliveries)
    const delivery = newSelected.get(deliveryId)
    if (delivery) {
      delivery.userShippedQty = qty
      newSelected.set(deliveryId, delivery)
      setSelectedDeliveries(newSelected)
    }
  }

  // Calculate totals
  const selectedArray = Array.from(selectedDeliveries.values())
  const totalShippedQty = selectedArray.reduce((sum, d) => sum + d.userShippedQty, 0)
  const uniqueSkus = new Set(selectedArray.map((d) => d.sku)).size
  const freightCost = formData.weight_kg * formData.cost_per_kg_usd
  const totalCost = freightCost + formData.surcharge_usd - formData.tax_refund_usd

  // Validation for each step
  const canProceedToStep2 = selectedDeliveries.size > 0
  const canProceedToStep3 = selectedArray.every(
    (d) => d.userShippedQty > 0 && d.userShippedQty <= d.unshipped_qty
  )

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    if (!formData.destination_warehouse_id) {
      setError('请选择目的仓库')
      setLoading(false)
      return
    }

    try {
      // Prepare allocations
      const allocations = selectedArray.map((d) => ({
        delivery_id: d.delivery_id,
        shipped_qty: d.userShippedQty,
        remarks: null,
      }))

      const result = await createShipmentWithAllocations(
        {
          tracking_number: formData.tracking_number,
          batch_code: formData.batch_code || null,
          logistics_batch_code: formData.logistics_batch_code || null,
          destination_warehouse_id: formData.destination_warehouse_id,
          customs_clearance: formData.customs_clearance,
          logistics_plan: formData.logistics_plan || null,
          logistics_region: formData.logistics_region || null,
          planned_departure_date: formData.planned_departure_date || null,
          actual_departure_date: null,
          planned_arrival_days: formData.planned_arrival_days || null,
          planned_arrival_date: formData.planned_arrival_date || null,
          actual_arrival_date: null,
          weight_kg: formData.weight_kg || null,
          unit_count: totalShippedQty || null,
          cost_per_kg_usd: formData.cost_per_kg_usd || null,
          surcharge_usd: formData.surcharge_usd,
          tax_refund_usd: formData.tax_refund_usd,
          remarks: formData.remarks || null,
        },
        allocations
      )

      if (result.success) {
        router.push('/logistics')
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
      <Header title="新建发运单（从交货记录创建）" description="从待发货交货记录选择并创建发运单" />

      <div className="flex-1 p-6">
        {/* Progress Indicator */}
        <div className="mb-6 flex items-center justify-center space-x-4">
          <div className="flex items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {step > 1 ? <Check className="h-5 w-5" /> : '1'}
            </div>
            <span className="ml-2 text-sm font-medium">选择交货记录</span>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400" />
          <div className="flex items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {step > 2 ? <Check className="h-5 w-5" /> : '2'}
            </div>
            <span className="ml-2 text-sm font-medium">确认发货数量</span>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400" />
          <div className="flex items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              3
            </div>
            <span className="ml-2 text-sm font-medium">填写物流信息</span>
          </div>
        </div>

        {/* Back Button */}
        <Link href="/logistics">
          <Button variant="ghost" type="button" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回列表
          </Button>
        </Link>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Step 1: Select Deliveries */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <PackageCheck className="mr-2 h-5 w-5" />
                选择待发货交货记录
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="p-3 text-left">
                        <div className="flex items-center">
                          <Checkbox
                            checked={selectedDeliveries.size === unshippedDeliveries.length && unshippedDeliveries.length > 0}
                            onChange={(e) => {
                              const checked = (e.target as HTMLInputElement).checked
                              if (checked) {
                                const newSelected = new Map()
                                unshippedDeliveries.forEach((d) => {
                                  newSelected.set(d.delivery_id, {
                                    ...d,
                                    userShippedQty: d.unshipped_qty,
                                  })
                                })
                                setSelectedDeliveries(newSelected)
                              } else {
                                setSelectedDeliveries(new Map())
                              }
                            }}
                          />
                        </div>
                      </th>
                      <th className="p-3 text-left font-medium text-gray-600">交货单号</th>
                      <th className="p-3 text-left font-medium text-gray-600">PO号</th>
                      <th className="p-3 text-left font-medium text-gray-600">批次号</th>
                      <th className="p-3 text-left font-medium text-gray-600">SKU</th>
                      <th className="p-3 text-left font-medium text-gray-600">产品名</th>
                      <th className="p-3 text-right font-medium text-gray-600">已交货</th>
                      <th className="p-3 text-right font-medium text-gray-600">已发货</th>
                      <th className="p-3 text-right font-medium text-gray-600">可发货</th>
                      <th className="p-3 text-left font-medium text-gray-600">交货日期</th>
                      <th className="p-3 text-left font-medium text-gray-600">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unshippedDeliveries.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-gray-500">
                          暂无待发货交货记录
                        </td>
                      </tr>
                    ) : (
                      unshippedDeliveries.map((delivery) => {
                        const isSelected = selectedDeliveries.has(delivery.delivery_id)
                        const canSelect = delivery.unshipped_qty > 0
                        return (
                          <tr
                            key={delivery.delivery_id}
                            className={`border-b hover:bg-gray-50 ${
                              isSelected ? 'bg-blue-50' : ''
                            } ${!canSelect ? 'opacity-50' : ''}`}
                          >
                            <td className="p-3">
                              <Checkbox
                                checked={isSelected}
                                disabled={!canSelect}
                                onChange={(e) =>
                                  handleDeliveryToggle(delivery, (e.target as HTMLInputElement).checked)
                                }
                              />
                            </td>
                            <td className="p-3 font-mono text-xs">{delivery.delivery_number}</td>
                            <td className="p-3 font-mono text-xs">{delivery.po_number}</td>
                            <td className="p-3 font-mono text-xs">{delivery.batch_code || '-'}</td>
                            <td className="p-3 font-mono text-xs">{delivery.sku}</td>
                            <td className="p-3 text-xs">{delivery.product_name || '-'}</td>
                            <td className="p-3 text-right font-mono">{delivery.delivered_qty}</td>
                            <td className="p-3 text-right font-mono">{delivery.shipped_qty}</td>
                            <td className="p-3 text-right font-mono font-semibold text-green-600">
                              {delivery.unshipped_qty}
                            </td>
                            <td className="p-3 text-xs">
                              {delivery.actual_delivery_date}
                              <span className="ml-2 text-gray-500">
                                ({delivery.days_since_delivery}天前)
                              </span>
                            </td>
                            <td className="p-3">
                              <span
                                className={`rounded-full px-2 py-1 text-xs ${
                                  delivery.shipment_status === 'unshipped'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {delivery.shipment_status === 'unshipped' ? '未发货' : '部分发货'}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex items-center justify-between border-t pt-4">
                <div className="text-sm text-gray-600">
                  已选择 <span className="font-semibold text-blue-600">{selectedDeliveries.size}</span> 条交货记录
                </div>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!canProceedToStep2}
                  variant="primary"
                >
                  下一步：确认数量
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Confirm Quantities */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>确认发货数量</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedArray.map((delivery) => {
                  const qtyError =
                    delivery.userShippedQty <= 0 || delivery.userShippedQty > delivery.unshipped_qty
                  return (
                    <div
                      key={delivery.delivery_id}
                      className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 p-4 md:grid-cols-4"
                    >
                      <div>
                        <div className="text-xs text-gray-500">交货单号</div>
                        <div className="font-mono text-sm font-medium">{delivery.delivery_number}</div>
                        <div className="mt-1 text-xs text-gray-600">
                          PO: {delivery.po_number}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">SKU / 产品</div>
                        <div className="font-mono text-sm">{delivery.sku}</div>
                        <div className="mt-1 text-xs text-gray-600">{delivery.product_name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">可发货数量</div>
                        <div className="text-sm">
                          <span className="font-semibold text-green-600">{delivery.unshipped_qty}</span>
                          <span className="ml-2 text-gray-500">
                            (已交货 {delivery.delivered_qty}, 已发货 {delivery.shipped_qty})
                          </span>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`qty-${delivery.delivery_id}`}>本次发货数量 *</Label>
                        <NumericInput
                          id={`qty-${delivery.delivery_id}`}
                          min={1}
                          max={delivery.unshipped_qty}
                          value={delivery.userShippedQty}
                          onChange={(value) => handleQtyChange(delivery.delivery_id, value)}
                          className={qtyError ? 'border-red-500' : ''}
                        />
                        {qtyError && (
                          <p className="mt-1 text-xs text-red-600">
                            数量必须在 1 到 {delivery.unshipped_qty} 之间
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-6 rounded-lg bg-gray-50 p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">交货记录数</div>
                    <div className="text-xl font-semibold">{selectedDeliveries.size}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">SKU数</div>
                    <div className="text-xl font-semibold">{uniqueSkus}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">总发货数量</div>
                    <div className="text-xl font-semibold text-blue-600">{totalShippedQty}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t pt-4">
                <Button onClick={() => setStep(1)} variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  上一步
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!canProceedToStep3}
                  variant="primary"
                >
                  下一步：物流信息
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Shipment Info */}
        {step === 3 && (
          <div className="space-y-6">
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
                    <Label htmlFor="batch_code">批次号</Label>
                    <Input
                      id="batch_code"
                      value={formData.batch_code}
                      onChange={(e) =>
                        setFormData({ ...formData, batch_code: e.target.value })
                      }
                      placeholder="生产批次号"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logistics_batch_code">物流批次号</Label>
                    <Input
                      id="logistics_batch_code"
                      value={formData.logistics_batch_code}
                      onChange={(e) =>
                        setFormData({ ...formData, logistics_batch_code: e.target.value })
                      }
                      placeholder="物流批次号"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="warehouse_type">仓库类型</Label>
                    <select
                      id="warehouse_type"
                      value={warehouseType}
                      onChange={(e) => {
                        setWarehouseType(e.target.value as WarehouseType | '')
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
                      onChange={(e) => {
                        const selectedPlan = LOGISTICS_PLANS.find(p => p.name === e.target.value)
                        setFormData({
                          ...formData,
                          logistics_plan: e.target.value,
                          planned_arrival_days: selectedPlan?.days || 30,
                        })
                      }}
                      className="flex h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">选择方案</option>
                      {LOGISTICS_PLANS.map((plan) => (
                        <option key={plan.name} value={plan.name}>
                          {plan.name}
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="planned_departure_date">预计开船日期 *</Label>
                    <DateInput
                      id="planned_departure_date"
                      value={formData.planned_departure_date}
                      onChange={(value) =>
                        setFormData({ ...formData, planned_departure_date: value })
                      }
                      required
                    />
                    <p className="text-xs text-gray-500">实际开船日期请在发运单详情页填写</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="planned_arrival_days">预计签收天数 *</Label>
                    <NumericInput
                      id="planned_arrival_days"
                      value={formData.planned_arrival_days}
                      onChange={(value) =>
                        setFormData({ ...formData, planned_arrival_days: value })
                      }
                      min={1}
                      placeholder="选择物流方案自动填充"
                    />
                    <p className="text-xs text-gray-500">选择物流方案后自动填充</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="planned_arrival_date">预计签收日期</Label>
                    <div className="flex h-10 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-700">
                      {formData.planned_arrival_date || '自动计算'}
                    </div>
                    <p className="text-xs text-gray-500">根据开船日期 + 签收天数自动计算</p>
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
                    <NumericInput
                      id="weight_kg"
                      value={formData.weight_kg}
                      onChange={(value) =>
                        setFormData({ ...formData, weight_kg: value })
                      }
                      allowDecimal
                      decimalPlaces={2}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cost_per_kg_usd">公斤单价 (CNY)</Label>
                    <NumericInput
                      id="cost_per_kg_usd"
                      value={formData.cost_per_kg_usd}
                      onChange={(value) =>
                        setFormData({ ...formData, cost_per_kg_usd: value })
                      }
                      allowDecimal
                      decimalPlaces={2}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surcharge_usd">杂费 (CNY)</Label>
                    <NumericInput
                      id="surcharge_usd"
                      value={formData.surcharge_usd}
                      onChange={(value) =>
                        setFormData({ ...formData, surcharge_usd: value })
                      }
                      allowDecimal
                      decimalPlaces={2}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_refund_usd">报关费用 (CNY)</Label>
                    <NumericInput
                      id="tax_refund_usd"
                      value={formData.tax_refund_usd}
                      onChange={(value) =>
                        setFormData({ ...formData, tax_refund_usd: value })
                      }
                      allowDecimal
                      decimalPlaces={2}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500">报关、清关相关费用</p>
                  </div>
                  <div className="space-y-2">
                    <Label>总费用 (CNY)</Label>
                    <div className="flex h-10 items-center rounded-lg bg-gray-100 px-3 font-semibold text-green-600">
                      ¥{totalCost.toFixed(2)}
                    </div>
                  </div>
                </div>
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

            {/* Summary */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-900">发运汇总</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-blue-600">交货记录数</div>
                    <div className="text-2xl font-semibold text-blue-900">{selectedDeliveries.size}</div>
                  </div>
                  <div>
                    <div className="text-blue-600">SKU数</div>
                    <div className="text-2xl font-semibold text-blue-900">{uniqueSkus}</div>
                  </div>
                  <div>
                    <div className="text-blue-600">总发货数量</div>
                    <div className="text-2xl font-semibold text-blue-900">{totalShippedQty}</div>
                  </div>
                  <div>
                    <div className="text-blue-600">物流费用</div>
                    <div className="text-2xl font-semibold text-blue-900">¥{totalCost.toFixed(2)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex justify-between">
              <Button onClick={() => setStep(2)} variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                上一步
              </Button>
              <div className="flex space-x-4">
                <Link href="/logistics">
                  <Button type="button" variant="outline">
                    取消
                  </Button>
                </Link>
                <Button onClick={handleSubmit} variant="primary" disabled={loading}>
                  {loading ? '创建中...' : '创建发运单'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
