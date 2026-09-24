/**
 * Screen-proportional layout constants shared by the kiosk menu templates.
 *
 * These are the few dimensions that should track the *screen*, not the UI
 * scale: a sidebar that's a fixed multiple of the scale can swallow half a
 * short landscape panel, and a media banner sized the same way can push the
 * grid off the bottom entirely. Expressing them as a fraction of the real
 * viewport keeps every panel size sane.
 */

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Below this short edge the kiosk is running on a handheld — a phone, in
 * either orientation. 600dp is Android's own phone/tablet line (the `sw600dp`
 * resource qualifier), so this agrees with how the OS classifies the device.
 */
export const KIOSK_HANDHELD_SHORT_EDGE = 600;

export function isKioskHandheld(width: number, height: number): boolean {
  return Math.min(width, height) < KIOSK_HANDHELD_SHORT_EDGE;
}

/**
 * Whether the menu can afford a category rail beside the grid.
 *
 * Keyed to width alone: a landscape phone is short but wide, and there the
 * rail costs width it has to spare, where a strip across the top would cost
 * the height it has least of. A portrait phone is the opposite — a third of
 * 360dp is a rail too narrow to read and a grid too narrow to hold a card — so
 * it gets the horizontal strip instead.
 */
export function kioskUsesCategoryRail(windowWidth: number): boolean {
  return windowWidth >= KIOSK_HANDHELD_SHORT_EDGE;
}

/**
 * Narrowest a menu card may render. Below this a two-line name no longer fits
 * beside the card's padding at the 16px type floor (see kioskCardMetrics).
 */
export const KIOSK_MIN_CARD_WIDTH = 128;

/**
 * The column count the grid can actually honour: the requested count, stepped
 * down until each card clears `KIOSK_MIN_CARD_WIDTH`.
 *
 * "Items per row" is the manager's ceiling, not a promise the panel can
 * always keep — four columns in a phone's 360dp would be 80dp slivers
 * overlapping each other. Stepping down reflows the grid instead. It can reach
 * one column, which is the feature row, built for exactly that width.
 *
 * The cell arithmetic mirrors KioskItemGrid: the content container is inset by
 * `padding − gap/2` and each multi-column cell carries half a gap either side.
 */
export function kioskFitColumns(
  requested: number,
  gridWidth: number,
  padding: number,
  gap: number,
): number {
  for (let cols = Math.max(1, requested); cols > 1; cols -= 1) {
    const contentPadH = padding - gap / 2;
    const cardWidth = (gridWidth - contentPadH * 2) / cols - gap;
    if (cardWidth >= KIOSK_MIN_CARD_WIDTH) return cols;
  }
  return 1;
}

/**
 * Side of each square tile on the Dine In / Takeaway screen.
 *
 * On a panel the short edge bounds it; on a phone the width does too — two
 * tiles, the gap between them and the screen's side padding all have to fit
 * across 360dp, which the old 200dp floor made impossible.
 */
export function kioskOrderTypeTileSize(
  width: number,
  height: number,
  scale: number,
): number {
  const shortEdge = Math.min(width, height);
  const sidePadding = 40 * scale;
  const gap = 36 * scale;
  // Floored: rounding this term up overflows the row by a fraction of a dp.
  const widthFit = Math.floor((width - sidePadding * 2 - gap) / 2);
  return Math.round(
    Math.max(0, Math.min(shortEdge * 0.38, 420 * scale, widthFit)),
  );
}

/**
 * Width of the category rail, as a percentage string for the flex parent.
 *
 * Tracks the manager's items-per-row setting: more columns means the grid
 * needs the width more than the rail does, so the rail gives some back. This
 * is what keeps a 4-column portrait layout from squeezing cards into slivers
 * beside an over-wide sidebar.
 *
 * Below two columns the relationship stops holding — a single feature row per
 * line wants *more* width for its copy and photo, not less — so one column
 * keeps the two-column base rather than inverting the formula into a wider rail.
 */
export function kioskRailWidth(
  isVertical: boolean,
  numColumns: number,
): `${number}%` {
  const base = isVertical ? 34 : 26;
  const pct = clamp(base - Math.max(0, numColumns - 2) * 3.5, 18, 36);
  return `${pct}%`;
}

/**
 * Height of the menu-screen media banner (Templates B and C, vertical only).
 * A quarter of the viewport reads as a hero strip on a 1080x1920 panel without
 * crowding out the rail and grid below it. The floor only binds on a phone,
 * where a taller one would take the grid's second row.
 */
export function kioskBannerHeight(screenHeight: number): number {
  return Math.round(clamp(screenHeight * 0.24, 140, 620));
}

/**
 * Height of the item-detail hero (photo) band in portrait orientation.
 * A third of the viewport — big enough that the product photo sells the item,
 * small enough that the name, price and first modifier group are all still
 * above the fold.
 */
export function kioskDetailHeroHeight(screenHeight: number): number {
  return Math.round(screenHeight / 3);
}

/**
 * Where the "View Cart" control lives on the menu screen.
 *
 * One property, one placement, never both: a floating bottom-right button on a
 * short landscape panel sits on top of the last tile row and hides the item's
 * name and price, which is the single worst overlap on the screen. Landscape
 * therefore moves the cart into the header, where it has a slot of its own.
 * Portrait keeps the floating button — there the grid is tall, the button
 * clears it, and the header has no width to spare beside the logo.
 */
export type KioskCartPlacement = "header" | "bottomBar";

export function kioskCartPlacement(isVertical: boolean): KioskCartPlacement {
  return isVertical ? "bottomBar" : "header";
}

/**
 * The kiosk header's own height, and the height every control inside it
 * shares — search, Start Over and the cart pill are one matched set, so the
 * number lives in one place rather than being repeated per control.
 *
 * Kept as tight as the controls allow. The header still occupies its own row
 * (it is not an overlay — the menu must never scroll underneath it), but every
 * dp it does not need is a dp the item grid does, and on a short landscape
 * panel that is the difference between the second tile row clearing the fold
 * and being clipped at its description.
 */
export const KIOSK_HEADER_CONTROL_HEIGHT = 52;
export const KIOSK_HEADER_HEIGHT = 72;

/**
 * The item grid's outer inset.
 *
 * Exported because a control strip sitting directly above the grid has to know
 * it: the grid opens with this much clear space, so a strip that also pads its
 * own underside puts twice the gap below the control as above it, and the
 * selected tab reads as hanging off the divider line rather than sitting in a
 * row. The strip subtracts this from its bottom padding — see
 * KioskCategoryPillBar.
 */
export const KIOSK_GRID_INSET = 16;
