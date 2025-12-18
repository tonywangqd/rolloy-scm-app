/**
 * Forecast Wizard Type Definitions
 *
 * Type definitions for the sales forecasting wizard feature
 * Used for AI-assisted forecast generation and bulk editing
 *
 * @module types/forecast-wizard
 */

/**
 * Forecast generation method
 */
export type ForecastMethod = 'moving_average' | 'year_over_year' | 'custom'

/**
 * Historical sales data point
 * Used for displaying past sales trends and calculating forecasts
 */
export interface HistoricalSalesData {
  week_iso: string
  actual_qty: number
}

/**
 * AI-generated forecast suggestion for a single week
 */
export interface ForecastSuggestion {
  week_iso: string
  week_start_date: string
  week_end_date: string
  forecast_qty: number
}

/**
 * Validation result for forecast values
 */
export interface ForecastValidationResult {
  isValid: boolean
  warnings: ValidationWarning[]
  errors: ValidationError[]
  summary: {
    totalWeeks: number
    totalQuantity: number
    averageWeekly: number
    historicalAverage: number
  }
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  week_iso: string
  message: string
  severity: 'warning' | 'error' | 'info'
}

/**
 * Validation error
 */
export interface ValidationError {
  week_iso: string
  message: string
}

/**
 * Wizard step number
 */
export type WizardStep = 1 | 2 | 3 | 4 | 5

/**
 * Wizard state machine
 * Manages the multi-step forecast wizard state
 */
export interface WizardState {
  currentStep: WizardStep
  formData: {
    sku: string
    channelCode: string
    startWeek: string
    weekCount: number
    selectedMethod: ForecastMethod | null
    customBaseline?: number
    forecastValues: ForecastSuggestion[]
    adjustments: BulkAdjustment[]
  }
  historicalData: HistoricalSalesData[]
  validationResult: ForecastValidationResult | null
  isLoading: boolean
  error: string | null
}

/**
 * Bulk adjustment operation
 */
export interface BulkAdjustment {
  type: 'multiply' | 'add' | 'set'
  value: number
  weekRange: { from: string; to: string }
}
