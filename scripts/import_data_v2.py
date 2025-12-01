#!/usr/bin/env python3
"""
Rolloy SCM - Excel Data Import Script V2
Import data from 供应链计划表(Sample).xlsx to Supabase
Fixed version with correct table names and channel codes
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta
import pandas as pd

# Supabase connection settings
SUPABASE_URL = "https://mliqjmoylepdwokzjfwe.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saXFqbW95bGVwZHdva3pqZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NjgyNzIsImV4cCI6MjA4MDA0NDI3Mn0.bJWzEzDu0HSibbGjxeVF20j6ry3cKyQAsfyF3d7Ays8"

EXCEL_FILE = '/Users/tony/Downloads/供应链计划表(Sample).xlsx'

# Channel code mapping (Excel -> Database)
CHANNEL_MAP = {
    'Amazon-US': 'AMZ-US',
    'Shopify-US': 'SPF-US',
    '官网': 'SPF-US',
    'Walmart-US': 'WMT-US',
    '亚马逊': 'AMZ-US',
}

def get_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

def api_request(method, table, data=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = get_headers()

    try:
        if method == 'GET':
            resp = requests.get(url, headers=headers, params=params, timeout=30)
        elif method == 'POST':
            headers['Prefer'] = 'return=representation,resolution=merge-duplicates'
            resp = requests.post(url, headers=headers, json=data, timeout=30)
        elif method == 'UPSERT':
            headers['Prefer'] = 'return=representation,resolution=merge-duplicates'
            resp = requests.post(url, headers=headers, json=data, timeout=30)

        if resp.status_code in [200, 201]:
            return resp.json() if resp.text else []
        elif resp.status_code == 409:
            # Duplicate - that's OK
            return []
        else:
            print(f"  ! API Error: {resp.status_code} - {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"  ! Request Error: {e}")
        return None

def parse_date(date_val):
    if pd.isna(date_val):
        return None
    if isinstance(date_val, pd.Timestamp):
        return date_val.strftime('%Y-%m-%d')
    if isinstance(date_val, datetime):
        return date_val.strftime('%Y-%m-%d')
    if isinstance(date_val, str):
        for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y-%m-%d %H:%M:%S']:
            try:
                return datetime.strptime(date_val.strip(), fmt).strftime('%Y-%m-%d')
            except:
                pass
    return None

def date_to_week_info(date_str):
    """Convert date to week info (week_iso, week_start, week_end)"""
    if pd.isna(date_str):
        return None, None, None
    if isinstance(date_str, str):
        date_obj = pd.to_datetime(date_str)
    else:
        date_obj = date_str

    iso_cal = date_obj.isocalendar()
    week_iso = f"{iso_cal.year}-W{iso_cal.week:02d}"

    # Calculate week start (Monday) and end (Sunday)
    week_start = date_obj - timedelta(days=date_obj.weekday())
    week_end = week_start + timedelta(days=6)

    return week_iso, week_start.strftime('%Y-%m-%d'), week_end.strftime('%Y-%m-%d')

def get_region_from_chinese(region_str):
    if pd.isna(region_str):
        return 'Central'
    region_map = {'东部': 'East', '中部': 'Central', '西部': 'West'}
    return region_map.get(str(region_str).strip(), 'Central')

def get_all_records(table):
    return api_request('GET', table, params={'select': '*'})

def import_sales_forecasts(xlsx: pd.ExcelFile):
    """Import weekly sales forecasts to sales_forecasts table"""
    print("\n=== Importing Sales Forecasts ===")

    df = pd.read_excel(xlsx, sheet_name='01 周度目标销量表')

    # Column mapping: column name -> (SKU, DB channel_code)
    sku_channel_cols = {
        'A2RD亚马逊': ('A2RD', 'AMZ-US'),
        'A2BK亚马逊': ('A2BK', 'AMZ-US'),
        'A5RD亚马逊': ('A5RD', 'AMZ-US'),
        'A5BK亚马逊': ('A5BK', 'AMZ-US'),
        'W1RD亚马逊': ('W1RD', 'AMZ-US'),
        'W1BK亚马逊': ('W1BK', 'AMZ-US'),
        'A2RD官网': ('A2RD', 'SPF-US'),
        'A2BK官网': ('A2BK', 'SPF-US'),
        'A5RD官网': ('A5RD', 'SPF-US'),
        'A5BK官网': ('A5BK', 'SPF-US'),
        'W1RD官网': ('W1RD', 'SPF-US'),
        'W1BK官网': ('W1BK', 'SPF-US'),
    }

    records = []
    for _, row in df.iterrows():
        week_start_raw = row.get('周初')
        week_end_raw = row.get('周末')

        if pd.isna(week_start_raw):
            continue

        week_iso, week_start, week_end = date_to_week_info(week_start_raw)
        if not week_iso:
            continue

        # Use the actual dates from Excel if available
        if pd.notna(week_end_raw):
            week_end = parse_date(week_end_raw)
        week_start = parse_date(week_start_raw)

        for col, (sku, channel) in sku_channel_cols.items():
            if col in df.columns:
                qty = row.get(col)
                if pd.notna(qty) and qty > 0:
                    records.append({
                        'sku': sku,
                        'channel_code': channel,
                        'week_iso': week_iso,
                        'week_start_date': week_start,
                        'week_end_date': week_end,
                        'forecast_qty': int(qty)
                    })

    print(f"Inserting {len(records)} forecast records...")
    success = 0
    for rec in records:
        result = api_request('POST', 'sales_forecasts', rec)
        if result is not None:
            success += 1

    print(f"Sales forecasts import complete! ({success}/{len(records)} records)")

def import_sales_actuals(xlsx: pd.ExcelFile):
    """Import weekly sales actuals to sales_actuals table"""
    print("\n=== Importing Sales Actuals ===")

    df = pd.read_excel(xlsx, sheet_name='05 周度实际销量表')

    sku_channel_cols = {
        'A2RD亚马逊': ('A2RD', 'AMZ-US'),
        'A2BK亚马逊': ('A2BK', 'AMZ-US'),
        'A5RD亚马逊': ('A5RD', 'AMZ-US'),
        'A5BK亚马逊': ('A5BK', 'AMZ-US'),
        'W1RD亚马逊': ('W1RD', 'AMZ-US'),
        'W1BK亚马逊': ('W1BK', 'AMZ-US'),
        'A2RD官网': ('A2RD', 'SPF-US'),
        'A2BK官网': ('A2BK', 'SPF-US'),
        'A5RD官网': ('A5RD', 'SPF-US'),
        'A5BK官网': ('A5BK', 'SPF-US'),
        'W1RD官网': ('W1RD', 'SPF-US'),
        'W1BK官网': ('W1BK', 'SPF-US'),
    }

    records = []
    for _, row in df.iterrows():
        week_start_raw = row.get('周初')
        week_end_raw = row.get('周末')

        if pd.isna(week_start_raw):
            continue

        week_iso, week_start, week_end = date_to_week_info(week_start_raw)
        if not week_iso:
            continue

        if pd.notna(week_end_raw):
            week_end = parse_date(week_end_raw)
        week_start = parse_date(week_start_raw)

        for col, (sku, channel) in sku_channel_cols.items():
            if col in df.columns:
                qty = row.get(col)
                if pd.notna(qty) and qty > 0:
                    records.append({
                        'sku': sku,
                        'channel_code': channel,
                        'week_iso': week_iso,
                        'week_start_date': week_start,
                        'week_end_date': week_end,
                        'actual_qty': int(qty)
                    })

    print(f"Inserting {len(records)} actual records...")
    success = 0
    for rec in records:
        result = api_request('POST', 'sales_actuals', rec)
        if result is not None:
            success += 1

    print(f"Sales actuals import complete! ({success}/{len(records)} records)")

def import_purchase_orders(xlsx: pd.ExcelFile):
    """Import purchase orders from procurement and delivery data"""
    print("\n=== Importing Purchase Orders & Deliveries ===")

    df_orders = pd.read_excel(xlsx, sheet_name='02 采购下单数据表')
    df_deliveries = pd.read_excel(xlsx, sheet_name='03 生产交付数据表')

    # Get supplier ID
    suppliers = get_all_records('suppliers')
    supplier_id = None
    if suppliers:
        for s in suppliers:
            if s.get('supplier_code') == 'SUP001':
                supplier_id = s.get('id')
                break

    # SKU columns mapping (Excel col -> (SKU, DB channel_code))
    sku_cols = {
        'A2RD 亚马逊': ('A2RD', 'AMZ-US'),
        'A2BK 亚马逊': ('A2BK', 'AMZ-US'),
        'A5RD 亚马逊': ('A5RD', 'AMZ-US'),
        'A5BK 亚马逊': ('A5BK', 'AMZ-US'),
        'W1RD 亚马逊': ('W1RD', 'AMZ-US'),
        'W1BK 亚马逊': ('W1BK', 'AMZ-US'),
        'A2RD 官网': ('A2RD', 'SPF-US'),
        'A2BK 官网': ('A2BK', 'SPF-US'),
        'A5RD 官网': ('A5RD', 'SPF-US'),
        'A5BK 官网': ('A5BK', 'SPF-US'),
        'W1RD 官网': ('W1RD', 'SPF-US'),
        'W1BK 官网': ('W1BK', 'SPF-US'),
    }

    # Get existing POs
    existing_pos = get_all_records('purchase_orders') or []
    existing_po_numbers = {po['po_number'] for po in existing_pos}
    po_id_map = {po['batch_code']: po['id'] for po in existing_pos if po.get('batch_code')}

    # Create unique batch list
    batches = df_orders['下单批次'].dropna().unique()
    po_item_map = {}

    print(f"\nProcessing {len(batches)} purchase order batches...")

    for batch in batches:
        batch_code = str(batch).strip()
        batch_rows = df_orders[df_orders['下单批次'] == batch]

        # Get first order date
        order_date = None
        ship_date = None
        for _, row in batch_rows.iterrows():
            if pd.notna(row.get('下单日期')):
                order_date = parse_date(row['下单日期'])
            if pd.notna(row.get('预计出货日期')):
                ship_date = parse_date(row['预计出货日期'])
            if order_date:
                break

        po_number = f"PO-{batch_code[:30]}"

        # Skip if already exists
        if batch_code in po_id_map:
            po_id = po_id_map[batch_code]
            print(f"  - PO exists: {po_number}")
        else:
            po = {
                'po_number': po_number,
                'batch_code': batch_code,
                'supplier_id': supplier_id,
                'po_status': 'Delivered',
                'actual_order_date': order_date,
                'planned_ship_date': ship_date
            }

            result = api_request('POST', 'purchase_orders', po)
            if result and len(result) > 0:
                po_id = result[0].get('id')
                po_id_map[batch_code] = po_id
                print(f"  - PO created: {po_number}")
            else:
                continue

        # Aggregate items by SKU
        items_agg = {}
        for _, row in batch_rows.iterrows():
            for col, (sku, channel) in sku_cols.items():
                if col in df_orders.columns:
                    qty = row.get(col)
                    if pd.notna(qty) and qty > 0:
                        key = (sku, channel)
                        if key not in items_agg:
                            items_agg[key] = 0
                        items_agg[key] += int(qty)

        # Insert PO items
        for (sku, channel), qty in items_agg.items():
            price = 50 if sku.startswith(('A2', 'A5')) else 35
            po_item = {
                'po_id': po_id,
                'sku': sku,
                'channel_code': channel,
                'ordered_qty': qty,
                'delivered_qty': 0,
                'unit_price_usd': price
            }
            item_result = api_request('POST', 'purchase_order_items', po_item)
            if item_result and len(item_result) > 0:
                key = (po_id, sku, channel)
                po_item_map[key] = item_result[0].get('id')

    # Import Deliveries
    print(f"\n=== Importing Production Deliveries ===")

    delivery_sku_cols = {
        '亚马逊-A2RD': ('A2RD', 'AMZ-US'),
        '亚马逊-A2BK': ('A2BK', 'AMZ-US'),
        '亚马逊-A5RD': ('A5RD', 'AMZ-US'),
        '亚马逊-A5BK': ('A5BK', 'AMZ-US'),
        'W1RD 亚马逊': ('W1RD', 'AMZ-US'),
        'W1BK 亚马逊': ('W1BK', 'AMZ-US'),
        '官网-A2RD': ('A2RD', 'SPF-US'),
        '官网-A2BK': ('A2BK', 'SPF-US'),
        '官网-A5RD': ('A5RD', 'SPF-US'),
        '官网-A5BK': ('A5BK', 'SPF-US'),
        '官网 W1RD': ('W1RD', 'SPF-US'),
        '官网 W1BK': ('W1BK', 'SPF-US'),
    }

    delivery_count = 0
    for idx, row in df_deliveries.iterrows():
        batch_code = str(row['下单批次']).strip()
        delivery_date = parse_date(row.get('实际交付日期'))
        unit_price = row.get('交付单价', 50)
        if pd.isna(unit_price):
            unit_price = 50

        po_id = po_id_map.get(batch_code)
        if not po_id:
            continue

        for col, (sku, channel) in delivery_sku_cols.items():
            if col in df_deliveries.columns:
                qty = row.get(col)
                if pd.notna(qty) and qty > 0:
                    key = (po_id, sku, channel)
                    po_item_id = po_item_map.get(key)

                    if not po_item_id:
                        # Create PO item
                        price = 50 if sku.startswith(('A2', 'A5')) else 35
                        po_item = {
                            'po_id': po_id,
                            'sku': sku,
                            'channel_code': channel,
                            'ordered_qty': int(qty),
                            'delivered_qty': 0,
                            'unit_price_usd': price
                        }
                        item_result = api_request('POST', 'purchase_order_items', po_item)
                        if item_result and len(item_result) > 0:
                            po_item_id = item_result[0].get('id')
                            po_item_map[key] = po_item_id

                    if po_item_id:
                        delivery_number = f"DEL-{idx:04d}-{sku}"
                        remarks = row.get('备注')
                        delivery = {
                            'delivery_number': delivery_number,
                            'po_item_id': po_item_id,
                            'sku': sku,
                            'channel_code': channel,
                            'delivered_qty': int(qty),
                            'actual_delivery_date': delivery_date,
                            'unit_cost_usd': float(unit_price),
                            'payment_status': 'Pending',
                            'remarks': str(remarks) if pd.notna(remarks) else None
                        }
                        result = api_request('POST', 'production_deliveries', delivery)
                        if result is not None:
                            delivery_count += 1

    print(f"Production deliveries import complete! ({delivery_count} records)")

def import_shipments(xlsx: pd.ExcelFile):
    """Import shipment/logistics data"""
    print("\n=== Importing Shipments ===")

    df = pd.read_excel(xlsx, sheet_name='04 物流数据表')

    # Get warehouse ID map
    warehouses = get_all_records('warehouses') or []
    warehouse_map = {w['warehouse_code']: w['id'] for w in warehouses}

    sku_cols = {
        'A2RD亚马逊': 'A2RD',
        'A2BK亚马逊': 'A2BK',
        'A5RD亚马逊': 'A5RD',
        'A5BK亚马逊': 'A5BK',
        'W1RD 亚马逊': 'W1RD',
        'W1BK 亚马逊': 'W1BK',
        'A2RD官网': 'A2RD',
        'A2BK官网': 'A2BK',
        'A5RD官网': 'A5RD',
        'A5BK官网': 'A5BK',
        'W1RD 官网': 'W1RD',
        'W1BK 官网': 'W1BK',
    }

    shipment_count = 0
    for idx, row in df.iterrows():
        tracking = str(row['单号']).strip()
        warehouse_code = str(row['仓库']).strip()

        warehouse_id = warehouse_map.get(warehouse_code)
        if not warehouse_id:
            print(f"  ! Warehouse not found: {warehouse_code}")
            continue

        customs = str(row.get('报关', 'N')).upper() == 'Y'

        shipment = {
            'tracking_number': tracking,
            'batch_code': str(row.get('生产批次', '')).strip() if pd.notna(row.get('生产批次')) else None,
            'logistics_batch_code': str(row.get('物流批次', '')).strip() if pd.notna(row.get('物流批次')) else None,
            'destination_warehouse_id': warehouse_id,
            'customs_clearance': customs,
            'logistics_plan': str(row.get('方案', '')).strip() if pd.notna(row.get('方案')) else None,
            'logistics_region': get_region_from_chinese(row.get('区域')),
            'actual_departure_date': parse_date(row.get('开船日期')),
            'planned_arrival_days': int(row['预计签收天数']) if pd.notna(row.get('预计签收天数')) else None,
            'planned_arrival_date': parse_date(row.get('预计签收日期')),
            'actual_arrival_date': parse_date(row.get('实际签收日期')),
            'weight_kg': float(row['公斤数']) if pd.notna(row.get('公斤数')) else None,
            'unit_count': int(row['台数']) if pd.notna(row.get('台数')) else None,
            'cost_per_kg_usd': float(row['公斤单价']) if pd.notna(row.get('公斤单价')) else None,
            'surcharge_usd': float(row['其他杂费']) if pd.notna(row.get('其他杂费')) else 0,
            'payment_status': 'Pending'
        }

        result = api_request('POST', 'shipments', shipment)
        if result and len(result) > 0:
            shipment_id = result[0].get('id')
            shipment_count += 1
            print(f"  - Shipment: {tracking}")

            # Insert shipment items
            for col, sku in sku_cols.items():
                if col in df.columns:
                    qty = row.get(col)
                    if pd.notna(qty) and qty > 0:
                        item = {
                            'shipment_id': shipment_id,
                            'sku': sku,
                            'shipped_qty': int(qty)
                        }
                        api_request('POST', 'shipment_items', item)

    print(f"Shipments import complete! ({shipment_count} records)")

def main():
    print("=" * 60)
    print("Rolloy SCM - Excel Data Import V2")
    print("=" * 60)

    if not os.path.exists(EXCEL_FILE):
        print(f"Error: Excel file not found: {EXCEL_FILE}")
        sys.exit(1)

    print(f"\nLoading Excel file: {EXCEL_FILE}")
    xlsx = pd.ExcelFile(EXCEL_FILE)
    print(f"Sheets found: {xlsx.sheet_names}")

    # Check existing data
    print("\n=== Checking Existing Data ===")
    products = get_all_records('products') or []
    channels = get_all_records('channels') or []
    warehouses = get_all_records('warehouses') or []
    print(f"Products: {len(products)}")
    print(f"Channels: {len(channels)}")
    print(f"Warehouses: {len(warehouses)}")

    # Import data
    import_sales_forecasts(xlsx)
    import_sales_actuals(xlsx)
    import_purchase_orders(xlsx)
    import_shipments(xlsx)

    print("\n" + "=" * 60)
    print("Data import complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
