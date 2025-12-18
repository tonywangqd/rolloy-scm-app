# Sales Forecasting Redesign - Product Requirements Document

**Version:** 1.0
**Author:** Product Director
**Date:** 2025-12-18
**Status:** Draft

---

## Executive Summary

The current sales forecasting interface uses a complex matrix grid (SKU × Week × Channel) that forces users to manually input hundreds of data points. This redesign aims to transform the forecasting experience from a tedious data-entry task into an intelligent, insight-driven workflow that reduces input time by 80% while improving forecast accuracy through data-driven recommendations.

**Key Innovation:** Shift from "manual data entry" to "AI-assisted decision making" by leveraging historical sales patterns, trend analysis, and smart bulk operations.

---

## 1. Problem Statement

### 1.1 Current Pain Points

| Issue | Impact | Severity |
|-------|--------|----------|
| **Cognitive Overload** | Users face 100+ cells (e.g., 10 SKUs × 12 weeks × 3 channels = 360 cells) | 🔴 Critical |
| **No Intelligence** | System doesn't suggest values based on historical data | 🔴 Critical |
| **Low Efficiency** | Manual cell-by-cell input takes 30-60 minutes per session | 🟡 High |
| **No Insights** | Users don't know if their forecast is reasonable | 🟡 High |
| **High Learning Curve** | New users struggle to understand the matrix structure | 🟢 Medium |

### 1.2 Business Impact

- **Time Waste:** 2+ hours per week per planner on manual data entry
- **Forecast Inaccuracy:** Without reference data, forecasts can deviate 30-50% from actuals
- **Low Adoption:** Users avoid forecasting or copy previous values blindly

---

## 2. User Personas

### Primary Persona: Supply Chain Planner (计划专员)

- **Name:** 李梅, 28岁, 供应链计划员
- **Experience:** 2 years in SCM
- **Goals:**
  - Complete weekly forecast updates in < 15 minutes
  - Make data-driven decisions with confidence
  - Avoid stockouts and overstock situations
- **Pain Points:**
  - Overwhelmed by the matrix grid
  - Unsure what numbers to input without historical reference
  - Frustrated by repetitive copy-paste operations
- **Tech Savviness:** Moderate (comfortable with Excel, expects intelligent features)

### Secondary Persona: Sales Planning Manager (销售计划经理)

- **Name:** 王强, 35岁, 销售计划负责人
- **Goals:**
  - Review and approve forecasts quickly
  - Identify outliers and anomalies at a glance
  - Ensure forecast aligns with business strategy
- **Needs:**
  - Visual dashboards showing forecast trends
  - Variance analysis (forecast vs actual)
  - Bulk approval/adjustment capabilities

---

## 3. Competitive Analysis & Best Practices

### 3.1 Industry Leaders

| System | Intelligence Feature | Input Method | Key Insight |
|--------|---------------------|--------------|-------------|
| **Amazon Forecast** | ML-based auto-prediction | Review + adjust exceptions | Users validate, not create from scratch |
| **Blue Yonder** | Pattern recognition + seasonality | Template + bulk ops | Smart defaults reduce input by 70% |
| **SAP IBP** | Statistical forecasting + collaboration | Scenario planning | What-if analysis for decision support |
| **Google Sheets** | Formulas + drag-fill | Spreadsheet-like | Familiar interaction pattern |

### 3.2 Design Principles Extracted

1. **Show, Don't Tell:** Display historical trends visually before asking for input
2. **Suggest, Don't Force:** Provide AI recommendations with easy override
3. **Focus, Don't Overwhelm:** Break complex tasks into focused steps
4. **Validate, Don't Block:** Real-time validation with warnings, not errors

---

## 4. User Journey Redesign

### 4.1 Current Journey (Problematic)

```
1. Select Week Range → 2. See Empty Matrix → 3. Manually Fill 360 Cells → 4. Save
   ⏱️ 2 min           ⏱️ 0 min              ⏱️ 50+ min                  ⏱️ 1 min
```

**Problems:** No guidance, no context, high cognitive load

### 4.2 Proposed Journey (Intelligent)

```
1. Select Forecast Scope → 2. Review AI Suggestions → 3. Bulk Adjust + Exceptions → 4. Validate & Save
   ⏱️ 1 min                ⏱️ 3 min                  ⏱️ 5 min                     ⏱️ 1 min
```

**Benefits:** AI does heavy lifting, user focuses on business judgment

#### Journey Detail

