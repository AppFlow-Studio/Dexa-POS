import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext.base'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { Check, CircleAlert, Gift, UtensilsCrossed } from 'lucide-react-native'
import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { RawClickButton } from './RawClickButton'

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
  const uiScale = useUiScale()

  console.log('[ResultScreen] render', {
    success,
    merchantHasLoyalty,
    paymentMethod,
    total,
    totalCash,
    totalCard,
    hasOnJoinLoyalty: Boolean(onJoinLoyalty),
    hasOnSkip: Boolean(onSkip)
  })

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
        color: colors.heading
      },
      statusBadge: {
        fontSize: s(13),
        fontWeight: '600',
        paddingHorizontal: s(12),
        paddingVertical: s(5),
        borderRadius: s(20),
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
        paddingHorizontal: s(32)
      },
      iconCircle: {
        width: s(84),
        height: s(84),
        borderRadius: s(42),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: s(24)
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
        fontSize: s(40),
        fontWeight: '700',
        marginBottom: s(8),
        textAlign: 'center'
      },
      successText: {
        color: colors.teal
      },
      failText: {
        color: colors.danger
      },
      amount: {
        fontSize: s(32),
        fontWeight: '600',
        color: colors.heading,
        marginBottom: s(6)
      },
      tipLine: {
        fontSize: s(15),
        color: colors.label,
        marginBottom: s(16)
      },
      subtitle: {
        fontSize: s(18),
        color: colors.label,
        textAlign: 'center',
        marginTop: s(10),
        maxWidth: s(420)
      },
      loyaltyCta: {
        marginTop: s(30),
        backgroundColor: colors.screen,
        borderRadius: s(14),
        borderWidth: 1.5,
        borderColor: colors.teal,
        paddingHorizontal: s(24),
        paddingVertical: s(13),
        flexDirection: 'row',
        gap: s(8),
        alignItems: 'center',
        justifyContent: 'center'
      },
      loyaltyCtaText: {
        fontSize: s(18),
        fontWeight: '700',
        color: colors.teal
      },
      skipBtn: {
        marginTop: s(14),
        paddingHorizontal: s(22),
        paddingVertical: s(10),
        borderRadius: s(12),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center'
      },
      skipBtnText: {
        fontSize: s(14),
        fontWeight: '600',
        color: colors.label,
        letterSpacing: 0.2
      }
    })
  }, [themeMode, uiScale])

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <UtensilsCrossed size={Math.round(20 * uiScale)} color={colors.teal} />
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
            <Check size={Math.round(48 * uiScale)} color={colors.screen} strokeWidth={3} />
          ) : (
            <CircleAlert size={Math.round(34 * uiScale)} color={colors.danger} strokeWidth={2.4} />
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
              <Gift size={Math.round(18 * uiScale)} color={colors.teal} strokeWidth={2.2} />
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
