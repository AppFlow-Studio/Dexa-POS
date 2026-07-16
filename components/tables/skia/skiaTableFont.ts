import { SkFont, Skia, SkTypeface } from "@shopify/react-native-skia";

/**
 * Font provider for the Skia floor-plan text.
 *
 * Typefaces are loaded from bundled Inter TTFs via `useTypeface` in SkiaTableLayer
 * (the system FontMgr path rendered no glyphs on-device). This module just builds &
 * caches sized `SkFont`s from those loaded typefaces.
 */

export interface TableTypefaces {
  regular: SkTypeface | null; // Inter-Medium (used for 400/600)
  bold: SkTypeface | null; // Inter-Bold (used for 700/800)
}

const fontCache = new Map<string, SkFont>();
let current: TableTypefaces = { regular: null, bold: null };

/** Called by SkiaTableLayer once the typefaces resolve. */
export const setTableTypefaces = (tf: TableTypefaces) => {
  if (tf.regular !== current.regular || tf.bold !== current.bold) {
    current = tf;
    fontCache.clear(); // rebuild fonts against the new typefaces
  }
};

export const getTableFont = (
  size: number,
  weight: "400" | "600" | "700" | "800",
): SkFont | null => {
  const bold = weight === "700" || weight === "800";
  const tf = bold ? current.bold : current.regular;
  if (!tf) return null;

  const px = Math.max(1, Math.round(size));
  const key = `${bold ? "b" : "r"}:${px}`;
  let font = fontCache.get(key);
  if (!font) {
    font = Skia.Font(tf, px);
    fontCache.set(key, font);
  }
  return font;
};

export const measureWidth = (font: SkFont, text: string): number => {
  try {
    return font.getTextWidth(text);
  } catch {
    return text.length * font.getSize() * 0.55;
  }
};
