// components/cfd-client/LoyaltyPromptScreen.tsx
import { colors } from '@/lib/theme'
import { Delete, Gift } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface Props {
  onPhoneSubmitted: (phone: string) => void
  onSkip: () => void
}

function formatPhone (digits: string): string {
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function LoyaltyPromptScreen ({ onPhoneSubmitted, onSkip }: Props) {
  const [digits, setDigits] = useState('')

  const handleKey = (key: string) => {
    if (key === 'backspace') {
      setDigits(d => d.slice(0, -1))
    } else if (key === 'clear') {
      setDigits('')
    } else if (digits.length < 10) {
      setDigits(d => d + key)
    }
  }

  const handleSubmit = () => {
    if (digits.length === 10) {
      onPhoneSubmitted(digits)
    }
  }

  const displayText = digits.length === 0 ? '' : formatPhone(digits)

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Gift size={30} color={colors.teal} strokeWidth={2.2} />
      </View>

      <Text style={styles.headline}>Enter your phone number</Text>
      <Text style={styles.subtitle}>Earn points on every purchase</Text>

      <View style={styles.phoneBox}>
        <Text
          style={[
            styles.phoneText,
            digits.length === 0 && styles.phoneTextPlaceholder
          ]}
        >
          {displayText || '(___) ___-____'}
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
            style={styles.numKey}
          >
            <Text style={styles.numKeySmall}>Clear</Text>
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
          disabled={digits.length !== 10}
          style={[
            styles.continueBtn,
            digits.length !== 10 && styles.continueBtnDisabled
          ]}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.poweredFooter}>
        <Text style={styles.poweredFooterText}>Powered by DEXA</Text>
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
  phoneBox: {
    width: 320,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.border
  },
  phoneText: {
    fontSize: 34,
    fontWeight: '600',
    color: colors.heading,
    letterSpacing: 2
  },
  phoneTextPlaceholder: {
    color: colors.muted
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
  poweredFooter: {
    marginTop: 20
  },
  poweredFooterText: {
    fontSize: 12,
    color: colors.label
  }
})
