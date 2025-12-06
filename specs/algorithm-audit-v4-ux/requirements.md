# Product Requirements: Algorithm Audit V4 - Hover Interaction Enhancement

## Document Control

| Field | Value |
|-------|-------|
| Feature Name | Algorithm Audit Table V4 - Hover-Based Data Source Display |
| Document Version | 1.0 |
| Author | Product Director |
| Created Date | 2025-12-05 |
| Status | Draft |

---

## 1. Context & Business Goals

### 1.1 Problem Statement

Users of the Algorithm Audit V4 table have provided feedback that the current "click-to-expand" interaction pattern creates friction when investigating data lineage. The current implementation requires:

1. User clicks the "Detail" button (ChevronDown/ChevronRight)
2. A full expanded row section appears below
3. User reviews the detail table
4. User clicks again to collapse

**Pain Point:** For quick data verification tasks (e.g., "Where does this planned value come from?"), this multi-step process is too heavyweight. Users want immediate visual feedback when hovering over a number.

### 1.2 Business Value

**Why This Matters:**
- **Operational Efficiency:** Supply chain planners perform data lineage checks dozens of times per day. Reducing interaction friction from 2 clicks to 0 clicks saves significant time.
- **Data Trust:** Instant visibility into data sources increases confidence in system calculations, reducing manual Excel-based verification.
- **User Adoption:** A modern, responsive UI improves user satisfaction and reduces training time for new users.

**Success Metrics:**
- Time to verify data source: Target < 1 second (vs current ~3-5 seconds)
- User satisfaction score for audit table: Target increase from 7/10 to 9/10
- Reduction in support tickets asking "Where does this number come from?"

---

## 2. User Stories

### 2.1 Primary User Story

**As a** Supply Chain Planner
**I want to** see the data source and calculation logic by hovering over any number in the Algorithm Audit table
**So that** I can quickly verify data accuracy without needing to click through multiple UI layers.

**Acceptance Criteria (Gherkin Syntax):**

```gherkin
Given I am viewing the Algorithm Audit V4 table
When I hover my mouse over a "Planned" value (e.g., Planned Factory Ship)
Then a tooltip appears within 200ms showing:
  - Data source type (e.g., "Based on Actual Order")
  - Source week reference (e.g., "From 2025-W49")
  - Confidence level (e.g., "High")
And the tooltip disappears immediately when my mouse leaves the number
And the tooltip does not obstruct the current row or adjacent data
```

### 2.2 Secondary User Story: Detail Expansion Still Available

**As a** Supply Chain Analyst
**I want to** still be able to expand full detail tables when needed for complex investigations
**So that** I can access granular data (PO numbers, tracking numbers, dates) when tooltip information is insufficient.

**Acceptance Criteria:**

```gherkin
Given the hover tooltip feature is active
When I need to see full transaction details (e.g., all PO numbers, supplier names, delivery dates)
Then I can still click the "Detail" button to expand the full detail table
And both interaction patterns coexist without interfering with each other
```

---

## 3. Functional Requirements

### 3.1 Hover Tooltip - Scope & Triggers

| Column Group | Tooltip Required? | Tooltip Content |
|--------------|-------------------|-----------------|
| Sales - Planned | No | N/A (reverse calculation from demand) |
| Sales - Actual | No | Direct database value, no source needed |
| Sales - Effective | No | Simple formula: COALESCE(actual, planned) |
| Sales - Coverage | Yes | List of matching PO numbers within ±1 week tolerance |
| Order - Planned | Yes | Source: Reverse calculation based on sales demand |
| Order - Actual | Yes | List of PO numbers, order dates, quantities |
| Factory Ship - Planned | Yes | Propagation source type, source week, confidence |
| Factory Ship - Actual | Yes | List of delivery numbers, dates, quantities |
| Ship - Planned | Yes | Propagation source type, source week, confidence |
| Ship - Actual | Yes | List of tracking numbers, departure dates |
| Arrival - Planned | Yes | Propagation source type, source week, confidence |
| Arrival - Actual | Yes | List of tracking numbers, arrival dates, warehouses |
| Inventory | No | Direct calculation: opening + arrival - sales |

