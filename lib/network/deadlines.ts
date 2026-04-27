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
} as const

export type DeadlineKey = keyof typeof DEADLINES
