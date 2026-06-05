import DiscountBottomSheet from '@/components/bill/DiscountBottomSheet'
import MoreOptionsBottomSheet from '@/components/bill/MoreOptionsBottomSheet'
import { ServiceChargeOverrideSheet } from '@/components/bill/ServiceChargeOverrideSheet'
import TableBillSection from '@/components/bill/TableBillSection'
import MenuSection from '@/components/menu/MenuSection'
import SeatSelector from '@/components/tables/SeatSelector'
import ServerSelectSheet from '@/components/tables/ServerSelectSheet'
import TableAlertDialogs from '@/components/tables/TableAlertDialogs'
import TableDetailSkeleton from '@/components/tables/TableDetailSkeleton'
import { useLoading } from '@/contexts/LoadingContext'
import { useToast } from '@/contexts/ToastContext'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { useTableCoursing } from '@/hooks/useTableCoursing'
import { useTableDuration } from '@/hooks/useTableDuration'
import { useTablePaymentSync } from '@/hooks/useTablePaymentSync'
import { useTableSeating } from '@/hooks/useTableSeating'
import { useTableSession } from '@/hooks/useTableSession'
import {
  getKitchenSentStatus,
  isItemReadyOrServed
} from '@/lib/kitchenStatusUtils'
import { isActiveSession } from '@/lib/tableStateMachine'
import { colors } from '@/lib/theme'
import { OrderService } from '@/services/orderService'
import { PrinterService } from '@/services/printing/PrinterService'
import { transferTableServer } from '@/services/serverAssignmentService'
import {
  useHasActivePreAuth,
  useOrderPreAuth,
  useOrderTotals
} from '@/stores/selectors/orderSelectors'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useModifierSidebarStore } from '@/stores/useModifierSidebarStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useReservationStore } from '@/stores/useReservationStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { useRouter } from 'expo-router'
import { CreditCard } from 'lucide-react-native'
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { InteractionManager, Text, TouchableOpacity, View } from 'react-native'
import { Portal as Teleport } from 'react-native-teleport'

// Stable empty array to avoid new reference on every render
const EMPTY_NOT_READY_ITEMS: { id: string; name: string; quantity: number }[] =
  []
const PAID_BALANCE_TOLERANCE = 0.01
const isKitchenItemUnsent = (item: { kitchen_status?: string | null }) =>
  !item.kitchen_status || item.kitchen_status === 'new'

const TableOrderMenuPanel = React.memo(
  function TableOrderMenuPanel ({
    renderStage,
    enableCoursing,
    isCurrentCourseSent,
    onStartNewCourse,
    onOrderClosedCheck,
    isMenuDisabled
  }: {
    renderStage: number
    enableCoursing: boolean
    isCurrentCourseSent: boolean
    onStartNewCourse: () => void
    onOrderClosedCheck: () => boolean
    isMenuDisabled: boolean
  }) {
    return (
    <View
      style={{
        flex: 1,
        padding: 16,
        paddingHorizontal: 12,
        paddingTop: 0
      }}
    >
      {renderStage >= 2 ? (
        enableCoursing && isCurrentCourseSent ? (
          <View style={{ justifyContent: 'center', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={onStartNewCourse}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal
              }}
              activeOpacity={0.8}
            >
              <Text
                style={{
                  fontWeight: '600',
                  color: colors.teal,
                  fontSize: 16
                }}
              >
                + New Course
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            pointerEvents={isMenuDisabled ? 'none' : 'auto'}
            style={{ flex: 1, opacity: isMenuDisabled ? 0.45 : 1 }}
          >
            <MenuSection
              onOrderClosedCheck={onOrderClosedCheck}
              isTableOrder={true}
            />
          </View>
        )
      ) : (
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.label }}>Loading menu...</Text>
        </View>
      )}
    </View>
    )
  }
)

const nowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

interface TableOrderViewProps {
  tableId: string
  onClose: () => void
}

export interface TableOrderViewHandle {
  prepareClose: () => void
}

const TableOrderView = React.forwardRef<
  TableOrderViewHandle,
  TableOrderViewProps
