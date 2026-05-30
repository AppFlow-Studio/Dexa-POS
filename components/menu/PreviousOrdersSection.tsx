import { usePreviousOrdersListSync } from '@/hooks/pos/usePreviousOrdersListSync'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { OrderProfile } from '@/lib/types'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePreviousOrdersStore } from '@/stores/usePreviousOrdersStore'
import { useRouter } from 'expo-router'
import { RefreshCw, Search, X } from 'lucide-react-native'
import React, { useCallback, useMemo, useState } from 'react'
import {
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'
import OrderLineItemsModal from '../order/OrderLineItemsModal'
import DatePillRow, { type DatePillDef } from './DatePillRow'
import OrderActionsMenu from './OrderActionsMenu'
import OrdersTable, { SortColumn, SortDirection } from './OrdersTable'

// Define types for props
type TabName = 'All' | 'Dine In' | 'Takeaway' | 'Delivery' | 'Online'

const DINE_IN_VALUES = new Set(['Dine In', 'dine_in'])
const TAKEAWAY_VALUES = new Set(['Takeaway', 'takeout'])
const DELIVERY_VALUES = new Set(['Delivery', 'delivery'])

// Remove old OrderRow and RetrieveButton components - replaced by table view

interface TabCounts {
  All: number
  'Dine In': number
  Takeaway: number
  Delivery: number
  Online: number
}

interface OrderTabsProps {
  onTabChange: (tab: TabName) => void
  counts: TabCounts
  activeTab: TabName
}

const OrderTabs: React.FC<OrderTabsProps> = ({
  onTabChange,
  counts,
  activeTab
}) => {
  const TAB_NAMES: TabName[] = [
    'All',
    'Takeaway',
    'Dine In',
    'Delivery',
    'Online'
  ]

  return (
    <View
      className='flex-row self-start rounded-lg p-0.5'
      style={{
        height: 36,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 2
      }}
    >
      {TAB_NAMES.map(name => {
        const isActive = activeTab === name
        const count = counts[name] ?? 0
        return (
          <Pressable
            key={name}
            onPress={() => onTabChange(name)}
            className='flex-row items-center rounded-md gap-x-1.5'
            style={[
              {
                paddingHorizontal: 14,
                alignSelf: 'stretch',
                justifyContent: 'center',
                borderRadius: 6,
                borderWidth: 1
              },
              isActive
                ? name === 'Online'
                  ? {
                      backgroundColor: colors.info + '20',
                      borderColor: colors.info + '40'
                    }
                  : {
                      backgroundColor: colors.teal + '20',
                      borderColor: colors.teal + '40'
                    }
                : { borderColor: 'transparent' }
            ]}
          >
            <Text
              className='text-xs font-semibold'
              style={{
                color: isActive
                  ? name === 'Online'
                    ? colors.info
                    : colors.teal
                  : colors.muted
              }}
            >
              {name}
              {count > 0 ? ` (${count})` : ''}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Old OrderRow and RetrieveButton components removed - replaced by OrdersTable

const PreviousOrdersSection = () => {
  // Read the resolved date-window bounds at the component level so the
  // `liveOrders` selector below can gate on them. These bounds come from
  // `get_business_day_bounds` (or the Luxon fallback) — same source used to
  // fetch `previousOrders`, so the live and history sides agree on what
  // "Today" / "Yesterday" / "Last 7 days" mean.
  const liveDateBounds = usePreviousOrdersStore(
    useShallow(s => ({
      startTs: s.dateWindow?._resolvedStartTs ?? null,
      endTs: s.dateWindow?._resolvedEndTs ?? null
    }))
  )

  // Narrow selector: active order + working set + station-visible, in-window,
  // non-final orders. History comes from previousOrders (date-bounded). Do NOT
  // scan all orderIds blindly — useOrderStore can have 1500+ stale non-final
  // orders from useOrdersQuery (which has no date bound today).
  //
  // Date window: skip orders whose `opened_at` falls outside the active pill's
  // resolved bounds. The `useOrdersQuery` fetch is status-only with no date
  // bound, so without this filter the user sees months of stale "ready" /
  // "preparing" orders piled up in the list. The active order + working set
  // bypass the date filter — the cashier is mid-edit on those, regardless of
  // when they were opened.
  //
  // Station visibility honours `view_scope` (mirrors `isOrderVisible` in
  // useOrderStore):
  //   own      → only this station's orders
  //   location → any station at this location
  //   online   → this station + delivery/takeout from any station
  const liveOrders = useOrderStore(
    useShallow(s => {
      const ids = new Set<string>()
      if (s.activeOrderId) ids.add(s.activeOrderId)
      for (const wsId of s.workingSetOrderIds || []) {
        const localId = s.dbOrderIdIndex[wsId] || wsId
        ids.add(localId)
      }
      const finalStatuses = new Set([
        'completed',
        'void',
        'cancelled',
        'voided'
      ])
      const viewScope = s.currentStation?.view_scope ?? 'own'
      const startTs = liveDateBounds.startTs
      const endTs = liveDateBounds.endTs
      for (const id of s.orderIds) {
        if (ids.has(id)) continue
        const o = s.ordersById[id]
        if (!o) continue
        if (viewScope === 'own') {
          if (o.station_id !== s.currentStationId) continue
        } else if (viewScope === 'online') {
          const isOnlineType =
            o.order_type === 'delivery' || o.order_type === 'takeout'
          if (o.station_id !== s.currentStationId && !isOnlineType) continue
        }
        // viewScope === 'location' → no station gate
        if (finalStatuses.has(o.order_status ?? '')) continue
        if (o.order_status === 'draft' && o.items.length === 0) continue
        // Date-window gate (skip when bounds aren't resolved yet — initial
        // render before the RPC returns). `opened_at` can be null on brand-
        // new drafts; let those through so the user sees what they're
        // currently typing.
        if (startTs && endTs && o.opened_at) {
          if (o.opened_at < startTs || o.opened_at >= endTs) continue
        }
        ids.add(id)
      }
      const result: OrderProfile[] = []
      for (const id of ids) {
        const o = s.ordersById[id]
        if (o) result.push(o)
      }
      return result
    })
  )
  const { previousOrders, newOrdersCount } = usePreviousOrdersStore()
  const dateWindowLabel = usePreviousOrdersStore(
    s => s.dateWindow?.label ?? 'today'
  )
  const setDateWindow = usePreviousOrdersStore(s => s.setDateWindow)
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabName>('All')
  const [isItemsModalOpen, setItemsModalOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { refresh: handleRefresh, isRefreshing } = usePreviousOrdersListSync()
  const loadMoreOrders = usePreviousOrdersStore(s => s.loadMoreOrders)
  const isLoadingMore = usePreviousOrdersStore(s => s._isLoadingMore)
  const hasMore = usePreviousOrdersStore(s => s._hasMore)

  const handleDatePillSelect = useCallback(
    (pill: DatePillDef) => {
      const { startDate, endDate } = pill.getDateRange()
      setDateWindow({ startDate, endDate, label: pill.windowLabel })
    },
    [setDateWindow]
  )

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) void loadMoreOrders()
  }, [hasMore, isLoadingMore, loadMoreOrders])

  // New state for table view
  const [sortColumn, setSortColumn] = useState<SortColumn>('time')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [isMenuOpen, setMenuOpen] = useState(false)
  const [menuOrderId, setMenuOrderId] = useState<string | null>(null)

  const [menuPosition, setMenuPosition] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  // Get all orders - combine live orders with history for compatibility
  const allOrders: OrderProfile[] = useMemo(() => {
    // liveOrders already filtered to non-empty drafts + active/working set
    const activeOrders = liveOrders

    // Create sets for O(1) lookup of active orders to prevent duplicates
    const activeIds = new Set(activeOrders.map(o => o.id))
    const activeDbIds = new Set(
      activeOrders.map(o => o.db_order_id).filter(Boolean)
    )

    // 2. Map Previous Orders to OrderProfile format
    // Filter out any that are already in activeOrders to avoid duplicates
    const mappedHistoryOrders: OrderProfile[] = previousOrders
      .filter(po => {
        // Exclude if ID matches or DB_ID matches an active order
        if (activeIds.has(po.orderId)) return false
        if (po.db_order_id && activeDbIds.has(po.db_order_id)) return false
        return true
      })
      .map(
        po =>
          ({
            id: po.orderId,
            db_order_id: po.db_order_id,
            // Helper fields
            display_number: po.display_number,
            order_number: po.display_number,
            customer_name: po.customer,
            server_name: po.server,

            // Status mapping
            order_status: po.voided
              ? 'void'
              : po.refunded
              ? 'refunded'
              : po.closed_at
              ? 'completed'
              : 'pending', // Best guess mapping
            check_status: po.checkStatus || 'Opened',
            paid_status: po.paymentStatus,

            // Type mapping
            order_type: po.type,

            // Items and totals
            items: po.items,
            total_amount: po.total,
            amount_paid: po.amount_paid,
            amount_due: po.amount_due,
            cash_amount_due: po.cash_amount_due,

            // Timestamps
            opened_at: po.timestamp || po.opened_at,
            created_at: po.timestamp, // Ensure sort works if it uses created_at
            closed_at: po.closed_at,

            // Location/Station
            service_location_id: po.service_location_id || null, // strict null for type safety
            service_location_name: po.service_location_name,
            station_id: po.station_id || null,
            _sourceStationName: po.station_name,

            // Extras
            notes: po.notes,
            payments: po.payments,
            order_source: po.order_source ?? null,
            delivery_platform: po.delivery_platform ?? null,
            reversals: po.reversals,
            order_refund_items: po.order_refund_items
          } as OrderProfile)
      )

    // Combined list: Active Orders + Missing History Orders
    return [...activeOrders, ...mappedHistoryOrders]
  }, [liveOrders, previousOrders])

  // Compute per-tab counts
  const tabCounts = useMemo<TabCounts>(() => {
    let dineIn = 0
    let takeaway = 0
    let delivery = 0
    let online = 0
    for (const o of allOrders) {
      const t = o.order_type ?? ''
      if (DINE_IN_VALUES.has(t)) dineIn++
      else if (TAKEAWAY_VALUES.has(t)) takeaway++
      else if (DELIVERY_VALUES.has(t)) delivery++
      if (o.order_source?.toLowerCase() === 'online') online++
    }
    return {
      All: allOrders.length,
      'Dine In': dineIn,
      Takeaway: takeaway,
      Delivery: delivery,
      Online: online
    }
  }, [allOrders])

  // Filter orders based on active tab and search query
  const filteredOrders = useMemo(() => {
    let filtered = allOrders

    // Filter by tab
    if (activeTab === 'Online') {
      filtered = filtered.filter(
        o => o.order_source?.toLowerCase() === 'online'
      )
    } else if (activeTab !== 'All') {
      const tabSet =
        activeTab === 'Dine In'
          ? DINE_IN_VALUES
          : activeTab === 'Takeaway'
          ? TAKEAWAY_VALUES
          : DELIVERY_VALUES
      filtered = filtered.filter(o => tabSet.has(o.order_type ?? ''))
    }

    // Filter by search query (customer name or display number)
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(o => {
        const customerName = (o.customer_name || 'walk-in').toLowerCase()
        const displayNumber = String(o.display_number || '').toLowerCase()
        return customerName.includes(query) || displayNumber.includes(query)
      })
    }

    return filtered
  }, [allOrders, activeTab, searchQuery])

  const handleTabChange = (tabName: TabName) => setActiveTab(tabName)

  // Handle sort
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to descending
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  // Handle row click - navigate to order details screen
  const handleRowClick = (orderId: string) => {
    router.push(`/previous-orders/${orderId}`)
  }

  // Handle double-click - set order as active
  const handleDoubleClick = (orderId: string) => {
    useOrderStore.getState().setActiveOrder(orderId)
  }

  // Handle more button click - open actions menu
  const handleMoreClick = (
    orderId: string,
    position?: { x: number; y: number; width: number; height: number }
  ) => {
    setMenuOrderId(orderId)
    if (position) {
      setMenuPosition(position)
    }
    setMenuOpen(true)
  }

  // Handle view details from menu
  const handleViewDetails = () => {
    if (menuOrderId) {
      router.push(`/previous-orders/${menuOrderId}`)
    }
  }

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 12,
        paddingTop: 12,
        backgroundColor: colors.screen
      }}
    >
      {/* Header: Date Pills + Tabs + Search + Refresh */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6
        }}
      >
        <DatePillRow
          activeLabel={dateWindowLabel}
          onSelect={handleDatePillSelect}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10
        }}
      >
        <OrderTabs
          onTabChange={handleTabChange}
          counts={tabCounts}
          activeTab={activeTab}
        />

        {/* Search Bar */}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Search color={colors.muted} size={12} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder='Search orders...'
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              marginLeft: 7,
              color: colors.heading,
              fontSize: 12,
              padding: 0
            }}
            autoCapitalize='none'
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X color={colors.muted} size={12} />
            </TouchableOpacity>
          )}
        </View>

        {/* Refresh button */}
        <TouchableOpacity
          onPress={handleRefresh}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <RefreshCw
            size={13}
            color={isRefreshing ? colors.teal : colors.muted}
          />
        </TouchableOpacity>
      </View>

      {/* Orders Table Container - relative for absolute positioning of banner */}
      <View
        style={{
          flex: 1,
          position: 'relative',
          backgroundColor: colors.screen
        }}
      >
        {/* Orders Table - No ScrollView wrapper to avoid nested VirtualizedLists */}
        <OrdersTable
          orders={filteredOrders}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onMoreClick={handleMoreClick}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          isLoadingMore={isLoadingMore}
        />

        {/* New Orders Banner - Floating */}
        {newOrdersCount > 0 && (
          <Animated.View
            entering={iosOnly(FadeIn.duration(200))}
            exiting={iosOnly(FadeOut.duration(200))}
            className='absolute top-4 left-0 right-0 items-center z-10'
            pointerEvents='box-none'
          >
            <TouchableOpacity
              onPress={() => void handleRefresh()}
              activeOpacity={0.8}
              className='flex-row items-center gap-2 px-4 py-2.5 rounded-full'
              style={{
                backgroundColor: colors.teal,
                shadowColor: colors.teal,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8
              }}
            >
              <RefreshCw size={13} color={colors.onSolid} />
              <Text
                className='text-xs font-semibold'
                style={{ color: colors.onSolid }}
              >
                {newOrdersCount} new order{newOrdersCount > 1 ? 's' : ''} — tap
                to refresh
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Modals */}
      <OrderActionsMenu
        isOpen={isMenuOpen}
        onClose={() => setMenuOpen(false)}
        orderId={menuOrderId}
        onViewDetails={handleViewDetails}
        position={menuPosition}
      />

      <OrderLineItemsModal
        isOpen={isItemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        orderId={selectedOrderId}
      />
    </View>
  )
}

export default PreviousOrdersSection
