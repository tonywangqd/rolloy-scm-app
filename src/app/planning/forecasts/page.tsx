'use client'

import { useState, useEffect, useMemo } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToastContainer } from '@/components/ui/toast'
import { ExportButton } from '@/components/ui/export-button'
import { useToast } from '@/lib/hooks/use-toast'
import { ArrowLeft, Save, Plus, Trash2, FileSpreadsheet, Sparkles, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Product, Channel, SalesForecast } from '@/lib/types/database'
import { format, endOfISOWeek } from 'date-fns'
import { getCurrentWeek, addWeeksToWeekString, getWeekInfo, parseWeekString, getWeekRange } from '@/lib/utils/date'
import { ExcelImportDialog } from '@/components/planning/excel-import-dialog'

interface MatrixCell {
  sku: string
  weekIso: string
  channelCode: string
  forecastQty: number
  isModified?: boolean
}

interface MatrixRow {
  sku: string
  productName: string
  weekData: { [weekIso: string]: { [channelCode: string]: number } }
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
  const [products, setProducts] = useState<Product[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<string>('ALL')
  const [startWeek, setStartWeek] = useState('')
  const [weekCount, setWeekCount] = useState(12)
  const [matrixData, setMatrixData] = useState<MatrixRow[]>([])
  const [modifiedCells, setModifiedCells] = useState<Map<string, MatrixCell>>(new Map())
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const { toasts, showToast, dismissToast } = useToast()

  // Generate week columns based on startWeek and weekCount
  const weekColumns = useMemo(() => {
    if (!startWeek) return []
    const weeks: string[] = []
    for (let i = 0; i < weekCount; i++) {
      const week = addWeeksToWeekString(startWeek, i)
      if (week) weeks.push(week)
    }
    return weeks
  }, [startWeek, weekCount])

  useEffect(() => {
    const fetchInitialData = async () => {
      const supabase = createClient()

      const [productsResult, channelsResult] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true).order('sku'),
        supabase.from('channels').select('*').eq('is_active', true).order('channel_code'),
      ])

      const prods = (productsResult.data || []) as Product[]
      const chans = (channelsResult.data || []) as Channel[]

      setProducts(prods)
      setChannels(chans)

      // Set default start week to current week
      if (!startWeek) {
        setStartWeek(getCurrentWeek())
      }
    }

