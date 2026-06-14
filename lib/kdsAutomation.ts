/**
 * Pure decision helpers for KDS auto-fire / auto-bump.
 *
 * Extracted from the KDS screen's interval effects so the safety-critical
 * timing + recall-skip logic is deterministically unit-testable (the effects
 * themselves read the live ticket bucket via useKDSStore.getState() at fire
 * time and own the toast + advanceTicketStatus side effects).
 */

/** A ticket with start_time_epoch === 0 has no start time yet and is skipped. */
export function isStarted(startTimeEpoch: number): boolean {
  return startTimeEpoch !== 0;
}

/**
 * Auto-fire (pending → preparing) is due once the configured delay has elapsed
 * since the ticket started.
 */
export function shouldAutoFire(
  startTimeEpoch: number,
  nowMs: number,
  delayMs: number,
): boolean {
  if (!isStarted(startTimeEpoch)) return false;
  return nowMs - startTimeEpoch >= delayMs;
}

/**
 * Auto-bump (ready → served) is due once the delay has elapsed — UNLESS the
 * ticket was recalled. The recall guard is load-bearing: a recalled ticket the
 * kitchen pulled back must never be auto-served out from under them.
 */
export function shouldAutoBump(
  startTimeEpoch: number,
  nowMs: number,
  delayMs: number,
  recalled: boolean,
): boolean {
  if (recalled) return false;
  if (!isStarted(startTimeEpoch)) return false;
  return nowMs - startTimeEpoch >= delayMs;
}

/**
 * A recall is expired once it's older than the TTL. Used to evict stale recalls
 * (incomplete recalls that would otherwise linger in the KDS Sets all shift /
 * across restarts). The TTL is far past any live ticket's lifetime.
 */
export function isRecallExpired(
  recalledAtMs: number,
  nowMs: number,
  ttlMs: number,
): boolean {
  return nowMs - recalledAtMs > ttlMs;
}
