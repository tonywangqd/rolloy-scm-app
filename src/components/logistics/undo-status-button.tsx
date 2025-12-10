'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { undoShipmentArrival, undoShipmentDeparture } from '@/lib/actions/logistics'
import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'

interface UndoStatusButtonProps {
  shipmentId: string
  trackingNumber: string
  type: 'arrival' | 'departure'
  className?: string
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

export function UndoStatusButton({
  shipmentId,
  trackingNumber,
  type,
  className,
  variant = 'outline',
  size = 'md',
}: UndoStatusButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const isArrival = type === 'arrival'

  const handleUndo = async () => {
    setLoading(true)
    try {
      const result = isArrival
        ? await undoShipmentArrival(shipmentId)
        : await undoShipmentDeparture(shipmentId)

      if (result.success) {
        toast.success(
          isArrival
            ? `成功撤销到货：运单 ${trackingNumber} 已恢复为运输中状态，库存已回滚`
            : `成功撤销发运：运单 ${trackingNumber} 已恢复为待发运状态`
        )
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || '操作失败')
      }
    } catch (error) {
      console.error('Undo error:', error)
      toast.error('操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        title={isArrival ? '撤销到货' : '撤销发运'}
      >
        <Undo2 className="mr-2 h-4 w-4" />
        {isArrival ? '撤销到货' : '撤销发运'}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={isArrival ? '撤销到货确认' : '撤销发运确认'}
        description={
          isArrival
            ? `确定要撤销运单 ${trackingNumber} 的到货状态吗？\n\n此操作将：\n• 清除实际到货日期\n• 回滚库存增加记录（恢复到货前的库存状态）\n• 运单恢复为"运输中"状态\n\n此操作无法撤销。`
            : `确定要撤销运单 ${trackingNumber} 的发运状态吗？\n\n此操作将：\n• 清除实际发运日期\n• 运单恢复为"待发运"状态\n\n此操作无法撤销。`
        }
        confirmText="确认撤销"
        cancelText="取消"
        variant="warning"
        loading={loading}
        onConfirm={handleUndo}
      />
    </>
  )
}
