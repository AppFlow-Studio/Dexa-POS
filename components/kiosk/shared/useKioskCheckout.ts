import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { calculateOrderTotals } from "@/lib/order-calculator";
import type { CartItem } from "@/lib/types";
import { sendReceipt } from "@/services/messaging/sendReceiptService";
import { payFullCard } from "@/services/paymentService";
import { PrinterService } from "@/services/printing/PrinterService";
import { getReceiptPrinter } from "@/services/printing/PrintRouter";
import {
  chargeActiveTerminal,
  type ChargeCancelHandle,
} from "@/services/terminals/chargeActiveTerminal";
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
 *   5. sendNewItemsToKitchenForOrder              → items to KDS (before pay RPC)
 *   6. payFullCard                                → records the payment
 *
 * Card pricing is used (customer pays by card). Tip is passed through from the
 * caller (the tip screen). Templates own the screens; this owns the logic.
 */
export type KioskCheckoutStatus =
  | "idle"
  | "creating" // building + creating the backend order
  | "ready" // order created, totals known, awaiting pay
  | "charging" // waiting on the terminal
  | "finalizing" // kitchen send + payment record
  | "success"
  | "cancelled" // aborted at the card prompt — no card read, nothing charged
  | "error";

/**
 * DEV-only: seconds the hardware-free simulated charge sits on the "Swipe, Tap,
 * or Insert your card" screen before approving. Long enough to actually press
 * Cancel and see the abort path work without a terminal. Release builds always
 * talk to real hardware, so this is ignored there.
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

  // Abort handle for the sale currently parked on the terminal's card prompt.
  // Published by `chargeActiveTerminal` the moment the sale is dispatched and
  // retracted when it resolves, so `canCancelCharge` can never go stale.
  const cancelHandleRef = useRef<ChargeCancelHandle | null>(null);
  const [cancelSupported, setCancelSupported] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  // Set when the customer aborts; read by payOrder so a cancel is reported as a
  // cancel rather than as a decline.
  const cancelRequestedRef = useRef(false);

  const setCancelHandle = useCallback((handle: ChargeCancelHandle | null) => {
    cancelHandleRef.current = handle;
    setCancelSupported(handle?.supported ?? false);
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
    setTotals(null);
    cancelHandleRef.current = null;
    cancelRequestedRef.current = false;
    setCancelSupported(false);
    setIsCancelling(false);
  }, []);

  /**
   * Ask the terminal to abort the sale sitting on the card prompt. Best-effort:
   * if the card already landed, the abort is a no-op and `payOrder` still
   * resolves through its normal approved/declined path — we never fabricate a
   * cancel, so a charge that DID land is still recorded.
   */
  const cancelCharge = useCallback(async () => {
    const handle = cancelHandleRef.current;
    if (!handle?.supported) return;
    cancelRequestedRef.current = true;
    setIsCancelling(true);
    try {
      await handle.cancel();
    } catch (err) {
      // The sale's own result path is authoritative — a failed abort just means
      // the transaction runs to completion.
      console.warn("[kioskCheckout] cancel failed:", err);
    } finally {
      setIsCancelling(false);
    }
  }, []);

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
   * Create the order, add the cart items, sync, charge, send to kitchen, and
   * record the payment — all at once, only when the customer commits to paying.
   * `tipAmount` is absolute dollars (0 if none). Returns the result or null on
   * failure (status/error set).
   */
  const payOrder = useCallback(
    async (tipAmount: number): Promise<KioskCheckoutResult | null> => {
      const cart = useKioskCartStore.getState();
      const orderStore = useOrderStore.getState();

      if (cart.lines.length === 0) {
        setStatus("error");
        setError("Your cart is empty.");
        return null;
      }

      setError(null);
      setStatus("creating");

      try {
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
        const createdDbId = await orderStore.ensureActiveOrderCreated(order.id);
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
        const chargeTotal = t.total_amount;
        const amountToCharge = chargeTotal + tipAmount;
        if (chargeTotal <= 0) {
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
        setStatus("charging");
        cancelRequestedRef.current = false;
        const charge = await chargeActiveTerminal({
          amount: amountToCharge,
          tipAmount,
          orderId: liveOrderId,
          dbOrderId: createdDbId,
          supabase,
          onCancelHandle: setCancelHandle,
          ...(__DEV__ && KIOSK_SIMULATED_CARD_WAIT_MS
            ? { simulatedCardWaitMs: KIOSK_SIMULATED_CARD_WAIT_MS }
            : {}),
        }).finally(() => setCancelHandle(null));

        // Customer aborted at the card prompt and the terminal confirmed no card
        // was read — void the half-built order and return the kiosk to the cart
        // so they can start over. This is NOT an error state.
        if (charge.cancelled) {
          try {
            orderStore.voidOrder(liveOrderId);
          } catch {
            /* best-effort */
          }
          cancelRequestedRef.current = false;
          setStatus("cancelled");
          setError(null);
          return null;
        }

        if (!charge.ok) {
          // INDETERMINATE — the charge MAY have landed (socket died after the
          // card read, or a partial approval). Do NOT void the order: voiding
          // locally can't refund a captured charge, and re-charging would double
          // it. Leave it for staff reconciliation and surface a clear message.
          if (!charge.indeterminate) {
            try {
              orderStore.voidOrder(liveOrderId);
            } catch {
              /* best-effort */
            }
          }
          setStatus("error");
          setError(charge.message ?? "Payment declined.");
          return null;
        }

        // 5. Record the payment.
        setStatus("finalizing");
        const idempotencyKey = uuidv4(); // must be a valid UUID
        const payment = await payFullCard(
          createdDbId,
          chargeTotal,
          idempotencyKey,
          tipAmount,
          charge.terminalResponse,
          charge.terminalId,
        );

        if (payment.kind !== "success") {
          setStatus("error");
          setError(
            payment.kind === "verifying"
              ? "Payment is being verified. Please see a staff member."
              : "Payment failed. Please try again.",
          );
          return null;
        }

        // 6. Only AFTER payment succeeds, send the ticket to the kitchen. On a
        // self-service kiosk there's no staff to catch a ticket for an order
        // that never paid, so the KDS send must follow a confirmed payment.
        await orderStore.sendNewItemsToKitchenForOrder(liveOrderId);

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
        setStatus("error");
        setError("Something went wrong. Please try again.");
        return null;
      }
    },
    [supabase, setCancelHandle],
  );

  return {
    status,
    error,
    result,
    totals,
    computeTotals,
    payOrder,
    reset,
    /** Abort the sale on the card prompt (no-op unless `canCancelCharge`). */
    cancelCharge,
    /** True while the terminal can still be told to abort before a card read. */
    canCancelCharge: cancelSupported,
    /** True between pressing cancel and the terminal acknowledging it. */
    isCancellingCharge: isCancelling,
  };
}
