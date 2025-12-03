'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const DropdownMenu = ({
  children,
  open,
  onOpenChange,
}: {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) => {
  const [isOpen, setIsOpen] = React.useState(open ?? false)

  React.useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open)
    }
  }, [open])

  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen)
    onOpenChange?.(newOpen)
  }

  return (
    <DropdownMenuContext.Provider value={{ isOpen, setIsOpen: handleOpenChange }}>
      {children}
    </DropdownMenuContext.Provider>
  )
}

const DropdownMenuContext = React.createContext<{
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}>({
  isOpen: false,
  setIsOpen: () => {},
})

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, children, onClick, asChild, ...props }, ref) => {
  const { isOpen, setIsOpen } = React.useContext(DropdownMenuContext)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setIsOpen(!isOpen)
    onClick?.(e)
  }

  // If asChild is true, clone the child element with click handler
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: React.MouseEvent) => {
        handleClick(e as React.MouseEvent<HTMLButtonElement>)
        ;(children as React.ReactElement<any>).props.onClick?.(e)
      },
      ref,
    })
  }

  return (
    <button
      ref={ref}
      type="button"
      className={cn('outline-none', className)}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  )
})
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }
>(({ className, children, align = 'end', ...props }, ref) => {
  const { isOpen, setIsOpen } = React.useContext(DropdownMenuContext)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, setIsOpen])

  if (!isOpen) return null

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={cn(
          'absolute z-50 min-w-[8rem] overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg',
          align === 'end' ? 'right-0' : 'left-0',
          'mt-1',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  )
})
DropdownMenuContent.displayName = 'DropdownMenuContent'

const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean }
>(({ className, children, onClick, disabled, ...props }, ref) => {
  const { setIsOpen } = React.useContext(DropdownMenuContext)

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    onClick?.(e)
    setIsOpen(false)
  }

  return (
    <div
      ref={ref}
      role="menuitem"
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
        disabled
          ? 'pointer-events-none opacity-50'
          : 'hover:bg-gray-100 focus:bg-gray-100',
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {children}
    </div>
  )
})
DropdownMenuItem.displayName = 'DropdownMenuItem'

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('my-1 h-px bg-gray-200', className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
}
