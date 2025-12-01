import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/utils'
import type { InventoryProjection12WeeksView } from '@/lib/types/database'

interface InventoryProjectionTableProps {
  data: InventoryProjection12WeeksView[]
}

export function InventoryProjectionTable({ data }: InventoryProjectionTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-gray-500">
        暂无库存预测数据
      </div>
    )
  }

  // Get badge variant based on stock status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OK':
        return { variant: 'success' as const, text: '正常' }
      case 'Risk':
        return { variant: 'warning' as const, text: '风险' }
      case 'Stockout':
        return { variant: 'danger' as const, text: '断货' }
      default:
        return { variant: 'default' as const, text: status }
    }
  }

  // Format week display (e.g., "2025-W05" -> "W05")
  const formatWeek = (weekIso: string) => {
    const parts = weekIso.split('-W')
    return parts[1] ? `W${parts[1]}` : weekIso
  }

  // Group data by SKU for better organization
  const groupedData: { sku: string; productName: string; rows: InventoryProjection12WeeksView[] }[] = []

  data.forEach((row) => {
    let group = groupedData.find((g) => g.sku === row.sku)
    if (!group) {
      group = {
        sku: row.sku,
        productName: row.product_name,
        rows: [],
      }
      groupedData.push(group)
    }
    group.rows.push(row)
  })

  return (
    <div className="rounded-lg border border-gray-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">SKU</TableHead>
            <TableHead className="w-48">产品名称</TableHead>
            <TableHead className="w-20">周次</TableHead>
            <TableHead className="text-right">期初库存</TableHead>
            <TableHead className="text-right">到货数量</TableHead>
            <TableHead className="text-right">销量</TableHead>
            <TableHead className="text-right">期末库存</TableHead>
            <TableHead className="text-right">安全库存</TableHead>
            <TableHead className="w-20">状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedData.map((group) => (
            group.rows.map((row, index) => {
              const statusBadge = getStatusBadge(row.stock_status)
              const isFirstInGroup = index === 0

              return (
                <TableRow key={`${row.sku}-${row.week_iso}`}>
                  <TableCell className="font-medium">
                    {isFirstInGroup ? row.sku : ''}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {isFirstInGroup ? row.product_name : ''}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatWeek(row.week_iso)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.opening_stock)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.incoming_qty > 0 ? (
                      <span className="text-green-600 font-medium">
                        +{formatNumber(row.incoming_qty)}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.effective_sales > 0 ? (
                      <span className="text-red-600 font-medium">
                        -{formatNumber(row.effective_sales)}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(row.closing_stock)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-500">
                    {formatNumber(row.safety_stock_threshold)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge.variant}>
                      {statusBadge.text}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
