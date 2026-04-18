// components/cfd-client/CFDScreenRouter.tsx
// Shared screen-state router used by both external CFD tablets and built-in secondary displays.
import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext'
import {
  triggerCFDLoyaltyJoin,
  triggerCFDLoyaltySkip,
  triggerCFDPhoneSubmit
} from '@/contexts/CFDProvider'
import { colors } from '@/lib/theme'
import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { iosOnly } from '@/lib/safeAnimations'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

import { IdleScreen } from './IdleScreen'
import { LoyaltyConfirmationScreen } from './LoyaltyConfirmationScreen'
import { LoyaltyPromptScreen } from './LoyaltyPromptScreen'
import { OrderingScreen } from './OrderingScreen'
import { PaymentScreen } from './PaymentScreen'
import { ResultScreen } from './ResultScreen'
import { TipSelectionScreen } from './TipSelectionScreen'

interface Props {
  onTipSelected?: (tipAmount: number, tipPercentage: number | null) => void
  onPhoneSubmitted?: (phone: string) => void
  onLoyaltySkip?: () => void
  onLoyaltyJoin?: () => void
}

export function CFDScreenRouter ({
  onTipSelected,
  onPhoneSubmitted,
  onLoyaltySkip,
  onLoyaltyJoin
}: Props) {
  // Defensive: if context is missing (e.g. during unmount race), fall back
  // to idle rather than letting the throw escape to the native Presentation
  // layer where it surfaces as an Android system crash dialog.
  let screenState: ReturnType<typeof useCFDDisplayData>['screenState'] = 'idle'
  let items: ReturnType<typeof useCFDDisplayData>['items'] = []
  let loyaltyProgramCount = 0
  let loyaltyCustomerName: string | null = null
  try {
    const data = useCFDDisplayData()
    screenState = data.screenState
    items = data.items
    loyaltyProgramCount = data.loyaltyResult?.programs?.length ?? 0
    loyaltyCustomerName = data.loyaltyResult?.customerName ?? null
  } catch {
    // Context not available — render idle (dark screen, invisible to customer)
  }

  const handleLoyaltyJoin = () => {
    if (onLoyaltyJoin) {
      onLoyaltyJoin()
      return
    }
    // Built-in fallback: use the provider's real loyalty flow (auto-earn when possible).
    triggerCFDLoyaltyJoin()
  }

  const resolvedState = (() => {
    switch (screenState) {
      case 'idle':
      case 'ordering':
      case 'tip_selection':
      case 'payment':
      case 'processing':
      case 'approved':
      case 'declined':
      case 'loyalty_prompt':
      case 'loyalty_confirmation':
        return screenState
      default:
        return items.length > 0 ? 'ordering' : 'idle'
    }
  })()

  // Keep payment -> processing on the same mounted screen to avoid a visible flash.
  const transitionKey =
    resolvedState === 'payment' || resolvedState === 'processing'
      ? 'payment-flow'
      : resolvedState

  const prevResolvedStateRef = useRef<string>('init')
  useEffect(() => {
    if (!__DEV__) return
    if (prevResolvedStateRef.current === resolvedState) return
    console.log('[CFD Router Trace] state-transition', {
      from: prevResolvedStateRef.current,
      to: resolvedState,
      rawScreenState: screenState,
      itemCount: items.length,
      loyaltyProgramCount,
      hasLoyaltyCustomer: !!loyaltyCustomerName
    })
    prevResolvedStateRef.current = resolvedState
  }, [
    resolvedState,
    screenState,
    items.length,
    loyaltyProgramCount,
    loyaltyCustomerName
  ])

  const renderScreen = () => {
    try {
      switch (resolvedState) {
        case 'idle':
          return <IdleScreen />
        case 'ordering':
          return <OrderingScreen />
        case 'tip_selection':
          return (
            <TipSelectionScreen onTipSelected={onTipSelected ?? (() => {})} />
          )
        case 'payment':
          return <PaymentScreen />
        case 'processing':
          return <PaymentScreen processing />
        case 'approved':
          return <ResultScreen success onJoinLoyalty={handleLoyaltyJoin} />
        case 'declined':
          return <ResultScreen success={false} />
        case 'loyalty_prompt':
          return (
            <LoyaltyPromptScreen
              onPhoneSubmitted={onPhoneSubmitted ?? triggerCFDPhoneSubmit}
              onSkip={onLoyaltySkip ?? triggerCFDLoyaltySkip}
            />
          )
        case 'loyalty_confirmation':
          return <LoyaltyConfirmationScreen />
        default:
          return <IdleScreen />
      }
    } catch (err) {
      console.error(
        '[CFDScreenRouter] Render error, falling back to idle:',
        err
      )
      return <IdleScreen />
    }
  }

  return (
    <Animated.View
      key={transitionKey}
      entering={iosOnly(FadeIn.duration(260))}
      exiting={iosOnly(FadeOut.duration(180))}
      style={styles.container}
    >
      <View style={styles.screenContent}>{renderScreen()}</View>
      {resolvedState !== 'idle' ? (
        <View pointerEvents='none' style={styles.dexaFooterWrap}>
          <Text style={styles.dexaFooterText}>Powered by DEXA</Text>
        </View>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  screenContent: {
    flex: 1
  },
  dexaFooterWrap: {
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 6
  },
  dexaFooterText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
    color: colors.label,
    letterSpacing: 0.25,
    opacity: 0.82
  }
})
