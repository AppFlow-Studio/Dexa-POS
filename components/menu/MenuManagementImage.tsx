import { Image as ExpoImage } from "expo-image";
import React, { useMemo } from "react";
import type { StyleProp, ImageStyle } from "react-native";

import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";

/**
 * Image renderer for the MENU MANAGEMENT screens (items/modifiers grids).
 *
 * WHY THIS EXISTS: those grids previously rendered menu-item images with RN's
 * built-in <Image> pointed at `data:image/jpeg;base64,…` URIs. base64 data URIs
 * cannot be disk-cached (no URL key), so Fresco decodes each into a native
 * bitmap held in the in-memory pool AND the base64 string stays pinned in JS —
 * entering the items screen decoded dozens of full-size bitmaps into NATIVE
 * memory that were never released on exit ("native MB flies and doesn't clean
 * up"). expo-image lets us (a) bound the decode size so each bitmap is a
 * thumbnail, not full-res, (b) set a recyclingKey so cells release on recycle,
 * and (c) clear the memory cache on unmount (see clearMenuManagementImageCache).
 */

interface MenuManagementImageProps {
  /** Raw item.image (base64 blob, data URI, http url, file uri, or asset key). */
  image: string | undefined;
  style?: StyleProp<ImageStyle>;
  className?: string;
  /** Decode target in px — bitmaps are downscaled to this, not full-res. */
  decodeSize?: number;
  /** Stable id (item id) so recycled cells drop the old bitmap. */
  recyclingKey?: string;
}

const MenuManagementImage: React.FC<MenuManagementImageProps> = ({
  image,
  style,
  className,
  decodeSize = 128,
  recyclingKey,
}) => {
  const source = useMemo(() => {
    const resolved = resolveMenuItemImageSource(image);
    if (!resolved) return undefined;
    // Local asset (require()'d number or MENU_IMAGE_MAP entry) — pass through.
    if (typeof resolved === "number") return resolved;
    if (
      image &&
      typeof resolved !== "number" &&
      MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP]
    ) {
      return MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP];
    }
    // Remote/base64/file: give expo-image a decode hint so it downscales the
    // native bitmap to thumbnail size instead of full resolution.
    if (typeof resolved === "object" && "uri" in resolved && resolved.uri) {
      return { uri: resolved.uri, width: decodeSize, height: decodeSize };
    }
    return resolved;
  }, [image, decodeSize]);

  // The native-bitmap problem above is specific to base64: a data URI has no
  // URL key, so expo-image cannot disk-cache it and memory-only is the only
  // option. Sources that DO have a key — http(s) CDN urls, and the file://
  // paths the useMenuStore base64 offload rewrites items to — get the disk
  // cache instead. That is what lets these thumbnails survive going offline,
  // the way order-processing's already do via OptimizedListImage
  // (cachePolicy="disk") and prefetchMenuItemRemoteImages. Memory-only here
  // meant nothing was ever written to disk, and the clearMemoryCache() on
  // screen unmount then wiped the only copy.
  const cachePolicy = useMemo(() => {
    if (typeof source === "object" && source !== null && "uri" in source) {
      const uri = source.uri;
      if (typeof uri === "string" && uri.startsWith("data:")) return "memory";
    }
    return "disk";
  }, [source]);

  if (!source) return null;

  return (
    <ExpoImage
      source={source}
      style={style}
      className={className}
      contentFit="cover"
      cachePolicy={cachePolicy}
      recyclingKey={recyclingKey}
    />
  );
};

export default React.memo(MenuManagementImage);
