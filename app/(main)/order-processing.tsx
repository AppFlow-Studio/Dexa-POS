import BillSection from '@/components/bill/BillSection'
import DiscountBottomSheet from '@/components/bill/DiscountBottomSheet'
import MoreOptionsBottomSheet from '@/components/bill/MoreOptionsBottomSheet'
import CashDrawerSheet from '@/components/cash-drawer/CashDrawerSheet'
import NoSaleModal from '@/components/cash-drawer/NoSaleModal'
import MenuSection from '@/components/menu/MenuSection'
import OpenItemAdder from '@/components/menu/OpenItemAdder'
import BulkCompleteModal from '@/components/order/BulkCompleteModal'
import OrderBadge from '@/components/order/OrderBadge'
import OrderLineItemsModal from '@/components/order/OrderLineItemsModal'
import OrderLineMinimalCard from '@/components/order/OrderLineMinimalCard'
import { useLoading } from '@/contexts/LoadingContext'
import { useToast } from '@/contexts/ToastContext'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { OrderProfile } from '@/lib/types'
import { useColorScheme } from '@/lib/useColorScheme'
import { OrderService } from '@/services/orderService'
import { PrinterService } from '@/services/printing/PrinterService'
import { useSearchStore } from '@/stores/searchStore'
import { useOrderLineFilteredOrders } from '@/stores/selectors/orderSelectors'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import {
  getOrderStoreSupabaseClient,
  useOrderStore
} from '@/stores/useOrderStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Logs,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Sofa,
  UtensilsCrossed,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  LinearTransition,
  SlideInLeft
} from 'react-native-reanimated'
import { Portal as Teleport } from 'react-native-teleport'

const EMPTY_ORDERS: OrderProfile[] = []
const badgeContentStyle = { paddingHorizontal: 20, gap: 8 } as const
const cardContentStyle = { padding: 10, gap: 12 } as const

