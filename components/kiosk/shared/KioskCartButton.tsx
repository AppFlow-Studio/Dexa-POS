import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingCart } from "lucide-react-native";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  FadeOutDown,
  LinearTransition,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
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
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (itemCount <= 0) return;
    pulse.value = withSequence(
      withTiming(1.08, { duration: 110 }),
      withSpring(1, { damping: 10, stiffness: 240, mass: 0.5 }),
    );
  }, [itemCount, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  if (itemCount <= 0) return null;

  return (
    <Animated.View
      entering={SlideInDown.duration(320).springify().damping(16)}
      exiting={FadeOutDown.duration(180)}
      style={[
        {
          position: "absolute",
          right: kioskPx(24, s),
          bottom: kioskPx(24, s),
          borderRadius: 999,
          backgroundColor: config.primaryColor,
          shadowColor: "#000000",
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
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
          borderRadius: 999,
          backgroundColor: config.primaryColor,
        }}
      >
        <View>
          <ShoppingCart size={kioskPx(30, s)} color="#FFFFFF" />
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
              backgroundColor: config.accentColor,
              borderWidth: 2,
              borderColor: config.primaryColor,
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: kioskPx(14, s),
                fontWeight: "800",
              }}
            >
              {itemCount}
            </Text>
          </View>
        </View>

        <Animated.Text
          layout={LinearTransition.duration(180)}
          style={{
            color: "#FFFFFF",
            fontSize: kioskPx(20, s),
            fontWeight: "700",
          }}
        >
          View Cart
          {subtotal != null ? `  ·  $${subtotal.toFixed(2)}` : ""}
        </Animated.Text>
      </KioskPressable>
    </Animated.View>
  );
}
