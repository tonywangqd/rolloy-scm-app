/**
 * Date utilities for Rolloy SCM
 *
 * All date operations use ISO 8601 week date format (YYYY-WNN)
 * Week starts on Monday, and week 1 is the week containing January 4th
 *
 * @module utils/date
 */

import {
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  addWeeks,
  format,
} from 'date-fns'

/**
 * Get current ISO week in YYYY-WNN format
 *
 * @returns Current week string (e.g., "2025-W49")
 *
 * @example
 * getCurrentWeek() // "2025-W49"
 */
export function getCurrentWeek(): string {
  const now = new Date()
  const year = getISOWeekYear(now)
  const week = getISOWeek(now)
  return `${year}-W${week.toString().padStart(2, '0')}`
}

/**
 * Get ISO week string for a given date
 *
 * @param date - The date to convert
 * @returns Week string in YYYY-WNN format
 *
 * @example
 * getWeekFromDate(new Date('2025-02-03')) // "2025-W06"
 */
export function getWeekFromDate(date: Date): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-W${week.toString().padStart(2, '0')}`
}

/**
 * Get next N weeks starting from current week
 *
 * @param count - Number of weeks to generate
 * @returns Array of week strings in YYYY-WNN format
 *
 * @example
 * getNextWeeks(3) // ["2025-W49", "2025-W50", "2025-W51"]
 */
export function getNextWeeks(count: number): string[] {
  const now = new Date()
  const weeks: string[] = []
  for (let i = 0; i < count; i++) {
    const weekDate = addWeeks(startOfISOWeek(now), i)
    weeks.push(getWeekFromDate(weekDate))
  }
  return weeks
}

/**
 * Get N weeks starting from a specific date
 *
 * @param startDate - The date to start from
 * @param count - Number of weeks to generate
 * @returns Array of week strings in YYYY-WNN format
 *
 * @example
 * getWeeksFromDate(new Date('2025-01-01'), 3) // ["2025-W01", "2025-W02", "2025-W03"]
 */
export function getWeeksFromDate(startDate: Date, count: number): string[] {
  const weeks: string[] = []
  for (let i = 0; i < count; i++) {
    const weekDate = addWeeks(startOfISOWeek(startDate), i)
    weeks.push(getWeekFromDate(weekDate))
  }
  return weeks
}

/**
 * Parse YYYY-WNN format to Date (returns start of that ISO week - Monday)
 *
 * @param weekStr - Week string in YYYY-WNN format
 * @returns Date object representing the start of the week, or null if invalid format
 *
 * @example
 * parseWeekString("2025-W06") // Date object for Monday of week 6, 2025
 * parseWeekString("invalid") // null
 */
export function parseWeekString(weekStr: string): Date | null {
  const match = weekStr.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return null

  const year = parseInt(match[1], 10)
  const week = parseInt(match[2], 10)

  // Validate week number
  if (week < 1 || week > 53) return null

  // Get January 4th of the year (always in week 1 per ISO 8601)
  const jan4 = new Date(year, 0, 4)
  const startOfWeek1 = startOfISOWeek(jan4)

  // Add weeks to get to target week
  return addWeeks(startOfWeek1, week - 1)
}

/**
 * Add weeks to a week string
 *
 * @param weekStr - Week string in YYYY-WNN format
 * @param weeks - Number of weeks to add (can be negative)
 * @returns New week string, or null if invalid input
 *
 * @example
 * addWeeksToWeekString("2025-W06", 2) // "2025-W08"
 * addWeeksToWeekString("2025-W50", 3) // "2026-W01"
 */
export function addWeeksToWeekString(weekStr: string, weeks: number): string | null {
  const date = parseWeekString(weekStr)
  if (!date) return null

  const newDate = addWeeks(date, weeks)
  return getWeekFromDate(newDate)
}

/**
 * Compare two ISO week strings
 *
 * @param a - First week string
 * @param b - Second week string
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 *
 * @example
 * compareWeeks("2025-W05", "2025-W10") // -1
 * compareWeeks("2025-W10", "2025-W05") // 1
 * compareWeeks("2025-W05", "2025-W05") // 0
 */
export function compareWeeks(a: string, b: string): number {
  return a.localeCompare(b)
}

/**
 * Get the week range between two week strings (inclusive)
 *
 * @param fromWeek - Start week (YYYY-WNN format)
 * @param toWeek - End week (YYYY-WNN format)
 * @returns Array of week strings from fromWeek to toWeek (inclusive), or empty array if invalid
 *
 * @example
 * getWeekRange("2025-W05", "2025-W07") // ["2025-W05", "2025-W06", "2025-W07"]
 */
export function getWeekRange(fromWeek: string, toWeek: string): string[] {
  const fromDate = parseWeekString(fromWeek)
  const toDate = parseWeekString(toWeek)

  if (!fromDate || !toDate) return []
  if (compareWeeks(fromWeek, toWeek) > 0) return []

  const weeks: string[] = []
  let currentDate = fromDate

  while (compareWeeks(getWeekFromDate(currentDate), toWeek) <= 0) {
    weeks.push(getWeekFromDate(currentDate))
    currentDate = addWeeks(currentDate, 1)
  }

  return weeks
}

/**
 * Format a week string to a human-readable format
 *
 * @param weekStr - Week string in YYYY-WNN format
 * @param formatStr - Format string (defaults to "MMM d, yyyy" - shows Monday of that week)
 * @returns Formatted date string, or the original string if invalid
 *
 * @example
 * formatWeek("2025-W06") // "Feb 3, 2025"
 * formatWeek("2025-W06", "yyyy-MM-dd") // "2025-02-03"
 */
export function formatWeek(weekStr: string, formatStr = 'MMM d, yyyy'): string {
  const date = parseWeekString(weekStr)
  if (!date) return weekStr

  return format(date, formatStr)
}

/**
 * Get the year and week number from a week string
 *
 * @param weekStr - Week string in YYYY-WNN format
 * @returns Object with year and week, or null if invalid
 *
 * @example
 * parseWeekComponents("2025-W06") // { year: 2025, week: 6 }
 */
export function parseWeekComponents(weekStr: string): { year: number; week: number } | null {
  const match = weekStr.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return null

  return {
    year: parseInt(match[1], 10),
    week: parseInt(match[2], 10),
  }
}

/**
 * Check if a week string is valid
 *
 * @param weekStr - Week string to validate
 * @returns true if valid YYYY-WNN format and parseable
 *
 * @example
 * isValidWeekString("2025-W06") // true
 * isValidWeekString("2025-W99") // false
 * isValidWeekString("invalid") // false
 */
export function isValidWeekString(weekStr: string): boolean {
  return parseWeekString(weekStr) !== null
}

/**
 * Get week information for display
 *
 * @param weekStr - Week string in YYYY-WNN format
 * @returns Object with week info, or null if invalid
 *
 * @example
 * getWeekInfo("2025-W06")
 * // {
 * //   weekString: "2025-W06",
 * //   year: 2025,
 * //   week: 6,
 * //   startDate: Date (Monday),
 * //   endDate: Date (Sunday),
 * //   label: "Week 6, 2025"
 * // }
 */
export function getWeekInfo(weekStr: string): {
  weekString: string
  year: number
  week: number
  startDate: Date
  endDate: Date
  label: string
} | null {
  const components = parseWeekComponents(weekStr)
  const startDate = parseWeekString(weekStr)

  if (!components || !startDate) return null

  const endDate = addWeeks(startDate, 1)
  endDate.setDate(endDate.getDate() - 1) // Get Sunday

  return {
    weekString: weekStr,
    year: components.year,
    week: components.week,
    startDate,
    endDate,
    label: `Week ${components.week}, ${components.year}`,
  }
}
