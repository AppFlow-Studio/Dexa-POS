import { deriveEffectivePaidStatus } from '@/lib/deriveEffectivePaidStatus'
import { isOrderReadOnly } from '@/lib/orderAccessControl'
import { colors } from '@/lib/theme'
import { toastService } from '@/lib/toastService'
import { OrderProfile } from '@/lib/types'
import { useWasOrderRecentlyUpdated } from '@/stores/useConflictStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { formatOrderStatus, formatPaymentStatus } from '@/utils/orderStatusHelpers'
import {
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Eye,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Repeat2,
  RotateCcw,
  ShoppingBag
} from 'lucide-react-native'
import React, { useCallback, useMemo, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { PanGestureHandler } from 'react-native-gesture-handler'
import Popover from 'react-native-popover-view'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import DeliveryPlatformBadge from './DeliveryPlatformBadge'

interface OrderBadgeProps {
  order: OrderProfile
  onMarkDone: () => void
  onViewItems: () => void
  onRetrieve: () => void
  onReopenCheck?: () => void
  onPrintReceipt?: () => void
}

// ============================================================================
// DOT-CHIP COLOR HELPERS
// ============================================================================
const getOrderDotColor = (
  status: string,
  refundState?: { isFullyRefunded: boolean; isPartiallyRefunded: boolean }
): string => {
  if (refundState?.isFullyRefunded) return colors.orderCancelled
  if (refundState?.isPartiallyRefunded) return colors.paymentPartialRefund
  switch (status) {
    case 'sent_to_kitchen':
      return colors.orderSentToKitchen
    case 'preparing':
      return colors.orderPreparing
    case 'ready':
      return colors.orderReady
    case 'completed':
      return colors.orderCompleted
    case 'cancelled':
    case 'void':
      return colors.orderCancelled
    default:
      return colors.orderDefault
  }
}

// ============================================================================
// STATUS PILL HELPER — returns style for the popover header status pill
// ============================================================================
const getStatusPillStyle = (
  paidStatus: string,
  orderStatus: string,
  refundState: { isFullyRefunded: boolean; isPartiallyRefunded: boolean }
): { bg: string; textColor: string; label: string } => {
  if (refundState.isFullyRefunded)
    return {
      bg: 'rgba(239,68,71,0.2)',
      textColor: colors.danger,
      label: 'Refunded'
    }
  if (refundState.isPartiallyRefunded)
    return {
      bg: 'rgba(249,115,22,0.2)',
      textColor: colors.paymentPartialRefund,
      label: 'Partial Refund'
    }
  if (paidStatus === 'Paid')
    return {
      bg: 'rgba(34,197,94,0.15)',
      textColor: colors.paymentPaid,
      label: 'Paid'
    }
  if (paidStatus === 'Partial')
    return {
      bg: 'rgba(249,115,22,0.15)',
      textColor: colors.paymentPartial,
      label: 'Partial'
    }
  if (orderStatus === 'preparing' || orderStatus === 'sent_to_kitchen')
    return {
      bg: 'rgba(251,191,36,0.15)',
      textColor: colors.warning,
      label: formatOrderStatus(orderStatus)
    }
  if (orderStatus === 'ready')
    return {
      bg: 'rgba(34,197,94,0.15)',
      textColor: colors.success,
      label: 'Ready'
    }
  return {
    bg: 'rgba(156,163,175,0.15)',
    textColor: colors.muted,
    label: formatPaymentStatus('Pending')
  }
}

// ============================================================================
// LAZY POPOVER CONTENT - Only renders when popover is visible
// ============================================================================
interface PopoverContentProps {
  order: OrderProfile
  currentStationId: string | null
  onMarkDone: () => void
  onViewItems: () => void
  onRetrieve: () => void
  onReopenCheck?: () => void
  onPrintReceipt?: () => void
  onClose: () => void
}

const PopoverContent = React.memo<PopoverContentProps>(
  ({
    order,
    currentStationId,
    onMarkDone,
    onViewItems,
    onRetrieve,
    onReopenCheck,
    onPrintReceipt,
    onClose
  }) => {
    const effectivePaidStatus = useMemo(
      () => deriveEffectivePaidStatus(order) ?? order.paid_status,
      [order]
    )

    // Memoize refund status
    const refundStatus = useMemo(() => {
      const payments = order.payments || []
      if (payments.length === 0) {
        return {
          hasRefund: false,
          isFullyRefunded: false,
          isPartiallyRefunded: false,
          totalRefunded: 0
        }
      }

      const totalRefunded = payments.reduce(
        (sum, p) => sum + (p.refundedAmount ?? 0),
        0
      )
      const hasRefund = totalRefunded > 0
      const isFullyRefunded =
        payments.length > 0 &&
        payments.every(p => (p.refundedAmount ?? 0) >= (p.amount ?? 0))
      const isPartiallyRefunded = hasRefund && !isFullyRefunded

      return { hasRefund, isFullyRefunded, isPartiallyRefunded, totalRefunded }
    }, [order.payments])

    // Memoize payment calculations
    const { amountDue, isPartiallyPaid, cashAmountDue, cashSavings } =
      useMemo(() => {
        const due = order.amount_due ?? order.total_amount ?? 0
        const paid = order.amount_paid ?? 0
        const partial = paid > 0 && effectivePaidStatus !== 'Paid'
        const cashDue = order.cash_amount_due ?? due
        const savings = due - cashDue
        return {
          amountDue: due,
          isPartiallyPaid: partial,
          cashAmountDue: cashDue,
          cashSavings: savings
        }
      }, [
        order.amount_due,
        order.total_amount,
        order.amount_paid,
        effectivePaidStatus,
        order.cash_amount_due
      ])

    // Wave 2.2: cross-station read-only gate for the popover's Retrieve to Pay
    // button. `isOrderReadOnly` returns true when this badge's order is owned
    // by another station (claim_order_v1 has flipped station_id away from us).
    // `currentStationId` is already a prop on this memo'd subtree (see line 128).
    const isReadOnlyForStation = useMemo(
      () => isOrderReadOnly(order, currentStationId),
      [order, currentStationId]
    )

    // Memoize formatted time
    const formattedTime = useMemo(() => {
      if (!order.opened_at) return ''
      return new Date(order.opened_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      })
    }, [order.opened_at])

    // Memoize display ID
    const displayId = useMemo(() => {
      return (
        order.display_number || order.order_number || `#${order.id.slice(-4)}`
      )
    }, [order.display_number, order.order_number, order.id])

    // Status pill
    const statusPill = useMemo(
      () =>
        getStatusPillStyle(effectivePaidStatus, order.order_status, {
          isFullyRefunded: refundStatus.isFullyRefunded,
          isPartiallyRefunded: refundStatus.isPartiallyRefunded
        }),
      [
        effectivePaidStatus,
        order.order_status,
        refundStatus.isFullyRefunded,
        refundStatus.isPartiallyRefunded
      ]
    )

    // Check if from another station
    const isFromOtherStation =
      order._sourceStationName && order.station_id !== currentStationId

    const totalAmount = order.total_amount ?? 0

    return (
      <View
        style={{
          width: 300,
          backgroundColor: colors.panel,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden'
        }}
      >
        {/* ── Header: dark screen-bg strip ── */}
        <View
          style={{
            backgroundColor: colors.screen,
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: 10
          }}
        >
          {/* Order ID + status pill */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                marginRight: 8
              }}
            >
              {/* Icon box */}
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: colors.teal + '15',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ShoppingBag size={14} color={colors.teal} />
              </View>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {displayId}
              </Text>
              {order.order_type ? (
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  · {order.order_type}
                </Text>
              ) : null}
            </View>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20,
                backgroundColor: statusPill.bg
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: statusPill.textColor
                }}
              >
                {statusPill.label}
              </Text>
            </View>
          </View>

          {/* Customer · Items · Time */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={{ fontSize: 12, color: colors.heading }}>
                {order.customer_name || 'Walk-In'}
              </Text>
              <Text style={{ color: colors.muted }}>·</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {order.items.length > 0
                  ? order.items.length
                  : order._broadcastItemCount ?? 0}{' '}
                item
                {(order.items.length > 0
                  ? order.items.length
                  : order._broadcastItemCount ?? 0) !== 1
                  ? 's'
                  : ''}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {formattedTime}
            </Text>
          </View>

          {/* Chips row */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 5,
              marginTop: 7
            }}
          >
            {order.order_status ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 20,
                  backgroundColor:
                    getOrderDotColor(order.order_status, refundStatus) + '20',
                  borderWidth: 1,
                  borderColor:
                    getOrderDotColor(order.order_status, refundStatus) + '40'
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: getOrderDotColor(order.order_status, refundStatus)
                  }}
                >
                  {formatOrderStatus(order.order_status)}
                </Text>
              </View>
            ) : null}
            {order.check_status ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 20,
                  backgroundColor:
                    order.check_status === 'Opened'
                      ? colors.success + '20'
                      : colors.muted + '20',
                  borderWidth: 1,
                  borderColor:
                    order.check_status === 'Opened'
                      ? colors.success + '40'
                      : colors.muted + '30'
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color:
                      order.check_status === 'Opened'
                        ? colors.success
                        : colors.muted
                  }}
                >
                  {order.check_status}
                </Text>
              </View>
            ) : null}
            {isFromOtherStation && (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
              >
                <Repeat2 color={colors.info} size={11} />
                <Text style={{ fontSize: 11, color: colors.info }}>
                  {order._sourceStationName}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Amount row ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <View style={{ gap: 1 }}>
            {refundStatus.totalRefunded > 0 && (
              <Text style={{ fontSize: 11, color: colors.danger }}>
                Refunded ${refundStatus.totalRefunded.toFixed(2)}
              </Text>
            )}
            {effectivePaidStatus !== 'Paid' &&
              !refundStatus.hasRefund &&
              cashSavings > 0.01 && (
                <Text style={{ fontSize: 11, color: colors.success }}>
                  Cash ${cashAmountDue.toFixed(2)} · save $
                  {cashSavings.toFixed(2)}
                </Text>
              )}
            {/* Payment methods */}
            {(order.payments || [])
              .filter(p => !p.isVoided)
              .map((payment, idx) => (
                <Text key={idx} style={{ fontSize: 11, color: colors.muted }}>
                  {payment.method === 'Cash'
                    ? `Cash $${(payment.amount ?? 0).toFixed(2)}`
                    : payment.cardBrand || payment.last4
                    ? `${payment.cardBrand || 'Card'}${
                        payment.last4 ? ` ••${payment.last4}` : ''
                      } $${(payment.amount ?? 0).toFixed(2)}`
                    : `Card $${(payment.amount ?? 0).toFixed(2)}`}
                </Text>
              ))}
          </View>
          <Text
            style={{ fontSize: 20, fontWeight: '700', color: colors.heading }}
          >
            ${totalAmount.toFixed(2)}
          </Text>
        </View>

        {/* ── Action list ── */}
        <View style={{ paddingVertical: 4 }}>
          {/* Mark as Done — visible for kitchen-active or ready+paid orders */}
          {(order.order_status === 'preparing' ||
            order.order_status === 'sent_to_kitchen' ||
            (order.order_status === 'ready' &&
              effectivePaidStatus === 'Paid')) && (
            <TouchableOpacity
              onPress={() => {
                onMarkDone()
                onClose()
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 9
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: colors.success + '15',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10
                }}
              >
                <CheckCircle2 size={14} color={colors.success} />
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.success,
                  flex: 1
                }}
              >
                Mark as Done
              </Text>
              <ChevronRight size={14} color={colors.muted} />
            </TouchableOpacity>
          )}

          {/* View Items */}
          <TouchableOpacity
            onPress={() => {
              onViewItems()
              onClose()
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 9
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: colors.teal + '15',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10
              }}
            >
              <Eye size={14} color={colors.teal} />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: colors.heading,
                flex: 1
              }}
            >
              View Items
            </Text>
            <ChevronRight size={14} color={colors.muted} />
          </TouchableOpacity>

          {/* Print Receipt */}
          {onPrintReceipt && effectivePaidStatus === 'Paid' && (
            <TouchableOpacity
              onPress={() => {
                onPrintReceipt()
                onClose()
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 9
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: colors.muted + '15',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10
                }}
              >
                <Printer size={14} color={colors.muted} />
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.heading,
                  flex: 1
                }}
              >
                Print Receipt
              </Text>
              <ChevronRight size={14} color={colors.muted} />
            </TouchableOpacity>
          )}

          {/* Retrieve to Pay / Pay Remaining */}
          {effectivePaidStatus !== 'Paid' &&
            amountDue > 0.01 &&
            order.check_status !== 'Closed' && (
              <TouchableOpacity
                onPress={() => {
                  if (isReadOnlyForStation) {
                    toastService.show({
                      title: 'Order owned by another station',
                      message:
                        'Open the order and tap Take Over to pay this check.',
                      type: 'warning',
                      duration: 4000
                    })
                    return
                  }
                  onRetrieve()
                  onClose()
                }}
                disabled={isReadOnlyForStation}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginHorizontal: 8,
                  marginTop: 4,
                  marginBottom: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  borderRadius: 10,
                  backgroundColor: colors.teal + '15',
                  borderWidth: 1,
                  borderColor: colors.teal + '30',
                  opacity: isReadOnlyForStation ? 0.45 : 1
                }}
              >
                <CreditCard
                  size={15}
                  color={colors.teal}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.teal
                    }}
                  >
                    {isPartiallyPaid ? 'Pay Remaining' : 'Retrieve to Pay'}
                  </Text>
                  {isReadOnlyForStation && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        marginTop: 1
                      }}
                    >
                      Owned by another station — Take Over to pay
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  ${amountDue.toFixed(2)}
                </Text>
              </TouchableOpacity>
            )}

          {/* Reopen Check */}
          {effectivePaidStatus !== 'Paid' &&
            amountDue >= 0.01 &&
            order.check_status === 'Closed' && (
              <TouchableOpacity
                onPress={() => {
                  onReopenCheck?.()
                  onClose()
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginHorizontal: 8,
                  marginTop: 4,
                  marginBottom: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  borderRadius: 10,
                  backgroundColor: colors.warning + '15',
                  borderWidth: 1,
                  borderColor: colors.warning + '30'
                }}
              >
                <RotateCcw
                  size={15}
                  color={colors.warning}
                  style={{ marginRight: 10 }}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.warning,
                    flex: 1
                  }}
                >
                  Reopen Check
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.warning
                  }}
                >
                  ${amountDue.toFixed(2)}
                </Text>
              </TouchableOpacity>
            )}
        </View>
      </View>
    )
  }
)

