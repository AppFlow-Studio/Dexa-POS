import { getDeviceId } from "@/lib/deviceId";
import {
    type KitchenMutationResult,
    type KitchenSendItemStatus,
    type KitchenSendOrderStatus,
    validateKitchenMutationResult,
} from "@/lib/kdsSendTraceability";
import type { OnlineOrderBoardSelection } from "@/lib/onlineOrderBoard";
import { DEADLINES } from "@/lib/network/deadlines";
import {
    rpcWithIdempotency,
    withIdempotency,
} from "@/lib/network/idempotencyKey";
import { runWithDeadline as _runWithDeadline } from "@/lib/network/runWithDeadline";
import { clearPendingToGo, markPendingToGo } from "@/lib/pendingToGo";
import type { RpcResult } from "@/lib/network/rpcVersionFallback";
import { rpcWithVersionFallback } from "@/lib/network/rpcVersionFallback";
import { isServiceChargeEnabled } from "@/lib/serviceCharge";
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
import {
    buildHistoryOrderQuery,
    EMPTY_DRAFT_EXCLUSION_OR,
    type HistoryOrderFilters,
} from "@/services/historyOrderFilters";
import { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

/**
 * JSON envelope returned by accept_online_order / decline_online_order.
 * These RPCs return HTTP 200 with success:false on guard failures (e.g. the
 * order is no longer pending), so outcome detection reads this shape, not the
 * transport `error`.
 */


/**
 * JSON envelope returned by accept_online_order / decline_online_order.
 * These RPCs return HTTP 200 with success:false on guard failures (e.g. the
 * order is no longer pending), so outcome detection reads this shape, not the
 * transport `error`.
 */
export type OnlineOrderActionResult = {
  success: boolean;
  error?: string;
  order_id?: string;
  accepted_at?: string;
  declined_at?: string;
  cancelled_at?: string;
  ready_at?: string;
  completed_at?: string;
};

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

export type ApplyServiceChargeParams = {
  p_order_id: string;
  /**
   * Optional override for the live UI seating count. When null, the
   * server resolves party_size from orders.session_id → table_sessions.
   * Pass a number to lead the table_sessions realtime by a few hundred
   * ms during seat selection. See apply_service_charge_v1.sql §4.
   */
  p_party_size: number | null;
  p_station_id?: string | null;
};

export type ApplyServiceChargeResult = {
  success: boolean;
  service_charge: number;
  service_charge_rule_id: string | null;
  service_charge_rate: number | null;
  service_charge_applies_on: "pre_discount" | "post_discount" | null;
  service_charge_name: string | null;
  card_subtotal: number;
  cash_subtotal: number;
  card_total: number;
  cash_total: number;
  total_amount: number;
  amount_due: number;
  cash_amount_due: number;
  sync_version: number;
  eligible: boolean;
  old_service_charge: number;
  party_size_used?: number | null;
  skipped?: "manual_override";
};

export type ReopenCheckResult = {
  success: boolean;
  error?: string;
  order_id?: string;
  check_status?: "Opened";
  payment_status?: "partial" | "pending" | "refunded";
  amount_due?: number;
  cash_amount_due?: number;
  reopen_count?: number;
};

/**
 * Short-lived cache of a POSITIVE session-validity result.
 *
 * `ensureSessionValid` runs as a serial pre-flight before hot mutations, so an
 * uncached call adds a full extra round trip in front of the RPC the user is
 * actually waiting on — it's a large part of the "Creating order" wait on a
 * slow connection.
 *
 * Safe to cache on the ORDER paths because this guard is the last and weakest
 * of four kick-detection layers: `useSessionKickListener` already covers kicks
 * via realtime broadcast (instant), a 30s poll, and app-foreground
 * revalidation — and this function fails open on any RPC error anyway. The
 * default TTL matches that poller's 30s interval, so the guard is never staler
 * than the primary detection the app already relies on.
 *
 * NOT used on the payment path: `processPayment` passes `maxAgeMs: 0` to force
 * a live check. Money movement is the one place where a stale "still valid"
 * isn't an acceptable trade, and payments are already gated behind a
 * multi-second terminal round trip, so the extra RPC is invisible there.
 *
 * Only `is_valid: true` is cached. A negative result is never cached, so a
 * kicked session re-checks on every call.
 *
 * The key includes deviceId + sessionId, so a new session (re-login, station
 * switch) can never read an entry belonging to the previous one.
 */
const SESSION_VALID_TTL_MS = 30_000;
let _sessionValidCache: { key: string; checkedAt: number } | null = null;

/**
 * Minimal projection of an order used only to count/bucket it. Deliberately
 * excludes items, payments and joins — see `getHistoryOrderSummaries`.
 */
export interface HistoryOrderSummary {
  id: string;
  created_at: string;
  order_type: string | null;
  order_source: string | null;
  delivery_platform: string | null;
  status: string | null;
  payment_status: string | null;
}

export class OrderService {
  /**
   * Validates that the current station session is still active.
   * Returns true if valid, false if the session has been kicked/ended/expired.
   * On failure, logs a warning so the caller can handle appropriately.
   *
   * This is a lightweight guard to prevent kicked devices from continuing
   * to perform operations if all realtime kick channels failed.
   *
   * @param opts.maxAgeMs How stale a cached positive result may be. Defaults to
   *   SESSION_VALID_TTL_MS. Pass 0 to force a live check (payment path).
   */
  static async ensureSessionValid(
    client: SupabaseClient,
    opts?: { maxAgeMs?: number },
  ): Promise<boolean> {
    try {
      const deviceId = getDeviceId();
      const sessionId = useStoreSettingsStore.getState().stationSessionId;

      if (!deviceId || !sessionId) {
        // No active session - allow operation (might be during setup)
        return true;
      }

      const maxAgeMs = opts?.maxAgeMs ?? SESSION_VALID_TTL_MS;
      const cacheKey = `${deviceId}:${sessionId}`;
      if (
        _sessionValidCache?.key === cacheKey &&
        Date.now() - _sessionValidCache.checkedAt < maxAgeMs
      ) {
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
        // Not cached: a kicked session must re-check on every call.
        _sessionValidCache = null;
        return false;
      }

      _sessionValidCache = { key: cacheKey, checkedAt: Date.now() };
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
   * Apply service charge server-authoritatively (Wave C).
   *
   * Wraps apply_service_charge_v1 with the standard hot-mutation deadline.
   * Server re-resolves the merchant's active service_charge_rule, runs
   * eligibility against the passed party_size + order's order_type, and
   * persists service_charge + snapshot fields + card_total / cash_total
   * onto orders. See lib/order-calculator.ts §SERVICE CHARGE for the
   * matching client-side formula.
   *
   * No idempotency-flag gating: this RPC is brand new in Wave C (no v1
   * legacy to fall back to). Fresh uuidv4 per call by default; pass
   * `keyOverride` for retry-stable invocations (offline queue replay).
   *
   * Kill switch: when EXPO_PUBLIC_SERVICE_CHARGE_ENABLED=0, returns
   * { data: null, error: null } without firing. Server-side gate is the
   * service_charge_rules.is_active flag, set via the website admin.
   */
  static async applyServiceCharge(
    client: SupabaseClient,
    params: ApplyServiceChargeParams,
    opts?: { keyOverride?: string },
  ): Promise<{ data: ApplyServiceChargeResult | null; error: any }> {
    if (!isServiceChargeEnabled) {
      return { data: null, error: null };
    }

    const p_idempotency_key = opts?.keyOverride ?? uuidv4();

    return _runWithDeadline<ApplyServiceChargeResult>(
      "apply_service_charge",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data, error } = await client
          .rpc("apply_service_charge_v1", {
            ...params,
            p_idempotency_key,
          })
          .abortSignal(signal);
        return {
          data: data as ApplyServiceChargeResult | null,
          error,
        };
      },
    );
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
   * Accept an incoming online/QR order — fires every item to the kitchen (KDS).
   *
   * accept_online_order is pending-guarded and returns a JSON envelope at
   * HTTP 200 even on the "not pending" branch:
   *   { success: false, error: 'Order is not in pending status (current: X)' }
   * (NOT a thrown/transport error). Callers MUST branch on data.success /
   * data.error rather than relying on `error`. The server normalizes accept to
   * status='sent_to_kitchen', so a benign "already accepted" race reports a
   * current status of sent_to_kitchen/preparing/ready/accepted.
   */
  static async acceptOnlineOrder(
    client: SupabaseClient,
    dbOrderId: string,
  ): Promise<{ data: OnlineOrderActionResult | null; error: any }> {
    return _runWithDeadline<OnlineOrderActionResult>(
      "accept_online_order",
      DEADLINES.sendToKitchen,
      async (signal) => {
        const { data, error } = await client
          .rpc("accept_online_order", { p_order_id: dbOrderId })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Decline an incoming online/QR order (terminal). Same JSON-envelope contract
   * as acceptOnlineOrder — inspect data.success / data.error.
   */
  static async declineOnlineOrder(
    client: SupabaseClient,
    dbOrderId: string,
    reason?: string,
  ): Promise<{ data: OnlineOrderActionResult | null; error: any }> {
    return _runWithDeadline<OnlineOrderActionResult>(
      "decline_online_order",
      DEADLINES.sendToKitchen,
      async (signal) => {
        const { data, error } = await client
          .rpc("decline_online_order", {
            p_order_id: dbOrderId,
            p_reason: reason ?? null,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Cancel an already-accepted online/OrderOut order (post-acceptance).
   *
   * DB-only: writes the cancel state to `orders` + stamps the `orderout_orders`
   * bridge row (cancel_source='pos', reject_reason). The external OrderOut
   * backend relays the cancellation to the marketplace. `reason` MUST be one of
   * the OrderOut enum codes (ITEM_UNAVAILABLE, STORE_CLOSED, TOO_BUSY,
   * CUSTOMER_REQUEST, CANNOT_FULFILL); `details` is optional free text. Same
   * JSON-envelope contract as accept/decline — inspect data.success / data.error.
   */
  static async cancelOnlineOrder(
    client: SupabaseClient,
    dbOrderId: string,
    reason: string,
    details?: string,
  ): Promise<{ data: OnlineOrderActionResult | null; error: any }> {
    return _runWithDeadline<OnlineOrderActionResult>(
      "cancel_online_order",
      DEADLINES.sendToKitchen,
      async (signal) => {
        const { data, error } = await client
          .rpc("cancel_online_order", {
            p_order_id: dbOrderId,
            p_reason: reason,
            p_details: details ?? null,
          })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Mark an already-accepted online/OrderOut order READY FOR PICKUP.
   *
   * DB-only: sets orders.status='ready' + ready_at; the AFTER UPDATE trigger
   * stamps the orderout_orders bridge (ready_by='pos'). The external OrderOut
   * backend observes that stamp and relays mark-ready to the marketplace
   * (Uber Eats / DoorDash / Grubhub). Same JSON-envelope contract as
   * accept/decline/cancel — inspect data.success / data.error (guard-fail
   * branches return HTTP 200 with success:false, e.g. "not in-kitchen").
   */
  static async markOnlineOrderReady(
    client: SupabaseClient,
    dbOrderId: string,
  ): Promise<{ data: OnlineOrderActionResult | null; error: any }> {
    return _runWithDeadline<OnlineOrderActionResult>(
      "mark_online_order_ready",
      DEADLINES.sendToKitchen,
      async (signal) => {
        const { data, error } = await client
          .rpc("mark_online_order_ready", { p_order_id: dbOrderId })
          .abortSignal(signal);
        return { data, error };
      },
    );
  }

  /**
   * Mark a READY online/OrderOut order DONE (status='completed') from the POS
   * Online Orders "Mark done" button — used when the kitchen never bumps a ready
   * order off the KDS, leaving it stuck in the "Ready" lane.
   *
   * DB-only: sets orders.status='completed' + bumps line items to 'served' so the
   * KDS ticket clears. Same JSON-envelope contract as accept/decline/cancel/ready
   * — inspect data.success / data.error (guard-fail branches return HTTP 200 with
   * success:false, e.g. "not ready").
   */
  static async completeOnlineOrder(
    client: SupabaseClient,
    dbOrderId: string,
  ): Promise<{ data: OnlineOrderActionResult | null; error: any }> {
    return _runWithDeadline<OnlineOrderActionResult>(
      "complete_online_order",
      DEADLINES.sendToKitchen,
      async (signal) => {
        const { data, error } = await client
          .rpc("complete_online_order", { p_order_id: dbOrderId })
          .abortSignal(signal);
        return { data, error };
      },
    );
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
   * Perf A1: transition an order out of draft for a kitchen send, with the
   * verify-SELECT on the ERROR PATH ONLY (was unconditionally a third round
   * trip at every send-to-kitchen call site).
   *
   * - RPC success → the returned row is the post-update state from the same
   *   transaction, i.e. non-draft by definition. Proceed. (~99% path, 1 RT.)
   * - P0001 / "already in" → ambiguous: deployed update_order_status raises
   *   P0001 for BOTH "already in <status>" (benign) and "Order not found"
   *   (fatal). Verified identical on staging + prod 2026-06-11. Discriminate
   *   with today's SELECT: not-found/draft → fail (preserves retry →
   *   dead-letter visibility); non-draft → proceed.
   * - Any other error → fail.
   */
  static async ensureOrderOutOfDraft(
    client: SupabaseClient,
    orderId: string,
    targetStatus: OrderStatus,
  ): Promise<{ ok: boolean; error?: any }> {
    const { error } = await OrderService.updateOrderStatus(
      client,
      orderId,
      targetStatus,
    );
    if (!error) return { ok: true };

    const maybeBenign =
      error.code === "P0001" || error.message?.includes("already in");
    if (!maybeBenign) return { ok: false, error };

    const { data: row, error: verifyError } = await client
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();
    if (verifyError || row?.status === "draft") {
      return {
        ok: false,
        error:
          verifyError ??
          new Error(`Order ${orderId} remained draft after status update`),
      };
    }
    return { ok: true };
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
    // Session guard: prevent kicked devices from processing payments.
    // maxAgeMs: 0 — never trust a cached result on the money path. The extra
    // round trip is invisible next to the terminal's own multi-second flow.
    const sessionValid = await OrderService.ensureSessionValid(client, {
      maxAgeMs: 0,
    });
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
      // Fallback (flag off): v12 — defensive apply_service_charge_v1(NULL,...)
      //                            refresh + SC residual guard for item
      //                            payments.
      // Primary  (flag on): v15 — forks v14 and snaps a closing item
      //                            payment to the canonical remaining balance,
      //                            so stale client previews cannot omit SC tax
      //                            or another order-level residual. v14's
      //                            residual-snap branch still allocates the
      //                            leftover SC to the closing payment.
      //                            split-by-item / custom-amount payments
      //                            allocate the leftover SC to the closing
      //                            payment (instead of leaving it as an
      //                            uncollected order-level residual). Also
      //                            bakes SC into v_payment_total for item
      //                            payments so change_given reflects
      //                            items+tax+SC at the cash drawer, and
      //                            records service_charge per order_payments
      //                            row (consumed by apply_refund_to_payment_v4
      //                            for proportional SC reversal).
      "process_payment_v12",
      // v16 — forks v15. The split-payment "fully paid" test now requires ALL
      // portions captured (v_portions_remaining = 0) and drops v15's
      // `balance <= 0.02` dust fallback inside the split branch. On a tiny
      // order (e.g. a $0.02 custom item split 2 ways) that fallback flipped the
      // order to `paid` after the FIRST $0.01 portion — amount_paid=$0.01 with a
      // real portion still owed — and enforce_order_math rejected it (P0005).
      //
      // NOTE: in-kind payments need NO process_payment change. 'inkind' is not
      // 'cash', so every version from v12 up already routes it down the
      // card-pricing path — which is exactly the desired behaviour. The
      // tender-metadata corrections (zero fees, terminal_type 'none', no
      // phantom settlement batch) are applied by the
      // trg_inkind_normalize BEFORE INSERT trigger on order_payments, which is
      // version-independent and therefore survives the next fork of this
      // lineage. See 20260802100100_order_payments_inkind_normalize_trigger.sql.
      //
      // v17 — forks v16 byte-identical + a valor_transaction branch that funnels
      // Valor's nested card fields (cardLast4/rrn/approvalCode/entryMode) into the
      // order_payments columns and stamps terminal_type='valor'. Without it the
      // client called v16 (no valor arm) so Valor payments persisted with null
      // last4/rrn/auth and a 'dejavoo' label. MUST match the direct payment path
      // in useOrderStore.syncPaymentToBackend, which also calls v17.
      "process_payment_v17",
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
      // Fallback: v3 (proportional refunded_dual_pricing_fee / refunded_tip_fee).
      // Primary:  v4 (Wave D — also reverses the per-payment service_charge
      //               snapshot proportionally; same LEAST clamp + full-refund
      //               snap pattern v3 uses for dpf / tip_fee. Pairs with
      //               process_payment_v15, which populates the per-payment
      //               service_charge column v4 reads.).
      "apply_refund_to_payment_v3",
      "apply_refund_to_payment_v4",
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

  static async getOnlineOrdersBoard(
    client: SupabaseClient,
    locationId: string,
    filter: {
      preset: "today" | "yesterday" | "last_7_days" | "custom";
      startDate: string | null;
      endDate: string | null;
    },
  ): Promise<{ data: OnlineOrderBoardSelection[] | null; error: any }> {
    const { data, error } = await _runWithDeadline<any[]>(
      "get_online_orders_board_v1",
      DEADLINES.read,
      async (signal) => {
        const result = await client
          .rpc("get_online_orders_board_v1", {
            p_location_id: locationId,
            p_preset: filter.preset,
            p_start_date: filter.startDate,
            p_end_date: filter.endDate,
          })
          .abortSignal(signal);
        return { data: result.data, error: result.error };
      },
    );

    if (error) return { data: null, error };

    return {
      data: ((data ?? []) as any[]).map((row) => ({
        orderId: row.order_id,
        placedAt: row.placed_at ?? null,
        isInRange: row.is_in_range === true,
        itemCount: Number(row.item_count ?? 0),
        orderData: row.order_data,
      })),
      error: null,
    };
  }

  static async getHistoryOrders(
    client: SupabaseClient,
    locationId: string,
    limit: number = 50,
    statuses: OrderStatus[] | null = null,
    startTs?: string | null,
    endTs?: string | null,
    signal?: AbortSignal,
  ): Promise<{ data: any[] | null; error: any }> {
    // Modifiers intentionally omitted — Previous Orders grid doesn't render
    // them inline; the detail screen lazy-loads via get_order_details RPC.
    // `order_items.is_voided=false` engages idx_order_items_order_active.
    let query = client
      .from("orders")
      .select(
        `
        *,
        order_items (*),
        order_payments (*),
        order_discounts (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name),
        online_orders:online_orders!online_orders_order_id_fkey (order_id, provider, delivery_company)
      `,
      )
      .eq("location_id", locationId)
      .eq("order_items.is_voided", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (startTs) query = query.gte("created_at", startTs);
    if (endTs) query = query.lt("created_at", endTs);

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;
    return { data, error };
  }

  /**
   * Cheap staleness probe for a date window: the exact row count plus the most
   * recent `updated_at`.
   *
   * Lets the screen show a cached page instantly and only refetch when the
   * backend actually moved. `updated_at` (not `created_at`) is the signal
   * because it also changes on the edits that matter here — a payment landing,
   * a refund, a void, a check reopening — none of which alter the count.
   *
   * Two small queries, no rows returned by the first, one row by the second.
   */
  static async getHistoryWindowSignature(
    client: SupabaseClient,
    locationId: string,
    startTs?: string | null,
    endTs?: string | null,
    signal?: AbortSignal,
  ): Promise<{
    count: number | null;
    latestUpdatedAt: string | null;
    error: any;
  }> {
    const scope = (q: any) => {
      let scoped = q.eq("location_id", locationId);
      if (startTs) scoped = scoped.gte("created_at", startTs);
      if (endTs) scoped = scoped.lt("created_at", endTs);
      if (signal) scoped = scoped.abortSignal(signal);
      return scoped;
    };

    const countQuery = scope(
      client.from("orders").select("id", { count: "exact", head: true }),
    );
    const latestQuery = scope(
      client
        .from("orders")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1),
    );

    const [countRes, latestRes] = await Promise.all([countQuery, latestQuery]);

    const error = (countRes as any)?.error ?? (latestRes as any)?.error ?? null;
    if (error) return { count: null, latestUpdatedAt: null, error };

    return {
      count: (countRes as any)?.count ?? null,
      latestUpdatedAt:
        ((latestRes as any)?.data?.[0]?.updated_at as string | undefined) ??
        null,
      error: null,
    };
  }

  /**
   * Fetch one page of filtered history, plus the exact total matching the same
   * filters.
   *
   * This replaces the "fetch 30 by created_at, then filter/sort/search/count in
   * JS" approach. Because `buildHistoryOrderQuery` is applied to both the page
   * and the count, the "N of M" the merchant reads is always consistent with
   * the rows beneath it, and sort/search cover the whole date window rather
   * than the loaded pages.
   *
   * Discrete offset paging: page N is fetched independently, so the merchant
   * can jump forward AND backward. (An earlier keyset/cursor design only walked
   * forward, which suits infinite scroll but can't express "previous page".)
   * Offset paging is the right trade here — 50-row pages over a date-bounded
   * window keep the skip shallow, and correctness beats constant-time.
   *
   * `totalCount` is requested only when asked for, since the total is a
   * property of the filters and doesn't change between pages of one result set.
   */
  static async getFilteredHistoryPage(
    client: SupabaseClient,
    params: {
      locationId: string;
      filters: HistoryOrderFilters;
      /** Rows per page. */
      limit: number;
      /** Zero-based row offset — `pageIndex * limit`. */
      offset?: number;
      startTs?: string | null;
      endTs?: string | null;
      /** Request the exact total alongside the page. */
      withCount?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<{
    data: any[] | null;
    error: any;
    hasMore: boolean;
    totalCount: number | null;
  }> {
    const {
      locationId,
      filters,
      limit,
      offset = 0,
      startTs,
      endTs,
      withCount = false,
      signal,
    } = params;

    const applyScope = (q: any) => {
      let scoped = q.eq("location_id", locationId);
      if (startTs) scoped = scoped.gte("created_at", startTs);
      if (endTs) scoped = scoped.lt("created_at", endTs);
      return scoped;
    };

    // ── Page query ───────────────────────────────────────────
    let pageQuery: any = client.from("orders").select(
      `
        *,
        order_items (*),
        order_payments (*),
        order_discounts (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name),
        online_orders:online_orders!online_orders_order_id_fkey (order_id, provider, delivery_company)
      `,
    );
    pageQuery = applyScope(pageQuery).eq("order_items.is_voided", false);
    pageQuery = buildHistoryOrderQuery(pageQuery, filters);
    pageQuery = pageQuery.range(offset, offset + limit - 1);

    if (signal) pageQuery = pageQuery.abortSignal(signal);

    // ── Count query (first page only) ────────────────────────
    // head:true returns no rows — just the Content-Range total.
    const countPromise = withCount
      ? (() => {
          let countQuery: any = client
            .from("orders")
            .select("id", { count: "exact", head: true });
          countQuery = applyScope(countQuery);
          countQuery = buildHistoryOrderQuery(countQuery, filters);
          if (signal) countQuery = countQuery.abortSignal(signal);
          return countQuery;
        })()
      : null;

    const [pageResult, countResult] = await Promise.all([
      pageQuery,
      countPromise ?? Promise.resolve(null),
    ]);

    const { data, error } = pageResult as { data: any[] | null; error: any };
    if (error) {
      return { data: null, error, hasMore: false, totalCount: null };
    }

    const rows = data ?? [];
    const totalCount =
      (countResult as { count?: number | null } | null)?.count ?? null;

    return {
      data: rows,
      error: null,
      // With a known total, "more" is exact. Without one, a full page implies
      // there is probably another.
      hasMore:
        totalCount != null ? offset + rows.length < totalCount : rows.length === limit,
      totalCount,
    };
  }

  /**
   * Fetch the discriminator columns for EVERY order in a date window — no
   * joins, no items, no payments.
   *
   * The history list is paginated 30 rows at a time, so any count derived from
   * `previousOrders` is a count of the loaded page, not of the window. Over a
   * two-month range that made the Previous Orders channel tabs read "Online 6"
   * when the window actually held far more. This query is what the tab and
   * provider-chip counts are computed from: one cheap round trip per window
   * change that covers the whole range.
   *
   * Search and status are applied server-side so the counts always describe the
   * same population the list is showing. Channel and provider are NOT applied —
   * those are the axes being counted.
   *
   * Capped at 5000 rows. Beyond that the counts under-report rather than
   * blowing up the response — see `truncated` on the result.
   */
  static async getHistoryOrderSummaries(
    client: SupabaseClient,
    locationId: string,
    startTs?: string | null,
    endTs?: string | null,
    signal?: AbortSignal,
    /**
     * Search + status from the active filters. Channel/provider are omitted on
     * purpose — they're the axes being counted, so constraining them would make
     * every tab report its own count as the total.
     */
    filters?: HistoryOrderFilters,
  ): Promise<{
    data: HistoryOrderSummary[] | null
    error: any
    truncated: boolean
  }> {
    const CAP = 5000
    let query: any = client
      .from('orders')
      .select(
        'id, created_at, order_type, order_source, delivery_platform, status, payment_status'
      )
      .eq('location_id', locationId)

    if (startTs) query = query.gte('created_at', startTs)
    if (endTs) query = query.lt('created_at', endTs)

    if (filters) {
      query = buildHistoryOrderQuery(query, {
        ...filters,
        channel: 'all',
        provider: 'all',
        // Sort is irrelevant to a count and would add an ORDER BY for nothing.
        sort: 'date_desc',
      })
    } else {
      // No filters → buildHistoryOrderQuery never ran, so the empty-draft
      // exclusion it normally applies must be added here or the counts would
      // include drafts the list excludes.
      query = query
        .or(EMPTY_DRAFT_EXCLUSION_OR)
        .order('created_at', { ascending: false })
    }

    query = query.limit(CAP)
    if (signal) query = query.abortSignal(signal)

    const { data, error } = await query
    return {
      data: data as HistoryOrderSummary[] | null,
      error,
      truncated: (data?.length ?? 0) >= CAP
    }
  }

  /**
   * Fetch orders with pagination (offset-based) for infinite scroll history.
   * Same query as getHistoryOrders but uses .range() instead of .limit().
   * Prefer `getHistoryOrdersByCursor` for new code — keyset pagination is
   * constant-time vs offset which gets progressively slower.
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
        order_items (*),
        order_payments (*),
        order_discounts (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name),
        online_orders:online_orders!online_orders_order_id_fkey (order_id, provider, delivery_company)
      `,
      )
      .eq("location_id", locationId)
      .eq("order_items.is_voided", false)
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
   * Keyset-paginated history fetch. Uses `created_at < cursor` so the
   * planner does a constant-time index range scan instead of offset+skip.
   * Prefer this over `getHistoryOrdersPaginated` for "load more" infinite
   * scroll. Cursor is the `created_at` of the last item in the previous page.
   * On the first page pass `cursor=null` to start from the most recent.
   */
  static async getHistoryOrdersByCursor(
    client: SupabaseClient,
    locationId: string,
    limit: number,
    cursor: string | null,
    statuses: OrderStatus[] | null = null,
    startTs?: string | null,
    endTs?: string | null,
    signal?: AbortSignal,
  ): Promise<{
    data: any[] | null;
    error: any;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    let query = client
      .from("orders")
      .select(
        `
        *,
        order_items (*),
        order_payments (*),
        order_discounts (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name),
        online_orders:online_orders!online_orders_order_id_fkey (order_id, provider, delivery_company)
      `,
      )
      .eq("location_id", locationId)
      .eq("order_items.is_voided", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor) query = query.lt("created_at", cursor);
    if (startTs) query = query.gte("created_at", startTs);
    if (endTs) query = query.lt("created_at", endTs);

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;
    const rows = data ?? [];
    const hasMore = rows.length === limit;
    const nextCursor = hasMore
      ? ((rows[rows.length - 1] as { created_at?: string })?.created_at ?? null)
      : null;
    return { data, error, hasMore, nextCursor };
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
    const result = await rpcWithIdempotency<KitchenMutationResult>(
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

    if (result.error) return result;

    const countError = validateKitchenMutationResult(
      result.data,
      orderItemIds.length,
      { operation: "status" },
    );
    if (countError) {
      console.error("[KDS routing] Partial kitchen status update", {
        ...countError.details,
        status,
        code: countError.code,
      });
      return { data: result.data, error: countError };
    }

    return result;
  }

  /**
   * Atomically transitions a draft order and fires its items while recording
   * station/device/idempotency context in the shared KDS send-attempt ledger.
   */
  static async sendOrderToKitchen(
    client: SupabaseClient,
    orderId: string,
    orderItemIds: string[],
    orderStatus: KitchenSendOrderStatus,
    itemStatus: KitchenSendItemStatus,
    opts: {
      staffId: string | null;
      stationId: string | null;
      deviceId: string | null;
      idempotencyKey: string;
      itemsIdempotencyKey: string;
      replay?: boolean;
    },
  ): Promise<{ data: KitchenMutationResult | null; error: any }> {
    const result = await _runWithDeadline<KitchenMutationResult>(
      "send_order_to_kitchen_v1",
      DEADLINES.sendToKitchen,
      async (signal) => {
        const { data, error } = await client
          .rpc("send_order_to_kitchen_v1", {
            p_order_id: orderId,
            p_order_status: orderStatus,
            p_order_item_ids: orderItemIds,
            p_item_status: itemStatus,
            p_staff_id: opts.staffId,
            p_idempotency_key: opts.idempotencyKey,
            p_items_idempotency_key: opts.itemsIdempotencyKey,
            p_station_id: opts.stationId,
            p_device_id: opts.deviceId,
          })
          .abortSignal(signal);
        return { data: data as KitchenMutationResult | null, error };
      },
    );

    if (result.error) return result;

    const countError = validateKitchenMutationResult(
      result.data,
      orderItemIds.length,
      {
        operation: "send",
        orderId,
        stationId: opts.stationId,
        deviceId: opts.deviceId,
        replay: opts.replay ?? false,
        requireExplicitCounts: true,
      },
    );
    if (countError) {
      console.error("[KDS routing] Kitchen send was not fully applied", {
        ...countError.details,
        code: countError.code,
        idempotencyKey: opts.idempotencyKey,
        itemsIdempotencyKey: opts.itemsIdempotencyKey,
      });
      return { data: result.data, error: countError };
    }

    return result;
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
   * Toggle the per-item "TO GO" flag on order items.
   */
  static async toggleToGoOnItems(
    client: SupabaseClient,
    orderItemIds: string[],
    isToGo: boolean,
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null };
    }
    // Protect the optimistic local flag from a stale concurrent fetch/broadcast
    // until this persist commits (see lib/pendingToGo). On failure we clear the
    // markers so the next fetch reconciles local state back to the DB value.
    markPendingToGo(orderItemIds, isToGo);
    let result: { data: any; error: any };
    try {
      result = await _runWithDeadline<any>(
        "toggle_to_go_order_items",
        DEADLINES.hotMutation,
        async (signal) => {
          const { data, error } = await client
            .rpc("toggle_to_go_order_items", {
              p_order_item_ids: orderItemIds,
              p_is_to_go: isToGo,
            })
            .abortSignal(signal);
          return { data, error };
        },
      );
    } catch (err) {
      clearPendingToGo(orderItemIds);
      throw err;
    }
    if (result?.error) {
      clearPendingToGo(orderItemIds);
    }
    return result;
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
    // Prefer the location-scoped v3 (see useKDSStore for the measured rationale);
    // fall back to v2 where v3 has not been deployed yet.
    const { data, error } = await rpcWithVersionFallback<any>(
      "get_kds_tickets_v3",
      () => client.rpc("get_kds_tickets_v3", params) as unknown as Promise<RpcResult<any>>,
      () => client.rpc("get_kds_tickets_v2", params) as unknown as Promise<RpcResult<any>>,
    );
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
   * Wave B — atomically close the check AND free the dine-in session via the
   * close_and_free_session RPC, so the terminal transitions route through the
   * event projector (stamping paid_at + emitting payment_complete/table_cleared/
   * table_cleaned). Idempotent + replay-safe: returns { already_freed: true }
   * when the session was already freed by a prior attempt or another station.
   */
  static async closeAndFreeSession(
    client: SupabaseClient,
    orderId: string,
    sessionId: string,
    staffId?: string | null,
    idempotencyKey?: string | null,
  ): Promise<{ success: boolean; already_freed?: boolean; error?: string }> {
    const { data, error } = await _runWithDeadline<any>(
      "close_and_free_session",
      DEADLINES.closeCheck,
      async (signal) => {
        const { data: d, error: e } = await client
          .rpc("close_and_free_session", {
            p_order_id: orderId,
            p_session_id: sessionId,
            p_staff_id: staffId || null,
            p_idempotency_key: idempotencyKey || null,
          })
          .abortSignal(signal);
        return { data: d, error: e };
      },
    );

    if (error) {
      console.error("[OrderService:closeAndFreeSession] RPC error:", error);
      return { success: false, error: error.message };
    }

    const result = (data ?? {}) as {
      success?: boolean;
      already_freed?: boolean;
    };
    return {
      success: result.success === true,
      already_freed: result.already_freed === true,
    };
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
  ): Promise<ReopenCheckResult> {
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

    const result = data as ReopenCheckResult;
    if (!result.success) {
      console.error("[OrderService:reopenCheck] Failed:", result.error);
    } else {
      if (__DEV__) console.log("[OrderService:reopenCheck] SUCCESS!");
    }

    return result;
  }

  static async overrideServiceCharge(
    client: SupabaseClient,
    params: {
      p_order_id: string;
      p_manager_id: string;
      p_mode?: "amount" | "percent";
      p_amount?: number | null;
      p_rate?: number | null;
      p_reason?: string | null;
      p_station_id?: string | null;
      /** Whether the overridden SC should be taxed. null = carry over prior taxability. */
      p_is_taxable?: boolean | null;
    },
  ): Promise<{ data: { success: boolean } | null; error: Error | null }> {
    const { data, error } = await _runWithDeadline<any>(
      "override_service_charge_v3",
      DEADLINES.hotMutation,
      async (signal) => {
        const { data: d, error: e } = await client
          .rpc("override_service_charge_v3", {
            p_order_id: params.p_order_id,
            p_manager_id: params.p_manager_id,
            p_mode: params.p_mode ?? "amount",
            p_amount: params.p_amount ?? null,
            p_rate: params.p_rate ?? null,
            p_reason: params.p_reason ?? null,
            p_station_id: params.p_station_id ?? null,
            p_is_taxable: params.p_is_taxable ?? null,
          })
          .abortSignal(signal);
        return { data: d, error: e };
      },
    );
    return { data: data ?? null, error: error ?? null };
  }
}
