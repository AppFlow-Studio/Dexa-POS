import { KioskSecretAccessCorner } from "@/components/kiosk/shared/KioskSecretAccessCorner";
import type { KioskConfig } from "@/types/kiosk";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Idle / attract screen. Shown whenever no customer is mid-order. Tapping it
 * starts a session. This is the only screen where a pending config change is
 * allowed to take effect (the entry screen flushes pending → config on idle),
 * so the customer-facing theme never changes during an order.
 *
 * Template A's idle screen is logo/welcome-message/button only, on a plain
 * background — no idle image or carousel here (that's Template B/C's
 * KioskAttractCarouselB). Idle images configured for this profile are
 * unused by Template A.
 *
 * Structure: a full-screen "tap anywhere to start" Pressable underlay, the
 * centered content (box-none so taps fall through to the underlay), and the
 * secret admin-access corner ON TOP. Keeping the corner a top-level sibling
 * (not nested in the start Pressable) guarantees it captures its own taps —
 * five taps in the top-left corner open the manager-PIN-gated settings.
 */
export function KioskAttractScreen({
  config,
  onStart,
  onLogoLongPress,
}: {
  config: KioskConfig;
  onStart: () => void;
  /** Opens the manager-PIN-gated kiosk settings (via the secret corner). */
  onLogoLongPress?: () => void;
}) {
  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      {/* Tap-anywhere-to-start underlay. */}
      <Pressable
        onPress={onStart}
        style={StyleSheet.absoluteFill}
        android_disableSound
      />

      {/* Centered content. box-none: taps on the logo/text fall through to the
          underlay (so "tap anywhere" still starts); the button handles its own
          press. */}
      <View
        pointerEvents="box-none"
        className="flex-1 items-center justify-center px-8"
      >
        {config.logoUrl ? (
          <Image
            source={{ uri: config.logoUrl }}
            style={{ width: 160, height: 160, marginBottom: 32 }}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : null}

        <Text
          className="text-5xl font-bold text-center p-3"
          style={{ color: config.headerTextColor }}
        >
          {config.welcomeMessage}
        </Text>

        <Pressable
          onPress={onStart}
          className="mt-10 px-10 py-4 rounded-full"
          style={{ backgroundColor: config.primaryColor }}
        >
          <Text className="text-white text-xl font-semibold">
            Tap anywhere to start
          </Text>
        </Pressable>
      </View>

      {/* Secret admin access — 5 taps in the top-left corner. */}
      {onLogoLongPress ? (
        <KioskSecretAccessCorner
          onTrigger={onLogoLongPress}
          tint={config.headerTextColor}
        />
      ) : null}
    </View>
  );
}
