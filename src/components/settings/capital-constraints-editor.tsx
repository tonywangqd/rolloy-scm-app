'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addMonths, startOfMonth } from 'date-fns'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { DollarSign, Calendar, Loader2, Save } from 'lucide-react'
import { useToast } from '@/lib/hooks/use-toast'
import { ToastContainer } from '@/components/ui/toast'
import {
  getCapitalConstraints,
  upsertCapitalConstraint,
} from '@/lib/actions/constraints'

// Type definitions - matching the database schema
export interface CapitalConstraint {
  id?: string
  period_type: 'monthly' | 'quarterly'
  period_key: string // YYYY-MM format
  budget_cap_usd: number
  is_active: boolean
  notes?: string | null
}

interface MonthData {
  period_key: string
  label: string
  budget_cap_usd: number | null
  is_active: boolean
  isDirty: boolean
}

export function CapitalConstraintsEditor() {
  const [months, setMonths] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const { toasts, showToast, dismissToast } = useToast()

  // Generate next 12 months
  const generateMonths = useCallback((constraints: CapitalConstraint[]) => {
    const constraintMap = new Map(
      constraints.map((c) => [c.period_key, c])
    )

    const today = startOfMonth(new Date())
    const monthsData: MonthData[] = []

    for (let i = 0; i < 12; i++) {
      const date = addMonths(today, i)
      const periodKey = format(date, 'yyyy-MM')
      const existing = constraintMap.get(periodKey)

      monthsData.push({
        period_key: periodKey,
        label: format(date, 'MMM yyyy'),
        budget_cap_usd: existing?.budget_cap_usd ?? null,
        is_active: existing?.is_active ?? true,
        isDirty: false,
      })
    }

    return monthsData
  }, [])

  // Load data on mount
  useEffect(() => {
    async function loadConstraints() {
      try {
        setLoading(true)
        const result = await getCapitalConstraints()
        if (result.success && result.data) {
          setMonths(generateMonths(result.data))
        } else {
          // Even if no data, generate empty months
          setMonths(generateMonths([]))
          if (result.error) {
            showToast(result.error, 'error')
          }
        }
      } catch (error) {
        setMonths(generateMonths([]))
        showToast('Failed to load capital constraints', 'error')
      } finally {
        setLoading(false)
      }
    }
    loadConstraints()
  }, [generateMonths])

  // Calculate summary stats
  const summary = useMemo(() => {
    const activeMonths = months.filter((m) => m.is_active && m.budget_cap_usd !== null)
    const totalBudget = activeMonths.reduce((sum, m) => sum + (m.budget_cap_usd || 0), 0)
    const monthsWithCaps = activeMonths.length
    const avgMonthly = monthsWithCaps > 0 ? totalBudget / monthsWithCaps : 0

    return {
      totalBudget,
      monthsWithCaps,
      avgMonthly,
    }
  }, [months])

  // Handle budget change
  function handleBudgetChange(periodKey: string, value: string) {
    const numValue = value === '' ? null : parseFloat(value)
    setMonths((prev) =>
      prev.map((m) =>
        m.period_key === periodKey
          ? { ...m, budget_cap_usd: numValue, isDirty: true }
          : m
      )
    )
  }

  // Handle active toggle
  function handleActiveToggle(periodKey: string, isActive: boolean) {
    setMonths((prev) =>
      prev.map((m) =>
        m.period_key === periodKey
          ? { ...m, is_active: isActive, isDirty: true }
          : m
      )
    )
  }

  // Save a single month's constraint
  async function handleSave(month: MonthData) {
    if (month.budget_cap_usd === null) {
      showToast('Please enter a budget cap value', 'error')
      return
    }
    try {
      setSavingKey(month.period_key)
      const result = await upsertCapitalConstraint({
        period_type: 'monthly',
        period_key: month.period_key,
        budget_cap_usd: month.budget_cap_usd,
        is_active: month.is_active,
      })

      if (result.success) {
        setMonths((prev) =>
          prev.map((m) =>
            m.period_key === month.period_key ? { ...m, isDirty: false } : m
          )
        )
        showToast(`Saved ${month.label} constraint`, 'success')
      } else {
        showToast(result.error || 'Failed to save constraint', 'error')
      }
    } catch (error) {
      showToast('Failed to save constraint', 'error')
    } finally {
      setSavingKey(null)
    }
  }

  // Save all dirty months
  async function handleSaveAll() {
    const dirtyMonths = months.filter((m) => m.isDirty)
    if (dirtyMonths.length === 0) {
      showToast('No changes to save', 'info')
      return
    }

    setSavingKey('all')
    let successCount = 0
    let errorCount = 0

    for (const month of dirtyMonths) {
      if (month.budget_cap_usd === null) continue
      try {
        const result = await upsertCapitalConstraint({
          period_type: 'monthly',
          period_key: month.period_key,
          budget_cap_usd: month.budget_cap_usd,
          is_active: month.is_active,
        })
        if (result.success) {
          successCount++
          setMonths((prev) =>
            prev.map((m) =>
              m.period_key === month.period_key ? { ...m, isDirty: false } : m
            )
          )
        } else {
          errorCount++
        }
      } catch {
        errorCount++
      }
    }

    setSavingKey(null)

    if (errorCount === 0) {
      showToast(`Saved ${successCount} constraint${successCount > 1 ? 's' : ''}`, 'success')
    } else if (successCount > 0) {
      showToast(`Saved ${successCount}, failed ${errorCount}`, 'error')
    } else {
      showToast('Failed to save constraints', 'error')
    }
  }

  // Check if any month is dirty
  const hasDirtyMonths = months.some((m) => m.isDirty)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Capital Constraints</CardTitle>
          <CardDescription>Set monthly procurement budget caps</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading constraints...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Capital Constraints</CardTitle>
            <CardDescription>Set monthly procurement budget caps</CardDescription>
          </div>
          {hasDirtyMonths && (
            <Button onClick={handleSaveAll} disabled={savingKey === 'all'}>
              {savingKey === 'all' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save All Changes
                </>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-500 p-2">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Total Budget</p>
                    <p className="text-xl font-bold text-blue-900">
                      ${summary.totalBudget.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-500 p-2">
                    <Calendar className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-green-600 font-medium">Months with Caps</p>
                    <p className="text-xl font-bold text-green-900">
                      {summary.monthsWithCaps}/12
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-purple-500 p-2">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-purple-600 font-medium">Avg Monthly Cap</p>
                    <p className="text-xl font-bold text-purple-900">
                      ${Math.round(summary.avgMonthly).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {months.map((month) => (
              <Card
                key={month.period_key}
                className={`transition-all ${
                  month.isDirty
                    ? 'ring-2 ring-blue-500 ring-offset-1'
                    : month.is_active
                    ? 'border-gray-200'
                    : 'border-gray-100 bg-gray-50 opacity-75'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{month.label}</span>
                      {month.isDirty && (
                        <Badge className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                          Unsaved
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={month.is_active}
                      onCheckedChange={(checked) =>
                        handleActiveToggle(month.period_key, checked)
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">$</span>
                    <Input
                      type="number"
                      value={month.budget_cap_usd ?? ''}
                      onChange={(e) =>
                        handleBudgetChange(month.period_key, e.target.value)
                      }
                      placeholder="No limit"
                      className="flex-1"
                      disabled={!month.is_active}
                      min={0}
                      step={1000}
                    />
                    {month.isDirty && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSave(month)}
                        disabled={savingKey === month.period_key || savingKey === 'all'}
                        className="px-2"
                      >
                        {savingKey === month.period_key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  {month.budget_cap_usd !== null && month.is_active && (
                    <p className="text-xs text-gray-500 mt-2">
                      Budget cap active for {month.label}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
