'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteShipment } from '@/lib/actions/logistics'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface DeleteShipmentButtonProps {
  shipmentId: string
  trackingNumber: string
  hasArrived: boolean
  className?: string
}

export function DeleteShipmentButton({
  shipmentId,
  trackingNumber,
  hasArrived,
  className,
}: DeleteShipmentButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setLoading(true)
    try {
      const result = await deleteShipment(shipmentId)

      if (result.success) {
        toast.success('发运单已删除')
        router.refresh()
      } else {
        toast.error(result.error || '删除失败')
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('删除操作失败')
    } finally {
      setLoading(false)
    }
  }

  // If shipment has arrived, disable the button
  if (hasArrived) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-gray-400 cursor-not-allowed"
        disabled
        title="已到货的发运单无法删除"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        title="删除发运单"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="删除发运单"
        description={`确定要删除发运单 ${trackingNumber} 吗？此操作将同时删除所有发运明细，且无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        requireInput="DELETE"
        loading={loading}
        onConfirm={handleDelete}
      />
    </>
  )
}
