// ============================================================
// Pre-Auth Service — Orchestrates tab open/increase/close/release
// ============================================================
// Central orchestration layer that branches on terminal type,
// calls the terminal, then updates the store + backend.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { toastService } from "@/lib/toastService";
import type { OrderProfilePayment } from "@/lib/types";
import type { CastlesService } from "@/services/terminals/castles-service";
import type { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { generateRefId } from "@/types/dejavoo-spin-api";
import { useOrderStore } from "@/stores/useOrderStore";

// ============================================================
// TYPES
// ============================================================

export interface PreAuthResult {
  success: boolean;
  payment?: OrderProfilePayment;
  error?: string;
}

export interface IncrementResult {
  success: boolean;
  newAmount?: number;
  error?: string;
}

export interface CaptureResult {
  success: boolean;
  capturedAmount?: number;
  tipAmount?: number;
  orderFullyPaid?: boolean;
  error?: string;
}

export interface VoidResult {
  success: boolean;
  error?: string;
}

type TerminalInstance =
  | { type: "castles"; service: CastlesService }
  | { type: "dejavoo"; api: DejavooSpinAPI };

// ============================================================
// OPEN TAB (Pre-Auth)
// ============================================================

export async function openTab(
  orderId: string,
  amount: number,
  terminal: TerminalInstance,
  supabase: SupabaseClient,
  onTransactionStart?: (refId: string) => void,
): Promise<PreAuthResult> {
  try {
    const referenceId = generateRefId("AUTH");
    onTransactionStart?.(referenceId);
    let terminalResponse: Record<string, unknown> | undefined;
    let rrn: string | undefined;
    let stan: string | undefined;
    let authCode: string | undefined;
    let refId: string | undefined;
    let cardBrand: string | undefined;
    let last4: string | undefined;
    let entryMode: string | undefined;

    // 1. Call terminal
    if (terminal.type === "castles") {
      const result = await terminal.service.processPreAuth({
        amount,
        referenceId,
      });

      if (!result.success) {
        return { success: false, error: result.error || "Pre-auth declined" };
      }

      terminalResponse = result.terminalResponse;
      rrn = result.raw?.txnRrn ?? result.raw?.txnRRN;
      stan = result.raw?.txnStan;
      authCode = result.raw?.txnApprovalCode;
      refId = referenceId;

      // Extract card data from Castles terminal response
      const castlesTxn = terminalResponse?.castles_transaction as Record<string, any> | undefined;
      cardBrand = castlesTxn?.cardType ?? undefined;
      last4 = castlesTxn?.cardLast4 ?? undefined;
      entryMode = castlesTxn?.entryMode ?? undefined;
    } else {
      const result = await terminal.api
        .preAuth()
        .amount(amount)
        .refId(referenceId)
        .execute();

      if (!result.success) {
        return { success: false, error: result.error || "Pre-auth declined" };
      }

      terminalResponse = {
        terminal_vendor: "dejavoo",
        dejavoo_transaction: result.data,
        raw_dejavoo_response: result.rawResponse,
      };
      rrn = result.helpers?.getRRN();
      authCode = result.helpers?.getAuthCode();
      refId = result.helpers?.getReferenceId() ?? referenceId;

      // Extract card data from Dejavoo response
      const dejavooTxn = result.data as Record<string, any> | undefined;
      cardBrand = dejavooTxn?.CardType ?? undefined;
      last4 = dejavooTxn?.Last4 ?? undefined;
      entryMode = dejavooTxn?.EntryMode ?? undefined;
    }

    // 2. Build payment object
    const paymentId = `preauth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payment: OrderProfilePayment = {
      id: paymentId,
      amount,
      method: "Card",
      tip_amount: 0,
      total_collected: amount,
      status: "authorized",
      timestamp: new Date().toISOString(),
      cardBrand,
      last4,
      isVoided: false,
      itemsCovered: [],
      isPreAuth: true,
      preAuthAmount: amount,
      preAuthRrn: rrn,
      preAuthStan: stan,
      preAuthAuthCode: authCode,
      preAuthReferenceId: refId,
      preAuthTerminalType: terminal.type,
      transactionDetails: {
        terminalType: terminal.type,
        authorizationCode: authCode,
        referenceId: refId,
        rrn,
        cardType: cardBrand,
        last4,
        entryMode,
        castlesTransaction: terminalResponse?.castles_transaction as Record<string, unknown> | undefined,
      },
      sync_status: "pending",
    };

    // 3. Optimistic store update
    const store = useOrderStore.getState();
    const order = store.ordersById[orderId];
    if (!order) {
      return { success: false, error: "Order not found in store" };
    }

    store.patchOrder(orderId, {
      payments: [...(order.payments ?? []), payment],
    });

    // 4. Auto-send to kitchen after successful auth hold
    // Respect KDS workflow mode (2-step skips "sent_to_kitchen" → goes straight to "preparing")
    if (order.order_status === "draft") {
      const { getOrderSentStatus, getKitchenSentStatus } = require("@/lib/kitchenStatusUtils");
      const orderStatus = getOrderSentStatus();
      const kitchenStatus = getKitchenSentStatus();
      const now = new Date().toISOString();

      // Update local state: order status + item kitchen statuses
      store.patchOrder(orderId, {
        order_status: orderStatus,
        sent_to_kitchen_at: order.sent_to_kitchen_at || now,
        check_status: "Opened",
        items: order.items.map((item) => ({
          ...item,
          kitchen_status:
            !item.kitchen_status || item.kitchen_status === "new"
              ? (kitchenStatus as "sent" | "preparing")
              : item.kitchen_status,
          item_status: !item.item_status
            ? ("Preparing" as const)
            : item.item_status,
        })),
      });

      // Backend sync: order status + item statuses
      if (order.db_order_id) {
        const { OrderService } = require("@/services/orderService");
        OrderService.updateOrderStatus(
          supabase,
          order.db_order_id,
          orderStatus,
        )
          .then(({ error }: { error: any }) => {
            if (
              error &&
              error.code !== "P0001" &&
              !error.message?.includes("already in")
            ) {
              console.error("[PreAuthService] Status sync failed:", error);
            }
            // Then update item statuses
            const dbItemIds = order.items
              .map((i) => i.db_order_item_id)
              .filter((id): id is string => !!id);
            if (dbItemIds.length > 0) {
              // Wave 3.0d-4: per-intent idempotency key so retries dedupe.
              const { toBulkUpdateStatusKey } = require("@/lib/network/idempotencyKey");
              OrderService.bulkUpdateOrderItemStatus(
                supabase,
                dbItemIds,
                kitchenStatus,
                { keyOverride: toBulkUpdateStatusKey(dbItemIds, kitchenStatus) },
              ).catch((err: Error) =>
                console.error(
                  "[PreAuthService] Item status sync failed:",
                  err,
                ),
              );
            }
          })
          .catch((err: Error) =>
            console.error("[PreAuthService] Send to kitchen failed:", err),
          );
      }
    }

    // 5. Async backend sync (pre-auth payment)
    syncPreAuthToBackend(orderId, payment, terminalResponse, supabase).catch(
      (err) => console.error("[PreAuthService] Backend sync failed:", err),
    );

    return { success: true, payment };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PreAuthService] openTab error:", message);
    return { success: false, error: message };
  }
}

// ============================================================
// INCREASE TAB (Incremental Auth)
// ============================================================

export async function increaseTab(
  orderId: string,
  paymentId: string,
  newAmount: number,
  terminal: TerminalInstance,
  supabase: SupabaseClient,
  onTransactionStart?: (refId: string) => void,
): Promise<IncrementResult> {
  try {
    const store = useOrderStore.getState();
    const order = store.ordersById[orderId];
    const payment = order?.payments?.find((p) => p.id === paymentId);

    if (!payment || payment.status !== "authorized") {
      return { success: false, error: "No active pre-auth found" };
    }

    let terminalResponse: Record<string, unknown> | undefined;

    if (terminal.type === "castles") {
      // Castles supports native incremental auth
      const referenceId = generateRefId("INCR");
      onTransactionStart?.(referenceId);
      const result = await terminal.service.processAuthIncremental({
        amount: newAmount,
        referenceId,
        rrn: payment.preAuthRrn,
        stan: payment.preAuthStan,
      });

      if (!result.success) {
        return { success: false, error: result.error || "Incremental auth failed" };
      }

      terminalResponse = result.terminalResponse;
    } else {
      // Dejavoo does NOT support incremental auth natively
      // Just update local tracking — processor handles tolerance at capture time
      toastService.show({
        title: "Tab Amount Updated",
        message: `Hold tracking updated to $${newAmount.toFixed(2)}. Processor will attempt capture at final amount.`,
        duration: 5000,
      });
    }

    // Update payment in store
    const updatedPayments = (order.payments ?? []).map((p) =>
      p.id === paymentId ? { ...p, preAuthAmount: newAmount, amount: newAmount } : p,
    );
    store.patchOrder(orderId, { payments: updatedPayments });

    // Backend sync
    if (payment.db_payment_id) {
      syncIncrementToBackend(payment.db_payment_id, newAmount, terminalResponse, supabase).catch(
        (err) => console.error("[PreAuthService] Increment sync failed:", err),
      );
    }

    return { success: true, newAmount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PreAuthService] increaseTab error:", message);
    return { success: false, error: message };
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Poll for db_payment_id to appear on a payment (set by syncPreAuthToBackend).
 * Returns the db_payment_id or undefined if timeout expires.
 */
async function waitForDbPaymentId(
  orderId: string,
  paymentId: string,
  timeoutMs = 5000,
  intervalMs = 200,
): Promise<string | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const order = useOrderStore.getState().ordersById[orderId];
    const pmt = order?.payments?.find((p) => p.id === paymentId);
    if (pmt?.db_payment_id) return pmt.db_payment_id;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return undefined;
}

// ============================================================
// CLOSE TAB (Capture)
// ============================================================

export async function closeTab(
  orderId: string,
  paymentId: string,
  captureAmount: number,
  tipAmount: number,
  terminal: TerminalInstance,
  supabase: SupabaseClient,
  onTransactionStart?: (refId: string) => void,
): Promise<CaptureResult> {
  try {
    const store = useOrderStore.getState();
    const order = store.ordersById[orderId];
    const payment = order?.payments?.find((p) => p.id === paymentId);

    if (!payment || payment.status !== "authorized") {
      return { success: false, error: "No active pre-auth found" };
    }

    let terminalResponse: Record<string, unknown> | undefined;
    const referenceId = generateRefId("CAPT");

    // 1. Call terminal to capture
    if (terminal.type === "castles") {
      onTransactionStart?.(referenceId);
      const result = await terminal.service.processAuthComplete({
        captureAmount: captureAmount + tipAmount,
        referenceId,
        rrn: payment.preAuthRrn,
        stan: payment.preAuthStan,
      });

      if (!result.success) {
        return { success: false, error: result.error || "Capture failed" };
      }

      terminalResponse = result.terminalResponse;
    } else {
      const dejavooRef = payment.preAuthReferenceId ?? referenceId;
      onTransactionStart?.(dejavooRef);
      const result = await terminal.api
        .capture()
        .amount(captureAmount)
        .tip(tipAmount)
        .referenceId(dejavooRef)
        .execute();

      if (!result.success) {
        return { success: false, error: result.error || "Capture failed" };
      }

      terminalResponse = {
        terminal_vendor: "dejavoo",
        dejavoo_transaction: result.data,
        raw_dejavoo_response: result.rawResponse,
      };
    }

    // 2. Update payment in store: status → captured, update amounts
    const totalCollected = captureAmount + tipAmount;
    const updatedPayments = (order.payments ?? []).map((p) =>
      p.id === paymentId
        ? {
            ...p,
            status: "captured" as const,
            amount: captureAmount,
            tip_amount: tipAmount,
            total_collected: totalCollected,
            isPreAuth: false,
          }
        : p,
    );

    // Update order totals
    const newAmountPaid = (order.amount_paid ?? 0) + captureAmount;
    const newAmountDue = Math.max((order.total_amount ?? 0) - newAmountPaid, 0);
    const orderFullyPaid = newAmountDue <= 0;

    store.patchOrder(orderId, {
      payments: updatedPayments,
      amount_paid: newAmountPaid,
      amount_due: newAmountDue,
      paid_status: orderFullyPaid ? "Paid" : newAmountPaid > 0 ? "Partial" : "Unpaid",
      check_status: orderFullyPaid ? "Closed" : undefined,
    });

    // 3. Backend sync — AWAIT capture before closeCheck
    // capture_preauth_v1 updates amount_paid/amount_due/payment_status.
    // close_check increments sync_version (triggers realtime sync).
    // If closeCheck fires first, realtime overwrites local with stale server data.
    const freshOrder = useOrderStore.getState().ordersById[orderId];
    const freshPayment = freshOrder?.payments?.find((p) => p.id === paymentId);
    let dbPayId = freshPayment?.db_payment_id ?? payment.db_payment_id;

    // If no db_payment_id yet, wait for syncPreAuthToBackend to complete (up to 5s)
    if (!dbPayId) {
      dbPayId = await waitForDbPaymentId(orderId, paymentId);
    }

    if (dbPayId) {
      try {
        await syncCaptureToBackend(dbPayId, captureAmount, tipAmount, terminalResponse, supabase);
      } catch (err) {
        console.error("[PreAuthService] Capture sync failed:", err);
      }
    } else {
      console.warn("[PreAuthService] No db_payment_id after polling — capture sync skipped");
    }

    // Close check AFTER capture (capture updates order totals, close_check increments sync_version)
    if (orderFullyPaid && order.db_order_id) {
      try {
        const { OrderService } = require("@/services/orderService");
        await OrderService.closeCheck(supabase, order.db_order_id, null);
      } catch (err) {
        console.error("[PreAuthService] closeCheck failed:", err);
      }
    }

    // 4. If fully paid, dispatch FULL_PAYMENT session action (local, no await needed)
    if (orderFullyPaid && order.service_location_id) {
      const { useTableSessionStore } = require("@/stores/useTableSessionStore");
      useTableSessionStore.getState().dispatchAction?.({
        type: "FULL_PAYMENT",
        tableId: order.service_location_id,
      });
    }

    return {
      success: true,
      capturedAmount: captureAmount,
      tipAmount,
      orderFullyPaid,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PreAuthService] closeTab error:", message);
    return { success: false, error: message };
  }
}

// ============================================================
// RELEASE TAB (Void Pre-Auth)
// ============================================================

export async function releaseTab(
  orderId: string,
  paymentId: string,
  terminal: TerminalInstance,
  supabase: SupabaseClient,
  onTransactionStart?: (refId: string) => void,
): Promise<VoidResult> {
  try {
    const store = useOrderStore.getState();
    const order = store.ordersById[orderId];
    const payment = order?.payments?.find((p) => p.id === paymentId);

    if (!payment || payment.status !== "authorized") {
      return { success: false, error: "No active pre-auth found" };
    }

    // 1. Call terminal to release hold FIRST (before backend)
    if (terminal.type === "castles") {
      const referenceId = generateRefId("VOID");
      onTransactionStart?.(referenceId);
      const result = await terminal.service.processVoid({
        rrn: payment.preAuthRrn,
        stan: payment.preAuthStan,
        referenceId,
      });

      if (!result.success) {
        return { success: false, error: result.error || "Failed to release hold on terminal" };
      }
    } else {
      const dejavooRef = payment.preAuthReferenceId ?? "";
      onTransactionStart?.(dejavooRef);
      const result = await terminal.api
        .void()
        .amount(payment.preAuthAmount ?? payment.amount)
        .referenceId(dejavooRef)
        .execute();

      if (!result.success) {
        return { success: false, error: result.error || "Failed to release hold on terminal" };
      }
    }

    // 2. Update store
    const updatedPayments = (order.payments ?? []).map((p) =>
      p.id === paymentId
        ? {
            ...p,
            status: "voided" as const,
            isVoided: true,
            voidedAt: new Date().toISOString(),
            voidReason: "Pre-auth released",
          }
        : p,
    );
    store.patchOrder(orderId, { payments: updatedPayments });

    // 3. Backend sync
    if (payment.db_payment_id) {
      syncVoidToBackend(payment.db_payment_id, supabase).catch((err) =>
        console.error("[PreAuthService] Void sync failed:", err),
      );
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PreAuthService] releaseTab error:", message);
    return { success: false, error: message };
  }
}

// ============================================================
// BACKEND SYNC HELPERS
// ============================================================

// Pre-auth v3 adds processor_fee_percentage_snapshot / dual_pricing_fee /
// tip_fee stamping. Gated by EXPO_PUBLIC_PREAUTH_V3 — flip to '1' on staging
// first, then prod, mirroring the v9 → v10 rollout for process_payment.
const PREAUTH_USE_V3 =
  process.env.EXPO_PUBLIC_PREAUTH_V3 === "1" ||
  process.env.EXPO_PUBLIC_PREAUTH_V3 === "true";


async function syncPreAuthToBackend(
  orderId: string,
  payment: OrderProfilePayment,
  terminalResponse: Record<string, unknown> | undefined,
  supabase: SupabaseClient,
): Promise<void> {
  const store = useOrderStore.getState();
  const order = store.ordersById[orderId];
  const dbOrderId = order?.db_order_id;

  if (!dbOrderId) {
    console.warn("[PreAuthService] No db_order_id — queuing for offline sync");
    return;
  }

  const rpcName = PREAUTH_USE_V3 ? "process_preauth_v3" : "process_preauth_v1";
  const { data, error } = await supabase.rpc(rpcName, {
    p_order_id: dbOrderId,
    p_amount: payment.amount,
    p_terminal_response: terminalResponse ?? null,
    p_staff_id: null,
    p_terminal_type: payment.preAuthTerminalType ?? "dejavoo",
  });

  if (error) {
    console.error(`[PreAuthService] ${rpcName} failed:`, error.message);
    return;
  }

  const result = data as { success: boolean; payment_id?: string };
  if (result?.success && result.payment_id) {
    // Update local payment with backend ID
    const currentOrder = useOrderStore.getState().ordersById[orderId];
    const updatedPayments = (currentOrder?.payments ?? []).map((p) =>
      p.id === payment.id
        ? { ...p, db_payment_id: result.payment_id, sync_status: "synced" as const }
        : p,
    );
    useOrderStore.getState().patchOrder(orderId, { payments: updatedPayments });
  }
}

async function syncIncrementToBackend(
  dbPaymentId: string,
  newAmount: number,
  terminalResponse: Record<string, unknown> | undefined,
  supabase: SupabaseClient,
): Promise<void> {
  const rpcName = PREAUTH_USE_V3 ? "update_preauth_amount_v3" : "update_preauth_amount_v1";
  const { error } = await supabase.rpc(rpcName, {
    p_payment_id: dbPaymentId,
    p_new_amount: newAmount,
    p_terminal_response: terminalResponse ?? null,
  });

  if (error) {
    console.error(`[PreAuthService] ${rpcName} failed:`, error.message);
  }
}

async function syncCaptureToBackend(
  dbPaymentId: string,
  captureAmount: number,
  tipAmount: number,
  terminalResponse: Record<string, unknown> | undefined,
  supabase: SupabaseClient,
): Promise<void> {
  const rpcName = PREAUTH_USE_V3 ? "capture_preauth_v3" : "capture_preauth_v1";
  const { error } = await supabase.rpc(rpcName, {
    p_payment_id: dbPaymentId,
    p_capture_amount: captureAmount,
    p_tip_amount: tipAmount,
    p_terminal_response: terminalResponse ?? null,
    p_staff_id: null,
  });

  if (error) {
    console.error(`[PreAuthService] ${rpcName} failed:`, error.message);
  }
}

async function syncVoidToBackend(
  dbPaymentId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.rpc("void_preauth_v1", {
    p_payment_id: dbPaymentId,
    p_staff_id: null,
    p_reason: "Pre-auth released",
  });

  if (error) {
    console.error("[PreAuthService] void_preauth_v1 failed:", error.message);
  }
}
