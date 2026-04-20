import { useToast } from '@/contexts/ToastContext'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { CartItem } from '@/lib/types'
import {
  getAutoRetryCount,
  isAutoRetryInProgress
} from '@/services/offlineSyncService'
import { PrinterService } from '@/services/printing/PrinterService'
import { useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { useDineInStore } from '@/stores/useDineInStore'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useReservationStore } from '@/stores/useReservationStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useOrderSyncCounts } from '@/stores/useSyncStatusStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import type {
  FloorPlanObject,
  ServerSection
} from '@/types/db-floor-plan-types'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import {
  AlertTriangle,
  Check,
  Clock,
  CreditCard,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
  WifiOff,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import BillSummary from './BillSummary'
import DiscountOverlay from './DiscountOverlay'
import OrderDetails from './OrderDetails'
import Totals from './Totals'

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const BillItemsAndTotals = React.memo(
  ({
    cart,
    orderNote,
    onChangeOrderNote,
    onSaveOrderNote
  }: {
    cart: CartItem[]
    orderNote?: string
    onChangeOrderNote: (value: string) => void
    onSaveOrderNote: () => void
  }) => {
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

    const handleToggleExpand = useCallback((itemId: string) => {
      setExpandedItemId(prev => (prev === itemId ? null : itemId))
    }, [])

    return (
      <>
        <BillSummary
          cart={cart}
          expandedItemId={expandedItemId}
          onToggleExpand={handleToggleExpand}
        />
        <View className='px-3 pb-1'>
          <View
            className='h-9 rounded-lg flex-row items-center mb-1'
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 10,
              gap: 7
            }}
          >
            <NotebookPen size={13} color={colors.muted} />
            <TextInput
              value={orderNote ?? ''}
              onChangeText={onChangeOrderNote}
              onBlur={onSaveOrderNote}
              onEndEditing={onSaveOrderNote}
              placeholder='Add order note...'
              placeholderTextColor={colors.muted}
              multiline={false}
              numberOfLines={1}
              textAlignVertical='center'
              style={{
                flex: 1,
                color: colors.heading,
                fontSize: 12,
                lineHeight: 16,
                height: 18,
                paddingHorizontal: 0,
                paddingVertical: 0,
                margin: 2,
                includeFontPadding: false,
                fontFamily: 'System'
              }}
            />
          </View>
        </View>
      </>
    )
  },
  (prev, next) =>
    prev.cart === next.cart &&
    prev.orderNote === next.orderNote &&
    prev.onChangeOrderNote === next.onChangeOrderNote &&
    prev.onSaveOrderNote === next.onSaveOrderNote
)

