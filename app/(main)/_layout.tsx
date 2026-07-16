import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import Header from "@/components/Header";
import MenuSearchSheet from "@/components/menu/MenuSearchSheet";
import PaymentDetailBottomSheet from "@/components/menu/PaymentDetailBottomSheet";
import NotificationBottomSheet from "@/components/notifications/NotificationBottomSheet";
import OnlineOrderDrawer from "@/components/online-orders/OnlineOrderDrawer";
import OnlineOrderEdgeTab from "@/components/online-orders/OnlineOrderEdgeTab";
import MyProfilePanel from "@/components/profile/MyProfilePanel";
import { LocationRealtimeProvider } from "@/contexts/LocationRealtimeProvider";
import { useKioskOrientation } from "@/hooks/kiosk/useKioskOrientation";
import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { useKdsOnlineOrdersBootstrap } from "@/hooks/pos/useKdsOnlineOrdersBootstrap";
import { useOrderSyncRecovery } from "@/hooks/pos/useOrderSyncRecovery";
import type { OrderBroadcastPayload } from "@/hooks/realtime/useOrdersRealtime";
import { useTableSessionInit } from "@/hooks/useTableSessionInit";
import { setHeaderHeight } from "@/lib/headerHeight";
import { isOnlineOrderSource } from "@/lib/orderSource";
import { colors, spinnerColor } from "@/lib/theme";
import { useColorScheme } from "@/lib/useColorScheme";
import { hydrateDrawerSession } from "@/services/cashDrawerService";
import KDSSoundService from "@/services/kds/kdsSoundService";
import { useKDSStore } from "@/stores/useKDSStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import {
  selectIsOpen as selectModifierOpen,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useProfileOverlayStore } from "@/stores/useProfileOverlayStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { OrderPayload, PaymentPayload } from "@/types/real-time";
import { useAuth } from "@clerk/clerk-expo";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { PortalHost } from "@rn-primitives/portal";
import { Redirect, Slot, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  unstable_batchedUpdates,
  View,
} from "react-native";
import { hintNativeGc } from "@/lib/nativeMemory";
import {
  KEY_FANOUT_KDS_MS,
  KEY_FANOUT_ORDER_STORE_MS,
  KEY_FANOUT_PREV_ORDERS_MS,
} from "@/lib/telemetry/keys";
import {
  noteBroadcastFanoutEnd,
  recordSpan,
  setCurrentRoute,
} from "@/lib/telemetry/registry";
import { SafeAreaView } from "react-native-safe-area-context";
/** Side-effect component: keeps POS orders in sync when realtime drops */
function OrderSyncRecoveryBridge({ locationId }: { locationId: string }) {
  useOrderSyncRecovery(locationId);
  return null;
}

