import type { KioskConfig } from "@/types/kiosk";
import { Image } from "expo-image";

/**
 * Fire-and-forget prefetch for a kiosk profile's images — logo plus both
 * orientations' idle and order-banner images (not just the active
 * orientation, since a merchant can flip orientation without republishing
 * and the kiosk shouldn't cold-load images the first time that happens).
 * Mirrors lib/menuImagePrefetch.ts's cachePolicy so kiosk media benefits
 * from the same warm-cache-before-render approach as menu item images —
 * without this, the idle screen/banner would decode straight off the
 * network on first paint instead of from cache.
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
  void Image.prefetch(Array.from(urls), { cachePolicy: "memory-disk" }).catch(() => {});
}
