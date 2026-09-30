import { useCFD } from '@/contexts/CFDProvider'
import { colors } from '@/lib/theme'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useTipAdjustStore } from '@/stores/useTipAdjustStore'
import { ArrowRight, Check, Printer } from '@/lib/icons'
import { usePrintPaymentReceipt } from '@/hooks/orders/usePrintPaymentReceipt'
import { useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated'
import { iosOnly } from '@/lib/safeAnimations'

const SplitPaymentSuccessView = () => {
  const splits = usePaymentStore(s => s.splits)
  const activeSplitId = usePaymentStore(s => s.activeSplitId)
  const moveToNextSplit = usePaymentStore(s => s.moveToNextSplit)
  const lastPaidPaymentId = usePaymentStore(s => s.lastPaidPaymentId)
  const { printPayment, isPrinting } = usePrintPaymentReceipt()
  // Keyed by payment id so the "Printed" state never carries over to the next guest.
  const [printedPaymentId, setPrintedPaymentId] = useState<string | null>(null)
  const hasPrinted = !!lastPaidPaymentId && printedPaymentId === lastPaidPaymentId

  const handlePrint = async () => {
    if (!lastPaidPaymentId || isPrinting) return
    if (await printPayment(lastPaidPaymentId)) {
      setPrintedPaymentId(lastPaidPaymentId)
    }
  }

  const justPaidSplit = splits.find(s => s.id === activeSplitId)
  const nextSplit = splits.find(s => s.status === 'pending')

  // The guest who just paid still has the tip screen in front of them, or
  // their tip is being applied on the terminal. Charging the next guest now
  // would take the display away and queue a sale behind that tip. Only when a
  // customer can actually see a display, and only for this order's capture —
  // cash portions and tip-before-sale terminals capture nothing.
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const capturedTip = useTipAdjustStore(s => s.captured)
  const tipApplying = useTipAdjustStore(s => s.inFlight)
  const { hasCustomerDisplay, showApproved } = useCFD()
  const tipPending =
    hasCustomerDisplay &&
    !!capturedTip &&
    capturedTip.localOrderId === activeOrderId
  const guestName = justPaidSplit?.customerName ?? 'Guest'

  const handleSkipTip = () => {
    if (!capturedTip || tipApplying) return
    useTipAdjustStore.getState().clear(capturedTip.referenceId)
    showApproved()
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16
      }}
    >
      {/* Success Icon */}
      <Animated.View
        entering={iosOnly(FadeIn.delay(100))}
        style={{ alignItems: 'center', marginBottom: 20, marginTop: 20 }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            backgroundColor: colors.success + '15',
            borderRadius: 40,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            borderWidth: 2,
            borderColor: colors.success + '40'
          }}
        >
          <Check color={colors.success} size={44} strokeWidth={3.5} />
        </View>

        <Text
          style={{
            fontSize: 28,
            fontWeight: '800',
            color: colors.heading,
            marginBottom: 8,
            textAlign: 'center'
          }}
        >
          Payment Received
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: colors.label,
            textAlign: 'center',
            lineHeight: 20
          }}
        >
          {justPaidSplit?.customerName} is all set!
        </Text>
      </Animated.View>

      {/* Next Guest Info */}
      {nextSplit && (
        <Animated.View
          entering={iosOnly(FadeInUp.delay(200))}
          style={{
            width: '100%',
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            marginBottom: 20
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: colors.muted,
              marginBottom: 8
            }}
          >
            Next Guest
          </Text>
          <Text
            style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}
          >
            {nextSplit.customerName}
          </Text>
        </Animated.View>
      )}

      {/* Print this guest's receipt — scoped to the payment just taken */}
      {lastPaidPaymentId && (
        <TouchableOpacity
          onPress={handlePrint}
          disabled={isPrinting}
          style={{
            width: '100%',
            paddingVertical: 12,
            marginBottom: 10,
            backgroundColor: colors.card,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: isPrinting ? 0.6 : 1
          }}
        >
          {isPrinting ? (
            <ActivityIndicator size='small' color={colors.label} />
          ) : hasPrinted ? (
            <Check size={16} color={colors.success} />
          ) : (
            <Printer size={16} color={colors.label} />
          )}
          <Text
            style={{ color: colors.heading, fontWeight: '700', fontSize: 14 }}
          >
            {isPrinting
              ? 'Printing...'
              : hasPrinted
              ? 'Receipt Printed — Print Again'
              : `Print ${justPaidSplit?.customerName ?? 'Guest'}'s Receipt`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Skip this guest's tip — hidden once the tip is on its way to the terminal */}
      {tipPending && !tipApplying && (
        <TouchableOpacity
          onPress={handleSkipTip}
          style={{
            width: '100%',
            paddingVertical: 12,
            marginBottom: 10,
            backgroundColor: colors.card,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text
            style={{ color: colors.heading, fontWeight: '700', fontSize: 14 }}
          >
            Skip Tip
          </Text>
        </TouchableOpacity>
      )}

      {/* Action Button */}
      <TouchableOpacity
        onPress={moveToNextSplit}
        disabled={tipPending}
        style={{
          width: '100%',
          paddingVertical: 12,
          backgroundColor: colors.teal,
          borderRadius: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          shadowColor: colors.teal,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 6,
          opacity: tipPending ? 0.6 : 1
        }}
      >
        {tipPending ? (
          <>
            <ActivityIndicator size='small' color={colors.onSolid} />
            <Text
              style={{ color: colors.onSolid, fontWeight: '700', fontSize: 14 }}
            >
              {tipApplying
                ? `Applying ${guestName}'s tip on terminal...`
                : `Waiting for ${guestName}'s tip...`}
            </Text>
          </>
        ) : (
          <>
            <Text
              style={{ color: colors.onSolid, fontWeight: '700', fontSize: 14 }}
            >
              Pay for {nextSplit?.customerName || 'Next Guest'}
            </Text>
            <ArrowRight size={16} color={colors.onSolid} />
          </>
        )}
      </TouchableOpacity>
    </View>
  )
}

export default SplitPaymentSuccessView
