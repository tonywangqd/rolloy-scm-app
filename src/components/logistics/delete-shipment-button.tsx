'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteShipment, forceDeleteShipment } from '@/lib/actions/logistics'
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
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setLoading(true)
    try {
      const result = await deleteShipment(shipmentId)

      if (result.success) {
        toast.success(result.message || '发运单已删除')
        setOpen(false)
        router.refresh()
      } else {
        // If arrived and cannot delete, show force delete option
        if (hasArrived && result.error?.includes('已到货')) {
          setOpen(false)
          setForceDeleteOpen(true)
        } else {
          toast.error(result.error || '删除失败')
        }
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('删除操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleForceDelete = async () => {
    setLoading(true)
    try {
      const result = await forceDeleteShipment(shipmentId)

      if (result.success) {
        toast.success(result.message || '发运单已强制删除，库存已回滚')
        setForceDeleteOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || '强制删除失败')
      }
    } catch (error) {
      console.error('Force delete error:', error)
      toast.error('强制删除操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        title={hasArrived ? '删除已到货运单（需先撤销到货或强制删除）' : '删除发运单'}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* Normal delete confirmation */}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="删除发运单"
        description={
          hasArrived
            ? `注意：运单 ${trackingNumber} 已到货，库存已更新。\n\n删除此运单需要先撤销到货状态，或使用强制删除（将自动回滚库存）。`
            : `确定要删除发运单 ${trackingNumber} 吗？\n\n此操作将同时删除所有发运明细和关联的生产交付分配记录，且无法撤销。`
        }
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        requireInput={hasArrived ? undefined : 'DELETE'}
        loading={loading}
        onConfirm={handleDelete}
      />

      {/* Force delete confirmation */}
      <ConfirmDialog
        open={forceDeleteOpen}
        onOpenChange={setForceDeleteOpen}
        title="⚠️ 强制删除已到货运单"
        description={`您即将强制删除运单 ${trackingNumber}，此操作将：

• 自动回滚库存（扣减到货时增加的库存数量）
• 删除运单及所有关联的发运明细
• 释放关联的生产交付记录

⚠️ 警告：此操作无法撤销！

如果只是想修改运单信息，建议先撤销到货状态，修改后再重新确认到货。

请输入"FORCE DELETE"以确认强制删除：`}
        confirmText="强制删除"
        cancelText="取消"
        variant="danger"
        requireInput="FORCE DELETE"
        loading={loading}
        onConfirm={handleForceDelete}
      />
    </>
  )
}
