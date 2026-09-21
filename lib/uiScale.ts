import { vars } from "nativewind";
import * as React from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

// `useSettingsStore` transitively imports `lib/storage.ts`, which creates an
// MMKV instance with `encryptionKey` at module-eval time — unsupported by
// react-native-mmkv's web shim and fatal inside the CFD WebView bundle
// (web/cfd-entry.tsx). Lazily require it only on native so the web bundle
// never evaluates that module. See contexts/CFDDisplayDataContext.base.ts
// for the same split applied to the CFD display-data context.
const useSettingsStore: typeof import("@/stores/useSettingsStore").useSettingsStore =
  Platform.OS === "web"
    ? ((() => null) as any)
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
 *
 * Kiosk screens use a higher ceiling (KIOSK_MAX_UI_SCALE = 3.0) because
 * self-service kiosk displays can be much larger (43–65" portrait/landscape
 * touchscreens at 1080p–4K). The kiosk scale is injected as `--kiosk-ui-scale`
 * via KioskScaleProvider and consumed by kiosk components that need larger
 * raw sizes.
 */

/**
 * dp dimensions of the reference device (Samsung SM-P613, landscape).
 * scale === 1.0 on this device.
 */
export const BASELINE_WIDTH_DP = 1333;
export const BASELINE_HEIGHT_DP = 752;

/**
 * Clamp range for POS / handheld mode. Floor is low enough that small phones
 * (e.g. a 832x384dp handset) shrink to actually fit rather than overflowing;
 * ceiling keeps huge displays from ballooning during normal POS use.
 */
export const MIN_UI_SCALE = 0.6;
export const MAX_UI_SCALE = 1.25;

/**
 * Kiosk clamp range. Huge self-service touchscreens (43–65", 1080p–4K) need a
 * much higher ceiling. The baseline reference is still the Samsung tablet, so a
 * 1920×1080dp kiosk display would land at ~1.44× — the ceiling catches even
 * larger 4K screens in portrait (e.g. 3840×2160dp → ~2.88×).
 */
export const KIOSK_MIN_UI_SCALE = 0.7;
export const KIOSK_MAX_UI_SCALE = 3.0;

/**
 * Extra multiplier applied on top of the raw kiosk ratio.
 *
 * A POS tablet is read at ~1ft, held or propped on a counter. A kiosk is read
 * by a customer *standing* ~2-3ft from a wall/floor-mounted panel, so the same
 * dp type reads noticeably smaller to them. This bumps the whole kiosk UI
 * (type, padding, radii - everything routed through `--ui-scale`) to close
 * that gap without touching a single component.
 */
export const KIOSK_LEGIBILITY_BOOST = 1.12;

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
 * Kiosk-specific scale computation.
 *
 * **Orientation-aware**, unlike computeUiScale. The baseline (1333x752) is a
 * *landscape* tablet, so comparing axis-to-axis breaks down the moment the
 * panel is portrait: a 1080x1920dp kiosk measures its 1080 width against the
 * baseline's 1333 landscape width, `Math.min` picks that 0.81, and a 32"
 * kiosk ends up with *smaller* type than a 10" tablet - the exact opposite of
 * what it needs. Matching short-edge to short-edge and long-edge to long-edge
 * resolves the same panel to ~1.44x in either orientation.
 *
 * The result is then multiplied by KIOSK_LEGIBILITY_BOOST for standing viewing
 * distance, and clamped to KIOSK_MIN/MAX_UI_SCALE.
 */
export function computeKioskUiScale(
  widthDp: number,
  heightDp?: number,
): number {
  if (!widthDp || widthDp <= 0) return 1;
  const h = heightDp && heightDp > 0 ? heightDp : widthDp;
  const shortEdge = Math.min(widthDp, h);
  const longEdge = Math.max(widthDp, h);
  const raw = Math.min(
    shortEdge / BASELINE_HEIGHT_DP,
    longEdge / BASELINE_WIDTH_DP,
  );
  return Math.min(
    KIOSK_MAX_UI_SCALE,
    Math.max(KIOSK_MIN_UI_SCALE, raw * KIOSK_LEGIBILITY_BOOST),
  );
}

/**
 * Clamp range for the customer-facing display. Wider than the POS range on
 * both ends: CFD panels vary far more than POS tablets (a 7" tethered tablet
 * up to a 27" counter display), and the operator is tuning for a customer
 * standing at arm's length rather than their own hand.
 */
export const MIN_CFD_UI_SCALE = 0.6;
export const MAX_CFD_UI_SCALE = 2.0;

