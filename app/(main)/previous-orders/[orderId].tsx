import AdvancedRefundModal, {
  AdvancedRefundModalRef
} from '@/components/previous-orders/AdvancedRefundModal'
import OrderNotesModal from '@/components/previous-orders/OrderNotesModal'
import PrintReceiptModal from '@/components/previous-orders/PrintReceiptModal'
import ActionsPanel from '@/components/previous-orders/detail/ActionsPanel'
import BillTab from '@/components/previous-orders/detail/BillTab'
import OrderDetailHeader from '@/components/previous-orders/detail/OrderDetailHeader'
import OrderDetailSkeleton from '@/components/previous-orders/detail/OrderDetailSkeleton'
import OrderMetadata from '@/components/previous-orders/detail/OrderMetadata'
import PaymentsTab from '@/components/previous-orders/detail/PaymentsTab'
import RefundsTab from '@/components/previous-orders/detail/RefundsTab'
import SummaryCards from '@/components/previous-orders/detail/SummaryCards'
import TimelineTab from '@/components/previous-orders/detail/TimelineTab'
import TipAdjustSheet, {
  TipAdjustSheetRef
} from '@/components/previous-orders/detail/TipAdjustSheet'
import { useToast } from '@/contexts/ToastContext'
import {
  useCloseCheck,
  useReopenCheck,
  useVoidOrder
} from '@/hooks/orders/useOrderActions'
import { useRealtimeFallbackPolling } from '@/hooks/pos/useRealtimeFallbackPolling'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePreviousOrdersStore } from '@/stores/usePreviousOrdersStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { previousOrderToOrderProfile } from '@/utils/previousOrderMapper'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Clock, CreditCard, Receipt, RotateCcw } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

type TabType = 'bill' | 'payments' | 'refunds' | 'timeline'

const TABS: { key: TabType; label: string; icon: React.ElementType }[] = [
  { key: 'bill', label: 'Bill', icon: Receipt },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'refunds', label: 'Refunds', icon: RotateCcw },
  { key: 'timeline', label: 'Timeline', icon: Clock }
]

