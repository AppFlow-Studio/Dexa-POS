export const DEADLINES = {
  hotMutation: 20000,
  hotMutation_degraded: 15000,
  sendToKitchen: 20000,
  closeCheck: 20000,
  read: 20000,
  menuSync: 60000,
  probe: 25000,
  appForegroundResetMs: 60_000,
  slowCooldownMs: 5_000,
  probeIntervalMs: 15_000,
  probeBackoffMaxMs: 60_000,
  notifyDebounceMs: 5000,
  timeoutWindowMs: 30_000,
  // Bad-WiFi Phase 2 — Wave 1 (recovery UI)
  paymentRpc: 20000,
  paymentAuthCheck: 10000,
  paymentVerifyPollIntervalMs: 20000,
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
