'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// Note: Using native select element with manual styling instead of Select component
import { Textarea } from '@/components/ui/textarea'
import { createShipment } from '@/lib/actions/logistics'
import { Plus, Trash2, ArrowLeft, Upload } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Warehouse, WarehouseType } from '@/lib/types/database'

interface ShipmentItem {
  sku: string
  shipped_qty: number
  weight_kg?: number
}

const SKUS = ['A2RD', 'A2BK', 'A5RD', 'A5BK', 'W1RD', 'W1BK', 'W2RD', 'W2BK']
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

export default function NewShipmentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseType, setWarehouseType] = useState<WarehouseType | ''>('')
  const [customWarehouseName, setCustomWarehouseName] = useState('')
  const [pasteData, setPasteData] = useState('')

  useEffect(() => {
    const fetchWarehouses = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('warehouse_code')
      setWarehouses(data || [])
    }
    fetchWarehouses()
  }, [])

  // Filter warehouses by type
  const filteredWarehouses = warehouseType
    ? warehouses.filter((w) => w.warehouse_type === warehouseType)
    : warehouses

  const [formData, setFormData] = useState({
    tracking_number: `SHIP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    batch_code: '',
    logistics_batch_code: '',
    destination_warehouse_id: '',
    customs_clearance: false,
    logistics_plan: '',
    logistics_region: '' as 'East' | 'Central' | 'West' | '',
    planned_departure_date: '',
    actual_departure_date: '',
    planned_arrival_days: 30,
    planned_arrival_date: '',
    actual_arrival_date: '',
    weight_kg: 0,
    unit_count: 0,
    cost_per_kg_usd: 0,
    surcharge_usd: 0,
    tax_refund_usd: 0,
    remarks: '',
  })

  const [items, setItems] = useState<ShipmentItem[]>([
    { sku: 'A2RD', shipped_qty: 50 },
  ])

  const addItem = () => {
    setItems([...items, { sku: 'A2RD', shipped_qty: 50 }])
  }

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index: number, field: keyof ShipmentItem, value: string | number) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  // Parse pasted data from Excel (Tab-separated values)
  const handleParsePastedData = () => {
    if (!pasteData.trim()) {
      setError('请先粘贴数据')
      return
    }

    try {
      const lines = pasteData.trim().split('\n')
      const parsedItems: ShipmentItem[] = []

      for (const line of lines) {
        // Skip empty lines or header lines
        if (!line.trim() || line.includes('运单号') || line.includes('SKU')) {
          continue
        }

        // Split by tab or multiple spaces
        const columns = line.split(/\t|  +/).map((col) => col.trim())

        if (columns.length >= 2) {
          const sku = columns[1] || columns[0] // Try second column first (SKU), fallback to first
          const qty = parseInt(columns[2] || columns[1] || '0')
          const weight = parseFloat(columns[3] || columns[2] || '0')

          // Validate SKU
          if (SKUS.includes(sku) && qty > 0) {
            parsedItems.push({
              sku,
              shipped_qty: qty,
              weight_kg: weight > 0 ? weight : undefined,
            })
          }
        }
      }

      if (parsedItems.length > 0) {
        setItems(parsedItems)
        setError('')
        // Calculate total weight if provided
        const totalWeight = parsedItems.reduce((sum, item) => sum + (item.weight_kg || 0), 0)
        if (totalWeight > 0) {
          setFormData({ ...formData, weight_kg: totalWeight })
        }
      } else {
        setError('未能解析有效数据，请检查格式：运单号 | SKU | 数量 | 重量')
      }
    } catch (err) {
      setError('数据解析失败，请检查格式')
    }
  }

  const handleClearPastedData = () => {
    setPasteData('')
    setError('')
  }

  const totalQty = items.reduce((sum, item) => sum + item.shipped_qty, 0)
  const freightCost = formData.weight_kg * formData.cost_per_kg_usd
  const totalCost = freightCost + formData.surcharge_usd - formData.tax_refund_usd

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!formData.destination_warehouse_id) {
      setError('请选择目的仓库')
      setLoading(false)
      return
    }

    try {
      const result = await createShipment(
        {
          tracking_number: formData.tracking_number,
          batch_code: formData.batch_code || null,
          logistics_batch_code: formData.logistics_batch_code || null,
          destination_warehouse_id: formData.destination_warehouse_id,
          customs_clearance: formData.customs_clearance,
          logistics_plan: formData.logistics_plan || null,
          logistics_region: formData.logistics_region || null,
          planned_departure_date: formData.planned_departure_date || null,
          actual_departure_date: formData.actual_departure_date || null,
          planned_arrival_days: formData.planned_arrival_days || null,
          planned_arrival_date: formData.planned_arrival_date || null,
          actual_arrival_date: formData.actual_arrival_date || null,
          weight_kg: formData.weight_kg || null,
          unit_count: totalQty || null,
          cost_per_kg_usd: formData.cost_per_kg_usd || null,
          surcharge_usd: formData.surcharge_usd,
          tax_refund_usd: formData.tax_refund_usd,
          remarks: formData.remarks || null,
        },
        items.map((item) => ({
          sku: item.sku,
          shipped_qty: item.shipped_qty,
        }))
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
      <Header title="新建发运单" description="新建物流发运记录" />

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

          {/* Batch Paste Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Upload className="mr-2 h-5 w-5" />
                批量录入（从Excel粘贴）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pasteData">
                    粘贴表格数据（格式：运单号 | SKU | 数量 | 重量）
                  </Label>
                  <Textarea
                    id="pasteData"
                    value={pasteData}
                    onChange={(e) => setPasteData(e.target.value)}
                    placeholder="从Excel中复制数据并粘贴到此处...&#10;示例：&#10;SHIP-001    A2RD    100    50&#10;SHIP-001    A2BK    200    100"
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500">
                    支持Tab分隔或多个空格分隔的数据，自动跳过表头
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="default"
                    onClick={handleParsePastedData}
                    disabled={!pasteData.trim()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    解析数据
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearPastedData}
                    disabled={!pasteData.trim()}
                  >
                    清空
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

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
                    <option value="">选择现有仓库</option>
                    {filteredWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.warehouse_code} - {w.warehouse_name} ({w.warehouse_type})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom_warehouse">或输入新仓库名称</Label>
                  <Input
                    id="custom_warehouse"
                    value={customWarehouseName}
                    onChange={(e) => setCustomWarehouseName(e.target.value)}
                    placeholder="手动输入仓库名称"
                    disabled={!!formData.destination_warehouse_id}
                  />
                  <p className="text-xs text-gray-500">
                    {formData.destination_warehouse_id
                      ? '已选择现有仓库'
                      : '输入新仓库名称（需先创建仓库）'}
                  </p>
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
                  <Label htmlFor="planned_arrival_days">预计签收天数</Label>
                  <Input
                    id="planned_arrival_days"
                    type="number"
                    value={formData.planned_arrival_days}
                    onChange={(e) =>
                      setFormData({ ...formData, planned_arrival_days: parseInt(e.target.value) || 0 })
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

          {/* Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>货物明细</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-2 h-4 w-4" />
                添加行
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 p-4 md:grid-cols-3"
                  >
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <select
                        value={item.sku}
                        onChange={(e) => updateItem(index, 'sku', e.target.value)}
                        className="flex h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {SKUS.map((sku) => (
                          <option key={sku} value={sku}>
                            {sku}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>数量</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.shipped_qty}
                        onChange={(e) =>
                          updateItem(index, 'shipped_qty', parseInt(e.target.value) || 0)
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

              <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
                <div className="text-right">
                  <p className="text-sm text-gray-500">总数量</p>
                  <p className="text-xl font-semibold">{totalQty}</p>
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

          {/* Submit */}
          <div className="flex justify-end space-x-4">
            <Link href="/logistics">
              <Button type="button" variant="outline">
                取消
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? '创建中...' : '创建发运单'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
