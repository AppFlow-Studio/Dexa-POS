import { StyleSheet } from "react-native";

/**
 * Type ramp from the artifact (Roboto, which is Android's default font). Sizes
 * are dp; RN's own font scaling still multiplies them, so every container that
 * holds text uses a min-height, never a fixed one. Colours are applied at the
 * call site because `colors` is theme-aware.
 */
export const type = StyleSheet.create({
  /** Root header title — 30/700, tight tracking. */
  title: { fontSize: 30, fontWeight: "700", lineHeight: 33, letterSpacing: -0.6 },
  /** Root header subtitle and row detail lines — 14/400. */
  detail: { fontSize: 14, lineHeight: 19 },
  /** Pushed page header (`.bar-t`) — 20/500 with a 13dp line under it. */
  pageTitle: { fontSize: 20, fontWeight: "500", lineHeight: 24 },
  pageSubtitle: { fontSize: 13, lineHeight: 17 },
  /** Section labels ("Needs you"), segment labels, chips — 14–15/500. */
  label: { fontSize: 14, fontWeight: "500", lineHeight: 19 },
  segment: { fontSize: 15, fontWeight: "500", lineHeight: 20 },
  /** Row title — 17/500. */
  row: { fontSize: 17, fontWeight: "500", lineHeight: 23 },
  /** Right-aligned row value ($) and button labels — 16/500 tabular. */
  value: { fontSize: 16, fontWeight: "500", lineHeight: 22, fontVariant: ["tabular-nums"] },
  button: { fontSize: 16, fontWeight: "500", lineHeight: 22, letterSpacing: 0.16 },
  /** Table tile number — 18/600 tabular. */
  tile: { fontSize: 18, fontWeight: "600", lineHeight: 24, fontVariant: ["tabular-nums"] },
  /** Sheet title / description — 24/600, 15/400. */
  sheetTitle: { fontSize: 24, fontWeight: "600", lineHeight: 29, letterSpacing: -0.24 },
  sheetDesc: { fontSize: 15, lineHeight: 20 },
  /** Card header / line item — 17/600, 16/500, 14 muted, 16 tabular. */
  cardTitle: { fontSize: 17, fontWeight: "600", lineHeight: 23 },
  line: { fontSize: 16, fontWeight: "500", lineHeight: 22 },
  lineQty: { fontSize: 16, fontWeight: "600", lineHeight: 22, fontVariant: ["tabular-nums"] },
  price: { fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
  /** Totals — 15 rows, 18/600 total. */
  sum: { fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  sumTotal: { fontSize: 18, fontWeight: "600", lineHeight: 24, fontVariant: ["tabular-nums"] },
  /** Nav labels, badges, chips, hints. */
  nav: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  badge: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
  chip: { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  hint: { fontSize: 13, lineHeight: 18 },
  avatar: { fontSize: 14, fontWeight: "600", lineHeight: 18 },
  /** Keypad keys — 22/500 (52dp) and 24/500 (64dp). */
  key: { fontSize: 22, fontWeight: "500", lineHeight: 28, fontVariant: ["tabular-nums"] },
  keyBig: { fontSize: 24, fontWeight: "500", lineHeight: 30, fontVariant: ["tabular-nums"] },
  /** Centred message screens — 24/600 + 16. */
  message: { fontSize: 24, fontWeight: "600", lineHeight: 30, letterSpacing: -0.36 },
  messageDesc: { fontSize: 16, lineHeight: 24 },

  // Payment, screens 6-9. The artifact sets letter-spacing in em; these are
  // the dp equivalents at each size, the same conversion `title` uses
  // (30px x -.02em = -0.6).
  /** `.hero-a .n` / `.tipt .n` — 54/700 at -.035em. */
  hero: { fontSize: 54, fontWeight: "700", lineHeight: 59, letterSpacing: -1.89, fontVariant: ["tabular-nums"] },
  /** `.hero-a .k` 15 on screen 6; `.tipt .k` is 17 on the guest-facing tip screen. */
  heroLabel: { fontSize: 15, lineHeight: 20 },
  tipLabel: { fontSize: 17, lineHeight: 23 },
  /** `.hero-a .d` / `.tipt .d` — 14 muted, under the figure. */
  heroNote: { fontSize: 14, lineHeight: 19, fontVariant: ["tabular-nums"] },
  /** `.op .t` — 18/600 payment-method title. */
  optionTitle: { fontSize: 18, fontWeight: "600", lineHeight: 24 },
  /** `.tp .p` 28/600 at -.02em, with `.tp .v` 15 under it. */
  tipPercent: { fontSize: 28, fontWeight: "600", lineHeight: 34, letterSpacing: -0.56 },
  tipValue: { fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  /** `.okh .n` — 48/700 at -.035em, with `.okh .d` 15 under it. */
  successAmount: { fontSize: 48, fontWeight: "700", lineHeight: 53, letterSpacing: -1.68, fontVariant: ["tabular-nums"] },
  successNote: { fontSize: 15, lineHeight: 20 },
  /** `.lbl` — 15/500 centred section label ("Send a receipt"). */
  lbl: { fontSize: 15, fontWeight: "500", lineHeight: 20 },
});
