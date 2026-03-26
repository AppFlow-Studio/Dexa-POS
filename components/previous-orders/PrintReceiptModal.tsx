import { colors } from '@/lib/theme'
import { OrderProfile } from '@/lib/types'
import { PrinterService } from '@/services/printing/PrinterService'
import { SelectedLocation } from '@/stores/useStoreSettingsStore'
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

interface PrintReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  order: OrderProfile | null
  location: SelectedLocation | null
}

const ReceiptRow = ({
  label,
  value,
  bold = false
}: {
  label: string
  value: string | number
  bold?: boolean
}) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: colors.border
    }}
  >
    <Text
      style={{
        fontSize: bold ? 14 : 12,
        color: colors.label,
        fontWeight: bold ? '700' : '400'
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: bold ? 14 : 12,
        fontWeight: bold ? '700' : '600',
        color: colors.heading
      }}
    >
      {value}
    </Text>
  </View>
)

const ANIMATION_DURATION = 280
const SWIPE_THRESHOLD = 100

const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
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
  const [isPrinting, setIsPrinting] = useState(false)

  // Pan responder for drag gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          dragY.setValue(gestureState.dy)
        }
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
      ]).start(() => {
        setIsVisible(false)
      })
    }
  }, [isOpen, slideAnim, scaleAnim, fadeAnim, dragY])

  if (!isVisible || !order) return null

  // Create a simplified summary for the receipt
  const nonVoidedItems = (order.items || []).filter(item => !item.is_voided)
  const receiptSummary = nonVoidedItems.reduce((acc, item) => {
    const existing = acc.find(i => i.name === item.name)
    if (existing) {
      existing.quantity += item.quantity
      existing.totalPrice += item.price * item.quantity
    } else {
      acc.push({
        name: item.name,
        quantity: item.quantity,
        totalPrice: item.price * item.quantity
      })
    }
    return acc
  }, [] as { name: string; quantity: number; totalPrice: number }[])

  const handlePrintReceipt = async () => {
    if (!order || !location) return
    setIsPrinting(true)
    try {
      const success = await PrinterService.printReceipt(order, location)
      if (success) {
        onClose()
      }
    } catch (e) {
      console.warn('[PrintReceiptModal] Print failed:', e)
    } finally {
      setIsPrinting(false)
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
      {/* Semi-transparent backdrop */}
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
        {/* Drag Handle */}
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
            Print Receipt
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
            <X
              color={closeButtonPressed ? colors.teal : colors.label}
              size={16}
            />
          </Pressable>
        </View>

        {/* Receipt Content */}
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Receipt Card */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <ReceiptRow
              label='Order #'
              value={
                order.display_number ||
                order.order_number ||
                `#${order.id.slice(-4)}`
              }
            />
            <ReceiptRow
              label='Table'
              value={order.service_location_name || 'N/A'}
            />
            <ReceiptRow label='Type' value={order.order_type || 'Dine In'} />

            <View
              style={{
                height: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            />

            <ReceiptRow
              label='Total Items'
              value={`${nonVoidedItems.length} Items`}
            />
            {receiptSummary.map(item => (
              <ReceiptRow
                key={item.name}
                label={`${item.quantity}x ${item.name}`}
                value={`$${item.totalPrice.toFixed(2)}`}
              />
            ))}

            <View
              style={{
                height: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            />

            <ReceiptRow
              label='Subtotal'
              value={`$${receiptSummary
                .reduce((sum, i) => sum + i.totalPrice, 0)
                .toFixed(2)}`}
            />
            <ReceiptRow
              label='Tax'
              value={`$${(order.total_tax || 0).toFixed(2)}`}
            />
            {(order.total_discount ?? 0) > 0 && (
              <ReceiptRow
                label='Discount'
                value={`-$${(order.total_discount || 0).toFixed(2)}`}
              />
            )}

            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginVertical: 10
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Total
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.success
                }}
              >
                ${(order.total_amount || 0).toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer with Buttons */}
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
              flex: 1,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 7,
              backgroundColor: colors.teal,
              borderRadius: 8,
              opacity: isPrinting ? 0.6 : 1
            }}
            onPress={handlePrintReceipt}
            disabled={isPrinting || !location}
          >
            {isPrinting ? (
              <ActivityIndicator size='small' color={colors.onSolid} />
            ) : (
              <Printer color={colors.onSolid} size={16} />
            )}
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: colors.onSolid }}
            >
              {isPrinting ? 'Printing...' : 'Print Receipt'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  )
}

export default PrintReceiptModal
