'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import type { Product, ProductInsert, ChannelInsert, WarehouseInsert, SupplierInsert } from '@/lib/types/database'
import {
  productInsertSchema,
  productUpdateSchema,
  channelInsertSchema,
  channelUpdateSchema,
  warehouseInsertSchema,
  warehouseUpdateSchema,
  supplierInsertSchema,
  supplierUpdateSchema,
  deleteBySkuSchema,
  deleteByIdSchema,
  deleteByCodeSchema,
} from '@/lib/validations'

// Product Query Action
export async function getProducts(): Promise<{ success: boolean; data?: Product[]; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sku')

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data || [] }
}

// Product Actions
export async function createProduct(
  product: ProductInsert
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = productInsertSchema.safeParse(product)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('products').insert(validation.data)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/products')
  return { success: true }
}

export async function updateProduct(
  sku: string,
  updates: Partial<ProductInsert>
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate SKU
  const skuValidation = deleteBySkuSchema.safeParse({ sku })
  if (!skuValidation.success) {
    return {
      success: false,
      error: `Validation error: ${skuValidation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  // Validate updates
  const validation = productUpdateSchema.safeParse(updates)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('products')
    .update(validation.data)
    .eq('sku', sku)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/products')
  return { success: true }
}

export async function deleteProduct(
  sku: string
): Promise<{ success: boolean; error?: string; canDeactivate?: boolean }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate SKU
  const validation = deleteBySkuSchema.safeParse({ sku })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  try {
    // Check for references in related tables
    const [
      poItems,
      shipmentItems,
      salesForecasts,
      salesActuals,
      inventorySnapshots,
      productionDeliveries
    ] = await Promise.all([
      supabase.from('purchase_order_items').select('id').eq('sku', sku).limit(1),
      supabase.from('shipment_items').select('id').eq('sku', sku).limit(1),
      supabase.from('sales_forecasts').select('id').eq('sku', sku).limit(1),
      supabase.from('sales_actuals').select('id').eq('sku', sku).limit(1),
      supabase.from('inventory_snapshots').select('id').eq('sku', sku).limit(1),
      supabase.from('production_deliveries').select('id').eq('sku', sku).limit(1),
    ])

    // Check if any references exist
    const hasReferences = [
      poItems,
      shipmentItems,
      salesForecasts,
      salesActuals,
      inventorySnapshots,
      productionDeliveries
    ].some(result => result.data && result.data.length > 0)

    if (hasReferences) {
      // Cannot physically delete - has historical data
      return {
        success: false,
        error: '该产品已有关联数据（采购、发运、销售或库存记录），无法删除。建议使用"停用"功能将产品状态设为停用。',
        canDeactivate: true
      }
    }

    // No references - safe to physically delete
    const { error } = await supabase.from('products').delete().eq('sku', sku)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/settings')
    revalidatePath('/settings/products')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除操作失败'
    }
  }
}

export async function deactivateProduct(
  sku: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate SKU
  const validation = deleteBySkuSchema.safeParse({ sku })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  try {
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('sku', sku)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/settings')
    revalidatePath('/settings/products')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '停用操作失败'
    }
  }
}

export async function activateProduct(
  sku: string
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate SKU
  const validation = deleteBySkuSchema.safeParse({ sku })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  try {
    const { error } = await supabase
      .from('products')
      .update({ is_active: true })
      .eq('sku', sku)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/settings')
    revalidatePath('/settings/products')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '启用操作失败'
    }
  }
}

// Channel Actions
export async function createChannel(
  channel: ChannelInsert
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = channelInsertSchema.safeParse(channel)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('channels').insert(validation.data)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/channels')
  return { success: true }
}

export async function updateChannel(
  channelCode: string,
  updates: Partial<ChannelInsert>
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate channel code
  const codeValidation = deleteByCodeSchema.safeParse({ code: channelCode })
  if (!codeValidation.success) {
    return {
      success: false,
      error: `Validation error: ${codeValidation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  // Validate updates
  const validation = channelUpdateSchema.safeParse(updates)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('channels')
    .update(validation.data)
    .eq('channel_code', channelCode)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/channels')
  return { success: true }
}

export async function deleteChannel(
  channelCode: string
): Promise<{ success: boolean; error?: string; canDeactivate?: boolean }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate channel code
  const validation = deleteByCodeSchema.safeParse({ code: channelCode })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  try {
    // Check for references in related tables
    const [salesForecasts, salesActuals, productionDeliveries] = await Promise.all([
      supabase.from('sales_forecasts').select('id').eq('channel_code', channelCode).limit(1),
      supabase.from('sales_actuals').select('id').eq('channel_code', channelCode).limit(1),
      supabase.from('production_deliveries').select('id').eq('channel_code', channelCode).limit(1),
    ])

    // Check if any references exist
    const hasReferences = [salesForecasts, salesActuals, productionDeliveries].some(
      (result) => result.data && result.data.length > 0
    )

    if (hasReferences) {
      return {
        success: false,
        error: '该渠道已有关联数据（销售预测、实际销售或交货记录），无法删除。建议使用"停用"功能。',
        canDeactivate: true,
      }
    }

    const { error } = await supabase.from('channels').delete().eq('channel_code', channelCode)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/settings')
    revalidatePath('/settings/channels')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除操作失败',
    }
  }
}

// Warehouse Actions
export async function createWarehouse(
  warehouse: WarehouseInsert
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = warehouseInsertSchema.safeParse(warehouse)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('warehouses').insert(validation.data)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/warehouses')
  return { success: true }
}

export async function updateWarehouse(
  id: string,
  updates: Partial<WarehouseInsert>
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate ID
  const idValidation = deleteByIdSchema.safeParse({ id })
  if (!idValidation.success) {
    return {
      success: false,
      error: `Validation error: ${idValidation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  // Validate updates
  const validation = warehouseUpdateSchema.safeParse(updates)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('warehouses')
    .update(validation.data)
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/warehouses')
  return { success: true }
}

export async function deleteWarehouse(
  id: string
): Promise<{ success: boolean; error?: string; canDeactivate?: boolean }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate ID
  const validation = deleteByIdSchema.safeParse({ id })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  try {
    // Check for references in related tables
    const [shipments, inventorySnapshots, orderArrivals] = await Promise.all([
      supabase.from('shipments').select('id').eq('destination_warehouse_id', id).limit(1),
      supabase.from('inventory_snapshots').select('id').eq('warehouse_id', id).limit(1),
      supabase.from('order_arrivals').select('id').eq('warehouse_id', id).limit(1),
    ])

    // Check if any references exist
    const hasReferences = [shipments, inventorySnapshots, orderArrivals].some(
      (result) => result.data && result.data.length > 0
    )

    if (hasReferences) {
      return {
        success: false,
        error: '该仓库已有关联数据（发运单、库存记录或到货记录），无法删除。建议使用"停用"功能。',
        canDeactivate: true,
      }
    }

    const { error } = await supabase.from('warehouses').delete().eq('id', id)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/settings')
    revalidatePath('/settings/warehouses')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除操作失败',
    }
  }
}

// Supplier Actions
export async function createSupplier(
  supplier: SupplierInsert
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate input
  const validation = supplierInsertSchema.safeParse(supplier)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('suppliers').insert(validation.data)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/suppliers')
  return { success: true }
}

export async function updateSupplier(
  id: string,
  updates: Partial<SupplierInsert>
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate ID
  const idValidation = deleteByIdSchema.safeParse({ id })
  if (!idValidation.success) {
    return {
      success: false,
      error: `Validation error: ${idValidation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  // Validate updates
  const validation = supplierUpdateSchema.safeParse(updates)
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('suppliers')
    .update(validation.data)
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/suppliers')
  return { success: true }
}

export async function deleteSupplier(
  id: string
): Promise<{ success: boolean; error?: string; canDeactivate?: boolean }> {
  const authResult = await requireAuth()
  if ('error' in authResult) {
    return { success: false, error: authResult.error }
  }

  // Validate ID
  const validation = deleteByIdSchema.safeParse({ id })
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.issues.map((e) => e.message).join(', ')}`,
    }
  }

  const supabase = await createServerSupabaseClient()

  try {
    // Check for references in related tables
    const { data: purchaseOrders } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('supplier_id', id)
      .limit(1)

    if (purchaseOrders && purchaseOrders.length > 0) {
      return {
        success: false,
        error: '该供应商已有关联的采购订单，无法删除。建议使用"停用"功能。',
        canDeactivate: true,
      }
    }

    const { error } = await supabase.from('suppliers').delete().eq('id', id)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/settings')
    revalidatePath('/settings/suppliers')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除操作失败',
    }
  }
}
