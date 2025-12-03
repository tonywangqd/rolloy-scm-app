# Rolloy SCM Data Migration Scripts

This directory contains Python scripts for data migration and maintenance tasks.

## Available Scripts

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
