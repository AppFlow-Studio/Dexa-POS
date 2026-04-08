import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import Header from "@/components/Header";
import PaymentDetailBottomSheet from "@/components/menu/PaymentDetailBottomSheet";
import NotificationBottomSheet from "@/components/notifications/NotificationBottomSheet";
import { LocationRealtimeProvider } from "@/contexts/LocationRealtimeProvider";
import type { OrderBroadcastPayload } from "@/hooks/realtime/useOrdersRealtime";
import { hydrateDrawerSession } from "@/services/cashDrawerService";
import { useKDSStore } from "@/stores/useKDSStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { useOrderStore, getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
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
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import MenuSearchSheet from "@/components/menu/MenuSearchSheet";
import { setHeaderHeight } from "@/lib/headerHeight";
import KDSSoundService from "@/services/kds/kdsSoundService";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
/** Side-effect component: keeps POS orders in sync when realtime drops */
function OrderSyncRecoveryBridge ({ locationId }: { locationId: string }) {
  useOrderSyncRecovery(locationId)
  return null
}

export default function MainLayout () {
  const { isSignedIn, isLoaded } = useAuth()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const isKDS = selectedStation?.station_type === 'kds'

  const notificationSheetRef = useRef<BottomSheetMethods>(null)
  const paymentDetailSheetRef = useRef<BottomSheetMethods>(null)
  const menuSearchSheetRef = useRef<BottomSheetMethods>(null)
  const { setSheetRef } = useNotificationSheetStore()
  const { setSearchSheetRef } = useMenuManagementSearchStore()

  useEffect(() => {
    if (!isKDS) {
      setSheetRef(notificationSheetRef as React.RefObject<BottomSheetMethods>)
    }
  }, [setSheetRef, isKDS])

  useEffect(() => {
    setSearchSheetRef(menuSearchSheetRef as React.RefObject<BottomSheetMethods>)
  }, [setSearchSheetRef])

  // DEBUG: Verify station context is initialized before broadcasts arrive (Step 4)
  useEffect(() => {
    if (__DEV__ && !isKDS) {
      const orderStore = useOrderStore.getState()
      console.log('🔧 [MainLayout Init] Station context:', {
        hasStation: !!orderStore.currentStation,
        stationId: orderStore.currentStationId,
        viewScope: orderStore.currentStation?.view_scope,
        stationName: orderStore.currentStation?.station_name,
        timestamp: new Date().toISOString()
      })
    }
  }, [isKDS])

  // Register PaymentDetailBottomSheet ref with store
  useEffect(() => {
    if (!isKDS) {
      usePaymentDetailSheetStore
        .getState()
        .setBottomSheetRef(
          paymentDetailSheetRef as React.RefObject<BottomSheetMethods>
        )
    }
  }, [paymentDetailSheetRef, isKDS])

  // --- POS Sound Notifications for external orders ---
  const soundServiceRef = useRef<KDSSoundService | null>(null)

  useEffect(() => {
    if (isKDS) return
    const service = new KDSSoundService()
    soundServiceRef.current = service
    service.init()
    return () => {
      service.dispose()
      soundServiceRef.current = null
    }
  }, [isKDS])

  // Sync sound config from location config store
  const notifConfig = useLocationConfigStore(s => s.config.notifications)
  useEffect(() => {
    if (isKDS || !soundServiceRef.current) return
    soundServiceRef.current.updateConfig({
      enabled: notifConfig.soundEnabled,
      online: notifConfig.onlineOrderSound,
      kiosk: notifConfig.kioskOrderSound,
      third_party: notifConfig.thirdPartyOrderSound,
      pos: 'none',
      default: notifConfig.thirdPartyOrderSound, // unknown external sources use third-party sound
    })
  }, [isKDS, notifConfig])

  // Initialize table order prefetch subscriber and session side effects (POS mode only)
  useTableSessionInit({ skip: isKDS })

  // Hydrate cash drawer session on startup (POS mode only)
  // If no active session found and a drawer exists, prompt user to open it
  useEffect(() => {
    if (isKDS || !selectedStation || !selectedStore) return
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) return
    hydrateDrawerSession(supabase, selectedStation.id, selectedStore.id)
      .then(hasSession => {
        const store =
          require('@/stores/useCashDrawerStore').useCashDrawerStore.getState()
        if (!hasSession && store.drawerId) {
          store.setShouldPromptOpen(true)
        }
      })
      .catch(err => {
        console.warn('[MainLayout] Cash drawer hydration failed:', err)
      })
  }, [isKDS, selectedStation?.id, selectedStore?.id])

  // KDS-only broadcast handler — only feeds useKDSStore, skips useOrderStore
  const handleOrderChangeKDS = useCallback((payload: OrderPayload) => {
    const broadcastPayload = payload as unknown as OrderBroadcastPayload
    useKDSStore.getState().handleOrderBroadcast(broadcastPayload)
  }, [])

  // Realtime order syncing callbacks (POS mode)
  const handleOrderChange = useCallback((payload: OrderPayload) => {
    // Backend sends OrderBroadcastPayload with full order data
    const broadcastPayload = payload as unknown as OrderBroadcastPayload

    if (__DEV__) {
      // DEBUG: Log received broadcast
      console.log('🔔 [MainLayout] Broadcast received:', {
        operation: broadcastPayload.operation,
        orderId: broadcastPayload.data?.order?.id,
        orderNumber: broadcastPayload.data?.order?.order_number,
        stationId: broadcastPayload.data?.order?.station_id,
        stationName: broadcastPayload.data?.order?.station_name
      })

      // DEBUG: Log current station context
      const orderStore = useOrderStore.getState()
      console.log('📍 [MainLayout] Current station context:', {
        currentStationId: orderStore.currentStationId,
        stationName: orderStore.currentStation?.station_name,
        viewScope: orderStore.currentStation?.view_scope
      })
    }

    useOrderStore.getState()._handleOrderBroadcast(broadcastPayload);
    useKDSStore.getState().handleOrderBroadcast(broadcastPayload);
    usePreviousOrdersStore.getState()._handleOrderBroadcast(broadcastPayload);

    // Play notification sound for external orders (not POS-originated)
    if (broadcastPayload.operation === 'INSERT') {
      const src = broadcastPayload.data?.order?.order_source
      // Play sound for all external orders (online, delivery, kiosk, etc.)
      // Only skip if order_source is 'pos' (originated from POS)
      if (src && src !== 'pos' && src !== 'in_store') {
        soundServiceRef.current?.playForSource(src)
      }
    }
  }, []);

  const handlePaymentChange = useCallback((payload: PaymentPayload) => {
    if (__DEV__) {
      console.log('[MainLayout] Payment changed:', payload)
    }
    // Payment changes are handled through order updates
    // The order store will receive an ORDER_UPDATE event with updated amount_paid
  }, [])

  if (!selectedStore || !selectedStore?.id) {
    return <Redirect href='/login' />
  }

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View className='flex-1 items-center justify-center bg-screen'>
        <ActivityIndicator size='large' color={spinnerColor} />
      </View>
    )
  }

  // Redirect to login if user is not signed in
  if (!isSignedIn) {
    return <Redirect href='/login' />
  }

  // KDS stations get a minimal layout — no Header, no Payment sheets
  if (isKDS) {
    return (
      <LocationRealtimeProvider
        locationId={selectedStore?.id}
        maxReconnectAttempts={20}
        callbacks={{
          onOrderChange: handleOrderChangeKDS,
          onPaymentChange: handlePaymentChange
        }}
      >
        <SafeAreaView
          edges={['top']}
          style={{ flex: 1, backgroundColor: colors.screen }}
        >
          <StatusBar style='light' translucent />
          <Slot />
        </SafeAreaView>
      </LocationRealtimeProvider>
    )
  }

  return (
    <LocationRealtimeProvider
      locationId={selectedStore?.id}
      callbacks={{
        onOrderChange: handleOrderChange,
        onPaymentChange: handlePaymentChange
      }}
    >
      <OrderSyncRecoveryBridge locationId={selectedStore.id} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className='flex-1'
      >
        <SafeAreaView edges={['top']} className='flex-1 bg-background'>
          <StatusBar style={'light'} translucent />

          <View className='flex-1 flex-row'>
            {/* The Sidebar is now a self-contained component that handles its own state */}
            {/* <Sidebar /> */}
            {/* <ModifierSidebar /> */}
            <View className='flex-1 flex-col'>
              <View
                className='px-4 z-50'
                onLayout={event =>
                  setHeaderHeight(event.nativeEvent.layout.height)
                }
              >
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
          {/* Payment sheet — Modal-based, self-manages visibility via isOpen */}
          <PaymentBottomSheet />
          {/* PaymentDetailBottomSheet in separate container with higher z-index */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100
            }}
            pointerEvents='box-none'
          >
            <PaymentDetailBottomSheet ref={paymentDetailSheetRef} />
          </View>
          {/* MenuSearchSheet — absolute overlay so it covers the app header */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 200
            }}
            pointerEvents='box-none'
          >
            <MenuSearchSheet ref={menuSearchSheetRef} />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </LocationRealtimeProvider>
  )
}
