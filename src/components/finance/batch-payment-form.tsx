'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { batchMarkProcurementPaid, batchMarkLogisticsPaid } from '@/lib/actions/finance'

interface BatchPaymentFormProps {
  type: 'procurement' | 'logistics'
}

export function BatchPaymentForm({ type }: BatchPaymentFormProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message: string
    details?: string
  } | null>(null)

  const handleSubmit = async () => {
    if (!input.trim()) {
      setResult({
        success: false,
        message: '请输入单号',
      })
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      const response = type === 'procurement'
        ? await batchMarkProcurementPaid(input)
        : await batchMarkLogisticsPaid(input)

      if (response.success) {
        setResult({
          success: true,
          message: `成功标记 ${response.updated} 条记录为已付款`,
          details: response.details,
        })
        setInput('') // Clear input on success
      } else {
        setResult({
          success: false,
          message: response.error || '操作失败',
          details: response.details,
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: '操作失败，请重试',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const placeholder = type === 'procurement'
    ? 'DEL-2025-001\nDEL-2025-002\nDEL-2025-003\n...'
    : 'TRK-2025-001\nTRK-2025-002\nTRK-2025-003\n...'

  const title = type === 'procurement' ? '批量标记采购付款' : '批量标记物流付款'
  const description = type === 'procurement'
    ? '粘贴交货单号（每行一个），系统会自动标记为已付款'
    : '粘贴运单号（每行一个），系统会自动标记为已付款'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          className="font-mono text-sm"
        />

        <Button
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              处理中...
            </>
          ) : (
            '确认付款'
          )}
        </Button>

        {result && (
          <Alert variant={result.success ? 'default' : 'danger' as any}>
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
              )}
              <div className="flex-1">
                <AlertDescription>
                  <p className="font-medium">{result.message}</p>
                  {result.details && (
                    <p className="text-sm mt-1 text-gray-600">{result.details}</p>
                  )}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
