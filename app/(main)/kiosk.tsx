import { KioskAttractScreen } from "@/components/kiosk/KioskAttractScreen";
import { KioskTemplateRouter } from "@/components/kiosk/KioskTemplateRouter";
import { KioskAdminPinModal } from "@/components/kiosk/shared/KioskAdminPinModal";
import { useKioskDialog } from "@/components/kiosk/shared/KioskDialog";
import { KioskErrorBoundary } from "@/components/kiosk/shared/KioskErrorBoundary";
import { KioskScaleProvider } from "@/components/kiosk/shared/KioskScaleProvider";
import {
    checkKioskAccess,
    type KioskAccessVerdict,
} from "@/components/kiosk/shared/kioskAccessCheck";
import { useKioskOrientation } from "@/hooks/kiosk/useKioskOrientation";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { isKioskCheckoutHeld } from "@/components/kiosk/shared/checkoutGuard";
import {
    kioskProfileQueryKeys,
    useKioskProfile,
} from "@/hooks/kiosk/useKioskProfile";
import {
    prefetchKioskImages,
    prefetchKioskMenuImages,
} from "@/lib/kioskMediaPrefetch";
import {
    channelForStationType,
    selectVisibleMenus,
} from "@/lib/menu/stationMenuScope";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useKioskProfileStore } from "@/stores/useKioskProfileStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useQueryClient } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    InteractionManager,
    Pressable,
    Text,
    View,
} from "react-native";

