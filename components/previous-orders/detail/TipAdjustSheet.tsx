import { useToast } from '@/contexts/ToastContext'
import { orderHistoryKeys } from '@/hooks/orders/useOrderHistory'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { bottomSheetTheme, colors } from '@/lib/theme'
import { OrderProfile, OrderProfilePayment } from '@/lib/types'
import { adjustTips, TipAdjustment } from '@/services/tipAdjustService'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView
} from '@gorhom/bottom-sheet'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, Lock } from 'lucide-react-native'
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native'

interface TipAdjustSheetProps {
  order: OrderProfile | null
}

export interface TipAdjustSheetRef {
  open: () => void
  close: () => void
}

const TipAdjustSheetComponent: React.ForwardRefRenderFunction<
  TipAdjustSheetRef,
  TipAdjustSheetProps
> = ({ order }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null)
  const snapPoints = useMemo(() => ['70%'], [])
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null
  )
  const [tipInput, setTipInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { show } = useToast()
  const supabaseClient = useSupabaseClient()
  const queryClient = useQueryClient()

  useImperativeHandle(ref, () => ({
    open: () => {
      setSelectedPaymentId(null)
      setTipInput('')
      bottomSheetRef.current?.snapToIndex(0)
    },
    close: () => bottomSheetRef.current?.close()
  }))

  const cardPayments = useMemo(() => {
    if (!order?.payments) return []
    return order.payments.filter(p => p.method !== 'Cash' && !p.isVoided)
  }, [order?.payments])

  const selectedPayment = useMemo(() => {
    if (!selectedPaymentId) return null
    return cardPayments.find(p => p.id === selectedPaymentId) || null
  }, [selectedPaymentId, cardPayments])

  const handleSubmit = useCallback(async () => {
    if (!order?.db_order_id || !selectedPayment?.db_payment_id) return

    const newTip = parseFloat(tipInput)
    if (isNaN(newTip) || newTip < 0) {
      show({
        title: 'Invalid Amount',
        message: 'Please enter a valid tip amount',
        type: 'error'
      })
      return
    }

    // High tip warning (>30% of payment amount)
    if (newTip > selectedPayment.amount * 0.3) {
      Alert.alert(
        'High Tip Warning',
        `$${newTip.toFixed(
          2
        )} is more than 30% of the payment amount ($${selectedPayment.amount.toFixed(
          2
        )}). Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => submitTipAdjustment(newTip) }
        ]
      )
      return
    }

    await submitTipAdjustment(newTip)
  }, [order, selectedPayment, tipInput])

  const submitTipAdjustment = async (newTip: number) => {
    if (!order?.db_order_id || !selectedPayment?.db_payment_id) return

    setIsSubmitting(true)
    try {
      const adjustment: TipAdjustment = {
        payment_id: selectedPayment.db_payment_id,
        new_tip_amount: newTip
      }

      await adjustTips(supabaseClient, order.db_order_id, [adjustment])
      show({
        title: 'Success',
        message: 'Tip adjusted successfully',
        type: 'success'
      })
      bottomSheetRef.current?.close()
      queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all })
    } catch (err: any) {
      show({
        title: 'Error',
        message: err?.message || 'Failed to adjust tip',
        type: 'error'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    []
  )

  if (!order) return null

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      {...bottomSheetTheme}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: colors.heading,
            marginBottom: 12
          }}
        >
          Adjust Tip
        </Text>

        {/* Payment selection */}
        {!selectedPaymentId ? (
          <View style={{ gap: 8 }}>
            <Text
              style={{ fontSize: 12, color: colors.label, marginBottom: 2 }}
            >
              Select a payment to adjust tip:
            </Text>
            {cardPayments.map((payment, idx) => (
              <PaymentOption
                key={payment.id}
                payment={payment}
                index={idx}
                onSelect={() => {
                  setSelectedPaymentId(payment.id)
                  setTipInput(payment.tip_amount.toFixed(2))
                }}
              />
            ))}
          </View>
        ) : (
          <View>
            {/* Selected payment info */}
            <View
              style={{
                backgroundColor: colors.panel,
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6
                }}
              >
                <CreditCard color={colors.info} size={18} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  {selectedPayment?.cardBrand || 'Card'}{' '}
                  {selectedPayment?.last4 ? `••${selectedPayment.last4}` : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.label }}>
                Payment: ${selectedPayment?.amount.toFixed(2)} | Current Tip: $
                {selectedPayment?.tip_amount.toFixed(2)}
              </Text>
            </View>

            {/* Tip input */}
            <Text
              style={{ fontSize: 12, color: colors.label, marginBottom: 6 }}
            >
              New Tip Amount:
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.screen,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 12
              }}
            >
              <Text
                style={{ fontSize: 16, color: colors.label, marginRight: 4 }}
              >
                $
              </Text>
              <TextInput
                value={tipInput}
                onChangeText={setTipInput}
                keyboardType='decimal-pad'
                placeholder='0.00'
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  fontSize: 16,
                  color: colors.heading,
                  fontWeight: '600'
                }}
                autoFocus
              />
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedPaymentId(null)
                  setTipInput('')
                }}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.label
                  }}
                >
                  Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: isSubmitting
                    ? colors.teal + '20'
                    : colors.teal,
                  borderWidth: 1,
                  borderColor: isSubmitting ? colors.teal + '30' : colors.teal
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.onSolid
                  }}
                >
                  {isSubmitting ? 'Adjusting...' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  )
}

const PaymentOption = ({
  payment,
  index,
  onSelect
}: {
  payment: OrderProfilePayment
  index: number
  onSelect: () => void
}) => {
  const isSettled = payment.is_settled === true

  return (
    <TouchableOpacity
      onPress={isSettled ? undefined : onSelect}
      activeOpacity={isSettled ? 1 : 0.7}
      style={{
        backgroundColor: colors.panel,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: isSettled ? colors.border : colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        opacity: isSettled ? 0.6 : 1
      }}
    >
      {isSettled ? (
        <Lock color={colors.muted} size={20} />
      ) : (
        <CreditCard color={colors.label} size={20} />
      )}
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: isSettled ? colors.muted : colors.heading }}>
          Payment #{index + 1} — {payment.cardBrand || 'Card'}{' '}
          {payment.last4 ? `••${payment.last4}` : ''}
        </Text>
        <Text style={{ fontSize: 12, color: colors.label }}>
          ${payment.amount.toFixed(2)} + ${payment.tip_amount.toFixed(2)} tip
        </Text>
        {isSettled && (
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
            Settled — tip cannot be adjusted
          </Text>
        )}
      </View>
      {isSettled ? (
        <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>Settled</Text>
      ) : (
        <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '600' }}>Adjust</Text>
      )}
    </TouchableOpacity>
  )
}

const AdvancedTipAdjustSheet = forwardRef(TipAdjustSheetComponent)
AdvancedTipAdjustSheet.displayName = 'TipAdjustSheet'
export default AdvancedTipAdjustSheet
