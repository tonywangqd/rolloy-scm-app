# Algorithm Audit V4 - Hover Interaction Technical Design

## Document Metadata
- **Feature:** Algorithm Audit V4 - Hover-based Data Provenance Display
- **Role:** System Architect
- **Date:** 2025-12-05
- **Status:** Design Specification
- **Priority:** P1
- **Parent Spec:** `specs/algorithm-audit-v4-hover-interaction/requirements.md`

---

## 1. Executive Summary

### 1.1 Technical Objective

Replace the current click-to-expand detail mechanism with a hover-activated tooltip system that displays data provenance information instantly. The solution leverages:

- **Radix UI Tooltip** (already installed via ShadCN UI)
- **Pre-fetched lineage data** from `AlgorithmAuditRowV4` (no additional database queries)
- **Client-side state management** for tooltip rendering
- **Accessibility-first design** (keyboard navigation, ARIA labels, screen reader support)

### 1.2 Technical Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **UI Primitive** | `@radix-ui/react-tooltip` | Already available via ShadCN, battle-tested accessibility |
| **Component Library** | ShadCN UI components | Consistent design system |
| **State Management** | React `useState` (client component) | Simple, no need for global state |
| **Data Source** | Existing `AlgorithmAuditRowV4` type | All lineage data already fetched, zero extra queries |
| **Styling** | Tailwind CSS v4 | Matches existing design system |

### 1.3 Architecture Decision

**No Backend Changes Required**
- All tooltip data is already available in the `AlgorithmAuditRowV4` type
- The existing `fetchAlgorithmAuditV4` query provides complete lineage information
- Tooltip rendering is purely a frontend enhancement

**Component Strategy**
- Create reusable `DataProvenanceTooltip` component
- Wrap all numeric cells in the Algorithm Audit Table V4
- Column-specific content rendering based on tooltip type

---

## 2. Data Model & Type Definitions

### 2.1 Existing Types (No Changes Needed)

The `AlgorithmAuditRowV4` type (defined in `src/components/inventory/algorithm-audit-table-v4.tsx`) already provides:

```typescript
export interface AlgorithmAuditRowV4 {
  // Basic week information
  week_iso: string
  week_start_date: string
  week_offset: number
  is_past: boolean
  is_current: boolean

  // Sales data
  sales_forecast: number
  sales_actual: number | null
  sales_effective: number

  // Order data
  planned_order: number
  actual_order: number
  order_effective: number

  // Factory ship data
  planned_factory_ship: number
  actual_factory_ship: number
  factory_ship_effective: number

  // Ship data
  planned_ship: number
  actual_ship: number
  ship_effective: number

  // Arrival data
  planned_arrival: number
  actual_arrival: number
  arrival_effective: number

  // Inventory data
  opening_stock: number
  closing_stock: number
  safety_threshold: number
  stock_status: 'OK' | 'Risk' | 'Stockout'

  // V4 Extensions: Coverage & Lineage
  sales_coverage_status: CoverageStatus
  sales_uncovered_qty: number

  // Lineage metadata (propagation sources)
  planned_factory_ship_source?: PropagationSource[]
  planned_ship_source?: PropagationSource[]
  planned_arrival_source?: PropagationSource[]

  // Detailed data (for tooltips)
  order_details: OrderDetailV4[]
  factory_ship_details: DeliveryDetailV4[]
  ship_details: ShipmentDetailV4[]
  arrival_details: ArrivalDetailV4[]
}
```

### 2.2 New Tooltip-Specific Types

**File:** `src/lib/types/algorithm-audit-tooltip.ts` (NEW)

