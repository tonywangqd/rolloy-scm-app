# Algorithm Audit V4 - Usage Guide

## Overview

Algorithm Audit V4 extends V3 with demand coverage analysis and detailed lineage tracking for every stage of the supply chain.

## Function Signature

```typescript
export async function fetchAlgorithmAuditV4(
  sku: string,
  shippingWeeks: number = 5,
  customStartWeek?: string,
  customEndWeek?: string
): Promise<AlgorithmAuditResultV4>
```

## Basic Usage

```typescript
import { fetchAlgorithmAuditV4 } from '@/lib/queries/algorithm-audit'

// Example 1: Default 16-week window with 5-week shipping
const result = await fetchAlgorithmAuditV4('D-001')

// Example 2: Custom shipping weeks (e.g., 4 weeks for air freight)
const resultAir = await fetchAlgorithmAuditV4('D-001', 4)

// Example 3: Custom date range (full year analysis)
const resultYearly = await fetchAlgorithmAuditV4(
  'D-001',
  5,
  '2025-W01',
  '2025-W52'
)
```

## Return Data Structure

### Main Result Object

```typescript
{
  product: Product | null,              // Product master data
  rows: AlgorithmAuditRowV4[],          // Week-by-week data
  leadTimes: SupplyChainLeadTimesV3,    // Configuration
  metadata: {
    current_week: string,               // "2025-W49"
    start_week: string,
    end_week: string,
    total_weeks: number,
    avg_weekly_sales: number,
    safety_stock_weeks: number,
    production_lead_weeks: number,
    shipping_weeks: number,
    // V4-specific metrics
    total_demand: number,               // Sum of all sales_effective
    total_ordered: number,              // Sum of all actual_order
    overall_coverage_percentage: number // (ordered / demand) * 100
  }
}
```

### Enhanced Row Structure (AlgorithmAuditRowV4)

Each row extends V3 with additional fields:

```typescript
{
  // --- V3 Fields (all inherited) ---
  week_iso: "2025-W08",
  sales_effective: 373,
  actual_order: 35,
  actual_factory_ship: 0,
  actual_ship: 0,
  actual_arrival: 0,
  closing_stock: 1250,
  stock_status: "OK",
  // ... (all other V3 fields)

  // --- V4 New Fields ---

  // Coverage Analysis
  sales_coverage_status: "Partially Covered" | "Fully Covered" | "Uncovered" | "Unknown",
  sales_uncovered_qty: 20,  // How many units short

  // Lineage Metadata (optional, only if actuals exist)
  planned_factory_ship_source?: [
    {
      source_type: "actual_order",
      source_week: "2025-W02",
      confidence: "high"
    }
  ],

  // Expandable Detail Lists
  order_details: [
    {
      po_id: "uuid",
      po_number: "PO2025-12-01-001",
      ordered_qty: 35,
      delivered_qty: 10,
      pending_qty: 25,
      fulfillment_status: "Partial",
      supplier_name: "Supplier A",
      order_date: "2025-12-01",
      order_week: "2025-W02"
    }
  ],

  factory_ship_details: [
    {
      delivery_id: "uuid",
      delivery_number: "DN-2025-001",
      po_number: "PO2025-12-01-001",
      delivered_qty: 10,
      shipped_qty: 10,
      unshipped_qty: 0,
      shipment_status: "Fully Shipped",
      delivery_date: "2025-12-15",
      delivery_week: "2025-W07"
    }
  ],

  ship_details: [
    {
      shipment_id: "uuid",
      tracking_number: "SHIP-2025-001",
      delivery_number: "DN-2025-001",
      shipped_qty: 10,
      departure_date: "2025-12-22",
      arrival_date: null,
      planned_arrival_week: "2025-W13",
      actual_arrival_week: null,
      current_status: "In Transit"
    }
  ],

  arrival_details: [
    {
      shipment_id: "uuid",
      tracking_number: "SHIP-2025-001",
      po_number: null,  // Complex join, can be enhanced
      arrived_qty: 10,
      arrival_date: "2026-01-05",
      arrival_week: "2025-W13",
      warehouse_code: "FBA-EAST",
      destination_warehouse_name: "Amazon FBA East"
    }
  ]
}
```

## UI Integration Examples

### 1. Coverage Status Badge

```tsx
function getCoverageBadgeProps(status: CoverageStatus) {
  switch (status) {
    case 'Fully Covered':
      return { variant: 'success', label: '✓ 全覆盖' }
    case 'Partially Covered':
      return { variant: 'warning', label: '⚠ 部分覆盖' }
    case 'Uncovered':
      return { variant: 'destructive', label: '✗ 未覆盖' }
    default:
      return { variant: 'secondary', label: '未知' }
  }
}

// Usage
<Badge variant={getCoverageBadgeProps(row.sales_coverage_status).variant}>
  {getCoverageBadgeProps(row.sales_coverage_status).label}
  {row.sales_uncovered_qty > 0 && ` (缺${row.sales_uncovered_qty}件)`}
</Badge>
```

### 2. Expandable Row Pattern

```tsx
function AlgorithmAuditRow({ row }: { row: AlgorithmAuditRowV4 }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <TableRow>
        <TableCell>{row.week_iso}</TableCell>
        <TableCell>
          {row.sales_effective}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </TableCell>
        {/* ... other cells */}
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={20}>
            <ExpandedDetails row={row} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
```

### 3. Order Details Modal

