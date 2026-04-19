import { colors } from '@/lib/theme'
import { CartItem } from '@/lib/types'
import { useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import React, { useMemo } from 'react'
import { Text, View } from 'react-native'

interface TotalsProps {
  cart: CartItem[]
}

const TotalsComponent: React.FC<TotalsProps> = ({ cart }) => {
  // Phase 7: Use derived selector instead of 6 individual store selectors
  const totals = useActiveOrderTotals()

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
        cashSavings: 0,
        amountPaid: 0
      }
    }

    const hasPayments = (activeOrder?.payments?.length ?? 0) > 0
    const isPaid =
      activeOrder?.paid_status === 'Paid' && totals.amountDue <= 0.01

    const totalRefunded = (activeOrder?.payments ?? [])
      .filter((p: any) => !p.isVoided)
      .reduce((sum: number, p: any) => sum + (p.refundedAmount || 0), 0)

    // Derived selector already prioritizes backend values for amountDue
    const balanceDue = totals.amountDue
    const cashBalanceDue = totals.cashAmountDue

    const amountPaid =
      activeOrder?.amount_paid !== undefined
        ? activeOrder.amount_paid
        : totals.total - totals.amountDue

    // Calculate savings if paying cash
    const cashSavings = balanceDue - cashBalanceDue

    return {
      hasPayments,
      isPaid,
      balanceDue,
      cashBalanceDue,
      cashSavings: cashSavings > 0.01 ? cashSavings : 0,
      amountPaid: Math.max(0, amountPaid),
      totalRefunded
    }
  }, [totals, activeOrder])

  if (!totals) {
    return null
  }

  const taxRatePct =
    totals.subtotal > 0 ? (totals.tax / totals.subtotal) * 100 : 0

  return (
    <View className='px-3 pt-2 pb-1.5'>
      <View className='flex-row justify-between items-center mb-1'>
        <Text style={{ color: colors.label, fontSize: 12 }}>Subtotal</Text>
        <Text
          style={{ color: colors.heading, fontSize: 12, fontWeight: '600' }}
        >
          ${totals.subtotal.toFixed(2)}
        </Text>
      </View>

      <View className='flex-row justify-between items-center mb-1.5'>
        <Text style={{ color: colors.label, fontSize: 12 }}>
          Tax ({taxRatePct.toFixed(2)}%)
        </Text>
        <Text
          style={{ color: colors.heading, fontSize: 12, fontWeight: '600' }}
        >
          ${totals.tax.toFixed(2)}
        </Text>
      </View>

      <View className='flex-row justify-between items-end mt-2'>
        <Text style={{ color: colors.label, fontSize: 11, fontWeight: '700' }}>
          Cash Total
        </Text>
        <Text
          style={{
            color: colors.heading,
            fontSize: 18,
            lineHeight: 20,
            fontWeight: '800'
          }}
        >
          ${paymentInfo.cashBalanceDue.toFixed(2)}
        </Text>
      </View>

      <View className='flex-row justify-between items-end mt-1.5'>
        <Text style={{ color: colors.label, fontSize: 11, fontWeight: '700' }}>
          Card Total
        </Text>
        <Text
          style={{
            color: colors.teal,
            fontSize: 18,
            lineHeight: 20,
            fontWeight: '800'
          }}
        >
          ${paymentInfo.balanceDue.toFixed(2)}
        </Text>
      </View>

      {paymentInfo.hasPayments && paymentInfo.amountPaid > 0 && (
        <View className='flex-row justify-between items-center mt-2'>
          <Text style={{ color: colors.label, fontSize: 11 }}>Paid</Text>
          <Text
            style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}
          >
            ${paymentInfo.amountPaid.toFixed(2)}
          </Text>
        </View>
      )}

      {paymentInfo?.totalRefunded > 0 && (
        <View className='flex-row justify-between items-center mt-0.5'>
          <Text style={{ color: colors.label, fontSize: 11 }}>Refunded</Text>
          <Text
            style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}
          >
            +${paymentInfo.totalRefunded.toFixed(2)}
          </Text>
        </View>
      )}

      {paymentInfo.isPaid && (
        <View className='flex-row justify-between items-center mt-1'>
          <Text
            style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}
          >
            Fully Paid
          </Text>
          <Text
            style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}
          >
            ✓
          </Text>
        </View>
      )}
    </View>
  )
}

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const Totals = React.memo(TotalsComponent)

export default Totals
