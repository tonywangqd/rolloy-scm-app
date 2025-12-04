'use client'

import { useState, useEffect } from 'react'
import { BalanceSummaryCards } from '@/components/inventory/balance/balance-summary-cards'
import { OpenBalanceList } from '@/components/inventory/balance/open-balance-list'
import { BalanceResolutionDialog } from '@/components/inventory/balance/balance-resolution-dialog'
import { Package } from 'lucide-react'

interface BalanceResolution {
  id: string
  sku: string
  productName: string
  sourceType: 'po_item' | 'delivery' | 'shipment_item'
  plannedQty: number
  actualQty: number
  varianceQty: number
  openBalance: number
  status: 'pending' | 'deferred' | 'short_closed' | 'fulfilled'
  createdAt: string
}

export default function BalancesPage() {
  const [balances, setBalances] = useState<BalanceResolution[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedBalance, setSelectedBalance] = useState<BalanceResolution | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Fetch balances
  const fetchBalances = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/balance/list')
      if (!response.ok) throw new Error('Failed to fetch balances')
      const data = await response.json()
      setBalances(data.balances || [])
    } catch (error) {
      console.error('Error fetching balances:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchBalances()
  }, [])

  // Calculate summary
  const summary = {
    totalPending: balances.filter((b) => b.status === 'pending').length,
    totalDeferred: balances.filter((b) => b.status === 'deferred').length,
    pendingByType: {
      poItem: balances.filter(
        (b) => b.sourceType === 'po_item' && (b.status === 'pending' || b.status === 'deferred')
      ).length,
      delivery: balances.filter(
        (b) => b.sourceType === 'delivery' && (b.status === 'pending' || b.status === 'deferred')
      ).length,
      shipmentItem: balances.filter(
        (b) => b.sourceType === 'shipment_item' && (b.status === 'pending' || b.status === 'deferred')
      ).length,
    },
  }

  const handleResolve = (balance: BalanceResolution) => {
    setSelectedBalance(balance)
    setDialogOpen(true)
  }

  const handleResolved = () => {
    // Refresh balances list
    fetchBalances()
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-gray-500">加载中... Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-blue-100 p-3">
          <Package className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            未结余额管理
          </h1>
          <p className="text-sm text-gray-500">
            Open Balance Management
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <BalanceSummaryCards summary={summary} />

      {/* Balance List */}
      <OpenBalanceList balances={balances} onResolve={handleResolve} />

      {/* Resolution Dialog */}
      {selectedBalance && (
        <BalanceResolutionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          balance={selectedBalance}
          onResolved={handleResolved}
        />
      )}
    </div>
  )
}
