import { Skia } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system";

// ============================================================================
// TYPES
// ============================================================================

export interface TextBlock {
  text: string;
  bold: boolean;
  doubleHeight: boolean;
  doubleWidth: boolean;
  inverted: boolean;
  align: "left" | "center" | "right";
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_FONT_SIZE = 28;
const LINE_SPACING = 6; // extra pixels between lines
const HORIZONTAL_PADDING = 4; // left/right margin in dots

// Monospace font families to try (platform-dependent)
const MONO_FAMILIES = [
  "Courier New", // iOS / macOS
  "Courier",
  "monospace", // Android fallback
  "Droid Sans Mono",
];

// ============================================================================
// FONT CACHE
// ============================================================================

let cachedRegularTypeface: ReturnType<
  ReturnType<typeof Skia.FontMgr.System>["matchFamilyStyle"]
> | null = null;
let cachedBoldTypeface: typeof cachedRegularTypeface = null;

function getTypeface(bold: boolean) {
  const fontMgr = Skia.FontMgr.System();

  if (bold) {
    if (!cachedBoldTypeface) {
      for (const family of MONO_FAMILIES) {
        const tf = fontMgr.matchFamilyStyle(family, { weight: 700, width: 5, slant: 0 });
        if (tf) {
          cachedBoldTypeface = tf;
          break;
        }
      }
      // Final fallback: default typeface
      if (!cachedBoldTypeface) {
        cachedBoldTypeface = fontMgr.matchFamilyStyle("", { weight: 700, width: 5, slant: 0 });
      }
    }
    return cachedBoldTypeface;
  }

  if (!cachedRegularTypeface) {
    for (const family of MONO_FAMILIES) {
      const tf = fontMgr.matchFamilyStyle(family, { weight: 400, width: 5, slant: 0 });
      if (tf) {
        cachedRegularTypeface = tf;
        break;
      }
    }
    if (!cachedRegularTypeface) {
      cachedRegularTypeface = fontMgr.matchFamilyStyle("", { weight: 400, width: 5, slant: 0 });
    }
  }
  return cachedRegularTypeface;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Renders an array of TextBlocks to a PNG image file using Skia offscreen rendering.
 * Used by graphics-only Star printers (TSP100III) that don't support actionPrintText.
 *
 * @param blocks - The text blocks to render
 * @param printWidthDots - Print head width in dots (e.g. 576 for 80mm @ 203dpi)
 * @returns file:// URI pointing to the rendered PNG in the cache directory
 */
export async function renderTextBlocksToImage(
  blocks: TextBlock[],
  printWidthDots: number,
): Promise<string> {
  if (blocks.length === 0) return "";

  // First pass: calculate total height
  let totalHeight = 0;
  const lineHeights: number[] = [];

  for (const block of blocks) {
    const fontSize = block.doubleHeight ? BASE_FONT_SIZE * 2 : BASE_FONT_SIZE;
    const lineHeight = fontSize + LINE_SPACING;
    lineHeights.push(lineHeight);
    totalHeight += lineHeight;
  }

  // Add padding at top and bottom
  totalHeight += LINE_SPACING * 2;

  // Create offscreen surface
  const surfaceHeight = Math.max(totalHeight, 1);
  const surface = Skia.Surface.Make(printWidthDots, surfaceHeight);
  if (!surface) {
    console.error("[SkiaTicketRenderer] Failed to create Skia surface");
    return "";
  }
  console.log(`[SkiaTicketRenderer] Surface created: ${printWidthDots}x${surfaceHeight}, ${blocks.length} text blocks`);

  const canvas = surface.getCanvas();

  // White background
  canvas.clear(Skia.Color("#FFFFFF"));

  // Reusable paint objects
  const blackPaint = Skia.Paint();
  blackPaint.setColor(Skia.Color("#000000"));
  blackPaint.setAntiAlias(false); // Crisp for thermal printing

  const whitePaint = Skia.Paint();
  whitePaint.setColor(Skia.Color("#FFFFFF"));
  whitePaint.setAntiAlias(false);

  const invertBgPaint = Skia.Paint();
  invertBgPaint.setColor(Skia.Color("#000000"));

  let y = LINE_SPACING;

  const maxContentWidth = printWidthDots - 2 * HORIZONTAL_PADDING;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Auto-reduce magnification if text would overflow the print width
    let { doubleWidth, doubleHeight } = block;
    const checkFont = Skia.Font(getTypeface(block.bold), doubleHeight ? BASE_FONT_SIZE * 2 : BASE_FONT_SIZE);
    const rawWidth = checkFont.getTextWidth(block.text);
    const effectiveWidth = doubleWidth ? rawWidth * 2 : rawWidth;
    if (effectiveWidth > maxContentWidth) {
      if (doubleWidth) {
        // Drop doubleWidth first
        doubleWidth = false;
        // Re-check with just doubleHeight
        if (rawWidth > maxContentWidth && doubleHeight) {
          doubleHeight = false;
        }
      } else if (doubleHeight) {
        // Re-measure at normal font size
        const normalFont = Skia.Font(getTypeface(block.bold), BASE_FONT_SIZE);
        const normalWidth = normalFont.getTextWidth(block.text);
        if (normalWidth <= maxContentWidth) {
          doubleHeight = false;
        }
      }
    }

    const fontSize = doubleHeight ? BASE_FONT_SIZE * 2 : BASE_FONT_SIZE;

    const typeface = getTypeface(block.bold);
    const font = Skia.Font(typeface, fontSize);
    font.setEdging(0); // 0 = Alias — no anti-aliasing, crisp for thermal printing

    const lineHeight = lineHeights[i];
    const textY = y + fontSize; // drawText y is baseline

    // Handle inverted: draw black rect, then white text
    if (block.inverted) {
      const rectY = y;
      canvas.drawRect(
        { x: 0, y: rectY, width: printWidthDots, height: lineHeight },
        invertBgPaint,
      );
    }

    const paint = block.inverted ? whitePaint : blackPaint;

    // Handle doubleWidth by scaling
    if (doubleWidth) {
      const textWidth = font.getTextWidth(block.text);
      const scaledWidth = textWidth * 2;
      let x = HORIZONTAL_PADDING;
      if (block.align === "center") {
        x = (printWidthDots - scaledWidth) / 2;
      } else if (block.align === "right") {
        x = printWidthDots - HORIZONTAL_PADDING - scaledWidth;
      }
      canvas.save();
      canvas.scale(2, 1);
      canvas.drawText(block.text, x / 2, textY, paint, font);
      canvas.restore();
    } else {
      // Calculate x position based on alignment
      const textWidth = font.getTextWidth(block.text);
      let x = HORIZONTAL_PADDING;
      if (block.align === "center") {
        x = (printWidthDots - textWidth) / 2;
      } else if (block.align === "right") {
        x = printWidthDots - HORIZONTAL_PADDING - textWidth;
      }
      canvas.drawText(block.text, x, textY, paint, font);
    }

    y += lineHeight;
  }

  // Export to PNG base64, then write to temp file for reliable Star SDK transfer
  const image = surface.makeImageSnapshot();
  const base64 = image.encodeToBase64(4, 100); // 4 = PNG format

  const fileName = `star-ticket-${Date.now()}.png`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  console.log(`[SkiaTicketRenderer] Image written: ${fileUri} (~${Math.round(base64.length * 0.75 / 1024)}KB)`);
  return fileUri;
}
