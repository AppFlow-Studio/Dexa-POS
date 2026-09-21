import { colors } from "@/lib/theme";

/**
 * Handheld-only tints from the Dexa Go artifact. The solid colours (screen,
 * panel, card, heading, teal, warning…) are the app's own dark palette in
 * lib/theme-colors.js, token for token; these are the translucent layers the
 * artifact builds on top of them. Dark-tuned: the artifact is drawn dark only.
 */
export const tint = {
  accentSoft: "rgba(173,198,255,0.15)",
  selectedRow: "rgba(173,198,255,0.07)",
  divider: "rgba(42,48,80,0.85)",
  scrim: "rgba(3,5,10,0.62)",
  warnSoft: "rgba(251,191,36,0.12)",
  warnIcon: "rgba(251,191,36,0.16)",
  okSoft: "rgba(52,211,153,0.14)",
  errSoft: "rgba(248,113,113,0.14)",
  infoSoft: "rgba(96,165,250,0.16)",
  onSolidDim: "rgba(12,15,26,0.7)",
} as const;

/** A 48dp tile's background + foreground pair. */
export interface Tint {
  bg: string;
  fg: string;
}

export const TABLE_TINT = {
  available: { bg: "rgba(45,158,122,0.2)", fg: "#5ED3A7" },
  seated: { bg: "rgba(61,111,168,0.26)", fg: "#8DB5EA" },
  ordered: { bg: "rgba(184,106,46,0.24)", fg: "#EFA76B" },
  check: { bg: "rgba(124,77,160,0.28)", fg: "#C79DEA" },
  paid: { bg: "rgba(176,64,64,0.26)", fg: "#F29090" },
  over: { bg: "rgba(193,125,42,0.26)", fg: "#F4B766" },
} as const satisfies Record<string, Tint>;

export const ORDER_TINT = {
  takeout: { bg: "rgba(59,130,246,0.22)", fg: "#8AB8F8" },
  dine_in: { bg: "rgba(217,119,6,0.22)", fg: "#EFB055" },
  delivery: { bg: "rgba(34,197,94,0.2)", fg: "#68D89B" },
} as const satisfies Record<string, Tint>;

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
  nav: 84,
  button: 56,
  textButton: 44,
  sheetRadius: 28,
} as const;