const BillSectionContent = ({
  showOrderDetails = true,
  showPlaymentActions = true,
  moreOptionsSheetRef,
  discountSheetRef
}: {
  showOrderDetails?: boolean
  showPlaymentActions?: boolean
  moreOptionsSheetRef?: React.RefObject<BottomSheetMethods>
  discountSheetRef?: React.RefObject<BottomSheetMethods>
}) => {
  // O(1) lookups - single shallow selector reduces subscription overhead
  const activeOrderId = useOrderStore(state => state.activeOrderId)
  const {
    activeOrderItems,
    activeOrderPayments,
    activeOrderPaidStatus,
    activeOrderType,
    activeOrderServiceLocation,
    activeOrderDisplayNumber
  } = useOrderStore(
    useShallow(s => {
      const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null
      return {
        activeOrderItems: order?.items ?? null,
        activeOrderPayments: order?.payments ?? null,
        activeOrderPaidStatus: order?.paid_status ?? null,
        activeOrderType: order?.order_type ?? null,
        activeOrderServiceLocation: order?.service_location_id ?? null,
        activeOrderDisplayNumber:
          order?.display_number ?? order?.order_number ?? null
      }
    })
  )

  // Phase 7: Use derived selector instead of 3 individual store selectors
  const orderTotals = useActiveOrderTotals()

  const {
    startNewOrder,
    sendNewItemsToKitchen,
    assignOrderToTable,
    setActiveOrder,
    retryFailedSyncs,
    voidOrder,
    updateActiveOrderDetails
  } = useOrderStore(
    useShallow(s => ({
      startNewOrder: s.startNewOrder,
      sendNewItemsToKitchen: s.sendNewItemsToKitchen,
      assignOrderToTable: s.assignOrderToTable,
      setActiveOrder: s.setActiveOrder,
      retryFailedSyncs: s.retryFailedSyncs,
      voidOrder: s.voidOrder,
      updateActiveOrderDetails: s.updateActiveOrderDetails
    }))
  )
  const activeOrder = useOrderStore(s =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : null
  )

  // Offline sync state — subscribe directly to offlineSyncService for reliable updates
  const { isOnline, pendingSyncCount } = useNetworkStatus()

  const { selectedTable, clearSelectedTable } = useDineInStore()
  const setSelectedTable = useDineInStore(s => s.setSelectedTable)
  const floorPlans = useFloorPlanStore(s => s.floorPlans)
  const tables = useFloorPlanStore(s => s.tables)
  const sections = useFloorPlanStore(s => s.sections)
  const activeFloorPlanId = useFloorPlanStore(s => s.activeFloorPlanId)
  const setActiveFloorPlan = useFloorPlanStore(s => s.setActiveFloorPlan)
  const { activeEmployeeId } = useEmployeeStore()
  const { checkEmployeeInShift, showClockInWall } = useTimeclockStore()
  const { show } = useToast()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const autoPrintKitchenTickets = useLocationConfigStore(
    s => s.config.printing.autoPrintKitchenTickets
  )

  // Memoize computed values to prevent unnecessary recalculations
  const cart = useMemo(() => activeOrderItems || [], [activeOrderItems])
  const hasDraftItems = useMemo(() => cart.some(item => item.isDraft), [cart])
  const newItemsCount = useMemo(
    () =>
      cart.filter(item => item.kitchen_status === 'new' || !item.kitchen_status)
        .length,
    [cart]
  )

  // Get sync counts for the active order's non-draft items.
  // useOrderSyncCounts only re-renders BillSection when the actual counts change,
  // not on every individual item sync status transition.
  const nonDraftItemIds = useMemo(
    () => cart.filter(item => !item.isDraft).map(item => item.id),
    [cart]
  )
  const syncStatus = useOrderSyncCounts(nonDraftItemIds)
  const hasPendingSyncs = syncStatus.pending > 0
  const hasFailedSyncs = syncStatus.failed > 0

  // Track auto-retry state for UI indicator
  const [autoRetryState, setAutoRetryState] = useState({
    isRetrying: false,
    count: 0
  })

  // Poll for auto-retry status when there are failed syncs
  useEffect(() => {
    if (!hasFailedSyncs && !hasPendingSyncs) {
      setAutoRetryState(prev =>
        prev.isRetrying || prev.count !== 0
          ? { isRetrying: false, count: 0 }
          : prev
      )
      return
    }

    // Check auto-retry status periodically
    const checkAutoRetry = () => {
      const isRetrying = isAutoRetryInProgress()
      const count = getAutoRetryCount()
      setAutoRetryState(prev =>
        prev.isRetrying === isRetrying && prev.count === count
          ? prev
          : { isRetrying, count }
      )
    }

    checkAutoRetry()
    const interval = setInterval(checkAutoRetry, 5000) // PERF: 5s - informational, not action-critical

    return () => clearInterval(interval)
  }, [hasFailedSyncs, hasPendingSyncs])

  // Calculate the amount to display on the Pay button
  // Phase 7: Now uses derived selector which already prioritizes backend values
  const displayBalanceDue = useMemo(() => {
    if (!orderTotals) return 0

    // Derived selector's amountDue already prioritizes backend amount_due
    // For new orders without payments, use total
    if (!activeOrderPayments?.length) {
      return orderTotals.total
    }

    return orderTotals.amountDue
  }, [orderTotals, activeOrderPayments])

  // Check if order is partially paid (has payments but not fully paid)
  const isPartiallyPaid = useMemo(() => {
    const hasPayments = (activeOrderPayments?.length ?? 0) > 0
    const hasDue = (orderTotals?.amountDue ?? 0) > 0.01
    return hasPayments && (activeOrderPaidStatus !== 'Paid' || hasDue)
  }, [activeOrderPayments, activeOrderPaidStatus, orderTotals?.amountDue])

  const [isProcessing, setIsProcessing] = useState(false)
  const [orderNoteDraft, setOrderNoteDraft] = useState('')
  const isPaymentSheetOpen = usePaymentStore(state => state.isOpen)

  const currentOrderNote = useMemo(
    () => activeOrder?.notes?.trim() ?? '',
    [activeOrder?.notes]
  )

  const handleSaveOrderNote = useCallback(async () => {
    const trimmed = orderNoteDraft.trim()
    await updateActiveOrderDetails({
      notes: trimmed.length > 0 ? trimmed : undefined
    })
  }, [orderNoteDraft, updateActiveOrderDetails])

  useEffect(() => {
    setOrderNoteDraft(activeOrder?.notes ?? '')
  }, [activeOrder?.id, activeOrder?.notes])

  useEffect(() => {
    if ((orderNoteDraft ?? '').trim() === currentOrderNote) {
      return
    }

    const timeoutId = setTimeout(() => {
      void handleSaveOrderNote()
    }, 450)

    return () => clearTimeout(timeoutId)
  }, [currentOrderNote, handleSaveOrderNote, orderNoteDraft])

  // Effect to reset processing state when payment sheet opens
  useEffect(() => {
    if (isPaymentSheetOpen) {
      setIsProcessing(false)
    }
  }, [isPaymentSheetOpen])

  // Memoize pay button disabled state - prevents clicking when balance due is 0 or no items
  const isPayButtonDisabled = useMemo(
    () =>
      !activeOrderId ||
      cart.length === 0 ||
      displayBalanceDue <= 0 ||
      isProcessing,
    [activeOrderId, cart.length, displayBalanceDue, isProcessing]
  )
  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false)
  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false)
  const [isTableSelectorOpen, setIsTableSelectorOpen] = useState(false)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null
  )
  const [pendingFloorPlanId, setPendingFloorPlanId] = useState<string | null>(
    null
  )
  const billSectionRef = useRef<View>(null)
  const [tableDrawerAnchor, setTableDrawerAnchor] = useState({
    left: 0,
    top: 0,
    height: 0
  })
  // OPTIMIZED: Wrap callbacks with useCallback to prevent recreation on each render
  const handleOpenDiscounts = useCallback(() => {
    setDiscountOverlayVisible(true)
  }, [])

  const handleCloseDiscounts = useCallback(() => {
    setDiscountOverlayVisible(false)
  }, [])

  const handleOpenMoreOptions = useCallback(() => {
    moreOptionsSheetRef?.current?.expand()
  }, [moreOptionsSheetRef])

  const displayedTable = useMemo(
    () =>
      selectedTable ??
      tables.find(table => table.id === activeOrderServiceLocation) ??
      null,
    [activeOrderServiceLocation, selectedTable, tables]
  )

  const handleOpenTableSelector = useCallback(() => {
    setSelectedSectionId(
      selectedTable?.section_id ?? displayedTable?.section_id ?? null
    )
    setPendingFloorPlanId(
      displayedTable?.floor_plan_id ??
        selectedTable?.floor_plan_id ??
        activeFloorPlanId ??
        floorPlans[0]?.id ??
        null
    )

    if (billSectionRef.current?.measureInWindow) {
      billSectionRef.current.measureInWindow((x, y, width, height) => {
        setTableDrawerAnchor({ left: x + width, top: y, height })
        setIsTableSelectorOpen(true)
      })
      return
    }

    setIsTableSelectorOpen(true)
  }, [
    activeFloorPlanId,
    displayedTable?.floor_plan_id,
    displayedTable?.section_id,
    floorPlans,
    selectedTable?.floor_plan_id,
    selectedTable?.section_id
  ])

  const activeFloorPlan = useMemo(
    () => floorPlans.find(plan => plan.id === activeFloorPlanId) ?? null,
    [activeFloorPlanId, floorPlans]
  )

  const tableOptions = useMemo(
    () =>
      tables
        .filter(
          table =>
            table.is_active !== false &&
            table.is_visible !== false &&
            (table.category === 'table' || table.category === 'booth')
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [tables]
  )

  const floorPlanOptions = useMemo(
    () =>
      [...floorPlans].sort((left, right) =>
        left.name.localeCompare(right.name)
      ),
    [floorPlans]
  )

  const sectionOptions = useMemo(() => {
    const sectionsById = new Map(sections.map(section => [section.id, section]))
    const uniqueSectionIds = Array.from(
      new Set(tableOptions.map(table => table.section_id).filter(Boolean))
    ) as string[]

    return uniqueSectionIds
      .map(sectionId => {
        const existingSection = sectionsById.get(sectionId)

        return (
          existingSection ?? {
            id: sectionId,
            name: 'Section',
            color: colors.muted,
            assigned_staff_id: null,
            floor_plan_id:
              tableOptions.find(table => table.section_id === sectionId)
                ?.floor_plan_id || ''
          }
        )
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [sections, tableOptions])

  const filteredTableOptions = useMemo(() => {
    if (!selectedSectionId) {
      return tableOptions
    }

    return tableOptions.filter(table => table.section_id === selectedSectionId)
  }, [selectedSectionId, tableOptions])

  const selectedSection = useMemo(
    () =>
      sectionOptions.find(section => section.id === selectedSectionId) ?? null,
    [sectionOptions, selectedSectionId]
  )

  const handleOpenFloorPlanSelector = useCallback(() => {
    void handleOpenTableSelector()
  }, [handleOpenTableSelector])

  const handleOpenSectionSelector = useCallback(() => {
    void handleOpenTableSelector()
  }, [handleOpenTableSelector])

  const handleSelectFloorPlan = useCallback(
    async (floorPlanId: string) => {
      if (floorPlanId === activeFloorPlanId) {
        setPendingFloorPlanId(floorPlanId)
        return
      }

      setPendingFloorPlanId(floorPlanId)
      setSelectedSectionId(null)
      await setActiveFloorPlan(floorPlanId)
    },
    [activeFloorPlanId, setActiveFloorPlan]
  )

  useEffect(() => {
    if (!selectedSectionId) {
      return
    }

    const hasSelectedSection = sectionOptions.some(
      section => section.id === selectedSectionId
    )

    if (!hasSelectedSection) {
      setSelectedSectionId(null)
    }
  }, [sectionOptions, selectedSectionId])

  const getTableStatusLabel = useCallback((table: FloorPlanObject) => {
    const status = table.session?.status ?? 'available'
    const labelMap: Record<string, string> = {
      available: 'Available',
      reserved: 'Reserved',
      seating: 'Seating',
      seated: 'Seated',
      ordering: 'Ordering',
      ordered: 'Ordered',
      served: 'Served',
      check_presented: 'Check Presented',
      paying: 'Paying',
      paid: 'Paid',
      closing: 'Closing',
      cleaning: 'Cleaning',
      blocked: 'Blocked',
      not_in_service: 'Not in Service'
    }

    return labelMap[status] || status
  }, [])

  const handleSelectTable = useCallback(
    (table: FloorPlanObject) => {
      const isCurrentlyAssigned = table.id === activeOrderServiceLocation
      const isAvailable = (table.session?.status ?? 'available') === 'available'

      if (!isAvailable && !isCurrentlyAssigned) {
        show({
          title: 'Table Unavailable',
          message: `${table.name} is currently ${getTableStatusLabel(
            table
          ).toLowerCase()}.`,
          type: 'error'
        })
        return
      }

      setSelectedTable(table)
      setIsTableSelectorOpen(false)
    },
    [activeOrderServiceLocation, getTableStatusLabel, setSelectedTable, show]
  )

  const handleVoidOrder = useCallback(() => {
    if (!activeOrderId || !activeOrder) return
    setIsVoidConfirmOpen(true)
  }, [activeOrder, activeOrderId])

  const handleConfirmVoidOrder = useCallback(async () => {
    if (!activeOrderId || !activeOrder) return

    const sessionStore = useTableSessionStore.getState()
    const sessionId = activeOrder.session_id
    const tableId = sessionId
      ? sessionStore.sessionTableIndex[sessionId]?.[0] ?? ''
      : ''

    if (tableId) {
      await sessionStore.dispatchAction({
        type: 'VOID_ORDER',
        tableId,
        orderId: activeOrder.id,
        dbOrderId: activeOrder.db_order_id
      })

      if (activeOrder.session_id) {
        await useReservationStore
          .getState()
          .completeReservationForSession(activeOrder.session_id)
      }
    } else {
      voidOrder(activeOrderId)
    }

    setIsVoidConfirmOpen(false)
    show({
      title: 'Order Voided',
      message: 'The current order has been successfully voided.',
      type: 'success'
    })
  }, [activeOrder, activeOrderId, show, voidOrder])

  const handlePayClick = () => {
    // Safety guard: Prevent payment if button should be disabled
    if (isPayButtonDisabled || isProcessing) {
      return
    }

    // Set processing state immediately to prevent double taps
    setIsProcessing(true)

    // Failsafe: Reset processing state after 2 seconds if sheet fails to open
    setTimeout(() => {
      setIsProcessing(false)
    }, 2000)

    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall()
      setIsProcessing(false)
      return
    }
    if (hasDraftItems) {
      show({
        title: 'Unconfirmed Items',
        message:
          'Please confirm or remove any customized items before proceeding to payment.',
        type: 'error'
      })
      setIsProcessing(false)
      return
    }
    // Additional safety check for zero balance due
    if (displayBalanceDue <= 0) {
      show({
        title: 'Invalid Amount',
        message:
          activeOrderPaidStatus === 'Paid'
            ? 'This order is already fully paid.'
            : 'Cannot process payment for $0.00. Please add items to the order.',
        type: 'error'
      })
      setIsProcessing(false)
      return
    }
    // Directly open the payment bottom sheet to the method selection
    usePaymentStore
      .getState()
      .open(
        'Card',
        activeOrderServiceLocation || null,
        'payment-method-selection'
      )
  }

  const handleSendToKitchen = () => {
    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall()
      return
    }
    if (hasDraftItems) {
      show({
        title: 'Unconfirmed Items',
        message:
          'Please confirm or remove any customized items before sending the order to the kitchen.',
        type: 'error'
      })
      return
    }

    // Capture new items BEFORE sendNewItemsToKitchen (which merges/mutates statuses)
    const currentOrder = activeOrderId
      ? useOrderStore.getState().ordersById[activeOrderId]
      : null
    const newItems =
      currentOrder?.items.filter(
        item => !item.kitchen_status || item.kitchen_status === 'new'
      ) || []

    if (activeOrderType === 'dine_in' && selectedTable) {
      assignOrderToTable(activeOrderId!, selectedTable.id)
      // Table session status updates are now handled through session-based APIs
      clearSelectedTable()
    }
    sendNewItemsToKitchen()

    // Auto-print kitchen tickets for new items
    if (
      autoPrintKitchenTickets &&
      selectedStore &&
      newItems.length > 0 &&
      currentOrder
    ) {
      PrinterService.printKitchenTickets(
        currentOrder,
        newItems,
        selectedStore
      ).catch(e =>
        console.warn('[BillSection] Auto-print kitchen tickets failed:', e)
      )
    }
  }

  // OPTIMIZED: Wrap callback with useCallback
  // Reuse existing empty draft order if one exists (prevents inflating order counts)
  const handleStartNewOrder = useCallback(() => {
    // Check if there's already an empty draft order (not synced to backend)
    const ordersById = useOrderStore.getState().ordersById
    const existingEmptyDraft = Object.values(ordersById).find(
      o =>
        !o.db_order_id && // Not synced to backend
        o.order_status === 'draft' &&
        o.items.length === 0 &&
        o.service_location_id === null // Not assigned to a table
    )

    if (existingEmptyDraft) {
      // Reuse existing empty draft
      setActiveOrder(existingEmptyDraft.id)
    } else {
      // Create new order only if no reusable draft exists
      const newOrder = startNewOrder()
      setActiveOrder(newOrder.id)
    }
  }, [startNewOrder, setActiveOrder])

  if (!activeOrderId)
    return (
      <View
        className='w-[38%] items-center justify-center p-6'
        style={{ backgroundColor: colors.screen }}
      >
        <Text
          className='text-sm font-semibold mb-3'
          style={{ color: colors.heading }}
        >
          No Active Order
        </Text>
        <TouchableOpacity
          className='px-4 py-2 bg-teal-600 rounded-lg active:opacity-80'
          onPress={() => {
            startNewOrder()
          }}
        >
          <Text
            style={{ color: colors.onSolid, fontSize: 14, fontWeight: '600' }}
          >
            Start New Order
          </Text>
        </TouchableOpacity>
      </View>
    )
  // Handle retry failed syncs
  const handleRetryFailedSyncs = async () => {
    if (activeOrderId) {
      await retryFailedSyncs(activeOrderId)
    }
  }

  return (
    <View
      ref={billSectionRef}
      className='w-[38%] relative'
      style={{
        backgroundColor: colors.screen,
        borderRightWidth: 2,
        borderColor: colors.border
      }}
    >
      <View
        className='px-3 pt-2 pb-1'
        style={{ backgroundColor: colors.screen }}
      >
        <View className='flex-row items-center justify-between mb-2'>
          <View className='flex-row items-center gap-2'>
            <Text
              style={{ color: colors.heading, fontWeight: '700', fontSize: 18 }}
            >
              {activeOrderDisplayNumber
                ? `Order #${activeOrderDisplayNumber}`
                : 'New Order'}
            </Text>
            <TouchableOpacity
              className={`h-8 px-3 rounded-lg flex-row items-center justify-center gap-1 ${
                newItemsCount === 0 || hasDraftItems ? 'opacity-50' : ''
              }`}
              style={{ backgroundColor: colors.teal }}
              disabled={newItemsCount === 0 || hasDraftItems}
              onPress={handleSendToKitchen}
            >
              <Printer size={12} color={colors.onSolid} />
              <Text
                style={{
                  color: colors.onSolid,
                  fontSize: 12,
                  fontWeight: '500'
                }}
              >
                Send
              </Text>
            </TouchableOpacity>
          </View>

          <View className='flex-row items-center gap-1.5'>
            <TouchableOpacity
              onPress={handleStartNewOrder}
              className='h-8 px-3 rounded-lg flex-row items-center justify-center gap-1'
              style={{ backgroundColor: colors.teal }}
            >
              <Plus color={colors.onSolid} size={12} />
              <Text
                style={{
                  color: colors.onSolid,
                  fontSize: 12,
                  fontWeight: '500'
                }}
              >
                New Order
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleVoidOrder}
              className='h-8 w-8 rounded-lg items-center justify-center'
              style={{ backgroundColor: '#F87171' }}
            >
              <Trash2 color={colors.screen} size={13} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showOrderDetails && (
        <OrderDetails
          tableLabel={
            displayedTable?.name
              ? `Table ${displayedTable.name}`
              : 'Select Table'
          }
          onOpenTableSelector={handleOpenTableSelector}
        />
      )}

      <Modal
        transparent
        visible={isTableSelectorOpen && activeOrderType === 'dine_in'}
        animationType='fade'
        onRequestClose={() => setIsTableSelectorOpen(false)}
      >
        <View style={{ flex: 1 }}>
          {/* Scrim */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIsTableSelectorOpen(false)}
            style={
              {
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.55)'
              } as any
            }
          />

          {/* Panel */}
          <View
            style={{
              position: 'absolute',
              top: tableDrawerAnchor.top > 0 ? tableDrawerAnchor.top : 0,
              left: tableDrawerAnchor.left > 0 ? tableDrawerAnchor.left : '38%',
              height:
                tableDrawerAnchor.height > 0
                  ? tableDrawerAnchor.height
                  : '100%',
              width: 380,
              backgroundColor: colors.screen,
              borderLeftWidth: 0,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderRightWidth: 1,
              borderColor: colors.border,
              borderTopRightRadius: 16,
              borderBottomRightRadius: 16,
              overflow: 'hidden',
              flexDirection: 'column'
            }}
          >
            {/* ── Top header ── */}
            <View
              style={{
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: 12
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: 16,
                      fontWeight: '700',
                      letterSpacing: -0.2
                    }}
                  >
                    Select Table
                  </Text>
                  <Text
                    style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}
                  >
                    {
                      filteredTableOptions.filter(
                        t => (t.session?.status ?? 'available') === 'available'
                      ).length
                    }{' '}
                    of {filteredTableOptions.length} available
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsTableSelectorOpen(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.inset,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <X size={13} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Floor plan tabs — only shown when >1 plan */}
              {floorPlanOptions.length > 1 && (
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: colors.inset,
                    borderRadius: 10,
                    padding: 3,
                    marginTop: 12
                  }}
                >
                  {floorPlanOptions.map(plan => {
                    const isActive =
                      (pendingFloorPlanId ?? activeFloorPlanId) === plan.id
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        onPress={() => {
                          void handleSelectFloorPlan(plan.id)
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 6,
                          borderRadius: 8,
                          alignItems: 'center',
                          backgroundColor: isActive
                            ? colors.teal
                            : 'transparent',
                          shadowColor: isActive ? colors.teal : 'transparent',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: isActive ? 0.3 : 0,
                          shadowRadius: 3,
                          elevation: isActive ? 2 : 0
                        }}
                      >
                        <Text
                          style={{
                            color: isActive ? colors.onSolid : colors.muted,
                            fontSize: 12,
                            fontWeight: isActive ? '600' : '500'
                          }}
                        >
                          {plan.name}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              {/* Section chips */}
              {sectionOptions.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10, marginHorizontal: -18 }}
                  contentContainerStyle={{
                    paddingHorizontal: 18,
                    gap: 6,
                    flexDirection: 'row'
                  }}
                >
                  {[
                    { id: null, name: 'All' },
                    ...sectionOptions.map((s: ServerSection) => ({
                      id: s.id,
                      name: s.name
                    }))
                  ].map(item => {
                    const isActive = selectedSectionId === item.id
                    return (
                      <TouchableOpacity
                        key={item.id ?? '__all__'}
                        onPress={() => setSelectedSectionId(item.id)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: 8,
                          backgroundColor: isActive ? colors.teal : colors.card,
                          borderWidth: 1,
                          borderColor: isActive ? colors.teal : colors.border
                        }}
                      >
                        <Text
                          style={{
                            color: isActive ? colors.onSolid : colors.label,
                            fontSize: 11,
                            fontWeight: '600'
                          }}
                        >
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              )}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* ── Table grid ── */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredTableOptions.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 56 }}>
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: 14,
                      fontWeight: '600'
                    }}
                  >
                    No tables found
                  </Text>
                  <Text
                    style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}
                  >
                    Try a different section
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                    justifyContent: 'center'
                  }}
                >
                  {filteredTableOptions.map(table => {
                    const statusLabel = getTableStatusLabel(table)
                    const statusKey = table.session?.status ?? 'available'
                    const statusColor =
                      TABLE_STATUS_COLORS[statusKey] || colors.muted
                    const isCurrentlyAssigned =
                      table.id === activeOrderServiceLocation
                    const isSelected =
                      selectedTable?.id === table.id ||
                      (!selectedTable && isCurrentlyAssigned)
                    const isAvailable = statusKey === 'available'
                    const isSelectable = isAvailable || isCurrentlyAssigned
                    return (
                      <TouchableOpacity
                        key={table.id}
                        onPress={() => handleSelectTable(table)}
                        activeOpacity={isSelectable ? 0.7 : 1}
                        style={{
                          width: '45%',
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.teal : colors.border,
                          backgroundColor: isSelected
                            ? `${colors.teal}12`
                            : colors.card,
                          opacity: isSelectable ? 1 : 0.4,
                          paddingHorizontal: 12,
                          paddingVertical: 12
                        }}
                      >
                        {/* Name + check */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <Text
                            style={{
                              color: colors.heading,
                              fontSize: 17,
                              fontWeight: '700',
                              letterSpacing: -0.3,
                              flexShrink: 1
                            }}
                            numberOfLines={1}
                          >
                            {table.name}
                          </Text>
                          {isSelected ? (
                            <View
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: colors.teal,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginLeft: 6
                              }}
                            >
                              <Check
                                size={11}
                                color={colors.onSolid}
                                strokeWidth={3}
                              />
                            </View>
                          ) : (
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: statusColor,
                                marginLeft: 6,
                                opacity: 0.85
                              }}
                            />
                          )}
                        </View>

                        {/* Status */}
                        <Text
                          style={{
                            color: isSelected ? colors.teal : statusColor,
                            fontSize: 10,
                            fontWeight: '600',
                            marginTop: 5,
                            textTransform: 'uppercase',
                            letterSpacing: 0.3
                          }}
                        >
                          {isCurrentlyAssigned && !isSelected
                            ? 'Current'
                            : statusLabel}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Offline / Sync Status Banner — only for errors or issues, not routine sync */}
      {(!isOnline ||
        hasFailedSyncs ||
        activeOrderPayments?.some(p => p.sync_status === 'pending')) && (
        <View
          className='px-3 py-1.5 gap-y-1'
          style={{ backgroundColor: colors.background }}
        >
          {!isOnline && (
            <View className='flex-row items-center justify-center bg-amber-600 px-2.5 py-1.5 rounded-md'>
              <WifiOff size={12} color='#FFFFFF' />
              <Text
                className='text-white font-medium ml-1.5'
                style={{ fontSize: 11 }}
              >
                Offline Mode
                {pendingSyncCount > 0 ? ` • ${pendingSyncCount} pending` : ''}
              </Text>
            </View>
          )}

          {isOnline && hasFailedSyncs && (
            <TouchableOpacity
              onPress={handleRetryFailedSyncs}
              disabled={autoRetryState.isRetrying}
              className={`flex-row items-center justify-between px-2.5 py-1.5 rounded-md ${
                autoRetryState.isRetrying ? 'bg-amber-600/80' : 'bg-red-600/80'
              }`}
              activeOpacity={0.7}
            >
              <View className='flex-row items-center'>
                {autoRetryState.isRetrying ? (
                  <>
                    <ActivityIndicator size='small' color='#FFFFFF' />
                    <Text
                      className='text-white font-medium ml-1.5'
                      style={{ fontSize: 11 }}
                    >
                      Retrying {autoRetryState.count} op
                      {autoRetryState.count > 1 ? 's' : ''}...
                    </Text>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} color='#FFFFFF' />
                    <Text
                      className='text-white font-medium ml-1.5'
                      style={{ fontSize: 11 }}
                    >
                      {syncStatus.failed} failed to sync
                    </Text>
                  </>
                )}
              </View>
              {!autoRetryState.isRetrying && (
                <View className='flex-row items-center'>
                  <RefreshCw size={11} color='#FFFFFF' />
                  <Text className='text-white ml-1' style={{ fontSize: 10 }}>
                    Retry
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {isOnline &&
            !hasFailedSyncs &&
            activeOrderPayments?.some(p => p.sync_status === 'pending') && (
              <View className='flex-row items-center justify-center bg-amber-600/70 px-2.5 py-1.5 rounded-md'>
                <Clock size={12} color='#FFFFFF' />
                <Text
                  className='text-white font-medium ml-1.5'
                  style={{ fontSize: 11 }}
                >
                  Payment syncing...
                </Text>
              </View>
            )}
        </View>
      )}

      <BillItemsAndTotals
        cart={cart}
        orderNote={orderNoteDraft}
        onChangeOrderNote={setOrderNoteDraft}
        onSaveOrderNote={handleSaveOrderNote}
      />
      <View
        className='mt-auto w-full overflow-hidden'
        style={{
          marginLeft: -3,
          marginRight: -3,
          backgroundColor: colors.panel,
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.28,
          shadowRadius: 18,
          elevation: 20
        }}
      >
        <Totals cart={cart} />

        {showPlaymentActions && (
          <View className='px-3 pt-1 pb-1'>
            <View className='flex-row gap-2'>
              <TouchableOpacity
                onPress={handleOpenMoreOptions}
                disabled={
                  !activeOrderId || (activeOrderItems?.length ?? 0) === 0
                }
                className='w-[34%] h-10 items-center justify-center rounded-xl flex-row gap-1.5 shrink-0'
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity:
                    !activeOrderId || (activeOrderItems?.length ?? 0) === 0
                      ? 0.4
                      : 1
                }}
              >
                <MoreHorizontal size={14} color={colors.label} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  More
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePayClick}
                disabled={isPayButtonDisabled}
                className='flex-1 h-10 rounded-xl flex-row items-center justify-center gap-1.5'
                style={{
                  backgroundColor: isPayButtonDisabled
                    ? colors.muted
                    : colors.teal,
                  opacity: isPayButtonDisabled ? 0.6 : 1
                }}
              >
                {hasPendingSyncs || isProcessing ? (
                  <ActivityIndicator size={12} color='#FFFFFF' />
                ) : null}
                <CreditCard size={14} color={colors.onSolid} />
                <Text
                  style={{ fontSize: 13, fontWeight: '700' }}
                  className={
                    isPayButtonDisabled ? 'text-gray-200' : 'text-black'
                  }
                >
                  Pay
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      <DiscountOverlay
        isVisible={isDiscountOverlayVisible}
        onClose={handleCloseDiscounts}
      />
      <Dialog open={isVoidConfirmOpen} onOpenChange={setIsVoidConfirmOpen}>
        <DialogContent className='w-[420px] bg-panel border border-border rounded-2xl p-0 overflow-hidden'>
          <View
            className='px-5 pt-5 pb-4'
            style={{ backgroundColor: colors.panel }}
          >
            <DialogHeader>
              <DialogTitle className='text-heading text-xl font-bold'>
                Void Order
              </DialogTitle>
            </DialogHeader>
            <Text
              style={{
                color: colors.label,
                fontSize: 14,
                marginTop: 8,
                lineHeight: 20
              }}
            >
              Are you sure you want to void this order? This action cannot be
              undone.
            </Text>
          </View>

          <DialogFooter className='flex-row px-5 pb-5 pt-1 gap-3'>
            <TouchableOpacity
              onPress={() => setIsVoidConfirmOpen(false)}
              className='flex-1 h-11 rounded-xl items-center justify-center'
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Text
                style={{
                  color: colors.heading,
                  fontSize: 14,
                  fontWeight: '700'
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmVoidOrder}
              className='flex-1 h-11 rounded-xl items-center justify-center'
              style={{ backgroundColor: colors.danger }}
            >
              <Text
                style={{
                  color: colors.onSolid,
                  fontSize: 14,
                  fontWeight: '700'
                }}
              >
                Void Order
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </View>
  )
}

const BillSection = React.memo(BillSectionContent)
export default BillSection
