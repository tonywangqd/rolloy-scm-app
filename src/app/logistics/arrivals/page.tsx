import { Header } from '@/components/layout/header'
import { ArrivalsList } from '@/components/logistics/arrivals-list'
import { ArrivalsStats } from '@/components/logistics/arrivals-stats'
import { fetchArrivedShipments, fetchArrivalsStats } from '@/lib/queries/logistics'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default async function ArrivalsPage() {
  // Fetch real data from shipments table
  const [arrivals, stats] = await Promise.all([
    fetchArrivedShipments(),
    fetchArrivalsStats(),
  ])

  return (
    <div className="flex flex-col">
      <Header
        title="到仓管理 (Arrivals)"
        description="已到仓发货单追踪与分析"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Statistics Cards */}
        <ArrivalsStats stats={stats} />

        {/* Arrivals List */}
        <ArrivalsList arrivals={arrivals} />
      </div>
    </div>
  )
}
