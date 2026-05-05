import { getDeviceId } from "@/lib/deviceId";
import { DEADLINES } from "@/lib/network/deadlines";
import {
    rpcWithIdempotency,
    withIdempotency,
} from "@/lib/network/idempotencyKey";
import { runWithDeadline as _runWithDeadline } from "@/lib/network/runWithDeadline";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
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
    UpdateOrderItemResult,
} from "@/types/db-order-management-types";
import { SupabaseClient } from "@supabase/supabase-js";

export type AddOpenItemParams = {
  p_order_id: string;
  p_item_name: string;
  p_unit_price: number;
  p_quantity?: number;
  p_special_instructions?: string | null;
  p_is_tax_exempt?: boolean | null;
  p_seat_number?: number | null;
  // Wave 1.2 station-ownership guard — see assert_order_station_match.sql.
  // Pass the cashier's selectedStation.id; null/undefined = bypass.
  p_station_id?: string | null;
};

export type AddOpenItemResult = {
  success: boolean;
  order_item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  cash_price: number;
  subtotal: number;
  cash_subtotal: number;
  tax_rate: number;
  tax_amount: number;
  cash_tax_amount: number;
};

export type UpdateOpenItemParams = {
  p_order_item_id: string;
  p_quantity?: number | null;
  p_unit_price?: number | null;
  p_special_instructions?: string | null;
  p_seat_number?: number | null;
};

