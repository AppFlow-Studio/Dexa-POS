import { isItemOnChannel } from "@/lib/menu/itemChannelVisibility";
import type { Menu } from "@/lib/types";
import type { KioskConfig } from "@/types/kiosk";
import { Image } from "expo-image";

/**
 * Fire-and-forget prefetch for a kiosk profile's images — logo plus both
 * orientations' idle and order-banner images (not just the active
 * orientation, since a merchant can flip orientation without republishing
 * and the kiosk shouldn't cold-load images the first time that happens).
 *
 * Disk only. A memory prefetch decodes each image straight into the memory
 * cache at its full size, for pictures that aren't on screen (the other
 * orientation's never are) and at a size they won't be shown at, since the
 * views decode to their own size. From disk, the first paint is a local decode
 * instead of a download, which is what the prefetch is for.
 *
 * Idle videos are prefetched separately by expo-video's `useCaching` on the
 * player itself (see KioskMediaCarousel) — Image.prefetch doesn't cover
 * video.
 */
export function prefetchKioskImages(config: KioskConfig): void {
  const urls = new Set<string>();

  if (config.logoUrl) urls.add(config.logoUrl);
  for (const url of config.idleImagesVertical) urls.add(url);
  for (const url of config.idleImagesHorizontal) urls.add(url);
  for (const url of config.orderBannerImagesVertical) urls.add(url);
  for (const url of config.orderBannerImagesHorizontal) urls.add(url);

  if (urls.size === 0) return;
  void Image.prefetch(Array.from(urls), { cachePolicy: "disk" }).catch(() => {});
}

/** Menu photos already queued this session. */
const prefetchedMenuImages = new Set<string>();

/** Downloads in flight at once, so a big menu never floods the kiosk's link. */
const MENU_PREFETCH_BATCH = 6;

function isHttpUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

/**
 * Download every kiosk-visible menu photo to the disk cache, so a category the
 * customer opens decodes locally instead of waiting on the network.
 *
 * Disk only, for the reason above: it costs storage, not memory. Runs in small
 * batches, one after another, and skips anything already queued this session,
 * so a menu sync only fetches photos that are new. `isCancelled` stops the run
 * between batches (the kiosk screen unmounted).
 */
export function prefetchKioskMenuImages(
  menus: Menu[],
  isCancelled: () => boolean,
): void {
  const pending: string[] = [];
  for (const menu of menus) {
    for (const category of menu.categories) {
      for (const item of category.items ?? []) {
        const url = item.image?.trim();
        if (!url || !isHttpUrl(url) || prefetchedMenuImages.has(url)) continue;
        if (!isItemOnChannel(item, "kiosk")) continue;
        prefetchedMenuImages.add(url);
        pending.push(url);
      }
    }
  }
  if (pending.length === 0) return;

  void (async () => {
    for (let i = 0; i < pending.length; i += MENU_PREFETCH_BATCH) {
      if (isCancelled()) {
        // Let a later run pick up what this one never reached.
        for (const url of pending.slice(i)) prefetchedMenuImages.delete(url);
        return;
      }
      await Image.prefetch(pending.slice(i, i + MENU_PREFETCH_BATCH), {
        cachePolicy: "disk",
      }).catch(() => false);
    }
  })();
}
