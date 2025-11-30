'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Product, Channel } from '@/lib/types/database'

interface ActualRow {
  id?: string
  sku: string
  channel_code: string
  actual_qty: number
  forecast_qty?: number
  isNew?: boolean
  isModified?: boolean
}

export default function ActualsPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([])
  const [actuals, setActuals] = useState<ActualRow[]>([])

  // Generate week options (past 12 weeks + current week)
  const generateWeekOptions = () => {
    const weeks: string[] = []
    const now = new Date()
    for (let i = -12; i <= 1; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() + i * 7)
      const year = date.getFullYear()
      const startOfYear = new Date(year, 0, 1)
      const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
      const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
      weeks.push(`${year}-W${weekNumber.toString().padStart(2, '0')}`)
    }
    return [...new Set(weeks)]
  }

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const [productsResult, channelsResult, actualsWeeksResult, forecastsWeeksResult] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true).order('sku'),
        supabase.from('channels').select('*').eq('is_active', true).order('channel_code'),
        supabase.from('weekly_sales_actuals').select('year_week').order('year_week', { ascending: false }) as any,
        supabase.from('weekly_sales_forecasts').select('year_week').order('year_week', { ascending: false }) as any,
      ])

      setProducts((productsResult.data || []) as Product[])
      setChannels((channelsResult.data || []) as Channel[])

      // Combine generated weeks with existing weeks
      const generatedWeeks = generateWeekOptions()
      const existingActualWeeks = [...new Set((actualsWeeksResult.data as any[] || []).map((a: any) => a.year_week))]
      const existingForecastWeeks = [...new Set((forecastsWeeksResult.data as any[] || []).map((f: any) => f.year_week))]
      const allWeeks = [...new Set([...generatedWeeks, ...existingActualWeeks, ...existingForecastWeeks])]
        .sort((a, b) => b.localeCompare(a))
      setAvailableWeeks(allWeeks)

      // Set last week as default (most common use case for entering actuals)
      if (!selectedWeek && generatedWeeks.length > 0) {
        const now = new Date()
        const lastWeek = new Date(now)
        lastWeek.setDate(lastWeek.getDate() - 7)
        const year = lastWeek.getFullYear()
        const startOfYear = new Date(year, 0, 1)
        const days = Math.floor((lastWeek.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
        const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
        setSelectedWeek(`${year}-W${weekNumber.toString().padStart(2, '0')}`)
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    if (selectedWeek) {
      loadActuals()
    }
  }, [selectedWeek])

  const loadActuals = async () => {
    if (!selectedWeek) return

    setLoading(true)
    const supabase = createClient()

    // Load both actuals and forecasts for comparison
    const [actualsResult, forecastsResult] = await Promise.all([
      supabase
        .from('weekly_sales_actuals')
        .select('*')
        .eq('year_week', selectedWeek)
        .order('sku')
        .order('channel_code') as any,
      supabase
        .from('weekly_sales_forecasts')
        .select('*')
        .eq('year_week', selectedWeek) as any,
    ])

    if (actualsResult.error) {
      console.error('Error loading actuals:', actualsResult.error)
      setMessage('加载失败')
      setLoading(false)
      return
    }

    // Create forecast map
    const forecastMap = new Map(
      ((forecastsResult.data || []) as any[]).map((f: any) => [`${f.sku}-${f.channel_code}`, f.forecast_qty])
    )

    // If we have actuals, use them
    if (actualsResult.data && actualsResult.data.length > 0) {
      setActuals(
        (actualsResult.data as any[]).map((a: any) => ({
          id: a.id,
          sku: a.sku,
          channel_code: a.channel_code,
          actual_qty: a.actual_qty,
          forecast_qty: forecastMap.get(`${a.sku}-${a.channel_code}`),
        }))
      )
    } else if (forecastsResult.data && forecastsResult.data.length > 0) {
      // If no actuals but we have forecasts, pre-populate with forecast structure
      setActuals(
        (forecastsResult.data as any[]).map((f: any) => ({
          sku: f.sku,
          channel_code: f.channel_code,
          actual_qty: 0,
          forecast_qty: f.forecast_qty,
          isNew: true,
        }))
      )
    } else {
      setActuals([])
    }

    setLoading(false)
  }

  const addRow = () => {
    if (products.length === 0 || channels.length === 0) return

    setActuals([
      ...actuals,
      {
        sku: products[0].sku,
        channel_code: channels[0].channel_code,
        actual_qty: 0,
        isNew: true,
      },
    ])
  }

  const removeRow = (index: number) => {
    setActuals(actuals.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, field: keyof ActualRow, value: string | number) => {
    const newActuals = [...actuals]
    newActuals[index] = {
      ...newActuals[index],
      [field]: value,
      isModified: true,
    }
    setActuals(newActuals)
  }

  const saveActuals = async () => {
    if (!selectedWeek) return

    setSaving(true)
    setMessage('')

    const supabase = createClient()

    // Prepare data for upsert
    const dataToSave = actuals.map((a) => ({
      year_week: selectedWeek,
      sku: a.sku,
      channel_code: a.channel_code,
      actual_qty: a.actual_qty,
    }))

    const { error } = await (supabase
      .from('weekly_sales_actuals') as any)
      .upsert(dataToSave, {
        onConflict: 'year_week,sku,channel_code',
      })

    if (error) {
      setMessage(`保存失败: ${error.message}`)
    } else {
      setMessage('保存成功')
      // Reload to get IDs
      await loadActuals()
    }

    setSaving(false)
  }

  const totalActual = actuals.reduce((sum, a) => sum + a.actual_qty, 0)
  const totalForecast = actuals.reduce((sum, a) => sum + (a.forecast_qty || 0), 0)
  const variance = totalActual - totalForecast
  const variancePct = totalForecast > 0 ? (variance / totalForecast) * 100 : 0

  return (
    <div className="flex flex-col">
      <Header title="实际销量录入" description="录入周度实际销量数据" />

      <div className="flex-1 space-y-6 p-6">
        {/* Back Button */}
        <Link href="/planning">
          <Button variant="ghost" type="button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回计划
          </Button>
        </Link>

        {message && (
          <div className={`rounded-lg p-4 text-sm ${message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {message}
          </div>
        )}

        {/* Week Selection */}
        <Card>
          <CardHeader>
            <CardTitle>选择周次</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="week">周次</Label>
              <Select
                id="week"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="max-w-xs"
              >
                <option value="">选择周次</option>
                {availableWeeks.map((week) => (
                  <option key={week} value={week}>
                    {week}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Actuals Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>销量明细</CardTitle>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4" />
                添加行
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={saveActuals}
                disabled={saving || actuals.length === 0}
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                加载中...
              </div>
            ) : actuals.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无数据，点击"添加行"开始录入
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead className="text-right">预测数量</TableHead>
                    <TableHead className="text-right">实际数量</TableHead>
                    <TableHead className="text-right">偏差</TableHead>
                    <TableHead className="w-16">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actuals.map((row, index) => {
                    const rowVariance = row.actual_qty - (row.forecast_qty || 0)
                    const rowVariancePct = row.forecast_qty ? (rowVariance / row.forecast_qty) * 100 : 0

                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            value={row.sku}
                            onChange={(e) => updateRow(index, 'sku', e.target.value)}
                          >
                            {products.map((p) => (
                              <option key={p.sku} value={p.sku}>
                                {p.sku} - {p.product_name}
                              </option>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.channel_code}
                            onChange={(e) => updateRow(index, 'channel_code', e.target.value)}
                          >
                            {channels.map((c) => (
                              <option key={c.channel_code} value={c.channel_code}>
                                {c.channel_name}
                              </option>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell className="text-right text-gray-500">
                          {row.forecast_qty?.toLocaleString() || '-'}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={row.actual_qty}
                            onChange={(e) => updateRow(index, 'actual_qty', parseInt(e.target.value) || 0)}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {row.forecast_qty !== undefined ? (
                            <span className={rowVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {rowVariance >= 0 ? '+' : ''}{rowVariance.toLocaleString()}
                              <span className="ml-1 text-xs">
                                ({rowVariancePct >= 0 ? '+' : ''}{rowVariancePct.toFixed(0)}%)
                              </span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRow(index)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}

            {actuals.length > 0 && (
              <div className="mt-4 flex justify-end gap-8 border-t border-gray-200 pt-4">
                <div className="text-right">
                  <p className="text-sm text-gray-500">预测总量</p>
                  <p className="text-lg font-semibold text-gray-600">{totalForecast.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">实际总量</p>
                  <p className="text-xl font-semibold">{totalActual.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">总偏差</p>
                  <p className={`text-lg font-semibold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {variance >= 0 ? '+' : ''}{variance.toLocaleString()}
                    <span className="ml-1 text-sm">
                      ({variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%)
                    </span>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
