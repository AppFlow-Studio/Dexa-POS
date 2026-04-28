export const DEADLINES = {
  hotMutation: 2500,
  hotMutation_degraded: 1500,
  sendToKitchen: 2000,
  closeCheck: 2500,
  read: 8000,
  menuSync: 8000,
  probe: 2500,
  appForegroundResetMs: 60_000,
  slowCooldownMs: 5_000,
  probeIntervalMs: 15_000,
  probeBackoffMaxMs: 60_000,
  notifyDebounceMs: 500,
  timeoutWindowMs: 30_000,
  // Bad-WiFi Phase 2 — Wave 1 (recovery UI)
  paymentRpc: 8000,
  paymentAuthCheck: 2500,
  paymentVerifyPollIntervalMs: 3000,
} as const

/**
 * Connection-quality-aware verifying-state timer for the recovery UI.
 * Resolved at runtime from `connectionQuality.get()`.
 */
export const PAYMENT_VERIFY_TIMER_MS = {
  fast: 8000,
  degraded: 15_000,
  slow: 30_000,
  probing: 30_000,
} as const

export type DeadlineKey = keyof typeof DEADLINES
