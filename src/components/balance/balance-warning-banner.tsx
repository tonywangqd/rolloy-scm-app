import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface BalanceWarningBannerProps {
  openBalanceCount: number
  totalOpenBalance: number
  poId?: string
}

export function BalanceWarningBanner({
  openBalanceCount,
  totalOpenBalance,
  poId,
}: BalanceWarningBannerProps) {
  if (openBalanceCount === 0) return null

  return (
    <Alert className="border-yellow-200 bg-yellow-50">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600" />
          <div>
            <AlertDescription className="text-yellow-800">
              <span className="font-semibold">
                未结余额警告 Open Balance Warning
              </span>
              <p className="mt-1">
                此订单存在 {openBalanceCount} 个未结余额，共计{' '}
                <span className="font-bold">{totalOpenBalance} 件</span>未完成交付。
                <br />
                This order has {openBalanceCount} open balance(s), totaling{' '}
                <span className="font-bold">{totalOpenBalance} units</span> unfulfilled.
              </p>
            </AlertDescription>
          </div>
        </div>
        <Link href={`/inventory/balances?po=${poId || ''}`}>
          <Button variant="outline" size="sm" className="ml-4">
            查看余额 View Balances
          </Button>
        </Link>
      </div>
    </Alert>
  )
}
