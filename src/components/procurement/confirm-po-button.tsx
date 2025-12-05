'use client'

import { useState } from 'react'
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

  const handleConfirm = async () => {
    if (!confirm(`确认要将订单 ${poNumber} 的状态改为"已确认"吗？\n确认后可以在交货记录中选择此订单。`)) {
      return
    }

    setLoading(true)
    try {
      const result = await updatePOStatus(poId, 'Confirmed')
      if (result.success) {
        router.refresh()
      } else {
        alert(`确认失败: ${result.error}`)
      }
    } catch (error) {
      alert('确认失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleConfirm}
      disabled={loading}
      className={className}
      title="确认订单"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CheckCircle className="h-4 w-4 text-green-600" />
      )}
    </Button>
  )
}