    fetchInitialData()
  }, [])

  useEffect(() => {
    if (startWeek && weekColumns.length > 0 && products.length > 0) {
      loadMatrixData()
    }
  }, [startWeek, weekColumns, products, selectedChannel])

  const loadMatrixData = async () => {
    if (!startWeek || weekColumns.length === 0) return

    setLoading(true)
    const supabase = createClient()

    // Fetch all forecasts for the week range
    const { data, error } = await supabase
      .from('sales_forecasts')
      .select('*')
      .in('week_iso', weekColumns)
      .order('sku')
      .order('week_iso')
      .order('channel_code') as any

    if (error) {
      console.error('Error loading forecasts:', error)
      showToast('加载失败', 'error')
    } else {
      // Build matrix structure
      const matrix = new Map<string, MatrixRow>()

      // Initialize all SKUs
      products.forEach((product) => {
        const weekData: { [weekIso: string]: { [channelCode: string]: number } } = {}

        weekColumns.forEach((week) => {
          weekData[week] = {}
          channels.forEach((channel) => {
            weekData[week][channel.channel_code] = 0
          })
        })

        matrix.set(product.sku, {
          sku: product.sku,
          productName: product.product_name,
          weekData,
        })
      })

      // Fill in actual forecast data
      ;((data || []) as any[]).forEach((forecast: any) => {
        const row = matrix.get(forecast.sku)
        if (row && row.weekData[forecast.week_iso]) {
          row.weekData[forecast.week_iso][forecast.channel_code] = forecast.forecast_qty
        }
      })

      setMatrixData(Array.from(matrix.values()))
    }

    setLoading(false)
    setModifiedCells(new Map()) // Clear modifications after load
  }

  const updateCell = (sku: string, weekIso: string, channelCode: string, value: string) => {
    const qty = parseInt(value) || 0

    // Update matrix data
    setMatrixData((prevData) =>
      prevData.map((row) => {
        if (row.sku === sku) {
          return {
            ...row,
            weekData: {
              ...row.weekData,
              [weekIso]: {
                ...row.weekData[weekIso],
                [channelCode]: qty,
              },
            },
          }
        }
        return row
      })
    )

    // Track modified cell
    const cellKey = `${sku}-${weekIso}-${channelCode}`
    setModifiedCells((prev) => {
      const newMap = new Map(prev)
      newMap.set(cellKey, {
        sku,
        weekIso,
        channelCode,
        forecastQty: qty,
        isModified: true,
      })
      return newMap
    })
  }

  const saveForecasts = async () => {
    if (modifiedCells.size === 0) {
      showToast('没有需要保存的修改', 'info')
      return
    }

    setSaving(true)
    const supabase = createClient()

    // Prepare data for upsert
    const dataToSave: any[] = []

    modifiedCells.forEach((cell) => {
      const weekInfo = getWeekInfo(cell.weekIso)
      if (!weekInfo) return

      dataToSave.push({
        week_iso: cell.weekIso,
        week_start_date: format(weekInfo.startDate, 'yyyy-MM-dd'),
        week_end_date: format(weekInfo.endDate, 'yyyy-MM-dd'),
        sku: cell.sku,
        channel_code: cell.channelCode,
        forecast_qty: cell.forecastQty,
      })
    })

    const { error } = await (supabase.from('sales_forecasts') as any).upsert(dataToSave, {
      onConflict: 'week_iso,sku,channel_code',
    })

    if (error) {
      showToast(`保存失败: ${error.message}`, 'error')
    } else {
      showToast(`成功保存 ${modifiedCells.size} 个修改`, 'success')
      setModifiedCells(new Map())
    }

    setSaving(false)
  }

  const addRow = () => {
    // Find first product not in matrix
    const existingSkus = new Set(matrixData.map((r) => r.sku))
    const newProduct = products.find((p) => !existingSkus.has(p.sku))

    if (!newProduct) {
      showToast('所有SKU已添加', 'info')
      return
    }

    const weekData: { [weekIso: string]: { [channelCode: string]: number } } = {}
    weekColumns.forEach((week) => {
      weekData[week] = {}
      channels.forEach((channel) => {
        weekData[week][channel.channel_code] = 0
      })
    })

    setMatrixData([
      ...matrixData,
      {
        sku: newProduct.sku,
        productName: newProduct.product_name,
        weekData,
      },
    ])
  }

  const removeRow = (sku: string) => {
    setMatrixData(matrixData.filter((r) => r.sku !== sku))

    // Remove modified cells for this SKU
    const newModified = new Map(modifiedCells)
    modifiedCells.forEach((_, key) => {
      if (key.startsWith(`${sku}-`)) {
        newModified.delete(key)
      }
    })
    setModifiedCells(newModified)
  }

  // Calculate totals
  const weekTotals = useMemo(() => {
    const totals: { [weekIso: string]: number } = {}
    weekColumns.forEach((week) => {
      totals[week] = 0
    })

    matrixData.forEach((row) => {
      weekColumns.forEach((week) => {
        const channelsToSum = selectedChannel === 'ALL'
          ? channels
          : channels.filter((c) => c.channel_code === selectedChannel)

        channelsToSum.forEach((channel) => {
          totals[week] += row.weekData[week]?.[channel.channel_code] || 0
        })
      })
    })

    return totals
  }, [matrixData, weekColumns, selectedChannel, channels])

  // Get filtered channels based on selection
  const displayChannels = useMemo(() => {
    if (selectedChannel === 'ALL') return channels
    return channels.filter((c) => c.channel_code === selectedChannel)
  }, [selectedChannel, channels])

  // Prepare export data
  const exportData = useMemo(() => {
    const rows: any[] = []
    matrixData.forEach((row) => {
      weekColumns.forEach((week) => {
        const exportRow: any = {
          'SKU': row.sku,
          '产品名称': row.productName,
          '周次': week,
        }
        displayChannels.forEach((channel) => {
          exportRow[channel.channel_name] = row.weekData[week]?.[channel.channel_code] || 0
        })
        const weekTotal = displayChannels.reduce(
          (sum, channel) => sum + (row.weekData[week]?.[channel.channel_code] || 0),
          0
        )
        exportRow['合计'] = weekTotal
        rows.push(exportRow)
      })
    })
    return rows
  }, [matrixData, weekColumns, displayChannels])

  return (
    <div className="flex flex-col">
      <Header title="销量预测管理" description="矩阵表格 - 跨周批量编辑预测数据" />

      <div className="flex-1 space-y-6 p-6">
        {/* Back Button */}
        <Link href="/planning">
          <Button variant="ghost" type="button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回计划
          </Button>
        </Link>

        {/* Smart Wizard Entry - New Feature */}
        <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">智能预测向导</h3>
                  <p className="text-sm text-gray-600">
                    AI 辅助预测，5步完成批量录入，效率提升 80%
                  </p>
                </div>
              </div>
              <Link href="/planning/forecasts/wizard">
                <Button variant="primary" size="lg">
                  <Sparkles className="mr-2 h-4 w-4" />
                  启动向导
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Week Range Selection */}
        <Card>
          <CardHeader>
            <CardTitle>周次范围设置</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="startWeek">起始周次</Label>
                <Select
                  id="startWeek"
                  value={startWeek}
                  onChange={(e) => setStartWeek(e.target.value)}
                >
                  <option value="">选择起始周...</option>
                  {(() => {
                    const currentWeek = getCurrentWeek()
                    const weeks: string[] = []
                    for (let i = -4; i <= 12; i++) {
                      const week = addWeeksToWeekString(currentWeek, i)
                      if (week) weeks.push(week)
                    }
                    return weeks.map((week) => (
                      <option key={week} value={week}>
                        {getWeekDateRange(week)}
                      </option>
                    ))
                  })()}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="weekCount">显示周数</Label>
                <Select
                  id="weekCount"
                  value={weekCount.toString()}
                  onChange={(e) => setWeekCount(parseInt(e.target.value))}
                >
                  <option value="4">4周</option>
                  <option value="8">8周</option>
                  <option value="12">12周</option>
                  <option value="16">16周</option>
                  <option value="20">20周</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel">渠道筛选</Label>
                <Select
                  id="channel"
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                >
                  <option value="ALL">所有渠道</option>
                  {channels.map((channel) => (
                    <option key={channel.channel_code} value={channel.channel_code}>
                      {channel.channel_name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Batch Import */}
        <Card>
          <CardHeader>
            <CardTitle>批量导入</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              disabled={!startWeek}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel 批量导入
            </Button>
            <p className="mt-2 text-sm text-gray-500">
              支持 CSV 格式批量导入预测数据，带数据验证和预览功能
            </p>
          </CardContent>
        </Card>

        {/* Matrix Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>预测矩阵表</CardTitle>
              {modifiedCells.size > 0 && (
                <p className="mt-1 text-sm text-orange-600">
                  {modifiedCells.size} 个单元格已修改，未保存
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {matrixData.length > 0 && (
                <ExportButton
                  data={exportData}
                  filename={`销量预测矩阵_${startWeek}_${weekCount}周`}
                />
              )}
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4" />
                添加SKU
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={saveForecasts}
                disabled={saving || modifiedCells.size === 0}
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? '保存中...' : `保存 (${modifiedCells.size})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                加载中...
              </div>
            ) : matrixData.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无数据，点击"添加SKU"开始录入
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-white min-w-[120px]">
                        SKU
                      </TableHead>
                      <TableHead className="sticky left-[120px] z-10 bg-white min-w-[200px]">
                        产品名称
                      </TableHead>
                      {weekColumns.map((week) => (
                        <TableHead
                          key={week}
                          colSpan={displayChannels.length}
                          className="text-center border-l-2 border-gray-200"
                        >
                          {getWeekDateRange(week)}
                        </TableHead>
                      ))}
                      <TableHead className="sticky right-0 z-10 bg-white w-16 border-l-2 border-gray-300">
                        操作
                      </TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-gray-50"></TableHead>
                      <TableHead className="sticky left-[120px] z-10 bg-gray-50"></TableHead>
                      {weekColumns.map((week) =>
                        displayChannels.map((channel, idx) => (
                          <TableHead
                            key={`${week}-${channel.channel_code}`}
                            className={`text-center text-xs ${idx === 0 ? 'border-l-2 border-gray-200' : ''}`}
                          >
                            {channel.channel_name}
                          </TableHead>
                        ))
                      )}
                      <TableHead className="sticky right-0 z-10 bg-gray-50"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrixData.map((row) => (
                      <TableRow key={row.sku}>
                        <TableCell className="sticky left-0 z-10 bg-white font-medium border-r">
                          {row.sku}
                        </TableCell>
                        <TableCell className="sticky left-[120px] z-10 bg-white text-sm border-r">
                          {row.productName}
                        </TableCell>
                        {weekColumns.map((week) =>
                          displayChannels.map((channel, idx) => {
                            const cellKey = `${row.sku}-${week}-${channel.channel_code}`
                            const isModified = modifiedCells.has(cellKey)
                            return (
                              <TableCell
                                key={cellKey}
                                className={`p-1 ${idx === 0 ? 'border-l-2 border-gray-200' : ''}`}
                              >
                                <Input
                                  type="number"
                                  min="0"
                                  value={row.weekData[week]?.[channel.channel_code] || 0}
                                  onChange={(e) =>
                                    updateCell(row.sku, week, channel.channel_code, e.target.value)
                                  }
                                  className={`w-20 text-right text-sm ${
                                    isModified ? 'bg-yellow-50 border-yellow-400' : ''
                                  }`}
                                />
                              </TableCell>
                            )
                          })
                        )}
                        <TableCell className="sticky right-0 z-10 bg-white border-l-2 border-gray-300">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRow(row.sku)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Total Row */}
                    <TableRow className="bg-gray-50 font-semibold">
                      <TableCell className="sticky left-0 z-10 bg-gray-100 border-t-2 border-gray-300">
                        合计
                      </TableCell>
                      <TableCell className="sticky left-[120px] z-10 bg-gray-100 border-t-2 border-gray-300">
                        -
                      </TableCell>
                      {weekColumns.map((week, weekIdx) =>
                        displayChannels.map((_, channelIdx) => {
                          const isFirstChannel = channelIdx === 0
                          const showTotal = channelIdx === Math.floor(displayChannels.length / 2)
                          return (
                            <TableCell
                              key={`total-${week}-${channelIdx}`}
                              className={`text-center border-t-2 border-gray-300 ${
                                isFirstChannel ? 'border-l-2 border-gray-200' : ''
                              }`}
                              colSpan={showTotal ? displayChannels.length : undefined}
                            >
                              {showTotal && weekTotals[week]?.toLocaleString()}
                            </TableCell>
                          )
                        })
                      ).filter((_, idx) => idx % displayChannels.length === Math.floor(displayChannels.length / 2))}
                      <TableCell className="sticky right-0 z-10 bg-gray-100 border-t-2 border-gray-300"></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Excel Import Dialog */}
      {startWeek && (
        <ExcelImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          type="forecast"
          weekIso={startWeek}
          onImportComplete={loadMatrixData}
          validSkus={new Set(products.map((p) => p.sku))}
          validChannels={new Set(channels.map((c) => c.channel_code))}
        />
      )}
    </div>
  )
}
