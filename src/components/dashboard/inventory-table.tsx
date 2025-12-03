import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { InventorySummaryView } from '@/lib/types/database'

interface InventoryTableProps {
  data: InventorySummaryView[]
}

export function InventoryTable({ data }: InventoryTableProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>库存概览</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center text-gray-500">
            暂无库存数据
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>库存概览</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
                <th className="pb-3 pr-4">SKU</th>
                <th className="pb-3 pr-4">产品名称</th>
                <th className="pb-3 pr-4">SPU</th>
                <th className="pb-3 pr-4 text-right">库存数量</th>
                <th className="pb-3 pr-4 text-right">库存价值</th>
                <th className="pb-3 pr-4 text-right">仓库数</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {data.map((item) => (
                <tr
                  key={item.sku}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/inventory/algorithm-audit?sku=${item.sku}`}
                      className="inline-block hover:opacity-80 transition-opacity"
                    >
                      <Badge variant="default" className="cursor-pointer hover:bg-blue-700">
                        {item.sku}
                      </Badge>
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-gray-900">{item.product_name}</td>
                  <td className="py-3 pr-4 text-gray-500">{item.spu}</td>
                  <td className="py-3 pr-4 text-right font-medium text-gray-900">
                    {formatNumber(item.total_stock)}
                  </td>
                  <td className="py-3 pr-4 text-right text-gray-600">
                    {formatCurrency(item.stock_value_usd)}
                  </td>
                  <td className="py-3 pr-4 text-right text-gray-500">
                    {item.warehouse_count}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-medium">
                <td colSpan={3} className="pt-3 pr-4 text-gray-900">
                  合计
                </td>
                <td className="pt-3 pr-4 text-right text-gray-900">
                  {formatNumber(data.reduce((sum, item) => sum + item.total_stock, 0))}
                </td>
                <td className="pt-3 pr-4 text-right text-gray-900">
                  {formatCurrency(data.reduce((sum, item) => sum + item.stock_value_usd, 0))}
                </td>
                <td className="pt-3 pr-4 text-right text-gray-500">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
