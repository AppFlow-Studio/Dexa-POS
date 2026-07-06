import { useUiScale } from '@/lib/uiScale'
import { useRefreshActiveOrder } from '@/hooks/pos/useRefreshActiveOrder'
import { payableQuantity } from '@/lib/payableQuantity'
import { colors } from '@/lib/theme'
import { CartItem } from '@/lib/types'
import { aggregateTaxByCategory, round2 } from '@/utils/money'
import {
  calculateItemEffectiveCashPrice,
  useOrderStore
} from '@/stores/useOrderStore'
import { useActiveOrder } from '@/stores/selectors/orderSelectors'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import {
  ArrowLeft,
  Banknote,
  CheckCircle,
  CreditCard,
  FileText,
  Minus,
  Plus
} from 'lucide-react-native'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

// ============================================================================
// HELPER: Get discounted values using HYBRID approach
// ============================================================================
function getSelectedItemDiscountedValues (
  item: CartItem,
  quantityToPay: number,
  isCash: boolean = false
): { subtotal: number; discountAmount: number } {
  const originalQuantity = item.quantity
  const unitPrice = isCash ? calculateItemEffectiveCashPrice(item) : item.price
  const originalDiscount = isCash
    ? item.discount_cash_amount ?? 0
    : item.discount_amount ?? 0

  if (quantityToPay === originalQuantity && originalDiscount > 0) {
    const preCalculatedSubtotal = isCash ? item.cashSubtotal : item.subtotal
    if (preCalculatedSubtotal !== undefined && !isNaN(preCalculatedSubtotal)) {
      return { subtotal: preCalculatedSubtotal, discountAmount: originalDiscount }
    }
  }

  const grossSubtotal = unitPrice * quantityToPay

  if (originalQuantity > 0 && originalDiscount > 0) {
    const perUnitDiscount = originalDiscount / originalQuantity
    const itemDiscountAmount = round2(perUnitDiscount * quantityToPay)
    return { subtotal: round2(grossSubtotal - itemDiscountAmount), discountAmount: itemDiscountAmount }
  }

  return { subtotal: round2(grossSubtotal), discountAmount: 0 }
}

function calculateSelectedTax (
  items: { item: CartItem; quantityToPay: number }[],
  taxRatesMap: Record<string, number>
): { subtotal: number; tax: number; total: number } {
  let subtotal = 0
  const taxLines: Array<{ netSubtotal: number; taxCategory?: string | null; isTaxExempt?: boolean }> = []

  for (const { item, quantityToPay } of items) {
    const { subtotal: itemSubtotal } = getSelectedItemDiscountedValues(item, quantityToPay, false)
    subtotal += itemSubtotal
    taxLines.push({ netSubtotal: itemSubtotal, taxCategory: item.tax_category, isTaxExempt: item.is_tax_exempt })
  }

  subtotal = round2(subtotal)
  // v6: aggregate tax per rate group (round once per group), matches server.
  const tax = aggregateTaxByCategory(taxLines, taxRatesMap)
  const total = round2(subtotal + tax)
  return { subtotal, tax, total }
}

function calculateSelectedCashTax (
  items: { item: CartItem; quantityToPay: number }[],
  taxRatesMap: Record<string, number>
): { subtotal: number; tax: number; total: number } {
  let subtotal = 0
  const taxLines: Array<{ netSubtotal: number; taxCategory?: string | null; isTaxExempt?: boolean }> = []

  for (const { item, quantityToPay } of items) {
    const { subtotal: itemSubtotal } = getSelectedItemDiscountedValues(item, quantityToPay, true)
    subtotal += itemSubtotal
    taxLines.push({ netSubtotal: itemSubtotal, taxCategory: item.tax_category, isTaxExempt: item.is_tax_exempt })
  }

  subtotal = round2(subtotal)
  // v6: aggregate tax per rate group on the cash base (round once per group).
  const tax = aggregateTaxByCategory(taxLines, taxRatesMap)
  const total = round2(subtotal + tax)
  return { subtotal, tax, total }
}

interface PaymentRowProps {
  payment: {
    id?: string
    amount: number
    method: string
    tip_amount?: number
    cardBrand?: string
    last4?: string
    timestamp?: string
    refundedAmount?: number
    isReturned?: boolean
    status?: string
    itemsCovered?: { itemId: string; quantity: number }[]
  }
  index: number
  onPrint?: () => void
}