### 3.2 Tooltip Content Structure

**For Planned Values (with PropagationSource metadata):**

```
Data Source:
• Based on Actual Order
  (From 2025-W48)
• Based on Actual Factory Ship
  (From 2025-W49)

Confidence: High
```

**For Actual Values (with transaction details):**

```
Actual Orders This Week:
• PO-2025-001: 1000 units (2025-12-01)
• PO-2025-003: 500 units (2025-12-03)

Total: 1500 units
Supplier: Factory ABC
```

**For Coverage Status:**

```
Sales Demand Coverage:
Target Week: 2026-W08
Required Order Week: 2025-W48 ±1

Matching Orders:
• PO-2025-047 (2025-W48): 800 units
• PO-2025-050 (2025-W49): 200 units

Coverage: 1000 / 1200 (83%)
Uncovered: 200 units
```

### 3.3 Tooltip Behavior Rules

| Rule ID | Description | Rationale |
|---------|-------------|-----------|
| TB-01 | Tooltip appears 200ms after hover starts | Prevent accidental tooltips during mouse movement |
| TB-02 | Tooltip disappears immediately on mouse leave | Avoid UI clutter |
| TB-03 | Tooltip position: above the hovered number, centered | Minimize obstruction of adjacent data |
| TB-04 | If tooltip would overflow viewport top, show below | Ensure visibility on first row |
| TB-05 | Max tooltip width: 320px | Prevent excessive horizontal space usage |
| TB-06 | Tooltip background: Semi-transparent gray-900 with white text | High contrast for readability |
| TB-07 | Tooltip z-index: 50 (higher than table content) | Always visible above other elements |

### 3.4 Data Source Priority Logic

**For Planned Values with Multiple Sources:**

When a planned value is propagated from multiple actual data points (e.g., Planned Ship based on both Actual Order and Actual Factory Ship), display all sources in **descending confidence order**:

```typescript
// Priority Order
1. actual_arrival (highest confidence)
2. actual_ship
3. actual_factory_ship
4. actual_order
5. reverse_calc (lowest confidence)
```

**Display Format:**

```
Data Sources (by confidence):
✓ Based on Actual Ship (2025-W49) - High
  Based on Actual Order (2025-W48) - Medium

Overall Confidence: High
```

---

## 4. Business Rules Matrix

### 4.1 Tooltip Display Decision Table

| Condition | Show Tooltip? | Tooltip Type |
|-----------|---------------|--------------|
| Value = 0 | No | N/A |
| Value > 0 AND has PropagationSource[] | Yes | Source lineage tooltip |
| Value > 0 AND has detail records (order_details, ship_details, etc.) | Yes | Transaction summary tooltip |
| Value > 0 BUT no metadata available | No | N/A |
| Column = "Effective" or "Coverage" | Yes | Formula explanation tooltip |

### 4.2 Confidence Level Classification