```typescript
/**
 * Tooltip column identifier
 * Maps to specific columns in the Algorithm Audit Table V4
 */
export type TooltipColumnType =
  | 'sales_forecast'
  | 'sales_actual'
  | 'sales_effective'
  | 'order_planned'
  | 'order_actual'
  | 'order_effective'
  | 'factory_ship_planned'
  | 'factory_ship_actual'
  | 'factory_ship_effective'
  | 'ship_planned'
  | 'ship_actual'
  | 'ship_effective'
  | 'arrival_planned'
  | 'arrival_actual'
  | 'arrival_effective'
  | 'inventory_opening'
  | 'inventory_closing'
  | 'inventory_safety'
  | 'inventory_status'

/**
 * Tooltip content structure
 * Generated dynamically based on column type and row data
 */
export interface TooltipContent {
  // Header
  icon: string // Emoji icon (e.g., "📦", "🚢", "📊")
  title: string // "销售 Sales (预测)" or "下单 Order (实际)"
  week: string // "Week 2025-W06"

  // Value section
  value: number | string // Main value (e.g., 800, "OK")
  source: string // "Actual (from database)" or "Forecast" or "Calculated"

  // Details section
  details: TooltipDetailItem[]

  // Status section
  status?: TooltipStatusInfo

  // Footer action
  hasViewDetails: boolean
  viewDetailsUrl?: string
}

/**
 * Individual detail item in tooltip (e.g., PO line, shipment line)
 */
export interface TooltipDetailItem {
  label: string // "PO-2025-001" or "TRK-001"
  value: string | number // "500 units" or "2025-02-03"
  sublabel?: string // "(Delivered ✓)" or "Status: In Transit"
  linkUrl?: string // "/procurement/[id]" for clickable IDs
  variant?: 'success' | 'warning' | 'danger' | 'default' // Badge color
}

/**
 * Status badge information
 */
export interface TooltipStatusInfo {
  label: string // "Fully Covered" or "Status: OK"
  variant: 'success' | 'warning' | 'danger' | 'default'
  icon: string // "✓" or "⚠️" or "✗"
  sublabel?: string // "Gap: 20 units" for partial coverage
}

/**
 * Props for DataProvenanceTooltip component
 */
export interface DataProvenanceTooltipProps {
  columnType: TooltipColumnType
  rowData: AlgorithmAuditRowV4
  children: React.ReactNode // The table cell content
  disabled?: boolean // Disable tooltip (e.g., for empty cells)
}
```

---

## 3. Component Architecture

### 3.1 Component Hierarchy

```
<AlgorithmAuditTableV4>
  └── <tbody>
        └── <tr> (each row)
              └── <td> (numeric cell)
                    └── <DataProvenanceTooltip
                          columnType="order_actual"
                          rowData={row}
                        >
                          <span>800</span> // Cell content
                        </DataProvenanceTooltip>
```

### 3.2 Component Files

#### 3.2.1 Main Tooltip Component

**File:** `src/components/inventory/data-provenance-tooltip.tsx` (NEW)

```typescript
'use client'

import React from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Info } from 'lucide-react'
import type {
  DataProvenanceTooltipProps,
  TooltipContent as TooltipContentData,
  TooltipDetailItem,
  TooltipStatusInfo,
} from '@/lib/types/algorithm-audit-tooltip'
import type { AlgorithmAuditRowV4 } from '@/components/inventory/algorithm-audit-table-v4'
import { generateTooltipContent } from '@/lib/utils/tooltip-content-generator'

export function DataProvenanceTooltip({
  columnType,
  rowData,
  children,
  disabled = false,
}: DataProvenanceTooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  if (disabled) {
    return <>{children}</>
  }

  const tooltipData = generateTooltipContent(columnType, rowData)

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <span
            className="cursor-help border-b border-dashed border-gray-300 hover:border-gray-500 transition-colors"
            tabIndex={0}
            role="gridcell"
            aria-describedby={`tooltip-${columnType}-${rowData.week_iso}`}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          sideOffset={10}
          className="max-w-[400px] p-4 bg-white border border-gray-200 rounded-lg shadow-lg"
          id={`tooltip-${columnType}-${rowData.week_iso}`}
          role="tooltip"
        >
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{tooltipData.icon}</span>
                <h4 className="text-sm font-semibold text-gray-900">{tooltipData.title}</h4>
              </div>
              <span className="text-xs text-gray-500">{tooltipData.week}</span>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200" />

            {/* Value Section */}
            <div className="space-y-1">
              <div className="text-base font-medium text-gray-900">
                Value: {tooltipData.value}
              </div>
              <div className="text-xs text-gray-600">
                Source: {tooltipData.source}
              </div>
            </div>

            {/* Details Section */}
            {tooltipData.details.length > 0 && (
              <>
                <div className="border-t border-gray-200" />
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-700">Details:</div>
                  <ul className="space-y-1">
                    {tooltipData.details.map((detail, idx) => (
                      <li key={idx} className="text-xs text-gray-700">
                        {detail.linkUrl ? (
                          <Link
                            href={detail.linkUrl}
                            target="_blank"
                            className="text-blue-600 hover:underline"
                          >
                            {detail.label}
                          </Link>
                        ) : (
                          <span className="font-medium">{detail.label}</span>
                        )}
                        {': '}
                        <span>{detail.value}</span>
                        {detail.sublabel && (
                          <span className="text-gray-500 ml-1">({detail.sublabel})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {/* Status Section */}
            {tooltipData.status && (
              <>
                <div className="border-t border-gray-200" />
                <div className="flex items-center gap-2">
                  <Badge variant={tooltipData.status.variant}>
                    {tooltipData.status.icon} {tooltipData.status.label}
                  </Badge>
                  {tooltipData.status.sublabel && (
                    <span className="text-xs text-gray-600">{tooltipData.status.sublabel}</span>
                  )}
                </div>
              </>
            )}

            {/* Footer */}
            {tooltipData.hasViewDetails && (
              <>
                <div className="border-t border-gray-200" />
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs p-0 h-auto"
                  onClick={() => {
                    // TODO: Open modal with full details
                    console.log('View full details for', columnType, rowData.week_iso)
                  }}
                >
                  View Full Details →
                </Button>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

#### 3.2.2 Tooltip Content Generator

**File:** `src/lib/utils/tooltip-content-generator.ts` (NEW)

```typescript
import type {
  TooltipColumnType,
  TooltipContent,
  TooltipDetailItem,
  TooltipStatusInfo,
} from '@/lib/types/algorithm-audit-tooltip'
import type { AlgorithmAuditRowV4 } from '@/components/inventory/algorithm-audit-table-v4'

