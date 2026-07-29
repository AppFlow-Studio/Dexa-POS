// components/cfd-client/LoyaltyConfirmationScreen.tsx
import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext.base'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { Check, Gift, UtensilsCrossed } from 'lucide-react-native'
import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'

export function LoyaltyConfirmationScreen () {
  const { loyaltyResult, branding, themeMode } = useCFDDisplayData()
  const uiScale = useUiScale()
  const programs = loyaltyResult?.programs ?? []
  const hasProgramResults = programs.length > 0
  const customerName = loyaltyResult?.customerName
  const hasUnlockedReward = programs.some(p => p.rewardUnlocked)

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
      headerIconBox: {
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
      headerBadge: {
        fontSize: s(13),
        fontWeight: '600',
        color: colors.teal,
        backgroundColor: `${colors.teal}18`,
        paddingHorizontal: s(12),
        paddingVertical: s(5),
        borderRadius: s(20),
        overflow: 'hidden'
      },
      body: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: s(32)
      },
      iconContainer: {
        width: s(84),
        height: s(84),
        borderRadius: s(42),
        backgroundColor: colors.teal,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: s(22)
      },
      title: {
        fontSize: s(40),
        fontWeight: '700',
        color: colors.teal,
        letterSpacing: -0.8,
        marginBottom: s(8),
        textAlign: 'center'
      },
      subtitle: {
        fontSize: s(18),
        color: colors.label,
        textAlign: 'center',
        marginBottom: s(14)
      },
      welcomeText: {
        fontSize: s(20),
        color: colors.heading,
        fontWeight: '500',
        marginBottom: s(14)
      },
      redeemCard: {
        marginTop: s(6),
        width: '100%',
        maxWidth: s(560),
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: s(12),
        paddingHorizontal: s(14),
        paddingVertical: s(10),
        alignItems: 'center'
      },
      redeemTitle: {
        fontSize: s(16),
        fontWeight: '700',
        color: colors.heading,
        textAlign: 'center'
      },
      redeemProgramsText: {
        marginTop: s(4),
        fontSize: s(13),
        fontWeight: '600',
        color: colors.teal,
        textAlign: 'center'
      },
      rewardBanner: {
        marginTop: s(22),
        paddingHorizontal: s(18),
        paddingVertical: s(10),
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: s(14),
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(8)
      },
      rewardBannerText: {
        fontSize: s(15),
        fontWeight: '600',
        color: colors.heading
      }
    })
  }, [themeMode, uiScale])

  return (
    <View style={styles.container}>
      <Animated.View
        entering={iosOnly(FadeIn.duration(250))}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconBox}>
            <UtensilsCrossed size={Math.round(20 * uiScale)} color={colors.teal} />
          </View>
          <Text style={styles.restaurantName}>
            {branding?.restaurantName ?? 'Restaurant'}
          </Text>
        </View>
        <Text style={styles.headerBadge}>Loyalty Added</Text>
      </Animated.View>

      <View style={styles.body}>
        <Animated.View style={[styles.iconContainer, iconStyle]}>
          <Check size={Math.round(48 * uiScale)} color={colors.screen} strokeWidth={3} />
        </Animated.View>

        <Animated.Text
          entering={iosOnly(FadeInUp.duration(280).delay(80))}
          style={styles.title}
        >
          Thank you!
        </Animated.Text>

        <Animated.Text
          entering={iosOnly(FadeInUp.duration(280).delay(120))}
          style={styles.subtitle}
        >
          {hasProgramResults
            ? 'Loyalty points were added to your account.'
            : 'Your loyalty information was received.'}
        </Animated.Text>

        {customerName ? (
          <Animated.Text
            entering={iosOnly(FadeInUp.duration(280).delay(150))}
            style={styles.welcomeText}
          >
            Welcome back, {customerName}
          </Animated.Text>
        ) : null}

        {hasUnlockedReward ? (
          <Animated.View
            entering={iosOnly(FadeInDown.duration(260).delay(300))}
            style={styles.rewardBanner}
          >
            <Gift size={Math.round(18 * uiScale)} color={colors.teal} />
            <Text style={styles.rewardBannerText}>You earned a reward!</Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}
