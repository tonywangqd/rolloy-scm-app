'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      onCheckedChange?.(e.target.checked)
    }

    return (
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={handleChange}
          className="sr-only peer"
          {...props}
        />
        <div
          className={cn(
            'h-5 w-9 rounded-full bg-gray-200 transition-colors',
            'peer-checked:bg-blue-600',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            'after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4',
            'after:rounded-full after:bg-white after:shadow-sm after:transition-transform',
            'peer-checked:after:translate-x-4',
            className
          )}
        />
      </label>
    )
  }
)
Switch.displayName = 'Switch'

export { Switch }