| Propagation Source Type | Confidence Level | Display Color |
|-------------------------|------------------|---------------|
| actual_arrival | High | Green (#10b981) |
| actual_ship | High | Green (#10b981) |
| actual_factory_ship | Medium | Yellow (#f59e0b) |
| actual_order | Medium | Yellow (#f59e0b) |
| reverse_calc | Low | Gray (#6b7280) |

---

## 5. Non-Functional Requirements

### 5.1 Performance

- **NFR-01:** Tooltip render time must be < 200ms from hover start
- **NFR-02:** No network requests triggered by hover (all data pre-loaded in table state)
- **NFR-03:** Smooth fade-in animation (100ms duration)

### 5.2 Accessibility

- **NFR-04:** Tooltip content must be accessible via keyboard focus (Tab navigation)
- **NFR-05:** Screen readers must announce tooltip content via `aria-describedby` attribute
- **NFR-06:** Color coding must not be the sole method of conveying confidence level (use text labels)

### 5.3 Browser Compatibility

- **NFR-07:** Must work on Chrome 90+, Safari 14+, Firefox 88+
- **NFR-08:** Must work on mobile devices (touch: long-press to trigger tooltip)

---

## 6. Out of Scope (Explicitly NOT in this version)

1. **Inline Editing:** Users cannot edit values directly from the tooltip
2. **Drill-Down Navigation:** Clicking a PO number in the tooltip does NOT navigate to the PO detail page (use expanded detail table for this)
3. **Historical Comparison:** Tooltip does NOT show previous week's values
4. **Customizable Tooltip Content:** Users cannot configure what fields appear in tooltips

---

## 7. Dependencies & Assumptions

### 7.1 Dependencies

- **DEP-01:** Algorithm Audit V4 backend query must return `PropagationSource[]` metadata for all planned values
- **DEP-02:** `order_details`, `factory_ship_details`, `ship_details`, `arrival_details` arrays must be pre-populated in the table state

### 7.2 Assumptions

- **ASM-01:** Users have sufficient screen resolution (minimum 1280x720) to display tooltips without excessive scrolling
- **ASM-02:** Average tooltip content length does not exceed 10 lines of text
- **ASM-03:** Users understand the concept of "confidence levels" in data propagation

---

## 8. Success Criteria (Acceptance Testing)

### 8.1 Functional Acceptance

```gherkin
Scenario: User hovers over Planned Factory Ship value
  Given I am viewing Algorithm Audit V4 for SKU "PROD-001"
  And row "2026-W08" shows Planned Factory Ship = 500
  When I hover my mouse over the number 500
  Then a tooltip appears within 200ms
  And the tooltip shows:
    | Field | Value |
    | Source Type | Based on Actual Order |
    | Source Week | 2025-W48 |
    | Confidence | Medium |
  And when I move my mouse away
  Then the tooltip disappears immediately
```

### 8.2 Usability Acceptance

**UAT Checklist:**
- [ ] 5 out of 5 test users can successfully identify data source within 1 second
- [ ] 0 users report tooltip obstructing critical data
- [ ] 4 out of 5 users prefer hover over click-to-expand for quick checks
- [ ] Tooltip content is understandable without additional training

---

## 9. Open Questions (For Product Team Discussion)

1. **Q1:** Should tooltips remain visible if the user moves the mouse onto the tooltip itself (to allow text selection)? **Decision:** No, keep tooltip "information-only" for simplicity.
2. **Q2:** Should we add a small info icon next to values that have tooltips? **Decision:** Yes, add a faint `Info` icon to indicate hover interactivity (similar to existing implementation).
3. **Q3:** How should we handle mobile devices where hover is not possible? **Decision:** Long-press (500ms) triggers tooltip, tap outside to dismiss.

---

## 10. Appendix: Wireframe (Text-Based)

```
┌─────────────────────────────────────────────────────────────┐
│ Algorithm Audit V4 Table                                    │
├──────┬─────────┬─────────┬─────────┬────────────────────────┤
│ Week │ Planned │ Actual  │ Effective│ Detail                 │
├──────┼─────────┼─────────┼──────────┼────────────────────────┤
│ W48  │  500 ℹ️ │   520   │   520    │ [>] Expand             │
│      │  ↑      │         │          │                        │
│      │  └─ Tooltip appears here ──────────────┐              │
│      │         │         │          │          │              │
│      │         │         │          │  ┌───────▼──────────┐  │
│      │         │         │          │  │ Data Source:     │  │
│      │         │         │          │  │ • Actual Order   │  │
│      │         │         │          │  │   (From 2025-W47)│  │
│      │         │         │          │  │                  │  │
│      │         │         │          │  │ Confidence: High │  │
│      │         │         │          │  └──────────────────┘  │
└──────┴─────────┴─────────┴──────────┴────────────────────────┘
```

---

## Document Approval

| Role | Name | Status | Date |
|------|------|--------|------|
| Product Director | Claude (AI) | Draft Complete | 2025-12-05 |
| System Architect | TBD | Pending | - |
| Frontend Artisan | TBD | Pending | - |
| User Representative | Tony | Pending | - |
