// components/cfd-client/LoyaltyPromptScreen.tsx
import { colors } from '@/lib/theme'
import { Delete, Gift } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface Props {
  onPhoneSubmitted: (phone: string) => void
  onSkip: () => void
}

const MIN_PHONE_DIGITS = 7
const MAX_PHONE_DIGITS = 15

function getDigits (value: string): string {
  return value.replace(/\D/g, '')
}

function formatPhone (input: string): string {
  if (input.length === 0) return ''
  const hasPlus = input.startsWith('+')
  const digits = getDigits(input)
  const grouped = digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
  return hasPlus ? `+${grouped}` : grouped
}

export function LoyaltyPromptScreen ({ onPhoneSubmitted, onSkip }: Props) {
  const [phoneInput, setPhoneInput] = useState('')
  const digitCount = getDigits(phoneInput).length
  const canSubmit = digitCount >= MIN_PHONE_DIGITS

  const handleKey = (key: string) => {
    if (key === 'backspace') {
      setPhoneInput(p => p.slice(0, -1))
    } else if (key === 'clear') {
      setPhoneInput('')
    } else if (key === '+') {
      setPhoneInput(p => (p.length === 0 ? '+' : p))
    } else if (digitCount < MAX_PHONE_DIGITS) {
      setPhoneInput(p => p + key)
    }
  }

  const handleSubmit = () => {
    if (canSubmit) {
      onPhoneSubmitted(phoneInput)
    }
  }

  const displayText = phoneInput.length === 0 ? '' : formatPhone(phoneInput)

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Gift size={30} color={colors.teal} strokeWidth={2.2} />
      </View>

      <Text style={styles.headline}>Enter your phone number</Text>
      <Text style={styles.subtitle}>
        Use country code for non-US numbers (example: +44)
      </Text>

      <View style={styles.phoneCard}>
        <Text style={styles.phoneLabel}>Phone Number</Text>
        <Text
          style={[
            styles.phoneText,
            phoneInput.length === 0 && styles.phoneTextPlaceholder
          ]}
        >
          {displayText || '+000 000 000'}
        </Text>
        <Text style={styles.phoneMeta}>
          {digitCount}/{MAX_PHONE_DIGITS} digits (min {MIN_PHONE_DIGITS})
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
            onPress={() => handleKey('+')}
            style={styles.numKey}
          >
            <Text style={styles.numKeySmall}>+</Text>
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
            <Delete size={18} color={colors.label} />
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

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleKey('clear')}
        style={styles.clearInputBtn}
      >
        <Text style={styles.clearInputBtnText}>Clear Input</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screen,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 48,
    paddingVertical: 40
  },
  iconCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.tealMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  headline: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.heading,
    textAlign: 'center',
    letterSpacing: -0.5
  },
  subtitle: {
    fontSize: 18,
    color: colors.label,
    textAlign: 'center',
    marginTop: -8
  },
  phoneCard: {
    width: 320,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 4
  },
  phoneLabel: {
    fontSize: 11,
    color: colors.label,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  phoneText: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.heading,
    letterSpacing: 1.5
  },
  phoneTextPlaceholder: {
    color: colors.muted
  },
  phoneMeta: {
    fontSize: 12,
    color: colors.label,
    fontWeight: '500'
  },
  keypad: {
    width: 320,
    gap: 10
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 8
  },
  numKey: {
    flex: 1,
    height: 56,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  numKeyAction: {
    backgroundColor: colors.screen
  },
  numKeyText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.heading
  },
  numKeySmall: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.label
  },
  footer: {
    flexDirection: 'row',
    gap: 18,
    width: 320,
    marginTop: 8
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  skipBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.label
  },
  continueBtn: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center'
  },
  continueBtnDisabled: {
    opacity: 0.42
  },
  continueBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSolid
  },
  clearInputBtn: {
    marginTop: -8,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  clearInputBtnText: {
    fontSize: 13,
    color: colors.label,
    fontWeight: '500'
  }
})
