// components/cfd-client/LoyaltyPromptScreen.tsx
import { useCFDDisplayField } from '@/contexts/CFDDisplayDataContext.base'
import { colors } from '@/lib/theme'
import { Delete, Gift } from 'lucide-react-native'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface Props {
  onPhoneSubmitted: (phone: string) => void
  onSkip: () => void
}

const PHONE_DIGITS = 10

function formatUSPhone (digits: string): string {
  const d = digits.slice(0, PHONE_DIGITS)

  if (d.length === 0) return '(___) ___-____'
  if (d.length < 3) return `(${d}`
  if (d.length === 3) return `(${d})`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// Module-scope styles. StyleSheet.create runs ONCE per theme (per app
// load), not per render — important because react-native-web's
// StyleSheet.create does real CSS-in-JS work (class registration,
// hashing) and was a measurable cost on every keystroke when defined
// inside the component.
const stylesByTheme = {
  dark: makeStyles('dark'),
  light: makeStyles('light')
} as const

function makeStyles (_themeMode: 'light' | 'dark') {
  // The `colors` import is theme-aware via setThemeMode (lib/theme.ts).
  // Each call here resolves against the current theme palette at the
  // time the module first loads. We re-read inside makeStyles so theme
  // switches that happen after first render still produce fresh values
  // when the cache rebuilds (see refresh logic in the component).
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.screen
    },
    body: {
      // ScrollView contentContainer — keeps content centered when there's
      // room, allows scroll on short viewports.
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 6
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.tealMuted,
      alignItems: 'center',
      justifyContent: 'center'
    },
    headline: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.heading,
      textAlign: 'center',
      letterSpacing: -0.2
    },
    phoneCard: {
      width: 300,
      backgroundColor: colors.screen,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 6,
      paddingHorizontal: 12,
      alignItems: 'center'
    },
    phoneText: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.heading,
      letterSpacing: 0.5
    },
    phoneTextPlaceholder: {
      color: colors.heading
    },
    keypad: {
      width: 300,
      gap: 4
    },
    numpadRow: {
      flexDirection: 'row',
      gap: 4
    },
    numKey: {
      flex: 1,
      height: 42,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center'
    },
    numKeyAction: {
      backgroundColor: colors.screen
    },
    numKeyText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.heading
    },
    numKeySmall: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.label
    },
    footer: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.screen,
      alignItems: 'center',
      justifyContent: 'center'
    },
    footerInner: {
      flexDirection: 'row',
      gap: 10,
      width: 300
    },
    skipBtn: {
      flex: 1,
      minHeight: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent'
    },
    skipBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.label
    },
    continueBtn: {
      flex: 1,
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center'
    },
    continueBtnDisabled: {
      opacity: 0.42
    },
    continueBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.onSolid
    },
    submittingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24
    },
    submittingCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.panel,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 28,
      paddingHorizontal: 24,
      alignItems: 'center',
      gap: 14,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6
    },
    submittingText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.heading,
      letterSpacing: 0.2,
      textAlign: 'center'
    },
    submittingSubtext: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.label,
      textAlign: 'center'
    }
  })
}

