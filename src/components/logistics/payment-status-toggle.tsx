'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { updateShipmentPaymentStatus } from '@/lib/actions/logistics'
import type { PaymentStatus } from '@/lib/types/database'
import { getPaymentStatusVariant } from '@/lib/utils'

interface PaymentStatusToggleProps {
  shipmentId: string
  currentStatus: PaymentStatus
}

const statusOrder: PaymentStatus[] = ['Pending', 'Scheduled', 'Paid']
const statusLabels: Record<PaymentStatus, string> = {
  'Pending': '待付款',
  'Scheduled': '已排期',
  'Paid': '已付款',
}

export function PaymentStatusToggle({ shipmentId, currentStatus }: PaymentStatusToggleProps) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<PaymentStatus>(currentStatus)

  const handleClick = () => {
    const currentIndex = statusOrder.indexOf(status)
    const nextIndex = (currentIndex + 1) % statusOrder.length
    const nextStatus = statusOrder[nextIndex]

    startTransition(async () => {
      const result = await updateShipmentPaymentStatus(shipmentId, nextStatus)
      if (result.success) {
        setStatus(nextStatus)
      }
    })
  }

  const opacityClass = isPending ? 'opacity-50' : 'hover:opacity-80'

  return (
    <Badge
      variant={getPaymentStatusVariant(status)}
      className={`cursor-pointer transition-opacity ${opacityClass}`}
      onClick={handleClick}
    >
      {statusLabels[status]}
    </Badge>
  )
}
