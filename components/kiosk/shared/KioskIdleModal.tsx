import type { KioskConfig } from "@/types/kiosk";
import { Pressable, Text, View } from "react-native";

/**
 * "Are you still there?" overlay shown when the customer has items in their
 * cart (or is mid-checkout) but has been inactive past
 * `cartResetTimeoutSeconds`. Tapping the button registers activity and
 * dismisses it; otherwise the kiosk resets to idle when `secondsLeft` runs out.
 */
export function KioskIdleModal({
  config,
  secondsLeft,
  onContinue,
}: {
  config: KioskConfig;
  secondsLeft: number;
  onContinue: () => void;
}) {
  return (
    <View
      className="absolute inset-0 items-center justify-center px-10"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", zIndex: 100 }}
    >
      <View
        className="items-center px-10 py-10 rounded-3xl"
        style={{ backgroundColor: config.backgroundColor, gap: 16, maxWidth: 480 }}
      >
        <Text
          style={{ fontSize: 28, fontWeight: "800", color: config.textColor, textAlign: "center" }}
        >
          Are you still there?
        </Text>
        <Text
          style={{ fontSize: 16, color: `${config.textColor}99`, textAlign: "center" }}
        >
          Your order will be cancelled in {secondsLeft}s due to inactivity.
        </Text>
        <Pressable
          onPress={onContinue}
          style={{
            marginTop: 8,
            paddingHorizontal: 36,
            paddingVertical: 16,
            borderRadius: 16,
            backgroundColor: config.primaryColor,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>
            Yes, I&apos;m still here
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
