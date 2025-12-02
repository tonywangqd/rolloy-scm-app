'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/check-auth'
import { revalidatePath } from 'next/cache'
import type { ProductInsert, ChannelInsert, WarehouseInsert, SupplierInsert } from '@/lib/types/database'
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

  const { error } = await supabase.from('products').delete().eq('sku', sku)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/products')
  return { success: true }
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
): Promise<{ success: boolean; error?: string }> {
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

  const { error } = await supabase.from('channels').delete().eq('channel_code', channelCode)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/channels')
  return { success: true }
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
): Promise<{ success: boolean; error?: string }> {
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

  const { error } = await supabase.from('warehouses').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/warehouses')
  return { success: true }
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
): Promise<{ success: boolean; error?: string }> {
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

  const { error } = await supabase.from('suppliers').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/suppliers')
  return { success: true }
}
