import { colors } from '@/lib/theme'
import { OrderProfile, OrderProfilePayment } from '@/lib/types'
import { PrinterService } from '@/services/printing/PrinterService'
import { SelectedLocation } from '@/stores/useStoreSettingsStore'
import { formatCurrency } from '@/utils/currency'
import { Printer, X } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface SplitReceiptSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  order: OrderProfile | null
  location: SelectedLocation | null
}

const ANIMATION_DURATION = 280
const SWIPE_THRESHOLD = 100

// Label for a payment row: prefer the split portion, fall back to an ordinal.
// Pay-for-items is sequential partial item payment (no splitInfo), so it gets
// an "Items Paid" label rather than "Payment 1 of 1".
function portionLabel (
  payment: OrderProfilePayment,
  index: number,
  totalCount: number,
  splitPath?: string | null
): string {
  if (payment.splitInfo) {
    return `Split ${payment.splitInfo.portionIndex} of ${payment.splitInfo.totalPortions}`
  }
  if (splitPath === 'pay-for-items') {
    return totalCount > 1 ? `Items Paid #${index + 1}` : 'Items Paid'
  }
  return `Payment ${index + 1} of ${totalCount}`
}

const SplitReceiptSelectorModal: React.FC<SplitReceiptSelectorModalProps> = ({
  isOpen,
  onClose,
  order,
  location
}) => {
  const slideAnim = useRef(new Animated.Value(1)).current
  const scaleAnim = useRef(new Animated.Value(0.98)).current
  const fadeAnim = useRef(new Animated.Value(0)).current
  const dragY = useRef(new Animated.Value(0)).current
  const [isVisible, setIsVisible] = useState(false)
  const [closeButtonPressed, setCloseButtonPressed] = useState(false)
  // Which row is currently sending to the printer (payment id), or "all".
  const [printingId, setPrintingId] = useState<string | null>(null)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) dragY.setValue(gestureState.dy)
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          onClose()
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10
          }).start()
        }
      }
    })
  ).current

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      dragY.setValue(0)
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true
        })
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.98,
          duration: ANIMATION_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          useNativeDriver: true
        })
      ]).start(() => setIsVisible(false))
    }
  }, [isOpen, slideAnim, scaleAnim, fadeAnim, dragY])

  if (!isVisible || !order) return null

  const allPayments = order.payments ?? []
  const printablePayments = allPayments.filter(p => !p.isVoided)

  const handlePrintOne = async (payment: OrderProfilePayment) => {
    if (!location || printingId) return
    setPrintingId(payment.id)
    try {
      await PrinterService.printSplitPaymentReceipt(order, payment, location)
    } catch (e) {
      console.warn('[SplitReceiptSelectorModal] Print failed:', e)
    } finally {
      setPrintingId(null)
    }
  }

  const handlePrintAll = async () => {
    if (!location || printingId) return
    setPrintingId('all')
    try {
      await PrinterService.printAllSplitReceipts(order, location)
      onClose()
    } catch (e) {
      console.warn('[SplitReceiptSelectorModal] Print all failed:', e)
    } finally {
      setPrintingId(null)
    }
  }

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000
      }}
    >
      {/* Backdrop */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: fadeAnim
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.panel,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          maxHeight: '85%',
          shadowColor: colors.screen,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 10,
          transform: [
            {
              translateY: Animated.add(
                slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 600]
                }),
                dragY
              )
            },
            { scale: scaleAnim }
          ]
        }}
      >
        {/* Drag handle */}
        <Animated.View
          style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}
          {...panResponder.panHandlers}
        >
          <View
            style={{
              width: 36,
              height: 4,
              backgroundColor: colors.border,
              borderRadius: 2
            }}
          />
        </Animated.View>

        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
          >
            Split Receipts
          </Text>
          <Pressable
            onPress={onClose}
            onPressIn={() => setCloseButtonPressed(true)}
            onPressOut={() => setCloseButtonPressed(false)}
            style={{
              padding: 7,
              borderRadius: 10,
              backgroundColor: closeButtonPressed
                ? colors.teal + '15'
                : colors.screen,
              borderWidth: 1,
              borderColor: closeButtonPressed
                ? colors.teal + '40'
                : colors.border
            }}
          >
            <X color={closeButtonPressed ? colors.teal : colors.label} size={16} />
          </Pressable>
        </View>

        {/* Payment rows */}
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 8, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {printablePayments.length === 0 ? (
            <Text
              style={{
                fontSize: 13,
                color: colors.muted,
                textAlign: 'center',
                paddingVertical: 16
              }}
            >
              No printable payments on this order.
            </Text>
          ) : (
            printablePayments.map((payment, index) => {
              const isRefunded =
                payment.status === 'refunded' ||
                (payment.refundedAmount ?? 0) > 0
              const rawPayer = payment.transactionDetails?.splitLabel
              // Suppress the generic pay-for-items placeholder.
              const payer =
                rawPayer && rawPayer !== 'Selected Items'
                  ? rawPayer
                  : undefined
              const total = payment.amount + (payment.tip_amount || 0)
              const isThisPrinting = printingId === payment.id
              return (
                <View
                  key={payment.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.screen,
                    opacity: isRefunded ? 0.55 : 1
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: colors.heading
                      }}
                    >
                      {portionLabel(
                        payment,
                        index,
                        printablePayments.length,
                        order.split_payment_path
                      )}
                      {payer ? ` · ${payer}` : ''}
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: colors.label, marginTop: 2 }}
                    >
                      {String(payment.method)} · {formatCurrency(total)}
                      {isRefunded ? '  (Refunded)' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handlePrintOne(payment)}
                    disabled={!location || !!printingId}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      backgroundColor: colors.teal + '15',
                      opacity: !location || printingId ? 0.6 : 1
                    }}
                  >
                    {isThisPrinting ? (
                      <ActivityIndicator size='small' color={colors.teal} />
                    ) : (
                      <Printer color={colors.teal} size={14} />
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {isThisPrinting ? 'Printing...' : 'Print'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            })
          )}
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 14,
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border
          }}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: colors.danger + '50',
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: colors.danger + '15'
            }}
            onPress={onClose}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}
            >
              Close
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 2,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 7,
              backgroundColor: colors.teal,
              borderRadius: 8,
              opacity:
                !location || printablePayments.length === 0 || printingId
                  ? 0.6
                  : 1
            }}
            onPress={handlePrintAll}
            disabled={
              !location || printablePayments.length === 0 || !!printingId
            }
          >
            {printingId === 'all' ? (
              <ActivityIndicator size='small' color={colors.onSolid} />
            ) : (
              <Printer color={colors.onSolid} size={16} />
            )}
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: colors.onSolid }}
            >
              {printingId === 'all'
                ? 'Printing...'
                : 'Print All Split Receipts'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  )
}

export default SplitReceiptSelectorModal
