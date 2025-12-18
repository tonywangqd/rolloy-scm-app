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
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader className="flex flex-col items-center text-center">
          <div className={cn('mb-4 rounded-full p-3', config.iconBg)}>
            <Icon className={cn('h-6 w-6', config.iconColor)} />
          </div>
          <AlertDialogTitle className="text-lg font-semibold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="mt-2 text-center text-sm text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requireInput && (
          <div className="mt-2 space-y-2 px-1">
            <label className="block text-center text-sm text-muted-foreground">
              请输入 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-medium">{requireInput}</code> 以确认操作
            </label>
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`输入 "${requireInput}"`}
              disabled={loading || isProcessing}
              autoFocus
              className="text-center"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isConfirmDisabled) {
                  handleConfirm()
                }
              }}
            />
          </div>
        )}

        <AlertDialogFooter className="mt-4 flex-row justify-center gap-2 sm:justify-center">
          <AlertDialogCancel disabled={loading || isProcessing} className="mt-0">
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
