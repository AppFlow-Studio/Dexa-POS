import { useToast } from '@/contexts/ToastContext'
import { isOrderReadOnly } from '@/lib/orderAccessControl'
import { colors } from '@/lib/theme'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { Banknote, Columns, CreditCard } from 'lucide-react-native'
import { useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

type PaymentMethod = 'Card' | 'Split' | 'Cash'

const PaymentActions = () => {
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>('Card')
  const openPaymentModal = usePaymentStore(state => state.open)
  const activeOrder = useOrderStore(state =>
    state.activeOrderId ? state.ordersById[state.activeOrderId] : null
  )
  const currentStationId = useOrderStore(state => state.currentStationId)
  const pendingTableSelection = useOrderStore(
    state => state.pendingTableSelection
  )
  const { show } = useToast()
  const isReadOnlyOrder = isOrderReadOnly(activeOrder, currentStationId)
  const ownerStationLabel = activeOrder?.station_name?.trim() || 'another station'

  const paymentMethods = [
    { name: 'Card', icon: CreditCard },
    { name: 'Split', icon: Columns },
    { name: 'Cash', icon: Banknote }
  ]

  const handlePlaceOrder = () => {
    if (isReadOnlyOrder) {
      show({
        title: 'Payment Blocked',
        message: `This order is owned by ${ownerStationLabel}. Switch to that station to take payment.`,
        type: 'error'
      })
      return
    }

    const tableIdForOrder =
      activeOrder?.order_type === 'dine_in'
        ? pendingTableSelection
        : activeOrder?.service_location_id

    if (activeOrder?.order_type === 'dine_in' && !tableIdForOrder) {
      show({
        title: 'Table Not Selected',
        message: 'Please select a table before placing a dine-in order.',
        type: 'error'
      })
      return
    }

    // For dine-in orders, we need to check if the order is paid before assigning to table
    if (
      activeOrder?.order_type === 'dine_in' &&
      activeOrder.paid_status !== 'Paid'
    ) {
      // Open payment modal with the pending table selection
      openPaymentModal(activeMethod, tableIdForOrder)
      return
    }

    // For non-dine-in orders or already paid dine-in orders, proceed normally
    openPaymentModal(activeMethod, tableIdForOrder)
  }

  return (
    <View
      style={{
        paddingVertical: 4,
        paddingHorizontal: 16,
        backgroundColor: colors.panel
      }}
    >
      {/* Payment Method Selector */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 6,
          borderRadius: 12
        }}
      >
        {paymentMethods.map(method => {
          const isActive = activeMethod === method.name
          return (
            <TouchableOpacity
              key={method.name}
              onPress={() => setActiveMethod(method.name as PaymentMethod)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: isActive ? colors.teal : 'transparent',
                borderWidth: isActive ? 1 : 0,
                borderColor: isActive ? colors.teal : 'transparent'
              }}
            >
              <method.icon color={isActive ? '#fff' : colors.muted} size={24} />
              <Text
                style={{
                  fontWeight: '600',
                  marginTop: 4,
                  color: isActive ? '#fff' : colors.muted,
                  fontSize: 12
                }}
              >
                {method.name}
              </Text>
              {isActive && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    height: 3,
                    width: 32,
                    backgroundColor: colors.teal,
                    borderRadius: 2
                  }}
                />
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Final Action Buttons */}
      <TouchableOpacity
        disabled={!activeOrder || activeOrder.items.length === 0 || isReadOnlyOrder}
        style={{
          width: '100%',
          paddingVertical: 16,
          backgroundColor: colors.teal,
          borderRadius: 12,
          marginTop: 16,
          alignItems: 'center',
          opacity:
            !activeOrder || activeOrder.items.length === 0 || isReadOnlyOrder
              ? 0.5
              : 1
        }}
        onPress={handlePlaceOrder}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
          Place Order
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={{
          width: '100%',
          paddingVertical: 16,
          backgroundColor: colors.panel,
          borderRadius: 12,
          marginTop: 8,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        <Text
          style={{ color: colors.heading, fontWeight: 'bold', fontSize: 16 }}
        >
          Open Register
        </Text>
      </TouchableOpacity>
    </View>
  )
}

export default PaymentActions
