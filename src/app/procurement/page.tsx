import { Header } from '@/components/layout/header'
import { ProcurementTabs } from '@/components/procurement/procurement-tabs'
import { fetchPurchaseOrders, fetchAllDeliveries } from '@/lib/queries/procurement'

export const dynamic = 'force-dynamic'

export default async function ProcurementPage() {
  const [orders, deliveries] = await Promise.all([
    fetchPurchaseOrders(),
    fetchAllDeliveries(),
  ])

  return (
    <div className="flex flex-col">
      <Header
        title="采购管理"
        description="管理采购订单和生产交付"
      />

      <div className="flex-1 space-y-6 p-6">
        <ProcurementTabs orders={orders} deliveries={deliveries} />
      </div>
    </div>
  )
}
