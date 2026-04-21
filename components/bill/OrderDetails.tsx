import { useToast } from '@/contexts/ToastContext'
import { calculatePaidStatus } from '@/lib/order-calculator'
import { colors } from '@/lib/theme'
import type { OrderProfile } from '@/lib/types'
import { useCustomerSheetStore } from '@/stores/useCustomerSheetStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { formatAddress } from '@/utils/addressUtils'
import { Edit3, MapPin, User } from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import Svg, { Rect } from 'react-native-svg'

function getPaymentBadgeStatus (
  order: OrderProfile | null
): OrderProfile['paid_status'] | null {
  if (!order) return null

  const hasCashPayments =
    order.payments?.some(
      payment => !payment.isVoided && payment.isCashPriced
    ) ?? false

  if (order.paid_status === 'Refunded') return 'Refunded'
  if (order.paid_status === 'Paid' && (order.amount_due ?? 0) <= 0.01) {
    return 'Paid'
  }
  if (
    hasCashPayments &&
    (order.cash_amount_due ?? Number.POSITIVE_INFINITY) <= 0.01
  ) {
    return 'Paid'
  }

  const hasItems = (order.items?.length ?? 0) > 0
  const hasPayments =
    order.payments?.some(
      payment =>
        !payment.isVoided &&
        ((payment.amount ?? 0) > 0 || (payment.refundedAmount ?? 0) > 0)
    ) ?? false

  const derivedTotal = Math.max(
    order.total_amount ?? 0,
    (order.amount_paid ?? 0) + Math.max(order.amount_due ?? 0, 0)
  )
  const hasBillableTotal = derivedTotal > 0.01

  if (!hasItems && !hasBillableTotal && !hasPayments) return null

  if (hasPayments && hasBillableTotal) {
    return calculatePaidStatus(order.payments, derivedTotal)
  }

  if (order.amount_due != null) {
    const amountPaid = order.amount_paid ?? 0

    if (order.amount_due <= 0.01 && (hasBillableTotal || amountPaid > 0)) {
      return 'Paid'
    }

    if (amountPaid > 0 && order.amount_due > 0.01) {
      return 'Partial'
    }
  }

  if (hasBillableTotal) {
    return order.paid_status || 'Pending'
  }

  return order.paid_status || null
}

const DiningTableIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 16
}) => (
  <Svg width={size} height={size} viewBox='0 0 24 24' fill='none'>
    {/* Table top */}
    <Rect x='3' y='6' width='18' height='4' rx='1.5' fill={color} />

    {/* Left leg */}
    <Rect x='6' y='10' width='2' height='8' rx='1' fill={color} />

    {/* Right leg */}
    <Rect x='16' y='10' width='2' height='8' rx='1' fill={color} />

    {/* Bottom support (optional, cleaner look) */}
    <Rect
      x='5'
      y='17'
      width='14'
      height='2'
      rx='1'
      fill={color}
      opacity={0.9}
    />
  </Svg>
)

import { useShallow } from 'zustand/react/shallow'
import { AddressAutocomplete } from '../ui/AddressAutocomplete'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'

