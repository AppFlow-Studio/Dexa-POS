import { KIOSK_HEADER_CONTROL_HEIGHT } from "@/components/kiosk/shared/kioskLayout";
import { kioskMoney } from "@/components/kiosk/shared/kioskMoney";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingCart } from "lucide-react-native";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/**
 * Width the pill holds regardless of the total, sized for "$1,234.56".
 *
 * The reservation belongs to the pill, not to the number inside it. Reserving
 * it on the total meant a short amount was right-aligned in a wide box, and
 * all the slack pooled in the middle as a gap between the cart glyph and the
 * digits. Held here, the glyph and the total stay together as one centred
 * group and the slack becomes even padding at the pill's ends, which is what
 * padding is supposed to look like.
 */
const PILL_MIN_WIDTH = 168;

/**
 * The header's cart control — the only cart affordance in landscape.
 *
 * One row at the same height as Start Over beside it, so the two read as a
 * matched pair of header controls rather than one button and one panel, and
 * carrying only a cart glyph, its count, and the total — the header's width
 * belongs to the merchant's logo, not to a caption for an icon everyone
 * already knows. The total sits in a fixed-width, right-aligned,
 * tabular-figure column, so the pill's box is identical at $0.01 and
 * $1,234.56 and nothing in the header shifts mid-order.
 *
 * Always rendered, including with an empty cart, so nothing moves the moment
 * the first item lands: empty is an outlined, muted, non-interactive pill in
 * the same box the filled one occupies. Once there is something in it, it
 * fills with the theme primary and pulses on every add — on a large panel the
 * customer is looking at the tile they just tapped, not at the top-right
 * corner, and a silent badge change goes unnoticed.
 */
export function KioskHeaderCartPill({
  config,
  itemCount,
  subtotal,
  onPress,
}: {
  config: KioskConfig;
  itemCount: number;
  subtotal: number;
  onPress: () => void;
}) {
  const s = useKioskUiScale();
  const hasItems = itemCount > 0;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (itemCount <= 0) return;
    pulse.value = withSequence(
      withTiming(1.06, { duration: 110 }),
      withSpring(1, { damping: 10, stiffness: 240, mass: 0.5 }),
    );
  }, [itemCount, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const foreground = hasItems ? "#FFFFFF" : `${config.textColor}66`;

  return (
    <Animated.View style={pulseStyle}>
      <KioskPressable
        disabled={!hasItems}
        onPress={onPress}
        pressedScale={0.95}
        accessibilityRole="button"
        accessibilityState={{ disabled: !hasItems }}
        accessibilityLabel={
          hasItems
            ? `${kioskStrings.viewCart}, ${itemCount}, ${kioskMoney(subtotal)}`
            : kioskStrings.cartEmpty
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: kioskPx(10, s),
          minWidth: kioskPx(PILL_MIN_WIDTH, s),
          height: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s),
          paddingLeft: kioskPx(16, s),
          paddingRight: kioskPx(16, s),
          borderRadius: 999,
          backgroundColor: hasItems ? config.primaryColor : "transparent",
          borderWidth: 1.5,
          borderColor: hasItems ? config.primaryColor : `${config.textColor}26`,
        }}
      >
        <View>
          <ShoppingCart size={kioskPx(22, s)} color={foreground} />
          {hasItems ? (
            <View
              style={{
                position: "absolute",
                top: kioskPx(-7, s),
                right: kioskPx(-10, s),
                minWidth: kioskPx(21, s),
                height: kioskPx(21, s),
                paddingHorizontal: kioskPx(5, s),
                borderRadius: kioskPx(11, s),
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: config.accentColor,
                borderWidth: 2,
                borderColor: config.primaryColor,
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: kioskPx(12, s),
                  fontWeight: "800",
                }}
              >
                {itemCount}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Icon and total only. The words "View Cart" cost about as much
            width as everything else in the pill put together, and a cart
            glyph with a count on it and a price beside it is not ambiguous.
            The label lives on in `accessibilityLabel`. */}
        <Text
          // Tabular figures so the number's own width only ever changes when a
          // digit is added, never as the digits themselves change.
          style={{
            fontSize: kioskPx(18, s),
            fontWeight: "800",
            color: foreground,
            fontVariant: ["tabular-nums"],
          }}
        >
          {kioskMoney(subtotal)}
        </Text>
      </KioskPressable>
    </Animated.View>
  );
}
