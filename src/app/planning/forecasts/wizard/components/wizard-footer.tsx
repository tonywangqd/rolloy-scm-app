'use client'

import { Button } from '@/components/ui/button'
import type { WizardStep } from '@/lib/types/forecast-wizard'

interface WizardFooterProps {
  currentStep: WizardStep
  onNext: () => void
  onBack: () => void
  onCancel: () => void
  isLoading: boolean
  canProceed?: boolean
}

export default function WizardFooter({
  currentStep,
  onNext,
  onBack,
  onCancel,
  isLoading,
  canProceed = true,
}: WizardFooterProps) {
  const getNextButtonText = () => {
    switch (currentStep) {
      case 1:
        return '下一步：生成预测'
      case 2:
        return '下一步：调整预测'
      case 3:
        return '下一步：验证审核'
      case 4:
        return '提交预测'
      case 5:
        return '完成'
      default:
        return '下一步'
    }
  }

  return (
    <div className="mt-8 flex items-center justify-between border-t pt-6">
      <div>
        {currentStep > 1 && currentStep < 5 && (
          <Button variant="outline" onClick={onBack} disabled={isLoading}>
            上一步
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {currentStep < 5 && (
          <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
            取消
          </Button>
        )}
        {currentStep < 5 ? (
          <Button onClick={onNext} disabled={isLoading || !canProceed}>
            {isLoading ? '处理中...' : getNextButtonText()}
          </Button>
        ) : (
          <Button onClick={onCancel}>返回预测列表</Button>
        )}
      </div>
    </div>
  )
}
