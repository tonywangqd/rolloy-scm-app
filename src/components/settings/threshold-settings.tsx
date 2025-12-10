'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

interface ThresholdParam {
  key: string
  label: string
  labelEn: string
  value: number
  unit: string
  description: string
}

export function ThresholdSettings() {
  const [params, setParams] = useState<ThresholdParam[]>([
    {
      key: 'variance_alert_threshold_percentage',
      label: '差异预警阈值',
      labelEn: 'Variance Alert Threshold',
      value: 20,
      unit: '%',
      description: '当实际数量与计划数量差异超过此百分比时触发预警',
    },
    {
      key: 'overdue_days_critical',
      label: '逾期天数 - 紧急',
      labelEn: 'Overdue Days - Critical',
      value: 14,
      unit: '天',
      description: '超过预计时间N天标记为紧急优先级 (Critical)',
    },
    {
      key: 'overdue_days_high',
      label: '逾期天数 - 高优先级',
      labelEn: 'Overdue Days - High',
      value: 7,
      unit: '天',
      description: '超过预计时间N天标记为高优先级 (High)',
    },
    {
      key: 'slow_moving_doi_threshold',
      label: '呆滞库存阈值',
      labelEn: 'Slow-Moving DOI Threshold',
      value: 90,
      unit: '天',
      description: '库存周转天数(DOI)超过此阈值标记为呆滞',
    },
  ])

  const handleSave = () => {
    // TODO: Implement save logic
    alert('参数保存成功! (功能待实现)')
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            预警阈值 Alert Thresholds
          </h2>
          <p className="text-sm text-gray-500">
            配置异常检测和预警的阈值参数
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

      {/* Priority Level Preview */}
      <div className="mt-6 rounded-lg bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-900 mb-3">
          优先级判定规则预览:
        </p>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 font-semibold">
              !
            </span>
            <span>
              <strong>紧急 (Critical):</strong> 逾期 ≥ {params[1].value} 天
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-orange-700 font-semibold">
              !
            </span>
            <span>
              <strong>高优先级 (High):</strong> 逾期 ≥ {params[2].value} 天
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 font-semibold">
              !
            </span>
            <span>
              <strong>中优先级 (Medium):</strong> 逾期 &lt; {params[2].value} 天
            </span>
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
