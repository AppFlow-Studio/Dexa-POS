import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskOrderType } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingBag, UtensilsCrossed } from "lucide-react-native";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

/**
 * Shared order-type selection. The customer chooses Dine In or Takeaway; the
 * choice is stored on useKioskCartStore and becomes the order_type when the
 * order is created at checkout. Theme-driven from `config` so any template can
 * use it as a session entry step or a mid-session change screen.
 *
 * The two tiles are sized off the viewport's short edge rather than a fixed
 * scaled px value — they're the only content on screen, so on a big panel they
 * should own it, and on a small one they must still fit side by side.
 */
export function KioskOrderTypeScreen({
  config,
  onSelect,
}: {
  config: KioskConfig;
  onSelect: (type: KioskOrderType) => void;
}) {
  const options: {
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

  const s = useKioskUiScale();
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
      style={{ backgroundColor: config.backgroundColor }}
    >
      <Animated.Text
        entering={FadeInDown.duration(360).springify().damping(20)}
        style={{
          fontSize: kioskPx(42, s),
          lineHeight: kioskPx(52, s),
          fontWeight: "800",
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
          fontSize: kioskPx(21, s),
          color: `${config.textColor}99`,
          marginBottom: kioskPx(52, s),
        }}
      >
        Select an option to begin
      </Animated.Text>

      <View style={{ flexDirection: "row", gap: kioskPx(36, s) }}>
        {options.map(({ type, label, hint, Icon }, index) => (
          <Animated.View
            key={type}
            entering={FadeInUp.delay(150 + index * 90)
              .duration(420)
              .springify()
              .damping(17)}
          >
            <KioskPressable
              onPress={() => onSelect(type)}
              pressedScale={0.95}
              style={{
                width: tileSize,
                height: tileSize,
                borderRadius: kioskPx(28, s),
                alignItems: "center",
                justifyContent: "center",
                gap: kioskPx(20, s),
                backgroundColor: `${config.primaryColor}12`,
                borderWidth: 2,
                borderColor: `${config.primaryColor}40`,
              }}
            >
              <Icon color={config.primaryColor} size={tileSize * 0.3} />
              <View style={{ alignItems: "center", gap: kioskPx(6, s) }}>
                <Text
                  style={{
                    fontSize: kioskPx(30, s),
                    fontWeight: "700",
                    color: config.textColor,
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: kioskPx(18, s),
                    color: `${config.textColor}88`,
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
