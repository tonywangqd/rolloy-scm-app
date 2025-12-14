'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { WeeklyProjection, StockStatusType, SkuTierCode, RiskHeatmapCell } from '@/lib/types/simulation'
import { cn } from '@/lib/utils'

interface RiskHeatmapProps {
  projections: WeeklyProjection[]
  tierFilter?: SkuTierCode[]
}

const STATUS_COLORS: Record<StockStatusType, string> = {
  OK: 'bg-green-500',
  Risk: 'bg-amber-400',
  Stockout: 'bg-red-500',
}

const STATUS_HOVER_COLORS: Record<StockStatusType, string> = {
  OK: 'hover:bg-green-600',
  Risk: 'hover:bg-amber-500',
  Stockout: 'hover:bg-red-600',
}

export function RiskHeatmap({ projections, tierFilter }: RiskHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ sku: string; week: string } | null>(null)
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null)

  // Extract weeks and SKUs
  const { weeks, skuData, heatmapData } = useMemo(() => {
    if (!projections.length) {
      return { weeks: [], skuData: [], heatmapData: new Map<string, RiskHeatmapCell>() }
    }

    // Get all weeks
    const weeks = projections.map((p) => ({
      iso: p.week_iso,
      label: p.week_iso.split('-W')[1] ? `W${p.week_iso.split('-W')[1]}` : p.week_iso,
    }))

    // Get unique SKUs with their info
    const skuMap = new Map<string, { name: string; tier: SkuTierCode }>()
    projections.forEach((week) => {
      week.projections.forEach((p) => {
        if (!skuMap.has(p.sku)) {
          skuMap.set(p.sku, { name: p.product_name, tier: p.sku_tier })
        }
      })
    })

    // Filter by tier if specified
    const skuData = Array.from(skuMap.entries())
      .filter(([_, info]) => !tierFilter || tierFilter.includes(info.tier))
      .map(([sku, info]) => ({ sku, ...info }))
      .sort((a, b) => {
        // Sort by tier priority first, then by SKU name
        const tierOrder: Record<SkuTierCode, number> = { HERO: 0, STANDARD: 1, ACCESSORY: 2 }
        if (tierOrder[a.tier] !== tierOrder[b.tier]) {
          return tierOrder[a.tier] - tierOrder[b.tier]
        }
        return a.sku.localeCompare(b.sku)
      })

    // Build heatmap data
    const heatmapData = new Map<string, RiskHeatmapCell>()
    projections.forEach((week) => {
      week.projections.forEach((p) => {
        const key = `${p.sku}-${week.week_iso}`
        heatmapData.set(key, {
          sku: p.sku,
          week_iso: week.week_iso,
          stock_status: p.stock_status,
          closing_stock: p.closing_stock,
          safety_threshold: p.safety_threshold,
        })
      })
    })

    return { weeks, skuData, heatmapData }
  }, [projections, tierFilter])

  // Calculate summary statistics
  const summary = useMemo(() => {
    let okCount = 0
    let riskCount = 0
    let stockoutCount = 0

    heatmapData.forEach((cell) => {
      switch (cell.stock_status) {
        case 'OK':
          okCount++
          break
        case 'Risk':
          riskCount++
          break
        case 'Stockout':
          stockoutCount++
          break
      }
    })

    const total = okCount + riskCount + stockoutCount
    return {
      ok: okCount,
      risk: riskCount,
      stockout: stockoutCount,
      total,
      okPercent: total > 0 ? Math.round((okCount / total) * 100) : 0,
      riskPercent: total > 0 ? Math.round((riskCount / total) * 100) : 0,
      stockoutPercent: total > 0 ? Math.round((stockoutCount / total) * 100) : 0,
    }
  }, [heatmapData])

  // Get cell data
  const getCell = (sku: string, week: string): RiskHeatmapCell | undefined => {
    return heatmapData.get(`${sku}-${week}`)
  }

  if (!projections.length || !skuData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Heatmap</CardTitle>
          <CardDescription>SKU stock status by week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-60 items-center justify-center text-gray-500">
            Run a simulation to see the risk heatmap
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Risk Heatmap</CardTitle>
            <CardDescription>
              Stock status by SKU and week ({skuData.length} SKUs x {weeks.length} weeks)
            </CardDescription>
          </div>
          {/* Summary stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span className="text-gray-600">{summary.okPercent}% OK</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-amber-400" />
              <span className="text-gray-600">{summary.riskPercent}% Risk</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span className="text-gray-600">{summary.stockoutPercent}% Stockout</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 p-2 border-b border-gray-200 min-w-[150px]">
                  SKU
                </th>
                {weeks.map((week) => (
                  <th
                    key={week.iso}
                    className="text-center text-xs font-medium text-gray-500 p-1 border-b border-gray-200 min-w-[40px]"
                  >
                    {week.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skuData.map((sku) => (
                <tr
                  key={sku.sku}
                  className={cn(
                    'transition-colors',
                    selectedSKU === sku.sku && 'bg-blue-50'
                  )}
                  onClick={() => setSelectedSKU(selectedSKU === sku.sku ? null : sku.sku)}
                >
                  <td className="p-2 border-b border-gray-100 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-xs font-medium',
                          sku.tier === 'HERO'
                            ? 'bg-purple-100 text-purple-700'
                            : sku.tier === 'STANDARD'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                        )}
                      >
                        {sku.tier.charAt(0)}
                      </span>
                      <span className="font-medium text-gray-900 truncate max-w-[100px]">
                        {sku.sku}
                      </span>
                    </div>
                  </td>
                  {weeks.map((week) => {
                    const cell = getCell(sku.sku, week.iso)
                    const isHovered =
                      hoveredCell?.sku === sku.sku && hoveredCell?.week === week.iso

                    return (
                      <td
                        key={week.iso}
                        className="p-1 border-b border-gray-100"
                        onMouseEnter={() => setHoveredCell({ sku: sku.sku, week: week.iso })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div className="relative">
                          <div
                            className={cn(
                              'w-6 h-6 rounded-sm mx-auto cursor-pointer transition-all',
                              cell ? STATUS_COLORS[cell.stock_status] : 'bg-gray-200',
                              cell && STATUS_HOVER_COLORS[cell.stock_status],
                              isHovered && 'ring-2 ring-blue-500 ring-offset-1'
                            )}
                          />
                          {/* Tooltip */}
                          {isHovered && cell && (
                            <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                              <p className="font-semibold">{sku.sku}</p>
                              <p className="text-gray-300">{week.iso}</p>
                              <div className="mt-1 pt-1 border-t border-gray-700">
                                <p>
                                  Status:{' '}
                                  <span
                                    className={cn(
                                      'font-medium',
                                      cell.stock_status === 'OK'
                                        ? 'text-green-400'
                                        : cell.stock_status === 'Risk'
                                          ? 'text-amber-400'
                                          : 'text-red-400'
                                    )}
                                  >
                                    {cell.stock_status}
                                  </span>
                                </p>
                                <p>Stock: {cell.closing_stock.toLocaleString()}</p>
                                <p>Safety: {cell.safety_threshold.toLocaleString()}</p>
                              </div>
                              {/* Arrow */}
                              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900" />
                            </div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Selected SKU detail */}
        {selectedSKU && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  {selectedSKU} -{' '}
                  {skuData.find((s) => s.sku === selectedSKU)?.name}
                </p>
                <p className="text-sm text-gray-500">
                  Tier: {skuData.find((s) => s.sku === selectedSKU)?.tier}
                </p>
              </div>
              <button
                onClick={() => setSelectedSKU(null)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear selection
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