export type UpdateOpenItemResult = {
  success: boolean;
  order_item_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export class OrderService {
  /**
   * Validates that the current station session is still active.
   * Returns true if valid, false if the session has been kicked/ended/expired.
   * On failure, logs a warning so the caller can handle appropriately.
   *
   * This is a lightweight guard to prevent kicked devices from continuing
   * to perform operations if all realtime kick channels failed.
   */
  static async ensureSessionValid(client: SupabaseClient): Promise<boolean> {
    try {
      const deviceId = getDeviceId();
      const sessionId = useStoreSettingsStore.getState().stationSessionId;

      if (!deviceId || !sessionId) {
        // No active session - allow operation (might be during setup)
        return true;
      }

      const { data, error } = await client.rpc("check_device_session_status", {
        p_device_id: deviceId,
        p_session_id: sessionId,
      });

      if (error) {
        // Don't block on RPC errors (network issues) - fail open
        console.warn(
          "[OrderService] Session validation RPC error (allowing operation):",
          error.message,
        );
        return true;
      }

      const result = data as {
        is_valid: boolean;
        status: string;
        kicked_by?: string;
        kick_reason?: string;
      };

      if (!result.is_valid) {
        console.error(
          `[OrderService] SESSION INVALID - status: ${result.status}, ` +
            `kicked_by: ${result.kicked_by}. Blocking operation.`,
        );
        return false;
      }

      return true;
    } catch (err) {
      // Fail open on unexpected errors
      console.warn(
        "[OrderService] Session guard error (allowing operation):",
        err,
      );
      return true;
    }
  }

  /**
   * Create a new order
   * @param client - Supabase client
   * @param params - CreateOrderParams
   * @returns { Promise<{ data: Order | null; error: any }> }
   * @description Creates a new order in the database Calls create_order rpc
   */
  static async createOrder(
    client: SupabaseClient,
    params: CreateOrderParams,
  ): Promise<{ data: Order | null; error: any }> {
    // Session guard: prevent kicked devices from creating orders
    const sessionValid = await OrderService.ensureSessionValid(client);
    if (!sessionValid) {
      return {
        data: null,
        error: {
          message: "Session has been kicked. Please log in again.",
          code: "SESSION_KICKED",
        },
      };
    }

    const { data, error } = await rpcWithIdempotency<Order>(
      client,
      "create_order",
      "create_order_v2",
      "create_order_v3",
      params,
      { deadline: DEADLINES.closeCheck },
    );

    if (error) {
      console.error(`[OrderService:createOrder] FAILED:`, error);
    } else {
      const orderData = Array.isArray(data) ? data[0] : data;
      if (__DEV__) console.log(`[OrderService:createOrder] SUCCESS!`);
      if (__DEV__)
        console.log(
          `[OrderService:createOrder] Order ID: ${
            orderData?.order_id || orderData?.id
          }`,
        );
      if (__DEV__)
        console.log(
          `[OrderService:createOrder] Order Number: ${
            orderData?.order_number || orderData?.display_number
          }`,
        );
    }

    return { data, error };
  }

  /**
   * Add an open item to an order via RPC add_open_item_v2
   */
  static async addOpenItem(
    client: SupabaseClient,
    params: AddOpenItemParams,
    opts?: { keyOverride?: string },
  ): Promise<{ data: AddOpenItemResult | null; error: any }> {
    if (__DEV__)
      console.log(
        `[OrderService:addOpenItem] ====== ADDING OPEN ITEM ======`,
        params,
      );
    const { data, error } = await rpcWithIdempotency<AddOpenItemResult>(
      client,
      "add_open_item",
      "add_open_item_v2",
      "add_open_item_v3",
      params,
      { deadline: DEADLINES.hotMutation, keyOverride: opts?.keyOverride },
    );
    if (error || !data) {
      console.error(`[OrderService:addOpenItem] FAILED:`, error);
      return { data: data as any, error };
    }
    if (__DEV__)
      console.log(
        `[OrderService:addOpenItem] SUCCESS! order_item_id: ${data.order_item_id}`,
      );
    return { data: data as AddOpenItemResult, error };
  }

  /**
   * Update an open item (price/qty/instructions) via RPC update_order_item_v2
   */
  static async updateOpenItem(
    client: SupabaseClient,
    params: UpdateOpenItemParams,
  ): Promise<{ data: UpdateOpenItemResult | null; error: any }> {
    const { data, error } = await client.rpc("update_order_item_v2", params);
    if (error) {
      console.error(`[OrderService:updateOpenItem] FAILED:`, error);
    }
    return { data: data as UpdateOpenItemResult, error };
  }

  /**
   * Add an order-level discount (order_discounts insert)
   */
  static async addOrderDiscount(
    client: SupabaseClient,
    params: {
      order_id: string;
      discount_id: string | null;
      discount_type: "percentage" | "fixed_amount";
      discount_value: number;
      source: "preset" | "open" | "promo_code";
      calculated_amount: number;
      pre_discount_subtotal: number;
      applied_by_staff_profiles_id: string | null;
      approved_by_staff_profiles_id?: string | null;
      applied_at: string;
      applied_to_item_ids?: string[] | null;
    },
  ): Promise<{ data: any; error: any }> {
    if (__DEV__)
      console.log(`[OrderService:addOrderDiscount] order_id:`, params.order_id);
    if (__DEV__) console.log(client);
    if (__DEV__)
      console.log(
        `[OrderService:addOrderDiscount] ====== ADDING ORDER DISCOUNT `,
        params,
      );

    const { data, error } = await client
      .from("order_discounts")
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
        applied_to_item_ids: params.applied_to_item_ids ?? null,
      })
      .select()
      .single();
    return { data, error };
  }

  /**
   * Add an item to an order
   */
  static async addOrderItem(
    client: SupabaseClient,
    params: AddOrderItemParams,
    opts?: { keyOverride?: string },
  ): Promise<{ data: AddOrderItemResult | null; error: any }> {
    if (__DEV__)
      console.log(`[OrderService:addOrderItem] ====== ADDING ITEM ======`);
    const { data, error } = await rpcWithIdempotency<AddOrderItemResult>(
      client,
      "add_order_item",
      "add_order_item_v2",
      "add_order_item_v3",
      params,
      { deadline: DEADLINES.hotMutation, keyOverride: opts?.keyOverride },
    );

    if (error || !data) {
      console.error(`[OrderService:addOrderItem] FAILED:`, error);
      return { data, error };
    }

    // console.log(`[OrderService:addOrderItem] SUCCESS!`);
    // console.log(`[OrderService:addOrderItem] Item ID: ${data.order_item_id}`);

    return { data, error };
  }

  /**
   * Update the status of an order
   */
  static async updateOrderStatus(
    client: SupabaseClient,
    orderId: string,
    newStatus: OrderStatus,
    reason?: string,
  ): Promise<{ data: Order | null; error: any }> {
    return _runWithDeadline<Order>(
      "update_order_status",
      DEADLINES.sendToKitchen,
      async (signal) => {
        const { data, error } = await client
          .rpc("update_order_status", {
            p_order_id: orderId,
            p_new_status: newStatus,
            p_reason: reason,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Calculate tax for an order
   */
  static async calculateOrderTax(
    client: SupabaseClient,
    orderId: string,
  ): Promise<{ data: CalculateOrderTaxResult | null; error: any }> {
    const { data, error } = await client.rpc("calculate_order_tax", {
      p_order_id: orderId,
    });
    return { data, error };
  }

  /**
   * Claim ownership of an order from another station (Lever 2).
   *
   * Atomic optimistic-concurrency UPDATE on `orders.station_id`. The server
   * RPC `claim_order_v1` does the work; this wrapper just shapes the response.
   *
   * `expectedStationId` should be the order's current `station_id` as this
   * device sees it. If a concurrent claim has moved it elsewhere, the RPC
   * returns `CONCURRENT_CLAIM` and the caller should refresh.
   */
  static async claimOrder(
    client: SupabaseClient,
    params: {
      orderId: string;
      stationId: string;
      expectedStationId: string | null;
    },
  ): Promise<
    | {
        data: {
          success: true;
          order_id: string;
          new_station_id: string;
          sync_version: number;
        };
        error: null;
      }
    | {
        data: {
          success: false;
          error:
            | "ORDER_NOT_FOUND"
            | "ORDER_FINALIZED"
            | "ORDER_LOCKED_FOR_PAYMENT"
            | "CONCURRENT_CLAIM";
          [key: string]: any;
        };
        error: null;
      }
    | { data: null; error: any }
  > {
    return _runWithDeadline<any>(
      "claim_order_v1",
      DEADLINES.read,
      async (signal) => {
        const { data, error } = await client
          .rpc("claim_order_v1", {
            p_order_id: params.orderId,
            p_station_id: params.stationId,
            p_expected_station_id: params.expectedStationId,
          })
          .abortSignal(signal);
        return { data, error };
      },
    ) as any;
  }

  /**
   * Process a payment for an order.
   * Wave Cat-B: routed v8↔v9 by `process_payment` feature flag, deadline-wrapped
   * (DEADLINES.paymentRpc). Pass `opts.keyOverride` to reuse an existing
   * idempotency key (paymentJournal.idempotencyKey or queue op key).
   *
   * Handles: Full card, Full cash, Split, Per-item payments.
   */
  static async processPayment(
    client: SupabaseClient,
    params: ProcessPaymentV2Params,
    opts?: { keyOverride?: string },
  ): Promise<{ data: ProcessPaymentResult | null; error: any }> {
    // Session guard: prevent kicked devices from processing payments
    const sessionValid = await OrderService.ensureSessionValid(client);
    if (!sessionValid) {
      return {
        data: null,
        error: {
          message: "Session has been kicked. Please log in again.",
          code: "SESSION_KICKED",
        },
      };
    }

    if (__DEV__) {
      console.log(
        `[OrderService:processPayment] ====== CALLING process_payment ======`,
      );
      console.log(`[OrderService:processPayment] Order: ${params.p_order_id}`);
      console.log(
        `[OrderService:processPayment] Method: ${params.p_payment_method}, Amount: ${params.p_amount}`,
      );
    }

    const { data, error } = await rpcWithIdempotency<ProcessPaymentResult>(
      client,
      "process_payment",
      // Fallback (flag off): v9 — Cat-B idempotency without platform fees.
      // Primary  (flag on): v10 — adds dual_pricing_fee / tip_fee tracking.
      "process_payment_v9",
      "process_payment_v10",
      params,
      {
        deadline: DEADLINES.paymentRpc,
        keyOverride: opts?.keyOverride,
      },
    );

    if (error) {
      console.error(`[OrderService:processPayment] FAILED:`, error);
    } else {
      if (__DEV__)
        console.log(
          `[OrderService:processPayment] SUCCESS:`,
          JSON.stringify(data, null, 2),
        );
    }

    return { data, error };
  }

  /**
   * Create a reversal record for a refund/void.
   */
  static async createReversal(
    client: SupabaseClient,
    params: {
      original_payment_id: string;
      original_psp_reference: string | null;
      reversal_reference_id: string | null;
      reversal_type: string;
      amount: number;
      reason_code: string;
      reason_description?: string | null;
      initiated_by: string;
      approved_by?: string | null;
    },
    opts?: { keyOverride?: string },
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await rpcWithIdempotency(
      client,
      "create_reversal",
      "create_reversal",
      "create_reversal_v2",
      {
        p_original_payment_id: params.original_payment_id,
        p_original_psp_reference: params.original_psp_reference,
        p_reversal_reference_id: params.reversal_reference_id,
        p_reversal_type: params.reversal_type,
        p_amount: params.amount,
        p_reason_code: params.reason_code,
        p_reason_description: params.reason_description ?? null,
        p_initiated_by: params.initiated_by,
        p_approved_by: params.approved_by ?? null,
      },
      { deadline: DEADLINES.read, keyOverride: opts?.keyOverride },
    );
    return { data, error };
  }

  /**
   * Update reversal status and terminal response.
   * Wave R-0: opts.keyOverride threads the refund journal's idempotency key
   * so retries on bad-WiFi do not overwrite an already-completed row.
   */
  static async updateReversalStatus(
    client: SupabaseClient,
    reversalId: string,
    status: "pending" | "completed" | "failed",
    terminalResponse?: Record<string, unknown> | null,
    emvData?: Record<string, unknown> | null,
    resultCode?: string | null,
    responseMessage?: string | null,
    reversalPspReference?: string | null,
    opts?: { keyOverride?: string },
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await rpcWithIdempotency(
      client,
      "update_reversal_status",
      "update_reversal_status",
      "update_reversal_status_v2",
      {
        p_reversal_id: reversalId,
        p_status: status,
        p_terminal_response: terminalResponse ?? null,
        p_emv_data: emvData ?? null,
        p_result_code: resultCode ?? null,
        p_response_message: responseMessage ?? null,
        p_reversal_psp_reference: reversalPspReference ?? null,
      },
      { deadline: DEADLINES.read, keyOverride: opts?.keyOverride },
    );
    if (__DEV__) console.log("updateReversalStatus", data, error);
    return { data, error };
  }

  /**
   * Apply refund to payment totals and status.
   * @param restorePaidQuantity - When true, decrements paid_quantity on order_items
   *   via order_payment_items junction (like void_payment does). Used for full payment voids.
   */
  static async applyRefundToPayment(
    client: SupabaseClient,
    paymentId: string,
    refundAmount: number,
    reversalType: "void" | "refund" | "partial_refund" | "item_return",
    returnDetails?: {
      rrn?: string;
      authCode?: string;
      referenceId?: string;
      transactionNumber?: string;
      reason?: string;
      initiatedBy?: string;
    },
    options?: {
      restorePaidQuantity?: boolean;
      /** Subtotal portion of refund (defaults to refundAmount). Pass when
       *  splitting tip vs subtotal so v3 can decompose tip_fee correctly. */
      tipRefundAmount?: number;
    },
    opts?: { keyOverride?: string },
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await rpcWithIdempotency(
      client,
      "apply_refund_to_payment",
      // Fallback: v2 (no platform-fee fields).
      // Primary:  v3 (proportional refunded_dual_pricing_fee / refunded_tip_fee).
      "apply_refund_to_payment_v2",
      "apply_refund_to_payment_v3",
      {
        p_payment_id: paymentId,
        p_refund_amount: refundAmount,
        p_reversal_type: reversalType,
        p_tip_refund_amount: options?.tipRefundAmount ?? 0,
        p_return_rrn: returnDetails?.rrn ?? null,
        p_return_auth_code: returnDetails?.authCode ?? null,
        p_return_reference_id: returnDetails?.referenceId ?? null,
        p_return_number: returnDetails?.transactionNumber ?? null,
        p_return_reason: returnDetails?.reason ?? null,
        p_initiated_by: returnDetails?.initiatedBy ?? null,
        p_restore_paid_quantity: options?.restorePaidQuantity ?? false,
      },
      { deadline: DEADLINES.read, keyOverride: opts?.keyOverride },
    );
    if (__DEV__) console.log("applyRefundToPayment", data, error);
    return { data, error };
  }

  /**
   * Record refund line items and update order_items refunded totals.
   * @param skipQuantityUpdate - When true, skips incrementing refunded_quantity on order_items.
   *   Used for full payment voids where paid_quantity is restored instead.
   */
  static async recordRefundItems(
    client: SupabaseClient,
    reversalId: string,
    items: Array<Record<string, unknown>>,
    skipQuantityUpdate: boolean = false,
    opts?: { keyOverride?: string },
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await rpcWithIdempotency(
      client,
      "record_refund_items",
      "record_refund_items",
      "record_refund_items_v2",
      {
        p_reversal_id: reversalId,
        p_items: items,
        p_skip_quantity_update: skipQuantityUpdate,
      },
      { deadline: DEADLINES.read, keyOverride: opts?.keyOverride },
    );
    return { data, error };
  }

  /**
   * Recalculate order payment status after refunds.
   * Wave R-0: opts.keyOverride threads the refund journal's idempotency key
   * so a DEADLINE_EXCEEDED on this final step doesn't cause double-status-flip.
   */
  static async updateOrderPaymentStatusAfterRefund(
    client: SupabaseClient,
    orderId: string,
    opts?: { keyOverride?: string },
  ): Promise<{ data: any | null; error: any }> {
    const { data, error } = await rpcWithIdempotency(
      client,
      "update_order_payment_status_after_refund",
      "update_order_payment_status_after_refund",
      "update_order_payment_status_after_refund_v3",
      { p_order_id: orderId },
      { deadline: DEADLINES.read, keyOverride: opts?.keyOverride },
    );
    if (__DEV__)
      console.log("updateOrderPaymentStatusAfterRefund", data, error);
    return { data, error };
  }

  /**
   * Void an item in an order
   */
  static async voidOrderItem(
    client: SupabaseClient,
    orderItemId: string,
    reason: string,
  ): Promise<{ data: boolean | null; error: any }> {
    return _runWithDeadline<boolean>(
      "void_order_item",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("void_order_item", {
            p_order_item_id: orderItemId,
            p_void_reason: reason,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Void a payment (for split payment adjustments or cancellations)
   */
  static async voidPayment(
    client: SupabaseClient,
    paymentId: string,
    reason: string,
  ): Promise<{ data: any; error: any }> {
    return _runWithDeadline<any>(
      "void_payment",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("void_payment", {
            p_payment_id: paymentId,
            p_void_reason: reason,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Wave 2.4: server-guarded order-details update.
   *
   * Replaces four raw `.from('orders').update()` sites in
   * `useOrderStore.updateActiveOrderDetails`. The boolean flags let the
   * caller explicitly clear a field (set null) without a sentinel —
   * COALESCE alone would treat null as "preserve". Callers should set
   * the flag for any block they want to mutate and pass null/undefined
   * for fields within that block they want to clear.
   *
   * Pass `selectedStation.id` for cross-station ownership enforcement.
   * Null is permissive (back-compat) and matches the helper's contract.
   */
  static async updateOrderDetails(
    client: SupabaseClient,
    orderId: string,
    stationId: string | null,
    updates: {
      customer?: {
        id: string | null;
        name: string | null;
        phone: string | null;
        email: string | null;
      };
      orderType?: string | null;
      deliveryAddress?: string | null;
      notes?: string | null;
    },
  ): Promise<{ data: any; error: any }> {
    return _runWithDeadline<any>(
      "update_order_details_v1",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("update_order_details_v1", {
            p_order_id: orderId,
            p_station_id: stationId,
            p_update_customer: updates.customer !== undefined,
            p_customer_id: updates.customer?.id ?? null,
            p_customer_name: updates.customer?.name ?? null,
            p_customer_phone: updates.customer?.phone ?? null,
            p_customer_email: updates.customer?.email ?? null,
            p_update_order_type: updates.orderType !== undefined,
            p_order_type: updates.orderType ?? null,
            p_update_delivery_address: updates.deliveryAddress !== undefined,
            p_delivery_address: updates.deliveryAddress ?? null,
            p_update_notes: updates.notes !== undefined,
            p_notes: updates.notes ?? null,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Void an entire order and cancel linked seated reservation(s) atomically.
   */
  static async voidOrder(
    client: SupabaseClient,
    orderId: string,
    voidReason?: string,
  ): Promise<{ data: any; error: any }> {
    // Session guard: prevent kicked devices from voiding orders
    const sessionValid = await OrderService.ensureSessionValid(client);
    if (!sessionValid) {
      return {
        data: null,
        error: {
          message: "Session has been kicked. Please log in again.",
          code: "SESSION_KICKED",
        },
      };
    }

    return _runWithDeadline<any>(
      "void_order",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("void_order_and_cancel_reservation", {
            p_order_id: orderId,
            p_void_reason: voidReason || "Order cancelled",
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Calculate suggested split amounts for an order
   */
  static async calculateSplitPayment(
    client: SupabaseClient,
    orderId: string,
    splitCount: number,
  ): Promise<{ data: CalculateSplitPaymentResult | null; error: any }> {
    const { data, error } = await client.rpc("calculate_split_payment", {
      p_order_id: orderId,
      p_split_count: splitCount,
    });
    return { data, error };
  }

  /**
   * Get orders for a location
   */
  static async getOrders(
    client: SupabaseClient,
    locationId: string,
    statuses?: OrderStatus[],
  ): Promise<{ data: Order[] | null; error: any }> {
    let query = client
      .from("orders")
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        )
      `,
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    const { data, error } = await query;
    return { data: data as Order[], error };
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
    const { data, error } = await client.rpc("get_business_day_bounds", {
      p_location_id: locationId,
      p_start_date: startDate ?? null,
      p_end_date: endDate ?? null,
    });
    if (error || !data || data.length === 0) {
      console.error("[OrderService] getBusinessDayBounds error:", error);
      return null;
    }
    return { start_ts: data[0].start_ts, end_ts: data[0].end_ts };
  }

  static async getHistoryOrders(
    client: SupabaseClient,
    locationId: string,
    limit: number = 50,
    statuses: OrderStatus[] | null = null,
    startTs?: string | null,
    endTs?: string | null,
  ): Promise<{ data: any[] | null; error: any }> {
    let query = client
      .from("orders")
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*),
        order_discounts (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name)
      `,
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (startTs) query = query.gte("created_at", startTs);
    if (endTs) query = query.lt("created_at", endTs);

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    const { data, error } = await query;
    return { data, error };
  }

  /**
   * Fetch orders with pagination (offset-based) for infinite scroll history.
   * Same query as getHistoryOrders but uses .range() instead of .limit().
   */
  static async getHistoryOrdersPaginated(
    client: SupabaseClient,
    locationId: string,
    limit: number,
    offset: number,
    statuses: OrderStatus[] | null = null,
    startTs?: string | null,
    endTs?: string | null,
  ): Promise<{ data: any[] | null; error: any; hasMore: boolean }> {
    let query = client
      .from("orders")
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*),
        order_discounts (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name)
      `,
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (startTs) query = query.gte("created_at", startTs);
    if (endTs) query = query.lt("created_at", endTs);

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    const { data, error } = await query;
    return { data, error, hasMore: (data?.length ?? 0) === limit };
  }

  /**
   * Fetch a single order by ID with all relations
   */
  static async fetchOrderById(
    client: SupabaseClient,
    orderId: string,
  ): Promise<{ data: Order | null; error: any }> {
    const { data, error } = await client
      .from("orders")
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*)
      `,
      )
      .eq("id", orderId)
      .single();

    return { data: data as Order, error };
  }

  // --- Order Item CRUD Methods ---

  /**
   * Update quantity of an order item (auto-recalculates subtotal).
   *
   * Wave 3.0a: requires `opts.keyOverride` (per-intent key derived via
   * `toUpdateQuantityKey(orderItemId, quantity)`). Required (not optional)
   * because UPDATE ops have stronger correctness needs than CREATE ops:
   * the optimistic-online path and queue replay must derive the SAME key
   * to dedupe; missing the key silently breaks the dedupe at that call site.
   */
  static async updateOrderItemQuantity(
    client: SupabaseClient,
    orderItemId: string,
    quantity: number,
    opts: { keyOverride: string },
  ): Promise<{ data: UpdateOrderItemQuantityResult | null; error: any }> {
    return rpcWithIdempotency<UpdateOrderItemQuantityResult>(
      client,
      "update_order_item_quantity",
      "update_order_item_quantity_v2",
      "update_order_item_quantity_v3",
      { p_order_item_id: orderItemId, p_quantity: quantity },
      { deadline: DEADLINES.hotMutation, keyOverride: opts.keyOverride },
    );
  }

  /**
   * Update order item fields (instructions, station, price override, etc.).
   *
   * Wave 3.0a: requires `opts.keyOverride` (per-intent key derived via
   * `toUpdateItemKey(params)`). See note on `updateOrderItemQuantity`.
   */
  static async updateOrderItem(
    client: SupabaseClient,
    params: UpdateOrderItemParams,
    opts: { keyOverride: string },
  ): Promise<{ data: UpdateOrderItemResult | null; error: any }> {
    return rpcWithIdempotency<UpdateOrderItemResult>(
      client,
      "update_order_item",
      "update_order_item_v2",
      "update_order_item_v3",
      params,
      { deadline: DEADLINES.hotMutation, keyOverride: opts.keyOverride },
    );
  }

  /**
   * Atomically replace all modifiers on an order item
   */
  static async replaceOrderItemModifiers(
    client: SupabaseClient,
    orderItemId: string,
    modifiers: OrderItemModifier[],
  ): Promise<{ data: ReplaceOrderItemModifiersResult | null; error: any }> {
    return _runWithDeadline<ReplaceOrderItemModifiersResult>(
      "replace_modifiers",
      DEADLINES.hotMutation,
      async (signal) => {
        // NOTE: both v1 and v2 share the function NAME 'replace_order_item_modifiers_v2'
        // (the legacy 2-arg overload pre-existed on staging). Postgres dispatches by
        // signature: passing p_idempotency_key routes to the new 3-arg version.
        const { name, params: rpcParams } = withIdempotency(
          "replace_order_item_modifiers",
          "replace_order_item_modifiers_v2",
          "replace_order_item_modifiers_v2",
          { p_order_item_id: orderItemId, p_modifiers: modifiers },
        );
        const { data, error } = await client
          .rpc(name, rpcParams)
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Add a single modifier to an order item
   */
  static async addOrderItemModifier(
    client: SupabaseClient,
    orderItemId: string,
    modifier: Omit<OrderItemModifier, "id" | "order_item_id" | "total_price">,
    opts?: { stationId?: string | null },
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await rpcWithIdempotency(
      client,
      "add_order_item_modifier",
      "add_order_item_modifier",
      "add_order_item_modifier_v2",
      {
        p_order_item_id: orderItemId,
        p_modifier_group_id: modifier.modifier_group_id,
        p_modifier_item_id: modifier.modifier_item_id,
        p_modifier_group_name: modifier.modifier_group_name,
        p_modifier_name: modifier.modifier_name,
        p_price_modifier: modifier.price_modifier,
        p_quantity: modifier.quantity,
        // Wave 1.3 — server-side station guard.
        p_station_id: opts?.stationId ?? null,
      },
      { deadline: DEADLINES.hotMutation },
    );
    return { data, error };
  }

  /**
   * Remove a single modifier from an order item
   */
  static async removeOrderItemModifier(
    client: SupabaseClient,
    modifierId: string,
    opts?: { stationId?: string | null },
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await rpcWithIdempotency(
      client,
      "remove_order_item_modifier",
      "remove_order_item_modifier",
      "remove_order_item_modifier_v2",
      {
        p_modifier_id: modifierId,
        // Wave 1.4 — server-side station guard.
        p_station_id: opts?.stationId ?? null,
      },
      { deadline: DEADLINES.hotMutation },
    );
    return { data, error };
  }

  /**
   * Get order item with full details and modifiers
   */
  static async getOrderItem(
    client: SupabaseClient,
    orderItemId: string,
  ): Promise<{ data: GetOrderItemResult | null; error: any }> {
    const { data, error } = await client.rpc("get_order_item", {
      p_order_item_id: orderItemId,
    });
    return { data, error };
  }

  /**
   * Duplicate an order item (copies modifiers too)
   */
  static async duplicateOrderItem(
    client: SupabaseClient,
    orderItemId: string,
    quantity?: number,
    opts?: { stationId?: string | null },
  ): Promise<{ data: DuplicateOrderItemResult | null; error: any }> {
    const { data, error } = await rpcWithIdempotency<DuplicateOrderItemResult>(
      client,
      "duplicate_order_item",
      "duplicate_order_item",
      "duplicate_order_item_v2",
      {
        p_order_item_id: orderItemId,
        p_quantity: quantity,
        // Wave 1.4 — server-side station guard.
        p_station_id: opts?.stationId ?? null,
      },
      { deadline: DEADLINES.hotMutation },
    );
    return { data, error };
  }

  // --- Remove & Void Operations ---

  /**
   * Remove an order item (hard delete - for draft/pending orders only)
   */
  static async removeOrderItem(
    client: SupabaseClient,
    orderItemId: string,
  ): Promise<{ data: any; error: any }> {
    if (__DEV__) console.log("we are removing it hard ");

    return _runWithDeadline<any>(
      "remove_item",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("remove_order_item", {
            p_order_item_id: orderItemId,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Remove multiple order items in batch (hard delete - for draft/pending orders only)
   */
  static async removeOrderItemsBatch(
    client: SupabaseClient,
    orderItemIds: string[],
  ): Promise<{ data: any; error: any }> {
    return _runWithDeadline<any>(
      "remove_items_batch",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("remove_order_items_batch", {
            p_order_item_ids: orderItemIds,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Clear all items from an order (hard delete - for draft/pending orders only)
   */
  static async clearOrderItems(
    client: SupabaseClient,
    orderId: string,
  ): Promise<{ data: any; error: any }> {
    return _runWithDeadline<any>(
      "clear_order_items",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("clear_order_items", {
            p_order_id: orderId,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Cancel an order (hard delete for draft/pending, void for confirmed)
   */
  static async cancelOrder(
    client: SupabaseClient,
    orderId: string,
    cancelReason?: string,
  ): Promise<{ data: any; error: any }> {
    return _runWithDeadline<any>(
      "cancel_order",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("cancel_order", {
            p_order_id: orderId,
            p_cancel_reason: cancelReason || "Customer cancelled",
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  // --- Kitchen Status Operations ---

  /**
   * Bulk update order item statuses (for Send to Kitchen / Fire Course)
   * Automatically handles sent_to_kitchen_at and updated_at timestamps
   */
  /**
   * Wave 3.0d-4: per-intent idempotency. Same `(sortedItemIds, status)` retried
   * → same key → server returns the cached `{updated_count, affected_order_ids}`
   * jsonb and SKIPS the UPDATE entirely. Without this, retries re-stamp
   * fire_time / updated_at / sync_version on every attempt — drift in audit
   * timestamps and false-positive optimistic-lock conflicts elsewhere.
   *
   * Routing: when EXPO_PUBLIC_IDEMPOTENT_BULK_UPDATE_ORDER_ITEM_STATUS=1 (or
   * the MMKV flag is on), routes to v2 with the key. Off → falls back to v1
   * via withIdempotency's name swap (zero behavior change for the rollback
   * path).
   *
   * Callers must derive `keyOverride` via `toBulkUpdateStatusKey(ids, status)`
   * BEFORE the first attempt so retries reuse the same key.
   */
  static async bulkUpdateOrderItemStatus(
    client: SupabaseClient,
    orderItemIds: string[],
    status: "sent" | "preparing" | "ready" | "served",
    opts?: { staffId?: string; keyOverride?: string },
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null };
    }
    return rpcWithIdempotency<any>(
      client,
      "bulk_update_order_item_status",
      "bulk_update_order_item_status", // v1 name (no key)
      "bulk_update_order_item_status_v2", // v2 name (with key)
      {
        p_order_item_ids: orderItemIds,
        p_status: status,
        p_staff_id: opts?.staffId,
      },
      { deadline: DEADLINES.sendToKitchen, keyOverride: opts?.keyOverride },
    );
  }

  /**
   * Recall KDS items — resets kitchen_status to 'sent' and clears KDS item status records.
   */
  static async recallOrderItems(
    client: SupabaseClient,
    orderItemIds: string[],
    targetStatus: string = "sent",
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null };
    }

    const params = {
      p_order_item_ids: orderItemIds,
      p_target_status: targetStatus,
    };

    // Prefer v2: legacy recall_kds_items can exist but be schema-drifted
    // (e.g., references missing columns) and should not be our primary path.
    const v2Attempt = await _runWithDeadline<any>(
      "recall_kds_items_v2",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("recall_kds_items_v2", params)
          .abortSignal(signal);
        return { data, error };
      },
    );

    if (!v2Attempt.error) {
      return v2Attempt;
    }

    const msg = String(v2Attempt.error?.message ?? "").toLowerCase();
    const code = String(v2Attempt.error?.code ?? "").toLowerCase();
    const missingV2 =
      msg.includes("recall_kds_items_v2") &&
      (msg.includes("does not exist") || msg.includes("not found"));
    const undefinedFunction = code === "42883";

    // Fallback only when v2 is unavailable in this environment.
    if (missingV2 || undefinedFunction) {
      return _runWithDeadline<any>(
        "recall_kds_items",
        DEADLINES.hotMutation,
        async (signal) => {
          const { data, error } = await client
            .rpc("recall_kds_items", params)
            .abortSignal(signal);
          return { data, error };
        },
      );
    }

    return v2Attempt;
  }

  /**
   * Toggle rush flag on order items.
   */
  static async toggleRushOnItems(
    client: SupabaseClient,
    orderItemIds: string[],
    rush: boolean,
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null };
    }
    return _runWithDeadline<any>(
      "toggle_rush_order_items",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("toggle_rush_order_items", {
            p_order_item_ids: orderItemIds,
            p_rush: rush,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Toggle priority flag on order items.
   */
  static async togglePriorityOnItems(
    client: SupabaseClient,
    orderItemIds: string[],
    isPrioritized: boolean,
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null };
    }
    return _runWithDeadline<any>(
      "toggle_priority_order_items",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("toggle_priority_order_items", {
            p_order_item_ids: orderItemIds,
            p_is_prioritized: isPrioritized,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Fetch pre-grouped KDS tickets from the server (denormalized)
   */
  static async getKDSTickets(
    client: SupabaseClient,
    locationId: string,
    statuses?: string[],
    kdsDisplayId?: string,
  ): Promise<{ data: any; error: any }> {
    const params: Record<string, any> = { p_location_id: locationId };
    if (statuses) {
      params.p_statuses = statuses;
    }
    if (kdsDisplayId) {
      params.p_kds_display_id = kdsDisplayId;
    }
    const { data, error } = await client.rpc("get_kds_tickets_v2", params);
    return { data, error };
  }

  // ============================================
  // Phase 6: Conflict Detection & Payment Locking
  // ============================================

  /**
   * Update an order with version checking (optimistic locking)
   * Returns VERSION_CONFLICT error if expected_version doesn't match current
   */
  static async updateOrderWithVersion(
    client: SupabaseClient,
    orderId: string,
    expectedVersion: number,
    updates?: {
      customer_name?: string;
      customer_phone?: string;
      special_instructions?: string;
      status?: string;
    },
  ): Promise<{
    data: {
      success: boolean;
      error?: string;
      message?: string;
      new_version?: number;
      current_version?: number;
      expected_version?: number;
    } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("update_order_with_version", {
      p_order_id: orderId,
      p_expected_version: expectedVersion,
      p_updates: updates ? updates : null,
    });
    return { data, error };
  }

  /**
   * Lock an order for payment processing
   * Prevents other stations from modifying the order during payment
   */
  static async lockOrderForPayment(
    client: SupabaseClient,
    orderId: string,
    expectedVersion: number,
    stationId: string,
    lockDurationSeconds: number = 60,
  ): Promise<{
    data: {
      success: boolean;
      error?: string;
      message?: string;
      lock_expires_at?: string;
      sync_version?: number;
      current_version?: number;
      locked_by_station?: string;
    } | null;
    error: any;
  }> {
    return _runWithDeadline<any>(
      "lock_order_for_payment",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("lock_order_for_payment", {
            p_order_id: orderId,
            p_expected_version: expectedVersion,
            p_station_id: stationId,
            p_lock_duration_seconds: lockDurationSeconds,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Unlock an order after payment processing
   */
  static async unlockOrderForPayment(
    client: SupabaseClient,
    orderId: string,
    stationId: string,
  ): Promise<{
    data: {
      success: boolean;
      error?: string;
      message?: string;
    } | null;
    error: any;
  }> {
    return _runWithDeadline<any>(
      "unlock_order_for_payment",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("unlock_order_for_payment", {
            p_order_id: orderId,
            p_station_id: stationId,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Check if an order is currently locked for payment
   */
  static async isOrderLocked(
    client: SupabaseClient,
    orderId: string,
  ): Promise<{
    data: {
      success: boolean;
      is_locked?: boolean;
      locked_by_station?: string;
      lock_expires_at?: string;
      sync_version?: number;
      error?: string;
    } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("is_order_locked", {
      p_order_id: orderId,
    });
    return { data, error };
  }

  /**
   * Close a check after full payment
   * @param client - Supabase client
   * @param orderId - Order database ID (UUID)
   * @param staffId - Optional staff ID performing the action
   * @returns Promise<{ success: boolean; error?: string }>
   */
  static async closeCheck(
    client: SupabaseClient,
    orderId: string,
    staffId?: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (__DEV__)
      console.log(`[OrderService:closeCheck] ====== CLOSING CHECK ======`);
    if (__DEV__) console.log(`[OrderService:closeCheck] Order ID: ${orderId}`);
    if (__DEV__)
      console.log(`[OrderService:closeCheck] Staff ID: ${staffId || "none"}`);

    const { data, error } = await _runWithDeadline<any>(
      "close_check",
      DEADLINES.closeCheck,
      async (signal) => {
        const { data: d, error: e } = await client
          .rpc("close_check", {
            p_order_id: orderId,
            p_staff_id: staffId || null,
          })
          .abortSignal(signal);
        return { data: d, error: e };
      },
    );

    if (error) {
      console.error("[OrderService:closeCheck] RPC error:", error);
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      console.error("[OrderService:closeCheck] Failed:", result.error);
    } else {
      if (__DEV__) console.log("[OrderService:closeCheck] SUCCESS!");
    }

    return result;
  }

  /**
   * Reopen a closed check to add more items
   * @param client - Supabase client
   * @param orderId - Order database ID (UUID)
   * @param staffId - Staff ID performing the action (required)
   * @param reason - Optional reason for reopening
   * @returns Promise<{ success: boolean; error?: string }>
   */
  static async reopenCheck(
    client: SupabaseClient,
    orderId: string,
    staffId: string,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (__DEV__)
      console.log(`[OrderService:reopenCheck] ====== REOPENING CHECK ======`);
    if (__DEV__) console.log(`[OrderService:reopenCheck] Order ID: ${orderId}`);
    if (__DEV__) console.log(`[OrderService:reopenCheck] Staff ID: ${staffId}`);
    if (__DEV__)
      console.log(
        `[OrderService:reopenCheck] Reason: ${reason || "No reason provided"}`,
      );

    const { data, error } = await _runWithDeadline<any>(
      "reopen_check",
      DEADLINES.closeCheck,
      async (signal) => {
        const { data: d, error: e } = await client
          .rpc("reopen_check", {
            p_order_id: orderId,
            p_staff_id: staffId,
            p_reason: reason || null,
          })
          .abortSignal(signal);
        return { data: d, error: e };
      },
    );

    if (error) {
      console.error("[OrderService:reopenCheck] RPC error:", error);
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      console.error("[OrderService:reopenCheck] Failed:", result.error);
    } else {
      if (__DEV__) console.log("[OrderService:reopenCheck] SUCCESS!");
    }

    return result;
  }
}
