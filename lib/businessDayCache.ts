/**
 * Persisted cache for resolved business-day window bounds.
 *
 * The Previous Orders flow needs the same [startTs, endTs) window everywhere
 * (local mirror query, server fetch, live-orders gate, tab counts). Resolving
 * it from the server on every refresh is wasteful — the window only changes at
 * the daily rollover — so the last-resolved bounds are kept in MMKV, keyed by
 * the date-window spec, and reused until the business day changes.
 *
 * Validity is the caller's job (a same-business-day check needs the merchant
 * timezone + rollover config): the cache is only read when `isStillValid`
 * says the entry's `resolvedAt` still describes the current window.
 */
import { syncStorage } from "@/lib/storage";

const KEY = "prev_orders_window_bounds";

interface BoundsCacheEntry {
  /** `${label}|${startDate}|${endDate}` — the window these bounds answer. */
  windowKey: string;
  startTs: string;
  endTs: string;
  /** ISO of when they were resolved — validity is "same business day". */
  resolvedAt: string;
}

/** Read the cached bounds for a window if they are still valid. */
export function getCachedWindowBounds(
  windowKey: string,
  isStillValid: (resolvedAt: string) => boolean,
): { startTs: string; endTs: string } | null {
  try {
    const raw = syncStorage.getString(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as BoundsCacheEntry;
    if (!entry || entry.windowKey !== windowKey) return null;
    if (!isStillValid(entry.resolvedAt)) return null;
    return { startTs: entry.startTs, endTs: entry.endTs };
  } catch {
    return null;
  }
}

/** Persist the resolved bounds for a window. */
export function setCachedWindowBounds(
  windowKey: string,
  startTs: string,
  endTs: string,
): void {
  try {
    const entry: BoundsCacheEntry = {
      windowKey,
      startTs,
      endTs,
      resolvedAt: new Date().toISOString(),
    };
    syncStorage.set(KEY, JSON.stringify(entry));
  } catch {
    // non-fatal — worst case we re-resolve next time
  }
}
