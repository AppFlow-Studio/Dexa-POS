import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useCustomerSheetStore } from '@/stores/useCustomerSheetStore'
import { useCustomerStore } from '@/stores/useCustomerStore'
import { useDineInStore } from '@/stores/useDineInStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useShallow } from 'zustand/react/shallow'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import { formatAddress, serializeDeliveryAddress } from '@/utils/addressUtils'
import { useRouter } from 'expo-router'
import { ChevronDown, Edit3, Plus, User } from 'lucide-react-native'
import React, { useMemo, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { GuestCountModal } from '../tables/GuestCountModal'
import TableLayoutView from '../tables/TableLayoutView'
import { Dialog, DialogContent } from '../ui/dialog'

interface OrderTypeDrawerProps {
  isVisible: boolean
  onClose: () => void
  onOrderTypeSelect: (orderType: string) => void
  currentOrderType?: string
}

const OrderTypeDrawer: React.FC<OrderTypeDrawerProps> = ({
  isVisible,
  onClose,
  onOrderTypeSelect,
  currentOrderType
}) => {
  const router = useRouter()
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const updateActiveOrderDetails = useOrderStore(
    s => s.updateActiveOrderDetails
  )
  const assignOrderToTable = useOrderStore(s => s.assignOrderToTable)
  const startNewOrder = useOrderStore(s => s.startNewOrder)
  const setActiveOrder = useOrderStore(s => s.setActiveOrder)
  const {
    addCustomer,
    findCustomerByPhone,
    incrementOrderCount,
    searchCustomersByPhone
  } = useCustomerStore()

  // Use FloorPlanStore correctly
  const floorPlans = useFloorPlanStore(s => s.floorPlans)
  const activeFloorPlanId = useFloorPlanStore(s => s.activeFloorPlanId)
  const setActiveFloorPlan = useFloorPlanStore(s => s.setActiveFloorPlan)
  const tables = useFloorPlanStore(s => s.tables)
  const { show } = useToast()

  const { selectedTable, setSelectedTable, clearSelectedTable } =
    useDineInStore()
  // Narrow subscription: only re-render when the three fields this drawer
  // actually reads change, not on every items mutation. Each rapid item
  // add otherwise re-renders the whole drawer tree.
  const activeOrder = useOrderStore(
    useShallow(state => {
      if (!activeOrderId) return undefined
      const order = state.ordersById[activeOrderId]
      if (!order) return undefined
      return {
        hasItems: order.items.length > 0,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
      }
    }),
  )

  const { openSheet } = useCustomerSheetStore()

  // Floor selection state.
  // We sync selectedFloor with activeFloorPlanId roughly, or allow mismatch?
  // If we change selectedFloor, we should update activeFloorPlanId so 'tables' updates.

  const [showFloorModal, setShowFloorModal] = useState(false)
  const selectedFloor = activeFloorPlanId
  // We use activeFloorPlanId directly as "selected floor".

  const [isGuestModalOpen, setGuestModalOpen] = useState(false)

  const orderTypes = [
    // { value: "dine_in", label: "Dine In" },
    { value: 'takeout', label: 'Takeaway' },
    { value: 'delivery', label: 'Delivery' }
  ]

  const [isExistingCustomer, setIsExistingCustomer] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([])

  // Tables are now just 'tables' from store (for active floor)
  const floorTables = tables

  // Get available tables for the selected floor
  const availableFloorTables = useMemo(() => {
    return floorTables.filter(
      table => (table.session?.status || 'available') === 'available'
    )
  }, [floorTables])

  const assignCustomerToOrder = (customer: any) => {
    if (activeOrderId) {
      updateActiveOrderDetails({
        customer_name: customer.name,
        customer_phone: customer.phoneNumber,
        customer_id: customer.id,
        customer_email: customer.email || undefined,
        delivery_address:
          currentOrderType === 'delivery' ? customer.address : undefined
      })
    }

    // Increment order count for existing customer
    incrementOrderCount(customer.id)

    show({
      title: 'Customer Assigned',
      message: `${customer.name} has been successfully assigned to this order.`,
      type: 'success'
    })
  }

  const handleFloorSelect = (floorId: string) => {
    setActiveFloorPlan(floorId)
    setShowFloorModal(false)
    // Clear selected table when changing floors
    setSelectedTable(null)
  }

  const handleGuestCountSubmit = (guestCount: number) => {
    if (!selectedTable) return

    // Check if there's an active order with items
    if (activeOrderId && activeOrder && activeOrder.hasItems) {
      // Transfer existing order to the table
      assignOrderToTable(activeOrderId, selectedTable.id)
      updateActiveOrderDetails({
        order_type: 'dine_in',
        guest_count: guestCount
      })
      // updateTableStatus(selectedTable.id, "In Use"); // Removed

      // Start a new order for the order-processing screen
      const newOrder = startNewOrder()
      setActiveOrder(newOrder.id)

      // Navigate to the table screen
      setGuestModalOpen(false)
      onClose()

      // Navigate to the table screen
      // Navigate to the table screen with source info
      router.push({
        pathname: '/tables/[tableId]',
        params: { tableId: selectedTable.id, source: '/menu' }
      })

      show({
        title: 'Order Transferred',
        message: `The order has been successfully transferred to Table ${selectedTable.name}.`,
        type: 'success'
      })
    } else {
      // Create a new order and assign it to the table (existing flow)
      const newOrder = startNewOrder({ guestCount, tableId: selectedTable.id })
      setActiveOrder(newOrder.id)
      // updateTableStatus(selectedTable.id, "In Use"); // Removed

      // Close all modals/drawers and navigate to the new table screen
      setGuestModalOpen(false)
      onClose()

      // Navigate to the table screen
      // Navigate to the table screen with source info
      router.push({
        pathname: '/tables/[tableId]',
        params: { tableId: selectedTable.id, source: '/menu' }
      })
    }
  }

  const handleTableSelect = (table: FloorPlanObject) => {
    if ((table.session?.status || 'available') !== 'available') {
      show({
        title: 'Table Unavailable',
        message: `Table ${table.name} is currently occupied or unavailable.`,
        type: 'error'
      })
      return
    }

    setSelectedTable(table)
    setGuestModalOpen(true)

    show({
      title: 'Table Selected',
      message: `Table ${table.name} has been selected. Please set the guest count.`,
      type: 'success'
    })
  }

  // Function to assign the selected table to the active order
  const assignSelectedTableToOrder = () => {
    if (selectedTable && activeOrderId) {
      assignOrderToTable(activeOrderId, selectedTable.id)
      // updateTableStatus(selectedTable.id, "In Use"); // Removed
      return true
    }
    return false
  }

  if (!isVisible) return null
  return (
    <View className='absolute inset-0 z-50'>
      <TouchableOpacity
        className='flex-1 bg-black/60'
        onPress={onClose}
        activeOpacity={1}
      />

      <ScrollView
        bounces={false}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 320,
          backgroundColor: colors.screen
        }}
      >
        {/* Header */}
        <View
          className='flex-row items-center justify-between px-5 py-4 border-b'
          style={{ borderColor: colors.border }}
        >
          <Text
            className='text-base font-bold'
            style={{ color: colors.heading }}
          >
            Order Type
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className='px-4 py-2 rounded-xl'
            style={{ backgroundColor: colors.teal }}
          >
            <Text
              className='text-sm font-semibold'
              style={{ color: colors.onSolid }}
            >
              Done
            </Text>
          </TouchableOpacity>
        </View>

        <View className='p-4 gap-y-4'>
          {/* Order type options */}
          <View className='gap-y-2'>
            {orderTypes.map(orderType => {
              const isSelected = currentOrderType === orderType.value
              return (
                <TouchableOpacity
                  key={orderType.value}
                  onPress={() => {
                    onOrderTypeSelect(orderType.value)
                    if (activeOrderId)
                      updateActiveOrderDetails({
                        order_type: orderType.value as any
                      })
                  }}
                  className='flex-row items-center px-4 py-3 rounded-xl border'
                  style={{
                    backgroundColor: isSelected
                      ? colors.teal + '20'
                      : colors.panel,
                    borderColor: isSelected ? colors.teal : colors.border
                  }}
                >
                  <View
                    className='w-5 h-5 rounded-full border-2 mr-3 items-center justify-center'
                    style={{
                      borderColor: isSelected ? colors.teal : colors.muted
                    }}
                  >
                    {isSelected && (
                      <View
                        className='w-2.5 h-2.5 rounded-full'
                        style={{ backgroundColor: colors.teal }}
                      />
                    )}
                  </View>
                  <Text
                    className='font-medium text-base'
                    style={{ color: isSelected ? colors.teal : colors.heading }}
                  >
                    {orderType.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <View className='h-px' style={{ backgroundColor: colors.border }} />

          {/* Customer info */}
          {(currentOrderType === 'delivery' ||
            currentOrderType === 'takeout') && (
            <View className='gap-y-3'>
              <Text
                className='text-xs font-semibold uppercase tracking-wider'
                style={{ color: colors.label }}
              >
                Customer
              </Text>
              <TouchableOpacity
                onPress={openSheet}
                className='flex-row items-center px-4 py-3 rounded-xl border'
                style={{
                  backgroundColor: colors.panel,
                  borderColor: colors.border
                }}
              >
                {activeOrder?.customer_name ? (
                  <>
                    <View
                      className='w-8 h-8 rounded-full items-center justify-center mr-3'
                      style={{ backgroundColor: colors.teal + '20' }}
                    >
                      <User color={colors.teal} size={16} />
                    </View>
                    <View className='flex-1'>
                      <Text
                        className='font-semibold text-sm'
                        style={{ color: colors.heading }}
                        numberOfLines={1}
                      >
                        {activeOrder.customer_name}
                      </Text>
                      {activeOrder.customer_phone && (
                        <Text
                          className='text-xs mt-0.5'
                          style={{ color: colors.label }}
                        >
                          {activeOrder.customer_phone}
                        </Text>
                      )}
                    </View>
                    <Edit3 color={colors.teal} size={16} />
                  </>
                ) : (
                  <>
                    <View
                      className='w-8 h-8 rounded-full items-center justify-center mr-3'
                      style={{ backgroundColor: colors.card }}
                    >
                      <Plus color={colors.label} size={16} />
                    </View>
                    <Text className='text-sm' style={{ color: colors.label }}>
                      Add Customer
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {currentOrderType === 'delivery' && (
                <View className='gap-y-1.5'>
                  <Text
                    className='text-xs font-semibold uppercase tracking-wider'
                    style={{ color: colors.label }}
                  >
                    Delivery Address
                  </Text>
                  <AddressAutocomplete
                    value={formatAddress(activeOrder?.delivery_address) || ''}
                    onChangeText={text => {
                      if (activeOrderId)
                        updateActiveOrderDetails({
                          delivery_address: serializeDeliveryAddress({
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
                          delivery_address: serializeDeliveryAddress(addr)
                        })
                    }}
                    placeholder='Enter delivery address'
                    inputStyle={{ backgroundColor: colors.panel }}
                    dropdownPosition='top'
                  />
                </View>
              )}
            </View>
          )}

          {/* Dine in table selection */}
          {currentOrderType === 'dine_in' && (
            <View className='gap-y-3'>
              <Text
                className='text-xs font-semibold uppercase tracking-wider'
                style={{ color: colors.label }}
              >
                Select Table
              </Text>

              <TouchableOpacity
                onPress={() => setShowFloorModal(true)}
                className='flex-row items-center justify-between px-4 py-3 rounded-xl border'
                style={{
                  backgroundColor: colors.panel,
                  borderColor: colors.border
                }}
              >
                <Text className='text-sm' style={{ color: colors.heading }}>
                  {selectedFloor
                    ? floorPlans.find(l => l.id === selectedFloor)?.name ??
                      'Select Floor'
                    : 'Select Floor'}
                </Text>
                <ChevronDown color={colors.label} size={16} />
              </TouchableOpacity>

              {selectedTable && (
                <View
                  className='px-4 py-3 rounded-xl border'
                  style={{
                    backgroundColor: colors.teal + '15',
                    borderColor: colors.teal
                  }}
                >
                  <Text
                    className='text-sm font-semibold'
                    style={{ color: colors.teal }}
                  >
                    {selectedTable.name} · {selectedTable.capacity} guests
                  </Text>
                  <Text
                    className='text-xs mt-0.5'
                    style={{ color: colors.label }}
                  >
                    {floorPlans.find(l => l.id === selectedFloor)?.name}
                  </Text>
                </View>
              )}

              {selectedFloor && (
                <View
                  className='rounded-xl overflow-hidden border'
                  style={{ borderColor: colors.border, minHeight: 300 }}
                >
                  <TableLayoutView
                    key={selectedFloor || 'floor-plan'}
                    layoutId={selectedFloor}
                    tables={floorTables}
                    isSelectionMode={true}
                    selectedTableId={selectedTable?.id}
                    onTableSelect={handleTableSelect}
                    showConnections={false}
                  />
                </View>
              )}

              {!selectedFloor && (
                <View
                  className='py-10 rounded-xl border items-center justify-center'
                  style={{ borderColor: colors.border }}
                >
                  <Text
                    className='text-sm text-center'
                    style={{ color: colors.muted }}
                  >
                    Select a floor to view tables
                  </Text>
                </View>
              )}

              {selectedFloor && availableFloorTables.length === 0 && (
                <View
                  className='px-4 py-3 rounded-xl border'
                  style={{
                    backgroundColor: colors.danger + '20',
                    borderColor: colors.danger
                  }}
                >
                  <Text
                    className='text-sm font-semibold'
                    style={{ color: colors.danger }}
                  >
                    No available tables
                  </Text>
                  <Text
                    className='text-xs mt-0.5'
                    style={{ color: colors.label }}
                  >
                    All tables on this floor are occupied
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <GuestCountModal
        isOpen={isGuestModalOpen}
        onClose={() => {
          setGuestModalOpen(false)
          clearSelectedTable()
        }}
        onSubmit={handleGuestCountSubmit}
      />

      {/* Floor Selection Modal */}
      <Dialog open={showFloorModal} onOpenChange={setShowFloorModal}>
        <DialogContent
          className='w-[400px] rounded-2xl p-0 overflow-hidden border'
          style={{ backgroundColor: colors.screen, borderColor: colors.border }}
        >
          <View
            className='flex-row items-center justify-between px-5 py-4 border-b'
            style={{ borderColor: colors.border }}
          >
            <Text
              className='text-base font-bold'
              style={{ color: colors.heading }}
            >
              Select Floor
            </Text>
            <TouchableOpacity
              onPress={() => setShowFloorModal(false)}
              className='px-3 py-1.5 rounded-lg'
              style={{ backgroundColor: colors.card }}
            >
              <Text className='text-sm' style={{ color: colors.label }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {floorPlans.map(layout => {
              const isActive = selectedFloor === layout.id
              return (
                <TouchableOpacity
                  key={layout.id}
                  onPress={() => handleFloorSelect(layout.id)}
                  className='flex-row items-center justify-between px-5 py-4 border-b'
                  style={{
                    borderColor: colors.border,
                    backgroundColor: isActive
                      ? colors.teal + '20'
                      : 'transparent',
                    borderLeftWidth: isActive ? 3 : 0,
                    borderLeftColor: colors.teal
                  }}
                >
                  <View>
                    <Text
                      className='text-sm font-semibold'
                      style={{ color: isActive ? colors.teal : colors.heading }}
                    >
                      {layout.name}
                    </Text>
                    <Text
                      className='text-xs mt-0.5'
                      style={{ color: colors.muted }}
                    >
                      {isActive ? `${tables.length} tables` : 'Tap to select'}
                    </Text>
                  </View>
                  {isActive && (
                    <View
                      className='w-5 h-5 rounded-full items-center justify-center'
                      style={{ backgroundColor: colors.teal }}
                    >
                      <Text
                        className='text-xs font-bold'
                        style={{ color: colors.onSolid }}
                      >
                        ✓
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </DialogContent>
      </Dialog>
    </View>
  )
}

export default OrderTypeDrawer
