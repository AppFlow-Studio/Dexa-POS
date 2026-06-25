import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { CreditCard, Banknote, Terminal, Smartphone } from 'lucide-react-native'
import React from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface CardPaymentOptionsProps {
  onSelectDualPricing?: () => void
  onSelectManual: () => void
  onSelectTerminal: () => void
  onCancel: () => void
  dualPricingEnabled?: boolean
  terminalReachable?: boolean
  isProcessing?: boolean
}

const CardPaymentOptions: React.FC<CardPaymentOptionsProps> = ({
  onSelectDualPricing,
  onSelectManual,
  onSelectTerminal,
  onCancel,
  dualPricingEnabled = true,
  terminalReachable = true,
  isProcessing = false
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const getStyles = () =>
    StyleSheet.create({
      header: { alignItems: 'center', paddingVertical: s(16) },
      iconCircle: {
        width: s(48),
        height: s(48),
        borderRadius: s(24),
        backgroundColor: `${colors.teal}15`,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: s(12)
      },
      title: {
        fontSize: s(16),
        fontWeight: '700' as const,
        color: colors.heading,
        marginBottom: s(4)
      },
      subtitle: {
        fontSize: s(12),
        color: colors.muted,
        textAlign: 'center',
        paddingHorizontal: s(24)
      },
      list: { gap: s(8), paddingHorizontal: s(16) },
      card: {
        flexDirection: 'row' as const,
        alignItems: 'center',
        padding: s(14),
        borderRadius: s(10),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.screen,
        gap: s(12)
      },
      iconBox: {
        width: s(38),
        height: s(38),
        borderRadius: s(9),
        backgroundColor: `${colors.teal}15`,
        alignItems: 'center',
        justifyContent: 'center'
      },
      cardTitle: {
        fontSize: s(14),
        fontWeight: '700' as const,
        color: colors.heading,
        marginBottom: s(2)
      },
      cardDesc: { fontSize: s(12), color: colors.muted },
      footer: {
        backgroundColor: colors.screen,
        paddingTop: s(10),
        paddingBottom: s(24),
        paddingHorizontal: s(16),
        borderTopWidth: 1,
        borderTopColor: colors.border,
        marginTop: s(8)
      },
      cancelBtn: {
        flexDirection: 'row' as const,
        justifyContent: 'center',
        paddingVertical: s(10),
        backgroundColor: colors.panel,
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: colors.border,
        gap: s(6)
      }
    })

  const styles = getStyles()
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: s(100) }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <CreditCard size={s(22)} color={colors.teal} />
        </View>
        <Text style={styles.title}>Card Payment Options</Text>
        <Text style={styles.subtitle}>
          Choose how to process the card payment
        </Text>
      </View>

      <View style={styles.list}>
        {terminalReachable && (
          <TouchableOpacity
            style={styles.card}
            onPress={onSelectTerminal}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <Terminal size={s(18)} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Payment Terminal</Text>
              <Text style={styles.cardDesc}>
                Process via connected terminal
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.card}
          onPress={onSelectManual}
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          <View style={styles.iconBox}>
            <Smartphone size={s(18)} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Manual Entry</Text>
            <Text style={styles.cardDesc}>
              Enter card details manually
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          <Text style={{ color: colors.muted, fontWeight: '600', fontSize: s(13) }}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

export default CardPaymentOptions