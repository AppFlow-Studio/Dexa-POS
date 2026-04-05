import { colors } from '@/lib/theme'
import {
  useActiveOrder,
  useActiveOrderTotals
} from '@/stores/selectors/orderSelectors'
import { usePaymentStore } from '@/stores/usePaymentStore'
import {
  ArrowLeft,
  Banknote,
  Check,
  CreditCard,
  Minus,
  Plus,
  Users
} from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

const SplitEvenlyView = () => {
  const setView = usePaymentStore(s => s.setView)
  const splitEvenly = usePaymentStore(s => s.splitEvenly)
  const startSplitPaymentFlow = usePaymentStore(s => s.startSplitPaymentFlow)
  const resetSplits = usePaymentStore(s => s.resetSplits)
  const activeOrder = useActiveOrder()
  const orderTotals = useActiveOrderTotals()
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0
  const activeOrderTotal = orderTotals?.total ?? 0
  const activeOrderOutstandingCash = orderTotals?.cashAmountDue ?? 0
  const activeOrderTotalCash = orderTotals?.cashTotal ?? 0
  const activeOrderOutstandingSubtotal = orderTotals?.outstandingSubtotal ?? 0
  const activeOrderOutstandingTax = orderTotals?.outstandingTax ?? 0
  const activeOrderSubtotal = orderTotals?.subtotal ?? 0
  const activeOrderTax = orderTotals?.tax ?? 0

  // Detect existing split-evenly payments for re-entry
  const existingSplitInfo = useMemo(() => {
    const payments = (activeOrder?.payments ?? []).filter(
      p => !p.isVoided && p.splitInfo
    )
    if (payments.length === 0) return null
    const totalPortions = payments[0]?.splitInfo?.totalPortions ?? 0
    return {
      paidCount: payments.length,
      totalPortions,
      remainingCount: totalPortions > 0 ? totalPortions - payments.length : 0,
      amountCollected: payments.reduce((sum, p) => sum + (p.amount ?? 0), 0)
    }
  }, [activeOrder?.payments])

  const [numberOfPeople, setNumberOfPeople] = useState(
    existingSplitInfo?.remainingCount && existingSplitInfo.remainingCount > 0
      ? existingSplitInfo.remainingCount
      : 2
  )

  // Card pricing: Fallback to activeOrderTotal if outstandingTotal is 0 (handles async timing)
  const effectiveCardTotal =
    activeOrderOutstandingTotal > 0
      ? activeOrderOutstandingTotal
      : activeOrderTotal

  // Cash pricing: Fallback to activeOrderTotalCash if outstandingCash is 0
  const effectiveCashTotal =
    activeOrderOutstandingCash > 0
      ? activeOrderOutstandingCash
      : activeOrderTotalCash

  // Subtotal and Tax: Fallback to full amounts if outstanding is 0
  const effectiveSubtotal =
    activeOrderOutstandingSubtotal > 0
      ? activeOrderOutstandingSubtotal
      : activeOrderSubtotal
  const effectiveTax =
    activeOrderOutstandingTax > 0 ? activeOrderOutstandingTax : activeOrderTax

  // Calculate per-person amounts for both pricing models
  const cardAmountPerPerson = effectiveCardTotal / numberOfPeople
  const cashAmountPerPerson = effectiveCashTotal / numberOfPeople

  // Calculate per-person breakdown (subtotal, tax, total)
  const subtotalPerPerson = effectiveSubtotal / numberOfPeople
  const taxPerPerson = effectiveTax / numberOfPeople

  // Calculate savings when paying cash vs card
  const cashSavingsPerPerson = Math.max(
    0,
    cardAmountPerPerson - cashAmountPerPerson
  )

  // For display, use card pricing as default (matches existing UX)
  const effectiveTotal = effectiveCardTotal
  const amountPerPerson = cardAmountPerPerson

  const handleIncrement = () => {
    if (numberOfPeople < 20) setNumberOfPeople(p => p + 1)
  }

  const handleDecrement = () => {
    if (numberOfPeople > 2) setNumberOfPeople(p => p - 1)
  }

  const handleGoBack = () => {
    resetSplits()
    if (activeOrder?.split_payment_path) {
      setView('payment-method-selection')
    } else {
      setView('split-options')
    }
  }

  const handleConfirmSplit = () => {
    // 1. Logic: Create the splits in the store with both card and cash amounts
    splitEvenly(numberOfPeople, cardAmountPerPerson, cashAmountPerPerson)

    // 2. Flow: Start paying for Guest 1 immediately
    startSplitPaymentFlow('split-evenly')
  }

  const isReEntry = existingSplitInfo && existingSplitInfo.paidCount > 0
  const buttonLabel = isReEntry
    ? `Continue Payments (${numberOfPeople} remaining)`
    : `Create ${numberOfPeople} Splits`

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={handleGoBack}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10
          }}
        >
          <ArrowLeft size={16} color={colors.label} />
        </TouchableOpacity>
        <View>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
          >
            Split Evenly
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            Divide the total bill equally.
          </Text>
        </View>
      </View>

      {/* Payment progress banner */}
      {isReEntry && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: `${colors.success}15`,
            borderBottomWidth: 1,
            borderBottomColor: `${colors.success}30`
          }}
        >
          <Text
            style={{ fontSize: 12, color: colors.success, fontWeight: '600' }}
          >
            {existingSplitInfo.paidCount} of {existingSplitInfo.totalPortions}{' '}
            guests have paid (${existingSplitInfo.amountCollected.toFixed(2)}{' '}
            collected). Splitting remaining ${effectiveTotal.toFixed(2)}.
          </Text>
        </View>
      )}

      {/* Main Content */}
      <View style={{ flex: 1, flexDirection: 'row', padding: 14, gap: 12 }}>
        {/* LEFT: Controls */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.panel,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: `${colors.teal}15`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12
              }}
            >
              <Users size={20} color={colors.teal} />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: colors.label,
                marginBottom: 18
              }}
            >
              Number of People
            </Text>

            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}
            >
              <TouchableOpacity
                onPress={handleDecrement}
                disabled={numberOfPeople <= 2}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor:
                    numberOfPeople <= 2 ? colors.border : colors.label,
                  backgroundColor: colors.screen,
                  opacity: numberOfPeople <= 2 ? 0.4 : 1
                }}
              >
                <Minus
                  size={20}
                  color={numberOfPeople <= 2 ? colors.muted : colors.heading}
                />
              </TouchableOpacity>

              <Text
                style={{
                  fontSize: 52,
                  fontWeight: '700',
                  color: colors.heading,
                  width: 72,
                  textAlign: 'center'
                }}
              >
                {numberOfPeople}
              </Text>

              <TouchableOpacity
                onPress={handleIncrement}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: colors.label,
                  backgroundColor: colors.screen
                }}
              >
                <Plus size={20} color={colors.heading} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* RIGHT: Summary & Action */}
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View
            style={{
              flex: 1,
              backgroundColor: colors.panel,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              justifyContent: 'center',
              marginBottom: 10
            }}
          >
            {/* Total Bill */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginBottom: 14,
                paddingBottom: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text
                style={{ color: colors.muted, fontSize: 13, fontWeight: '500' }}
              >
                {isReEntry ? 'Remaining Bill' : 'Total Bill'}
              </Text>
              <Text
                style={{ fontSize: 18, fontWeight: '700', color: colors.label }}
              >
                ${effectiveTotal.toFixed(2)}
              </Text>
            </View>

            {/* Per Person */}
            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 10
              }}
            >
              Per Person Breakdown
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 6
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Subtotal
              </Text>
              <Text style={{ color: colors.label, fontSize: 13 }}>
                ${subtotalPerPerson.toFixed(2)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 12 }}>Tax</Text>
              <Text style={{ color: colors.label, fontSize: 13 }}>
                ${taxPerPerson.toFixed(2)}
              </Text>
            </View>

            {/* Card vs Cash */}
            <View style={{ gap: 6, marginBottom: 10 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: colors.screen,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <CreditCard size={14} color={colors.teal} />
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: 12,
                      fontWeight: '500'
                    }}
                  >
                    Card
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  ${cardAmountPerPerson.toFixed(2)}
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: colors.screen,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: `${colors.success}40`
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Banknote size={14} color={colors.success} />
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: 12,
                      fontWeight: '500'
                    }}
                  >
                    Cash
                  </Text>
                  {cashSavingsPerPerson > 0 && (
                    <View
                      style={{
                        marginLeft: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        backgroundColor: `${colors.success}20`,
                        borderRadius: 8
                      }}
                    >
                      <Text
                        style={{
                          color: colors.success,
                          fontSize: 10,
                          fontWeight: '700'
                        }}
                      >
                        -${cashSavingsPerPerson.toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: colors.success
                  }}
                >
                  ${cashAmountPerPerson.toFixed(2)}
                </Text>
              </View>
            </View>

            <Text
              style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}
            >
              Each guest can choose their payment method
            </Text>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            onPress={handleConfirmSplit}
            style={{
              width: '100%',
              paddingVertical: 11,
              backgroundColor: colors.teal,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <Check size={16} color='#000' />
            <Text style={{ fontWeight: '700', fontSize: 14, color: '#000' }}>
              {buttonLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

export default SplitEvenlyView
