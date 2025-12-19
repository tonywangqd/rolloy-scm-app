'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2 } from 'lucide-react'
import { updatePOStatus } from '@/lib/actions/procurement'

interface ConfirmPOButtonProps {
  poId: string
  poNumber: string
  className?: string
}

export function ConfirmPOButton({ poId, poNumber, className }: ConfirmPOButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleConfirm = async () => {
    if (!confirm(`确认要将订单 ${poNumber} 的状态改为"已确认"吗？\n确认后可以在交货记录中选择此订单。`)) {
      return
    }

    setLoading(true)
    try {
      const result = await updatePOStatus(poId, 'Confirmed')
      if (result.success) {
        // 使用 startTransition 让页面刷新不阻塞 UI
        startTransition(() => {
          router.refresh()
        })
      } else {
        alert(`确认失败: ${result.error}`)
      }
    } catch (error) {
      alert('确认失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const isProcessing = loading || isPending

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleConfirm}
      disabled={isProcessing}
      className={`${className} border-green-500 text-green-600 hover:bg-green-50`}
      title="确认订单后可进行交货"
    >
      {isProcessing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <CheckCircle className="h-4 w-4 mr-1" />
          确认
        </>
      )}
    </Button>
  )
}
