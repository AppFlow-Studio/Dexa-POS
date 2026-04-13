import { getDeviceId } from '@/lib/deviceId'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import {
  AddOrderItemParams,
  AddOrderItemResult,
  CalculateOrderTaxResult,
  CalculateSplitPaymentResult,
  CreateOrderParams,
  DuplicateOrderItemResult,
  GetOrderItemResult,
  Order,
  OrderItemModifier,
  OrderStatus,
  ProcessPaymentResult,
  ProcessPaymentV2Params,
  ReplaceOrderItemModifiersResult,
  UpdateOrderItemParams,
  UpdateOrderItemQuantityResult,
  UpdateOrderItemResult
} from '@/types/db-order-management-types'
import { SupabaseClient } from '@supabase/supabase-js'

export type AddOpenItemParams = {
  p_order_id: string
  p_item_name: string
  p_unit_price: number
  p_quantity?: number
  p_special_instructions?: string | null
  p_is_tax_exempt?: boolean | null
  p_seat_number?: number | null
}

export type AddOpenItemResult = {
  success: boolean
  order_item_id: string
  item_name: string
  quantity: number
  unit_price: number
  cash_price: number
  subtotal: number
  cash_subtotal: number
  tax_rate: number
  tax_amount: number
  cash_tax_amount: number
}

export type UpdateOpenItemParams = {
  p_order_item_id: string
  p_quantity?: number | null
  p_unit_price?: number | null
  p_special_instructions?: string | null
  p_seat_number?: number | null
}

export type UpdateOpenItemResult = {
  success: boolean
  order_item_id: string
  quantity: number
  unit_price: number
  subtotal: number
}

export class OrderService {
  /**
   * Validates that the current station session is still active.
   * Returns true if valid, false if the session has been kicked/ended/expired.
   * On failure, logs a warning so the caller can handle appropriately.
   *
   * This is a lightweight guard to prevent kicked devices from continuing
   * to perform operations if all realtime kick channels failed.
   */
  static async ensureSessionValid (client: SupabaseClient): Promise<boolean> {
    try {
      const deviceId = getDeviceId()
      const sessionId = useStoreSettingsStore.getState().stationSessionId

      if (!deviceId || !sessionId) {
        // No active session - allow operation (might be during setup)
        return true
      }

      const { data, error } = await client.rpc('check_device_session_status', {
        p_device_id: deviceId,
        p_session_id: sessionId
      })

      if (error) {
        // Don't block on RPC errors (network issues) - fail open
        console.warn(
          '[OrderService] Session validation RPC error (allowing operation):',
          error.message
        )
        return true
      }

      const result = data as {
        is_valid: boolean
        status: string
        kicked_by?: string
        kick_reason?: string
      }

      if (!result.is_valid) {
        console.error(
          `[OrderService] SESSION INVALID - status: ${result.status}, ` +
            `kicked_by: ${result.kicked_by}. Blocking operation.`
        )
        return false
      }

      return true
    } catch (err) {
      // Fail open on unexpected errors
      console.warn(
        '[OrderService] Session guard error (allowing operation):',
        err
      )
      return true
    }
  }

  /**
   * Create a new order
   * @param client - Supabase client
   * @param params - CreateOrderParams
   * @returns { Promise<{ data: Order | null; error: any }> }
   * @description Creates a new order in the database Calls create_order rpc
   */
  static async createOrder (
    client: SupabaseClient,
    params: CreateOrderParams
  ): Promise<{ data: Order | null; error: any }> {
    // Session guard: prevent kicked devices from creating orders
    const sessionValid = await OrderService.ensureSessionValid(client)
    if (!sessionValid) {
      return {
        data: null,
        error: {
          message: 'Session has been kicked. Please log in again.',
          code: 'SESSION_KICKED'
        }
      }
    }

    const { data, error } = await client.rpc('create_order_v2', params)

    if (error) {
      console.error(`[OrderService:createOrder] FAILED:`, error)
    } else {
      const orderData = Array.isArray(data) ? data[0] : data
      if (__DEV__) console.log(`[OrderService:createOrder] SUCCESS!`)
      if (__DEV__)
        console.log(
          `[OrderService:createOrder] Order ID: ${
            orderData?.order_id || orderData?.id
          }`
        )
      if (__DEV__)
        console.log(
          `[OrderService:createOrder] Order Number: ${
            orderData?.order_number || orderData?.display_number
          }`
        )
    }

    return { data, error }
  }

