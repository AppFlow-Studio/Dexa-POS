import DatePillRow, { type DatePillDef } from '@/components/menu/DatePillRow'
import OrderNotesModal from '@/components/previous-orders/OrderNotesModal'
import PreviousOrderRow from '@/components/previous-orders/PreviousOrderRow'
import ReceiptModal from '@/components/receipts/ReceiptModal'
import {
  useCloseCheck,
  useReopenCheck,
  useVoidOrder
} from '@/hooks/orders/useOrderActions'
import { usePreviousOrdersListSync } from '@/hooks/pos/usePreviousOrdersListSync'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { OrderProfile } from '@/lib/types'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentDetailSheetStore } from '@/stores/usePaymentDetailSheetStore'
import { usePreviousOrdersStore } from '@/stores/usePreviousOrdersStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { FlashList } from '@shopify/flash-list'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Globe,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Truck,
  Utensils
} from 'lucide-react-native'

import { useFocusEffect, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated'

// ─── Skeleton Loading ───────────────────────────────────────
const SkeletonBar = ({
  width,
  height,
  style
}: {
  width: number | string
  height: number
  style?: any
}) => {
  const opacity = useSharedValue(0.3)

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1
    )
    return () => {
      cancelAnimation(opacity)
    }
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value
  }))

  return (
    <Animated.View
      style={[
        {
          width: typeof width === 'number' ? width : undefined,
          height,
          backgroundColor: colors.border,
          borderRadius: 8
        },
        animatedStyle,
        style
      ]}
    />
  )
}

const SkeletonRow = () => (
  <View
    style={{
      backgroundColor: colors.panel,
      borderRadius: 12,
      marginHorizontal: 8,
      marginBottom: 8,
      padding: 16
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <SkeletonBar width={70} height={20} />
      <SkeletonBar width={50} height={14} />
      <View style={{ flex: 1 }} />
      <SkeletonBar width={60} height={24} style={{ borderRadius: 6 }} />
      <SkeletonBar width={32} height={32} style={{ borderRadius: 16 }} />
      <SkeletonBar width={40} height={20} style={{ borderRadius: 10 }} />
      <SkeletonBar width={70} height={20} />
    </View>
    <SkeletonBar width={180} height={12} style={{ marginTop: 6 }} />
  </View>
)

// ─── Filter Pill Component ──────────────────────────────────
interface FilterPillProps {
  label: string
  isActive: boolean
  onPress: () => void
  icon?: React.ReactNode
  count?: number
}

const FilterPill = ({
  label,
  isActive,
  onPress,
  icon,
  count
}: FilterPillProps) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: isActive ? colors.teal + '20' : 'transparent'
    }}
  >
    {icon && typeof icon === 'string' ? icon : <View>{icon}</View>}
    <Text
      style={{
        fontSize: 12,
        fontWeight: isActive ? '700' : '600',
        color: isActive ? colors.heading : colors.label
      }}
    >
      {label}
    </Text>
    {count != null && count > 0 && (
      <View
        style={{
          borderRadius: 999,
          paddingHorizontal: 6,
          minWidth: 20,
          alignItems: 'center',
          backgroundColor: isActive ? colors.teal + '30' : colors.teal + '15'
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal }}>
          {count}
        </Text>
      </View>
    )}
  </TouchableOpacity>
)

