'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'

interface Props {
  savedCount: number
  sku: string
}

export default function StepConfirmation({ savedCount, sku }: Props) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-green-600" />
          </div>
          <CardTitle className="text-center text-2xl">预测保存成功</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">
              已成功保存 <strong>{savedCount}</strong> 周的销量预测
            </p>
            <p className="text-sm text-muted-foreground">
              SKU: <strong>{sku}</strong>
            </p>
            <div className="pt-4 text-sm text-muted-foreground">
              您可以返回预测列表查看已保存的预测数据，或创建新的预测。
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
