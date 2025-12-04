# Rolloy SCM Scripts

This directory contains scripts for data migration, database analysis, and maintenance tasks.

## Available Scripts

### TypeScript Analysis Scripts (New)

#### 1. `analyze-database.ts` - Complete Database Analysis
**Purpose:** Generate comprehensive database analysis report with data counts, sample data, and relationship analysis.

**Usage:**
```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
npx tsx scripts/analyze-database.ts
```

**Output:** Console report with all tables' statistics, sample data (first 5 rows), and relationship summaries.

#### 2. `query-master-data.ts` - Quick Master Data Reference
**Purpose:** Fast lookup of master data (products, warehouses, channels, suppliers).

**Usage:**
```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
npx tsx scripts/query-master-data.ts
```

**Output:** Formatted tables showing all SKUs, warehouses (top 20), channels, and suppliers.

#### 3. `verify-data-relationships.ts` - Data Integrity Verification
**Purpose:** Validate all foreign key relationships and data coverage.

**Usage:**
```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
npx tsx scripts/verify-data-relationships.ts
```

**Output:** PASS/FAIL/WARNING status for 16 data integrity checks.

**See detailed documentation at the end of this file.**

---

### Python Data Import Scripts

### 1. `import_legacy_data.py` - Legacy Excel Data Importer

**Purpose:** Import historical data from Excel spreadsheets into Supabase with comprehensive data hygiene and validation.

**Features:**
- ✅ Data cleaning (trim whitespace, remove duplicates)
- ✅ Referential integrity validation
- ✅ Enum validation for warehouse types, regions, etc.
- ✅ Dry-run mode for safe testing
- ✅ Detailed error reporting
- ✅ Idempotent upsert operations

**Requirements:**
```bash
pip install pandas openpyxl supabase python-dotenv
```

**Usage:**

```bash
# Dry-run mode (validate only, no data inserted)
python scripts/import_legacy_data.py --file path/to/legacy_data.xlsx --dry-run

# Execute mode (actually insert data)
python scripts/import_legacy_data.py --file path/to/legacy_data.xlsx --execute
```

**Excel File Format:**

Your Excel file should contain the following sheets:

| Sheet Name | Required Columns |
|------------|------------------|
| Products | `sku`, `product_name`, `unit_cost_usd` |
| Channels | `channel_code`, `channel_name` |
| Warehouses | `warehouse_code`, `warehouse_name`, `warehouse_type`, `region` |
| Suppliers | `supplier_code`, `supplier_name` |
| Sales Forecasts | `sku`, `channel_code`, `week_iso`, `week_start_date`, `forecast_qty` |
| Sales Actuals | `sku`, `channel_code`, `week_iso`, `week_start_date`, `actual_qty` |
| Inventory | `sku`, `warehouse_code`, `qty_on_hand` |

**Example Excel Template:**

**Products Sheet:**
```
sku       | product_name           | unit_cost_usd | safety_stock_weeks
SKU-001   | Wireless Earbuds       | 25.00         | 2
SKU-002   | Smart Watch            | 35.00         | 3
```

**Sales Forecasts Sheet:**
```
sku       | channel_code | week_iso  | week_start_date | forecast_qty
SKU-001   | AMZ-US       | 2025-W10  | 2025-03-03      | 150
SKU-001   | SHOP-US      | 2025-W10  | 2025-03-03      | 75
```

---

## Environment Setup

Create a `.env` file in the project root with your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## Common Import Patterns

### Pattern 1: Initial System Setup

```bash
# Step 1: Clean database (run SQL script in Supabase)
# Run: supabase/seeds/clean_test_data.sql

# Step 2: Import legacy master data
python scripts/import_legacy_data.py --file legacy_master_data.xlsx --execute

# Step 3: Import historical sales data
python scripts/import_legacy_data.py --file legacy_sales_data.xlsx --execute

# Step 4: Refresh projections (run in Supabase SQL Editor)
# Run: SELECT refresh_inventory_projections();
```

### Pattern 2: Weekly Sales Update

```bash
# Import latest actuals only
python scripts/import_legacy_data.py --file weekly_actuals.xlsx --execute

# The script will upsert, so it's safe to re-run
```

### Pattern 3: Inventory Sync

```bash
# Import current stock levels
python scripts/import_legacy_data.py --file current_inventory.xlsx --execute
```

---

## Data Hygiene Best Practices

The import script automatically applies these transformations:

1. **Whitespace Trimming:** Removes leading/trailing spaces from all text fields
2. **Duplicate Removal:** Drops exact duplicate rows
3. **Empty Row Removal:** Drops rows where all values are null
4. **Enum Validation:** Validates warehouse types, regions, PO statuses, etc.
5. **Referential Integrity:** Checks that SKUs, channel codes, and warehouse codes exist before inserting transactional data

---

## Troubleshooting

### Error: "Missing required columns"

**Cause:** Excel sheet is missing required columns.

**Solution:** Ensure your Excel file has all required columns as listed in the table above. Column names are case-sensitive.

### Error: "Invalid SKU"

**Cause:** Sales forecasts/actuals reference SKUs that don't exist in the `products` table.

**Solution:** Import products first, then import sales data.

### Error: "Invalid warehouse_code"

**Cause:** Inventory snapshots reference warehouses that don't exist.

**Solution:** Import warehouses first, then import inventory data.

### Error: "Invalid enum value"

**Cause:** Data contains values not in the allowed enum list.

**Examples:**
- `warehouse_type` must be 'FBA' or '3PL'
- `region` must be 'East', 'Central', or 'West'

**Solution:** Fix the Excel file to use valid enum values.

---

## Advanced Usage

### Custom Date Ranges

If your Excel file has date columns in different formats, the script will attempt to parse them automatically. Supported formats:

- ISO 8601: `2025-03-03`
- US format: `03/03/2025`
- Excel date serial numbers

### Partial Imports

You can omit sheets from your Excel file if you don't need to import that data type. For example, if you only want to import sales forecasts:

```bash
# Excel file with only "Sales Forecasts" sheet
python scripts/import_legacy_data.py --file forecasts_only.xlsx --execute
```

---

## Performance Notes

- The script uses **upsert** operations (`ON CONFLICT ... DO UPDATE`), so it's safe to run multiple times
- For large datasets (>10,000 rows), the script logs progress every 100 records
- Typical performance: ~1000 records/second on standard Supabase tier

---

## Support

For issues or questions:
1. Check the analysis report: `/supabase/analysis/database_analysis_report.md`
2. Review the clean test data script: `/supabase/seeds/clean_test_data.sql`
3. Consult the project documentation: `/CLAUDE.md`

---

## TypeScript Analysis Scripts - Detailed Documentation

### Overview

The TypeScript scripts provide real-time database analysis and validation without modifying any data. They are safe to run on production databases.

### Prerequisites

```bash
# All scripts use @supabase/supabase-js which is already installed
# TypeScript execution is handled by tsx (auto-installed via npx)
```

### Environment Variables

All scripts require:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Option 1:** Export before running
```bash
export NEXT_PUBLIC_SUPABASE_URL="https://mliqjmoylepdwokzjfwe.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your-key"
npx tsx scripts/analyze-database.ts
```

**Option 2:** Inline environment variables
```bash
NEXT_PUBLIC_SUPABASE_URL="your-url" NEXT_PUBLIC_SUPABASE_ANON_KEY="your-key" npx tsx scripts/analyze-database.ts
```

### Script Details

#### `analyze-database.ts`

**What it does:**
- Queries all 12 core tables (products, warehouses, channels, suppliers, purchase_orders, etc.)
- Shows row counts for each table
- Displays first 5 rows of sample data
- Calculates business metrics (average items per PO, forecast coverage, etc.)

**When to use:**
- Initial database setup verification
- After bulk data imports
- Monthly database health checks
- Troubleshooting data issues

**Performance:** ~10-30 seconds for full analysis

**Save report to file:**
```bash
npx tsx scripts/analyze-database.ts > reports/db-analysis-$(date +%Y%m%d).txt
```

#### `query-master-data.ts`

**What it does:**
- Lists all 9 products/SKUs with details (SPU, color, cost, lead time)
- Shows first 20 warehouses (from 83 total)
- Lists all 4 sales channels
- Lists all 3 suppliers

**When to use:**
- Quick reference lookup
- Before creating new POs (to check available SKUs)
- Before setting up sales forecasts (to check valid channels)
- Daily operations

**Performance:** ~2-5 seconds

**Example output:**
```
SKU        | SPU   | Color | Product Name                | Cost   | Safe Stock | Lead Time | Active
--------------------------------------------------------------------------------------------------------------
W1RD       | W1    | RD    | W1 Smartwatch - Red         |    $35 |        2wk |       5wk | ✓
W1BK       | W1    | BK    | W1 Smartwatch - Black       |    $35 |        2wk |       5wk | ✓
...
```

#### `verify-data-relationships.ts`

**What it does:**
- Validates 16 data integrity checks
- Checks foreign key relationships (e.g., PO Items → Products)
- Detects orphaned records (e.g., PO items without valid POs)
- Calculates data coverage (e.g., % of SKUs with inventory data)