const OrderDetailsComponent: React.FC<{
  tableLabel?: string
  onOpenTableSelector?: () => void
}> = ({ tableLabel, onOpenTableSelector }) => {
  const { show } = useToast()

  // PERF: Single useShallow selector - runs 1 function instead of 11
  // useShallow compares values shallowly, so primitive returns prevent unnecessary re-renders
  const {
    activeOrderId,
    customerName,
    customerPhone,
    orderType,
    serviceLocationId,
    deliveryAddress,
    orderStatus,
    paymentStatus,
    checkStatus
  } = useOrderStore(
    useShallow(s => {
      const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null
      const type = order?.order_type || 'takeout'
      return {
        activeOrderId: s.activeOrderId,
        customerName: order?.customer_name || null,
        customerPhone: order?.customer_phone || null,
        orderType: type,
        serviceLocationId: order?.service_location_id || null,
        deliveryAddress: order?.delivery_address || '',
        orderStatus: order?.order_status || null,
        paymentStatus: getPaymentBadgeStatus(order),
        checkStatus: order?.check_status || null
      }
    })
  )

  // Actions - stable function references
  const updateActiveOrderDetails = useOrderStore(
    s => s.updateActiveOrderDetails
  )
  const addItemToActiveOrder = useOrderStore(s => s.addItemToActiveOrder)

  const { openSheet } = useCustomerSheetStore()

  // Open Item Modal State
  const [isOpenItemModalVisible, setIsOpenItemModalVisible] = useState(false)
  const [openItemName, setOpenItemName] = useState('')
  const [openItemPrice, setOpenItemPrice] = useState('')

  // Local state for editing customer name
  const [localCustomerName, setLocalCustomerName] = useState('')
  const [isCustomerNameModalVisible, setIsCustomerNameModalVisible] =
    useState(false)
  const [tempCustomerName, setTempCustomerName] = useState('')

  // Initialize local customer name from store customer name
  useEffect(() => {
    setLocalCustomerName(customerName || '')
  }, [activeOrderId, customerName])

  const handleAddOpenItem = () => {
    if (!openItemName.trim()) {
      show({
        title: 'Item Name Required',
        message: 'Please enter a name for the open item.',
        type: 'error'
      })
      return
    }

    const price = parseFloat(openItemPrice)
    if (isNaN(price) || price <= 0) {
      show({
        title: 'Invalid Price',
        message: 'Please enter a valid, positive price for the item.',
        type: 'error'
      })
      return
    }

    // Check if the active order is closed - O(1) lookup from store directly
    const ordersById = useOrderStore.getState().ordersById
    const currentOrder = activeOrderId ? ordersById[activeOrderId] : undefined
    if (currentOrder?.order_status === 'completed') {
      show({
        title: 'Order Closed',
        message: 'Cannot add items to a closed order. Please reopen it first.',
        type: 'error'
      })
      return
    }

    // Create a new cart item for the open item
    const newOpenItem: any = {
      id: `open_item_${Date.now()}`,
      itemId: `open_item_${Date.now()}`,
      menuItemId: `open_item_${Date.now()}`,
      name: openItemName.trim(),
      quantity: 1,
      originalPrice: price,
      price: price,
      customizations: {
        notes: 'Open Item'
      },
      availableDiscount: undefined,
      appliedDiscount: null,
      // Default missing properties to satisfy CartItem
      paidQuantity: 0,
      unitPrice: price,
      cashPrice: price,
      subtotal: price,
      baseCardPrice: price,
      baseCashPrice: price,
      cashSubtotal: price,
      taxRate: 0,
      taxAmount: 0,
      cashTaxAmount: 0
    }

    addItemToActiveOrder(newOpenItem)

    show({
      title: 'Item Added',
      message: `${openItemName.trim()} for $${price.toFixed(
        2
      )} has been added to the order.`,
      type: 'success'
    })

    // Reset form and close modal
    setOpenItemName('')
    setOpenItemPrice('')
    setIsOpenItemModalVisible(false)
  }

  const handleCancelOpenItem = () => {
    setOpenItemName('')
    setOpenItemPrice('')
    setIsOpenItemModalVisible(false)
  }

  // Customer name modal handlers
  const handleAddCustomerName = () => {
    setTempCustomerName(localCustomerName)
    setIsCustomerNameModalVisible(true)
  }

  const handleSaveCustomerName = () => {
    if (activeOrderId) {
      const trimmedName = tempCustomerName.trim()
      setLocalCustomerName(trimmedName)
      updateActiveOrderDetails({ customer_name: trimmedName })
      setIsCustomerNameModalVisible(false)
      show({
        title: 'Customer Name Updated',
        message: trimmedName
          ? `Order is now under the name: ${trimmedName}`
          : 'Customer name has been removed from the order.',
        type: 'success'
      })
    }
  }

  const handleCancelCustomerName = () => {
    setTempCustomerName(localCustomerName)
    setIsCustomerNameModalVisible(false)
  }

  const isDineInSelected = orderType === 'dine_in'
  const isDeliverySelected = orderType === 'delivery'

  return (
    <View className='px-3 pb-2 z-20'>
      <View className='flex-row w-full gap-x-2'>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            onPress={openSheet}
            className='flex-row w-full items-center px-2.5 rounded-lg h-12'
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                backgroundColor: colors.card,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <User color={colors.label} size={13} />
            </View>
            <View className='ml-2 flex-1'>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.heading
                }}
                numberOfLines={1}
              >
                {customerName || 'Add Customer'}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted }}>
                {customerPhone || 'Optional'}
              </Text>
            </View>
            <Edit3 color={colors.label} size={12} />
          </TouchableOpacity>
        </View>

        {isDineInSelected && (
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              onPress={onOpenTableSelector}
              className='w-full rounded-lg h-12 px-2.5 flex-row items-center gap-2'
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <DiningTableIcon color={colors.label} size={14} />
              <Text
                style={{
                  color: colors.heading,
                  fontSize: 12,
                  fontWeight: '600',
                  flex: 1
                }}
                numberOfLines={1}
              >
                {tableLabel || 'Select Table'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isDeliverySelected && (
          <View style={{ flex: 1, height: 48, zIndex: 50 }}>
            <View
              className='w-full rounded-lg h-12 px-2.5 flex-row items-center'
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <MapPin
                color={colors.label}
                size={13}
                style={{ marginRight: 6 }}
              />
              <View style={{ flex: 1 }}>
                <AddressAutocomplete
                  value={formatAddress(deliveryAddress) || ''}
                  onChangeText={text => {
                    if (activeOrderId)
                      updateActiveOrderDetails({
                        delivery_address: JSON.stringify({
                          street: text,
                          city: '',
                          state: '',
                          zip: ''
                        })
                      })
                  }}
                  onAddressSelected={addr => {
                    if (activeOrderId)
                      updateActiveOrderDetails({
                        delivery_address: JSON.stringify(addr)
                      })
                  }}
                  placeholder='Enter address'
                  inputStyle={{
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    borderRadius: 0,
                    height: 46,
                    minHeight: 46,
                    maxHeight: 46,
                    paddingHorizontal: 0
                  }}
                  dropdownPosition='below'
                />
              </View>
            </View>
          </View>
        )}
      </View>

      <View
        className='flex-row mt-1.5 rounded-lg p-0.5'
        style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        {[
          { label: 'Dine In', value: 'dine in', dbValue: 'dine_in' },
          { label: 'Takeout', value: 'takeaway', dbValue: 'takeout' },
          { label: 'Delivery', value: 'delivery', dbValue: 'delivery' }
        ].map(type => {
          const isActive = orderType === type.dbValue

          return (
            <TouchableOpacity
              key={type.dbValue}
              onPress={() => {
                if (activeOrderId) {
                  updateActiveOrderDetails({ order_type: type.dbValue as any })
                }
              }}
              className='flex-1 h-7 rounded-md items-center justify-center'
              style={{
                backgroundColor: isActive ? colors.teal : 'transparent'
              }}
            >
              <Text
                style={{
                  color: isActive ? colors.onSolid : colors.label,
                  fontSize: 11,
                  fontWeight: '600'
                }}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Status text */}
      {(orderStatus || paymentStatus || checkStatus) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginTop: 5
          }}
        >
          {orderStatus &&
            (() => {
              const cfg: Record<string, { label: string; color: string }> = {
                draft: {
                  label: 'Draft',
                  color: '#9CA3AF'
                },
                sent_to_kitchen: {
                  label: 'In Kitchen',
                  color: '#818CF8'
                },
                preparing: {
                  label: 'Preparing',
                  color: '#F59E0B'
                },
                ready: {
                  label: 'Ready',
                  color: '#22C55E'
                },
                completed: {
                  label: 'Completed',
                  color: '#3B82F6'
                },
                void: {
                  label: 'Void',
                  color: '#EF4444'
                },
                cancelled: {
                  label: 'Cancelled',
                  color: '#EF4444'
                }
              }
              const s = cfg[orderStatus] ?? {
                label: orderStatus,
                color: '#9CA3AF'
              }
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '500',
                      color: colors.muted
                    }}
                  >
                    Order Status:{' '}
                  </Text>
                  <Text
                    style={{ fontSize: 10, fontWeight: '600', color: s.color }}
                  >
                    {s.label}
                  </Text>
                </View>
              )
            })()}
          {paymentStatus &&
            paymentStatus !== 'Pending' &&
            paymentStatus !== 'Unpaid' &&
            (() => {
              const cfg: Record<string, { label: string; color: string }> = {
                Paid: {
                  label: 'Paid',
                  color: '#22C55E'
                },
                Partial: {
                  label: 'Partial',
                  color: '#F59E0B'
                },
                Unpaid: {
                  label: 'Unpaid',
                  color: '#EF4444'
                },
                Pending: {
                  label: 'Pending',
                  color: '#9CA3AF'
                },
                Refunded: {
                  label: 'Refunded',
                  color: '#EF4444'
                }
              }
              const s = cfg[paymentStatus] ?? {
                label: paymentStatus,
                color: '#9CA3AF'
              }
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '500',
                      color: colors.muted
                    }}
                  >
                    Payment Status:{' '}
                  </Text>
                  <Text
                    style={{ fontSize: 10, fontWeight: '600', color: s.color }}
                  >
                    {s.label}
                  </Text>
                </View>
              )
            })()}
          {checkStatus === 'Closed' && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={{ fontSize: 10, fontWeight: '500', color: colors.muted }}
              >
                Check Status:{' '}
              </Text>
              <Text
                style={{ fontSize: 10, fontWeight: '600', color: '#3B82F6' }}
              >
                Closed
              </Text>
            </View>
          )}
        </View>
      )}
      <Dialog
        open={isCustomerNameModalVisible}
        onOpenChange={setIsCustomerNameModalVisible}
      >
        <DialogContent className='p-0 rounded-t-lg rounded-b-2xl border w-[500px] bg-screen border-none'>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {/* Dark Header */}
            <View className='p-6 rounded-lg '>
              <DialogTitle className='text-heading text-3xl font-bold text-center'>
                {localCustomerName ? 'Edit Customer Name' : 'Add Customer Name'}
              </DialogTitle>
            </View>

            <View
              className='rounded-t-lg rounded-b-lg p-6'
              style={{ backgroundColor: colors.panel }}
            >
              <DialogHeader>
                <Text className='text-accent-500 text-2xl text-center mb-4'>
                  Enter the customer's name for this order
                </Text>
              </DialogHeader>

              {/* Customer Name Input */}
              <View className='mb-6'>
                <Text className='text-accent-500 text-xl font-semibold mb-2'>
                  Customer Name
                </Text>
                <TextInput
                  className='w-full p-4 border border-background-400 rounded-lg text-2xl text-accent-500 h-20'
                  placeholder='Enter customer name'
                  placeholderTextColor={colors.muted}
                  value={tempCustomerName}
                  onChangeText={setTempCustomerName}
                  autoFocus
                />
              </View>

              {/* Footer with Buttons */}
              <DialogFooter className='flex-row gap-4'>
                <TouchableOpacity
                  onPress={handleCancelCustomerName}
                  className='flex-1 py-4 rounded-lg'
                  style={{ borderWidth: 1, borderColor: colors.border }}
                >
                  <Text
                    className='font-bold text-2xl text-center'
                    style={{ color: colors.label }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveCustomerName}
                  className='flex-1 py-4 rounded-lg'
                  style={{
                    backgroundColor: colors.teal + '18',
                    borderWidth: 1,
                    borderColor: colors.teal + '40'
                  }}
                >
                  <Text
                    className='font-bold text-2xl text-center'
                    style={{ color: colors.teal }}
                  >
                    {localCustomerName ? 'Update' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </DialogFooter>
            </View>
          </KeyboardAvoidingView>
        </DialogContent>
      </Dialog>
    </View>
  )
}

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const OrderDetails = React.memo(OrderDetailsComponent)

export default OrderDetails
