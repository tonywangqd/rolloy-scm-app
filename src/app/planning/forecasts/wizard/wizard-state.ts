import type { WizardState, WizardStep } from '@/lib/types/forecast-wizard'

export const initialWizardState: WizardState = {
  currentStep: 1,
  formData: {
    sku: '',
    channelCode: '',
    startWeek: '',
    weekCount: 12,
    selectedMethod: null,
    forecastValues: [],
    adjustments: [],
  },
  historicalData: [],
  validationResult: null,
  isLoading: false,
  error: null,
}

export type WizardAction =
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_FORM_DATA'; payload: Partial<WizardState['formData']> }
  | { type: 'SET_HISTORICAL_DATA'; payload: WizardState['historicalData'] }
  | { type: 'SET_FORECAST_VALUES'; payload: WizardState['formData']['forecastValues'] }
  | { type: 'SET_VALIDATION_RESULT'; payload: WizardState['validationResult'] }
  | { type: 'RESET' }

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT_STEP':
      return { ...state, currentStep: Math.min(5, state.currentStep + 1) as WizardStep }
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(1, state.currentStep - 1) as WizardStep }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }
    case 'UPDATE_FORM_DATA':
      return { ...state, formData: { ...state.formData, ...action.payload } }
    case 'SET_HISTORICAL_DATA':
      return { ...state, historicalData: action.payload }
    case 'SET_FORECAST_VALUES':
      return { ...state, formData: { ...state.formData, forecastValues: action.payload } }
    case 'SET_VALIDATION_RESULT':
      return { ...state, validationResult: action.payload }
    case 'RESET':
      return initialWizardState
    default:
      return state
  }
}
