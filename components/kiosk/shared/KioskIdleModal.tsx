import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Text } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

/**
 * "Are you still there?" overlay shown after a stretch of inactivity, before
 * the kiosk returns to the attract screen. Tapping the button registers
 * activity and dismisses it; otherwise the kiosk resets when `secondsLeft`
 * runs out. `hasActiveCart` only tunes the copy — with an order in progress we
 * warn the customer their order will be cancelled; while just browsing we say
 * we'll return to the start screen.
 *
 * Every dimension routes through `kioskPx`: this is the one surface a customer
 * has seconds to read before their order is dropped, and it previously used
 * raw px, so on a large kiosk it rendered at a fraction of the surrounding UI.
 */
export function KioskIdleModal({
  config,
  secondsLeft,
  onContinue,
  hasActiveCart = true,
}: {
  config: KioskConfig;
  secondsLeft: number;
  onContinue: () => void;
  hasActiveCart?: boolean;
}) {
  const s = useKioskUiScale();

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(160)}
      className="absolute inset-0 items-center justify-center px-10"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", zIndex: 100 }}
    >
      <Animated.View
        entering={ZoomIn.duration(260).springify().damping(18)}
        className="items-center rounded-3xl"
        style={{
          backgroundColor: config.backgroundColor,
          paddingHorizontal: kioskPx(44, s),
          paddingVertical: kioskPx(40, s),
          gap: kioskPx(18, s),
          maxWidth: kioskPx(560, s),
        }}
      >
        <Text
          style={{
            fontSize: kioskPx(34, s),
            fontWeight: "800",
            color: config.textColor,
            textAlign: "center",
          }}
        >
          Are you still there?
        </Text>
        <Text
          style={{
            fontSize: kioskPx(19, s),
            lineHeight: kioskPx(27, s),
            color: `${config.textColor}99`,
            textAlign: "center",
          }}
        >
          {hasActiveCart
            ? `Your order will be cancelled in ${secondsLeft}s due to inactivity.`
            : `We'll return to the start screen in ${secondsLeft}s due to inactivity.`}
        </Text>
        <KioskPressable
          onPress={onContinue}
          pressedScale={0.95}
          style={{
            marginTop: kioskPx(8, s),
            paddingHorizontal: kioskPx(40, s),
            paddingVertical: kioskPx(20, s),
            borderRadius: kioskPx(18, s),
            backgroundColor: config.primaryColor,
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: kioskPx(21, s),
              fontWeight: "700",
            }}
          >
            Yes, I&apos;m still here
          </Text>
        </KioskPressable>
      </Animated.View>
    </Animated.View>
  );
}
