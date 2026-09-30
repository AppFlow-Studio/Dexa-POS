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
import { kioskTypeSize } from "@/components/kiosk/shared/kioskDesign";

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
  /** Lines the name may wrap to — 1 only when the budget cannot seat two. */
  nameLines: number;
  /**
   * Height budgeted for the name at its worst case (`nameLines` full lines).
   *
   * A budget, not a rendered height: the card sets no fixed height on its
   * copy, so a one-line name in a two-line budget gives the difference back to
   * the photo rather than leaving a blank line above the description.
   */
  nameBlockHeight: number;
  descSize: number;
  descLineHeight: number;
  descLines: number;
  /** Same contract as `nameBlockHeight` — a worst case, not a fixed height. */
  descBlockHeight: number;
  /** Below this width the description is dropped rather than truncated to mush. */
  showDescription: boolean;
  priceSize: number;
  badgeIconSize: number;
  badgeTextSize: number;
  /** Fixed height for the price row, so the card total is exact. */
  priceRowHeight: number;
  /**
   * Exact rendered height of the whole card.
   *
   * Every block above is budgeted at its worst case, so this is a sum, not an
   * estimate — which is what lets `KioskItemGrid` hand FlashList a real size
   * through `overrideItemLayout` instead of a guess it would have to correct
   * after measuring. The card holds this height exactly: copy that comes out
   * shorter than its budget is absorbed by the photo, which is the card's one
   * flexible block. Nothing may be added that this sum doesn't account for.
   */
  cardHeight: number;
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

/**
 * The least of a card the photo is allowed to be. Below this the card drops a
 * line of copy instead — on a menu the photograph is what is being sold.
 */
const MIN_IMAGE_SHARE = 0.42;

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
  badgeIconSize: number;
  badgeTextSize: number;
  /** Fixed height for the price row, so the card total is exact. */
  priceRowHeight: number;
  /**
   * Exact rendered height of the whole row card — the taller of its image and
   * its copy column, plus padding. Same contract as `KioskCardMetrics.cardHeight`:
   * a real size for FlashList, not an estimate.
   */
  rowHeight: number;
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

  const nameSize = kioskTypeSize(textWidth * 0.085, 16, 52);
  const descSize = kioskTypeSize(textWidth * 0.06, 13, 28);

  const gap = px(clamp(textWidth * 0.02, 4, 14));
  const nameLineHeight = px(nameSize * 1.2);
  const descLineHeight = px(descSize * 1.4);
  const descLines = 2;
  const showDescription = textWidth >= 200;
  const priceSize = nameSize;
  const priceRowHeight = px(priceSize * 1.3);

  // The copy column, worst case: a two-line name, the description if it shows,
  // and the price row. The column's own `gap` sits between each pair, and the
  // price row adds one more as its `marginTop`.
  const copyHeight =
    nameLineHeight * 2 +
    (showDescription ? descLineHeight * descLines + gap : 0) +
    gap * 2 +
    priceRowHeight;

  return {
    imageSize,
    pad,
    gap,
    radius: px(clamp(imageSize * 0.14, 12, 32)),
    imageRadius: px(clamp(imageSize * 0.1, 10, 26)),
    placeholderSize: px(clamp(imageSize * 0.36, 28, 110)),
    nameSize,
    nameLineHeight,
    descSize,
    descLineHeight,
    descLines,
    showDescription,
    priceSize,
    badgeIconSize: px(clamp(imageSize * 0.14, 12, 32)),
    badgeTextSize: px(clamp(imageSize * 0.145, 12, 32)),
    priceRowHeight,
    // Whichever column is taller sets the card. The image usually wins, but a
    // narrow cell with a long description can invert that, and sizing to the
    // image alone would clip the copy.
    rowHeight: px(Math.max(imageSize, copyHeight) + pad * 2),
  };
}

/** Metrics for the feature row (full-width: copy left, square photo right). */
export interface KioskFeatureRowMetrics {
  height: number;
  /** Side of the square photo, inset at the right of the row. */
  imageSize: number;
  imageRadius: number;
  /** Inset on every side of the row, and the gutter between copy and photo. */
  pad: number;
  gap: number;
  /** Concentric with the photo: its radius plus the inset around it. */
  radius: number;
  placeholderSize: number;
  nameSize: number;
  nameLineHeight: number;
  /** Lines the name may wrap to — 2 only when the band has room for both. */
  nameLines: number;
  descSize: number;
  descLineHeight: number;
  descLines: number;
  showDescription: boolean;
  priceSize: number;
  priceRowHeight: number;
  badgeTextSize: number;
  /** Width of the copy column, left of the photo. */
  textWidth: number;
}

