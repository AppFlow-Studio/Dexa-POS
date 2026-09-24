import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskMotion,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskOrderType } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingBag, UtensilsCrossed } from "@/lib/icons";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

/**
 * Shared order-type selection. The customer chooses Dine In or Takeaway (or
 * taps the single allowed type, per the station's order-type setting); the
 * choice is stored on useKioskCartStore and becomes the order_type when the
 * order is created at checkout. Theme-driven from `config` so any template can
 * use it as a session entry step or a mid-session change screen.
 *
 * The two tiles are sized off the viewport's short edge rather than a fixed
 * scaled px value — they're the only content on screen, so on a big panel they
 * should own it, and on a small one they must still fit side by side.
 */
const ORDER_TYPE_TILES: {
  type: KioskOrderType;
  label: string;
  hint: string;
  Icon: typeof UtensilsCrossed;
}[] = [
  {
    type: "dine_in",
    label: "Dine In",
    hint: "Eat here",
    Icon: UtensilsCrossed,
  },
  {
    type: "takeout",
    label: "Takeaway",
    hint: "Take it to go",
    Icon: ShoppingBag,
  },
];

export function KioskOrderTypeScreen({
  config,
  options: allowed = ["dine_in", "takeout"],
  onSelect,
}: {
  config: KioskConfig;
  /** Types the station offers (see resolveOrderTypeFlow). Defaults to both. */
  options?: KioskOrderType[];
  onSelect: (type: KioskOrderType) => void;
}) {
  const options = ORDER_TYPE_TILES.filter((o) => allowed.includes(o.type));

  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const { width, height } = useWindowDimensions();
  const shortEdge = Math.min(width, height);
  // Two tiles plus a gap plus the screen's own padding have to fit across the
  // short edge, so cap at ~38% of it.
  const tileSize = Math.round(
    Math.min(Math.max(shortEdge * 0.38, 200), kioskPx(420, s)),
  );

  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{ backgroundColor: t.page }}
    >
      <Animated.Text
        entering={FadeInDown.duration(kioskMotion.slow)}
        style={{
          fontSize: kioskPx(41, s),
          lineHeight: kioskPx(50, s),
          letterSpacing: kioskTracking(41),
          ...kioskFont(t, "bold"),
          textAlign: "center",
          color: config.headerTextColor,
          marginBottom: kioskPx(10, s),
        }}
      >
        How would you like to order?
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.delay(80).duration(360)}
        style={{
          fontSize: kioskPx(20, s),
          color: t.textMuted,
          ...kioskFont(t, "regular"),
          marginBottom: kioskPx(52, s),
        }}
      >
        {options.length === 1 ? "Tap to begin" : "Select an option to begin"}
      </Animated.Text>

      <View style={{ flexDirection: "row", gap: kioskPx(36, s) }}>
        {options.map(({ type, label, hint, Icon }, index) => (
          <Animated.View
            key={type}
            entering={FadeInUp.delay(120 + index * 70).duration(
              kioskMotion.slow,
            )}
          >
            <KioskPressable
              onPress={() => onSelect(type)}
              pressedScale={0.95}
              style={{
                width: tileSize,
                height: tileSize,
                borderRadius: kioskPx(kioskRadius.xl, s),
                alignItems: "center",
                justifyContent: "center",
                gap: kioskPx(20, s),
                backgroundColor: t.surface,
                borderWidth: KIOSK_HAIRLINE,
                borderColor: t.outlineStrong,
              }}
            >
              <Icon color={t.primary} size={tileSize * 0.3} />
              <View style={{ alignItems: "center", gap: kioskPx(6, s) }}>
                <Text
                  style={{
                    fontSize: kioskPx(28, s),
                    letterSpacing: kioskTracking(28),
                    color: t.text,
                    ...kioskFont(t, "bold"),
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: kioskPx(16, s),
                    color: t.textMuted,
                    ...kioskFont(t, "regular"),
                  }}
                >
                  {hint}
                </Text>
              </View>
            </KioskPressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
