# Rolloy SCM Database - Quick Start Guide

## Option 1: Reset with Clean Test Data (Recommended)

**Use this when:** You want to wipe everything and start fresh with realistic test data.

### Steps:
1. Open [Supabase SQL Editor](https://supabase.com/dashboard)
2. Copy the entire file: `/supabase/seeds/clean_test_data.sql`
3. Paste into SQL Editor and click "Run"
4. Verify the summary at the bottom shows:
   ```
   Products: 5
   Channels: 2
   Warehouses: 3
   Suppliers: 2
   Inventory Snapshots: 7
   Sales Forecasts: 120
   Sales Actuals: 40
   Purchase Orders: 2
   Shipments: 2
   ```

**Done!** Your database now has clean, realistic test data.

---

## Option 2: Import Legacy Excel Data

**Use this when:** You have historical data in Excel spreadsheets.

### Prerequisites:
```bash
pip install pandas openpyxl supabase python-dotenv
```

### Steps:

1. **Prepare your Excel file** with these sheets:
   - Products (required: `sku`, `product_name`, `unit_cost_usd`)
   - Channels (required: `channel_code`, `channel_name`)
   - Warehouses (required: `warehouse_code`, `warehouse_name`, `warehouse_type`, `region`)
   - Suppliers (required: `supplier_code`, `supplier_name`)
   - Sales Forecasts (required: `sku`, `channel_code`, `week_iso`, `week_start_date`, `forecast_qty`)
   - Sales Actuals (required: `sku`, `channel_code`, `week_iso`, `week_start_date`, `actual_qty`)
   - Inventory (required: `sku`, `warehouse_code`, `qty_on_hand`)

2. **Test first (dry-run):**
   ```bash
   python scripts/import_legacy_data.py --file your_data.xlsx --dry-run
   ```

3. **If validation passes, execute:**
   ```bash
   python scripts/import_legacy_data.py --file your_data.xlsx --execute
   ```

4. **Refresh projections in Supabase SQL Editor:**
   ```sql
   SELECT refresh_inventory_projections();
   ```

---

## What You Get with Clean Test Data

### Products (5 SKUs)
- SKU-001: Wireless Earbuds - Black ($25)
- SKU-002: Wireless Earbuds - White ($25)
- SKU-003: Smart Watch - Black ($35)
- SKU-004: Fitness Tracker - Red ($45)
- SKU-005: Bluetooth Speaker - Blue ($30)

### Sales Channels (2)
- AMZ-US: Amazon US Marketplace
- SHOP-US: Shopify US Store

### Warehouses (3)
- FBA-ONT8: Amazon FBA Ontario 8 (West)
- FBA-LGB8: Amazon FBA Long Beach 8 (West)
- 3PL-LA: Third Party Logistics LA (West)

### Data Timeline
- **Past 4 weeks:** Actual sales data
- **Current + 11 weeks:** Sales forecasts
- **Purchase Orders:** 2 POs in different states (Confirmed, In Production)
- **Shipments:** 1 in-transit (sea freight), 1 arrived (air freight)

---

## Common Tasks

### View Inventory Projections
```sql
SELECT * FROM v_inventory_projection_12weeks
WHERE sku = 'SKU-001'
ORDER BY week_offset;
```

### Check Replenishment Suggestions
```sql
SELECT * FROM v_replenishment_suggestions
ORDER BY priority, days_until_deadline;
```

### View Pending Payments
```sql
SELECT * FROM v_pending_payables
ORDER BY payment_month;
```

### Refresh Inventory Projections
```sql
SELECT refresh_inventory_projections();
```

---

## File Locations

| File | Purpose |
|------|---------|
| `/supabase/seeds/clean_test_data.sql` | Complete database reset + test data |
| `/scripts/import_legacy_data.py` | Excel import tool with validation |
| `/scripts/README.md` | Detailed import documentation |
| `/supabase/analysis/database_analysis_report.md` | Full schema analysis |
| `/DATABASE_CLEANUP_SUMMARY.md` | Complete summary report |

---

## Need Help?

1. Read the analysis report: `/supabase/analysis/database_analysis_report.md`
2. Check import guide: `/scripts/README.md`
3. Review project docs: `/CLAUDE.md`

---

**Status:** Ready to use
**Last Updated:** 2025-12-03