```tsx
function OrderDetailsModal({ details }: { details: OrderDetailV4[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <th>PO号</th>
          <th>供应商</th>
          <th>订单量</th>
          <th>已交付</th>
          <th>待交付</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        {details.map((order) => (
          <tr key={order.po_id}>
            <td>
              <Link href={`/procurement/edit/${order.po_id}`}>
                {order.po_number}
              </Link>
            </td>
            <td>{order.supplier_name || 'N/A'}</td>
            <td>{order.ordered_qty}</td>
            <td>{order.delivered_qty}</td>
            <td>{order.pending_qty}</td>
            <td>
              <Badge variant={
                order.fulfillment_status === 'Complete' ? 'success' :
                order.fulfillment_status === 'Partial' ? 'warning' : 'secondary'
              }>
                {order.fulfillment_status}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
```

### 4. Coverage Summary Card

```tsx
function CoverageSummaryCard({ metadata }: { metadata: AlgorithmAuditResultV4['metadata'] }) {
  const coverageColor =
    metadata.overall_coverage_percentage >= 100 ? 'text-green-600' :
    metadata.overall_coverage_percentage >= 80 ? 'text-yellow-600' : 'text-red-600'

  return (
    <Card>
      <CardHeader>
        <CardTitle>需求覆盖率</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold mb-2">
          <span className={coverageColor}>
            {metadata.overall_coverage_percentage.toFixed(1)}%
          </span>
        </div>
        <div className="text-sm text-gray-600">
          已下单 {metadata.total_ordered} / 需求 {metadata.total_demand} 件
        </div>
      </CardContent>
    </Card>
  )
}
```

## Performance Considerations

### Optimal Use Cases
- **16-week window**: ~2-3 seconds (recommended for default view)
- **52-week window**: ~5 seconds (use for deep analysis)
- **Single SKU analysis**: Fast (parallel queries)

### Not Recommended
- **Multiple SKUs in loop**: Use separate queries and cache results
- **Real-time updates**: Consider implementing 5-minute cache in future

## Validation Checks

The implementation includes built-in data consistency checks:

1. **No Phantom Arrivals**: `arrival_effective` only populates when `arrival_details` exist
2. **Coverage Completeness**: Sum of uncovered quantities matches (total_demand - total_ordered)
3. **Type Safety**: All nested relations properly typed

## Comparison: V3 vs V4

| Feature | V3 | V4 |
|---------|----|----|
| Basic 20-column data | ✓ | ✓ |
| Reverse calculation | ✓ | ✓ |
| Forward propagation | ✓ | ✓ (enhanced) |
| Demand coverage status | ✗ | ✓ |
| Uncovered quantity tracking | ✗ | ✓ |
| Order details | ✗ | ✓ |
| Delivery traceability | ✗ | ✓ |
| Shipment tracking | ✗ | ✓ |
| Arrival records | ✗ | ✓ |
| PO number linkage | ✗ | ✓ |
| Coverage percentage | ✗ | ✓ |

## Migration Path

### Phase 1: Test V4 Alongside V3
```typescript
// Fetch both versions for comparison
const resultV3 = await fetchAlgorithmAuditV3('D-001', 5)
const resultV4 = await fetchAlgorithmAuditV4('D-001', 5)

// Verify V3 fields are identical
assert.deepEqual(resultV3.rows.map(r => r.sales_effective),
                 resultV4.rows.map(r => r.sales_effective))
```

### Phase 2: Gradual Rollout
```typescript
// Feature flag approach
const useV4 = process.env.NEXT_PUBLIC_ALGORITHM_AUDIT_V4 === 'true'

const result = useV4
  ? await fetchAlgorithmAuditV4(sku, shippingWeeks)
  : await fetchAlgorithmAuditV3(sku, shippingWeeks)
```

### Phase 3: Full Replacement
```typescript
// Replace all V3 calls with V4
const result = await fetchAlgorithmAuditV4(sku, shippingWeeks)
```

## Troubleshooting

### Issue: Missing detail records
**Symptom**: `order_details` array is empty despite `actual_order > 0`
**Cause**: `actual_order_date` is null in database
**Solution**: Ensure all POs have `actual_order_date` populated

### Issue: PO number shows "N/A" in deliveries
**Symptom**: `factory_ship_details` shows `po_number: "N/A"`
**Cause**: Nested join data missing in Supabase query
**Solution**: Verify `production_deliveries` are linked to `purchase_order_items`

### Issue: Slow query performance
**Symptom**: Query takes >5 seconds for 16-week window
**Cause**: Missing indexes on date columns
**Solution**: Run index creation SQL:
```sql
CREATE INDEX IF NOT EXISTS idx_purchase_orders_actual_order_date
  ON purchase_orders(actual_order_date);
CREATE INDEX IF NOT EXISTS idx_production_deliveries_actual_delivery_date
  ON production_deliveries(actual_delivery_date);
CREATE INDEX IF NOT EXISTS idx_shipments_actual_departure_date
  ON shipments(actual_departure_date);
CREATE INDEX IF NOT EXISTS idx_shipments_actual_arrival_date
  ON shipments(actual_arrival_date);
```

## Future Enhancements (V4.1+)

1. **Caching Layer**: Redis cache with 5-minute TTL
2. **Predictive Delay Warnings**: ML-based late arrival predictions
3. **Quality Hold Integration**: Track rejected quantities
4. **Supplier Scorecard**: Fulfillment rate by supplier
5. **Multi-Currency Support**: Track actual unit costs
