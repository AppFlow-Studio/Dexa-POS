import { vars } from "nativewind";
import * as React from "react";
import { Platform, useWindowDimensions, View } from "react-native";

// `useSettingsStore` transitively imports `lib/storage.ts`, which creates an
// MMKV instance with `encryptionKey` at module-eval time — unsupported by
// react-native-mmkv's web shim and fatal inside the CFD WebView bundle
// (web/cfd-entry.tsx). Lazily require it only on native so the web bundle
// never evaluates that module. See contexts/CFDDisplayDataContext.base.ts
// for the same split applied to the CFD display-data context.
const useSettingsStore: typeof import("@/stores/useSettingsStore").useSettingsStore =
  Platform.OS === "web"
    ? (() => null) as any
    : require("@/stores/useSettingsStore").useSettingsStore;

/**
 * Automatic UI scaling so the app looks proportionally consistent across
 * tablets of different physical sizes / resolutions.
 *
 * The scale is computed from the device's dp width relative to a baseline
 * tablet (the reference device everything is matched to). On the baseline
 * device scale === 1.0; wider tablets scale up, narrower ones scale down.
 *
 * dp (density-independent pixels) is the right basis here — it's already
 * density-corrected, so a 1.5-density Samsung tab and a 2.0-density Landi
 * are compared apples-to-apples (same number Android's "minimum width dp"
 * developer setting uses).
 *
 * Wiring: the scale is injected as the `--ui-scale` CSS variable at the app
 * root (see app/_layout.tsx). The spacing / fontSize / borderRadius scales in
 * tailwind.config.js resolve through that variable, so every existing utility
 * class (p-4, text-lg, gap-2, rounded-xl, …) reflows automatically with zero
 * per-component changes.
 */

/**
 * dp dimensions of the reference device (Samsung SM-P613, landscape).
 * scale === 1.0 on this device.
 */
export const BASELINE_WIDTH_DP = 1333;
export const BASELINE_HEIGHT_DP = 752;

/**
 * Clamp range. Floor is low enough that small phones (e.g. a 832x384dp
 * handset) shrink to actually fit rather than overflowing; ceiling keeps
 * huge displays from ballooning. The app spans phones → tablets.
 */
export const MIN_UI_SCALE = 0.6;
export const MAX_UI_SCALE = 1.25;

/**
 * Scale tracks whichever axis is tightest relative to the baseline, so the
 * UI fits on short phones (height-constrained) and narrow ones (width-
 * constrained) alike. On tablets near the baseline this is ~1.0.
 */
export function computeUiScale(widthDp: number, heightDp?: number): number {
  if (!widthDp || widthDp <= 0) return 1;
  const widthRatio = widthDp / BASELINE_WIDTH_DP;
  const heightRatio =
    heightDp && heightDp > 0 ? heightDp / BASELINE_HEIGHT_DP : widthRatio;
  const raw = Math.min(widthRatio, heightRatio);
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, raw));
}

/**
 * Reactive UI scale. Re-computes if the window dimensions change (e.g. a
 * foldable, or split-screen). Use this in components that do raw numeric
 * sizing off Dimensions and need to scale manually.
 */
export function useUiScale(): number {
  const { width, height } = useWindowDimensions();
  const override = useSettingsStore((s) => s.uiScaleOverride);
  const base = computeUiScale(width, height);
  if (override == null) return base;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, base * override));
}

/**
 * Injects the automatic UI scale as the `--ui-scale` CSS variable for
 * everything below it, so scale-driven Tailwind utilities (spacing/font/
 * radius, see tailwind.config.js) reflow with zero per-component changes.
 *
 * Shared between the main app root (app/_layout.tsx) and the CFD WebView
 * bundle (web/cfd-entry.tsx) — the WebView has its own viewport dimensions
 * (its own physical display), so it computes its own scale independently
 * rather than inheriting the POS tablet's.
 */
export function UiScaleProvider({ children }: { children: React.ReactNode }) {
  const scale = useUiScale();
  return React.createElement(
    View,
    { style: [{ flex: 1 }, vars({ "--ui-scale": scale })] },
    children,
  );
}