const OrderDetailsScreen = () => {
  const router = useRouter()
  const { orderId } = useLocalSearchParams()
  const orderIdParam = String(orderId ?? '')
  const refreshPreviousOrders = usePreviousOrdersStore(
    s => s.refreshPreviousOrders
  )

  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const { show: _show } = useToast()
  const closeCheckMutation = useCloseCheck()
  const reopenCheckMutation = useReopenCheck()
  const voidOrderMutation = useVoidOrder()

  const [activeTab, setActiveTab] = useState<TabType>('bill')
  const [isReady, setIsReady] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [historyHydrated, setHistoryHydrated] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)

  // Reactive selector — re-renders whenever the underlying previous-orders
  // store is patched (e.g. via `_handleOrderBroadcast` → `patchPreviousOrder`),
  // so broadcast-driven updates flow to this screen without polling.
  const order = usePreviousOrdersStore(
    useCallback(s => s.getOrderById(orderIdParam), [orderIdParam])
  )

  const refundModalRef = useRef<AdvancedRefundModalRef>(null)
  const tipAdjustRef = useRef<TipAdjustSheetRef>(null)

  // If an order arrives via deep link and it's still in-flight (lives in
  // `useOrderStore`, not yet in history), seed it into history so the
  // reactive selector above can pick it up.
  useEffect(() => {
    if (!orderIdParam) return
    const found = usePreviousOrdersStore.getState().getOrderById(orderIdParam)
    if (found) return
    const currentOrder = useOrderStore.getState().ordersById[orderIdParam]
    if (currentOrder) {
      usePreviousOrdersStore.getState().addOrderToHistory(currentOrder)
    }
  }, [orderIdParam])

  // Realtime-first, polling-fallback. Only runs while the orders channel is
  // disconnected — otherwise the reactive selector above handles updates.
  useRealtimeFallbackPolling(
    () => {
      void usePreviousOrdersStore
        .getState()
        .refreshPreviousOrders({ force: true })
    },
    { intervalMs: 15_000 }
  )

  // Ensure history is loaded (cold start / deep link) before not-found
  useEffect(() => {
    if (!orderIdParam) {
      setHistoryHydrated(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        if (!usePreviousOrdersStore.getState().getOrderById(orderIdParam)) {
          await usePreviousOrdersStore
            .getState()
            .refreshPreviousOrders({ force: true })
        }
      } finally {
        if (!cancelled) setHistoryHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderIdParam])

  // With animation: 'none', navigation is synchronous — no transition to wait for.
  // Single rAF yields to Fabric's commit phase, then mark ready.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setIsReady(true)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await refreshPreviousOrders({ force: true })
    } finally {
      setIsRefreshing(false)
    }
  }, [refreshPreviousOrders])

  const handleReopen = useCallback(() => {
    if (!order?.db_order_id) return
    reopenCheckMutation.mutate({ dbOrderId: order.db_order_id })
  }, [order?.db_order_id, reopenCheckMutation])

  const mappedOrder = useMemo(
    () => (order ? previousOrderToOrderProfile(order) : null),
    [order]
  )

  if (!historyHydrated) {
    return <OrderDetailSkeleton />
  }

  // Not-found state
  if (!order) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          paddingHorizontal: 14,
          paddingVertical: 12
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20
          }}
        >
          <TouchableOpacity
            onPress={() => {
              const canGoBack = router.canGoBack?.()
              if (canGoBack) {
                router.back()
              } else {
                router.replace('/previous-orders')
              }
            }}
            style={{
              padding: 6,
              backgroundColor: colors.teal + '10',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.teal + '30'
            }}
          >
            <Text style={{ fontSize: 16, color: colors.teal }}>←</Text>
          </TouchableOpacity>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
          >
            Order Details
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Center content */}
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          {/* Small icon box */}
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: colors.danger + '15',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
              borderWidth: 1,
              borderColor: colors.danger + '30'
            }}
          >
            <Text style={{ fontSize: 24 }}>⚠</Text>
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: colors.heading,
              textAlign: 'center',
              marginBottom: 8
            }}
          >
            Order Not Found
          </Text>

          {/* Description */}
          <Text
            style={{
              fontSize: 12,
              color: colors.label,
              textAlign: 'center',
              marginBottom: 20,
              lineHeight: 18
            }}
          >
            This order may have been archived or the link is invalid.
          </Text>

          {/* Order ID display */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              width: '100%',
              marginBottom: 24
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: colors.muted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6
              }}
            >
              Looking for
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: 'Courier',
                color: colors.heading
              }}
            >
              {orderId}
            </Text>
          </View>

          {/* Primary action */}
          <TouchableOpacity
            onPress={() => router.replace('/previous-orders')}
            style={{
              width: '100%',
              paddingVertical: 11,
              backgroundColor: colors.teal,
              borderRadius: 10,
              alignItems: 'center',
              marginBottom: 10
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: colors.onSolid }}
            >
              View All Orders
            </Text>
          </TouchableOpacity>

          {/* Secondary action */}
          <TouchableOpacity
            onPress={() => {
              const canGoBack = router.canGoBack?.()
              if (canGoBack) {
                router.back()
              } else {
                router.replace('/previous-orders')
              }
            }}
            style={{
              width: '100%',
              paddingVertical: 11,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '600', color: colors.label }}
            >
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // Skeleton while waiting for interaction manager
  if (!isReady) {
    return <OrderDetailSkeleton />
  }

  const profileOrder = previousOrderToOrderProfile(order)

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <OrderDetailHeader order={order} onBack={() => router.back()} />

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Left Pane */}
        <View
          style={{
            flex: 3,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            backgroundColor: colors.screen
          }}
        >
          {/* Tab Bar */}
          <View
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              paddingHorizontal: 10,
              paddingTop: 4,
              backgroundColor: colors.screen
            }}
          >
            {TABS.map(tab => {
              const isActive = activeTab === tab.key
              const TabIcon = tab.icon
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderBottomWidth: 2,
                    borderBottomColor: isActive ? colors.teal : 'transparent',
                    backgroundColor: isActive
                      ? colors.teal + '10'
                      : 'transparent',
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8
                  }}
                >
                  <TabIcon
                    color={isActive ? colors.teal : colors.label}
                    size={16}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: isActive ? colors.teal : colors.label
                    }}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Tab Content */}
          <ScrollView
            style={{ flex: 1, backgroundColor: colors.screen }}
            contentContainerStyle={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: colors.screen
            }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.teal}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={iosOnly(FadeIn.duration(200))}>
              {activeTab === 'bill' && <BillTab order={order} />}
              {activeTab === 'payments' && <PaymentsTab order={order} />}
              {activeTab === 'refunds' && <RefundsTab order={order} />}
              {activeTab === 'timeline' && mappedOrder && (
                <TimelineTab order={mappedOrder} />
              )}
            </Animated.View>
          </ScrollView>
        </View>

        {/* Right Pane */}
        <ScrollView
          style={{ flex: 2, backgroundColor: colors.screen }}
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: colors.screen
          }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={iosOnly(FadeIn.duration(300).delay(100))}>
            <SummaryCards order={order} />
          </Animated.View>

          <Animated.View entering={iosOnly(FadeIn.duration(300).delay(200))}>
            <OrderMetadata order={order} />
          </Animated.View>

          <Animated.View entering={iosOnly(FadeIn.duration(300).delay(300))}>
            <ActionsPanel
              order={profileOrder}
              onRefund={() => refundModalRef.current?.open()}
              onTipAdjust={() => tipAdjustRef.current?.open()}
              onPrint={() => setShowPrintModal(true)}
              onReopen={handleReopen}
              onCloseCheck={() => {
                if (!profileOrder.db_order_id) return
                closeCheckMutation.mutate(profileOrder.db_order_id)
              }}
              onVoidOrder={() => {
                if (!profileOrder.db_order_id) return
                voidOrderMutation.mutate({
                  dbOrderId: profileOrder.db_order_id
                })
              }}
              onNotes={() => setShowNotesModal(true)}
              isClosingCheck={closeCheckMutation.isPending}
              isReopeningCheck={reopenCheckMutation.isPending}
              isVoiding={voidOrderMutation.isPending}
            />
          </Animated.View>
        </ScrollView>
      </View>

      {/* Modals */}
      <AdvancedRefundModal
        ref={refundModalRef}
        onClose={() => {}}
        order={profileOrder}
      />

      <TipAdjustSheet ref={tipAdjustRef} order={profileOrder} />

      <PrintReceiptModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        order={profileOrder}
        location={selectedStore}
      />

      <OrderNotesModal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        order={profileOrder}
      />
    </View>
  )
}

export default OrderDetailsScreen
