# Executive Summary: Replenishment Action Center

**Feature Owner**: Product Director
**Target Release**: Sprint 4, Week 4
**Business Impact**: HIGH - Directly affects inventory efficiency and planner productivity

---

## The Problem

Our inventory forecasting system successfully identifies which SKUs will run out of stock in the next 12 weeks. However, planners face a critical gap:

**"I know Product X will run out in Week 8. But how much should I order? When must I place that order?"**

Currently, planners:
- Manually calculate order quantities (2-3 hours per planning cycle)
- Miss critical order deadlines 15-20% of the time
- Lack systematic prioritization (all risks look equally urgent)

**Cost to Business**:
- 12 hours/month of planner time wasted on manual math
- Preventable stockouts costing ~$50K/month in lost sales
- Reactive firefighting instead of proactive planning

---

## The Solution

**Replenishment Action Center**: A prioritized, actionable dashboard that displays:
1. Suggested order quantities (auto-calculated using safety stock logic)
2. Order deadlines with urgency indicators
3. Priority classification (Critical/High/Medium/Low)

**User Experience**:
```
Planner opens /planning/projection → Sees at the top:

┌────────────────────────────────────────────────────┐
│ REPLENISHMENT ACTION CENTER                        │
│                                                    │
│ [CRITICAL] SKU-A001 | Product Alpha               │
│ Order 1,200 units by Dec 5 (3 days left!)         │
│                                      [View Details]│
│                                                    │
│ [HIGH] SKU-B002 | Product Beta                    │
│ Order 800 units by Dec 10 (8 days left)           │
│                                      [View Details]│
└────────────────────────────────────────────────────┘
```

Planner clicks "View Details" → Sees calculation breakdown:
- Current stock: 850 units
- Safety threshold: 1,500 units
- Gap: 650 units
- Formula: CEILING(650/100) × 100 = **700 units**

---

## Business Value

### Quantitative Benefits

| Metric | Current State | Target State | Annual Value |
|--------|--------------|--------------|--------------|
| Planning cycle time | 3 hours/week | 30 min/week | $15,600 (planner time saved) |
| Order deadline miss rate | 15% | <5% | $120,000 (prevented stockouts) |
| Manual calculation errors | ~8%/month | 0% | $24,000 (error prevention) |

**Total Annual Value**: ~$160K

### Qualitative Benefits

- **Proactive Planning**: Planners focus on strategy, not arithmetic
- **Risk Visibility**: Executives see portfolio-level stockout risks at a glance
- **Audit Trail**: Clear rationale for every order quantity decision
- **Scalability**: Supports 500+ SKUs without additional headcount

---

## How It Works (Technical)

1. **Data Source**: `v_replenishment_suggestions` materialized view (already built in database)
2. **Calculation Logic**: Already implemented in SQL (no new backend work required)
3. **Frontend Work**: Create React component to display suggestions (2-3 days dev time)

**Key Formula**:
```
Suggested Order Qty = CEILING(
  MAX(
    Safety Threshold - Projected Closing Stock,
    4 Weeks of Sales
  ) / 100
) * 100
```

**Priority Logic**:
- Critical: Risk occurs within 2 weeks
- High: Risk occurs within 3-4 weeks
- Medium: Risk occurs within 5-8 weeks
- Low: Risk occurs within 9-12 weeks

---

## Success Metrics

### Week 1-4 (Early Indicators)
- 80% of planners view the Action Center weekly
- 50% click "View Details" to understand calculations
- <5% use manual refresh (indicates auto-refresh works well)

### Month 2-3 (Business Impact)
- Planning cycle time reduced from 3h to <30min
- Stockout incidents reduced by 25%
- Order deadline miss rate <5%

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users don't trust suggested quantities | Medium | High | Show transparent calculation details; allow data export |
| Data quality issues (missing safety stock configs) | High | Medium | Add data validation warnings; use sensible defaults |
| Overwhelming number of suggestions | Low | Medium | Default filter to Critical/High only |

---

## What We're NOT Building (V1)

To ship fast, we're deferring:
- Direct PO creation (users must copy data to PO form manually)
- Quantity editing (must trust algorithm)
- Historical tracking of accepted/rejected suggestions
- Multi-warehouse replenishment logic

These can be added in V2 based on user feedback.

---

## Resource Requirements

| Role | Time Commitment | Duration |
|------|----------------|----------|
| Frontend Engineer | Full-time | 2 weeks |
| UX Designer | 50% time | 1 week (component design) |
| Product Manager | 20% time | 3 weeks (specs, UAT) |
| QA Engineer | 50% time | 1 week (testing) |

**Total Sprint Capacity**: ~3 person-weeks

---

## Timeline

```
Week 1:   Foundation (query integration, basic UI)
Week 2:   Core features (filters, detail panel, refresh)
Week 3:   Polish (responsive, accessibility, performance)
Week 4:   UAT + Production deployment
```

**Go-Live Date**: End of Sprint 4

---

## Approval Required

This PRD requires sign-off from:
- [ ] Engineering Lead (technical feasibility)
- [ ] UX Designer (interaction patterns)
- [ ] Demand Planning Lead (business logic validation)
- [ ] VP Operations (budget approval)

**Estimated ROI**: 10x (1 month payback period based on planner time savings alone)

---

## Appendix: Comparable Features

**Industry Benchmarks**:
- **NetSuite**: "Inventory Replenishment Planning" - provides suggested order qtys with vendor lead time
- **SAP IBP**: "Supply Review" - shows prioritized shortage list with recommended actions
- **Cin7**: "Reorder Recommendations" - auto-calculates order quantities based on reorder points

**Our Differentiation**:
- Fully automated calculation (no manual reorder point setup)
- 12-week rolling projection (not just current stock snapshot)
- Transparent calculation details (users understand the "why")

---

**Next Steps**:
1. Schedule PRD review meeting with stakeholders (Week 1, Day 1)
2. UX Designer: Create component mockups (Week 1, Day 2-3)
3. Engineering: Spike query performance testing (Week 1, Day 4)
4. Product: Draft user training documentation (Week 2)

---

**Document Status**: DRAFT - Pending Stakeholder Review
**Last Updated**: 2025-11-30
**Contact**: Product Director (product@rolloy.com)
