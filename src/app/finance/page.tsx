import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchPendingPayables, fetchPaymentSummary } from '@/lib/queries/finance'
import { formatCurrency, formatDate, getPaymentStatusVariant } from '@/lib/utils'
import { DollarSign, Calendar, AlertTriangle, TrendingUp, Truck, Package } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function FinancePage() {
  const [payables, summary] = await Promise.all([
    fetchPendingPayables(),
    fetchPaymentSummary(),
  ])

  return (
    <div className="flex flex-col">
      <Header
        title="资金管理"
        description="应付账款和付款计划"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <DollarSign className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">待付总额</p>
                  <p className="text-xl font-semibold">{formatCurrency(summary.total_pending)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Package className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">采购应付</p>
                  <p className="text-xl font-semibold">{formatCurrency(summary.procurement_pending)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <Truck className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">物流应付</p>
                  <p className="text-xl font-semibold">{formatCurrency(summary.logistics_pending)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-yellow-100 p-2">
                  <Calendar className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">下月到期</p>
                  <p className="text-xl font-semibold">{formatCurrency(summary.next_month_due)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className={`rounded-lg p-2 ${summary.overdue_amount > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                  <AlertTriangle className={`h-6 w-6 ${summary.overdue_amount > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">逾期金额</p>
                  <p className={`text-xl font-semibold ${summary.overdue_amount > 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(summary.overdue_amount)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payables by Month */}
        {payables.length === 0 ? (
          <Card>
            <CardContent className="flex h-32 items-center justify-center text-gray-500">
              暂无待付账款
            </CardContent>
          </Card>
        ) : (
          payables.map((monthData) => (
            <Card key={monthData.month}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {monthData.month} 应付账款
                  </CardTitle>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-purple-600">
                      采购: {formatCurrency(monthData.procurement_total)}
                    </span>
                    <span className="text-green-600">
                      物流: {formatCurrency(monthData.logistics_total)}
                    </span>
                    <span className="font-semibold">
                      合计: {formatCurrency(monthData.total)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>类型</TableHead>
                      <TableHead>单号</TableHead>
                      <TableHead>批次</TableHead>
                      <TableHead>到期日</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthData.items.map((item) => (
                      <TableRow key={`${item.type}-${item.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {item.type === 'procurement' ? (
                              <Package className="h-4 w-4 text-purple-500" />
                            ) : (
                              <Truck className="h-4 w-4 text-green-500" />
                            )}
                            {item.type === 'procurement' ? '采购' : '物流'}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.reference_number}
                        </TableCell>
                        <TableCell>{item.batch_code || '-'}</TableCell>
                        <TableCell>
                          {item.due_date ? formatDate(item.due_date) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.amount_usd)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getPaymentStatusVariant(item.payment_status)}>
                            {item.payment_status === 'Pending' ? '待付' :
                             item.payment_status === 'Scheduled' ? '已排期' : '已付'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
