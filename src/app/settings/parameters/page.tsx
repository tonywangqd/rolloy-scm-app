import { Header } from '@/components/layout/header'
import { LeadTimeSettings } from '@/components/settings/lead-time-settings'
import { ThresholdSettings } from '@/components/settings/threshold-settings'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default async function SystemParametersPage() {
  return (
    <div className="flex flex-col">
      <Header
        title="系统参数配置 (System Parameters)"
        description="Supply Chain Lead Times & Alert Thresholds"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Lead Time Settings */}
        <LeadTimeSettings />

        {/* Threshold Settings */}
        <ThresholdSettings />
      </div>
    </div>
  )
}
