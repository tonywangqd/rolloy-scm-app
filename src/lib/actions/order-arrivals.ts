'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ================================================================
// TYPE DEFINITIONS
// ================================================================

export interface CreateOARequest {
  shipmentId: string
  warehouseId: string
  expectedQty: number
  receivedQty: number
  actualArrivalDate: string // YYYY-MM-DD
  plannedArrivalDate?: string | null
  varianceReason?: string | null
  remarks?: string | null
}

export interface CreateOAResponse {
  success: boolean
  data?: {
    id: string
    arrivalNumber: string
  }
  error?: string
}

export interface UpdateOARequest {
  id: string
  receivedQty?: number
  actualArrivalDate?: string
  varianceReason?: string | null
  remarks?: string | null
  status?: 'pending' | 'partial' | 'completed' | 'cancelled'
}

export interface UpdateOAResponse {
  success: boolean
  data?: {
    id: string
    arrivalNumber: string
  }
  error?: string
}

export interface OrderArrival {
  id: string
  arrival_number: string
  shipment_id: string
  warehouse_id: string
  planned_arrival_date: string | null
  actual_arrival_date: string | null
  arrival_week_iso: string | null
  expected_qty: number
  received_qty: number
  variance_qty: number
  variance_reason: string | null
  status: string
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface GetOrderArrivalsResponse {
  success: boolean
  data?: OrderArrival[]
  error?: string
}

// ================================================================
// SERVER ACTIONS
// ================================================================

/**
 * Create a new order arrival (OA) record
 * 创建到仓单
 *
 * @param req - Order arrival data
 * @returns Created OA with generated number
 */
export async function createOrderArrival(
  req: CreateOARequest
): Promise<CreateOAResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    // Generate OA number
    const { data: oaNumber, error: oaNumberError } = await supabase.rpc(
      'get_next_oa_number',
      { p_arrival_date: req.actualArrivalDate }
    )

    if (oaNumberError) {
      console.error('[createOrderArrival] OA number generation error:', oaNumberError)
      throw oaNumberError
    }

    // Insert OA record
    const { data, error } = await supabase
      .from('order_arrivals')
      .insert({
        arrival_number: oaNumber,
        shipment_id: req.shipmentId,
        warehouse_id: req.warehouseId,
        expected_qty: req.expectedQty,
        received_qty: req.receivedQty,
        actual_arrival_date: req.actualArrivalDate,
        planned_arrival_date: req.plannedArrivalDate,
        variance_reason: req.varianceReason,
        remarks: req.remarks,
        status: req.receivedQty >= req.expectedQty ? 'completed' : 'partial'
      })
      .select('id, arrival_number')
      .single()

    if (error) {
      console.error('[createOrderArrival] Insert error:', error)
      throw error
    }

    // Revalidate related paths
    revalidatePath('/logistics')
    revalidatePath('/inventory')

    return {
      success: true,
      data: {
        id: data.id,
        arrivalNumber: data.arrival_number
      }
    }
  } catch (error) {
    console.error('[createOrderArrival] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order arrival'
    }
  }
}

/**
 * Update an existing order arrival record
 * 更新到仓单
 *
 * @param req - Update data with OA ID
 * @returns Updated OA
 */
export async function updateOrderArrival(
  req: UpdateOARequest
): Promise<UpdateOAResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    const updateData: any = {}

    if (req.receivedQty !== undefined) updateData.received_qty = req.receivedQty
    if (req.actualArrivalDate !== undefined) updateData.actual_arrival_date = req.actualArrivalDate
    if (req.varianceReason !== undefined) updateData.variance_reason = req.varianceReason
    if (req.remarks !== undefined) updateData.remarks = req.remarks
    if (req.status !== undefined) updateData.status = req.status

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('order_arrivals')
      .update(updateData)
      .eq('id', req.id)
      .select('id, arrival_number')
      .single()

    if (error) {
      console.error('[updateOrderArrival] Error:', error)
      throw error
    }

    // Revalidate related paths
    revalidatePath('/logistics')
    revalidatePath('/inventory')

    return {
      success: true,
      data: {
        id: data.id,
        arrivalNumber: data.arrival_number
      }
    }
  } catch (error) {
    console.error('[updateOrderArrival] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update order arrival'
    }
  }
}

/**
 * Get order arrival by ID
 * 根据 ID 获取到仓单
 *
 * @param id - Order arrival ID
 * @returns Order arrival record
 */
export async function getOrderArrivalById(
  id: string
): Promise<{ success: boolean; data?: OrderArrival; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('order_arrivals')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('[getOrderArrivalById] Error:', error)
      throw error
    }

    return {
      success: true,
      data: data as OrderArrival
    }
  } catch (error) {
    console.error('[getOrderArrivalById] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get order arrival'
    }
  }
}

/**
 * Get order arrivals by shipment ID
 * 根据运单 ID 获取到仓单列表
 *
 * @param shipmentId - Shipment ID
 * @returns List of order arrivals for the shipment
 */
export async function getOrderArrivalsByShipment(
  shipmentId: string
): Promise<GetOrderArrivalsResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('order_arrivals')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('actual_arrival_date', { ascending: false })

    if (error) {
      console.error('[getOrderArrivalsByShipment] Error:', error)
      throw error
    }

    return {
      success: true,
      data: data as OrderArrival[]
    }
  } catch (error) {
    console.error('[getOrderArrivalsByShipment] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get order arrivals'
    }
  }
}

/**
 * Get all order arrivals with optional filters
 * 获取所有到仓单 (带筛选)
 *
 * @param filters - Optional filters
 * @returns List of order arrivals
 */
export async function getOrderArrivals(filters?: {
  warehouseId?: string
  status?: string
  startDate?: string
  endDate?: string
}): Promise<GetOrderArrivalsResponse> {
  try {
    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('order_arrivals')
      .select('*')
      .order('actual_arrival_date', { ascending: false })

    if (filters?.warehouseId) {
      query = query.eq('warehouse_id', filters.warehouseId)
    }
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.startDate) {
      query = query.gte('actual_arrival_date', filters.startDate)
    }
    if (filters?.endDate) {
      query = query.lte('actual_arrival_date', filters.endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getOrderArrivals] Error:', error)
      throw error
    }

    return {
      success: true,
      data: data as OrderArrival[]
    }
  } catch (error) {
    console.error('[getOrderArrivals] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get order arrivals'
    }
  }
}

/**
 * Delete an order arrival record
 * 删除到仓单
 *
 * @param id - Order arrival ID
 * @returns Success status
 */
export async function deleteOrderArrival(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('order_arrivals')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[deleteOrderArrival] Error:', error)
      throw error
    }

    // Revalidate related paths
    revalidatePath('/logistics')
    revalidatePath('/inventory')

    return {
      success: true
    }
  } catch (error) {
    console.error('[deleteOrderArrival] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete order arrival'
    }
  }
}
