'use client'

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import MethodPreviewChart from './method-preview-chart'
import type { ForecastMethod, ForecastSuggestion } from '@/lib/types/forecast-wizard'
import type { WizardAction } from '../wizard-state'

interface MethodCardProps {
  method: ForecastMethod
  title: string
  description: string
  previewData: ForecastSuggestion[]
  averageValue: number
  confidenceLevel: 'high' | 'medium' | 'low'
  isSelected: boolean
  onSelect: () => void
  showCustomInput?: boolean
  customValue?: number
  onCustomValueChange?: (value: number) => void
}

function MethodCard({
  method,
  title,
  description,
  previewData,
  averageValue,
  confidenceLevel,
  isSelected,
  onSelect,
  showCustomInput,
  customValue,
  onCustomValueChange,
}: MethodCardProps) {
  const confidenceColors = {
    high: 'text-green-600',
    medium: 'text-yellow-600',
    low: 'text-red-600',
  }

  const confidenceLabels = {
    high: '高',
    medium: '中',
    low: '低',
  }

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onClick={onSelect}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div
            className={`w-6 h-6 rounded-full border-2 transition-colors ${
              isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
            }`}
          >
            {isSelected && <div className="w-full h-full flex items-center justify-center text-white text-xs">✓</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showCustomInput && (
          <div className="space-y-2">
            <Label>自定义基准值</Label>
            <Input
              type="number"
              placeholder="输入基准销量"
              value={customValue || ''}
              onChange={(e) => onCustomValueChange?.(parseInt(e.target.value) || 0)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        <MethodPreviewChart data={previewData} />

        <div className="flex items-center justify-between text-sm">
          <span>
            平均预测: <strong>{Math.round(averageValue)}</strong>
          </span>
          <span className={confidenceColors[confidenceLevel]}>
            置信度: {confidenceLabels[confidenceLevel]}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

interface Props {
  dispatch: React.Dispatch<WizardAction>
  selectedMethod: ForecastMethod | null
  customBaseline?: number
  movingAverageData: { data: ForecastSuggestion[]; average: number }
  yearOverYearData: { data: ForecastSuggestion[]; average: number }
  customData: { data: ForecastSuggestion[]; average: number }
}

export default function StepMethodSelector({
  dispatch,
  selectedMethod,
  customBaseline,
  movingAverageData,
  yearOverYearData,
  customData,
}: Props) {
  const handleMethodSelect = (method: ForecastMethod) => {
    dispatch({
      type: 'UPDATE_FORM_DATA',
      payload: { selectedMethod: method },
    })
  }

  const handleCustomBaselineChange = (value: number) => {
    dispatch({
      type: 'UPDATE_FORM_DATA',
      payload: { customBaseline: value },
    })
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">选择预测方法</h2>
        <p className="text-muted-foreground">
          根据历史数据和业务需求，选择最适合的预测算法
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MethodCard
          method="moving_average"
          title="移动平均"
          description="基于过去 4 周的平均销量"
          previewData={movingAverageData.data}
          averageValue={movingAverageData.average}
          confidenceLevel="high"
          isSelected={selectedMethod === 'moving_average'}
          onSelect={() => handleMethodSelect('moving_average')}
        />

        <MethodCard
          method="year_over_year"
          title="同比增长"
          description="基于去年同期增长率"
          previewData={yearOverYearData.data}
          averageValue={yearOverYearData.average}
          confidenceLevel="medium"
          isSelected={selectedMethod === 'year_over_year'}
          onSelect={() => handleMethodSelect('year_over_year')}
        />

        <MethodCard
          method="custom"
          title="自定义基准"
          description="手动设置预测基准值"
          previewData={customData.data}
          averageValue={customData.average}
          confidenceLevel="low"
          isSelected={selectedMethod === 'custom'}
          onSelect={() => handleMethodSelect('custom')}
          showCustomInput
          customValue={customBaseline}
          onCustomValueChange={handleCustomBaselineChange}
        />
      </div>
    </div>
  )
}