/**
 * Copy shapes for the feature row, best first. The name matters more than the
 * description on a menu, so lines come off the description before the name; a
 * one-line name is a last resort, since truncating a dish name mid-word is
 * worse than dropping its blurb.
 */
const FEATURE_ROW_COPY_SHAPES: { nameLines: number; descLines: number }[] = [
  { nameLines: 2, descLines: 2 },
  { nameLines: 2, descLines: 1 },
  { nameLines: 2, descLines: 0 },
  { nameLines: 1, descLines: 1 },
  { nameLines: 1, descLines: 0 },
];

/**
 * Feature-row metrics — the one-item-per-row layout.
 *
 * Unlike the grid cards this row owns its own height: at one column the cell
 * would otherwise inherit the entire grid height budget. Height is derived from
 * width (a fixed ratio reads as a wide band at every panel size) and only
 * capped by the grid's budget on unusually short viewports.
 *
 * The photo is a square inset inside the row, one `pad` from every edge, and
 * the copy takes the rest of the width beside it. Type is sized from that copy
 * column, bounded by the row's height so a squat row doesn't get headline type
 * just because it is wide.
 *
 * The copy shape (how many lines the name and description each get) is then
 * *solved* against the height that's left, not guessed: the band clips, so a
 * line count the band can't afford crops a name mid-glyph on exactly the items
 * with the longest names. Both counts are returned, and the card must apply
 * them as `numberOfLines` — that is what keeps the fit honest.
 */
