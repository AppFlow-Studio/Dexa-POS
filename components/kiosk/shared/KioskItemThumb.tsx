import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { Image as ExpoImage } from "expo-image";
import { useMemo, type ReactNode } from "react";

/**
 * A menu-item thumbnail for kiosk lists, decoded to thumbnail size.
 *
 * WHY THIS EXISTS: menu items can carry their photo as an inline base64 blob,
 * which `resolveMenuItemImageSource` hands back as a `data:image/jpeg;base64,…`
 * URI. Pointed at RN’s built-in <Image>, a data URI has no URL key, so it
 * cannot be disk-cached: Fresco decodes each one into a full-resolution native
 * bitmap held in the in-memory pool while the base64 string stays pinned in JS.
 * The menu-management grids hit exactly this and were moved off it — see
 * components/menu/MenuManagementImage.tsx, "native MB flies and doesn’t clean
 * up".
 *
 * A search list is the worse version of that case. The result set is replaced
 * wholesale on every keystroke, and the item grid it covers stays mounted
 * underneath holding its own bitmaps, so the two lists’ memory adds up rather
 * than trading off. expo-image is what makes it bounded:
 *
 *  - a decode hint, so each bitmap is a thumbnail rather than the full photo;
 *  - `recyclingKey`, so a recycled FlashList cell drops the previous bitmap
 *    instead of holding it until the next decode lands;
 *  - disk caching for anything with a URL key, memory-only for data URIs,
 *    which cannot have one.
 *
 * Fills its parent — the caller owns the box, its radius and its clipping.
 */

/** Decode ceiling, so a large UI scale cannot walk the bitmap back to full size. */
const MAX_DECODE = 256;

export function KioskItemThumb({
  image,
  size,
  recyclingKey,
  fallback,
}: {
  /** Raw `item.image`: http(s) url, data URI, file uri, base64 blob or asset key. */
  image: string | undefined;
  /** Drawn edge in dp. Bounds the decode only; the image fills its parent. */
  size: number;
  /** The item id, so a recycled cell releases the bitmap it was showing. */
  recyclingKey: string;
  /** Drawn instead when the item has no usable image — normally the placeholder icon. */
  fallback: ReactNode;
}) {
  // Twice the drawn edge covers every device pixel ratio a kiosk panel runs at
  // without decoding a photo at its full capture size.
  const decode = Math.min(MAX_DECODE, Math.max(1, Math.round(size * 2)));

  const source = useMemo(() => {
    const resolved = resolveMenuItemImageSource(image);
    if (!resolved) return undefined;
    // A bundled asset (a require()’d number, which is also what MENU_IMAGE_MAP
    // keys resolve to) is already sized by the bundler — nothing to bound.
    if (typeof resolved === "number") return resolved;
    if ("uri" in resolved && resolved.uri) {
      return { uri: resolved.uri, width: decode, height: decode };
    }
    return undefined;
  }, [image, decode]);

  if (!source) return <>{fallback}</>;

  // A data URI has no key to cache under, so memory is the only option; every
  // other form gets the disk cache and survives a restart.
  const isDataUri =
    typeof source === "object" && source.uri.startsWith("data:");

  return (
    <ExpoImage
      source={source}
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      cachePolicy={isDataUri ? "memory" : "disk"}
      recyclingKey={recyclingKey}
    />
  );
}
