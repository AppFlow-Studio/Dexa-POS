import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { OrderProfile } from '@/lib/types'
import {
  useOrderTypeCounts,
  useStationOrders
} from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import { router } from 'expo-router'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  LinearTransition,
  SlideInLeft
} from 'react-native-reanimated'
import OrderCard from './OrderCard'
import OrderLineItemsModal from './OrderLineItemsModal'
import OrderTabs from './OrderTabs'

// Helper function to check if order is fully refunded
const isOrderFullyRefunded = (order: OrderProfile): boolean => {
  const payments = order.payments || []
  if (payments.length === 0) return false
  return payments.every(p => (p.refundedAmount ?? 0) >= (p.amount ?? 0))
}

// Define a constant for the width of each card plus its margin for accurate scrolling
const CARD_WIDTH_WITH_MARGIN = 288 + 16 // 288px card width + 16px right margin

const OrderLineSectionContent: React.FC = () => {
  // Store actions
  const markAllItemsAsReady = useOrderStore(s => s.markAllItemsAsReady)
  const setActiveOrder = useOrderStore(s => s.setActiveOrder)
  const archiveOrder = useOrderStore(s => s.archiveOrder)
  const updateOrderCheckStatus = useOrderStore(s => s.updateOrderCheckStatus)

  // Phase 4: Use selectors for station-based order filtering
  // This ensures only orders from this station (or adopted orders) are shown
  const stationOrders = useStationOrders()
  const orderCounts = useOrderTypeCounts()

  // State for the active filter tab
  const [activeTab, setActiveTab] = useState('All')
  const [isItemsModalOpen, setItemsModalOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  // Filter station orders: hide closed checks and ready+paid orders, show everything else
  const visibleOrders = useMemo(() => {
    return stationOrders.filter(o => {
      // Hide closed checks
      if (o.check_status === 'Closed') return false

      // Hide orders that are completed AND fully paid (ready+paid stay visible for "Mark Done")
      if (o.order_status === 'completed' && o.paid_status === 'Paid')
        return false

      // Show everything else (sent_to_kitchen, preparing, unpaid, refunded, etc.)
      return true
    })
  }, [stationOrders])

  // Map tab names to order_type values for filtering
  const tabToOrderType: Record<string, string[]> = {
    Takeaway: ['takeout', 'Takeaway'],
    Delivery: ['delivery', 'Delivery']
  }

  // State to hold the orders that are actually displayed
  const filteredOrders = useMemo(() => {
    if (activeTab === 'All') {
      return visibleOrders
    }
    const orderTypes = tabToOrderType[activeTab] || [activeTab]
    return visibleOrders.filter(o => orderTypes.includes(o.order_type ?? ''))
  }, [visibleOrders, activeTab])

  // Ref to control the FlatList for scrolling
  const flatListRef = useRef<Animated.FlatList<OrderProfile>>(null)
  // Ref to keep track of the current scroll position index
  const scrollIndexRef = useRef(0)

  // Function passed to OrderTabs to update the state
  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName)
  }

  // Function to scroll to the next card
  const scrollForward = () => {
    if (scrollIndexRef.current < filteredOrders.length - 1) {
      scrollIndexRef.current += 1
      flatListRef.current?.scrollToIndex({
        index: scrollIndexRef.current,
        animated: true,
        viewPosition: 0 // Aligns the card to the left edge
      })
    }
  }

  // Function to scroll to the previous card
  const scrollBackward = () => {
    if (scrollIndexRef.current > 0) {
      scrollIndexRef.current -= 1
      flatListRef.current?.scrollToIndex({
        index: scrollIndexRef.current,
        animated: true,
        viewPosition: 0
      })
    }
  }

  const canScrollBackward = scrollIndexRef.current > 0
  const canScrollForward = scrollIndexRef.current < filteredOrders.length - 1

  const handleViewItems = (orderId: string) => {
    setSelectedOrderId(orderId)
    setItemsModalOpen(true)
  }

  const handleCompleteOrder = useCallback(
    (orderId: string) => {
      markAllItemsAsReady(orderId)
      archiveOrder(orderId)
    },
    [markAllItemsAsReady, archiveOrder]
  )

  const handleRetrieve = (orderId: string) => {
    setActiveOrder(orderId)
  }

  // Handler for Mark Done - marks items ready then archives the order
  const handleMarkDone = useCallback(
    (orderId: string) => {
      markAllItemsAsReady(orderId)
      archiveOrder(orderId)
    },
    [markAllItemsAsReady, archiveOrder]
  )

  // Handler for Reopen Check - reopens the check and sets as active order
  const handleReopenCheck = useCallback(
    (orderId: string) => {
      updateOrderCheckStatus(orderId, 'Opened')
      setActiveOrder(orderId)
    },
    [updateOrderCheckStatus, setActiveOrder]
  )
  // Sort orders by timestamp (newest first) for proper order display
  const sortedFilteredOrders = useMemo(() => {
    return filteredOrders.slice().sort((a, b) => {
      // Use last_activity_at if available, otherwise fall back to opened_at
      const timeA = a.last_activity_at || a.opened_at || ''
      const timeB = b.last_activity_at || b.opened_at || ''
      // Sort descending (newest first)
      return new Date(timeB).getTime() - new Date(timeA).getTime()
    })
  }, [filteredOrders])

  return (
    <View>
      <View className='flex-row justify-between items-center'>
        <OrderTabs onTabChange={handleTabChange} counts={orderCounts} />

        <View className='flex-row items-center gap-2'>
          <TouchableOpacity
            onPress={scrollBackward}
            disabled={!canScrollBackward}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.panel,
              shadowColor: '#000',
              shadowOpacity: 0.28,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
              opacity: canScrollBackward ? 1 : 0.45
            }}
            activeOpacity={0.85}
          >
            <ChevronLeft color={colors.label} size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={scrollForward}
            disabled={!canScrollForward}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.panel,
              shadowColor: '#000',
              shadowOpacity: 0.28,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
              opacity: canScrollForward ? 1 : 0.45
            }}
            activeOpacity={0.85}
          >
            <ChevronRight color={colors.label} size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.FlatList
        ref={flatListRef}
        data={sortedFilteredOrders}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        className='mt-4'
        itemLayoutAnimation={LinearTransition.springify()
          .damping(18)
          .stiffness(120)}
        // OPTIMIZED: FlatList performance props
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        getItemLayout={(data, index) => ({
          length: CARD_WIDTH_WITH_MARGIN,
          offset: CARD_WIDTH_WITH_MARGIN * index,
          index
        })}
        renderItem={({ item }) => (
          <Animated.View
            entering={iosOnly(
              SlideInLeft.duration(350).springify().damping(16)
            )}
          >
            <OrderCard
              order={item}
              onViewItems={() => handleViewItems(item.id)}
              onComplete={() => handleCompleteOrder(item.id)}
              onRetrieve={() => handleRetrieve(item.id)}
              onMarkDone={() => handleMarkDone(item.id)}
              onReopenCheck={() => handleReopenCheck(item.id)}
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          <View className='h-40 items-center justify-center w-full'>
            <Text className='text-lg text-gray-400'>
              No orders for this category.
            </Text>
          </View>
        }
      />
      <OrderLineItemsModal
        isOpen={isItemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        orderId={selectedOrderId}
        onMarkDone={
          selectedOrderId ? () => handleMarkDone(selectedOrderId) : undefined
        }
        onRetrieve={
          selectedOrderId ? () => handleRetrieve(selectedOrderId) : undefined
        }
        onRefund={
          selectedOrderId
            ? () => {
                setItemsModalOpen(false)
                router.push(`/previous-orders/${selectedOrderId}`)
              }
            : undefined
        }
      />
    </View>
  )
}

const OrderLineSection = React.memo(OrderLineSectionContent)
export default OrderLineSection
