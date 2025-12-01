# Business Rules Matrix: Replenishment Action Center

**Document Version**: 1.0
**Last Updated**: 2025-11-30

---

## 1. PRIORITY CLASSIFICATION RULES

### 1.1 Decision Matrix

| Risk Week Offset | Priority Level | Color Code | Action SLA | Business Justification |
|-----------------|----------------|------------|-----------|----------------------|
| 0-2 weeks | Critical | Red (#EF4444) | Order within 24 hours | Insufficient time for standard lead time; expedited shipping may be required |
| 3-4 weeks | High | Orange (#F97316) | Order this week | Standard lead time window; delay risks stockout |
| 5-8 weeks | Medium | Yellow (#EAB308) | Order within 2 weeks | Comfortable buffer; routine planning cycle |
| 9-12 weeks | Low | Green (#22C55E) | Monitor for next cycle | Long runway; may adjust based on forecast changes |

### 1.2 Priority Override Rules

**RULE 1.2.1: Overdue Escalation**
```
IF order_deadline_date < CURRENT_DATE
THEN display_priority = "Overdue" (regardless of original priority)
AND sort_order = 1 (top of list)
```

**RULE 1.2.2: Multiple SKU Conflict**
```
IF user has >50 suggestions
THEN default_filter = "Critical + High only"
AND show_notification = "Showing high-priority items only. Click 'All' to see full list."
```

---

## 2. ORDER QUANTITY CALCULATION RULES

### 2.1 Base Formula

```
suggested_order_qty = CEILING(
  MAX(
    (safety_stock_threshold - projected_closing_stock),
    (average_weekly_sales * 4)
  ) / 100
) * 100
```

### 2.2 Constraint Rules

| Constraint | Rule | Example |
|-----------|------|---------|
| **Minimum Order** | At least 4 weeks of sales | If weekly sales = 150, min order = 600 units |
| **Rounding** | Always round UP to nearest 100 | 732 units → 800 units |
| **Negative Stock Handling** | Treat projected closing stock < 0 as 0 | closing_stock = -50 → use 0 in formula |
| **Zero Sales Handling** | If avg_weekly_sales = 0, use safety_threshold only | Rare/slow-moving items |

### 2.3 Edge Cases

**CASE 2.3.1: Sufficient Incoming Stock**
```
IF projected_closing_stock >= safety_stock_threshold
THEN no_suggestion_generated
REASON: SKU is adequately stocked
```

**CASE 2.3.2: Far Future Risk (>12 weeks)**
```
IF risk_week_offset > 12
THEN no_suggestion_generated
REASON: Outside planning horizon
```

**CASE 2.3.3: Missing Safety Stock Configuration**
```
IF products.safety_stock_weeks IS NULL
THEN use_default_value = 4 weeks
AND log_warning = "SKU {sku} missing safety_stock_weeks config"
```

---

## 3. DEADLINE CALCULATION RULES

### 3.1 Order Deadline Logic

**Formula**:
```
order_deadline_date = risk_week_start_date - (safety_stock_weeks * 7 days)
```

**Assumptions**:
- `safety_stock_weeks` includes both production time AND shipping time
- Example: If safety_stock_weeks = 6, this assumes:
  - 4 weeks production + 2 weeks shipping
  - OR 3 weeks production + 3 weeks shipping

**Business Rule**:
```
IF order_deadline_date < CURRENT_DATE
THEN is_overdue = TRUE
AND display_color = Red
AND alert_icon = Exclamation Triangle
```

### 3.2 Ship Deadline Logic

**Formula**:
```
ship_deadline_date = risk_week_start_date - 14 days
```

**Assumption**: Fixed 2-week shipping time (international freight)

**Use Case**: For pre-ordered inventory, supplier must ship by this date to arrive before risk week.

### 3.3 Deadline Display Rules

| Days Until Deadline | Display Format | Color | Example |
|-------------------|----------------|-------|---------|
| > 7 days | "X days left" | Green | "12 days left" |
| 3-7 days | "X days left" | Yellow | "5 days left" |
| 1-2 days | "X days left!" | Orange | "2 days left!" |
| 0 days | "Order today!" | Red | "Order today!" |
| Negative | "Overdue by X days" | Red | "Overdue by 3 days" |

---

## 4. DATA VISIBILITY RULES

### 4.1 Role-Based Access

| User Role | View Permissions | Action Permissions |
|-----------|-----------------|-------------------|
| Demand Planner | View all suggestions | Refresh data, View details |
| Procurement Manager | View all suggestions | Refresh data, View details, Export (future) |
| Inventory Controller | View Critical/High only (default) | View details |
| Read-Only User | View all suggestions | None |

### 4.2 SKU Inclusion Rules

**RULE 4.2.1: Active SKUs Only**
```
IF products.is_active = FALSE
THEN exclude_from_suggestions
```

**RULE 4.2.2: Risk Status Filter**
```
IF stock_status IN ('Stockout', 'Risk')
AND first_risk_week_offset <= 12
THEN include_in_suggestions
```

**RULE 4.2.3: Duplicate Prevention**
```
GROUP BY sku
KEEP only first_risk_week (earliest occurrence)
```

---

## 5. STATE TRANSITION RULES

### 5.1 Suggestion Lifecycle

```
┌─────────────────┐
│ SKU Projection  │
│ (v_inventory_   │
│  projection)    │
└────────┬────────┘
         │
         ↓
   [Risk Detected?] ──NO──> (No action)
         │
        YES
         ↓
┌─────────────────┐
│ Calculate       │
│ Suggested Qty   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Assign Priority │
│ & Deadlines     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Display in UI   │
│ Action Center   │
└────────┬────────┘
         │
         ↓
   [User Action]
   (Future: PO Creation)
```

### 5.2 Refresh Rules

**RULE 5.2.1: Automatic Refresh**
- Trigger: Daily at 06:00 UTC
- Method: Cron job calls `refresh_inventory_projections()`
- Duration: ~10-30 seconds (depends on data volume)

**RULE 5.2.2: Manual Refresh**
- Trigger: User clicks "Refresh" button
- Method: RPC call to `refresh_inventory_projections()`
- Rate Limit: Max 1 refresh per 5 minutes (prevent abuse)
- UI Feedback: Loading spinner + "Last updated: [timestamp]"

**RULE 5.2.3: Data Staleness Warning**
```
IF (CURRENT_TIMESTAMP - calculated_at) > 48 hours
THEN show_warning = "Data may be stale. Click Refresh."
```

---

## 6. ERROR HANDLING RULES

### 6.1 Data Validation Rules

| Error Condition | Detection Logic | User Message | System Action |
|----------------|----------------|--------------|---------------|
| View not found | `relation does not exist` | "Database view not initialized. Please run migrations." | Show setup instructions |
| Empty result | `data.length === 0` | "No replenishment suggestions. All SKUs are adequately stocked." | Show green checkmark icon |
| Query timeout | `error.code === '57014'` | "Loading took too long. Please try again." | Auto-retry once |
| RLS policy block | `error.code === '42501'` | "Permission denied. Contact administrator." | Log security event |

### 6.2 Calculation Validation

**RULE 6.2.1: Negative Quantity Check**
```
IF suggested_order_qty < 0
THEN log_error = "Invalid calculation for SKU {sku}"
AND exclude_from_display
```

**RULE 6.2.2: Unrealistic Quantity Check**
```
IF suggested_order_qty > (average_weekly_sales * 52)
THEN log_warning = "Suggested qty exceeds 1 year of sales for SKU {sku}"
AND display_with_yellow_flag = "Verify calculation"
```

---

## 7. BUSINESS CONSTRAINTS MATRIX

### 7.1 Supplier Constraints (Future Enhancement)

| Constraint Type | Current Behavior | Future State |
|----------------|-----------------|--------------|
| MOQ (Minimum Order Qty) | Not enforced; assumes 100 units | Check against `suppliers.moq` |
| Lead Time Variance | Uses fixed `safety_stock_weeks` | Use supplier-specific lead times |
| Capacity Limits | Assumes unlimited | Cap suggestions at supplier max capacity |

### 7.2 Financial Constraints

| Constraint | V1 Behavior | Future Enhancement |
|-----------|-------------|-------------------|
| Budget Caps | Not enforced | Add "Total Order Value" column; warn if exceeds monthly budget |
| Currency Conversion | Not applicable | Support multi-currency SKUs |

### 7.3 Operational Constraints

| Constraint | Rule | Impact |
|-----------|------|--------|
| Warehouse Capacity | Not checked | May suggest order that exceeds storage space |
| Seasonal Demand | Not modeled | Suggestions based on rolling 12-week average only |
| Promotional Events | Not factored | Must manually adjust for planned promotions |

---

## 8. INTERACTION RULES

### 8.1 Filter Behavior

**RULE 8.1.1: Filter Persistence**
```
IF user selects filter (e.g., "Critical")
THEN persist_in_session_storage
AND restore_on_page_refresh
```

**RULE 8.1.2: Multi-Filter Logic**
```
IF user selects "Critical" AND "Overdue"
THEN apply_AND_logic (show only items that are BOTH Critical AND Overdue)
```

### 8.2 Detail Panel Behavior

**RULE 8.2.1: Single Expand**
```
IF user clicks "View Details" on SKU-A
AND another detail panel is open (SKU-B)
THEN close SKU-B panel automatically
REASON: Prevent cluttered UI
```

**RULE 8.2.2: Scroll Behavior**
```
IF user expands detail panel
AND panel extends below viewport
THEN auto_scroll_to = panel_top_position
```

---

## 9. INTEGRATION RULES (Future)

### 9.1 Purchase Order Integration

**When available** (not V1):

```
WHEN user clicks "Create PO" on a suggestion
THEN pre_fill_po_form = {
  sku: suggestion.sku,
  qty: suggestion.suggested_order_qty,
  required_delivery_date: suggestion.risk_week_start,
  priority: suggestion.priority
}
```

### 9.2 Alert System Integration

**When available** (not V1):

```
IF is_overdue = TRUE
AND priority IN ('Critical', 'High')
THEN send_email_alert = {
  recipient: demand_planner@company.com,
  subject: "URGENT: Overdue Replenishment for SKU {sku}",
  body: "Order deadline was {days_overdue} days ago. Immediate action required."
}
```

---

## 10. TESTING MATRIX

### 10.1 Test Cases by Business Rule

| Rule ID | Test Scenario | Expected Result | Priority |
|---------|--------------|----------------|----------|
| 1.1 | SKU with risk_week_offset = 1 | Priority = Critical, Color = Red | P0 |
| 1.2.1 | order_deadline_date = yesterday | Display "Overdue", Sort first | P0 |
| 2.1 | closing_stock = 200, safety = 1000, sales = 150 | suggested_qty = 800 (max(800, 600)) | P0 |
| 2.2 | Calculated qty = 732 | Display qty = 800 (rounded up) | P0 |
| 2.3.1 | closing_stock = 1500, safety = 1000 | No suggestion shown | P1 |
| 3.1 | risk_week = W50, safety_weeks = 4 | order_deadline = W46 | P0 |
| 4.2.1 | SKU with is_active = FALSE | Excluded from list | P1 |
| 5.2.3 | calculated_at = 3 days ago | Show "Data may be stale" warning | P2 |
| 6.2.2 | suggested_qty = 10,000, weekly_sales = 100 | Show yellow flag "Verify calculation" | P2 |

---

## REVISION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-30 | Product Director | Initial draft |

---

**END OF DOCUMENT**