/**
 * Generates tooltip content based on column type and row data
 * Central logic for all tooltip content generation
 */
export function generateTooltipContent(
  columnType: TooltipColumnType,
  rowData: AlgorithmAuditRowV4
): TooltipContent {
  switch (columnType) {
    case 'sales_forecast':
      return generateSalesForecastTooltip(rowData)
    case 'sales_actual':
      return generateSalesActualTooltip(rowData)
    case 'sales_effective':
      return generateSalesEffectiveTooltip(rowData)
    case 'order_planned':
      return generateOrderPlannedTooltip(rowData)
    case 'order_actual':
      return generateOrderActualTooltip(rowData)
    case 'order_effective':
      return generateOrderEffectiveTooltip(rowData)
    case 'factory_ship_planned':
      return generateFactoryShipPlannedTooltip(rowData)
    case 'factory_ship_actual':
      return generateFactoryShipActualTooltip(rowData)
    case 'ship_actual':
      return generateShipActualTooltip(rowData)
    case 'arrival_planned':
      return generateArrivalPlannedTooltip(rowData)
    case 'arrival_actual':
      return generateArrivalActualTooltip(rowData)
    case 'arrival_effective':
      return generateArrivalEffectiveTooltip(rowData)
    case 'inventory_opening':
      return generateInventoryOpeningTooltip(rowData)
    case 'inventory_closing':
      return generateInventoryClosingTooltip(rowData)
    case 'inventory_status':
      return generateInventoryStatusTooltip(rowData)
    default:
      return generateDefaultTooltip(rowData)
  }
}

// ================================================================
// COLUMN-SPECIFIC GENERATORS
// ================================================================

function generateSalesActualTooltip(rowData: AlgorithmAuditRowV4): TooltipContent {
  return {
    icon: '📊',
    title: '销售 Sales (实际)',
    week: `Week ${rowData.week_iso}`,
    value: `${rowData.sales_actual ?? 0} units`,
    source: rowData.sales_actual !== null ? 'Actual (from sales_actuals)' : 'No actual data',
    details: [],
    status: undefined,
    hasViewDetails: false,
  }
}

function generateOrderActualTooltip(rowData: AlgorithmAuditRowV4): TooltipContent {
  const details: TooltipDetailItem[] = rowData.order_details.map((order) => ({
    label: order.po_number,
    value: `${order.ordered_qty} units`,
    sublabel: order.fulfillment_status === 'Complete' ? 'Delivered ✓' : `${order.fulfillment_status}`,
    linkUrl: `/procurement/${order.po_id}`,
    variant: order.fulfillment_status === 'Complete' ? 'success' : 'warning',
  }))

  return {
    icon: '📦',
    title: '下单 Order (实际)',
    week: `Week ${rowData.week_iso}`,
    value: `${rowData.actual_order} units`,
    source: 'Actual purchase orders',
    details,
    status: {
      label: rowData.sales_coverage_status,
      variant:
        rowData.sales_coverage_status === 'Fully Covered' ? 'success' :
        rowData.sales_coverage_status === 'Partially Covered' ? 'warning' : 'danger',
      icon:
        rowData.sales_coverage_status === 'Fully Covered' ? '✓' :
        rowData.sales_coverage_status === 'Partially Covered' ? '⚠️' : '✗',
      sublabel: rowData.sales_uncovered_qty > 0 ? `Gap: ${rowData.sales_uncovered_qty} units` : undefined,
    },
    hasViewDetails: true,
  }
}

