import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext.base'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { Banknote, CreditCard, UtensilsCrossed } from 'lucide-react-native'
import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated'

export function PaymentScreen ({ processing }: { processing?: boolean }) {
  const {
    branding,
    orderType,
    tableName,
    serverName,
    total,
    totalCash,
    totalCard,
    outstandingTotal,
    amountPaid,
    tipAmount,
    savingsAmount,
    paymentMethod,
    themeMode
  } = useCFDDisplayData()
  const uiScale = useUiScale()

  const isCash = paymentMethod === 'cash'
  const isManual = paymentMethod === 'manual'
  const amountDue = isCash
    ? amountPaid > 0
      ? outstandingTotal
      : totalCash || total
    : amountPaid > 0
    ? outstandingTotal
    : totalCard || total

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`

  // Icon scale-in
  const iconScale = useSharedValue(0.6)
  const iconOpacity = useSharedValue(0)
  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 200 })
    iconScale.value = withSpring(1, { damping: 14, stiffness: 160 })
  }, [])
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconOpacity.value
  }))

  // Processing: spin + pulse
  const spinAngle = useSharedValue(0)
  const pulseOpacity = useSharedValue(1)
  useEffect(() => {
    if (processing && !isCash && !isManual) {
      spinAngle.value = withRepeat(
        withTiming(360, { duration: 900, easing: Easing.linear }),
        -1,
        false
      )
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    }
    return () => {
      cancelAnimation(spinAngle)
      cancelAnimation(pulseOpacity)
    }
  }, [processing])
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinAngle.value}deg` }]
  }))
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }))

  const styles = useMemo(() => {
    const s = (n: number) => Math.round(n * uiScale)
    return StyleSheet.create({
      container: {
        flex: 1,
        backgroundColor: colors.screen
      },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: s(20),
        paddingVertical: s(14),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.panel
      },
      headerLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12)
      },
      iconBox: {
        width: s(40),
        height: s(40),
        borderRadius: s(10),
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center'
      },
      restaurantName: {
        fontSize: s(16),
        fontWeight: '700',
        color: colors.heading,
        marginBottom: s(2)
      },
      headerSubtitle: {
        fontSize: s(11),
        fontWeight: '500',
        color: colors.label
      },
      headerRight: {
        alignItems: 'flex-end'
      },
      paymentMethodLabel: {
        fontSize: s(14),
        fontWeight: '600',
        color: colors.teal,
        marginBottom: s(2)
      },
      body: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: s(32)
      },
      iconCircle: {
        width: s(88),
        height: s(88),
        borderRadius: s(44),
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: s(32)
      },
      amount: {
        fontSize: s(72),
        fontWeight: '700',
        color: colors.teal,
        marginBottom: s(12)
      },
      tipLine: {
        fontSize: s(16),
        color: colors.label,
        marginBottom: s(8)
      },
      savingsLine: {
        fontSize: s(15),
        fontWeight: '600',
        color: colors.teal,
        marginBottom: s(16)
      },
      instruction: {
        fontSize: s(20),
        fontWeight: '500',
        color: colors.heading,
        textAlign: 'center',
        marginTop: s(8)
      }
    })
  }, [themeMode, uiScale])

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View
        entering={iosOnly(FadeIn.duration(250))}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <UtensilsCrossed size={Math.round(20 * uiScale)} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.restaurantName}>
              {branding?.restaurantName ?? 'Restaurant'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {orderType}
              {tableName
                ? ` · Table ${tableName}`
                : serverName
                ? ` · ${serverName}`
                : ''}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.paymentMethodLabel}>
            {isCash
              ? 'Cash Payment'
              : isManual
              ? 'Manual Card Entry'
              : 'Card Payment'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isCash
              ? 'Hand cash to cashier'
              : isManual
              ? 'Cashier is entering your card details'
              : 'Present card to terminal'}
          </Text>
        </View>
      </Animated.View>

      {/* Body */}
      <View style={styles.body}>
        {/* Payment method icon */}
        <Animated.View style={[styles.iconCircle, pulseStyle]}>
          <Animated.View style={iconStyle}>
            {processing && !isCash && !isManual ? (
              <Animated.View
                style={[
                  {
                    width: Math.round(40 * uiScale),
                    height: Math.round(40 * uiScale),
                    borderRadius: Math.round(20 * uiScale),
                    borderWidth: 3,
                    borderColor: colors.teal,
                    borderTopColor: 'transparent'
                  },
                  spinStyle
                ]}
              />
            ) : isCash ? (
              <Banknote size={Math.round(40 * uiScale)} color={colors.teal} />
            ) : (
              <CreditCard size={Math.round(40 * uiScale)} color={colors.teal} />
            )}
          </Animated.View>
        </Animated.View>

        {/* Amount */}
        <Animated.Text
          entering={iosOnly(FadeInUp.duration(300).delay(80))}
          style={styles.amount}
        >
          {formatCurrency(amountDue)}
        </Animated.Text>

        {/* Tip line */}
        {tipAmount > 0 && (
          <Animated.Text
            entering={iosOnly(FadeInUp.duration(300).delay(140))}
            style={styles.tipLine}
          >
            Including {formatCurrency(tipAmount)} tip
          </Animated.Text>
        )}

        {/* Savings line */}
        {isCash && savingsAmount > 0 && (
          <Animated.Text
            entering={iosOnly(FadeInUp.duration(300).delay(160))}
            style={styles.savingsLine}
          >
            You saved {formatCurrency(savingsAmount)}
          </Animated.Text>
        )}

        {/* Instruction */}
        <Animated.Text
          entering={iosOnly(FadeInUp.duration(300).delay(200))}
          style={styles.instruction}
        >
          {processing && !isCash && !isManual
            ? 'Processing payment...'
            : isCash
            ? 'Please hand cash to the cashier'
            : isManual
            ? 'Please wait while your payment is entered securely'
            : processing
            ? 'Processing payment...'
            : 'Tap, insert, or swipe your card'}
        </Animated.Text>
      </View>
    </View>
  )
}
