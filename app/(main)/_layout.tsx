import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import Header from "@/components/Header";
import PaymentDetailBottomSheet from "@/components/menu/PaymentDetailBottomSheet";
import NotificationBottomSheet from "@/components/notifications/NotificationBottomSheet";
import { LocationRealtimeProvider } from "@/contexts/LocationRealtimeProvider";
import type { OrderBroadcastPayload } from "@/hooks/realtime/useOrdersRealtime";
import { useKDSStore } from "@/stores/useKDSStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { OrderPayload, PaymentPayload } from "@/types/real-time";
import { useAuth } from "@clerk/clerk-expo";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Redirect, Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useOrderSyncRecovery } from "@/hooks/pos/useOrderSyncRecovery";
import { useTableSessionInit } from "@/hooks/useTableSessionInit";
import { colors, spinnerColor } from "@/lib/theme";
import React, { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
/** Side-effect component: keeps POS orders in sync when realtime drops */
function OrderSyncRecoveryBridge({ locationId }: { locationId: string }) {
  useOrderSyncRecovery(locationId);
  return null;
}

export default function MainLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore)
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const isKDS = selectedStation?.station_type === "kds";

  const notificationSheetRef = useRef<BottomSheetMethods>(null);
  const paymentBottomSheetRef = useRef<BottomSheetMethods>(null);
  const paymentDetailSheetRef = useRef<BottomSheetMethods>(null);
  const { setSheetRef } = useNotificationSheetStore();

  useEffect(() => {
    if (!isKDS) {
      setSheetRef(notificationSheetRef as React.RefObject<BottomSheetMethods>);
    }
  }, [setSheetRef, isKDS]);

  // DEBUG: Verify station context is initialized before broadcasts arrive (Step 4)
  useEffect(() => {
    if (__DEV__ && !isKDS) {
      const orderStore = useOrderStore.getState();
      console.log('🔧 [MainLayout Init] Station context:', {
        hasStation: !!orderStore.currentStation,
        stationId: orderStore.currentStationId,
        viewScope: orderStore.currentStation?.view_scope,
        stationName: orderStore.currentStation?.station_name,
        timestamp: new Date().toISOString(),
      });
    }
  }, [isKDS]);

  useEffect(() => {
    if (!isKDS) {
      usePaymentStore
        .getState()
        .setPaymentBottomSheetRef(
          paymentBottomSheetRef as React.RefObject<BottomSheetMethods>
        );
    }
  }, [paymentBottomSheetRef, isKDS]);

  // Register PaymentDetailBottomSheet ref with store
  useEffect(() => {
    if (!isKDS) {
      usePaymentDetailSheetStore
        .getState()
        .setBottomSheetRef(
          paymentDetailSheetRef as React.RefObject<BottomSheetMethods>
        );
    }
  }, [paymentDetailSheetRef, isKDS]);

  // Initialize table order prefetch subscriber and session side effects (POS mode only)
  useTableSessionInit({ skip: isKDS });

  // KDS-only broadcast handler — only feeds useKDSStore, skips useOrderStore
  const handleOrderChangeKDS = useCallback((payload: OrderPayload) => {
    const broadcastPayload = payload as unknown as OrderBroadcastPayload;
    useKDSStore.getState().handleOrderBroadcast(broadcastPayload);
  }, []);

  // Realtime order syncing callbacks (POS mode)
  const handleOrderChange = useCallback((payload: OrderPayload) => {
    // Backend sends OrderBroadcastPayload with full order data
    const broadcastPayload = payload as unknown as OrderBroadcastPayload;

    if (__DEV__) {
      // DEBUG: Log received broadcast
      console.log('🔔 [MainLayout] Broadcast received:', {
        operation: broadcastPayload.operation,
        orderId: broadcastPayload.data?.order?.id,
        orderNumber: broadcastPayload.data?.order?.order_number,
        stationId: broadcastPayload.data?.order?.station_id,
        stationName: broadcastPayload.data?.order?.station_name,
      });

      // DEBUG: Log current station context
      const orderStore = useOrderStore.getState();
      console.log('📍 [MainLayout] Current station context:', {
        currentStationId: orderStore.currentStationId,
        stationName: orderStore.currentStation?.station_name,
        viewScope: orderStore.currentStation?.view_scope,
      });
    }

    useOrderStore.getState()._handleOrderBroadcast(broadcastPayload);
    useKDSStore.getState().handleOrderBroadcast(broadcastPayload);
  }, []);

  const handlePaymentChange = useCallback((payload: PaymentPayload) => {
    if (__DEV__) {
      console.log('[MainLayout] Payment changed:', payload);
    }
    // Payment changes are handled through order updates
    // The order store will receive an ORDER_UPDATE event with updated amount_paid
  }, []);

  if( !selectedStore || !selectedStore?.id  ){
     return <Redirect href="/login" />
  }

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-screen">
        <ActivityIndicator size="large" color={spinnerColor} />
      </View>
    );
  }

  // Redirect to login if user is not signed in
  if (!isSignedIn) {
    return <Redirect href="/login" />;
  }

  // KDS stations get a minimal layout — no Header, no Payment sheets
  if (isKDS) {
    return (
      <LocationRealtimeProvider
        locationId={selectedStore?.id}
        callbacks={{
          onOrderChange: handleOrderChangeKDS,
          onPaymentChange: handlePaymentChange,
        }}
      >
        <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.screen }}>
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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <SafeAreaView edges={["top"]} className="flex-1 bg-screen">
        <StatusBar style={"light"} translucent />

        <View className="flex-1 flex-row">
          {/* The Sidebar is now a self-contained component that handles its own state */}
          {/* <Sidebar /> */}
          {/* <ModifierSidebar /> */}
          <View className="flex-1 flex-col">
            <View className="py-3 px-4 z-50">
              <Header />
            </View>
            <Slot />
          </View>
        </View>
        <NotificationBottomSheet
          bottomSheetRef={
            notificationSheetRef as React.RefObject<BottomSheetMethods>
          }
          onClose={() => notificationSheetRef.current?.close()}
        />
        {/* Payment sheet needs highest z-index to overlay header */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
          }}
          pointerEvents="box-none"
        >
          <PaymentBottomSheet ref={paymentBottomSheetRef} />
        </View>
        {/* PaymentDetailBottomSheet in separate container with higher z-index */}
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
      </SafeAreaView>
    </KeyboardAvoidingView>
      </LocationRealtimeProvider>

  );
}
