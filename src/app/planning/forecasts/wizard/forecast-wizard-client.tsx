'use client'

import { useReducer, useState } from 'react'
import { useRouter } from 'next/navigation'
import { wizardReducer, initialWizardState } from './wizard-state'
import WizardHeader from './components/wizard-header'
import WizardFooter from './components/wizard-footer'
import StepScopeSelector from './components/step-scope-selector'
import StepMethodSelector from './components/step-method-selector'
import StepBulkAdjustment from './components/step-bulk-adjustment'
import StepValidationReview from './components/step-validation-review'
import StepConfirmation from './components/step-confirmation'
import type { ForecastSuggestion } from '@/lib/types/forecast-wizard'

interface Props {
  products: { sku: string; product_name: string }[]
  channels: { channel_code: string; channel_name: string }[]
}

export default function ForecastWizardClient({ products, channels }: Props) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState)
  const [savedCount, setSavedCount] = useState(0)
  const router = useRouter()

  // Mock forecast data for Step 2 (replace with actual Server Action calls)
  const [movingAverageData] = useState<{ data: ForecastSuggestion[]; average: number }>({
    data: [],
    average: 0,
  })
  const [yearOverYearData] = useState<{ data: ForecastSuggestion[]; average: number }>({
    data: [],
    average: 0,
  })
  const [customData] = useState<{ data: ForecastSuggestion[]; average: number }>({
    data: [],
    average: 0,
  })

  const handleNext = async () => {
    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      if (state.currentStep === 1) {
        // Step 1 -> Step 2: Fetch historical data and generate forecasts
        // TODO: Call fetchHistoricalSales server action
        // For now, just move to next step
        dispatch({ type: 'NEXT_STEP' })
      } else if (state.currentStep === 2) {
        // Step 2 -> Step 3: Set selected forecast method
        if (!state.formData.selectedMethod) {
          dispatch({ type: 'SET_ERROR', payload: '请选择一个预测方法' })
          return
        }
        // TODO: Call generateForecastSuggestions server action
        dispatch({ type: 'NEXT_STEP' })
      } else if (state.currentStep === 3) {
        // Step 3 -> Step 4: Validate forecast values
        // TODO: Call validateForecastValues server action
        dispatch({ type: 'NEXT_STEP' })
      } else if (state.currentStep === 4) {
        // Step 4 -> Step 5: Save forecast batch
        // TODO: Call saveForecastBatch server action
        setSavedCount(state.formData.forecastValues.length)
        dispatch({ type: 'NEXT_STEP' })
      }
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : '操作失败',
      })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  const handleBack = () => {
    dispatch({ type: 'PREV_STEP' })
  }

  const handleCancel = () => {
    if (state.currentStep === 5) {
      router.push('/planning/forecasts')
    } else {
      if (confirm('确定要取消吗？所有更改将会丢失。')) {
        router.push('/planning/forecasts')
      }
    }
  }

  const canProceed = () => {
    switch (state.currentStep) {
      case 1:
        return Boolean(
          state.formData.sku &&
            state.formData.channelCode &&
            state.formData.startWeek &&
            state.formData.weekCount >= 4 &&
            state.formData.weekCount <= 24
        )
      case 2:
        return Boolean(state.formData.selectedMethod)
      case 3:
        return state.formData.forecastValues.length > 0
      case 4:
        return state.validationResult?.isValid === true
      default:
        return true
    }
  }

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <StepScopeSelector state={state} dispatch={dispatch} products={products} channels={channels} />
      case 2:
        return (
          <StepMethodSelector
            dispatch={dispatch}
            selectedMethod={state.formData.selectedMethod}
            customBaseline={state.formData.customBaseline}
            movingAverageData={movingAverageData}
            yearOverYearData={yearOverYearData}
            customData={customData}
          />
        )
      case 3:
        const historicalAvg =
          state.historicalData.length > 0
            ? state.historicalData.reduce((sum, d) => sum + d.actual_qty, 0) / state.historicalData.length
            : 0
        return (
          <StepBulkAdjustment
            forecastValues={state.formData.forecastValues}
            dispatch={dispatch}
            historicalAvg={historicalAvg}
          />
        )
      case 4:
        return (
          <StepValidationReview
            validationResult={state.validationResult}
            forecastData={state.formData.forecastValues}
            historicalData={state.historicalData}
          />
        )
      case 5:
        return <StepConfirmation savedCount={savedCount} sku={state.formData.sku} />
      default:
        return null
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <WizardHeader currentStep={state.currentStep} />

      <div className="mt-8 min-h-[500px]">
        {state.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">
            {state.error}
          </div>
        )}
        {renderStep()}
      </div>

      <WizardFooter
        currentStep={state.currentStep}
        onNext={handleNext}
        onBack={handleBack}
        onCancel={handleCancel}
        isLoading={state.isLoading}
        canProceed={canProceed()}
      />
    </div>
  )
}
