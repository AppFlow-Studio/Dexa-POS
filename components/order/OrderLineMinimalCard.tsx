import { colors } from '@/lib/theme'
import { OrderProfile } from '@/lib/types'
import { formatOrderStatus } from '@/utils/orderStatusHelpers'
import { CheckCircle2, ChevronRight, Eye, Printer } from 'lucide-react-native'
import React, { useMemo } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface OrderLineMinimalCardProps {
  order: OrderProfile
  onMarkDone: () => void
  onViewItems: () => void
  onPrintReceipt?: () => void
}

const chipBase = {
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 999
} as const

const OrderLineMinimalCard: React.FC<OrderLineMinimalCardProps> = ({
  order,
  onMarkDone,
  onViewItems,
  onPrintReceipt
}) => {
  const totalAmount = order.total_amount ?? 0

  const displayId =
    order.display_number || order.order_number || `#${order.id.slice(-4)}`

  const openedAt = order.opened_at
    ? new Date(order.opened_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      })
    : ''

  const itemCount =
    order.items.length > 0 ? order.items.length : order._broadcastItemCount ?? 0

  const cashDue = order.cash_amount_due ?? order.amount_due ?? totalAmount

  const canMarkDone =
    order.order_status === 'preparing' ||
    order.order_status === 'sent_to_kitchen' ||
    (order.order_status === 'ready' && order.paid_status === 'Paid')

  const orderStatusColor = useMemo(() => {
    switch (order.order_status) {
      case 'ready':
        return colors.success
      case 'preparing':
      case 'sent_to_kitchen':
        return colors.warning
      case 'completed':
        return colors.info
      case 'cancelled':
      case 'void':
        return colors.danger
      default:
        return colors.muted
    }
  }, [order.order_status])

  const paidStatusColor =
    order.paid_status === 'Paid'
      ? colors.success
      : order.paid_status === 'Partial'
      ? colors.warning
      : colors.muted

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.info + '55',
        overflow: 'hidden',
        backgroundColor: '#040d22'
      }}
    >
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: colors.heading
              }}
              numberOfLines={1}
            >
              {displayId}
            </Text>
            {order.order_type ? (
              <Text
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  color: colors.muted,
                  textTransform: 'lowercase'
                }}
              >
                . {order.order_type}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              ...chipBase,
              backgroundColor: paidStatusColor + '20',
              borderWidth: 1,
              borderColor: paidStatusColor + '30'
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: paidStatusColor
              }}
            >
              {order.paid_status}
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 6,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Text style={{ fontSize: 10, color: colors.label }} numberOfLines={1}>
            {order.customer_name || 'Walk-In'} . {itemCount} item
            {itemCount !== 1 ? 's' : ''}
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted }}>{openedAt}</Text>
        </View>

        <View style={{ marginTop: 8, flexDirection: 'row', gap: 6 }}>
          <View
            style={{
              ...chipBase,
              backgroundColor: orderStatusColor + '20',
              borderWidth: 1,
              borderColor: orderStatusColor + '30'
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: orderStatusColor
              }}
            >
              {formatOrderStatus(order.order_status)}
            </Text>
          </View>
          <View
            style={{
              ...chipBase,
              backgroundColor: colors.muted + '20',
              borderWidth: 1,
              borderColor: colors.muted + '30'
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: colors.label
              }}
            >
              {order.check_status || 'Opened'}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.border,
          backgroundColor: '#101e44'
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Text style={{ fontSize: 11, color: colors.muted }}>
            Cash ${cashDue.toFixed(2)}
          </Text>
          <Text
            style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}
          >
            ${totalAmount.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={{ paddingVertical: 4 }}>
        {canMarkDone && (
          <TouchableOpacity
            onPress={onMarkDone}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              paddingVertical: 8
            }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                backgroundColor: colors.success + '25',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8
              }}
            >
              <CheckCircle2 size={15} color={colors.success} />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: colors.success,
                flex: 1
              }}
            >
              Mark as Done
            </Text>
            <ChevronRight size={16} color={colors.label} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={onViewItems}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 8
          }}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              backgroundColor: colors.info + '20',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8
            }}
          >
            <Eye size={15} color={colors.label} />
          </View>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.label,
              flex: 1
            }}
          >
            View Items
          </Text>
          <ChevronRight size={16} color={colors.label} />
        </TouchableOpacity>

        {onPrintReceipt && order.paid_status === 'Paid' && (
          <TouchableOpacity
            onPress={onPrintReceipt}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              paddingVertical: 8
            }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                backgroundColor: colors.muted + '20',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8
              }}
            >
              <Printer size={15} color={colors.label} />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: colors.label,
                flex: 1
              }}
            >
              Print Receipt
            </Text>
            <ChevronRight size={16} color={colors.label} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

export default React.memo(OrderLineMinimalCard)
