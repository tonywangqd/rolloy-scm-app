'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deletePurchaseOrder } from '@/lib/actions/procurement'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface DeletePOButtonProps {
  poId: string
  poNumber: string
  className?: string
}

export function DeletePOButton({ poId, poNumber, className }: DeletePOButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setLoading(true)
    try {
      const result = await deletePurchaseOrder(poId)

      if (result.success) {
        toast.success('采购订单已删除')
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

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        title="删除采购订单"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="删除采购订单"
        description={`确定要删除采购订单 ${poNumber} 吗？此操作将同时删除所有订单明细和相关数据，且无法撤销。`}
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
