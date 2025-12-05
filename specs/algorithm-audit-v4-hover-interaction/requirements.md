# Algorithm Audit V4 - Hover Interaction Enhancement

## Document Metadata
- **Feature:** Algorithm Audit V4 - Hover-based Data Provenance Display
- **Role:** Product Director
- **Date:** 2025-12-05
- **Status:** Requirements Draft
- **Priority:** P1 (User Experience Enhancement)
- **Parent Feature:** Algorithm Audit V4 (specs/algorithm-audit-v4/)

---

## 1. Executive Summary

### 1.1 User Pain Point

**Current Behavior (Click-based):**
- Users must click a "Details" button or [+] icon to expand row details
- Each click requires a round-trip interaction: Click → Expand → Read → Close
- Repetitive clicking creates friction when analyzing multiple data points
- Users cannot quickly scan and compare data sources across different weeks

**User Feedback:**
> "I don't want to click to see details. Just hovering over the number should show me where it came from. Clicking feels slow and tedious when I'm reviewing 20+ weeks of data."

**Business Impact:**
- Reduced audit efficiency: Average audit time 40+ minutes per SKU
- Cognitive overload: Users lose context when toggling between expanded/collapsed states
- Lower adoption: Power users revert to Excel exports for quicker analysis

### 1.2 Proposed Solution

