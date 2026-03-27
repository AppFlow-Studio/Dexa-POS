import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { bottomSheetTheme, colors } from '@/lib/theme'
import { POLineItem } from '@/lib/types'
import { useInventoryStore } from '@/stores/useInventoryStore'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput
} from '@gorhom/bottom-sheet'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Building2,
  Edit3,
  Mail,
  Package,
  Phone,
  Plus,
  Search,
  Trash2,
  User
} from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

const StatCard = ({
  label,
  value,
  accent
}: {
  label: string
  value: string | number
  accent?: string
}) => (
  <View
    style={{
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      marginRight: 8
    }}
  >
    <Text
      style={{
        fontSize: 11,
        fontWeight: '600',
        color: colors.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.5
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: 20,
        fontWeight: '700',
        color: accent || colors.heading,
        marginTop: 4
      }}
    >
      {value}
    </Text>
  </View>
)

const statusStyle = (status: string) => {
  switch (status) {
    case 'Awaiting Payment':
      return {
        bg: colors.success + '20',
        border: colors.success + '50',
        text: colors.success
      }
    case 'Pending Delivery':
      return {
        bg: colors.info + '20',
        border: colors.info + '50',
        text: colors.info
      }
    case 'Draft':
      return {
        bg: colors.muted + '20',
        border: colors.border,
        text: colors.muted
      }
    default:
      return {
        bg: colors.warning + '20',
        border: colors.warning + '50',
        text: colors.warning
      }
  }
}

