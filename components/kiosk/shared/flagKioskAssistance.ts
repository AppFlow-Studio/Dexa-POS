import * as Sentry from "@sentry/react-native";

/**
 * A kiosk checkout that lands in the "assistance" state — the customer is shown
 * "Please see a staff member" because the payment can't be safely retried
 * (possible/confirmed capture, or a post-charge step needing reconciliation).
 * This is a money-safety boundary, so every occurrence is flagged for the dev
 * team to investigate the root cause.
 */
export interface KioskAssistanceFlag {
  /** Groupable code: guard_held | charge_verify | payment_record_failed | kitchen_send_failed | payorder_exception */
  reason: string;
  /** Customer-facing message shown on the assistance screen. */
  message: string;
  /** ISO timestamp of when the assistance state was entered. */
  at: string;
  stationId?: string;
  /** Backend order id. */
  dbOrderId?: string;
  /** Local order store key. */
  orderId?: string;
  /** Human-facing pickup/display number, if assigned. */
  displayNumber?: string;
}

/**
 * Flag a kiosk assistance event to the dev team. Logs on-device for field
 * debugging and raises a Sentry message so we can look into it. Never throws —
 * a Sentry hiccup must not disrupt the checkout screen (mirrors
 * KioskErrorBoundary).
 */
export function flagKioskAssistance(flag: KioskAssistanceFlag): void {
  // On-device log for field debugging.
  console.error("[kioskCheckout] assistance:", flag);
  // Dev-team flag — non-fatal if Sentry is unavailable.
  try {
    Sentry.captureMessage("kiosk.payment.assistance", {
      level: "error",
      tags: { surface: "kiosk", reason: flag.reason },
      extra: {
        message: flag.message,
        at: flag.at,
        stationId: flag.stationId,
        dbOrderId: flag.dbOrderId,
        orderId: flag.orderId,
        displayNumber: flag.displayNumber,
      },
    });
  } catch {
    /* Sentry unavailable — non-fatal */
  }
}
