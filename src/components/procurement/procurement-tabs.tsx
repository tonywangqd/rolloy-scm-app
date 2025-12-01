'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { OrdersTable } from './orders-table'
import { DeliveriesTable } from './deliveries-table'
import type { POFulfillmentView, ProductionDelivery } from '@/lib/types/database'

interface ProcurementTabsProps {
  orders: POFulfillmentView[]
  deliveries: ProductionDelivery[]
}

export function ProcurementTabs({ orders, deliveries }: ProcurementTabsProps) {
  const [activeTab, setActiveTab] = useState('orders')

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="orders">采购下单</TabsTrigger>
        <TabsTrigger value="deliveries">采购交货</TabsTrigger>
      </TabsList>

      <TabsContent value="orders" className="space-y-6">
        <OrdersTable orders={orders} />
      </TabsContent>

      <TabsContent value="deliveries" className="space-y-6">
        <DeliveriesTable deliveries={deliveries} />
      </TabsContent>
    </Tabs>
  )
}