const VendorDetailsScreen = () => {
  const params = useLocalSearchParams()
  const router = useRouter()
  const rawId = (params as any).vendorId || (params as any)['vendor-id']
  const vendorId = Array.isArray(rawId) ? rawId[0] : rawId
  const [activeTab, setActiveTab] = useState<
    'purchase-orders' | 'associated-items'
  >('purchase-orders')

  const { vendors, purchaseOrders, inventoryItems } = useInventoryStore()
  const vendor = vendors.find(v => v.id === vendorId)

  const vendorPOs = useMemo(
    () => purchaseOrders.filter(po => po.vendorId === vendorId),
    [purchaseOrders, vendorId]
  )

  const associatedItems = useMemo(
    () => inventoryItems.filter(item => item.vendorId === vendorId),
    [inventoryItems, vendorId]
  )

  const getItemName = (inventoryItemId: string) => {
    const item = inventoryItems.find(i => i.id === inventoryItemId)
    return item?.name || 'Item'
  }

  const stats = useMemo(() => {
    const totalPOs = vendorPOs.length
    const received = vendorPOs.filter(
      po => po.status === 'Awaiting Payment'
    ).length
    const inDraft = vendorPOs.filter(po => po.status === 'Draft').length
    const sent = vendorPOs.filter(po => po.status === 'Pending Delivery').length
    const totalLines = vendorPOs.reduce((acc, po) => acc + po.items.length, 0)
    const totalQty = vendorPOs.reduce(
      (acc, po) => acc + po.items.reduce((a, li) => a + li.quantity, 0),
      0
    )
    const estSpend = vendorPOs.reduce(
      (acc, po) =>
        acc + po.items.reduce((a, li) => a + li.quantity * li.cost, 0),
      0
    )
    return { totalPOs, received, inDraft, sent, totalLines, totalQty, estSpend }
  }, [vendorPOs])

  const poSearchRef = useRef<BottomSheetMethods>(null)
  const itemSearchRef = useRef<BottomSheetMethods>(null)
  const createPOSheetRef = useRef<BottomSheetMethods>(null)
  const poBuilderSheetRef = useRef<BottomSheetMethods>(null)

  const [poLineItems, setPoLineItems] = useState<POLineItem[]>([])
  const [selectedTemplatePo, setSelectedTemplatePo] = useState<any>(null)
  const [isEditingItem, setIsEditingItem] = useState<string | null>(null)
  const [editingQuantity, setEditingQuantity] = useState<string>('')
  const [poSearchText, setPoSearchText] = useState('')
  const [itemSearchText, setItemSearchText] = useState('')
  const [poStartDate, setPoStartDate] = useState('')
  const [poEndDate, setPoEndDate] = useState('')
  const snapPoints = useMemo(() => ['70%', '95%'], [])

  const filteredPOs = useMemo(() => {
    const q = poSearchText.trim().toLowerCase()
    const sd = poStartDate ? new Date(poStartDate + 'T00:00:00') : null
    const ed = poEndDate ? new Date(poEndDate + 'T23:59:59') : null
    return vendorPOs.filter(po => {
      const inDates =
        (!sd || new Date(po.createdAt) >= sd) &&
        (!ed || new Date(po.createdAt) <= ed)
      if (!q) return inDates
      const poNum = po.poNumber?.toLowerCase() || ''
      const status = po.status?.toLowerCase() || ''
      const created = new Date(po.createdAt).toLocaleString().toLowerCase()
      const emp = `${po.createdByEmployeeName || ''}`.toLowerCase()
      return (
        inDates &&
        (poNum.includes(q) ||
          status.includes(q) ||
          created.includes(q) ||
          emp.includes(q))
      )
    })
  }, [poSearchText, vendorPOs, poStartDate, poEndDate])

  const filteredItems = useMemo(() => {
    const q = itemSearchText.trim().toLowerCase()
    if (!q) return associatedItems
    return associatedItems.filter(it => {
      const name = it.name?.toLowerCase() || ''
      const category = it.category?.toLowerCase() || ''
      return name.includes(q) || category.includes(q)
    })
  }, [itemSearchText, associatedItems])

  const openPOBuilder = (templatePo?: any) => {
    setSelectedTemplatePo(templatePo)
    setPoLineItems(templatePo ? templatePo.items : [])
    createPOSheetRef.current?.close()
    poBuilderSheetRef.current?.snapToIndex?.(0)
  }

  const addItemToPO = (item: any) => {
    const existingIndex = poLineItems.findIndex(
      li => li.inventoryItemId === item.id
    )
    if (existingIndex >= 0) {
      const updated = [...poLineItems]
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + 1
      }
      setPoLineItems(updated)
    } else {
      setPoLineItems([
        ...poLineItems,
        { inventoryItemId: item.id, quantity: 1, cost: item.cost }
      ])
    }
  }

  const removeItemFromPO = (inventoryItemId: string) => {
    setPoLineItems(prev =>
      prev.filter(li => li.inventoryItemId !== inventoryItemId)
    )
  }

  const startEditItem = (inventoryItemId: string, currentQuantity: number) => {
    setIsEditingItem(inventoryItemId)
    setEditingQuantity(currentQuantity.toString())
  }

  const saveEditItem = () => {
    if (!isEditingItem) return
    const newQuantity = parseInt(editingQuantity) || 0
    if (newQuantity <= 0) {
      removeItemFromPO(isEditingItem)
    } else {
      setPoLineItems(prev =>
        prev.map(li =>
          li.inventoryItemId === isEditingItem
            ? { ...li, quantity: newQuantity }
            : li
        )
      )
    }
    setIsEditingItem(null)
    setEditingQuantity('')
  }

  const cancelEditItem = () => {
    setIsEditingItem(null)
    setEditingQuantity('')
  }

  const createPurchaseOrder = async (status: 'Draft' | 'Pending Delivery') => {
    if (poLineItems.length === 0) {
      Alert.alert(
        'No Items',
        'Please add at least one item to the purchase order.'
      )
      return
    }
    try {
      const { createPurchaseOrder } = useInventoryStore.getState()
      await createPurchaseOrder({
        vendorId: vendorId!,
        status,
        items: poLineItems
      })
      Alert.alert(
        'Success',
        `Purchase order ${
          status === 'Draft' ? 'saved as draft' : 'submitted'
        } successfully!`
      )
      setPoLineItems([])
      setSelectedTemplatePo(null)
      poBuilderSheetRef.current?.close()
    } catch (error) {
      Alert.alert('Error', 'Failed to create purchase order. Please try again.')
    }
  }

  const renderPOBuilderHeader = () => (
    <View>
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          marginBottom: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <View style={{ gap: 2 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}
          >
            Build PO
          </Text>
          <Text style={{ fontSize: 12, color: colors.label }}>
            Vendor:{' '}
            <Text style={{ color: colors.heading, fontWeight: '600' }}>
              {vendor?.name}
            </Text>
          </Text>
          {selectedTemplatePo && (
            <Text style={{ fontSize: 11, color: colors.teal }}>
              Template: {selectedTemplatePo.poNumber}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => createPurchaseOrder('Draft')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '600', color: colors.label }}
            >
              Save Draft
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => createPurchaseOrder('Pending Delivery')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50',
              borderRadius: 8
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}
            >
              Submit
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ paddingHorizontal: 14, marginBottom: 6 }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.muted,
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}
        >
          Items ({poLineItems.length})
        </Text>
        {poLineItems.length === 0 && (
          <View
            style={{
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              padding: 14,
              alignItems: 'center',
              marginTop: 8
            }}
          >
            <Text style={{ fontSize: 12, color: colors.muted }}>
              No items added yet
            </Text>
          </View>
        )}
      </View>
    </View>
  )

  const renderPOBuilderFooter = () => (
    <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8
        }}
      >
        Add Items
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 10,
          height: 38,
          gap: 8,
          marginBottom: 10
        }}
      >
        <Search size={14} color={colors.muted} />
        <BottomSheetTextInput
          value={itemSearchText}
          onChangeText={setItemSearchText}
          placeholder='Search items...'
          placeholderTextColor={colors.muted}
          style={{ flex: 1, fontSize: 13, color: colors.heading }}
        />
      </View>
      <View style={{ gap: 6 }}>
        {filteredItems.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              No items found
            </Text>
          </View>
        ) : (
          filteredItems.map((item, index) => (
            <TouchableOpacity
              key={`${item.id}-${index}`}
              onPress={() => addItemToPO(item)}
              style={{
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 9,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  {item.name}
                </Text>
                <Text
                  style={{ fontSize: 11, color: colors.label, marginTop: 2 }}
                >
                  {item.category} · ${item.cost.toFixed(2)} per {item.unit}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  + Add
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  )

  const renderPOLineItem = ({ item: lineItem }: { item: POLineItem }) => {
    const item = inventoryItems.find(i => i.id === lineItem.inventoryItemId)
    const isEditing = isEditingItem === lineItem.inventoryItemId
    return (
      <View
        style={{
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 12,
          marginHorizontal: 14,
          marginBottom: 6
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text
              style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}
            >
              {item?.name || 'Unknown'}
            </Text>
            <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>
              ${lineItem.cost.toFixed(2)} per {item?.unit}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isEditing ? (
              <>
                <BottomSheetTextInput
                  value={editingQuantity}
                  onChangeText={setEditingQuantity}
                  keyboardType='number-pad'
                  style={{
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    color: colors.heading,
                    fontSize: 13,
                    textAlign: 'center',
                    width: 52,
                    height: 32
                  }}
                />
                <TouchableOpacity
                  onPress={saveEditItem}
                  style={{
                    backgroundColor: colors.success + '20',
                    borderWidth: 1,
                    borderColor: colors.success + '50',
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.success
                    }}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={cancelEditItem}
                  style={{
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, color: colors.heading }}>
                  Qty: {lineItem.quantity}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    startEditItem(lineItem.inventoryItemId, lineItem.quantity)
                  }
                  style={{ padding: 5 }}
                >
                  <Edit3 size={13} color={colors.label} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeItemFromPO(lineItem.inventoryItemId)}
                  style={{ padding: 5 }}
                >
                  <Trash2 size={13} color={colors.danger} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        <Text
          style={{
            fontSize: 11,
            color: colors.teal,
            textAlign: 'right',
            marginTop: 6
          }}
        >
          Total: ${(lineItem.quantity * lineItem.cost).toFixed(2)}
        </Text>
      </View>
    )
  }

  if (!vendor) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.screen,
          padding: 16
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: colors.danger + '15',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12
          }}
        >
          <AlertTriangle size={22} color={colors.danger} />
        </View>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: colors.heading,
            marginBottom: 6
          }}
        >
          Vendor Not Found
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            textAlign: 'center',
            marginBottom: 20
          }}
        >
          This vendor does not exist or may have been removed.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/inventory/vendors')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.teal + '20',
            borderWidth: 1,
            borderColor: colors.teal + '50',
            borderRadius: 8,
            paddingHorizontal: 14,
            paddingVertical: 8
          }}
        >
          <ArrowLeft size={14} color={colors.teal} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, gap: 10 }}
        >
          {/* Vendor Header Card */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 14
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Building2 size={18} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  {vendor.name}
                </Text>
                {!!vendor.description && (
                  <Text
                    style={{ fontSize: 12, color: colors.label, marginTop: 2 }}
                  >
                    {vendor.description}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 20 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <User size={12} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.label }}>
                  {vendor.contactPerson || '—'}
                </Text>
              </View>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Phone size={12} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.label }}>
                  {vendor.phone || '—'}
                </Text>
              </View>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Mail size={12} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.label }}>
                  {vendor.email || '—'}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats Row 1 */}
          <View style={{ flexDirection: 'row' }}>
            <StatCard label='Total POs' value={stats.totalPOs} />
            <StatCard
              label='Received'
              value={stats.received}
              accent={colors.success}
            />
            <StatCard label='Ordered' value={stats.sent} accent={colors.info} />
            <StatCard
              label='Draft'
              value={stats.inDraft}
              accent={colors.muted}
            />
          </View>

          {/* Stats Row 2 */}
          <View style={{ flexDirection: 'row', marginTop: -2 }}>
            <StatCard label='Line Items' value={stats.totalLines} />
            <StatCard label='Total Qty' value={stats.totalQty} />
            <StatCard
              label='Est. Spend'
              value={`$${stats.estSpend.toFixed(2)}`}
              accent={colors.teal}
            />
            <View style={{ flex: 1, marginRight: 8 }} />
          </View>

          {/* Tab Bar */}
          <View
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            {(['purchase-orders', 'associated-items'] as const).map(tab => {
              const isActive = activeTab === tab
              const label =
                tab === 'purchase-orders'
                  ? 'Purchase Orders'
                  : 'Associated Items'
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderBottomWidth: 2,
                    borderBottomColor: isActive ? colors.teal : 'transparent',
                    marginBottom: -1
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: isActive ? colors.teal : colors.label
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Purchase Orders Tab */}
          {activeTab === 'purchase-orders' && (
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                overflow: 'hidden'
              }}
            >
              {/* Tab header */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: colors.screen
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.muted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}
                >
                  Purchase Orders
                </Text>
                <View
                  style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                >
                  <TouchableOpacity
                    onPress={() => poSearchRef.current?.snapToIndex?.(1)}
                    style={{
                      backgroundColor: colors.teal + '15',
                      borderRadius: 8,
                      padding: 7
                    }}
                  >
                    <Search size={14} color={colors.teal} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => createPOSheetRef.current?.snapToIndex?.(0)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: colors.teal + '20',
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      borderRadius: 8
                    }}
                  >
                    <Plus size={13} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Create
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {vendorPOs.length === 0 ? (
                <View
                  style={{ paddingVertical: 40, alignItems: 'center', gap: 6 }}
                >
                  <Package size={20} color={colors.muted} />
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    No purchase orders yet.
                  </Text>
                </View>
              ) : (
                vendorPOs.map((po, index) => {
                  const itemsCount = po.items.length
                  const qty = po.items.reduce((a, li) => a + li.quantity, 0)
                  const amount = po.items.reduce(
                    (a, li) => a + li.quantity * li.cost,
                    0
                  )
                  const s = statusStyle(po.status)
                  return (
                    <Link
                      key={`${po.id}-${index}`}
                      href={`/inventory/purchase-orders/${po.id}`}
                      asChild
                    >
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: colors.heading
                              }}
                            >
                              {po.poNumber}
                            </Text>
                            <View
                              style={{
                                backgroundColor: s.bg,
                                borderWidth: 1,
                                borderColor: s.border,
                                borderRadius: 20,
                                paddingHorizontal: 7,
                                paddingVertical: 2
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '600',
                                  color: s.text
                                }}
                              >
                                {po.status}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.muted,
                              marginTop: 3
                            }}
                          >
                            {new Date(po.createdAt).toLocaleString()}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: colors.heading
                            }}
                          >
                            ${amount.toFixed(2)}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.muted,
                              marginTop: 2
                            }}
                          >
                            {itemsCount} lines · {qty} qty
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </Link>
                  )
                })
              )}
            </View>
          )}

          {/* Associated Items Tab */}
          {activeTab === 'associated-items' && (
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                overflow: 'hidden'
              }}
            >
              {/* Tab header */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: colors.screen
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.muted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}
                >
                  Associated Items
                </Text>
                <TouchableOpacity
                  onPress={() => itemSearchRef.current?.snapToIndex?.(0)}
                  style={{
                    backgroundColor: colors.teal + '15',
                    borderRadius: 8,
                    padding: 7
                  }}
                >
                  <Search size={14} color={colors.teal} />
                </TouchableOpacity>
              </View>

              {associatedItems.length === 0 ? (
                <View
                  style={{ paddingVertical: 40, alignItems: 'center', gap: 6 }}
                >
                  <Box size={20} color={colors.muted} />
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    No items linked yet.
                  </Text>
                </View>
              ) : (
                associatedItems.map((item, index) => {
                  const isLowStock = item.stockQuantity <= item.reorderThreshold
                  return (
                    <Link
                      key={`${item.id}-${index}`}
                      href={`/inventory/ingredient-items/${item.id}`}
                      asChild
                    >
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: colors.heading
                              }}
                            >
                              {item.name}
                            </Text>
                            <View
                              style={{
                                backgroundColor: isLowStock
                                  ? colors.danger + '20'
                                  : colors.success + '20',
                                borderWidth: 1,
                                borderColor: isLowStock
                                  ? colors.danger + '50'
                                  : colors.success + '50',
                                borderRadius: 20,
                                paddingHorizontal: 7,
                                paddingVertical: 2
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '600',
                                  color: isLowStock
                                    ? colors.danger
                                    : colors.success
                                }}
                              >
                                {isLowStock ? 'Low Stock' : 'In Stock'}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.muted,
                              marginTop: 3
                            }}
                          >
                            {item.category} · {item.stockQuantity} {item.unit} ·
                            Reorder at {item.reorderThreshold}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: colors.heading
                            }}
                          >
                            ${item.cost.toFixed(2)}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.muted,
                              marginTop: 2
                            }}
                          >
                            per {item.unit}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </Link>
                  )
                })
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* PO Search Sheet */}
      <BottomSheet
        ref={poSearchRef as any}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={props => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
        keyboardBehavior='interactive'
        keyboardBlurBehavior='restore'
        android_keyboardInputMode='adjustResize'
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 8
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              height: 38,
              gap: 8
            }}
          >
            <Search size={14} color={colors.muted} />
            <BottomSheetTextInput
              value={poSearchText}
              onChangeText={setPoSearchText}
              placeholder='Search POs...'
              placeholderTextColor={colors.muted}
              style={{ flex: 1, fontSize: 13, color: colors.heading }}
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              setPoSearchText('')
              poSearchRef.current?.close()
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '600', color: colors.label }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>
            Date Range
          </Text>
          <DateRangePicker
            startDate={poStartDate}
            endDate={poEndDate}
            onDateRangeChange={(start, end) => {
              setPoStartDate(start)
              setPoEndDate(end)
            }}
            placeholder='Select date range'
          />
        </View>
        <BottomSheetFlatList
          data={filteredPOs}
          keyExtractor={(po, index) => `${po.id}-${index}`}
          renderItem={({ item: po }) => (
            <Link href={`/inventory/purchase-orders/${po.id}`} asChild>
              <TouchableOpacity
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    {po.poNumber}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: colors.label, marginTop: 2 }}
                  >
                    {po.status} · {new Date(po.createdAt).toLocaleDateString()}
                  </Text>
                  {po.createdByEmployeeName && (
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      By: {po.createdByEmployeeName}
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  $
                  {po.items
                    .reduce((a, li) => a + li.quantity * li.cost, 0)
                    .toFixed(2)}
                </Text>
              </TouchableOpacity>
            </Link>
          )}
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                height: 120
              }}
            >
              <Text style={{ fontSize: 13, color: colors.muted }}>
                No purchase orders found
              </Text>
            </View>
          }
        />
      </BottomSheet>

      {/* Associated Items Search Sheet */}
      <BottomSheet
        ref={itemSearchRef as any}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={props => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
        keyboardBehavior='interactive'
        keyboardBlurBehavior='restore'
        android_keyboardInputMode='adjustResize'
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 8
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              height: 38,
              gap: 8
            }}
          >
            <Search size={14} color={colors.muted} />
            <BottomSheetTextInput
              value={itemSearchText}
              onChangeText={setItemSearchText}
              placeholder='Search items...'
              placeholderTextColor={colors.muted}
              style={{ flex: 1, fontSize: 13, color: colors.heading }}
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              setItemSearchText('')
              itemSearchRef.current?.close()
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '600', color: colors.label }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
        <BottomSheetFlatList
          data={filteredItems}
          keyExtractor={(it, index) => `${it.id}-${index}`}
          renderItem={({ item: it }) => (
            <Link href={`/inventory/ingredient-items/${it.id}`} asChild>
              <TouchableOpacity
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    {it.name}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: colors.label, marginTop: 2 }}
                  >
                    {it.category} · {it.stockQuantity} {it.unit}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  ${it.cost.toFixed(2)}
                </Text>
              </TouchableOpacity>
            </Link>
          )}
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                height: 120
              }}
            >
              <Text style={{ fontSize: 13, color: colors.muted }}>
                No items found
              </Text>
            </View>
          }
          enableFooterMarginAdjustment
        />
      </BottomSheet>

      {/* Create PO Sheet */}
      <BottomSheet
        ref={createPOSheetRef as any}
        index={-1}
        snapPoints={['60%', '90%']}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={props => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
      >
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <Text
            style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}
          >
            Create Purchase
          </Text>
          <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
            Vendor:{' '}
            <Text style={{ color: colors.heading, fontWeight: '600' }}>
              {vendor?.name}
            </Text>
          </Text>
        </View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
          <TouchableOpacity
            onPress={() => openPOBuilder()}
            style={{
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50',
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}
            >
              Start New Purchase
            </Text>
          </TouchableOpacity>

          <View style={{ marginTop: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Use Past Order as Template
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {vendorPOs.length} available
              </Text>
            </View>
            <BottomSheetFlatList
              data={vendorPOs}
              keyExtractor={(po, index) => `${po.id}-${index}`}
              renderItem={({ item: po }) => (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    marginBottom: 8,
                    padding: 10,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {po.poNumber}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        marginTop: 2
                      }}
                    >
                      {po.status} ·{' '}
                      {new Date(po.createdAt).toLocaleDateString()}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 4,
                        marginTop: 6
                      }}
                    >
                      {po.items.map((li, idx) => (
                        <View
                          key={`${po.id}_${idx}`}
                          style={{
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 20,
                            paddingHorizontal: 7,
                            paddingVertical: 2
                          }}
                        >
                          <Text style={{ fontSize: 10, color: colors.label }}>
                            {getItemName(li.inventoryItemId)} x{li.quantity}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => openPOBuilder(po)}
                    style={{
                      backgroundColor: colors.teal + '20',
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Use
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    No past orders for this vendor.
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </BottomSheet>

      {/* PO Builder Sheet */}
      <BottomSheet
        ref={poBuilderSheetRef as any}
        index={-1}
        snapPoints={['70%', '95%']}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={props => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
        keyboardBehavior='interactive'
        keyboardBlurBehavior='restore'
        android_keyboardInputMode='adjustResize'
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <BottomSheetFlatList
            data={poLineItems}
            keyExtractor={(item, index) => `${item.inventoryItemId}-${index}`}
            renderItem={renderPOLineItem}
            ListHeaderComponent={renderPOBuilderHeader}
            ListFooterComponent={renderPOBuilderFooter}
            contentContainerStyle={{ paddingBottom: 30 }}
          />
        </KeyboardAvoidingView>
      </BottomSheet>
    </>
  )
}

export default VendorDetailsScreen
