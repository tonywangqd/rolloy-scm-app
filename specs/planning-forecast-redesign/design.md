# Sales Forecasting Wizard - Technical Design Document

**Version:** 1.0
**Author:** System Architect
**Date:** 2025-12-18
**Status:** Ready for Review
**PRD Reference:** `specs/planning-forecast-redesign/requirements.md`

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Database Design](#2-database-design)
3. [API Design (Server Actions)](#3-api-design-server-actions)
4. [Frontend Component Architecture](#4-frontend-component-architecture)
5. [AI Forecast Algorithms](#5-ai-forecast-algorithms)
6. [Data Flow & State Management](#6-data-flow--state-management)
7. [Performance Optimization](#7-performance-optimization)
8. [Security & Validation](#8-security--validation)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. System Architecture Overview

### 1.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│  /app/planning/forecasts/wizard/page.tsx (New Route)               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ForecastWizard (Client Component)                          │   │
│  │  - Multi-step state machine                                 │   │
│  │  - Form validation & error handling                         │   │
│  │  - Chart rendering (Recharts)                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  WizardStep Components                                      │   │
│  │  - Step1: ScopeSelector                                     │   │
│  │  - Step2: MethodSelector                                    │   │
│  │  - Step3: BulkAdjustmentEditor                              │   │
│  │  - Step4: ValidationReview                                  │   │
│  │  - Step5: ConfirmationSummary                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    ↕
                          Server Actions (API)
                                    ↕
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  /lib/actions/forecast-wizard.ts (New Server Actions)              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. fetchHistoricalSales(sku, channel, startWeek)          │   │
│  │  2. generateForecastSuggestions(params, method)            │   │
│  │  3. validateForecastValues(values[])                       │   │
│  │  4. saveForecastBatch(forecastData[])                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  /lib/queries/forecast-wizard.ts (New Queries)                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  - fetchSalesActualsHistory()                              │   │
│  │  - fetchExistingForecasts()                                │   │
│  │  - fetchSafetyStockThresholds()                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    ↕
                            Supabase Client
                                    ↕
┌─────────────────────────────────────────────────────────────────────┐
│                         DATABASE LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Supabase)                                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Existing Tables (No Schema Changes Required):             │   │
│  │  - sales_forecasts (id, sku, channel_code, week_iso,       │   │
│  │                     forecast_qty, created_at, updated_at)  │   │
│  │  - sales_actuals (id, sku, channel_code, week_iso,         │   │
│  │                   actual_qty, created_at)                  │   │
│  │  - products (sku, product_name, safety_stock_weeks, ...)   │   │
│  │  - channels (channel_code, channel_name, ...)              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  RLS Policies (Existing - leverage current setup)          │   │
│  │  - auth.uid() = created_by (if auth enabled)               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Responsibility Matrix

| Layer | Responsibility | Technology |
|-------|---------------|------------|
| **Frontend** | UI/UX, user input, chart rendering, client-side validation | React 19, ShadCN UI, Recharts, React Hook Form |
| **Server Actions** | Business logic, AI calculation, data persistence, server-side validation | Next.js 16 Server Actions, TypeScript |
| **Database** | Data storage, RLS enforcement, data integrity | Supabase PostgreSQL, RLS |

### 1.3 Key Design Decisions

**Decision 1: No New Database Tables**
- **Rationale:** Existing `sales_forecasts` and `sales_actuals` tables are sufficient.
- **Impact:** Faster development, no migration risk, backward compatible.

**Decision 2: Server Actions for AI Calculation**
- **Rationale:** Serverless environment (Vercel), avoid API route overhead.
- **Impact:** Better security (no client-side exposure), better type safety.

**Decision 3: Client Component for Wizard**
- **Rationale:** Multi-step form requires local state management.
- **Impact:** Use `useState` + `useReducer` for wizard state machine.

**Decision 4: Recharts for Data Visualization**
- **Rationale:** Aligned with existing project stack (confirmed in CLAUDE.md).
- **Impact:** Consistent UI/UX, no new library dependencies.

---

## 2. Database Design

### 2.1 Schema Analysis (No Changes Required)

**Existing Schema is Sufficient:**

```sql
-- Existing table: sales_forecasts
CREATE TABLE sales_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL REFERENCES products(sku),
  channel_code TEXT NOT NULL REFERENCES channels(channel_code),
  week_iso TEXT NOT NULL, -- "2025-W49"
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  forecast_qty INTEGER NOT NULL DEFAULT 0,
  is_closed BOOLEAN DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  close_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sku, channel_code, week_iso) -- Natural composite key
);

-- Existing table: sales_actuals
CREATE TABLE sales_actuals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL REFERENCES products(sku),
  channel_code TEXT NOT NULL REFERENCES channels(channel_code),
  week_iso TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  actual_qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sku, channel_code, week_iso)
);

-- Existing table: products
CREATE TABLE products (
  id UUID PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  safety_stock_weeks INTEGER DEFAULT 2,
  -- ... other fields
);
```

### 2.2 Indexes (Existing - Verify Performance)

**Required Indexes (should already exist):**

```sql
-- Index for week range queries
CREATE INDEX IF NOT EXISTS idx_sales_forecasts_week_iso
  ON sales_forecasts(week_iso);

-- Index for SKU + channel lookups
CREATE INDEX IF NOT EXISTS idx_sales_forecasts_sku_channel
  ON sales_forecasts(sku, channel_code);

-- Composite index for historical queries
CREATE INDEX IF NOT EXISTS idx_sales_actuals_sku_channel_week
  ON sales_actuals(sku, channel_code, week_iso);
```

**Performance Note:** Verify index usage with `EXPLAIN ANALYZE` on historical sales queries (see Section 7).

### 2.3 RLS Policies (Leverage Existing)

No new policies needed. Existing RLS setup in `supabase/migrations/20251202000001_add_rls_policies.sql` should already cover:

- Users can only read/write forecasts they have permission for (org-level RLS)
- Audit logging via `created_at`, `updated_at` timestamps

---

## 3. API Design (Server Actions)

### 3.1 Server Actions Definition

**File:** `/src/lib/actions/forecast-wizard.ts`

```typescript
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { addWeeksToWeekString } from '@/lib/utils/date'
import type {
  ForecastMethod,
  ForecastSuggestion,
  HistoricalSalesData,
  ForecastValidationResult
} from '@/lib/types/forecast-wizard'

/**
 * Action 1: Fetch Historical Sales (Past 12 Weeks)
 * Used in Step 1 to display context chart
 */
export async function fetchHistoricalSales(
  sku: string,
  channelCode: string,
  startWeek: string // ISO week format "2025-W49"
): Promise<{
  success: boolean
  data?: HistoricalSalesData[]
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Calculate 12 weeks back from startWeek
    const endWeek = addWeeksToWeekString(startWeek, -1)
    const startWeekMinus12 = addWeeksToWeekString(startWeek, -12)

    if (!startWeekMinus12 || !endWeek) {
      return { success: false, error: 'Invalid week range' }
    }

    const { data, error } = await supabase
      .from('sales_actuals')
      .select('week_iso, actual_qty')
      .eq('sku', sku)
      .eq('channel_code', channelCode)
      .gte('week_iso', startWeekMinus12)
      .lte('week_iso', endWeek)
      .order('week_iso', { ascending: true })

    if (error) {
      return { success: false, error: error.message }
    }

    const historicalData: HistoricalSalesData[] = (data || []).map(item => ({
      week_iso: item.week_iso,
      actual_qty: item.actual_qty,
    }))

    return { success: true, data: historicalData }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

/**
 * Action 2: Generate AI Forecast Suggestions
 * Implements 3 forecast algorithms (MA, YoY, Custom)
 */
export async function generateForecastSuggestions(
  sku: string,
  channelCode: string,
  startWeek: string,
  weekCount: number, // e.g., 12
  method: ForecastMethod, // 'moving_average' | 'year_over_year' | 'custom'
  customBaseline?: number // Only required for 'custom' method
): Promise<{
  success: boolean
  data?: ForecastSuggestion[]
  error?: string
  metadata?: {
    averageValue: number
    confidenceLevel: 'high' | 'medium' | 'low'
  }
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Fetch historical data for calculation
    const historicalResult = await fetchHistoricalSales(sku, channelCode, startWeek)
    if (!historicalResult.success || !historicalResult.data) {
      return { success: false, error: 'No historical data available' }
    }

    const historicalData = historicalResult.data

    let suggestions: ForecastSuggestion[] = []
    let confidenceLevel: 'high' | 'medium' | 'low' = 'medium'

    switch (method) {
      case 'moving_average': {
        // Calculate 4-week moving average
        const recentWeeks = historicalData.slice(-4)
        if (recentWeeks.length < 2) {
          return { success: false, error: 'Insufficient data for moving average (need at least 2 weeks)' }
        }

        const avgQty = Math.round(
          recentWeeks.reduce((sum, d) => sum + d.actual_qty, 0) / recentWeeks.length
        )

        suggestions = generateWeeklyForecasts(startWeek, weekCount, avgQty)
        confidenceLevel = recentWeeks.length >= 4 ? 'high' : 'medium'
        break
      }

      case 'year_over_year': {
        // Calculate YoY growth rate from past year data
        const currentWeekMinus52 = addWeeksToWeekString(startWeek, -52)
        if (!currentWeekMinus52) {
          return { success: false, error: 'Cannot calculate YoY (invalid week)' }
        }

        const { data: lastYearData } = await supabase
          .from('sales_actuals')
          .select('week_iso, actual_qty')
          .eq('sku', sku)
          .eq('channel_code', channelCode)
          .gte('week_iso', addWeeksToWeekString(currentWeekMinus52, -12) || '')
          .lte('week_iso', currentWeekMinus52)
          .order('week_iso')

        if (!lastYearData || lastYearData.length === 0) {
          return {
            success: false,
            error: 'No year-over-year data available. Try Moving Average instead.'
          }
        }

        // Calculate growth rate
        const lastYearAvg = lastYearData.reduce((sum, d) => sum + d.actual_qty, 0) / lastYearData.length
        const currentAvg = historicalData.slice(-4).reduce((sum, d) => sum + d.actual_qty, 0) / 4
        const growthRate = lastYearAvg > 0 ? (currentAvg - lastYearAvg) / lastYearAvg : 0

        suggestions = generateWeeklyForecastsWithGrowth(startWeek, weekCount, currentAvg, growthRate)
        confidenceLevel = lastYearData.length >= 8 ? 'high' : 'low'
        break
      }

      case 'custom': {
        if (!customBaseline || customBaseline <= 0) {
          return { success: false, error: 'Custom baseline value is required and must be > 0' }
        }

        suggestions = generateWeeklyForecasts(startWeek, weekCount, customBaseline)
        confidenceLevel = 'low'
        break
      }

      default:
        return { success: false, error: 'Invalid forecast method' }
    }

    const averageValue = suggestions.reduce((sum, s) => sum + s.forecast_qty, 0) / suggestions.length

    return {
      success: true,
      data: suggestions,
      metadata: {
        averageValue: Math.round(averageValue),
        confidenceLevel,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Action 3: Validate Forecast Values
 * Check for anomalies (>50% variance, zero values, negative values)
 */
export async function validateForecastValues(
  sku: string,
  channelCode: string,
  forecastValues: { week_iso: string; forecast_qty: number }[]
): Promise<{
  success: boolean
  data?: ForecastValidationResult
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Fetch product safety stock threshold
    const { data: product } = await supabase
      .from('products')
      .select('safety_stock_weeks')
      .eq('sku', sku)
      .single()

    const safetyStockWeeks = product?.safety_stock_weeks || 2

    // Fetch historical average for variance calculation
    const firstWeek = forecastValues[0]?.week_iso
    if (!firstWeek) {
      return { success: false, error: 'No forecast values provided' }
    }

    const historicalResult = await fetchHistoricalSales(sku, channelCode, firstWeek)
    const historicalAvg = historicalResult.data && historicalResult.data.length > 0
      ? historicalResult.data.reduce((sum, d) => sum + d.actual_qty, 0) / historicalResult.data.length
      : 0

    const warnings: { week_iso: string; message: string; severity: 'warning' | 'error' | 'info' }[] = []
    const errors: { week_iso: string; message: string }[] = []

    forecastValues.forEach(({ week_iso, forecast_qty }) => {
      // Rule 1: Negative values
      if (forecast_qty < 0) {
        errors.push({ week_iso, message: 'Forecast quantity cannot be negative' })
      }

      // Rule 2: Zero values for active SKU
      if (forecast_qty === 0) {
        warnings.push({
          week_iso,
          message: 'Forecast is zero. Confirm if product is being discontinued.',
          severity: 'warning',
        })
      }

      // Rule 3: Variance check (>50% vs historical avg)
      if (historicalAvg > 0) {
        const variance = Math.abs(forecast_qty - historicalAvg)
        const variancePct = (variance / historicalAvg) * 100

        if (variancePct > 50) {
          warnings.push({
            week_iso,
            message: `Forecast ${forecast_qty} is ${variancePct.toFixed(0)}% different from historical average (${Math.round(historicalAvg)})`,
            severity: 'warning',
          })
        }
      }

      // Rule 4: Stockout risk (forecast < safety threshold)
      const safetyThreshold = forecast_qty * safetyStockWeeks
      if (forecast_qty < safetyThreshold) {
        warnings.push({
          week_iso,
          message: `Forecast ${forecast_qty} may trigger stockout risk (safety stock: ${safetyStockWeeks} weeks)`,
          severity: 'info',
        })
      }
    })

    const isValid = errors.length === 0

    return {
      success: true,
      data: {
        isValid,
        warnings,
        errors,
        summary: {
          totalWeeks: forecastValues.length,
          totalQuantity: forecastValues.reduce((sum, f) => sum + f.forecast_qty, 0),
          averageWeekly: Math.round(
            forecastValues.reduce((sum, f) => sum + f.forecast_qty, 0) / forecastValues.length
          ),
          historicalAverage: Math.round(historicalAvg),
        },
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Action 4: Save Forecast Batch (Upsert)
 * Atomic transaction to save all forecast weeks
 */
export async function saveForecastBatch(
  forecastData: {
    sku: string
    channel_code: string
    week_iso: string
    week_start_date: string
    week_end_date: string
    forecast_qty: number
  }[]
): Promise<{
  success: boolean
  savedCount?: number
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Batch upsert (INSERT ON CONFLICT UPDATE)
    const { data, error } = await supabase
      .from('sales_forecasts')
      .upsert(
        forecastData.map(f => ({
          sku: f.sku,
          channel_code: f.channel_code,
          week_iso: f.week_iso,
          week_start_date: f.week_start_date,
          week_end_date: f.week_end_date,
          forecast_qty: f.forecast_qty,
          updated_at: new Date().toISOString(),
        })),
        {
          onConflict: 'sku,channel_code,week_iso',
          ignoreDuplicates: false,
        }
      )
      .select()

    if (error) {
      return { success: false, error: error.message }
    }

    return {
      success: true,
      savedCount: data?.length || 0,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ================================================================
// HELPER FUNCTIONS (Internal)
// ================================================================

function generateWeeklyForecasts(
  startWeek: string,
  weekCount: number,
  baseQty: number
): ForecastSuggestion[] {
  const forecasts: ForecastSuggestion[] = []

  for (let i = 0; i < weekCount; i++) {
    const week = addWeeksToWeekString(startWeek, i)
    if (!week) continue

    // Calculate week start/end dates
    const weekStart = getWeekStartDate(week)
    const weekEnd = getWeekEndDate(week)

    forecasts.push({
      week_iso: week,
      week_start_date: weekStart,
      week_end_date: weekEnd,
      forecast_qty: baseQty,
    })
  }

  return forecasts
}

function generateWeeklyForecastsWithGrowth(
  startWeek: string,
  weekCount: number,
  baseQty: number,
  growthRate: number
): ForecastSuggestion[] {
  const forecasts: ForecastSuggestion[] = []

  for (let i = 0; i < weekCount; i++) {
    const week = addWeeksToWeekString(startWeek, i)
    if (!week) continue

    const weekStart = getWeekStartDate(week)
    const weekEnd = getWeekEndDate(week)

    // Apply growth rate with slight weekly increment
    const adjustedQty = Math.round(baseQty * (1 + growthRate + (i * 0.005)))

    forecasts.push({
      week_iso: week,
      week_start_date: weekStart,
      week_end_date: weekEnd,
      forecast_qty: adjustedQty,
    })
  }

  return forecasts
}

function getWeekStartDate(weekISO: string): string {
  // Use date-fns or native Date logic (already in project utils)
  // Returns YYYY-MM-DD for Monday of the given ISO week
  const { getWeekStartDate } = require('@/lib/utils/date')
  return getWeekStartDate(weekISO)
}

function getWeekEndDate(weekISO: string): string {
  // Returns YYYY-MM-DD for Sunday of the given ISO week
  const { getWeekEndDate } = require('@/lib/utils/date')
  return getWeekEndDate(weekISO)
}
```

### 3.2 TypeScript Type Definitions

**File:** `/src/lib/types/forecast-wizard.ts`

```typescript
/**
 * Forecast Wizard Type Definitions
 */

export type ForecastMethod = 'moving_average' | 'year_over_year' | 'custom'

export interface HistoricalSalesData {
  week_iso: string
  actual_qty: number
}

export interface ForecastSuggestion {
  week_iso: string
  week_start_date: string
  week_end_date: string
  forecast_qty: number
}

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

export interface ValidationWarning {
  week_iso: string
  message: string
  severity: 'warning' | 'error' | 'info'
}

export interface ValidationError {
  week_iso: string
  message: string
}

// Wizard state machine types
export type WizardStep = 1 | 2 | 3 | 4 | 5

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

export interface BulkAdjustment {
  type: 'multiply' | 'add' | 'set'
  value: number
  weekRange: { from: string; to: string }
}
```

---

## 4. Frontend Component Architecture

### 4.1 Component Tree

```
/app/planning/forecasts/wizard/page.tsx (Server Component - Entry Point)
  │
  └─> <ForecastWizardClient /> (Client Component)
       │
       ├─> <WizardHeader /> (Progress indicator)
       │
       ├─> <WizardStepRouter /> (Conditional rendering based on currentStep)
       │    │
       │    ├─> Step 1: <ScopeSelectorStep />
       │    │    ├─> <SKUSelector /> (ShadCN Select)
       │    │    ├─> <ChannelSelector /> (ShadCN Select)
       │    │    ├─> <WeekRangePicker /> (ShadCN Date Picker)
       │    │    └─> <HistoricalTrendChart /> (Recharts LineChart)
       │    │
       │    ├─> Step 2: <MethodSelectorStep />
       │    │    ├─> <MethodCard variant="moving_average" />
       │    │    ├─> <MethodCard variant="year_over_year" />
       │    │    └─> <MethodCard variant="custom" />
       │    │         └─> <MethodPreviewChart /> (Recharts AreaChart)
       │    │
       │    ├─> Step 3: <BulkAdjustmentStep />
       │    │    ├─> <TimelineEditor /> (Custom editable timeline)
       │    │    │    └─> <WeekCell editable={true} />
       │    │    └─> <BulkOperationsPanel />
       │    │         ├─> <WeekRangeSelector />
       │    │         └─> <ActionSelector /> (Multiply/Add/Set)
       │    │
       │    ├─> Step 4: <ValidationReviewStep />
       │    │    ├─> <ComparisonChart /> (Recharts ComposedChart)
       │    │    ├─> <ValidationAlerts /> (ShadCN Alert)
       │    │    └─> <SummaryTable /> (ShadCN Table)
       │    │
       │    └─> Step 5: <ConfirmationStep />
       │         └─> <SuccessMessage />
       │
       └─> <WizardFooter /> (Navigation buttons)
```

### 4.2 Key Component Specifications

#### 4.2.1 ForecastWizardClient Component

**File:** `/src/app/planning/forecasts/wizard/ForecastWizardClient.tsx`

```typescript
'use client'

import { useReducer, useEffect } from 'react'
import { wizardReducer, initialWizardState } from './wizardState'
import WizardHeader from './components/WizardHeader'
import WizardStepRouter from './components/WizardStepRouter'
import WizardFooter from './components/WizardFooter'

export default function ForecastWizardClient() {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState)

  const handleNext = async () => {
    // Validation logic before advancing
    if (state.currentStep === 1) {
      // Fetch historical data
      dispatch({ type: 'SET_LOADING', payload: true })
      // ... Server Action call
    }

    dispatch({ type: 'NEXT_STEP' })
  }

  const handleBack = () => {
    dispatch({ type: 'PREV_STEP' })
  }

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel? All changes will be lost.')) {
      window.location.href = '/planning/forecasts'
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <WizardHeader currentStep={state.currentStep} />

      <div className="mt-8 min-h-[500px]">
        <WizardStepRouter state={state} dispatch={dispatch} />
      </div>

      <WizardFooter
        currentStep={state.currentStep}
        onNext={handleNext}
        onBack={handleBack}
        onCancel={handleCancel}
        isLoading={state.isLoading}
      />
    </div>
  )
}
```

#### 4.2.2 HistoricalTrendChart (Step 1)

**File:** `/src/app/planning/forecasts/wizard/components/HistoricalTrendChart.tsx`

```typescript
'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { HistoricalSalesData } from '@/lib/types/forecast-wizard'

interface Props {
  data: HistoricalSalesData[]
}

export default function HistoricalTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          No historical data available for this SKU and channel.
        </CardContent>
      </Card>
    )
  }

  const avgValue = data.reduce((sum, d) => sum + d.actual_qty, 0) / data.length
  const maxValue = Math.max(...data.map(d => d.actual_qty))
  const minValue = Math.min(...data.map(d => d.actual_qty))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical Sales Trend (Past 12 Weeks)</CardTitle>
        <div className="text-sm text-muted-foreground">
          Avg: {Math.round(avgValue)} | Min: {minValue} | Max: {maxValue}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week_iso" />
            <YAxis />
            <Tooltip />
            <ReferenceLine y={avgValue} stroke="#94a3b8" strokeDasharray="5 5" label="Avg" />
            <Line type="monotone" dataKey="actual_qty" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
```

#### 4.2.3 MethodCard (Step 2)

**File:** `/src/app/planning/forecasts/wizard/components/MethodCard.tsx`

```typescript
'use client'

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import type { ForecastSuggestion } from '@/lib/types/forecast-wizard'

interface Props {
  method: 'moving_average' | 'year_over_year' | 'custom'
  title: string
  description: string
  previewData: ForecastSuggestion[]
  averageValue: number
  confidenceLevel: 'high' | 'medium' | 'low'
  isSelected: boolean
  onSelect: () => void
}

export default function MethodCard({
  method,
  title,
  description,
  previewData,
  averageValue,
  confidenceLevel,
  isSelected,
  onSelect,
}: Props) {
  const confidenceColors = {
    high: 'text-green-600',
    medium: 'text-yellow-600',
    low: 'text-red-600',
  }

  return (
    <Card
      className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onClick={onSelect}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <RadioGroupItem value={method} checked={isSelected} />
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={previewData}>
            <XAxis dataKey="week_iso" hide />
            <YAxis hide />
            <Area type="monotone" dataKey="forecast_qty" fill="#3b82f6" fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span>Avg Forecast: <strong>{Math.round(averageValue)}</strong></span>
          <span className={confidenceColors[confidenceLevel]}>
            Confidence: {confidenceLevel.toUpperCase()}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
```

#### 4.2.4 TimelineEditor (Step 3)

**File:** `/src/app/planning/forecasts/wizard/components/TimelineEditor.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import type { ForecastSuggestion } from '@/lib/types/forecast-wizard'

interface Props {
  values: ForecastSuggestion[]
  onChange: (updatedValues: ForecastSuggestion[]) => void
}

export default function TimelineEditor({ values, onChange }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const handleCellChange = (index: number, newValue: number) => {
    const updated = [...values]
    updated[index].forecast_qty = Math.max(0, Math.round(newValue))
    onChange(updated)
    setEditingIndex(null)
  }

  const getVarianceColor = (value: number, historicalAvg: number): string => {
    if (historicalAvg === 0) return 'bg-gray-100'
    const variance = Math.abs(value - historicalAvg) / historicalAvg
    if (variance > 0.5) return 'bg-red-100'
    if (variance > 0.3) return 'bg-yellow-100'
    return 'bg-green-100'
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 pb-4">
        {values.map((item, index) => (
          <div key={item.week_iso} className="flex flex-col items-center min-w-[80px]">
            <div className="text-xs text-muted-foreground mb-1">{item.week_iso}</div>
            {editingIndex === index ? (
              <Input
                type="number"
                value={item.forecast_qty}
                onChange={(e) => handleCellChange(index, parseFloat(e.target.value))}
                onBlur={() => setEditingIndex(null)}
                className="w-full text-center"
                autoFocus
              />
            ) : (
              <div
                className={`w-full px-3 py-2 text-center rounded cursor-pointer hover:ring-2 hover:ring-primary ${getVarianceColor(item.forecast_qty, 5000)}`}
                onClick={() => setEditingIndex(index)}
              >
                {item.forecast_qty}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 4.3 State Management (useReducer)

**File:** `/src/app/planning/forecasts/wizard/wizardState.ts`

```typescript
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

type WizardAction =
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
```

---

## 5. AI Forecast Algorithms

### 5.1 Algorithm 1: Moving Average (4-Week MA)

**Implementation:** See `generateForecastSuggestions()` in Section 3.1

**Formula:**
```
Forecast(week_n) = AVG(Actual[week_n-1], Actual[week_n-2], Actual[week_n-3], Actual[week_n-4])
```

**Use Case:** Stable demand products with minimal seasonality.

**Confidence Level:**
- High: If 4+ weeks of historical data available
- Medium: If 2-3 weeks available
- Low: If < 2 weeks

### 5.2 Algorithm 2: Year-over-Year Growth (YoY)

**Implementation:** See `generateForecastSuggestions()` in Section 3.1

**Formula:**
```
Growth Rate = (Current Avg - Last Year Avg) / Last Year Avg
Forecast(week_n) = Last Year(week_n) × (1 + Growth Rate)
```

**Use Case:** Seasonal products or high-growth SKUs.

**Confidence Level:**
- High: If 8+ weeks of YoY data available
- Medium: If 4-7 weeks
- Low: If < 4 weeks

### 5.3 Algorithm 3: Custom Baseline

**Implementation:** User-defined baseline value applied uniformly across all weeks.

**Formula:**
```
Forecast(week_n) = Custom Baseline Value
```

**Use Case:** New product launches or promotional events.

**Confidence Level:** Always "Low" (user discretion).

---

## 6. Data Flow & State Management

### 6.1 User Journey Flow (Detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: SCOPE SELECTION                                         │
├─────────────────────────────────────────────────────────────────┤
│ User Actions:                                                   │
│ 1. Select SKU from dropdown (autocomplete)                      │
│ 2. Select Channel (Amazon, Shopify, etc.)                       │
│ 3. Select Start Week (date picker → converts to ISO week)       │
│ 4. Select Week Count (default: 12, range: 4-24)                 │
│                                                                 │
│ Frontend Logic:                                                 │
│ - Validate form inputs (required fields)                        │
│ - Call fetchHistoricalSales(sku, channel, startWeek)            │
│ - Display HistoricalTrendChart with avg/min/max                 │
│                                                                 │
│ State Update:                                                   │
│ - dispatch({ type: 'UPDATE_FORM_DATA', payload: { sku, ... }}) │
│ - dispatch({ type: 'SET_HISTORICAL_DATA', payload: data })     │
│                                                                 │
│ Transition Condition: All fields filled + chart loaded          │
│ → [Next: Generate Forecast]                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: AI FORECAST GENERATION                                  │
├─────────────────────────────────────────────────────────────────┤
│ User Actions:                                                   │
│ 1. View 3 method cards side-by-side:                            │
│    - Moving Average (4-week MA)                                 │
│    - Year-over-Year Growth (+X%)                                │
│    - Custom Baseline (user input)                               │
│ 2. Select preferred method (radio button)                       │
│ 3. (If Custom) Enter baseline value                             │
│                                                                 │
│ Frontend Logic:                                                 │
│ - For each method, call generateForecastSuggestions()           │
│ - Display mini preview chart + avg value + confidence           │
│ - Highlight selected method with border                         │
│                                                                 │
│ State Update:                                                   │
│ - dispatch({ type: 'SET_FORECAST_VALUES', payload: suggestions })│
│ - dispatch({ type: 'UPDATE_FORM_DATA', payload: { selectedMethod }})│
│                                                                 │
│ Transition Condition: Method selected                           │
│ → [Next: Adjust Forecast]                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: BULK ADJUSTMENTS                                        │
├─────────────────────────────────────────────────────────────────┤
│ User Actions:                                                   │
│ 1. View editable timeline (horizontal week cells)               │
│ 2. Click week cell to edit individual value                     │
│ 3. OR use bulk operations panel:                                │
│    - Select week range (e.g., W51-W52)                          │
│    - Choose action: Multiply by 1.35 / Add 100 / Set to 6000    │
│    - Click [Apply]                                              │
│                                                                 │
│ Frontend Logic:                                                 │
│ - TimelineEditor: local state for edits                         │
│ - BulkOperationsPanel: apply math to selected weeks             │
│ - Color-code cells by variance (green/yellow/red)               │
│                                                                 │
│ State Update:                                                   │
│ - dispatch({ type: 'SET_FORECAST_VALUES', payload: updatedValues })│
│                                                                 │
│ Transition Condition: User clicks [Next: Review]                │
│ → [Next: Validate & Review]                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: VALIDATION & REVIEW                                     │
├─────────────────────────────────────────────────────────────────┤
│ User Actions:                                                   │
│ 1. Review comparison chart:                                     │
│    - New forecast (blue line)                                   │
│    - Last year actual (gray line)                               │
│ 2. Review validation warnings:                                  │
│    - ⚠️ W51: +40% variance vs historical                       │
│    - ⚠️ W52: +51% variance vs historical                       │
│ 3. Review summary table:                                        │
│    - Total forecast by channel                                  │
│    - Average weekly forecast                                    │
│                                                                 │
│ Frontend Logic:                                                 │
│ - Call validateForecastValues(sku, channel, values)             │
│ - Display warnings/errors in Alert components                   │
│ - Allow user to go back to Step 3 if needed                     │
│                                                                 │
│ State Update:                                                   │
│ - dispatch({ type: 'SET_VALIDATION_RESULT', payload: result }) │
│                                                                 │
│ Transition Condition: User clicks [Commit Forecast]             │
│ → [Next: Save to Database]                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: CONFIRMATION                                            │
├─────────────────────────────────────────────────────────────────┤
│ Backend Action:                                                 │
│ - Call saveForecastBatch(forecastData)                          │
│ - Upsert to sales_forecasts table (atomic transaction)          │
│                                                                 │
│ Frontend Logic:                                                 │
│ - Show loading spinner during save                              │
│ - On success: display ✅ Success message                        │
│ - Show summary: "Saved 12 weeks of forecast for SKU-001"        │
│                                                                 │
│ User Actions:                                                   │
│ - [Create Another Forecast] → Reset wizard                      │
│ - [View Forecasts] → Navigate to /planning/forecasts            │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Error Handling Strategy

**Frontend Validation (Before Server Call):**
- Required fields check (SKU, Channel, Week Range)
- Week count range validation (4-24 weeks)
- Custom baseline validation (> 0)

**Backend Validation (In Server Actions):**
- Database connectivity check
- RLS policy enforcement
- Data type validation (forecast_qty must be integer ≥ 0)
- Duplicate key handling (UPSERT conflict resolution)

**Error Display:**
- Use ShadCN `Alert` component with `variant="destructive"`
- Show specific error message from Server Action response
- Allow user to retry or go back to previous step

---

## 7. Performance Optimization

### 7.1 Database Query Optimization

**Index Verification:**
```sql
-- Run EXPLAIN ANALYZE on historical sales query
EXPLAIN ANALYZE
SELECT week_iso, actual_qty
FROM sales_actuals
WHERE sku = 'SKU-001'
  AND channel_code = 'Amazon'
  AND week_iso >= '2025-W37'
  AND week_iso <= '2025-W48'
ORDER BY week_iso;

-- Expected: Index Scan on idx_sales_actuals_sku_channel_week
-- If showing Seq Scan, create missing index
```

**Batch Upsert Performance:**
- Use single `upsert()` call for all 12 weeks (not 12 separate INSERT calls)
- Expected insert time: < 200ms for 12 rows

### 7.2 Frontend Performance

**Lazy Loading:**
```typescript
// Step 2: Only call generateForecastSuggestions when user selects a method
const handleMethodSelect = async (method: ForecastMethod) => {
  dispatch({ type: 'SET_LOADING', payload: true })
  const result = await generateForecastSuggestions(...)
  // Render preview only after calculation completes
}
```

**Debounced Input:**
```typescript
// TimelineEditor: Debounce onChange to avoid excessive re-renders
import { useDebouncedCallback } from 'use-debounce'

const debouncedUpdate = useDebouncedCallback((updatedValues) => {
  onChange(updatedValues)
}, 300)
```

**Chart Optimization:**
- Recharts: Use `ResponsiveContainer` with fixed height (avoid dynamic resizing)
- Limit data points: max 24 weeks (acceptable render time)

### 7.3 Caching Strategy (Optional - V1.1)

**Browser-Side Caching:**
- Use `sessionStorage` to cache historical data (Step 1)
- Invalidate cache on SKU/Channel change

**Server-Side Caching (Future):**
- Consider Redis for frequently-accessed historical data (if > 100 daily users)

---

## 8. Security & Validation

### 8.1 RLS Policy Enforcement

**Existing RLS Policies (from migration 20251202000001_add_rls_policies.sql):**

```sql
-- Assume existing policy allows users to INSERT/UPDATE sales_forecasts
-- based on organization membership or user role

-- Verify RLS is enabled:
ALTER TABLE sales_forecasts ENABLE ROW LEVEL SECURITY;

-- Example policy (adjust based on your auth schema):
CREATE POLICY "Users can manage forecasts"
  ON sales_forecasts
  FOR ALL
  USING (auth.uid() IS NOT NULL); -- Replace with actual org/role logic
```

**Server Action Security:**
- All Server Actions run with server-side Supabase client
- RLS policies automatically enforce access control
- No need to manually check permissions in Server Actions (handled by Supabase)

### 8.2 Input Validation Rules

**Frontend Validation:**
```typescript
// Example: Zod schema for form validation
import { z } from 'zod'

const forecastFormSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  channelCode: z.string().min(1, 'Channel is required'),
  startWeek: z.string().regex(/^\d{4}-W\d{2}$/, 'Invalid ISO week format'),
  weekCount: z.number().int().min(4).max(24),
  customBaseline: z.number().positive().optional(),
})
```

**Backend Validation (in Server Actions):**
```typescript
// Validate forecast_qty range
if (forecastQty < 0) {
  return { success: false, error: 'Forecast quantity cannot be negative' }
}

if (forecastQty > 1000000) {
  return { success: false, error: 'Forecast quantity exceeds maximum (1,000,000)' }
}
```

### 8.3 Audit Trail

**Leveraging Existing Timestamps:**
- `created_at`: Auto-populated on INSERT
- `updated_at`: Auto-populated on UPDATE

**Future Enhancement (V1.2):**
- Add `forecast_change_log` table to track edit history
- Columns: `id`, `forecast_id`, `old_value`, `new_value`, `changed_by`, `changed_at`, `change_reason`

---

## 9. Implementation Roadmap

### 9.1 Development Phases

#### Phase 1: Backend Foundation (Week 1-2)

**Tasks:**
1. Create Server Actions (`/lib/actions/forecast-wizard.ts`)
   - `fetchHistoricalSales()`
   - `generateForecastSuggestions()`
   - `validateForecastValues()`
   - `saveForecastBatch()`
2. Create TypeScript types (`/lib/types/forecast-wizard.ts`)
3. Add date utility functions if missing (`getWeekStartDate`, `getWeekEndDate`)
4. Unit test Server Actions with mock data

**Deliverable:** Working API endpoints tested with Postman/Thunder Client

---

#### Phase 2: Frontend Core (Week 3-4)

**Tasks:**
1. Create wizard route (`/app/planning/forecasts/wizard/page.tsx`)
2. Implement wizard state machine (`wizardState.ts` + `useReducer`)
3. Build WizardHeader, WizardFooter, WizardStepRouter components
4. Implement Step 1: ScopeSelectorStep
   - SKU/Channel selectors
   - HistoricalTrendChart
5. Implement Step 5: ConfirmationStep (success message)

**Deliverable:** Basic wizard flow (Step 1 → Step 5) with mock data

---

#### Phase 3: AI Forecast UI (Week 5)

**Tasks:**
1. Implement Step 2: MethodSelectorStep
   - MethodCard component (3 variants)
   - Method preview charts
   - Server Action integration
2. Implement Step 3: BulkAdjustmentStep
   - TimelineEditor component
   - BulkOperationsPanel
3. Test all 3 forecast methods with real historical data

**Deliverable:** Working AI forecast generation + bulk editing

---

#### Phase 4: Validation & Polish (Week 6)

**Tasks:**
1. Implement Step 4: ValidationReviewStep
   - ComparisonChart (Recharts ComposedChart)
   - ValidationAlerts (ShadCN Alert)
   - SummaryTable
2. Integrate `validateForecastValues()` Server Action
3. Error handling & edge cases (no historical data, invalid inputs)
4. Responsive design (mobile/tablet)
5. Accessibility audit (keyboard navigation, screen reader)

**Deliverable:** Production-ready wizard

---

### 9.2 Testing Checkpoints

**Unit Tests:**
- Server Actions: Test each algorithm with known inputs
- Utility functions: Test week calculations (ISO week parsing)

**Integration Tests:**
- End-to-end wizard flow: SKU selection → Method selection → Save
- Database: Verify UPSERT correctly handles conflicts

**User Acceptance Tests:**
- Beta test with 3-5 power users (Phase 1 from PRD)
- Collect feedback on usability and performance

---

## 10. Testing Strategy

### 10.1 Server Action Tests

**File:** `/src/lib/actions/__tests__/forecast-wizard.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { generateForecastSuggestions } from '../forecast-wizard'

describe('generateForecastSuggestions', () => {
  it('should calculate 4-week moving average correctly', async () => {
    // Mock historical data: [100, 120, 110, 130]
    // Expected MA: (100+120+110+130)/4 = 115

    const result = await generateForecastSuggestions(
      'SKU-001',
      'Amazon',
      '2025-W49',
      12,
      'moving_average'
    )

    expect(result.success).toBe(true)
    expect(result.data?.[0].forecast_qty).toBe(115)
  })

  it('should return error if no historical data', async () => {
    // Mock empty historical data

    const result = await generateForecastSuggestions(
      'NEW-SKU',
      'Amazon',
      '2025-W49',
      12,
      'moving_average'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('No historical data')
  })
})
```

### 10.2 Component Tests

**File:** `/src/app/planning/forecasts/wizard/components/__tests__/HistoricalTrendChart.test.tsx`

```typescript
import { render, screen } from '@testing-library/react'
import HistoricalTrendChart from '../HistoricalTrendChart'

describe('HistoricalTrendChart', () => {
  it('should display average, min, max values', () => {
    const mockData = [
      { week_iso: '2025-W45', actual_qty: 100 },
      { week_iso: '2025-W46', actual_qty: 150 },
      { week_iso: '2025-W47', actual_qty: 120 },
    ]

    render(<HistoricalTrendChart data={mockData} />)

    expect(screen.getByText(/Avg: 123/i)).toBeInTheDocument()
    expect(screen.getByText(/Min: 100/i)).toBeInTheDocument()
    expect(screen.getByText(/Max: 150/i)).toBeInTheDocument()
  })

  it('should show empty state when no data', () => {
    render(<HistoricalTrendChart data={[]} />)

    expect(screen.getByText(/No historical data/i)).toBeInTheDocument()
  })
})
```

### 10.3 End-to-End Tests (Optional - Playwright)

**File:** `/tests/e2e/forecast-wizard.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('complete forecast wizard flow', async ({ page }) => {
  await page.goto('/planning/forecasts/wizard')

  // Step 1: Scope Selection
  await page.getByRole('combobox', { name: /SKU/i }).selectOption('SKU-001')
  await page.getByRole('combobox', { name: /Channel/i }).selectOption('Amazon')
  await page.getByLabel(/Start Week/i).fill('2025-W49')
  await page.getByRole('button', { name: /Next/i }).click()

  // Step 2: Method Selection
  await page.getByRole('radio', { name: /Moving Average/i }).check()
  await page.getByRole('button', { name: /Next/i }).click()

  // Step 3: Adjustments (skip)
  await page.getByRole('button', { name: /Next/i }).click()

  // Step 4: Review
  await expect(page.getByText(/Validation Warnings/i)).toBeVisible()
  await page.getByRole('button', { name: /Commit/i }).click()

  // Step 5: Confirmation
  await expect(page.getByText(/Successfully saved/i)).toBeVisible()
})
```

---

## Appendix A: File Structure

```
rolloy-scm/
├── src/
│   ├── app/
│   │   └── planning/
│   │       └── forecasts/
│   │           └── wizard/
│   │               ├── page.tsx (Server Component entry)
│   │               ├── ForecastWizardClient.tsx (Client Component)
│   │               ├── wizardState.ts (Reducer logic)
│   │               └── components/
│   │                   ├── WizardHeader.tsx
│   │                   ├── WizardFooter.tsx
│   │                   ├── WizardStepRouter.tsx
│   │                   ├── ScopeSelectorStep.tsx
│   │                   ├── MethodSelectorStep.tsx
│   │                   ├── BulkAdjustmentStep.tsx
│   │                   ├── ValidationReviewStep.tsx
│   │                   ├── ConfirmationStep.tsx
│   │                   ├── HistoricalTrendChart.tsx
│   │                   ├── MethodCard.tsx
│   │                   ├── TimelineEditor.tsx
│   │                   ├── BulkOperationsPanel.tsx
│   │                   ├── ComparisonChart.tsx
│   │                   └── ValidationAlerts.tsx
│   ├── lib/
│   │   ├── actions/
│   │   │   └── forecast-wizard.ts (NEW - Server Actions)
│   │   ├── queries/
│   │   │   └── forecast-wizard.ts (NEW - Helper queries)
│   │   ├── types/
│   │   │   └── forecast-wizard.ts (NEW - TypeScript types)
│   │   └── utils/
│   │       └── date.ts (Existing - extend if needed)
│   └── components/
│       └── ui/ (Existing ShadCN components)
└── supabase/
    └── migrations/ (No new migrations needed)
```

---

## Appendix B: API Contracts (OpenAPI-Style)

### Action: generateForecastSuggestions

**Request:**
```typescript
{
  sku: string // "SKU-001"
  channelCode: string // "Amazon"
  startWeek: string // "2025-W49"
  weekCount: number // 12
  method: "moving_average" | "year_over_year" | "custom"
  customBaseline?: number // 5000 (optional, required for 'custom')
}
```

**Response (Success):**
```typescript
{
  success: true
  data: [
    {
      week_iso: "2025-W49"
      week_start_date: "2025-12-02"
      week_end_date: "2025-12-08"
      forecast_qty: 5150
    },
    // ... 11 more weeks
  ]
  metadata: {
    averageValue: 5150
    confidenceLevel: "high"
  }
}
```

**Response (Error):**
```typescript
{
  success: false
  error: "No historical data available for this SKU and channel."
}
```

---

## Appendix C: UI Mockups (ASCII Art)

### Step 2: Method Selector

```
┌────────────────────────────────────────────────────────────────────┐
│ Choose a Forecast Method                                           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐   │
│ │ Moving Average   │ │ Year-over-Year   │ │ Custom Baseline  │   │
│ │ (4-Week MA)      │ │ Growth (+12%)    │ │                  │   │
│ │ ──────────────── │ │ ──────────────── │ │ ──────────────   │   │
│ │ [Mini Chart]     │ │ [Mini Chart]     │ │ [Input: 5000]    │   │
│ │ Avg: 5,150       │ │ Avg: 5,824       │ │ Avg: 5,000       │   │
│ │ Confidence: HIGH │ │ Confidence: HIGH │ │ Confidence: LOW  │   │
│ │ ◉ Select         │ │ ○ Select         │ │ ○ Select         │   │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘   │
│                                                                    │
│                                      [← Back] [Next: Adjust →]    │
└────────────────────────────────────────────────────────────────────┘
```

### Step 3: Timeline Editor

```
┌────────────────────────────────────────────────────────────────────┐
│ Forecast Timeline (Click to Edit)                                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ Week:  W49   W50   W51*  W52*  2026-W01  W02   W03   W04 ...      │
│ Qty:  5100  5200  6500  7000    4800    5100   5200  5300         │
│       [──]  [──]  [🟡]  [🔴]   [──]    [──]   [──]  [──]         │
│                   └─ Promotion weeks (adjusted +35%)               │
│                                                                    │
│ Bulk Operations:                                                   │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ Select Weeks: [W51 - W52] ✓                                 │   │
│ │ Action: ◉ Multiply by [1.35] × ○ Add [___] ○ Set to [___]  │   │
│ │ [Apply]                                                      │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│                                      [← Back] [Next: Review →]     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Document Approval

| Role | Name | Status | Date |
|------|------|--------|------|
| System Architect | Claude | ✅ Drafted | 2025-12-18 |
| Product Director | (From PRD) | ✅ Approved | 2025-12-18 |
| Frontend Artisan | TBD | ⏳ Pending Review | - |
| Backend Specialist | TBD | ⏳ Pending Review | - |
| QA Director | TBD | ⏳ Pending Review | - |

---

**Next Steps:**
1. Frontend Artisan: Implement wizard UI based on Section 4
2. Backend Specialist: Implement Server Actions based on Section 3
3. QA Director: Create test plan based on Section 10
4. Product Director: Review and approve design document

**End of Design Document**