**Step 1: Scope Selection** (智能范围选择)
- User selects: Start Week, Duration, SKUs, Channels
- System shows: Historical sales trend for selected scope

**Step 2: AI Recommendation** (智能推荐)
- System auto-generates forecast using:
  - **Method 1:** Moving Average (4-week average)
  - **Method 2:** Year-over-Year Growth (同比增长)
  - **Method 3:** Linear Trend (线性趋势)
- User chooses preferred method or blends them

**Step 3: Interactive Adjustment** (交互式调整)
- Visual timeline shows AI forecast vs historical actual
- User can:
  - Accept all
  - Bulk adjust (e.g., "+10% for Black Friday weeks")
  - Override individual cells if needed

**Step 4: Validation** (智能验证)
- System checks:
  - Unrealistic spikes (>50% variance)
  - Stockout risk warnings
  - Over-forecast alerts
- User confirms and saves

---

## 5. Solution Design Options

### Option A: Enhanced Matrix (渐进式改进)

**Concept:** Keep matrix grid, add smart features

**Features:**
- Auto-fill button: "Copy from last forecast"
- Bulk multiply: Select cells → multiply by factor
- Historical reference: Hover cell to see past 4 weeks actual
- Inline charts: Mini sparklines in header row

**Pros:**
- Low development effort (2 weeks)
- Familiar to existing users
- Backward compatible

**Cons:**
- Still fundamentally a manual process
- Doesn't solve cognitive overload
- Limited intelligence

**Use Case:** Quick win for short-term improvement

---

### Option B: Guided Wizard (分步向导) ⭐ **RECOMMENDED**

**Concept:** Multi-step wizard with AI assistance

**Flow:**
1. **Scope & Context**
   - Select SKU(s), Channels, Week Range
   - Display: Historical trend chart (past 12 weeks actual)

2. **AI Forecast Generation**
   - Show 3 forecast methods side-by-side:
     - Moving Average
     - Growth Rate
     - Custom (user-defined baseline)
   - Visual comparison chart
   - User selects preferred method

3. **Bulk Adjustments**
   - Timeline view with editable values
   - Bulk operations:
     - Multiply all by %
     - Add/subtract absolute value
     - Apply growth curve
     - Copy pattern from another SKU

4. **Exception Handling**
   - System highlights anomalies (red flags)
   - User reviews and adjusts specific weeks
   - Inline editing with context (charts + history)

5. **Review & Commit**
   - Summary table: Total forecast by week/channel
   - Variance check vs last forecast
   - Save or schedule for approval

**Pros:**
- Dramatically reduces manual input (80% time saving)
- Provides data context for better decisions
- Scalable to 100+ SKUs
- Teaches users best practices through the flow

**Cons:**
- Higher development effort (6 weeks)
- Requires backend for AI calculation
- New interaction pattern (learning curve)

**Use Case:** Strategic solution for long-term productivity

---

### Option C: Full AI Autopilot (全自动预测)

**Concept:** System generates forecasts automatically, user only reviews

**Flow:**
1. User sets rules once (e.g., "Use 4-week MA for stable products, YoY for seasonal")
2. System auto-generates forecasts every week
3. User receives dashboard: "12 SKUs forecasted, 3 need review (anomalies)"
4. User reviews exceptions only, approves the rest

**Pros:**
- Minimal user effort (90% time saving)
- Consistent methodology
- Scalable to 1000+ SKUs

**Cons:**
- Requires ML infrastructure (12+ weeks dev)
- Risk of "black box" - users may distrust AI
- Harder to handle special events (promotions, holidays)

**Use Case:** Future iteration for mature organizations

---

## 6. Recommended Solution: Option B (Guided Wizard)

### 6.1 Why Option B?

| Criteria | Weight | Option A | Option B | Option C |
|----------|--------|----------|----------|----------|
| Time Savings | 30% | 20% | 80% | 90% |
| User Control | 25% | 100% | 80% | 30% |
| Development Effort | 20% | 2 weeks | 6 weeks | 12+ weeks |
| User Trust | 15% | High | High | Medium |
| Scalability | 10% | Low | High | Very High |
| **Total Score** | | **52** | **79** ⭐ | **61** |

**Decision:** Option B offers the optimal balance of efficiency, control, and feasibility.

---

## 7. Detailed Requirements (Option B)

### 7.1 User Stories

#### Epic 1: Intelligent Forecast Creation

**US-1.1: As a planner, I want to see historical sales trends before forecasting, so I can make informed decisions.**

