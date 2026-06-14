import type { KioskConfig } from "@/types/kiosk";
import { Image, Pressable, Text, View } from "react-native";

/**
 * Idle / attract screen. Shown whenever no customer is mid-order. Tapping it
 * starts a session. This is the only screen where a pending config change is
 * allowed to take effect (the entry screen flushes pending → config on idle),
 * so the customer-facing theme never changes during an order.
 */
export function KioskAttractScreen({
  config,
  onStart,
}: {
  config: KioskConfig;
  onStart: () => void;
}) {
  return (
    <Pressable
      onPress={onStart}
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: config.backgroundColor }}
    >
      {config.heroImageUrl ? (
        <Image
          source={{ uri: config.heroImageUrl }}
          className="absolute inset-0 w-full h-full"
          resizeMode="cover"
        />
      ) : null}

      <View className="items-center px-8">
        {config.logoUrl ? (
          <Image
            source={{ uri: config.logoUrl }}
            className="w-40 h-40 mb-8"
            resizeMode="contain"
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
      </View>
    </Pressable>
  );
}