>(({ tableId, onClose }, ref) => {
  const currentTableId = tableId
  const openedAtRef = useRef(nowMs())

  // --- 1. Base Deferred Rendering State (MUST BE FIRST) ---
  // Fast-path: skip skeleton and show stage 1 immediately (bill/header first),
  // then hydrate stage 2 (menu/right side) after interactions.
  const [renderStage, setRenderStage] = useState(() => {
    const session = useTableSessionStore.getState().sessions[currentTableId]
    if (!session || session.status === 'available') {
      return 1
    }
    if (session.order_id) {
      const found = useOrderStore.getState().getOrder(session.order_id)
      if (found) return 1
    }
    return 0
  })
  const initialRenderStageRef = useRef(renderStage)
  const prevRenderStageRef = useRef(renderStage)

  // --- 2. Standard Hooks & Context ---
  const router = useRouter()
  const { show } = useToast()
  const { showLoading, hideLoading } = useLoading()
  const supabase = useSupabaseClient()
  const defaultSittingTimeMinutes = useLocationConfigStore(
    s => s.config.dining.defaultSittingTimeMinutes
  )

  // --- 3. UI State ---
  type NotReadyItem = { id: string; name: string; quantity: number }
  type ActiveDialog =
    | { type: 'none' }
    | { type: 'not_ready_confirm'; items: NotReadyItem[] }
    | { type: 'clear_not_ready_confirm'; items: NotReadyItem[] }
    | { type: 'void_confirm' }
    | { type: 'order_closed_warning' }
    | { type: 'course_resend'; course: number }
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>({
    type: 'none'
  })
  const closeDialog = useCallback(() => setActiveDialog({ type: 'none' }), [])
  const [serverSheetOpen, setServerSheetOpen] = useState(false)

  // --- 4. Domain Hooks ---
  const {
    phase,
    activeOrder,
    tableStatus,
    isReady,
    markNavigatingAway,
    markPaymentSyncing,
    markPaymentSyncDone
  } = useTableSession(currentTableId, undefined, onClose)

  const enableCoursing = useLocationConfigStore(
    s => s.config.dining.enableCoursing
  )
  const {
    currentCourse,
    sentCourses,
    courseSentAtMap,
    itemCourseMap,
    setCurrentCourse,
    isCourseSent,
    markCourseSent,
    unmarkCourseSent,
    markCourseServed,
    getForOrder,
    createNextCourse,
    removeCourse
  } = useTableCoursing(activeOrder, enableCoursing)
  useTablePaymentSync(activeOrder?.id, markPaymentSyncing, markPaymentSyncDone)

  const isTableActive = isActiveSession(tableStatus) || tableStatus === 'paid'
  const { duration, isOvertime } = useTableDuration(
    activeOrder?.opened_at,
    isTableActive
  )

  // --- 5. Derived Selectors ---
  const table = useFloorPlanStore(s => s.tablesById[currentTableId])
  const session = useTableSessionStore(s => s.sessions[currentTableId])

  const enablePerSeatOrdering = useLocationConfigStore(
    s => s.config.dining.enablePerSeatOrdering
  )
  // Initial seat-count seed for useTableSeating. Reads session.party_size
  // (backend-authoritative). order.guest_count is intentionally not read —
  // seat count from useSeatingStore is the canonical UI truth once mounted.
  const partySize = session?.party_size ?? 2
  // Seat data is always tracked/persisted. `enablePerSeatOrdering` only
  // controls whether the bill groups items by seat (see renderOrderView
  // in TableBillSection). The SeatSelector header bar below and the
  // BillItem seat pill render independently of the toggle.
  const seatingHook = useTableSeating(activeOrder, partySize)

  // Use the store's activeOrderId directly so these selectors stay in sync
  // during the rekey window (local temp ID → backend UUID). rekeyOrder updates
  // activeOrderId atomically in the same Immer commit, whereas activeOrder?.id
  // from useTableSession can briefly lag behind, causing useOrderTotals to look
  // up a deleted key and return null → $0 display until the next render.
  const storeActiveOrderId = useOrderStore(s => s.activeOrderId)
  const totals = useOrderTotals(storeActiveOrderId)
  const preAuth = useOrderPreAuth(storeActiveOrderId ?? undefined)
  const hasPreAuth = useHasActivePreAuth(storeActiveOrderId ?? undefined)
  const storeActiveOrderOutstandingTotal = totals?.amountDue ?? 0
  const storeActiveOrderTotal = totals?.total ?? 0

  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0
  const isClosedTerminal =
    activeOrder?.order_status === 'void' ||
    activeOrder?.order_status === 'cancelled' ||
    activeOrder?.order_status === 'refunded'
  const canReopenClosedCheck =
    activeOrder?.check_status === 'Closed' &&
    !isClosedTerminal &&
    (activeOrder?.reopen_count ?? 0) < 1
  const isClosedCheckMenuDisabled =
    activeOrder?.check_status === 'Closed' && !canReopenClosedCheck
  // Only derive displayBalanceDue when totals are available; otherwise keep previous value
  // to prevent transient null → 0 from making the UI think the bill is $0 / fully paid.
  const displayBalanceDueRaw = hasPayments
    ? storeActiveOrderOutstandingTotal
    : storeActiveOrderTotal
  const lastDisplayBalanceDueRef = React.useRef(displayBalanceDueRaw)
  if (totals !== null) lastDisplayBalanceDueRef.current = displayBalanceDueRaw
  const displayBalanceDue =
    totals !== null ? displayBalanceDueRaw : lastDisplayBalanceDueRef.current

  // --- 6. Bottom sheet refs ---
  const pricingSheetRef = useRef<BottomSheetMethods>(null)
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null)
  const discountSheetRef = useRef<BottomSheetMethods>(null)
  const serviceChargeSheetRef = useRef<BottomSheetMethods>(null)
  const [moreOptionsOpenedOnce, setMoreOptionsOpenedOnce] = useState(false)
  const [discountOpenedOnce, setDiscountOpenedOnce] = useState(false)
  const [serviceChargeOpenedOnce, setServiceChargeOpenedOnce] = useState(false)

  const requestMoreOptionsOpen = useCallback(() => {
    if (moreOptionsSheetRef.current) {
      moreOptionsSheetRef.current.snapToIndex(0)
      return
    }
    setMoreOptionsOpenedOnce(true)
  }, [])
  const requestDiscountOpen = useCallback(() => {
    if (discountSheetRef.current) {
      discountSheetRef.current.expand()
      return
    }
    setDiscountOpenedOnce(true)
  }, [])
  const requestServiceChargeOpen = useCallback(() => {
    if (serviceChargeSheetRef.current) {
      serviceChargeSheetRef.current.expand()
      return
    }
    setServiceChargeOpenedOnce(true)
  }, [])
  const lazyDiscountSheetRef = useMemo(
    () =>
      ({
        current: { expand: requestDiscountOpen } as BottomSheetMethods
      }) as React.RefObject<BottomSheetMethods>,
    [requestDiscountOpen]
  )
  const lazyServiceChargeSheetRef = useMemo(
    () =>
      ({
        current: { expand: requestServiceChargeOpen } as BottomSheetMethods
      }) as React.RefObject<BottomSheetMethods>,
    [requestServiceChargeOpen]
  )

  useEffect(() => {
    if (renderStage >= 2 && moreOptionsOpenedOnce) {
      moreOptionsSheetRef.current?.snapToIndex(0)
    }
  }, [moreOptionsOpenedOnce, renderStage])
  useEffect(() => {
    if (renderStage >= 2 && discountOpenedOnce) {
      discountSheetRef.current?.expand()
    }
  }, [discountOpenedOnce, renderStage])
  useEffect(() => {
    if (renderStage >= 2 && serviceChargeOpenedOnce) {
      serviceChargeSheetRef.current?.expand()
    }
  }, [renderStage, serviceChargeOpenedOnce])

  const prepareClose = useCallback(() => {
    if (__DEV__) {
      console.log(
        `[perf][table-order] prepareClose after ${Math.round(
          nowMs() - openedAtRef.current
        )}ms`,
        { tableId: currentTableId }
      )
    }
    // Keep close-path work minimal so backdrop tap can navigate immediately.
    markNavigatingAway()
  }, [markNavigatingAway])

  // Expose prepareClose so [tableId].tsx can suppress store reactivity before router.back()
  useImperativeHandle(ref, () => ({ prepareClose }), [prepareClose])

  // Heavy close cleanup waits for navigation interactions so the floor can paint first.
  useEffect(() => {
    return () => {
      InteractionManager.runAfterInteractions(() => {
        const store = useModifierSidebarStore.getState()
        if (store.isOpen) {
          store.cancelAndRemoveDraft()
        }
      })
    }
  }, [])

  // --- 7. Effects ---
  // Auto-navigate to /tables when auto-clear-on-payment is enabled and the
  // session reaches `paid`. Dispatch CLEAR locally (paid → cleaning → available
  // via the store), then navigate. Also handles the case where session goes
  // undefined (CLEAR was dispatched externally before this effect ran).
  const hadSessionRef = useRef(!!session)
  const autoClearEnabled = useLocationConfigStore(
    s => s.config.dining.autoClearTableOnPayment
  )
  useEffect(() => {
    // Session externally cleared (undefined) — just navigate.
    if (hadSessionRef.current && !session) {
      usePaymentStore.getState().close()
      markNavigatingAway()
      router.back()
      setTimeout(hideLoading, 300)
      return
    }
    hadSessionRef.current = !!session

    // Session reached `paid` with auto-clear on — dispatch CLEAR then navigate.
    if (session?.status === 'paid' && autoClearEnabled) {
      const tableId = currentTableId
      void (async () => {
        const sessionStore = useTableSessionStore.getState()
        const sessionId = sessionStore.getSession(tableId)?.id
        if (!sessionId) return

        const siblingsDue = Object.values(
          useOrderStore.getState().ordersById
        ).some(
          o =>
            (o.session_id === sessionId || o.local_session_id === sessionId) &&
            (o.amount_due ?? 0) > 0.01
        )
        if (siblingsDue) return

        sessionStore.dispatch(tableId, { type: 'CLEAR' })
        useFloorPlanStore.getState().loadFloorPlanStatus().catch(() => {})
        usePaymentStore.getState().close()
        markNavigatingAway()
        router.back()
        setTimeout(hideLoading, 300)
      })()
    }
  }, [session, session?.status, autoClearEnabled, markNavigatingAway, router, hideLoading, currentTableId])
  useEffect(() => {
    if (!__DEV__) return
    console.log(
      `[perf][table-order] initial stage=${
        initialRenderStageRef.current
      } at ${Math.round(nowMs() - openedAtRef.current)}ms`,
      { tableId: currentTableId }
    )
  }, [currentTableId])

  useEffect(() => {
    if (!__DEV__) return
    const prevStage = prevRenderStageRef.current
    if (prevStage === renderStage) return

    console.log(
      `[perf][table-order] stage ${prevStage} -> ${renderStage} at ${Math.round(
        nowMs() - openedAtRef.current
      )}ms`,
      { tableId: currentTableId }
    )
    prevRenderStageRef.current = renderStage
  }, [renderStage, currentTableId])

  useEffect(() => {
    // If lazy initializer already fast-pathed to stage 2, skip progressive hydration.
    if (renderStage >= 2) {
      if (__DEV__) {
        console.log(
          `[perf][table-order] instant (cached) in ${Math.round(
            nowMs() - openedAtRef.current
          )}ms`,
          { tableId: currentTableId }
        )
      }
      return
    }
    // Fallback: progressive hydration for uncached orders.
    // Defer stage 2 until after current interactions/transition work settles.
    setRenderStage(1)
    let rafId: number | null = null
    const task = InteractionManager.runAfterInteractions(() => {
      rafId = requestAnimationFrame(() => {
        setRenderStage(2)
        if (__DEV__) {
          console.log(
            `[perf][table-order] interactive in ${Math.round(
              nowMs() - openedAtRef.current
            )}ms`,
            { tableId: currentTableId }
          )
        }
      })
    })
    return () => {
      task.cancel()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [currentTableId]) // renderStage intentionally NOT in deps

  // --- 8. Final Derived UI State ---
  const isFullyPaid = useMemo(() => {
    // Only consider balance <= 0 as fully paid when we have real totals data
    // (guard against transient null totals showing $0 and blocking item additions)
    if (hasPayments && totals !== null) {
      return displayBalanceDue <= PAID_BALANCE_TOLERANCE
    }
    return activeOrder?.paid_status === 'Paid'
  }, [
    activeOrder?.paid_status,
    hasPayments,
    totals,
    displayBalanceDue
  ])

  // Show "Clearing table..." as soon as session reaches paid with auto-clear on.
  useEffect(() => {
    if (session?.status === 'paid' && autoClearEnabled) {
      showLoading('Clearing table...')
    }
  }, [session?.status, autoClearEnabled, showLoading])

  // --- Action handlers ---

  const handlePay = useCallback(() => {
    const order =
      useOrderStore.getState().ordersById[
        useOrderStore.getState().activeOrderId ?? ''
      ]
    if (order) {
      const preparingItems = order.items.filter(i => !isItemReadyOrServed(i))
      if (preparingItems.length > 0) {
        setActiveDialog({
          type: 'not_ready_confirm',
          items: preparingItems.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity
          }))
        })
        return
      }
    }
    usePaymentStore
      .getState()
      .open('Card', currentTableId, 'payment-method-selection')
  }, [currentTableId])

  const doClearTable = useCallback(async () => {
    const orderState = useOrderStore.getState()
    const currentActiveOrderId = orderState.activeOrderId
    const currentActiveOrder = currentActiveOrderId
      ? orderState.ordersById[currentActiveOrderId]
      : null
    if (!currentActiveOrderId || !currentActiveOrder) return
    showLoading('Clearing table...')
    markNavigatingAway()

    // Recovery: if session isn't at "paid" yet but order IS paid,
    // fire-and-forget FULL_PAYMENT (fixes stuck check_presented race)
    const sess = useTableSessionStore.getState().getSession(currentTableId)
    if (
      sess &&
      sess.status !== 'paid' &&
      sess.status !== 'closing' &&
      sess.status !== 'cleaning' &&
      currentActiveOrder.paid_status === 'Paid'
    ) {
      useTableSessionStore
        .getState()
        .dispatchAction({ type: 'FULL_PAYMENT', tableId: currentTableId })
    }

    const result = await useTableSessionStore.getState().dispatchAction({
      type: 'CLEAR_TABLE',
      tableId: currentTableId,
      orderId: currentActiveOrder.id
    })

    hideLoading()

    if (result.success) {
      onClose()
      show({
        title: 'Table Cleared',
        message: 'Table marked for cleaning.',
        type: 'success'
      })
    } else {
      show({
        title: 'Clear Failed',
        message: result.error || 'An unexpected error occurred.',
        type: 'error'
      })
    }
  }, [
    showLoading,
    markNavigatingAway,
    currentTableId,
    hideLoading,
    onClose,
    show
  ])

  const confirmVoid = useCallback(async () => {
    const { activeOrderId: oid, ordersById } = useOrderStore.getState()
    const order = oid ? ordersById[oid] : null
    if (!order) return

    if (order.order_status === 'void') {
      closeDialog()
      show({
        title: 'Already Voided',
        message: 'This order has already been voided.',
        type: 'warning'
      })
      markNavigatingAway()
      useOrderStore.getState().setActiveOrder(null)
      onClose()
      return
    }

    markNavigatingAway()

    const result = await useTableSessionStore.getState().dispatchAction({
      type: 'VOID_ORDER',
      tableId: currentTableId,
      orderId: order.id,
      dbOrderId: order.db_order_id
    })

    if (result.success) {
      if (order.session_id) {
        await useReservationStore
          .getState()
          .completeReservationForSession(order.session_id)
      }
      closeDialog()
      show({
        title: 'Check Voided',
        message:
          'The order has been successfully voided. Table marked for cleaning.',
        type: 'success'
      })
      onClose()
    } else {
      show({
        title: 'Void Failed',
        message: result.error || 'An unexpected error occurred.',
        type: 'error'
      })
    }
  }, [closeDialog, show, markNavigatingAway, onClose, currentTableId])

  const handleCloseCheck = useCallback(async () => {
    const { activeOrderId: oid, ordersById } = useOrderStore.getState()
    const order = oid ? ordersById[oid] : null
    if (!order || !currentTableId) return

    const totals = useOrderStore.getState().activeOrderOutstandingTotal ?? 0
    if (totals > 0.01) {
      show({
        title: 'Cannot Close Check',
        message: 'Outstanding balance must be $0.00 to close check',
        type: 'error'
      })
      return
    }

    if (!order.db_order_id) {
      show({
        title: 'Cannot Close Check',
        message: 'Order must be synced to close check',
        type: 'error'
      })
      return
    }

    try {
      showLoading('Closing check...')
      const result = await useTableSessionStore.getState().dispatchAction({
        type: 'CLOSE_CHECK',
        tableId: currentTableId,
        orderId: order.id,
        dbOrderId: order.db_order_id
      })
      if (!result.success)
        throw new Error(result.error || 'Failed to close check')

      const sess = useTableSessionStore.getState().getSession(currentTableId)
      if (sess && sess.status !== 'paid' && sess.status !== 'cleaning') {
        useTableSessionStore
          .getState()
          .dispatchAction({ type: 'FULL_PAYMENT', tableId: currentTableId })
      }

      useOrderStore
        .getState()
        .updateActiveOrderDetails({ check_status: 'Closed' })
      show({
        title: 'Check Closed',
        message: 'The check has been finalized. You can now clear the table.',
        type: 'success'
      })
    } catch (error: any) {
      console.error('Failed to close check:', error)
      show({
        title: 'Failed to Close Check',
        message: error.message || 'An error occurred',
        type: 'error'
      })
    } finally {
      hideLoading()
    }
  }, [currentTableId, show, showLoading, hideLoading])

  const handleClearTable = useCallback(async () => {
    const { activeOrderId: oid, ordersById } = useOrderStore.getState()
    const order = oid ? ordersById[oid] : null
    if (!oid || !order) return

    const preparingItems = order.items.filter(
      item => !isItemReadyOrServed(item)
    )
    if (preparingItems.length > 0) {
      setActiveDialog({
        type: 'clear_not_ready_confirm',
        items: preparingItems.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity
        }))
      })
      return
    }

    await doClearTable()
  }, [doClearTable])

  const reopeningCheckRef = useRef(false)
  const handlePressReopen = useCallback(() => {
    setActiveDialog({ type: 'order_closed_warning' })
  }, [])

  const handleConfirmReopen = useCallback(async () => {
    if (reopeningCheckRef.current) return
    closeDialog()
    const { activeOrderId: oid, ordersById } = useOrderStore.getState()
    const order = oid ? ordersById[oid] : null
    if (!oid || !order?.db_order_id) return

    if (order.check_status !== 'Closed') {
      show({
        title: 'Check Already Open',
        message: 'This check is already open for ordering.',
        type: 'success'
      })
      return
    }

    const staffId = useEmployeeStore.getState().loggedInEmployee?.profileId
    if (!supabase || !staffId) {
      show({
        title: 'Cannot Reopen Check',
        message: !supabase
          ? 'A network connection is required to reopen this check.'
          : 'An active employee is required to reopen this check.',
        type: 'error'
      })
      return
    }

    reopeningCheckRef.current = true
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      showLoading('Reopening check...')
      const result = await OrderService.reopenCheck(
        supabase,
        order.db_order_id,
        staffId,
        'Adding more items'
      )
      if (!result.success)
        throw new Error(result.error || 'Failed to reopen check')

      // Mark locally BEFORE closing payment sheet — closing it triggers
      // useTablePaymentSync → syncOrderFromBackendComplete which would race
      // against the reopen and reset check_status back to 'Closed'.
      useOrderStore.getState().markCheckReopenedLocally(oid, result)

      const paymentStore = usePaymentStore.getState()
      if (paymentStore.isOpen) {
        paymentStore.close()
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }

      const sessionStore = useTableSessionStore.getState()
      const session = sessionStore.getSession(currentTableId)
      if (session?.status === 'paid') {
        const sessionResult = await sessionStore.dispatchAction({
          type: 'REOPEN_CHECK',
          tableId: currentTableId,
          orderId: order.id,
          dbOrderId: order.db_order_id,
          reason: 'Adding more items',
          backendAlreadySynced: true
        })
        if (!sessionResult.success) {
          console.warn(
            'Check reopened but table session could not transition:',
            sessionResult.error
          )
        }
      }

      show({
        title: 'Check Reopened',
        message: 'You can now add new items to the order.',
        type: 'success'
      })
    } catch (error: any) {
      console.error('Failed to reopen check:', error)
      show({
        title: 'Failed to Reopen Check',
        message: error.message || 'An error occurred',
        type: 'error'
      })
    } finally {
      reopeningCheckRef.current = false
      hideLoading()
    }
  }, [closeDialog, showLoading, hideLoading, currentTableId, show, supabase])

  const startingNewCourseRef = useRef(false)
  const handleStartNewCourse = useCallback(async () => {
    if (!enableCoursing) {
      show({
        title: 'Coursing Disabled',
        message: 'Coursing is not enabled for this location.',
        type: 'warning'
      })
      return
    }
    if (startingNewCourseRef.current) return
    const { activeOrderId: oid, ordersById } = useOrderStore.getState()
    const order = oid ? ordersById[oid] : null
    if (!order) return
    startingNewCourseRef.current = true
    try {
      const nextCourse = await createNextCourse(order.id)
      show({
        title: `Course ${nextCourse} opened`,
        message: 'Drop new items here. Previous courses stay open until you Send to Kitchen.',
        type: 'success'
      })
    } finally {
      startingNewCourseRef.current = false
    }
  }, [enableCoursing, createNextCourse, show])

  const handleRemoveCourse = useCallback(
    (courseNumber: number) => {
      const { activeOrderId: oid, ordersById } = useOrderStore.getState()
      const order = oid ? ordersById[oid] : null
      if (!order) return
      const ok = removeCourse(order.id, courseNumber)
      if (!ok) {
        show({
          title: 'Cannot remove course',
          message:
            'Course must be empty and not yet sent to the kitchen.',
          type: 'warning'
        })
      }
    },
    [removeCourse, show]
  )

  const handleSendCourseToKitchen = useCallback(
    async (course: number, forceResend = false, silent = false) => {
      const { activeOrderId: oid, ordersById } = useOrderStore.getState()
      const activeOrder = oid ? ordersById[oid] : null
      if (!activeOrder) return

      const state = getForOrder(activeOrder.id)
      const hasUnsentItems = activeOrder.items.some(i => {
        const itemCourse = i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1
        return itemCourse === course && !i.is_voided && isKitchenItemUnsent(i)
      })

      if (!forceResend && !hasUnsentItems && isCourseSent(activeOrder.id, course)) {
        if (!silent)
          show({
            title: 'Already Sent',
            message: `Course ${course} has already been sent to the kitchen.`,
            type: 'warning'
          })
        return
      }

      // Wave 4.2: single pass collects everything the kitchen send needs.
      // Was five sequential filter/map passes (~5×O(n)) over `items`.
      const itemsInCourse: typeof activeOrder.items = []
      const itemIds: string[] = []
      const dbItemIds: string[] = []
      const originalStatuses: {
        id: string
        item_status: typeof activeOrder.items[number]['item_status']
        kitchen_status: typeof activeOrder.items[number]['kitchen_status']
      }[] = []
      for (const i of activeOrder.items) {
        const itemCourse = i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1
        if (
          itemCourse !== course ||
          i.is_voided ||
          (!forceResend && !isKitchenItemUnsent(i))
        )
          continue
        itemsInCourse.push(i)
        itemIds.push(i.id)
        if (i.db_order_item_id) dbItemIds.push(i.db_order_item_id)
        originalStatuses.push({
          id: i.id,
          item_status: i.item_status,
          kitchen_status: i.kitchen_status,
        })
      }

      if (itemsInCourse.length === 0) {
        if (!silent)
          show({
            title: 'Empty Course',
            message: `There are no items in Course ${course} to send.`,
            type: 'warning'
          })
        return false
      }

      useOrderStore
        .getState()
        .batchUpdateItemKitchenStatus(itemIds, getKitchenSentStatus())
      markCourseSent(activeOrder.id, course)

      const result = await useTableSessionStore.getState().dispatchAction({
        type: 'SEND_TO_KITCHEN',
        tableId: currentTableId,
        courseNumber: course,
        itemIds,
        dbItemIds,
        orderId: activeOrder.id,
        dbOrderId: activeOrder.db_order_id,
        forceResend
      })

      if (result.success) {
        // Set timestamps after success (non-blocking metadata)
        if (!activeOrder.opened_at)
          useOrderStore
            .getState()
            .updateActiveOrderDetails({ opened_at: new Date().toISOString() })
        if (!activeOrder.sent_to_kitchen_at)
          useOrderStore.getState().updateActiveOrderDetails({
            sent_to_kitchen_at: new Date().toISOString()
          })
        const autoPrintKitchenTickets =
          useLocationConfigStore.getState().config.printing
            .autoPrintKitchenTickets
        const selectedStore = useStoreSettingsStore.getState().selectedStore
        if (autoPrintKitchenTickets && selectedStore) {
          // Wave 2.2: defer the synchronous template-render phase of
          // printKitchenTickets so this handler can return and any pending
          // React commits / toasts can flush first.
          queueMicrotask(() => {
            PrinterService.printKitchenTickets(
              activeOrder,
              itemsInCourse,
              selectedStore
            ).catch(e =>
              console.warn('[TableView] Auto-print kitchen tickets failed:', e)
            )
          })
        }
        if (!silent)
          show({
            title: forceResend ? 'Course Resent' : 'Course Sent',
            message: `Course ${course} has been ${
              forceResend ? 'resent' : 'sent'
            } for preparation.`,
            type: 'success'
          })
        return true
      } else {
        unmarkCourseSent(activeOrder.id, course)
        const currentOid = useOrderStore.getState().activeOrderId
        if (currentOid) {
          useOrderStore.setState(state => {
            const order = state.ordersById[currentOid]
            if (!order) return
            for (const orig of originalStatuses) {
              const item = order.items.find(i => i.id === orig.id)
              if (item) {
                item.item_status = orig.item_status
                item.kitchen_status = orig.kitchen_status
              }
            }
          })
        }
        show({
          title: 'Send Failed',
          message: result.error || 'Failed to send course to kitchen.',
          type: 'error'
        })
        return false
      }
    },
    [
      isCourseSent,
      getForOrder,
      markCourseSent,
      unmarkCourseSent,
      currentTableId,
      show
    ]
  )

  const handleSendAllToKitchen = useCallback(async () => {
    const orderState = useOrderStore.getState()
    const activeOrder = orderState.activeOrderId
      ? orderState.ordersById[orderState.activeOrderId]
      : null
    if (!activeOrder) return

    const state = getForOrder(activeOrder.id)
    const pendingCourses = Array.from(
      new Set(
        activeOrder.items
          .filter(i => !i.is_voided && isKitchenItemUnsent(i))
          .map(i => i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1)
      )
    ).sort((a, b) => a - b)

    if (pendingCourses.length === 0) {
      show({
        title: 'Nothing to Send',
        message: 'All current courses have already been sent.',
        type: 'warning'
      })
      return
    }

    const results = await Promise.all(
      pendingCourses.map(course =>
        handleSendCourseToKitchen(course, false, true)
      )
    )
    const sentCount = results.filter(Boolean).length

    if (sentCount === pendingCourses.length) {
      show({
        title: 'Sent to Kitchen',
        message: `${sentCount} course${
          sentCount > 1 ? 's' : ''
        } sent successfully.`,
        type: 'success'
      })
      return
    }

    show({
      title: 'Partial Send Complete',
      message: `Sent ${sentCount} of ${pendingCourses.length} courses.`,
      type: sentCount > 0 ? 'warning' : 'error'
    })
  }, [getForOrder, handleSendCourseToKitchen, show])

  const handleDoubleTapCourse = useCallback(
    (course: number) => {
      const orderId = useOrderStore.getState().activeOrderId
      if (!orderId) return
      const order = useOrderStore.getState().ordersById[orderId]
      const state = getForOrder(orderId)
      const hasUnsentItems = order?.items.some(i => {
        const itemCourse = i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1
        return itemCourse === course && !i.is_voided && isKitchenItemUnsent(i)
      })
      if (isCourseSent(orderId, course) && !hasUnsentItems) {
        setActiveDialog({ type: 'course_resend', course })
      } else {
        handleSendCourseToKitchen(course, false)
      }
    },
    [isCourseSent, getForOrder, handleSendCourseToKitchen]
  )

  const handleConfirmResend = useCallback(() => {
    if (activeDialog.type === 'course_resend') {
      handleSendCourseToKitchen(activeDialog.course, true)
      closeDialog()
    }
  }, [activeDialog, handleSendCourseToKitchen, closeDialog])

  const handleRushCourse = useCallback(
    (course: number) => {
      if (!activeOrder) return
      const state = getForOrder(activeOrder.id)
      const itemsInCourse = activeOrder.items.filter(
        i => (i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1) === course
      )
      const dbItemIds = itemsInCourse
        .map(i => i.db_order_item_id)
        .filter((id): id is string => !!id)
      if (dbItemIds.length === 0) return

      show({
        title: 'Course Rushed',
        message: `Course ${course} marked as rush.`,
        type: 'success'
      })

      OrderService.toggleRushOnItems(supabase, dbItemIds, true)
        .then(({ error }) => {
          if (error) {
            show({
              title: 'Rush Failed',
              message: 'Could not rush this course.',
              type: 'error'
            })
          }
        })
        .catch(() => {
          show({
            title: 'Rush Failed',
            message: 'Could not rush this course.',
            type: 'error'
          })
        })
    },
    [activeOrder, getForOrder, supabase, show]
  )

  const handlePrioritizeCourse = useCallback(
    (course: number) => {
      if (!activeOrder) return
      const state = getForOrder(activeOrder.id)
      const itemsInCourse = activeOrder.items.filter(
        i => (i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1) === course
      )
      const dbItemIds = itemsInCourse
        .map(i => i.db_order_item_id)
        .filter((id): id is string => !!id)
      if (dbItemIds.length === 0) return

      show({
        title: 'Course Prioritized',
        message: `Course ${course} marked as priority.`,
        type: 'success'
      })

      OrderService.togglePriorityOnItems(supabase, dbItemIds, true)
        .then(({ error }) => {
          if (error) {
            show({
              title: 'Prioritize Failed',
              message: 'Could not prioritize this course.',
              type: 'error'
            })
          }
        })
        .catch(() => {
          show({
            title: 'Prioritize Failed',
            message: 'Could not prioritize this course.',
            type: 'error'
          })
        })
    },
    [activeOrder, getForOrder, supabase, show]
  )

  const handleResendCourse = useCallback(
    (course: number) => {
      handleSendCourseToKitchen(course, true)
    },
    [handleSendCourseToKitchen]
  )

  const checkOrderClosedAndWarn = useCallback(() => {
    const orderState = useOrderStore.getState()
    const order = orderState.activeOrderId
      ? orderState.ordersById[orderState.activeOrderId]
      : null
    if (order?.check_status === 'Closed') {
      const isTerminal =
        order.order_status === 'void' ||
        order.order_status === 'cancelled' ||
        order.order_status === 'refunded'
      if (isTerminal || (order.reopen_count ?? 0) >= 1) return true
      setActiveDialog({ type: 'order_closed_warning' })
      return true
    }
    return false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveDialog])

  const handleAddSeat = useCallback(() => {
    const newCount = seatingHook.addSeat()
    useOrderStore.getState().updateActiveOrderDetails({ guest_count: newCount })
    useTableSessionStore.getState().dispatch(currentTableId, {
      type: 'PATCH',
      updates: { party_size: newCount }
    })
  }, [seatingHook.addSeat, currentTableId])

  const handleRemoveSeat = useCallback(() => {
    const { removedSeat, reassignedItemCount } = seatingHook.removeSeat()
    if (removedSeat === 0) return
    const newCount = removedSeat - 1
    useOrderStore.getState().updateActiveOrderDetails({ guest_count: newCount })
    useTableSessionStore.getState().dispatch(currentTableId, {
      type: 'PATCH',
      updates: { party_size: newCount }
    })
    if (reassignedItemCount > 0) {
      show({
        title: 'Seat Removed',
        message: `${reassignedItemCount} item(s) moved to Shared`,
        type: 'warning'
      })
    }
  }, [seatingHook.removeSeat, currentTableId, show])

  const handleSelectCourse = useCallback(
    (courseId: number | null) => {
      if (activeOrder && courseId !== null) {
        setCurrentCourse(activeOrder.id, courseId)
      }
    },
    [activeOrder?.id, setCurrentCourse]
  )

  const handleSetCurrentCourse = useCallback(
    (course: number) => {
      if (activeOrder?.id) {
        setCurrentCourse(activeOrder.id, course)
      }
    },
    [activeOrder?.id, setCurrentCourse]
  )

  const handlePressMore = requestMoreOptionsOpen

  const handlePressTotal = useCallback(
    () => {
      if (isFullyPaid || displayBalanceDue <= PAID_BALANCE_TOLERANCE) return
      pricingSheetRef.current?.expand()
    },
    [isFullyPaid, displayBalanceDue]
  )

  const handleClosePricingSheet = useCallback(
    () => pricingSheetRef.current?.close(),
    []
  )

  const handleOpenServerSheet = useCallback(() => setServerSheetOpen(true), [])
  const handleCloseServerSheet = useCallback(
    () => setServerSheetOpen(false),
    []
  )
  const handleSelectServer = useCallback(
    (name: string) => {
      useOrderStore.getState().updateActiveOrderDetails({ server_name: name })
      setServerSheetOpen(false)

      // Also update server_staff_id on the session so the server badge on the
      // floor plan renders immediately without waiting for a full refresh.
      const sess = useTableSessionStore.getState().sessions[currentTableId]
      if (!sess?.id) return

      const employee = useEmployeeStore
        .getState()
        .employees.find(e => e.fullName === name)
      const staffProfileId = employee?.profileId
      if (!staffProfileId) return

      // Optimistic update — PATCH the session store immediately
      useTableSessionStore.getState().dispatch(currentTableId, {
        type: 'PATCH',
        updates: { server_staff_id: staffProfileId }
      })

      // Persist to DB in background (supabase comes from useSupabaseClient() at line 75)
      if (supabase) {
        transferTableServer(supabase, sess.id, staffProfileId).catch(err =>
          console.warn(
            '[handleSelectServer] Failed to update server_staff_id:',
            err
          )
        )
      }
    },
    [currentTableId, supabase]
  )

  const handleCloseDiscountSheet = useCallback(
    () => discountSheetRef.current?.close(),
    []
  )

  const handleVoidSuccess = useCallback(() => {
    markNavigatingAway()
    show({
      title: 'Check Voided',
      message:
        'The order has been successfully voided. Table is now available.',
      type: 'success'
    })
    onClose()
  }, [markNavigatingAway, show, onClose])

  const handleOpenPreAuthCapture = useCallback(() => {
    usePaymentStore.getState().setPreAuthMode('capture')
    usePaymentStore
      .getState()
      .open('Card', currentTableId, 'payment-method-selection')
  }, [currentTableId])

  const handleOpenPreAuthIncrement = useCallback(() => {
    usePaymentStore.getState().setPreAuthMode('increment')
    usePaymentStore
      .getState()
      .open('Card', currentTableId, 'payment-method-selection')
  }, [currentTableId])

  const handlePayAnyway = useCallback(() => {
    closeDialog()
    pricingSheetRef.current?.close()
    usePaymentStore
      .getState()
      .open('Card', currentTableId, 'payment-method-selection')
  }, [currentTableId, closeDialog])

  const handleClearAnyway = useCallback(async () => {
    closeDialog()
    await doClearTable()
  }, [doClearTable, closeDialog])

  // Stable callbacks for dialog change props (avoids new arrow fn per render)
  const handleDialogBoolChange = useCallback(
    (open: boolean) => {
      if (!open) closeDialog()
    },
    [closeDialog]
  )
  const handleCourseResendChange = useCallback(
    (course: number | null) => {
      if (course === null) closeDialog()
    },
    [closeDialog]
  )

  const handleProceedToPayment = useCallback(() => {
    pricingSheetRef.current?.close()
    handlePay()
  }, [handlePay])

  // --- Memoized course content ---
  const isCurrentCourseSent = useMemo(() => {
    if (!activeOrder?.id) return false
    return sentCourses[currentCourse] ?? false
  }, [activeOrder?.id, sentCourses, currentCourse])

  // --- Render ---

  // Collapse to a bare screen during close animation — stops all child
  // subscriptions from re-rendering while the pop animation plays.
  if (phase === 'navigating_away') {
    return <View style={{ flex: 1, backgroundColor: colors.screen }} />
  }

  if (!isReady && renderStage === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        <TableDetailSkeleton />
      </View>
    )
  }

  // Show skeleton if session has an order but we can't resolve it yet
  // (prevents "No active order" flash during transitional gaps)
  if (!activeOrder && session?.order_id) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        <TableDetailSkeleton />
      </View>
    )
  }

  // Fail-safe: if floor plan marks this table as occupied but activeOrder is not
  // resolved yet, keep skeleton instead of rendering an empty bill ($0 due).
  if (!activeOrder && table?.session && table.session.status !== 'available') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        <TableDetailSkeleton />
      </View>
    )
  }

  if (!table) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <Text
          style={{ fontSize: 20, fontWeight: 'bold', color: colors.danger }}
        >
          Table not found!
        </Text>
      </View>
    )
  }
  
  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Seat selector — always visible. Per-seat ordering toggle only
          controls bill grouping, not seat-number assignment. */}
      <View
        style={{
          backgroundColor: colors.screen,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingTop: 8,
          paddingBottom: 4
        }}
      >
        <View style={{ flex: 1 }}>
          <SeatSelector
            seatCount={seatingHook.seatCount}
            activeSeat={seatingHook.activeSeat}
            onSelectSeat={seatingHook.setActiveSeat}
            onAddSeat={handleAddSeat}
            onRemoveSeat={handleRemoveSeat}
            canRemoveSeat={seatingHook.seatCount > 1}
          />
        </View>
      </View>

      {/* Stage 1: OrderInfoHeader + TableBillSection (user sees their bill first) */}
      {renderStage >= 1 ? (
        <>
          {/* Tab (Pre-Auth) Info Banner */}
          {hasPreAuth && preAuth && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginHorizontal: 8,
                marginTop: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: colors.teal + '15',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal + '40',
                gap: 8
              }}
            >
              <CreditCard size={14} color={colors.teal} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.teal
                }}
              >
                Tab Open: ${preAuth.preAuthAmount?.toFixed(2)}
              </Text>
              <TouchableOpacity
                onPress={handleOpenPreAuthCapture}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  backgroundColor: colors.teal + '30',
                  borderRadius: 6
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  Close Tab
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenPreAuthIncrement}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  backgroundColor: colors.warning + '30',
                  borderRadius: 6
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: colors.warning
                  }}
                >
                  Increase
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View className='flex-1 flex-row'>
            <TableBillSection
              showOrderDetails={false}
              itemCourseMap={itemCourseMap}
              sentCourses={sentCourses}
              courseSentAtMap={courseSentAtMap}
              currentCourse={currentCourse}
              onSelectCourse={handleSelectCourse}
              setCurrentCourse={handleSetCurrentCourse}
              onDoubleTapCourse={handleDoubleTapCourse}
              activeOrder={activeOrder}
              onOpenServerSheet={handleOpenServerSheet}
              onPressMore={handlePressMore}
              onPressTotal={handlePressTotal}
              onPressCloseCheck={handleCloseCheck}
              onPressReopenCheck={handlePressReopen}
              onPressClearTable={handleClearTable}
              totalDisplayAmount={displayBalanceDue}
              pricingSheetRef={
                pricingSheetRef as React.RefObject<BottomSheetMethods>
              }
              onClosePricingSheet={handleClosePricingSheet}
              onPressProceedToPayment={handleProceedToPayment}
              onPressStartNewCourse={handleStartNewCourse}
              onRemoveCourse={handleRemoveCourse}
              isFullyPaid={isFullyPaid}
              itemSeatMap={seatingHook.itemSeatMap}
              activeSeat={seatingHook.activeSeat}
              seatCount={seatingHook.seatCount}
              onSelectSeat={seatingHook.setActiveSeat}
              enablePerSeatOrdering={enablePerSeatOrdering}
              enableCoursing={enableCoursing}
              onRushCourse={handleRushCourse}
              onPrioritizeCourse={handlePrioritizeCourse}
              onResendCourse={handleResendCourse}
              onPressSendAllToKitchen={handleSendAllToKitchen}
              isOvertime={isOvertime}
              overtimeMinutes={defaultSittingTimeMinutes}
            />
            <TableOrderMenuPanel
              renderStage={renderStage}
              enableCoursing={enableCoursing}
              isCurrentCourseSent={isCurrentCourseSent}
              onStartNewCourse={handleStartNewCourse}
              onOrderClosedCheck={checkOrderClosedAndWarn}
              isMenuDisabled={isClosedCheckMenuDisabled}
            />
          </View>
        </>
      ) : (
        <TableDetailSkeleton />
      )}

      {/* Stage 2: Bottom sheets — outside Teleport so re-renders of the portal don't reset gesture state */}
      {renderStage >= 2 &&
        (moreOptionsOpenedOnce ||
          discountOpenedOnce ||
          serviceChargeOpenedOnce) && (
        <>
          {moreOptionsOpenedOnce && (
            <MoreOptionsBottomSheet
              ref={moreOptionsSheetRef}
              isTableOrdering
              onVoidSuccess={handleVoidSuccess}
              discountSheetRef={lazyDiscountSheetRef}
              serviceChargeSheetRef={lazyServiceChargeSheetRef}
              onCloseCheck={handleCloseCheck}
            />
          )}

          {discountOpenedOnce && (
            <DiscountBottomSheet
              ref={discountSheetRef}
              onClose={handleCloseDiscountSheet}
            />
          )}

          {serviceChargeOpenedOnce && (
            <ServiceChargeOverrideSheet
              ref={serviceChargeSheetRef}
              onClose={() => serviceChargeSheetRef.current?.close()}
            />
          )}
        </>
      )}

      {/* Stage 2: Teleport items that need root-level rendering */}
      {renderStage >= 2 && (
        <Teleport hostName='root'>
          <ServerSelectSheet
            isOpen={serverSheetOpen}
            onClose={handleCloseServerSheet}
            onSelect={handleSelectServer}
            currentServer={activeOrder?.server_name}
          />

          <TableAlertDialogs
            isNotReadyConfirmOpen={activeDialog.type === 'not_ready_confirm'}
            onNotReadyConfirmChange={handleDialogBoolChange}
            onPayAnyway={handlePayAnyway}
            isClearNotReadyConfirmOpen={
              activeDialog.type === 'clear_not_ready_confirm'
            }
            onClearNotReadyConfirmChange={handleDialogBoolChange}
            onClearAnyway={handleClearAnyway}
            notReadyItems={
              activeDialog.type === 'not_ready_confirm' ||
              activeDialog.type === 'clear_not_ready_confirm'
                ? activeDialog.items
                : EMPTY_NOT_READY_ITEMS
            }
            isVoidConfirmOpen={activeDialog.type === 'void_confirm'}
            onVoidConfirmChange={handleDialogBoolChange}
            onConfirmVoid={confirmVoid}
            isOrderClosedWarningOpen={
              activeDialog.type === 'order_closed_warning'
            }
            onOrderClosedWarningChange={handleDialogBoolChange}
            onConfirmReopen={handleConfirmReopen}
            courseToResend={
              activeDialog.type === 'course_resend' ? activeDialog.course : null
            }
            onCourseResendChange={handleCourseResendChange}
            onConfirmResend={handleConfirmResend}
          />
        </Teleport>
      )}
    </View>
  )
})

TableOrderView.displayName = 'TableOrderView'

export default TableOrderView
