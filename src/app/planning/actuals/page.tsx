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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/lib/hooks/use-toast'
import { ArrowLeft, Save, Plus, Trash2, Download, Upload } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Product, Channel } from '@/lib/types/database'
import { getCurrentWeek, addWeeksToWeekString, getWeekInfo, parseWeekString } from '@/lib/utils/date'
import { format, endOfISOWeek } from 'date-fns'
import { deleteSalesActualBySku } from '@/lib/actions/planning'

interface ActualRow {
  id?: string
  sku: string
  channelActuals: { [channelCode: string]: number }
  channelForecasts?: { [channelCode: string]: number }
  isNew?: boolean
  isModified?: boolean
}

// Helper function to format week with date range
function getWeekDateRange(weekIso: string): string {
  const weekStart = parseWeekString(weekIso)
  if (!weekStart) return weekIso

  const weekEnd = endOfISOWeek(weekStart)
  return `${weekIso} (${format(weekStart, 'M.d')}-${format(weekEnd, 'M.d')})`
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toasts, showToast, dismissToast } = useToast()

  // Generate week options (past 12 weeks + current week + 1 future week)
  const generateWeekOptions = () => {
    const weeks: string[] = []
    const currentWeek = getCurrentWeek()

    for (let i = -12; i <= 1; i++) {
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

      const [productsResult, channelsResult, actualsWeeksResult, forecastsWeeksResult] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true).order('sku'),
        supabase.from('channels').select('*').eq('is_active', true).order('channel_code'),
        supabase.from('sales_actuals').select('week_iso').order('week_iso', { ascending: false }) as any,
        supabase.from('sales_forecasts').select('week_iso').order('week_iso', { ascending: false }) as any,
      ])

      setProducts((productsResult.data || []) as Product[])
      setChannels((channelsResult.data || []) as Channel[])

      // Combine generated weeks with existing weeks
      const generatedWeeks = generateWeekOptions()
      const existingActualWeeks = [...new Set((actualsWeeksResult.data as any[] || []).map((a: any) => a.week_iso))]
      const existingForecastWeeks = [...new Set((forecastsWeeksResult.data as any[] || []).map((f: any) => f.week_iso))]
      const allWeeks = [...new Set([...generatedWeeks, ...existingActualWeeks, ...existingForecastWeeks])]
        .sort((a, b) => b.localeCompare(a))
      setAvailableWeeks(allWeeks)

      // Set last week as default (most common use case for entering actuals)
      if (!selectedWeek && generatedWeeks.length > 0) {
        const lastWeek = addWeeksToWeekString(getCurrentWeek(), -1)
        if (lastWeek) {
          setSelectedWeek(lastWeek)
        }
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
        .from('sales_actuals')
        .select('*')
        .eq('week_iso', selectedWeek)
        .order('sku')
        .order('channel_code') as any,
      supabase
        .from('sales_forecasts')
        .select('*')
        .eq('week_iso', selectedWeek) as any,
    ])

    if (actualsResult.error) {
      console.error('Error loading actuals:', actualsResult.error)
      setMessage('加载失败')
      setLoading(false)
      return
    }

    // Group forecasts by SKU and channel
    const forecastsBySku = new Map<string, { [channelCode: string]: number }>()
    ;((forecastsResult.data || []) as any[]).forEach((f: any) => {
      if (!forecastsBySku.has(f.sku)) {
        forecastsBySku.set(f.sku, {})
      }
      forecastsBySku.get(f.sku)![f.channel_code] = f.forecast_qty
    })

    // Group actuals by SKU and channel
    const actualsBySku = new Map<string, { [channelCode: string]: number }>()
    ;((actualsResult.data || []) as any[]).forEach((a: any) => {
      if (!actualsBySku.has(a.sku)) {
        actualsBySku.set(a.sku, {})
      }
      actualsBySku.get(a.sku)![a.channel_code] = a.actual_qty
    })

    // Combine all SKUs from both actuals and forecasts
    const allSkus = new Set([...actualsBySku.keys(), ...forecastsBySku.keys()])

    const rows: ActualRow[] = Array.from(allSkus).map((sku) => ({
      sku,
      channelActuals: actualsBySku.get(sku) || {},
      channelForecasts: forecastsBySku.get(sku),
      isNew: !actualsBySku.has(sku),
    }))

    setActuals(rows)
    setLoading(false)
  }

  const addRow = () => {
    if (products.length === 0 || channels.length === 0) return

    const channelActuals: { [channelCode: string]: number } = {}
    channels.forEach((c) => {
      channelActuals[c.channel_code] = 0
    })

    setActuals([
      ...actuals,
      {
        sku: products[0].sku,
        channelActuals,
        isNew: true,
      },
    ])
  }

  const openDeleteDialog = (index: number) => {
    setDeleteTargetIndex(index)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (deleteTargetIndex === null || !selectedWeek) return

    const row = actuals[deleteTargetIndex]

    // If it's a new unsaved row, just remove it from the UI
    if (row.isNew && !row.id) {
      setActuals(actuals.filter((_, i) => i !== deleteTargetIndex))
      setDeleteDialogOpen(false)
      setDeleteTargetIndex(null)
      showToast('已删除行', 'success')
      return
    }

    // Otherwise, delete from database
    setDeleting(true)
    const result = await deleteSalesActualBySku(selectedWeek, row.sku)
    setDeleting(false)

    if (result.success) {
      showToast('删除成功', 'success')
      setDeleteDialogOpen(false)
      setDeleteTargetIndex(null)
      // Reload data
      await loadActuals()
    } else {
      showToast(`删除失败: ${result.error}`, 'error')
    }
  }

  const updateRow = (index: number, field: 'sku' | 'channel', value: string, channelCode?: string) => {
    const newActuals = [...actuals]
    if (field === 'sku') {
      newActuals[index].sku = value
    } else if (field === 'channel' && channelCode) {
      newActuals[index].channelActuals[channelCode] = parseInt(value) || 0
    }
    newActuals[index].isModified = true
    setActuals(newActuals)
  }

  const saveActuals = async () => {
    if (!selectedWeek) return

    setSaving(true)
    setMessage('')

    const supabase = createClient()

    // Get week dates
    const weekInfo = getWeekInfo(selectedWeek)
    if (!weekInfo) {
      setMessage('Invalid week format')
      setSaving(false)
      return
    }

    // Prepare data for upsert - flatten to individual channel records
    const dataToSave: any[] = []
    actuals.forEach((row) => {
      Object.entries(row.channelActuals).forEach(([channelCode, qty]) => {
        dataToSave.push({
          week_iso: selectedWeek,
          week_start_date: format(weekInfo.startDate, 'yyyy-MM-dd'),
          week_end_date: format(weekInfo.endDate, 'yyyy-MM-dd'),
          sku: row.sku,
          channel_code: channelCode,
          actual_qty: qty,
        })
      })
    })

    const { error } = await (supabase
      .from('sales_actuals') as any)
      .upsert(dataToSave, {
        onConflict: 'week_iso,sku,channel_code',
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

  const downloadTemplate = () => {
    const rows = ['SKU\tChannel\tActual Qty']

    // Add example rows
    if (products.length > 0 && channels.length > 0) {
      const exampleSku = products[0].sku
      channels.forEach((channel) => {
        rows.push(`${exampleSku}\t${channel.channel_code}\t0`)
      })
    }

    const template = rows.join('\n')
    const blob = new Blob([template], { type: 'text/tab-separated-values' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `actuals_template_${selectedWeek || 'template'}.tsv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const lines = text.split('\n').filter((line) => line.trim())

    // Skip header
    const dataLines = lines.slice(1)

    // Parse TSV
    const actualsMap = new Map<string, { [channelCode: string]: number }>()

    dataLines.forEach((line) => {
      const [sku, channelCode, qtyStr] = line.split('\t').map((s) => s.trim())
      if (!sku || !channelCode) return

      const qty = parseInt(qtyStr) || 0

      if (!actualsMap.has(sku)) {
        actualsMap.set(sku, {})
      }
      actualsMap.get(sku)![channelCode] = qty
    })

    // Convert to rows
    const rows: ActualRow[] = Array.from(actualsMap.entries()).map(([sku, channelActuals]) => ({
      sku,
      channelActuals,
      isNew: true,
    }))

    setActuals(rows)
    setMessage(`已导入 ${rows.length} 个SKU的实际销量数据`)

    // Reset file input
    event.target.value = ''
  }

  const totalActual = actuals.reduce((sum, a) => {
    return sum + Object.values(a.channelActuals).reduce((x, y) => x + y, 0)
  }, 0)
  const totalForecast = actuals.reduce((sum, a) => {
    if (!a.channelForecasts) return sum
    return sum + Object.values(a.channelForecasts).reduce((x, y) => x + y, 0)
  }, 0)
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
                    {getWeekDateRange(week)}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Excel Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle>从Excel导入</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
              >
                <Download className="mr-2 h-4 w-4" />
                下载模板
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  id="file-upload-actuals"
                  type="file"
                  accept=".tsv,.txt,.csv"
                  onChange={handleFileUpload}
                  className="max-w-xs"
                />
                <Label htmlFor="file-upload-actuals" className="text-sm text-gray-500">
                  <Upload className="inline h-4 w-4 mr-1" />
                  选择文件上传
                </Label>
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              模板格式: SKU | 渠道 | 实际数量 (制表符分隔)
            </p>
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      {channels.map((channel) => (
                        <TableHead key={`forecast-${channel.channel_code}`} className="text-right text-gray-500 text-xs">
                          {channel.channel_name}
                          <br />
                          <span className="font-normal">(预测)</span>
                        </TableHead>
                      ))}
                      {channels.map((channel) => (
                        <TableHead key={`actual-${channel.channel_code}`} className="text-right">
                          {channel.channel_name}
                          <br />
                          <span className="font-semibold">(实际)</span>
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-semibold">合计</TableHead>
                      <TableHead className="text-right font-semibold">偏差</TableHead>
                      <TableHead className="w-16">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actuals.map((row, index) => {
                      const rowActual = Object.values(row.channelActuals).reduce((a, b) => a + b, 0)
                      const rowForecast = row.channelForecasts
                        ? Object.values(row.channelForecasts).reduce((a, b) => a + b, 0)
                        : 0
                      const rowVariance = rowActual - rowForecast
                      const rowVariancePct = rowForecast > 0 ? (rowVariance / rowForecast) * 100 : 0

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
                          {/* Forecast columns */}
                          {channels.map((channel) => (
                            <TableCell
                              key={`forecast-${channel.channel_code}`}
                              className="text-right text-gray-400 text-sm"
                            >
                              {row.channelForecasts?.[channel.channel_code]?.toLocaleString() || '-'}
                            </TableCell>
                          ))}
                          {/* Actual columns (editable) */}
                          {channels.map((channel) => (
                            <TableCell key={`actual-${channel.channel_code}`}>
                              <Input
                                type="number"
                                min="0"
                                value={row.channelActuals[channel.channel_code] || 0}
                                onChange={(e) =>
                                  updateRow(index, 'channel', e.target.value, channel.channel_code)
                                }
                                className="text-right"
                              />
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-semibold">
                            {rowActual.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {rowForecast > 0 ? (
                              <span className={rowVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {rowVariance >= 0 ? '+' : ''}
                                {rowVariance.toLocaleString()}
                                <span className="ml-1 text-xs">
                                  ({rowVariancePct >= 0 ? '+' : ''}
                                  {rowVariancePct.toFixed(0)}%)
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
                              onClick={() => openDeleteDialog(index)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除该SKU的所有渠道实际销量数据吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
