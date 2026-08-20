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
 */
export function kioskRailWidth(
  isVertical: boolean,
  numColumns: number,
): `${number}%` {
  const base = isVertical ? 34 : 26;
  const pct = clamp(base - (numColumns - 2) * 3.5, 18, 36);
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
