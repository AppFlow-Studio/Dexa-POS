import { resolveKioskChargeOutcome, KIOSK_VERIFY_STAFF_MESSAGE } from "./chargeOutcome";
import { acquireKioskCheckout, markKioskPaymentDispatched, releaseKioskCheckout } from "./checkoutGuard";
import { flagKioskAssistance } from "./flagKioskAssistance";
import { refreshSelectedStationOperationalState } from "@/services/posAccessService";
import { completePaymentJournal } from "@/services/paymentJournal";
import { round2 } from "@/utils/money";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { calculateOrderTotals } from "@/lib/order-calculator";
import type { CartItem } from "@/lib/types";
import { sendReceipt } from "@/services/messaging/sendReceiptService";
import { payFullCard } from "@/services/paymentService";
import { PrinterService } from "@/services/printing/PrinterService";
import { getReceiptPrinter } from "@/services/printing/PrintRouter";
import {
  chargeActiveTerminal,
  type ChargeStartedHandle,
} from "@/services/terminals/chargeActiveTerminal";
import { cancelActiveTerminalCharge } from "@/services/terminals/cancelActiveTerminalCharge";
import {
  lineCashUnitPrice,
  lineUnitPrice,
  useKioskCartStore,
  type KioskCartLine,
} from "@/stores/useKioskCartStore";
import { useKioskProfileStore } from "@/stores/useKioskProfileStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

/**
 * Shared kiosk checkout orchestration — no layout. Converts the local kiosk cart
 * into a real takeout order and drives the existing POS pipeline so the kiosk
 * ends in the target state: PAID → SENT TO KITCHEN.
 *
 * Sequence (mirrors the POS pay flow):
 *   1. startNewOrder({ tableId: null })           → local takeout order
 *   2. setActiveOrder + ensureActiveOrderCreated  → backend row exists
 *   3. addItemToActiveOrder per cart line         → store recomputes totals/tax
 *   4. chargeCard (terminal; DEV-only mock if none) → card approved
 *   5. payFullCard                                → records the payment
 *   6. sendNewItemsToKitchenForOrder              → paid items to KDS
 *
 * Card pricing is used (customer pays by card). Tip is passed through from the
 * caller (the tip screen). Templates own the screens; this owns the logic.
 */
export type KioskCheckoutStatus =
  | "idle"
  | "creating" // building + creating the backend order
  | "ready" // order created, totals known, awaiting pay
  | "charging" // waiting on the terminal
  | "cancelling" // Back pressed during the card read — aborting on the device
  | "cancelled" // confirmed cancel: no charge, order voided
  | "finalizing" // kitchen send + payment record
  | "success"
  | "assistance" // possible/confirmed charge: staff must reconcile, no retry
  | "error";

/**
 * DEV-only: how long the no-terminal simulated approval parks on the card
 * prompt, so the "Swipe, Tap, or Insert" screen and its Back button can be
 * exercised on a hardware-free build. Ignored in release and whenever a real
 * terminal is configured.
 */
const KIOSK_SIMULATED_CARD_WAIT_MS = 60_000;

export interface KioskCheckoutTotals {
  subtotal: number;
  tax: number;
  total: number;
}

export interface KioskCheckoutResult {
  /** Local order id (store key). */
  orderId: string;
  /** Human-facing pickup/display number, if assigned. */
  displayNumber?: string;
}

/**
 * Identifying details for an order that landed in the "assistance" state, shown
 * on the "Please see a staff member" screen so staff can find the order, and
 * flagged to the dev team via {@link flagKioskAssistance}.
 */
export interface KioskAssistanceRef {
  /** Groupable code — see KioskAssistanceFlag.reason. */
  reason: string;
  /** Backend order id. */
  dbOrderId?: string;
  /** Local order store key. */
  orderId?: string;
  /** Human-facing pickup/display number, if assigned. */
  displayNumber?: string;
  /** ISO timestamp of when the assistance state was entered. */
  at: string;
}

/** Build a POS CartItem from a kiosk cart line (card pricing). Totals/tax are
 * recomputed by the order store on add, so we only supply prices + modifiers. */
