import { useSessionDuration } from '@/hooks/useSessionDuration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { getEffectiveItemStatus } from '@/lib/kitchenStatusUtils'
import { isOrderReadOnly } from '@/lib/orderAccessControl'
import { bottomSheetTheme, colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { PrinterService } from '@/services/printing/PrinterService'
import { useOrderTotals } from '@/stores/selectors/orderSelectors'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useReservationStore } from '@/stores/useReservationStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { useToastStore } from '@/stores/useToastStore'
import {
  FloorPlanObject,
  Reservation,
  TableStatus
} from '@/types/db-floor-plan-types'
import { formatCurrency } from '@/utils/currency'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView
} from '@gorhom/bottom-sheet'
import {
  ArrowLeftRight,
  CalendarClock,
  ChevronRight,
  Clock,
  DollarSign,
  LogOut,
  Printer,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  UtensilsCrossed,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { useUiScale } from '@/lib/uiScale'

interface TableContextSheetProps {
  table: FloorPlanObject | null
  onClose: () => void
  onSeatGuests: (table: FloorPlanObject) => void
  onSeatReservation?: (table: FloorPlanObject, reservation: Reservation) => void
  onNavigate: (tableId: string) => void
  onTransferServer?: (tableId: string, sessionId: string) => void
}

type ActionItem = {
  label: string
  icon: React.ReactNode
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  disabledMessage?: string
  dismissOnPress?: boolean
}

function getActionsForStatus (
  status: TableStatus | undefined,
  table: FloorPlanObject,
  onSeatGuests: (t: FloorPlanObject) => void,
  onNavigate: (id: string) => void,
  clearTableSession: (id: string) => void,
  finishCleaning: (id: string) => void,
  updateSessionStatus: (id: string, s: TableStatus) => void,
  reservation?: Reservation | null,
  onSeatReservation?: (t: FloorPlanObject, r: Reservation) => void,
  onMarkArrived?: (id: string) => void,
  onCancelReservation?: (id: string) => void
): ActionItem[] {
  const actions: ActionItem[] = []
  const effectiveStatus = status || 'available'

  switch (effectiveStatus) {
    case 'available':
      actions.push({
        label: 'Seat Guests',
        icon: <Users size={16} color={colors.teal} />,
        onPress: () => onSeatGuests(table),
        variant: 'primary'
      })
      break

    case 'reserved':
      if (reservation && onSeatReservation) {
        actions.push({
          label: 'Seat Reservation',
          icon: <Users size={16} color={colors.teal} />,
          onPress: () => onSeatReservation(table, reservation),
          variant: 'primary'
        })
      } else {
        actions.push({
          label: 'Seat Reservation',
          icon: <Users size={16} color={colors.teal} />,
          onPress: () => onSeatGuests(table),
          variant: 'primary'
        })
      }
      if (reservation && onMarkArrived && reservation.status !== 'arrived') {
        actions.push({
          label: 'Mark Arrived',
          icon: <UserCheck size={16} color={colors.success} />,
          onPress: () => onMarkArrived(reservation.id)
        })
      }
      actions.push({
        label: 'Seat Walk-In',
        icon: <Users size={16} color={colors.label} />,
        onPress: () => onSeatGuests(table)
      })
      if (reservation && onCancelReservation) {
        actions.push({
          label: 'Cancel Reservation',
          icon: <X size={16} color={colors.danger} />,
          onPress: () => onCancelReservation(reservation.id),
          variant: 'danger'
        })
      }
      break

    case 'seating':
    case 'seated':
    case 'ordering':
    case 'ordered':
    case 'served':
      actions.push({
        label: 'View Order',
        icon: <DollarSign size={16} color={colors.teal} />,
        onPress: () => onNavigate(table.id),
        variant: 'primary'
      })
      // if (effectiveStatus === 'served' || effectiveStatus === 'ordered') {
      //   actions.push({
      //     label: 'Present Check',
      //     icon: <ChevronUp size={16} color={colors.label} />,
      //     onPress: () => updateSessionStatus(table.id, 'check_presented')
      //   })
      // }
      break

    case 'check_presented':
      actions.push({
        label: 'View Order',
        icon: <DollarSign size={16} color={colors.teal} />,
        onPress: () => onNavigate(table.id),
        variant: 'primary'
      })
      actions.push({
        label: 'Take Payment',
        icon: <DollarSign size={16} color={colors.label} />,
        onPress: () => onNavigate(table.id)
      })
      break

    case 'paying':
      actions.push({
        label: 'View Order',
        icon: <DollarSign size={16} color={colors.teal} />,
        onPress: () => onNavigate(table.id),
        variant: 'primary'
      })
      break

    case 'paid':
      actions.push({
        label: 'View Order',
        icon: <DollarSign size={16} color={colors.teal} />,
        onPress: () => onNavigate(table.id),
        variant: 'primary'
      })
      actions.push({
        label: 'Close Table',
        icon: <LogOut size={16} color={colors.label} />,
        onPress: () => clearTableSession(table.id)
      })
      break

    case 'cleaning':
      actions.push({
        label: 'Mark Clean',
        icon: <Trash2 size={16} color={colors.label} />,
        onPress: () => finishCleaning(table.id)
      })
      break

    case 'blocked':
    case 'not_in_service':
      actions.push({
        label: 'Unblock Table',
        icon: <Unlock size={16} color={colors.label} />,
        onPress: () => updateSessionStatus(table.id, 'available')
      })
      break

    default:
      break
  }

  return actions
}

const STATUS_LABELS: Record<string, string> = {
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
  cleaning: 'Cleaning',
  not_in_service: 'Not in Service',
  blocked: 'Blocked'
}

const KITCHEN_STATUS_COLORS = {
  preparing: colors.warning,
  ready: colors.success,
  served: colors.info
} as const

const TableContextSheet: React.FC<TableContextSheetProps> = ({
  table,
  onClose,
  onSeatGuests,
  onSeatReservation,
  onNavigate,
  onTransferServer
}) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const snapPoints = useMemo(() => ['90%'], [])

  const clearTableSession = useFloorPlanStore(s => s.clearTableSession)
  const finishCleaning = useFloorPlanStore(s => s.finishCleaning)
  const updateSessionStatus = useFloorPlanStore(s => s.updateSessionStatus)
  const transferSession = useFloorPlanStore(s => s.transferSession)
  const refreshTableSessions = useFloorPlanStore(s => s.refreshTableSessions)
  const floorTables = useFloorPlanStore(s => s.tables)
  const sessionsByTableId = useTableSessionStore(s => s.sessions)
  const showToast = useToastStore(s => s.show)
  const { isOnline } = useNetworkStatus()
  const [isTransferPickerOpen, setTransferPickerOpen] = useState(false)
  const [isTransferPickerLoading, setTransferPickerLoading] = useState(false)
  const [transferSourceTable, setTransferSourceTable] =
    useState<FloorPlanObject | null>(null)
  const [transferSourceSessionId, setTransferSourceSessionId] = useState<
    string | null
  >(null)
  const [transferringTableId, setTransferringTableId] = useState<string | null>(
    null
  )

  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  useEffect(() => {
    if (table) sheetRef.current?.present()
    else sheetRef.current?.dismiss()
  }, [table])

  const handleDismiss = useCallback(() => onClose(), [onClose])

  const liveSession = useTableSessionStore(s =>
    table ? s.sessions[table.id] : undefined
  )
  const sessionStoreInitialized = useTableSessionStore(s => s.isInitialized)
  // Once isInitialized, useTableSessionStore is authoritative — don't fall
  // back to the stale table.session prop (the floor plan store can retain
  // a paid session locally after a Clear that wiped useTableSessionStore,
  // which surfaces as a stuck-Paid sheet). Matches DraggableTable's pattern.
  const status =
    (sessionStoreInitialized
      ? liveSession?.status
      : (liveSession?.status ?? table?.session?.status)) || 'available'
  const tableColor = TABLE_STATUS_COLORS[status] || colors.teal

  const resolvedOrderId = useOrderStore(s => {
    const oid = liveSession?.order_id
    // Treat cleaning as "no live order context" so kitchen summary, items
    // preview, totals, and server line don't render stale data if a realtime
    // SYNC briefly restores the old order_id on a cleaning session.
    if (!oid || status === 'cleaning') return null
    return s.dbOrderIdIndex[oid] ?? (s.ordersById[oid] ? oid : null)
  })
  const order = useOrderStore(s =>
    resolvedOrderId ? s.ordersById[resolvedOrderId] : null
  )
  const currentStationId = useOrderStore(s => s.currentStationId)
  const totals = useOrderTotals(resolvedOrderId)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const upcomingReservation = useReservationStore(
    s => table ? (s.nextReservationByTableId[table.id] ?? null) : null
  )
  const isOccupied = !!order
  const isForeignStationSession = isOrderReadOnly(order, currentStationId)
  const foreignStationLabel = order?.station_name?.trim() || 'another station'
  const { minutes: minutesSeated } = useSessionDuration(table?.id ?? '')


  const handleMarkArrived = useCallback(async (reservationId: string) => {
    await useReservationStore.getState().updateStatus(reservationId, 'arrived')
  }, [])

  const handleCancelReservation = useCallback(async (reservationId: string) => {
    await useReservationStore.getState().cancelReservation(reservationId)
  }, [])

  const availableTransferTables = useMemo(() => {
    const sourceTable = transferSourceTable ?? table
    if (!sourceTable) return []

    return floorTables
      .filter(candidate => {
        if (candidate.id === sourceTable.id) return false
        if (candidate.is_active === false || candidate.is_visible === false) {
          return false
        }
        if (!['table', 'booth'].includes(candidate.category)) return false
        if (sessionsByTableId[candidate.id]) return false
        if (candidate.session) return false
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [floorTables, sessionsByTableId, table, transferSourceTable])

  const handleOpenTransferPicker = useCallback(() => {
    if (!table || !liveSession?.id) return
    if (!isOnline) {
      showToast({
        title: 'Offline',
        message:
          'Table transfer requires a live connection to validate availability.',
        type: 'warning'
      })
      return
    }

    setTransferSourceTable(table)
    setTransferSourceSessionId(liveSession.id)
    setTransferPickerOpen(true)
    setTransferPickerLoading(true)
    refreshTableSessions()
      .catch(error => {
        console.error('[TableContextSheet] Refresh before transfer failed', {
          error,
          sourceTableId: table?.id ?? null
        })
      })
      .finally(() => setTransferPickerLoading(false))
  }, [isOnline, liveSession?.id, refreshTableSessions, showToast, table])

  const handleTransferTable = useCallback(
    async (targetTable: FloorPlanObject) => {
      if (!transferSourceSessionId || !transferSourceTable) return

      setTransferringTableId(targetTable.id)
      try {
        await refreshTableSessions()
        const targetSession =
          useTableSessionStore.getState().sessions[targetTable.id]
        if (targetSession && targetSession.id !== transferSourceSessionId) {
          showToast({
            title: 'Table Occupied',
            message: `${targetTable.name} already has an active session.`,
            type: 'warning'
          })
          return
        }

        await transferSession(transferSourceSessionId, [targetTable.id])
        setTransferPickerOpen(false)
        setTransferSourceTable(null)
        setTransferSourceSessionId(null)
        showToast({
          title: 'Table Transferred',
          message: `${transferSourceTable.name} moved to ${targetTable.name}.`,
          type: 'success'
        })
      } catch (error) {
        console.error('[TableContextSheet] Transfer table failed', {
          error,
          sessionId: transferSourceSessionId,
          sourceTableId: transferSourceTable.id,
          targetTableId: targetTable.id
        })
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' &&
              error !== null &&
              'message' in error &&
              typeof error.message === 'string'
            ? error.message
            : 'Could not transfer table.'
        showToast({
          title: 'Transfer Failed',
          message,
          type: 'error'
        })
      } finally {
        setTransferringTableId(null)
      }
    },
    [
      refreshTableSessions,
      showToast,
      transferSession,
      transferSourceSessionId,
      transferSourceTable
    ]
  )

  const handleCloseTransferPicker = useCallback(() => {
    setTransferPickerOpen(false)
    setTransferPickerLoading(false)
    setTransferringTableId(null)
    setTransferSourceTable(null)
    setTransferSourceSessionId(null)
  }, [])

  const kitchenSummary = useMemo(() => {
    if (!order?.items?.length) return null
    const counts = { preparing: 0, ready: 0, served: 0 }
    for (const item of order.items) {
      if (item.is_voided) continue
      const s = getEffectiveItemStatus(item)
      if (s === 'preparing') counts.preparing++
      else if (s === 'ready') counts.ready++
      else if (s === 'served') counts.served++
    }
    return counts.preparing || counts.ready || counts.served ? counts : null
  }, [order?.items])

  const itemsPreview = useMemo(() => {
    if (!order?.items?.length) return null
    const nonVoided = order.items.filter(i => !i.is_voided)
    if (!nonVoided.length) return null
    return { items: nonVoided.slice(0, 4), remaining: nonVoided.length - 4 }
  }, [order?.items])

  const actions = useMemo(() => {
    if (!table) return []

    const baseActions = getActionsForStatus(
      status as TableStatus,
      table,
      onSeatGuests,
      onNavigate,
      id => clearTableSession(id),
      id => finishCleaning(id),
      (id, s) => updateSessionStatus(id, s),
      upcomingReservation,
      onSeatReservation,
      handleMarkArrived,
      handleCancelReservation
    )

    const occupiedForTransfer = new Set([
      'seated',
      'seating',
      'ordering',
      'ordered',
      'served',
      'check_presented'
    ])
    if (
      liveSession?.id &&
      occupiedForTransfer.has(status)
    ) {
      baseActions.push({
        label: 'Transfer Table',
        icon: <ArrowLeftRight size={16} color={colors.label} />,
        onPress: handleOpenTransferPicker,
        disabled: !isOnline,
        disabledMessage:
          'Table transfer requires a live connection to validate availability.'
      })
    }

    if (
      onTransferServer &&
      liveSession?.id &&
      occupiedForTransfer.has(status)
    ) {
      baseActions.push({
        label: 'Transfer Server',
        icon: <UserCheck size={16} color={colors.label} />,
        onPress: () => onTransferServer(table.id, liveSession.id)
      })
    }

    if (order && selectedStore) {
      if (['ordered', 'served', 'check_presented', 'paid'].includes(status)) {
        baseActions.push({
          label: 'Print Receipt',
          icon: <Printer size={16} color={colors.label} />,
          onPress: () => {
            // Pre-payment receipts need the projected service charge folded
            // in. buildReceiptTemplateData recomputes SC from the rule + a
            // (seatCount → session.party_size) lookup, which misses the
            // guest_count fallback that useOrderTotals already covers — so
            // a table seated without per-seat or session.party_size data
            // would print without SC even though the UI shows it. Override
            // via the manual-SC field so the print snapshot matches what the
            // user is looking at on screen.
            const sc = totals?.serviceCharge ?? 0
            const printOrder =
              sc > 0
                ? {
                    ...order,
                    service_charge: sc,
                    service_charge_name:
                      totals?.serviceChargeName ?? order.service_charge_name,
                    service_charge_rate:
                      totals?.serviceChargeRate ?? order.service_charge_rate,
                    service_charge_is_manual: true
                  }
                : order
            PrinterService.printReceipt(printOrder, selectedStore)
          }
        })
      }
      if (['seated', 'ordering', 'ordered'].includes(status)) {
        baseActions.push({
          label: 'Print Kitchen Ticket',
          icon: <UtensilsCrossed size={16} color={colors.label} />,
          onPress: () => {
            const nonVoidedItems = order.items.filter(i => !i.is_voided)
            PrinterService.printKitchenTickets(
              order,
              nonVoidedItems,
              selectedStore,
              { forceGroupBySeat: true }
            )
          }
        })
      }
    }

    if (isForeignStationSession) {
      return baseActions.map(action =>
        action.label === 'Close Table'
          ? {
              ...action,
              disabled: true
            }
          : action
      )
    }

    return baseActions
  }, [
    table,
    status,
    onSeatGuests,
    onSeatReservation,
    onNavigate,
    clearTableSession,
    finishCleaning,
    updateSessionStatus,
    order,
    isForeignStationSession,
    selectedStore,
    liveSession,
    onTransferServer,
    upcomingReservation,
    handleMarkArrived,
    handleCancelReservation,
    handleOpenTransferPicker,
    isOnline,
    totals
  ])

  const partySize = liveSession?.party_size ?? table?.session?.party_size

  // upcomingReservation is now read from the precomputed store map (line 262)

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        onDismiss={handleDismiss}
        backdropComponent={props => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior='close'
          />
        )}
        backgroundStyle={bottomSheetTheme.backgroundStyle}
        handleIndicatorStyle={bottomSheetTheme.handleIndicatorStyle}
        enablePanDownToClose
      >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: s(24) }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: s(20),
            paddingVertical: s(16),
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            gap: s(14)
          }}
        >
          {/* Color accent box */}
          <View
            style={{
              width: s(32),
              height: s(32),
              borderRadius: s(8),
              backgroundColor: tableColor + '18',
              borderWidth: 1,
              borderColor: tableColor + '40',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <View
              style={{
                width: s(7),
                height: s(7),
                borderRadius: s(4),
                backgroundColor: tableColor
              }}
            />
          </View>

          {/* Name + status */}
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: s(14), fontWeight: '700', color: colors.heading }}
            >
              {table?.name}
            </Text>
            <Text
              style={{
                fontSize: s(11),
                color: tableColor,
                fontWeight: '600',
                marginTop: s(1)
              }}
            >
              {STATUS_LABELS[status] ?? status}
            </Text>
          </View>

          {/* Meta pills */}
          <View style={{ flexDirection: 'row', gap: s(6) }}>
            {partySize ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(4),
                  backgroundColor: colors.card,
                  borderRadius: s(8),
                  paddingHorizontal: s(8),
                  paddingVertical: s(4),
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Users size={s(11)} color={colors.muted} />
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.label,
                    fontWeight: '600'
                  }}
                >
                  {partySize}
                </Text>
              </View>
            ) : null}
            {minutesSeated > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(4),
                  backgroundColor: colors.card,
                  borderRadius: s(8),
                  paddingHorizontal: s(8),
                  paddingVertical: s(4),
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Clock size={s(11)} color={colors.muted} />
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.label,
                    fontWeight: '600'
                  }}
                >
                  {minutesSeated}m
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Reservation banner — shown when table is reserved OR available with upcoming reservation */}
        {upcomingReservation && !isOccupied
          ? (() => {
              const parsedDirect = new Date(
                upcomingReservation.reservation_time
              )
              const parsedCombined = upcomingReservation.reservation_date
                ? new Date(
                    `${upcomingReservation.reservation_date}T${upcomingReservation.reservation_time}`
                  )
                : null
              const resTime = Number.isFinite(parsedDirect.getTime())
                ? parsedDirect
                : parsedCombined && Number.isFinite(parsedCombined.getTime())
                ? parsedCombined
                : null

              const minutesUntil = resTime
                ? Math.round((resTime.getTime() - Date.now()) / 60000)
                : null
              const timeStr = resTime
                ? resTime.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit'
                  })
                : 'Time TBD'
              const isSoon =
                minutesUntil !== null && minutesUntil <= 60 && minutesUntil >= 0

              return (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: s(10),
                    paddingHorizontal: s(16),
                    paddingVertical: s(10),
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: colors.info + '0C'
                  }}
                >
                  <View
                    style={{
                      width: s(30),
                      height: s(30),
                      borderRadius: s(8),
                      backgroundColor: colors.info + '18',
                      borderWidth: 1,
                      borderColor: colors.info + '40',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <CalendarClock size={s(14)} color={colors.info} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: '700',
                        color: colors.info
                      }}
                    >
                      {upcomingReservation.party_name}
                      {upcomingReservation.is_vip ? '  ★' : ''}
                    </Text>
                    <Text
                      style={{
                        fontSize: s(11),
                        color: colors.label,
                        marginTop: s(1)
                      }}
                    >
                      {upcomingReservation.party_size} guests · {timeStr}
                      {isSoon && minutesUntil !== null
                        ? `  (${minutesUntil}m)`
                        : ''}
                    </Text>
                    {upcomingReservation.notes ? (
                      <Text
                        style={{
                          fontSize: s(10),
                          color: colors.muted,
                          marginTop: s(1)
                        }}
                        numberOfLines={1}
                      >
                        {upcomingReservation.notes}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={{
                      paddingHorizontal: s(7),
                      paddingVertical: s(3),
                      borderRadius: s(5),
                      backgroundColor: isSoon
                        ? colors.warning + '20'
                        : colors.info + '20',
                      borderWidth: 1,
                      borderColor: isSoon
                        ? colors.warning + '50'
                        : colors.info + '40'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        fontWeight: '700',
                        color: isSoon ? colors.warning : colors.info
                      }}
                    >
                      {isSoon ? 'Soon' : 'Reserved'}
                    </Text>
                  </View>
                </View>
              )
            })()
          : null}

        {/* Financial summary */}
        {isOccupied && totals ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: s(16),
              paddingVertical: s(10),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              gap: s(8)
            }}
          >
            <Text
              style={{
                fontSize: s(17),
                fontWeight: '700',
                color: colors.heading,
                flex: 1
              }}
            >
              {formatCurrency(totals.total)}
            </Text>
            <Text style={{ fontSize: s(11), color: colors.muted }}>
              {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'}
            </Text>
            {order?.paid_status ? (
              <View
                style={{
                  paddingHorizontal: s(6),
                  paddingVertical: s(2),
                  borderRadius: s(5),
                  backgroundColor:
                    order.paid_status === 'Paid'
                      ? colors.success + '20'
                      : order.paid_status === 'Partial'
                      ? colors.warning + '20'
                      : colors.danger + '20'
                }}
              >
                <Text
                  style={{
                    fontSize: s(10),
                    fontWeight: '700',
                    color:
                      order.paid_status === 'Paid'
                        ? colors.success
                        : order.paid_status === 'Partial'
                        ? colors.warning
                        : colors.danger
                  }}
                >
                  {order.paid_status}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Kitchen status dots */}
        {isOccupied && kitchenSummary ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(12),
              paddingHorizontal: s(16),
              paddingVertical: s(8),
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            {(['preparing', 'ready', 'served'] as const).map(k =>
              kitchenSummary[k] > 0 ? (
                <View
                  key={k}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: s(5) }}
                >
                  <View
                    style={{
                      width: s(6),
                      height: s(6),
                      borderRadius: s(3),
                      backgroundColor: KITCHEN_STATUS_COLORS[k]
                    }}
                  />
                  <Text style={{ fontSize: s(11), color: colors.label }}>
                    {kitchenSummary[k]} {k}
                  </Text>
                </View>
              ) : null
            )}
          </View>
        ) : null}

        {/* Items preview */}
        {isOccupied && itemsPreview ? (
          <View
            style={{
              marginHorizontal: s(12),
              marginTop: s(8),
              backgroundColor: colors.card,
              borderRadius: s(8),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            {itemsPreview.items.map((item, idx) => {
              const itemStatus = getEffectiveItemStatus(item)
              const statusColor =
                KITCHEN_STATUS_COLORS[
                  itemStatus as keyof typeof KITCHEN_STATUS_COLORS
                ]
              const isLast =
                idx === itemsPreview.items.length - 1 &&
                itemsPreview.remaining <= 0
              return (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: s(10),
                    paddingVertical: s(6),
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: colors.border + '50',
                    gap: s(7)
                  }}
                >
                  <View
                    style={{
                      width: s(5),
                      height: s(5),
                      borderRadius: s(3),
                      backgroundColor: statusColor ?? colors.border
                    }}
                  />
                  <Text
                    style={{ fontSize: s(11), color: colors.label, flex: 1 }}
                    numberOfLines={1}
                  >
                    {item.quantity}× {item.name}
                  </Text>
                  <Text style={{ fontSize: s(10), color: colors.muted }}>
                    {formatCurrency(item.price * item.quantity)}
                  </Text>
                </View>
              )
            })}
            {itemsPreview.remaining > 0 && (
              <View style={{ paddingHorizontal: s(10), paddingVertical: s(5) }}>
                <Text style={{ fontSize: s(10), color: colors.muted }}>
                  +{itemsPreview.remaining} more
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {isForeignStationSession ? (
          <View
            style={{
              marginHorizontal: s(12),
              marginTop: s(10),
              paddingHorizontal: s(12),
              paddingVertical: s(10),
              borderRadius: s(8),
              borderWidth: 1,
              backgroundColor: colors.warning + '12',
              borderColor: colors.warning + '40'
            }}
          >
            <Text
              style={{
                fontSize: s(11),
                fontWeight: '700',
                color: colors.warning
              }}
            >
              Table locked by {foreignStationLabel}
            </Text>
            <Text
              style={{
                fontSize: s(10),
                color: colors.label,
                marginTop: s(2)
              }}
            >
              Close Table is disabled on this station.
            </Text>
          </View>
        ) : null}

        {/* Server */}
        {order?.server_name ? (
          <Text
            style={{
              fontSize: s(11),
              color: colors.muted,
              paddingHorizontal: s(16),
              marginTop: s(6)
            }}
          >
            Server:{' '}
            <Text style={{ color: colors.label, fontWeight: '600' }}>
              {order.server_name}
            </Text>
          </Text>
        ) : null}

        {/* Actions */}
        <View style={{ paddingHorizontal: s(12), marginTop: s(10), gap: s(5) }}>
          {actions.map((action, idx) => {
            const isPrimary = action.variant === 'primary'
            const isDanger = action.variant === 'danger'
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => {
                  if (action.disabled) {
                    if (action.disabledMessage) {
                      showToast({
                        title: 'Offline',
                        message: action.disabledMessage,
                        type: 'warning'
                      })
                    }
                    return
                  }
                  action.onPress()
                  if (action.dismissOnPress !== false) {
                    sheetRef.current?.dismiss()
                  }
                }}
                disabled={action.disabled}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: s(12),
                  paddingVertical: s(10),
                  borderRadius: s(8),
                  borderWidth: 1,
                  backgroundColor: isPrimary
                    ? colors.teal + '15'
                    : isDanger
                    ? colors.danger + '12'
                    : colors.card,
                  borderColor: isPrimary
                    ? colors.teal + '50'
                    : isDanger
                    ? colors.danger + '40'
                    : colors.border,
                  gap: s(8),
                  opacity: action.disabled ? 0.45 : 1
                }}
              >
                {action.icon}
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: '600',
                    flex: 1,
                    color: isPrimary
                      ? colors.teal
                      : isDanger
                      ? colors.danger
                      : colors.heading
                  }}
                >
                  {action.label}
                </Text>
                {isPrimary && (
                  <ChevronRight size={s(12)} color={colors.teal + '80'} />
                )}
              </TouchableOpacity>
            )
          })}
          {actions.length === 0 && (
            <Text
              style={{
                fontSize: s(12),
                color: colors.muted,
                textAlign: 'center',
                paddingVertical: s(12)
              }}
            >
              No actions available
            </Text>
          )}
        </View>
      </BottomSheetScrollView>
      </BottomSheetModal>

      <Modal
        visible={isTransferPickerOpen}
        transparent
        animationType='fade'
        statusBarTranslucent
        onRequestClose={handleCloseTransferPicker}
      >
        <Pressable
          onPress={handleCloseTransferPicker}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: s(18)
          }}
        >
          <Pressable
            onPress={event => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: s(420),
              maxHeight: '78%',
              borderRadius: s(8),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: s(16),
                paddingVertical: s(14),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                gap: s(10)
              }}
            >
              <ArrowLeftRight size={s(17)} color={colors.teal} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: s(14),
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Transfer Table
                </Text>
                <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(1) }}>
                  Select an available table
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseTransferPicker}
                hitSlop={s(10)}
              >
                <X size={s(18)} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: s(10), gap: s(6) }}>
              {isTransferPickerLoading ? (
                <View
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: s(18),
                    gap: s(8)
                  }}
                >
                  <ActivityIndicator size='small' color={colors.teal} />
                  <Text style={{ fontSize: s(12), color: colors.muted }}>
                    Checking tables...
                  </Text>
                </View>
              ) : null}

              {!isTransferPickerLoading && availableTransferTables.map(targetTable => {
                const isTransferring = transferringTableId === targetTable.id
                return (
                  <TouchableOpacity
                    key={targetTable.id}
                    onPress={() => handleTransferTable(targetTable)}
                    disabled={!!transferringTableId}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: s(12),
                      paddingVertical: s(11),
                      borderRadius: s(8),
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      gap: s(10),
                      opacity: transferringTableId && !isTransferring ? 0.45 : 1
                    }}
                  >
                    <View
                      style={{
                        width: s(30),
                        height: s(30),
                        borderRadius: s(8),
                        backgroundColor: colors.success + '16',
                        borderWidth: 1,
                        borderColor: colors.success + '40',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <View
                        style={{
                          width: s(7),
                          height: s(7),
                          borderRadius: s(4),
                          backgroundColor: colors.success
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: s(13),
                          fontWeight: '700',
                          color: colors.heading
                        }}
                      >
                        {targetTable.name}
                      </Text>
                      <Text style={{ fontSize: s(11), color: colors.muted }}>
                        {targetTable.capacity
                          ? `${targetTable.capacity} seats`
                          : 'Available'}
                      </Text>
                    </View>
                    {isTransferring ? (
                      <ActivityIndicator size='small' color={colors.teal} />
                    ) : (
                      <ChevronRight size={s(14)} color={colors.muted} />
                    )}
                  </TouchableOpacity>
                )
              })}

              {!isTransferPickerLoading && availableTransferTables.length === 0 ? (
                <Text
                  style={{
                    fontSize: s(12),
                    color: colors.muted,
                    textAlign: 'center',
                    paddingVertical: s(18)
                  }}
                >
                  No available tables
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

export default TableContextSheet