PopoverContent.displayName = 'PopoverContent'

// ============================================================================
// MAIN COMPONENT - Lightweight badge with lazy popover
// ============================================================================
const OrderBadgeComponent: React.FC<OrderBadgeProps> = ({
  order,
  onMarkDone,
  onViewItems,
  onRetrieve,
  onReopenCheck,
  onPrintReceipt
}) => {
  const [showTooltip, setShowTooltip] = useState(false)

  // PERFORMANCE: Get currentStationId via selector (not getState() during render)
  const currentStationId = useOrderStore(s => s.currentStationId)
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const setActiveOrder = useOrderStore(s => s.setActiveOrder)
  const tableName = useFloorPlanStore(s => {
    if (!order.service_location_id) return null
    return s.tablesById[order.service_location_id]?.name ?? order.service_location_id
  })
  const effectivePaidStatus = useMemo(
    () => deriveEffectivePaidStatus(order) ?? order.paid_status,
    [order]
  )

  // Phase 6: Check if order was recently updated by another station
  const wasRecentlyUpdated = useWasOrderRecentlyUpdated(
    order.db_order_id || order.id
  )

  // Calculate refund status for badge colors
  const refundState = useMemo(() => {
    const payments = order.payments || []
    if (payments.length === 0) {
      return { isFullyRefunded: false, isPartiallyRefunded: false }
    }

    const hasRefund = payments.some(p => (p.refundedAmount ?? 0) > 0)
    const isFullyRefunded =
      payments.length > 0 &&
      payments.every(p => (p.refundedAmount ?? 0) >= (p.amount ?? 0))
    const isPartiallyRefunded = hasRefund && !isFullyRefunded

    return { isFullyRefunded, isPartiallyRefunded }
  }, [order.payments])

  // PERFORMANCE: Memoize dot color and paid suffix
  const dotColor = useMemo(
    () => getOrderDotColor(order.order_status, refundState),
    [order.order_status, refundState]
  )

  const displayId = useMemo(() => {
    return (
      order.display_number || order.order_number || `#${order.id.slice(-4)}`
    )
  }, [order.display_number, order.order_number, order.id])

  const statusLabel = useMemo(() => {
    if (refundState.isFullyRefunded) return 'refunded'
    if (refundState.isPartiallyRefunded) return 'partial refund'
    return formatOrderStatus(order.order_status || 'pending').toLowerCase()
  }, [
    order.order_status,
    refundState.isFullyRefunded,
    refundState.isPartiallyRefunded
  ])

  // Completion mode from store
  const orderCompletionMode = useStoreSettingsStore(s => s.orderCompletionMode)

  // Can this badge be swiped to complete?
  const canSwipeComplete = useMemo(() => {
    if (order.order_status === 'completed' || order.order_status === 'void')
      return false
    if (orderCompletionMode === 'auto_on_payment')
      return effectivePaidStatus === 'Paid'
    // manual & auto: require ready + paid
    return effectivePaidStatus === 'Paid' && order.order_status === 'ready'
  }, [effectivePaidStatus, order.order_status, orderCompletionMode])

  // Swipe-to-complete gesture (single shared value — lightweight)
  const translateY = useSharedValue(0)

  const handleSwipeComplete = useCallback(() => {
    onMarkDone()
    // Reset position after completion animation
    setTimeout(() => {
      translateY.value = withTiming(0, { duration: 200 })
    }, 300)
  }, [onMarkDone])

  const swipeHandler = useAnimatedGestureHandler({
    onStart: (_, ctx: any) => {
      ctx.startY = translateY.value
    },
    onActive: (event, ctx: any) => {
      // Only allow upward swipe (negative Y), clamp
      translateY.value = Math.min(
        0,
        Math.max(-60, ctx.startY + event.translationY)
      )
    },
    onEnd: () => {
      if (translateY.value < -35) {
        translateY.value = withTiming(-60, { duration: 150 }, finished => {
          if (finished) runOnJS(handleSwipeComplete)()
        })
      } else {
        translateY.value = withSpring(0, { damping: 15, stiffness: 150 })
      }
    }
  })

  const animatedSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }))

  const doneRevealStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, -35],
      [0, 1],
      Extrapolation.CLAMP
    )
  }))

  // PERFORMANCE: Memoize callbacks to prevent recreation
  const handleClose = useCallback(() => setShowTooltip(false), [])
  const handleOpen = useCallback(() => setShowTooltip(true), [])
  const handleSetActive = useCallback(
    () => setActiveOrder(order.id),
    [setActiveOrder, order.id]
  )

  // Badge elevation: active, recently updated, or popover open
  const isActive = activeOrderId === order.id || wasRecentlyUpdated
  const isElevated = showTooltip || isActive

  return (
    <View style={{ position: 'relative' }}>
      {/* Green "Done" indicator revealed on swipe up */}
      {canSwipeComplete && (
        <Animated.View
          style={[
            doneRevealStyle,
            {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 28,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              borderRadius: 14,
              backgroundColor: colors.success + '20'
            }
          ]}
        >
          <CheckCircle2 size={12} color={colors.success} />
          <Text
            style={{ fontSize: 11, fontWeight: '600', color: colors.success }}
          >
            Done
          </Text>
        </Animated.View>
      )}
      <PanGestureHandler
        onGestureEvent={swipeHandler}
        enabled={canSwipeComplete}
        activeOffsetY={-10}
        failOffsetX={[-15, 15]}
        failOffsetY={10}
      >
        <Animated.View
          style={canSwipeComplete ? animatedSwipeStyle : undefined}
        >
          <Popover
            isVisible={showTooltip}
            onRequestClose={handleClose}
            // PERFORMANCE: Disable animation for instant appearance
            animationConfig={{ duration: 0 }}
            popoverStyle={{
              backgroundColor: colors.panel,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border
            }}
            from={
              <View
                className='flex-row items-center rounded-full border overflow-hidden'
                style={{
                  backgroundColor: isElevated ? colors.card : colors.panel,
                  borderColor: showTooltip
                    ? colors.teal
                    : isActive
                    ? colors.teal
                    : colors.border,
                  borderWidth: isElevated ? 2 : 1,
                  ...(showTooltip
                    ? {
                        shadowColor: colors.teal,
                        shadowOpacity: 0.35,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: 8
                      }
                    : {})
                }}
              >
                <TouchableOpacity
                  onPress={handleSetActive}
                  className='flex-row items-center px-3 py-1.5'
                >
                  {wasRecentlyUpdated && (
                    <View className='mr-1.5'>
                      <RefreshCw color={colors.info} size={8} />
                    </View>
                  )}
                  {(order.delivery_platform ||
                    (order.order_source &&
                      order.order_source !== 'pos' &&
                      order.order_source !== 'in_store')) && (
                    <View style={{ marginRight: 5 }}>
                      <DeliveryPlatformBadge
                        deliveryPlatform={order.delivery_platform}
                        orderSource={order.order_source}
                        size='sm'
                      />
                    </View>
                  )}
                  <View
                    className='w-2 h-2 rounded-full mr-1.5'
                    style={{ backgroundColor: dotColor }}
                  />
                  <Text
                    className='font-semibold text-sm'
                    numberOfLines={1}
                    style={{ color: colors.heading }}
                  >
                    {displayId}
                  </Text>
                  {tableName ? (
                    <>
                      <Text
                        className='text-sm mx-1'
                        style={{ color: colors.muted }}
                      >
                        ·
                      </Text>
                      <Text
                        className='text-sm'
                        numberOfLines={1}
                        style={{ color: colors.muted }}
                      >
                        Table {tableName}
                      </Text>
                    </>
                  ) : null}
                  <Text
                    className='text-sm mx-1'
                    style={{ color: colors.muted }}
                  >
                    ·
                  </Text>
                  <Text
                    className='text-sm'
                    numberOfLines={1}
                    style={{ color: colors.muted }}
                  >
                    {statusLabel}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleOpen}
                  className='px-2 py-1.5 border-l'
                  style={{ borderColor: colors.border }}
                >
                  <MoreHorizontal size={14} color={colors.muted} />
                </TouchableOpacity>
              </View>
            }
          >
            {/* PERFORMANCE: Lazy render - only render content when popover is visible */}
            {showTooltip ? (
              <PopoverContent
                order={order}
                currentStationId={currentStationId}
                onMarkDone={onMarkDone}
                onViewItems={onViewItems}
                onRetrieve={onRetrieve}
                onReopenCheck={onReopenCheck}
                onPrintReceipt={onPrintReceipt}
                onClose={handleClose}
              />
            ) : null}
          </Popover>
        </Animated.View>
      </PanGestureHandler>
    </View>
  )
}

