import { resolveKioskChargeOutcome } from "@/components/kiosk/shared/chargeOutcome";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { logError } from "@/lib/logError";
import {
  chargeActiveTerminal,
  type ChargeStartedHandle,
} from "@/services/terminals/chargeActiveTerminal";
import { useOrderStore } from "@/stores/useOrderStore";
import { useCallback, useRef, useState } from "react";
import { chargeTotal, payBlockedReason, payableBalance } from "../../lib/payments";
import { sendToKitchen, unsentItems } from "../../lib/sendCourse";

export type ChargePhase =
  /** Screen 8, before the reader opens. */
  | { kind: "ready" }
  /** The card app has the screen. */
  | { kind: "charging" }
  /** Screen 9. `response` feeds the "Approved · Visa ending 4412" line. */
  | { kind: "done"; amount: number; tip: number; response?: Record<string, unknown> }
  /** Clean decline — the check is untouched and can be retried. */
  | { kind: "declined"; message: string }
  /** The charge MAY have landed. Never re-charge from here. */
  | { kind: "verify"; message: string }
  /**
   * The worst case: the card was approved but the payment did not record.
   * Its own phase because it must never look like either success or decline.
   */
  | { kind: "unrecorded"; amount: number };

/**
 * Screens 8 and 9 — charge the card, record it, fire the kitchen.
 *
 * Money-safety rules, all of them load-bearing:
 *
 * 1. **Claim before the swipe.** `chargeActiveTerminal` has no access control,
 *    and `addPaymentToOrder` re-checks ownership at write time and returns
 *    `false` with only a `__DEV__` warn. Charging a check another station owns
 *    takes real money and records nothing, so the guard runs immediately
 *    before the charge, not at page mount.
 * 2. **The two amounts are different.** `chargeActiveTerminal.amount` is the
 *    grand total INCLUDING tip; `addPaymentToOrder.amount` is the balance
 *    EXCLUDING tip, with the tip passed alongside as `tipAmount` (the register
 *    does the same at `usePaymentStore.ts:1386-1391`, `:1434-1439`). Passing
 *    the tipped total to the recorder would over-record every tip.
 * 3. **Never void on the handheld.** The kiosk voids its half-built order on a
 *    decline; a handheld check is a real table's check, and the station has
 *    `can_void_orders = false`. A decline leaves the check open.
 * 4. **A failed record is not a failed payment.** `unrecorded` is surfaced as
 *    its own screen so the operator escalates instead of charging twice.
 */
export function useCharge(orderId: string, tip: number) {
  const supabase = useSupabaseClient();
  const [phase, setPhase] = useState<ChargePhase>({ kind: "ready" });
  const running = useRef(false);

  const charge = useCallback(async () => {
    if (running.current) return;

    const store = useOrderStore.getState();
    const order = store.ordersById[orderId];
    const blocked = payBlockedReason(order, store.currentStationId);
    if (blocked) {
      setPhase({ kind: "declined", message: blocked });
      return;
    }

    const balance = payableBalance(order);
    const total = chargeTotal(balance, tip);

    running.current = true;
    setPhase({ kind: "charging" });

    // Local, not a ref: it only has to survive this one invocation, and a ref
    // assigned `null` on the line above gets narrowed to `null` by TS for the
    // rest of the function even though the callback reassigns it.
    let startedHandle: ChargeStartedHandle | null = null;

    try {
      const result = await chargeActiveTerminal({
        amount: total, // grand total, tip included
        tipAmount: tip,
        orderId,
        dbOrderId: order?.db_order_id ?? undefined,
        supabase,
        onChargeStarted: (handle) => {
          startedHandle = handle;
        },
      });

      const outcome = resolveKioskChargeOutcome({
        ok: result.ok,
        indeterminate: result.indeterminate,
        message: result.message,
        // The handheld gives the operator no cancel during the read: ATOM has
        // no cancel-before-card, so there is nothing to request.
        userCancelled: false,
        terminalType: (startedHandle as ChargeStartedHandle | null)?.terminalType,
      });

      if (outcome.kind === "verify") {
        setPhase({ kind: "verify", message: outcome.message });
        return;
      }
      if (outcome.kind === "declined" || outcome.kind === "cancelled") {
        setPhase({
          kind: "declined",
          message: outcome.kind === "declined" ? outcome.message : "Payment cancelled.",
        });
        return;
      }

      // Approved. Record it — balance without tip, tip alongside.
      const recorded = await useOrderStore.getState().addPaymentToOrder({
        orderId,
        amount: balance,
        method: "Card",
        tipAmount: tip,
        transactionDetails: result.terminalResponse,
      });

      if (!recorded) {
        logError("payment", "Handheld card approved but not recorded", {
          orderId,
          total,
        });
        setPhase({ kind: "unrecorded", amount: total });
        return;
      }

      // The business rule: paying an unsent check fires the kitchen. Runs
      // after the record so a declined card never sends food, and uses the
      // handheld's own send so it cannot race `CheckFooter`'s.
      await fireKitchenIfUnsent(orderId);

      setPhase({ kind: "done", amount: total, tip, response: result.terminalResponse });
    } catch (e) {
      // A throw here is not a confirmed decline — the sale may have landed.
      logError("payment", "Handheld charge threw", e);
      setPhase({
        kind: "verify",
        message: "We could not confirm this payment. Check the card reader before trying again.",
      });
    } finally {
      running.current = false;
    }
  }, [orderId, tip, supabase]);

  return { phase, charge, retry: () => setPhase({ kind: "ready" }) };
}

/** Send whatever the kitchen has not seen. Never fails the payment. */
async function fireKitchenIfUnsent(orderId: string): Promise<void> {
  try {
    const order = useOrderStore.getState().ordersById[orderId];
    if (!order || unsentItems(order, null).length === 0) return;
    // `null` course = everything unsent. At payment there is no "next course"
    // to hold back, and `sendToKitchen` already picks the table vs non-table
    // path off the order itself.
    await sendToKitchen(orderId, null);
  } catch (e) {
    logError("order", "Handheld post-payment kitchen send failed", e);
  }
}
