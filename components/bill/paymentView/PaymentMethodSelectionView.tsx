import { useUiScale } from '@/lib/uiScale'
import { INKIND_LABEL } from '@/lib/paymentMethod'
import { colors } from '@/lib/theme'
import {
  useActiveOrder,
  useHasActivePreAuth,
  useOrderPreAuth
} from '@/stores/selectors/orderSelectors'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { PaymentView, usePaymentStore } from '@/stores/usePaymentStore'
import { VALOR_OPEN_TAB_ENABLED } from '@/services/preAuthService'
import { useActiveProcessor } from '@/hooks/useActiveProcessor'
import {
  Banknote,
  CheckCircle2,
  Columns,
  CreditCard,
  HandHeart,
  Keyboard,
  Lock
} from 'lucide-react-native'
import React, { useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

type PaymentMethod =
  | 'Card Reader'
  | 'Manual Key-in'
  | 'Split'
  | 'Cash'
  | typeof INKIND_LABEL
  | 'Open Tab'
  | 'Close Tab'

const getStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale)
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.screen },
    header: {
      alignItems: 'center',
      paddingVertical: s(14),
      paddingHorizontal: s(16)
    },
    title: {
      fontSize: s(15),
      fontWeight: '700',
      color: colors.heading,
      marginBottom: s(3)
    },
    subtitle: { fontSize: s(12), color: colors.muted },
    list: { gap: s(8), paddingHorizontal: s(16) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: s(12),
      borderRadius: s(10),
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel
    },
    cardActive: {
      borderColor: colors.teal,
      backgroundColor: `${colors.teal}10`
    },
    iconBox: {
      width: s(36),
      height: s(36),
      borderRadius: s(9),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.border}60`,
      marginRight: s(12)
    },
    iconBoxActive: { backgroundColor: `${colors.teal}20` },
    methodTitle: { fontSize: s(13), fontWeight: '600', color: colors.muted },
    methodTitleActive: { color: colors.heading },
    methodDesc: { fontSize: s(11), color: colors.muted, marginTop: 1 },
    methodDescActive: { color: colors.teal },
    // ── inKind: black/yellow field pair from the palette (dark = black field
    // + yellow on; light inverts). Overrides the shared teal treatment in
    // BOTH resting and selected states so the tile is unmistakable — it
    // settles a check without taking money.
    inKindCard: {
      backgroundColor: colors.inKindField,
      borderColor: colors.inKindOn
    },
    inKindCardActive: {
      backgroundColor: colors.inKindField,
      borderColor: colors.inKindOn,
      borderWidth: 2
    },
    inKindIconBox: { backgroundColor: `${colors.inKindOn}22` },
    inKindTitle: { color: colors.inKindOn, fontWeight: "700" as const },
    inKindDesc: { color: `${colors.inKindOn}B3` },
    inKindRadio: { borderColor: colors.inKindOn },
    radio: {
      width: s(18),
      height: s(18),
      borderRadius: s(9),
      borderWidth: 1.5,
      borderColor: colors.border
    },
    footer: {
      paddingHorizontal: s(16),
      paddingTop: s(10),
      paddingBottom: s(20),
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.screen,
      flexDirection: 'row',
      gap: s(10)
    },
    backBtn: {
      flex: 1,
      paddingVertical: s(10),
      borderRadius: s(8),
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      alignItems: 'center'
    },
    proceedBtn: {
      flex: 1,
      paddingVertical: s(10),
      borderRadius: s(8),
      backgroundColor: colors.teal,
      alignItems: 'center'
    }
  })
}

const PaymentMethodSelectionView: React.FC = () => {
  const uiScale = useUiScale()
  const setView = usePaymentStore(s => s.setView)
  const close = usePaymentStore(s => s.close)
  const markPaymentAsDirty = usePaymentStore(s => s.markPaymentAsDirty)
  const activeSplitId = usePaymentStore(s => s.activeSplitId)
  const splits = usePaymentStore(s => s.splits)
  const splitSourceView = usePaymentStore(s => s.splitSourceView)
  const setPreAuthMode = usePaymentStore(s => s.setPreAuthMode)

  const activeOrder = useActiveOrder()
  const hasPreAuth = useHasActivePreAuth(activeOrder?.id)
  const preAuth = useOrderPreAuth(activeOrder?.id)
  const preAuthEnabled = useLocationConfigStore(s => s.config.preAuth.enabled)

  // Open Tab (pre-auth) is temporarily disabled on Valor terminals (perf).
  // Close/Release of an existing hold stay available.
  const terminalType = useStoreSettingsStore(
    s => s.selectedStation?.payment_terminal?.terminal_type
  )
  // ATOM (Landi P30) has no pre-auth capability — the on-device processor only
  // supports immediate-capture sales, so there's no APPROVED auth to hold. Hide
  // Open Tab whenever ATOM is the active processor (same treatment as the Valor
  // perf kill-switch). Uses the active processor, not the configured terminal,
  // because a NEW hold routes to whatever device services new sales.
  const activeProcessorType = useActiveProcessor().activeType
  const openTabDisabledForTerminal =
    (terminalType === 'valor' && !VALOR_OPEN_TAB_ENABLED) ||
    activeProcessorType === 'atom'

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    hasPreAuth ? 'Close Tab' : 'Card Reader'
  )

  const activeSplit = splits.find(s => s.id === activeSplitId)

  const paymentMethods: Array<{
    name: PaymentMethod
    icon: any
    title: string
    description: string
    view: PaymentView
  }> = [
    ...(hasPreAuth
      ? [
          {
            name: 'Close Tab' as PaymentMethod,
            icon: Lock,
            title: 'Close Tab',
            description: `Capture $${
              preAuth?.preAuthAmount?.toFixed(2) ?? '0.00'
            } hold + tip`,
            view: 'pre-auth' as PaymentView
          }
        ]
      : []),
    {
      name: 'Card Reader' as PaymentMethod,
      icon: CreditCard,
      title: 'Card Reader',
      description: 'Credit, Debit, or Corporate Cards',
      view: 'card' as PaymentView
    },
    {
      name: 'Manual Key-in' as PaymentMethod,
      icon: Keyboard,
      title: 'Manual Key-in',
      description: 'Manually enter card details',
      view: 'manual' as PaymentView
    },
    ...(!hasPreAuth
      ? [
          {
            name: 'Split' as PaymentMethod,
            icon: Columns,
            title: 'Split Bill',
            description: 'Split by amount, item, or evenly',
            view: 'split-options' as PaymentView
          }
        ]
      : []),
    {
      name: 'Cash' as PaymentMethod,
      icon: Banknote,
      title: 'Cash',
      description: 'Standard cash transaction',
      view: 'cash' as PaymentView
    },
    // Non-tender settlement: closes the check at card pricing with no money
    // collected. Hidden during a split — an in-kind portion of a split check
    // has no defined meaning here, and the split branch would price and
    // report it inconsistently.
    {
      name: INKIND_LABEL as PaymentMethod,
      icon: HandHeart,
      title: INKIND_LABEL,
      description: 'Settle at menu price — no payment collected',
      view: 'inkind' as PaymentView
    },
    ...(!hasPreAuth && preAuthEnabled && !openTabDisabledForTerminal
      ? [
          {
            name: 'Open Tab' as PaymentMethod,
            icon: Lock,
            title: 'Open Tab',
            description: 'Pre-authorize and charge later',
            view: 'pre-auth' as PaymentView
          }
        ]
      : [])
  ]

  const availableMethods = paymentMethods.filter(
    m =>
      !(
        activeSplit &&
        (m.name === 'Split' ||
          m.name === INKIND_LABEL ||
          m.name === 'Open Tab' ||
          m.name === 'Close Tab')
      )
  )

  const handleProceed = () => {
    const selected = availableMethods.find(p => p.name === selectedMethod)
    if (selected) {
      markPaymentAsDirty()
      // Set pre-auth mode before navigating
      if (selected.name === 'Open Tab') setPreAuthMode('open')
      else if (selected.name === 'Close Tab') setPreAuthMode('capture')
      else setPreAuthMode(null)
      setView(selected.view)
    }
  }

  const handleBack = () => {
    usePaymentStore.setState({ activeSplitId: null })
    setView(splitSourceView || 'split-options')
  }

  const s = (n: number) => Math.round(n * uiScale)
  const styles = getStyles(uiScale)

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: s(20) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            {activeSplit
              ? `Payment for ${activeSplit.customerName}`
              : 'Select Payment Method'}
          </Text>
          <Text style={styles.subtitle}>
            {activeSplit
              ? `Amount Due: $${activeSplit.amount.toFixed(2)}`
              : 'Choose how the customer would like to pay'}
          </Text>
        </View>

        <View style={styles.list}>
          {availableMethods.map(method => {
            const isSelected = selectedMethod === method.name
            const Icon = method.icon
            // inKind carries its own black/yellow identity in every state.
            const isInKind = method.name === INKIND_LABEL
            const iconColor = isInKind
              ? colors.inKindOn
              : isSelected
                ? colors.teal
                : colors.label
            return (
              <TouchableOpacity
                key={method.name}
                onPress={() => setSelectedMethod(method.name)}
                activeOpacity={0.8}
                style={[
                  styles.card,
                  isSelected && styles.cardActive,
                  isInKind && styles.inKindCard,
                  isInKind && isSelected && styles.inKindCardActive
                ]}
              >
                <View
                  style={[
                    styles.iconBox,
                    isSelected && styles.iconBoxActive,
                    isInKind && styles.inKindIconBox
                  ]}
                >
                  <Icon color={iconColor} size={s(16)} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.methodTitle,
                      isSelected && styles.methodTitleActive,
                      isInKind && styles.inKindTitle
                    ]}
                  >
                    {method.title}
                  </Text>
                  <Text
                    style={[
                      styles.methodDesc,
                      isSelected && styles.methodDescActive,
                      isInKind && styles.inKindDesc
                    ]}
                  >
                    {method.description}
                  </Text>
                </View>
                <View style={{ marginLeft: s(12) }}>
                  {isSelected ? (
                    <CheckCircle2
                      size={s(18)}
                      color={isInKind ? colors.inKindOn : colors.teal}
                      fill={isInKind ? colors.inKindOn : colors.teal}
                      stroke={isInKind ? colors.inKindField : colors.screen}
                    />
                  ) : (
                    <View
                      style={[styles.radio, isInKind && styles.inKindRadio]}
                    />
                  )}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (activeSplit ? handleBack() : close())}
        >
          <Text
            style={{ color: colors.heading, fontWeight: '600', fontSize: s(13) }}
          >
            {activeSplit ? 'Back' : 'Cancel'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.proceedBtn}
          onPress={handleProceed}
        >
          <Text
            style={{ color: colors.onSolid, fontWeight: '700', fontSize: s(13) }}
          >
            Proceed
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default PaymentMethodSelectionView
