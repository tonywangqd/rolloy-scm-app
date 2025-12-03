'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ExportButton } from '@/components/ui/export-button'
import { OrdersTable } from './orders-table'
import { DeliveriesTable } from './deliveries-table'
import type { POFulfillmentView, ProductionDelivery } from '@/lib/types/database'
import { formatDate } from '@/lib/utils'

interface ProcurementTabsProps {
  orders: POFulfillmentView[]
  deliveries: ProductionDelivery[]
}

export function ProcurementTabs({ orders, deliveries }: ProcurementTabsProps) {
  const [activeTab, setActiveTab] = useState('orders')

  // Prepare export data for orders
  const ordersExportData = useMemo(() => {
    return orders.map(order => ({
      '订单号': order.po_number,
      '批次': order.batch_code,
      '供应商': order.supplier_name || '-',
      '下单日期': order.actual_order_date ? formatDate(order.actual_order_date) : '-',
      '订购数量': order.total_ordered,
      '已交付': order.total_delivered,
      '完成率': `${order.fulfillment_percentage}%`,
      '状态': order.po_status,
    }))
  }, [orders])

  // Prepare export data for deliveries
  const deliveriesExportData = useMemo(() => {
    return deliveries.map(delivery => ({
      '交货编号': delivery.delivery_number,
      'SKU': delivery.sku,
      '渠道': delivery.channel_code || '-',
      '计划交货日期': delivery.planned_delivery_date ? formatDate(delivery.planned_delivery_date) : '-',
      '实际交货日期': delivery.actual_delivery_date ? formatDate(delivery.actual_delivery_date) : '-',
      '交货数量': delivery.delivered_qty,
      '单价(USD)': delivery.unit_cost_usd,
      '总价(USD)': delivery.total_value_usd || 0,
      '付款状态': delivery.payment_status === 'Paid' ? '已付款' : '待付款',
    }))
  }, [deliveries])

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className="flex items-center justify-between mb-4">
        <TabsList>
          <TabsTrigger value="orders">采购下单</TabsTrigger>
          <TabsTrigger value="deliveries">采购交货</TabsTrigger>
        </TabsList>

        {activeTab === 'orders' && orders.length > 0 && (
          <ExportButton
            data={ordersExportData}
            filename={`采购订单_${new Date().toISOString().split('T')[0]}`}
          />
        )}

        {activeTab === 'deliveries' && deliveries.length > 0 && (
          <ExportButton
            data={deliveriesExportData}
            filename={`采购交货_${new Date().toISOString().split('T')[0]}`}
          />
        )}
      </div>

      <TabsContent value="orders" className="space-y-6">
        <OrdersTable orders={orders} />
      </TabsContent>

      <TabsContent value="deliveries" className="space-y-6">
        <DeliveriesTable deliveries={deliveries} />
      </TabsContent>
    </Tabs>
  )
}
