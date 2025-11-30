import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, startOfWeek, endOfWeek, getISOWeek, getISOWeekYear, addWeeks } from 'date-fns'

// ================================================================
// CSS Utils
// ================================================================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ================================================================
// Date & Week Utils
// ================================================================

/**
 * Get ISO week string in format "YYYY-WW"
 */
export function getISOWeekString(date: Date): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-${week.toString().padStart(2, '0')}`
}

/**
 * Parse ISO week string "YYYY-WW" to Date (Monday of that week)
 */
export function parseISOWeekString(weekStr: string): Date {
  const [year, week] = weekStr.split('-').map(Number)
  const firstDayOfYear = new Date(year, 0, 4) // Jan 4 is always in week 1
  const firstMonday = startOfWeek(firstDayOfYear, { weekStartsOn: 1 })
  return addWeeks(firstMonday, week - 1)
}

/**
 * Get week start date (Monday) for a given date
 */
export function getWeekStartDate(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 })
}

/**
 * Get week end date (Sunday) for a given date
 */
export function getWeekEndDate(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: 1 })
}

/**
 * Generate array of week strings from start to end
 */
export function generateWeekRange(startWeek: string, numWeeks: number): string[] {
  const weeks: string[] = []
  let currentDate = parseISOWeekString(startWeek)

  for (let i = 0; i < numWeeks; i++) {
    weeks.push(getISOWeekString(currentDate))
    currentDate = addWeeks(currentDate, 1)
  }

  return weeks
}

/**
 * Get current ISO week string
 */
export function getCurrentWeek(): string {
  return getISOWeekString(new Date())
}

// ================================================================
// Formatting Utils
// ================================================================

/**
 * Format number as USD currency
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Format number with thousands separator
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

/**
 * Format date as "MMM d, yyyy"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'MMM d, yyyy')
}

/**
 * Format date as "yyyy-MM-dd"
 */
export function formatDateISO(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'yyyy-MM-dd')
}

// ================================================================
// Status Utils
// ================================================================

export type StatusVariant = 'success' | 'warning' | 'danger' | 'default'

export function getStockStatusVariant(status: string | null): StatusVariant {
  switch (status) {
    case 'OK':
      return 'success'
    case 'Risk':
      return 'warning'
    case 'Stockout':
      return 'danger'
    default:
      return 'default'
  }
}

export function getPriorityVariant(priority: string | null): StatusVariant {
  switch (priority) {
    case 'Critical':
      return 'danger'
    case 'High':
      return 'warning'
    case 'Medium':
      return 'default'
    case 'Low':
      return 'success'
    default:
      return 'default'
  }
}

export function getPaymentStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'Paid':
      return 'success'
    case 'Scheduled':
      return 'warning'
    case 'Pending':
      return 'default'
    default:
      return 'default'
  }
}

export function getPOStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'Delivered':
      return 'success'
    case 'In Production':
      return 'warning'
    case 'Confirmed':
      return 'default'
    case 'Draft':
      return 'default'
    case 'Cancelled':
      return 'danger'
    default:
      return 'default'
  }
}
