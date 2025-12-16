'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string // Always YYYY-MM-DD format
  onChange: (value: string) => void
}

/**
 * DateInput Component
 *
 * A custom date input that displays dates in YYYY/MM/DD format
 * while maintaining YYYY-MM-DD internal value for form submission.
 *
 * This solves the browser locale issue where HTML5 date inputs
 * display in different formats based on user's system settings.
 */
const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    // Convert YYYY-MM-DD to display format YYYY/MM/DD
    const displayValue = value ? value.replace(/-/g, '/') : ''

    // Handle click on the container to trigger native date picker
    const hiddenInputRef = React.useRef<HTMLInputElement>(null)

    const handleContainerClick = () => {
      if (hiddenInputRef.current) {
        hiddenInputRef.current.showPicker?.()
        hiddenInputRef.current.focus()
      }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value)
    }

    return (
      <div
        className={cn(
          'relative flex h-10 w-full items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white cursor-pointer',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2',
          props.disabled && 'cursor-not-allowed opacity-50',
          className
        )}
        onClick={handleContainerClick}
      >
        <span className={cn('flex-1', !displayValue && 'text-gray-500')}>
          {displayValue || props.placeholder || 'YYYY/MM/DD'}
        </span>
        <CalendarDays className="h-4 w-4 text-gray-400 ml-2" />
        {/* Hidden native date input for picker functionality */}
        <input
          type="date"
          ref={(node) => {
            // Handle both refs
            if (typeof ref === 'function') {
              ref(node)
            } else if (ref) {
              ref.current = node
            }
            (hiddenInputRef as React.MutableRefObject<HTMLInputElement | null>).current = node
          }}
          value={value}
          onChange={handleChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
          {...props}
        />
      </div>
    )
  }
)
DateInput.displayName = 'DateInput'

export { DateInput }
