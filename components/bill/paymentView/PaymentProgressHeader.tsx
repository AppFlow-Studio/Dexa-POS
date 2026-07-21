import { useUiScale } from '@/lib/uiScale'
import { colors } from '@/lib/theme'
import { useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { usePaymentStore } from '@/stores/usePaymentStore'
import React, { useEffect, useMemo, useRef } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'

const PaymentProgressHeader: React.FC = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const view = usePaymentStore(s => s.view)
  const activeSplitId = usePaymentStore(s => s.activeSplitId)
  const splits = usePaymentStore(s => s.splits)
  const orderTotals = useActiveOrderTotals()
  const activeOrderTotal = orderTotals?.total ?? 0
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0

  const progressWidth = useSharedValue(0)

  // Wave Cat-B (§C3): freeze the bar at the last value when the view flips
  // to 'verifying' so it doesn't visually regress (the verifying view isn't
  // in isExecutionPhase, so the natural calc would drop to 10%).
  const lastNonVerifyingProgress = useRef<number | null>(null)

  const computedProgress = useMemo(() => {
    // --- 1. DEFINITIVE END STATE ---
    if (view === 'success') return 100

    // --- 2. DETERMINE PHASE ---
    // Are we in the "Setup" phase or the "Payment Execution" phase?

    // Execution Phase starts if:
    // a) We have an active split selected (loop started)
    // b) We have successfully paid some money (partial payment)
    // c) We are on a direct payment input screen (Cash/Card)
    const total = activeOrderTotal > 0 ? activeOrderTotal : 1
    const paidAmount = total - activeOrderOutstandingTotal

    const isExecutionPhase =
      activeSplitId !== null ||
      paidAmount > 0.01 ||
      ['card', 'cash', 'manual', 'cardOptions'].includes(view)

    // --- 3. SETUP PHASE LOGIC (0% - 20%) ---
    if (!isExecutionPhase) {
      switch (view) {
        case 'review':
          return 5
        case 'payment-method-selection':
          return 10 // Entry point (Lowest)
        case 'split-options':
          return 15 // Moving forward
        case 'split-by-item':
        case 'split-evenly':
        case 'split-custom-amount':
          return 20 // Configuration done
        default:
          return 10
      }
    }

    // --- 4. EXECUTION PHASE LOGIC (20% - 100%) ---
    const BASE = 20
    const RANGE = 80
    let executionRatio = 0

    // SCENARIO A: SPLIT PAYMENT LOOP
    if (splits.length > 0) {
      const totalGuests = splits.length
      const paidGuestsCount = splits.filter(s => s.status === 'paid').length

      // Calculate bonus for the CURRENT working guest (if any)
      let currentGuestProgress = 0

      // Only add bonus if the active split is NOT paid yet.
      // (If it's paid, it's counted in paidGuestsCount already)
      if (activeSplitId) {
        const activeSplit = splits.find(s => s.id === activeSplitId)
        if (activeSplit && activeSplit.status === 'pending') {
          if (view === 'payment-method-selection') {
            currentGuestProgress = 0.1 // Started selecting
          } else if (['card', 'cash', 'manual', 'cardOptions'].includes(view)) {
            currentGuestProgress = 0.5 // Inputting data
          }
        }
      }

      // Formula: (Fully Paid Guests + Progress on Current Pending Guest) / Total Guests
      executionRatio = (paidGuestsCount + currentGuestProgress) / totalGuests
    }

    // SCENARIO B: SINGLE PAYMENT (No Splits)
    else {
      // Simple ratio of money paid
      const moneyRatio = paidAmount / total

      let activityBonus = 0
      // If we haven't paid yet but are on input screen, give visual progress.
      // Wave Cat-B: 'verifying' kept here so the bar holds steady when the
      // view flips to verifying after a deadline rather than dropping back.
      if (
        moneyRatio < 0.01 &&
        ['card', 'cash', 'manual', 'cardOptions', 'verifying'].includes(view)
      ) {
        activityBonus = 0.1
      }

      executionRatio = moneyRatio + activityBonus
    }

    const final = BASE + executionRatio * RANGE
    return Math.min(Math.round(final), 98)
  }, [
    view,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    activeSplitId,
    splits
  ])

  // Track the last non-verifying value so the bar holds steady when view
  // flips to 'verifying' (would otherwise drop to setup-phase fallback).
  useEffect(() => {
    if (view !== 'verifying') {
      lastNonVerifyingProgress.current = computedProgress
    }
  }, [view, computedProgress])

  const targetProgress =
    view === 'verifying' && lastNonVerifyingProgress.current != null
      ? lastNonVerifyingProgress.current
      : computedProgress

  // --- LABEL LOGIC ---
  const progressLabel = useMemo(() => {
    if (view === 'success') return 'Complete'

    if (activeSplitId && splits.length > 0) {
      const index = splits.findIndex(s => s.id === activeSplitId)
      const guest = splits[index]
      if (guest) {
        return `Paying: ${guest.customerName} (${index + 1}/${splits.length})`
      }
    }

    if (
      activeOrderOutstandingTotal < activeOrderTotal &&
      activeOrderOutstandingTotal > 0.01
    ) {
      return `Balance Due: $${activeOrderOutstandingTotal.toFixed(2)}`
    }

    switch (view) {
      case 'payment-method-selection':
        return 'Select Method'
      case 'cardOptions':
        return 'Card Options'
      case 'manual':
        return 'Manual Entry'
      case 'card':
        return 'Read Card'
      case 'cash':
        return 'Cash Entry'
      case 'split-options':
        return 'Split Options'
      case 'split-by-item':
        return 'Assign Items'
      case 'split-evenly':
        return 'Split Evenly'
      case 'split-custom-amount':
        return 'Custom Amounts'
      case 'review':
        return 'Review Order'
      case 'verifying':
        return 'Verifying Payment'
      default:
        return 'Processing'
    }
  }, [
    view,
    activeSplitId,
    splits,
    activeOrderTotal,
    activeOrderOutstandingTotal
  ])

  useEffect(() => {
    progressWidth.value = withTiming(targetProgress, { duration: 500 })
  }, [targetProgress])

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`
  }))

  return (
    <View
      style={{
        width: '100%',
        paddingHorizontal: s(24),
        paddingVertical: s(12),
        backgroundColor: colors.panel,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: s(8)
        }}
      >
        <Text
          style={{
            color: colors.muted,
            fontSize: s(11),
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.8
          }}
          numberOfLines={1}
        >
          {progressLabel}
        </Text>
        <Text
          style={{
            color: colors.teal,
            fontSize: s(11),
            fontWeight: 'bold',
            marginLeft: s(8)
          }}
        >
          {Math.round(targetProgress)}%
        </Text>
      </View>

      <View
        style={{
          height: 6,
          width: '100%',
          backgroundColor: colors.muted + '15',
          borderRadius: s(3),
          overflow: 'hidden'
        }}
      >
        <Animated.View
          style={[
            animatedStyle,
            { height: '100%', backgroundColor: colors.teal, borderRadius: s(3) }
          ]}
        />
      </View>
    </View>
  )
}

export default PaymentProgressHeader