**Hover-based Tooltip System:**
- Hovering over any numeric cell instantly displays its data provenance in a rich tooltip
- Tooltips show: data source, calculation formula, linked records (PO#, Delivery#, Shipment#)
- No need to click or expand rows
- Tooltip persists while mouse is over cell, disappears immediately on mouse-out
- Optional click-through: Clicking the tooltip opens a detailed modal for deeper investigation

**Expected Business Value:**
- 50% reduction in audit time (40 min → 20 min per SKU)
- Higher user satisfaction: Target NPS increase from 6.5 → 8.5
- Increased system trust: Users can instantly verify any suspicious number
- Lower training cost: New users understand data lineage intuitively

---

## 2. User Stories

### Primary User Story

**As a** Supply Chain Analyst
**I want to** hover my mouse over any data cell in the Algorithm Audit table and instantly see its source and calculation
**So that** I can quickly verify data accuracy without breaking my analysis flow

### Secondary User Stories

**UC-1: Quick Source Verification**
- **As a** Procurement Manager
- **I want to** hover over "Order Actual: 800" and see which PO numbers contribute to this total
- **So that** I can verify order coverage without opening detailed views

**UC-2: Discrepancy Investigation**
- **As a** Inventory Controller
- **I want to** hover over "Arrival Effective: 0" and see why there's no arrival despite a planned arrival of 500
- **So that** I can identify logistics delays or data entry errors immediately

**UC-3: Formula Understanding**
- **As a** New Team Member
- **I want to** hover over "Inventory Closing: 1,234" and see the calculation formula (Opening + Arrival - Sales)
- **So that** I can learn how the system works without reading documentation

**UC-4: Cross-referencing**
- **As a** Data Analyst
- **I want to** hover over multiple cells in sequence (Sales → Order → Arrival → Inventory) within 5 seconds
- **So that** I can trace a complete supply chain flow without clicking

---

## 3. Functional Requirements

### 3.1 Tooltip Trigger Behavior

**FR-1: Hover Activation**
- **Trigger Zone:** All numeric cells in columns: Sales, Order, Factory Ship, Ship, Arrival, Inventory
- **Delay:** 300ms hover delay before tooltip appears (prevents flicker during mouse movement)
- **Positioning:** Tooltip appears adjacent to cursor (preferred: top-right offset by 10px)
- **Boundary Detection:** If tooltip would overflow viewport, reposition to opposite side

**FR-2: Hover Persistence**
- **Stay Open:** Tooltip remains visible while mouse is over:
  1. The original data cell
  2. The tooltip itself (allows user to read long content or click links)
- **Close Immediately:** Tooltip disappears when mouse leaves both zones (no delay)

**FR-3: Keyboard Accessibility**
- **Tab Navigation:** Users can tab to data cells
- **Keyboard Trigger:** Pressing `Enter` or `Space` on focused cell opens tooltip
- **ESC to Close:** Pressing `ESC` closes tooltip

### 3.2 Tooltip Content Structure

**FR-4: Standard Tooltip Template**

Every tooltip must display the following sections:

```
┌─────────────────────────────────────────────────────────┐
│ [Icon] [Metric Name]                        [Week]      │
├─────────────────────────────────────────────────────────┤
│ Value: 800                                              │
│ Source: Actual (from database)                          │
│                                                         │
│ Details:                                                │
│ • PO-2025-001: 500 units (2025-02-03)                   │
│ • PO-2025-002: 300 units (2025-02-05)                   │
│                                                         │
│ Status: Fully Covered ✓                                 │
│                                                         │
│ [View Full Details →]                                   │
└─────────────────────────────────────────────────────────┘
```

**FR-5: Content Rules by Column Type**

| Column | Content to Display | Example |
|--------|-------------------|---------|
| **Sales (Forecast)** | Data source: Forecast table<br>Sales week<br>Channel breakdown (if applicable) | "From: sales_forecasts<br>Week: 2025-W08<br>Amazon: 300, Shopify: 100" |
| **Sales (Actual)** | Data source: Actuals table<br>Sales week<br>Channel breakdown | "From: sales_actuals<br>Week: 2025-W08<br>Total: 373 units" |
| **Sales (Effective)** | Selection logic<br>Value chosen (Actual or Forecast)<br>Reason | "Logic: COALESCE(actual, forecast)<br>Used: Actual (373)<br>Reason: Actual data available" |
| **Order (Planned)** | Calculation formula<br>Backward calculation source<br>Lead time used | "Formula: Sales[W08] = Order[W02]<br>Total lead time: 6 weeks<br>Source: Reverse calculation" |
| **Order (Actual)** | PO numbers & quantities<br>Order dates<br>Fulfillment status | "PO-2025-001: 500 (Delivered: 500)<br>PO-2025-002: 300 (Delivered: 100)<br>Total: 800 units" |
| **Order (Effective)** | Selection logic<br>Value chosen<br>Coverage status | "Logic: Use Actual if exists<br>Used: Actual (800)<br>Coverage: Fully Covered ✓" |
| **Factory Ship (Planned)** | Forward propagation source<br>Calculation formula<br>Lead time offset | "From: Order[W02] actual<br>Production lead: 4 weeks<br>Expected ship: W06" |
| **Factory Ship (Actual)** | Delivery records<br>Delivery dates<br>PO traceability | "DEL-2025-001: 500 (from PO-2025-001)<br>DEL-2025-002: 100 (from PO-2025-002)<br>Delivery date: 2025-02-10" |
| **Ship (Actual)** | Shipment records<br>Tracking numbers<br>Departure dates<br>Status | "TRK-001: 600 units<br>Departure: 2025-02-15<br>Status: In Transit" |
| **Arrival (Planned)** | Forward propagation source<br>Shipment lead time<br>Expected arrival week | "From: Order[W02] actual<br>Shipping: 2 weeks<br>Expected: W08" |
| **Arrival (Actual)** | Shipment arrivals<br>Tracking numbers<br>Arrival dates<br>Warehouse | "TRK-001: 600 units<br>Arrived: 2025-02-28<br>Warehouse: FBA-WEST" |
| **Arrival (Effective)** | Selection logic<br>Value chosen<br>Impact on inventory | "Logic: COALESCE(actual, planned)<br>Used: Actual (600)<br>Added to inventory" |
| **Inventory (Opening)** | Calculation<br>Previous week closing | "Calculation: Previous week closing<br>From: Week W07 closing stock" |
| **Inventory (Closing)** | Formula<br>Breakdown | "Formula: Opening + Arrival - Sales<br>1200 + 600 - 373 = 1427" |
| **Inventory (Safety Stock)** | Calculation<br>Source | "Safety weeks: 3<br>Avg weekly sales: 400<br>Safety stock: 1200" |
| **Inventory (Status)** | Status logic<br>Threshold values<br>Days of stock | "Status: OK ✓<br>Current: 1427 units<br>Safety: 1200 units<br>Coverage: 3.8 weeks" |

### 3.3 Data Provenance Links

**FR-6: Clickable Record IDs**
- All PO numbers, Delivery numbers, Tracking numbers in tooltips are clickable links
- Clicking opens the detailed page in a new tab (e.g., `/procurement/[id]`)
- Link styling: Underline on hover, blue color (#3B82F6)

**FR-7: View Full Details Button**
- Every tooltip footer has a "View Full Details →" link
- Opens a modal with comprehensive information (alternative to tooltip brevity)
- Modal includes: Full calculation breakdown, edit history, related records table

### 3.4 Visual Design Requirements

**FR-8: Tooltip Styling**
- Background: White (#FFFFFF) with subtle shadow (0 4px 12px rgba(0,0,0,0.15))
- Border: 1px solid #E5E7EB
- Border-radius: 8px
- Padding: 16px
- Max-width: 400px
- Font: 14px regular, 12px for secondary text
- Line-height: 1.5

**FR-9: Loading States**
- If tooltip data requires async fetch (rare case), show loading spinner
- Placeholder text: "Loading details..."
- Max wait: 1 second, if longer, show error state

**FR-10: Empty States**
- If no data available (e.g., "Arrival Actual: 0"), tooltip shows explanation
- Example: "No shipments have arrived in this week. Check planned arrival in future weeks."

**FR-11: Status Indicators**
- Use colored badges for status:
  - Fully Covered: Green badge with ✓
  - Partially Covered: Yellow badge with ⚠ + gap number
  - Uncovered: Red badge with ✗
  - Pending: Gray badge with ⏳

---

## 4. Non-Functional Requirements

### 4.1 Performance

**NFR-1: Render Time**
- Tooltip must appear within 50ms after hover delay ends
- No perceptible lag during cursor movement between cells

**NFR-2: Data Pre-fetching Strategy**
- All tooltip data for visible table rows should be pre-fetched on page load
- Use React state to cache lineage data (from `fetchAlgorithmAuditV4`)
- No additional database queries required on hover (data already in memory)

**NFR-3: Memory Efficiency**
- Tooltip component should unmount immediately when closed (no memory leak)
- Maximum 1 tooltip instance rendered at any time

### 4.2 Accessibility

**NFR-4: Screen Reader Support**
- Tooltip content must be accessible via `aria-describedby`
- Data cells have `role="gridcell"` and `tabindex="0"`
- Tooltip has `role="tooltip"` and appropriate ARIA labels

**NFR-5: Keyboard Navigation**
- Tab order: Row-by-row, left-to-right through data cells
- Arrow keys: Navigate between cells without opening tooltips
- Enter/Space: Open tooltip for focused cell
- ESC: Close tooltip and return focus to cell

**NFR-6: Color Contrast**
- All text meets WCAG AA standards (4.5:1 contrast ratio minimum)
- Status badges use both color AND icon for colorblind users

### 4.3 Browser Compatibility

**NFR-7: Supported Browsers**
- Chrome 120+ (primary target)
- Safari 17+ (macOS/iOS)
- Firefox 121+
- Edge 120+

**NFR-8: Mobile Behavior**
- On mobile/tablet: Hover becomes tap (first tap opens tooltip, second tap follows link)
- Tooltip repositions to avoid being cut off by screen edges
- Touch-friendly button sizes (minimum 44x44px tap targets)

---

## 5. Business Rules

### 5.1 Tooltip Display Logic

**BR-1: Column-Specific Activation**
- Tooltips ONLY appear on numeric data cells
- NOT on: Row headers (Week column), Column headers, Empty cells ("-")

**BR-2: Coverage Status Highlighting**
- If Sales coverage status is "Partially Covered" or "Uncovered", highlight the gap in RED
- Example: "Gap: 20 units ⚠️ (55 forecast - 35 ordered)"

**BR-3: Zero Value Handling**
- Zero values (e.g., "Arrival Actual: 0") still show tooltips
- Tooltip explains WHY it's zero (e.g., "No shipments arrived this week. Next expected: W09")

**BR-4: Data Freshness Indicator**
- If data is from materialized view, show last refresh timestamp
- Example: "Data refreshed: 2025-12-05 14:32 CST"

### 5.2 Data Integrity Validation

**BR-5: Anomaly Flagging**
- If tooltip data reveals anomalies (e.g., Arrival > Shipped), show warning icon ⚠️
- Warning text: "Data inconsistency detected. Please review."

**BR-6: Missing Linkage Warnings**
- If "Order Actual: 800" but no PO records found, show alert
- Alert text: "⚠️ Source data missing. This may indicate a data import issue."

---

## 6. User Interface Specifications

### 6.1 Interaction Flow

**Scenario: User Hovers on "Order Actual: 800"**

1. User moves cursor over cell displaying "800"
2. After 300ms, tooltip fades in (200ms fade animation)
3. Tooltip displays:
   ```
   📦 下单 Order (实际)                    Week 2025-W06
   ─────────────────────────────────────────────────────
   Value: 800 units
   Source: Actual purchase orders

   Details:
   • PO-2025-001: 500 units
     Order date: 2025-02-03
     Status: Delivered ✓

   • PO-2025-002: 300 units
     Order date: 2025-02-05
     Status: Partial ⚠ (100/300 delivered)

   Coverage: Fully Covered ✓

   [View Full Details →]
   ```
4. User can:
   - Click "PO-2025-001" → Opens `/procurement/[po-id]` in new tab
   - Click "View Full Details" → Opens modal with expanded info
   - Move mouse away → Tooltip closes immediately

**Scenario: User Hovers on "Inventory Closing: 1,427"**

1. Hover triggers tooltip after 300ms
2. Tooltip displays:
   ```
   📊 库存 Inventory (期末)                Week 2025-W08
   ─────────────────────────────────────────────────────
   Value: 1,427 units
   Calculation: Opening + Arrival - Sales

   Breakdown:
   • Opening stock: 1,200
   • Arrivals: +600 (from TRK-001)
   • Sales: -373 (actual)
   • Closing: 1,427

   Safety stock: 1,200 units (3 weeks)
   Status: OK ✓ (3.8 weeks coverage)

   [View Full Details →]
   ```

### 6.2 Tooltip Component Design

**Component Hierarchy:**
```
<TooltipProvider>
  <TooltipTrigger>
    <TableCell>{value}</TableCell>
  </TooltipTrigger>
  <TooltipContent>
    <TooltipHeader icon={icon} title={title} week={week} />
    <TooltipBody>
      <ValueSection value={value} source={source} />
      <DetailsSection items={details} />
      <StatusSection status={status} />
    </TooltipBody>
    <TooltipFooter>
      <ViewDetailsLink onClick={openModal} />
    </TooltipFooter>
  </TooltipContent>
</TooltipProvider>
```

**Component Props:**
```typescript
interface TooltipContentProps {
  column: 'sales_forecast' | 'sales_actual' | 'sales_effective' | 'order_planned' | ...
  week: string // ISO week format
  value: number
  lineageData: AlgorithmAuditRowV4 // Pre-fetched lineage data
  onViewDetails: () => void
}
```

---

## 7. Technical Constraints

### 7.1 Data Source

**TC-1: Data Pre-loading**
- All lineage data must already be available in `AlgorithmAuditRowV4` type
- No additional database queries on hover
- Tooltip component receives data via props from parent table component

**TC-2: Type Safety**
- All tooltip content must be strongly typed
- TypeScript strict mode compliance
- No `any` types allowed

### 7.2 Performance Budgets

**TC-3: Render Performance**
- Tooltip render: <50ms
- Table re-render on scroll: <100ms
- Memory usage: <10MB for 100 rows with cached tooltips

### 7.3 Library Constraints

**TC-4: Use Existing Components**
- Use Radix UI Tooltip primitive (`@radix-ui/react-tooltip`)
- Already installed via ShadCN UI
- Do NOT introduce new tooltip libraries

---

## 8. Success Metrics

### 8.1 Usage Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Tooltip Usage Rate | >60% of users hover at least 5 times per session | Analytics event tracking |
| Average Hovers per Audit | >20 hovers per SKU analysis | Session replay analysis |
| Click-through to Details | 10-20% of hovers lead to "View Full Details" click | Event funnel tracking |
| Mobile Tap Rate | >40% mobile users tap tooltips | Device-specific analytics |

### 8.2 Performance Metrics

| Metric | Target | Critical Threshold |
|--------|--------|--------------------|
| Tooltip Render Time | <50ms | <100ms |
| Table Scroll FPS | >50 fps | >30 fps |
| Time to Interactive | <2s | <5s |

### 8.3 Business Impact Metrics

| Metric | Baseline (Click-based) | Target (Hover-based) | Timeline |
|--------|------------------------|---------------------|----------|
| Average Audit Time | 40 min/SKU | 20 min/SKU | 1 month post-launch |
| User Satisfaction (NPS) | 6.5/10 | 8.5/10 | 2 months |
| Training Time for New Users | 4 hours | 2 hours | Immediate |
| Support Tickets ("How to verify data?") | 8/month | <2/month | 3 months |

---

## 9. Acceptance Criteria

### AC-1: Hover Activation
- **Given** user is viewing Algorithm Audit V4 table
- **When** user hovers over any numeric cell in data columns (Sales, Order, Factory Ship, Ship, Arrival, Inventory)
- **Then** tooltip appears after 300ms
- **And** tooltip contains relevant data provenance information
- **And** tooltip is positioned adjacent to cursor without viewport overflow

### AC-2: Tooltip Content - Order Actual
- **Given** user hovers over "Order Actual: 800" cell in Week W06
- **When** tooltip appears
- **Then** tooltip shows:
  - Title: "📦 下单 Order (实际) Week 2025-W06"
  - Value: "800 units"
  - Source: "Actual purchase orders"
  - Details list: Each PO number, quantity, order date, fulfillment status
  - PO numbers are clickable links
  - "View Full Details" button at bottom
- **And** all data matches database records

### AC-3: Tooltip Content - Inventory Closing
- **Given** user hovers over "Inventory Closing: 1,427" cell
- **When** tooltip appears
- **Then** tooltip shows:
  - Calculation formula: "Opening + Arrival - Sales"
  - Breakdown: Opening (1,200), Arrival (+600), Sales (-373), Closing (1,427)
  - Safety stock comparison
  - Status indicator (OK/Risk/Stockout)
- **And** all calculations are correct

### AC-4: Tooltip Persistence
- **Given** tooltip is visible
- **When** user moves cursor from cell into tooltip content area
- **Then** tooltip remains open
- **And** user can interact with links inside tooltip
- **When** user moves cursor out of both cell and tooltip
- **Then** tooltip closes immediately (no delay)

### AC-5: Keyboard Accessibility
- **Given** user uses keyboard navigation
- **When** user tabs to a data cell and presses Enter or Space
- **Then** tooltip opens
- **When** user presses ESC
- **Then** tooltip closes and focus returns to cell

### AC-6: Zero Value Handling
- **Given** user hovers over "Arrival Actual: 0" cell
- **When** tooltip appears
- **Then** tooltip shows:
  - Value: "0 units"
  - Explanation: "No shipments arrived this week"
  - Next expected arrival (if applicable)
- **And** tooltip does NOT show error state

### AC-7: Anomaly Warning
- **Given** system detects data inconsistency (e.g., Arrival > Shipped)
- **When** user hovers over affected cell
- **Then** tooltip displays warning icon ⚠️
- **And** shows alert text: "Data inconsistency detected. Please review."

### AC-8: Mobile Behavior
- **Given** user on mobile device (screen width <768px)
- **When** user taps a data cell
- **Then** tooltip appears (first tap)
- **When** user taps outside tooltip
- **Then** tooltip closes
- **When** user taps a link inside tooltip
- **Then** link navigates (second tap)

### AC-9: Performance
- **Given** user hovers rapidly over 10 consecutive cells
- **When** measuring render performance
- **Then** each tooltip renders in <50ms
- **And** no memory leaks detected
- **And** table scroll remains smooth (>30 fps)

### AC-10: Click-through to Details
- **Given** tooltip is open
- **When** user clicks "View Full Details" button
- **Then** modal opens with expanded information
- **And** modal shows full calculation breakdown
- **And** modal shows related records table
- **And** modal has close button (X) and ESC key support

---

## 10. Dependencies & Risks

### 10.1 Technical Dependencies

| Dependency | Version | Risk Level | Mitigation |
|------------|---------|------------|------------|
| @radix-ui/react-tooltip | 1.0+ | Low | Already installed via ShadCN |
| React 19 | Latest | Low | Stable release |
| Lineage data from V4 backend | - | Medium | Ensure `fetchAlgorithmAuditV4` returns complete data |
| TypeScript strict types | 5.0+ | Low | Maintain type definitions |

### 10.2 Data Dependencies

| Dependency | Owner | Risk Level | Mitigation |
|------------|-------|------------|------------|
| `AlgorithmAuditRowV4` completeness | System Architect | High | Validate all tooltip fields are populated |
| Supply chain lineage accuracy | Backend Specialist | High | Add validation tests |
| PO/Delivery/Shipment linkage | Database | Medium | Add referential integrity checks |

### 10.3 Known Risks

**Risk R-1: Tooltip Overflow on Small Screens**
- **Impact:** Tooltip content may be cut off on <1280px screens
- **Probability:** Medium (40%)
- **Mitigation:** Implement responsive max-width, scroll overflow-y if needed

**Risk R-2: Performance Degradation with 100+ Rows**
- **Impact:** Table may lag if all rows have hover handlers
- **Probability:** Medium (30%)
- **Mitigation:** Virtualize table rendering, lazy-load tooltip data for off-screen rows

**Risk R-3: Incomplete Lineage Data**
- **Impact:** Tooltips show "No data available" for valid cells
- **Probability:** High (60% during initial rollout)
- **Mitigation:** Add fallback UI explaining data is being backfilled, provide "Report Issue" link

---

## 11. Out of Scope (V4 Hover Enhancement)

The following features are **excluded** from this enhancement:

1. Inline editing of values within tooltips
2. Custom user-defined tooltip templates
3. Tooltip history/breadcrumb trail
4. Export tooltip data to Excel
5. Collaborative annotations on tooltips
6. AI-powered anomaly explanations
7. Real-time data refresh while tooltip is open
8. Multi-language tooltip content (initially Chinese/English only)

These may be considered for future iterations.

---

## 12. Implementation Notes

### 12.1 Phased Rollout

**Phase 1: Core Hover Functionality (Week 1)**
- Implement Radix UI Tooltip wrapper
- Add hover handlers to numeric cells
- Render basic tooltip with title, value, source

**Phase 2: Content Enrichment (Week 2)**
- Add detailed content sections (Details, Status, Calculation)
- Implement clickable links to PO/Delivery/Shipment pages
- Add "View Full Details" button

**Phase 3: Polish & Accessibility (Week 3)**
- Keyboard navigation support
- Mobile tap behavior
- Loading/error states
- Anomaly warnings

**Phase 4: Validation & Testing (Week 4)**
- User acceptance testing with 5 supply chain analysts
- Performance profiling
- Accessibility audit
- Bug fixes

---

## 13. Approval & Sign-off

**Required Approvals:**

| Role | Name | Approval Criteria | Status |
|------|------|------------------|--------|
| Product Manager | [Name] | UX improvement validated | Pending |
| Engineering Lead | [Name] | Technical feasibility confirmed | Pending |
| Supply Chain Director | [Name] | Solves audit inefficiency pain | Pending |
| UX Designer | [Name] | Tooltip design reviewed | Pending |

**Next Step:** Proceed to System Architect for technical design (`specs/algorithm-audit-v4-hover-interaction/design.md`)

---

## End of Requirements Document

**Version:** 1.0
**Last Updated:** 2025-12-05
**Author:** Product Director (AI Agent)
**Reviewers:** [To be assigned]
