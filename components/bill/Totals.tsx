import { useOrderPayments } from '@/hooks/orders/useOrderPayments'
import { colors } from '@/lib/theme'
import { useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import React, { useDeferredValue, useMemo } from 'react'
import { Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

const TotalsComponent: React.FC = () => {
  const totals = useDeferredValue(useActiveOrderTotals())
  const defaultTaxRate = useStoreSettingsStore(s => s.taxRatesMap.standard ?? 0)
  const activeOrder = useOrderStore(useShallow(s => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : undefined
    if (!order) return undefined
    return {
      order_source: order.order_source,
      db_order_id: order.db_order_id,
      payments: order.payments,
      paid_status: order.paid_status,
      amount_paid: order.amount_paid,
      checkDiscount: order.checkDiscount,
      applied_discounts: order.applied_discounts,
      items: order.items,
      order_refund_items: order.order_refund_items,
      reversals: order.reversals
    }
  }))
  const isOnlineOrder = activeOrder?.order_source?.toLowerCase() === 'online'
  const {
    payments: hydratedPayments,
    isPending: isPaymentsPending,
    isFetching: isPaymentsFetching
  } = useOrderPayments(activeOrder?.db_order_id ?? null, {
    enabled: isOnlineOrder && !!activeOrder?.db_order_id
  })

  const paymentInfo = useMemo(() => {
    if (!totals) {
      return {
        hasPayments: false,
        isPaid: false,
        balanceDue: 0,
        cashBalanceDue: 0,
        cardTotal: 0,
        cashTotal: 0,
        amountPaid: 0,
        totalRefunded: 0,
        discountLabel: 'Discount',
        paidMethodLabel: 'Paid',
        paymentMethods: [] as string[],
        isPaymentsLoading: false,
        refundItems: [] as { name: string; amount: number }[],
        refundOwed: 0
      }
    }

    const effectivePayments =
      hydratedPayments.length > 0 ? hydratedPayments : activeOrder?.payments ?? []
    const validPayments = effectivePayments.filter(
      payment => !payment.isVoided && payment.amount > 0
    )
    const paymentMethods = Array.from(
      new Set(validPayments.map(payment => payment.method))
    )
    const hasPayments = validPayments.length > 0
    const hasCashPayments = validPayments.some(
      payment => payment.method === 'Cash' || payment.isCashPriced
    )
    const isPaymentsLoading =
      isOnlineOrder &&
      effectivePayments.length === 0 &&
      (isPaymentsPending || isPaymentsFetching)

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

    const totalRefunded = effectivePayments
      .filter(payment => !payment.isVoided)
      .reduce((sum, payment) => sum + (payment.refundedAmount || 0), 0)

    const balanceDue = totals.amountDue
    const cashBalanceDue = totals.cashAmountDue
    const cardTotal = totals.total
    const cashTotal = totals.cashTotal

    const amountPaid =
      activeOrder?.amount_paid !== undefined
        ? activeOrder.amount_paid
        : totals.total - totals.amountDue

    let discountLabel = 'Discount'
    if (activeOrder?.checkDiscount) {
      const discount = activeOrder.checkDiscount
      discountLabel =
        discount.type === 'percentage'
          ? `Discount (${+((discount.value * 100).toFixed(4)).replace(/\.?0+$/, '')}% off)`
          : `Discount ($${discount.value.toFixed(2)} off)`
    } else if (activeOrder?.applied_discounts?.length) {
      const discount = activeOrder.applied_discounts[0]
      discountLabel =
        discount.discount_type === 'percentage'
          ? `Discount (${+((discount.discount_value).toFixed(4)).replace(/\.?0+$/, '')}% off)`
          : `Discount ($${discount.discount_value.toFixed(2)} off)`
    }

    let paidMethodLabel = 'Paid'
    if (validPayments.length === 1 && validPayments[0].method) {
      paidMethodLabel = `Paid · ${validPayments[0].method.toLowerCase()}`
    } else if (paymentMethods.length > 1) {
      paidMethodLabel = 'Paid · split'
    }

    const orderItems = activeOrder?.items ?? []
    const refundItems = (activeOrder?.order_refund_items ?? []).map(refund => {
      const item = orderItems.find(
        orderItem =>
          orderItem.db_order_item_id === refund.order_item_id ||
          orderItem.id === refund.order_item_id
      )
      return {
        name: item?.name ?? 'Item',
        amount: refund.total_refunded
      }
    })

    const pendingReversalTotal = (activeOrder?.reversals ?? [])
      .filter(reversal => reversal.status === 'pending' && reversal.reversal_type !== 'void')
      .reduce((sum, reversal) => sum + (reversal.amount || 0), 0)

    return {
      hasPayments,
      isPaid,
      balanceDue,
      cashBalanceDue,
      cardTotal,
      cashTotal,
      amountPaid: Math.max(0, amountPaid),
      totalRefunded,
      discountLabel,
      paidMethodLabel,
      paymentMethods,
      isPaymentsLoading,
      refundItems,
      refundOwed: pendingReversalTotal
    }
  }, [
    totals,
    activeOrder,
    hydratedPayments,
    isOnlineOrder,
    isPaymentsPending,
    isPaymentsFetching
  ])

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

      {totals.serviceCharge > 0.001 && (
        <View className='flex-row justify-between items-center mb-1.5'>
          <Text style={{ color: colors.label, fontSize: 11 }}>
            {totals.serviceChargeName || 'Service Charge'}
            {totals.serviceChargeRate != null
              ? ` (${Number(totals.serviceChargeRate).toFixed(2)}%)`
              : ''}
          </Text>
          <Text
            style={{ color: colors.label, fontSize: 11, fontWeight: '600' }}
          >
            ${totals.serviceCharge.toFixed(2)}
          </Text>
        </View>
      )}

      {paymentInfo.isPaymentsLoading ? (
        <View className='flex-row justify-between items-end mt-1.5'>
          <Text style={{ color: colors.label, fontSize: 11, fontWeight: '700' }}>
            Loading payment...
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
      ) : paymentInfo.paymentMethods.length > 1 ||
        paymentInfo.paymentMethods.length === 0 ? (
        <>
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
        </>
      ) : paymentInfo.paymentMethods[0] === 'Cash' ? (
        <View className='flex-row justify-between items-end mt-1.5'>
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
      ) : (
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
      )}

      {(paymentInfo.hasPayments ||
        paymentInfo.refundItems.length > 0 ||
        paymentInfo.totalRefunded > 0) && (
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
        ? paymentInfo.refundItems.map((refundItem, index) => (
            <View
              key={index}
              className='flex-row justify-between items-center mt-0.5'
            >
              <Text style={{ color: colors.label, fontSize: 11 }}>
                Refund · {refundItem.name}
              </Text>
              <Text
                style={{
                  color: colors.label,
                  fontSize: 11,
                  fontWeight: '600'
                }}
              >
                ${refundItem.amount.toFixed(2)}
              </Text>
            </View>
          ))
        : null}

      {paymentInfo.totalRefunded > 0 && paymentInfo.refundItems.length === 0 && (
        <View className='flex-row justify-between items-center mt-0.5'>
          <Text style={{ color: colors.label, fontSize: 11 }}>Refunded</Text>
          <Text
            style={{ color: colors.label, fontSize: 11, fontWeight: '600' }}
          >
            ${paymentInfo.totalRefunded.toFixed(2)}
          </Text>
        </View>
      )}

      {paymentInfo.refundOwed > 0.01 && (
        <View className='flex-row justify-between items-center mt-0.5'>
          <Text style={{ color: colors.label, fontSize: 11 }}>Refund Owed</Text>
          <Text
            style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}
          >
            ${paymentInfo.refundOwed.toFixed(2)}
          </Text>
        </View>
      )}
    </View>
  )
}

export default TotalsComponent
