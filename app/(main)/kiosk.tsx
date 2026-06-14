import { KioskAttractScreen } from "@/components/kiosk/KioskAttractScreen";
import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { useKioskProfileStore } from "@/stores/useKioskProfileStore";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/**
 * Kiosk entry point.
 *
 * Data layer: `useKioskProfile` resolves the kiosk_profiles config for the
 * selected self_service station (station.kiosk_profile_id → location's active
 * profile → defaults) and polls for edits. Config changes fetched mid-order are
 * held back and only applied when the kiosk returns to idle (see
 * useKioskProfileStore), so the theme never shifts under an active customer.
 *
 * Routing lands self_service stations here (lib/authFlow.ts,
 * app/(main)/_layout.tsx). Native lock-task infra (native/kiosk/LockTask.ts)
 * remains available.
 *
 * Next: build the ordering flow (menu → cart → checkout) where the placeholder
 * "ordering" branch is below.
 */
export default function KioskScreen() {
  const { config, status, error } = useKioskProfile();
  const isIdle = useKioskProfileStore((s) => s.isIdle);
  const setIdle = useKioskProfileStore((s) => s.setIdle);

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

  if (isIdle) {
    return (
      <KioskAttractScreen config={config} onStart={() => setIdle(false)} />
    );
  }

  // Active session placeholder — the ordering flow gets built here. Returning
  // to idle commits any config change that arrived during the session.
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: config.backgroundColor }}
    >
      <Text
        className="text-3xl font-bold"
        style={{ color: config.headerTextColor }}
      >
        Ordering — {config.templateId}
      </Text>
      <Text className="mt-2" style={{ color: config.textColor }}>
        {config.profileName} · {config.orientation}
      </Text>
      <Pressable
        onPress={() => setIdle(true)}
        className="mt-8 px-6 py-3 rounded-full"
        style={{ backgroundColor: config.primaryColor }}
      >
        <Text className="text-white font-semibold">Cancel / Done</Text>
      </Pressable>
    </View>
  );
}
