import { deriveEffectivePaidStatus } from '@/lib/deriveEffectivePaidStatus'
import { colors, PAYMENT_STATUS_COLORS } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useOrder, useOrderTotals } from '@/stores/selectors/orderSelectors'
import { Banknote, CheckCircle2, CreditCard, X } from 'lucide-react-native'
import { useMemo } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import ReadOnlyBillItem from './ReadOnlyBillItem'

interface OrderLineItemsViewProps {
  onClose: () => void
  orderId: string | null
  onMarkDone?: () => void
  onRetrieve?: () => void
  onRefund?: () => void
}

const formatTime = (iso: string | null | undefined) => {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

const formatOrderType = (type: string | undefined) => {
  if (!type) return ''
  const map: Record<string, string> = {
    'Dine In': 'Dine In',
    dine_in: 'Dine In',
    Takeaway: 'Takeaway',
    takeout: 'Takeaway',
    Delivery: 'Delivery',
    delivery: 'Delivery'
  }
  return map[type] || type
}

const OrderLineItemsView = ({
  onClose,
  orderId,
  onMarkDone,
  onRetrieve,
  onRefund
}: OrderLineItemsViewProps) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const orderToView = useOrder(orderId)
  const items = orderToView?.items || []
  // Live SC from the totals selector — reactive to seatCount + rule.
  // Bypasses the deferred `_scheduleTotalsRecompute` write to
  // order.service_charge so the SC line renders on the very first paint.
  const liveTotals = useOrderTotals(orderId)

  const {
    subtotal,
    discount,
    tax,
    serviceCharge,
    serviceChargeName,
    total,
    amountPaid,
    amountDue,
    cashTotal,
    cashSavings
  } = useMemo(() => {
    if (!orderToView)
      return {
        subtotal: 0,
        discount: 0,
        tax: 0,
        serviceCharge: 0,
        serviceChargeName: '',
        total: 0,
        amountPaid: 0,
        amountDue: 0,
        cashTotal: 0,
        cashSavings: 0
      }

    const localSubtotal = orderToView.items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    )
    const disc =
      orderToView.total_discount ??
      (orderToView.checkDiscount
        ? localSubtotal * orderToView.checkDiscount.value
        : 0)
    const finalTax = orderToView.total_tax ?? 0
    // Prefer live selector SC over order snapshot — selector reflects the
    // calculator output the instant items + seatCount + rule converge,
    // while order.service_charge waits for the deferred recalc + possible
    // broadcast wipe.
    const finalServiceCharge =
      liveTotals?.serviceCharge ?? orderToView.service_charge ?? 0
    const finalServiceChargeName =
      liveTotals?.serviceChargeName ||
      orderToView.service_charge_name ||
      'Service Charge'
    const finalTotal =
      orderToView.total_amount ??
      localSubtotal - disc + finalTax + finalServiceCharge
    // Subtotal = total - tax - service_charge (the displayed subtotal pre-tax pre-SC).
    const finalSubtotal = finalTotal - finalTax - finalServiceCharge
    const finalAmountPaid = orderToView.amount_paid ?? 0
    const finalAmountDue = orderToView.amount_due ?? finalTotal
    const finalCashTotal = orderToView.total_cash_amount ?? 0
    const finalCashSavings =
      finalCashTotal > 0 && finalCashTotal < finalTotal
        ? finalTotal - finalCashTotal
        : 0

    return {
      subtotal: finalSubtotal > 0 ? finalSubtotal : localSubtotal,
      discount: disc,
      tax: finalTax,
      serviceCharge: finalServiceCharge,
      serviceChargeName: finalServiceChargeName,
      total: finalTotal,
      amountPaid: finalAmountPaid,
      amountDue: finalAmountDue,
      cashTotal: finalCashTotal,
      cashSavings: finalCashSavings
    }
  }, [orderToView, liveTotals?.serviceCharge, liveTotals?.serviceChargeName])

  if (!orderToView) return null

  const orderTypeLabel = formatOrderType(orderToView.order_type)
  const itemCount = items.length
  const customerLabel = orderToView.customer_name || 'Walk-In'
  const timeLabel = formatTime(orderToView.opened_at)
  const paidStatusColor =
    PAYMENT_STATUS_COLORS[orderToView.paid_status] || colors.muted
  const effectivePaidStatus = deriveEffectivePaidStatus(orderToView) ?? orderToView.paid_status
  const isPaid = effectivePaidStatus === 'Paid'
  const displayId =
    orderToView.display_number || orderToView.order_number || '—'
  const isPartiallyPaid = (orderToView.amount_paid ?? 0) > 0 && !isPaid

  const canRetrieve = !isPaid

  return (
    <View
      style={{
        borderRadius: s(14),
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.screen,
        width: '100%',
        maxWidth: s(500),
        alignSelf: 'center',
        flex: 1
      }}
    >
      {/* ═══ HEADER ═══ */}
      <View
        style={{
          paddingHorizontal: s(16),
          paddingVertical: s(14),
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        {/* Row 1: title + status + close */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: s(5)
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
            Order #{displayId}
          </Text>
          {/* Status pill */}
          <View
            style={{
              backgroundColor: paidStatusColor + '25',
              borderWidth: 1,
              borderColor: paidStatusColor + '60',
              borderRadius: s(20),
              paddingHorizontal: s(10),
              paddingVertical: s(4),
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(5),
              marginRight: s(10)
            }}
          >
            <View
              style={{
                width: s(6),
                height: s(6),
                borderRadius: s(3),
                backgroundColor: paidStatusColor
              }}
            />
            <Text
              style={{
                fontSize: s(12),
                fontWeight: '700',
                color: paidStatusColor
              }}
            >
              {orderToView.paid_status?.toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: s(28),
              height: s(28),
              borderRadius: s(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={s(13)} color={colors.label} />
          </TouchableOpacity>
        </View>

        {/* Row 2: meta */}
        <Text style={{ fontSize: s(12), color: colors.muted }}>
          {[
            orderTypeLabel,
            customerLabel,
            `${itemCount} item${itemCount !== 1 ? 's' : ''}`
          ]
            .filter(Boolean)
            .join(' · ')}
          {timeLabel ? `  ${timeLabel}` : ''}
        </Text>
      </View>

      {/* ═══ ITEMS ═══ */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: s(16),
          paddingTop: s(12),
          paddingBottom: s(8)
        }}
      >
        {items.map((item, idx) => (
          <ReadOnlyBillItem
            key={item.id}
            item={item}
            isLast={idx === items.length - 1}
          />
        ))}
      </ScrollView>

      {/* ═══ TOTALS ═══ */}
      <View
        style={{
          paddingHorizontal: s(16),
          paddingTop: s(12),
          paddingBottom: s(14),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          gap: s(4)
        }}
      >
        {/* Subtotal */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: s(13), color: colors.muted }}>Subtotal</Text>
          <Text
            style={{
              fontSize: s(13),
              color: colors.label,
              fontVariant: ['tabular-nums']
            }}
          >
            ${subtotal.toFixed(2)}
          </Text>
        </View>

        {/* Discount */}
        {discount > 0 && (
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: s(13), color: colors.muted }}>Discount</Text>
            <Text
              style={{
                fontSize: s(13),
                color: colors.success,
                fontVariant: ['tabular-nums']
              }}
            >
              -${discount.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Tax */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: s(13), color: colors.muted }}>Tax</Text>
          <Text
            style={{
              fontSize: s(13),
              color: colors.label,
              fontVariant: ['tabular-nums']
            }}
          >
            ${tax.toFixed(2)}
          </Text>
        </View>

        {/* Service Charge */}
        {serviceCharge > 0 && (
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            testID='service-charge-line'
          >
            <Text style={{ fontSize: s(13), color: colors.muted }}>
              {serviceChargeName}
            </Text>
            <Text
              style={{
                fontSize: s(13),
                color: colors.label,
                fontVariant: ['tabular-nums']
              }}
            >
              ${serviceCharge.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Amount paid (partial) */}
        {isPartiallyPaid && (
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: s(13), color: colors.muted }}>Paid</Text>
            <Text
              style={{
                fontSize: s(13),
                color: colors.success,
                fontVariant: ['tabular-nums']
              }}
            >
              ${amountPaid.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Total */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: s(4)
          }}
        >
          <Text
            style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}
          >
            Total
          </Text>
          <Text
            style={{
              fontSize: s(20),
              fontWeight: '700',
              color: colors.heading,
              fontVariant: ['tabular-nums']
            }}
          >
            ${total.toFixed(2)}
          </Text>
        </View>

        {/* Cash savings badge */}
        {cashSavings > 0 && (
          <View style={{ alignItems: 'flex-end', marginTop: s(3) }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(4),
                backgroundColor: colors.success + '15',
                borderWidth: 1,
                borderColor: colors.success + '30',
                borderRadius: s(20),
                paddingHorizontal: s(8),
                paddingVertical: s(3)
              }}
            >
              <Banknote size={s(10)} color={colors.success} />
              <Text style={{ fontSize: s(10), color: colors.success }}>
                Cash ${cashTotal.toFixed(2)} · save ${cashSavings.toFixed(2)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ═══ ACTIONS ═══ */}
      <View
        style={{
          flexDirection: 'row',
          gap: s(10),
          paddingHorizontal: s(14),
          paddingBottom: s(14),
          paddingTop: s(10),
          borderTopWidth: 1,
          borderTopColor: colors.border
        }}
      >
        {/* Mark as Done */}
        <TouchableOpacity
          onPress={() => {
            onMarkDone?.()
            onClose()
          }}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: s(7),
            paddingVertical: s(13),
            borderRadius: s(10),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <CheckCircle2 size={s(15)} color={colors.label} />
          <Text
            style={{ fontSize: s(13), fontWeight: '600', color: colors.label }}
          >
            Mark as Done
          </Text>
        </TouchableOpacity>

        {/* Retrieve to Pay / Refund */}
        {canRetrieve ? (
          <TouchableOpacity
            onPress={() => {
              onRetrieve?.()
              onClose()
            }}
            style={{
              flex: 2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: s(13),
              paddingHorizontal: s(16),
              borderRadius: s(10),
              backgroundColor: colors.teal
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(7) }}
            >
              <CreditCard size={s(15)} color='#000' />
              <Text style={{ fontSize: s(13), fontWeight: '700', color: '#000' }}>
                {isPartiallyPaid ? 'Pay Remaining' : 'Retrieve to Pay'}
              </Text>
            </View>
            <Text
              style={{
                fontSize: s(14),
                fontWeight: '700',
                color: '#000',
                fontVariant: ['tabular-nums']
              }}
            >
              ${amountDue.toFixed(2)}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => {
              onRefund?.()
              onClose()
            }}
            style={{
              flex: 2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: s(7),
              paddingVertical: s(13),
              borderRadius: s(10),
              backgroundColor: colors.danger + '15',
              borderWidth: 1,
              borderColor: colors.danger + '40'
            }}
          >
            <CreditCard size={s(15)} color={colors.danger} />
            <Text
              style={{ fontSize: s(13), fontWeight: '600', color: colors.danger }}
            >
              Refund
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

export default OrderLineItemsView