/**
 * CFD scale override, supplied by whatever renders a CFD screen tree.
 *
 * The override lives in POS settings (`cfdUiScaleOverride`) but has to reach
 * three different runtimes: the external CFD tablet (its own app + its own
 * MMKV), the on-device secondary display, and the CFD WebView bundle (which
 * cannot touch MMKV at all — see the Platform split at the top of this file).
 * So it travels *in the CFD payload* like every other CFD setting, and the
 * receiving side republishes it through this context.
 *
 * `useUiScale()` consults it, which is what makes every existing CFD screen
 * honour the setting without a single per-screen change — they all already
 * call `useUiScale()`.
 */
const CFDScaleContext = React.createContext<number | null>(null);

/**
 * Provides the CFD scale override to a CFD screen subtree. `override` is the
 * raw multiplier from settings (`null` = no override, follow automatic scale).
 */
export function CFDScaleProvider({
  override,
  children,
}: {
  override: number | null | undefined;
  children: React.ReactNode;
}) {
  return React.createElement(
    CFDScaleContext.Provider,
    { value: override ?? null },
    children,
  );
}

/**
 * The CFD scale override currently in effect, or `null` outside a CFD tree.
 */
export function useCFDScaleOverride(): number | null {
  return React.useContext(CFDScaleContext);
}

/**
 * A pinned scale for one subtree, honoured by BOTH `useUiScale()` and the
 * `--ui-scale` variable. The auth screens use it: the automatic scale floors
 * at 0.6 on a phone, which shrinks every `s()`-sized control to 60%, so the
 * auth layout pins a phone to 1 (dp-true) and a portrait kiosk to ≥0.8.
 */
const FixedUiScaleContext = React.createContext<number | null>(null);

export function FixedUiScaleProvider({
  scale,
  fill = true,
  pointerEvents,
  children,
}: {
  /** `null` = no pin, the automatic scale applies. */
  scale: number | null;
  /** `false` for an overlay that must size to its content (the toast stack). */
  fill?: boolean;
  pointerEvents?: "box-none" | "none" | "auto";
  children: React.ReactNode;
}) {
  // Always the same element shape: a subtree that toggles between a pinned
  // and an automatic scale must not remount (expo-router's Slot navigator
  // lives below this in the auth layout).
  return React.createElement(
    FixedUiScaleContext.Provider,
    { value: scale },
    React.createElement(
      View,
      {
        style: [fill ? { flex: 1 } : null, scale == null ? null : vars({ "--ui-scale": scale })],
        pointerEvents,
      },
      children,
    ),
  );
}

/**
 * Portrait: the auth frame stacks and the toast spans the width. Landscape
 * is untouched on every device — the tablet layouts stay exactly as drawn.
 */
export function isCompactViewport(widthDp: number, heightDp: number): boolean {
  return heightDp > widthDp;
}

/**
 * Scale for the auth screens on a compact viewport: a phone reads dp-true,
 * a portrait tablet / kiosk keeps the automatic scale but never below 0.8
 * (staff set the device up standing at it; the kiosk boost is for guests).
 */
export function computeAuthUiScale(widthDp: number, heightDp: number): number {
  if (Math.min(widthDp, heightDp) < 600) return 1;
  return Math.max(0.8, computeUiScale(widthDp, heightDp));
}

/**
 * Reactive UI scale. Re-computes if the window dimensions change (e.g. a
 * foldable, or split-screen). Use this in components that do raw numeric
 * sizing off Dimensions and need to scale manually.
 *
 * Inside a CFD screen tree (see CFDScaleProvider) the CFD's own override and
 * clamp range apply instead of the POS ones, so operators can size the
 * customer display independently of the POS UI.
 */
export function useUiScale(): number {
  const { width, height } = useWindowDimensions();
  const posOverride = useSettingsStore((s) => s.uiScaleOverride);
  const cfdOverride = useCFDScaleOverride();
  const fixed = React.useContext(FixedUiScaleContext);
  const base = computeUiScale(width, height);
  if (fixed != null) return fixed;
  if (cfdOverride != null) {
    return Math.min(
      MAX_CFD_UI_SCALE,
      Math.max(MIN_CFD_UI_SCALE, base * cfdOverride),
    );
  }
  if (posOverride == null) return base;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, base * posOverride));
}

/**
 * Reactive kiosk UI scale. Uses the higher kiosk clamp range so huge
 * self-service displays get proportionally larger UI. Also respects the
 * manual uiScaleOverride.
 */
export function useKioskUiScale(): number {
  const { width, height } = useWindowDimensions();
  const override = useSettingsStore((s) => s.uiScaleOverride);
  const base = computeKioskUiScale(width, height);
  if (override == null) return base;
  return Math.min(
    KIOSK_MAX_UI_SCALE,
    Math.max(KIOSK_MIN_UI_SCALE, base * override),
  );
}

/**
 * Hook that returns true when the currently selected station is a kiosk
 * (self_service). Useful for conditional scaling logic.
 */
export function useIsKiosk(): boolean {
  return useStoreSettingsStore(
    (s) => s.selectedStation?.station_type === "self_service",
  );
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
