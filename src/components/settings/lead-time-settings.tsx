'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Save, Info } from 'lucide-react'

interface LeadTimeParam {
  key: string
  label: string
  labelEn: string
  value: number
  unit: string
  description: string
}

export function LeadTimeSettings() {
  const [params, setParams] = useState<LeadTimeParam[]>([
    {
      key: 'default_production_lead_weeks',
      label: '生产周期',
      labelEn: 'Production Lead Weeks',
      value: 5,
      unit: '周',
      description: 'PO下单到OF完工的默认周期 (可在产品主数据中覆盖)',
    },
    {
      key: 'default_loading_buffer_weeks',
      label: '订舱缓冲',
      labelEn: 'Loading Buffer Weeks',
      value: 1,
      unit: '周',
      description: 'OF完工到OS发货的缓冲时间',
    },
    {
      key: 'default_transit_time_weeks',
      label: '物流周期',
      labelEn: 'Transit Time Weeks',
      value: 5,
      unit: '周',
      description: 'OS发货到OA到仓的物流时间',
    },
    {
      key: 'default_inbound_buffer_weeks',
      label: '上架缓冲',
      labelEn: 'Inbound Buffer Weeks',
      value: 2,
      unit: '周',
      description: 'OA到仓到库存可用的上架时间',
    },
    {
      key: 'default_safety_stock_weeks',
      label: '安全库存周数',
      labelEn: 'Safety Stock Weeks',
      value: 2,
      unit: '周',
      description: '最小库存缓冲,用于库存健康度判定',
    },
  ])

  const handleSave = () => {
    // TODO: Implement save logic
    alert('参数保存成功! (功能待实现)')
  }

  const totalLeadTime = params
    .slice(0, 4)
    .reduce((sum, param) => sum + param.value, 0)

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            供应链周期参数 Supply Chain Lead Times
          </h2>
          <p className="text-sm text-gray-500">
            配置倒排排程算法的时间参数
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {params.map((param) => (
          <div key={param.key} className="flex items-start gap-4 border-b border-gray-100 pb-4 last:border-0">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-900">
                  {param.label}
                </label>
                <span className="text-sm text-gray-500">
                  {param.labelEn}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {param.description}
              </p>
            </div>
            <div className="flex w-32 items-center gap-2">
              <input
                type="number"
                value={param.value}
                onChange={(e) => {
                  const newParams = params.map((p) =>
                    p.key === param.key
                      ? { ...p, value: parseInt(e.target.value) || 0 }
                      : p
                  )
                  setParams(newParams)
                }}
                className="h-9 w-16 rounded-lg border border-gray-200 bg-white px-3 text-center text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                min="0"
              />
              <span className="text-sm text-gray-600">{param.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Total Lead Time Calculation */}
      <div className="mt-6 rounded-lg bg-blue-50 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">
              总供应链周期: {totalLeadTime} 周
            </p>
            <p className="mt-1 text-xs text-blue-700">
              从PO下单到库存可用需要 {totalLeadTime} 周时间
              ({params.slice(0, 4).map(p => p.value).join(' + ')} = {totalLeadTime} 周)
            </p>
            <p className="mt-2 text-xs text-gray-600">
              示例: 若要在 2025-W50 有库存可售,需在 W{50 - totalLeadTime} 下单
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline">
          重置为默认值
        </Button>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          保存参数
        </Button>
      </div>
    </Card>
  )
}
