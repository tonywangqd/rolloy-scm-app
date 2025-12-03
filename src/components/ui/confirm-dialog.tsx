'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  requireInput?: string
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  requireInput,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Reset input when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setInputValue('')
      setIsProcessing(false)
    }
    onOpenChange(newOpen)
  }

  const handleConfirm = async () => {
    setIsProcessing(true)
    try {
      await onConfirm()
      handleOpenChange(false)
    } catch (error) {
      // Error handling is done by the caller
      console.error('Confirm action failed:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // Check if confirm button should be disabled
  const isConfirmDisabled =
    loading ||
    isProcessing ||
    (requireInput !== undefined && inputValue !== requireInput)

  // Get variant styles
  const variantConfig = {
    danger: {
      icon: AlertCircle,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      buttonVariant: 'danger' as const,
      buttonClass: '',
    },
    warning: {
      icon: AlertTriangle,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      buttonVariant: 'default' as const,
      buttonClass: 'bg-orange-500 hover:bg-orange-600 text-white',
    },
    info: {
      icon: Info,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      buttonVariant: 'primary' as const,
      buttonClass: '',
    },
  }

  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className={cn('rounded-full p-2', config.iconBg)}>
              <Icon className={cn('h-6 w-6', config.iconColor)} />
            </div>
            <div className="flex-1">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-2">
                {description}
              </AlertDialogDescription>

              {requireInput && (
                <div className="mt-4 space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    请输入 <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm">{requireInput}</code> 以确认操作
                  </label>
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={`输入 "${requireInput}"`}
                    disabled={loading || isProcessing}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isConfirmDisabled) {
                        handleConfirm()
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading || isProcessing}>
            {cancelText}
          </AlertDialogCancel>
          <Button
            variant={config.buttonVariant}
            className={config.buttonClass}
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            {loading || isProcessing ? '处理中...' : confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
