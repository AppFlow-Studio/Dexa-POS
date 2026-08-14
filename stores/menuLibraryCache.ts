/**
 * Menu library (standalone entities) — persisted snapshot.
 *
 * The library payload (inactive/global categories, the full item library,
 * modifier groups, inactive menus) is only consumed by menu management. It used
 * to be fetched on the POS boot path; it now loads off the critical path, but
 * TanStack's cache is in-memory only, so every app restart meant menu
 * management sat on the network before it could paint — and the item count in
 * the header climbed as the payload trickled in.
 *
 * This cache makes that state survive a restart: hydrate from disk immediately,
 * then reconcile against the network.
 *
 * FINGERPRINT
 *   Every sync returns the whole library. Re-running `mergeStandaloneData` over
 *   an unchanged payload rebuilds the menu-store collections and re-renders the
 *   entire management screen for nothing. We store a cheap hash alongside the
 *   data so an unchanged payload can be skipped outright — the "only apply what
 *   changed" path.
 *
 * IMAGES
 *   Inline base64 blobs are swapped for the on-disk path `resolveMenuImage`
 *   already writes (items) or dropped (categories, which have no such file).
 *   Keeps a multi-MB payload out of MMKV; a missing image degrades to a
 *   placeholder that the next sync repairs.
 *
 * Keyed per merchant+location. Swept by `clearCacheData()` in lib/storage.
 */

import { syncStorage } from "@/lib/storage";
import { menuImagePath } from "@/services/menuImageCache";
import type { StandaloneSyncData } from "@/hooks/pos/useStandaloneSync";

const PREFIX = "menu_library:";
const KEY = (merchantId: string, locationId: string) =>
  `${PREFIX}${merchantId}:${locationId}`;

/**
 * Matches `menuOfflineCache`: a week-old library is still a far better starting
 * state than an empty screen, and anything staler than that belongs to a
 * station with a bigger problem to surface.
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedLibrary {
  data: StandaloneSyncData;
  fingerprint: string;
}

interface CachedPayload extends CachedLibrary {
  cachedAt: number; // epoch ms
}

/** True for a raw DB `image` value that is an inline base64 blob. */
const isBase64Image = (value: unknown): value is string =>
  typeof value === "string" && value.length > 200 && !value.includes("://");

/**
 * djb2. Not cryptographic — this only ever answers "did the payload change?",
 * and a collision costs one skipped merge that the next sync corrects.
 */
export function fingerprintLibrary(data: StandaloneSyncData): string {
  const json = JSON.stringify(data);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return `${json.length}:${(hash >>> 0).toString(36)}`;
}

function stripInlineImages(data: StandaloneSyncData): StandaloneSyncData {
  return {
    ...data,
    // Items have a deterministic on-disk path written by resolveMenuImage.
    items: (data.items ?? []).map((item) =>
      isBase64Image(item.image)
        ? { ...item, image: menuImagePath(item.id) }
        : item,
    ),
    // Categories have no such file — drop the blob rather than point at a path
    // that will never exist.
    categories: (data.categories ?? []).map((cat) =>
      isBase64Image(cat.image) ? { ...cat, image: null } : cat,
    ),
    modifierGroups: (data.modifierGroups ?? []).map((mg) => {
      const links = mg.menu_item_modifier_groups;
      if (!Array.isArray(links)) return mg;
      return {
        ...mg,
        menu_item_modifier_groups: links.map((link: any) =>
          isBase64Image(link?.menu_item?.image)
            ? {
                ...link,
                menu_item: { ...link.menu_item, image: undefined },
              }
            : link,
        ),
      };
    }),
  };
}

export const menuLibraryCache = {
  get(merchantId: string, locationId: string): CachedLibrary | null {
    try {
      const raw = syncStorage.getString(KEY(merchantId, locationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedPayload;
      if (!parsed?.data || !Array.isArray(parsed.data.items)) return null;
      if (
        typeof parsed.cachedAt === "number" &&
        Date.now() - parsed.cachedAt > CACHE_TTL_MS
      ) {
        this.clearLocation(merchantId, locationId);
        return null;
      }
      return { data: parsed.data, fingerprint: parsed.fingerprint };
    } catch (err) {
      console.error("[menuLibraryCache.get]", err);
      return null;
    }
  },

  /** Persists the payload and returns the fingerprint that was stored. */
  set(
    merchantId: string,
    locationId: string,
    data: StandaloneSyncData,
    fingerprint?: string,
  ): string {
    const fp = fingerprint ?? fingerprintLibrary(data);
    try {
      // An empty library is never worth persisting — it would overwrite a good
      // snapshot with the blank state this cache exists to prevent.
      if (!data?.items?.length && !data?.categories?.length) return fp;
      const payload: CachedPayload = {
        data: stripInlineImages(data),
        fingerprint: fp,
        cachedAt: Date.now(),
      };
      syncStorage.set(KEY(merchantId, locationId), JSON.stringify(payload));
    } catch (err) {
      console.error("[menuLibraryCache.set]", err);
    }
    return fp;
  },

  clearLocation(merchantId: string, locationId: string): void {
    try {
      syncStorage.remove(KEY(merchantId, locationId));
    } catch (err) {
      console.error("[menuLibraryCache.clearLocation]", err);
    }
  },
};