function toCartItem(line: KioskCartLine): CartItem {
  const unit = lineUnitPrice(line); // base + modifiers, card
  const cashUnit = lineCashUnitPrice(line); // base + modifiers, cash
  const modifiers = line.modifiers.map((g) => ({
    categoryId: g.categoryId,
    categoryName: g.categoryName,
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      price: o.price,
    })),
  }));

  // The order calculator derives the effective price from baseCardPrice/
  // baseCashPrice PLUS the modifiers in `customizations` — it does NOT read
  // `price`/`cashPrice`. So we MUST supply the per-unit *base* (pre-modifier)
  // prices here, exactly like the POS does (see ModifierScreen/OrderDetails).
  // Omitting them made the cash side fall back to the card unitPrice and the
  // card side ignore modifiers, undercharging modified items.
  return {
    id: `${line.menuItemId}_${line.lineId}`,
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: line.quantity,
    price: unit,
    unitPrice: line.unitPrice,
    baseCardPrice: line.unitPrice,
    cashPrice: cashUnit,
    baseCashPrice: line.cashUnitPrice,
    originalPrice: unit,
    image: line.image,
    paidQuantity: 0,
    customizations: {
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      notes: line.notes,
    },
  } as CartItem;
}

export function useKioskCheckout() {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<KioskCheckoutStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KioskCheckoutResult | null>(null);
  const [totals, setTotals] = useState<KioskCheckoutTotals | null>(null);
  const [assistanceRef, setAssistanceRef] = useState<KioskAssistanceRef | null>(
    null,
  );

  // Cancel plumbing. `chargeHandleRef` holds what the active sale needs to be
  // aborted (set by chargeActiveTerminal's onChargeStarted); `cancelRequestedRef`
  // records that the customer pressed Back so payOrder can treat a clean charge
  // failure as a confirmed cancellation rather than a decline.
  const chargeHandleRef = useRef<ChargeStartedHandle | null>(null);
  const cancelRequestedRef = useRef(false);
  const runningRef = useRef(false);
  const settledRef = useRef(false);
  const chargingRef = useRef(false);

  const reset = useCallback(() => {
    if (runningRef.current || settledRef.current) return;
    setStatus("idle");
    setError(null);
    setResult(null);
    setTotals(null);
    setAssistanceRef(null);
    chargeHandleRef.current = null;
    cancelRequestedRef.current = false;
  }, []);

  /**
   * Enter the "assistance" state (customer sees "Please see a staff member").
   * Centralizes the three effects every assistance transition needs: set the
   * UI status + message, record an on-screen order/time reference, and flag the
   * event to the dev team. Best-effort resolves the station + display number
   * from the stores at call time.
   */
  const enterAssistance = useCallback(
    (
      reason: string,
      message: string,
      ctx?: { dbOrderId?: string; orderId?: string },
    ) => {
      const stationId = useStoreSettingsStore.getState().selectedStation?.id;
      const displayNumber = ctx?.orderId
        ? useOrderStore.getState().ordersById[ctx.orderId]?.display_number
        : undefined;
      const at = new Date().toISOString();
      setStatus("assistance");
      setError(message);
      setAssistanceRef({
        reason,
        dbOrderId: ctx?.dbOrderId,
        orderId: ctx?.orderId,
        displayNumber,
        at,
      });
      flagKioskAssistance({
        reason,
        message,
        at,
        stationId,
        dbOrderId: ctx?.dbOrderId,
        orderId: ctx?.orderId,
        displayNumber,
      });
    },
    [],
  );

  /**
   * Compute the order totals LOCALLY from the current cart — no backend order is
   * created. Uses the same `calculateOrderTotals` the order store uses, with the
   * location tax rates, so the figure shown on the tip/summary screen is exactly
   * what will be charged. Safe to call repeatedly (e.g. on every checkout entry
   * after the customer edits the cart). Returns null if the cart is empty.
   *
   * No backend order exists until `payOrder` runs, so backing out / editing the
   * cart / re-entering checkout never leaves an orphaned or zeroed order.
   */
  const computeTotals = useCallback((): KioskCheckoutTotals | null => {
    const cart = useKioskCartStore.getState();
    if (cart.lines.length === 0) {
      setStatus("error");
      setError("Your cart is empty.");
      return null;
    }

    const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap ?? {};
    const items = cart.lines.map(toCartItem);
    const t = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap,
      payments: [],
    });

    const next: KioskCheckoutTotals = {
      subtotal: t.subtotal,
      tax: t.tax_amount,
      total: t.total_amount,
    };
    setError(null);
    setTotals(next);
    setStatus("ready");
    return next;
  }, []);

  /**
   * Create the order, add the cart items, sync, charge, persist, and send to kitchen.
   * Runs only when the customer commits to paying.
   * `tipAmount` is absolute dollars (0 if none). Returns the result or null on
   * failure (status/error set).
   */
  const payOrder = useCallback(
    async (tipAmount: number): Promise<KioskCheckoutResult | null> => {
      if (runningRef.current || settledRef.current) return null;
      const stationId = useStoreSettingsStore.getState().selectedStation?.id;
      if (!stationId || !acquireKioskCheckout(stationId)) {
        enterAssistance(
          "guard_held",
          "This kiosk needs staff assistance before another payment can start.",
        );
        return null;
      }
      runningRef.current = true;
      let needsReview = false;
      // Hoisted so the catch block can reference the backend order id when it
      // flags an assistance event.
      let createdDbId: string | undefined;
      const cart = useKioskCartStore.getState();
      const orderStore = useOrderStore.getState();

      setError(null);
      setStatus("creating");

      try {
        const location = useStoreSettingsStore.getState().selectedStore;
        if (!location?.id || !location.merchant_id) throw new Error("Kiosk location is not configured. Please see a staff member.");
        if (cart.lines.length === 0) throw new Error("Your cart is empty.");
        if (!Number.isFinite(tipAmount) || tipAmount < 0 || round2(tipAmount) !== tipAmount) {
          throw new Error("Invalid tip amount.");
        }
        const access = await refreshSelectedStationOperationalState(supabase);
        if (!access.valid) throw new Error(access.failure.message);
        const station = useStoreSettingsStore.getState().selectedStation;
        if (station?.id !== stationId || station.can_process_payments === false || station.can_create_orders === false) {
          throw new Error("This station cannot process kiosk orders. Please see a staff member.");
        }
        // 1. Create the backend order now (deferred until pay). Apply the
        // customer's chosen order type (dine_in / takeout) BEFORE the backend
        // row is created, so it's sent on creation rather than defaulting to
        // takeout. startNewOrder({ tableId: null }) always yields takeout, so we
        // patch it from the cart selection.
        const order = orderStore.startNewOrder({});
        // Apply order type + the captured customer BEFORE the backend row is
        // created — ensureActiveOrderCreated sends p_customer_name/p_customer_phone
        // on creation, so the name/phone (and thus the receipt greeting) are
        // attached from the start.
        orderStore.patchOrder(order.id, {
          ...(cart.orderType ? { order_type: cart.orderType } : {}),
          ...(cart.customerName ? { customer_name: cart.customerName } : {}),
          ...(cart.customerPhone ? { customer_phone: cart.customerPhone } : {}),
          ...(cart.customerId ? { customer_id: cart.customerId } : {}),
        });
        orderStore.setActiveOrder(order.id);
        createdDbId =
          (await orderStore.ensureActiveOrderCreated(order.id)) ?? undefined;
        if (!createdDbId) {
          setStatus("error");
          setError("Could not create the order. Please try again.");
          return null;
        }

        // Best-effort: link the order to the customer row so the analytics /
        // loyalty trigger can attribute it. Non-fatal — the name/phone are
        // already on the order regardless.
        if (cart.customerId) {
          try {
            await supabase
              .from("orders")
              .update({ customer_id: cart.customerId })
              .eq("id", createdDbId);
          } catch {
            /* non-fatal */
          }
        }

        // The order may be re-keyed (local id → db_order_id) during creation.
        const liveOrderId =
          useOrderStore.getState().activeOrderId ??
          (createdDbId
            ? useOrderStore.getState().dbOrderIdIndex?.[createdDbId]
            : undefined) ??
          order.id;

        // 2. Add items and wait for them to land on the backend.
        const expectedItemCount = cart.lines.length;
        for (const line of cart.lines) {
          orderStore.addItemToActiveOrder(toCartItem(line));
        }
        await orderStore.waitForPendingSyncs(liveOrderId, { maxMs: 15000 });

        // GUARD — never charge an order missing items. Every line must be on
        // the order AND have a backend id.
        const synced = useOrderStore.getState().ordersById[liveOrderId];
        const nonDraft = (synced?.items ?? []).filter((i) => !i.isDraft);
        const allHaveBackendId = nonDraft.every((i) => !!i.db_order_item_id);
        if (nonDraft.length < expectedItemCount || !allHaveBackendId) {
          // Items didn't fully sync — void the half-built order so it doesn't
          // linger, and surface the error.
          try {
            orderStore.voidOrder(liveOrderId);
          } catch {
            /* best-effort */
          }
          setStatus("error");
          setError(
            "We couldn't confirm all your items. Please check your connection and try again.",
          );
          return null;
        }

        // 3. Authoritative total from the synced order.
        const t = orderStore.recalculateOrder(liveOrderId);
        const { data: header, error: headerError } = await supabase
          .from("orders").select("card_total").eq("id", createdDbId).single();
        const chargeTotal = header?.card_total == null ? NaN : Number(header.card_total);
        const amountToCharge = round2(chargeTotal + tipAmount);
        if (headerError || !Number.isFinite(chargeTotal) || chargeTotal <= 0 || round2(t.total_amount) !== round2(chargeTotal)) {
          try {
            orderStore.voidOrder(liveOrderId);
          } catch {
            /* best-effort */
          }
          setStatus("error");
          setError("The order total looks wrong. Please try again.");
          return null;
        }

        // 4. Charge the card on the station's ACTIVE terminal — same routing +
        // per-processor branches (Castles/Valor/ATOM/Dejavoo) the POS uses.
        // Reset the cancel plumbing for this attempt, and capture the handle the
        // Back button needs to abort the in-flight sale.
        cancelRequestedRef.current = false;
        chargeHandleRef.current = null;
        // Terminal type of the sale, captured when it goes live — used to pick
        // the right cancel-outcome branch (Castles' cancel can't confirm no
        // charge; Valor/Dejavoo cancel on a separate channel and can).
        let startedTerminalType: string | undefined;
        // Recheck billing after order synchronization, immediately before any charge.
        const paymentAccess = await refreshSelectedStationOperationalState(supabase);
        if (!paymentAccess.valid) throw new Error(paymentAccess.failure.message);
        const paymentStation = useStoreSettingsStore.getState().selectedStation;
        if (paymentStation?.id !== stationId || paymentStation.can_process_payments === false || paymentStation.can_create_orders === false) {
          throw new Error("Station changed or payment access was removed. Please see a staff member.");
        }
        markKioskPaymentDispatched(stationId, createdDbId);
        needsReview = true;
        chargingRef.current = true;
        setStatus("charging");
        const charge = await chargeActiveTerminal({
          amount: amountToCharge,
          tipAmount,
          orderId: liveOrderId,
          dbOrderId: createdDbId,
          supabase,
          onChargeStarted: (handle) => {
            chargeHandleRef.current = handle;
            startedTerminalType = handle.terminalType;
            // If the customer pressed Back while we were still connecting (before
            // this handle existed), the abort had no reference id to target for
            // Valor/Dejavoo. Now that the sale is live, dispatch it for real.
            if (cancelRequestedRef.current) {
              void cancelActiveTerminalCharge({
                referenceId: handle.referenceId,
                supabase,
              });
            }
          },
          ...(__DEV__
            ? { simulatedCardWaitMs: KIOSK_SIMULATED_CARD_WAIT_MS }
            : {}),
        });
        chargingRef.current = false;
        chargeHandleRef.current = null;
        // Decide the reaction to the settled charge. An APPROVED card always
        // wins — even if the customer pressed Back a beat too late, the order is
        // completed and taken through confirmation (we must not un-charge it).
        // A possibly-captured charge (indeterminate, or an unconfirmable Castles
        // cancel) is NEVER voided or re-charged — it routes to staff.
        const outcome = resolveKioskChargeOutcome({
          ok: charge.ok,
          indeterminate: charge.indeterminate,
          message: charge.message,
          userCancelled: cancelRequestedRef.current,
          terminalType: startedTerminalType,
        });
        if (outcome.kind !== "success") {
          // Void the half-built order ONLY when nothing could have been
          // captured (confirmed cancel or clean decline). Never for "verify".
          if (outcome.kind === "cancelled" || outcome.kind === "declined") {
            needsReview = false;
            try {
              orderStore.voidOrder(liveOrderId);
            } catch {
              /* best-effort */
            }
          }
          if (outcome.kind === "cancelled") {
            setStatus("cancelled");
            return null;
          }
          if (outcome.kind === "verify") {
            enterAssistance("charge_verify", outcome.message, {
              dbOrderId: createdDbId,
              orderId: liveOrderId,
            });
          } else {
            setStatus("error");
            setError(outcome.message);
          }
          return null;
        }

        // 5. Record the payment.
        setStatus("finalizing");
        const journal = charge.terminalResponse?.paymentJournalHandle as
          | { id: string; idempotencyKey: string }
          | undefined;
        const idempotencyKey = journal?.idempotencyKey ?? uuidv4();
        const payment = await payFullCard(
          createdDbId,
          chargeTotal,
          idempotencyKey,
          tipAmount,
          charge.terminalResponse,
          charge.terminalId,
        );

        if (payment.kind !== "success" || !payment.data.success || !payment.data.order_fully_paid) {
          enterAssistance("payment_record_failed", KIOSK_VERIFY_STAFF_MESSAGE, {
            dbOrderId: createdDbId,
            orderId: liveOrderId,
          });
          return null;
        }
        if (journal) completePaymentJournal(journal.id, payment.data.payment_id);

        // 6. Only AFTER payment succeeds, send the ticket to the kitchen. On a
        // self-service kiosk there's no staff to catch a ticket for an order
        // that never paid, so the KDS send must follow a confirmed payment.
        const kitchen = await orderStore.sendNewItemsToKitchenForOrder(liveOrderId);
        if (kitchen.status !== "sent") {
          enterAssistance(
            "kitchen_send_failed",
            "Your payment was recorded, but kitchen delivery needs staff confirmation. Please do not pay again.",
            { dbOrderId: createdDbId, orderId: liveOrderId },
          );
          return null;
        }
        needsReview = false;
        settledRef.current = true;

        // 7. Text the customer their receipt + a personalized confirmation on
        // top (name + order number). Fire-and-forget — never block or fail the
        // success screen on an SMS hiccup.
        if (cart.customerPhone) {
          void sendReceipt({
            client: supabase,
            dbOrderId: createdDbId,
            deliveryMethod: "sms",
            recipient: cart.customerPhone,
            confirmation: true,
          }).catch(() => {
            /* non-fatal: the order is paid regardless of SMS delivery */
          });
        }

        // 8. Print a receipt when the kiosk profile opts in AND a receipt
        // printer is configured for this station (e.g. a USB printer assigned
        // in kiosk settings). Fire-and-forget — never block or fault the success
        // screen on a printer hiccup; the print queue handles its own retries.
        try {
          const autoPrint =
            useKioskProfileStore.getState().config?.autoPrintReceipt ?? false;
          const store = useStoreSettingsStore.getState().selectedStore;
          if (autoPrint && store && getReceiptPrinter(store.id)) {
            const paidOrder = useOrderStore.getState().ordersById[liveOrderId];
            if (paidOrder) {
              void PrinterService.printReceipt(paidOrder, store).catch((e) =>
                console.warn("[kioskCheckout] receipt print failed:", e),
              );
            }
          }
        } catch (e) {
          console.warn("[kioskCheckout] auto-print skipped:", e);
        }

        const finalOrder = useOrderStore.getState().ordersById[liveOrderId];
        const res: KioskCheckoutResult = {
          orderId: liveOrderId,
          displayNumber: finalOrder?.display_number,
        };
        setResult(res);
        setStatus("success");
        return res;
      } catch (err) {
        console.error("[kioskCheckout] payOrder failed:", err);
        if (needsReview) {
          enterAssistance("payorder_exception", KIOSK_VERIFY_STAFF_MESSAGE, {
            dbOrderId: createdDbId,
          });
        } else {
          setStatus("error");
          setError(
            err instanceof Error
              ? err.message
              : "Could not start payment. Please see a staff member.",
          );
        }
        return null;
      } finally {
        chargingRef.current = false;
        chargeHandleRef.current = null;
        runningRef.current = false;
        if (needsReview) settledRef.current = true;
        releaseKioskCheckout(stationId, needsReview);
      }
    },
    [supabase, enterAssistance],
  );

  /**
   * Cancel the in-flight card read (kiosk Back button). Dispatches an abort to
   * the active terminal (Castles socket close / Valor cancel-before-card /
   * Dejavoo abort). The authoritative outcome — cancelled vs. verify-with-staff
   * vs. raced-to-success — is decided by `payOrder` when the charge settles, so
   * this only flips the UI into "cancelling" and fires the abort. Idempotent:
   * only meaningful while a charge is in flight.
   */
  const cancelCharge = useCallback(async () => {
    if (!chargingRef.current) return;
    if (cancelRequestedRef.current) return; // already cancelling — ignore repeat taps
    cancelRequestedRef.current = true;
    setStatus("cancelling");
    try {
      await cancelActiveTerminalCharge({
        referenceId: chargeHandleRef.current?.referenceId,
        supabase,
      });
    } catch (e) {
      // Non-fatal: the in-flight charge still settles and payOrder resolves the
      // real outcome. A failed dispatch just means the device may not have been
      // told to abort — payOrder's indeterminate guard still protects us.
      console.warn("[kioskCheckout] cancelCharge dispatch failed:", e);
    }
  }, [supabase]);

  return {
    status,
    error,
    result,
    totals,
    assistanceRef,
    computeTotals,
    payOrder,
    cancelCharge,
    reset,
  };
}
