/**
 * PO Number Utilities
 * Helper functions for working with PO numbers in format: PO{YYYYMMDD}{NN}
 */

/**
 * Extract date from PO number
 * @param poNumber - PO number in format PO{YYYYMMDD}{NN}
 * @returns Date object or null if invalid format
 * @example
 * extractDateFromPO('PO2025120101') // Returns Date object for 2025-12-01
 */
export function extractDateFromPO(poNumber: string): Date | null {
  // Match pattern: PO{YYYYMMDD}{NN}
  const match = poNumber.match(/^PO(\d{4})(\d{2})(\d{2})\d{2}$/)

  if (!match) {
    return null
  }

  const [, year, month, day] = match
  const date = new Date(`${year}-${month}-${day}`)

  // Validate date
  if (isNaN(date.getTime())) {
    return null
  }

  return date
}

/**
 * Extract sequence number from PO number
 * @param poNumber - PO number in format PO{YYYYMMDD}{NN}
 * @returns Sequence number or null if invalid format
 * @example
 * extractSequenceFromPO('PO2025120101') // Returns 1
 * extractSequenceFromPO('PO2025120315') // Returns 15
 */
export function extractSequenceFromPO(poNumber: string): number | null {
  // Match pattern: PO{YYYYMMDD}{NN}
  const match = poNumber.match(/^PO\d{8}(\d{2})$/)

  if (!match) {
    return null
  }

  return parseInt(match[1], 10)
}

/**
 * Format PO number for display (optional formatting)
 * @param poNumber - PO number in format PO{YYYYMMDD}{NN}
 * @returns Formatted string or original if invalid
 * @example
 * formatPONumber('PO2025120101') // Returns 'PO-2025-12-01-01'
 */
export function formatPONumberForDisplay(poNumber: string): string {
  const match = poNumber.match(/^PO(\d{4})(\d{2})(\d{2})(\d{2})$/)

  if (!match) {
    return poNumber
  }

  const [, year, month, day, seq] = match
  return `PO-${year}-${month}-${day}-${seq}`
}

/**
 * Validate PO number format (client-side)
 * @param poNumber - PO number to validate
 * @returns True if valid format
 * @example
 * isValidPONumber('PO2025120101') // Returns true
 * isValidPONumber('PO-2025-0001') // Returns false
 */
export function isValidPONumber(poNumber: string): boolean {
  // Check pattern: PO{YYYYMMDD}{NN}
  const isPatternValid = /^PO\d{8}\d{2}$/.test(poNumber)

  if (!isPatternValid) {
    return false
  }

  // Validate the date part
  const date = extractDateFromPO(poNumber)
  return date !== null
}

/**
 * Parse PO number into components
 * @param poNumber - PO number in format PO{YYYYMMDD}{NN}
 * @returns Object with parsed components or null if invalid
 * @example
 * parsePONumber('PO2025120101')
 * // Returns { date: Date(2025-12-01), sequence: 1, year: 2025, month: 12, day: 1 }
 */
export function parsePONumber(poNumber: string): {
  date: Date
  sequence: number
  year: number
  month: number
  day: number
} | null {
  const match = poNumber.match(/^PO(\d{4})(\d{2})(\d{2})(\d{2})$/)

  if (!match) {
    return null
  }

  const [, yearStr, monthStr, dayStr, seqStr] = match
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10)
  const sequence = parseInt(seqStr, 10)

  const date = new Date(`${yearStr}-${monthStr}-${dayStr}`)

  // Validate date
  if (isNaN(date.getTime())) {
    return null
  }

  return {
    date,
    sequence,
    year,
    month,
    day,
  }
}

/**
 * Generate PO number from date and sequence (client-side helper)
 * @param date - Order date
 * @param sequence - Sequence number (1-99)
 * @returns PO number string
 * @example
 * generatePONumber(new Date('2025-12-01'), 1) // Returns 'PO2025120101'
 */
export function generatePONumber(date: Date, sequence: number): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const seq = String(sequence).padStart(2, '0')

  return `PO${year}${month}${day}${seq}`
}

/**
 * Compare two PO numbers
 * @param po1 - First PO number
 * @param po2 - Second PO number
 * @returns Negative if po1 < po2, 0 if equal, positive if po1 > po2
 */
export function comparePONumbers(po1: string, po2: string): number {
  // Direct string comparison works since format is POYYYYMMDDNN
  return po1.localeCompare(po2)
}

/**
 * Get PO numbers for a specific date
 * Used for filtering/querying
 * @param date - Date to get PO prefix for
 * @returns PO number prefix for the date
 * @example
 * getPOPrefixForDate(new Date('2025-12-01')) // Returns 'PO20251201'
 */
export function getPOPrefixForDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `PO${year}${month}${day}`
}
