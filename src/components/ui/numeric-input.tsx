'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: number
  onChange: (value: number) => void
  allowDecimal?: boolean
  decimalPlaces?: number
}

/**
 * NumericInput Component
 *
 * A specialized input for numeric values that:
 * - Strips leading zeros (15 not 015)
 * - Only allows numeric characters
 * - Handles decimal values optionally
 * - Provides immediate visual feedback
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      className,
      value,
      onChange,
      min,
      max,
      allowDecimal = false,
      decimalPlaces = 2,
      ...props
    },
    ref
  ) => {
    // Format value for display (no leading zeros)
    const formatDisplayValue = (num: number): string => {
      if (num === 0) return '0'
      if (allowDecimal) {
        return num.toFixed(decimalPlaces).replace(/\.?0+$/, '')
      }
      return String(num)
    }

    const [displayValue, setDisplayValue] = React.useState(formatDisplayValue(value))

    // Sync display value with prop value
    React.useEffect(() => {
      setDisplayValue(formatDisplayValue(value))
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value

      // Allow empty input
      if (inputValue === '') {
        setDisplayValue('')
        onChange(0)
        return
      }

      // Pattern for validation
      const pattern = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/
      if (!pattern.test(inputValue)) {
        return // Reject invalid characters
      }

      // Update display immediately (user sees what they type, minus invalid chars)
      setDisplayValue(inputValue)

      // Parse and validate the number
      const parsed = allowDecimal ? parseFloat(inputValue) : parseInt(inputValue, 10)

      if (!isNaN(parsed)) {
        let finalValue = parsed

        // Apply min/max constraints
        if (min !== undefined && finalValue < Number(min)) {
          finalValue = Number(min)
        }
        if (max !== undefined && finalValue > Number(max)) {
          finalValue = Number(max)
        }

        onChange(finalValue)
      }
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // On blur, normalize display (strip leading zeros, apply formatting)
      setDisplayValue(formatDisplayValue(value))

      // Call original onBlur if provided
      props.onBlur?.(e)
    }

    return (
      <input
        type="text"
        inputMode="numeric"
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)
NumericInput.displayName = 'NumericInput'

export { NumericInput }
