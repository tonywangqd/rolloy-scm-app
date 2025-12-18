'use client'

import type { WizardStep } from '@/lib/types/forecast-wizard'

interface WizardHeaderProps {
  currentStep: WizardStep
}

const steps = [
  { number: 1, title: '选择范围', description: 'SKU/渠道/周次' },
  { number: 2, title: '选择方法', description: 'AI 预测算法' },
  { number: 3, title: '批量调整', description: '编辑预测值' },
  { number: 4, title: '验证审核', description: '检查异常' },
  { number: 5, title: '完成', description: '保存预测' },
]

export default function WizardHeader({ currentStep }: WizardHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold mb-6">销量预测向导</h1>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                  currentStep === step.number
                    ? 'bg-primary text-primary-foreground'
                    : currentStep > step.number
                    ? 'bg-green-600 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {currentStep > step.number ? '✓' : step.number}
              </div>
              <div className="mt-2 text-center">
                <div className="text-sm font-medium">{step.title}</div>
                <div className="text-xs text-muted-foreground">{step.description}</div>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-2 transition-colors ${
                  currentStep > step.number ? 'bg-green-600' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
