import { useUiScale } from '@/lib/uiScale'
import { PaymentErrorModal } from '@/components/bill/paymentView/PaymentErrorModal'
import { TerminalDetachedModal } from '@/components/payment/TerminalDetachedModal'
import { TerminalStatusBanner } from '@/components/payment/TerminalStatusBanner'
import { TerminalWedgedModal } from '@/components/payment/TerminalWedgedModal'
import { useCFD } from '@/contexts/CFDProvider'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { useTerminalStatus } from '@/hooks/useTerminalStatus'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import {
  extractLast4,
  parseCastlesReturnCode
} from '@/services/terminals/castles-response-mapper'
import {
  failPaymentJournal,
  updatePaymentJournal,
  writePaymentJournal
} from '@/services/paymentJournal'
import { getSharedCastlesService } from '@/services/terminals/castles-service'
import { getOrCreateCounter } from '@/services/terminals/castles-txn-counter'
import {
  useActiveOrder,
  useActiveOrderTotals
} from '@/stores/selectors/orderSelectors'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { round2 } from '@/utils/money'
import { usePaymentTerminalStore } from '@/stores/usePaymentTerminalStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { CASTLES_DEFAULT_PORT } from '@/types/castles'
import { CheckCircle2, Keyboard, Wifi } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'