// ─── Sort Segment Group ─────────────────────────────────────
const SortSegmentGroup = ({
  sortBy,
  sortOrder,
  onSortChange
}: {
  sortBy: 'date' | 'total' | 'status'
  sortOrder: 'asc' | 'desc'
  onSortChange: (field: 'date' | 'total' | 'status') => void
}) => {
  const segments: { key: 'date' | 'total' | 'status'; label: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'total', label: 'Amount' },
    { key: 'status', label: 'Status' }
  ]

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card
      }}
    >
      {segments.map((seg, idx) => {
        const isActive = sortBy === seg.key
        return (
          <React.Fragment key={seg.key}>
            {idx > 0 && (
              <View
                style={{
                  width: 1,
                  backgroundColor: colors.border,
                  alignSelf: 'stretch'
                }}
              />
            )}
            <TouchableOpacity
              onPress={() => onSortChange(seg.key)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: isActive ? colors.teal + '20' : 'transparent'
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: isActive ? '700' : '600',
                  color: isActive ? colors.teal : colors.label
                }}
              >
                {seg.label}
              </Text>
              {isActive &&
                (sortOrder === 'desc' ? (
                  <ArrowDown color={colors.teal} size={12} />
                ) : (
                  <ArrowUp color={colors.teal} size={12} />
                ))}
            </TouchableOpacity>
          </React.Fragment>
        )
      })}
    </View>
  )
}

