import { useUiScale } from '@/lib/uiScale'
import { colors } from '@/lib/theme'
import { SPLIT_PATH_LABELS, SplitPaymentPath } from '@/lib/types'
import {
  useActiveOrder,
  useHasActivePreAuth
} from '@/stores/selectors/orderSelectors'
import { usePaymentStore } from '@/stores/usePaymentStore'
import {
  ArrowLeft,
  ListChecks,
  Lock,
  Receipt,
  Split,
  Users
} from 'lucide-react-native'
import React from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

const getStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale)
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.screen },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s(14),
      paddingVertical: s(12),
      borderBottomWidth: 1,
      borderBottomColor: colors.border
    },
    backBtn: {
      width: s(32),
      height: s(32),
      borderRadius: s(10),
      backgroundColor: `${colors.teal}10`,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: s(10)
    },
    headerTitle: { fontSize: s(15), fontWeight: '700', color: colors.heading },
    headerSub: { fontSize: s(11), color: colors.muted, marginTop: 1 },
    grid: { flexDirection: 'row', gap: s(10) },
    card: {
      flex: 1,
      backgroundColor: colors.panel,
      borderRadius: s(12),
      padding: s(14),
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'space-between',
      minHeight: s(110)
    },
    iconBox: {
      width: s(32),
      height: s(32),
      borderRadius: s(8),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: s(10)
    },
    cardTitle: {
      fontSize: s(13),
      fontWeight: '700',
      color: colors.heading,
      marginBottom: s(3)
    },
    cardDesc: { fontSize: s(11), color: colors.muted, lineHeight: s(15) },
    lockBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(10),
      backgroundColor: `${colors.warning}15`,
      borderWidth: 1,
      borderColor: `${colors.warning}40`,
      borderRadius: s(10),
      padding: s(12),
      marginBottom: s(4)
    },
    lockBannerText: {
      flex: 1,
      fontSize: s(12),
      color: colors.heading,
      lineHeight: s(17)
    }
  })
}

type OptionDef = {
  title: string
  desc: string
  icon: typeof ListChecks
  color: string
  bg: string
  view: SplitPaymentPath
}

const SplitOptionsView: React.FC = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const setView = usePaymentStore(state => state.setView)
  const activeOrder = useActiveOrder()
  const hasPreAuth = useHasActivePreAuth(activeOrder?.id)
  const lockedPath = activeOrder?.split_payment_path
  const styles = getStyles(uiScale)

  // Guard: pre-auth active → disable split options
  if (hasPreAuth) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setView('payment-method-selection')}
          >
            <ArrowLeft size={s(16)} color={colors.teal} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Split Bill</Text>
            <Text style={styles.headerSub}>
              Choose how to divide the payment.
            </Text>
          </View>
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: s(30)
          }}
        >
          <Lock size={s(32)} color={colors.muted} />
          <Text
            style={{
              color: colors.heading,
              fontSize: s(15),
              fontWeight: '700',
              marginTop: s(12),
              textAlign: 'center'
            }}
          >
            Split Payments Unavailable
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: s(13),
              marginTop: s(6),
              textAlign: 'center',
              lineHeight: s(18)
            }}
          >
            This order has an open tab (pre-authorization). Close or release the
            tab first to use split payments.
          </Text>
        </View>
      </View>
    )
  }

  const options: OptionDef[] = [
    {
      title: 'Split by Item',
      desc: 'Assign specific items to specific guests.',
      icon: ListChecks,
      color: colors.teal,
      bg: `${colors.info}15`,
      view: 'split-by-item'
    },
    {
      title: 'Split Evenly',
      desc: 'Divide the total equally among guests.',
      icon: Users,
      color: colors.teal,
      bg: `${colors.success}15`,
      view: 'split-evenly'
    },
    {
      title: 'Custom Amount',
      desc: 'Type exactly how much each person pays.',
      icon: Split,
      color: colors.teal,
      bg: `${colors.warning}15`,
      view: 'split-custom-amount'
    },
    {
      title: 'Pay for Items',
      desc: 'Select items to pay now, leave rest for later.',
      icon: Receipt,
      color: colors.teal,
      bg: `${colors.warning}15`,
      view: 'pay-for-items'
    }
  ]

  const renderCard = (opt: OptionDef) => {
    const isLocked = !!lockedPath && lockedPath !== opt.view
    const Icon = isLocked ? Lock : opt.icon
    const desc = isLocked
      ? 'Unavailable — different split method in use'
      : opt.desc

    return (
      <TouchableOpacity
        key={opt.title}
        style={[styles.card, isLocked && { opacity: 0.35 }]}
        onPress={() => setView(opt.view)}
        activeOpacity={0.8}
        disabled={isLocked}
      >
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: isLocked
                ? `${colors.muted}15`
                : `${colors.teal}15`
            }
          ]}
        >
          <Icon size={s(18)} color={isLocked ? colors.muted : opt.color} />
        </View>
        <View>
          <Text style={styles.cardTitle}>{opt.title}</Text>
          <Text style={styles.cardDesc}>{desc}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setView('payment-method-selection')}
        >
          <ArrowLeft size={s(18)} color={colors.teal} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Split Bill</Text>
          <Text style={styles.headerSub}>
            Choose how to divide the payment.
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: s(14), gap: s(10) }}
        showsVerticalScrollIndicator={false}
      >
        {lockedPath && (
          <View style={styles.lockBanner}>
            <Lock size={s(16)} color={colors.warning} />
            <Text style={styles.lockBannerText}>
              Split method locked to{' '}
              <Text style={{ fontWeight: '700' }}>
                {SPLIT_PATH_LABELS[lockedPath]}
              </Text>
              . Continue with this method or pay the full remaining amount.
            </Text>
          </View>
        )}
        <View style={styles.grid}>
          {options.slice(0, 2).map(renderCard)}
        </View>
        <View style={styles.grid}>
          {options.slice(2, 4).map(renderCard)}
        </View>
      </ScrollView>
    </View>
  )
}

export default SplitOptionsView
