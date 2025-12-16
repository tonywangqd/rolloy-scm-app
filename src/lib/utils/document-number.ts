/**
 * Document Number Generator
 * 统一的单号生成工具
 *
 * 命名规则：XX + 年(4位) + 周(2位) + 序号(2位)
 * 例如：PO20253801 = PO + 2025年 + 38周 + 01号
 *
 * | 业务 | 代码 | 含义 | 示例 |
 * |------|------|------|------|
 * | 销量预计 | SF | Sales Forecast | SF20253801 |
 * | 下单预计 | PF | Purchased Forecast | PF20253801 |
 * | 下单 | PO | Purchase Order | PO20253801 |
 * | 交货/出厂 | OF | Order Fulfilled | OF20253801 |
 * | 物流 | OS | Order Shipment | 用户手动填写 tracking_number |
 *
 * @module utils/document-number
 */

import { getISOWeek, getISOWeekYear } from 'date-fns'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

/**
 * Document type prefixes
 */
export type DocumentPrefix = 'SF' | 'PF' | 'PO' | 'OF' | 'OS'

export interface DocumentNumberInfo {
  prefix: DocumentPrefix
  year: number
  week: number
  sequence: number
  full: string
}

// ================================================================
// CORE FUNCTIONS
// ================================================================

/**
 * Generate document number based on unified format
 *
 * @param prefix - Document type prefix (SF, PF, PO, OF, OS)
 * @param date - Date to extract year and week from
 * @param sequence - Sequence number (1-99)
 * @returns Document number string
 *
 * @example
 * generateDocumentNumber('PO', new Date('2025-09-15'), 1) // Returns 'PO20253801'
 * generateDocumentNumber('OF', new Date('2025-12-01'), 5) // Returns 'OF20254905'
 */
export function generateDocumentNumber(
  prefix: DocumentPrefix,
  date: Date,
  sequence: number
): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  const seq = Math.min(99, Math.max(1, sequence))

  return `${prefix}${year}${week.toString().padStart(2, '0')}${seq.toString().padStart(2, '0')}`
}

/**
 * Generate document number for current week
 *
 * @param prefix - Document type prefix
 * @param sequence - Sequence number
 * @returns Document number string
 *
 * @example
 * generateDocumentNumberForCurrentWeek('PO', 1) // Returns 'PO20255101' (if current week is 51)
 */
export function generateDocumentNumberForCurrentWeek(
  prefix: DocumentPrefix,
  sequence: number
): string {
  return generateDocumentNumber(prefix, new Date(), sequence)
}

/**
 * Parse document number into components
 *
 * @param docNumber - Document number string (e.g., 'PO20253801')
 * @returns Parsed components or null if invalid
 *
 * @example
 * parseDocumentNumber('PO20253801')
 * // Returns { prefix: 'PO', year: 2025, week: 38, sequence: 1, full: 'PO20253801' }
 */
export function parseDocumentNumber(docNumber: string): DocumentNumberInfo | null {
  // Pattern: XX + YYYY + WW + SS (2 + 4 + 2 + 2 = 10 characters)
  const match = docNumber.match(/^(SF|PF|PO|OF|OS)(\d{4})(\d{2})(\d{2})$/)

  if (!match) {
    return null
  }

  const [, prefix, yearStr, weekStr, seqStr] = match

  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)
  const sequence = parseInt(seqStr, 10)

  // Validate week number (1-53)
  if (week < 1 || week > 53) {
    return null
  }

  return {
    prefix: prefix as DocumentPrefix,
    year,
    week,
    sequence,
    full: docNumber,
  }
}

/**
 * Validate document number format
 *
 * @param docNumber - Document number to validate
 * @returns True if valid format
 *
 * @example
 * isValidDocumentNumber('PO20253801') // Returns true
 * isValidDocumentNumber('PO-2025-38-01') // Returns false
 */
export function isValidDocumentNumber(docNumber: string): boolean {
  return parseDocumentNumber(docNumber) !== null
}

/**
 * Extract prefix from document number
 *
 * @param docNumber - Document number string
 * @returns Prefix or null if invalid
 */
export function extractPrefix(docNumber: string): DocumentPrefix | null {
  const parsed = parseDocumentNumber(docNumber)
  return parsed?.prefix ?? null
}

/**
 * Get document number prefix for display
 *
 * @param prefix - Document type prefix
 * @returns Human-readable description
 */
export function getDocumentTypeLabel(prefix: DocumentPrefix): string {
  const labels: Record<DocumentPrefix, string> = {
    SF: '销量预计',
    PF: '下单预计',
    PO: '采购订单',
    OF: '交货单',
    OS: '物流单',
  }
  return labels[prefix] || prefix
}

/**
 * Get document number prefix for display in English
 *
 * @param prefix - Document type prefix
 * @returns English description
 */
export function getDocumentTypeLabelEN(prefix: DocumentPrefix): string {
  const labels: Record<DocumentPrefix, string> = {
    SF: 'Sales Forecast',
    PF: 'Purchased Forecast',
    PO: 'Purchase Order',
    OF: 'Order Fulfilled',
    OS: 'Order Shipment',
  }
  return labels[prefix] || prefix
}

/**
 * Format document number for display (optional formatting with dashes)
 *
 * @param docNumber - Document number string
 * @returns Formatted string or original if invalid
 *
 * @example
 * formatDocumentNumberForDisplay('PO20253801') // Returns 'PO-2025-W38-01'
 */
export function formatDocumentNumberForDisplay(docNumber: string): string {
  const parsed = parseDocumentNumber(docNumber)

  if (!parsed) {
    return docNumber
  }

  const weekStr = parsed.week.toString().padStart(2, '0')
  const seqStr = parsed.sequence.toString().padStart(2, '0')

  return `${parsed.prefix}-${parsed.year}-W${weekStr}-${seqStr}`
}

/**
 * Get document number prefix (year + week) for querying
 *
 * @param prefix - Document type prefix
 * @param date - Date to get prefix for
 * @returns Prefix string for filtering
 *
 * @example
 * getDocumentNumberQueryPrefix('PO', new Date('2025-09-15')) // Returns 'PO202538'
 */
export function getDocumentNumberQueryPrefix(prefix: DocumentPrefix, date: Date): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)

  return `${prefix}${year}${week.toString().padStart(2, '0')}`
}

/**
 * Compare two document numbers
 *
 * @param doc1 - First document number
 * @param doc2 - Second document number
 * @returns Negative if doc1 < doc2, 0 if equal, positive if doc1 > doc2
 */
export function compareDocumentNumbers(doc1: string, doc2: string): number {
  // Direct string comparison works since format is XXYYYY WWSS
  return doc1.localeCompare(doc2)
}

// ================================================================
// LEGACY COMPATIBILITY (for backward compatibility)
// ================================================================

/**
 * Generate delivery number (OF - Order Fulfilled)
 * Legacy function for backward compatibility
 *
 * @param date - Date for the delivery
 * @param sequence - Sequence number
 * @returns Delivery number string
 *
 * @deprecated Use generateDocumentNumber('OF', date, sequence) instead
 */
export function generateDeliveryNumber(date: Date = new Date(), sequence: number = 1): string {
  return generateDocumentNumber('OF', date, sequence)
}

/**
 * Generate PO number
 * Legacy function for backward compatibility
 *
 * @param date - Date for the PO
 * @param sequence - Sequence number
 * @returns PO number string
 *
 * @deprecated Use generateDocumentNumber('PO', date, sequence) instead
 */
export function generatePONumber(date: Date = new Date(), sequence: number = 1): string {
  return generateDocumentNumber('PO', date, sequence)
}
