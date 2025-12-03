/**
 * Export utility functions for downloading data as CSV/Excel files
 */

/**
 * Column definition for export
 */
export interface ExportColumn {
  key: string
  label: string
}

/**
 * Convert data to CSV format
 */
function convertToCSV(
  data: Record<string, any>[],
  columns?: ExportColumn[]
): string {
  if (data.length === 0) return ''

  // If columns not provided, use all keys from first row
  const effectiveColumns: ExportColumn[] = columns ||
    Object.keys(data[0]).map(key => ({ key, label: key }))

  // Create header row
  const headers = effectiveColumns.map(col => col.label).join(',')

  // Create data rows
  const rows = data.map(row => {
    return effectiveColumns.map(col => {
      const value = row[col.key]

      // Handle null/undefined
      if (value === null || value === undefined) return ''

      // Convert value to string
      const stringValue = String(value)

      // Escape values that contain commas, quotes, or newlines
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }

      return stringValue
    }).join(',')
  })

  return [headers, ...rows].join('\n')
}

/**
 * Download data as CSV file
 */
export function exportToCSV(
  data: Record<string, any>[],
  filename: string,
  columns?: ExportColumn[]
): void {
  if (data.length === 0) {
    alert('没有数据可导出')
    return
  }

  const csv = convertToCSV(data, columns)
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, ensureExtension(filename, '.csv'))
}

/**
 * Download data as Excel-compatible CSV file
 * Note: This creates a CSV file that Excel can open directly
 */
export function exportToExcel(
  data: Record<string, any>[],
  filename: string,
  columns?: ExportColumn[]
): void {
  if (data.length === 0) {
    alert('没有数据可导出')
    return
  }

  const csv = convertToCSV(data, columns)
  // Add UTF-8 BOM for Excel compatibility
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, ensureExtension(filename, '.csv'))
}

/**
 * Helper function to trigger file download
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  // Cleanup
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Ensure filename has correct extension
 */
function ensureExtension(filename: string, extension: string): string {
  if (!filename.endsWith(extension)) {
    return filename + extension
  }
  return filename
}
