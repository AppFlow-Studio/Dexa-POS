import { isOrderReadOnly } from "@/lib/orderAccessControl";
import { BALANCE_EPSILON, getOrderBalanceDue } from "@/lib/orderBalance";
import type { OrderProfile } from "@/lib/types";
import { round2 } from "@/utils/money";

/**
 * The register's pre-payment rules as pure functions, the way `discounts.ts`
 * carries DiscountBottomSheet's.
 *
 * Wave 4a does NOT call `usePaymentStore.open()` — that renders the register's
 * 1333dp landscape views (see `docs/features/handheld/wave4-plan.md`). The two
 * guards `open()` applies before it sets `isOpen` therefore have to live here
 * instead, or the handheld would be *less* gated than the register.
 *
 * Everything below is pure: no store reads, no hooks. Callers pass the order
 * they already hold, which is what keeps the pay path off `activeOrderId`.
 */

/** Below this a residual balance is rounding dust, not money to collect. */
export { BALANCE_EPSILON };

/**
 * Why Pay is unavailable, or `null` when it is available.
 *
 * Mirrors `usePaymentStore.open()` (`:448-468`) plus the balance precondition
 * `addPaymentToOrder` enforces at `useOrderStore.ts:12907-12914`. The order
 * matters: ownership first, because on a check another station owns every
 * later answer is about someone else's check.
 *
 * The ownership message is the one deliberate departure from the register's
 * wording. The register says "Switch stations to continue" because that is all
 * a till can do; the handheld has `TakeOverCard`, so it names the real fix.
 */
export function payBlockedReason(
  order: OrderProfile | null | undefined,
  currentStationId: string | null,
): string | null {
  if (!order) return "This check has not loaded yet.";

  if (isOrderReadOnly(order, currentStationId)) {
    const owner = order.station_name?.trim() || "another station";
    return `This check is open on ${owner}. Take it over to take payment.`;
  }

  if (order.check_status === "Closed") {
    return "This check is closed. Reopen it to process payments.";
  }

  if (getOrderBalanceDue(order) <= 0) {
    return "There is nothing left to collect on this check.";
  }

  return null;
}

/** True when the Pay action should be tappable. */
export function canPay(
  order: OrderProfile | null | undefined,
  currentStationId: string | null,
): boolean {
  return payBlockedReason(order, currentStationId) === null;
}

/**
 * The balance the pay flow charges against.
 *
 * `getOrderBalanceDue` is deliberately conservative — it reports 0 for every
 * unknown, including an `amount_due` that never arrived because the payment
 * was queued offline. That is the right default for *gating* Pay, and it is
 * why screens read their displayed figure from `useOrderTotals(orderId)`
 * instead: a hero that renders "$0.00" the moment the network hiccups is worse
 * than one that renders the last known total.
 */
export function payableBalance(order: OrderProfile | null | undefined): number {
  return getOrderBalanceDue(order);
}

/** Screen 7's preset buttons, artifact order. */
export const TIP_PERCENTS: readonly number[] = [18, 20, 25];

export interface TipPreset {
  percent: number;
  amount: number;
}

/**
 * Tip presets off a base, rounded to cents.
 *
 * `round2` rather than the register's bare `toFixed(2)` display: the register
 * formats an unrounded float that then reaches `p_tip_amount`
 * (`CardPaymentView.tsx:248`), where the backend is 2dp. The kiosk already
 * rounds for exactly this reason (`useKioskCheckout.ts:289`) — match the kiosk,
 * not the register, so the charged tip equals the tip we drew.
 */
export function tipPresets(
  base: number,
  percents: readonly number[] = TIP_PERCENTS,
): TipPreset[] {
  if (!Number.isFinite(base) || base <= 0) {
    return percents.map((percent) => ({ percent, amount: 0 }));
  }
  return percents.map((percent) => ({
    percent,
    amount: round2((base * percent) / 100),
  }));
}

/**
 * A custom tip the guest typed. Returns the blocking message, or null.
 *
 * Tip policy (`tipsConfig.requireTipOnCard`, `maxTipPercentage`) is NOT
 * enforced — the register does not enforce it either, and a handheld that did
 * would behave differently from the till for the same guest. See the plan's
 * "Scope decisions".
 */
export function customTipBlockedReason(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) {
    return "Please enter a valid tip amount.";
  }
  return null;
}

/** What the card is charged: balance plus tip, rounded once, at the end. */
export function chargeTotal(balance: number, tip: number): number {
  const safeBalance = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const safeTip = Number.isFinite(tip) && tip > 0 ? tip : 0;
  return round2(safeBalance + safeTip);
}
