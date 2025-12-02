import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, startOfWeek, endOfWeek, getISOWeek, getISOWeekYear, addWeeks, addMonths, lastDayOfMonth, isWeekend, subDays } from 'date-fns'

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

/**
 * Get last business day of a month (excluding Saturday and Sunday)
 */
export function getLastBusinessDay(date: Date): Date {
  let lastDay = lastDayOfMonth(date)

  // Move backward until we find a business day
  while (isWeekend(lastDay)) {
    lastDay = subDays(lastDay, 1)
  }

  return lastDay
}

/**
 * Calculate procurement payment date (60 days after delivery, on last business day of payment month)
 * Formula: payment_month = delivery_month + 2, payment_date = last business day of payment_month
 */
export function getProcurementPaymentDate(deliveryDate: Date): Date {
  const paymentMonth = addMonths(deliveryDate, 2)
  return getLastBusinessDay(paymentMonth)
}

/**
 * Calculate logistics payment date based on arrival date
 * Rules:
 * - If arrival day <= 15: payment on 15th of next month
 * - If arrival day > 15: payment on last business day of next month
 */
export function getLogisticsPaymentDate(arrivalDate: Date): Date {
  const dayOfMonth = arrivalDate.getDate()
  const nextMonth = addMonths(arrivalDate, 1)

  if (dayOfMonth <= 15) {
    // Payment on 15th of next month
    return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 15)
  } else {
    // Payment on last business day of next month
    return getLastBusinessDay(nextMonth)
  }
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
 * Format number as CNY currency (人民币)
 */
export function formatCurrencyCNY(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export function getSalesForecastStatusVariant(hasActual: boolean, hasForecast: boolean): StatusVariant {
  if (hasActual) {
    return 'success'
  } else if (hasForecast) {
    return 'warning'
  } else {
    return 'default'
  }
}

export function getWarehouseTypeVariant(warehouseType: string): StatusVariant {
  switch (warehouseType) {
    case 'FBA':
      return 'warning'
    case '3PL':
      return 'default'
    default:
      return 'default'
  }
}