// Memoized keypad. Receives a stable `onPress` ref-callback from the
// parent so its props reference equality holds across the parent's
// per-keystroke re-renders, and React.memo can skip its render entirely.
// The keypad is ~12 TouchableOpacity + Text nodes — by far the heaviest
// part of the screen — so skipping it on every keystroke removes the
// dominant lag in V8.
interface KeypadProps {
  onPress: (key: string) => void
  styles: ReturnType<typeof makeStyles>
}
const Keypad = memo(function Keypad ({ onPress, styles }: KeypadProps) {
  return (
    <View style={styles.keypad}>
      {[
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9']
      ].map((row, ri) => (
        <View key={ri} style={styles.numpadRow}>
          {row.map(key => (
            <TouchableOpacity
              key={key}
              activeOpacity={0.7}
              onPress={() => onPress(key)}
              style={styles.numKey}
            >
              <Text style={styles.numKeyText}>{key}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={styles.numpadRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onPress('clear')}
          style={[styles.numKey, styles.numKeyAction]}
        >
          <Text style={styles.numKeySmall}>clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onPress('0')}
          style={styles.numKey}
        >
          <Text style={styles.numKeyText}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onPress('backspace')}
          style={[styles.numKey, styles.numKeyAction]}
        >
          <Delete size={16} color={colors.heading} />
        </TouchableOpacity>
      </View>
    </View>
  )
})

export function LoyaltyPromptScreen ({ onPhoneSubmitted, onSkip }: Props) {
  // Field-level subscription so unrelated host pushes (cart updates,
  // totals, etc.) don't re-render the keypad mid-input.
  const themeMode = useCFDDisplayField('themeMode')
  const styles = stylesByTheme[themeMode] ?? stylesByTheme.dark

  const [phoneDigits, setPhoneDigits] = useState('')
  const phoneDigitsRef = useRef(phoneDigits)
  phoneDigitsRef.current = phoneDigits
  const canSubmit = phoneDigits.length === PHONE_DIGITS

  // Submission state — the host's auto-earn lookup after `onPhoneSubmitted`
  // can take several seconds. Without local feedback the customer just
  // stares at an unchanged screen. The overlay locks input + shows a
  // spinner immediately on Continue. Auto-clears on unmount or after a
  // 12s safety reset (in case the host fails to advance the screen).
  const [isSubmitting, setIsSubmitting] = useState(false)
  useEffect(() => {
    if (!isSubmitting) return
    const t = setTimeout(() => setIsSubmitting(false), 12000)
    return () => clearTimeout(t)
  }, [isSubmitting])

  // Stable callback so the memoized Keypad never re-renders.
  const handleKey = useCallback((key: string) => {
    if (key === 'backspace') {
      setPhoneDigits(p => p.slice(0, -1))
    } else if (key === 'clear') {
      setPhoneDigits('')
    } else if (phoneDigitsRef.current.length < PHONE_DIGITS) {
      setPhoneDigits(p => (p.length < PHONE_DIGITS ? p + key : p))
    }
  }, [])

  const handleSubmit = useCallback(() => {
    if (phoneDigitsRef.current.length === PHONE_DIGITS) {
      setIsSubmitting(true)
      onPhoneSubmitted(phoneDigitsRef.current)
    }
  }, [onPhoneSubmitted])

  const handleSkipPress = useCallback(() => {
    setIsSubmitting(true)
    onSkip()
  }, [onSkip])

  const displayText = formatUSPhone(phoneDigits)

  return (
    <View style={styles.container}>
      {/* Body scrolls on short viewports; centers on tall ones */}
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps='always'
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconCircle}>
          <Gift size={24} color={colors.teal} strokeWidth={2.2} />
        </View>

        <Text style={styles.headline}>Enter your phone number</Text>

        <View style={styles.phoneCard}>
          <Text
            style={[
              styles.phoneText,
              phoneDigits.length === 0 && styles.phoneTextPlaceholder
            ]}
          >
            {displayText}
          </Text>
        </View>

        <Keypad onPress={handleKey} styles={styles} />
      </ScrollView>

      {/* Footer pinned outside the ScrollView — Skip / Continue are
          guaranteed visible at any viewport height. */}
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSkipPress}
            style={styles.skipBtn}
            disabled={isSubmitting}
          >
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            style={[
              styles.continueBtn,
              (!canSubmit || isSubmitting) && styles.continueBtnDisabled
            ]}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Optimistic submission overlay — shows immediately on Continue
          while the host runs the auto-earn lookup, so the customer sees
          their action register without waiting on the round-trip. */}
      {isSubmitting && (
        <View pointerEvents='auto' style={styles.submittingOverlay}>
          <View style={styles.submittingCard}>
            <ActivityIndicator size='large' color={colors.teal} />
            <Text style={styles.submittingText}>Looking up your rewards…</Text>
            <Text style={styles.submittingSubtext}>
              This will only take a moment.
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}