  /**
   * Add an open item to an order via RPC add_open_item_v2
   */
  static async addOpenItem (
    client: SupabaseClient,
    params: AddOpenItemParams
  ): Promise<{ data: AddOpenItemResult | null; error: any }> {
    if (__DEV__)
      console.log(
        `[OrderService:addOpenItem] ====== ADDING OPEN ITEM ======`,
        params
      )
    const { data, error } = await client.rpc('add_open_item_v2', params)
    if (error || !data) {
      console.error(`[OrderService:addOpenItem] FAILED:`, error)
      return { data: data as any, error }
    }
    if (__DEV__)
      console.log(
        `[OrderService:addOpenItem] SUCCESS! order_item_id: ${data.order_item_id}`
      )
    return { data: data as AddOpenItemResult, error }
  }

  /**
   * Update an open item (price/qty/instructions) via RPC update_order_item_v2
   */
  static async updateOpenItem (
    client: SupabaseClient,
    params: UpdateOpenItemParams
  ): Promise<{ data: UpdateOpenItemResult | null; error: any }> {
    const { data, error } = await client.rpc('update_order_item_v2', params)
    if (error) {
      console.error(`[OrderService:updateOpenItem] FAILED:`, error)
    }
    return { data: data as UpdateOpenItemResult, error }
  }

  /**
   * Add an order-level discount (order_discounts insert)
   */
  static async addOrderDiscount (
    client: SupabaseClient,
    params: {
      order_id: string
      discount_id: string | null
      discount_type: 'percentage' | 'fixed_amount'
      discount_value: number
      source: 'preset' | 'open' | 'promo_code'
      calculated_amount: number
      pre_discount_subtotal: number
      applied_by_staff_profiles_id: string | null
      approved_by_staff_profiles_id?: string | null
      applied_at: string
      applied_to_item_ids?: string[] | null
    }
  ): Promise<{ data: any; error: any }> {
    if (__DEV__)
      console.log(`[OrderService:addOrderDiscount] order_id:`, params.order_id)
    if (__DEV__) console.log(client)
    if (__DEV__)
      console.log(
        `[OrderService:addOrderDiscount] ====== ADDING ORDER DISCOUNT `,
        params
      )

    const { data, error } = await client
      .from('order_discounts')
      .insert({
        order_id: params.order_id,
        discount_id: params.discount_id,
        discount_type: params.discount_type,
        discount_value: params.discount_value,
        source: params.source,
        calculated_amount: params.calculated_amount,
        pre_discount_subtotal: params.pre_discount_subtotal,
        applied_by_staff_profiles_id: params.applied_by_staff_profiles_id,
        approved_by_staff_profiles_id:
          params.approved_by_staff_profiles_id ?? null,
        applied_at: params.applied_at,
        applied_to_item_ids: params.applied_to_item_ids ?? null
      })
      .select()
      .single()
    return { data, error }
  }

