import { colors } from '@/lib/theme'
import { PreviousOrder } from '@/lib/types'
import { ArrowLeft, ShoppingBag, Truck, Utensils } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface OrderDetailHeaderProps {
  order: PreviousOrder
  onBack: () => void
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  Paid: { bg: colors.teal + '20', text: colors.teal },
  Refunded: { bg: colors.danger + '20', text: colors.danger },
  'Partially Refunded': { bg: colors.warning + '20', text: colors.warning },
  Unpaid: { bg: colors.muted + '20', text: colors.muted },
  'In Progress': { bg: colors.teal + '20', text: colors.teal }
}

const checkStatusConfig: Record<string, { bg: string; text: string }> = {
  Opened: { bg: colors.teal + '20', text: colors.teal },
  Closed: { bg: colors.muted + '20', text: colors.muted }
}

const orderTypeConfig: Record<
  string,
  { icon: React.ElementType; bg: string; text: string; iconColor: string }
> = {
  'Dine In': {
    icon: Utensils,
    bg: colors.teal + '20',
    text: colors.teal,
    iconColor: colors.teal
  },
  Takeaway: {
    icon: ShoppingBag,
    bg: colors.warning + '20',
    text: colors.warning,
    iconColor: colors.warning
  },
  Delivery: {
    icon: Truck,
    bg: colors.info + '20',
    text: colors.info,
    iconColor: colors.info
  }
}

const OrderDetailHeader: React.FC<OrderDetailHeaderProps> = ({
  order,
  onBack
}) => {
  const paymentStyle = statusConfig[order.paymentStatus] || statusConfig.Unpaid
  const checkStyle =
    checkStatusConfig[order.checkStatus || 'Opened'] || checkStatusConfig.Opened
  const typeStyle = orderTypeConfig[order.type] || orderTypeConfig['Dine In']
  const TypeIcon = typeStyle.icon

  return (
    <View
      style={{
        backgroundColor: colors.screen,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 8
        }}
      >
        {/* Back button */}
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.7}
          style={{
            padding: 6,
            backgroundColor: colors.teal + '15',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.teal + '40',
            marginRight: 8
          }}
        >
          <ArrowLeft color={colors.teal} size={16} />
        </TouchableOpacity>

        {/* Title */}
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: colors.heading,
            flex: 1,
            marginRight: 8
          }}
          numberOfLines={1}
        >
          Order {order.display_number || `#${order.orderId.slice(-6)}`}
        </Text>

        {/* Badges */}
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {/* Payment status */}
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 20,
              backgroundColor: paymentStyle.bg,
              borderWidth: 1,
              borderColor: paymentStyle.text + '50'
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: paymentStyle.text
              }}
            >
              {order.paymentStatus}
            </Text>
          </View>

          {/* Check status */}
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 20,
              backgroundColor: checkStyle.bg,
              borderWidth: 1,
              borderColor: checkStyle.text + '50'
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: checkStyle.text
              }}
            >
              {order.checkStatus || 'Opened'}
            </Text>
          </View>

          {/* Order type */}
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: typeStyle.bg,
              borderWidth: 1,
              borderColor: typeStyle.text + '50'
            }}
          >
            <TypeIcon color={typeStyle.iconColor} size={11} />
            <Text
              style={{ fontSize: 11, fontWeight: '600', color: typeStyle.text }}
            >
              {order.type}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

export default React.memo(OrderDetailHeader)
