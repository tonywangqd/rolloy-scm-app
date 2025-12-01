import { Header } from '@/components/layout/header'
import { RiskSummaryCards } from '@/components/planning/risk-summary-cards'
import { InventoryProjectionPageClient } from './page-client'
import {
  fetchInventoryProjection12Weeks,
  fetchRiskSummary,
  fetchReplenishmentSuggestions,
} from '@/lib/queries/inventory-projection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function InventoryProjectionPage() {
  let projections: any[] = []
  let riskStats: any = null
  let suggestions: any[] = []
  let error: string | null = null

  try {
    // Fetch data in parallel
    const [projectionsData, statsData, suggestionsData] = await Promise.all([
      fetchInventoryProjection12Weeks(),
      fetchRiskSummary(),
      fetchReplenishmentSuggestions(),
    ])

    projections = projectionsData
    riskStats = statsData
    suggestions = suggestionsData
  } catch (err: any) {
    console.error('Error loading inventory projection data:', err)
    error = err.message || '加载数据失败'

    // Check if the error is due to missing view
    if (
      err.message?.includes('relation') ||
      err.message?.includes('does not exist') ||
      err.message?.includes('view')
    ) {
      error = '数据库视图尚未创建。请先运行 Supabase 迁移脚本创建视图。'
    }
  }

  // Extract unique SKUs for filter
  const uniqueSkus = Array.from(new Set(projections.map((p) => p.sku))).sort()

  // Default risk stats if error
  const defaultRiskStats = {
    total_skus: 0,
    ok_count: 0,
    risk_count: 0,
    stockout_count: 0,
    critical_priority_count: 0,
    high_priority_count: 0,
    overdue_count: 0,
  }

  return (
    <div className="flex flex-col">
      <Header
        title="库存预测"
        description="未来 12 周库存预测与风险分析"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Error Message */}
        {error && (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>提示:</strong> {error}
              {error.includes('视图') && (
                <div className="mt-2">
                  <p className="text-sm">请运行以下命令创建数据库视图:</p>
                  <pre className="mt-2 rounded bg-gray-100 p-2 text-xs">
                    supabase migration up
                  </pre>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Risk Summary Cards */}
        <RiskSummaryCards stats={riskStats || defaultRiskStats} />

        {/* Main Content - Use Client Component for interactive features */}
        {projections.length > 0 ? (
          <InventoryProjectionPageClient
            projections={projections}
            suggestions={suggestions}
            uniqueSkus={uniqueSkus}
          />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-500">
            <div className="text-center">
              <p className="text-lg font-medium">暂无库存预测数据</p>
              <p className="mt-2 text-sm">
                {error
                  ? '请先创建数据库视图并录入基础数据'
                  : '请先录入产品、仓库、销量预测和采购订单数据'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
