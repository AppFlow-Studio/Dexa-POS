import { Skia, PaintStyle } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system";

// ============================================================================
// TYPES
// ============================================================================

export interface TextBlock {
  text: string;
  rightAlignedText?: string; // If set, draw left text at left margin and this text at right margin (pixel-perfect two-column)
  bold: boolean;
  doubleHeight: boolean;
  doubleWidth: boolean;
  inverted: boolean;
  align: "left" | "center" | "right";
  isDivider?: boolean;
  dividerStyle?: "solid" | "dotted" | "double";
  secondColor?: boolean;
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
 * doubleHeight uses vertical canvas scaling (not a larger font) so character width
 * stays the same as BASE_FONT_SIZE — matching how real thermal printers stretch height only.
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
    if (block.isDivider) {
      const divHeight = (block.dividerStyle ?? "solid") === "double" ? 20 : 16;
      lineHeights.push(divHeight);
      totalHeight += divHeight;
    } else {
      const scaleY = block.doubleHeight ? 2 : 1;
      // Scale line spacing proportionally — at 2x, descent extends beyond
      // BASE_FONT_SIZE*2 + LINE_SPACING, clipping into the next line.
      const lineHeight = (BASE_FONT_SIZE + LINE_SPACING) * scaleY;
      lineHeights.push(lineHeight);
      totalHeight += lineHeight;
    }
  }

  // Add padding at top and bottom
  totalHeight += LINE_SPACING * 2;

  // Create offscreen surface
  const surfaceHeight = Math.max(totalHeight, 1);

  const MAX_SURFACE_HEIGHT = 4000;
  if (surfaceHeight > MAX_SURFACE_HEIGHT) {
    console.error(`[SkiaTicketRenderer] Surface height ${surfaceHeight}px exceeds max ${MAX_SURFACE_HEIGHT}px`);
    return "";
  }

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

  // Bold stroke overlay paints (thin stroke drawn over fill for thermal paper thickness)
  const boldStrokePaint = Skia.Paint();
  boldStrokePaint.setColor(Skia.Color("#000000"));
  boldStrokePaint.setStyle(PaintStyle.Stroke);
  boldStrokePaint.setStrokeWidth(0.5);
  boldStrokePaint.setAntiAlias(false);

  const boldStrokeWhitePaint = Skia.Paint();
  boldStrokeWhitePaint.setColor(Skia.Color("#FFFFFF"));
  boldStrokeWhitePaint.setStyle(PaintStyle.Stroke);
  boldStrokeWhitePaint.setStrokeWidth(0.5);
  boldStrokeWhitePaint.setAntiAlias(false);

  // Red paint for secondColor (two-color thermal printers)
  const redPaint = Skia.Paint();
  redPaint.setColor(Skia.Color("#FF0000"));
  redPaint.setAntiAlias(false);

  const redStrokePaint = Skia.Paint();
  redStrokePaint.setColor(Skia.Color("#FF0000"));
  redStrokePaint.setStyle(PaintStyle.Stroke);
  redStrokePaint.setStrokeWidth(0.5);
  redStrokePaint.setAntiAlias(false);

  let y = LINE_SPACING;

  const maxContentWidth = printWidthDots - 2 * HORIZONTAL_PADDING;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const lineHeight = lineHeights[i];

    // ── Divider: graphic lines instead of text dashes ──
    if (block.isDivider) {
      const style = block.dividerStyle ?? "solid";
      const lineY = y + lineHeight / 2;
      const linePaint = Skia.Paint();
      linePaint.setColor(Skia.Color("#000000"));
      linePaint.setStrokeWidth(style === "double" ? 1.5 : 2);
      linePaint.setStyle(PaintStyle.Stroke);
      linePaint.setAntiAlias(false);
      canvas.drawLine(HORIZONTAL_PADDING, lineY, printWidthDots - HORIZONTAL_PADDING, lineY, linePaint);
      if (style === "double") {
        canvas.drawLine(HORIZONTAL_PADDING, lineY + 5, printWidthDots - HORIZONTAL_PADDING, lineY + 5, linePaint);
      }
      y += lineHeight;
      continue;
    }

    // ── Overflow check ──
    // doubleHeight uses vertical scaling only — it never affects width.
    // Only doubleWidth needs width checking.
    let { doubleWidth, doubleHeight } = block;
    const checkFont = Skia.Font(getTypeface(block.bold), BASE_FONT_SIZE);
    const rawWidth = checkFont.getTextWidth(block.text);
    const effectiveWidth = doubleWidth ? rawWidth * 2 : rawWidth;
    if (effectiveWidth > maxContentWidth && doubleWidth) {
      doubleWidth = false;
      // doubleHeight stays — it doesn't affect width
    }

    const typeface = getTypeface(block.bold);
    const font = Skia.Font(typeface, BASE_FONT_SIZE);
    font.setEdging(0); // 0 = Alias — no anti-aliasing, crisp for thermal printing

    // Handle inverted: draw black rect behind text only, then white text
    if (block.inverted) {
      const invFont = Skia.Font(getTypeface(block.bold), BASE_FONT_SIZE);
      const invScaleX = doubleWidth ? 2 : 1;
      const textW = invFont.getTextWidth(block.text) * invScaleX;
      const pad = 4;
      let rectX: number;
      if (block.align === "center") {
        rectX = Math.max(0, (printWidthDots - textW) / 2 - pad);
      } else if (block.align === "right") {
        rectX = Math.max(0, printWidthDots - HORIZONTAL_PADDING - textW - pad);
      } else {
        rectX = Math.max(0, HORIZONTAL_PADDING - pad);
      }
      const rectW = Math.min(textW + pad * 2, printWidthDots - rectX);
      canvas.drawRect(
        { x: rectX, y, width: rectW, height: lineHeight },
        invertBgPaint,
      );
    }

    // ── Select paint — fill + optional bold stroke overlay ──
    // secondColor (without inverted) uses red for two-color printers;
    // on monochrome thermal printers, red pixels print as black bold text.
    const useRed = block.secondColor && !block.inverted;
    const fillPaint = block.inverted ? whitePaint : (useRed ? redPaint : blackPaint);
    const strokeOverlay = block.bold
      ? (block.inverted ? boldStrokeWhitePaint : (useRed ? redStrokePaint : boldStrokePaint))
      : null;

    // ── Unified scaling for doubleWidth / doubleHeight ──
    const scaleX = doubleWidth ? 2 : 1;
    const scaleY = doubleHeight ? 2 : 1;

    // Calculate alignment at output (global) coordinates
    const textWidth = font.getTextWidth(block.text);
    const outputTextWidth = textWidth * scaleX;
    let outputX = HORIZONTAL_PADDING;
    if (block.align === "center") {
      outputX = (printWidthDots - outputTextWidth) / 2;
    } else if (block.align === "right") {
      outputX = printWidthDots - HORIZONTAL_PADDING - outputTextWidth;
    }

    if (block.rightAlignedText) {
      // ── Pixel-perfect two-column: left text at left margin, right text at right edge ──
      if (scaleY !== 1 || scaleX !== 1) {
        // Magnified two-column: use scaled font (same approach as single-text scaled branch)
        const targetFontSize = BASE_FONT_SIZE * scaleY;
        const scaledTwoColFont = Skia.Font(typeface, targetFontSize);
        scaledTwoColFont.setEdging(0);
        const effectiveScaleX = scaleX / scaleY;
        const drawY = y + targetFontSize;

        if (effectiveScaleX !== 1) {
          canvas.save();
          canvas.scale(effectiveScaleX, 1);
          // In canvas coords, output X = canvasX * effectiveScaleX
          const leftX = HORIZONTAL_PADDING / effectiveScaleX;
          canvas.drawText(block.text, leftX, drawY, fillPaint, scaledTwoColFont);
          if (strokeOverlay) canvas.drawText(block.text, leftX, drawY, strokeOverlay, scaledTwoColFont);

          const rightW = scaledTwoColFont.getTextWidth(block.rightAlignedText);
          const rightX = (printWidthDots - HORIZONTAL_PADDING) / effectiveScaleX - rightW;
          canvas.drawText(block.rightAlignedText, rightX, drawY, fillPaint, scaledTwoColFont);
          if (strokeOverlay) canvas.drawText(block.rightAlignedText, rightX, drawY, strokeOverlay, scaledTwoColFont);
          canvas.restore();
        } else {
          canvas.drawText(block.text, HORIZONTAL_PADDING, drawY, fillPaint, scaledTwoColFont);
          if (strokeOverlay) canvas.drawText(block.text, HORIZONTAL_PADDING, drawY, strokeOverlay, scaledTwoColFont);

          const rightW = scaledTwoColFont.getTextWidth(block.rightAlignedText);
          const rightX = printWidthDots - HORIZONTAL_PADDING - rightW;
          canvas.drawText(block.rightAlignedText, rightX, drawY, fillPaint, scaledTwoColFont);
          if (strokeOverlay) canvas.drawText(block.rightAlignedText, rightX, drawY, strokeOverlay, scaledTwoColFont);
        }
      } else {
        const drawY = y + BASE_FONT_SIZE;
        canvas.drawText(block.text, HORIZONTAL_PADDING, drawY, fillPaint, font);
        if (strokeOverlay) canvas.drawText(block.text, HORIZONTAL_PADDING, drawY, strokeOverlay, font);

        const rightW = font.getTextWidth(block.rightAlignedText);
        const rightX = printWidthDots - HORIZONTAL_PADDING - rightW;
        canvas.drawText(block.rightAlignedText, rightX, drawY, fillPaint, font);
        if (strokeOverlay) canvas.drawText(block.rightAlignedText, rightX, drawY, strokeOverlay, font);
      }
    } else if (scaleX !== 1 || scaleY !== 1) {
      // Render at native target font size for crisp glyph rendering.
      // Stretching a small bitmap via canvas.scale() misaligns font hints,
      // causing streaky/missing letters on binary thermal printers.
      const targetFontSize = BASE_FONT_SIZE * scaleY;
      const scaledFont = Skia.Font(typeface, targetFontSize);
      scaledFont.setEdging(0);

      // Larger font produces proportionally wider glyphs; compensate X scale
      // so output width matches the original intent:
      //   doubleHeight only  → 0.5 (squeeze width to match normal)
      //   doubleWidth only   → 2   (stretch width)
      //   both               → 1   (no X change)
      const effectiveScaleX = scaleX / scaleY;

      if (effectiveScaleX !== 1) {
        canvas.save();
        canvas.translate(outputX, y);
        canvas.scale(effectiveScaleX, 1);
        canvas.drawText(block.text, 0, targetFontSize, fillPaint, scaledFont);
        if (strokeOverlay) {
          canvas.drawText(block.text, 0, targetFontSize, strokeOverlay, scaledFont);
        }
        canvas.restore();
      } else {
        canvas.drawText(block.text, outputX, y + targetFontSize, fillPaint, scaledFont);
        if (strokeOverlay) {
          canvas.drawText(block.text, outputX, y + targetFontSize, strokeOverlay, scaledFont);
        }
      }
    } else {
      canvas.drawText(block.text, outputX, y + BASE_FONT_SIZE, fillPaint, font);
      if (strokeOverlay) {
        canvas.drawText(block.text, outputX, y + BASE_FONT_SIZE, strokeOverlay, font);
      }
    }

    y += lineHeight;
  }

  // Export to PNG base64, then write to temp file for reliable Star SDK transfer
  const image = surface.makeImageSnapshot();
  if (!image) {
    console.error('[SkiaTicketRenderer] makeImageSnapshot() returned null');
    return '';
  }

  const base64 = image.encodeToBase64(4, 100); // 4 = PNG format

  if (!base64 || base64.length < 200) {
    console.error(`[SkiaTicketRenderer] PNG too small: ${base64?.length ?? 0} chars for ${blocks.length} blocks`);
    return '';
  }

  const fileName = `star-ticket-${Date.now()}.png`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  console.log(`[SkiaTicketRenderer] Image written: ${fileUri} (~${Math.round(base64.length * 0.75 / 1024)}KB)`);
  return fileUri;
}
