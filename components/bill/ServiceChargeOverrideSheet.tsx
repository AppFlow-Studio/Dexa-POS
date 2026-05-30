import { bottomSheetTheme, colors } from '@/lib/theme'
import { useActiveOrder, useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePinOverrideStore } from '@/stores/usePinOverrideStore'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput
} from '@gorhom/bottom-sheet'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { Receipt, X } from 'lucide-react-native'
import React, { forwardRef, useMemo, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface Props {
  onClose: () => void
}

const ServiceChargeOverrideSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  Props
> = ({ onClose }, ref) => {
  const snapPoints = useMemo(() => ['60%', '90%'], [])
  const activeOrder = useActiveOrder()
  const totals = useActiveOrderTotals()
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const requestPinOverride = usePinOverrideStore(s => s.requestPinOverride)

  const [amountInput, setAmountInput] = useState('')
  const [reason, setReason] = useState('')

  const currentSC = totals?.serviceCharge ?? 0
  const scName = totals?.serviceChargeName || 'Service Charge'

  // Server-side guard rejects when any non-voided payment has status
  // captured / partially_refunded / refunded. normalizeFetchedPayment collapses
  // partially_refunded → 'refunded' on the client (orderTransformers.ts ~1102),
  // so the two-status check below is equivalent to the server's three-status
  // check and keeps the button disabled instead of round-tripping to a
  // rejection toast.
  const hasBlockingPayment = useMemo(() => {
    const payments = activeOrder?.payments ?? []
    return payments.some(
      p =>
        !p.isVoided &&
        (p.status === 'captured' || p.status === 'refunded')
    )
  }, [activeOrder?.payments])

  // Strip locale thousands separators (Android keyboards on some locales emit
  // commas). parseFloat("1,000.50") would yield 1; we want 1000.50.
  const parsedAmount = parseFloat(amountInput.replace(/,/g, ''))
  const isEditValid =
    !!activeOrderId &&
    !hasBlockingPayment &&
    !Number.isNaN(parsedAmount) &&
    parsedAmount > 0

  const handleEdit = () => {
    if (!isEditValid || !activeOrderId) return
    requestPinOverride({
      type: 'edit_service_charge',
      payload: {
        orderId: activeOrderId,
        newAmount: Math.round(parsedAmount * 100) / 100,
        reason: reason.trim() || undefined,
      },
    })
    onClose()
  }

  const handleRemove = () => {
    if (!activeOrderId || hasBlockingPayment) return
    requestPinOverride({
      type: 'remove_service_charge',
      payload: {
        orderId: activeOrderId,
        reason: reason.trim() || undefined,
      },
    })
    onClose()
  }

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={bottomSheetTheme.backgroundStyle}
      handleIndicatorStyle={bottomSheetTheme.handleIndicatorStyle}
      backdropComponent={props => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
        />
      )}
      onClose={onClose}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Receipt size={22} color={colors.teal} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.heading }}>
              Override Service Charge
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <X size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
            Current
          </Text>
          <Text style={{ fontSize: 14, color: colors.heading, marginBottom: 4 }}>
            {scName}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.heading }}>
            ${currentSC.toFixed(2)}
          </Text>
          {activeOrder?.service_charge_is_manual ? (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
              Already manually overridden — further edits stay manual.
            </Text>
          ) : null}
        </View>

        {hasBlockingPayment ? (
          <View
            style={{
              backgroundColor: '#FEE2E2',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 13, color: '#991B1B', fontWeight: '600' }}>
              Order has captured payments
            </Text>
            <Text style={{ fontSize: 12, color: '#991B1B', marginTop: 4 }}>
              Void or refund existing payments before editing the service charge.
            </Text>
          </View>
        ) : null}

        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: colors.heading,
            marginBottom: 6,
          }}
        >
          New Amount ($)
        </Text>
        <BottomSheetTextInput
          value={amountInput}
          onChangeText={setAmountInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          editable={!hasBlockingPayment}
          style={{
            backgroundColor: colors.card,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            color: colors.heading,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 16,
            opacity: hasBlockingPayment ? 0.5 : 1,
          }}
        />

        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: colors.heading,
            marginBottom: 6,
          }}
        >
          Reason (optional)
        </Text>
        <BottomSheetTextInput
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. comped table, party split"
          editable={!hasBlockingPayment}
          style={{
            backgroundColor: colors.card,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 14,
            color: colors.heading,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 20,
            opacity: hasBlockingPayment ? 0.5 : 1,
          }}
        />

        <TouchableOpacity
          onPress={handleEdit}
          disabled={!isEditValid}
          style={{
            backgroundColor: isEditValid ? colors.teal : colors.border,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
            Edit (Manager PIN)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleRemove}
          disabled={hasBlockingPayment || !activeOrderId || currentSC <= 0}
          style={{
            backgroundColor:
              hasBlockingPayment || !activeOrderId || currentSC <= 0
                ? colors.card
                : '#FEE2E2',
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            borderWidth: 1,
            borderColor:
              hasBlockingPayment || !activeOrderId || currentSC <= 0
                ? colors.border
                : '#FCA5A5',
          }}
        >
          <Text
            style={{
              color:
                hasBlockingPayment || !activeOrderId || currentSC <= 0
                  ? colors.muted
                  : '#991B1B',
              fontWeight: '700',
              fontSize: 15,
            }}
          >
            Remove Service Charge (Manager PIN)
          </Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheet>
  )
}

export const ServiceChargeOverrideSheet = forwardRef(
  ServiceChargeOverrideSheetComponent
)
