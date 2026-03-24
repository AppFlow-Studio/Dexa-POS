import { useToast } from '@/contexts/ToastContext'
import { orderHistoryKeys } from '@/hooks/orders/useOrderHistory'
import { bottomSheetTheme, colors } from '@/lib/theme'
import { CartItem, OrderProfile, PaymentType } from '@/lib/types'
import { usePreviousOrdersStore } from '@/stores/usePreviousOrdersStore'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView
} from '@gorhom/bottom-sheet'
import { BottomSheetDefaultFooterProps } from '@gorhom/bottom-sheet/lib/typescript/components/bottomSheetFooter/types'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, DollarSign, X } from 'lucide-react-native'
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface AdvancedRefundModalProps {
  onClose: () => void
  order: OrderProfile | null
}

export interface AdvancedRefundModalRef {
  open: () => void
  close: () => void
}

interface RefundItem {
  itemId: string
  quantity: number
  reason: string
}

const AdvancedRefundModalComponent: React.ForwardRefRenderFunction<
  AdvancedRefundModalRef,
  AdvancedRefundModalProps
> = ({ onClose, order }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null)
  const snapPoints = useMemo(() => ['95%'], [])

  const [refundType, setRefundType] = useState<'full' | 'partial'>('full')
  const [reason, setReason] = useState('')
  const [selectedItems, setSelectedItems] = useState<RefundItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentType>('Card')

  const { show } = useToast()
  const queryClient = useQueryClient()
  const { refundFullOrder, refundItems } = usePreviousOrdersStore()

  useImperativeHandle(ref, () => ({
    open: () => {
      usePreviousOrdersStore.getState().refreshPreviousOrders()
      bottomSheetRef.current?.snapToIndex(0)
    },
    close: () => bottomSheetRef.current?.close()
  }))

  const orderId = order?.id ?? ''
  const orderTotal = order?.total_amount ?? 0

  const refundedAmount = useMemo(
    () =>
      (order?.payments || []).reduce((sum, payment) => {
        return sum + (payment.refundedAmount ?? 0)
      }, 0),
    [order?.payments]
  )

  const canDoFullRefund = refundedAmount < 0.01

  useEffect(() => {
    if (!order) return

    setRefundType(canDoFullRefund ? 'full' : 'partial')
    setReason('')
    setSelectedItems([])
    setPaymentMethod('Card')
  }, [order, canDoFullRefund])

  const refundableItems = useMemo(() => {
    if (!order) return []
    return order.items.filter(item => (item.refundedQuantity || 0) < item.quantity)
  }, [order])

  const selectedMap = useMemo(() => {
    const map = new Map<string, RefundItem>()
    selectedItems.forEach(item => map.set(item.itemId, item))
    return map
  }, [selectedItems])

  const calculateRefundAmount = () => {
    if (refundType === 'full') return orderTotal
    if (!order) return 0

    return selectedItems.reduce((total, selectedItem) => {
      const item = order.items.find(i => i.id === selectedItem.itemId)
      return total + (item ? item.price * selectedItem.quantity : 0)
    }, 0)
  }

  const toggleItemSelection = (item: CartItem) => {
    const exists = selectedItems.some(selected => selected.itemId === item.id)

    if (exists) {
      setSelectedItems(prev => prev.filter(selected => selected.itemId !== item.id))
      return
    }

    const maxRefundableQty = item.quantity - (item.refundedQuantity || 0)
    setSelectedItems(prev => [
      ...prev,
      { itemId: item.id, quantity: maxRefundableQty, reason: '' }
    ])
  }

  const updateItemQuantity = (itemId: string, quantity: number) => {
    setSelectedItems(prev =>
      prev.map(item => {
        if (item.itemId !== itemId) return item
        return { ...item, quantity }
      })
    )
  }

  const updateItemReason = (itemId: string, itemReason: string) => {
    setSelectedItems(prev =>
      prev.map(item => {
        if (item.itemId !== itemId) return item
        return { ...item, reason: itemReason }
      })
    )
  }

  const handleFullRefund = async () => {
    if (!reason.trim()) {
      show({
        title: 'Reason Required',
        message: 'Please provide a reason for the full refund.',
        type: 'error'
      })
      return
    }

    await refundFullOrder(orderId, reason, 'Cashier', paymentMethod)
    show({
      title: 'Refund Successful',
      message: 'The full refund has been processed successfully.',
      type: 'success'
    })
    queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all })
    bottomSheetRef.current?.close()
  }

  const handlePartialRefund = async () => {
    if (selectedItems.length === 0) {
      show({
        title: 'No Items Selected',
        message: 'Please select one or more items to process a partial refund.',
        type: 'error'
      })
      return
    }

    const itemsWithReasons = selectedItems.filter(item => item.reason.trim())
    if (itemsWithReasons.length !== selectedItems.length) {
      show({
        title: 'Reason Required',
        message: 'Please provide a reason for each item selected for refund.',
        type: 'error'
      })
      return
    }

    await refundItems(orderId, selectedItems, 'Cashier', paymentMethod)
    show({
      title: 'Refund Successful',
      message: 'The partial refund has been processed successfully.',
      type: 'success'
    })
    queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all })
    bottomSheetRef.current?.close()
  }

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  )

  const renderFooter = useCallback(
    (props: BottomSheetDefaultFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: colors.panel,
            borderTopWidth: 1,
            borderTopColor: colors.border
          }}
        >
          <TouchableOpacity
            onPress={refundType === 'full' ? handleFullRefund : handlePartialRefund}
            style={{
              width: '100%',
              paddingVertical: 8,
              backgroundColor: colors.teal,
              borderRadius: 8,
              alignItems: 'center'
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onSolid }}>
              PROCESS REFUND
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetFooter>
    ),
    [refundType]
  )

  if (!order) return null

  const refundAmount = calculateRefundAmount()

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      keyboardBehavior='interactive'
      keyboardBlurBehavior='restore'
      android_keyboardInputMode='adjustResize'
      onClose={onClose}
      {...bottomSheetTheme}
    >
      <BottomSheetView style={{ flex: 1, backgroundColor: colors.panel }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>
                Process Refund
              </Text>
              <Text style={{ fontSize: 12, color: colors.label }}>
                Order #{order.display_number || order.order_number || orderId} | ${orderTotal.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => bottomSheetRef.current?.close()}
              style={{
                padding: 6,
                backgroundColor: colors.teal + '10',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.teal + '30'
              }}
            >
              <X color={colors.teal} size={16} />
            </TouchableOpacity>
          </View>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 80 }}
          showsVerticalScrollIndicator
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              marginBottom: 6
            }}
          >
            Refund Type
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <ChoiceButton
              title='Full Refund'
              subtitle={`$${orderTotal.toFixed(2)}`}
              active={refundType === 'full'}
              disabled={!canDoFullRefund}
              onPress={() => setRefundType('full')}
            />
            <ChoiceButton
              title='Partial'
              subtitle='Select items'
              active={refundType === 'partial'}
              onPress={() => setRefundType('partial')}
            />
          </View>

          <SectionDivider />

          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              marginBottom: 6
            }}
          >
            Refund Method
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <MethodButton
              label='Card'
              active={paymentMethod === 'Card'}
              icon={<CreditCard color={paymentMethod === 'Card' ? colors.teal : colors.label} size={14} />}
              onPress={() => setPaymentMethod('Card')}
            />
            <MethodButton
              label='Cash'
              active={paymentMethod === 'Cash'}
              icon={<DollarSign color={paymentMethod === 'Cash' ? colors.teal : colors.label} size={14} />}
              onPress={() => setPaymentMethod('Cash')}
            />
          </View>

          <SectionDivider />

          {refundType === 'full' && (
            <>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  marginBottom: 6
                }}
              >
                Reason
              </Text>
              <BottomSheetTextInput
                value={reason}
                onChangeText={setReason}
                placeholder='Enter reason for the refund...'
                placeholderTextColor={colors.muted}
                multiline
                style={{
                  backgroundColor: colors.screen,
                  color: colors.heading,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  fontSize: 13,
                  minHeight: 68,
                  textAlignVertical: 'top'
                }}
              />
              <SectionDivider />
            </>
          )}

          {refundType === 'partial' && (
            <>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  marginBottom: 6
                }}
              >
                Select Items
              </Text>
              <View style={{ gap: 8 }}>
                {refundableItems.map(item => {
                  const isSelected = selectedMap.has(item.id)
                  const maxRefundable = item.quantity - (item.refundedQuantity || 0)
                  const currentQty = selectedMap.get(item.id)?.quantity || maxRefundable
                  const currentReason = selectedMap.get(item.id)?.reason || ''

                  return (
                    <View
                      key={item.id}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.teal + '50' : colors.border,
                        backgroundColor: isSelected ? colors.teal + '10' : colors.screen
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                            {item.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.label }}>
                            {maxRefundable} x ${item.price?.toFixed(2)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => toggleItemSelection(item)}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isSelected ? colors.danger + '15' : colors.success + '15',
                            borderWidth: 1,
                            borderColor: isSelected ? colors.danger + '40' : colors.success + '40'
                          }}
                        >
                          {isSelected ? <X color={colors.danger} size={14} /> : <Check color={colors.success} size={14} />}
                        </TouchableOpacity>
                      </View>

                      {isSelected && (
                        <View style={{ marginTop: 8, gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 12, color: colors.label }}>Qty:</Text>
                            <BottomSheetTextInput
                              value={String(currentQty)}
                              onChangeText={value => updateItemQuantity(item.id, parseInt(value, 10) || 0)}
                              keyboardType='numeric'
                              style={{
                                flex: 1,
                                backgroundColor: colors.screen,
                                color: colors.heading,
                                padding: 7,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.border,
                                fontSize: 12,
                                textAlign: 'center'
                              }}
                            />
                            <Text style={{ fontSize: 12, color: colors.label }}>/ {maxRefundable}</Text>
                          </View>

                          <BottomSheetTextInput
                            value={currentReason}
                            onChangeText={value => updateItemReason(item.id, value)}
                            placeholder='Reason...'
                            placeholderTextColor={colors.muted}
                            style={{
                              backgroundColor: colors.screen,
                              color: colors.heading,
                              padding: 8,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: colors.border,
                              fontSize: 12
                            }}
                          />
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
              <SectionDivider />
            </>
          )}

          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              marginBottom: 6
            }}
          >
            Summary
          </Text>
          <View
            style={{
              padding: 10,
              backgroundColor: colors.screen,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Original Total</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
                ${orderTotal.toFixed(2)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: colors.danger }}>Refund Amount</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>
                -${refundAmount.toFixed(2)}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 8 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.heading, fontWeight: '700' }}>New Total</Text>
              <Text style={{ fontSize: 13, color: colors.heading, fontWeight: '700' }}>
                ${(orderTotal - refundAmount).toFixed(2)}
              </Text>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheet>
  )
}

