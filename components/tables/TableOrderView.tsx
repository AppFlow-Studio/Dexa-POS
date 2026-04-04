import DiscountBottomSheet from '@/components/bill/DiscountBottomSheet'
import ItemProgressTracker from '@/components/bill/ItemProgressTracker'
import MoreOptionsBottomSheet from '@/components/bill/MoreOptionsBottomSheet'
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
import {
  useActiveOrderTotals,
  useHasActivePreAuth,
  useOrderPreAuth
} from '@/stores/selectors/orderSelectors'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { ArrowLeft, CreditCard } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Portal as Teleport } from 'react-native-teleport'

// Stable empty array to avoid new reference on every render
const EMPTY_NOT_READY_ITEMS: { id: string; name: string; quantity: number }[] =
  []

interface TableOrderViewProps {
  tableId: string
  onClose: () => void
}

const TableOrderView = ({ tableId, onClose }: TableOrderViewProps) => {
  const currentTableId = tableId

  // --- 1. Base Deferred Rendering State (MUST BE FIRST) ---
  const [renderStage, setRenderStage] = useState(() => {
    const session = useTableSessionStore.getState().sessions[currentTableId]
    if (session?.order_id) {
      const found = useOrderStore.getState().getOrder(session.order_id)
      if (found) return 2
    }
    const orderState = useOrderStore.getState()
    const oid = orderState.activeOrderId
    const hasOrder =
      oid && orderState.ordersById[oid]?.service_location_id === currentTableId
    return hasOrder ? 2 : 0
  })

  // --- 2. Standard Hooks & Context ---
  const { show } = useToast()
  const { showLoading, hideLoading } = useLoading()
  const supabase = useSupabaseClient()
  const defaultSittingTimeMinutes = useLocationConfigStore(
    s => s.config.dining.defaultSittingTimeMinutes
  )
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const autoPrintKitchenTickets = useLocationConfigStore(
    s => s.config.printing.autoPrintKitchenTickets
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
    | { type: 'reopen_modal' }
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>({
    type: 'none'
  })
  const closeDialog = useCallback(() => setActiveDialog({ type: 'none' }), [])
  const [serverSheetOpen, setServerSheetOpen] = useState(false)
  const [selectedCourseIdForTracker, setSelectedCourseIdForTracker] = useState<
    number | null
  >(null)

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
    itemCourseMap,
    setCurrentCourse,
    isCourseSent,
    markCourseSent,
    unmarkCourseSent,
    markCourseServed,
    getForOrder,
    finalizeCurrentCourse: finalizeCourse
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
  const partySize = session?.party_size ?? 2
  const seatingHook = useTableSeating(
    activeOrder,
    partySize,
    enablePerSeatOrdering
  )

  const updateSessionStatus = useTableSessionStore(s => s.updateSessionStatus)
  const dispatchAction = useTableSessionStore(s => s.dispatchAction)
  const openPaymentSheet = usePaymentStore(s => s.open)
  const updateActiveOrderDetails = useOrderStore(
    s => s.updateActiveOrderDetails
  )
  const batchUpdateItemKitchenStatus = useOrderStore(
    s => s.batchUpdateItemKitchenStatus
  )
  const syncOrderStatus = useOrderStore(s => s.syncOrderStatus)
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const setPreAuthMode = usePaymentStore(s => s.setPreAuthMode)

  const totalsEnabled = renderStage >= 1
  const totals = useActiveOrderTotals(totalsEnabled)
  const preAuth = useOrderPreAuth(totalsEnabled ? activeOrder?.id : undefined)
  const hasPreAuth = useHasActivePreAuth(
    totalsEnabled ? activeOrder?.id : undefined
  )
  const storeActiveOrderOutstandingTotal = totals?.amountDue ?? 0
  const storeActiveOrderTotal = totals?.total ?? 0

  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0
  const displayBalanceDue = hasPayments
    ? storeActiveOrderOutstandingTotal
    : storeActiveOrderTotal

  // --- 6. Bottom sheet refs ---
  const pricingSheetRef = useRef<BottomSheetMethods>(null)
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null)
  const discountSheetRef = useRef<BottomSheetMethods>(null)

  // --- 7. Effects ---
  useEffect(() => {
    let cancelled = false
    if (renderStage >= 2) return
    if (renderStage === 0) {
      setRenderStage(1)
    }
    requestAnimationFrame(() => {
      if (!cancelled) setRenderStage(2)
    })
    return () => {
      cancelled = true
    }
  }, [renderStage])

  // --- 8. Final Derived UI State ---
  const isFullyPaid = useMemo(() => {
    if (activeOrder?.check_status === 'Opened') return false
    return (
      activeOrder?.paid_status === 'Paid' ||
      (hasPayments && displayBalanceDue <= 0)
    )
  }, [
    activeOrder?.check_status,
    activeOrder?.paid_status,
    hasPayments,
    displayBalanceDue
  ])

  // Items in selected course (for ItemProgressTracker)
  const itemsInSelectedCourse = useMemo(() => {
    if (!activeOrder || selectedCourseIdForTracker === null) return []
    return activeOrder.items.filter(
      item =>
        (item.courseNumber ?? itemCourseMap?.[item.id] ?? 1) ===
        selectedCourseIdForTracker
    )
  }, [activeOrder?.items, selectedCourseIdForTracker, itemCourseMap])

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
    openPaymentSheet('Card', currentTableId, 'payment-method-selection')
  }, [openPaymentSheet, currentTableId])

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
      dispatchAction({ type: 'FULL_PAYMENT', tableId: currentTableId })
    }

    const result = await dispatchAction({
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
    dispatchAction,
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

    const result = await dispatchAction({
      type: 'VOID_ORDER',
      tableId: currentTableId,
      orderId: order.id,
      dbOrderId: order.db_order_id
    })

    if (result.success) {
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
  }, [
    closeDialog,
    show,
    markNavigatingAway,
    onClose,
    dispatchAction,
    currentTableId
  ])

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
      const result = await dispatchAction({
        type: 'CLOSE_CHECK',
        tableId: currentTableId,
        orderId: order.id,
        dbOrderId: order.db_order_id
      })
      if (!result.success)
        throw new Error(result.error || 'Failed to close check')

      const sess = useTableSessionStore.getState().getSession(currentTableId)
      if (sess && sess.status !== 'paid' && sess.status !== 'cleaning') {
        dispatchAction({ type: 'FULL_PAYMENT', tableId: currentTableId })
      }

      updateActiveOrderDetails({ check_status: 'Closed' })
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
  }, [
    currentTableId,
    show,
    showLoading,
    hideLoading,
    dispatchAction,
    updateActiveOrderDetails
  ])

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

  const handleReopenCheck = useCallback(() => {
    const { activeOrderId: oid, ordersById } = useOrderStore.getState()
    const order = oid ? ordersById[oid] : null
    if (!oid || !order?.db_order_id) return
    setActiveDialog({ type: 'reopen_modal' })
  }, [])

  const handleConfirmReopen = useCallback(async () => {
    closeDialog()
    const { activeOrderId: oid, ordersById } = useOrderStore.getState()
    const order = oid ? ordersById[oid] : null
    if (!oid || !order?.db_order_id) return

    try {
      showLoading('Reopening check...')
      const result = await dispatchAction({
        type: 'REOPEN_CHECK',
        tableId: currentTableId,
        orderId: order.id,
        dbOrderId: order.db_order_id,
        reason: 'Adding more items'
      })
      if (!result.success)
        throw new Error(result.error || 'Failed to reopen check')

      updateActiveOrderDetails({
        paid_status: 'Partial',
        check_status: 'Opened'
      })
      syncOrderStatus(oid)

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
      hideLoading()
    }
  }, [
    closeDialog,
    showLoading,
    hideLoading,
    dispatchAction,
    currentTableId,
    updateActiveOrderDetails,
    syncOrderStatus,
    show
  ])

  const handleMarkAllReadyForCourse = useCallback(
    (itemIds: string[]) => {
      batchUpdateItemKitchenStatus(itemIds, 'ready')
      const oid = useOrderStore.getState().activeOrderId
      if (oid && selectedCourseIdForTracker !== null) {
        markCourseServed(oid, selectedCourseIdForTracker)
      }
      show({
        title: 'Items Marked Ready',
        message: 'All items in the course have been marked as ready.',
        type: 'success'
      })
    },
    [
      batchUpdateItemKitchenStatus,
      selectedCourseIdForTracker,
      markCourseServed,
      show
    ]
  )

  const finalizeCurrentCourse = useCallback(() => {
    if (!enableCoursing) {
      show({
        title: 'Coursing Disabled',
        message: 'Coursing is not enabled for this location.',
        type: 'warning'
      })
      return
    }
    const { activeOrderId: oid, ordersById } = useOrderStore.getState()
    const order = oid ? ordersById[oid] : null
    if (!order) return
    const nextCourse = finalizeCourse(
      order.id,
      order.items.map(i => i.id)
    )
    show({
      title: 'Course Finalized',
      message: `Course ${
        nextCourse - 1
      } complete. New items added to Course ${nextCourse}.`,
      type: 'success'
    })
  }, [enableCoursing, finalizeCourse, show])

  const handleSendCourseToKitchen = useCallback(
    async (course: number, forceResend = false, silent = false) => {
      const { activeOrderId: oid, ordersById } = useOrderStore.getState()
      const activeOrder = oid ? ordersById[oid] : null
      if (!activeOrder) return

      if (!forceResend && isCourseSent(activeOrder.id, course)) {
        if (!silent)
          show({
            title: 'Already Sent',
            message: `Course ${course} has already been sent to the kitchen.`,
            type: 'warning'
          })
        return
      }

      const state = getForOrder(activeOrder.id)
      const itemsInCourse = activeOrder.items.filter(
        i => (i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1) === course
      )
      if (itemsInCourse.length === 0) {
        if (!silent)
          show({
            title: 'Empty Course',
            message: `There are no items in Course ${course} to send.`,
            type: 'warning'
          })
        return false
      }

      const originalStatuses = itemsInCourse.map(i => ({
        id: i.id,
        item_status: i.item_status,
        kitchen_status: i.kitchen_status
      }))

      batchUpdateItemKitchenStatus(
        itemsInCourse.map(i => i.id),
        getKitchenSentStatus()
      )
      markCourseSent(activeOrder.id, course)

      const dbItemIds = itemsInCourse
        .map(i => i.db_order_item_id)
        .filter((id): id is string => !!id)

      const result = await dispatchAction({
        type: 'SEND_TO_KITCHEN',
        tableId: currentTableId,
        courseNumber: course,
        itemIds: itemsInCourse.map(i => i.id),
        dbItemIds,
        orderId: activeOrder.id,
        dbOrderId: activeOrder.db_order_id,
        forceResend
      })

      if (result.success) {
        // Set timestamps after success (non-blocking metadata)
        if (!activeOrder.opened_at)
          updateActiveOrderDetails({ opened_at: new Date().toISOString() })
        if (!activeOrder.sent_to_kitchen_at)
          updateActiveOrderDetails({
            sent_to_kitchen_at: new Date().toISOString()
          })
        if (autoPrintKitchenTickets && selectedStore) {
          PrinterService.printKitchenTickets(
            activeOrder,
            itemsInCourse,
            selectedStore
          ).catch(e =>
            console.warn('[TableView] Auto-print kitchen tickets failed:', e)
          )
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
      updateActiveOrderDetails,
      batchUpdateItemKitchenStatus,
      dispatchAction,
      currentTableId,
      autoPrintKitchenTickets,
      selectedStore,
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
          .map(i => i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1)
          .filter(courseNumber => !isCourseSent(activeOrder.id, courseNumber))
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
  }, [getForOrder, isCourseSent, handleSendCourseToKitchen, show])

  const handleDoubleTapCourse = useCallback(
    (course: number) => {
      const orderId = useOrderStore.getState().activeOrderId
      if (!orderId) return
      if (isCourseSent(orderId, course)) {
        setActiveDialog({ type: 'course_resend', course })
      } else {
        handleSendCourseToKitchen(course, false)
      }
    },
    [isCourseSent, handleSendCourseToKitchen]
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
    if (order?.paid_status === 'Paid' || order?.check_status === 'Closed') {
      setActiveDialog({ type: 'order_closed_warning' })
      return true
    }
    return false
  }, [])

  const handleAddSeat = useCallback(() => {
    const newCount = seatingHook.addSeat()
    updateActiveOrderDetails({ guest_count: newCount })
    useTableSessionStore.getState().dispatch(currentTableId, {
      type: 'PATCH',
      updates: { party_size: newCount }
    })
  }, [seatingHook.addSeat, updateActiveOrderDetails, currentTableId])

  const handleRemoveSeat = useCallback(() => {
    const { removedSeat, reassignedItemCount } = seatingHook.removeSeat()
    if (removedSeat === 0) return
    const newCount = removedSeat - 1
    updateActiveOrderDetails({ guest_count: newCount })
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
  }, [seatingHook.removeSeat, updateActiveOrderDetails, currentTableId, show])

  const handleSelectCourse = useCallback(
    (courseId: number | null) => {
      setSelectedCourseIdForTracker(courseId)
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

  const handlePressMore = useCallback(
    () => moreOptionsSheetRef.current?.expand(),
    []
  )

  const handlePressTotal = useCallback(
    () => pricingSheetRef.current?.expand(),
    []
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
      updateActiveOrderDetails({ server_name: name })
      setServerSheetOpen(false)
    },
    [updateActiveOrderDetails]
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
    setPreAuthMode('capture')
    openPaymentSheet('Card', currentTableId, 'payment-method-selection')
  }, [setPreAuthMode, openPaymentSheet, currentTableId])

  const handleOpenPreAuthIncrement = useCallback(() => {
    setPreAuthMode('increment')
    openPaymentSheet('Card', currentTableId, 'payment-method-selection')
  }, [setPreAuthMode, openPaymentSheet, currentTableId])

  const handlePayAnyway = useCallback(() => {
    closeDialog()
    pricingSheetRef.current?.close()
    openPaymentSheet('Card', currentTableId, 'payment-method-selection')
  }, [openPaymentSheet, currentTableId, closeDialog])

  const handleClearAnyway = useCallback(async () => {
    closeDialog()
    await doClearTable()
  }, [doClearTable, closeDialog])

  const handleCloseReopenModal = useCallback(() => closeDialog(), [closeDialog])

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

  if (!isReady && renderStage === 0) {
    return (
      <View style={{ flex: 1 }} className='bg-screen'>
        <TableDetailSkeleton />
      </View>
    )
  }

  // Show skeleton if session has an order but we can't resolve it yet
  // (prevents "No active order" flash during transitional gaps)
  if (!activeOrder && session?.order_id) {
    return (
      <View style={{ flex: 1 }} className='bg-screen'>
        <TableDetailSkeleton />
      </View>
    )
  }

  if (!table) {
    return (
      <View
        style={{ flex: 1 }}
        className='bg-screen flex-1 items-center justify-center'
      >
        <Text className='text-xl font-bold' style={{ color: colors.danger }}>
          Table not found!
        </Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }} className='bg-screen'>
      {/* Header bar */}
      <View
        style={{ backgroundColor: colors.screen }}
        className='flex-row items-center px-2 pt-2 pb-1'
      >
        <TouchableOpacity
          onPress={onClose}
          className='p-1.5 rounded-lg bg-teal-500/10'
        >
          <ArrowLeft color={colors.teal} size={18} />
        </TouchableOpacity>

        {enablePerSeatOrdering && (
          <View style={{ flex: 1, marginLeft: 4 }}>
            <SeatSelector
              seatCount={seatingHook.seatCount}
              activeSeat={seatingHook.activeSeat}
              onSelectSeat={seatingHook.setActiveSeat}
              onAddSeat={handleAddSeat}
              onRemoveSeat={handleRemoveSeat}
              canRemoveSeat={seatingHook.seatCount > 1}
            />
          </View>
        )}
      </View>

      {isOvertime && (
        <View className='p-2 bg-yellow-500 items-center'>
          <Text className='text-base font-bold text-yellow-900'>
            This table has exceeded the default sitting time of{' '}
            {defaultSittingTimeMinutes} minutes.
          </Text>
        </View>
      )}

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
              currentCourse={currentCourse}
              onSelectCourse={handleSelectCourse}
              setCurrentCourse={handleSetCurrentCourse}
              onDoubleTapCourse={handleDoubleTapCourse}
              activeOrder={activeOrder}
              onOpenServerSheet={handleOpenServerSheet}
              onPressMore={handlePressMore}
              onPressTotal={handlePressTotal}
              onPressReopenCheck={handleReopenCheck}
              onPressCloseCheck={handleCloseCheck}
              onPressClearTable={handleClearTable}
              totalDisplayAmount={displayBalanceDue}
              pricingSheetRef={
                pricingSheetRef as React.RefObject<BottomSheetMethods>
              }
              onClosePricingSheet={handleClosePricingSheet}
              onPressProceedToPayment={handleProceedToPayment}
              onPressStartNewCourse={finalizeCurrentCourse}
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
            />
            <View className='flex-1 p-4 px-3 pt-0'>
              {/* Stage 2: MenuSection (heavier — deferred to avoid blocking modifier animation) */}
              {renderStage >= 2 ? (
                enableCoursing && isCurrentCourseSent ? (
                  <View className='flex-1 justify-center items-center'>
                    <TouchableOpacity
                      onPress={finalizeCurrentCourse}
                      className='flex-row items-center gap-1.5 px-4 py-2 rounded-lg border border-teal'
                      activeOpacity={0.8}
                    >
                      <Text className='font-semibold text-teal text-base'>
                        + New Course
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <MenuSection
                    onOrderClosedCheck={checkOrderClosedAndWarn}
                    isTableOrder={true}
                  />
                )
              ) : (
                <View className='flex-1 items-center justify-center'>
                  <Text className='text-gray-500'>Loading menu...</Text>
                </View>
              )}
            </View>
          </View>
        </>
      ) : (
        <TableDetailSkeleton />
      )}

      {/* Stage 2: Bottom sheets — outside Teleport so re-renders of the portal don't reset gesture state */}
      {renderStage >= 2 && (
        <>
          <MoreOptionsBottomSheet
            ref={moreOptionsSheetRef}
            onVoidSuccess={handleVoidSuccess}
            discountSheetRef={
              discountSheetRef as React.RefObject<BottomSheetMethods>
            }
            onCloseCheck={handleCloseCheck}
          />

          <DiscountBottomSheet
            ref={discountSheetRef}
            onClose={handleCloseDiscountSheet}
          />
        </>
      )}

      {/* Stage 2: Teleport items that need root-level rendering */}
      {renderStage >= 2 && (
        <Teleport hostName='root'>
          {selectedCourseIdForTracker !== null && (
            <ItemProgressTracker
              selectedCourse={selectedCourseIdForTracker}
              itemsInSelectedCourse={itemsInSelectedCourse}
              onMarkAllReady={handleMarkAllReadyForCourse}
              isCourseSent={isCourseSent(
                activeOrder?.id || '',
                selectedCourseIdForTracker
              )}
            />
          )}

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
            courseToResend={
              activeDialog.type === 'course_resend' ? activeDialog.course : null
            }
            onCourseResendChange={handleCourseResendChange}
            onConfirmResend={handleConfirmResend}
            isReopenModalOpen={activeDialog.type === 'reopen_modal'}
            onReopenModalClose={handleCloseReopenModal}
            onConfirmReopen={handleConfirmReopen}
          />
        </Teleport>
      )}
    </View>
  )
}

export default TableOrderView
