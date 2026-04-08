import { colors } from '@/lib/theme'
import { CartItem, OrderProfile } from '@/lib/types'
import { X } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native'

interface OrderNotesModalProps {
  isOpen: boolean
  onClose: () => void
  order: OrderProfile | null
}

const ModifierItem = ({ item }: { item: CartItem }) => (
  <View
    style={{
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border
    }}
  >
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: colors.heading,
          flex: 1,
          marginRight: 8
        }}
      >
        {item.name}
      </Text>
      <View
        style={{
          backgroundColor: colors.screen,
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label }}>
          {item.quantity} pc{item.quantity !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>

    {item.customizations?.modifiers &&
      item.customizations.modifiers.length > 0 && (
        <View style={{ marginTop: 8, gap: 4 }}>
          {item.customizations.modifiers.map((mod, index) => (
            <View key={index}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                {mod.categoryName}
              </Text>
              <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
                {mod.options
                  .map(
                    opt =>
                      `${opt.name}${
                        opt.price > 0 ? ` (+$${opt.price.toFixed(2)})` : ''
                      }`
                  )
                  .join(', ')}
              </Text>
            </View>
          ))}
        </View>
      )}

    {item.customizations?.notes && (
      <View
        style={{
          marginTop: 8,
          flexDirection: 'row',
          backgroundColor: colors.screen,
          borderRadius: 8,
          overflow: 'hidden'
        }}
      >
        <View style={{ width: 3, backgroundColor: colors.info }} />
        <Text
          style={{
            flex: 1,
            padding: 10,
            fontSize: 12,
            color: colors.label,
            fontStyle: 'italic'
          }}
        >
          {item.customizations.notes}
        </Text>
      </View>
    )}
  </View>
)

const ANIMATION_DURATION = 280
const SWIPE_THRESHOLD = 100

const OrderNotesModal: React.FC<OrderNotesModalProps> = ({
  isOpen,
  onClose,
  order
}) => {
  const slideAnim = useRef(new Animated.Value(1)).current
  const scaleAnim = useRef(new Animated.Value(0.98)).current
  const fadeAnim = useRef(new Animated.Value(0)).current
  const dragY = useRef(new Animated.Value(0)).current
  const [isVisible, setIsVisible] = useState(false)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) dragY.setValue(gs.dy)
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SWIPE_THRESHOLD) {
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

  const orderLabel =
    order.display_number || order.order_number || `#${order.id?.slice(-4)}`

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

      {/* Sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: '78%',
          backgroundColor: colors.panel,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.screen,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 10,
          transform: [
            {
              translateY: Animated.add(
                slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 500]
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
          style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}
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
          <View>
            <Text
              style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
            >
              Order Notes
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
              {orderLabel} · ${(order.total_amount || 0).toFixed(2)}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              padding: 7,
              borderRadius: 8,
              backgroundColor: pressed ? colors.teal + '15' : colors.card,
              borderWidth: 1,
              borderColor: colors.border
            })}
          >
            <X color={colors.label} size={15} />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Order-level notes */}
          {order.notes && (
            <View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6
                }}
              >
                Order Notes
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: colors.screen,
                  borderRadius: 8,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <View style={{ width: 3, backgroundColor: colors.warning }} />
                <Text
                  style={{
                    flex: 1,
                    padding: 10,
                    fontSize: 13,
                    color: colors.heading,
                    fontStyle: 'italic'
                  }}
                >
                  {order.notes}
                </Text>
              </View>
            </View>
          )}

          {/* Items */}
          {order.items.length > 0 && (
            <View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6
                }}
              >
                Items ({order.items.length})
              </Text>
              <View style={{ gap: 8 }}>
                {order.items.map((item, idx) => (
                  <ModifierItem key={item.id || idx} item={item} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  )
}

export default OrderNotesModal
