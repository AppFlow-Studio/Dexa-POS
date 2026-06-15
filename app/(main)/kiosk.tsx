import { KioskAttractScreen } from "@/components/kiosk/KioskAttractScreen";
import { KioskTemplateRouter } from "@/components/kiosk/KioskTemplateRouter";
import { KioskAdminPinModal } from "@/components/kiosk/shared/KioskAdminPinModal";
import { KioskDiagnosticsScreen } from "@/components/kiosk/shared/KioskDiagnosticsScreen";
import { useKioskOrientation } from "@/hooks/kiosk/useKioskOrientation";
import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useKioskProfileStore } from "@/stores/useKioskProfileStore";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

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
  const clearCart = useKioskCartStore((s) => s.clear);

  const [showPinModal, setShowPinModal] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Lock the device to the configured orientation. Re-locks when the config's
  // orientation changes (e.g. a committed edit).
  useKioskOrientation(config?.orientation);

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

  if (showDiagnostics) {
    return (
      <KioskDiagnosticsScreen
        config={config}
        onClose={() => setShowDiagnostics(false)}
      />
    );
  }

  if (isIdle) {
    return (
      <>
        <KioskAttractScreen
          config={config}
          onStart={() => setIdle(false)}
          onLogoLongPress={() => setShowPinModal(true)}
        />
        <KioskAdminPinModal
          visible={showPinModal}
          onClose={() => setShowPinModal(false)}
          onVerified={() => {
            setShowPinModal(false);
            setShowDiagnostics(true);
          }}
        />
      </>
    );
  }

  // Active session — Template A ordering flow. Returning to idle clears the
  // cart and commits any config change that arrived during the session.
  return (
    <KioskTemplateRouter
      config={config}
      onExit={() => {
        clearCart();
        setIdle(true);
      }}
    />
  );
}
