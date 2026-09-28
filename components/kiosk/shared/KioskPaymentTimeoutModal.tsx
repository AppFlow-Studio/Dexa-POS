import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  kioskFont,
  kioskMotion,
  kioskRadius,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KIOSK_HANDHELD_SHORT_EDGE } from "@/components/kiosk/shared/kioskLayout";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { useEffect } from "react";
import { Keyboard, Text, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

/**
 * "Need more time?" overlay shown when the card window lapsed with no card read
 * (CodePay Register closed its card screen, no charge). "Yes" relaunches the
 * card screen for the same order; "Cancel order" — or letting `secondsLeft`
 * run out — cancels the order and returns the kiosk to its start screen.
 *
 * Sized like KioskIdleModal (every dimension through `kioskPx`): a customer has
 * seconds to read it before their order is dropped.
 */
export function KioskPaymentTimeoutModal({
  config,
  secondsLeft,
  onMoreTime,
  onCancel,
}: {
  config: KioskConfig;
  secondsLeft: number;
  onMoreTime: () => void;
  onCancel: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  // On a phone the card's panel-sized side padding would leave the button
  // labels too little width to sit on one line.
  const narrow = useWindowDimensions().width < KIOSK_HANDHELD_SHORT_EDGE;

  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(160)}
      className="absolute inset-0 items-center justify-center px-10"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", zIndex: 100 }}
    >
      <Animated.View
        entering={FadeIn.duration(kioskMotion.base)}
        className="items-center"
        style={{
          borderRadius: kioskPx(kioskRadius.xl, s),
          backgroundColor: t.page,
          paddingHorizontal: kioskPx(narrow ? 24 : 44, s),
          paddingVertical: kioskPx(40, s),
          gap: kioskPx(18, s),
          maxWidth: kioskPx(560, s),
        }}
      >
        <Text
          style={{
            fontSize: kioskPx(34, s),
            ...kioskFont(t, "bold"),
            color: t.text,
            textAlign: "center",
          }}
        >
          {kioskStrings.moreTimeTitle}
        </Text>
        <Text
          style={{
            fontSize: kioskPx(19, s),
            lineHeight: kioskPx(27, s),
            color: t.textMuted,
            textAlign: "center",
          }}
        >
          {kioskStrings.moreTimeBody(secondsLeft)}
        </Text>
        <KioskPressable
          onPress={onMoreTime}
          pressedScale={0.95}
          style={{
            marginTop: kioskPx(8, s),
            paddingHorizontal: kioskPx(narrow ? 24 : 40, s),
            paddingVertical: kioskPx(20, s),
            borderRadius: kioskPx(kioskRadius.md, s),
            backgroundColor: t.primary,
          }}
        >
          <Text
            style={{
              color: t.onPrimary,
              fontSize: kioskPx(21, s),
              ...kioskFont(t, "bold"),
            }}
          >
            {kioskStrings.moreTimeConfirm}
          </Text>
        </KioskPressable>
        <KioskPressable
          onPress={onCancel}
          pressedScale={0.95}
          style={{
            paddingHorizontal: kioskPx(narrow ? 20 : 32, s),
            paddingVertical: kioskPx(14, s),
            borderRadius: kioskPx(kioskRadius.md, s),
            borderWidth: 1.5,
            borderColor: `${t.text}30`,
          }}
        >
          <Text
            style={{
              color: t.text,
              fontSize: kioskPx(17, s),
              ...kioskFont(t, "bold"),
            }}
          >
            {kioskStrings.moreTimeCancel}
          </Text>
        </KioskPressable>
      </Animated.View>
    </Animated.View>
  );
}
