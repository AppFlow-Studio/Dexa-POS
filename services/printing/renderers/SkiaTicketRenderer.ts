import { Skia, PaintStyle } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system";
import { Asset } from "expo-asset";

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
const LINE_SPACING = 2; // extra pixels between lines
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

let cachedCustomTypeface: ReturnType<typeof Skia.Typeface.MakeFreeTypeFaceFromData> | null = null;
let isCustomFontLoaded = false;

async function loadCustomTypeface() {
  if (isCustomFontLoaded) return cachedCustomTypeface;
  try {
    const assets = await Asset.loadAsync(require("../../../assets/fonts/SpaceMono-Regular.ttf"));
    if (assets && assets[0] && assets[0].localUri) {
      const data = await FileSystem.readAsStringAsync(assets[0].localUri, { encoding: FileSystem.EncodingType.Base64 });
      cachedCustomTypeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBase64(data));
    }
  } catch (error) {
    console.error("[SkiaTicketRenderer] Failed to load custom font:", error);
  } finally {
    isCustomFontLoaded = true; // prevent repeated failing loads
  }
  return cachedCustomTypeface;
}

let cachedRegularTypeface: any = null;
let cachedBoldTypeface: any = null;

// Monotonic render counter for the leak diagnostic below. Per-call native Skia
// objects (Surface/Image/Paint/Font) are NOT reclaimed by the Hermes GC — they
// hold GPU/EGL-backed native memory that must be dispose()'d explicitly. If this
// count climbs while disposes don't, prints are leaking GPU memory into the
// shared Skia context (which can blank other on-screen Canvases like the floor
// plan). console.warn survives production console-stripping.
let renderCount = 0;

function getTypeface(bold: boolean): any {
  if (cachedCustomTypeface) {
    return cachedCustomTypeface;
  }

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

  // Ensure custom typeface is loaded before rasterizing text
  await loadCustomTypeface();

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

  // Every per-call native Skia object (Paint/Font, plus the Surface and Image)
  // must be dispose()'d on EVERY exit path — native GPU/EGL memory is not
  // GC-managed, and undisposed objects accumulate across print jobs, starving the
  // shared Skia GL context (which can blank other on-screen Canvases, e.g. the
  // floor plan). Register each object in `disposables` at creation; the single
  // finally below releases them all, on the success return and every early return.
  let image: ReturnType<typeof surface.makeImageSnapshot> | null = null;
  const disposables: { dispose?: () => void }[] = [];
  const track = <T>(o: T): T => {
    disposables.push(o as unknown as { dispose?: () => void });
    return o;
  };

  try {
  const canvas = surface.getCanvas();

  // White background
  canvas.clear(Skia.Color("#FFFFFF"));

  // Reusable paint objects
  const blackPaint = track(Skia.Paint());
  blackPaint.setColor(Skia.Color("#000000"));
  blackPaint.setAntiAlias(false); // Crisp for thermal printing

  const whitePaint = track(Skia.Paint());
  whitePaint.setColor(Skia.Color("#FFFFFF"));
  whitePaint.setAntiAlias(false);

  const invertBgPaint = track(Skia.Paint());
  invertBgPaint.setColor(Skia.Color("#000000"));

  // Bold stroke overlay paints (thin stroke drawn over fill for thermal paper thickness)
  const boldStrokePaint = track(Skia.Paint());
  boldStrokePaint.setColor(Skia.Color("#000000"));
  boldStrokePaint.setStyle(PaintStyle.Stroke);
  boldStrokePaint.setStrokeWidth(0.5);
  boldStrokePaint.setAntiAlias(false);

  const boldStrokeWhitePaint = track(Skia.Paint());
  boldStrokeWhitePaint.setColor(Skia.Color("#FFFFFF"));
  boldStrokeWhitePaint.setStyle(PaintStyle.Stroke);
  boldStrokeWhitePaint.setStrokeWidth(0.5);
  boldStrokeWhitePaint.setAntiAlias(false);

  // Red paint for secondColor (two-color thermal printers)
  const redPaint = track(Skia.Paint());
  redPaint.setColor(Skia.Color("#FF0000"));
  redPaint.setAntiAlias(false);

  const redStrokePaint = track(Skia.Paint());
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
      const linePaint = track(Skia.Paint());
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
    const typeface = getTypeface(block.bold) ?? undefined;
    const checkFont = track(Skia.Font(typeface, BASE_FONT_SIZE));
    const rawWidth = checkFont.getTextWidth(block.text);
    const effectiveWidth = doubleWidth ? rawWidth * 2 : rawWidth;
    if (effectiveWidth > maxContentWidth && doubleWidth) {
      doubleWidth = false;
      // doubleHeight stays — it doesn't affect width
    }

    const font = track(Skia.Font(typeface, BASE_FONT_SIZE));
    font.setEdging(0); // 0 = Alias — no anti-aliasing, crisp for thermal printing

    // Handle inverted: draw black rect behind text only, then white text
    if (block.inverted) {
      const invFont = track(Skia.Font(typeface, BASE_FONT_SIZE));
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
        canvas.save();
        canvas.translate(0, y);
        canvas.scale(scaleX, scaleY);
        
        const drawY = BASE_FONT_SIZE;
        const leftX = HORIZONTAL_PADDING / scaleX;
        canvas.drawText(block.text, leftX, drawY, fillPaint, font);
        if (strokeOverlay) canvas.drawText(block.text, leftX, drawY, strokeOverlay, font);

        const rightW = font.getTextWidth(block.rightAlignedText);
        const rightX = (printWidthDots - HORIZONTAL_PADDING) / scaleX - rightW;
        canvas.drawText(block.rightAlignedText, rightX, drawY, fillPaint, font);
        if (strokeOverlay) canvas.drawText(block.rightAlignedText, rightX, drawY, strokeOverlay, font);
        canvas.restore();
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
      canvas.save();
      canvas.translate(outputX, y);
      canvas.scale(scaleX, scaleY);
      canvas.drawText(block.text, 0, BASE_FONT_SIZE, fillPaint, font);
      if (strokeOverlay) {
        canvas.drawText(block.text, 0, BASE_FONT_SIZE, strokeOverlay, font);
      }
      canvas.restore();
    } else {
      canvas.drawText(block.text, outputX, y + BASE_FONT_SIZE, fillPaint, font);
      if (strokeOverlay) {
        canvas.drawText(block.text, outputX, y + BASE_FONT_SIZE, strokeOverlay, font);
      }
    }

    y += lineHeight;
  }

  // Export to PNG base64, then write to temp file for reliable Star SDK transfer
  image = surface.makeImageSnapshot();
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
  } finally {
    // Release native GPU/EGL-backed memory on every path (success + early return
    // + throw). dispose is optional-chained: some rn-skia host objects expose it
    // as best-effort, and a torn-down object can throw.
    try { image?.dispose?.(); } catch {}
    try { surface.dispose?.(); } catch {}
    for (const d of disposables) {
      try { d.dispose?.(); } catch {}
    }
    renderCount++;
    // Periodic on-device observability: confirms dispose runs and the alloc count
    // isn't climbing unbounded. Warn (kept in prod) every 20th render.
    if (renderCount % 20 === 0) {
      console.warn("[SkiaTicketRenderer] alloc/dispose", {
        renders: renderCount,
        disposedThisCall: disposables.length,
        imageDisposed: !!image,
      });
    }
  }
}
