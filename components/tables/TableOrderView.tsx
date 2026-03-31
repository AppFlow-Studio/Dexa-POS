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
import { useModifierSidebarStore } from '@/stores/useModifierSidebarStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { ArrowLeft, CreditCard } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface TableOrderViewProps {
  tableId: string
  onClose: () => void
}

const TableOrderView = ({ tableId, onClose }: TableOrderViewProps) => {
  const currentTableId = tableId

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

  // --- Extracted hooks ---
  const {
    phase,
    activeOrder,
    tableStatus,
    isReady,
    markNavigatingAway,
    markPaymentSyncing,
    markPaymentSyncDone
  } = useTableSession(currentTableId, undefined, onClose)

  const coursingHook = useTableCoursing(activeOrder)

  useTablePaymentSync(activeOrder?.id, markPaymentSyncing, markPaymentSyncDone)

  const isTableActive = isActiveSession(tableStatus) || tableStatus === 'paid'
  const { duration, isOvertime } = useTableDuration(
    activeOrder?.opened_at,
    isTableActive
  )

  // --- Store selectors (only what's still needed at this level) ---
  const isModifierSidebarOpen = useModifierSidebarStore(s => s.isOpen)
  const table = useFloorPlanStore(s => s.tablesById[currentTableId])
  const session = useTableSessionStore(s => s.sessions[currentTableId])

  const enablePerSeatOrdering = useLocationConfigStore(
    s => s.config.dining.enablePerSeatOrdering
  )
  const enableCoursing = useLocationConfigStore(
    s => s.config.dining.enableCoursing
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
  const totals = useActiveOrderTotals()
  const preAuth = useOrderPreAuth(activeOrder?.id)
  const hasPreAuth = useHasActivePreAuth(activeOrder?.id)
  const storeActiveOrderOutstandingTotal = totals?.amountDue ?? 0
  const storeActiveOrderTotal = totals?.total ?? 0

  // --- Bottom sheet refs ---
  const pricingSheetRef = useRef<BottomSheetMethods>(null)
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null)
  const discountSheetRef = useRef<BottomSheetMethods>(null)

  // --- Alert dialog state ---
  const [isNotReadyConfirmOpen, setNotReadyConfirmOpen] = useState(false)
  const [isClearNotReadyConfirmOpen, setClearNotReadyConfirmOpen] =
    useState(false)
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false)
  const [isOrderClosedWarningOpen, setOrderClosedWarningOpen] = useState(false)
  const [courseToResend, setCourseToResend] = useState<number | null>(null)
  const [isReopenModalOpen, setReopenModalOpen] = useState(false)
  const [serverSheetOpen, setServerSheetOpen] = useState(false)
  const [selectedCourseIdForTracker, setSelectedCourseIdForTracker] = useState<
    number | null
  >(null)
  const [notReadyItems, setNotReadyItems] = useState<
    { id: string; name: string; quantity: number }[]
  >([])

  // --- Deferred rendering ---
  // Skip skeleton (stage 0) when order data is already in the store (e.g. navigating from tables screen)
  const [renderStage, setRenderStage] = useState(() => {
    // Check session store for this table's order — works even before activeOrderId is set
    const session = useTableSessionStore.getState().sessions[currentTableId]
    if (session?.order_id) {
      const found = useOrderStore.getState().getOrder(session.order_id)
      if (found) return 2 // order already in store — render everything immediately
    }
    // Fallback: check activeOrderId (available table or freshly created order)
    const orderState = useOrderStore.getState()
    const oid = orderState.activeOrderId
    const hasOrder =
      oid && orderState.ordersById[oid]?.service_location_id === currentTableId
    return hasOrder ? 2 : 0
  })
  useEffect(() => {
    let cancelled = false
    if (renderStage >= 2) return
    // Stage 0: show skeleton one frame, then render everything
    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      setRenderStage(2)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [])

  // --- Derived values ---
  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0
  const displayBalanceDue = hasPayments
    ? storeActiveOrderOutstandingTotal
    : storeActiveOrderTotal

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
        (item.courseNumber ?? coursingHook.itemCourseMap?.[item.id] ?? 1) ===
        selectedCourseIdForTracker
    )
  }, [
    activeOrder?.items,
    selectedCourseIdForTracker,
    coursingHook.itemCourseMap
  ])

  // --- Action handlers ---

  const handlePay = useCallback(() => {
    if (activeOrder) {
      const preparingItems = activeOrder.items.filter(
        i => !isItemReadyOrServed(i)
      )
      if (preparingItems.length > 0) {
        setNotReadyItems(
          preparingItems.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity
          }))
        )
        setNotReadyConfirmOpen(true)
        return
      }
    }
    openPaymentSheet('Card', currentTableId, 'payment-method-selection')
  }, [activeOrder, openPaymentSheet, currentTableId])

  const handleClearTable = async () => {
    if (!activeOrderId || !activeOrder) return

    const preparingItems = activeOrder.items.filter(
      item => !isItemReadyOrServed(item)
    )

    if (preparingItems.length > 0) {
      setNotReadyItems(
        preparingItems.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity
        }))
      )
      setClearNotReadyConfirmOpen(true)
      return
    }

    await doClearTable()
  }

  const doClearTable = async () => {
    if (!activeOrderId || !activeOrder) return
    showLoading('Clearing table...')
    markNavigatingAway()

    // Recovery: if session isn't at "paid" yet but order IS paid,
    // dispatch FULL_PAYMENT first (fixes stuck check_presented race)
    const sess = useTableSessionStore.getState().getSession(currentTableId)
    if (
      sess &&
      sess.status !== 'paid' &&
      sess.status !== 'closing' &&
      sess.status !== 'cleaning' &&
      activeOrder.paid_status === 'Paid'
    ) {
      await dispatchAction({ type: 'FULL_PAYMENT', tableId: currentTableId })
    }

    const result = await dispatchAction({
      type: 'CLEAR_TABLE',
      tableId: currentTableId,
      orderId: activeOrder.id
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
  }

  const confirmVoid = async () => {
    if (!activeOrder) return

    if (activeOrder.order_status === 'void') {
      setVoidConfirmOpen(false)
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
      orderId: activeOrder.id,
      dbOrderId: activeOrder.db_order_id
    })

    if (result.success) {
      setVoidConfirmOpen(false)
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
  }

  const handleCloseCheck = async () => {
    if (!activeOrder || !currentTableId) return

    if (displayBalanceDue > 0.01) {
      show({
        title: 'Cannot Close Check',
        message: 'Outstanding balance must be $0.00 to close check',
        type: 'error'
      })
      return
    }

    if (!activeOrder.db_order_id) {
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
        orderId: activeOrder.id,
        dbOrderId: activeOrder.db_order_id
      })
      if (!result.success)
        throw new Error(result.error || 'Failed to close check')

      // Ensure session reaches "paid" — covers race where markPaymentSyncDone
      // ran before realtime overwrote the status back to "check_presented"
      const sess = useTableSessionStore.getState().getSession(currentTableId)
      if (sess && sess.status !== 'paid' && sess.status !== 'cleaning') {
        await dispatchAction({ type: 'FULL_PAYMENT', tableId: currentTableId })
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
  }

  const handleReopenCheck = () => {
    if (!activeOrderId || !activeOrder?.db_order_id) return
    setReopenModalOpen(true)
  }

  const handleConfirmReopen = async () => {
    setReopenModalOpen(false)
    if (!activeOrderId || !activeOrder?.db_order_id) return

    try {
      showLoading('Reopening check...')
      const result = await dispatchAction({
        type: 'REOPEN_CHECK',
        tableId: currentTableId,
        orderId: activeOrder.id,
        dbOrderId: activeOrder.db_order_id,
        reason: 'Adding more items'
      })
      if (!result.success)
        throw new Error(result.error || 'Failed to reopen check')

      updateActiveOrderDetails({
        paid_status: 'Partial',
        check_status: 'Opened'
      })
      syncOrderStatus(activeOrderId)

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
  }

  const handleMarkAllReadyForCourse = (itemIds: string[]) => {
    batchUpdateItemKitchenStatus(itemIds, 'ready')
    if (activeOrderId && selectedCourseIdForTracker !== null) {
      coursingHook.markCourseServed(activeOrderId, selectedCourseIdForTracker)
    }
    show({
      title: 'Items Marked Ready',
      message: 'All items in the course have been marked as ready.',
      type: 'success'
    })
  }

  const finalizeCurrentCourse = () => {
    if (!activeOrder || !enableCoursing) {
      if (!enableCoursing) {
        show({
          title: 'Coursing Disabled',
          message: 'Coursing is not enabled for this location.',
          type: 'warning'
        })
      }
      return
    }
    const nextCourse = coursingHook.finalizeCurrentCourse(
      activeOrder.id,
      activeOrder.items.map(i => i.id)
    )
    show({
      title: 'Course Finalized',
      message: `Course ${
        nextCourse - 1
      } complete. New items added to Course ${nextCourse}.`,
      type: 'success'
    })
  }

  const handleSendCourseToKitchen = async (
    course: number,
    forceResend = false,
    silent = false
  ) => {
    if (!activeOrder) return

    if (!forceResend && coursingHook.isCourseSent(activeOrder.id, course)) {
      if (!silent) {
        show({
          title: 'Already Sent',
          message: `Course ${course} has already been sent to the kitchen.`,
          type: 'warning'
        })
      }
      return
    }

    const state = coursingHook.getForOrder(activeOrder.id)
    const itemsInCourse = activeOrder.items.filter(
      i => (i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1) === course
    )
    if (itemsInCourse.length === 0) {
      if (!silent) {
        show({
          title: 'Empty Course',
          message: `There are no items in Course ${course} to send.`,
          type: 'warning'
        })
      }
      return false
    }

    if (!activeOrder.opened_at) {
      updateActiveOrderDetails({ opened_at: new Date().toISOString() })
    }
    if (!activeOrder.sent_to_kitchen_at) {
      updateActiveOrderDetails({
        sent_to_kitchen_at: new Date().toISOString()
      })
    }

    // Save original statuses for rollback
    const originalStatuses = itemsInCourse.map(i => ({
      id: i.id,
      item_status: i.item_status,
      kitchen_status: i.kitchen_status
    }))

    // Optimistically mark items as sent/queued (single batched set() call)
    batchUpdateItemKitchenStatus(
      itemsInCourse.map(i => i.id),
      getKitchenSentStatus()
    )

    // Mark course as sent IMMEDIATELY (drives CourseGroup UI via isSent prop)
    coursingHook.markCourseSent(activeOrder.id, course)

    // Collect db item IDs for the effect
    const dbItemIds = itemsInCourse
      .map(i => i.db_order_item_id)
      .filter((id): id is string => !!id)

    // Dispatch: transitions to "ordered" + fires backend sync effect
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
      // Auto-print kitchen tickets for the sent items
      if (autoPrintKitchenTickets && selectedStore) {
        PrinterService.printKitchenTickets(
          activeOrder,
          itemsInCourse,
          selectedStore
        ).catch(e =>
          console.warn('[TableView] Auto-print kitchen tickets failed:', e)
        )
      }

      if (!silent) {
        show({
          title: forceResend ? 'Course Resent' : 'Course Sent',
          message: `Course ${course} has been ${
            forceResend ? 'resent' : 'sent'
          } for preparation.`,
          type: 'success'
        })
      }
      return true
    } else {
      // Revert course sent state
      coursingHook.unmarkCourseSent(activeOrder.id, course)
      // Revert item statuses on failure
      const orderStore = useOrderStore.getState()
      const oid = orderStore.activeOrderId
      if (oid) {
        useOrderStore.setState(state => {
          const order = state.ordersById[oid]
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
  }

  const handleSendAllToKitchen = useCallback(async () => {
    if (!activeOrder) return

    const state = coursingHook.getForOrder(activeOrder.id)
    const pendingCourses = Array.from(
      new Set(
        activeOrder.items
          .map(i => i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1)
          .filter(
            courseNumber =>
              !coursingHook.isCourseSent(activeOrder.id, courseNumber)
          )
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

    let sentCount = 0
    for (const course of pendingCourses) {
      const success = await handleSendCourseToKitchen(course, false, true)
      if (success) sentCount += 1
    }

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
  }, [activeOrder, coursingHook, handleSendCourseToKitchen, show])

  const handleDoubleTapCourse = (course: number) => {
    if (!activeOrder) return
    if (coursingHook.isCourseSent(activeOrder.id, course)) {
      setCourseToResend(course)
    } else {
      handleSendCourseToKitchen(course, false)
    }
  }

  const handleConfirmResend = () => {
    if (courseToResend !== null) {
      handleSendCourseToKitchen(courseToResend, true)
      setCourseToResend(null)
    }
  }

  const handleRushCourse = useCallback(
    async (course: number) => {
      if (!activeOrder) return
      const state = coursingHook.getForOrder(activeOrder.id)
      const itemsInCourse = activeOrder.items.filter(
        i => (i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1) === course
      )
      const dbItemIds = itemsInCourse
        .map(i => i.db_order_item_id)
        .filter((id): id is string => !!id)
      if (dbItemIds.length === 0) return

      const { error } = await OrderService.toggleRushOnItems(
        supabase,
        dbItemIds,
        true
      )
      if (error) {
        show({
          title: 'Rush Failed',
          message: 'Could not rush this course.',
          type: 'error'
        })
      } else {
        show({
          title: 'Course Rushed',
          message: `Course ${course} marked as rush.`,
          type: 'success'
        })
      }
    },
    [activeOrder, coursingHook, supabase, show]
  )

  const handlePrioritizeCourse = useCallback(
    async (course: number) => {
      if (!activeOrder) return
      const state = coursingHook.getForOrder(activeOrder.id)
      const itemsInCourse = activeOrder.items.filter(
        i => (i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1) === course
      )
      const dbItemIds = itemsInCourse
        .map(i => i.db_order_item_id)
        .filter((id): id is string => !!id)
      if (dbItemIds.length === 0) return

      const { error } = await OrderService.togglePriorityOnItems(
        supabase,
        dbItemIds,
        true
      )
      if (error) {
        show({
          title: 'Prioritize Failed',
          message: 'Could not prioritize this course.',
          type: 'error'
        })
      } else {
        show({
          title: 'Course Prioritized',
          message: `Course ${course} marked as priority.`,
          type: 'success'
        })
      }
    },
    [activeOrder, coursingHook, supabase, show]
  )

  const handleResendCourse = (course: number) => {
    handleSendCourseToKitchen(course, true)
  }

  const checkOrderClosedAndWarn = useCallback(() => {
    if (isFullyPaid || activeOrder?.check_status === 'Closed') {
      setOrderClosedWarningOpen(true)
      return true
    }
    return false
  }, [isFullyPaid, activeOrder?.check_status])

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
        coursingHook.setCurrentCourse(activeOrder.id, courseId)
      }
    },
    [activeOrder?.id, coursingHook.setCurrentCourse]
  )

  const handleSetCurrentCourse = useCallback(
    (course: number) => {
      if (activeOrder?.id) {
        coursingHook.setCurrentCourse(activeOrder.id, course)
      }
    },
    [activeOrder?.id, coursingHook.setCurrentCourse]
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

  const handleProceedToPayment = useCallback(() => {
    pricingSheetRef.current?.close()
    handlePay()
  }, [handlePay])

  // --- Memoized course content ---
  const isCurrentCourseSent = useMemo(() => {
    if (!activeOrder?.id) return false
    return coursingHook.sentCourses[coursingHook.currentCourse] ?? false
  }, [activeOrder?.id, coursingHook.sentCourses, coursingHook.currentCourse])

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
                onPress={() => {
                  setPreAuthMode('capture')
                  openPaymentSheet(
                    'Card',
                    currentTableId,
                    'payment-method-selection'
                  )
                }}
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
                onPress={() => {
                  setPreAuthMode('increment')
                  openPaymentSheet(
                    'Card',
                    currentTableId,
                    'payment-method-selection'
                  )
                }}
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
              itemCourseMap={coursingHook.itemCourseMap}
              sentCourses={coursingHook.sentCourses}
              currentCourse={coursingHook.currentCourse}
              onSelectCourse={handleSelectCourse}
              setCurrentCourse={handleSetCurrentCourse}
              onDoubleTapCourse={handleDoubleTapCourse}
              activeOrder={activeOrder}
              onOpenServerSheet={() => setServerSheetOpen(true)}
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

      {/* Stage 2: Defer heavy bottom sheets and dialogs */}
      {renderStage >= 2 && (
        <>
          {selectedCourseIdForTracker !== null && (
            <ItemProgressTracker
              selectedCourse={selectedCourseIdForTracker}
              itemsInSelectedCourse={itemsInSelectedCourse}
              isModifierSidebarOpen={isModifierSidebarOpen}
              onMarkAllReady={handleMarkAllReadyForCourse}
              isCourseSent={coursingHook.isCourseSent(
                activeOrder?.id || '',
                selectedCourseIdForTracker
              )}
            />
          )}

          <MoreOptionsBottomSheet
            ref={moreOptionsSheetRef}
            onVoidSuccess={() => {
              markNavigatingAway()
              // Session already cleared locally by voidOrderEffect; RPC closed backend session
              show({
                title: 'Check Voided',
                message:
                  'The order has been successfully voided. Table is now available.',
                type: 'success'
              })
              onClose()
            }}
            discountSheetRef={
              discountSheetRef as React.RefObject<BottomSheetMethods>
            }
            onCloseCheck={handleCloseCheck}
          />

          <DiscountBottomSheet
            ref={discountSheetRef}
            onClose={() => discountSheetRef.current?.close()}
          />

          <ServerSelectSheet
            isOpen={serverSheetOpen}
            onClose={() => setServerSheetOpen(false)}
            onSelect={name => {
              updateActiveOrderDetails({ server_name: name })
              setServerSheetOpen(false)
            }}
            currentServer={activeOrder?.server_name}
          />

          <TableAlertDialogs
            isNotReadyConfirmOpen={isNotReadyConfirmOpen}
            onNotReadyConfirmChange={setNotReadyConfirmOpen}
            onPayAnyway={() => {
              setNotReadyConfirmOpen(false)
              pricingSheetRef.current?.close()
              openPaymentSheet(
                'Card',
                currentTableId,
                'payment-method-selection'
              )
            }}
            isClearNotReadyConfirmOpen={isClearNotReadyConfirmOpen}
            onClearNotReadyConfirmChange={setClearNotReadyConfirmOpen}
            onClearAnyway={async () => {
              setClearNotReadyConfirmOpen(false)
              await doClearTable()
            }}
            notReadyItems={notReadyItems}
            isVoidConfirmOpen={isVoidConfirmOpen}
            onVoidConfirmChange={setVoidConfirmOpen}
            onConfirmVoid={confirmVoid}
            isOrderClosedWarningOpen={isOrderClosedWarningOpen}
            onOrderClosedWarningChange={setOrderClosedWarningOpen}
            courseToResend={courseToResend}
            onCourseResendChange={setCourseToResend}
            onConfirmResend={handleConfirmResend}
            isReopenModalOpen={isReopenModalOpen}
            onReopenModalClose={() => setReopenModalOpen(false)}
            onConfirmReopen={handleConfirmReopen}
          />
        </>
      )}
    </View>
  )
}

export default TableOrderView
