/**
 * Card surface colours for the kiosk menu.
 *
 * Kiosk menu cards used to be painted in `config.backgroundColor` — the same
 * colour as the page — and separated from it by a hairline border alone. That
 * reads as a wireframe rather than a menu: on a large panel viewed from a few
 * feet away the 1px border is the only thing saying "this is a tappable item".
 * Cards now sit a perceptible step off the page.
 *
 * The step is **a solid colour, not a translucent overlay**: one derived hex
 * reads the same on every card and under every photo, where an alpha fill
 * would pick up whatever sits behind it.
 *
 * Direction is chosen from the page's own lightness, because kiosk themes are
 * merchant-configured and may be light or dark: you cannot go lighter than
 * white, so a light page steps its cards down and a dark page steps them up.
 * Dark themes need the larger step — the same delta is much less visible near
 * black.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(color: string): Rgb | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) {
    hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Perceived lightness, 0–1. Good enough to pick a direction; not a WCAG ratio. */
function lightness({ r, g, b }: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** How far a card steps off the page. Dark pages need more to read the same. */
const LIGHT_PAGE_STEP = 0.05;
const DARK_PAGE_STEP = 0.09;

/**
 * Solid fill for a menu card on `backgroundColor`.
 *
 * Falls back to the page colour unchanged for any colour format this can't
 * parse — a card that matches the page is the old look, which is plain but
 * never wrong. Kiosk theme colours are `#RRGGBB` throughout (the profile editor
 * writes hex), so the fallback is a guard, not a path.
 */
export function kioskCardSurface(backgroundColor: string): string {
  const rgb = parseHex(backgroundColor);
  if (!rgb) return backgroundColor;
  const isLight = lightness(rgb) > 0.5;
  return toHex(
    mix(rgb, isLight ? BLACK : WHITE, isLight ? LIGHT_PAGE_STEP : DARK_PAGE_STEP),
  );
}