// WeakMap cache for O(1) refunded lookups — unchanged order refs (Immer structural sharing) get cache hits
const refundedCache = new WeakMap<OrderProfile, number>()
function getCachedRefunded (order: OrderProfile): number {
  let v = refundedCache.get(order)
  if (v === undefined) {
    v = (order.payments || []).reduce(
      (sum, p) => sum + (p.refundedAmount ?? 0),
      0
    )
    refundedCache.set(order, v)
  }
  return v
}

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const OrderBadge = React.memo(OrderBadgeComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.order.id === next.order.id &&
    prev.order.order_status === next.order.order_status &&
    prev.order.paid_status === next.order.paid_status &&
    prev.order.check_status === next.order.check_status &&
    prev.order.items.length === next.order.items.length &&
    prev.order._broadcastItemCount === next.order._broadcastItemCount &&
    prev.order.amount_due === next.order.amount_due &&
    prev.order.cash_amount_due === next.order.cash_amount_due &&
    prev.order.amount_paid === next.order.amount_paid &&
    prev.order.total_amount === next.order.total_amount &&
    prev.order.total_cash_amount === next.order.total_cash_amount &&
    prev.order.customer_name === next.order.customer_name &&
    prev.order.service_location_id === next.order.service_location_id &&
    prev.order.payments?.length === next.order.payments?.length &&
    getCachedRefunded(prev.order) === getCachedRefunded(next.order) &&
    // Station-related fields for display
    prev.order.station_id === next.order.station_id &&
    prev.order._sourceStationName === next.order._sourceStationName &&
    prev.order.order_source === next.order.order_source &&
    prev.order.delivery_platform === next.order.delivery_platform
  )
})

export default OrderBadge
