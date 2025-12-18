'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadixSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import HistoricalTrendChart from './historical-trend-chart'
import type { WizardState } from '@/lib/types/forecast-wizard'
import type { WizardAction } from '../wizard-state'
import { getCurrentWeek } from '@/lib/utils/index'

interface Props {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
  products: { sku: string; product_name: string }[]
  channels: { channel_code: string; channel_name: string }[]
}

export default function StepScopeSelector({ state, dispatch, products, channels }: Props) {
  const handleChange = (field: string, value: string | number) => {
    dispatch({
      type: 'UPDATE_FORM_DATA',
      payload: { [field]: value },
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>选择预测范围</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <RadixSelect value={state.formData.sku} onValueChange={(value) => handleChange('sku', value)}>
                <SelectTrigger id="sku">
                  <SelectValue placeholder="选择 SKU" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.sku} value={product.sku}>
                      {product.sku} - {product.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RadixSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="channel">销售渠道</Label>
              <RadixSelect
                value={state.formData.channelCode}
                onValueChange={(value) => handleChange('channelCode', value)}
              >
                <SelectTrigger id="channel">
                  <SelectValue placeholder="选择渠道" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((channel) => (
                    <SelectItem key={channel.channel_code} value={channel.channel_code}>
                      {channel.channel_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RadixSelect>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="startWeek">起始周</Label>
              <Input
                id="startWeek"
                type="text"
                placeholder="例如: 2025-W01"
                value={state.formData.startWeek}
                onChange={(e) => handleChange('startWeek', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                当前周: {getCurrentWeek()}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weekCount">预测周数</Label>
              <Input
                id="weekCount"
                type="number"
                min={4}
                max={24}
                value={state.formData.weekCount}
                onChange={(e) => handleChange('weekCount', parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                范围: 4-24 周
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {state.historicalData.length > 0 && (
        <HistoricalTrendChart data={state.historicalData} />
      )}
    </div>
  )
}
