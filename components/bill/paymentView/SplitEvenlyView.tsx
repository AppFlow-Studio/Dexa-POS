import { useUiScale } from '@/lib/uiScale'
import { calculateEvenSplitSpread } from '@/lib/order-calculator'
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
import { useEffect, useMemo, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

const SplitEvenlyView = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
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

  // Calculate per-person amounts using a largest-remainder spread so the
  // DISPLAYED amount equals what will actually be charged. Portions differ by
  // at most one cent; the few guests covering the remainder pay 1 cent more.
  // Raw float division (total / N) lost cents and diverged from the charged
  // amount once toFixed(2) rounded it.
  const cardSplit = useMemo(
    () => calculateEvenSplitSpread(effectiveCardTotal, numberOfPeople),
    [effectiveCardTotal, numberOfPeople]
  )
  const cashSplit = useMemo(
    () => calculateEvenSplitSpread(effectiveCashTotal, numberOfPeople),
    [effectiveCashTotal, numberOfPeople]
  )
  const subtotalSplit = useMemo(
    () => calculateEvenSplitSpread(effectiveSubtotal, numberOfPeople),
    [effectiveSubtotal, numberOfPeople]
  )
  const taxSplit = useMemo(
    () => calculateEvenSplitSpread(effectiveTax, numberOfPeople),
    [effectiveTax, numberOfPeople]
  )

  // Display the higher per-person amount (what the guests covering the
  // remainder pay). Each guest's exact portion is collected via the
  // per-portion array built in splitEvenly().
  const cardAmountPerPerson = cardSplit.perPerson
  const cashAmountPerPerson = cashSplit.perPerson
  const subtotalPerPerson = subtotalSplit.perPerson
  const taxPerPerson = taxSplit.perPerson

  // Calculate savings when paying cash vs card
  const cashSavingsPerPerson = Math.max(
    0,
    cardAmountPerPerson - cashAmountPerPerson
  )

  // For display, use card pricing as default (matches existing UX)
  const effectiveTotal = effectiveCardTotal
  const amountPerPerson = cardAmountPerPerson

  // Cap the people counter so the SMALLEST portion is at least 2¢. A 1¢ portion
  // strands the payment path's dust tolerance: after a 1¢ portion the remaining
  // balance is ≤ 2¢, which the server's `balance <= 0.02` fully-paid fallback
  // mis-reads as settled, flipping the order to `paid` with amount_paid < total
  // and tripping enforce_order_math (P0005). Min 2¢/portion means the bill can
  // be split at most totalCents/2 ways (e.g. a 4¢ bill → at most 2 ways). Still
  // bounded by the original 20-guest UX limit and a floor of 2.
  const totalCents = Math.round(effectiveCardTotal * 100)
  // Largest N that keeps every portion ≥ 2¢. On a sub-4¢ bill this is < 2, i.e.
  // the bill is too small to split evenly without a 1¢ portion — splitEnabled
  // gates the confirm button in that case (the guest must just pay in full).
  const maxPeople = Math.min(20, Math.floor(totalCents / 2))
  const splitEnabled = maxPeople >= 2

  // If the bill shrank (e.g. a portion was already paid) below the current
  // count, clamp down so the displayed/charged portions never include a 1¢
  // (dust-stranding) portion.
  useEffect(() => {
    if (splitEnabled && numberOfPeople > maxPeople) setNumberOfPeople(maxPeople)
  }, [maxPeople, numberOfPeople, splitEnabled])

  const handleIncrement = () => {
    if (splitEnabled && numberOfPeople < maxPeople) setNumberOfPeople(p => p + 1)
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
    if (!splitEnabled) return
    // 1. Logic: Create the splits in the store from the TOTALS so the store
    // can floor the first N-1 portions and assign the remainder to the last.
    splitEvenly(numberOfPeople, effectiveCardTotal, effectiveCashTotal)

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
          paddingHorizontal: s(14),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={handleGoBack}
          style={{
            width: s(32),
            height: s(32),
            borderRadius: s(10),
            backgroundColor: `${colors.teal}10`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: s(10)
          }}
        >
          <ArrowLeft size={s(16)} color={colors.teal} />
        </TouchableOpacity>
        <View>
          <Text
            style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}
          >
            Split Evenly
          </Text>
          <Text style={{ fontSize: s(11), color: colors.muted }}>
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
            paddingHorizontal: s(14),
            paddingVertical: s(8),
            backgroundColor: `${colors.success}15`,
            borderBottomWidth: 1,
            borderBottomColor: `${colors.success}30`
          }}
        >
          <Text
            style={{ fontSize: s(12), color: colors.success, fontWeight: '600' }}
          >
            {existingSplitInfo.paidCount} of {existingSplitInfo.totalPortions}{' '}
            guests have paid (${existingSplitInfo.amountCollected.toFixed(2)}{' '}
            collected). Splitting remaining ${effectiveTotal.toFixed(2)}.
          </Text>
        </View>
      )}

      {/* Main Content */}
      <View style={{ flex: 1, flexDirection: 'row', padding: s(14), gap: s(12) }}>
        {/* LEFT: Controls */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: s(44),
                height: s(44),
                borderRadius: s(22),
                backgroundColor: `${colors.teal}15`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: s(12)
              }}
            >
              <Users size={s(20)} color={colors.teal} />
            </View>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: '600',
                color: colors.label,
                marginBottom: s(18)
              }}
            >
              Number of People
            </Text>

            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(18) }}
            >
              <TouchableOpacity
                onPress={handleDecrement}
                disabled={numberOfPeople <= 2}
                style={{
                  width: s(40),
                  height: s(40),
                  borderRadius: s(20),
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
                  size={s(18)}
                  color={numberOfPeople <= 2 ? colors.muted : colors.heading}
                />
              </TouchableOpacity>

              <Text
                style={{
                  fontSize: s(44),
                  fontWeight: '700',
                  color: colors.heading,
                  width: s(72),
                  textAlign: 'center'
                }}
              >
                {numberOfPeople}
              </Text>

              <TouchableOpacity
                onPress={handleIncrement}
                disabled={numberOfPeople >= maxPeople}
                style={{
                  width: s(40),
                  height: s(40),
                  borderRadius: s(20),
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor:
                    numberOfPeople >= maxPeople ? colors.border : colors.label,
                  backgroundColor: colors.screen,
                  opacity: numberOfPeople >= maxPeople ? 0.4 : 1
                }}
              >
                <Plus
                  size={s(18)}
                  color={
                    numberOfPeople >= maxPeople ? colors.muted : colors.heading
                  }
                />
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
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              padding: s(16),
              justifyContent: 'center',
              marginBottom: s(10)
            }}
          >
            {/* Total Bill */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginBottom: s(14),
                paddingBottom: s(14),
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text
                style={{ color: colors.muted, fontSize: s(13), fontWeight: '500' }}
              >
                {isReEntry ? 'Remaining Bill' : 'Total Bill'}
              </Text>
              <Text
                style={{ fontSize: s(18), fontWeight: '700', color: colors.label }}
              >
                ${effectiveTotal.toFixed(2)}
              </Text>
            </View>

            {/* Per Person */}
            <Text
              style={{
                color: colors.muted,
                fontSize: s(11),
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: s(10)
              }}
            >
              Per Person Breakdown
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: s(6)
              }}
            >
              <Text style={{ color: colors.muted, fontSize: s(12) }}>
                Subtotal
              </Text>
              <Text style={{ color: colors.label, fontSize: s(13) }}>
                ${subtotalPerPerson.toFixed(2)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: s(12),
                paddingBottom: s(12),
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text style={{ color: colors.muted, fontSize: s(12) }}>Tax</Text>
              <Text style={{ color: colors.label, fontSize: s(13) }}>
                ${taxPerPerson.toFixed(2)}
              </Text>
            </View>

            {/* Card vs Cash */}
            <View style={{ gap: s(6), marginBottom: s(10) }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: s(10),
                  paddingHorizontal: s(12),
                  backgroundColor: colors.screen,
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}
                >
                  <CreditCard size={s(14)} color={colors.teal} />
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(12),
                      fontWeight: '500'
                    }}
                  >
                    Card
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: s(15),
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
                  paddingVertical: s(10),
                  paddingHorizontal: s(12),
                  backgroundColor: colors.screen,
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: `${colors.success}40`
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}
                >
                  <Banknote size={s(14)} color={colors.success} />
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(12),
                      fontWeight: '500'
                    }}
                  >
                    Cash
                  </Text>
                  {cashSavingsPerPerson > 0 && (
                    <View
                      style={{
                        marginLeft: s(4),
                        paddingHorizontal: s(6),
                        paddingVertical: s(2),
                        backgroundColor: `${colors.success}20`,
                        borderRadius: s(8)
                      }}
                    >
                      <Text
                        style={{
                          color: colors.success,
                          fontSize: s(10),
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
                    fontSize: s(15),
                    fontWeight: '700',
                    color: colors.success
                  }}
                >
                  ${cashAmountPerPerson.toFixed(2)}
                </Text>
              </View>
            </View>

            <Text
              style={{ color: colors.muted, fontSize: s(10), textAlign: 'center' }}
            >
              Each guest can choose their payment method
            </Text>
          </View>

          {/* Action Button */}
          {!splitEnabled && (
            <Text
              style={{
                color: colors.muted,
                fontSize: s(11),
                textAlign: 'center',
                marginBottom: s(6)
              }}
            >
              This bill is too small to split evenly — please pay it in full.
            </Text>
          )}
          <TouchableOpacity
            onPress={handleConfirmSplit}
            disabled={!splitEnabled}
            style={{
              width: '100%',
              paddingVertical: s(11),
              backgroundColor: colors.teal,
              borderRadius: s(10),
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: s(8),
              opacity: splitEnabled ? 1 : 0.4
            }}
          >
            <Check size={s(16)} color={colors.onSolid} />
            <Text style={{ fontWeight: '700', fontSize: s(13), color: colors.onSolid }}>
              {buttonLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

export default SplitEvenlyView