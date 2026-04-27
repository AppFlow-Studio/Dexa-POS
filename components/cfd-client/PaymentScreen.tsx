import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { Banknote, CreditCard, UtensilsCrossed } from 'lucide-react-native'
import { useEffect } from 'react'
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
    paymentMethod
  } = useCFDDisplayData()

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

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.screen
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.panel
    },
    headerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center'
    },
    restaurantName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.heading,
      marginBottom: 2
    },
    headerSubtitle: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.label
    },
    headerRight: {
      alignItems: 'flex-end'
    },
    paymentMethodLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.teal,
      marginBottom: 2
    },
    body: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32
    },
    iconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 32
    },
    amount: {
      fontSize: 72,
      fontWeight: '700',
      color: colors.teal,
      marginBottom: 12
    },
    tipLine: {
      fontSize: 16,
      color: colors.label,
      marginBottom: 8
    },
    savingsLine: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.teal,
      marginBottom: 16
    },
    instruction: {
      fontSize: 20,
      fontWeight: '500',
      color: colors.heading,
      textAlign: 'center',
      marginTop: 8
    }
  })

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View
        entering={iosOnly(FadeIn.duration(250))}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <UtensilsCrossed size={20} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.restaurantName}>
              {branding?.restaurantName ?? 'Restaurant'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {orderType?.toUpperCase()}
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
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    borderWidth: 3,
                    borderColor: colors.teal,
                    borderTopColor: 'transparent'
                  },
                  spinStyle
                ]}
              />
            ) : isCash ? (
              <Banknote size={40} color={colors.teal} />
            ) : (
              <CreditCard size={40} color={colors.teal} />
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
