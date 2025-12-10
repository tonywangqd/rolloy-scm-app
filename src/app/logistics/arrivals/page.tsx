import { Header } from '@/components/layout/header'
import { ArrivalsList } from '@/components/logistics/arrivals-list'
import { ArrivalsStats } from '@/components/logistics/arrivals-stats'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default async function ArrivalsPage() {
  return (
    <div className="flex flex-col">
      <Header
        title="到仓管理 (Order Arrivals)"
        description="Warehouse Arrival Records & Variance Tracking"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Statistics Cards */}
        <ArrivalsStats />

        {/* Arrivals List */}
        <ArrivalsList />
      </div>
    </div>
  )
}
