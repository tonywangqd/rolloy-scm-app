'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Download, Upload, AlertCircle, CheckCircle, X } from 'lucide-react'
import { batchUpsertSalesForecasts, batchUpsertSalesActuals } from '@/lib/actions/planning'
import type { SalesForecastInsert, SalesActualInsert } from '@/lib/types/database'

interface ImportRow {
  week_iso: string
  sku: string
  channel_code: string
  qty: number
}

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ExcelImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'forecast' | 'actual'
  weekIso: string
  onImportComplete?: () => void
  validSkus?: Set<string>
  validChannels?: Set<string>
}

export function ExcelImportDialog({
  open,
  onOpenChange,
  type,
  weekIso,
  onImportComplete,
  validSkus = new Set(),
  validChannels = new Set(),
}: ExcelImportDialogProps) {
  const [parsedData, setParsedData] = useState<ImportRow[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  const isWeekIsoValid = (weekIso: string): boolean => {
    // Format: YYYY-WNN (e.g., 2025-W49)
    const regex = /^\d{4}-W([0-4]\d|5[0-3])$/
    return regex.test(weekIso)
  }

  const parseCSV = (text: string): ImportRow[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0) {
      return []
    }

    // Detect delimiter (comma, tab, or semicolon)
    const firstLine = lines[0]
    let delimiter = ','
    if (firstLine.includes('\t')) {
      delimiter = '\t'
    } else if (firstLine.includes(';')) {
      delimiter = ';'
    }

    // Parse header to detect column positions
    const header = lines[0].toLowerCase().split(delimiter).map((h) => h.trim())

    // Find column indices (flexible header names)
    const weekIdx = header.findIndex((h) =>
      h.includes('week') || h.includes('周') || h.includes('week_iso')
    )
    const skuIdx = header.findIndex((h) => h === 'sku' || h.includes('sku'))
    const channelIdx = header.findIndex((h) =>
      h.includes('channel') || h.includes('渠道') || h.includes('channel_code')
    )
    const qtyIdx = header.findIndex((h) =>
      h.includes('qty') || h.includes('数量') || h.includes('forecast') || h.includes('actual')
    )

    const rows: ImportRow[] = []
    const validationErrors: ValidationError[] = []

    // Parse data rows (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const cells = line.split(delimiter).map((cell) => cell.trim())

      // Extract values
      const week = weekIdx >= 0 ? cells[weekIdx] : weekIso
      const sku = skuIdx >= 0 ? cells[skuIdx] : ''
      const channelCode = channelIdx >= 0 ? cells[channelIdx] : ''
      const qtyStr = qtyIdx >= 0 ? cells[qtyIdx] : '0'

      // Validate row
      if (!week || !isWeekIsoValid(week)) {
        validationErrors.push({
          row: i,
          field: 'week_iso',
          message: `无效的周次格式: ${week} (应为 YYYY-WNN)`,
        })
      }

      if (!sku) {
        validationErrors.push({
          row: i,
          field: 'sku',
          message: 'SKU 不能为空',
        })
      } else if (validSkus.size > 0 && !validSkus.has(sku)) {
        validationErrors.push({
          row: i,
          field: 'sku',
          message: `SKU 不存在: ${sku}`,
        })
      }

      if (!channelCode) {
        validationErrors.push({
          row: i,
          field: 'channel_code',
          message: '渠道代码不能为空',
        })
      } else if (validChannels.size > 0 && !validChannels.has(channelCode)) {
        validationErrors.push({
          row: i,
          field: 'channel_code',
          message: `渠道不存在: ${channelCode}`,
        })
      }

      const qty = parseInt(qtyStr, 10)
      if (isNaN(qty) || qty < 0) {
        validationErrors.push({
          row: i,
          field: 'qty',
          message: `无效的数量: ${qtyStr}`,
        })
      }

      rows.push({
        week_iso: week,
        sku,
        channel_code: channelCode,
        qty: isNaN(qty) ? 0 : qty,
      })
    }

    setErrors(validationErrors)
    return rows
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportResult(null)
    setErrors([])

    try {
      const text = await file.text()
      const data = parseCSV(text)
      setParsedData(data)
    } catch (error) {
      setErrors([
        {
          row: 0,
          field: 'file',
          message: `文件读取失败: ${error instanceof Error ? error.message : '未知错误'}`,
        },
      ])
    }

    // Reset file input
    event.target.value = ''
  }

  const downloadTemplate = () => {
    const headers = ['week_iso', 'sku', 'channel_code', 'qty']
    const exampleRows = [
      [weekIso || '2025-W49', 'SKU-001', 'AMZ-US', '100'],
      [weekIso || '2025-W49', 'SKU-001', 'SHOP-US', '50'],
      [weekIso || '2025-W49', 'SKU-002', 'AMZ-US', '75'],
    ]

    const csv = [headers.join(','), ...exampleRows.map((row) => row.join(','))].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${type === 'forecast' ? 'forecast' : 'actual'}_template_${weekIso}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (parsedData.length === 0 || errors.length > 0) {
      return
    }

    setImporting(true)
    setImportResult(null)

    try {
      let result: { success: boolean; error?: string; count?: number }

      if (type === 'forecast') {
        // Convert to SalesForecastInsert format
        const forecasts: SalesForecastInsert[] = parsedData.map((row) => ({
          week_iso: row.week_iso,
          week_start_date: '', // Will be calculated in server action
          week_end_date: '', // Will be calculated in server action
          sku: row.sku,
          channel_code: row.channel_code,
          forecast_qty: row.qty,
        }))

        result = await batchUpsertSalesForecasts(forecasts)
      } else {
        // Convert to SalesActualInsert format
        const actuals: SalesActualInsert[] = parsedData.map((row) => ({
          week_iso: row.week_iso,
          week_start_date: '', // Will be calculated in server action
          week_end_date: '', // Will be calculated in server action
          sku: row.sku,
          channel_code: row.channel_code,
          actual_qty: row.qty,
        }))

        result = await batchUpsertSalesActuals(actuals)
      }

      if (result.success) {
        setImportResult({
          success: true,
          message: `成功导入 ${result.count || parsedData.length} 条记录`,
        })
        setParsedData([])
        setTimeout(() => {
          onOpenChange(false)
          onImportComplete?.()
        }, 1500)
      } else {
        setImportResult({
          success: false,
          message: result.error || '导入失败',
        })
      }
    } catch (error) {
      setImportResult({
        success: false,
        message: `导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
      })
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setParsedData([])
    setErrors([])
    setImportResult(null)
    onOpenChange(false)
  }

  const hasErrors = errors.length > 0
  const canImport = parsedData.length > 0 && !hasErrors && !importing

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {type === 'forecast' ? '批量导入销量预测' : '批量导入实际销量'}
          </DialogTitle>
          <DialogDescription>
            从 Excel/CSV 文件批量导入数据。支持逗号、制表符或分号分隔的文件。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto">
          {/* Template Download & File Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                下载模板
              </Button>
              <div className="flex-1">
                <Label htmlFor="csv-upload" className="cursor-pointer">
                  <div className="flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
                    <Upload className="h-4 w-4" />
                    <span>选择 CSV/Excel 文件</span>
                  </div>
                  <Input
                    id="csv-upload"
                    type="file"
                    accept=".csv,.txt,.tsv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </Label>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              文件格式: week_iso, sku, channel_code, qty (第一行为表头)
            </p>
          </div>

          {/* Import Result */}
          {importResult && (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                importResult.success
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {importResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span>{importResult.message}</span>
            </div>
          )}

          {/* Validation Errors */}
          {hasErrors && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-red-700">
                <AlertCircle className="h-4 w-4" />
                发现 {errors.length} 个错误
              </div>
              <div className="max-h-32 space-y-1 overflow-y-auto text-sm text-red-600">
                {errors.slice(0, 10).map((error, idx) => (
                  <div key={idx}>
                    第 {error.row} 行 ({error.field}): {error.message}
                  </div>
                ))}
                {errors.length > 10 && (
                  <div className="text-red-500">...还有 {errors.length - 10} 个错误</div>
                )}
              </div>
            </div>
          )}

          {/* Data Preview */}
          {parsedData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  数据预览 ({parsedData.length} 条记录)
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setParsedData([])
                    setErrors([])
                  }}
                >
                  <X className="h-4 w-4" />
                  清空
                </Button>
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>周次</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>渠道代码</TableHead>
                      <TableHead className="text-right">数量</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 50).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs text-gray-500">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{row.week_iso}</TableCell>
                        <TableCell className="font-mono text-sm">{row.sku}</TableCell>
                        <TableCell className="font-mono text-sm">{row.channel_code}</TableCell>
                        <TableCell className="text-right">{row.qty.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {parsedData.length > 50 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                          ...还有 {parsedData.length - 50} 条记录
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={importing}>
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleImport}
            disabled={!canImport}
          >
            {importing ? '导入中...' : `确认导入 (${parsedData.length} 条)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
