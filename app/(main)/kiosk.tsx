import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { ActivityIndicator, Text, View } from "react-native";

/**
 * Kiosk entry point.
 *
 * The previous kiosk UI was removed for a full rebuild. The data layer is now
 * wired: `useKioskProfile` resolves the kiosk_profiles config for the selected
 * self_service station (via stations.kiosk_profile_id, falling back to the
 * location's active profile, then defaults) and keeps it live over realtime.
 *
 * Routing still lands self_service stations here (see lib/authFlow.ts and
 * app/(main)/_layout.tsx). Native lock-task infra (native/kiosk/LockTask.ts)
 * remains available for the rebuild.
 *
 * Next: build the kiosk screens (attract → menu → cart → checkout) on top of
 * `config`.
 */
export default function KioskScreen() {
  const { config, status, error } = useKioskProfile();

  // No config yet (first ever load, nothing cached). A persisted config renders
  // immediately even while the background poll refreshes.
  if (!config) {
    if (status === "error") {
      return (
        <View className="flex-1 items-center justify-center bg-black px-8">
          <Text className="text-white text-xl font-semibold">
            Kiosk failed to load
          </Text>
          <Text className="text-gray-400 mt-2 text-center">
            {error ?? "Unknown error"}
          </Text>
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator color="#FFFFFF" />
        <Text className="text-gray-400 mt-3">Loading kiosk…</Text>
      </View>
    );
  }

  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: config.backgroundColor }}
    >
      {config.logoUrl ? null : null}
      <Text
        className="text-3xl font-bold"
        style={{ color: config.headerTextColor }}
      >
        {config.welcomeMessage}
      </Text>
      <Text className="mt-2" style={{ color: config.textColor }}>
        {config.profileName} · {config.templateId} · {config.orientation}
      </Text>
      <View
        className="mt-6 px-6 py-3 rounded-full"
        style={{ backgroundColor: config.primaryColor }}
      >
        <Text className="text-white font-semibold">Rebuild in progress</Text>
      </View>
    </View>
  );
}