**Acceptance Criteria:**
- GIVEN I select a SKU and week range
- WHEN I enter the forecast wizard
- THEN I see a line chart showing past 12 weeks of actual sales
- AND the chart highlights average, min, max values

**US-1.2: As a planner, I want the system to suggest forecast values based on historical data, so I don't start from zero.**

**Acceptance Criteria:**
- GIVEN historical sales data exists for the selected SKU
- WHEN I choose a forecast method (Moving Average / Growth Rate / Custom)
- THEN the system auto-fills forecast values using the selected algorithm
- AND displays confidence indicators (high/medium/low)

**US-1.3: As a planner, I want to bulk adjust forecasts (e.g., +20% for promotion weeks), so I can handle special events efficiently.**

**Acceptance Criteria:**
- GIVEN AI-generated forecast values are displayed
- WHEN I select a week range and apply a bulk adjustment (multiply by 1.2)
- THEN all forecast values in that range are updated
- AND the change is visually highlighted

#### Epic 2: Visual Context & Validation

**US-2.1: As a planner, I want to see forecast vs actual comparison charts, so I can validate my forecast is reasonable.**

**Acceptance Criteria:**
- GIVEN I'm reviewing my forecast
- WHEN I view the validation screen
- THEN I see a chart comparing:
  - New forecast
  - Previous forecast
  - Historical actual (same weeks last year)
- AND the system flags outliers (variance > 50%)

**US-2.2: As a planner, I want real-time stockout warnings, so I can avoid inventory risks.**

**Acceptance Criteria:**
- GIVEN I input a forecast value
- WHEN the forecast is below the safety stock threshold
- THEN the system displays a warning badge
- AND suggests a minimum recommended value

#### Epic 3: Efficiency Features

**US-3.1: As a planner, I want to copy forecast patterns from similar SKUs, so I can leverage existing work.**

**Acceptance Criteria:**
- GIVEN I'm forecasting SKU-A
- WHEN I select "Copy pattern from SKU-B"
- THEN SKU-A's forecast is populated with SKU-B's values (adjustable by ratio)

**US-3.2: As a planner, I want to save forecast templates, so I can reuse common patterns.**

**Acceptance Criteria:**
- GIVEN I've created a forecast with a specific growth curve
- WHEN I save it as a template (e.g., "Holiday Season Pattern")
- THEN I can apply this template to other SKUs in the future

### 7.2 Feature List (Prioritized)

#### P0 - Must Have (MVP)

| Feature ID | Feature Name | Description |
|------------|-------------|-------------|
| F-001 | Historical Trend Display | Line chart showing past 12 weeks actual sales |
| F-002 | AI Forecast Engine | Generate forecast using 3 methods (MA, YoY, Custom) |
| F-003 | Method Comparison View | Side-by-side charts to compare forecast methods |
| F-004 | Bulk Multiply Adjustment | Apply % increase/decrease to selected weeks |
| F-005 | Timeline Editor | Interactive timeline with editable forecast values |
| F-006 | Variance Validation | Flag forecasts with >50% variance vs historical |
| F-007 | Save & Commit | Persist forecast to database |

#### P1 - Should Have (V1.1)

| Feature ID | Feature Name | Description |
|------------|-------------|-------------|
| F-008 | Stockout Warning | Highlight weeks where forecast < safety stock |
| F-009 | Pattern Copy | Copy forecast pattern from another SKU |
| F-010 | Undo/Redo | Allow users to revert changes |
| F-011 | Forecast Summary Table | Show total forecast by week/channel |
| F-012 | Export Forecast | Download forecast as Excel/CSV |

#### P2 - Nice to Have (V1.2)

| Feature ID | Feature Name | Description |
|------------|-------------|-------------|
| F-013 | Forecast Templates | Save and reuse custom forecast patterns |
| F-014 | Collaboration Comments | Add notes to specific weeks (e.g., "Black Friday promo") |
| F-015 | Approval Workflow | Route forecast to manager for review |
| F-016 | What-If Scenarios | Create multiple forecast scenarios for comparison |

