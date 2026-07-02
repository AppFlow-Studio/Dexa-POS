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

// Hard cap so a busy location can't bloat MMKV. Matches the in-memory cap.
const MAX_CACHED_ORDERS = 200;

interface CachedPayload {
  orders: PreviousOrder[];
  windowLabel: DateWindowLabel;
  cachedAt: number; // epoch ms — for an "as of" hint in the UI
}

export const previousOrdersOfflineCache = {
  get(locationId: string): CachedPayload | null {
    try {
      const raw = syncStorage.getString(KEY(locationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedPayload;
      if (!parsed || !Array.isArray(parsed.orders)) return null;
      return parsed;
    } catch (err) {
      console.error("[previousOrdersOfflineCache.get]", err);
      return null;
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
    } catch (err) {
      console.error("[previousOrdersOfflineCache.clearLocation]", err);
    }
  },
};
