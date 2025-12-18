'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadixSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ForecastSuggestion } from '@/lib/types/forecast-wizard'
import type { WizardAction } from '../wizard-state'

interface TimelineEditorProps {
  values: ForecastSuggestion[]
  onChange: (updatedValues: ForecastSuggestion[]) => void
  historicalAvg: number
}

function TimelineEditor({ values, onChange, historicalAvg }: TimelineEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const handleCellChange = (index: number, newValue: number) => {
    const updated = [...values]
    updated[index].forecast_qty = Math.max(0, Math.round(newValue))
    onChange(updated)
    setEditingIndex(null)
  }

  const getVarianceColor = (value: number, historicalAvg: number): string => {
    if (historicalAvg === 0) return 'bg-gray-100'
    const variance = Math.abs(value - historicalAvg) / historicalAvg
    if (variance > 0.5) return 'bg-red-100 border-red-300'
    if (variance > 0.3) return 'bg-yellow-100 border-yellow-300'
    return 'bg-green-100 border-green-300'
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 pb-4 min-w-max">
        {values.map((item, index) => (
          <div key={item.week_iso} className="flex flex-col items-center min-w-[90px]">
            <div className="text-xs text-muted-foreground mb-1 font-medium">{item.week_iso}</div>
            {editingIndex === index ? (
              <Input
                type="number"
                value={item.forecast_qty}
                onChange={(e) => handleCellChange(index, parseFloat(e.target.value))}
                onBlur={() => setEditingIndex(null)}
                className="w-full text-center"
                autoFocus
              />
            ) : (
              <div
                className={`w-full px-3 py-2 text-center rounded border-2 cursor-pointer hover:ring-2 hover:ring-primary transition-all ${getVarianceColor(
                  item.forecast_qty,
                  historicalAvg
                )}`}
                onClick={() => setEditingIndex(index)}
              >
                <div className="font-semibold">{item.forecast_qty}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface BulkOperationsPanelProps {
  weekOptions: string[]
  onApply: (operation: { type: 'multiply' | 'add' | 'set'; value: number; fromWeek: string; toWeek: string }) => void
}

function BulkOperationsPanel({ weekOptions, onApply }: BulkOperationsPanelProps) {
  const [operationType, setOperationType] = useState<'multiply' | 'add' | 'set'>('multiply')
  const [operationValue, setOperationValue] = useState<number>(1)
  const [fromWeek, setFromWeek] = useState<string>('')
  const [toWeek, setToWeek] = useState<string>('')

  const handleApply = () => {
    if (!fromWeek || !toWeek || !operationValue) return
    onApply({ type: operationType, value: operationValue, fromWeek, toWeek })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">批量操作</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>起始周</Label>
            <RadixSelect value={fromWeek} onValueChange={setFromWeek}>
              <SelectTrigger>
                <SelectValue placeholder="选择起始周" />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((week) => (
                  <SelectItem key={week} value={week}>
                    {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </RadixSelect>
          </div>

          <div className="space-y-2">
            <Label>结束周</Label>
            <RadixSelect value={toWeek} onValueChange={setToWeek}>
              <SelectTrigger>
                <SelectValue placeholder="选择结束周" />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((week) => (
                  <SelectItem key={week} value={week}>
                    {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </RadixSelect>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>操作类型</Label>
            <RadixSelect value={operationType} onValueChange={(value: any) => setOperationType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multiply">乘以</SelectItem>
                <SelectItem value="add">加上</SelectItem>
                <SelectItem value="set">设为</SelectItem>
              </SelectContent>
            </RadixSelect>
          </div>

          <div className="space-y-2">
            <Label>
              {operationType === 'multiply' ? '倍数' : operationType === 'add' ? '数量' : '目标值'}
            </Label>
            <Input
              type="number"
              step={operationType === 'multiply' ? '0.01' : '1'}
              value={operationValue}
              onChange={(e) => setOperationValue(parseFloat(e.target.value))}
            />
          </div>
        </div>

        <Button onClick={handleApply} className="w-full">
          应用批量操作
        </Button>
      </CardContent>
    </Card>
  )
}

interface Props {
  forecastValues: ForecastSuggestion[]
  dispatch: React.Dispatch<WizardAction>
  historicalAvg: number
}

export default function StepBulkAdjustment({ forecastValues, dispatch, historicalAvg }: Props) {
  const handleTimelineChange = (updatedValues: ForecastSuggestion[]) => {
    dispatch({
      type: 'SET_FORECAST_VALUES',
      payload: updatedValues,
    })
  }

  const handleBulkOperation = (operation: {
    type: 'multiply' | 'add' | 'set'
    value: number
    fromWeek: string
    toWeek: string
  }) => {
    const updated = forecastValues.map((item) => {
      const isInRange =
        item.week_iso >= operation.fromWeek && item.week_iso <= operation.toWeek

      if (!isInRange) return item

      let newQty = item.forecast_qty
      if (operation.type === 'multiply') {
        newQty = Math.round(item.forecast_qty * operation.value)
      } else if (operation.type === 'add') {
        newQty = item.forecast_qty + Math.round(operation.value)
      } else if (operation.type === 'set') {
        newQty = Math.round(operation.value)
      }

      return { ...item, forecast_qty: Math.max(0, newQty) }
    })

    dispatch({
      type: 'SET_FORECAST_VALUES',
      payload: updated,
    })
  }

  const weekOptions = forecastValues.map((f) => f.week_iso)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">调整预测值</h2>
        <p className="text-muted-foreground">
          点击周次单元格可直接编辑，或使用批量操作工具
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>预测时间轴</CardTitle>
          <div className="text-sm text-muted-foreground">
            颜色说明: <span className="text-green-600">绿色 = 正常</span> | <span className="text-yellow-600">黄色 = 波动 30%+</span> | <span className="text-red-600">红色 = 波动 50%+</span>
          </div>
        </CardHeader>
        <CardContent>
          <TimelineEditor
            values={forecastValues}
            onChange={handleTimelineChange}
            historicalAvg={historicalAvg}
          />
        </CardContent>
      </Card>

      <BulkOperationsPanel weekOptions={weekOptions} onApply={handleBulkOperation} />
    </div>
  )
}
