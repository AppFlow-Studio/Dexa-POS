import { kioskCardSurface } from "@/components/kiosk/shared/kioskSurface";
import type { KioskConfig } from "@/types/kiosk";
import * as Font from "expo-font";
import { useMemo } from "react";
import { Easing } from "react-native-reanimated";

/**
 * The kiosk's design system: type scale, shape, colour tokens and motion.
 *
 * Everything the customer-facing kiosk draws should come from here rather than
 * from arithmetic at the call site. Three things went wrong when it didn't:
 *
 *  - **Type was continuous.** Sizes were `cardWidth * ratio`, so a 218dp card
 *    got 19px and a 295dp card got 25px and no two layouts ever shared a size.
 *    Continuous type reads as generated, not designed. Sizes now snap to a
 *    fixed scale, so the whole kiosk speaks in a dozen sizes and they relate to
 *    each other.
 *  - **Everything was a pill.** `borderRadius: 999` on every control is the
 *    single loudest "stock Android" signal a UI can send. Radius is now a
 *    small token set, and full-round is reserved for things that are actually
 *    round — a count badge, a photo-less avatar.
 *  - **Colour was one hex at N opacities.** `${accent}33` for every border and
 *    `${text}99` for every muted label meant every surface carried the same
 *    weight. The tokens below are semantic, so a border can be changed once and
 *    a card can differ from a field.
 */

// ─── Type ────────────────────────────────────────────────────────────

/**
 * The only sizes the kiosk sets. Roughly a 1.125–1.15 ratio at reading sizes,
 * opening up toward display sizes where the steps need to be further apart to
 * read as deliberate.
 */
const TYPE_SCALE = [
  12, 13, 14, 16, 18, 20, 22, 25, 28, 32, 36, 41, 46, 52, 58, 64,
] as const;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Snap a width-derived size onto the scale, bounded by two of its own steps.
 *
 * Still responsive — a wider card really does step up — but it can only land
 * on a size the rest of the kiosk also uses.
 */
export function kioskTypeSize(
  preferred: number,
  minStep: number,
  maxStep: number,
): number {
  const target = clamp(preferred, minStep, maxStep);
  let best: number = TYPE_SCALE[0];
  for (const step of TYPE_SCALE) {
    if (step < minStep || step > maxStep) continue;
    if (Math.abs(step - target) < Math.abs(best - target)) best = step;
  }
  return clamp(best, minStep, maxStep);
}

/**
 * Optical tracking. Grotesks set at display sizes look loose at their default
 * spacing; below reading size they need a touch more room, not less.
 */
export function kioskTracking(size: number): number {
  if (size >= 36) return -1;
  if (size >= 25) return -0.6;
  if (size >= 18) return -0.2;
  return 0;
}

// ─── Shape ───────────────────────────────────────────────────────────

/**
 * Corner radii. Controls are squarer than containers, which is the opposite of
 * a Material chip sheet and most of why this stops looking like one.
 */
export const kioskRadius = {
  /** Count badges, dots. */
  xs: 6,
  /** Inline controls — buttons, fields, tabs. */
  sm: 10,
  /** Larger controls and thumbnails. */
  md: 14,
  /** Cards and sheets. */
  lg: 20,
  /** Modals and the item popup. */
  xl: 28,
} as const;

/** Hairline weight. One value, so no two borders differ by accident. */
export const KIOSK_HAIRLINE = 1;

// ─── Motion ──────────────────────────────────────────────────────────

/**
 * Short, flat, and without overshoot.
 *
 * Springs with low damping were the other half of the Android read: bounce is
 * playful, and a kiosk that bounces looks like a toy rather than a till. Press
 * feedback is a small, fast dip; entrances are a fade with a few pixels of
 * travel.
 */
export const kioskMotion = {
  instant: 120,
  fast: 160,
  base: 200,
  slow: 260,
  easing: Easing.out(Easing.cubic),
} as const;

// ─── Colour and type faces ───────────────────────────────────────────

const FONT_MEDIUM = "Inter-Medium";
const FONT_BOLD = "Inter-Bold";

export interface KioskTheme {
  /** The page itself. */
  page: string;
  /** A card or panel sitting on the page. */
  surface: string;
  /** An inset control on a surface — a field, a well. */
  sunken: string;
  /** Hairline between surfaces. */
  outline: string;
  /** Hairline that has to be seen — a control's edge. */
  outlineStrong: string;
  text: string;
  /** Supporting copy. */
  textMuted: string;
  /** Disabled, or a glyph that is decoration. */
  textFaint: string;
  primary: string;
  onPrimary: string;
  accent: string;
  /** Behind a modal. */
  scrim: string;
  /** Undefined until the faces have loaded; callers fall back to weights. */
  fontRegular?: string;
  fontBold?: string;
}

/**
 * Semantic tokens for one merchant's theme.
 *
 * Derived from the four colours a merchant configures, so a kiosk still looks
 * like their shop — what changes is that the derivation happens once, here,
 * instead of being re-guessed as an alpha suffix at two hundred call sites.
 */
export function useKioskTheme(config: KioskConfig): KioskTheme {
  const hasFaces = Font.isLoaded(FONT_MEDIUM) && Font.isLoaded(FONT_BOLD);

  return useMemo(
    () => ({
      page: config.backgroundColor,
      surface: kioskCardSurface(config.backgroundColor),
      sunken: `${config.textColor}0A`,
      outline: `${config.textColor}12`,
      outlineStrong: `${config.textColor}24`,
      text: config.textColor,
      textMuted: `${config.textColor}99`,
      textFaint: `${config.textColor}55`,
      primary: config.primaryColor,
      onPrimary: "#FFFFFF",
      accent: config.accentColor,
      scrim: "rgba(12,12,14,0.55)",
      fontRegular: hasFaces ? FONT_MEDIUM : undefined,
      fontBold: hasFaces ? FONT_BOLD : undefined,
    }),
    [
      config.backgroundColor,
      config.textColor,
      config.primaryColor,
      config.accentColor,
      hasFaces,
    ],
  );
}

/**
 * Face or weight, whichever this build has.
 *
 * Only two faces ship (Medium and Bold) because at kiosk reading distance
 * nothing lighter is legible and nothing between them is distinguishable. When
 * they haven't loaded, this falls back to synthetic weights rather than
 * referencing a family that isn't there.
 */
export function kioskFont(
  theme: KioskTheme,
  weight: "regular" | "bold" = "regular",
): { fontFamily: string } | { fontWeight: "500" | "700" } {
  const family = weight === "bold" ? theme.fontBold : theme.fontRegular;
  if (family) return { fontFamily: family };
  return { fontWeight: weight === "bold" ? "700" : "500" };
}
