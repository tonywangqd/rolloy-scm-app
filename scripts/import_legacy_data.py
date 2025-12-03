#!/usr/bin/env python3
"""
Rolloy SCM Legacy Data Migration Script
Purpose: Import Excel data into Supabase with data hygiene and validation
Author: Data Scientist
Date: 2025-12-03

Usage:
    python import_legacy_data.py --file legacy_data.xlsx --dry-run
    python import_legacy_data.py --file legacy_data.xlsx --execute

Requirements:
    pip install pandas openpyxl supabase python-dotenv
"""

import pandas as pd
import numpy as np
from supabase import create_client, Client
from datetime import datetime, timedelta
import os
import sys
import argparse
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class DataHygieneError(Exception):
    """Raised when data fails validation checks"""
    pass

class LegacyDataImporter:
    """Handles legacy data import with data hygiene and validation"""

    def __init__(self, dry_run: bool = True):
        self.dry_run = dry_run
        self.supabase: Client = create_client(
            os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
            os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        )
        self.stats = {
            'products': 0,
            'channels': 0,
            'warehouses': 0,
            'suppliers': 0,
            'sales_forecasts': 0,
            'sales_actuals': 0,
            'inventory_snapshots': 0,
            'errors': []
        }

    def log(self, message: str, level: str = "INFO"):
        """Log messages with timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = "[DRY-RUN]" if self.dry_run else "[EXECUTE]"
        print(f"{timestamp} {prefix} [{level}] {message}")

    def clean_dataframe(self, df: pd.DataFrame, sheet_name: str) -> pd.DataFrame:
        """
        Apply data hygiene transformations to DataFrame

        Transformations:
        1. Trim whitespace from all string columns
        2. Remove completely empty rows
        3. Remove duplicate rows
        4. Replace NaN with appropriate defaults
        """
        self.log(f"Cleaning data from sheet: {sheet_name}")

        # Store original row count
        original_rows = len(df)

        # 1. Trim whitespace from string columns
        for col in df.select_dtypes(include=['object']).columns:
            df[col] = df[col].astype(str).str.strip()
            # Replace 'nan' string with actual NaN
            df[col] = df[col].replace('nan', np.nan)

        # 2. Remove completely empty rows
        df = df.dropna(how='all')

        # 3. Remove duplicate rows
        df = df.drop_duplicates()

        cleaned_rows = len(df)
        removed_rows = original_rows - cleaned_rows

        if removed_rows > 0:
            self.log(f"Removed {removed_rows} empty/duplicate rows from {sheet_name}", "WARNING")

        return df

    def validate_enum(self, value: str, allowed_values: List[str], field_name: str) -> str:
        """Validate enum values"""
        if value not in allowed_values:
            raise DataHygieneError(
                f"Invalid {field_name}: '{value}'. Allowed: {allowed_values}"
            )
        return value

    def import_products(self, df: pd.DataFrame) -> int:
        """
        Import products with validation

        Required columns: sku, product_name, unit_cost_usd
        Optional columns: spu, color_code, category, unit_weight_kg, safety_stock_weeks
        """
        self.log("Importing products...")

        # Validate required columns
        required = ['sku', 'product_name', 'unit_cost_usd']
        missing = set(required) - set(df.columns)
        if missing:
            raise DataHygieneError(f"Missing required columns: {missing}")

        # Clean and validate
        df = self.clean_dataframe(df, 'Products')

        success_count = 0
        for idx, row in df.iterrows():
            try:
                # Build product record
                product = {
                    'sku': row['sku'].upper(),  # Normalize to uppercase
                    'spu': row.get('spu', row['sku'][:row['sku'].rfind('-')] if '-' in row['sku'] else row['sku']),
                    'color_code': row.get('color_code', '')[:10],  # Limit to 10 chars
                    'product_name': row['product_name'],
                    'category': row.get('category', None),
                    'unit_cost_usd': float(row['unit_cost_usd']),
                    'unit_weight_kg': float(row['unit_weight_kg']) if pd.notna(row.get('unit_weight_kg')) else None,
                    'safety_stock_weeks': int(row.get('safety_stock_weeks', 2)),
                    'is_active': True
                }

                # Validate ranges
                if product['unit_cost_usd'] <= 0:
                    raise DataHygieneError(f"Invalid unit_cost_usd: {product['unit_cost_usd']}")

                if product['safety_stock_weeks'] < 0 or product['safety_stock_weeks'] > 52:
                    raise DataHygieneError(f"Invalid safety_stock_weeks: {product['safety_stock_weeks']}")

                # Upsert to database
                if not self.dry_run:
                    self.supabase.table('products').upsert(product).execute()

                success_count += 1
                self.log(f"  ✓ {product['sku']}: {product['product_name']}")

            except Exception as e:
                error_msg = f"Row {idx}: {str(e)}"
                self.log(error_msg, "ERROR")
                self.stats['errors'].append(error_msg)

        self.stats['products'] = success_count
        return success_count

    def import_channels(self, df: pd.DataFrame) -> int:
        """Import sales channels"""
        self.log("Importing channels...")

        required = ['channel_code', 'channel_name']
        missing = set(required) - set(df.columns)
        if missing:
            raise DataHygieneError(f"Missing required columns: {missing}")

        df = self.clean_dataframe(df, 'Channels')

        success_count = 0
        for idx, row in df.iterrows():
            try:
                channel = {
                    'channel_code': row['channel_code'].upper(),
                    'channel_name': row['channel_name'],
                    'platform': row.get('platform', None),
                    'region': row.get('region', None),
                    'is_active': bool(row.get('is_active', True))
                }

                if not self.dry_run:
                    self.supabase.table('channels').upsert(channel).execute()

                success_count += 1
                self.log(f"  ✓ {channel['channel_code']}: {channel['channel_name']}")

            except Exception as e:
                error_msg = f"Row {idx}: {str(e)}"
                self.log(error_msg, "ERROR")
                self.stats['errors'].append(error_msg)

        self.stats['channels'] = success_count
        return success_count

    def import_warehouses(self, df: pd.DataFrame) -> int:
        """Import warehouses with type and region validation"""
        self.log("Importing warehouses...")

        required = ['warehouse_code', 'warehouse_name', 'warehouse_type', 'region']
        missing = set(required) - set(df.columns)
        if missing:
            raise DataHygieneError(f"Missing required columns: {missing}")

        df = self.clean_dataframe(df, 'Warehouses')

        success_count = 0
        for idx, row in df.iterrows():
            try:
                warehouse = {
                    'warehouse_code': row['warehouse_code'].upper(),
                    'warehouse_name': row['warehouse_name'],
                    'warehouse_type': self.validate_enum(
                        row['warehouse_type'], ['FBA', '3PL'], 'warehouse_type'
                    ),
                    'region': self.validate_enum(
                        row['region'], ['East', 'Central', 'West'], 'region'
                    ),
                    'state': row.get('state', None),
                    'postal_code': row.get('postal_code', None),
                    'is_active': bool(row.get('is_active', True))
                }

                if not self.dry_run:
                    self.supabase.table('warehouses').upsert(warehouse).execute()

                success_count += 1
                self.log(f"  ✓ {warehouse['warehouse_code']}: {warehouse['warehouse_name']}")

            except Exception as e:
                error_msg = f"Row {idx}: {str(e)}"
                self.log(error_msg, "ERROR")
                self.stats['errors'].append(error_msg)

        self.stats['warehouses'] = success_count
        return success_count

    def import_suppliers(self, df: pd.DataFrame) -> int:
        """Import supplier master data"""
        self.log("Importing suppliers...")

        required = ['supplier_code', 'supplier_name']
        missing = set(required) - set(df.columns)
        if missing:
            raise DataHygieneError(f"Missing required columns: {missing}")

        df = self.clean_dataframe(df, 'Suppliers')

        success_count = 0
        for idx, row in df.iterrows():
            try:
                supplier = {
                    'supplier_code': row['supplier_code'].upper(),
                    'supplier_name': row['supplier_name'],
                    'contact_name': row.get('contact_name', None),
                    'contact_email': row.get('contact_email', None),
                    'contact_phone': row.get('contact_phone', None),
                    'address': row.get('address', None),
                    'payment_terms_days': int(row.get('payment_terms_days', 60)),
                    'is_active': bool(row.get('is_active', True))
                }

                if not self.dry_run:
                    self.supabase.table('suppliers').upsert(supplier).execute()

                success_count += 1
                self.log(f"  ✓ {supplier['supplier_code']}: {supplier['supplier_name']}")

            except Exception as e:
                error_msg = f"Row {idx}: {str(e)}"
                self.log(error_msg, "ERROR")
                self.stats['errors'].append(error_msg)

        self.stats['suppliers'] = success_count
        return success_count

    def import_sales_forecasts(self, df: pd.DataFrame) -> int:
        """
        Import sales forecasts with date validation

        Required: sku, channel_code, week_iso, week_start_date, week_end_date, forecast_qty
        """
        self.log("Importing sales forecasts...")

        required = ['sku', 'channel_code', 'week_iso', 'week_start_date', 'forecast_qty']
        missing = set(required) - set(df.columns)
        if missing:
            raise DataHygieneError(f"Missing required columns: {missing}")

        df = self.clean_dataframe(df, 'Sales Forecasts')

        # Convert date columns
        df['week_start_date'] = pd.to_datetime(df['week_start_date'], errors='coerce')
        if 'week_end_date' in df.columns:
            df['week_end_date'] = pd.to_datetime(df['week_end_date'], errors='coerce')
        else:
            # Calculate week_end_date as start + 6 days
            df['week_end_date'] = df['week_start_date'] + timedelta(days=6)

        # Validate SKUs exist (if not in dry-run mode)
        if not self.dry_run:
            valid_skus = {p['sku'] for p in self.supabase.table('products').select('sku').execute().data}
            invalid_skus = set(df['sku'].unique()) - valid_skus
            if invalid_skus:
                self.log(f"Warning: Invalid SKUs found: {invalid_skus}", "WARNING")
                df = df[df['sku'].isin(valid_skus)]

        success_count = 0
        for idx, row in df.iterrows():
            try:
                forecast = {
                    'sku': row['sku'].upper(),
                    'channel_code': row['channel_code'].upper(),
                    'week_iso': row['week_iso'],
                    'week_start_date': row['week_start_date'].date().isoformat(),
                    'week_end_date': row['week_end_date'].date().isoformat(),
                    'forecast_qty': int(row['forecast_qty'])
                }

                # Validate forecast quantity
                if forecast['forecast_qty'] < 0:
                    raise DataHygieneError(f"Negative forecast_qty: {forecast['forecast_qty']}")

                if not self.dry_run:
                    self.supabase.table('sales_forecasts').upsert(forecast).execute()

                success_count += 1
                if success_count % 100 == 0:
                    self.log(f"  Processed {success_count} forecast records...")

            except Exception as e:
                error_msg = f"Row {idx}: {str(e)}"
                self.log(error_msg, "ERROR")
                self.stats['errors'].append(error_msg)

        self.stats['sales_forecasts'] = success_count
        return success_count

    def import_sales_actuals(self, df: pd.DataFrame) -> int:
        """Import sales actuals (similar to forecasts)"""
        self.log("Importing sales actuals...")

        required = ['sku', 'channel_code', 'week_iso', 'week_start_date', 'actual_qty']
        missing = set(required) - set(df.columns)
        if missing:
            raise DataHygieneError(f"Missing required columns: {missing}")

        df = self.clean_dataframe(df, 'Sales Actuals')

        # Convert date columns
        df['week_start_date'] = pd.to_datetime(df['week_start_date'], errors='coerce')
        if 'week_end_date' in df.columns:
            df['week_end_date'] = pd.to_datetime(df['week_end_date'], errors='coerce')
        else:
            df['week_end_date'] = df['week_start_date'] + timedelta(days=6)

        success_count = 0
        for idx, row in df.iterrows():
            try:
                actual = {
                    'sku': row['sku'].upper(),
                    'channel_code': row['channel_code'].upper(),
                    'week_iso': row['week_iso'],
                    'week_start_date': row['week_start_date'].date().isoformat(),
                    'week_end_date': row['week_end_date'].date().isoformat(),
                    'actual_qty': int(row['actual_qty'])
                }

                if actual['actual_qty'] < 0:
                    raise DataHygieneError(f"Negative actual_qty: {actual['actual_qty']}")

                if not self.dry_run:
                    self.supabase.table('sales_actuals').upsert(actual).execute()

                success_count += 1
                if success_count % 100 == 0:
                    self.log(f"  Processed {success_count} actual records...")

            except Exception as e:
                error_msg = f"Row {idx}: {str(e)}"
                self.log(error_msg, "ERROR")
                self.stats['errors'].append(error_msg)

        self.stats['sales_actuals'] = success_count
        return success_count

    def import_inventory_snapshots(self, df: pd.DataFrame) -> int:
        """Import current inventory levels"""
        self.log("Importing inventory snapshots...")

        required = ['sku', 'warehouse_code', 'qty_on_hand']
        missing = set(required) - set(df.columns)
        if missing:
            raise DataHygieneError(f"Missing required columns: {missing}")

        df = self.clean_dataframe(df, 'Inventory Snapshots')

        # Get warehouse ID mapping
        if not self.dry_run:
            warehouses = {w['warehouse_code']: w['id'] for w in
                         self.supabase.table('warehouses').select('id, warehouse_code').execute().data}

        success_count = 0
        for idx, row in df.iterrows():
            try:
                warehouse_code = row['warehouse_code'].upper()

                if not self.dry_run:
                    if warehouse_code not in warehouses:
                        raise DataHygieneError(f"Unknown warehouse: {warehouse_code}")

                    inventory = {
                        'sku': row['sku'].upper(),
                        'warehouse_id': warehouses[warehouse_code],
                        'qty_on_hand': int(row['qty_on_hand']),
                        'last_counted_at': datetime.now().isoformat() if pd.isna(row.get('last_counted_at')) else row['last_counted_at']
                    }

                    if inventory['qty_on_hand'] < 0:
                        raise DataHygieneError(f"Negative qty_on_hand: {inventory['qty_on_hand']}")

                    self.supabase.table('inventory_snapshots').upsert(inventory).execute()

                success_count += 1
                self.log(f"  ✓ {row['sku']} @ {warehouse_code}: {row['qty_on_hand']} units")

            except Exception as e:
                error_msg = f"Row {idx}: {str(e)}"
                self.log(error_msg, "ERROR")
                self.stats['errors'].append(error_msg)

        self.stats['inventory_snapshots'] = success_count
        return success_count

    def print_summary(self):
        """Print import summary statistics"""
        print("\n" + "="*60)
        print("IMPORT SUMMARY")
        print("="*60)
        print(f"Products:           {self.stats['products']:>6}")
        print(f"Channels:           {self.stats['channels']:>6}")
        print(f"Warehouses:         {self.stats['warehouses']:>6}")
        print(f"Suppliers:          {self.stats['suppliers']:>6}")
        print(f"Sales Forecasts:    {self.stats['sales_forecasts']:>6}")
        print(f"Sales Actuals:      {self.stats['sales_actuals']:>6}")
        print(f"Inventory Snapshots:{self.stats['inventory_snapshots']:>6}")
        print(f"Errors:             {len(self.stats['errors']):>6}")
        print("="*60)

        if self.stats['errors']:
            print("\nERRORS:")
            for error in self.stats['errors'][:10]:  # Show first 10 errors
                print(f"  - {error}")
            if len(self.stats['errors']) > 10:
                print(f"  ... and {len(self.stats['errors']) - 10} more errors")


def main():
    parser = argparse.ArgumentParser(
        description="Import legacy Excel data into Rolloy SCM Supabase database"
    )
    parser.add_argument(
        '--file',
        required=True,
        help='Path to Excel file containing legacy data'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=True,
        help='Run validation only without inserting data (default: True)'
    )
    parser.add_argument(
        '--execute',
        action='store_true',
        help='Actually insert data into database'
    )

    args = parser.parse_args()

    # Validate file exists
    if not os.path.exists(args.file):
        print(f"ERROR: File not found: {args.file}")
        sys.exit(1)

    # Determine if dry-run
    dry_run = not args.execute

    if dry_run:
        print("\n⚠️  DRY-RUN MODE: No data will be inserted into database")
        print("    Use --execute flag to actually insert data\n")
    else:
        print("\n⚡ EXECUTE MODE: Data will be inserted into database")
        confirm = input("Are you sure? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Aborted.")
            sys.exit(0)

    # Initialize importer
    importer = LegacyDataImporter(dry_run=dry_run)

    try:
        # Read Excel file
        excel_file = pd.ExcelFile(args.file)
        print(f"Found sheets: {excel_file.sheet_names}\n")

        # Import data in dependency order
        if 'Products' in excel_file.sheet_names:
            df = pd.read_excel(excel_file, 'Products')
            importer.import_products(df)

        if 'Channels' in excel_file.sheet_names:
            df = pd.read_excel(excel_file, 'Channels')
            importer.import_channels(df)

        if 'Warehouses' in excel_file.sheet_names:
            df = pd.read_excel(excel_file, 'Warehouses')
            importer.import_warehouses(df)

        if 'Suppliers' in excel_file.sheet_names:
            df = pd.read_excel(excel_file, 'Suppliers')
            importer.import_suppliers(df)

        if 'Sales Forecasts' in excel_file.sheet_names or 'Forecasts' in excel_file.sheet_names:
            sheet_name = 'Sales Forecasts' if 'Sales Forecasts' in excel_file.sheet_names else 'Forecasts'
            df = pd.read_excel(excel_file, sheet_name)
            importer.import_sales_forecasts(df)

        if 'Sales Actuals' in excel_file.sheet_names or 'Actuals' in excel_file.sheet_names:
            sheet_name = 'Sales Actuals' if 'Sales Actuals' in excel_file.sheet_names else 'Actuals'
            df = pd.read_excel(excel_file, sheet_name)
            importer.import_sales_actuals(df)

        if 'Inventory' in excel_file.sheet_names:
            df = pd.read_excel(excel_file, 'Inventory')
            importer.import_inventory_snapshots(df)

        # Print summary
        importer.print_summary()

        if dry_run:
            print("\n✓ Dry-run complete. Use --execute to import data.")
        else:
            print("\n✓ Import complete!")
            print("\nNext steps:")
            print("  1. Run inventory projection refresh in Supabase SQL Editor:")
            print("     SELECT refresh_inventory_projections();")
            print("  2. Verify data in your application")

    except Exception as e:
        print(f"\n❌ FATAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
