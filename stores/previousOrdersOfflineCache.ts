/**
 * Previous Orders — offline fallback cache.
 *
 * Previous Orders is server-fetched ONLY when online (the list reflects exactly
 * what the date-bounded backend fetch returns). This cache exists for ONE
 * purpose: when the device is offline, the screen would otherwise be empty, so
 * we show the last successfully-fetched set instead.
 *
 * - Written after every successful online refresh / load-more.
 * - Read ONLY when offline (see usePreviousOrdersStore.refreshPreviousOrders).
 * - Stores the full PreviousOrder[] (not a lossy projection) so the offline
 *   view is identical to the online one.
 *
 * Keyed per location. Cleared per-location on logout / location switch via
 * clearLocation(), and any stray keys are swept by clearCacheData() in storage.
 */

import { syncStorage } from "@/lib/storage";
import type { PreviousOrder } from "@/lib/types";
import type { DateWindowLabel } from "@/stores/usePreviousOrdersStore";

const PREFIX = "prev_orders_offline:";
const KEY = (locationId: string) => `${PREFIX}${locationId}`;
const SIG_PREFIX = "prev_orders_sig:";
const SIG_KEY = (locationId: string) => `${SIG_PREFIX}${locationId}`;

// Hard cap so a busy location can't bloat MMKV. Matches the in-memory cap.
const MAX_CACHED_ORDERS = 200;

/**
 * Cached rows carry customer names, phones and emails. They're kept so
 * re-entering the screen is instant instead of always waiting on a fetch, but
 * they're not worth retaining indefinitely on the device — a cache older than
 * this is discarded on read and refetched.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CachedPayload {
  orders: PreviousOrder[];
  windowLabel: DateWindowLabel;
  cachedAt: number; // epoch ms — for an "as of" hint in the UI
}

/**
 * Cheap fingerprint of a location's date window: how many orders it held and
 * the most recent `updated_at` seen. Compared against a live probe on entry to
 * decide whether the cached rows are still current — an exact-match means the
 * backend hasn't moved and the cache can be shown as-is.
 */
export interface CachedSignature {
  count: number | null;
  latestUpdatedAt: string | null;
  windowLabel: DateWindowLabel;
  cachedAt: number;
}

export const previousOrdersOfflineCache = {
  get(locationId: string): CachedPayload | null {
    try {
      const raw = syncStorage.getString(KEY(locationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedPayload;
      if (!parsed || !Array.isArray(parsed.orders)) return null;
      // Expire stale entries rather than serving day-old customer data.
      if (
        typeof parsed.cachedAt === "number" &&
        Date.now() - parsed.cachedAt > CACHE_TTL_MS
      ) {
        this.clearLocation(locationId);
        return null;
      }
      return parsed;
    } catch (err) {
      console.error("[previousOrdersOfflineCache.get]", err);
      return null;
    }
  },

  /** Fingerprint of the last fetch, for the staleness check on re-entry. */
  getSignature(locationId: string): CachedSignature | null {
    try {
      const raw = syncStorage.getString(SIG_KEY(locationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedSignature;
      if (!parsed) return null;
      if (
        typeof parsed.cachedAt === "number" &&
        Date.now() - parsed.cachedAt > CACHE_TTL_MS
      ) {
        return null;
      }
      return parsed;
    } catch (err) {
      console.error("[previousOrdersOfflineCache.getSignature]", err);
      return null;
    }
  },

  setSignature(
    locationId: string,
    signature: Omit<CachedSignature, "cachedAt">,
  ): void {
    try {
      syncStorage.set(
        SIG_KEY(locationId),
        JSON.stringify({ ...signature, cachedAt: Date.now() }),
      );
    } catch (err) {
      console.error("[previousOrdersOfflineCache.setSignature]", err);
    }
  },

  set(
    locationId: string,
    orders: PreviousOrder[],
    windowLabel: DateWindowLabel,
  ): void {
    try {
      const capped =
        orders.length > MAX_CACHED_ORDERS
          ? orders.slice(0, MAX_CACHED_ORDERS)
          : orders;
      const payload: CachedPayload = {
        orders: capped,
        windowLabel,
        cachedAt: Date.now(),
      };
      syncStorage.set(KEY(locationId), JSON.stringify(payload));
    } catch (err) {
      console.error("[previousOrdersOfflineCache.set]", err);
    }
  },

  clearLocation(locationId: string): void {
    try {
      syncStorage.remove(KEY(locationId));
      syncStorage.remove(SIG_KEY(locationId));
    } catch (err) {
      console.error("[previousOrdersOfflineCache.clearLocation]", err);
    }
  },
};

/**
 * Whether cached rows can be trusted for this window.
 *
 * Requires an exact match on both the row count and the newest `updated_at`.
 * The count alone would miss in-place edits (a refund, a void, a tip adjust,
 * a check reopening) that change an order without changing how many there are;
 * `updated_at` alone would miss a delete. A null on either side means "unknown"
 * and is treated as stale, so an ambiguous probe always refetches.
 */
export function isCacheFresh(
  cached: CachedSignature | null,
  live: { count: number | null; latestUpdatedAt: string | null },
  windowLabel: DateWindowLabel,
): boolean {
  if (!cached) return false;
  if (cached.windowLabel !== windowLabel) return false;
  if (cached.count == null || live.count == null) return false;
  if (cached.count !== live.count) return false;
  // Both null is legitimate: an empty window has no newest row.
  return cached.latestUpdatedAt === live.latestUpdatedAt;
}
