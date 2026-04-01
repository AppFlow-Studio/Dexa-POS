// components/cfd-client/LoyaltyConfirmationScreen.tsx
import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext'
import { colors } from '@/lib/theme'
import { Check, Gift, UtensilsCrossed } from 'lucide-react-native'
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'

export function LoyaltyConfirmationScreen () {
  const { loyaltyResult, branding } = useCFDDisplayData()
  const programs = loyaltyResult?.programs ?? []
  const customerName = loyaltyResult?.customerName
  const hasUnlockedReward = programs.some(p => p.rewardUnlocked)

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
      <Animated.View entering={FadeIn.duration(250)} style={styles.header}>
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
          entering={FadeInUp.duration(280).delay(80)}
          style={styles.title}
        >
          Thank you!
        </Animated.Text>

        <Animated.Text
          entering={FadeInUp.duration(280).delay(120)}
          style={styles.subtitle}
        >
          Loyalty points were added to your account.
        </Animated.Text>

        {customerName ? (
          <Animated.Text
            entering={FadeInUp.duration(280).delay(150)}
            style={styles.welcomeText}
          >
            Welcome back, {customerName}
          </Animated.Text>
        ) : null}

        {programs.length > 0 ? (
          <View style={styles.programsContainer}>
            {programs.map((program, idx) => (
              <Animated.View
                key={`${program.name}-${idx}`}
                entering={FadeInDown.duration(260).delay(200 + idx * 60)}
                style={styles.programRow}
              >
                <ProgramSummary program={program} />
              </Animated.View>
            ))}
          </View>
        ) : null}

        {hasUnlockedReward ? (
          <Animated.View
            entering={FadeInDown.duration(260).delay(300)}
            style={styles.rewardBanner}
          >
            <Gift size={18} color={colors.warning} />
            <Text style={styles.rewardBannerText}>You earned a reward!</Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}

interface Program {
  name: string
  type: string
  earned: number
  newBalance: number
  rewardUnlocked: boolean
}

function ProgramSummary ({ program }: { program: Program }) {
  const { type, earned, newBalance, name } = program

  let earnedText = ''
  let balanceText = ''

  if (type === 'points') {
    earnedText = `You earned ${earned} pt${earned !== 1 ? 's' : ''}`
    balanceText = `${newBalance} pts total`
  } else if (type === 'visits') {
    earnedText = `Visit counted!`
    balanceText = `${newBalance} visit${newBalance !== 1 ? 's' : ''}`
  } else if (type === 'punch_card') {
    earnedText = `${earned} punch${earned !== 1 ? 'es' : ''} added!`
    balanceText = `${newBalance} total`
  } else {
    earnedText = `${earned} earned`
    balanceText = `${newBalance} total`
  }

  return (
    <View style={styles.programCard}>
      <View style={styles.programCardTopRow}>
        <Text style={styles.programName}>{name}</Text>
        <Text style={styles.programTypePill}>{type.replace('_', ' ')}</Text>
      </View>
      <Text style={styles.programEarned}>{earnedText}</Text>
      <Text style={styles.programBalance}>{balanceText}</Text>
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
  programsContainer: {
    gap: 10,
    width: '100%',
    maxWidth: 560
  },
  programRow: {
    width: '100%'
  },
  programCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
    alignItems: 'flex-start'
  },
  programCardTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  programName: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600'
  },
  programTypePill: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    backgroundColor: `${colors.teal}18`,
    borderColor: `${colors.teal}2E`,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  programEarned: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.heading
  },
  programBalance: {
    fontSize: 15,
    color: colors.teal,
    fontWeight: '600'
  },
  rewardBanner: {
    marginTop: 14,
    backgroundColor: `${colors.warning}16`,
    borderWidth: 1,
    borderColor: `${colors.warning}38`,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  rewardBannerText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.warning
  }
})