**Verification Categories:**
1. **Referential Integrity (10 checks):**
   - PO → Supplier
   - PO Items → PO
   - PO Items → SKU
   - Deliveries → PO Items
   - Shipments → Warehouses
   - Shipment Items → Shipments
   - Shipment Items → SKU
   - Forecasts → SKU & Channels
   - Actuals → SKU & Channels
   - Inventory → SKU & Warehouses

2. **Coverage Checks (3 checks):**
   - Inventory Coverage: % of SKUs with inventory data
   - Forecast Coverage: % of SKUs with forecast data
   - Delivery Coverage: % of PO items with delivery records

**Result Types:**
- `✓ PASS`: All checks passed
- `✗ FAIL`: Data integrity violation detected (critical)
- `⚠ WARN`: Data incomplete but not broken (low priority)

**When to use:**
- After data imports to verify integrity
- Before generating reports (ensure data quality)
- Troubleshooting "missing data" issues
- Monthly data quality audits

**Performance:** ~15-45 seconds (depends on data volume)

### Common Workflows

#### Workflow 1: Initial Setup Verification
```bash
# Step 1: Verify master data exists
npx tsx scripts/query-master-data.ts

# Step 2: Check relationships
npx tsx scripts/verify-data-relationships.ts

# Step 3: Generate full report
npx tsx scripts/analyze-database.ts > initial-setup-report.txt
```

#### Workflow 2: After Data Import
```bash
# Immediately verify integrity
npx tsx scripts/verify-data-relationships.ts

# If any FAIL results, investigate with:
npx tsx scripts/analyze-database.ts
```

#### Workflow 3: Daily Operations
```bash
# Quick lookup (fast)
npx tsx scripts/query-master-data.ts

# Full analysis (slower, run weekly)
npx tsx scripts/analyze-database.ts
```

#### Workflow 4: Troubleshooting
```bash
# Generate debug report
npx tsx scripts/analyze-database.ts > debug-$(date +%Y%m%d-%H%M).txt
npx tsx scripts/verify-data-relationships.ts >> debug-$(date +%Y%m%d-%H%M).txt
```

### Current Database Status (2025-12-04)

Based on latest analysis:

**Master Data:**
- Products: 9 SKUs (W1/W2 series + SKU-001 to SKU-005)
- Warehouses: 83 locations (FBA + 3PL)
- Channels: 4 (AMZ-US, SHOP-US, SPF-US, WMT-US)
- Suppliers: 3 suppliers

**Transactional Data:**
- Purchase Orders: 2 POs
- PO Items: 5 line items
- Production Deliveries: 1 delivery record
- Shipments: 2 shipments
- Shipment Items: 4 line items

**Sales Data:**
- Forecasts: 120 records (12 weeks × 5 SKUs × 2 channels)
- Actuals: 40 records (4 weeks × 5 SKUs × 2 channels)

**Inventory:**
- Snapshots: 7 records covering 5/9 SKUs

**Data Quality:**
- ✓ All referential integrity checks: PASSED
- ⚠ Inventory coverage: 55.6% (needs improvement)
- ⚠ Forecast coverage: 55.6% (W1/W2 series missing)
- ⚠ Delivery coverage: 20% (only 1/5 PO items delivered)

**See full report:** `/Users/tony/Desktop/rolloy-scm/docs/database-status-report.md`

### FAQ

**Q: Scripts are slow, how to speed up?**
A:
- Use `query-master-data.ts` for quick lookups (fastest)
- Reduce sample size: edit `limit(5)` to `limit(1)` in analyze-database.ts
- Use `head` to limit output: `npx tsx script.ts | head -100`

**Q: "supabaseUrl is required" error?**
A: Ensure environment variables are set. Check with `echo $NEXT_PUBLIC_SUPABASE_URL`

**Q: Can I run these on production?**
A: Yes! All scripts are read-only and use the anon_key. They will not modify data.

**Q: How to schedule automatic reports?**
A: Use cron (Linux/Mac) or Task Scheduler (Windows):
```bash
# crontab -e
0 0 * * 0 cd /path/to/rolloy-scm && npx tsx scripts/analyze-database.ts > reports/weekly-$(date +\%Y\%m\%d).txt
```

**Q: WARNING results - do I need to fix them?**
A: Warnings indicate incomplete data (e.g., some SKUs lack inventory). Fix only if needed for your business logic.

---

**Last Updated:** 2025-12-04
**Maintained by:** Backend Specialist
