#!/usr/bin/env python3
"""
Rolloy SCM - Excel Data Import Script (REST API Version)
Import data from 供应链计划表(Sample).xlsx to Supabase using REST API
"""

import os
import sys
import json
import uuid
import requests
from datetime import datetime, timedelta
import pandas as pd

# Supabase connection settings
SUPABASE_URL = "https://mliqjmoylepdwokzjfwe.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saXFqbW95bGVwZHdva3pqZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NjgyNzIsImV4cCI6MjA4MDA0NDI3Mn0.bJWzEzDu0HSibbGjxeVF20j6ry3cKyQAsfyF3d7Ays8"

EXCEL_FILE = '/Users/tony/Downloads/供应链计划表(Sample).xlsx'

# Disable proxy for this script
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('HTTP_PROXY', None)
os.environ.pop('HTTPS_PROXY', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

def get_headers():
    """Get API headers"""
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

def api_request(method, table, data=None, params=None):
    """Make REST API request to Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = get_headers()

    try:
        if method == 'GET':
            resp = requests.get(url, headers=headers, params=params, timeout=30)
        elif method == 'POST':
            headers['Prefer'] = 'return=representation,resolution=merge-duplicates'
            resp = requests.post(url, headers=headers, json=data, timeout=30)
        elif method == 'PATCH':
            resp = requests.patch(url, headers=headers, json=data, params=params, timeout=30)
        elif method == 'DELETE':
            resp = requests.delete(url, headers=headers, params=params, timeout=30)

        if resp.status_code in [200, 201]:
            return resp.json() if resp.text else []
        else:
            print(f"  ! API Error: {resp.status_code} - {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"  ! Request Error: {e}")
        return None

def date_to_iso_week(date_str) -> str:
    """Convert date to ISO week format YYYY-WXX"""
    if pd.isna(date_str):
        return None
    if isinstance(date_str, str):
        date_str = pd.to_datetime(date_str)
    iso_cal = date_str.isocalendar()
    return f"{iso_cal.year}-W{iso_cal.week:02d}"

def parse_date(date_val):
    """Parse various date formats to YYYY-MM-DD string"""
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
        return date_val
    return str(date_val)

def get_region_from_chinese(region_str):
    """Convert Chinese region to enum value"""
    if pd.isna(region_str):
        return 'Central'
    region_map = {
        '东部': 'East',
        '中部': 'Central',
        '西部': 'West'
    }
    return region_map.get(str(region_str).strip(), 'Central')

def import_master_data(xlsx: pd.ExcelFile):
    """Import master data: products, channels, warehouses"""
    print("\n=== Importing Master Data ===")

    df = pd.read_excel(xlsx, sheet_name='00其他基础信息')

    # 1. Import Products (SKUs)
    print("\n1. Importing Products...")
    skus = df['产品SKU'].dropna().unique()

    # Unit cost from Excel
    cost_map = {
        'A2RD': 50, 'A2BK': 50,
        'A5RD': 50, 'A5BK': 50,
        'W1RD': 35, 'W1BK': 35,
        'W2RD': 40, 'W2BK': 40
    }

    products = []
    for sku in skus:
        sku = str(sku).strip()
        if sku.startswith('A2'):
            spu = 'A2'
        elif sku.startswith('A5'):
            spu = 'A5'
        elif sku.startswith('W1'):
            spu = 'W1'
        elif sku.startswith('W2'):
            spu = 'W2'
        else:
            spu = sku[:2]

        color = 'RD' if 'RD' in sku else ('BK' if 'BK' in sku else '')
        products.append({
            'sku': sku,
            'spu': spu,
            'color_code': color,
            'product_name': f'{spu} {color}' if color else spu,
            'unit_cost_usd': cost_map.get(sku, 50),
            'safety_stock_weeks': 4,
            'is_active': True
        })

    for p in products:
        result = api_request('POST', 'products', p)
        if result:
            print(f"  - Product: {p['sku']}")

    # 2. Import Channels
    print("\n2. Importing Channels...")
    channel_data = [
        {'channel_code': 'Amazon-US', 'channel_name': 'Amazon US', 'platform': 'Amazon', 'region': 'US'},
        {'channel_code': 'Shopify-US', 'channel_name': 'Shopify 官网', 'platform': 'Shopify', 'region': 'US'},
        {'channel_code': 'Walmart-US', 'channel_name': 'Walmart US', 'platform': 'Walmart', 'region': 'US'},
    ]

    for c in channel_data:
        result = api_request('POST', 'channels', c)
        if result:
            print(f"  - Channel: {c['channel_code']}")

    # 3. Import Warehouses
    print("\n3. Importing Warehouses...")

    # FBA Warehouses from Excel
    fba_codes = df['仓库代号(FBA)'].dropna().unique()
    # 3PL Warehouses from Excel
    winit_codes = df['仓库代号(Winit)'].dropna().unique()

    # FBA warehouse region mapping
    region_map = {
        'TEB4': 'East', 'TEB6': 'East', 'TEB3': 'East',
        'ACY2': 'East', 'JVL1': 'East', 'CLT3': 'East',
        'JAX3': 'East', 'CHO1': 'East', 'CHA2': 'East',
        'PHL4': 'East', 'BOS7': 'East', 'ABE4': 'East',
        'SWF1': 'East', 'TPA2': 'East', 'MCO2': 'East',
        'GSO1': 'East', 'ILG1': 'East', 'PIT2': 'East',
        'DCA6': 'East', 'MGE3': 'East',
        'ORD2': 'Central', 'STL4': 'Central', 'STL3': 'Central',
        'DEN8': 'Central', 'LFT1': 'Central', 'DFW6': 'Central',
        'FOE1': 'Central', 'DET1': 'Central', 'MEM6': 'Central',
        'SAT1': 'Central', 'SAT4': 'Central', 'HOU8': 'Central',
        'IND5': 'Central', 'FTW5': 'Central', 'OKC2': 'Central',
        'CMH3': 'Central', 'CMH2': 'Central', 'MKC4': 'Central',
        'IGQ2': 'Central',
        'AMA1': 'West', 'OAK3': 'West', 'SCK1': 'West', 'SCK8': 'West',
        'SBD2': 'West', 'SNA4': 'West', 'LGB4': 'West', 'LAS6': 'West',
        'PHX7': 'West', 'BFI3': 'West', 'MCE1': 'West', 'SJC7': 'West',
        'SMF6': 'West', 'PDX7': 'West',
    }

    for code in fba_codes:
        code = str(code).strip()
        wh = {
            'warehouse_code': code,
            'warehouse_name': f'FBA {code}',
            'warehouse_type': 'FBA',
            'region': region_map.get(code, 'Central'),
            'is_active': True
        }
        result = api_request('POST', 'warehouses', wh)
        if result:
            print(f"  - Warehouse: {code} (FBA)")

    for code in winit_codes:
        code = str(code).strip()
        parts = code.split()
        wh_code = parts[0] if len(parts) > 0 else code
        postal = parts[1] if len(parts) > 1 else None
        region = 'West' if 'WC' in code else ('East' if 'NJ' in code else 'Central')
        wh = {
            'warehouse_code': wh_code,
            'warehouse_name': f'3PL {wh_code}',
            'warehouse_type': '3PL',
            'region': region,
            'postal_code': postal,
            'is_active': True
        }
        result = api_request('POST', 'warehouses', wh)
        if result:
            print(f"  - Warehouse: {wh_code} (3PL)")

    # 4. Import Default Supplier
    print("\n4. Importing Suppliers...")
    supplier = {
        'supplier_code': 'SUP001',
        'supplier_name': 'Default Supplier',
        'payment_terms_days': 60,
        'is_active': True
    }
    result = api_request('POST', 'suppliers', supplier)
    if result:
        print(f"  - Supplier: {supplier['supplier_code']}")

    print("\nMaster data import complete!")

def import_sales_forecasts(xlsx: pd.ExcelFile):
    """Import weekly sales forecasts"""
    print("\n=== Importing Weekly Sales Forecasts ===")

    df = pd.read_excel(xlsx, sheet_name='01 周度目标销量表')

    sku_channel_cols = {
        'A2RD亚马逊': ('A2RD', 'Amazon-US'),
        'A2BK亚马逊': ('A2BK', 'Amazon-US'),
        'A5RD亚马逊': ('A5RD', 'Amazon-US'),
        'A5BK亚马逊': ('A5BK', 'Amazon-US'),
        'W1RD亚马逊': ('W1RD', 'Amazon-US'),
        'W1BK亚马逊': ('W1BK', 'Amazon-US'),
        'A2RD官网': ('A2RD', 'Shopify-US'),
        'A2BK官网': ('A2BK', 'Shopify-US'),
        'A5RD官网': ('A5RD', 'Shopify-US'),
        'A5BK官网': ('A5BK', 'Shopify-US'),
        'W1RD官网': ('W1RD', 'Shopify-US'),
        'W1BK官网': ('W1BK', 'Shopify-US'),
    }

    records = []
    for _, row in df.iterrows():
        week_start = parse_date(row['周初'])
        if not week_start:
            continue

        year_week = date_to_iso_week(row['周初'])
        if not year_week:
            continue

        for col, (sku, channel) in sku_channel_cols.items():
            if col in df.columns:
                qty = row.get(col)
                if pd.notna(qty) and qty > 0:
                    records.append({
                        'year_week': year_week,
                        'sku': sku,
                        'channel_code': channel,
                        'forecast_qty': int(qty)
                    })

    print(f"Inserting {len(records)} forecast records...")
    batch_size = 50
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        result = api_request('POST', 'weekly_sales_forecasts', batch)
        if result:
            print(f"  - Batch {i//batch_size + 1}: {len(batch)} records")

    print(f"Sales forecasts import complete! ({len(records)} records)")

def import_sales_actuals(xlsx: pd.ExcelFile):
    """Import weekly sales actuals"""
    print("\n=== Importing Weekly Sales Actuals ===")

    df = pd.read_excel(xlsx, sheet_name='05 周度实际销量表')

    sku_channel_cols = {
        'A2RD亚马逊': ('A2RD', 'Amazon-US'),
        'A2BK亚马逊': ('A2BK', 'Amazon-US'),
        'A5RD亚马逊': ('A5RD', 'Amazon-US'),
        'A5BK亚马逊': ('A5BK', 'Amazon-US'),
        'W1RD亚马逊': ('W1RD', 'Amazon-US'),
        'W1BK亚马逊': ('W1BK', 'Amazon-US'),
        'A2RD官网': ('A2RD', 'Shopify-US'),
        'A2BK官网': ('A2BK', 'Shopify-US'),
        'A5RD官网': ('A5RD', 'Shopify-US'),
        'A5BK官网': ('A5BK', 'Shopify-US'),
        'W1RD官网': ('W1RD', 'Shopify-US'),
        'W1BK官网': ('W1BK', 'Shopify-US'),
    }

    records = []
    for _, row in df.iterrows():
        week_start = parse_date(row['周初'])
        if not week_start:
            continue

        year_week = date_to_iso_week(row['周初'])
        if not year_week:
            continue

        for col, (sku, channel) in sku_channel_cols.items():
            if col in df.columns:
                qty = row.get(col)
                if pd.notna(qty) and qty > 0:
                    records.append({
                        'year_week': year_week,
                        'sku': sku,
                        'channel_code': channel,
                        'actual_qty': int(qty)
                    })

    print(f"Inserting {len(records)} actual sales records...")
    batch_size = 50
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        result = api_request('POST', 'weekly_sales_actuals', batch)
        if result:
            print(f"  - Batch {i//batch_size + 1}: {len(batch)} records")

    print(f"Sales actuals import complete! ({len(records)} records)")

def get_all_records(table):
    """Get all records from a table"""
    return api_request('GET', table, params={'select': '*'})

def import_purchase_orders(xlsx: pd.ExcelFile):
    """Import purchase orders from procurement and delivery data"""
    print("\n=== Importing Purchase Orders & Deliveries ===")

    df_orders = pd.read_excel(xlsx, sheet_name='02 采购下单数据表')
    df_deliveries = pd.read_excel(xlsx, sheet_name='03 生产交付数据表')

    # Get default supplier ID
    suppliers = get_all_records('suppliers')
    supplier_id = None
    if suppliers:
        for s in suppliers:
            if s.get('supplier_code') == 'SUP001':
                supplier_id = s.get('id')
                break

    # SKU columns mapping
    sku_cols = {
        'A2RD 亚马逊': ('A2RD', 'Amazon-US'),
        'A2BK 亚马逊': ('A2BK', 'Amazon-US'),
        'A5RD 亚马逊': ('A5RD', 'Amazon-US'),
        'A5BK 亚马逊': ('A5BK', 'Amazon-US'),
        'W1RD 亚马逊': ('W1RD', 'Amazon-US'),
        'W1BK 亚马逊': ('W1BK', 'Amazon-US'),
        'A2RD 官网': ('A2RD', 'Shopify-US'),
        'A2BK 官网': ('A2BK', 'Shopify-US'),
        'A5RD 官网': ('A5RD', 'Shopify-US'),
        'A5BK 官网': ('A5BK', 'Shopify-US'),
        'W1RD 官网': ('W1RD', 'Shopify-US'),
        'W1BK 官网': ('W1BK', 'Shopify-US'),
    }

    # Create unique batch list
    batches = df_orders['下单批次'].dropna().unique()
    po_id_map = {}  # batch -> po_id
    po_item_map = {}  # (po_id, sku, channel) -> item_id

    print(f"\nInserting {len(batches)} purchase orders...")

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
            print(f"  - PO: {po_number}")

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
        '亚马逊-A2RD': ('A2RD', 'Amazon-US'),
        '亚马逊-A2BK': ('A2BK', 'Amazon-US'),
        '亚马逊-A5RD': ('A5RD', 'Amazon-US'),
        '亚马逊-A5BK': ('A5BK', 'Amazon-US'),
        'W1RD 亚马逊': ('W1RD', 'Amazon-US'),
        'W1BK 亚马逊': ('W1BK', 'Amazon-US'),
        '官网-A2RD': ('A2RD', 'Shopify-US'),
        '官网-A2BK': ('A2BK', 'Shopify-US'),
        '官网-A5RD': ('A5RD', 'Shopify-US'),
        '官网-A5BK': ('A5BK', 'Shopify-US'),
        '官网 W1RD': ('W1RD', 'Shopify-US'),
        '官网 W1BK': ('W1BK', 'Shopify-US'),
    }

    delivery_count = 0
    for idx, row in df_deliveries.iterrows():
        batch_code = str(row['下单批次']).strip()
        delivery_date = parse_date(row.get('实际交付日期'))
        unit_price = row.get('交付单价', 50)
        if pd.isna(unit_price):
            unit_price = 50

        po_id = po_id_map.get(batch_code)

        # Parse deliveries for each SKU
        for col, (sku, channel) in delivery_sku_cols.items():
            if col in df_deliveries.columns:
                qty = row.get(col)
                if pd.notna(qty) and qty > 0:
                    # Find PO item ID
                    po_item_id = None
                    if po_id:
                        key = (po_id, sku, channel)
                        po_item_id = po_item_map.get(key)

                    if not po_item_id:
                        # Create a dummy PO item
                        if po_id:
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
                                key = (po_id, sku, channel)
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
                        if result:
                            delivery_count += 1

    print(f"Production deliveries import complete! ({delivery_count} records)")

def import_shipments(xlsx: pd.ExcelFile):
    """Import shipment/logistics data"""
    print("\n=== Importing Shipments ===")

    df = pd.read_excel(xlsx, sheet_name='04 物流数据表')

    # Get warehouse ID map
    warehouses = get_all_records('warehouses')
    warehouse_map = {}
    if warehouses:
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
            # Create warehouse
            wh_type = 'FBA' if tracking.startswith('FBA') else '3PL'
            wh = {
                'warehouse_code': warehouse_code,
                'warehouse_name': f'{wh_type} {warehouse_code}',
                'warehouse_type': wh_type,
                'region': get_region_from_chinese(row.get('区域')),
                'is_active': True
            }
            result = api_request('POST', 'warehouses', wh)
            if result and len(result) > 0:
                warehouse_id = result[0].get('id')
                warehouse_map[warehouse_code] = warehouse_id

        if not warehouse_id:
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
    """Main import function"""
    print("=" * 60)
    print("Rolloy SCM - Excel Data Import (REST API)")
    print("=" * 60)

    if not os.path.exists(EXCEL_FILE):
        print(f"Error: Excel file not found: {EXCEL_FILE}")
        sys.exit(1)

    # Test connection
    print(f"\nTesting connection to: {SUPABASE_URL}")
    result = api_request('GET', 'products', params={'select': 'count', 'limit': 1})
    if result is None:
        print("Error: Could not connect to Supabase")
        sys.exit(1)
    print("Connection successful!")

    # Load Excel file
    print(f"\nLoading Excel file: {EXCEL_FILE}")
    xlsx = pd.ExcelFile(EXCEL_FILE)
    print(f"Sheets found: {xlsx.sheet_names}")

    # Import in order
    import_master_data(xlsx)
    import_sales_forecasts(xlsx)
    import_sales_actuals(xlsx)
    import_purchase_orders(xlsx)
    import_shipments(xlsx)

    print("\n" + "=" * 60)
    print("Data import complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
