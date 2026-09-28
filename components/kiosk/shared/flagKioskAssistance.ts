import * as Sentry from "@sentry/react-native";

/**
 * A kiosk checkout that lands in the "assistance" state — the customer is shown
 * "Please see a staff member" because the payment can't be safely retried
 * (possible/confirmed capture, or a post-charge step needing reconciliation).
 * This is a money-safety boundary, so every occurrence is flagged for the dev
 * team to investigate the root cause.
 */
export interface KioskAssistanceFlag {
  /** Groupable code: guard_held | charge_verify | payment_record_failed | kitchen_send_failed | payorder_exception | void_blocked | cloud_unavailable_hold */
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
  /**
   * Why the terminal step ended here (e.g. watchdog | unreadable) plus the
   * charge's referenceId / transNo / elapsedMs, so a hold can be traced to
   * the exact CodePay attempt without device logs.
   */
  detail?: Record<string, unknown>;
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
      tags: {
        surface: "kiosk",
        reason: flag.reason,
        ...(typeof flag.detail?.cause === "string"
          ? { cause: flag.detail.cause }
          : {}),
      },
      extra: {
        message: flag.message,
        at: flag.at,
        stationId: flag.stationId,
        dbOrderId: flag.dbOrderId,
        orderId: flag.orderId,
        displayNumber: flag.displayNumber,
        ...flag.detail,
      },
    });
  } catch {
    /* Sentry unavailable — non-fatal */
  }
}

/**
 * Non-fatal kiosk payment telemetry (e.g. `kiosk.payment.window`,
 * `kiosk.codepay.expired`). Info-level Sentry messages so the rollout of the
 * payment window / status lookup can be measured in prod. Never throws.
 */
export function reportKioskPaymentEvent(
  name: string,
  data: Record<string, unknown>,
  level: "info" | "warning" | "error" = "info",
): void {
  console.log(`[kioskCheckout] ${name}`, data);
  try {
    const outcome = typeof data.outcome === "string" ? data.outcome : undefined;
    Sentry.captureMessage(name, {
      level,
      tags: { surface: "kiosk", ...(outcome ? { outcome } : {}) },
      extra: data,
    });
  } catch {
    /* Sentry unavailable — non-fatal */
  }
}
