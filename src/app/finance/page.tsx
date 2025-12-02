import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import {
  fetchProcurementPayments,
  fetchLogisticsPayments,
  fetchPaymentSummary,
} from '@/lib/queries/finance'
import { formatCurrency, formatCurrencyCNY } from '@/lib/utils'
import { DollarSign, Calendar, AlertTriangle, Package, Truck } from 'lucide-react'
import { FinanceTabs } from '@/components/finance/finance-tabs'

export const dynamic = 'force-dynamic'

export default async function FinancePage() {
  const [procurementPayments, logisticsPayments, summary] = await Promise.all([
    fetchProcurementPayments(),
    fetchLogisticsPayments(),
    fetchPaymentSummary(),
  ])

  return (
    <div className="flex flex-col">
      <Header
        title="资金管理"
        description="应付账款和付款计划管理"
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
                  <p className="text-xl font-semibold">{formatCurrency(summary.total_pending_usd)}</p>
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
                  <p className="text-sm text-gray-500">采购应付 (USD)</p>
                  <p className="text-xl font-semibold">{formatCurrency(summary.procurement_pending_usd)}</p>
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
                  <p className="text-sm text-gray-500">物流应付 (CNY)</p>
                  <p className="text-xl font-semibold">{formatCurrencyCNY(summary.logistics_pending_cny)}</p>
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
                  <p className="text-xl font-semibold">{formatCurrency(summary.next_month_due_usd)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className={`rounded-lg p-2 ${summary.overdue_amount_usd > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                  <AlertTriangle className={`h-6 w-6 ${summary.overdue_amount_usd > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">逾期金额</p>
                  <p className={`text-xl font-semibold ${summary.overdue_amount_usd > 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(summary.overdue_amount_usd)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Finance Tabs */}
        <FinanceTabs
          procurementPayments={procurementPayments}
          logisticsPayments={logisticsPayments}
        />
      </div>
    </div>
  )
}
