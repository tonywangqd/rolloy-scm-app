'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface AlertDialogContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | undefined>(undefined)

function useAlertDialog() {
  const context = React.useContext(AlertDialogContext)
  if (!context) {
    throw new Error('useAlertDialog must be used within AlertDialog')
  }
  return context
}

interface AlertDialogProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AlertDialog({ children, open: controlledOpen, onOpenChange }: AlertDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)

  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen
  const setOpen = onOpenChange || setUncontrolledOpen

  return (
    <AlertDialogContext.Provider value={{ open, setOpen }}>
      {children}
    </AlertDialogContext.Provider>
  )
}

interface AlertDialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

export function AlertDialogTrigger({ children, asChild, ...props }: AlertDialogTriggerProps) {
  const { setOpen } = useAlertDialog()

  if (asChild && React.isValidElement(children)) {
    const childElement = children as React.ReactElement<any>
    return React.cloneElement(childElement, {
      onClick: (e: React.MouseEvent) => {
        setOpen(true)
        childElement.props.onClick?.(e)
      },
    })
  }

  return (
    <button onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  )
}

interface AlertDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AlertDialogContent({ children, className, ...props }: AlertDialogContentProps) {
  const { open, setOpen } = useAlertDialog()

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            'relative w-full max-w-lg rounded-lg bg-white p-6 shadow-lg',
            className
          )}
          onClick={(e) => e.stopPropagation()}
          {...props}
        >
          {children}
        </div>
      </div>
    </>
  )
}

interface AlertDialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AlertDialogHeader({ children, className, ...props }: AlertDialogHeaderProps) {
  return (
    <div className={cn('mb-4', className)} {...props}>
      {children}
    </div>
  )
}

interface AlertDialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function AlertDialogTitle({ children, className, ...props }: AlertDialogTitleProps) {
  return (
    <h2 className={cn('text-lg font-semibold', className)} {...props}>
      {children}
    </h2>
  )
}

interface AlertDialogDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AlertDialogDescription({ children, className, ...props }: AlertDialogDescriptionProps) {
  return (
    <div className={cn('text-sm text-gray-600', className)} {...props}>
      {children}
    </div>
  )
}

interface AlertDialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AlertDialogFooter({ children, className, ...props }: AlertDialogFooterProps) {
  return (
    <div className={cn('mt-6 flex justify-end space-x-2', className)} {...props}>
      {children}
    </div>
  )
}

interface AlertDialogCancelProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function AlertDialogCancel({ children, onClick, ...props }: AlertDialogCancelProps) {
  const { setOpen } = useAlertDialog()

  return (
    <Button
      variant="outline"
      onClick={(e) => {
        setOpen(false)
        onClick?.(e)
      }}
      {...props}
    >
      {children}
    </Button>
  )
}

interface AlertDialogActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function AlertDialogAction({ children, onClick, ...props }: AlertDialogActionProps) {
  const { setOpen } = useAlertDialog()

  return (
    <Button
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      {...props}
    >
      {children}
    </Button>
  )
}
