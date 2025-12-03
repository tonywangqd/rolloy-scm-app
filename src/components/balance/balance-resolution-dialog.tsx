'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { AlertTriangle } from 'lucide-react'

interface BalanceResolutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  balance: {
    id: string
    sourceType: 'po_item' | 'delivery' | 'shipment_item'
    sku: string
    productName: string
    plannedQty: number
    actualQty: number
    varianceQty: number
    openBalance: number
  }
  onResolved: () => void
}

type ResolutionAction = 'defer' | 'short_close'

export function BalanceResolutionDialog({
  open,
  onOpenChange,
  balance,
  onResolved,
}: BalanceResolutionDialogProps) {
  const [action, setAction] = useState<ResolutionAction>('defer')
  const [reason, setReason] = useState('')
  const [deferredWeek, setDeferredWeek] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    // Validation
    if (action === 'short_close' && !reason.trim()) {
      setError('取消原因为必填项 | Reason is required')
      return
    }

    if (action === 'defer' && !deferredWeek) {
      setError('请选择顺延周期 | Deferred week is required')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/balance/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balanceId: balance.id,
          action,
          deferredToWeek: action === 'defer' ? deferredWeek : null,
          reason: action === 'short_close' ? reason : null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to resolve balance')
      }

      // Success
      onResolved()
      onOpenChange(false)

      // Reset form
      setAction('defer')
      setReason('')
      setDeferredWeek('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Calculate next week as default
  const getNextWeek = () => {
    const now = new Date()
    now.setDate(now.getDate() + 7)
    const year = now.getFullYear()
    const weekNum = Math.ceil(
      ((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + 1) / 7
    )
    return `${year}-W${String(weekNum).padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            余额处理 Balance Resolution
          </DialogTitle>
          <DialogDescription>
            处理未结余额，选择顺延或取消 | Handle open balance, choose to defer or cancel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Balance Information */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">SKU</p>
                <p className="font-medium">{balance.sku}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">产品名称 Product</p>
                <p className="font-medium">{balance.productName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">预计量 Planned</p>
                <p className="font-medium">{balance.plannedQty}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">实际量 Actual</p>
                <p className="font-medium">{balance.actualQty}</p>
              </div>
            </div>
            <div className="mt-3 border-t border-gray-300 pt-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-gray-500">差额 Variance</p>
                <p className="text-2xl font-bold text-red-600">
                  {balance.openBalance} units
                </p>
              </div>
            </div>
          </div>

          {/* Action Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">
              处理方式 Resolution Action
            </Label>

            {/* Defer Option */}
            <div
              className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                action === 'defer'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setAction('defer')}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={action === 'defer'}
                  onChange={() => setAction('defer')}
                  className="mt-1 h-4 w-4 text-blue-600"
                />
                <div className="flex-1">
                  <p className="font-semibold text-blue-700">
                    推迟 Defer
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    顺延到下一周期，稍后处理 | Postpone to next period
                  </p>
                  {action === 'defer' && (
                    <div className="mt-3">
                      <Label htmlFor="deferred-week" className="text-sm">
                        顺延至周期 Defer to Week
                      </Label>
                      <Input
                        id="deferred-week"
                        type="week"
                        value={deferredWeek}
                        onChange={(e) => setDeferredWeek(e.target.value)}
                        placeholder={getNextWeek()}
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Short Close Option */}
            <div
              className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                action === 'short_close'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setAction('short_close')}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={action === 'short_close'}
                  onChange={() => setAction('short_close')}
                  className="mt-1 h-4 w-4 text-red-600"
                />
                <div className="flex-1">
                  <p className="font-semibold text-red-700">
                    取消 Short Close
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    确认不再执行，关闭余额 | Confirm will not fulfill, close balance
                  </p>
                  {action === 'short_close' && (
                    <div className="mt-3">
                      <Label htmlFor="reason" className="text-sm">
                        取消原因 Reason <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="请输入取消原因... | Enter cancellation reason..."
                        className="mt-1"
                        rows={3}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            取消 Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={
              action === 'defer'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-red-600 hover:bg-red-700'
            }
          >
            {isSubmitting
              ? '处理中... Processing...'
              : action === 'defer'
              ? '确认顺延 Confirm Defer'
              : '确认取消 Confirm Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
