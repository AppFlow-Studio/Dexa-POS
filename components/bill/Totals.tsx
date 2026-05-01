import { colors } from '@/lib/theme'
import { useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import React, { useDeferredValue, useMemo } from 'react'
import { Text, View } from 'react-native'

const TotalsComponent: React.FC = () => {
  // Phase 7: Use derived selector instead of 6 individual store selectors.
  // useDeferredValue lets the deferred-totals-recalc microtask in addItemToActiveOrder
  // land in a follow-up frame so the cart row appears within the tap frame.
  const totals = useDeferredValue(useActiveOrderTotals())
  const defaultTaxRate = useStoreSettingsStore(s => s.taxRatesMap.standard ?? 0)

  // PERF: Single selector for active order - avoids subscribing to entire ordersById
  const activeOrder = useOrderStore(s =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : undefined
  )

  // Calculate amount paid and balance due
  const paymentInfo = useMemo(() => {
    if (!totals) {
      return {
        hasPayments: false,
        isPaid: false,
        balanceDue: 0,
        cashBalanceDue: 0,
        cardTotal: 0,
        cashTotal: 0,
        cashSavings: 0,
        amountPaid: 0,
        totalRefunded: 0,
        discountLabel: 'Discount',
        paidMethodLabel: 'Paid',
        refundItems: [] as { name: string; amount: number }[],
        refundOwed: 0
      }
    }

    const hasPayments = (activeOrder?.payments?.length ?? 0) > 0
    const hasCashPayments =
      activeOrder?.payments?.some(
        (payment: any) => !payment.isVoided && payment.isCashPriced
      ) ?? false
    const isPaid =
      activeOrder?.paid_status === 'Refunded'
        ? false
        : activeOrder?.paid_status === 'Paid' && totals.amountDue <= 0.01
        ? true
        : hasCashPayments
        ? totals.cashAmountDue <= 0.01
        : hasPayments
        ? totals.amountDue <= 0.01
        : false

    const totalRefunded = (activeOrder?.payments ?? [])
      .filter((p: any) => !p.isVoided)
      .reduce((sum: number, p: any) => sum + (p.refundedAmount || 0), 0)

    // Derived selector already prioritizes backend values for amountDue
    const balanceDue = totals.amountDue
    const cashBalanceDue = totals.cashAmountDue
    const cardTotal = totals.total
    const cashTotal = totals.cashTotal

    const amountPaid =
      activeOrder?.amount_paid !== undefined
        ? activeOrder.amount_paid
        : totals.total - totals.amountDue

    // Calculate savings if paying cash
    const cashSavings = balanceDue - cashBalanceDue

    // Discount label with type info
    let discountLabel = 'Discount'
    if (activeOrder?.checkDiscount) {
      const d = activeOrder.checkDiscount
      discountLabel =
        d.type === 'percentage'
          ? `Discount (${Math.round(d.value * 100)}% off)`
          : `Discount ($${d.value.toFixed(2)} off)`
    } else if (activeOrder?.applied_discounts?.length) {
      const d = activeOrder.applied_discounts[0]
      discountLabel =
        d.discount_type === 'percentage'
          ? `Discount (${Math.round(d.discount_value * 100)}% off)`
          : `Discount ($${d.discount_value.toFixed(2)} off)`
    }

    // Payment method label
    const validPayments =
      activeOrder?.payments?.filter(
        (p: any) => !p.isVoided && p.amount > 0
      ) ?? []
    let paidMethodLabel = 'Paid'
    if (validPayments.length === 1 && validPayments[0].method) {
      paidMethodLabel = `Paid · ${validPayments[0].method.toLowerCase()}`
    }

    // Per-item refund data
    const orderItems = activeOrder?.items ?? []
    const refundItems = (activeOrder?.order_refund_items ?? []).map(r => {
      const item = orderItems.find(
        (i: any) =>
          i.db_order_item_id === r.order_item_id || i.id === r.order_item_id
      )
      return {
        name: item?.name ?? 'Item',
        amount: r.total_refunded
      }
    })

    // Refund owed: sum of pending reversals
    const pendingReversalTotal = (activeOrder?.reversals ?? [])
      .filter((rev: any) => rev.status === 'pending' && rev.reversal_type !== 'void')
      .reduce((sum: number, rev: any) => sum + (rev.amount || 0), 0)

    return {
      hasPayments,
      isPaid,
      balanceDue,
      cashBalanceDue,
      cardTotal,
      cashTotal,
      cashSavings: cashSavings > 0.01 ? cashSavings : 0,
      amountPaid: Math.max(0, amountPaid),
      totalRefunded,
      discountLabel,
      paidMethodLabel,
      refundItems,
      refundOwed: pendingReversalTotal
    }
  }, [totals, activeOrder])

  if (!totals) {
    return null
  }

  return (
    <View className='px-5 pt-4 pb-1.5'>
      <View className='flex-row justify-between items-center mb-1'>
        <Text style={{ color: colors.label, fontSize: 11 }}>Subtotal</Text>
        <Text
          style={{ color: colors.label, fontSize: 11, fontWeight: '600' }}
        >
          ${totals.subtotal.toFixed(2)}
        </Text>
      </View>

      {totals.discount > 0.001 && (
        <View className='flex-row justify-between items-center mb-1'>
          <Text style={{ color: colors.label, fontSize: 11 }}>
            {paymentInfo.discountLabel}
          </Text>
          <Text
            style={{ color: colors.success, fontSize: 11, fontWeight: '600' }}
          >
            -${totals.discount.toFixed(2)}
          </Text>
        </View>
      )}

      <View className='flex-row justify-between items-center mb-1.5'>
        <Text style={{ color: colors.label, fontSize: 11 }}>
          Tax ({defaultTaxRate.toFixed(2)}%)
        </Text>
        <Text
          style={{ color: colors.label, fontSize: 11, fontWeight: '600' }}
        >
          ${totals.tax.toFixed(2)}
        </Text>
      </View>

     

      <View className='flex-row justify-between items-end mt-1.5'>
        <Text style={{ color: colors.label, fontSize: 11, fontWeight: '700' }}>
          Card total
        </Text>
        <Text
          style={{
            color: colors.teal,
            fontSize: 16,
            lineHeight: 18,
            fontWeight: '800'
          }}
        >
          ${paymentInfo.cardTotal.toFixed(2)}
        </Text>
      </View>
       <View className='flex-row justify-between items-end mt-2'>
        <Text style={{ color: colors.label, fontSize: 11, fontWeight: '700' }}>
          Cash total
        </Text>
        <Text
          style={{
            color: colors.heading,
            fontSize: 16,
            lineHeight: 18,
            fontWeight: '800'
          }}
        >
          ${paymentInfo.cashTotal.toFixed(2)}
        </Text>
      </View>

      {(paymentInfo.hasPayments || paymentInfo.refundItems.length > 0 || paymentInfo.totalRefunded > 0) && (
        <View
          style={{
            borderBottomWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.border,
            marginTop: 8,
            marginBottom: 4
          }}
        />
      )}

      {paymentInfo.hasPayments && paymentInfo.balanceDue > 0.01 && (
        <View className='flex-row justify-between items-center mt-1'>
          <Text style={{ color: colors.label, fontSize: 11 }}>Balance Due</Text>
          <Text
            style={{ color: colors.label, fontSize: 11, fontWeight: '600' }}
          >
            ${paymentInfo.balanceDue.toFixed(2)}
          </Text>
        </View>
      )}

      {paymentInfo.hasPayments && paymentInfo.amountPaid > 0 && (
        <View className='flex-row justify-between items-center mt-2'>
          <Text style={{ color: colors.label, fontSize: 11 }}>
            {paymentInfo.paidMethodLabel}
          </Text>
          <Text
            style={{ color: colors.label, fontSize: 11, fontWeight: '600' }}
          >
            ${paymentInfo.amountPaid.toFixed(2)}
          </Text>
        </View>
      )}

      {paymentInfo.refundItems.length > 0
        ? paymentInfo.refundItems.map((ri, idx) => (
            <View
              key={idx}
              className='flex-row justify-between items-center mt-0.5'
            >
              <Text style={{ color: colors.label, fontSize: 11 }}>
                Refund · {ri.name}
              </Text>
              <Text
                style={{
                  color: colors.label,
                  fontSize: 11,
                  fontWeight: '600'
                }}
              >
                ${ri.amount.toFixed(2)}
              </Text>
            </View>
          ))
        : paymentInfo.totalRefunded > 0 && (
            <View className='flex-row justify-between items-center mt-0.5'>
              <Text style={{ color: colors.label, fontSize: 11 }}>
                Refunded
              </Text>
              <Text
                style={{
                  color: colors.label,
                  fontSize: 11,
                  fontWeight: '600'
                }}
              >
                +${paymentInfo.totalRefunded.toFixed(2)}
              </Text>
            </View>
          )}

      {paymentInfo.refundOwed > 0.01 && (
        <View className='flex-row justify-between items-center mt-1'>
          <Text
            style={{ color: colors.label, fontSize: 11, fontWeight: '700' }}
          >
            Refund owed
          </Text>
          <Text
            style={{ color: colors.label, fontSize: 11, fontWeight: '700' }}
          >
            ${paymentInfo.refundOwed.toFixed(2)}
          </Text>
        </View>
      )}
    </View>
  )
}

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const Totals = React.memo(TotalsComponent)

export default Totals
