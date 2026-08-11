import type { KioskConfig } from "@/types/kiosk";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

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
 * Holding the logo opens the manager-PIN-gated diagnostics/settings screen
 * via `onLogoLongPress`, without starting a customer session. The long-press
 * target wraps the whole header block (not just the logo image) so
 * diagnostics stays reachable even when no logo is configured.
 */
export function KioskAttractScreen({
  config,
  onStart,
  onLogoLongPress,
}: {
  config: KioskConfig;
  onStart: () => void;
  onLogoLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onStart}
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: config.backgroundColor }}
    >
      <Pressable
        onPress={onStart}
        onLongPress={onLogoLongPress}
        delayLongPress={2000}
        className="items-center justify-center px-8"
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

        <View
          className="mt-10 px-10 py-4 rounded-full "
          style={{ backgroundColor: config.primaryColor }}
        >
          <Text className="text-white text-xl font-semibold">
            Tap anywhere to start
          </Text>
        </View>
      </Pressable>
    </Pressable>
  );
}
