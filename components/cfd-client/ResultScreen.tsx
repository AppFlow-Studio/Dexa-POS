import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext.base'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { Check, CircleAlert, Gift, UtensilsCrossed } from 'lucide-react-native'
import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { RawClickButton } from './RawClickButton'
import Animated, {
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'

interface Props {
  success: boolean
  onJoinLoyalty?: () => void
  onSkip?: () => void
}

export function ResultScreen ({ success, onJoinLoyalty, onSkip }: Props) {
  const {
    branding,
    total,
    totalCash,
    totalCard,
    paymentMethod,
    tipAmount,
    customerName,
    customerPhone,
    merchantHasLoyalty,
    themeMode
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
    return () => {
      cancelAnimation(iconScale)
      cancelAnimation(iconOpacity)
    }
  }, [])

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconOpacity.value
  }))

  const styles = useMemo(() => StyleSheet.create({
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
      color: colors.danger,
      backgroundColor: `${colors.danger}18`
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
      backgroundColor: `${colors.danger}12`,
      borderWidth: 1,
      borderColor: `${colors.danger}26`
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
      color: colors.danger
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
    },
    skipBtn: {
      marginTop: 14,
      paddingHorizontal: 22,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center'
    },
    skipBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.label,
      letterSpacing: 0.2
    }
  }), [themeMode])

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
            <CircleAlert size={34} color={colors.danger} strokeWidth={2.4} />
          )}
        </Animated.View>

        <Animated.Text
          entering={iosOnly(FadeInUp.duration(280).delay(80))}
          style={[styles.title, success ? styles.successText : styles.failText]}
        >
          {success ? 'Approved' : 'Declined'}
        </Animated.Text>

        {success && displayTotal > 0 && (
          <Animated.Text
            entering={iosOnly(FadeInUp.duration(280).delay(140))}
            style={styles.amount}
          >
            {formatCurrency(displayTotal)}
          </Animated.Text>
        )}

        {success && tipAmount > 0 && (
          <Animated.Text
            entering={iosOnly(FadeInUp.duration(280).delay(180))}
            style={styles.tipLine}
          >
            Including {formatCurrency(tipAmount)} tip
          </Animated.Text>
        )}

        <Animated.Text
          entering={iosOnly(FadeInUp.duration(280).delay(220))}
          style={styles.subtitle}
        >
          {success
            ? 'Thank you for your payment!'
            : 'Please try a different payment method'}
        </Animated.Text>

        {success && merchantHasLoyalty ? (
          <Animated.View entering={iosOnly(FadeInUp.duration(280).delay(280))}>
            {/*
              RawClickButton — direct DOM `click` listener via View ref,
              no Pressable / TouchableOpacity / responder system. The
              Approved → loyalty_prompt transition was paying ~1s of
              touch-pipeline overhead on Android WebView; this button
              fires the handler the same frame the browser dispatches
              the click event.
            */}
            <RawClickButton
              onPress={onJoinLoyalty ?? (() => {})}
              style={styles.loyaltyCta}
              accessibilityLabel={loyaltyCtaLabel}
            >
              <Gift size={18} color={colors.teal} strokeWidth={2.2} />
              <Text style={styles.loyaltyCtaText}>{loyaltyCtaLabel}</Text>
            </RawClickButton>
          </Animated.View>
        ) : null}

        {/* Skip / Done — manual dismissal. The Approved screen no longer
            auto-idles after 6s; the customer (or operator via Start New
            Order) drives the transition. */}
        {success && onSkip ? (
          <Animated.View entering={iosOnly(FadeInUp.duration(280).delay(340))}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onSkip}
              style={styles.skipBtn}
            >
              <Text style={styles.skipBtnText}>
                {merchantHasLoyalty ? 'Skip' : 'Done'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}