### 7.3 Interaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: SCOPE SELECTION                                     │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐  ┌──────────────┐  ┌────────────────┐      │
│ │ Select SKU  │  │ Week Range   │  │ Channels       │      │
│ │ [Dropdown]  │  │ [Date Picker]│  │ [Multi-Select] │      │
│ └─────────────┘  └──────────────┘  └────────────────┘      │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Historical Sales Trend (Past 12 Weeks)                │  │
│ │ ╭───────────────────────────────────────────────────╮ │  │
│ │ │ [LINE CHART: Actual Sales]                        │ │  │
│ │ │ Avg: 5,200 | Min: 3,800 | Max: 7,100             │ │  │
│ │ ╰───────────────────────────────────────────────────╯ │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ [Cancel] [Next: Generate Forecast →]                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ STEP 2: AI FORECAST GENERATION                              │
├─────────────────────────────────────────────────────────────┤
│ Choose a forecast method:                                   │
│                                                             │
│ ┌──────────────────┐ ┌──────────────────┐ ┌─────────────┐ │
│ │ Moving Average   │ │ Year-over-Year   │ │ Custom      │ │
│ │ (4-Week MA)      │ │ Growth (+12%)    │ │ Baseline    │ │
│ │ ──────────────── │ │ ──────────────── │ │ ────────── │ │
│ │ [Chart Preview]  │ │ [Chart Preview]  │ │ [Input]     │ │
│ │ Avg: 5,150       │ │ Avg: 5,824       │ │ Avg: ___    │ │
│ │ ⚪ Select        │ │ ⚪ Select        │ │ ⚪ Select   │ │
│ └──────────────────┘ └──────────────────┘ └─────────────┘ │
│                                                             │
│ [← Back] [Next: Adjust →]                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ STEP 3: BULK ADJUSTMENTS                                    │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Forecast Timeline (Editable)                          │  │
│ │ ╭─────────────────────────────────────────────────╮   │  │
│ │ │ W49   W50   W51   W52   2026-W01  W02  W03 ...  │   │  │
│ │ │ 5100  5200  6500* 7000* 4800      5100  5200    │   │  │
│ │ │                  └─ Promotion weeks (adjusted)   │   │  │
│ │ ╰─────────────────────────────────────────────────╯   │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ Bulk Operations:                                            │
│ ┌───────────────────────┐ ┌─────────────────────────────┐ │
│ │ Select Weeks:         │ │ Action:                     │ │
│ │ [W51 - W52] ✓         │ │ ⚪ Multiply by [1.35] ×    │ │
│ │                       │ │ ⚪ Add/Subtract [___]       │ │
│ │                       │ │ ⚪ Set to [___]             │ │
│ └───────────────────────┘ │ [Apply]                     │ │
│                           └─────────────────────────────┘ │
│                                                             │
│ [← Back] [Next: Review →]                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ STEP 4: VALIDATION & REVIEW                                 │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Forecast vs Actual Comparison                         │  │
│ │ ╭─────────────────────────────────────────────────╮   │  │
│ │ │ ─── New Forecast                                 │   │  │
│ │ │ ─── Last Year Actual                             │   │  │
│ │ │ [OVERLAY CHART]                                  │   │  │
│ │ ╰─────────────────────────────────────────────────╯   │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ Validation Warnings:                                        │
│ ⚠️ W51: Forecast 6,500 is +40% vs historical avg (4,643)  │
│ ⚠️ W52: Forecast 7,000 is +51% vs historical avg (4,643)  │
│ ℹ️ Tip: This is expected for holiday season promotions    │
│                                                             │
│ Summary by Channel:                                         │
│ Amazon:  42,300 units | Walmart: 28,500 | Target: 19,200  │
│                                                             │
│ [← Back] [Save Draft] [Commit Forecast ✓]                  │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 UI Layout Specifications

#### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Header: "销量预测向导" | Progress: ●●●○○ (Step 3/5)       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   [Wizard Content Area - Changes per step]                 │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ [Dynamic Content Based on Current Step]             │  │
│   │                                                      │  │
│   │ - Step 1: Scope Selection                           │  │
│   │ - Step 2: AI Forecast Generation                    │  │
│   │ - Step 3: Bulk Adjustments                          │  │
│   │ - Step 4: Validation & Review                       │  │
│   │ - Step 5: Confirmation                              │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Footer: [← Back] [Cancel] [Next →] / [Save] [Commit]       │
└─────────────────────────────────────────────────────────────┘
```

#### Component Specifications

**Historical Trend Chart (Step 1)**
- Type: Recharts LineChart
- Data: Past 12 weeks of `sales_actuals`
- Axes: X = week_iso, Y = actual_qty
- Features:
  - Tooltip showing exact values
  - Average line (dashed)
  - Min/Max annotations
  - Responsive width

**AI Forecast Method Cards (Step 2)**
- Layout: 3 cards in a grid (responsive: stack on mobile)
- Each card:
  - Title (method name)
  - Mini chart preview (Recharts AreaChart)
  - Key metric (Average forecast)
  - Radio button to select
- Selected card: Border highlight (blue)

**Timeline Editor (Step 3)**
- Type: Custom interactive component
- Features:
  - Horizontal week labels
  - Editable number inputs for each week
  - Color coding:
    - Green: Within historical range
    - Yellow: +/-30% variance
    - Red: >50% variance
  - Click to edit individual cell
  - Keyboard navigation (tab between weeks)

**Validation Alerts (Step 4)**
- Type: Alert banner (ShadCN Alert component)
- Severity levels:
  - Warning (yellow): 30-50% variance
  - Error (red): >50% variance
  - Info (blue): Helpful tips
- Dismissible: User can acknowledge and proceed

### 7.5 Intelligent Features Detail

#### AI Forecast Engine (Backend)

**Algorithm 1: Moving Average**
```
Forecast(week_n) = Average(Actual[week_n-4], ..., Actual[week_n-1])
```

**Algorithm 2: Year-over-Year Growth**
```
Forecast(week_n) = Actual(week_n - 52 weeks) × (1 + growth_rate)
growth_rate = calculated from past year trend
```

**Algorithm 3: Custom Baseline**
```
Forecast(week_n) = user_defined_baseline × week_multiplier
week_multiplier = optional seasonality adjustment
```

**Implementation:**
- Server Action: `generateForecastSuggestions(sku, channel, weekRange, method)`
- Returns: `{ week_iso, forecast_qty, confidence_level }[]`

#### Validation Rules

| Rule ID | Rule Description | Threshold | Action |
|---------|-----------------|-----------|--------|
| VAL-001 | Variance vs historical average | >50% | Show warning |
| VAL-002 | Stockout risk | forecast < safety_stock | Show error |
| VAL-003 | Unrealistic spike | Week-over-week change >100% | Flag for review |
| VAL-004 | Zero forecast | forecast == 0 for active SKU | Confirm intent |
| VAL-005 | Negative forecast | forecast < 0 | Block save |

---

## 8. Technical Considerations

### 8.1 Data Model (Existing - No Changes Required)

**Tables:**
- `sales_forecasts` (id, week_iso, sku, channel_code, forecast_qty)
- `sales_actuals` (id, week_iso, sku, channel_code, actual_qty)
- `products` (sku, product_name, safety_stock_weeks)

**Queries Needed:**
- Fetch historical actuals: 12 weeks back from start week
- Calculate moving averages
- Calculate YoY growth rates
- Validate forecast against safety stock

### 8.2 Tech Stack Alignment

| Component | Technology | Notes |
|-----------|-----------|-------|
| Wizard UI | React 19 (Client Component) | Multi-step state management |
| Charts | Recharts | LineChart, AreaChart, ComposedChart |
| Forms | ShadCN Form + React Hook Form | Validation, error handling |
| Backend | Next.js Server Actions | AI calculation, save forecast |
| Database | Supabase PostgreSQL | Existing schema, no migration needed |

### 8.3 Performance Considerations

- **Lazy Load Charts:** Only render charts when user reaches that step
- **Debounce Input:** When user edits timeline, debounce save to avoid excessive re-renders
- **Batch Upsert:** Save all forecast rows in a single transaction
- **Caching:** Cache historical actuals for 5 minutes (Redis optional)

### 8.4 Security & Validation

- **RLS Policies:** Leverage existing Supabase RLS on `sales_forecasts` table
- **Input Sanitization:** Validate forecast_qty is non-negative integer
- **Concurrent Edits:** Check `updated_at` timestamp to prevent overwrite conflicts
- **Audit Trail:** Log forecast changes to `forecast_change_log` table (optional)

---

## 9. Success Metrics

### 9.1 Quantitative Metrics

| Metric | Current Baseline | Target (3 months) | Measurement |
|--------|-----------------|-------------------|-------------|
| **Time to Complete Forecast** | 45 min | 10 min | User session analytics |
| **Forecast Accuracy** | 65% (MAPE) | 75% | Compare forecast vs actual |
| **Adoption Rate** | 60% | 90% | % of weeks with forecast data |
| **User Satisfaction** | 3.2/5 | 4.5/5 | Post-feature survey (NPS) |

### 9.2 Qualitative Metrics

- **User Feedback:** "I can now forecast in 10 minutes instead of an hour!"
- **Reduced Support Tickets:** 50% fewer "how do I forecast?" questions
- **Business Impact:** Better inventory planning reduces stockouts by 20%

---

## 10. Acceptance Criteria (High-Level)

### Functional Requirements

**GIVEN** a user with planning permissions
**WHEN** they access the new forecast wizard
**THEN** they can complete a 12-week forecast for any SKU in under 10 minutes
**AND** the system provides AI-suggested values based on historical data
**AND** the user can bulk adjust forecasts using percentage or absolute changes
**AND** the system validates forecasts against business rules (safety stock, variance)
**AND** the forecast is saved to `sales_forecasts` table with proper audit trail

### Non-Functional Requirements

- **Performance:** Page loads in < 2 seconds, chart renders in < 500ms
- **Accessibility:** WCAG 2.1 AA compliant (keyboard navigation, screen reader support)
- **Responsiveness:** Works on desktop (1920px), tablet (768px), mobile (375px)
- **Browser Support:** Chrome, Firefox, Safari (latest 2 versions)

---

## 11. Out of Scope (Future Enhancements)

| Feature | Reason for Exclusion | Future Version |
|---------|---------------------|----------------|
| Multi-User Collaboration | Requires real-time sync infrastructure | V2.0 |
| Machine Learning Auto-Forecast | Needs 6+ months historical data + ML pipeline | V2.0 |
| Mobile App | Desktop-first workflow | V3.0 |
| Approval Workflow | Org structure not finalized | V1.5 |
| API for External Systems | No integration requirements yet | V2.0 |

---

## 12. Dependencies & Risks

### Dependencies

- **Historical Data Availability:** Requires at least 12 weeks of `sales_actuals` data
- **Product Master Data:** `products.safety_stock_weeks` must be populated
- **Browser Compatibility:** Modern browsers with ES6+ support

### Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Users distrust AI suggestions | Medium | Low | Show confidence levels + allow full override |
| Insufficient historical data | High | Medium | Fallback to manual input if < 4 weeks data |
| Complex edge cases (promotions) | Low | High | Provide manual override + comments feature |
| Performance issues with 100+ SKUs | Medium | Low | Paginate SKU selection, lazy load charts |

---

## 13. Rollout Plan

### Phase 1: Beta Test (Week 1-2)
- Release to 3-5 power users
- Collect feedback on usability
- Fix critical bugs

### Phase 2: Pilot (Week 3-4)
- Release to 20% of users
- A/B test: New wizard vs old matrix
- Measure time savings

### Phase 3: General Availability (Week 5+)
- Full rollout to all users
- Keep old matrix as "Advanced Mode" fallback
- Deprecate old UI after 2 months if metrics are positive

---

## 14. Open Questions

1. **Q:** Should we auto-save forecast drafts as users navigate the wizard?
   **A:** TBD - Discuss with engineering (localStorage vs database)

2. **Q:** What happens if a user closes the wizard mid-way?
   **A:** TBD - Option A: Discard, Option B: Save draft (requires draft state)

3. **Q:** Should we allow batch forecasting (multiple SKUs at once)?
   **A:** TBD - Nice to have, but may complicate UX. Consider for V1.1

4. **Q:** How do we handle forecast versioning (comparing old vs new forecasts)?
   **A:** TBD - Requires `forecast_version` field in database

---

## 15. Appendix

### A. Wireframe References

(To be created by System Architect in design.md)

### B. Historical Data Analysis

**Sample Data Pattern:**
- SKU-001, Amazon, W45-W48: [4200, 4350, 4100, 4500]
- Moving Average (4-week): 4287.5
- YoY Growth (assuming +15% from last year): 4950
- User Choice: Likely pick YoY for growth products, MA for stable products

### C. User Quotes from Discovery Interviews

> "I just copy last week's numbers because I don't have time to think about each cell."
> — Planner, Company X

> "I wish the system could suggest values based on what happened before."
> — Senior Planner, Company Y

> "The matrix is overwhelming. I need to see trends, not just empty cells."
> — Planning Manager, Company Z

---

## Document Approval

| Role | Name | Status | Date |
|------|------|--------|------|
| Product Director | Claude | ✅ Drafted | 2025-12-18 |
| System Architect | TBD | ⏳ Pending Review | - |
| Frontend Lead | TBD | ⏳ Pending Review | - |
| Backend Lead | TBD | ⏳ Pending Review | - |
| QA Director | TBD | ⏳ Pending Review | - |

---

**Next Steps:**
1. Review and approve this PRD
2. System Architect creates `design.md` with database schema, API contracts, wireframes
3. Frontend Artisan implements wizard UI
4. Backend Specialist implements AI forecast algorithms
5. QA Director creates test plan

**End of PRD**