const ManualCardEntryView = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const supabase = useSupabaseClient()
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const orderTotals = useActiveOrderTotals()
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0
  const activeOrderTotal = orderTotals?.total ?? 0
  const activeOrder = useActiveOrder()

  const setView = usePaymentStore(s => s.setView)
  const close = usePaymentStore(s => s.close)
  const handlePaymentCompletion = usePaymentStore(
    s => s.handlePaymentCompletion
  )
  const activeSplitId = usePaymentStore(s => s.activeSplitId)
  const splits = usePaymentStore(s => s.splits)
  const expandSheetToFull = usePaymentStore(s => s.expandSheetToFull)
  const setTransactionProcessing = usePaymentStore(
    s => s.setTransactionProcessing
  )

  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)

  useEffect(() => {
    expandSheetToFull()
  }, [expandSheetToFull])

  const [status, setStatus] = useState<'ready' | 'processing' | 'success'>(
    'ready'
  )
  const [tipInput, setTipInput] = useState('')
  const [selectedTipPreset, setSelectedTipPreset] = useState<number | null>(
    null
  )
  const [errorModal, setErrorModal] = useState<{
    visible: boolean
    title: string
    message: string
  }>({
    visible: false,
    title: '',
    message: ''
  })
  const currentRefIdRef = useRef<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  // Terminal status
  const {
    status: terminalStatus,
    isReady: terminalReady,
    errorMessage: terminalErrorMessage,
    reason: terminalReason,
    consecutiveFailures: terminalConsecutiveFailures,
    recheckStatus
  } = useTerminalStatus(
    selectedStation?.payment_terminal?.id,
    selectedStation?.payment_terminal
  )

  const tipPresetPercentages = useLocationConfigStore(
    s => s.config.tips.presetPercentages
  )
  const TIP_PRESETS = tipPresetPercentages

  const { updateTip, showProcessing, showApproved, showDeclined, showIdle } =
    useCFD()

  // Sync isTransactionProcessing with status and error modal
  useEffect(() => {
    setTransactionProcessing(status === 'processing' || errorModal.visible)
    return () => {
      setTransactionProcessing(false)
    }
  }, [status, errorModal.visible, setTransactionProcessing])

  // Signal health check service to skip during active terminal interaction
  useEffect(() => {
    const isActive = status === 'processing'
    usePaymentTerminalStore.getState().setProcessingPayment(isActive)
    return () => {
      usePaymentTerminalStore.getState().setProcessingPayment(false)
    }
  }, [status])

  // Amount calculations
  const activeSplit = splits.find(s => s.id === activeSplitId)
  const effectiveOutstandingTotal =
    activeOrderOutstandingTotal > 0
      ? activeOrderOutstandingTotal
      : activeOrder?.amount_due !== undefined && activeOrder.amount_due >= 0.01
      ? activeOrder.amount_due
      : activeOrderTotal
  const totalToPay = activeSplit
    ? activeSplit.amount
    : effectiveOutstandingTotal
  const tipAmount = parseFloat(tipInput) || 0
  const grandTotal = totalToPay + tipAmount

  // CFD tip sync
  useEffect(() => {
    updateTip(tipAmount, selectedTipPreset)
  }, [tipAmount, selectedTipPreset, updateTip])

  useEffect(() => {
    return () => {
      updateTip(0, null)
    }
  }, [updateTip])

  const handleTipPreset = (percentage: number) => {
    const calculatedTip = round2((percentage / 100) * totalToPay)
    setTipInput(String(calculatedTip))
    setSelectedTipPreset(percentage)
  }

  const handleTipInputChange = (value: string) => {
    if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
      setTipInput(value)
      setSelectedTipPreset(null)
    }
  }

  // Process payment on Castles terminal
  useEffect(() => {
    if (status !== 'processing') return

    const processPayment = async () => {
      const terminal = selectedStation?.payment_terminal
      if (!terminal || terminal.terminal_type !== 'castles') {
        setErrorModal({
          visible: true,
          title: 'Terminal Not Configured',
          message:
            'Manual key-in requires a Castles terminal. Please configure one in station settings.'
        })
        return
      }

      const isUsb = terminal.connection_type === 'usb'
      const host = isUsb ? undefined : terminal.ip_address
      if (!isUsb && !host) {
        setErrorModal({
          visible: true,
          title: 'Terminal Error',
          message: 'Castles terminal has no IP address configured.'
        })
        return
      }
      const port = isUsb ? undefined : (terminal.port ?? CASTLES_DEFAULT_PORT)
      const tip = parseFloat(tipInput) || 0

      try {
        console.log('[ManualKeyIn] Castles sale flow:', {
          transport: isUsb ? 'usb' : 'local_socket',
          host,
          port,
          totalToPay,
          tipAmount: tip,
          grandTotal: totalToPay + tip
        })

        // 1. Connect + reset
        const service = getSharedCastlesService()
        await service.connect({
          connectionType: isUsb ? 'usb' : 'local_socket',
          host,
          port,
          timeout: 120_000,
          terminalId: terminal.id
        })
        await service.resetTerminalState()

        // 2. Get counter for txnPosTxnId
        const counter = getOrCreateCounter({
          terminalId: terminal.id,
          supabaseClient: supabase
        })
        if (!counter.isInitialized) await counter.initialize()
        const referenceId = counter.next()
        currentRefIdRef.current = referenceId

        // Wave Cat-B (TCP-in-flight crash recovery): write journal as
        // 'initiated' BEFORE the TCP send so a mid-call crash leaves a
        // recoverable trace for the relaunch reconciliation flow.
        const activeOrderForJournal = useOrderStore.getState().activeOrderId
        const orderForJournal = activeOrderForJournal
          ? useOrderStore.getState().ordersById[activeOrderForJournal]
          : undefined
        const paymentJournalKey = uuidv4()
        const paymentJournalId = writePaymentJournal({
          orderId: activeOrderForJournal ?? 'unknown',
          dbOrderId: orderForJournal?.db_order_id,
          amount: totalToPay,
          tipAmount: tip,
          paymentMethod: 'Card',
          idempotencyKey: paymentJournalKey
        })

        console.log('[ManualKeyIn] Castles processSale:', {
          amount: totalToPay,
          tipAmount: tip,
          referenceId,
          journalId: paymentJournalId
        })

        // 3. Execute sale — terminal handles card entry via manual key-in
        const result = await service.processSale({
          amount: totalToPay,
          tipAmount: tip,
          referenceId
        })

        // 3a. Promote journal to 'terminal_approved' the moment the
        // terminal returns; from here on, recovery is via crash_recovery flow.
        updatePaymentJournal(paymentJournalId, {
          status: 'terminal_approved',
          terminalTxnId: referenceId,
          ...(orderForJournal?.db_order_id && {
            dbOrderId: orderForJournal.db_order_id
          })
        })

        console.log('[ManualKeyIn] Castles sale result:', {
          success: result.success,
          error: result.error,
          hasRaw: !!result.raw
        })

        // 4. Handle failure
        if (!result.success) {
          const errorInfo = result.raw?.txnReturnCode
            ? parseCastlesReturnCode(result.raw.txnReturnCode)
            : { message: result.error || 'Transaction failed' }
          // Terminal returned a clean decline — no charge happened.
          failPaymentJournal(
            paymentJournalId,
            `terminal_declined: ${errorInfo.message}`
          )
          showDeclined()
          setErrorModal({
            visible: true,
            title: 'Payment Declined',
            message: errorInfo.message
          })
          return
        }

        // 5. Handle success
        const castlesTx = result.terminalResponse?.castles_transaction as
          | Record<string, string>
          | undefined
        const castlesLast4 =
          castlesTx?.cardLast4 ??
          (result.raw
            ? extractLast4(
                result.raw.txnMaskedCardNum ?? result.raw.txnCardMaskedPan ?? ''
              )
            : undefined)

        await handlePaymentCompletion({
          method: 'Card',
          tipAmount: tip,
          transactionDetails: {
            terminalType: 'castles',
            isCashPriced: false,
            authorizationCode: castlesTx?.approvalCode,
            cardType: castlesTx?.cardType,
            last4: castlesLast4,
            transactionId: referenceId,
            castlesTransaction: result.terminalResponse,
            // Wave Cat-B (TCP-in-flight crash recovery): hand the
            // pre-swipe journal entry to addPaymentToOrder.
            paymentJournalHandle: {
              id: paymentJournalId,
              idempotencyKey: paymentJournalKey
            }
          },
          amountOverride: totalToPay
        })

        showApproved()
        setStatus('success')
        setTimeout(() => showIdle(), 3000)
      } catch (error) {
        console.error('[ManualKeyIn] Error processing payment:', error)
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error'
        showDeclined()
        setErrorModal({
          visible: true,
          title: 'Payment Failed',
          message: errorMsg
        })
      }
    }

    processPayment()
  }, [status])

  const handleChargeCard = () => {
    updateTip(tipAmount, selectedTipPreset)
    setStatus('processing')
    showProcessing('manual')
  }

  const handleDismissErrorModal = () => {
    setErrorModal({ visible: false, title: '', message: '' })
    setStatus('ready')
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          padding: s(16)
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
      >
        {/* Terminal Status Banner */}
        {terminalStatus !== 'online' && (
          <View style={{ marginBottom: s(16) }}>
            <TerminalStatusBanner
              status={terminalStatus}
              errorMessage={terminalErrorMessage || undefined}
              reason={terminalReason}
              consecutiveFailures={terminalConsecutiveFailures}
              onRetry={recheckStatus}
            />
          </View>
        )}

        {/* Wedge modal: visible only when the connection supervisor has
            detected an app-layer freeze. Self-dismisses on recovery. */}
        <TerminalWedgedModal />
        {/* Detached modal: visible only when the active terminal is USB and
            quality is 'lost'. Auto-reconnects when the cable returns. */}
        <TerminalDetachedModal />

        {/* Top Section */}
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          {/* READY STATE */}
          {status === 'ready' && (
            <View style={{ width: '100%', maxWidth: 400 }}>
              <View style={{ alignItems: 'center', marginBottom: s(16) }}>
                {/* Manual Key-in badge */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: s(12),
                    backgroundColor: `${colors.teal}15`,
                    paddingVertical: s(5),
                    paddingHorizontal: s(12),
                    borderRadius: s(20),
                    alignSelf: 'center',
                    borderWidth: 1,
                    borderColor: `${colors.teal}30`,
                    gap: s(5)
                  }}
                >
                  <Keyboard size={s(11)} color={colors.teal} />
                  <Text
                    style={{
                      color: colors.teal,
                      fontSize: s(10),
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 0.8
                    }}
                  >
                    Manual Key-in
                  </Text>
                </View>

                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(11),
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    marginBottom: s(4)
                  }}
                >
                  {activeSplit
                    ? `Total for ${activeSplit.customerName}`
                    : 'Total Due'}
                </Text>
                <Text
                  style={{
                    fontSize: s(36),
                    fontWeight: '700',
                    color: colors.teal,
                    marginBottom: s(20)
                  }}
                >
                  ${totalToPay.toFixed(2)}
                </Text>

                {/* Merchant-side tip options hidden — tip is captured via CFD / post-capture flow */}
                {false && (
                  <>
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: s(11),
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        marginBottom: s(6),
                        alignSelf: 'flex-start'
                      }}
                    >
                      Add Tip
                    </Text>
                    {/* Preset Tip Buttons */}
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: s(6),
                        width: '100%',
                        marginBottom: s(10)
                      }}
                    >
                      {TIP_PRESETS.map(percent => {
                        const isActive = selectedTipPreset === percent
                        return (
                          <TouchableOpacity
                            key={percent}
                            onPress={() => handleTipPreset(percent)}
                            style={{
                              flex: 1,
                              paddingVertical: s(8),
                              borderRadius: s(8),
                              borderWidth: 1,
                              backgroundColor: isActive
                                ? `${colors.teal}15`
                                : colors.panel,
                              borderColor: isActive ? colors.teal : colors.border,
                              alignItems: 'center'
                            }}
                          >
                            <Text
                              style={{
                                fontSize: s(13),
                                fontWeight: '700',
                                color: isActive ? colors.heading : colors.muted
                              }}
                            >
                              {percent}%
                            </Text>
                            <Text
                              style={{
                                fontSize: s(10),
                                marginTop: s(1),
                                color: isActive ? colors.teal : colors.muted
                              }}
                            >
                              ${((percent / 100) * totalToPay).toFixed(2)}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                    {/* Custom Tip Input */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.panel,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: s(8),
                        paddingHorizontal: s(12),
                        height: s(44),
                        width: '100%',
                        marginBottom: s(16)
                      }}
                    >
                      <Text
                        style={{
                          color: colors.muted,
                          fontSize: s(15),
                          marginRight: s(4)
                        }}
                      >
                        $
                      </Text>
                      <TextInput
                        value={tipInput}
                        onChangeText={handleTipInputChange}
                        placeholder='0.00'
                        keyboardType='numeric'
                        placeholderTextColor={colors.muted}
                        style={{
                          flex: 1,
                          fontSize: s(16),
                          fontWeight: '700',
                          color: colors.heading
                        }}
                      />
                    </View>
                  </>
                )}

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    width: '100%',
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingTop: s(10)
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: s(13) }}>
                    Grand Total
                  </Text>
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: s(13),
                      fontWeight: '700'
                    }}
                  >
                    ${grandTotal.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* PROCESSING / SUCCESS STATES */}
          {(status === 'processing' || status === 'success') && (
            <View style={{ marginBottom: s(24), alignItems: 'center' }}>
              {status === 'processing' && (
                <Animated.View
                  entering={iosOnly(FadeIn)}
                  style={{ alignItems: 'center' }}
                >
                  <View
                    style={{
                      width: s(72),
                      height: s(72),
                      borderRadius: s(36),
                      backgroundColor: `${colors.teal}15`,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: s(12),
                      borderWidth: 1,
                      borderColor: `${colors.teal}30`
                    }}
                  >
                    <ActivityIndicator size='large' color={colors.teal} />
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(6),
                      backgroundColor: colors.panel,
                      paddingHorizontal: s(12),
                      paddingVertical: s(6),
                      borderRadius: s(20),
                      borderWidth: 1,
                      borderColor: colors.border
                    }}
                  >
                    <Wifi size={s(13)} color={colors.success} />
                    <Text
                      style={{
                        color: colors.muted,
                        fontWeight: '600',
                        fontSize: s(12)
                      }}
                    >
                      Terminal Connected
                    </Text>
                  </View>
                </Animated.View>
              )}

              {status === 'success' && (
                <Animated.View
                  entering={iosOnly(FadeIn.duration(300))}
                  style={{ alignItems: 'center' }}
                >
                  <View
                    style={{
                      width: s(72),
                      height: s(72),
                      borderRadius: s(36),
                      backgroundColor: `${colors.success}15`,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: s(12),
                      borderWidth: 1,
                      borderColor: `${colors.success}30`
                    }}
                  >
                    <CheckCircle2 size={s(36)} color={colors.success} />
                  </View>
                  <Text
                    style={{
                      color: colors.success,
                      fontWeight: '700',
                      fontSize: s(13)
                    }}
                  >
                    Approved
                  </Text>
                </Animated.View>
              )}

              <View style={{ marginTop: s(16), alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: s(20),
                    fontWeight: '700',
                    color: colors.heading,
                    marginBottom: s(4),
                    textAlign: 'center'
                  }}
                >
                  {status === 'processing'
                    ? 'Key In Card on Terminal'
                    : 'Payment Successful'}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(13),
                    textAlign: 'center'
                  }}
                >
                  {status === 'processing'
                    ? `Charging $${grandTotal.toFixed(2)}`
                    : 'Transaction completed'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Payment Error Modal */}
        <PaymentErrorModal
          visible={errorModal.visible}
          title={errorModal.title}
          message={errorModal.message}
          onDismiss={handleDismissErrorModal}
        />

        {/* Bottom Section */}
        <Animated.View
          entering={iosOnly(FadeInDown.delay(200))}
          style={{ width: '100%' }}
        >
          {/* Charge Button */}
          {status === 'ready' && (
            <TouchableOpacity
              onPress={handleChargeCard}
              disabled={!terminalReady}
              style={{
                width: '100%',
                paddingVertical: s(11),
                borderRadius: s(8),
                marginBottom: s(8),
                alignItems: 'center',
                backgroundColor: terminalReady ? colors.teal : colors.panel,
                borderWidth: terminalReady ? 0 : 1,
                borderColor: colors.border,
                opacity: terminalReady ? 1 : 0.5
              }}
            >
              <Text
                style={{
                  color: terminalReady ? '#fff' : colors.muted,
                  fontWeight: '700',
                  fontSize: s(14)
                }}
              >
                Process on Terminal ${grandTotal.toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}

          {(status === 'processing' || status === 'ready') && (
            <TouchableOpacity
              disabled={isCancelling}
              onPress={async () => {
                if (isCancelling) return
                if (status === 'processing' && currentRefIdRef.current) {
                  setIsCancelling(true)
                  try {
                    await getSharedCastlesService().gracefulDisconnect()
                  } catch (err) {
                    console.error('[ManualKeyIn] Abort failed:', err)
                  }
                  setIsCancelling(false)
                  setStatus('ready')
                } else {
                  close()
                }
              }}
              style={{
                width: '100%',
                paddingVertical: s(10),
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(8),
                opacity: isCancelling ? 0.5 : 1
              }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: '600',
                  color: colors.muted,
                  textAlign: 'center'
                }}
              >
                {isCancelling
                  ? 'Cancelling...'
                  : status === 'processing'
                  ? 'Cancel Transaction'
                  : 'Back'}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  )
}

export default ManualCardEntryView