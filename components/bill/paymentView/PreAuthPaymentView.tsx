// ============================================================
// Pre-Auth Payment View — Open Tab / Increase Tab / Close Tab
// ============================================================

import { useUiScale } from '@/lib/uiScale'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { DejavooSpinAPI } from '@/lib/payments/dejavoo-spin-api'
import { colors } from '@/lib/theme'
import { toastService } from '@/lib/toastService'
import {
  closeTab,
  increaseTab,
  openTab,
  releaseTab
} from '@/services/preAuthService'
import { getSharedCastlesService } from '@/services/terminals/castles-service'
import { getSharedValorService } from '@/services/terminals/valor-service'
import {
  useActiveOrder,
  useActiveOrderTotals,
  useHasActivePreAuth,
  useOrderPreAuth
} from '@/stores/selectors/orderSelectors'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { CASTLES_DEFAULT_PORT } from '@/types/castles'
import { VALOR_DEFAULT_PORT } from '@/types/valor'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  CreditCard,
  TrendingUp,
  XCircle
} from 'lucide-react-native'
import React, { useRef, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

const PreAuthPaymentView: React.FC = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const setView = usePaymentStore(s => s.setView)
  const close = usePaymentStore(s => s.close)
  const preAuthMode = usePaymentStore(s => s.preAuthMode)
  const setPreAuthMode = usePaymentStore(s => s.setPreAuthMode)
  const setTransactionProcessing = usePaymentStore(
    s => s.setTransactionProcessing
  )

  const activeOrder = useActiveOrder()
  const orderId = activeOrder?.id
  const totals = useActiveOrderTotals()
  const preAuth = useOrderPreAuth(orderId)
  const hasPreAuth = useHasActivePreAuth(orderId)

  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const defaultAmount = useLocationConfigStore(
    s => s.config.preAuth.defaultAmount
  )
  const tipPresetPercentages = useLocationConfigStore(
    s => s.config.tips.presetPercentages
  )

  const supabase = useSupabaseClient()

  // Determine mode from state
  const mode = preAuthMode ?? (hasPreAuth ? 'capture' : 'open')

  const [amount, setAmount] = useState(() => {
    if (mode === 'open') return String(defaultAmount)
    if (mode === 'increment')
      return String(preAuth?.preAuthAmount ?? defaultAmount)
    // Capture mode: default to remaining balance
    return String(totals?.amountDue ?? totals?.total ?? 0)
  })
  const [tipAmount, setTipAmount] = useState('0')
  const [selectedTipPreset, setSelectedTipPreset] = useState<number | null>(
    null
  )
  const [isProcessing, setIsProcessing] = useState(false)

  // Tracks the in-flight pre-auth so handleBack can best-effort cancel it.
  // refId is the Dejavoo ReferenceId used for /v2/Payment/AbortTransaction;
  // Castles cancels by force-closing the TCP socket (suspend()), no refId needed.
  const inFlightRef = useRef<{
    refId: string | null
    cancelled: boolean
  } | null>(null)

  const parsedAmount = parseFloat(amount) || 0
  const parsedTip = parseFloat(tipAmount) || 0

  const handleTipPreset = (percent: number) => {
    const calculated = (percent / 100) * parsedAmount
    setTipAmount(calculated.toFixed(2))
    setSelectedTipPreset(percent)
  }

  const handleTipChange = (value: string) => {
    setTipAmount(value)
    setSelectedTipPreset(null)
  }

  // Tab exceeds hold warning
  const outstandingAmount = totals?.amountDue ?? totals?.total ?? 0
  const exceedsHold =
    hasPreAuth && totals && preAuth
      ? outstandingAmount > (preAuth.preAuthAmount ?? 0)
      : false

  const cancelInFlightTransaction = async () => {
    const terminal = selectedStation?.payment_terminal
    if (!terminal) return

    if (terminal.terminal_type === 'castles') {
      const service = getSharedCastlesService()
      try {
        await service.suspend()
      } catch (e) {
        console.warn('[PreAuthPaymentView] Castles suspend failed', e)
      }
      service.resume()
      return
    }

    if (terminal.terminal_type === 'valor') {
      const refId = inFlightRef.current?.refId
      if (refId) {
        try {
          await getSharedValorService().cancelInFlight(refId)
        } catch (e) {
          console.warn('[PreAuthPaymentView] Valor cancel failed', e)
        }
      }
      return
    }

    const refId = inFlightRef.current?.refId
    if (!refId) return
    try {
      const api = new DejavooSpinAPI(supabase)
      await api.loadTerminal(terminal.id || '', terminal)
      await api.abortTransaction().referenceId(refId).execute()
    } catch (e) {
      console.warn('[PreAuthPaymentView] Dejavoo abort failed', e)
    }
  }

  const handleBack = async () => {
    if (isProcessing) {
      if (inFlightRef.current) inFlightRef.current.cancelled = true
      toastService.show({
        title: 'Cancelling…',
        message: 'Aborting transaction on terminal',
        type: 'warning'
      })
      await cancelInFlightTransaction()
      toastService.show({
        title: 'Transaction Cancelled',
        message: 'If a hold was placed, void it from the terminal directly.',
        type: 'warning',
        duration: 5000
      })
    }
    setPreAuthMode(null)
    setView('payment-method-selection')
  }

  /**
   * Build a terminal instance from the station's payment_terminal config.
   * Follows the same pattern as CardPaymentView.
   */
  const buildTerminalInstance = async () => {
    const terminal = selectedStation?.payment_terminal
    if (!terminal) {
      throw new Error('No payment terminal selected')
    }

    // Valor open-tab: connect the shared Valor service (mirrors the proven
    // Valor sale path in CardPaymentView). The counter-based referenceId is
    // minted inside preAuthService's Valor branches, which need terminalId.
    if (terminal.terminal_type === 'valor') {
      const isUsb = terminal.connection_type === 'usb'
      const host = isUsb ? undefined : terminal.ip_address
      if (!isUsb && !host)
        throw new Error('Valor terminal has no IP address configured')
      const port = isUsb ? undefined : (terminal.port ?? VALOR_DEFAULT_PORT)

      const service = getSharedValorService()
      if (service.isSuspended()) service.resume()
      await service.connect({
        connectionType: isUsb ? 'usb' : 'local_socket',
        host,
        port,
        cancelPort: terminal.cancel_port,
        epi: terminal.epi,
        timeout: 120_000,
        terminalId: terminal.id
      })

      return { type: 'valor' as const, service, terminalId: terminal.id }
    }

    if (terminal.terminal_type === 'castles') {
      const isUsb = terminal.connection_type === 'usb'
      const host = isUsb ? undefined : terminal.ip_address
      if (!isUsb && !host)
        throw new Error('Castles terminal has no IP address configured')
      const port = isUsb ? undefined : (terminal.port ?? CASTLES_DEFAULT_PORT)

      const service = getSharedCastlesService()
      await service.connect({
        connectionType: isUsb ? 'usb' : 'local_socket',
        host,
        port,
        timeout: 120_000,
        terminalId: terminal.id
      })
      await service.resetTerminalState()

      return { type: 'castles' as const, service }
    } else {
      const api = new DejavooSpinAPI(supabase)
      const loaded = await api.loadTerminal(terminal.id || '', terminal)
      if (!loaded) throw new Error('Failed to load terminal credentials')

      return { type: 'dejavoo' as const, api }
    }
  }

  const handleOpenTab = async () => {
    if (!orderId || parsedAmount <= 0) {
      toastService.show({
        title: 'Invalid Amount',
        message: 'Enter a valid hold amount',
        type: 'error'
      })
      return
    }

    if (!selectedStation?.payment_terminal) {
      toastService.show({
        title: 'No Terminal',
        message: 'No payment terminal selected',
        type: 'error'
      })
      return
    }

    inFlightRef.current = { refId: null, cancelled: false }
    setIsProcessing(true)
    setTransactionProcessing(true)

    try {
      toastService.show({
        title: 'Present Card',
        message: `Hold $${parsedAmount.toFixed(
          2
        )} — tap or insert card on terminal`,
        type: 'warning',
        duration: 5000
      })

      const terminalInstance = await buildTerminalInstance()
      const result = await openTab(
        orderId,
        parsedAmount,
        terminalInstance,
        supabase,
        id => {
          if (inFlightRef.current) inFlightRef.current.refId = id
        }
      )

      if (!result.success) {
        throw new Error(result.error || 'Pre-auth declined')
      }

      toastService.show({
        title: 'Tab Opened',
        message: `$${parsedAmount.toFixed(2)} hold placed successfully`,
        type: 'success'
      })
      close()
    } catch (err) {
      if (inFlightRef.current?.cancelled) return
      const msg = err instanceof Error ? err.message : 'Failed to open tab'
      toastService.show({
        title: 'Pre-Auth Failed',
        message: msg,
        type: 'error'
      })
    } finally {
      inFlightRef.current = null
      setIsProcessing(false)
      setTransactionProcessing(false)
    }
  }

  const handleIncreaseTab = async () => {
    if (!orderId || !preAuth?.id || parsedAmount <= 0) return

    if (!selectedStation?.payment_terminal) {
      toastService.show({
        title: 'No Terminal',
        message: 'No payment terminal selected',
        type: 'error'
      })
      return
    }

    inFlightRef.current = { refId: null, cancelled: false }
    setIsProcessing(true)
    setTransactionProcessing(true)

    try {
      toastService.show({
        title: 'Increasing Hold',
        message: `Updating hold to $${parsedAmount.toFixed(2)}...`,
        type: 'warning'
      })

      const terminalInstance = await buildTerminalInstance()
      const result = await increaseTab(
        orderId,
        preAuth.id,
        parsedAmount,
        terminalInstance,
        supabase,
        id => {
          if (inFlightRef.current) inFlightRef.current.refId = id
        }
      )

      if (!result.success) {
        throw new Error(result.error || 'Incremental auth failed')
      }

      toastService.show({
        title: 'Hold Updated',
        message: `Hold increased to $${parsedAmount.toFixed(2)}`,
        type: 'success'
      })
      setPreAuthMode('capture')
    } catch (err) {
      if (inFlightRef.current?.cancelled) return
      const msg = err instanceof Error ? err.message : 'Failed to increase tab'
      toastService.show({
        title: 'Increment Failed',
        message: msg,
        type: 'error'
      })
    } finally {
      inFlightRef.current = null
      setIsProcessing(false)
      setTransactionProcessing(false)
    }
  }

  const handleCloseTab = async () => {
    if (!orderId || !preAuth?.id) return

    if (!selectedStation?.payment_terminal) {
      toastService.show({
        title: 'No Terminal',
        message: 'No payment terminal selected',
        type: 'error'
      })
      return
    }

    inFlightRef.current = { refId: null, cancelled: false }
    setIsProcessing(true)
    setTransactionProcessing(true)

    try {
      toastService.show({
        title: 'Capturing Payment',
        message: `Charging $${(parsedAmount + parsedTip).toFixed(2)}...`,
        type: 'warning'
      })

      const terminalInstance = await buildTerminalInstance()
      const result = await closeTab(
        orderId,
        preAuth.id,
        parsedAmount,
        parsedTip,
        terminalInstance,
        supabase,
        id => {
          if (inFlightRef.current) inFlightRef.current.refId = id
        }
      )

      if (!result.success) {
        throw new Error(result.error || 'Capture failed')
      }

      toastService.show({
        title: 'Payment Captured',
        message: `$${(result.capturedAmount! + (result.tipAmount ?? 0)).toFixed(
          2
        )} charged successfully`,
        type: 'success'
      })
      setView('success')
    } catch (err) {
      if (inFlightRef.current?.cancelled) return
      const msg = err instanceof Error ? err.message : 'Failed to close tab'
      toastService.show({
        title: 'Capture Failed',
        message: msg,
        type: 'error'
      })
    } finally {
      inFlightRef.current = null
      setIsProcessing(false)
      setTransactionProcessing(false)
    }
  }

  const handleReleaseTab = async () => {
    if (!orderId || !preAuth?.id) return

    if (!selectedStation?.payment_terminal) {
      toastService.show({
        title: 'No Terminal',
        message: 'No payment terminal selected',
        type: 'error'
      })
      return
    }

    inFlightRef.current = { refId: null, cancelled: false }
    setIsProcessing(true)
    setTransactionProcessing(true)

    try {
      toastService.show({
        title: 'Releasing Hold',
        message: 'Voiding pre-authorization...',
        type: 'warning'
      })

      const terminalInstance = await buildTerminalInstance()
      const result = await releaseTab(
        orderId,
        preAuth.id,
        terminalInstance,
        supabase,
        id => {
          if (inFlightRef.current) inFlightRef.current.refId = id
        }
      )

      if (!result.success) {
        throw new Error(result.error || 'Failed to release hold')
      }

      toastService.show({
        title: 'Tab Released',
        message: 'Pre-authorization hold has been voided',
        type: 'success'
      })
      setPreAuthMode(null)
      setView('payment-method-selection')
    } catch (err) {
      if (inFlightRef.current?.cancelled) return
      const msg = err instanceof Error ? err.message : 'Failed to release tab'
      toastService.show({ title: 'Void Failed', message: msg, type: 'error' })
    } finally {
      inFlightRef.current = null
      setIsProcessing(false)
      setTransactionProcessing(false)
    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  const renderModeHeader = () => {
    switch (mode) {
      case 'open':
        return {
          title: 'Open Tab',
          subtitle: "Place a hold on customer's card",
          icon: CreditCard,
          color: colors.teal
        }
      case 'increment':
        return {
          title: 'Increase Tab',
          subtitle: 'Increase the card hold amount',
          icon: TrendingUp,
          color: colors.warning
        }
      case 'capture':
        return {
          title: 'Close Tab',
          subtitle: 'Capture the final payment',
          icon: CheckCircle,
          color: colors.success
        }
      default:
        return {
          title: 'Pre-Auth',
          subtitle: '',
          icon: CreditCard,
          color: colors.teal
        }
    }
  }

  const header = renderModeHeader()
  const HeaderIcon = header.icon

  const styles = getStyles(uiScale)
  const ss = (n: number) => Math.round(n * uiScale)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
        >
          <ArrowLeft size={ss(18)} color={colors.label} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{header.title}</Text>
          <Text style={styles.headerSub}>{header.subtitle}</Text>
        </View>
        <View
          style={[
            styles.iconBadge,
            { backgroundColor: `${header.color}20` }
          ]}
        >
          <HeaderIcon size={ss(20)} color={header.color} />
        </View>
      </View>

      {/* Exceed Warning */}
      {exceedsHold && preAuth && (
        <View style={styles.warningBanner}>
          <AlertTriangle size={ss(16)} color={colors.warning} />
          <Text style={styles.warningText}>
            Tab (${outstandingAmount.toFixed(2)}) exceeds hold ($
            {preAuth.preAuthAmount?.toFixed(2)})
          </Text>
          {preAuth.preAuthTerminalType === 'castles' && (
            <TouchableOpacity
              onPress={() => {
                setPreAuthMode('increment')
                setAmount(String(totals?.amountDue ?? totals?.total ?? 0))
              }}
              style={styles.warningAction}
            >
              <Text style={styles.warningActionText}>Increase Hold</Text>
            </TouchableOpacity>
          )}
          {(preAuth.preAuthTerminalType === 'dejavoo' ||
            preAuth.preAuthTerminalType === 'valor') && (
            <Text style={styles.warningInfo}>
              Hold will be adjusted at close
            </Text>
          )}
        </View>
      )}

      {/* Active Pre-Auth Info */}
      {hasPreAuth && preAuth && mode !== 'open' && (
        <View style={styles.preAuthInfo}>
          <View style={styles.preAuthRow}>
            <Text style={styles.preAuthLabel}>Current Hold</Text>
            <Text style={styles.preAuthValue}>
              ${preAuth.preAuthAmount?.toFixed(2)}
            </Text>
          </View>
          <View style={styles.preAuthRow}>
            <Text style={styles.preAuthLabel}>Terminal</Text>
            <Text style={styles.preAuthValue}>
              {preAuth.preAuthTerminalType === 'castles'
                ? 'Castles'
                : preAuth.preAuthTerminalType === 'valor'
                ? 'Valor'
                : 'Dejavoo'}
            </Text>
          </View>
          {preAuth.preAuthRrn && (
            <View style={styles.preAuthRow}>
              <Text style={styles.preAuthLabel}>RRN</Text>
              <Text style={styles.preAuthValue}>{preAuth.preAuthRrn}</Text>
            </View>
          )}
        </View>
      )}

      {/* Amount Input */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>
          {mode === 'open'
            ? 'Hold Amount'
            : mode === 'increment'
            ? 'New Hold Amount'
            : 'Charge Amount'}
        </Text>
        <View style={styles.amountRow}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType='decimal-pad'
            placeholder='0.00'
            placeholderTextColor={colors.muted}
            editable={!isProcessing}
          />
        </View>
      </View>

      {/* Tip Input (capture mode only) */}
      {mode === 'capture' && (
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Tip Amount</Text>
          {tipPresetPercentages?.length > 0 && (
            <View style={styles.tipPresetRow}>
              {tipPresetPercentages.map(percent => {
                const isActive = selectedTipPreset === percent
                return (
                  <TouchableOpacity
                    key={percent}
                    onPress={() => handleTipPreset(percent)}
                    disabled={isProcessing || parsedAmount <= 0}
                    style={[
                      styles.tipPresetBtn,
                      isActive && styles.tipPresetBtnActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.tipPresetPercent,
                        isActive && { color: colors.heading }
                      ]}
                    >
                      {percent}%
                    </Text>
                    <Text
                      style={[
                        styles.tipPresetAmount,
                        isActive && { color: colors.teal }
                      ]}
                    >
                      ${((percent / 100) * parsedAmount).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
          <View style={styles.amountRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={tipAmount}
              onChangeText={handleTipChange}
              keyboardType='decimal-pad'
              placeholder='0.00'
              placeholderTextColor={colors.muted}
              editable={!isProcessing}
            />
          </View>
          {parsedTip > 0 && (
            <Text style={styles.totalText}>
              Total: ${(parsedAmount + parsedTip).toFixed(2)}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.footer}>
        {mode === 'open' && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.teal }]}
            onPress={handleOpenTab}
            disabled={isProcessing || parsedAmount <= 0}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator color={colors.onSolid} />
            ) : (
              <Text style={styles.primaryBtnText}>
                Hold Card — ${parsedAmount.toFixed(2)}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {mode === 'increment' && (
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.warning }
            ]}
            onPress={handleIncreaseTab}
            disabled={isProcessing || parsedAmount <= 0}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator color='#fff' />
            ) : (
              <Text style={styles.primaryBtnText}>
                Increase to ${parsedAmount.toFixed(2)}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {mode === 'capture' && (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.success }]}
              onPress={handleCloseTab}
              disabled={isProcessing || parsedAmount <= 0}
              activeOpacity={0.8}
            >
              {isProcessing ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <Text style={styles.primaryBtnText}>
                  Charge ${(parsedAmount + parsedTip).toFixed(2)}
                </Text>
              )}
            </TouchableOpacity>

            {/* Secondary actions for capture mode */}
            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setPreAuthMode('increment')
                  setAmount(String(totals?.amountDue ?? totals?.total ?? 0))
                }}
                disabled={isProcessing}
              >
                <TrendingUp size={ss(14)} color={colors.warning} />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    { color: colors.warning }
                  ]}
                >
                  Increase Tab
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleReleaseTab}
                disabled={isProcessing}
              >
                <XCircle size={ss(14)} color={colors.danger} />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    { color: colors.danger }
                  ]}
                >
                  Release Tab
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  )
}

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
      width: s(30),
      height: s(30),
      borderRadius: s(8),
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: s(10)
    },
    headerTitle: { fontSize: s(15), fontWeight: '700', color: colors.heading },
    headerSub: { fontSize: s(11), color: colors.muted, marginTop: 1 },
    iconBadge: {
      width: s(36),
      height: s(36),
      borderRadius: s(18),
      alignItems: 'center',
      justifyContent: 'center'
    },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: s(10),
      marginHorizontal: s(14),
      marginTop: s(10),
      backgroundColor: `${colors.warning}15`,
      borderRadius: s(8),
      borderWidth: 1,
      borderColor: `${colors.warning}40`,
      gap: s(8)
    },
    warningText: {
      flex: 1,
      fontSize: s(12),
      color: colors.warning,
      fontWeight: '600'
    },
    warningAction: {
      paddingHorizontal: s(10),
      paddingVertical: s(4),
      backgroundColor: `${colors.warning}30`,
      borderRadius: s(6)
    },
    warningActionText: {
      fontSize: s(11),
      fontWeight: '700',
      color: colors.warning
    },
    warningInfo: { fontSize: s(11), color: colors.muted, fontStyle: 'italic' },
    preAuthInfo: {
      margin: s(14),
      padding: s(12),
      backgroundColor: colors.panel,
      borderRadius: s(10),
      borderWidth: 1,
      borderColor: colors.border,
      gap: s(6)
    },
    preAuthRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    preAuthLabel: { fontSize: s(12), color: colors.muted },
    preAuthValue: { fontSize: s(12), fontWeight: '600', color: colors.heading },
    inputSection: {
      paddingHorizontal: s(14),
      paddingTop: s(16)
    },
    inputLabel: {
      fontSize: s(12),
      fontWeight: '600',
      color: colors.muted,
      marginBottom: s(8),
      textTransform: 'uppercase',
      letterSpacing: 0.5
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.panel,
      borderRadius: s(10),
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: s(14)
    },
    dollarSign: {
      fontSize: s(22),
      fontWeight: '700',
      color: colors.heading,
      marginRight: s(4)
    },
    amountInput: {
      flex: 1,
      fontSize: s(22),
      fontWeight: '700',
      color: colors.heading,
      paddingVertical: s(12)
    },
    totalText: {
      fontSize: s(13),
      fontWeight: '600',
      color: colors.teal,
      marginTop: s(8),
      textAlign: 'right'
    },
    tipPresetRow: {
      flexDirection: 'row',
      gap: s(6),
      marginBottom: s(8)
    },
    tipPresetBtn: {
      flex: 1,
      paddingVertical: s(8),
      borderRadius: s(8),
      borderWidth: 1,
      backgroundColor: colors.panel,
      borderColor: colors.border,
      alignItems: 'center'
    },
    tipPresetBtnActive: {
      backgroundColor: `${colors.teal}15`,
      borderColor: colors.teal
    },
    tipPresetPercent: {
      fontSize: s(13),
      fontWeight: '700',
      color: colors.muted
    },
    tipPresetAmount: {
      fontSize: s(10),
      marginTop: 1,
      color: colors.muted
    },
    footer: {
      paddingHorizontal: s(14),
      paddingTop: s(20),
      paddingBottom: s(20),
      gap: s(10)
    },
    primaryBtn: {
      paddingVertical: s(14),
      borderRadius: s(10),
      alignItems: 'center',
      justifyContent: 'center'
    },
    primaryBtnText: {
      fontSize: s(15),
      fontWeight: '700',
      color: colors.onSolid
    },
    secondaryActions: {
      flexDirection: 'row',
      gap: s(10),
      marginTop: s(4)
    },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(6),
      paddingVertical: s(10),
      borderRadius: s(8),
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel
    },
    secondaryBtnText: {
      fontSize: s(12),
      fontWeight: '600'
    }
  })
}

export default PreAuthPaymentView
