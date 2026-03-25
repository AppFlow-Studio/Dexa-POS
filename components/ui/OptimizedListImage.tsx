import { Image, type ImageSource } from "expo-image";
import React, { useMemo } from "react";
import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";

export type ImageLoadPriority = "low" | "normal" | "high";

export interface OptimizedListImageProps {
  source: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  /** FlatList / FlashList: favor viewport rows first */
  priority?: ImageLoadPriority | null;
  /** Reset content when cells recycle (iOS/Android) */
  recyclingKey?: string | null;
  /** Low-data placeholder while the remote image loads */
  blurhash?: string | null;
  thumbhash?: string | null;
}

function toExpoSource(source: ImageSourcePropType): string | number | ImageSource {
  if (typeof source === "number") return source;
  if (Array.isArray(source)) {
    return source[0] as ImageSource;
  }
  if (typeof source === "object" && source !== null && "uri" in source) {
    const uri = (source as { uri?: string }).uri;
    if (typeof uri === "string") return { uri };
  }
  return source as ImageSource;
}

/**
 * expo-image wrapper tuned for virtualized lists: cross-dissolve on source change,
 * optional BlurHash/ThumbHash, priority, and recyclingKey.
 */
const OptimizedListImage = React.memo(function OptimizedListImage({
  source,
  style,
  contentFit = "cover",
  priority = "normal",
  recyclingKey,
  blurhash,
  thumbhash,
}: OptimizedListImageProps) {
  const expoSource = useMemo(() => toExpoSource(source), [source]);

  const placeholder = useMemo(() => {
    if (blurhash) return { blurhash, width: 32, height: 32 };
    if (thumbhash) return { thumbhash, width: 32, height: 32 };
    return undefined;
  }, [blurhash, thumbhash]);

  return (
    <Image
      source={expoSource}
      style={style}
      contentFit={contentFit}
      placeholderContentFit={contentFit}
      transition={180}
      priority={priority ?? "normal"}
      recyclingKey={recyclingKey ?? undefined}
      placeholder={placeholder}
      cachePolicy="disk"
    />
  );
});

export default OptimizedListImage;
