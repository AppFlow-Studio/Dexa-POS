import {
  kioskRadius,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { KioskItemDetail } from "@/components/kiosk/template-a/KioskItemDetail";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskItemSource } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

/** Share of the panel the popup takes, and its ceiling on a very large screen. */
const WIDTH_FRACTION = 0.92;
const HEIGHT_FRACTION = 0.9;
const MAX_WIDTH = 1200;

/**
 * The item detail, presented as a centred popup over the menu.
 *
 * Presentation only — the content, the modifier rules and the add button are
 * the same KioskItemDetail the full-screen flow uses. What changes is that the
 * menu stays visible and mounted behind it: the customer can see they are
 * still in the middle of browsing, dismissing costs them no scroll position or
 * category, and nothing enters the cart on the way in or out.
 *
 * The box is derived from the window rather than measured, so the detail gets
 * its real dimensions on the first frame. Measuring would hand it a zero-size
 * panel for one frame, and it sizes a photo and picks a landscape or portrait
 * layout from exactly those numbers.
 */
export function KioskItemDetailModal({
  config,
  item,
  source,
  onDismiss,
  onAdded,
}: {
  config: KioskConfig;
  item: MenuItemType;
  source?: KioskItemSource;
  onDismiss: () => void;
  onAdded: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const width = Math.min(windowWidth * WIDTH_FRACTION, kioskPx(MAX_WIDTH, s));
  const height = windowHeight * HEIGHT_FRACTION;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.scrim,
        zIndex: 40,
      }}
    >
      {/* Tapping outside dismisses without adding anything. */}
      <Pressable
        onPress={onDismiss}
        accessible={false}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <Animated.View
        entering={ZoomIn.duration(220).springify().damping(20)}
        style={{
          width,
          height,
          borderRadius: kioskPx(kioskRadius.xl, s),
          overflow: "hidden",
          backgroundColor: t.page,
        }}
      >
        <View style={{ flex: 1 }}>
          <KioskItemDetail
            config={config}
            item={item}
            source={source}
            onBack={onDismiss}
            onAdded={onAdded}
            panelWidth={width}
            panelHeight={height}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}
