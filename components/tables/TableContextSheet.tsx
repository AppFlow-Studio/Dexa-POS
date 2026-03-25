import { useSessionDuration } from '@/hooks/useSessionDuration'
import { getEffectiveItemStatus } from '@/lib/kitchenStatusUtils'
import { bottomSheetTheme, colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { PrinterService } from '@/services/printing/PrinterService'
import { useOrderTotals } from '@/stores/selectors/orderSelectors'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { FloorPlanObject, TableStatus } from '@/types/db-floor-plan-types'
import { formatCurrency } from '@/utils/currency'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView
} from '@gorhom/bottom-sheet'
import {
  ArrowLeftRight,
  ChevronRight,
  ChevronUp,
  Clock,
  DollarSign,
  LogOut,
  Printer,
  Trash2,
  Unlock,
  Users,
  UtensilsCrossed
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface TableContextSheetProps {
  table: FloorPlanObject | null;
  onClose: () => void;
  onSeatGuests: (table: FloorPlanObject) => void;
  onNavigate: (tableId: string) => void;
  onTransferServer?: (tableId: string, sessionId: string) => void;
}

type ActionItem = {
  label: string
  icon: React.ReactNode
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
}

function getActionsForStatus(
  status: TableStatus | undefined,
  table: FloorPlanObject,
  onSeatGuests: (t: FloorPlanObject) => void,
  onNavigate: (id: string) => void,
  clearTableSession: (id: string) => void,
  finishCleaning: (id: string) => void,
  updateSessionStatus: (id: string, s: TableStatus) => void
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
      actions.push({
        label: 'Seat Reservation',
        icon: <Users size={16} color={colors.teal} />,
        onPress: () => onSeatGuests(table),
        variant: 'primary'
      })
      actions.push({
        label: 'Seat Walk-In',
        icon: <Users size={16} color={colors.label} />,
        onPress: () => onSeatGuests(table)
      })
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
      if (effectiveStatus === 'served' || effectiveStatus === 'ordered') {
        actions.push({
          label: 'Present Check',
          icon: <ChevronUp size={16} color={colors.label} />,
          onPress: () => updateSessionStatus(table.id, 'check_presented')
        })
      }
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
  blocked: 'Blocked',
}

const KITCHEN_STATUS_COLORS = {
  preparing: colors.warning,
  ready: colors.success,
  served: colors.info,
} as const

const TableContextSheet: React.FC<TableContextSheetProps> = ({
  table,
  onClose,
  onSeatGuests,
  onNavigate,
  onTransferServer,
}) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const snapPoints = useMemo(() => ['90%'], [])

  const clearTableSession = useFloorPlanStore(s => s.clearTableSession)
  const finishCleaning = useFloorPlanStore(s => s.finishCleaning)
  const updateSessionStatus = useFloorPlanStore(s => s.updateSessionStatus)

  useEffect(() => {
    if (table) sheetRef.current?.present()
    else sheetRef.current?.dismiss()
  }, [table])

  const handleDismiss = useCallback(() => onClose(), [onClose])

  const liveSession = useTableSessionStore(s =>
    table ? s.sessions[table.id] : undefined
  )
  const status = (liveSession?.status ?? table?.session?.status) || 'available'
  const tableColor = TABLE_STATUS_COLORS[status] || colors.teal

  const resolvedOrderId = useOrderStore(s => {
    const oid = liveSession?.order_id
    if (!oid) return null
    return s.dbOrderIdIndex[oid] ?? (s.ordersById[oid] ? oid : null)
  })
  const order = useOrderStore(s =>
    resolvedOrderId ? s.ordersById[resolvedOrderId] : null
  )
  const totals = useOrderTotals(resolvedOrderId)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const isOccupied = !!order
  const { minutes: minutesSeated } = useSessionDuration(table?.id ?? '')

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
      (id, s) => updateSessionStatus(id, s)
    )

    const occupiedForTransfer = new Set(['seated', 'seating', 'ordering', 'ordered', 'served', 'check_presented'])
    if (onTransferServer && liveSession?.id && occupiedForTransfer.has(status)) {
      baseActions.push({
        label: 'Transfer Server',
        icon: <ArrowLeftRight size={16} color={colors.label} />,
        onPress: () => onTransferServer(table.id, liveSession.id),
      })
    }

    if (order && selectedStore) {
      if (['ordered', 'served', 'check_presented', 'paid'].includes(status)) {
        baseActions.push({
          label: 'Print Receipt',
          icon: <Printer size={16} color={colors.label} />,
          onPress: () => PrinterService.printReceipt(order, selectedStore),
        })
      }
      if (['seated', 'ordering', 'ordered'].includes(status)) {
        baseActions.push({
          label: 'Print Kitchen Ticket',
          icon: <UtensilsCrossed size={16} color={colors.label} />,
          onPress: () => {
            const nonVoidedItems = order.items.filter(i => !i.is_voided)
            PrinterService.printKitchenTickets(order, nonVoidedItems, selectedStore)
          },
        })
      }
    }

    return baseActions
  }, [table, status, onSeatGuests, onNavigate, clearTableSession, finishCleaning, updateSessionStatus, order, selectedStore, liveSession, onTransferServer])

  const partySize = liveSession?.party_size ?? table?.session?.party_size

  return (
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
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>

        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 14,
        }}>
          {/* Color accent box */}
          <View style={{
            width: 32, height: 32, borderRadius: 8,
            backgroundColor: tableColor + '18',
            borderWidth: 1, borderColor: tableColor + '40',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tableColor }} />
          </View>

          {/* Name + status */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>
              {table?.name}
            </Text>
            <Text style={{ fontSize: 11, color: tableColor, fontWeight: '600', marginTop: 1 }}>
              {STATUS_LABELS[status] ?? status}
            </Text>
          </View>

          {/* Meta pills */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {partySize ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: colors.card, borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 4,
                borderWidth: 1, borderColor: colors.border,
              }}>
                <Users size={11} color={colors.muted} />
                <Text style={{ fontSize: 11, color: colors.label, fontWeight: '600' }}>{partySize}</Text>
              </View>
            ) : null}
            {minutesSeated > 0 ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: colors.card, borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 4,
                borderWidth: 1, borderColor: colors.border,
              }}>
                <Clock size={11} color={colors.muted} />
                <Text style={{ fontSize: 11, color: colors.label, fontWeight: '600' }}>{minutesSeated}m</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Financial summary */}
        {isOccupied && totals ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 10,
            borderBottomWidth: 1, borderBottomColor: colors.border,
            gap: 8,
          }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.heading, flex: 1 }}>
              {formatCurrency(totals.total)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'}
            </Text>
            {order?.paid_status ? (
              <View style={{
                paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
                backgroundColor: order.paid_status === 'Paid' ? colors.success + '20' : order.paid_status === 'Partial' ? colors.warning + '20' : colors.danger + '20',
              }}>
                <Text style={{
                  fontSize: 10, fontWeight: '700',
                  color: order.paid_status === 'Paid' ? colors.success : order.paid_status === 'Partial' ? colors.warning : colors.danger,
                }}>
                  {order.paid_status}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Kitchen status dots */}
        {isOccupied && kitchenSummary ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 16, paddingVertical: 8,
            borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            {(['preparing', 'ready', 'served'] as const).map(k =>
              kitchenSummary[k] > 0 ? (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: KITCHEN_STATUS_COLORS[k] }} />
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    {kitchenSummary[k]} {k}
                  </Text>
                </View>
              ) : null
            )}
          </View>
        ) : null}

        {/* Items preview */}
        {isOccupied && itemsPreview ? (
          <View style={{
            marginHorizontal: 12, marginTop: 8,
            backgroundColor: colors.card,
            borderRadius: 8, borderWidth: 1, borderColor: colors.border,
            overflow: 'hidden',
          }}>
            {itemsPreview.items.map((item, idx) => {
              const itemStatus = getEffectiveItemStatus(item)
              const statusColor = KITCHEN_STATUS_COLORS[itemStatus as keyof typeof KITCHEN_STATUS_COLORS]
              const isLast = idx === itemsPreview.items.length - 1 && itemsPreview.remaining <= 0
              return (
                <View key={idx} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 10, paddingVertical: 6,
                  borderBottomWidth: isLast ? 0 : 1,
                  borderBottomColor: colors.border + '50',
                  gap: 7,
                }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: statusColor ?? colors.border }} />
                  <Text style={{ fontSize: 11, color: colors.label, flex: 1 }} numberOfLines={1}>
                    {item.quantity}× {item.name}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    {formatCurrency(item.price * item.quantity)}
                  </Text>
                </View>
              )
            })}
            {itemsPreview.remaining > 0 && (
              <View style={{ paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 10, color: colors.muted }}>
                  +{itemsPreview.remaining} more
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Server */}
        {order?.server_name ? (
          <Text style={{ fontSize: 11, color: colors.muted, paddingHorizontal: 16, marginTop: 6 }}>
            Server: <Text style={{ color: colors.label, fontWeight: '600' }}>{order.server_name}</Text>
          </Text>
        ) : null}

        {/* Actions */}
        <View style={{ paddingHorizontal: 12, marginTop: 10, gap: 5 }}>
          {actions.map((action, idx) => {
            const isPrimary = action.variant === 'primary'
            const isDanger = action.variant === 'danger'
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => { action.onPress(); sheetRef.current?.dismiss() }}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderRadius: 8, borderWidth: 1,
                  backgroundColor: isPrimary ? colors.teal + '15' : isDanger ? colors.danger + '12' : colors.card,
                  borderColor: isPrimary ? colors.teal + '50' : isDanger ? colors.danger + '40' : colors.border,
                  gap: 8,
                }}
              >
                {action.icon}
                <Text style={{
                  fontSize: 12, fontWeight: '600', flex: 1,
                  color: isPrimary ? colors.teal : isDanger ? colors.danger : colors.heading,
                }}>
                  {action.label}
                </Text>
                {isPrimary && <ChevronRight size={12} color={colors.teal + '80'} />}
              </TouchableOpacity>
            )
          })}
          {actions.length === 0 && (
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', paddingVertical: 12 }}>
              No actions available
            </Text>
          )}
        </View>

      </BottomSheetScrollView>
    </BottomSheetModal>
  )
}

export default TableContextSheet
