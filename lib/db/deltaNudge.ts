/**
 * "The backend just moved — pull now, don't wait for the tick."
 *
 * The delta loop runs every 30 s, which is the right steady-state cadence and
 * the wrong latency for the thing a merchant watches most closely: an order
 * they just created. Two paths converge on the same 30 s wait —
 *
 *   - an order created on THIS station is an own-echo broadcast, deliberately
 *     skipped by the mirror write path (see `_layout.tsx`), so nothing writes
 *     it locally until the next cycle;
 *   - an order from another station IS written by
 *     `applyOrdersFromRealtimeIfNew`, but from a trimmed broadcast payload —
 *     no `order_items` embed, no online-order join — so it renders incomplete
 *     until the delta re-fetches it with the full embed.
 *
 * Both are fixed by pulling sooner rather than by writing more from the
 * broadcast: the delta is the correctness path and already knows how to fetch
 * a complete row. This module is the handle the realtime layer uses to say
 * "now", debounced so a burst of twenty broadcasts costs one pull.
 *
 * Deliberately tiny and dependency-free: `hooks/db/useDeltaSync` owns the
 * cycle and registers it here; the realtime handler only knows this module.
 */

/** Trailing debounce: long enough to coalesce a burst, short enough to feel immediate. */
const NUDGE_DEBOUNCE_MS = 1200;
/**
 * Ceiling on how long a pull can be deferred by continuing nudges.
 *
 * A pure trailing debounce STARVES under sustained traffic: peak measured
 * churn is 55 orders/min (Section B4), i.e. broadcasts closer together than
 * the debounce window, so every nudge would reschedule the previous one and
 * the pull would never fire — exactly the 30 s wait this module exists to
 * remove, now with extra steps. Past this ceiling the next nudge runs instead
 * of deferring.
 */
const NUDGE_MAX_WAIT_MS = 5_000;

type CycleFn = () => Promise<void>;

let registeredCycle: CycleFn | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** When the current deferral series began — the max-wait clock. */
let deferringSince: number | null = null;
const listeners = new Set<() => void>();

/**
 * Register the delta cycle. Called by `useDeltaSync` on mount; pass null on
 * unmount so a nudge after teardown is a no-op rather than a call into a dead
 * effect's closure.
 */
export function registerDeltaCycle(cycle: CycleFn | null): void {
  registeredCycle = cycle;
  if (!cycle && timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * Subscribe to nudges — for state that must be invalidated the moment we learn
 * the backend moved, not one cycle later (e.g. Previous Orders' cached "the
 * mirror is current" verdict). Listeners fire immediately on `nudgeDeltaSync`,
 * ahead of the debounced pull. Returns an unsubscribe.
 */
export function onDeltaNudge(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The backend moved. Fires listeners now and schedules one pull.
 *
 * Safe to call on the broadcast hot path: it does no work beyond a
 * setTimeout, never throws into the caller, and coalesces a burst into a
 * single cycle.
 */
export function nudgeDeltaSync(reason: string): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A listener must never take down a broadcast handler.
    }
  }

  if (!registeredCycle) return;

  const now = Date.now();
  if (deferringSince === null) deferringSince = now;

  // Held off long enough — run now rather than defer again.
  if (now - deferringSince >= NUDGE_MAX_WAIT_MS) {
    if (timer) clearTimeout(timer);
    timer = null;
    fire(reason);
    return;
  }

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    fire(reason);
  }, NUDGE_DEBOUNCE_MS);
}

function fire(reason: string): void {
  deferringSince = null;
  const cycle = registeredCycle;
  if (!cycle) return;
  if (__DEV__) console.log(`[LocalDB][delta] nudge → pull (${reason})`);
  // The cycle self-guards against overlap and never rejects; this is
  // fire-and-forget by design.
  void cycle();
}

/** Test seam. */
export function __resetDeltaNudgeForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  deferringSince = null;
  registeredCycle = null;
  listeners.clear();
}
