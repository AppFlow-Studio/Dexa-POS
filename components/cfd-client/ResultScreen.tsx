import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext'
import { colors } from '@/lib/theme'
import { Check, CircleAlert, Gift, UtensilsCrossed } from 'lucide-react-native'
import { useEffect } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'

interface Props {
  success: boolean
  onJoinLoyalty?: () => void
}

export function ResultScreen ({ success, onJoinLoyalty }: Props) {
  const {
    branding,
    total,
    totalCash,
    totalCard,
    paymentMethod,
    tipAmount,
    customerName,
    customerPhone
  } = useCFDDisplayData()

  const isCash = paymentMethod === 'cash'
  const displayTotal = isCash ? totalCash || total : totalCard || total
  const hasKnownCustomer = Boolean(
    customerPhone?.trim() || customerName?.trim()
  )
  const loyaltyCtaLabel = hasKnownCustomer ? 'Earn Rewards' : 'Join Loyalty'
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`


  const iconScale = useSharedValue(0.7)
  const iconOpacity = useSharedValue(0)

  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 150 })
    iconScale.value = withSpring(1, { damping: 18, stiffness: 220, mass: 0.6 })
  }, [])

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconOpacity.value
  }))

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <UtensilsCrossed size={20} color={colors.teal} />
          </View>
          <Text style={styles.restaurantName}>
            {branding?.restaurantName ?? 'Restaurant'}
          </Text>
        </View>
        <Text
          style={[
            styles.statusBadge,
            success ? styles.successBadge : styles.failBadge
          ]}
        >
          {success ? 'Payment Approved' : 'Payment Declined'}
        </Text>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Animated.View
          style={[
            styles.iconCircle,
            success ? styles.successCircle : styles.failCircle,
            iconStyle
          ]}
        >
          {success ? (
            <Check size={48} color={colors.screen} strokeWidth={3} />
          ) : (
            <CircleAlert size={34} color='#fb7185' strokeWidth={2.4} />
          )}
        </Animated.View>

        <Animated.Text
          entering={FadeInUp.duration(280).delay(80)}
          style={[styles.title, success ? styles.successText : styles.failText]}
        >
          {success ? 'Approved' : 'Declined'}
        </Animated.Text>

        {success && displayTotal > 0 && (
          <Animated.Text
            entering={FadeInUp.duration(280).delay(140)}
            style={styles.amount}
          >
            {formatCurrency(displayTotal)}
          </Animated.Text>
        )}

        {success && tipAmount > 0 && (
          <Animated.Text
            entering={FadeInUp.duration(280).delay(180)}
            style={styles.tipLine}
          >
            Including {formatCurrency(tipAmount)} tip
          </Animated.Text>
        )}

        <Animated.Text
          entering={FadeInUp.duration(280).delay(220)}
          style={styles.subtitle}
        >
          {success
            ? 'Thank you for your payment!'
            : 'Please try a different payment method'}
        </Animated.Text>

        {success ? (
          <Animated.View entering={FadeInUp.duration(280).delay(280)}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onJoinLoyalty}
              style={styles.loyaltyCta}
            >
              <Gift size={18} color={colors.teal} strokeWidth={2.2} />
              <Text style={styles.loyaltyCtaText}>{loyaltyCtaLabel}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}

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
    color: colors.heading
  },
  statusBadge: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden'
  },
  successBadge: {
    color: colors.teal,
    backgroundColor: `${colors.teal}18`
  },
  failBadge: {
    color: '#f87171',
    backgroundColor: '#f8717118'
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24
  },
  successCircle: {
    backgroundColor: colors.teal
  },
  failCircle: {
    backgroundColor: '#fb718512',
    borderWidth: 1,
    borderColor: '#fb718526'
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center'
  },
  successText: {
    color: colors.teal
  },
  failText: {
    color: '#f87171'
  },
  amount: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.heading,
    marginBottom: 6
  },
  tipLine: {
    fontSize: 15,
    color: colors.label,
    marginBottom: 16
  },
  subtitle: {
    fontSize: 18,
    color: colors.label,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 420
  },
  loyaltyCta: {
    marginTop: 30,
    backgroundColor: colors.screen,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.teal,
    paddingHorizontal: 24,
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loyaltyCtaText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.teal
  }
})
