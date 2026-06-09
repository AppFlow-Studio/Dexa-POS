import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { ImageSourcePropType } from "react-native";

function isValidHttpOrHttpsUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isDataImageUrl(s: string): boolean {
  return s.trim().toLowerCase().startsWith("data:image/");
}

/**
 * Resolves menu item `image` string to a React Native Image source, or undefined if unusable.
 * Supports http(s) URLs, data:image/* URIs, legacy raw base64 blobs, and MENU_IMAGE_MAP keys.
 */
export function resolveMenuItemImageSource(
  image: string | undefined,
): ImageSourcePropType | undefined {
  if (!image || typeof image !== "string") return undefined;

  const trimmed = image.trim();
  if (!trimmed) return undefined;

  if (isValidHttpOrHttpsUrl(trimmed)) {
    return { uri: trimmed };
  }

  if (isDataImageUrl(trimmed)) {
    return { uri: trimmed };
  }

  if (trimmed.startsWith('file://')) {
    return { uri: trimmed };
  }

  if (trimmed.length > 200) {
    return { uri: `data:image/jpeg;base64,${trimmed}` };
  }

  const asset = MENU_IMAGE_MAP[trimmed as keyof typeof MENU_IMAGE_MAP];
  return asset ?? undefined;
}
