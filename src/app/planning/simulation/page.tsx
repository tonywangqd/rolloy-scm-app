import { Metadata } from 'next'
import { SimulationPlayground } from '@/components/simulation'

export const metadata: Metadata = {
  title: 'Simulation Playground | Rolloy SCM',
  description: 'What-if analysis and scenario planning for supply chain decisions',
}

export default function SimulationPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Simulation Playground</h1>
          <p className="text-sm text-gray-500 mt-1">
            Model different scenarios to optimize inventory and cash flow decisions
          </p>
        </div>
      </div>

      {/* Main Content */}
      <SimulationPlayground />
    </div>
  )
}
