import { getSyncJSON, setSyncJSON } from "@/lib/storage";

const KEY = "kiosk_pending_payment_review";
const activeStations = new Set<string>();

// When the checkout guard was last released (Date.now()). The idle timer counts
// inactivity from max(last touch, this): time spent inside CodePay Register is
// not idleness, but JS timers are paused while Register is in front, so the
// idle interval never observes the "held" window and would otherwise count it.
let lastReleasedAt = 0;

export function getKioskCheckoutReleasedAt(): number {
  return lastReleasedAt;
}

export function isKioskCheckoutHeld(stationId: string): boolean {
  return activeStations.has(stationId) || !!getSyncJSON<Record<string, string>>(KEY)?.[stationId];
}

export function getKioskReviewOrder(stationId: string): string | undefined {
  return getSyncJSON<Record<string, string>>(KEY)?.[stationId];
}

// Called only from PIN-protected diagnostics after an operator reconciles the
// terminal and ledger. Never clears a sale that is still executing.
export function resolveKioskReview(stationId: string): boolean {
  if (activeStations.has(stationId)) return false;
  releaseKioskCheckout(stationId, false);
  return true;
}

// Survives checkout remounts and app restarts. Only a confirmed completion or
// clean no-charge outcome releases a dispatched payment for another attempt.
export function acquireKioskCheckout(stationId: string): boolean {
  if (isKioskCheckoutHeld(stationId)) {
    return false;
  }
  activeStations.add(stationId);
  return true;
}

export function markKioskPaymentDispatched(stationId: string, orderId: string): void {
  setSyncJSON(KEY, { ...getSyncJSON<Record<string, string>>(KEY), [stationId]: orderId });
}

/**
 * Drop the persisted "payment dispatched" marker while KEEPING the in-memory
 * hold. Used once a charge attempt is confirmed to have taken no money but the
 * checkout is still running (the "Need more time?" prompt): a crash there must
 * not reboot the kiosk into a staff-only lock for an order with no charge.
 */
export function clearKioskPaymentDispatched(stationId: string): void {
  const pending = { ...getSyncJSON<Record<string, string>>(KEY) };
  if (!(stationId in pending)) return;
  delete pending[stationId];
  setSyncJSON(KEY, pending);
}

export function releaseKioskCheckout(stationId: string, needsReview: boolean): void {
  activeStations.delete(stationId);
  lastReleasedAt = Date.now();
  if (!needsReview) {
    const pending = { ...getSyncJSON<Record<string, string>>(KEY) };
    delete pending[stationId];
    setSyncJSON(KEY, pending);
  }
}
