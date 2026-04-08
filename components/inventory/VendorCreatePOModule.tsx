import { colors } from '@/lib/theme'
import { POLineItem, PurchaseOrder } from '@/lib/types'
import { useInventoryStore } from '@/stores/useInventoryStore'
import {
  AlertTriangle,
  CircleCheckBig,
  Edit3,
  Search,
  Trash2,
  X
} from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

type ItemLite = {
  id: string
  name: string
  category?: string
  unit?: string
  cost: number
}

type Props = {
  vendorId: string
  vendorName: string
  vendorPOs: PurchaseOrder[]
  items: ItemLite[]
  resolveItemName: (id: string) => string
  openSignal: number
}

const VendorCreatePOModule = ({
  vendorId,
  vendorName,
  vendorPOs,
  items,
  resolveItemName,
  openSignal
}: Props) => {
  const [isChooserOpen, setIsChooserOpen] = useState(false)
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)

  const [poLineItems, setPoLineItems] = useState<POLineItem[]>([])
  const [selectedTemplatePo, setSelectedTemplatePo] =
    useState<PurchaseOrder | null>(null)
  const [isEditingItem, setIsEditingItem] = useState<string | null>(null)
  const [editingQuantity, setEditingQuantity] = useState('')
  const [itemSearchText, setItemSearchText] = useState('')
  const [resultModal, setResultModal] = useState<{
    type: 'success' | 'error'
    title: string
    message: string
  } | null>(null)
  const lastOpenSignalRef = useRef<number | null>(null)

  useEffect(() => {
    if (lastOpenSignalRef.current === null) {
      lastOpenSignalRef.current = openSignal
      if (openSignal > 0) {
        setIsChooserOpen(true)
      }
      return
    }

    if (openSignal !== lastOpenSignalRef.current) {
      lastOpenSignalRef.current = openSignal
      setIsChooserOpen(true)
    }
  }, [openSignal])

  const filteredItems = useMemo(() => {
    const q = itemSearchText.trim().toLowerCase()
    if (!q) return items
    return items.filter(it => {
      const name = it.name?.toLowerCase() || ''
      const category = it.category?.toLowerCase() || ''
      return name.includes(q) || category.includes(q)
    })
  }, [itemSearchText, items])

  const recentTemplates = useMemo(() => {
    return [...vendorPOs]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 5)
  }, [vendorPOs])

  const openPOBuilder = (templatePo?: PurchaseOrder) => {
    setSelectedTemplatePo(templatePo ?? null)
    setPoLineItems(templatePo ? templatePo.items : [])
    setIsChooserOpen(false)
    setIsBuilderOpen(true)
  }

  const closeAll = () => {
    setIsChooserOpen(false)
    setIsBuilderOpen(false)
    setSelectedTemplatePo(null)
    setIsEditingItem(null)
    setEditingQuantity('')
    setItemSearchText('')
  }

  const addItemToPO = (item: ItemLite) => {
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
      return
    }

    setPoLineItems(prev => [
      ...prev,
      { inventoryItemId: item.id, quantity: 1, cost: item.cost }
    ])
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

  const submitPurchaseOrder = async (status: 'Draft' | 'Pending Delivery') => {
    if (poLineItems.length === 0) {
      setResultModal({
        type: 'error',
        title: 'Unable to Create PO',
        message: 'Please add at least one item to the purchase order.'
      })
      return
    }

    try {
      const { createPurchaseOrder } = useInventoryStore.getState()
      await createPurchaseOrder({ vendorId, status, items: poLineItems })
      setResultModal({
        type: 'success',
        title: 'Purchase Order Created',
        message: `Purchase order ${
          status === 'Draft' ? 'saved as draft' : 'submitted'
        } successfully.`
      })
      setPoLineItems([])
      closeAll()
    } catch {
      setResultModal({
        type: 'error',
        title: 'Creation Failed',
        message: 'Failed to create purchase order. Please try again.'
      })
    }
  }

  return (
    <>
      <Modal
        transparent
        visible={isChooserOpen}
        animationType='fade'
        onRequestClose={closeAll}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 620,
              maxHeight: '82%',
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Create Purchase Order
                </Text>
                <Text
                  style={{ fontSize: 12, color: colors.label, marginTop: 2 }}
                >
                  Vendor:{' '}
                  <Text style={{ color: colors.heading, fontWeight: '600' }}>
                    {vendorName}
                  </Text>
                </Text>
              </View>
              <TouchableOpacity onPress={closeAll} style={{ padding: 6 }}>
                <X size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 14 }}>
              <TouchableOpacity
                onPress={() => openPOBuilder()}
                style={{
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: 'center',
                  marginBottom: 10
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  Start New Purchase
                </Text>
              </TouchableOpacity>

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
                Recent Templates
              </Text>

              {recentTemplates.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    No past orders for this vendor.
                  </Text>
                </View>
              ) : (
                recentTemplates.map((po, index) => (
                  <View
                    key={`${po.id}-${index}`}
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
                        {po.status} �{' '}
                        {new Date(po.createdAt).toLocaleDateString()}
                      </Text>
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
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={isBuilderOpen}
        animationType='fade'
        onRequestClose={closeAll}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 900,
                maxHeight: '90%',
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                overflow: 'hidden'
              }}
            >
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: colors.heading
                    }}
                  >
                    Build PO
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.label }}>
                    Vendor:{' '}
                    <Text style={{ color: colors.heading, fontWeight: '600' }}>
                      {vendorName}
                    </Text>
                  </Text>
                  {selectedTemplatePo && (
                    <Text style={{ fontSize: 11, color: colors.teal }}>
                      Template: {selectedTemplatePo.poNumber}
                    </Text>
                  )}
                </View>
                <View
                  style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                >
                  <TouchableOpacity
                    onPress={() => submitPurchaseOrder('Draft')}
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
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.label
                      }}
                    >
                      Save Draft
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => submitPurchaseOrder('Pending Delivery')}
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
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Submit
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={closeAll} style={{ padding: 6 }}>
                    <X size={16} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
              >
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
                      marginBottom: 10
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      No items added yet
                    </Text>
                  </View>
                )}

                {poLineItems.map((lineItem, index) => {
                  const item = items.find(
                    i => i.id === lineItem.inventoryItemId
                  )
                  const isEditing = isEditingItem === lineItem.inventoryItemId
                  return (
                    <View
                      key={`${lineItem.inventoryItemId}-${index}`}
                      style={{
                        backgroundColor: colors.screen,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 8,
                        padding: 12,
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
                            style={{
                              fontSize: 13,
                              fontWeight: '600',
                              color: colors.heading
                            }}
                          >
                            {item?.name || 'Unknown'}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.label,
                              marginTop: 2
                            }}
                          >
                            ${lineItem.cost.toFixed(2)} per {item?.unit}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          {isEditing ? (
                            <>
                              <TextInput
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
                              <Text
                                style={{ fontSize: 13, color: colors.heading }}
                              >
                                Qty: {lineItem.quantity}
                              </Text>
                              <TouchableOpacity
                                onPress={() =>
                                  startEditItem(
                                    lineItem.inventoryItemId,
                                    lineItem.quantity
                                  )
                                }
                                style={{ padding: 5 }}
                              >
                                <Edit3 size={13} color={colors.label} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() =>
                                  removeItemFromPO(lineItem.inventoryItemId)
                                }
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
                })}

                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.muted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginTop: 8,
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
                  <TextInput
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
                            style={{
                              fontSize: 11,
                              color: colors.label,
                              marginTop: 2
                            }}
                          >
                            {item.category} � ${item.cost.toFixed(2)} per{' '}
                            {item.unit}
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

                {selectedTemplatePo && (
                  <View
                    style={{
                      marginTop: 12,
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 4
                    }}
                  >
                    {selectedTemplatePo.items.map((li, idx) => (
                      <View
                        key={`${selectedTemplatePo.id}_${idx}`}
                        style={{
                          backgroundColor: colors.panel,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 20,
                          paddingHorizontal: 7,
                          paddingVertical: 2
                        }}
                      >
                        <Text style={{ fontSize: 10, color: colors.label }}>
                          {resolveItemName(li.inventoryItemId)} x{li.quantity}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={!!resultModal}
        animationType='fade'
        onRequestClose={() => setResultModal(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor:
                resultModal?.type === 'success'
                  ? colors.teal + '50'
                  : colors.danger + '45',
              borderRadius: 14,
              padding: 16
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              {resultModal?.type === 'success' ? (
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10
                  }}
                >
                  <CircleCheckBig size={22} color={colors.teal} />
                </View>
              ) : (
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: colors.danger + '20',
                    borderWidth: 1,
                    borderColor: colors.danger + '45',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10
                  }}
                >
                  <AlertTriangle size={22} color={colors.danger} />
                </View>
              )}
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {resultModal?.title}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.label,
                  textAlign: 'center',
                  marginTop: 6,
                  lineHeight: 18
                }}
              >
                {resultModal?.message}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setResultModal(null)}
              style={{
                alignSelf: 'center',
                minWidth: 120,
                alignItems: 'center',
                backgroundColor:
                  resultModal?.type === 'success'
                    ? colors.teal + '20'
                    : colors.danger + '15',
                borderWidth: 1,
                borderColor:
                  resultModal?.type === 'success'
                    ? colors.teal + '50'
                    : colors.danger + '45',
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 9
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color:
                    resultModal?.type === 'success'
                      ? colors.teal
                      : colors.danger
                }}
              >
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

export default VendorCreatePOModule
