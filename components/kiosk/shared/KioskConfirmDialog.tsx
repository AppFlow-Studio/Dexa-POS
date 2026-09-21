import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

/**
 * Two-choice confirmation for a destructive kiosk action.
 *
 * The safe choice is the default in every way that matters at a kiosk: it is
 * the filled button, it sits on the right where the thumb lands, and it is
 * what a tap on the backdrop does. The destructive choice is a plain outline —
 * a customer clearing their own basket by mis-tapping is the failure this
 * screen exists to prevent.
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
        paddingHorizontal: kioskPx(40, s),
        backgroundColor: "rgba(0,0,0,0.55)",
        zIndex: 90,
      }}
    >
      {/* Backdrop tap = the safe option. */}
      <Pressable
        onPress={onCancel}
        accessible={false}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <Animated.View
        entering={ZoomIn.duration(200).springify().damping(18)}
        style={{
          width: "100%",
          maxWidth: kioskPx(560, s),
          padding: kioskPx(32, s),
          borderRadius: kioskPx(28, s),
          backgroundColor: config.backgroundColor,
          borderWidth: 1,
          borderColor: `${config.textColor}14`,
        }}
      >
        <Text
          style={{
            fontSize: kioskPx(28, s),
            fontWeight: "800",
            color: config.textColor,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: kioskPx(12, s),
            fontSize: kioskPx(19, s),
            lineHeight: kioskPx(27, s),
            color: `${config.textColor}99`,
            textAlign: "center",
          }}
        >
          {body}
        </Text>

        <View
          style={{
            flexDirection: "row",
            gap: kioskPx(14, s),
            marginTop: kioskPx(28, s),
          }}
        >
          <KioskPressable
            onPress={onConfirm}
            pressedScale={0.96}
            accessibilityRole="button"
            style={{
              flex: 1,
              height: kioskPx(66, s),
              alignItems: "center",
              justifyContent: "center",
              borderRadius: kioskPx(20, s),
              borderWidth: 1.5,
              borderColor: `${config.textColor}2E`,
            }}
          >
            <Text
              style={{
                fontSize: kioskPx(19, s),
                fontWeight: "600",
                color: `${config.textColor}CC`,
              }}
            >
              {confirmLabel}
            </Text>
          </KioskPressable>

          <KioskPressable
            onPress={onCancel}
            pressedScale={0.96}
            accessibilityRole="button"
            style={{
              flex: 1,
              height: kioskPx(66, s),
              alignItems: "center",
              justifyContent: "center",
              borderRadius: kioskPx(20, s),
              backgroundColor: config.primaryColor,
            }}
          >
            <Text
              style={{
                fontSize: kioskPx(19, s),
                fontWeight: "800",
                color: "#FFFFFF",
              }}
            >
              {cancelLabel}
            </Text>
          </KioskPressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
