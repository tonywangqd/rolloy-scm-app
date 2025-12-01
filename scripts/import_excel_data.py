#!/usr/bin/env python3
"""
Rolloy SCM - Excel Data Import Script
Import data from 供应链计划表(Sample).xlsx to Supabase
"""

import os
import sys
import json
import uuid
from datetime import datetime, timedelta
import pandas as pd
from supabase import create_client, Client

# Supabase connection settings
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

EXCEL_FILE = '/Users/tony/Downloads/供应链计划表(Sample).xlsx'

def get_supabase_client() -> Client:
    """Create Supabase client"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Missing Supabase credentials")
        print("Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)

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
        # Try various formats
        for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y-%m-%d %H:%M:%S']:
            try:
                return datetime.strptime(date_val.strip(), fmt).strftime('%Y-%m-%d')
            except:
                pass
        return date_val
    return str(date_val)

def parse_currency(val):
    """Parse currency value like '$2,750.00' to float"""
    if pd.isna(val):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace('$', '').replace(',', '').strip()
    try:
        return float(s)
    except:
        return 0.0

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

def import_master_data(supabase: Client, xlsx: pd.ExcelFile):
    """Import master data: products, channels, warehouses"""
    print("\n=== Importing Master Data ===")

    df = pd.read_excel(xlsx, sheet_name='00其他基础信息')

    # 1. Import Products (SKUs)
    print("\n1. Importing Products...")
    skus = df['产品SKU'].dropna().unique()
    spus = df['产品SPU'].dropna().unique()

    # Map SKU to SPU
    sku_spu_map = {}
    for _, row in df.iterrows():
        if pd.notna(row['产品SKU']):
            # Find SPU based on prefix
            sku = str(row['产品SKU'])
            if sku.startswith('A2'):
                sku_spu_map[sku] = 'A2'
            elif sku.startswith('A5'):
                sku_spu_map[sku] = 'A5'
            elif sku.startswith('W1'):
                sku_spu_map[sku] = 'W1'
            elif sku.startswith('W2'):
                sku_spu_map[sku] = 'W2'

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
        spu = sku_spu_map.get(sku, sku[:2])
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

    # Upsert products
    for p in products:
        try:
            supabase.table('products').upsert(p, on_conflict='sku').execute()
            print(f"  - Product: {p['sku']}")
        except Exception as e:
            print(f"  ! Error inserting product {p['sku']}: {e}")

    # 2. Import Channels
    print("\n2. Importing Channels...")
    channels_raw = df['销售渠道'].dropna().unique()

    channel_data = [
        {'channel_code': 'Amazon-US', 'channel_name': 'Amazon US', 'platform': 'Amazon', 'region': 'US'},
        {'channel_code': 'Shopify-US', 'channel_name': 'Shopify 官网', 'platform': 'Shopify', 'region': 'US'},
        {'channel_code': 'Walmart-US', 'channel_name': 'Walmart US', 'platform': 'Walmart', 'region': 'US'},
    ]

    for c in channel_data:
        try:
            supabase.table('channels').upsert(c, on_conflict='channel_code').execute()
            print(f"  - Channel: {c['channel_code']}")
        except Exception as e:
            print(f"  ! Error inserting channel {c['channel_code']}: {e}")

    # 3. Import Warehouses
    print("\n3. Importing Warehouses...")

    # FBA Warehouses from Excel
    fba_codes = df['仓库代号(FBA)'].dropna().unique()
    # 3PL Warehouses from Excel
    winit_codes = df['仓库代号(Winit)'].dropna().unique()

    # FBA warehouse region mapping (based on airport codes)
    region_map = {
        # East
        'TEB4': 'East', 'TEB6': 'East', 'TEB3': 'East',
        'ACY2': 'East', 'JVL1': 'East', 'CLT3': 'East',
        'JAX3': 'East', 'CHO1': 'East', 'CHA2': 'East',
        'PHL4': 'East', 'BOS7': 'East', 'ABE4': 'East',
        'SWF1': 'East', 'TPA2': 'East', 'MCO2': 'East',
        'GSO1': 'East', 'ILG1': 'East', 'PIT2': 'East',
        'DCA6': 'East', 'MGE3': 'East',
        # Central
        'ORD2': 'Central', 'STL4': 'Central', 'STL3': 'Central',
        'DEN8': 'Central', 'LFT1': 'Central', 'DFW6': 'Central',
        'FOE1': 'Central', 'DET1': 'Central', 'MEM6': 'Central',
        'SAT1': 'Central', 'SAT4': 'Central', 'HOU8': 'Central',
        'IND5': 'Central', 'FTW5': 'Central', 'OKC2': 'Central',
        'CMH3': 'Central', 'CMH2': 'Central', 'MKC4': 'Central',
        'IGQ2': 'Central',
        # West
        'AMA1': 'West', 'OAK3': 'West', 'SCK1': 'West', 'SCK8': 'West',
        'SBD2': 'West', 'SNA4': 'West', 'LGB4': 'West', 'LAS6': 'West',
        'PHX7': 'West', 'BFI3': 'West', 'MCE1': 'West', 'SJC7': 'West',
        'SMF6': 'West', 'PDX7': 'West',
    }

    warehouses = []
    for code in fba_codes:
        code = str(code).strip()
        warehouses.append({
            'warehouse_code': code,
            'warehouse_name': f'FBA {code}',
            'warehouse_type': 'FBA',
            'region': region_map.get(code, 'Central'),
            'is_active': True
        })

    for code in winit_codes:
        code = str(code).strip()
        # Extract postal code if present
        parts = code.split()
        wh_code = parts[0] if len(parts) > 0 else code
        postal = parts[1] if len(parts) > 1 else None
        region = 'West' if 'WC' in code else ('East' if 'NJ' in code else 'Central')
        warehouses.append({
            'warehouse_code': wh_code,
            'warehouse_name': f'3PL {wh_code}',
            'warehouse_type': '3PL',
            'region': region,
            'postal_code': postal,
            'is_active': True
        })

    for w in warehouses:
        try:
            supabase.table('warehouses').upsert(w, on_conflict='warehouse_code').execute()
            print(f"  - Warehouse: {w['warehouse_code']} ({w['warehouse_type']})")
        except Exception as e:
            print(f"  ! Error inserting warehouse {w['warehouse_code']}: {e}")

    # 4. Import Default Supplier
    print("\n4. Importing Suppliers...")
    supplier = {
        'supplier_code': 'SUP001',
        'supplier_name': 'Default Supplier',
        'payment_terms_days': 60,
        'is_active': True
    }
    try:
        supabase.table('suppliers').upsert(supplier, on_conflict='supplier_code').execute()
        print(f"  - Supplier: {supplier['supplier_code']}")
    except Exception as e:
        print(f"  ! Error inserting supplier: {e}")

    print("\nMaster data import complete!")

def import_sales_forecasts(supabase: Client, xlsx: pd.ExcelFile):
    """Import weekly sales forecasts"""
    print("\n=== Importing Weekly Sales Forecasts ===")

    df = pd.read_excel(xlsx, sheet_name='01 周度目标销量表')

    # Column mapping: SKU + Channel
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

    # Batch upsert
    print(f"Inserting {len(records)} forecast records...")
    batch_size = 100
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        try:
            supabase.table('weekly_sales_forecasts').upsert(
                batch,
                on_conflict='year_week,sku,channel_code'
            ).execute()
            print(f"  - Batch {i//batch_size + 1}: {len(batch)} records")
        except Exception as e:
            print(f"  ! Error in batch {i//batch_size + 1}: {e}")

    print(f"Sales forecasts import complete! ({len(records)} records)")

def import_sales_actuals(supabase: Client, xlsx: pd.ExcelFile):
    """Import weekly sales actuals"""
    print("\n=== Importing Weekly Sales Actuals ===")

    df = pd.read_excel(xlsx, sheet_name='05 周度实际销量表')

    # Column mapping: SKU + Channel
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

    # Batch upsert
    print(f"Inserting {len(records)} actual sales records...")
    batch_size = 100
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        try:
            supabase.table('weekly_sales_actuals').upsert(
                batch,
                on_conflict='year_week,sku,channel_code'
            ).execute()
            print(f"  - Batch {i//batch_size + 1}: {len(batch)} records")
        except Exception as e:
            print(f"  ! Error in batch {i//batch_size + 1}: {e}")

    print(f"Sales actuals import complete! ({len(records)} records)")

def import_purchase_orders(supabase: Client, xlsx: pd.ExcelFile):
    """Import purchase orders from procurement and delivery data"""
    print("\n=== Importing Purchase Orders & Deliveries ===")

    # Read both sheets
    df_orders = pd.read_excel(xlsx, sheet_name='02 采购下单数据表')
    df_deliveries = pd.read_excel(xlsx, sheet_name='03 生产交付数据表')

    # Get default supplier ID
    supplier_result = supabase.table('suppliers').select('id').eq('supplier_code', 'SUP001').execute()
    supplier_id = supplier_result.data[0]['id'] if supplier_result.data else None

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

    # Group orders by batch
    batch_orders = {}
    for idx, row in df_orders.iterrows():
        batch = str(row['下单批次']).strip()
        if batch not in batch_orders:
            batch_orders[batch] = {
                'batch_code': batch,
                'order_date': parse_date(row['下单日期']),
                'ship_date': parse_date(row['预计出货日期']),
                'items': []
            }

        # Parse SKU quantities
        for col, (sku, channel) in sku_cols.items():
            if col in df_orders.columns:
                qty = row.get(col)
                if pd.notna(qty) and qty > 0:
                    batch_orders[batch]['items'].append({
                        'sku': sku,
                        'channel_code': channel,
                        'qty': int(qty)
                    })

    # Insert POs and PO Items
    print(f"\nInserting {len(batch_orders)} purchase orders...")
    po_id_map = {}  # batch_code -> po_id
    po_item_map = {}  # (po_id, sku, channel) -> item_id

    for batch_code, data in batch_orders.items():
        po_number = f"PO-{batch_code[:20]}"
        po = {
            'po_number': po_number,
            'batch_code': batch_code,
            'supplier_id': supplier_id,
            'po_status': 'Delivered',
            'actual_order_date': data['order_date'],
            'planned_ship_date': data['ship_date']
        }

        try:
            result = supabase.table('purchase_orders').insert(po).execute()
            if result.data:
                po_id = result.data[0]['id']
                po_id_map[batch_code] = po_id
                print(f"  - PO: {po_number}")

                # Insert PO items
                for item in data['items']:
                    unit_price = 50 if item['sku'].startswith(('A2', 'A5')) else 35
                    po_item = {
                        'po_id': po_id,
                        'sku': item['sku'],
                        'channel_code': item['channel_code'],
                        'ordered_qty': item['qty'],
                        'delivered_qty': 0,
                        'unit_price_usd': unit_price
                    }
                    item_result = supabase.table('purchase_order_items').insert(po_item).execute()
                    if item_result.data:
                        key = (po_id, item['sku'], item['channel_code'])
                        po_item_map[key] = item_result.data[0]['id']
        except Exception as e:
            print(f"  ! Error inserting PO {batch_code}: {e}")

    # Import Deliveries
    print(f"\n=== Importing Production Deliveries ===")

    # Delivery SKU columns
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
        delivery_date = parse_date(row['实际交付日期'])
        unit_price = row.get('交付单价', 50)
        if pd.isna(unit_price):
            unit_price = 50

        po_id = po_id_map.get(batch_code)
        if not po_id:
            # Create a new PO for this batch
            po_number = f"PO-{batch_code[:20]}-{idx}"
            po = {
                'po_number': po_number,
                'batch_code': batch_code,
                'supplier_id': supplier_id,
                'po_status': 'Delivered',
                'actual_order_date': delivery_date
            }
            try:
                result = supabase.table('purchase_orders').insert(po).execute()
                if result.data:
                    po_id = result.data[0]['id']
                    po_id_map[batch_code] = po_id
            except:
                continue

        # Parse deliveries for each SKU
        for col, (sku, channel) in delivery_sku_cols.items():
            if col in df_deliveries.columns:
                qty = row.get(col)
                if pd.notna(qty) and qty > 0:
                    # Find or create PO item
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
                        try:
                            item_result = supabase.table('purchase_order_items').insert(po_item).execute()
                            if item_result.data:
                                po_item_id = item_result.data[0]['id']
                                po_item_map[key] = po_item_id
                        except:
                            continue

                    if po_item_id:
                        # Create delivery record
                        delivery_number = f"DEL-{idx:04d}-{sku}"
                        delivery = {
                            'delivery_number': delivery_number,
                            'po_item_id': po_item_id,
                            'sku': sku,
                            'channel_code': channel,
                            'delivered_qty': int(qty),
                            'actual_delivery_date': delivery_date,
                            'unit_cost_usd': float(unit_price),
                            'payment_status': 'Pending',
                            'remarks': row.get('备注') if pd.notna(row.get('备注')) else None
                        }
                        try:
                            supabase.table('production_deliveries').insert(delivery).execute()
                            delivery_count += 1
                        except Exception as e:
                            pass

    print(f"Production deliveries import complete! ({delivery_count} records)")

def import_shipments(supabase: Client, xlsx: pd.ExcelFile):
    """Import shipment/logistics data"""
    print("\n=== Importing Shipments ===")

    df = pd.read_excel(xlsx, sheet_name='04 物流数据表')

    # Get warehouse ID map
    warehouses = supabase.table('warehouses').select('id, warehouse_code').execute()
    warehouse_map = {w['warehouse_code']: w['id'] for w in warehouses.data}

    # SKU columns
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

        # Get warehouse ID
        warehouse_id = warehouse_map.get(warehouse_code)
        if not warehouse_id:
            # Try to create warehouse
            wh_type = 'FBA' if tracking.startswith('FBA') else '3PL'
            wh = {
                'warehouse_code': warehouse_code,
                'warehouse_name': f'{wh_type} {warehouse_code}',
                'warehouse_type': wh_type,
                'region': get_region_from_chinese(row.get('区域')),
                'is_active': True
            }
            try:
                result = supabase.table('warehouses').upsert(wh, on_conflict='warehouse_code').execute()
                if result.data:
                    warehouse_id = result.data[0]['id']
                    warehouse_map[warehouse_code] = warehouse_id
            except:
                continue

        if not warehouse_id:
            continue

        # Parse shipment data
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

        try:
            result = supabase.table('shipments').upsert(
                shipment,
                on_conflict='tracking_number'
            ).execute()

            if result.data:
                shipment_id = result.data[0]['id']
                shipment_count += 1

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
                            try:
                                supabase.table('shipment_items').upsert(
                                    item,
                                    on_conflict='shipment_id,sku'
                                ).execute()
                            except:
                                pass

                print(f"  - Shipment: {tracking}")
        except Exception as e:
            print(f"  ! Error inserting shipment {tracking}: {e}")

    print(f"Shipments import complete! ({shipment_count} records)")

def main():
    """Main import function"""
    print("=" * 60)
    print("Rolloy SCM - Excel Data Import")
    print("=" * 60)

    # Check Excel file exists
    if not os.path.exists(EXCEL_FILE):
        print(f"Error: Excel file not found: {EXCEL_FILE}")
        sys.exit(1)

    # Create Supabase client
    supabase = get_supabase_client()
    print(f"Connected to Supabase: {SUPABASE_URL}")

    # Load Excel file
    print(f"Loading Excel file: {EXCEL_FILE}")
    xlsx = pd.ExcelFile(EXCEL_FILE)
    print(f"Sheets found: {xlsx.sheet_names}")

    # Import in order
    import_master_data(supabase, xlsx)
    import_sales_forecasts(supabase, xlsx)
    import_sales_actuals(supabase, xlsx)
    import_purchase_orders(supabase, xlsx)
    import_shipments(supabase, xlsx)

    print("\n" + "=" * 60)
    print("Data import complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
