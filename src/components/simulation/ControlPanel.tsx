'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Play,
  RotateCcw,
  Zap,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Package,
} from 'lucide-react'
import {
  type ScenarioParameters,
  type SkuTierCode,
  type ShippingMode,
  type CapitalPeriodType,
  DEFAULT_SCENARIO_PARAMS,
  SCENARIO_PRESETS,
} from '@/lib/types/simulation'
import { cn } from '@/lib/utils'

interface ControlPanelProps {
  params: ScenarioParameters
  onParamsChange: (params: ScenarioParameters) => void
  onRunSimulation: () => void
  isLoading: boolean
}

// Slider component (custom since ShadCN slider may not be installed)
function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  className,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
  className?: string
}) {
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          style={{
            background: `linear-gradient(to right, #2563eb 0%, #2563eb ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`,
          }}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatValue ? formatValue(min) : min}</span>
          <span>{formatValue ? formatValue(max) : max}</span>
        </div>
      </div>
    </div>
  )
}

// Switch component (custom toggle)
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}) {
  return (
    <label className="flex items-center cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={cn(
            'w-10 h-6 rounded-full transition-colors',
            checked ? 'bg-blue-600' : 'bg-gray-300'
          )}
        />
        <div
          className={cn(
            'absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </div>
      {label && <span className="ml-3 text-sm text-gray-700">{label}</span>}
    </label>
  )
}

export function ControlPanel({
  params,
  onParamsChange,
  onRunSimulation,
  isLoading,
}: ControlPanelProps) {
  const updateParam = useCallback(
    <K extends keyof ScenarioParameters>(key: K, value: ScenarioParameters[K]) => {
      onParamsChange({ ...params, [key]: value })
    },
    [params, onParamsChange]
  )

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = SCENARIO_PRESETS.find((p) => p.id === presetId)
      if (preset) {
        onParamsChange({
          ...DEFAULT_SCENARIO_PARAMS,
          ...preset.params,
        })
      }
    },
    [onParamsChange]
  )

  const resetToDefaults = useCallback(() => {
    onParamsChange(DEFAULT_SCENARIO_PARAMS)
  }, [onParamsChange])

  const toggleSkuScope = useCallback(
    (tier: SkuTierCode) => {
      const currentScope = params.sku_scope
      if (currentScope.includes(tier)) {
        // Remove tier (but keep at least one)
        if (currentScope.length > 1) {
          updateParam(
            'sku_scope',
            currentScope.filter((t) => t !== tier)
          )
        }
      } else {
        // Add tier
        updateParam('sku_scope', [...currentScope, tier])
      }
    },
    [params.sku_scope, updateParam]
  )

  const presetIcons: Record<string, React.ReactNode> = {
    conservative: <TrendingDown className="h-4 w-4" />,
    aggressive: <TrendingUp className="h-4 w-4" />,
    cash_crunch: <DollarSign className="h-4 w-4" />,
    supply_disruption: <AlertTriangle className="h-4 w-4" />,
    peak_season: <Zap className="h-4 w-4" />,
  }

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Scenario Controls</CardTitle>
        <CardDescription>Configure simulation parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preset Buttons */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Quick Presets</Label>
          <div className="grid grid-cols-2 gap-2">
            {SCENARIO_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset.id)}
                className="justify-start text-xs"
                title={preset.description}
              >
                {presetIcons[preset.id]}
                <span className="ml-1 truncate">{preset.name}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4" />

        {/* Sales Lift Slider */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Sales Lift</Label>
          <Slider
            value={params.sales_lift_percent}
            min={-50}
            max={100}
            step={5}
            onChange={(value) => updateParam('sales_lift_percent', value)}
            formatValue={(v) => `${v > 0 ? '+' : ''}${v}%`}
          />
        </div>

        {/* Shipping Mode Override */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Shipping Mode Override</Label>
          <RadixSelect
            value={params.shipping_mode_override ?? 'none'}
            onValueChange={(value) =>
              updateParam(
                'shipping_mode_override',
                value === 'none' ? null : (value as ShippingMode)
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No Override" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Override</SelectItem>
              <SelectItem value="Sea">Sea Freight (5 weeks)</SelectItem>
              <SelectItem value="Air">Air Freight (1 week)</SelectItem>
              <SelectItem value="Express">Express (3 days)</SelectItem>
            </SelectContent>
          </RadixSelect>
        </div>

        {/* Lead Time Adjustment */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Lead Time Adjustment</Label>
          <Slider
            value={params.production_lead_adjustment_weeks}
            min={-2}
            max={4}
            step={1}
            onChange={(value) => updateParam('production_lead_adjustment_weeks', value)}
            formatValue={(v) => `${v > 0 ? '+' : ''}${v} weeks`}
          />
        </div>

        <div className="border-t border-gray-200 pt-4" />

        {/* Capital Constraint Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Capital Constraint</Label>
            <Switch
              checked={params.capital_constraint_enabled}
              onChange={(checked) => updateParam('capital_constraint_enabled', checked)}
            />
          </div>

          {params.capital_constraint_enabled && (
            <div className="space-y-3 pl-2 border-l-2 border-blue-200">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Budget Cap (USD)</Label>
                <Input
                  type="number"
                  value={params.capital_cap_usd ?? ''}
                  onChange={(e) =>
                    updateParam(
                      'capital_cap_usd',
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  placeholder="e.g., 50000"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Period Type</Label>
                <RadixSelect
                  value={params.capital_period}
                  onValueChange={(value) =>
                    updateParam('capital_period', value as CapitalPeriodType)
                  }
                >
                  <SelectTrigger className="w-full h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </RadixSelect>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 pt-4" />

        {/* SKU Tier Filter */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">SKU Tiers</Label>
          <div className="space-y-2">
            {(['HERO', 'STANDARD', 'ACCESSORY'] as SkuTierCode[]).map((tier) => (
              <Checkbox
                key={tier}
                label={tier}
                checked={params.sku_scope.includes(tier)}
                onChange={() => toggleSkuScope(tier)}
              />
            ))}
          </div>
        </div>

        {/* Time Horizon */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Time Horizon</Label>
          <RadixSelect
            value={String(params.time_horizon_weeks)}
            onValueChange={(value) =>
              updateParam('time_horizon_weeks', Number(value) as 12 | 26 | 52)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12">12 Weeks (Quarter)</SelectItem>
              <SelectItem value="26">26 Weeks (Half Year)</SelectItem>
              <SelectItem value="52">52 Weeks (Full Year)</SelectItem>
            </SelectContent>
          </RadixSelect>
        </div>

        <div className="border-t border-gray-200 pt-4" />

        {/* Action Buttons */}
        <div className="space-y-2">
          <Button
            variant="primary"
            className="w-full"
            onClick={onRunSimulation}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">...</span>
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Simulation
              </>
            )}
          </Button>
          <Button variant="outline" className="w-full" onClick={resetToDefaults}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
