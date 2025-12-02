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
import { ArrowLeft, Save, Copy, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Product, Channel, WeeklySalesForecast } from '@/lib/types/database'
import { getCurrentWeek, addWeeksToWeekString } from '@/lib/utils/date'

interface ForecastRow {
  id?: string
  sku: string
  channel_code: string
  forecast_qty: number
  isNew?: boolean
  isModified?: boolean
}

export default function ForecastsPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([])
  const [forecasts, setForecasts] = useState<ForecastRow[]>([])

  // Generate week options (past 4 weeks + current week + next 12 weeks = 17 weeks)
  const generateWeekOptions = () => {
    const weeks: string[] = []
    const currentWeek = getCurrentWeek()

    for (let i = -4; i <= 12; i++) {
      const week = addWeeksToWeekString(currentWeek, i)
      if (week) {
        weeks.push(week)
      }
    }
    return weeks
  }

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const [productsResult, channelsResult, forecastWeeksResult] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true).order('sku'),
        supabase.from('channels').select('*').eq('is_active', true).order('channel_code'),
        supabase.from('weekly_sales_forecasts').select('year_week').order('year_week', { ascending: false }) as any,
      ])

      setProducts((productsResult.data || []) as Product[])
      setChannels((channelsResult.data || []) as Channel[])

      // Combine generated weeks with existing forecast weeks
      const generatedWeeks = generateWeekOptions()
      const existingWeeks = [...new Set((forecastWeeksResult.data as any[] || []).map((f: any) => f.year_week))]
      const allWeeks = [...new Set([...generatedWeeks, ...existingWeeks])].sort((a, b) => b.localeCompare(a))
      setAvailableWeeks(allWeeks)

      // Set current week as default
      if (!selectedWeek && generatedWeeks.length > 0) {
        setSelectedWeek(getCurrentWeek())
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    if (selectedWeek) {
      loadForecasts()
    }
  }, [selectedWeek])

  const loadForecasts = async () => {
    if (!selectedWeek) return

    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('weekly_sales_forecasts')
      .select('*')
      .eq('year_week', selectedWeek)
      .order('sku')
      .order('channel_code') as any

    if (error) {
      console.error('Error loading forecasts:', error)
      setMessage('加载失败')
    } else {
      setForecasts(
        ((data || []) as any[]).map((f: any) => ({
          id: f.id,
          sku: f.sku,
          channel_code: f.channel_code,
          forecast_qty: f.forecast_qty,
        }))
      )
    }

    setLoading(false)
  }

  const addRow = () => {
    if (products.length === 0 || channels.length === 0) return

    setForecasts([
      ...forecasts,
      {
        sku: products[0].sku,
        channel_code: channels[0].channel_code,
        forecast_qty: 0,
        isNew: true,
      },
    ])
  }

  const removeRow = (index: number) => {
    setForecasts(forecasts.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, field: keyof ForecastRow, value: string | number) => {
    const newForecasts = [...forecasts]
    newForecasts[index] = {
      ...newForecasts[index],
      [field]: value,
      isModified: true,
    }
    setForecasts(newForecasts)
  }

  const saveForecasts = async () => {
    if (!selectedWeek) return

    setSaving(true)
    setMessage('')

    const supabase = createClient()

    // Prepare data for upsert
    const dataToSave = forecasts.map((f) => ({
      year_week: selectedWeek,
      sku: f.sku,
      channel_code: f.channel_code,
      forecast_qty: f.forecast_qty,
    }))

    const { error } = await (supabase
      .from('weekly_sales_forecasts') as any)
      .upsert(dataToSave, {
        onConflict: 'year_week,sku,channel_code',
      })

    if (error) {
      setMessage(`保存失败: ${error.message}`)
    } else {
      setMessage('保存成功')
      // Reload to get IDs
      await loadForecasts()
    }

    setSaving(false)
  }

  const copyFromWeek = async (fromWeek: string) => {
    if (!fromWeek || fromWeek === selectedWeek) return

    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('weekly_sales_forecasts')
      .select('*')
      .eq('year_week', fromWeek) as any

    if (error) {
      setMessage('复制失败')
    } else if (data && data.length > 0) {
      setForecasts(
        (data as any[]).map((f: any) => ({
          sku: f.sku,
          channel_code: f.channel_code,
          forecast_qty: f.forecast_qty,
          isNew: true,
        }))
      )
      setMessage(`已从 ${fromWeek} 复制 ${data.length} 条记录`)
    } else {
      setMessage('源周没有数据')
    }

    setLoading(false)
  }

  const totalQty = forecasts.reduce((sum, f) => sum + f.forecast_qty, 0)

  return (
    <div className="flex flex-col">
      <Header title="销量预测管理" description="编辑周度销量预测" />

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
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="week">周次</Label>
                <Select
                  id="week"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                >
                  <option value="">选择周次</option>
                  {availableWeeks.map((week) => (
                    <option key={week} value={week}>
                      {week}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label>从其他周复制</Label>
                <Select
                  onChange={(e) => {
                    if (e.target.value) {
                      copyFromWeek(e.target.value)
                      e.target.value = ''
                    }
                  }}
                >
                  <option value="">选择源周...</option>
                  {availableWeeks
                    .filter((w) => w !== selectedWeek)
                    .map((week) => (
                      <option key={week} value={week}>
                        {week}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Forecasts Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>预测明细</CardTitle>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4" />
                添加行
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={saveForecasts}
                disabled={saving || forecasts.length === 0}
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
            ) : forecasts.length === 0 ? (
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
                    <TableHead className="w-16">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecasts.map((row, index) => (
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
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={row.forecast_qty}
                          onChange={(e) => updateRow(index, 'forecast_qty', parseInt(e.target.value) || 0)}
                          className="text-right"
                        />
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
                  ))}
                </TableBody>
              </Table>
            )}

            {forecasts.length > 0 && (
              <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
                <div className="text-right">
                  <p className="text-sm text-gray-500">总预测数量</p>
                  <p className="text-xl font-semibold">{totalQty.toLocaleString()}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
