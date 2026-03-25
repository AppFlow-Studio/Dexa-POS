import { Image } from "expo-image";
import type { MenuItemType } from "@/lib/types";

/**
 * Collects distinct http(s) image URLs from menu items (CDN / Supabase storage).
 * Use with `Image.prefetch` so the grid scrolls without cold-cache flashes.
 */
export function extractHttpMenuImageUris(items: MenuItemType[], max = 36): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const raw = item.image?.trim();
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      out.push(raw);
      if (out.length >= max) break;
    } catch {
      continue;
    }
  }
  return out;
}

/** Fire-and-forget prefetch for remote menu thumbnails */
export function prefetchMenuItemRemoteImages(items: MenuItemType[]): void {
  const urls = extractHttpMenuImageUris(items);
  if (!urls.length) return;
  void Image.prefetch(urls, { cachePolicy: "memory-disk" }).catch(() => {});
}