// Staff-only (5-tap corner + manager PIN), and the largest kiosk module by far
// with the profile editor and update checker behind it — loaded when opened,
// not with every kiosk start.
const KioskDiagnosticsScreen = lazy(() =>
  import("@/components/kiosk/shared/KioskDiagnosticsScreen").then((m) => ({
    default: m.KioskDiagnosticsScreen,
  })),
);

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
  const supabase = useSupabaseClient();
  const { config, status, error } = useKioskProfile();
  const isIdle = useKioskProfileStore((s) => s.isIdle);
  const setIdle = useKioskProfileStore((s) => s.setIdle);
  const clearCart = useKioskCartStore((s) => s.clear);
  const queryClient = useQueryClient();

  // Inter, for the customer-facing kiosk only. The POS and KDS keep the
  // system face; this is the one surface a member of the public reads, and the
  // stock Android face is most of what made it look like a stock Android app.
  // Load failure is not fatal — `useKioskTheme` falls back to weights on the
  // system face, so the kiosk renders either way (see kioskDesign).
  useFonts({
    "Inter-Medium": require("@/assets/fonts/Inter-Medium.ttf"),
    "Inter-Bold": require("@/assets/fonts/Inter-Bold.ttf"),
  });

  const [showPinModal, setShowPinModal] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  // Start-screen stops, drawn in the kiosk's own themed dialog rather than a
  // native alert. Only reachable from the attract screen, so `config` is set.
  const { show: showNotice, dialog: notice } = useKioskDialog(
    config ?? undefined,
  );

  // "Tap to start" answers at once. The access check (billing, station still
  // active) used to run first, two round trips with nothing on screen; it now
  // runs while the customer reads the order-type screen, and the template
  // awaits `ensureAccess` before it reveals the menu. Checkout checks again
  // before creating the order and before charging, so nothing is sold on
  // this result alone.
  const accessCheck = useRef<Promise<KioskAccessVerdict> | null>(null);

  const handleStart = () => {
    const stationId = useStoreSettingsStore.getState().selectedStation?.id;
    const location = useStoreSettingsStore.getState().selectedStore;
    if (!stationId || !location?.id || !location.merchant_id || isKioskCheckoutHeld(stationId)) {
      showNotice("Staff assistance required", "Please ask a staff member to check this kiosk's payment status.");
      return;
    }
    accessCheck.current = checkKioskAccess(supabase);
    setIdle(false);
  };

  const ensureAccess = useCallback(async () => {
    const verdict = await (accessCheck.current ?? checkKioskAccess(supabase));
    if (verdict.ok) return true;
    clearCart();
    setIdle(true);
    showNotice(verdict.title, verdict.message);
    return false;
  }, [supabase, clearCart, setIdle, showNotice]);

  // Warm the image cache once per profile (not on every render — configsEqual
  // in the store keeps `config` referentially stable across identical polls,
  // so this only re-fires when the profile actually changes). Covers both
  // orientations' idle/banner images, not just the active one, so flipping
  // orientation later doesn't cold-load images for the first time.
  useEffect(() => {
    if (config) prefetchKioskImages(config);
  }, [config]);

  // Keep every kiosk menu photo in the disk cache: once after start-up, then
  // after each menu sync (only new photos download). Read from the store
  // rather than subscribed to, so a sync doesn't re-render this screen.
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    const run = () => {
      const menu = useMenuStore.getState();
      const station = useStoreSettingsStore.getState().selectedStation;
      prefetchKioskMenuImages(
        selectVisibleMenus(
          menu.menus,
          menu.stationMenuScopes,
          station?.id ?? null,
          channelForStationType(station?.station_type),
        ),
        isCancelled,
      );
    };
    const task = InteractionManager.runAfterInteractions(run);
    const unsubscribe = useMenuStore.subscribe((state, prev) => {
      if (
        state.menus !== prev.menus ||
        state.stationMenuScopes !== prev.stationMenuScopes
      ) {
        run();
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
      unsubscribe();
    };
  }, []);

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

  // Lock the device to the configured orientation and resolve which one the
  // layouts should render for. The device-local override (Kiosk Settings →
  // Menu Layout) wins over the profile, and its "Auto" mode follows the panel.
  const orientation = useKioskOrientation(config?.orientation);

  // Everything downstream reads `config.orientation`, so the resolved value is
  // folded back into the config rather than threaded through as a second prop.
  // Identity is preserved when nothing changed — `configsEqual` in the store
  // keeps `config` referentially stable, and this memo must not undo that.
  const effectiveConfig = useMemo(
    () =>
      !config || config.orientation === orientation
        ? config
        : { ...config, orientation },
    [config, orientation],
  );

  // No config yet (first ever load, nothing cached). A persisted config renders
  // immediately even while the background poll refreshes.
  // Inside KioskScaleProvider like every other kiosk screen: outside it these
  // fell back to the POS scale, which a phone floors at 0.6 — 10px copy.
  if (!config || !effectiveConfig) {
    if (status === "error") {
      return (
        <KioskScaleProvider>
          <View className="flex-1 items-center justify-center bg-black px-8">
            <Text className="text-white text-xl font-semibold text-center">
              Kiosk failed to load
            </Text>
            <Text className="text-gray-400 text-base mt-2 text-center">
              {error ?? "Unknown error"}
            </Text>
          </View>
        </KioskScaleProvider>
      );
    }
    return (
      <KioskScaleProvider>
        <View className="flex-1 items-center justify-center bg-black">
          <ActivityIndicator color="#FFFFFF" />
          <Text className="text-gray-400 text-base mt-3">Loading kiosk…</Text>
        </View>
      </KioskScaleProvider>
    );
  }

  if (showDiagnostics) {
    return (
      <KioskScaleProvider minScale={1}>
        {/* Raw config, not `effectiveConfig` — this screen inspects and edits
            the profile, so it must show what the profile actually says. It
            resolves the device's own orientation override itself. */}
        <Suspense
          fallback={
            <View className="flex-1 items-center justify-center bg-gray-50">
              <ActivityIndicator />
            </View>
          }
        >
          <KioskDiagnosticsScreen
            config={config}
            onClose={() => setShowDiagnostics(false)}
            onRefreshKioskConfig={handleRefreshKioskConfig}
          />
        </Suspense>
      </KioskScaleProvider>
    );
  }

  // Attract (idle) or the active ordering session. The PIN gate + settings
  // entry live at this level so they work from either state. Returning to idle
  // clears the cart and commits any config change that arrived mid-session.
  //
  // The customer-facing flow is wrapped in KioskErrorBoundary so a render crash
  // self-heals back to idle (no staff stands at a kiosk). The PIN gate + dev
  // shortcut sit OUTSIDE it, so staff can always reach settings even mid-crash.
  return (
    <KioskScaleProvider>
      <KioskErrorBoundary
        onReset={() => {
          setShowDiagnostics(false);
          clearCart();
          setIdle(true);
        }}
        backgroundColor={effectiveConfig.backgroundColor}
        textColor={effectiveConfig.headerTextColor}
        accentColor={effectiveConfig.primaryColor}
      >
        {isIdle ? (
          <KioskAttractScreen
            config={effectiveConfig}
            onStart={handleStart}
            onLogoLongPress={() => setShowPinModal(true)}
          />
        ) : (
          <KioskTemplateRouter
            config={effectiveConfig}
            onExit={() => {
              clearCart();
              setIdle(true);
            }}
            ensureAccess={ensureAccess}
          />
        )}
      </KioskErrorBoundary>

      {notice}

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
