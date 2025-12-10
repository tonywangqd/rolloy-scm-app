import { Header } from '@/components/layout/header'
import { PSITable } from '@/components/inventory/psi-table'
import { PSIFilters } from '@/components/inventory/psi-filters'
import { PSISummaryCards } from '@/components/inventory/psi-summary-cards'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default async function PSITablePage() {
  return (
    <div className="flex flex-col">
      <Header
        title="PSI周报表 (进销存)"
        description="Production-Sales-Inventory Weekly Table"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Summary Cards */}
        <PSISummaryCards />

        {/* Filters */}
        <PSIFilters />

        {/* PSI Table */}
        <PSITable />
      </div>
    </div>
  )
}