function generateFactoryShipActualTooltip(rowData: AlgorithmAuditRowV4): TooltipContent {
  const details: TooltipDetailItem[] = rowData.factory_ship_details.map((delivery) => ({
    label: delivery.delivery_number,
    value: `${delivery.delivered_qty} units`,
    sublabel: `from ${delivery.po_number}`,
    linkUrl: `/procurement/deliveries/${delivery.delivery_id}`,
  }))

  return {
    icon: '🏭',
    title: '工厂发货 Factory Ship (实际)',
    week: `Week ${rowData.week_iso}`,
    value: `${rowData.actual_factory_ship} units`,
    source: 'Actual production deliveries',
    details,
    hasViewDetails: true,
  }
}

function generateShipActualTooltip(rowData: AlgorithmAuditRowV4): TooltipContent {
  const details: TooltipDetailItem[] = rowData.ship_details.map((shipment) => ({
    label: shipment.tracking_number,
    value: `${shipment.shipped_qty} units`,
    sublabel: shipment.current_status,
    linkUrl: `/logistics/${shipment.shipment_id}`,
  }))

  return {
    icon: '🚢',
    title: '物流发运 Ship (实际)',
    week: `Week ${rowData.week_iso}`,
    value: `${rowData.actual_ship} units`,
    source: 'Actual shipment departures',
    details,
    hasViewDetails: true,
  }
}

function generateArrivalActualTooltip(rowData: AlgorithmAuditRowV4): TooltipContent {
  const details: TooltipDetailItem[] = rowData.arrival_details.map((arrival) => ({
    label: arrival.tracking_number,
    value: `${arrival.arrived_qty} units`,
    sublabel: `${arrival.warehouse_code} (${arrival.arrival_date})`,
    linkUrl: `/logistics/${arrival.shipment_id}`,
  }))

  return {
    icon: '📥',
    title: '到货 Arrival (实际)',
    week: `Week ${rowData.week_iso}`,
    value: `${rowData.actual_arrival} units`,
    source: 'Actual shipment arrivals',
    details,
    hasViewDetails: true,
  }
}

function generateInventoryClosingTooltip(rowData: AlgorithmAuditRowV4): TooltipContent {
  const safetyWeeks = rowData.safety_threshold > 0 && rowData.sales_effective > 0
    ? (rowData.closing_stock / (rowData.safety_threshold / rowData.closing_stock)).toFixed(1)
    : 0

  return {
    icon: '📊',
    title: '库存 Inventory (期末)',
    week: `Week ${rowData.week_iso}`,
    value: `${rowData.closing_stock} units`,
    source: 'Calculation: Opening + Arrival - Sales',
    details: [
      { label: 'Opening stock', value: rowData.opening_stock },
      { label: 'Arrivals', value: `+${rowData.arrival_effective}` },
      { label: 'Sales', value: `-${rowData.sales_effective}` },
      { label: 'Closing', value: rowData.closing_stock },
    ],
    status: {
      label: `Status: ${rowData.stock_status}`,
      variant: rowData.stock_status === 'OK' ? 'success' : rowData.stock_status === 'Risk' ? 'warning' : 'danger',
      icon: rowData.stock_status === 'OK' ? '✓' : '⚠️',
      sublabel: `Safety: ${rowData.safety_threshold} units (${safetyWeeks} weeks)`,
    },
    hasViewDetails: false,
  }
}