const OrderProcessing = () => {
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  // FIXED: Use individual selectors to prevent subscribing to entire ordersById
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const setActiveOrder = useOrderStore(s => s.setActiveOrder)
  const startNewOrder = useOrderStore(s => s.startNewOrder)
  const markAllItemsAsReady = useOrderStore(s => s.markAllItemsAsReady)
  const archiveOrder = useOrderStore(s => s.archiveOrder)
  const updateOrderCheckStatus = useOrderStore(s => s.updateOrderCheckStatus)
  const updateActiveOrderDetails = useOrderStore(
    s => s.updateActiveOrderDetails
  )
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const orderCompletionMode = useStoreSettingsStore(s => s.orderCompletionMode)
  const orderLineViewMode = useSettingsStore(
    s => s.orderLineSettings.viewMode ?? 'default'
  )
  const openSearch = useSearchStore(s => s.openSearch)

  // Today-only order line list for current location.
  const reversedFilteredOrders = useOrderLineFilteredOrders()

  const [isAccordionOpen, setIsAccordionOpen] = useState(false)
  const [isOrdersModuleOpen, setIsOrdersModuleOpen] = useState(false)
  const [isItemsModalOpen, setItemsModalOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isCashDrawerSheetOpen, setCashDrawerSheetOpen] = useState(false)
  const [isNoSaleModalOpen, setNoSaleModalOpen] = useState(false)
  const [bulkCompleteModalOpen, setBulkCompleteModalOpen] = useState(false)
  const [isCustomItemModuleOpen, setIsCustomItemModuleOpen] = useState(false)
  const [isInlinePreviousOrdersOpen, setIsInlinePreviousOrdersOpen] =
    useState(false)
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null)
  const discountSheetRef = useRef<BottomSheetMethods>(null)
  const orderBadgeListRef = useRef<Animated.FlatList<OrderProfile>>(null)
  const orderBadgeScrollXRef = useRef(0)
  const orderBadgeViewportWidthRef = useRef(0)
  const orderBadgeContentWidthRef = useRef(0)
  const [canScrollBadgesLeft, setCanScrollBadgesLeft] = useState(false)
  const [canScrollBadgesRight, setCanScrollBadgesRight] = useState(false)

  // OPTIMIZED: Effect now uses getState() to avoid subscribing to all orders
  useEffect(() => {
    // Only run if activeOrderId is missing, or we need to validate it
    // access state directly without subscription
    const state = useOrderStore.getState()
    const ordersById = state.ordersById
    const orderIds = state.orderIds
    const allOrders = orderIds.map(id => ordersById[id]).filter(Boolean)

    // Find drafts (O(N) search but only runs on mount/reset)
    const emptyDraft = allOrders.find(
      o =>
        o.service_location_id === null &&
        o.order_status === 'draft' &&
        o.items.length === 0 &&
        o.paid_status !== 'Paid' &&
        !o.customer_name &&
        !o.customer_id
    )

    const globalDraft = allOrders.find(
      o =>
        o.service_location_id === null &&
        o.order_status === 'draft' &&
        o.paid_status !== 'Paid' &&
        !o.customer_name &&
        !o.customer_id
    )

    if (!activeOrderId) {
      if (emptyDraft) {
        setActiveOrder(emptyDraft.id)
      } else if (globalDraft) {
        setActiveOrder(globalDraft.id)
      } else {
        const newOrder = startNewOrder()
        setActiveOrder(newOrder.id)
      }
      return
    }

    // Verify current active order exists
    const currentActive = ordersById[activeOrderId]
    if (!currentActive) {
      if (emptyDraft) {
        setActiveOrder(emptyDraft.id)
      } else if (globalDraft) {
        setActiveOrder(globalDraft.id)
      } else {
        const newOrder = startNewOrder()
        setActiveOrder(newOrder.id)
      }
    }
  }, [activeOrderId, setActiveOrder, startNewOrder])

  const handleViewItems = useCallback((orderId: string) => {
    setSelectedOrderId(orderId)
    setIsOrdersModuleOpen(false)
    setItemsModalOpen(true)
  }, [])

  const handleMarkDone = useCallback(
    (orderId: string) => {
      const order = useOrderStore.getState().ordersById[orderId]
      if (!order) return

      markAllItemsAsReady(orderId)

      if (order.paid_status === 'Paid') {
        archiveOrder(orderId)
        // Toast fires from inside archiveOrder
      }
      // If not paid: items are now "ready", awaiting payment
    },
    [markAllItemsAsReady, archiveOrder]
  )

  const handleRetrieve = useCallback(
    (orderId: string) => {
      setActiveOrder(orderId)
    },
    [setActiveOrder]
  )

  const handleReopenCheck = useCallback(
    (orderId: string) => {
      updateOrderCheckStatus(orderId, 'Opened')
      setActiveOrder(orderId)
    },
    [updateOrderCheckStatus, setActiveOrder]
  )

  const { show } = useToast()
  const { showLoading, hideLoading } = useLoading()

  const handlePrintReceipt = useCallback(
    async (order: OrderProfile) => {
      if (!selectedStore) {
        show({
          title: 'Print Error',
          message: 'No store location selected.',
          type: 'error'
        })
        return
      }
      await PrinterService.printReceipt(order, selectedStore)
    },
    [selectedStore, show]
  )

  const handleCloseCheck = useCallback(async () => {
    const state = useOrderStore.getState()
    const currentActiveOrderId = state.activeOrderId
    const currentActiveOrder = currentActiveOrderId
      ? state.ordersById[currentActiveOrderId]
      : null

    if (!currentActiveOrderId || !currentActiveOrder) return

    // Validate order has backend ID
    if (!currentActiveOrder.db_order_id) {
      show({
        title: 'Cannot Close Check',
        message: 'Order must be synced to close check',
        type: 'error'
      })
      return
    }

    // Optimistic update — instant UI feedback
    updateActiveOrderDetails({ check_status: 'Closed' })
    showLoading('Closing check...')

    try {
      const supabase = getOrderStoreSupabaseClient()
      const { loggedInEmployee } = useEmployeeStore.getState()

      if (!supabase) {
        throw new Error('Database connection unavailable')
      }

      const result = await OrderService.closeCheck(
        supabase,
        currentActiveOrder.db_order_id,
        loggedInEmployee?.profileId || null
      )

      if (!result.success) {
        throw new Error(result.error || 'Failed to close check')
      }

      hideLoading()
      show({
        title: 'Check Closed',
        message: 'The check has been finalized. You can now clear the table.',
        type: 'success'
      })
    } catch (error: any) {
      console.error('Failed to close check:', error)
      // Rollback optimistic update
      updateActiveOrderDetails({ check_status: 'Opened' })
      hideLoading()
      show({
        title: 'Failed to Close Check',
        message: error.message || 'An error occurred',
        type: 'error'
      })
    }
  }, [show, showLoading, hideLoading, updateActiveOrderDetails])

  // DEFERRED RENDERING: Progressive staged rendering via double-rAF
  // Stage 0: Skeleton placeholders (instant first paint)
  // Stage 1: BillSection (lighter — user sees their order first)
  // Stage 2: MenuSection + MoreOptionsBottomSheet + FlatList data (heavier)
  const [renderStage, setRenderStage] = useState(0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRenderStage(1)
        requestAnimationFrame(() => {
          setRenderStage(2)
        })
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const displayOrders = renderStage >= 2 ? reversedFilteredOrders : EMPTY_ORDERS

  // Bulk complete: orders eligible for completion
  const completableOrders = useMemo(() => {
    return displayOrders.filter(order => {
      if (order.order_status === 'completed' || order.order_status === 'void')
        return false
      if (orderCompletionMode === 'auto_on_payment')
        return order.paid_status === 'Paid'
      return order.paid_status === 'Paid' && order.order_status === 'ready'
    })
  }, [displayOrders, orderCompletionMode])

  const handleBulkComplete = useCallback(() => {
    completableOrders.forEach(order => {
      markAllItemsAsReady(order.id)
      archiveOrder(order.id)
    })
    setBulkCompleteModalOpen(false)
  }, [completableOrders, markAllItemsAsReady, archiveOrder])

  const renderOrderBadge = useCallback(
    ({ item }: { item: OrderProfile }) => (
      <Animated.View
        entering={iosOnly(SlideInLeft.duration(300).springify().damping(16))}
      >
        <OrderBadge
          order={item}
          onMarkDone={() => handleMarkDone(item.id)}
          onViewItems={() => handleViewItems(item.id)}
          onRetrieve={() => handleRetrieve(item.id)}
          onReopenCheck={() => handleReopenCheck(item.id)}
          onPrintReceipt={() => handlePrintReceipt(item)}
        />
      </Animated.View>
    ),
    [
      handleMarkDone,
      handleViewItems,
      handleRetrieve,
      handleReopenCheck,
      handlePrintReceipt
    ]
  )

  const badgeKeyExtractor = useCallback((item: OrderProfile) => item.id, [])

  const updateBadgeScrollAffordance = useCallback((offsetX: number) => {
    const maxOffset = Math.max(
      0,
      orderBadgeContentWidthRef.current - orderBadgeViewportWidthRef.current
    )
    setCanScrollBadgesLeft(offsetX > 2)
    setCanScrollBadgesRight(offsetX < maxOffset - 2)
  }, [])

  const scrollBadgesBackward = useCallback(() => {
    const nextX = Math.max(0, orderBadgeScrollXRef.current - 180)
    orderBadgeListRef.current?.scrollToOffset({ offset: nextX, animated: true })
  }, [])

  const scrollBadgesForward = useCallback(() => {
    const nextX = orderBadgeScrollXRef.current + 180
    orderBadgeListRef.current?.scrollToOffset({ offset: nextX, animated: true })
  }, [])

  const handleAccordionChange = useCallback(
    (value: string | undefined) => setIsAccordionOpen(!!value),
    []
  )

  useEffect(() => {
    if (orderLineViewMode !== 'minimal') {
      setIsOrdersModuleOpen(false)
    }
  }, [orderLineViewMode])

  const handleCloseItemsModal = useCallback(() => setItemsModalOpen(false), [])

  const handleManageDrawer = useCallback(() => setCashDrawerSheetOpen(true), [])
  const handleNoSale = useCallback(() => setNoSaleModalOpen(true), [])

  const renderOrderCard = useCallback(
    ({ item }: { item: OrderProfile }) => (
      <Animated.View
        entering={iosOnly(SlideInLeft.duration(300).springify().damping(16))}
      >
        <OrderLineMinimalCard
          order={item}
          onMarkDone={() => handleMarkDone(item.id)}
          onViewItems={() => handleViewItems(item.id)}
          onPrintReceipt={() => handlePrintReceipt(item)}
        />
      </Animated.View>
    ),
    [handlePrintReceipt, handleViewItems, handleMarkDone]
  )

  const renderOrderGridCard = useCallback(
    ({ item }: { item: OrderProfile }) => {
      const totalAmount = item.total_amount ?? 0
      const displayId =
        item.display_number || item.order_number || `#${item.id.slice(-4)}`
      const itemCount =
        item.items.length > 0
          ? item.items.length
          : item._broadcastItemCount ?? 0
      const openedAt = item.opened_at
        ? new Date(item.opened_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
          })
        : ''

      const orderStatusColor =
        item.order_status === 'ready'
          ? colors.success
          : item.order_status === 'preparing' ||
            item.order_status === 'sent_to_kitchen'
          ? colors.warning
          : item.order_status === 'completed'
          ? colors.info
          : item.order_status === 'cancelled' || item.order_status === 'void'
          ? colors.danger
          : colors.muted

      const paidStatusColor =
        item.paid_status === 'Paid'
          ? colors.success
          : item.paid_status === 'Partial'
          ? colors.warning
          : colors.muted

      const canMarkDone =
        item.order_status === 'preparing' ||
        item.order_status === 'sent_to_kitchen' ||
        (item.order_status === 'ready' && item.paid_status === 'Paid')

      const cashDue = item.cash_amount_due ?? item.amount_due ?? totalAmount
      const statusLabel = (item.order_status || 'pending')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())

      return (
        <View
          style={{
            flex: 1,
            maxWidth: 320,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.info + '50',
            backgroundColor: colors.panel,
            overflow: 'hidden'
          }}
        >
          <View
            style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 7 }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flex: 1,
                  gap: 6
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.info + '18',
                    borderWidth: 1,
                    borderColor: colors.info + '35'
                  }}
                >
                  <ShoppingBag size={11} color={colors.label} />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.heading,
                    fontSize: 12,
                    fontWeight: '700',
                    flex: 1
                  }}
                >
                  {displayId}
                </Text>
                {item.order_type ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.muted,
                      fontSize: 10,
                      textTransform: 'lowercase'
                    }}
                  >
                    {item.order_type}
                  </Text>
                ) : null}
              </View>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: paidStatusColor + '20',
                  borderWidth: 1,
                  borderColor: paidStatusColor + '35'
                }}
              >
                <Text
                  style={{
                    color: paidStatusColor,
                    fontSize: 9,
                    fontWeight: '700'
                  }}
                >
                  {item.paid_status}
                </Text>
              </View>
            </View>

            <Text
              numberOfLines={1}
              style={{ color: colors.label, fontSize: 10, marginTop: 4 }}
            >
              {item.customer_name || 'Walk-In'} • {itemCount} item
              {itemCount !== 1 ? 's' : ''}
            </Text>

            {!!openedAt && (
              <Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>
                {openedAt}
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: orderStatusColor + '20',
                  borderWidth: 1,
                  borderColor: orderStatusColor + '35'
                }}
              >
                <Text
                  style={{
                    color: orderStatusColor,
                    fontSize: 9,
                    fontWeight: '700'
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: colors.muted + '20',
                  borderWidth: 1,
                  borderColor: colors.muted + '30'
                }}
              >
                <Text
                  style={{
                    color: colors.label,
                    fontSize: 9,
                    fontWeight: '600'
                  }}
                >
                  {item.check_status || 'Opened'}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.screen,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 9 }}>
              Cash ${cashDue.toFixed(2)}
            </Text>
            <Text
              style={{ color: colors.heading, fontSize: 12, fontWeight: '700' }}
            >
              ${totalAmount.toFixed(2)}
            </Text>
          </View>

          <View style={{ paddingVertical: 3, backgroundColor: colors.screen }}>
            {canMarkDone && (
              <TouchableOpacity
                onPress={() => handleMarkDone(item.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 7
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    backgroundColor: colors.success + '25',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 8
                  }}
                >
                  <CheckCircle2 size={12} color={colors.success} />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.success,
                    flex: 1
                  }}
                >
                  Mark as Done
                </Text>
                <ChevronRight size={13} color={colors.label} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => handleViewItems(item.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 10,
                paddingVertical: 7
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  backgroundColor: colors.info + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8
                }}
              >
                <Eye size={12} color={colors.info} />
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.heading,
                  flex: 1
                }}
              >
                View Items
              </Text>
              <ChevronRight size={13} color={colors.label} />
            </TouchableOpacity>

            {item.paid_status === 'Paid' && (
              <TouchableOpacity
                onPress={() => handlePrintReceipt(item)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 7
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    backgroundColor: colors.muted + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 8
                  }}
                >
                  <Printer size={12} color={colors.muted} />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.heading,
                    flex: 1
                  }}
                >
                  Print Receipt
                </Text>
                <ChevronRight size={13} color={colors.label} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )
    },
    [handleViewItems, handleMarkDone, handlePrintReceipt]
  )

  return (
    <View
      key={colorScheme}
      className='flex-1 flex-col px-2 py-1'
      style={{ backgroundColor: colors.screen }}
    >
      {/* <CashDrawerStatusBar
        onManagePress={handleManageDrawer}
        onNoSalePress={handleNoSale}
      /> */}
      <View
        className='flex-1 flex-row rounded-lg '
        style={{ backgroundColor: colors.screen }}
      >
        {/* Stage 1: BillSection (lighter — user sees their order first) */}
        {renderStage >= 1 ? (
          <BillSection
            key={`bill-${colorScheme}`}
            moreOptionsSheetRef={
              moreOptionsSheetRef as React.RefObject<BottomSheetMethods>
            }
            discountSheetRef={
              discountSheetRef as React.RefObject<BottomSheetMethods>
            }
          />
        ) : (
          // BillSection skeleton: matches the 380px sidebar layout
          <View
            className='w-[38%] p-4'
            style={{ backgroundColor: colors.screen }}
          >
            <View
              className='h-10 w-48 rounded-lg mb-4'
              style={{ backgroundColor: colors.skeleton }}
            />
            <View
              className='h-6 w-32 rounded-md mb-3'
              style={{ backgroundColor: colors.skeleton }}
            />
            <View
              className='h-6 w-64 rounded-md mb-3'
              style={{ backgroundColor: colors.skeleton }}
            />
            <View
              className='h-6 w-52 rounded-md mb-3'
              style={{ backgroundColor: colors.skeleton }}
            />
            <View className='flex-1' />
            <View
              className='h-14 rounded-xl'
              style={{ backgroundColor: colors.skeleton }}
            />
          </View>
        )}

        <View
          className='flex-1 ml-0'
          style={{ backgroundColor: colors.screen }}
        >
          {/* Stage 2: MenuSection (heavier — fills in after BillSection) */}
          {renderStage >= 2 ? (
            <MenuSection
              key={`menu-${colorScheme}`}
              showSearchButton={false}
              placeMenuSelectorInMenuRow={true}
              showMenuTabButton={false}
              showOpenItemButton={false}
              showTablesButton={false}
              showPreviousOrdersSection={false}
              forceOrdersView={isInlinePreviousOrdersOpen}
              toolbarSearchSlot={
                orderLineViewMode === 'minimal' ? (
                  <TouchableOpacity
                    onPress={() => setIsOrdersModuleOpen(true)}
                    className='flex-row items-center rounded-lg px-3 py-2.5 justify-start'
                    style={{
                      backgroundColor: colors.info + '16',
                      borderWidth: 1,
                      borderColor: colors.info + '35'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: colors.heading
                      }}
                    >
                      Orders
                    </Text>
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        marginLeft: 6,
                        backgroundColor: colors.info + '30',
                        borderWidth: 1,
                        borderColor: colors.info + '55',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 5
                      }}
                    >
                      <Text
                        style={{
                          color: colors.heading,
                          fontSize: 10,
                          fontWeight: '800'
                        }}
                      >
                        {displayOrders.length}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : undefined
              }
              rightToolbarSlot={
                <View className='flex-row items-center gap-2'>
                  <TouchableOpacity
                    onPress={() => {
                      setIsInlinePreviousOrdersOpen(false)
                    }}
                    className='flex-row items-center rounded-lg p-3 justify-start'
                    style={{
                      borderWidth: 1,
                      borderColor: !isInlinePreviousOrdersOpen
                        ? colors.teal + '55'
                        : colors.border,
                      backgroundColor: !isInlinePreviousOrdersOpen
                        ? colors.teal + '18'
                        : colors.panel
                    }}
                    accessibilityLabel='Switch to ordering view'
                  >
                    <UtensilsCrossed
                      color={
                        !isInlinePreviousOrdersOpen ? colors.teal : colors.label
                      }
                      size={14}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.push('/tables')}
                    className='flex-row items-center rounded-lg p-3 justify-start'
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.panel
                    }}
                    accessibilityLabel='Go to tables'
                  >
                    <Sofa color={colors.label} size={14} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setIsInlinePreviousOrdersOpen(true)}
                    className='flex-row items-center rounded-lg p-3 justify-start'
                    style={{
                      borderWidth: 1,
                      borderColor: isInlinePreviousOrdersOpen
                        ? colors.teal + '55'
                        : colors.border,
                      backgroundColor: isInlinePreviousOrdersOpen
                        ? colors.teal + '18'
                        : colors.panel
                    }}
                    accessibilityLabel='Open history'
                  >
                    <Logs
                      color={
                        isInlinePreviousOrdersOpen ? colors.teal : colors.label
                      }
                      size={14}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setIsCustomItemModuleOpen(true)}
                    className='flex-row items-center rounded-lg px-3 py-2.5 gap-2'
                    style={{
                      backgroundColor: colors.teal,
                      borderWidth: 1,
                      borderColor: colors.teal
                    }}
                  >
                    <Plus size={16} color='#000000' strokeWidth={2.5} />
                    <Text
                      style={{
                        color: '#000000',
                        fontSize: 12,
                        fontWeight: '700'
                      }}
                    >
                      Custom Item
                    </Text>
                  </TouchableOpacity>
                </View>
              }
              headerLeft={
                <View className='flex-row items-center gap-x-2'>
                  <TouchableOpacity
                    onPress={openSearch}
                    className='flex-row items-center rounded-lg px-3 py-2.5 justify-start'
                    style={{
                      width: orderLineViewMode === 'minimal' ? 300 : 300,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.screen
                    }}
                  >
                    <Search size={14} color={colors.muted} />
                    <Text
                      style={{
                        marginLeft: 7,
                        fontSize: 12,
                        fontWeight: '500',
                        color: colors.muted
                      }}
                    >
                      Search menu...
                    </Text>
                  </TouchableOpacity>

                  {orderLineViewMode !== 'minimal' &&
                    completableOrders.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setBulkCompleteModalOpen(true)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: colors.success + '15',
                          borderWidth: 1,
                          borderColor: colors.success + '30',
                          borderRadius: 20,
                          paddingHorizontal: 6,
                          paddingVertical: 2
                        }}
                      >
                        <CheckCircle2 size={10} color={colors.success} />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: colors.success
                          }}
                        >
                          Complete All ({completableOrders.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                </View>
              }
              headerBelow={
                <>
                  {!isInlinePreviousOrdersOpen &&
                  orderLineViewMode !== 'minimal' &&
                  !isAccordionOpen ? (
                    <View className='px-0 py-1.5 flex-row items-center'>
                      <View style={{ gap: 4 }}>
                        <View className='flex-row items-center gap-x-2'>
                          <Text
                            style={{
                              color: colors.heading,
                              fontSize: 18,
                              fontWeight: '600'
                            }}
                          >
                            Order Line
                          </Text>
                          {displayOrders?.length > 0 && (
                            <View
                              className='ml-1 border rounded-full px-2.5 py-0.5 items-center justify-center'
                              style={{
                                backgroundColor: colors.info + '30',
                                borderColor: colors.info + '55'
                              }}
                            >
                              <Text
                                className='text-xs font-bold'
                                style={{ color: colors.info }}
                              >
                                {displayOrders.length}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {displayOrders.length > 0 && (
                        <View
                          className='flex-1 ml-2 justify-center'
                          style={{ position: 'relative' }}
                        >
                          <Animated.FlatList
                            ref={orderBadgeListRef}
                            horizontal
                            data={displayOrders}
                            keyExtractor={badgeKeyExtractor}
                            className='max-h-10'
                            contentContainerStyle={badgeContentStyle}
                            showsHorizontalScrollIndicator={false}
                            onScroll={event => {
                              const nextX = event.nativeEvent.contentOffset.x
                              orderBadgeScrollXRef.current = nextX
                              updateBadgeScrollAffordance(nextX)
                            }}
                            onLayout={event => {
                              orderBadgeViewportWidthRef.current =
                                event.nativeEvent.layout.width
                              updateBadgeScrollAffordance(
                                orderBadgeScrollXRef.current
                              )
                            }}
                            onContentSizeChange={width => {
                              orderBadgeContentWidthRef.current = width
                              updateBadgeScrollAffordance(
                                orderBadgeScrollXRef.current
                              )
                            }}
                            scrollEventThrottle={16}
                            itemLayoutAnimation={LinearTransition.springify()
                              .damping(18)
                              .stiffness(120)}
                            initialNumToRender={10}
                            maxToRenderPerBatch={10}
                            windowSize={3}
                            renderItem={renderOrderBadge}
                          />

                          {/* Left fade overlay */}
                          <LinearGradient
                            colors={[colors.screen, colors.screen + '00']}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: 40,
                              zIndex: 4,
                              pointerEvents: 'none'
                            }}
                          />

                          {/* Right fade overlay */}
                          <LinearGradient
                            colors={[colors.screen + '00', colors.screen]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: 40,
                              zIndex: 4,
                              pointerEvents: 'none'
                            }}
                          />

                          {canScrollBadgesLeft && (
                            <TouchableOpacity
                              onPress={scrollBadgesBackward}
                              style={{
                                position: 'absolute',
                                left: -2,
                                top: '50%',
                                marginTop: -14,
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: colors.panel,
                                zIndex: 5,
                                shadowColor: '#000',
                                shadowOpacity: 0.28,
                                shadowRadius: 6,
                                shadowOffset: { width: 0, height: 2 },
                                elevation: 4
                              }}
                              activeOpacity={0.85}
                            >
                              <ChevronLeft size={14} color={colors.label} />
                            </TouchableOpacity>
                          )}

                          {canScrollBadgesRight && (
                            <TouchableOpacity
                              onPress={scrollBadgesForward}
                              style={{
                                position: 'absolute',
                                right: -2,
                                top: '50%',
                                marginTop: -14,
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: colors.panel,
                                zIndex: 5,
                                shadowColor: '#000',
                                shadowOpacity: 0.28,
                                shadowRadius: 6,
                                shadowOffset: { width: 0, height: 2 },
                                elevation: 4
                              }}
                              activeOpacity={0.85}
                            >
                              <ChevronRight size={14} color={colors.label} />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  ) : null}
                </>
              }
            />
          ) : (
            // MenuSection skeleton: matches the grid layout
            <View className='flex-1 p-4'>
              <View className='flex-row gap-x-2 mb-3'>
                {[1, 2, 3, 4].map(i => (
                  <View
                    key={i}
                    className='h-10 w-20 rounded-lg'
                    style={{ backgroundColor: colors.skeleton }}
                  />
                ))}
              </View>
              <View className='flex-row flex-wrap gap-2'>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <View
                    key={i}
                    className='h-24 w-28 rounded-xl'
                    style={{ backgroundColor: colors.skeleton }}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Stage 2: Mount in root portal so the sheet layers above BillSection controls */}
      {renderStage >= 2 && (
        <Teleport hostName='root'>
          <>
            <MoreOptionsBottomSheet
              ref={moreOptionsSheetRef as React.RefObject<BottomSheetMethods>}
              discountSheetRef={
                discountSheetRef as React.RefObject<BottomSheetMethods>
              }
              onCloseCheck={handleCloseCheck}
              onNoSale={handleNoSale}
            />
            <DiscountBottomSheet
              ref={discountSheetRef as React.RefObject<BottomSheetMethods>}
              onClose={() => discountSheetRef?.current?.close()}
            />
          </>
        </Teleport>
      )}

      <CashDrawerSheet
        isOpen={isCashDrawerSheetOpen}
        onClose={() => setCashDrawerSheetOpen(false)}
      />
      <NoSaleModal
        isOpen={isNoSaleModalOpen}
        onClose={() => setNoSaleModalOpen(false)}
      />
      <BulkCompleteModal
        visible={bulkCompleteModalOpen}
        orders={completableOrders}
        onConfirm={handleBulkComplete}
        onCancel={() => setBulkCompleteModalOpen(false)}
      />

      <Modal
        visible={isOrdersModuleOpen}
        transparent
        animationType='slide'
        onRequestClose={() => setIsOrdersModuleOpen(false)}
      >
        <Pressable
          onPress={() => setIsOrdersModuleOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end'
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              height: '100%',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderWidth: 1,
              borderColor: colors.info + '35',
              backgroundColor: colors.screen,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: 15,
                    fontWeight: '800'
                  }}
                >
                  Orders
                </Text>
                <View
                  style={{
                    minWidth: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: colors.info + '30',
                    borderWidth: 1,
                    borderColor: colors.info + '55',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 6
                  }}
                >
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: 11,
                      fontWeight: '800'
                    }}
                  >
                    {displayOrders.length}
                  </Text>
                </View>
              </View>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                {completableOrders.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setBulkCompleteModalOpen(true)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: colors.success + '15',
                      borderWidth: 1,
                      borderColor: colors.success + '30',
                      borderRadius: 20,
                      paddingHorizontal: 8,
                      paddingVertical: 4
                    }}
                  >
                    <CheckCircle2 size={12} color={colors.success} />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: colors.success
                      }}
                    >
                      Complete All ({completableOrders.length})
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setIsOrdersModuleOpen(false)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border
                  }}
                >
                  <X size={16} color={colors.label} />
                </TouchableOpacity>
              </View>
            </View>

            {displayOrders.length > 0 ? (
              <Animated.FlatList
                data={displayOrders}
                keyExtractor={badgeKeyExtractor}
                numColumns={4}
                contentContainerStyle={{
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  gap: 10
                }}
                columnWrapperStyle={{
                  marginBottom: 10,
                  justifyContent: 'flex-start',
                  gap: 10
                }}
                showsVerticalScrollIndicator={false}
                itemLayoutAnimation={LinearTransition.springify()
                  .damping(18)
                  .stiffness(120)}
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={4}
                renderItem={renderOrderGridCard}
              />
            ) : (
              <View
                style={{
                  paddingVertical: 28,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  No active orders.
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {isItemsModalOpen && (
        <OrderLineItemsModal
          isOpen={isItemsModalOpen}
          onClose={handleCloseItemsModal}
          orderId={selectedOrderId}
        />
      )}

      <Modal
        visible={isCustomItemModuleOpen}
        transparent
        animationType='fade'
        onRequestClose={() => setIsCustomItemModuleOpen(false)}
      >
        <Pressable
          onPress={() => setIsCustomItemModuleOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 20
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: 360,
              maxWidth: '92%',
              alignSelf: 'center',
              maxHeight: '92%',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.teal + '45',
              backgroundColor: colors.screen,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <Text
                style={{
                  color: colors.heading,
                  fontSize: 14,
                  fontWeight: '800'
                }}
              >
                Create Custom Item
              </Text>
              <TouchableOpacity
                onPress={() => setIsCustomItemModuleOpen(false)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <X size={16} color={colors.label} />
              </TouchableOpacity>
            </View>
            <View style={{ height: 620 }}>
              <OpenItemAdder
                onCreated={() => setIsCustomItemModuleOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

export default OrderProcessing
