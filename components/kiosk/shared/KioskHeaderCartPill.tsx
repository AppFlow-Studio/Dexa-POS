import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KIOSK_HEADER_CONTROL_HEIGHT } from "@/components/kiosk/shared/kioskLayout";
import { kioskMoney } from "@/components/kiosk/shared/kioskMoney";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  kioskFontPx,
  kioskPx,
} from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingCart } from "@/lib/icons";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * Width the pill holds regardless of the total, sized for "$1,234.56".
 *
 * The reservation belongs to the control, not to the number inside it.
 * Reserved on the total, a short amount was right-aligned in a wide box and
 * the slack pooled in the middle as a gap between glyph and digits. Held here,
 * the two stay together as one centred group and the slack becomes even
 * padding at the ends.
 */
const MIN_WIDTH = 168;

/**
 * The header's cart control — the only cart affordance in landscape.
 *
 * One rectangle at the same height as Start Over beside it, carrying a cart
 * glyph, its count, and the total. Always rendered, including with an empty
 * cart, so nothing moves the moment the first item lands: empty is an
 * outlined, muted, non-interactive control in the box the filled one occupies.
 *
 * Once there is something in it, it fills with the theme primary and gives one
 * short pulse per add — on a large panel the customer is looking at the tile
 * they just tapped, not at the top-right corner, so a silent badge change goes
 * unnoticed. The pulse is 5% and returns flat: a receipt, not a celebration.
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
  const t = useKioskTheme(config);
  const hasItems = itemCount > 0;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (itemCount <= 0) return;
    pulse.value = withSequence(
      withTiming(1.05, { duration: 110 }),
      withTiming(1, { duration: 180 }),
    );
  }, [itemCount, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const foreground = hasItems ? t.onPrimary : t.textFaint;
  const badge = kioskPx(20, s);

  return (
    <Animated.View style={pulseStyle}>
      <KioskPressable
        disabled={!hasItems}
        onPress={onPress}
        pressedScale={0.97}
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
          minWidth: kioskPx(MIN_WIDTH, s),
          height: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s),
          paddingHorizontal: kioskPx(16, s),
          borderRadius: kioskPx(kioskRadius.md, s),
          backgroundColor: hasItems ? t.primary : "transparent",
          borderWidth: KIOSK_HAIRLINE,
          borderColor: hasItems ? t.primary : t.outlineStrong,
        }}
      >
        <View>
          <ShoppingCart
            size={kioskPx(21, s)}
            color={foreground}
            strokeWidth={1.75}
          />
          {hasItems ? (
            // The one place a full circle is still right: a count badge is a
            // dot, not a control.
            <View
              style={{
                position: "absolute",
                top: kioskPx(-7, s),
                right: kioskPx(-10, s),
                minWidth: badge,
                height: badge,
                paddingHorizontal: kioskPx(5, s),
                borderRadius: badge / 2,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: t.accent,
                borderWidth: 2,
                borderColor: t.primary,
              }}
            >
              <Text
                style={{
                  color: t.onPrimary,
                  fontSize: kioskFontPx(12, s),
                  ...kioskFont(t, "bold"),
                }}
              >
                {itemCount}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          // Tabular figures, so the number's width changes only when a digit
          // is added — never as the digits themselves change.
          style={{
            fontSize: kioskPx(18, s),
            letterSpacing: kioskTracking(18),
            color: foreground,
            fontVariant: ["tabular-nums"],
            ...kioskFont(t, "bold"),
          }}
        >
          {kioskMoney(subtotal)}
        </Text>
      </KioskPressable>
    </Animated.View>
  );
}