function generateInventoryStatusTooltip(rowData: AlgorithmAuditRowV4): TooltipContent {
  const coverageWeeks = rowData.sales_effective > 0
    ? (rowData.closing_stock / rowData.sales_effective).toFixed(1)
    : '∞'

  return {
    icon: '🎯',
    title: '库存状态 Stock Status',
    week: `Week ${rowData.week_iso}`,
    value: rowData.stock_status,
    source: 'Calculated based on safety stock threshold',
    details: [
      { label: 'Current stock', value: `${rowData.closing_stock} units` },
      { label: 'Safety threshold', value: `${rowData.safety_threshold} units` },
      { label: 'Coverage', value: `${coverageWeeks} weeks` },
    ],
    status: {
      label: rowData.stock_status,
      variant: rowData.stock_status === 'OK' ? 'success' : rowData.stock_status === 'Risk' ? 'warning' : 'danger',
      icon: rowData.stock_status === 'OK' ? '✓' : rowData.stock_status === 'Risk' ? '⚠️' : '✗',
    },
    hasViewDetails: false,
  }
}

// ... (implement remaining generators for other column types)

function generateDefaultTooltip(rowData: AlgorithmAuditRowV4): TooltipContent {
  return {
    icon: 'ℹ️',
    title: 'Data',
    week: `Week ${rowData.week_iso}`,
    value: 'N/A',
    source: 'Unknown',
    details: [],
    hasViewDetails: false,
  }
}
```

---

## 4. Implementation Plan

### 4.1 File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/types/algorithm-audit-tooltip.ts` | **CREATE** | New tooltip type definitions |
| `src/components/inventory/data-provenance-tooltip.tsx` | **CREATE** | Main tooltip component |
| `src/lib/utils/tooltip-content-generator.ts` | **CREATE** | Content generation logic |
| `src/components/inventory/algorithm-audit-table-v4.tsx` | **EDIT** | Wrap numeric cells with `DataProvenanceTooltip` |
| `src/components/ui/tooltip.tsx` | **VERIFY** | Ensure ShadCN Tooltip is installed (should exist) |

### 4.2 Phase 1: Core Tooltip Infrastructure (Week 1)

**Tasks:**
1. Create type definitions (`algorithm-audit-tooltip.ts`)
2. Create `DataProvenanceTooltip` component with basic rendering
3. Create `generateTooltipContent` utility with 3 sample generators:
   - `order_actual`
   - `inventory_closing`
   - `inventory_status`
4. Integrate tooltip into `AlgorithmAuditTableV4` for 3 columns
5. Test hover behavior, positioning, keyboard navigation

**Deliverables:**
- Working tooltips for 3 columns
- Keyboard accessibility verified
- No performance degradation

### 4.3 Phase 2: Complete Content Generators (Week 2)

**Tasks:**
1. Implement all 19 tooltip content generators
2. Add column-specific logic for each metric type
3. Add clickable links for PO numbers, tracking numbers
4. Add warning states (e.g., cost variance, date inconsistencies)
5. Test all tooltip content with real data

**Deliverables:**
- All columns have working tooltips
- Links navigate correctly
- Edge cases handled (zero values, missing data)

### 4.4 Phase 3: Polish & Accessibility (Week 3)

**Tasks:**
1. Add loading states (if needed)
2. Implement keyboard navigation (Tab, Enter, ESC)
3. Add ARIA labels and screen reader support
4. Test on mobile (tap behavior)
5. Performance profiling (ensure <50ms render time)
6. Add empty state handling (explain why data is zero)

**Deliverables:**
- WCAG AA compliant
- Mobile-friendly tap interaction
- No memory leaks

### 4.5 Phase 4: Testing & Validation (Week 4)

**Tasks:**
1. User acceptance testing with 3 supply chain analysts
2. Cross-browser testing (Chrome, Safari, Firefox, Edge)
3. Performance testing with 100-row table
4. Bug fixes based on feedback
5. Documentation update

**Deliverables:**
- UAT sign-off
- Performance metrics logged
- Known issues documented

---

## 5. Integration Points

### 5.1 Modified Component: AlgorithmAuditTableV4

**File:** `src/components/inventory/algorithm-audit-table-v4.tsx`

**Changes Required:**

```typescript
// BEFORE (current implementation)
<td className="px-4 py-3 text-right">
  {row.actual_order}
</td>

// AFTER (with tooltip)
<td className="px-4 py-3 text-right">
  <DataProvenanceTooltip columnType="order_actual" rowData={row}>
    {row.actual_order}
  </DataProvenanceTooltip>
</td>
```

Apply this pattern to ALL numeric columns:
- `sales_forecast`, `sales_actual`, `sales_effective`
- `planned_order`, `actual_order`, `order_effective`
- `planned_factory_ship`, `actual_factory_ship`, `factory_ship_effective`
- `planned_ship`, `actual_ship`, `ship_effective`
- `planned_arrival`, `actual_arrival`, `arrival_effective`
- `opening_stock`, `closing_stock`, `safety_threshold`, `stock_status`

