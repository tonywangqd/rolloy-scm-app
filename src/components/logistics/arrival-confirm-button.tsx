'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { markShipmentArrived } from '@/lib/actions/logistics'
import { formatDate } from '@/lib/utils'
import { Package, CheckCircle } from 'lucide-react'

interface ArrivalConfirmButtonProps {
  shipmentId: string
  trackingNumber: string
  warehouseName?: string
  warehouseCode?: string
}

export function ArrivalConfirmButton({
  shipmentId,
  trackingNumber,
  warehouseName,
  warehouseCode,
}: ArrivalConfirmButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [open, setOpen] = useState(false)

  const today = formatDate(new Date().toISOString())

  const handleConfirm = () => {
    setError(null)
    setShowSuccess(false)

    startTransition(async () => {
      const result = await markShipmentArrived(shipmentId)

      if (result.success) {
        setShowSuccess(true)
        setTimeout(() => {
          setOpen(false)
          setShowSuccess(false)
        }, 2000)
      } else {
        setError(result.error || 'Failed to confirm arrival')
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-blue-600 hover:text-blue-700">
          <Package className="mr-1 h-3 w-3" />
          确认到货
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认物流到货</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium text-gray-700">
                确认物流单 <span className="font-mono">{trackingNumber}</span> 已到货？
              </p>
              <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">到货日期:</span>
                  <span className="font-medium text-gray-900">{today}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">目的仓库:</span>
                  <span className="font-medium text-gray-900">
                    {warehouseName || warehouseCode || '-'}
                    {warehouseName && warehouseCode && (
                      <span className="ml-1 font-mono text-xs text-gray-500">
                        ({warehouseCode})
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                确认后将自动更新仓库库存。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <Alert variant="danger">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {showSuccess && (
          <Alert variant="success">
            <AlertDescription className="flex items-center">
              <CheckCircle className="mr-2 h-4 w-4" />
              到货确认成功！正在刷新数据...
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={isPending || showSuccess}
          >
            {isPending ? '处理中...' : '确认到货'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