  /**
   * Add an item to an order
   */
  static async addOrderItem (
    client: SupabaseClient,
    params: AddOrderItemParams
  ): Promise<{ data: AddOrderItemResult | null; error: any }> {
    if (__DEV__)
      console.log(`[OrderService:addOrderItem] ====== ADDING ITEM ======`)
    // console.log(`[OrderService:addOrderItem] Order: ${params.p_order_id}`);
    // console.log(`[OrderService:addOrderItem] Item: ${params.p_item_name}`);
    // console.log(`[OrderService:addOrderItem] Qty: ${params.p_quantity}, Price: ${params.p_unit_price}`);
    // console.log(`[OrderService:addOrderItem] ADD_ORDER_ITEM_V2:`, params);
    const { data, error } = await client.rpc('add_order_item_v2', params)

    if (error || !data) {
      console.error(`[OrderService:addOrderItem] FAILED:`, error)
      return { data, error }
    }

    // console.log(`[OrderService:addOrderItem] SUCCESS!`);
    // console.log(`[OrderService:addOrderItem] Item ID: ${data.order_item_id}`);

    return { data, error }
  }

  /**
   * Update the status of an order
   */
  static async updateOrderStatus (
    client: SupabaseClient,
    orderId: string,
    newStatus: OrderStatus,
    reason?: string
  ): Promise<{ data: Order | null; error: any }> {
    const { data, error } = await client.rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_reason: reason
    })
    return { data, error }
  }

  /**
   * Calculate tax for an order
   */
  static async calculateOrderTax (
    client: SupabaseClient,
    orderId: string
  ): Promise<{ data: CalculateOrderTaxResult | null; error: any }> {
    const { data, error } = await client.rpc('calculate_order_tax', {
      p_order_id: orderId
    })
    return { data, error }
  }

  /**
   * Process a payment for an order using process_payment_v2
   * Handles: Full card, Full cash, Split, Per-item payments
   */
  static async processPayment (
    client: SupabaseClient,
    params: ProcessPaymentV2Params
  ): Promise<{ data: ProcessPaymentResult | null; error: any }> {
    // Session guard: prevent kicked devices from processing payments
    const sessionValid = await OrderService.ensureSessionValid(client)
    if (!sessionValid) {
      return {
        data: null,
        error: {
          message: 'Session has been kicked. Please log in again.',
          code: 'SESSION_KICKED'
        }
      }
    }

    if (__DEV__)
      console.log(
        `[OrderService:processPayment] ====== CALLING process_payment_v8 ======`
      )
    if (__DEV__)
      console.log(`[OrderService:processPayment] Order: ${params.p_order_id}`)
    if (__DEV__)
      console.log(
        `[OrderService:processPayment] Method: ${params.p_payment_method}, Amount: ${params.p_amount}`
      )

    const { data, error } = await client.rpc('process_payment_v8', params)

    if (error) {
      console.error(`[OrderService:processPayment] FAILED:`, error)
    } else {
      if (__DEV__)
        console.log(
          `[OrderService:processPayment] SUCCESS:`,
          JSON.stringify(data, null, 2)
        )
    }

    return { data, error }
  }

  /**
   * Create a reversal record for a refund/void.
   */
  static async createReversal (
    client: SupabaseClient,
    params: {
      original_payment_id: string
      original_psp_reference: string | null
      reversal_reference_id: string | null
      reversal_type: string
      amount: number
      reason_code: string
      reason_description?: string | null
      initiated_by: string
      approved_by?: string | null
    }
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await client.rpc('create_reversal', {
      p_original_payment_id: params.original_payment_id,
      p_original_psp_reference: params.original_psp_reference,
      p_reversal_reference_id: params.reversal_reference_id,
      p_reversal_type: params.reversal_type,
      p_amount: params.amount,
      p_reason_code: params.reason_code,
      p_reason_description: params.reason_description ?? null,
      p_initiated_by: params.initiated_by,
      p_approved_by: params.approved_by ?? null
    })
    return { data, error }
  }

  /**
   * Update reversal status and terminal response.
   */
  static async updateReversalStatus (
    client: SupabaseClient,
    reversalId: string,
    status: 'pending' | 'completed' | 'failed',
    terminalResponse?: Record<string, unknown> | null,
    emvData?: Record<string, unknown> | null,
    resultCode?: string | null,
    responseMessage?: string | null,
    reversalPspReference?: string | null
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await client.rpc('update_reversal_status', {
      p_reversal_id: reversalId,
      p_status: status,
      p_terminal_response: terminalResponse ?? null,
      p_emv_data: emvData ?? null,
      p_result_code: resultCode ?? null,
      p_response_message: responseMessage ?? null,
      p_reversal_psp_reference: reversalPspReference ?? null
    })
    if (__DEV__) console.log('updateReversalStatus', data, error)
    return { data, error }
  }

  /**
   * Apply refund to payment totals and status.
   */
  static async applyRefundToPayment (
    client: SupabaseClient,
    paymentId: string,
    refundAmount: number,
    reversalType: 'void' | 'refund' | 'partial_refund' | 'item_return',
    returnDetails?: {
      rrn?: string
      authCode?: string
      referenceId?: string
      transactionNumber?: string
      reason?: string
      initiatedBy?: string
    }
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await client.rpc('apply_refund_to_payment', {
      p_payment_id: paymentId,
      p_refund_amount: refundAmount,
      p_reversal_type: reversalType,
      p_return_rrn: returnDetails?.rrn ?? null,
      p_return_auth_code: returnDetails?.authCode ?? null,
      p_return_reference_id: returnDetails?.referenceId ?? null,
      p_return_number: returnDetails?.transactionNumber ?? null,
      p_return_reason: returnDetails?.reason ?? null,
      p_initiated_by: returnDetails?.initiatedBy ?? null
    })
    if (__DEV__) console.log('applyRefundToPayment', data, error)
    return { data, error }
  }

  /**
   * Record refund line items and update order_items refunded totals.
   */
  static async recordRefundItems (
    client: SupabaseClient,
    reversalId: string,
    items: Array<Record<string, unknown>>
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await client.rpc('record_refund_items', {
      p_reversal_id: reversalId,
      p_items: items
    })
    return { data, error }
  }

  /**
   * Recalculate order payment status after refunds.
   */
  static async updateOrderPaymentStatusAfterRefund (
    client: SupabaseClient,
    orderId: string
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await client.rpc(
      'update_order_payment_status_after_refund',
      { p_order_id: orderId }
    )
    if (__DEV__) console.log('updateOrderPaymentStatusAfterRefund', data, error)
    return { data, error }
  }

  /**
   * Void an item in an order
   */
  static async voidOrderItem (
    client: SupabaseClient,
    orderItemId: string,
    reason: string
  ): Promise<{ data: boolean | null; error: any }> {
    const { data, error } = await client.rpc('void_order_item', {
      p_order_item_id: orderItemId,
      p_void_reason: reason
    })
    return { data, error }
  }

  /**
   * Void a payment (for split payment adjustments or cancellations)
   */
  static async voidPayment (
    client: SupabaseClient,
    paymentId: string,
    reason: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc('void_payment', {
      p_payment_id: paymentId,
      p_void_reason: reason
    })
    return { data, error }
  }

  /**
   * Void an entire order and cancel linked seated reservation(s) atomically.
   */
  static async voidOrder (
    client: SupabaseClient,
    orderId: string,
    voidReason?: string
  ): Promise<{ data: any; error: any }> {
    // Session guard: prevent kicked devices from voiding orders
    const sessionValid = await OrderService.ensureSessionValid(client)
    if (!sessionValid) {
      return {
        data: null,
        error: {
          message: 'Session has been kicked. Please log in again.',
          code: 'SESSION_KICKED'
        }
      }
    }

    const { data, error } = await client.rpc(
      'void_order_and_cancel_reservation',
      {
        p_order_id: orderId,
        p_void_reason: voidReason || 'Order cancelled'
      }
    )
    return { data, error }
  }

  /**
   * Calculate suggested split amounts for an order
   */
  static async calculateSplitPayment (
    client: SupabaseClient,
    orderId: string,
    splitCount: number
  ): Promise<{ data: CalculateSplitPaymentResult | null; error: any }> {
    const { data, error } = await client.rpc('calculate_split_payment', {
      p_order_id: orderId,
      p_split_count: splitCount
    })
    return { data, error }
  }

  /**
   * Get orders for a location
   */
  static async getOrders (
    client: SupabaseClient,
    locationId: string,
    statuses?: OrderStatus[]
  ): Promise<{ data: Order[] | null; error: any }> {
    let query = client
      .from('orders')
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        )
      `
      )
      .eq('location_id', locationId)
      .order('created_at', { ascending: false })

    if (statuses && statuses.length > 0) {
      query = query.in('status', statuses)
    }

    const { data, error } = await query
    return { data: data as Order[], error }
  }

  /**
   * Fetch orders with full history details (items, modifiers, payments, station, staff).
   * Used for Previous Orders / History view.
   */
  /**
   * Fetch business day bounds from the server.
   * Returns the start/end timestamptz for the given date window.
   * Pass null dates to get "today" computed from the merchant's timezone.
   */
  static async getBusinessDayBounds(
    client: SupabaseClient,
    locationId: string,
    startDate?: string | null,
    endDate?: string | null,
  ): Promise<{ start_ts: string; end_ts: string } | null> {
    const { data, error } = await client.rpc('get_business_day_bounds', {
      p_location_id: locationId,
      p_start_date: startDate ?? null,
      p_end_date: endDate ?? null,
    });
    if (error || !data || data.length === 0) {
      console.error('[OrderService] getBusinessDayBounds error:', error);
      return null;
    }
    return { start_ts: data[0].start_ts, end_ts: data[0].end_ts };
  }

  static async getHistoryOrders (
    client: SupabaseClient,
    locationId: string,
    limit: number = 50,
    statuses: OrderStatus[] | null = null,
    startTs?: string | null,
    endTs?: string | null,
  ): Promise<{ data: any[] | null; error: any }> {
    let query = client
      .from('orders')
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name)
      `
      )
      .eq('location_id', locationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (startTs) query = query.gte('created_at', startTs)
    if (endTs) query = query.lt('created_at', endTs)

    if (statuses && statuses.length > 0) {
      query = query.in('status', statuses)
    }

    const { data, error } = await query
    return { data, error }
  }

  /**
   * Fetch orders with pagination (offset-based) for infinite scroll history.
   * Same query as getHistoryOrders but uses .range() instead of .limit().
   */
  static async getHistoryOrdersPaginated (
    client: SupabaseClient,
    locationId: string,
    limit: number,
    offset: number,
    statuses: OrderStatus[] | null = null,
    startTs?: string | null,
    endTs?: string | null,
  ): Promise<{ data: any[] | null; error: any; hasMore: boolean }> {
    let query = client
      .from('orders')
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name)
      `
      )
      .eq('location_id', locationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (startTs) query = query.gte('created_at', startTs)
    if (endTs) query = query.lt('created_at', endTs)

    if (statuses && statuses.length > 0) {
      query = query.in('status', statuses)
    }

    const { data, error } = await query
    return { data, error, hasMore: (data?.length ?? 0) === limit }
  }

  /**
   * Fetch a single order by ID with all relations
   */
  static async fetchOrderById (
    client: SupabaseClient,
    orderId: string
  ): Promise<{ data: Order | null; error: any }> {
    const { data, error } = await client
      .from('orders')
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*)
      `
      )
      .eq('id', orderId)
      .single()

    return { data: data as Order, error }
  }

  // --- Order Item CRUD Methods ---

  /**
   * Update quantity of an order item (auto-recalculates subtotal)
   */
  static async updateOrderItemQuantity (
    client: SupabaseClient,
    orderItemId: string,
    quantity: number
  ): Promise<{ data: UpdateOrderItemQuantityResult | null; error: any }> {
    const { data, error } = await client.rpc('update_order_item_quantity_v2', {
      p_order_item_id: orderItemId,
      p_quantity: quantity
    })
    return { data, error }
  }

  /**
   * Update order item fields (instructions, station, price override, etc.)
   */
  static async updateOrderItem (
    client: SupabaseClient,
    params: UpdateOrderItemParams
  ): Promise<{ data: UpdateOrderItemResult | null; error: any }> {
    const { data, error } = await client.rpc('update_order_item_v2', params)
    return { data, error }
  }

  /**
   * Atomically replace all modifiers on an order item
   */
  static async replaceOrderItemModifiers (
    client: SupabaseClient,
    orderItemId: string,
    modifiers: OrderItemModifier[]
  ): Promise<{ data: ReplaceOrderItemModifiersResult | null; error: any }> {
    const { data, error } = await client.rpc(
      'replace_order_item_modifiers_v2',
      {
        p_order_item_id: orderItemId,
        p_modifiers: modifiers
      }
    )
    return { data, error }
  }

  /**
   * Add a single modifier to an order item
   */
  static async addOrderItemModifier (
    client: SupabaseClient,
    orderItemId: string,
    modifier: Omit<OrderItemModifier, 'id' | 'order_item_id' | 'total_price'>
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc('add_order_item_modifier', {
      p_order_item_id: orderItemId,
      p_modifier_group_id: modifier.modifier_group_id,
      p_modifier_item_id: modifier.modifier_item_id,
      p_modifier_group_name: modifier.modifier_group_name,
      p_modifier_name: modifier.modifier_name,
      p_price_modifier: modifier.price_modifier,
      p_quantity: modifier.quantity
    })
    return { data, error }
  }

  /**
   * Remove a single modifier from an order item
   */
  static async removeOrderItemModifier (
    client: SupabaseClient,
    modifierId: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc('remove_order_item_modifier', {
      p_modifier_id: modifierId
    })
    return { data, error }
  }

  /**
   * Get order item with full details and modifiers
   */
  static async getOrderItem (
    client: SupabaseClient,
    orderItemId: string
  ): Promise<{ data: GetOrderItemResult | null; error: any }> {
    const { data, error } = await client.rpc('get_order_item', {
      p_order_item_id: orderItemId
    })
    return { data, error }
  }

  /**
   * Duplicate an order item (copies modifiers too)
   */
  static async duplicateOrderItem (
    client: SupabaseClient,
    orderItemId: string,
    quantity?: number
  ): Promise<{ data: DuplicateOrderItemResult | null; error: any }> {
    const { data, error } = await client.rpc('duplicate_order_item', {
      p_order_item_id: orderItemId,
      p_quantity: quantity
    })
    return { data, error }
  }

  // --- Remove & Void Operations ---

  /**
   * Remove an order item (hard delete - for draft/pending orders only)
   */
  static async removeOrderItem (
    client: SupabaseClient,
    orderItemId: string
  ): Promise<{ data: any; error: any }> {
    if (__DEV__) console.log('we are removing it hard ')

    const { data, error } = await client.rpc('remove_order_item', {
      p_order_item_id: orderItemId
    })
    return { data, error }
  }

  /**
   * Remove multiple order items in batch (hard delete - for draft/pending orders only)
   */
  static async removeOrderItemsBatch (
    client: SupabaseClient,
    orderItemIds: string[]
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc('remove_order_items_batch', {
      p_order_item_ids: orderItemIds
    })
    return { data, error }
  }

  /**
   * Clear all items from an order (hard delete - for draft/pending orders only)
   */
  static async clearOrderItems (
    client: SupabaseClient,
    orderId: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc('clear_order_items', {
      p_order_id: orderId
    })
    return { data, error }
  }

  /**
   * Cancel an order (hard delete for draft/pending, void for confirmed)
   */
  static async cancelOrder (
    client: SupabaseClient,
    orderId: string,
    cancelReason?: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc('cancel_order', {
      p_order_id: orderId,
      p_cancel_reason: cancelReason || 'Customer cancelled'
    })
    return { data, error }
  }

  // --- Kitchen Status Operations ---

  /**
   * Bulk update order item statuses (for Send to Kitchen / Fire Course)
   * Automatically handles sent_to_kitchen_at and updated_at timestamps
   */
  static async bulkUpdateOrderItemStatus (
    client: SupabaseClient,
    orderItemIds: string[],
    status: 'sent' | 'preparing' | 'ready' | 'served',
    staffId?: string
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null }
    }
    const { data, error } = await client.rpc('bulk_update_order_item_status', {
      p_order_item_ids: orderItemIds,
      p_status: status,
      p_staff_id: staffId
    })
    return { data, error }
  }

  /**
   * Recall KDS items — resets kitchen_status to 'sent' and clears KDS item status records.
   */
  static async recallOrderItems (
    client: SupabaseClient,
    orderItemIds: string[],
    targetStatus: string = 'sent'
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null }
    }
    const { data, error } = await client.rpc('recall_kds_items', {
      p_order_item_ids: orderItemIds,
      p_target_status: targetStatus
    })
    return { data, error }
  }

  /**
   * Toggle rush flag on order items.
   */
  static async toggleRushOnItems (
    client: SupabaseClient,
    orderItemIds: string[],
    rush: boolean
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null }
    }
    const { data, error } = await client.rpc('toggle_rush_order_items', {
      p_order_item_ids: orderItemIds,
      p_rush: rush
    })
    return { data, error }
  }

  /**
   * Toggle priority flag on order items.
   */
  static async togglePriorityOnItems (
    client: SupabaseClient,
    orderItemIds: string[],
    isPrioritized: boolean
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null }
    }
    const { data, error } = await client.rpc('toggle_priority_order_items', {
      p_order_item_ids: orderItemIds,
      p_is_prioritized: isPrioritized
    })
    return { data, error }
  }

  /**
   * Fetch pre-grouped KDS tickets from the server (denormalized)
   */
  static async getKDSTickets (
    client: SupabaseClient,
    locationId: string,
    statuses?: string[],
    kdsDisplayId?: string
  ): Promise<{ data: any; error: any }> {
    const params: Record<string, any> = { p_location_id: locationId }
    if (statuses) {
      params.p_statuses = statuses
    }
    if (kdsDisplayId) {
      params.p_kds_display_id = kdsDisplayId
    }
    const { data, error } = await client.rpc('get_kds_tickets_v2', params)
    return { data, error }
  }

  // ============================================
  // Phase 6: Conflict Detection & Payment Locking
  // ============================================

  /**
   * Update an order with version checking (optimistic locking)
   * Returns VERSION_CONFLICT error if expected_version doesn't match current
   */
  static async updateOrderWithVersion (
    client: SupabaseClient,
    orderId: string,
    expectedVersion: number,
    updates?: {
      customer_name?: string
      customer_phone?: string
      special_instructions?: string
      status?: string
    }
  ): Promise<{
    data: {
      success: boolean
      error?: string
      message?: string
      new_version?: number
      current_version?: number
      expected_version?: number
    } | null
    error: any
  }> {
    const { data, error } = await client.rpc('update_order_with_version', {
      p_order_id: orderId,
      p_expected_version: expectedVersion,
      p_updates: updates ? updates : null
    })
    return { data, error }
  }

  /**
   * Lock an order for payment processing
   * Prevents other stations from modifying the order during payment
   */
  static async lockOrderForPayment (
    client: SupabaseClient,
    orderId: string,
    expectedVersion: number,
    stationId: string,
    lockDurationSeconds: number = 60
  ): Promise<{
    data: {
      success: boolean
      error?: string
      message?: string
      lock_expires_at?: string
      sync_version?: number
      current_version?: number
      locked_by_station?: string
    } | null
    error: any
  }> {
    const { data, error } = await client.rpc('lock_order_for_payment', {
      p_order_id: orderId,
      p_expected_version: expectedVersion,
      p_station_id: stationId,
      p_lock_duration_seconds: lockDurationSeconds
    })
    return { data, error }
  }

  /**
   * Unlock an order after payment processing
   */
  static async unlockOrderForPayment (
    client: SupabaseClient,
    orderId: string,
    stationId: string
  ): Promise<{
    data: {
      success: boolean
      error?: string
      message?: string
    } | null
    error: any
  }> {
    const { data, error } = await client.rpc('unlock_order_for_payment', {
      p_order_id: orderId,
      p_station_id: stationId
    })
    return { data, error }
  }

  /**
   * Check if an order is currently locked for payment
   */
  static async isOrderLocked (
    client: SupabaseClient,
    orderId: string
  ): Promise<{
    data: {
      success: boolean
      is_locked?: boolean
      locked_by_station?: string
      lock_expires_at?: string
      sync_version?: number
      error?: string
    } | null
    error: any
  }> {
    const { data, error } = await client.rpc('is_order_locked', {
      p_order_id: orderId
    })
    return { data, error }
  }

  /**
   * Close a check after full payment
   * @param client - Supabase client
   * @param orderId - Order database ID (UUID)
   * @param staffId - Optional staff ID performing the action
   * @returns Promise<{ success: boolean; error?: string }>
   */
  static async closeCheck (
    client: SupabaseClient,
    orderId: string,
    staffId?: string | null
  ): Promise<{ success: boolean; error?: string }> {
    if (__DEV__)
      console.log(`[OrderService:closeCheck] ====== CLOSING CHECK ======`)
    if (__DEV__) console.log(`[OrderService:closeCheck] Order ID: ${orderId}`)
    if (__DEV__)
      console.log(`[OrderService:closeCheck] Staff ID: ${staffId || 'none'}`)

    const { data, error } = await client.rpc('close_check', {
      p_order_id: orderId,
      p_staff_id: staffId || null
    })

    if (error) {
      console.error('[OrderService:closeCheck] RPC error:', error)
      return { success: false, error: error.message }
    }

    const result = data as { success: boolean; error?: string }
    if (!result.success) {
      console.error('[OrderService:closeCheck] Failed:', result.error)
    } else {
      if (__DEV__) console.log('[OrderService:closeCheck] SUCCESS!')
    }

    return result
  }

  /**
   * Reopen a closed check to add more items
   * @param client - Supabase client
   * @param orderId - Order database ID (UUID)
   * @param staffId - Staff ID performing the action (required)
   * @param reason - Optional reason for reopening
   * @returns Promise<{ success: boolean; error?: string }>
   */
  static async reopenCheck (
    client: SupabaseClient,
    orderId: string,
    staffId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (__DEV__)
      console.log(`[OrderService:reopenCheck] ====== REOPENING CHECK ======`)
    if (__DEV__) console.log(`[OrderService:reopenCheck] Order ID: ${orderId}`)
    if (__DEV__) console.log(`[OrderService:reopenCheck] Staff ID: ${staffId}`)
    if (__DEV__)
      console.log(
        `[OrderService:reopenCheck] Reason: ${reason || 'No reason provided'}`
      )

    const { data, error } = await client.rpc('reopen_check', {
      p_order_id: orderId,
      p_staff_id: staffId,
      p_reason: reason || null
    })

    if (error) {
      console.error('[OrderService:reopenCheck] RPC error:', error)
      return { success: false, error: error.message }
    }

    const result = data as { success: boolean; error?: string }
    if (!result.success) {
      console.error('[OrderService:reopenCheck] Failed:', result.error)
    } else {
      if (__DEV__) console.log('[OrderService:reopenCheck] SUCCESS!')
    }

    return result
  }
}
