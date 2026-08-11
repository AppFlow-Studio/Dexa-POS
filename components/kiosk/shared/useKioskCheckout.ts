import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { calculateOrderTotals } from "@/lib/order-calculator";
import type { CartItem } from "@/lib/types";
import {
  failPaymentJournal,
  updatePaymentJournal,
  writePaymentJournal,
} from "@/services/paymentJournal";
import { payFullCard } from "@/services/paymentService";
import {
  extractLast4,
  parseCastlesReturnCode,
} from "@/services/terminals/castles-response-mapper";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getOrCreateCounter } from "@/services/terminals/castles-txn-counter";
import {
  lineCashUnitPrice,
  lineUnitPrice,
  useKioskCartStore,
  type KioskCartLine,
} from "@/stores/useKioskCartStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
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

/** Result shape from charging the card terminal. */
export interface ChargeCardResult {
  ok: boolean;
  message?: string;
  terminalResponse?: Record<string, unknown>;
  terminalId?: string;
}

/** Charge the card on the configured terminal, or simulate when none is
 * configured. Mirrors the POS CardPaymentView Castles flow exactly:
 *   1. Connect (shared singleton) + resetTerminalState
 *   2. Get counter → txnPosTxnId
 *   3. Write payment journal (crash recovery, pre-TCP)
 *   4. processSale on the terminal
 *   5. Promote journal to terminal_approved
 *   6. Return response for payFullCard
 */
async function chargeCardWithTerminal(
  total: number,
  tipAmount: number,
  orderId: string,
  dbOrderId: string | undefined,
  supabase: ReturnType<typeof useSupabaseClient>,
): Promise<ChargeCardResult> {
  const station = useStoreSettingsStore.getState().selectedStation;
  const terminal = station?.payment_terminal;
  if (!terminal) {
    await new Promise((r) => setTimeout(r, 800));
    return { ok: true, terminalResponse: { simulated: true, amount: total } };
  }

  if (terminal.terminal_type === "castles") {
    const isUsb = terminal.connection_type === "usb";
    const host = isUsb ? undefined : terminal.ip_address;
    if (!isUsb && !host) {
      return {
        ok: false,
        message: "Castles terminal has no IP address configured.",
      };
    }
    const port = isUsb ? undefined : (terminal.port ?? CASTLES_DEFAULT_PORT);

    const service = getSharedCastlesService();
    await service.connect({
      connectionType: isUsb ? "usb" : "local_socket",
      host,
      port,
      timeout: 120_000,
      terminalId: terminal.id,
    });
    await service.resetTerminalState();

    const counter = getOrCreateCounter({
      terminalId: terminal.id,
      supabaseClient: supabase,
    });
    if (!counter.isInitialized) await counter.initialize();
    const referenceId = counter.next();

    const paymentJournalKey = uuidv4();
    const paymentJournalId = writePaymentJournal({
      orderId,
      dbOrderId: dbOrderId ?? undefined,
      amount: total - tipAmount,
      tipAmount,
      paymentMethod: "Card",
      idempotencyKey: paymentJournalKey,
    });

    let result: Awaited<ReturnType<typeof service.processSale>>;
    try {
      result = await service.processSale({
        amount: total - tipAmount,
        tipAmount,
        referenceId,
      });
    } catch (err) {
      throw err;
    }

    updatePaymentJournal(paymentJournalId, {
      status: "terminal_approved",
      terminalTxnId: referenceId,
      ...(dbOrderId ? { dbOrderId } : {}),
    });

    if (!result.success) {
      const errorInfo = result.raw?.txnReturnCode
        ? parseCastlesReturnCode(result.raw.txnReturnCode)
        : { message: result.error || "Transaction failed" };
      failPaymentJournal(
        paymentJournalId,
        `terminal_declined: ${errorInfo.message}`,
      );
      return { ok: false, message: errorInfo.message };
    }

    const castlesLast4 = result.raw
      ? extractLast4(
          result.raw.txnMaskedCardNum ?? result.raw.txnCardMaskedPan ?? "",
        )
      : undefined;

    return {
      ok: true,
      terminalId: terminal.id,
      terminalResponse: {
        castles_transaction: {
          cardLast4: castlesLast4,
          approvalCode: result.raw?.txnApprovalCode,
          cardType: result.raw?.txnCardBrand ?? result.raw?.txnCardType,
          rrn: result.raw?.txnRrn ?? result.raw?.txnRRN,
          cardAID: result.raw?.txnCardAid,
        },
        transactionId: referenceId,
        paymentJournalHandle: {
          id: paymentJournalId,
          idempotencyKey: paymentJournalKey,
        },
      },
    };
  }

  // Dejavoo or unsupported terminal type — simulate for now
  await new Promise((r) => setTimeout(r, 800));
  return { ok: true, terminalResponse: { simulated: true, amount: total } };
}

export function useKioskCheckout() {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<KioskCheckoutStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KioskCheckoutResult | null>(null);
  const [totals, setTotals] = useState<KioskCheckoutTotals | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
    setTotals(null);
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
        if (cart.orderType) {
          orderStore.patchOrder(order.id, { order_type: cart.orderType });
        }
        orderStore.setActiveOrder(order.id);
        const createdDbId = await orderStore.ensureActiveOrderCreated(order.id);
        if (!createdDbId) {
          setStatus("error");
          setError("Could not create the order. Please try again.");
          return null;
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

        // 4. Charge the card via the configured terminal (same path as POS).
        setStatus("charging");
        const charge = await chargeCardWithTerminal(
          amountToCharge,
          tipAmount,
          liveOrderId,
          createdDbId,
          supabase,
        );
        if (!charge.ok) {
          // No charge happened — void the unpaid order so it doesn't linger.
          try {
            orderStore.voidOrder(liveOrderId);
          } catch {
            /* best-effort */
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
    [],
  );

  return {
    status,
    error,
    result,
    totals,
    computeTotals,
    payOrder,
    reset,
  };
}
