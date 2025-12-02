'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatCurrencyCNY, formatDate, getPaymentStatusVariant } from '@/lib/utils'
import { Calendar, Package, Truck } from 'lucide-react'
import { BatchPaymentForm } from '@/components/finance/batch-payment-form'
import type { ProcurementPaymentGroup, LogisticsPaymentGroup } from '@/lib/queries/finance'

interface FinanceTabsProps {
  procurementPayments: ProcurementPaymentGroup[]
  logisticsPayments: LogisticsPaymentGroup[]
}

export function FinanceTabs({ procurementPayments, logisticsPayments }: FinanceTabsProps) {
  const [activeTab, setActiveTab] = useState('procurement')

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="procurement">
          <Package className="mr-2 h-4 w-4" />
          采购付款 (USD)
        </TabsTrigger>
        <TabsTrigger value="logistics">
          <Truck className="mr-2 h-4 w-4" />
          物流付款 (CNY)
        </TabsTrigger>
      </TabsList>

      {/* Procurement Tab */}
      <TabsContent value="procurement" className="space-y-6 mt-6">
        {/* Batch Payment Form */}
        <BatchPaymentForm type="procurement" />

        {/* Procurement Payments by Month */}
        {procurementPayments.length === 0 ? (
          <Card>
            <CardContent className="flex h-32 items-center justify-center text-gray-500">
              暂无待付采购款
            </CardContent>
          </Card>
        ) : (
          procurementPayments.map((monthData) => (
            <Card key={monthData.payment_month}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {monthData.payment_month} 应付采购款
                  </CardTitle>
                  <div className="text-lg font-semibold text-purple-600">
                    {formatCurrency(monthData.total_usd)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>交货单号</TableHead>
                      <TableHead>PO号</TableHead>
                      <TableHead>供应商</TableHead>
                      <TableHead>交货日期</TableHead>
                      <TableHead>付款日期</TableHead>
                      <TableHead className="text-right">金额 (USD)</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthData.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.delivery_number}
                        </TableCell>
                        <TableCell>{item.po_number}</TableCell>
                        <TableCell>{item.supplier_name}</TableCell>
                        <TableCell>{formatDate(item.delivery_date)}</TableCell>
                        <TableCell>{formatDate(item.payment_date)}</TableCell>
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
      </TabsContent>

      {/* Logistics Tab */}
      <TabsContent value="logistics" className="space-y-6 mt-6">
        {/* Batch Payment Form */}
        <BatchPaymentForm type="logistics" />

        {/* Logistics Payments by Period */}
        {logisticsPayments.length === 0 ? (
          <Card>
            <CardContent className="flex h-32 items-center justify-center text-gray-500">
              暂无待付物流款
            </CardContent>
          </Card>
        ) : (
          logisticsPayments.map((periodData) => (
            <Card key={periodData.payment_period}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {periodData.payment_period} 应付物流款
                    <span className="text-sm text-gray-500 font-normal ml-2">
                      (付款日: {formatDate(periodData.payment_date)})
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-green-600">
                      {formatCurrencyCNY(periodData.total_cny)}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({formatCurrency(periodData.total_usd)})
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>运单号</TableHead>
                      <TableHead>到货日期</TableHead>
                      <TableHead>付款日期</TableHead>
                      <TableHead className="text-right">金额 (CNY)</TableHead>
                      <TableHead className="text-right">金额 (USD)</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodData.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.tracking_number}
                        </TableCell>
                        <TableCell>{formatDate(item.arrival_date)}</TableCell>
                        <TableCell>{formatDate(item.payment_date)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrencyCNY(item.amount_cny)}
                        </TableCell>
                        <TableCell className="text-right text-gray-500">
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
      </TabsContent>
    </Tabs>
  )
}
