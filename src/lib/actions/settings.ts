'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProductInsert, ChannelInsert, WarehouseInsert, SupplierInsert } from '@/lib/types/database'

// Product Actions
export async function createProduct(
  product: ProductInsert
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('products').insert(product)

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
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('products')
    .update(updates)
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
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('channels').insert(channel)

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
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('channels')
    .update(updates)
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
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('warehouses').insert(warehouse)

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
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('warehouses')
    .update(updates)
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
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('suppliers').insert(supplier)

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
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('suppliers')
    .update(updates)
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
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('suppliers').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/settings/suppliers')
  return { success: true }
}
