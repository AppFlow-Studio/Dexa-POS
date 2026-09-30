import { useKioskUiScale } from "@/lib/uiScale";
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

/**
 * Injects `--ui-scale` (Tailwind) and `--kiosk-ui-scale` CSS variables for
 * kiosk screens.
 *
 * Kiosk displays can be much larger than handheld tablets (43–65" touchscreens),
 * so this uses the KIOSK_MIN/MAX_UI_SCALE range (up to 3.0×) instead of the
 * POS range (up to 1.25×).
 *
 * **Overrides `--ui-scale`** so every Tailwind utility class (p-4, text-lg,
 * gap-2, rounded-xl, …) automatically scales up on huge kiosk displays with
 * zero per-component changes. The extra `--kiosk-ui-scale` variable is
 * available for kiosk-specific raw size computations via `kioskPx()`.
 *
 * Usage: wrap the kiosk route content:
 *
 *   <KioskScaleProvider>
 *     <KioskScreen />
 *   </KioskScaleProvider>
 */
export function KioskScaleProvider({
  children,
  minScale,
}: {
  children: ReactNode;
  /**
   * Floor for this subtree only. Kiosk Settings is a Tailwind-sized staff
   * screen, where 1.0 is already a phone-app type ramp (text-xs = 12px); the
   * customer-facing floor would render its labels at 10px on a phone.
   */
  minScale?: number;
}) {
  const autoScale = useKioskUiScale();
  const scale = minScale != null ? Math.max(minScale, autoScale) : autoScale;
  return (
    <View
      style={[
        { flex: 1 } as ViewStyle,
        {
          "--ui-scale": scale,
          "--kiosk-ui-scale": scale,
        } as unknown as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Utility to scale a raw px value by the kiosk UI scale factor.
 * Use this in kiosk components that have hardcoded numeric sizes
 * (e.g. height, fontSize, padding) instead of Tailwind classes.
 *
 * @example
 *   const s = useKioskUiScale();
 *   <View style={{ height: kioskPx(88, s) }} />
 */
export function kioskPx(px: number, scale: number): number {
  return Math.round(px * scale);
}

/**
 * Smallest type the kiosk sets. Every kiosk size already clears it on a panel
 * (scale ≥ 1); it binds only where the scale drops below 1 — a phone — so
 * captions and count badges don't shrink to 10–11px there.
 */
export const KIOSK_MIN_FONT_SIZE = 12;

/**
 * `kioskPx` for a font size: the same scaling, floored at
 * KIOSK_MIN_FONT_SIZE. Use it for type set below ~15px; larger sizes can't
 * reach the floor at any kiosk scale.
 */
export function kioskFontPx(px: number, scale: number): number {
  return Math.max(KIOSK_MIN_FONT_SIZE, kioskPx(px, scale));
}
