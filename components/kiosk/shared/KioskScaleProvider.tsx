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
export function KioskScaleProvider({ children }: { children: ReactNode }) {
  const scale = useKioskUiScale();
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
