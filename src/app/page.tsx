import { Header } from '@/components/layout/header'
import { KPICards } from '@/components/dashboard/kpi-cards'
import { InventoryTable } from '@/components/dashboard/inventory-table'
import { MasterDataStats } from '@/components/dashboard/master-data-stats'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { SalesTrendChart } from '@/components/dashboard/sales-trend-chart'
import { ChannelDistributionChart } from '@/components/dashboard/channel-distribution-chart'
import { SkuRankingChart } from '@/components/dashboard/sku-ranking-chart'
import {
  fetchDashboardKPIs,
  fetchInventorySummary,
  fetchMasterDataCounts,
} from '@/lib/queries/dashboard'
import {
  fetchWeeklySalesTrend,
  fetchSalesByChannel,
  fetchSalesBySku,
} from '@/lib/queries/charts'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Fetch data in parallel
  const [kpis, inventory, masterData, salesTrend, channelSales, skuSales] = await Promise.all([
    fetchDashboardKPIs(),
    fetchInventorySummary(),
    fetchMasterDataCounts(),
    fetchWeeklySalesTrend(),
    fetchSalesByChannel(),
    fetchSalesBySku(),
  ])

  return (
    <div className="flex flex-col">
      <Header
        title="决策总览"
        description="实时监控供应链健康状况"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* KPI Cards */}
        <KPICards data={kpis} />

        {/* Master Data Stats */}
        <MasterDataStats data={masterData} />

        {/* Charts Section */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Sales Trend Chart - Full Width on Mobile, Half on Desktop */}
          <div className="lg:col-span-2">
            <SalesTrendChart data={salesTrend} />
          </div>

          {/* Channel Distribution Chart */}
          <div>
            <ChannelDistributionChart data={channelSales} />
          </div>

          {/* SKU Ranking Chart */}
          <div>
            <SkuRankingChart data={skuSales} />
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Inventory Table - 2/3 width */}
          <div className="lg:col-span-2">
            <InventoryTable data={inventory} />
          </div>

          {/* Quick Actions - 1/3 width */}
          <div>
            <QuickActions />
          </div>
        </div>
      </div>
    </div>
  )
}
