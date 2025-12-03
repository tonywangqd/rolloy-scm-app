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
import { ArrowLeft, Save, Copy, Plus, Trash2, Download, Upload } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Product, Channel, SalesForecast } from '@/lib/types/database'
import { format, endOfISOWeek } from 'date-fns'
import { getCurrentWeek, addWeeksToWeekString, getWeekInfo, parseWeekString } from '@/lib/utils/date'
import { deleteSalesForecastBySku } from '@/lib/actions/planning'

interface ForecastRow {
  id?: string
  sku: string
  channelForecasts: { [channelCode: string]: number }
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

export default function ForecastsPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([])
  const [forecasts, setForecasts] = useState<ForecastRow[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toasts, showToast, dismissToast } = useToast()

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
        supabase.from('sales_forecasts').select('week_iso').order('week_iso', { ascending: false }) as any,
      ])

      setProducts((productsResult.data || []) as Product[])
      setChannels((channelsResult.data || []) as Channel[])

      // Combine generated weeks with existing forecast weeks
      const generatedWeeks = generateWeekOptions()
      const existingWeeks = [...new Set((forecastWeeksResult.data as any[] || []).map((f: any) => f.week_iso))]
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
      .from('sales_forecasts')
      .select('*')
      .eq('week_iso', selectedWeek)
      .order('sku')
      .order('channel_code') as any

    if (error) {
      console.error('Error loading forecasts:', error)
      setMessage('加载失败')
    } else {
      // Group by SKU with all channels
      const forecastMap = new Map<string, { [channelCode: string]: number }>()

      ;((data || []) as any[]).forEach((f: any) => {
        if (!forecastMap.has(f.sku)) {
          forecastMap.set(f.sku, {})
        }
        forecastMap.get(f.sku)![f.channel_code] = f.forecast_qty
      })

      // Convert to rows
      const rows: ForecastRow[] = Array.from(forecastMap.entries()).map(([sku, channelForecasts]) => ({
        sku,
        channelForecasts,
      }))

      setForecasts(rows)
    }

    setLoading(false)
  }

  const addRow = () => {
    if (products.length === 0 || channels.length === 0) return

    const channelForecasts: { [channelCode: string]: number } = {}
    channels.forEach((c) => {
      channelForecasts[c.channel_code] = 0
    })

    setForecasts([
      ...forecasts,
      {
        sku: products[0].sku,
        channelForecasts,
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

    const row = forecasts[deleteTargetIndex]

    // If it's a new unsaved row, just remove it from the UI
    if (row.isNew && !row.id) {
      setForecasts(forecasts.filter((_, i) => i !== deleteTargetIndex))
      setDeleteDialogOpen(false)
      setDeleteTargetIndex(null)
      showToast('已删除行', 'success')
      return
    }

    // Otherwise, delete from database
    setDeleting(true)
    const result = await deleteSalesForecastBySku(selectedWeek, row.sku)
    setDeleting(false)

    if (result.success) {
      showToast('删除成功', 'success')
      setDeleteDialogOpen(false)
      setDeleteTargetIndex(null)
      // Reload data
      await loadForecasts()
    } else {
      showToast(`删除失败: ${result.error}`, 'error')
    }
  }

  const updateRow = (index: number, field: 'sku' | 'channel', value: string, channelCode?: string) => {
    const newForecasts = [...forecasts]
    if (field === 'sku') {
      newForecasts[index].sku = value
    } else if (field === 'channel' && channelCode) {
      newForecasts[index].channelForecasts[channelCode] = parseInt(value) || 0
    }
    newForecasts[index].isModified = true
    setForecasts(newForecasts)
  }

  const saveForecasts = async () => {
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
    forecasts.forEach((row) => {
      Object.entries(row.channelForecasts).forEach(([channelCode, qty]) => {
        dataToSave.push({
          week_iso: selectedWeek,
          week_start_date: format(weekInfo.startDate, 'yyyy-MM-dd'),
          week_end_date: format(weekInfo.endDate, 'yyyy-MM-dd'),
          sku: row.sku,
          channel_code: channelCode,
          forecast_qty: qty,
        })
      })
    })

    const { error } = await (supabase
      .from('sales_forecasts') as any)
      .upsert(dataToSave, {
        onConflict: 'week_iso,sku,channel_code',
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
      .from('sales_forecasts')
      .select('*')
      .eq('week_iso', fromWeek) as any

    if (error) {
      setMessage('复制失败')
    } else if (data && data.length > 0) {
      // Group by SKU
      const forecastMap = new Map<string, { [channelCode: string]: number }>()

      ;((data || []) as any[]).forEach((f: any) => {
        if (!forecastMap.has(f.sku)) {
          forecastMap.set(f.sku, {})
        }
        forecastMap.get(f.sku)![f.channel_code] = f.forecast_qty
      })

      const rows: ForecastRow[] = Array.from(forecastMap.entries()).map(([sku, channelForecasts]) => ({
        sku,
        channelForecasts,
        isNew: true,
      }))

      setForecasts(rows)
      setMessage(`已从 ${getWeekDateRange(fromWeek)} 复制 ${data.length} 条记录`)
    } else {
      setMessage('源周没有数据')
    }

    setLoading(false)
  }

  const downloadTemplate = () => {
    const rows = ['SKU\tChannel\tForecast Qty']

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
    a.download = `forecast_template_${selectedWeek || 'template'}.tsv`
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
    const forecastMap = new Map<string, { [channelCode: string]: number }>()

    dataLines.forEach((line) => {
      const [sku, channelCode, qtyStr] = line.split('\t').map((s) => s.trim())
      if (!sku || !channelCode) return

      const qty = parseInt(qtyStr) || 0

      if (!forecastMap.has(sku)) {
        forecastMap.set(sku, {})
      }
      forecastMap.get(sku)![channelCode] = qty
    })

    // Convert to rows
    const rows: ForecastRow[] = Array.from(forecastMap.entries()).map(([sku, channelForecasts]) => ({
      sku,
      channelForecasts,
      isNew: true,
    }))

    setForecasts(rows)
    setMessage(`已导入 ${rows.length} 个SKU的预测数据`)

    // Reset file input
    event.target.value = ''
  }

  const totalQty = forecasts.reduce((sum, f) => {
    return sum + Object.values(f.channelForecasts).reduce((a, b) => a + b, 0)
  }, 0)

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
                      {getWeekDateRange(week)}
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
                        {getWeekDateRange(week)}
                      </option>
                    ))}
                </Select>
              </div>
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
                  id="file-upload"
                  type="file"
                  accept=".tsv,.txt,.csv"
                  onChange={handleFileUpload}
                  className="max-w-xs"
                />
                <Label htmlFor="file-upload" className="text-sm text-gray-500">
                  <Upload className="inline h-4 w-4 mr-1" />
                  选择文件上传
                </Label>
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              模板格式: SKU | 渠道 | 预测数量 (制表符分隔)
            </p>
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
                    {channels.map((channel) => (
                      <TableHead key={channel.channel_code} className="text-right">
                        {channel.channel_name}
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-semibold">合计</TableHead>
                    <TableHead className="w-16">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecasts.map((row, index) => {
                    const rowTotal = Object.values(row.channelForecasts).reduce((a, b) => a + b, 0)

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
                        {channels.map((channel) => (
                          <TableCell key={channel.channel_code}>
                            <Input
                              type="number"
                              min="0"
                              value={row.channelForecasts[channel.channel_code] || 0}
                              onChange={(e) =>
                                updateRow(index, 'channel', e.target.value, channel.channel_code)
                              }
                              className="text-right"
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold">
                          {rowTotal.toLocaleString()}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除该SKU的所有渠道预测数据吗？此操作无法撤销。
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