const PaymentRow: React.FC<PaymentRowProps> = React.memo(
  ({ payment, index, onPrint }) => {
    const methodDisplay =
      payment.method === 'Cash'
        ? 'Cash'
        : payment.cardBrand && payment.last4
        ? `${payment.cardBrand} ****${payment.last4}`
        : payment.method

    const refundedAmount = payment.refundedAmount || 0
    const isVoidCancellation = payment.status === 'void' && payment.isReturned !== true
    const isFullyRefunded = refundedAmount >= payment.amount - 0.001 && refundedAmount > 0
    const isPartiallyRefunded = refundedAmount > 0 && !isFullyRefunded
    const showRefundState = isFullyRefunded || isPartiallyRefunded || isVoidCancellation

    const badgeColor = isVoidCancellation
      ? colors.muted
      : showRefundState ? colors.danger : colors.success
    const badgeLabel = isVoidCancellation
      ? 'Voided'
      : isFullyRefunded ? 'Refunded'
      : isPartiallyRefunded ? 'Partial Refund' : 'Paid'

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          paddingHorizontal: 12,
          backgroundColor: colors.panel,
          borderRadius: 10,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: showRefundState ? 0.7 : 1
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
          <View style={{ backgroundColor: badgeColor + '20', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: badgeColor + '40' }}>
            <Text style={{ color: badgeColor, fontSize: 10, fontWeight: '700' }}>{badgeLabel}</Text>
          </View>
          <View>
            <Text style={{ color: colors.heading, fontWeight: '700', fontSize: 12 }}>{methodDisplay}</Text>
            {payment.timestamp && (
              <Text style={{ color: colors.muted, fontSize: 10 }}>
                {new Date(payment.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', marginHorizontal: 8 }}>
          <Text style={{ color: colors.heading, fontWeight: '700', fontSize: 13, textDecorationLine: isFullyRefunded || isVoidCancellation ? 'line-through' : 'none' }}>
            ${payment.amount.toFixed(2)}
          </Text>
          {refundedAmount > 0 && <Text style={{ color: colors.danger, fontSize: 10 }}>-${refundedAmount.toFixed(2)}</Text>}
          {(payment.tip_amount ?? 0) > 0 && !showRefundState && <Text style={{ color: colors.success, fontSize: 10 }}>+${(payment.tip_amount ?? 0).toFixed(2)}</Text>}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {onPrint && (
            <TouchableOpacity onPress={onPrint} style={{ paddingHorizontal: 8, paddingVertical: 7, backgroundColor: colors.teal + '15', borderRadius: 7 }}>
              <FileText size={13} color={colors.teal} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }
)

const PayForItemsView: React.FC = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  useRefreshActiveOrder()

  const activeOrder = useActiveOrder()
  const activeOrderTotal = useOrderStore(state => state.activeOrderTotal)
  const activeOrderOutstandingCash = useOrderStore(state => state.activeOrderOutstandingCash)
  const taxRatesMap = useStoreSettingsStore(state => state.taxRatesMap)
  const setView = usePaymentStore(s => s.setView)
  const close = usePaymentStore(s => s.close)
  const addSplit = usePaymentStore(s => s.addSplit)
  const resetSplits = usePaymentStore(s => s.resetSplits)

  const [selectedItems, setSelectedItems] = useState<Map<string, { item: CartItem; quantityToPay: number }>>(new Map())
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card')
  const [isProcessing, setIsProcessing] = useState(false)

  const payments = activeOrder?.payments || []

  const collectedAmount = payments.reduce(
    (sum, p) => sum + p.amount + (p.tip_amount || 0) - ((p as any).refundedAmount || 0), 0
  )

  const activePaymentsCount = payments.filter(
    p => ((p as any).refundedAmount || 0) < (p.amount || 0) - 0.001
  ).length

  const remainingAmount =
    activeOrder?.amount_due !== undefined && activeOrder.amount_due >= 0
      ? activeOrder.amount_due
      : Math.max(0, (activeOrder?.total_amount || activeOrderTotal) - collectedAmount)

  const remainingCashAmount =
    activeOrder?.cash_amount_due !== undefined && activeOrder.cash_amount_due >= 0
      ? activeOrder.cash_amount_due
      : activeOrderOutstandingCash > 0 ? activeOrderOutstandingCash : remainingAmount

  const remainingCashSavings = Math.max(0, remainingAmount - remainingCashAmount)

  const unpaidItems = useMemo(() => {
    if (!activeOrder) return []
    return activeOrder.items.filter(
      item => !item.is_voided && payableQuantity(item) > 0
    )
  }, [activeOrder])

  const selectedArray = useMemo(() => Array.from(selectedItems.values()), [selectedItems])

  const selectedCardTotals = useMemo(() => calculateSelectedTax(selectedArray, taxRatesMap), [selectedArray, taxRatesMap])
  const selectedCashTotals = useMemo(() => calculateSelectedCashTax(selectedArray, taxRatesMap), [selectedArray, taxRatesMap])

  const allUnpaidArray = useMemo(
    () =>
      unpaidItems.map(item => ({
        item,
        quantityToPay: payableQuantity(item)
      })),
    [unpaidItems]
  )

  const allUnpaidCardTotals = useMemo(() => calculateSelectedTax(allUnpaidArray, taxRatesMap), [allUnpaidArray, taxRatesMap])
  const allUnpaidCashTotals = useMemo(() => calculateSelectedCashTax(allUnpaidArray, taxRatesMap), [allUnpaidArray, taxRatesMap])

  const selectedItemsRatio = allUnpaidCardTotals.total > 0 ? selectedCardTotals.total / allUnpaidCardTotals.total : 0
  const cardScResidual = Math.max(0, remainingAmount - allUnpaidCardTotals.total)
  const cashScResidual = Math.max(0, remainingCashAmount - allUnpaidCashTotals.total)
  const selectedCardTotalScaled = round2(selectedCardTotals.total + cardScResidual * selectedItemsRatio)
  const selectedCashTotalScaled = round2(selectedCashTotals.total + cashScResidual * selectedItemsRatio)
  const cashSavings = Math.max(0, selectedCardTotalScaled - selectedCashTotalScaled)

  const handleAddItem = useCallback((item: CartItem) => {
    const unpaidQty = payableQuantity(item)
    const current = selectedItems.get(item.id)
    const currentQty = current?.quantityToPay || 0
    if (currentQty < unpaidQty) {
      setSelectedItems(prev => { const n = new Map(prev); n.set(item.id, { item, quantityToPay: currentQty + 1 }); return n })
    }
  }, [selectedItems])

  const handleRemoveItem = useCallback(
    (itemId: string) => {
      const current = selectedItems.get(itemId)
      if (!current) return

      if (current.quantityToPay > 1) {
        setSelectedItems(prev => {
          const newMap = new Map(prev)
          newMap.set(itemId, {
            ...current,
            quantityToPay: current.quantityToPay - 1
          })
          return newMap
        })
      } else {
        setSelectedItems(prev => {
          const newMap = new Map(prev)
          newMap.delete(itemId)
          return newMap
        })
      }
    },
    [selectedItems]
  )

  const handleSelectAll = useCallback(() => {
    const newMap = new Map<string, { item: CartItem; quantityToPay: number }>()
    for (const item of unpaidItems) {
      const unpaidQty = payableQuantity(item)
      newMap.set(item.id, { item, quantityToPay: unpaidQty })
    }
    setSelectedItems(newMap)
  }, [unpaidItems])

  const handleClearSelection = useCallback(() => { setSelectedItems(new Map()) }, [])

  const handleContinueCharging = useCallback(() => {
    if (selectedItems.size === 0) return
    resetSplits()
    const selectedItemsArray = Array.from(selectedItems.values()).map(({ item, quantityToPay }) => ({ ...item, quantity: quantityToPay }))
    addSplit('Selected Items')
    usePaymentStore.setState(state => ({
      splits: [{ ...state.splits[0], items: selectedItemsArray, amount: selectedCardTotalScaled, cashAmount: selectedCashTotalScaled }],
      activeSplitId: state.splits[0]?.id,
      splitSourceView: 'pay-for-items'
    }))
    setView('payment-method-selection')
  }, [selectedItems, selectedCardTotalScaled, selectedCashTotalScaled, resetSplits, addSplit, setView])

  const handleGoBack = useCallback(() => { resetSplits(); setView('payment-method-selection') }, [resetSplits, setView])
  const handleBackToOrder = useCallback(() => { close() }, [close])

  if (!activeOrder) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.muted }}>No active order</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(14), paddingVertical: s(12), borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={handleGoBack} style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: `${colors.teal}10`, alignItems: 'center', justifyContent: 'center', marginRight: s(10) }}>
          <ArrowLeft size={s(16)} color={colors.teal} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}>Pay for Items</Text>
          <Text style={{ fontSize: s(11), color: colors.muted }}>Select items to pay or manage payments</Text>
        </View>
      </View>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: '45%', borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.screen }}>
          <View style={{ padding: s(12), borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontWeight: '700', fontSize: s(10), textTransform: 'uppercase', letterSpacing: 0.8 }}>Remaining Items</Text>
            <View style={{ flexDirection: 'row', gap: s(6) }}>
              <TouchableOpacity onPress={handleSelectAll} style={{ paddingHorizontal: s(8), paddingVertical: s(4), backgroundColor: colors.teal + '15', borderRadius: s(6), borderWidth: 1, borderColor: colors.teal + '40' }}>
                <Text style={{ color: colors.teal, fontSize: s(11), fontWeight: '700' }}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClearSelection} style={{ paddingHorizontal: s(8), paddingVertical: s(4), backgroundColor: colors.screen, borderRadius: s(6), borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.label, fontSize: s(11), fontWeight: '700' }}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingTop: s(8), paddingBottom: s(40) }}>
            {unpaidItems.length === 0 ? (
              <View style={{ padding: s(20), alignItems: 'center' }}>
                <CheckCircle size={s(40)} color={colors.success} />
                <Text style={{ color: colors.success, fontWeight: '700', marginTop: s(8), fontSize: s(13) }}>All Items Paid!</Text>
              </View>
            ) : (
              unpaidItems.map(item => {
                const unpaidQty = payableQuantity(item)
                const selected = selectedItems.get(item.id)
                const selectedQty = selected?.quantityToPay || 0
                const isSelected = selectedQty > 0
                return (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(12), paddingVertical: s(10), marginHorizontal: s(12), marginBottom: s(8), borderRadius: s(10), borderWidth: 1, backgroundColor: isSelected ? colors.teal + '10' : colors.panel, borderColor: isSelected ? colors.teal + '40' : colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', fontSize: s(13), color: isSelected ? colors.teal : colors.heading }}>{item.name}</Text>
                      <Text style={{ color: colors.muted, fontSize: s(11), marginTop: s(2) }}>${item.price.toFixed(2)} × {unpaidQty} unpaid</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                      <TouchableOpacity onPress={() => handleRemoveItem(item.id)} disabled={selectedQty === 0} style={{ width: s(26), height: s(26), borderRadius: s(13), alignItems: 'center', justifyContent: 'center', backgroundColor: selectedQty > 0 ? colors.danger : colors.card, opacity: selectedQty > 0 ? 1 : 0.4 }}>
                        <Minus size={s(11)} color={colors.onSolid} />
                      </TouchableOpacity>
                      <View style={{ minWidth: s(30), paddingHorizontal: s(6), paddingVertical: s(2), borderRadius: s(6), alignItems: 'center', backgroundColor: isSelected ? colors.teal : colors.card }}>
                        <Text style={{ fontWeight: '700', fontSize: s(10), color: isSelected ? colors.onSolid : colors.label }}>{selectedQty}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleAddItem(item)} disabled={selectedQty >= unpaidQty} style={{ width: s(26), height: s(26), borderRadius: s(13), alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal, opacity: selectedQty < unpaidQty ? 1 : 0.4 }}>
                        <Plus size={s(11)} color={colors.onSolid} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })
            )}
          </ScrollView>
        </View>
        <View style={{ width: '55%', backgroundColor: colors.screen }}>
          <View style={{ padding: s(14), borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: s(12) }}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.heading }}>${activeOrderTotal.toFixed(2)}</Text>
                <Text style={{ color: colors.muted, fontSize: s(10), marginTop: s(2) }}>Order Total</Text>
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: s(4) }}>
                  <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.warning }}>${remainingAmount.toFixed(2)}</Text>
                  {remainingCashSavings > 0.01 && <Text style={{ fontSize: s(10), fontWeight: '500', color: colors.success }}>(${remainingCashAmount.toFixed(2)})</Text>}
                </View>
                <Text style={{ color: colors.muted, fontSize: s(10), marginTop: s(2) }}>Remaining</Text>
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.success }}>${collectedAmount.toFixed(2)}</Text>
                <Text style={{ color: colors.muted, fontSize: s(10), marginTop: s(2) }}>Collected</Text>
              </View>
            </View>
          </View>
          <View style={{ flex: 1, padding: s(14) }}>
            <Text style={{ color: colors.muted, fontSize: s(10), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: s(12) }}>Payments ({activePaymentsCount})</Text>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {payments.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: s(24) }}><Text style={{ color: colors.muted, fontSize: s(12) }}>No payments yet</Text></View>
              ) : (
                payments.map((payment, index) => <PaymentRow key={payment.id || index} payment={payment} index={index} />)
              )}
            </ScrollView>
            {selectedItems.size > 0 && (
              <View style={{ marginTop: s(14), marginHorizontal: 0, padding: s(12), backgroundColor: colors.panel, borderRadius: s(12), borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.muted, fontSize: s(10), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: s(8) }}>Selected for Payment</Text>
                <View style={{ flexDirection: 'row', gap: s(10) }}>
                  <TouchableOpacity onPress={() => setPaymentMethod('card')} style={{ flex: 1, padding: s(10), borderRadius: s(10), borderWidth: 1, backgroundColor: paymentMethod === 'card' ? colors.teal + '15' : colors.screen, borderColor: paymentMethod === 'card' ? colors.teal + '40' : colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(5) }}>
                        <CreditCard size={s(14)} color={colors.teal} />
                        <Text style={{ color: colors.muted, fontSize: s(11) }}>Card</Text>
                      </View>
                      <Text style={{ color: colors.teal, fontWeight: '700', fontSize: s(13) }}>${selectedCardTotalScaled.toFixed(2)}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPaymentMethod('cash')} style={{ flex: 1, padding: s(10), borderRadius: s(10), borderWidth: 1, backgroundColor: paymentMethod === 'cash' ? colors.teal + '15' : colors.screen, borderColor: paymentMethod === 'cash' ? colors.teal + '40' : colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(5) }}>
                        <Banknote size={s(14)} color={colors.success} />
                        <Text style={{ color: colors.muted, fontSize: s(11) }}>Cash</Text>
                        {cashSavings > 0.01 && <View style={{ paddingHorizontal: s(4), paddingVertical: 1, backgroundColor: colors.teal + '20', borderRadius: s(6) }}><Text style={{ color: colors.teal, fontSize: s(9), fontWeight: '700' }}>-${cashSavings.toFixed(2)}</Text></View>}
                      </View>
                      <Text style={{ color: colors.success, fontWeight: '700', fontSize: s(13) }}>${selectedCashTotalScaled.toFixed(2)}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          <View style={{ paddingHorizontal: s(16), paddingVertical: s(12), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.panel }}>
            <View style={{ flexDirection: 'row', gap: s(10) }}>
              <TouchableOpacity onPress={handleBackToOrder} style={{ flex: 1, paddingVertical: s(10), borderRadius: s(8), borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.screen }}>
                <Text style={{ color: colors.label, fontWeight: '700', fontSize: s(12) }}>Back to Order</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleContinueCharging} disabled={selectedItems.size === 0 || isProcessing} style={{ flex: 1, paddingVertical: s(10), borderRadius: s(8), alignItems: 'center', backgroundColor: selectedItems.size > 0 ? colors.teal : colors.screen, borderWidth: selectedItems.size > 0 ? 0 : 1, borderColor: colors.border, opacity: selectedItems.size === 0 ? 0.6 : 1 }}>
                {isProcessing ? (
                  <ActivityIndicator color={colors.onSolid} />
                ) : (
                  <Text style={{ fontWeight: '700', fontSize: s(12), color: selectedItems.size > 0 ? colors.onSolid : colors.muted }}>
                    {selectedItems.size > 0 ? `Pay $${paymentMethod === 'cash' ? selectedCashTotalScaled.toFixed(2) : selectedCardTotalScaled.toFixed(2)}` : 'Select Items'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

export default PayForItemsView