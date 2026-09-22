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
 * crowding out the rail and grid below it.
 */
export function kioskBannerHeight(screenHeight: number): number {
  return Math.round(clamp(screenHeight * 0.24, 200, 620));
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
