import { payFullCard } from "@/services/paymentService";
import {
  lineUnitPrice,
  useKioskCartStore,
  type KioskCartLine,
} from "@/stores/useKioskCartStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { CartItem } from "@/lib/types";
import { useCallback, useState } from "react";
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
 *   4. chargeCard (terminal, or mock if none)     → card approved
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
  | "error";

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
  const modifiers = line.modifiers.map((g) => ({
    categoryId: g.categoryId,
    categoryName: g.categoryName,
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      price: o.price,
    })),
  }));

  return {
    id: `${line.menuItemId}_${line.lineId}`,
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: line.quantity,
    price: unit,
    unitPrice: line.unitPrice,
    cashPrice: line.cashUnitPrice,
    originalPrice: unit,
    image: line.image,
    paidQuantity: 0,
    customizations: {
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      notes: line.notes,
    },
  } as CartItem;
}

/** Charge the card on the configured terminal, or simulate success when no
 * terminal is set (dev / kiosk without hardware). Returns the terminal response
 * to attach to the payment record. */
async function chargeCard(
  amount: number,
): Promise<
  | { ok: true; terminalResponse?: Record<string, unknown>; terminalId?: string }
  | { ok: false; message: string }
> {
  // MOCK: always simulate an approved sale for now. The real Castles/Dejavoo
  // charge is wired in a later step.
  // TODO(kiosk-terminal): replace with getSharedCastlesService()/DejavooAPI
  // using station.payment_terminal (see CardPaymentView.tsx for the POS path).
  await new Promise((r) => setTimeout(r, 800));
  return {
    ok: true,
    terminalResponse: { simulated: true, amount },
  };
}

export function useKioskCheckout() {
  const [status, setStatus] = useState<KioskCheckoutStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KioskCheckoutResult | null>(null);

  // The local order id created during prepare, so payOrder can act on it.
  const [orderId, setOrderId] = useState<string | null>(null);
  const [dbOrderId, setDbOrderId] = useState<string | null>(null);
  const [totals, setTotals] = useState<KioskCheckoutTotals | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
    setOrderId(null);
    setDbOrderId(null);
    setTotals(null);
  }, []);

  /**
   * Abandon a prepared-but-unpaid order. `prepareOrder` creates a real backend
   * order eagerly, so if the customer backs out before paying we must void it —
   * otherwise it lingers as an orphaned draft. Safe to call anytime: no-ops if
   * no order was created or it's already been paid (success).
   */
  const abandon = useCallback(() => {
    if (!orderId || status === "success") return;
    try {
      useOrderStore.getState().voidOrder(orderId);
    } catch (err) {
      console.error("[kioskCheckout] abandon/void failed:", err);
    }
    reset();
  }, [orderId, status, reset]);

  /**
   * Create the takeout order, add the cart items, sync them, and compute real
   * totals (subtotal + tax + total from the order store). Call this when
   * entering checkout so the tip/summary screens can show exact tax. Returns the
   * totals, or null on failure (status/error set).
   */
  const prepareOrder = useCallback(async (): Promise<KioskCheckoutTotals | null> => {
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
      const order = orderStore.startNewOrder({ tableId: null });
      orderStore.setActiveOrder(order.id);

      const createdDbId = await orderStore.ensureActiveOrderCreated(order.id);
      if (!createdDbId) {
        setStatus("error");
        setError("Could not create the order. Please try again.");
        return null;
      }

      // The order may be re-keyed (local id → db_order_id) during creation, so
      // the original `order.id` can become stale. Track the live key via the
      // active order / db index instead.
      const liveOrderId =
        useOrderStore.getState().activeOrderId ??
        useOrderStore.getState().dbOrderIdIndex?.[createdDbId] ??
        order.id;

      const expectedItemCount = cart.lines.length;
      for (const line of cart.lines) {
        orderStore.addItemToActiveOrder(toCartItem(line));
      }

      // Items must land on the backend before payment, else process_payment
      // sees no unpaid items. waitForPendingSyncs resolves on timeout too, so we
      // verify completion explicitly below rather than trusting it.
      await orderStore.waitForPendingSyncs(liveOrderId, { maxMs: 15000 });

      // GUARD 1 — no lost items. Every line must be on the order AND have a
      // backend id. If sync didn't fully complete, refuse to proceed so we
      // never charge for an order that's missing items.
      const synced = useOrderStore.getState().ordersById[liveOrderId];
      const nonDraft = (synced?.items ?? []).filter((i) => !i.isDraft);
      const allHaveBackendId = nonDraft.every((i) => !!i.db_order_item_id);
      if (nonDraft.length < expectedItemCount || !allHaveBackendId) {
        setStatus("error");
        setError(
          "We couldn't confirm all your items. Please check your connection and try again.",
        );
        return null;
      }

      // Force a synchronous recompute (returns totals AND writes them to the
      // order).
      const t = orderStore.recalculateOrder(liveOrderId);

      // GUARD 2 — never charge less than the order is worth. The order total
      // must be positive and at least the sum of item prices the customer saw.
      const cartSubtotal = cart.subtotal();
      if (t.total_amount <= 0 || t.subtotal + 0.01 < cartSubtotal) {
        setStatus("error");
        setError("The order total looks wrong. Please try again.");
        return null;
      }

      const next: KioskCheckoutTotals = {
        subtotal: t.subtotal,
        tax: t.tax_amount,
        total: t.total_amount,
      };

      setOrderId(liveOrderId);
      setDbOrderId(createdDbId);
      setTotals(next);
      setStatus("ready");
      return next;
    } catch (err) {
      console.error("[kioskCheckout] prepareOrder failed:", err);
      setStatus("error");
      setError("Something went wrong. Please try again.");
      return null;
    }
  }, []);

  /**
   * Charge + send to kitchen + record payment for the order created by
   * prepareOrder. `tipAmount` is absolute dollars (0 if none).
   */
  const payOrder = useCallback(
    async (tipAmount: number): Promise<KioskCheckoutResult | null> => {
      const orderStore = useOrderStore.getState();
      if (!orderId || !dbOrderId || !totals) {
        setStatus("error");
        setError("Order not ready. Please go back and try again.");
        return null;
      }

      try {
        // Re-read the authoritative total from the order right before charging,
        // so we never charge a stale/lower figure than the order is worth.
        const liveTotal =
          useOrderStore.getState().ordersById[orderId]?.total_amount ??
          totals.total;
        const chargeTotal = Math.max(liveTotal, totals.total);
        const amountToCharge = chargeTotal + tipAmount;

        if (chargeTotal <= 0) {
          setStatus("error");
          setError("The order total looks wrong. Please try again.");
          return null;
        }

        setStatus("charging");
        const charge = await chargeCard(amountToCharge);
        if (!charge.ok) {
          setStatus("error");
          setError(charge.message);
          return null;
        }

        // Send to kitchen before recording payment (matches the POS).
        setStatus("finalizing");
        await orderStore.sendNewItemsToKitchenForOrder(orderId);

        const idempotencyKey = uuidv4(); // must be a valid UUID
        const payment = await payFullCard(
          dbOrderId,
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

        const finalOrder = useOrderStore.getState().ordersById[orderId];
        const res: KioskCheckoutResult = {
          orderId,
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
    [orderId, dbOrderId, totals],
  );

  return { status, error, result, totals, prepareOrder, payOrder, reset, abandon };
}