const ChoiceButton = ({
  title,
  subtitle,
  active,
  onPress,
  disabled = false
}: {
  title: string
  subtitle: string
  active: boolean
  onPress: () => void
  disabled?: boolean
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={{
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: active ? colors.teal + '50' : colors.border,
      backgroundColor: active ? colors.teal + '10' : colors.screen,
      opacity: disabled ? 0.5 : 1
    }}
  >
    <Text style={{ fontSize: 12, fontWeight: '700', textAlign: 'center', color: active ? colors.teal : colors.heading }}>
      {title}
    </Text>
    <Text style={{ fontSize: 11, textAlign: 'center', marginTop: 2, color: active ? colors.teal : colors.label }}>
      {subtitle}
    </Text>
  </TouchableOpacity>
)

const MethodButton = ({
  label,
  icon,
  active,
  onPress
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onPress: () => void
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: active ? colors.teal + '50' : colors.border,
      backgroundColor: active ? colors.teal + '10' : colors.screen,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }}
  >
    {icon}
    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? colors.teal : colors.heading }}>{label}</Text>
  </TouchableOpacity>
)

const SectionDivider = () => (
  <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
)

const AdvancedRefundModal = forwardRef(AdvancedRefundModalComponent)
AdvancedRefundModal.displayName = 'AdvancedRefundModal'

export default AdvancedRefundModal
