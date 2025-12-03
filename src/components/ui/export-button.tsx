'use client'

import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exportToCSV, exportToExcel, type ExportColumn } from '@/lib/utils/export'

export interface ExportButtonProps {
  data: Record<string, any>[]
  filename: string
  columns?: ExportColumn[]
  variant?: 'default' | 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ExportButton({
  data,
  filename,
  columns,
  variant = 'outline',
  size = 'sm',
  className,
}: ExportButtonProps) {
  const handleExportCSV = () => {
    exportToCSV(data, filename, columns)
  }

  const handleExportExcel = () => {
    exportToExcel(data, filename, columns)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Download className="mr-2 h-4 w-4" />
          导出数据
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportCSV}>
          <FileText className="mr-2 h-4 w-4" />
          导出为 CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportExcel}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          导出为 Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
