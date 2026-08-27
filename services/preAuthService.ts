// ============================================================
// Pre-Auth Service — Orchestrates tab open/increase/close/release
// ============================================================
// Central orchestration layer that branches on terminal type,
// calls the terminal, then updates the store + backend.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { getDeviceId } from "@/lib/deviceId";
import {
  buildKitchenSendQueueParams,
  createKitchenSendContext,
  isTerminalKitchenMutationError,
} from "@/lib/kdsSendTraceability";
import { toastService } from "@/lib/toastService";
import type { OrderProfilePayment } from "@/lib/types";
import type { CastlesService } from "@/services/terminals/castles-service";
import type { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import type { ValorService } from "@/services/terminals/valor-service";
import { getOrCreateValorCounter } from "@/services/terminals/valor-txn-counter";
import { generateRefId } from "@/types/dejavoo-spin-api";
import { useOrderStore } from "@/stores/useOrderStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { queueFailedOperation } from "@/services/offlineSyncInit";

/**
 * Mint a Valor REQ_TXN_ID from the per-terminal counter (echoed back as
 * MER_TXN_ID for correlation). Unlike Castles/Dejavoo — which use the
 * alphanumeric generateRefId — Valor's reference must come from this counter.
 */
async function nextValorRefId(
  terminalId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const counter = getOrCreateValorCounter({ terminalId, supabaseClient: supabase });
  if (!counter.isInitialized) await counter.initialize();
  return counter.next();
}

/**
 * Kill switch for Valor open-tab (pre-auth). Temporarily OFF: the on-device flow
 * was slow and needs perf work before shipping. Flip to `true` to re-enable —
 * gates BOTH the service (openTab below) and the "Open Tab" UI entry
 * (PaymentMethodSelectionView imports this). Close/Release stay available so an
 * existing Valor hold can still be captured or voided.
 */
export const VALOR_OPEN_TAB_ENABLED = false;

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
  | { type: "dejavoo"; api: DejavooSpinAPI }
  | { type: "valor"; service: ValorService; terminalId: string };

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
    // Valor's REQ_TXN_ID must come from its terminal counter (echoed back as
    // MER_TXN_ID for correlation); Castles/Dejavoo use the alphanumeric refId.
    const referenceId =
      terminal.type === "valor"
        ? await nextValorRefId(terminal.terminalId, supabase)
        : generateRefId("AUTH");
    onTransactionStart?.(referenceId);
    let terminalResponse: Record<string, unknown> | undefined;
    let rrn: string | undefined;
    let stan: string | undefined;
    let authCode: string | undefined;
    let refId: string | undefined;
    let cardBrand: string | undefined;
    let last4: string | undefined;
    let entryMode: string | undefined;
    let valorTranNo: string | undefined;

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
    } else if (terminal.type === "valor") {
      if (!VALOR_OPEN_TAB_ENABLED) {
        return {
          success: false,
          error: "Open Tab is temporarily unavailable on Valor terminals.",
        };
      }
      // preAuthService works in DOLLARS; the Valor service takes integer CENTS.
      // (Passing dollars here charged $25 as a 25¢ hold.)
      const amountCents = Math.round((amount + Number.EPSILON) * 100);
      const result = await terminal.service.processPreAuth({
        amount: amountCents,
        referenceId,
      });

      if (!result.success) {
        // Indeterminate (a hold may exist) vs clean decline — both fail the open,
        // but the message nudges staff to release from the terminal when unsure.
        return {
          success: false,
          error: result.indeterminate
            ? "Hold status unknown — if a hold was placed, release it from the terminal."
            : result.error || "Pre-auth declined",
        };
      }

      const valorTxn = result.terminalResponse?.valor_transaction as
        | Record<string, any>
        | undefined;
      const tranNo = result.tranNo ?? (valorTxn?.tranNo || undefined);
      last4 = valorTxn?.cardLast4 || undefined;

      // A hold with NO usable reference (no TRAN_NO and no last-4) is uncapturable
      // AND unvoidable by reference — never store it as a normal authorized payment.
      if (!tranNo && !last4) {
        return {
          success: false,
          error: "Hold placed but no reference returned — release it from the terminal.",
        };
      }

      terminalResponse = result.terminalResponse;
      rrn = result.rrn;
      stan = result.stan;
      authCode = valorTxn?.approvalCode || undefined;
      refId = referenceId;
      cardBrand = valorTxn?.cardType || undefined;
      entryMode = valorTxn?.entryMode || undefined;
      valorTranNo = tranNo;
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
      preAuthTranNo: valorTranNo,
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
        // Fire ONLY the items this pre-auth just marked as sent. A scan by db
        // id alone (no kitchen_status clause) re-fires everything already sent
        // on the tab (K4): bulk_update_order_item_status_v2 rewrites fire_time
        // and moves those items onto fresh KDS tickets (S2).
        const sendItems = order.items.filter(
          (item) =>
            item.db_order_item_id &&
            (!item.kitchen_status || item.kitchen_status === "new"),
        );
        const dbItemIds = sendItems.map((item) => item.db_order_item_id!);
        const localItemIds = sendItems.map((item) => item.id);
        const sendContext = createKitchenSendContext({
          stationId:
            useStoreSettingsStore.getState().selectedStation?.id ?? null,
          deviceId: getDeviceId(),
          staffId:
            useEmployeeStore.getState().getEffectiveCreatorStaffId() ?? null,
        });

        if (dbItemIds.length > 0) {
          void (async () => {
            try {
              const result = await OrderService.sendOrderToKitchen(
                supabase,
                order.db_order_id!,
                dbItemIds,
                orderStatus,
                kitchenStatus,
                {
                  staffId: sendContext.staffId,
                  stationId: sendContext.stationId,
                  deviceId: sendContext.deviceId,
                  idempotencyKey: sendContext.sendIdempotencyKey,
                  itemsIdempotencyKey: sendContext.itemsIdempotencyKey,
                },
              );
              if (!result.error) return;

              if (isTerminalKitchenMutationError(result.error)) {
                toastService.show({
                  title: "Kitchen send incomplete",
                  message: result.error.hint,
                  type: "warning",
                  duration: 7000,
                });
                return;
              }

              await queueFailedOperation(
                "send_to_kitchen",
                buildKitchenSendQueueParams(
                  orderId,
                  localItemIds,
                  sendContext,
                  { orderStatus, itemStatus: kitchenStatus },
                  { resolvedItemIds: dbItemIds, unresolvedLocalItemIds: [] },
                ),
                orderId,
                undefined,
                undefined,
                { idempotencyKey: sendContext.sendIdempotencyKey },
              );
            } catch (error) {
              console.error("[PreAuthService] Send to kitchen failed:", error);
              await queueFailedOperation(
                "send_to_kitchen",
                buildKitchenSendQueueParams(
                  orderId,
                  localItemIds,
                  sendContext,
                  { orderStatus, itemStatus: kitchenStatus },
                  { resolvedItemIds: dbItemIds, unresolvedLocalItemIds: [] },
                ),
                orderId,
                undefined,
                undefined,
                { idempotencyKey: sendContext.sendIdempotencyKey },
              );
            }
          })();
        }
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
    const referenceId =
      terminal.type === "valor"
        ? await nextValorRefId(terminal.terminalId, supabase)
        : generateRefId("CAPT");

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
    } else if (terminal.type === "valor") {
      onTransactionStart?.(referenceId);
      // preAuthService works in dollars; the Valor service takes integer cents.
      const captureCents = Math.round((captureAmount + Number.EPSILON) * 100);
      const tipCents = Math.round((tipAmount + Number.EPSILON) * 100);
      const result = await terminal.service.processAuthComplete({
        captureAmount: captureCents,
        tipAmount: tipCents,
        tranNo: payment.preAuthTranNo,
        cardNo: payment.last4, // last-4 fallback when TRAN_NO is missing
        referenceId,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.indeterminate
            ? "Capture status unknown — verify on the terminal before retrying."
            : result.error || "Capture failed",
        };
      }

      terminalResponse = result.terminalResponse;

      // Expired-hold partial capture: ledger the terminal-reported total (base vs
      // tip can't be split on a partial) so the order totals match what was charged.
      if (result.partial && typeof result.approvedAmount === "number") {
        console.warn(
          `[PreAuthService] Valor completion captured ${result.approvedAmount}c of ${captureCents + tipCents}c requested`,
        );
        captureAmount = result.approvedAmount / 100;
        tipAmount = 0;
      }
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
      // The terminal captured the card but we have no db_payment_id to record it
      // against — a money-vs-ledger divergence. Surface it loudly (the payment
      // stays locally 'captured' and reconciles when the order re-syncs).
      console.error(
        "[PreAuthService] Card captured on terminal but backend sync could not be linked (no db_payment_id)",
      );
      toastService.show({
        title: "Capture Not Fully Synced",
        message:
          "The card was charged but the record didn't sync yet. It will retry — verify in reports if it persists.",
        type: "warning",
        duration: 8000,
      });
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
    } else if (terminal.type === "valor") {
      const referenceId = await nextValorRefId(terminal.terminalId, supabase);
      onTransactionStart?.(referenceId);
      // Valor voids reference the hold by TRAN_NO (or last-4 CARD_NO) — NOT rrn/stan.
      const result = await terminal.service.processVoid({
        tranNo: payment.preAuthTranNo,
        cardNo: payment.last4,
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

// v4 adds the Valor card-field arm to process_preauth / capture_preauth (mirrors
// the process_payment v16→v17 fix). Identical signatures to v3, so the arg types
// below still check against v3. Flip to '1' on staging first, then prod — and
// deploy the v4 migration BEFORE enabling it in prod (else Valor pre-auth persists
// null card columns). update_preauth_amount stays v3 (card-field-agnostic).
const PREAUTH_USE_V4 =
  process.env.EXPO_PUBLIC_PREAUTH_V4 === "1" ||
  process.env.EXPO_PUBLIC_PREAUTH_V4 === "true";


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

  const rpcName = PREAUTH_USE_V4
    ? "process_preauth_v4"
    : PREAUTH_USE_V3
      ? "process_preauth_v3"
      : "process_preauth_v1";
  // v4 shares v3's signature, so the cast keeps the args type-checked.
  const { data, error } = await supabase.rpc(rpcName as "process_preauth_v3", {
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
  const rpcName = PREAUTH_USE_V4
    ? "capture_preauth_v4"
    : PREAUTH_USE_V3
      ? "capture_preauth_v3"
      : "capture_preauth_v1";
  // v4 shares v3's signature, so the cast keeps the args type-checked.
  const { error } = await supabase.rpc(rpcName as "capture_preauth_v3", {
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
