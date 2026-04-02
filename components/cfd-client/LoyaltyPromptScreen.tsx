// components/cfd-client/LoyaltyPromptScreen.tsx
import { colors } from '@/lib/theme'
import { Delete, Gift } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

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

export function LoyaltyPromptScreen ({ onPhoneSubmitted, onSkip }: Props) {
  const [phoneDigits, setPhoneDigits] = useState('')
  const digitCount = phoneDigits.length
  const canSubmit = digitCount === PHONE_DIGITS

  const handleKey = (key: string) => {
    if (key === 'backspace') {
      setPhoneDigits(p => p.slice(0, -1))
    } else if (key === 'clear') {
      setPhoneDigits('')
    } else if (digitCount < PHONE_DIGITS) {
      setPhoneDigits(p => p + key)
    }
  }

  const handleSubmit = () => {
    if (canSubmit) {
      onPhoneSubmitted(phoneDigits)
    }
  }

  const displayText = formatUSPhone(phoneDigits)

  return (
    <View style={styles.container}>
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
                onPress={() => handleKey(key)}
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
            onPress={() => handleKey('clear')}
            style={[styles.numKey, styles.numKeyAction]}
          >
            <Text style={styles.numKeySmall}>CLR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleKey('0')}
            style={styles.numKey}
          >
            <Text style={styles.numKeyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleKey('backspace')}
            style={[styles.numKey, styles.numKeyAction]}
          >
            <Delete size={16} color={colors.label} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onSkip}
          style={styles.skipBtn}
        >
          <Text style={styles.skipBtnText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[styles.continueBtn, !canSubmit && styles.continueBtnDisabled]}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screen,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
    paddingVertical: 28
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tealMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.heading,
    textAlign: 'center',
    letterSpacing: -0.3
  },
  phoneCard: {
    width: 300,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 3
  },
  phoneText: {
    fontSize: 30,
    fontWeight: '600',
    color: colors.heading,
    letterSpacing: 0.5
  },
  phoneTextPlaceholder: {
    color: colors.muted
  },
  keypad: {
    width: 300,
    gap: 8
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 6
  },
  numKey: {
    flex: 1,
    height: 50,
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
    fontSize: 20,
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
    width: 300,
    marginTop: 2
  },
  skipBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  skipBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.label
  },
  continueBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center'
  },
  continueBtnDisabled: {
    opacity: 0.42
  },
  continueBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSolid
  }
})
