import { colors } from '@/lib/theme'
import { useActiveOrder } from '@/stores/selectors/orderSelectors'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { AlertTriangle } from 'lucide-react-native'
import React, { useState } from 'react'
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import CardPaymentView from './ paymentView/CardPaymentView'
import CashPaymentView from './ paymentView/CashPaymentView'
import PaymentSuccessView from './ paymentView/PaymentSuccessView'
import CustomAmountView from './paymentView/CustomAmountView'
import ManualCardEntryView from './paymentView/ManualCardEntryView'
import PayForItemsView from './paymentView/PayForItemsView'
import PaymentMethodSelectionView from './paymentView/PaymentMethodSelectionView'
import PaymentProgressHeader from './paymentView/PaymentProgressHeader'
import PaymentVerifyingOverlay from './paymentView/PaymentVerifyingOverlay'
import PreAuthPaymentView from './paymentView/PreAuthPaymentView'
import SplitByItemView from './paymentView/SplitByItemView'
import SplitEvenlyView from './paymentView/SplitEvenlyView'
import SplitOptionsView from './paymentView/SplitOptionsView'
import SplitPaymentSuccessView from './SplitPaymentSuccessView'
import { useUiScale } from '@/lib/uiScale'

const PaymentBottomSheet: React.FC = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const view = usePaymentStore(s => s.view)
  const isOpen = usePaymentStore(s => s.isOpen)
  const close = usePaymentStore(s => s.close)
  const cancelInProgressPayment = usePaymentStore(
    s => s.cancelInProgressPayment
  )
  const isDirty = usePaymentStore(s => s.isDirty)
  const setIsDirty = usePaymentStore(s => s.setIsDirty)
  const handleSuccessClose = usePaymentStore(s => s.handleSuccessClose)
  const isTransactionProcessing = usePaymentStore(
    s => s.isTransactionProcessing
  )

  // A split is "in progress" once a portion has been captured — even though the
  // sheet is no longer `isDirty` (advancing to the next portion clears the dirty
  // flag, see usePaymentStore.startSplitPaymentFlow). Closing here must still
  // prompt Keep/Discard so an abandoned split gets voided rather than silently
  // left on the order (which double-charged on the next re-split).
  const activeOrder = useActiveOrder()
  const hasInProgressSplit =
    !!activeOrder?.split_payment_path ||
    (activeOrder?.payments?.length ?? 0) > 0

  const [showConfirmation, setShowConfirmation] = useState(false)

  // "Discard": abandon the whole split. Roll back any captured-but-unconfirmed
  // portions and defer to the backend's authoritative balance before tearing
  // down the sheet. close() here was the leak that left a phantom payment / a
  // manufactured residual on the next attempt.
  const handleDiscard = () => {
    setIsDirty(false)
    setShowConfirmation(false)
    cancelInProgressPayment()
  }

  // "Keep Changes": retain the captured (backend-confirmed) portions and exit.
  // A plain close() — no rollback — so finished split portions stay paid.
  const handleKeepChanges = () => {
    setIsDirty(false)
    setShowConfirmation(false)
    close()
  }

  // Dismiss the prompt and stay in the sheet (backdrop tap).
  const handleDismissConfirmation = () => {
    setShowConfirmation(false)
  }

  const handleAttemptClose = () => {
    if (isTransactionProcessing) return
    // `success` = a completed payment, not an abandon — take the clean finalize
    // path even if captured portions exist.
    if (view === 'success') {
      handleSuccessClose()
    } else if (isDirty || hasInProgressSplit) {
      // Dirty edits OR a partially-captured split → prompt Keep/Discard so the
      // abandoned portions are explicitly voided, never silently left behind.
      setShowConfirmation(true)
    } else {
      close()
    }
  }

  const renderContent = () => {
    switch (view) {
      case 'review':
        return null
      case 'payment-method-selection':
        return <PaymentMethodSelectionView />
      case 'card':
        return <CardPaymentView />
      case 'manual':
        return <ManualCardEntryView />
      case 'cash':
        return <CashPaymentView />
      case 'split':
        return <SplitOptionsView />
      case 'split-options':
        return <SplitOptionsView />
      case 'split-by-item':
        return <SplitByItemView />
      case 'split-evenly':
        return <SplitEvenlyView />
      case 'split-custom-amount':
        return <CustomAmountView />
      case 'split-payment-success':
        return <SplitPaymentSuccessView />
      case 'pay-for-items':
        return <PayForItemsView />
      case 'pre-auth':
        return <PreAuthPaymentView />
      case 'verifying':
        return <PaymentVerifyingOverlay />
      case 'success':
        return <PaymentSuccessView />
      default:
        return <Text style={{ color: colors.heading, fontSize: s(14) }}>Unknown View</Text>
    }
  }

  if (!isOpen) return null

  return (
    <>
      <Modal
        visible={isOpen}
        animationType='slide'
        transparent={true}
        onRequestClose={() => {
          if (isTransactionProcessing) return
          handleAttemptClose()
        }}
        statusBarTranslucent
      >
        <View style={getStyles().backdrop}>
          <View style={getStyles().sheet}>
            <ScrollView
              style={getStyles().container}
              contentContainerStyle={getStyles().containerContent}
              keyboardShouldPersistTaps='handled'
            >
              {/* Header */}
              <View
                style={{
                  backgroundColor: colors.panel,
                  padding: s(16),
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: s(24),
                    fontWeight: 'bold',
                    color: colors.heading
                  }}
                >
                  Payment
                </Text>
                <TouchableOpacity
                  onPress={handleAttemptClose}
                  disabled={isTransactionProcessing}
                  style={{
                    paddingHorizontal: s(16),
                    paddingVertical: s(8),
                    borderRadius: s(8),
                    backgroundColor: colors.muted + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isTransactionProcessing ? 0.3 : 1
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(14),
                      fontWeight: '600',
                      color: colors.label
                    }}
                  >
                    CLOSE
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Progress Header */}
              <PaymentProgressHeader />

              {/* Content Wrapper */}
              <View style={getStyles().content}>{renderContent()}</View>
            </ScrollView>
          </View>
        </View>
        {/* Inline confirmation overlay — cannot use Dialog/Portal here since it portals behind the native Modal */}
        {showConfirmation && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleDismissConfirmation}
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: 'rgba(0,0,0,0.5)',
                justifyContent: 'center',
                alignItems: 'center',
                padding: s(24)
              }
            ]}
          >
            <View
              style={{
                backgroundColor: colors.panel,
                borderRadius: s(20),
                padding: s(28),
                width: '100%',
                maxWidth: s(400),
                borderWidth: 1,
                borderColor: colors.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: s(8) },
                shadowOpacity: 0.3,
                shadowRadius: s(16),
                elevation: 10
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: s(20) }}>
                <View
                  style={{
                    width: s(60),
                    height: s(60),
                    borderRadius: s(14),
                    backgroundColor: colors.danger + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: s(16)
                  }}
                >
                  <AlertTriangle
                    size={s(28)}
                    color={colors.danger}
                    strokeWidth={2.5}
                  />
                </View>
                <Text
                  style={{
                    fontSize: s(18),
                    fontWeight: '800',
                    color: colors.heading,
                    marginBottom: s(8),
                    textAlign: 'center'
                  }}
                >
                  Exit Payment Sheet?
                </Text>
                <Text
                  style={{
                    fontSize: s(13),
                    color: colors.label,
                    textAlign: 'center',
                    lineHeight: s(20)
                  }}
                >
                  Keep the portions you've already captured, or discard the
                  whole split. Discard cannot be undone.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: s(10), marginTop: s(8) }}>
                <TouchableOpacity
                  onPress={handleKeepChanges}
                  style={{
                    flex: 1,
                    backgroundColor: colors.teal + '15',
                    borderRadius: s(12),
                    borderWidth: 1.5,
                    borderColor: colors.teal + '50',
                    paddingVertical: s(13),
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(14),
                      color: colors.teal,
                      fontWeight: '700'
                    }}
                  >
                    Keep Changes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDiscard}
                  style={{
                    flex: 1,
                    backgroundColor: colors.danger + '15',
                    borderRadius: s(12),
                    borderWidth: 1.5,
                    borderColor: colors.danger + '50',
                    paddingVertical: s(13),
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(14),
                      color: colors.danger,
                      fontWeight: '700'
                    }}
                  >
                    Discard
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}
      </Modal>
    </>
  )
}

const getStyles = () =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end'
    },
    sheet: {
      height: '100%',
      backgroundColor: colors.screen
    },
    container: {
      flex: 1,
      backgroundColor: colors.panel
    },
    containerContent: {
      flexGrow: 1
    },
    content: {
      flex: 1,
      paddingHorizontal: 8,
      paddingBottom: 12
    }
  })

export default PaymentBottomSheet