import { getSyncJSON, setSyncJSON } from "@/lib/storage";

const KEY = "kiosk_pending_payment_review";
const activeStations = new Set<string>();

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

export function releaseKioskCheckout(stationId: string, needsReview: boolean): void {
  activeStations.delete(stationId);
  if (!needsReview) {
    const pending = { ...getSyncJSON<Record<string, string>>(KEY) };
    delete pending[stationId];
    setSyncJSON(KEY, pending);
  }
}
