import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  kioskFont,
  kioskMotion,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import {
  kioskFontPx,
  kioskPx,
} from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingCart } from "@/lib/icons";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * Floating cart button, pinned bottom-right. Shows the running item count and
 * (optionally) the cart subtotal. Hidden while the cart is empty.
 *
 * Springs in when the first item lands and gives a short pulse on every
 * subsequent add — on a large kiosk panel the button sits well outside the
 * customer's focus (they're looking at the item they just tapped), so a static
 * badge change goes unnoticed and they don't realise the item registered.
 * Theme-driven from `config`. Place inside a flex-1 parent that allows
 * absolute children.
 */
export function KioskCartButton({
  config,
  itemCount,
  subtotal,
  onPress,
}: {
  config: KioskConfig;
  itemCount: number;
  subtotal?: number;
  onPress: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (itemCount <= 0) return;
    pulse.value = withSequence(
      withTiming(1.05, { duration: 110 }),
      withTiming(1, { duration: kioskMotion.base }),
    );
  }, [itemCount, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  if (itemCount <= 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(kioskMotion.slow)}
      exiting={FadeOutDown.duration(180)}
      style={[
        {
          position: "absolute",
          right: kioskPx(24, s),
          bottom: kioskPx(24, s),
          borderRadius: kioskPx(kioskRadius.lg, s),
          backgroundColor: t.primary,
          // A floating control genuinely does need separating from the grid
          // it sits over — but softly. The old drop was doing the job of a
          // Material elevation layer.
          shadowColor: "#000000",
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        },
        pulseStyle,
      ]}
    >
      <KioskPressable
        onPress={onPress}
        pressedScale={0.94}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: kioskPx(16, s),
          paddingLeft: kioskPx(24, s),
          paddingRight: kioskPx(28, s),
          height: kioskPx(76, s),
          borderRadius: kioskPx(kioskRadius.lg, s),
          backgroundColor: t.primary,
        }}
      >
        <View>
          <ShoppingCart
            size={kioskPx(28, s)}
            color={t.onPrimary}
            strokeWidth={1.75}
          />
          <View
            style={{
              position: "absolute",
              top: kioskPx(-9, s),
              right: kioskPx(-12, s),
              minWidth: kioskPx(26, s),
              height: kioskPx(26, s),
              paddingHorizontal: kioskPx(6, s),
              borderRadius: kioskPx(13, s),
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
                fontSize: kioskFontPx(13, s),
                ...kioskFont(t, "bold"),
              }}
            >
              {itemCount}
            </Text>
          </View>
        </View>

        <Animated.Text
          layout={LinearTransition.duration(180)}
          style={{
            color: t.onPrimary,
            fontSize: kioskPx(19, s),
            letterSpacing: kioskTracking(19),
            ...kioskFont(t, "bold"),
          }}
        >
          View Cart
          {subtotal != null ? `  ·  $${subtotal.toFixed(2)}` : ""}
        </Animated.Text>
      </KioskPressable>
    </Animated.View>
  );
}
