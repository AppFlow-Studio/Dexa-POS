import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskMotion,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { KIOSK_HANDHELD_SHORT_EDGE } from "@/components/kiosk/shared/kioskLayout";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

/**
 * Two-choice confirmation for a destructive kiosk action.
 *
 * The safe choice is the default in every way that matters at a kiosk: it is
 * the filled button, it sits on the right where the thumb lands, and it is
 * what a tap on the backdrop does. The destructive choice is a plain outline -
 * a customer clearing their own basket by mis-tapping is the failure this
 * screen exists to prevent.
 *
 * Sized for a panel rather than a phone: the copy sets at reading size from a
 * few feet away, the buttons are a comfortable height, and the whole thing
 * enters on a fade rather than a scale-up, which at this size reads as a jolt.
 */
export function KioskConfirmDialog({
  config,
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  config: KioskConfig;
  title: string;
  body: string;
  /** The safe option. */
  cancelLabel: string;
  /** The destructive option. */
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const button = kioskPx(64, s);
  // Panel-sized insets leave two side-by-side buttons ~100dp each on a phone;
  // tightened there, both labels keep one line.
  const narrow = useWindowDimensions().width < KIOSK_HANDHELD_SHORT_EDGE;

  return (
    <Animated.View
      entering={FadeIn.duration(kioskMotion.base)}
      exiting={FadeOut.duration(kioskMotion.fast)}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: kioskPx(narrow ? 20 : 40, s),
        backgroundColor: t.scrim,
        zIndex: 90,
      }}
    >
      {/* Backdrop tap = the safe option. */}
      <Pressable
        onPress={onCancel}
        accessible={false}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View
        style={{
          width: "100%",
          maxWidth: kioskPx(620, s),
          padding: kioskPx(narrow ? 24 : 40, s),
          borderRadius: kioskPx(kioskRadius.xl, s),
          backgroundColor: t.page,
        }}
      >
        <Text
          style={{
            fontSize: kioskPx(28, s),
            letterSpacing: kioskTracking(28),
            color: t.text,
            textAlign: "center",
            ...kioskFont(t, "bold"),
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: kioskPx(14, s),
            fontSize: kioskPx(18, s),
            lineHeight: kioskPx(27, s),
            color: t.textMuted,
            textAlign: "center",
            ...kioskFont(t, "regular"),
          }}
        >
          {body}
        </Text>

        <View
          style={{
            flexDirection: "row",
            gap: kioskPx(14, s),
            marginTop: kioskPx(32, s),
          }}
        >
          <KioskPressable
            onPress={onConfirm}
            pressedScale={0.98}
            accessibilityRole="button"
            style={{
              flex: 1,
              height: button,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: kioskPx(kioskRadius.md, s),
              borderWidth: KIOSK_HAIRLINE,
              borderColor: t.outlineStrong,
            }}
          >
            <Text
              style={{
                fontSize: kioskPx(18, s),
                color: t.textMuted,
                ...kioskFont(t, "regular"),
              }}
            >
              {confirmLabel}
            </Text>
          </KioskPressable>

          <KioskPressable
            onPress={onCancel}
            pressedScale={0.98}
            accessibilityRole="button"
            style={{
              flex: 1,
              height: button,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: kioskPx(kioskRadius.md, s),
              backgroundColor: t.primary,
            }}
          >
            <Text
              style={{
                fontSize: kioskPx(18, s),
                color: t.onPrimary,
                ...kioskFont(t, "bold"),
              }}
            >
              {cancelLabel}
            </Text>
          </KioskPressable>
        </View>
      </View>
    </Animated.View>
  );
}
