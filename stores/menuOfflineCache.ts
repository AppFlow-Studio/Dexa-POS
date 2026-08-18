/**
 * Menu — offline / failed-sync fallback snapshot.
 *
 * The menu is fetched fresh on every launch: `useMenuStore` has no persistence
 * and the TanStack cache is in-memory only, so before this cache existed a
 * single bad network window at boot left `menus: []` — an empty order-processing
 * grid with no way back except a manual Settings → Sync POS.
 *
 * This cache exists for ONE purpose: when the boot sync hasn't landed (offline,
 * timed out, or errored), show the last menu we successfully synced instead of
 * nothing. A live `pos_sync` result always overwrites it — the snapshot is only
 * ever read while the store is still empty.
 *
 * Stored as the raw `PosSyncData` (the RPC payload) rather than the derived
 * collections, so rehydration runs the exact same `setMenuData` transform a
 * live sync does — no second code path that can drift.
 *
 * Base64 `image` blobs are swapped for their on-disk `file://` path before
 * writing. Those files are already produced by `resolveMenuImage` on every
 * successful sync, so this keeps a multi-MB payload out of MMKV. A missing file
 * degrades to a card with no photo, which the next successful sync repairs.
 *
 * Keyed per location and station channel. Swept by `clearCacheData()` in
 * lib/storage.
 */

import type { MenuSyncChannel } from "@/lib/menu/menuChannel";
import { syncStorage } from "@/lib/storage";
import { menuImagePath } from "@/services/menuImageCache";
import type { PosSyncData } from "@/types/menu";

const PREFIX = "menu_offline:";
const LEGACY_KEY = (locationId: string) => `${PREFIX}${locationId}`;
const KEY = (locationId: string, channel: MenuSyncChannel) =>
  `${PREFIX}${channel}:${locationId}`;

/**
 * Menus change slowly (a price edit, an 86, a seasonal item), so a week-old
 * snapshot is still a far better boot state than a blank grid. Beyond that the
 * risk of serving genuinely wrong prices outweighs the benefit, and any station
 * that hasn't synced in a week has a bigger problem to surface.
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedPayload {
  data: PosSyncData;
  cachedAt: number; // epoch ms
}

/** True for a raw DB `image` value that is an inline base64 blob. */
const isBase64Image = (value: unknown): value is string =>
  typeof value === "string" && value.length > 200 && !value.includes("://");

/**
 * Replace inline base64 images with the deterministic path
 * `resolveMenuImage` writes them to. Mutates a structural copy only — the live
 * payload handed to `setMenuData` is never touched.
 */
function stripInlineImages(data: PosSyncData): PosSyncData {
  const menus = (data.menus ?? []).map((menu) => ({
    ...menu,
    categories: (menu.categories ?? []).map((catEntry) => ({
      ...catEntry,
      items: (catEntry.items ?? []).map((itemEntry: any) => {
        // The RPC has been seen returning both the wrapped shape
        // ({ display_order, menu_item }) and a bare item — `mapSyncItem` in
        // useMenuStore tolerates both, so this must too.
        const wrapped = itemEntry?.menu_item;
        const item = wrapped ?? itemEntry;
        if (!item || !isBase64Image(item.image)) return itemEntry;
        const stripped = { ...item, image: menuImagePath(item.id) };
        return wrapped ? { ...itemEntry, menu_item: stripped } : stripped;
      }),
    })),
  }));

  return { ...data, menus };
}

export const menuOfflineCache = {
  get(
    locationId: string,
    channel: MenuSyncChannel = "pos",
  ): PosSyncData | null {
    try {
      let raw = syncStorage.getString(KEY(locationId, channel));

      // Existing installations used a location-only key. It always contained
      // the register/POS menu, so migrate it only into the POS partition.
      if (!raw && channel === "pos") {
        raw = syncStorage.getString(LEGACY_KEY(locationId));
        if (raw) {
          syncStorage.set(KEY(locationId, channel), raw);
          syncStorage.remove(LEGACY_KEY(locationId));
        }
      }

      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedPayload;
      if (!parsed?.data || !Array.isArray(parsed.data.menus)) return null;
      if (
        typeof parsed.cachedAt === "number" &&
        Date.now() - parsed.cachedAt > CACHE_TTL_MS
      ) {
        this.clearLocation(locationId);
        return null;
      }
      return parsed.data;
    } catch (err) {
      console.error("[menuOfflineCache.get]", err);
      return null;
    }
  },

  set(
    locationId: string,
    data: PosSyncData,
    channel: MenuSyncChannel = "pos",
  ): void {
    try {
      // An empty menu is never worth persisting: it would overwrite a good
      // snapshot with the very blank state this cache exists to prevent.
      if (!data?.menus?.length) return;
      const payload: CachedPayload = {
        data: stripInlineImages(data),
        cachedAt: Date.now(),
      };
      syncStorage.set(KEY(locationId, channel), JSON.stringify(payload));
    } catch (err) {
      console.error("[menuOfflineCache.set]", err);
    }
  },

  clearLocation(locationId: string): void {
    try {
      syncStorage.remove(LEGACY_KEY(locationId));
      syncStorage.remove(KEY(locationId, "pos"));
      syncStorage.remove(KEY(locationId, "kiosk"));
    } catch (err) {
      console.error("[menuOfflineCache.clearLocation]", err);
    }
  },
};
