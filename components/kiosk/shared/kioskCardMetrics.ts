/**
 * Responsive metrics for kiosk menu cards.
 *
 * A card is sized from **its own measured width, bounded by the grid's
 * available height**. Width alone encodes screen size and the manager's column
 * choice, which is the whole story in portrait — but not in landscape, where
 * the grid is wide and short. There, dropping to 2 columns makes each card wide
 * enough that a width-derived image is taller than the viewport, and a single
 * row of two enormous cards fills the screen (measured: 1.01 rows visible at
 * 1920x1080). Feeding the height in caps that, so every column count keeps
 * roughly two rows in view and switching columns reflows the grid instead of
 * rescaling it.
 *
 * Ratios are calibrated against a ~260px "comfortable" reference card. The
 * clamps only catch the true extremes: a 4-column card on a small panel can't
 * shrink below the readable floor (it drops the description instead), and the
 * ceilings are set high enough that they never bind before the kiosk UI scale
 * hits its own 3.0x cap - otherwise card type would stall at one size while
 * the surrounding chrome kept growing, and a 4K panel would show 42px item
 * names beside 63px cart rows.
 */
export interface KioskCardMetrics {
  /** Measured width of a single card, in px. */
  cardWidth: number;
  radius: number;
  padH: number;
  padV: number;
  gap: number;
  imageHeight: number;
  placeholderSize: number;
  nameSize: number;
  nameLineHeight: number;
  /** Fixed height reserved for the name so every card in the grid aligns. */
  nameBlockHeight: number;
  descSize: number;
  descLineHeight: number;
  descLines: number;
  descBlockHeight: number;
  /** Below this width the description is dropped rather than truncated to mush. */
  showDescription: boolean;
  priceSize: number;
  /** Whether the "Options" pill has room for its label, or shows icon-only. */
  showOptionsLabel: boolean;
  optionsIconSize: number;
  optionsTextSize: number;
  badgeIconSize: number;
  badgeTextSize: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** Round to a whole px — sub-pixel type sizes render blurry on kiosk panels. */
const px = (v: number) => Math.round(v);

/**
 * Above this width-to-height ratio a cell is too wide for a top-image card —
 * the image flattens into a letterbox crop — and the row layout reads better.
 * In practice this is the 2-column landscape case.
 */
export const KIOSK_ROW_LAYOUT_RATIO = 1.4;

export function shouldUseRowLayout(
  cardWidth: number,
  maxCardHeight?: number,
): boolean {
  if (!maxCardHeight || maxCardHeight <= 0) return false;
  return cardWidth / maxCardHeight >= KIOSK_ROW_LAYOUT_RATIO;
}

/** Metrics for the row card (square image left, copy right). */
export interface KioskRowMetrics {
  imageSize: number;
  pad: number;
  gap: number;
  radius: number;
  imageRadius: number;
  placeholderSize: number;
  nameSize: number;
  nameLineHeight: number;
  descSize: number;
  descLineHeight: number;
  descLines: number;
  showDescription: boolean;
  priceSize: number;
  optionsIconSize: number;
  optionsTextSize: number;
  badgeIconSize: number;
  badgeTextSize: number;
}

/**
 * Row-card metrics. The image is a square bounded by the cell's height budget,
 * and the copy is sized from the width actually left beside it — not from the
 * cell's full width, which would over-size type that has to fit a narrower
 * column.
 */
export function kioskRowMetrics(
  cardWidth: number,
  maxCardHeight: number,
): KioskRowMetrics {
  const w = Math.max(160, cardWidth);
  const imageSize = px(Math.min(maxCardHeight * 0.8, w * 0.3));
  const pad = px(clamp(imageSize * 0.12, 8, 24));
  const textWidth = Math.max(80, w - imageSize - pad * 3);

  const nameSize = px(clamp(textWidth * 0.085, 16, 56));
  const descSize = px(clamp(textWidth * 0.06, 13, 30));

  return {
    imageSize,
    pad,
    gap: px(clamp(textWidth * 0.02, 4, 14)),
    radius: px(clamp(imageSize * 0.14, 12, 32)),
    imageRadius: px(clamp(imageSize * 0.1, 10, 26)),
    placeholderSize: px(clamp(imageSize * 0.36, 28, 110)),
    nameSize,
    nameLineHeight: px(nameSize * 1.25),
    descSize,
    descLineHeight: px(descSize * 1.35),
    descLines: 2,
    showDescription: textWidth >= 200,
    priceSize: px(clamp(textWidth * 0.09, 17, 60)),
    optionsIconSize: px(clamp(textWidth * 0.045, 12, 30)),
    optionsTextSize: px(clamp(textWidth * 0.045, 11, 26)),
    badgeIconSize: px(clamp(imageSize * 0.14, 12, 32)),
    badgeTextSize: px(clamp(imageSize * 0.145, 12, 32)),
  };
}

export function kioskCardMetrics(
  cardWidth: number,
  /** Height budget for one card. Omit to size from width alone. */
  maxCardHeight?: number,
): KioskCardMetrics {
  const w = Math.max(96, cardWidth);
  const hCap = maxCardHeight && maxCardHeight > 0 ? maxCardHeight : Infinity;

  // Type and spacing key off a basis that respects both axes, so a wide-but-
  // short cell doesn't get billboard type just because it is wide.
  const b = Math.min(w, hCap * 0.8);

  // Horizontal affordances stay keyed to real width — a 673px-wide card has
  // room for a description regardless of how short the cell is.
  const showDescription = w >= 190;
  const descLines = w >= 320 ? 2 : 1;

  const nameSize = px(clamp(b * 0.105, 15, 64));
  const nameLineHeight = px(nameSize * 1.25);

  const descSize = px(clamp(b * 0.078, 13, 34));
  const descLineHeight = px(descSize * 1.35);

  return {
    cardWidth: w,
    radius: px(clamp(b * 0.07, 12, 32)),
    padH: px(clamp(b * 0.055, 10, 28)),
    padV: px(clamp(b * 0.045, 9, 22)),
    gap: px(clamp(b * 0.022, 4, 12)),
    imageHeight: px(Math.min(w * 0.72, hCap * 0.56)),
    placeholderSize: px(clamp(Math.min(w, hCap) * 0.3, 32, 200)),
    nameSize,
    nameLineHeight,
    // Always reserve two lines so one- and two-line names sit on the same
    // baseline grid across rows.
    nameBlockHeight: nameLineHeight * 2,
    descSize,
    descLineHeight,
    descLines,
    descBlockHeight: showDescription ? descLineHeight * descLines : 0,
    showDescription,
    priceSize: px(clamp(b * 0.115, 16, 68)),
    showOptionsLabel: w >= 240,
    optionsIconSize: px(clamp(b * 0.055, 12, 34)),
    optionsTextSize: px(clamp(b * 0.055, 11, 30)),
    badgeIconSize: px(clamp(b * 0.06, 12, 36)),
    badgeTextSize: px(clamp(b * 0.062, 12, 36)),
  };
}
