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
import { colors } from '@/lib/theme'
import type { PreviousOrder } from '@/lib/types'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePreviousOrdersStore } from '@/stores/usePreviousOrdersStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { previousOrderToOrderProfile } from '@/utils/previousOrderMapper'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Clock, CreditCard, Receipt, RotateCcw } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  InteractionManager,
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
  const { getOrderById, refreshPreviousOrders } = usePreviousOrdersStore()

  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const { show } = useToast()

  const [activeTab, setActiveTab] = useState<TabType>('bill')
  const [isReady, setIsReady] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [order, setOrder] = useState<PreviousOrder | undefined>(undefined)

  const refundModalRef = useRef<AdvancedRefundModalRef>(null)
  const tipAdjustRef = useRef<TipAdjustSheetRef>(null)

  // Load order on mount or when orderId changes
  useEffect(() => {
    if (!orderId) return

    const loadOrder = () => {
      const { getOrderById } = usePreviousOrdersStore.getState()
      let foundOrder = getOrderById(orderId as string)

      // If order not found in previous orders, try current orders
      if (!foundOrder) {
        const currentOrder =
          useOrderStore.getState().ordersById[orderId as string]
        if (currentOrder) {
          // Add to history
          usePreviousOrdersStore.getState().addOrderToHistory(currentOrder)
          foundOrder = getOrderById(orderId as string)
        }
      }

      setOrder(foundOrder)
    }

    loadOrder()
  }, [orderId])

  const mappedOrder = useMemo(
    () => (order ? previousOrderToOrderProfile(order) : null),
    [order]
  )

  // Deferred rendering for smooth navigation
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true)
    })
    return () => task.cancel()
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await refreshPreviousOrders()
    } finally {
      setIsRefreshing(false)
    }
  }, [refreshPreviousOrders])

  const handleReopen = useCallback(() => {
    show({ title: 'Info', message: 'Re-open order is not yet implemented' })
  }, [show])

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
              backgroundColor: colors.panel
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
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 10,
              paddingVertical: 8
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
            <Animated.View entering={FadeIn.duration(200)}>
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
          style={{ flex: 2, backgroundColor: colors.panel }}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(300).delay(100)}>
            <SummaryCards order={order} />
          </Animated.View>

          <Animated.View entering={FadeIn.duration(300).delay(200)}>
            <OrderMetadata order={order} />
          </Animated.View>

          <Animated.View entering={FadeIn.duration(300).delay(300)}>
            {mappedOrder && (
              <ActionsPanel
                order={mappedOrder}
                onRefund={() => refundModalRef.current?.open()}
                onTipAdjust={() => tipAdjustRef.current?.open()}
                onPrint={() => setShowPrintModal(true)}
                onReopen={handleReopen}
                onNotes={() => setShowNotesModal(true)}
                onCloseCheck={() =>
                  show({
                    title: 'Info',
                    message: 'Close check is not yet implemented'
                  })
                }
                onVoidOrder={() =>
                  show({
                    title: 'Info',
                    message: 'Void order is not yet implemented'
                  })
                }
              />
            )}
          </Animated.View>
        </ScrollView>
      </View>

      {/* Modals */}
      <AdvancedRefundModal
        ref={refundModalRef}
        onClose={() => {}}
        order={mappedOrder}
      />

      <TipAdjustSheet ref={tipAdjustRef} order={mappedOrder} />

      <PrintReceiptModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        order={mappedOrder}
        location={selectedStore}
      />

      <OrderNotesModal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        order={mappedOrder}
      />
    </View>
  )
}

export default OrderDetailsScreen
