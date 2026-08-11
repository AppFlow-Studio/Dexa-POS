import { KioskAttractScreen } from "@/components/kiosk/KioskAttractScreen";
import { KioskTemplateRouter } from "@/components/kiosk/KioskTemplateRouter";
import { KioskAttractCarouselB } from "@/components/kiosk/template-b/KioskAttractCarouselB";
import { KioskAdminPinModal } from "@/components/kiosk/shared/KioskAdminPinModal";
import { KioskDiagnosticsScreen } from "@/components/kiosk/shared/KioskDiagnosticsScreen";
import { KioskScaleProvider } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskOrientation } from "@/hooks/kiosk/useKioskOrientation";
import {
    kioskProfileQueryKeys,
    useKioskProfile,
} from "@/hooks/kiosk/useKioskProfile";
import { prefetchKioskImages } from "@/lib/kioskMediaPrefetch";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useKioskProfileStore } from "@/stores/useKioskProfileStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
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
  const clearCart = useKioskCartStore((s) => s.clear);
  const queryClient = useQueryClient();

  const [showPinModal, setShowPinModal] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Warm the image cache once per profile (not on every render — configsEqual
  // in the store keeps `config` referentially stable across identical polls,
  // so this only re-fires when the profile actually changes). Covers both
  // orientations' idle/banner images, not just the active one, so flipping
  // orientation later doesn't cold-load images for the first time.
  useEffect(() => {
    if (config) prefetchKioskImages(config);
  }, [config]);

  const handleRefreshKioskConfig = useCallback(() => {
    const stationId =
      useStoreSettingsStore.getState().selectedStation?.id ?? null;
    const kioskProfileId =
      useStoreSettingsStore.getState().selectedStation?.kiosk_profile_id ??
      null;
    // Return the promise so callers (e.g. the settings Sync button) can await
    // the refetch and show a spinner.
    return queryClient.invalidateQueries({
      queryKey: kioskProfileQueryKeys.forStation(stationId, kioskProfileId),
    });
  }, [queryClient]);

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
      <KioskScaleProvider>
        <KioskDiagnosticsScreen
          config={config}
          onClose={() => setShowDiagnostics(false)}
          onRefreshKioskConfig={handleRefreshKioskConfig}
        />
      </KioskScaleProvider>
    );
  }

  const AttractComponent =
    config.templateId === "template_b" || config.templateId === "template_c"
      ? KioskAttractCarouselB
      : KioskAttractScreen;

  // Attract (idle) or the active ordering session. The PIN gate + settings
  // entry live at this level so they work from either state. Returning to idle
  // clears the cart and commits any config change that arrived mid-session.
  return (
    <KioskScaleProvider>
      {isIdle ? (
        <AttractComponent
          config={config}
          onStart={() => setIdle(false)}
          onLogoLongPress={() => setShowPinModal(true)}
        />
      ) : (
        <KioskTemplateRouter
          config={config}
          onExit={() => {
            clearCart();
            setIdle(true);
          }}
        />
      )}

      {/* Manager-PIN gate opened by the secret 5-tap on the attract screen. */}
      <KioskAdminPinModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onVerified={() => {
          setShowPinModal(false);
          setShowDiagnostics(true);
        }}
      />

      {/* DEV builds only: an always-visible shortcut to open Kiosk Settings on
          the emulator without the secret gesture or a manager PIN. Stripped
          from production bundles (`__DEV__` is false there). */}
      {__DEV__ ? (
        <Pressable
          onPress={() => setShowDiagnostics(true)}
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            backgroundColor: "rgba(0,0,0,0.6)",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            zIndex: 100,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>
            ⚙︎ Settings (dev)
          </Text>
        </Pressable>
      ) : null}
    </KioskScaleProvider>
  );
}