export function kioskFeatureRowMetrics(
  cardWidth: number,
  maxCardHeight?: number,
): KioskFeatureRowMetrics {
  const w = Math.max(240, cardWidth);
  const hCap = maxCardHeight && maxCardHeight > 0 ? maxCardHeight : Infinity;
  // 0.27 of the width. Tuned down from a third: a band that deep only fits ~4
  // items on a portrait panel, which reads as a stack of posters rather than a
  // menu you can scan.
  const height = px(Math.min(clamp(w * 0.27, 132, 420), hCap));

  const pad = px(clamp(height * 0.1, 10, 32));
  const imageSize = height - pad * 2;
  const imageRadius = px(clamp(imageSize * 0.12, 10, 28));
  const gap = px(clamp(height * 0.035, 4, 14));

  // Row inset, the photo, and the gutter between them.
  const textWidth = Math.max(120, w - pad * 3 - imageSize);

  const nameSize = kioskTypeSize(
    Math.min(textWidth * 0.065, height * 0.152),
    16,
    46,
  );
  const nameLineHeight = px(nameSize * 1.2);
  const descSize = kioskTypeSize(
    Math.min(textWidth * 0.04, height * 0.1),
    13,
    28,
  );
  const descLineHeight = px(descSize * 1.4);
  const priceSize = nameSize;
  const priceRowHeight = px(priceSize * 1.3);

  // Solve the copy shape against the height actually available. One gap sits
  // between every pair of visible blocks.
  const copyBudget = height - pad * 2 - priceRowHeight;
  const shape =
    FEATURE_ROW_COPY_SHAPES.find(
      (s) =>
        s.nameLines * nameLineHeight +
          s.descLines * descLineHeight +
          gap * (s.descLines > 0 ? 2 : 1) <=
        copyBudget,
    ) ?? FEATURE_ROW_COPY_SHAPES[FEATURE_ROW_COPY_SHAPES.length - 1];

  return {
    height,
    imageSize,
    imageRadius,
    pad,
    gap,
    radius: imageRadius + pad,
    placeholderSize: px(clamp(imageSize * 0.36, 28, 110)),
    nameSize,
    nameLineHeight,
    nameLines: shape.nameLines,
    descSize,
    descLineHeight,
    descLines: shape.descLines,
    showDescription: shape.descLines > 0 && textWidth >= 150,
    priceSize,
    priceRowHeight,
    badgeTextSize: px(clamp(imageSize * 0.12, 12, 30)),
    textWidth,
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

  // Snapped onto the shared scale rather than taken straight off the width, so
  // a 218dp card and a 295dp card either share a size or differ by a real step
  // — never by a pixel and a half.
  const nameSize = kioskTypeSize(b * 0.086, 16, 64);
  const nameLineHeight = px(nameSize * 1.2);

  const descSize = kioskTypeSize(b * 0.064, 13, 32);
  const descLineHeight = px(descSize * 1.4);

  const padV = px(clamp(b * 0.05, 10, 24));
  const gap = px(clamp(b * 0.022, 4, 12));
  // The name leads the card; the price matches it rather than shouting over
  // it, and the weight and position do the rest.
  const priceSize = nameSize;
  const priceRowHeight = px(priceSize * 1.3);

  // The copy column: top padding, the text blocks with a gap between each
  // pair, the price row, and the slightly heavier bottom padding the card
  // uses to seat the price optically. Every block is a fixed height, so this
  // is exact for any shape.
  const copyHeightFor = (nameLines: number, descLines: number) =>
    padV +
    nameLineHeight * nameLines +
    gap +
    (descLines > 0 ? descLineHeight * descLines + gap : 0) +
    priceRowHeight +
    px(padV * 1.2);

  // Horizontal affordances stay keyed to real width — a 673px-wide card has
  // room for a description regardless of how short the cell is.
  const maxDescLines = w >= 190 ? (w >= 320 ? 2 : 1) : 0;

  // Solve the copy shape against the height available, best first, the way the
  // feature row does. A card whose budget cannot seat both the copy and a
  // photo worth looking at gives up a line of copy rather than squeezing the
  // photo into a strip — a cramped tile with four lines of text over a sliver
  // of image is the worst of both, and it is exactly what a tight grid used to
  // produce. Lines come off the description before the name, and a one-line
  // name is the last resort.
  const shapes: { nameLines: number; descLines: number }[] = [];
  for (let d = maxDescLines; d >= 0; d -= 1) {
    shapes.push({ nameLines: 2, descLines: d });
  }
  shapes.push({ nameLines: 1, descLines: 0 });

  const shape =
    shapes.find(
      (s) =>
        hCap - copyHeightFor(s.nameLines, s.descLines) >= hCap * MIN_IMAGE_SHARE,
    ) ?? shapes[shapes.length - 1];

  const showDescription = shape.descLines > 0;
  const descLines = shape.descLines;
  const nameBlockHeight = nameLineHeight * shape.nameLines;
  const descBlockHeight = showDescription ? descLineHeight * descLines : 0;
  const copyHeight = copyHeightFor(shape.nameLines, shape.descLines);

  // The photo takes what the copy's *budget* leaves over, rather than a fixed
  // share of the width that the copy is then stacked on top of. At render time
  // it takes back the rest too, wherever the copy underruns its budget. That distinction is what
  // makes `maxCardHeight` a *whole-card* budget: the grid hands down half its
  // own height, and two rows of cards then genuinely fit above the fold on any
  // panel, instead of two rows plus however tall the copy happened to come out.
  //
  // The floor stops a cramped budget from collapsing the photo to nothing, and
  // is itself held under the cap — a width-derived floor on a wide, short cell
  // would otherwise reach straight back through the height limit it exists
  // beneath.
  const imageCap = Math.min(w * 0.82, hCap * 0.56);
  const imageFloor = Math.min(imageCap, w * 0.38);
  const imageHeight = px(
    Math.max(imageFloor, Math.min(imageCap, hCap - copyHeight)),
  );

  const cardHeight = imageHeight + copyHeight;

  return {
    cardWidth: w,
    radius: px(clamp(b * 0.07, 12, 32)),
    padH: px(clamp(b * 0.055, 10, 28)),
    padV,
    gap,
    imageHeight,
    placeholderSize: px(clamp(Math.min(w, hCap) * 0.3, 32, 200)),
    nameSize,
    nameLineHeight,
    nameLines: shape.nameLines,
    // A fixed reservation, so one- and two-line names sit on the same baseline
    // grid across a row. The card must apply `nameLines` as `numberOfLines`,
    // or a long name would overrun the block this sum accounts for.
    nameBlockHeight,
    descSize,
    descLineHeight,
    descLines,
    descBlockHeight,
    showDescription,
    priceSize,
    badgeIconSize: px(clamp(b * 0.06, 12, 36)),
    badgeTextSize: px(clamp(b * 0.062, 12, 36)),
    priceRowHeight,
    cardHeight,
  };
}
