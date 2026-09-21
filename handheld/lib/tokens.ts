import { colors } from "@/lib/theme";

/** "#adc6ff" + 0.15 → "rgba(173,198,255,0.15)". Hex only; falls back to the input. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Translucent layers from the Dexa Go artifact, derived from the active
 * palette so they follow the light/dark switch. In dark mode they resolve to
 * the artifact's literal values (teal #adc6ff → rgba(173,198,255,.15),
 * border #2A3050 → rgba(42,48,80,.85)). Getters because `colors` is a proxy.
 */
export const tint = {
  get accentSoft() {
    return withAlpha(colors.teal, 0.15);
  },
  get selectedRow() {
    return withAlpha(colors.teal, 0.07);
  },
  get divider() {
    return withAlpha(colors.border, 0.85);
  },
  get warnSoft() {
    return withAlpha(colors.warning, 0.12);
  },
  get warnIcon() {
    return withAlpha(colors.warning, 0.16);
  },
  get okSoft() {
    return withAlpha(colors.success, 0.14);
  },
  get errSoft() {
    return withAlpha(colors.danger, 0.14);
  },
  get infoSoft() {
    return withAlpha(colors.info, 0.16);
  },
  scrim: "rgba(3,5,10,0.62)",
};

/** A 48dp tile's background + foreground pair. */
export interface Tint {
  bg: string;
  fg: string;
}

/** The artifact's dark-mode tile tints, verbatim. */
export const TABLE_TINT_DARK = {
  available: { bg: "rgba(45,158,122,0.2)", fg: "#5ED3A7" },
  seated: { bg: "rgba(61,111,168,0.26)", fg: "#8DB5EA" },
  ordered: { bg: "rgba(184,106,46,0.24)", fg: "#EFA76B" },
  check: { bg: "rgba(124,77,160,0.28)", fg: "#C79DEA" },
  paid: { bg: "rgba(176,64,64,0.26)", fg: "#F29090" },
  over: { bg: "rgba(193,125,42,0.26)", fg: "#F4B766" },
} as const satisfies Record<string, Tint>;

export const ORDER_TINT_DARK = {
  takeout: { bg: "rgba(59,130,246,0.22)", fg: "#8AB8F8" },
  dine_in: { bg: "rgba(217,119,6,0.22)", fg: "#EFB055" },
  delivery: { bg: "rgba(34,197,94,0.2)", fg: "#68D89B" },
} as const satisfies Record<string, Tint>;

/** Light mode has no artifact: the solid status colour on a 16% wash of itself. */
export function lightTint(solid: string): Tint {
  return { bg: withAlpha(solid, 0.16), fg: solid };
}

/** Cleaning / blocked / out of service: no tint in the artifact, so neutral. */
export function neutralTint(): Tint {
  return { bg: colors.card, fg: colors.muted };
}

/** Row and tile geometry from the artifact, in dp. */
export const metrics = {
  row: 76,
  tile: 48,
  tileRadius: 15,
  gap: 14,
  px: 16,
  /** Divider starts after the tile: px + tile + gap. */
  dividerInset: 78,
  header: 80,
  bar: 64,
  nav: 84,
  button: 56,
  textButton: 44,
  sheetRadius: 28,
} as const;
