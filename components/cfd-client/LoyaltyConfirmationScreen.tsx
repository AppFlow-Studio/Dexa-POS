// components/cfd-client/LoyaltyConfirmationScreen.tsx
import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { Check, Gift, UtensilsCrossed } from 'lucide-react-native'
import { useEffect } from 'react'
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
  const { loyaltyResult, branding } = useCFDDisplayData()
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

  return (
    <View style={styles.container}>
      <Animated.View
        entering={iosOnly(FadeIn.duration(250))}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconBox}>
            <UtensilsCrossed size={20} color={colors.teal} />
          </View>
          <Text style={styles.restaurantName}>
            {branding?.restaurantName ?? 'Restaurant'}
          </Text>
        </View>
        <Text style={styles.headerBadge}>Loyalty Added</Text>
      </Animated.View>

      <View style={styles.body}>
        <Animated.View style={[styles.iconContainer, iconStyle]}>
          <Check size={48} color={colors.screen} strokeWidth={3} />
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
            <Gift size={18} color={colors.teal} />
            <Text style={styles.rewardBannerText}>You earned a reward!</Text>
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
  headerIconBox: {
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
  headerBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.teal,
    backgroundColor: `${colors.teal}18`,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden'
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32
  },
  iconContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.teal,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.teal,
    letterSpacing: -0.8,
    marginBottom: 8,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 18,
    color: colors.label,
    textAlign: 'center',
    marginBottom: 14
  },
  welcomeText: {
    fontSize: 20,
    color: colors.heading,
    fontWeight: '500',
    marginBottom: 14
  },
  redeemCard: {
    marginTop: 6,
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center'
  },
  redeemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.heading,
    textAlign: 'center'
  },
  redeemProgramsText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.teal,
    textAlign: 'center'
  },
  rewardBanner: {
    marginTop: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  rewardBannerText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.heading
  }
})
