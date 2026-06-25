import { deriveEffectivePaidStatus } from '@/lib/deriveEffectivePaidStatus'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { OrderProfile } from '@/lib/types'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { formatOrderStatus, formatPaymentStatus } from '@/utils/orderStatusHelpers'
import { CheckCircle2, ChevronRight, Eye, Printer } from 'lucide-react-native'
import React, { useMemo } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface OrderLineMinimalCardProps {
  order: OrderProfile
  onMarkDone: () => void
  onViewItems: () => void
  onPrintReceipt?: () => void
}

const OrderLineMinimalCard: React.FC<OrderLineMinimalCardProps> = ({
  order,
  onMarkDone,
  onViewItems,
  onPrintReceipt
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const chipBase = {
    paddingHorizontal: s(8),
    paddingVertical: s(3),
    borderRadius: 999
  } as const
  const tableName = useFloorPlanStore(s => {
    if (!order.service_location_id) return null
    return s.tablesById[order.service_location_id]?.name ?? order.service_location_id
  })
  const totalAmount = order.total_amount ?? 0
  const effectivePaidStatus = deriveEffectivePaidStatus(order) ?? order.paid_status

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
    (order.order_status === 'ready' && effectivePaidStatus === 'Paid')

  const orderStatusColor = useMemo(() => {
    switch (order.order_status) {
      case 'ready':
        return colors.success
      case 'preparing':
        return colors.orderPreparing
      case 'sent_to_kitchen':
        return colors.orderSentToKitchen
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
    effectivePaidStatus === 'Paid'
      ? colors.success
      : effectivePaidStatus === 'Partial'
      ? colors.warning
      : colors.muted

  return (
    <View
      style={{
        borderRadius: s(18),
        borderWidth: 1,
        borderColor: colors.info + '55',
        overflow: 'hidden',
        backgroundColor: colors.panel
      }}
    >
      <View style={{ paddingHorizontal: s(12), paddingTop: s(10), paddingBottom: s(8) }}>
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
                fontSize: s(14),
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
                  marginLeft: s(6),
                  fontSize: s(11),
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
                fontSize: s(10),
                fontWeight: '700',
                color: paidStatusColor
              }}
            >
              {formatPaymentStatus(effectivePaidStatus ?? order.paid_status)}
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: s(6),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Text style={{ fontSize: s(10), color: colors.label }} numberOfLines={1}>
            {order.customer_name || 'Walk-In'}
            {tableName ? ` . Table ${tableName}` : ''} . {itemCount} item
            {itemCount !== 1 ? 's' : ''}
          </Text>
          <Text style={{ fontSize: s(10), color: colors.muted }}>{openedAt}</Text>
        </View>

        <View style={{ marginTop: s(8), flexDirection: 'row', gap: s(6) }}>
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
                fontSize: s(10),
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
                fontSize: s(10),
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
          paddingHorizontal: s(12),
          paddingVertical: s(10),
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.screen
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Text style={{ fontSize: s(11), color: colors.muted }}>
            Cash ${cashDue.toFixed(2)}
          </Text>
          <Text
            style={{ fontSize: s(16), fontWeight: '700', color: colors.heading }}
          >
            ${totalAmount.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={{ paddingVertical: s(4), backgroundColor: colors.screen }}>
        {canMarkDone && (
          <TouchableOpacity
            onPress={onMarkDone}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: s(10),
              paddingVertical: s(8)
            }}
          >
            <View
              style={{
                width: s(30),
                height: s(30),
                borderRadius: s(9),
                backgroundColor: colors.success + '25',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: s(8)
              }}
            >
              <CheckCircle2 size={s(15)} color={colors.success} />
            </View>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: '600',
                color: colors.success,
                flex: 1
              }}
            >
              Mark as Done
            </Text>
            <ChevronRight size={s(16)} color={colors.label} />
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
            <Eye size={s(15)} color={colors.info} />
          </View>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.heading,
              flex: 1
            }}
          >
            View Items
          </Text>
          <ChevronRight size={16} color={colors.label} />
        </TouchableOpacity>

        {onPrintReceipt && effectivePaidStatus === 'Paid' && (
          <TouchableOpacity
            onPress={onPrintReceipt}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: s(10),
              paddingVertical: s(8)
            }}
          >
            <View
              style={{
                width: s(30),
                height: s(30),
                borderRadius: s(9),
                backgroundColor: colors.muted + '20',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: s(8)
              }}
            >
              <Printer size={s(15)} color={colors.muted} />
            </View>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: '600',
                color: colors.heading,
                flex: 1
              }}
            >
              Print Receipt
            </Text>
            <ChevronRight size={s(16)} color={colors.label} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

export default React.memo(OrderLineMinimalCard)