export default function MainLayout() {
  const { colorScheme } = useColorScheme();
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();
  const isProfileOpen = useProfileOverlayStore((state) => state.isOpen);
  const closeProfile = useProfileOverlayStore((state) => state.closeProfile);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  // The modifier customization screen renders inside MenuSection with a big
  // internal zIndex, but the online-order edge tab + drawer live at the root
  // stacking context (zIndex 150) and would otherwise sit on top of it —
  // blocking the modifier UI and its qty +/- buttons. Hide them while the
  // modifier screen is up.
  const isModifierScreenOpen = useModifierSidebarStore(selectModifierOpen);
  const isKDS = selectedStation?.station_type === "kds";
  const isKiosk = selectedStation?.station_type === "self_service";
  const isKioskRoute = pathname === "/kiosk" || pathname.endsWith("/kiosk");
  const isFullScreenStation = isKDS || isKiosk || isKioskRoute;
  const disableKeyboardAvoiding =
    pathname === "/order-processing" || pathname.endsWith("/order-processing");

  // Lock orientation for kiosk stations; unlock when on a non-kiosk station
  // so switching station types doesn't leave the device stuck in kiosk
  // orientation. The query is enabled/disabled implicitly by stationId.
  const { config: kioskConfig } = useKioskProfile();
  useKioskOrientation(
    isKiosk || isKioskRoute ? kioskConfig?.orientation : undefined,
  );

  const notificationSheetRef = useRef<BottomSheetMethods>(null);
  const paymentDetailSheetRef = useRef<BottomSheetMethods>(null);
  const menuSearchSheetRef = useRef<BottomSheetMethods>(null);
  const setSheetRef = useNotificationSheetStore((state) => state.setSheetRef);
  const clearSheetRef = useNotificationSheetStore(
    (state) => state.clearSheetRef,
  );
  const { setSearchSheetRef, clearSearchSheetRef } =
    useMenuManagementSearchStore();

  // Complementary mitigation to the screens animation fix (lib/screenConfig.ts):
  // hint a GC after every navigation so native cleaners drain promptly.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      hintNativeGc(pathname);
    });
    return () => task.cancel();
  }, [pathname]);

  // Wave-0 telemetry: tag long-task samples with the screen they blocked.
  useEffect(() => {
    setCurrentRoute(pathname)
  }, [pathname])

  useEffect(() => {
    if (!isKDS) {
      const ref = notificationSheetRef as React.RefObject<BottomSheetMethods>;
      setSheetRef(ref);
      return () => clearSheetRef(ref);
    }
  }, [setSheetRef, clearSheetRef, isKDS]);

  useEffect(() => {
    const ref = menuSearchSheetRef as React.RefObject<BottomSheetMethods>;
    setSearchSheetRef(ref);
    return () => clearSearchSheetRef(ref);
  }, [setSearchSheetRef, clearSearchSheetRef]);

  useEffect(() => {
    if (__DEV__ && !isFullScreenStation) {
      const orderStore = useOrderStore.getState();
      console.log("🔧 [MainLayout Init] Station context:", {
        hasStation: !!orderStore.currentStation,
        stationId: orderStore.currentStationId,
        viewScope: orderStore.currentStation?.view_scope,
        stationName: orderStore.currentStation?.station_name,
        timestamp: new Date().toISOString(),
      });
    }
  }, [isFullScreenStation]);

  useEffect(() => {
    if (!isKDS) {
      const ref = paymentDetailSheetRef as React.RefObject<BottomSheetMethods>;
      usePaymentDetailSheetStore.getState().setBottomSheetRef(ref);
      return () =>
        usePaymentDetailSheetStore.getState().clearBottomSheetRef(ref);
    }
  }, [paymentDetailSheetRef, isKDS]);

  const soundServiceRef = useRef<KDSSoundService | null>(null);

  useEffect(() => {
    if (isFullScreenStation) return;
    const service = new KDSSoundService();
    soundServiceRef.current = service;
    service.init();
    return () => {
      service.dispose();
      soundServiceRef.current = null;
    };
  }, [isFullScreenStation]);

  const notifConfig = useLocationConfigStore((s) => s.config.notifications);
  useEffect(() => {
    if (isFullScreenStation || !soundServiceRef.current) return;
    soundServiceRef.current.updateConfig({
      enabled: notifConfig.soundEnabled,
      online: notifConfig.onlineOrderSound,
      kiosk: notifConfig.kioskOrderSound,
      third_party: notifConfig.thirdPartyOrderSound,
      pos: "none",
      default: notifConfig.thirdPartyOrderSound,
    });
  }, [isKDS, notifConfig]);

  useTableSessionInit({ skip: isKDS });

  // KDS skips useOrdersQuery, so seed the shared order store with active
  // online orders for the edge tab/drawer (broadcasts keep them live after).
  useKdsOnlineOrdersBootstrap({
    locationId: selectedStore?.id,
    enabled: isKDS,
  });

  useEffect(() => {
    if (isFullScreenStation || !selectedStation || !selectedStore) return;
    const supabase = getOrderStoreSupabaseClient();
    if (!supabase) return;
    hydrateDrawerSession(supabase, selectedStation.id, selectedStore.id)
      .then((hasSession) => {
        const store =
          require("@/stores/useCashDrawerStore").useCashDrawerStore.getState();
        if (!hasSession && store.drawerId) {
          store.setShouldPromptOpen(true);
        }
      })
      .catch((err) => {
        console.warn("[MainLayout] Cash drawer hydration failed:", err);
      });
  }, [isFullScreenStation, selectedStation?.id, selectedStore?.id]);

  const handleOrderChangeKDS = useCallback((payload: OrderPayload) => {
    const broadcastPayload = payload as unknown as OrderBroadcastPayload;
    useKDSStore.getState().handleOrderBroadcast(broadcastPayload);
    // Also feed ONLINE orders into the shared order store so the online-orders
    // edge tab/drawer stays live on KDS. Gated to online source (or orders the
    // store already tracks, so status/DELETE updates land) — KDS doesn't need
    // the full POS order workspace.
    const order = broadcastPayload.data?.order;
    if (order) {
      const orderStore = useOrderStore.getState();
      if (
        isOnlineOrderSource(order.order_source) ||
        orderStore.dbOrderIdIndex[order.id] ||
        orderStore.ordersById[order.id]
      ) {
        orderStore._handleOrderBroadcast(broadcastPayload);
      }
    }
  }, []);

  const handleOrderChange = useCallback((payload: OrderPayload) => {
    const broadcastPayload = payload as unknown as OrderBroadcastPayload;
    if (__DEV__) {
      console.log("🔔 [MainLayout] Broadcast received:", {
        operation: broadcastPayload.operation,
        orderId: broadcastPayload.data?.order?.id,
        orderNumber: broadcastPayload.data?.order?.order_number,
        stationId: broadcastPayload.data?.order?.station_id,
        stationName: broadcastPayload.data?.order?.station_name,
      });
    }
    unstable_batchedUpdates(() => {
      const t0 = performance.now();
      useOrderStore.getState()._handleOrderBroadcast(broadcastPayload);
      const t1 = performance.now();
      recordSpan(KEY_FANOUT_ORDER_STORE_MS, t1 - t0);
      usePreviousOrdersStore.getState()._handleOrderBroadcast(broadcastPayload);
      const t2 = performance.now();
      recordSpan(KEY_FANOUT_PREV_ORDERS_MS, t2 - t1);
      // Keep the KDS store warm on POS stations too — the /kds screen relies
      // on broadcasts while realtime is connected (its polling is disabled
      // then, see kds.tsx schedulePoll), and its own pre-gate skips
      // non-kitchen-relevant broadcasts cheaply.
      useKDSStore.getState().handleOrderBroadcast(broadcastPayload);
      recordSpan(KEY_FANOUT_KDS_MS, performance.now() - t2);
    });
    noteBroadcastFanoutEnd();
    if (broadcastPayload.operation === "INSERT") {
      const src = broadcastPayload.data?.order?.order_source;
      if (src && src !== "pos" && src !== "in_store") {
        soundServiceRef.current?.playForSource(src);
      }
    }
  }, []);

  const handlePaymentChange = useCallback((payload: PaymentPayload) => {
    if (__DEV__) {
      console.log("[MainLayout] Payment changed:", payload);
    }
  }, []);

  if (!selectedStore || !selectedStore?.id) {
    return <Redirect href="/login" />;
  }

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-screen">
        <ActivityIndicator size="large" color={spinnerColor} />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/login" />;
  }

  if (isKDS) {
    return (
      <LocationRealtimeProvider
        locationId={selectedStore?.id}
        maxReconnectAttempts={20}
        callbacks={{
          onOrderChange: handleOrderChangeKDS,
          onPaymentChange: handlePaymentChange,
        }}
      >
        <SafeAreaView
          edges={["top", "right", "bottom", "left"]}
          style={{ flex: 1, backgroundColor: colors.screen }}
        >
          <StatusBar style="light" translucent />
          <Slot />
          {/* Online-orders edge tab + drawer on KDS too. kdsMode hides the
              POS-only navigation (board/detail routes have no header/back
              affordance in the KDS layout). */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 150,
            }}
            pointerEvents="box-none"
          >
            <OnlineOrderEdgeTab />
            <OnlineOrderDrawer kdsMode />
          </View>
        </SafeAreaView>
      </LocationRealtimeProvider>
    );
  }

  // Kiosk (self-service) — plain full-screen layout with none of the POS
  // bottom sheets (MenuSearchSheet, NotificationBottomSheet, PaymentBottomSheet,
  // PaymentDetailBottomSheet) or online-order chrome that would render on top
  // of the customer-facing UI.
  if (isKiosk || isKioskRoute) {
    return (
      <LocationRealtimeProvider
        locationId={selectedStore?.id}
        callbacks={{
          onOrderChange: handleOrderChange,
          onPaymentChange: handlePaymentChange,
        }}
      >
        <SafeAreaView
          edges={["top", "right", "bottom", "left"]}
          style={{ flex: 1, backgroundColor: colors.screen }}
        >
          <StatusBar style="light" translucent />
          <Slot />
        </SafeAreaView>
      </LocationRealtimeProvider>
    );
  }

  return (
    <LocationRealtimeProvider
      locationId={selectedStore?.id}
      callbacks={{
        onOrderChange: handleOrderChange,
        onPaymentChange: handlePaymentChange,
      }}
    >
      <OrderSyncRecoveryBridge locationId={selectedStore.id} />
      <KeyboardAvoidingView
        key={colorScheme}
        behavior={
          disableKeyboardAvoiding
            ? undefined
            : Platform.OS === "ios"
              ? "padding"
              : "height"
        }
        enabled={!disableKeyboardAvoiding}
        className="flex-1"
        style={{ backgroundColor: colors.screen }}
      >
        <SafeAreaView
          edges={["top"]}
          className="flex-1"
          style={{ backgroundColor: colors.screen }}
        >
          <StatusBar style={"light"} translucent />

          <View
            className="flex-1 flex-row"
            style={{ backgroundColor: colors.screen }}
          >
            <View
              className="flex-1 flex-col"
              style={{ backgroundColor: colors.screen }}
            >
              <View
                className="z-50"
                style={{
                  backgroundColor: "transparent",
                  borderBottomWidth: 0,
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
                onLayout={(event) =>
                  setHeaderHeight(event.nativeEvent.layout.height)
                }
              >
                <Header />
              </View>
              <View
                className="flex-1"
                style={disableKeyboardAvoiding ? { zIndex: 100 } : undefined}
              >
                <Slot />
              </View>
            </View>
          </View>
          <NotificationBottomSheet
            bottomSheetRef={
              notificationSheetRef as React.RefObject<BottomSheetMethods>
            }
            onClose={() => {}}
          />
          <PaymentBottomSheet />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
            }}
            pointerEvents="box-none"
          >
            <PaymentDetailBottomSheet ref={paymentDetailSheetRef} />
          </View>
          {/* Global online-orders edge tab + drawer. zIndex 150: above
              PaymentDetail (100) so incoming orders stay reachable
              mid-payment, below MenuSearchSheet (200). Hidden while the
              modifier screen is up so it can't overlay the modifier UI. */}
          {!isModifierScreenOpen && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 150,
              }}
              pointerEvents="box-none"
            >
              <OnlineOrderEdgeTab />
              <OnlineOrderDrawer />
            </View>
          )}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 200,
            }}
            pointerEvents="box-none"
          >
            <MenuSearchSheet ref={menuSearchSheetRef} />
          </View>
          <Modal
            visible={isProfileOpen}
            animationType="none"
            presentationStyle="fullScreen"
            onRequestClose={closeProfile}
          >
            <MyProfilePanel onClose={closeProfile} />
            <PortalHost name="profile-overlay" />
          </Modal>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </LocationRealtimeProvider>
  );
}
