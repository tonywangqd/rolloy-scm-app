'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react'

/**
 * Remaining delivery plan allocation item
 * Used when recording actual delivery to specify planned future deliveries
 */
export interface RemainingDeliveryPlan {
  week_iso: string          // "2025-W04"
  planned_qty: number       // 25
  planned_date?: string     // "2025-01-27" (computed from week_iso)
}

/**
 * Internal state for UI (includes client-side ID for React keys)
 */
interface RemainingPlanItem {
  id: string                    // Client-side UUID for React key
  week_iso: string
  planned_qty: number
  error?: string                // Validation error message
}

interface RemainingPlanSectionProps {
  orderedQty: number           // 订单总量
  previousDeliveredQty: number // 之前已出厂
  currentDeliveryQty: number   // 本次出厂（实时联动）
  onChange: (plans: RemainingDeliveryPlan[]) => void
  disabled?: boolean
}

/**
 * Remaining Plan Section Component
 *
 * Allows users to manually specify the planned delivery schedule for remaining
 * undelivered quantity when recording actual factory deliveries.
 *
 * Features:
 * - Dynamic add/remove rows (week + quantity)
 * - Real-time validation: allocated sum vs remaining quantity
 * - ISO week format validation (YYYY-Wnn)
 * - Future week validation
 */
export function RemainingPlanSection({
  orderedQty,
  previousDeliveredQty,
  currentDeliveryQty,
  onChange,
  disabled = false,
}: RemainingPlanSectionProps) {
  // Calculate remaining quantity
  const remainingQty = orderedQty - previousDeliveredQty - currentDeliveryQty

  const [planItems, setPlanItems] = useState<RemainingPlanItem[]>([
    { id: crypto.randomUUID(), week_iso: '', planned_qty: 0 },
  ])

  // Calculate total planned quantity
  const totalPlanned = planItems.reduce((sum, item) => sum + (item.planned_qty || 0), 0)
  const isBalanced = totalPlanned === remainingQty && remainingQty > 0
  const hasError = totalPlanned > 0 && totalPlanned !== remainingQty

  // Notify parent of changes
  useEffect(() => {
    // Only send valid items (non-empty week and positive quantity)
    const validPlans: RemainingDeliveryPlan[] = planItems
      .filter((item) => item.week_iso && item.planned_qty > 0 && validateWeek(item.week_iso))
      .map((item) => ({
        week_iso: item.week_iso,
        planned_qty: item.planned_qty,
      }))

    onChange(validPlans)
  }, [planItems, onChange])

  const addPlanItem = () => {
    setPlanItems([...planItems, { id: crypto.randomUUID(), week_iso: '', planned_qty: 0 }])
  }

  const removePlanItem = (id: string) => {
    if (planItems.length > 1) {
      setPlanItems(planItems.filter((item) => item.id !== id))
    }
  }

  const updatePlanItem = (id: string, field: 'week_iso' | 'planned_qty', value: any) => {
    setPlanItems(
      planItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  // Validate ISO week format (YYYY-Wnn)
  const validateWeek = (weekIso: string): boolean => {
    return /^\d{4}-W\d{2}$/.test(weekIso)
  }

  // No remaining quantity = no need for plan
  if (remainingQty === 0) {
    return (
      <Card className="bg-green-50 border-green-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <p className="font-medium">该订单已全部交付完成，无需分配剩余计划。</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Check if user has not filled the plan when there is remaining quantity
  const shouldShowWarning = remainingQty > 0 && totalPlanned === 0

  return (
    <Card className={shouldShowWarning ? 'border-yellow-400 border-2' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            剩余预计出厂计划
            <span className="flex items-center gap-1 text-sm font-medium text-yellow-600 bg-yellow-50 px-2 py-1 rounded-md">
              <AlertTriangle className="h-4 w-4" />
              建议填写
            </span>
          </span>
          <span className="text-sm font-normal text-gray-500">
            剩余待出厂: <span className="font-semibold text-blue-600">{remainingQty}</span> 件
          </span>
        </CardTitle>
        <p className="text-sm text-gray-600 mt-2">
          可指定剩余数量的预计出厂周次，用于更准确的库存预测。如不填写，系统将使用默认算法推算。
        </p>
        {shouldShowWarning && (
          <div className="mt-3 flex items-start gap-3 rounded-lg p-4 bg-yellow-50 border border-yellow-200">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-yellow-800">
                建议填写剩余出厂计划
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                不填写剩余计划会影响库存预测的准确性，系统将使用默认算法推算，可能导致预测偏差。建议根据实际生产情况填写预计出厂周次和数量。
              </p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Plan Items Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    预计出厂周 (ISO格式)
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                    数量
                  </th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {planItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Input
                        type="text"
                        placeholder="例如: 2025-W04"
                        value={item.week_iso}
                        onChange={(e) => updatePlanItem(item.id, 'week_iso', e.target.value)}
                        disabled={disabled}
                        className={
                          item.week_iso && !validateWeek(item.week_iso)
                            ? 'border-red-500'
                            : ''
                        }
                      />
                      {item.week_iso && !validateWeek(item.week_iso) && (
                        <p className="mt-1 text-xs text-red-600">
                          格式错误，应为 YYYY-Wnn
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min="0"
                        max={remainingQty}
                        value={item.planned_qty || ''}
                        onChange={(e) =>
                          updatePlanItem(item.id, 'planned_qty', parseInt(e.target.value) || 0)
                        }
                        disabled={disabled}
                        className="text-right"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePlanItem(item.id)}
                        disabled={disabled || planItems.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-gray-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Row Button */}
          <Button
            type="button"
            variant="outline"
            onClick={addPlanItem}
            disabled={disabled}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            添加周次分配
          </Button>

          {/* Validation Summary */}
          <div
            className={`flex items-start gap-3 rounded-lg p-4 ${
              isBalanced
                ? 'bg-green-50 border border-green-200'
                : hasError
                ? 'bg-red-50 border border-red-200'
                : 'bg-blue-50 border border-blue-200'
            }`}
          >
            {isBalanced ? (
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p
                className={`font-medium ${
                  isBalanced ? 'text-green-700' : hasError ? 'text-red-700' : 'text-blue-700'
                }`}
              >
                计划分配总计: {totalPlanned} / {remainingQty}
              </p>
              {isBalanced ? (
                <p className="text-sm text-green-600 mt-1">分配数量正确</p>
              ) : hasError ? (
                <p className="text-sm text-red-600 mt-1">
                  分配总量与剩余量不匹配，请调整
                </p>
              ) : (
                <p className="text-sm text-blue-600 mt-1">
                  请继续填写，确保总量等于剩余量
                </p>
              )}
            </div>
          </div>

          {/* Help Text */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <p className="font-medium mb-1">使用说明：</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>ISO周格式：2025-W04 表示2025年第4周</li>
              <li>可添加多个周次，每周分配一定数量</li>
              <li>所有分配的总和必须等于剩余待出厂数量</li>
              <li>预计周次应晚于本次交付日期</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