### 5.2 No Backend Changes

**Why:** All data is already fetched by `fetchAlgorithmAuditV4` query. The tooltip is purely a presentation layer enhancement.

---

## 6. Performance Considerations

### 6.1 Render Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tooltip render time | <50ms | React DevTools Profiler |
| Table scroll FPS | >50 fps | Chrome Performance tab |
| Memory usage | <10MB for 100 rows | Chrome Memory Profiler |

**Optimizations:**
- Tooltip content is generated on-demand (not pre-rendered for all cells)
- Only ONE tooltip instance rendered at a time (Radix UI handles this)
- Use `React.memo` for tooltip component if needed

### 6.2 Data Efficiency

- **Zero additional database queries:** All data from existing `AlgorithmAuditRowV4`
- **Client-side caching:** Row data already in React state
- **Lazy generation:** Tooltip content generated only when hovered

---

## 7. Accessibility Compliance

### 7.1 ARIA Attributes

```typescript
<TooltipTrigger asChild>
  <span
    role="gridcell"
    tabIndex={0}
    aria-describedby={`tooltip-${columnType}-${rowData.week_iso}`}
  >
    {children}
  </span>
</TooltipTrigger>

<TooltipContent
  id={`tooltip-${columnType}-${rowData.week_iso}`}
  role="tooltip"
>
  {/* Content */}
</TooltipContent>
```

### 7.2 Keyboard Navigation

| Key | Action |
|-----|--------|
| **Tab** | Navigate to next data cell |
| **Shift+Tab** | Navigate to previous data cell |
| **Enter** / **Space** | Open tooltip for focused cell |
| **ESC** | Close tooltip, return focus to cell |
| **Arrow Keys** | Navigate between cells (table navigation) |

### 7.3 Screen Reader Support

- Tooltip content announced when opened via keyboard
- Links identified as "Link to PO-2025-001"
- Status badges announced with variant (e.g., "Fully Covered, success")

---

## 8. Edge Cases & Error Handling

### 8.1 Zero Values

```typescript
// Example: Arrival Actual = 0
{
  icon: '📥',
  title: '到货 Arrival (实际)',
  value: '0 units',
  source: 'No shipments arrived this week',
  details: [],
  status: {
    label: 'No arrivals',
    variant: 'default',
    icon: 'ℹ️',
    sublabel: 'Check planned arrivals in future weeks',
  },
}
```

### 8.2 Missing Linkage (Data Integrity Issue)

```typescript
// Example: Order Actual = 800 but no PO records found
{
  status: {
    label: 'Data inconsistency',
    variant: 'danger',
    icon: '⚠️',
    sublabel: 'Source data missing. Please report this issue.',
  },
}
```

### 8.3 Anomalies

```typescript
// Example: Arrival > Shipped
if (rowData.actual_arrival > rowData.actual_ship) {
  return {
    status: {
      label: 'Anomaly detected',
      variant: 'warning',
      icon: '⚠️',
      sublabel: 'Arrival qty exceeds shipped qty. Please review.',
    },
  }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

**File:** `src/lib/utils/tooltip-content-generator.test.ts`

```typescript
describe('generateTooltipContent', () => {
  it('generates correct tooltip for order_actual with PO details', () => {
    const mockRow: AlgorithmAuditRowV4 = {
      week_iso: '2025-W06',
      actual_order: 800,
      order_details: [
        { po_number: 'PO-2025-001', ordered_qty: 500, fulfillment_status: 'Complete' },
        { po_number: 'PO-2025-002', ordered_qty: 300, fulfillment_status: 'Partial' },
      ],
      sales_coverage_status: 'Fully Covered',
      sales_uncovered_qty: 0,
      // ... other fields
    }

    const result = generateTooltipContent('order_actual', mockRow)

    expect(result.title).toBe('下单 Order (实际)')
    expect(result.value).toBe('800 units')
    expect(result.details).toHaveLength(2)
    expect(result.details[0].label).toBe('PO-2025-001')
    expect(result.status?.label).toBe('Fully Covered')
  })
})
```

### 9.2 Integration Tests

**File:** `src/components/inventory/data-provenance-tooltip.test.tsx`

```typescript
describe('DataProvenanceTooltip', () => {
  it('renders tooltip on hover after 300ms delay', async () => {
    const mockRow = { /* ... */ }
    render(
      <DataProvenanceTooltip columnType="order_actual" rowData={mockRow}>
        800
      </DataProvenanceTooltip>
    )

    const trigger = screen.getByText('800')

    // Hover
    fireEvent.mouseEnter(trigger)

    // Should NOT appear immediately
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    // Wait for delay
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument()
    }, { timeout: 400 })
  })
})
```

### 9.3 Manual QA Checklist

- [ ] Hover on each column type shows correct tooltip
- [ ] Tooltip appears after 300ms delay
- [ ] Tooltip disappears immediately on mouse-out
- [ ] Tooltip stays open when mouse moves into tooltip content
- [ ] All PO/Delivery/Shipment links are clickable and navigate correctly
- [ ] Keyboard navigation (Tab, Enter, ESC) works
- [ ] Mobile tap shows tooltip (first tap), follows link (second tap)
- [ ] No console errors
- [ ] Table scroll remains smooth with tooltips enabled
- [ ] Tooltip repositions correctly when near viewport edge

---

## 10. Rollout Plan

### 10.1 Feature Flag (Optional)

```typescript
// src/lib/feature-flags.ts
export const FEATURE_FLAGS = {
  ALGORITHM_AUDIT_HOVER_TOOLTIPS: true, // Toggle to disable if issues found
}

