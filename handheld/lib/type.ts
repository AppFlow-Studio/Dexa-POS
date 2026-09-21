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
});