// ─── Main Screen ────────────────────────────────────────────
const PreviousOrdersScreen = () => {
  const router = useRouter()
  const setActiveOrder = useOrderStore(s => s.setActiveOrder)

  // Modal state
  const [activeModal, setActiveModal] = useState<'notes' | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<OrderProfile | null>(null)
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] =
    useState<OrderProfile | null>(null)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)

  // Expand/collapse state
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  // Filter & sort state
  const [searchText, setSearchText] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const {
    refresh: handleRefresh,
    isRefreshing,
    isInitialLoading
  } = usePreviousOrdersListSync()

  // Date window
  const dateWindowLabel = usePreviousOrdersStore(
    s => s.dateWindow?.label ?? 'today'
  )
  const setDateWindow = usePreviousOrdersStore(s => s.setDateWindow)
  const handleDatePillSelect = useCallback(
    (pill: DatePillDef) => {
      const { startDate, endDate } = pill.getDateRange()
      setDateWindow({ startDate, endDate, label: pill.windowLabel })
    },
    [setDateWindow]
  )

  // ─── Store-based data layer (mirrors PreviousOrdersSection pattern) ───
  const ordersById = useOrderStore(s => s.ordersById)
  const orderIds = useOrderStore(s => s.orderIds)
  const currentStationId = useOrderStore(s => s.currentStationId)
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const workingSetOrderIds = useOrderStore(s => s.workingSetOrderIds)
  const dbOrderIdIndex = useOrderStore(s => s.dbOrderIdIndex)
  const { previousOrders, newOrdersCount } = usePreviousOrdersStore()
  const loadMoreOrders = usePreviousOrdersStore(s => s.loadMoreOrders)
  const isLoadingMore = usePreviousOrdersStore(s => s._isLoadingMore)
  const hasMore = usePreviousOrdersStore(s => s._hasMore)

  // Release previous orders from memory when navigating away (~10MB for 500 orders).
  // Data is re-fetched on next focus via usePreviousOrdersListSync bootstrap.
  useFocusEffect(
    useCallback(() => {
      return () => {
        usePreviousOrdersStore.setState({
          previousOrders: [],
          _orderLookup: {},
          newOrdersCount: 0
        })
      }
    }, [])
  )

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) void loadMoreOrders()
  }, [hasMore, isLoadingMore, loadMoreOrders])

  // Combine active orders + history orders with dedup (same as PreviousOrdersSection)
  const allOrders: OrderProfile[] = useMemo(() => {
    // Only include active + working set + own-station non-final orders.
    // Do NOT scan all orderIds — useOrderStore has 800+ stale "ready" orders.
    const finalStatuses = new Set(['completed', 'void', 'cancelled', 'voided'])
    const liveIds = new Set<string>()
    if (activeOrderId) liveIds.add(activeOrderId)
    for (const wsId of workingSetOrderIds || []) {
      const localId = dbOrderIdIndex[wsId] || wsId
      liveIds.add(localId)
    }
    for (const id of orderIds) {
      if (liveIds.has(id)) continue
      const o = ordersById[id]
      if (!o) continue
      if (o.station_id !== currentStationId) continue // own station only
      if (finalStatuses.has(o.order_status ?? '')) continue
      if (o.order_status === 'draft') continue
      liveIds.add(id)
    }
    // Build lookup from DB-fetched previous orders to patch stale active order statuses.
    // usePreviousOrdersStore re-fetches from DB on screen focus, so this data is fresh.
    const poByDbId = new Map<string, typeof previousOrders[number]>()
    for (const po of previousOrders) {
      if (po.db_order_id) poByDbId.set(po.db_order_id, po)
    }

    const activeOrders: OrderProfile[] = []
    for (const id of liveIds) {
      const o = ordersById[id]
      if (!o) continue
      // Hide empty drafts — including the active order / working set, which are
      // added to `liveIds` unconditionally above and so skip the draft filter
      // in the scan loop. A draft with no items isn't worth a row here.
      if (o.order_status === 'draft' && o.items.length === 0) continue
      // Patch stale paid_status using fresh DB data from previous orders store
      if (o.db_order_id && o.paid_status === 'Refunded') {
        const po = poByDbId.get(o.db_order_id)
        if (po && po.paymentStatus === 'Paid') {
          activeOrders.push({ ...o, paid_status: 'Paid' as const })
          continue
        }
      }
      activeOrders.push(o)
    }

    const activeIds = new Set(activeOrders.map(o => o.id))
    const activeDbIds = new Set(
      activeOrders.map(o => o.db_order_id).filter(Boolean)
    )

    const mappedHistoryOrders: OrderProfile[] = previousOrders
      .filter(po => {
        if (activeIds.has(po.orderId)) return false
        if (po.db_order_id && activeDbIds.has(po.db_order_id)) return false
        return true
      })
      .map(
        po =>
          ({
            id: po.orderId,
            db_order_id: po.db_order_id,
            display_number: po.display_number,
            order_number: po.display_number,
            customer_name: po.customer,
            customer_phone: po.customer_phone ?? undefined,
            server_name: po.server,
            order_status: po.voided
              ? 'void'
              : po.refunded && po.paymentStatus !== 'Paid'
              ? 'refunded'
              : po.closed_at
              ? 'completed'
              : 'pending',
            check_status: po.checkStatus || 'Opened',
            paid_status: po.paymentStatus,
            order_type: po.type,
            items: po.items,
            total_amount: po.total,
            amount_paid: po.amount_paid,
            amount_due: po.amount_due,
            cash_amount_due: po.cash_amount_due,
            opened_at: po.timestamp || po.opened_at,
            created_at: po.timestamp,
            closed_at: po.closed_at,
            service_location_id: po.service_location_id || null,
            service_location_name: po.service_location_name,
            station_id: po.station_id || null,
            _sourceStationName: po.station_name,
            notes: po.notes,
            payments: po.payments,
            order_source: po.order_source ?? null,
            reversals: po.reversals,
            order_refund_items: po.order_refund_items
          } as OrderProfile)
      )

    return [...activeOrders, ...mappedHistoryOrders]
  }, [ordersById, previousOrders])

  // ─── Compute filter counts from allOrders ──────────────
  const filterCounts = useMemo(() => {
    let needsAttention = 0
    let refunded = 0
    let dineIn = 0
    let takeaway = 0
    let delivery = 0
    let online = 0

    for (const o of allOrders) {
      if (o.paid_status === 'Pending') needsAttention++
      if (
        o.order_status === 'refunded' ||
        (o.payments || []).some(p => (p.refundedAmount ?? 0) > 0)
      ) {
        refunded++
      }
      if (o.order_source?.toLowerCase() === 'online') online++
      switch (o.order_type) {
        case 'Dine In':
          dineIn++
          break
        case 'Takeaway':
          takeaway++
          break
        case 'Delivery':
          delivery++
          break
      }
    }

    return { needsAttention, refunded, dineIn, takeaway, delivery, online }
  }, [allOrders])

  // ─── Client-side filtering + sorting ───────────────────
  const filteredOrders = useMemo(() => {
    let filtered = allOrders

    // Search by display_number, customer_name, or customer_phone.
    // Phone match is digits-only so formatted ("(415) 555-0123") and
    // unformatted ("4155550123") queries both hit the same orders.
    if (searchText.trim()) {
      const query = searchText.toLowerCase().trim()
      const queryDigits = query.replace(/\D/g, '')
      filtered = filtered.filter(o => {
        const customerName = (o.customer_name || 'walk-in').toLowerCase()
        const displayNumber = String(o.display_number || '').toLowerCase()
        if (
          customerName.includes(query) ||
          displayNumber.includes(query)
        ) {
          return true
        }
        if (queryDigits && o.customer_phone) {
          const phoneDigits = o.customer_phone.replace(/\D/g, '')
          if (phoneDigits.includes(queryDigits)) return true
        }
        return false
      })
    }

    // Status / type filter (single-select)
    if (activeFilter === 'needs-attention') {
      filtered = filtered.filter(o => o.paid_status === 'Pending')
    } else if (activeFilter === 'refunded') {
      filtered = filtered.filter(
        o =>
          o.order_status === 'refunded' ||
          (o.payments || []).some(p => (p.refundedAmount ?? 0) > 0)
      )
    } else if (activeFilter === 'dine-in') {
      filtered = filtered.filter(o => o.order_type === 'dine_in')
    } else if (activeFilter === 'takeaway') {
      filtered = filtered.filter(o => o.order_type === 'takeout')
    } else if (activeFilter === 'delivery') {
      filtered = filtered.filter(o => o.order_type === 'delivery')
    } else if (activeFilter === 'online') {
      filtered = filtered.filter(
        o => o.order_source?.toLowerCase() === 'online'
      )
    }

    // Sorting
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date': {
          const dateA = new Date(a.opened_at || 0).getTime()
          const dateB = new Date(b.opened_at || 0).getTime()
          return (dateA - dateB) * sortMultiplier
        }
        case 'total':
          return (
            ((a.total_amount || 0) - (b.total_amount || 0)) * sortMultiplier
          )
        case 'status': {
          const statusA = (a.paid_status || '').toLowerCase()
          const statusB = (b.paid_status || '').toLowerCase()
          return statusA.localeCompare(statusB) * sortMultiplier
        }
        default:
          return 0
      }
    })

    return filtered
  }, [allOrders, searchText, activeFilter, sortBy, sortOrder])

  // Mutation hooks
  const closeCheckMutation = useCloseCheck()
  const reopenCheckMutation = useReopenCheck()
  const voidOrderMutation = useVoidOrder()

  // ─── Filter toggle (single-select) ────────────────────
  const toggleFilter = useCallback((filter: string) => {
    setActiveFilter(prev => (prev === filter ? null : filter))
  }, [])

  // ─── Sort toggle ────────────────────────────────────────
  const handleSortChange = useCallback(
    (field: 'date' | 'total' | 'status') => {
      if (sortBy === field) {
        setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortBy(field)
        setSortOrder('desc')
      }
    },
    [sortBy]
  )

  // ─── Row callbacks ──────────────────────────────────────
  const handlePress = useCallback((order: OrderProfile) => {
    setExpandedOrderId(prev => (prev === order.id ? null : order.id))
  }, [])

  /** Ensure order is in store then open PaymentDetailBottomSheet to the given view */
  const openPaymentSheet = useCallback(
    (order: OrderProfile, view: 'summary' | 'refund' | 'tipAdjust') => {
      const existing = useOrderStore.getState().ordersById[order.id]
      if (!existing) {
        useOrderStore.setState(state => ({
          ordersById: { ...state.ordersById, [order.id]: order }
        }))
      }
      usePaymentDetailSheetStore.getState().open(order.id, view)
    },
    []
  )

  const handleDoublePress = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, 'summary'),
    [openPaymentSheet]
  )

  const handleOpenNotes = useCallback((order: OrderProfile) => {
    setSelectedOrder(order)
    setActiveModal('notes')
  }, [])

  const handleOpenPrint = useCallback((order: OrderProfile) => {
    setSelectedOrderForReceipt(order)
  }, [])

  const handleViewTimeline = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, 'summary'),
    [openPaymentSheet]
  )

  const handleTipAdjust = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, 'tipAdjust'),
    [openPaymentSheet]
  )

  const handleCloseCheck = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return
      closeCheckMutation.mutate(order.db_order_id)
    },
    [closeCheckMutation]
  )

  const handleReopenCheck = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return
      reopenCheckMutation.mutate({ dbOrderId: order.db_order_id })
    },
    [reopenCheckMutation]
  )

  const handleRefund = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, 'refund'),
    [openPaymentSheet]
  )

  const handleVoidOrder = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return
      voidOrderMutation.mutate({ dbOrderId: order.db_order_id })
    },
    [voidOrderMutation]
  )

  const handleContinue = useCallback(
    (order: OrderProfile) => {
      const existing = useOrderStore.getState().ordersById[order.id]
      if (!existing) {
        useOrderStore.setState(state => ({
          ordersById: { ...state.ordersById, [order.id]: order }
        }))
      }
      setActiveOrder(order.id)
      router.replace('/order-processing')
    },
    [setActiveOrder, router]
  )

  // ─── FlashList render ───────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: OrderProfile }) => {
      const canContinue =
        item.paid_status !== 'Paid' &&
        item.order_status !== 'refunded' &&
        item.order_status !== 'void'
      return (
        <PreviousOrderRow
          order={item}
          isExpanded={item.id === expandedOrderId}
          onPress={handlePress}
          onDoublePress={handleDoublePress}
          onPrint={handleOpenPrint}
          onViewTimeline={handleViewTimeline}
          onTipAdjust={handleTipAdjust}
          onViewNotes={handleOpenNotes}
          onCloseCheck={handleCloseCheck}
          onReopenCheck={handleReopenCheck}
          onRefund={handleRefund}
          onVoid={handleVoidOrder}
          onContinue={canContinue ? handleContinue : undefined}
        />
      )
    },
    [
      expandedOrderId,
      handlePress,
      handleDoublePress,
      handleOpenPrint,
      handleViewTimeline,
      handleTipAdjust,
      handleOpenNotes,
      handleCloseCheck,
      handleReopenCheck,
      handleRefund,
      handleVoidOrder,
      handleContinue
    ]
  )

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.screen }}
    >
      <View style={{ flex: 1, padding: 16, backgroundColor: colors.screen }}>
        {/* ─── Date Pills ─────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8
          }}
        >
          <DatePillRow
            activeLabel={dateWindowLabel}
            onSelect={handleDatePillSelect}
          />
        </View>

        {/* ─── Toolbar ─────────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10
          }}
        >
          {/* Search bar */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              width: 340
            }}
          >
            <Search color={colors.label} size={15} />
            <TextInput
              placeholder='Search order, customer, or phone...'
              placeholderTextColor={colors.muted}
              value={searchText}
              onChangeText={setSearchText}
              style={{
                marginLeft: 6,
                fontSize: 13,
                paddingVertical: 8,
                height: 36,
                flex: 1,
                color: colors.heading
              }}
            />
          </View>

          {/* Scrollable filter pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, alignItems: 'center' }}
            style={{ flex: 1 }}
          >
            <FilterPill
              label='Needs Attention'
              isActive={activeFilter === 'needs-attention'}
              onPress={() => toggleFilter('needs-attention')}
              icon={<AlertTriangle color={colors.teal} size={13} />}
              count={filterCounts.needsAttention}
            />
            <FilterPill
              label='Refunded'
              isActive={activeFilter === 'refunded'}
              onPress={() => toggleFilter('refunded')}
              icon={<RotateCcw color={colors.teal} size={13} />}
              count={filterCounts.refunded}
            />
            <FilterPill
              label='Online'
              isActive={activeFilter === 'online'}
              onPress={() => toggleFilter('online')}
              icon={<Globe color={colors.teal} size={13} />}
              count={filterCounts.online}
            />
            <FilterPill
              label='Dine-In'
              isActive={activeFilter === 'dine-in'}
              onPress={() => toggleFilter('dine-in')}
              icon={<Utensils color={colors.teal} size={13} />}
              count={filterCounts.dineIn}
            />
            <FilterPill
              label='Takeaway'
              isActive={activeFilter === 'takeaway'}
              onPress={() => toggleFilter('takeaway')}
              icon={<ShoppingBag color={colors.teal} size={13} />}
              count={filterCounts.takeaway}
            />
            <FilterPill
              label='Delivery'
              isActive={activeFilter === 'delivery'}
              onPress={() => toggleFilter('delivery')}
              icon={<Truck color={colors.teal} size={13} />}
              count={filterCounts.delivery}
            />
          </ScrollView>

          {/* Sort segment pinned right */}
          <SortSegmentGroup
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
          />
        </View>

        {/* ─── Order List ──────────────────────────────── */}
        <View
          style={{
            flex: 1,
            borderRadius: 12,
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: colors.screen
          }}
        >
          {/* FlashList recycles row cells for smoother fling scrolling. Rows
              expand on tap, so `extraData={expandedOrderId}` is REQUIRED to
              re-render recycled cells when the expanded row changes, and
              `disableAutoLayout` is intentionally NOT set (variable-height rows
              need auto-layout correction). FlatList batching props have no
              FlashList equivalent. */}
          <FlashList
            data={filteredOrders}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            extraData={expandedOrderId}
            estimatedItemSize={90}
            drawDistance={500}
            ListEmptyComponent={
              isInitialLoading ? (
                <View style={{ paddingTop: 4 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 64
                  }}
                >
                  <Text style={{ fontSize: 20, color: colors.muted }}>
                    No orders found
                  </Text>
                  <Text
                    style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}
                  >
                    Try adjusting your filters or search
                  </Text>
                </View>
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.teal}
                colors={[colors.teal]}
              />
            }
            contentContainerStyle={{
              paddingTop: 4,
              paddingBottom: 16,
              backgroundColor: colors.screen
            }}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator size='small' color={colors.teal} />
                </View>
              ) : null
            }
          />

          {/* New Orders Banner */}
          {newOrdersCount > 0 && (
            <Animated.View
              entering={iosOnly(FadeIn.duration(200))}
              exiting={iosOnly(FadeOut.duration(200))}
              style={{
                position: 'absolute',
                top: 16,
                left: 0,
                right: 0,
                alignItems: 'center',
                zIndex: 10
              }}
              pointerEvents='box-none'
            >
              <TouchableOpacity
                onPress={handleRefresh}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 999,
                  backgroundColor: colors.teal,
                  shadowColor: colors.teal,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8
                }}
              >
                <RefreshCw size={16} color={colors.onSolid} />
                <Text
                  style={{
                    color: colors.onSolid,
                    fontWeight: '600',
                    fontSize: 14
                  }}
                >
                  {newOrdersCount} New Order{newOrdersCount > 1 ? 's' : ''} -
                  Tap to Refresh
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {/* ─── Modals ──────────────────────────────────── */}
        <OrderNotesModal
          isOpen={activeModal === 'notes'}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        />

        <ReceiptModal
          isOpen={!!selectedOrderForReceipt}
          onClose={() => setSelectedOrderForReceipt(null)}
          order={selectedOrderForReceipt}
          location={selectedStore}
        />
      </View>
    </KeyboardAvoidingView>
  )
}

export default PreviousOrdersScreen