// In AlgorithmAuditTableV4
import { FEATURE_FLAGS } from '@/lib/feature-flags'

{FEATURE_FLAGS.ALGORITHM_AUDIT_HOVER_TOOLTIPS ? (
  <DataProvenanceTooltip columnType="order_actual" rowData={row}>
    {row.actual_order}
  </DataProvenanceTooltip>
) : (
  row.actual_order
)}
```

### 10.2 Deployment Strategy

1. **Dev environment:** Full rollout, extensive testing
2. **Staging:** Enable for all users, gather feedback
3. **Production:**
   - Day 1-3: Enable for 20% of users (A/B test)
   - Day 4-7: Enable for 50% of users
   - Day 8+: Full rollout (100%)

### 10.3 Monitoring

**Metrics to track:**
- Tooltip hover rate (% of users who hover at least once)
- Average hovers per session
- Click-through rate on "View Full Details"
- Performance metrics (tooltip render time, table FPS)
- Error rate (console errors related to tooltips)

**Alerting:**
- Alert if tooltip render time >100ms (P2)
- Alert if error rate >5% (P1)
- Alert if table scroll FPS <30 (P2)

---

## 11. Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Tooltip overflow on small screens** | UI breaks on <1280px | Medium (40%) | Responsive max-width, scroll overflow-y |
| **Performance lag with 100+ rows** | Table becomes sluggish | Medium (30%) | Virtualize table, lazy-load tooltip data |
| **Incomplete lineage data** | Tooltips show "No data" | High (60%) | Fallback UI with explanation + "Report Issue" link |
| **Browser compatibility** | Tooltips don't work in Safari | Low (10%) | Test on all major browsers, use polyfills if needed |

---

## 12. Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Adoption Rate** | >60% of users hover at least 5 times per session | Analytics event tracking |
| **Performance** | Tooltip render <50ms | React DevTools Profiler |
| **User Satisfaction** | NPS increase from 6.5 → 8.5 | User survey (2 months post-launch) |
| **Audit Time Reduction** | 40 min → 20 min per SKU | Time-to-task completion tracking |

---

## 13. Future Enhancements (Out of Scope)

1. **Custom tooltip templates:** Allow users to configure tooltip content
2. **Tooltip history:** Show recent tooltips viewed in a sidebar
3. **Export tooltip data:** Download tooltip content to Excel
4. **AI-powered explanations:** Explain anomalies using GPT-4
5. **Real-time updates:** Refresh tooltip data while open (WebSocket)

---

## 14. Approval & Sign-off

| Role | Name | Approval Criteria | Status |
|------|------|------------------|--------|
| Product Manager | [Name] | Requirements met | Pending |
| Engineering Lead | [Name] | Technical design approved | Pending |
| UX Designer | [Name] | Tooltip design reviewed | Pending |
| Accessibility Lead | [Name] | WCAG compliance verified | Pending |

**Next Step:** Proceed to Frontend Artisan for component implementation.

---

## End of Design Document

**Version:** 1.0
**Last Updated:** 2025-12-05
**Author:** System Architect (AI Agent)
**Reviewers:** [To be assigned]
