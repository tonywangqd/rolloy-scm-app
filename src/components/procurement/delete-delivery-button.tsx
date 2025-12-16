'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
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
import { deleteDelivery } from '@/lib/actions/procurement'
import { toast } from 'sonner'
import type { PaymentStatus } from '@/lib/types/database'

interface DeleteDeliveryButtonProps {
  deliveryId: string
  deliveryNumber: string
  paymentStatus: PaymentStatus
  disabled?: boolean
  disabledReason?: string
  onSuccess?: () => void
}

export function DeleteDeliveryButton({
  deliveryId,
  deliveryNumber,
  paymentStatus,
  disabled = false,
  disabledReason,
  onSuccess,
}: DeleteDeliveryButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Disable delete if payment status is not Pending
  const isDisabled = disabled || paymentStatus === 'Paid' || paymentStatus === 'Scheduled'

  const getDisabledReason = () => {
    if (disabledReason) return disabledReason
    if (paymentStatus === 'Paid') return '已支付的交货记录不能删除'
    if (paymentStatus === 'Scheduled') return '已排期的交货记录不能删除'
    return undefined
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteDelivery(deliveryId)

      if (result.success) {
        toast.success('删除成功', {
          description: `交货记录 ${deliveryNumber} 已删除`,
        })
        setOpen(false)

        if (onSuccess) {
          onSuccess()
        } else {
          router.refresh()
        }
      } else {
        toast.error('删除失败', {
          description: result.error || '未知错误',
        })
      }
    } catch (error) {
      toast.error('删除失败', {
        description: error instanceof Error ? error.message : '未知错误',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const buttonContent = (
    <Button
      variant="ghost"
      size="sm"
      disabled={isDisabled || isDeleting}
      className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )

  // If disabled, show button with title tooltip (native HTML title attribute)
  if (isDisabled) {
    return (
      <div title={getDisabledReason()}>
        {buttonContent}
      </div>
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {buttonContent}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除交货记录</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-2">
              <p>
                您确定要删除交货记录 <strong className="font-semibold text-gray-900">{deliveryNumber}</strong> 吗？
              </p>
              <p className="text-amber-600">
                此操作将：
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>从系统中永久删除该交货记录</li>
                <li>重新计算采购订单的已交付数量</li>
                <li>恢复订单的剩余未规划数量</li>
              </ul>
              <p className="font-medium text-red-600 mt-3">
                此操作不可撤销，请谨慎操作！
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? '删除中...' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
