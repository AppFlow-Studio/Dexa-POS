import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useCustomerSheetStore } from '@/stores/useCustomerSheetStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { formatAddress } from '@/utils/addressUtils'
import { Edit3, User } from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
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
    deliveryAddress
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
        deliveryAddress: order?.delivery_address || ''
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
        <View
          className={
            isDineInSelected || isDeliverySelected ? 'w-[56%]' : 'w-full'
          }
        >
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
          <View className='w-[44%]'>
            <TouchableOpacity
              onPress={onOpenTableSelector}
              className='w-full rounded-lg h-12 px-2.5 justify-center'
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Text
                style={{
                  color: colors.heading,
                  fontSize: 12,
                  fontWeight: '600'
                }}
                numberOfLines={1}
              >
                {tableLabel || 'Select Table'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isDeliverySelected && (
          <View className='w-[44%] h-12' style={{ zIndex: 50 }}>
            <View
              className='w-full rounded-lg h-12 px-2.5 justify-center'
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
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
        )}
      </View>

      <View
        className='flex-row mt-2 rounded-lg p-1'
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
              className='flex-1 h-8 rounded-md items-center justify-center'
              style={{
                backgroundColor: isActive ? colors.teal : 'transparent'
              }}
            >
              <Text
                style={{
                  color: isActive ? colors.onSolid : colors.label,
                  fontSize: 12,
                  fontWeight: '700'
                }}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Customer Name Modal */}
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

            {/* White Content */}
            <View className='rounded-t-lg rounded-b-lg p-6 bg-background-100'>
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
                  className='flex-1 py-4 border border-gray-300 rounded-lg'
                >
                  <Text className='font-bold text-2xl text-gray-700 text-center'>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveCustomerName}
                  className='flex-1 py-4 bg-white rounded-lg  border border-blue-400'
                >
                  <Text className='font-bold text-2xl text-gray-800 text-center'>
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
