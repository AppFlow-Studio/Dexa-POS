import { colors } from '@/lib/theme'
import { ExternalExpenseLineItem } from '@/lib/types'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useInventoryStore } from '@/stores/useInventoryStore'
import {
  ChevronDown,
  Edit3,
  Plus,
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

type Props = {
  openSignal: number
}

const AddExpenseModule = ({ openSignal }: Props) => {
  const { inventoryItems, purchaseOrders, addExternalExpense } =
    useInventoryStore()
  const { activeEmployeeId, employees } = useEmployeeStore()

  const inputStyle = {
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.heading,
    fontSize: 13,
    height: 38,
    paddingHorizontal: 12,
    paddingVertical: 0
  } as const

  const fieldLabel = {
    fontSize: 11,
    fontWeight: '600' as const,
    color: colors.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 5
  } as const

  const [isOpen, setIsOpen] = useState(false)
  const [isEmployeePickerOpen, setIsEmployeePickerOpen] = useState(false)
  const [isPOPickerOpen, setIsPOPickerOpen] = useState(false)

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    activeEmployeeId
  )
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null)
  const [expenseItems, setExpenseItems] = useState<ExternalExpenseLineItem[]>(
    []
  )
  const [expenseNotes, setExpenseNotes] = useState('')
  const [storeName, setStoreName] = useState('')
  const [storeLocation, setStoreLocation] = useState('')

  const [itemSearch, setItemSearch] = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [poSearch, setPOSearch] = useState('')

  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingQuantity, setEditingQuantity] = useState('')
  const [editingUnitPrice, setEditingUnitPrice] = useState('')

  const [resultModal, setResultModal] = useState<{
    type: 'success' | 'error'
    title: string
    message: string
  } | null>(null)

  const lastOpenSignalRef = useRef<number | null>(null)

  const resetForm = () => {
    setSelectedEmployeeId(activeEmployeeId)
    setSelectedPOId(null)
    setExpenseItems([])
    setExpenseNotes('')
    setStoreName('')
    setStoreLocation('')
    setItemSearch('')
    setEmployeeSearch('')
    setPOSearch('')
    setEditingIndex(null)
    setEditingQuantity('')
    setEditingUnitPrice('')
  }

  useEffect(() => {
    if (lastOpenSignalRef.current === null) {
      lastOpenSignalRef.current = openSignal
      if (openSignal > 0) {
        resetForm()
        setIsOpen(true)
      }
      return
    }

    if (openSignal !== lastOpenSignalRef.current) {
      lastOpenSignalRef.current = openSignal
      resetForm()
      setIsOpen(true)
    }
  }, [openSignal, activeEmployeeId])

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return inventoryItems
    return inventoryItems.filter(item => {
      const name = item.name?.toLowerCase() || ''
      const category = item.category?.toLowerCase() || ''
      const unit = item.unit?.toLowerCase() || ''
      return name.includes(q) || category.includes(q) || unit.includes(q)
    })
  }, [itemSearch, inventoryItems])

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(employee =>
      employee.fullName.toLowerCase().includes(q)
    )
  }, [employeeSearch, employees])

  const filteredPOs = useMemo(() => {
    const q = poSearch.trim().toLowerCase()
    if (!q) return purchaseOrders
    return purchaseOrders.filter(po => {
      const poNumber = po.poNumber?.toLowerCase() || ''
      const status = po.status?.toLowerCase() || ''
      return poNumber.includes(q) || status.includes(q)
    })
  }, [poSearch, purchaseOrders])

  const selectedEmployee = useMemo(
    () =>
      employees.find(employee => employee.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  )

  const selectedPO = useMemo(
    () => purchaseOrders.find(po => po.id === selectedPOId) || null,
    [purchaseOrders, selectedPOId]
  )

  const totalAmount = useMemo(
    () => expenseItems.reduce((sum, item) => sum + item.totalAmount, 0),
    [expenseItems]
  )

  const closeAll = () => {
    setIsOpen(false)
    setIsEmployeePickerOpen(false)
    setIsPOPickerOpen(false)
    setEditingIndex(null)
    setEditingQuantity('')
    setEditingUnitPrice('')
  }

  const addItemToExpense = (inventoryItemId: string) => {
    const item = inventoryItems.find(i => i.id === inventoryItemId)
    if (!item) return

    setExpenseItems(prev => {
      const existingIndex = prev.findIndex(
        line => line.inventoryItemId === item.id
      )
      if (existingIndex >= 0) {
        const updated = [...prev]
        const existing = updated[existingIndex]
        const nextQuantity = existing.quantity + 1
        updated[existingIndex] = {
          ...existing,
          quantity: nextQuantity,
          totalAmount: nextQuantity * existing.unitPrice
        }
        return updated
      }

      return [
        ...prev,
        {
          inventoryItemId: item.id,
          itemName: item.name,
          quantity: 1,
          unitPrice: item.cost,
          totalAmount: item.cost
        }
      ]
    })
  }

  const removeItemFromExpense = (index: number) => {
    setExpenseItems(prev => prev.filter((_, i) => i !== index))
    if (editingIndex === index) {
      setEditingIndex(null)
      setEditingQuantity('')
      setEditingUnitPrice('')
    }
  }

  const startEditLine = (
    index: number,
    quantity: number,
    unitPrice: number
  ) => {
    setEditingIndex(index)
    setEditingQuantity(String(quantity))
    setEditingUnitPrice(String(unitPrice))
  }

  const saveEditLine = () => {
    if (editingIndex === null) return

    const nextQuantity = parseFloat(editingQuantity)
    const nextUnitPrice = parseFloat(editingUnitPrice)

    if (
      isNaN(nextQuantity) ||
      nextQuantity <= 0 ||
      isNaN(nextUnitPrice) ||
      nextUnitPrice <= 0
    ) {
      setResultModal({
        type: 'error',
        title: 'Invalid Input',
        message: 'Quantity and unit price must be greater than 0.'
      })
      return
    }

    setExpenseItems(prev =>
      prev.map((line, index) =>
        index === editingIndex
          ? {
              ...line,
              quantity: nextQuantity,
              unitPrice: nextUnitPrice,
              totalAmount: nextQuantity * nextUnitPrice
            }
          : line
      )
    )

    setEditingIndex(null)
    setEditingQuantity('')
    setEditingUnitPrice('')
  }

  const createExpense = async () => {
    if (expenseItems.length === 0) {
      setResultModal({
        type: 'error',
        title: 'Empty Expense',
        message: 'Add at least one item before creating an expense.'
      })
      return
    }

    if (!selectedEmployeeId) {
      setResultModal({
        type: 'error',
        title: 'No Employee',
        message: 'Select the employee who made the purchase.'
      })
      return
    }

    const employee = employees.find(e => e.id === selectedEmployeeId)
    if (!employee) {
      setResultModal({
        type: 'error',
        title: 'Employee Not Found',
        message: 'Please select a valid employee.'
      })
      return
    }

    try {
      await addExternalExpense({
        totalAmount,
        purchasedByEmployeeId: selectedEmployeeId,
        purchasedByEmployeeName: employee.fullName,
        purchasedAt: new Date().toISOString(),
        items: expenseItems,
        notes: expenseNotes.trim() || undefined,
        relatedPOId: selectedPOId || undefined,
        relatedPONumber: selectedPO?.poNumber || undefined,
        storeName: storeName.trim() || undefined,
        storeLocation: storeLocation.trim() || undefined
      })

      setIsOpen(false)
      resetForm()
      setResultModal({
        type: 'success',
        title: 'Expense Created',
        message: `Expense with ${expenseItems.length} item${
          expenseItems.length > 1 ? 's' : ''
        } was added successfully.`
      })
    } catch {
      setResultModal({
        type: 'error',
        title: 'Failed To Create Expense',
        message:
          'Something went wrong while creating the expense. Please try again.'
      })
    }
  }

  return (
    <>
      <Modal
        transparent
        visible={isOpen}
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
                maxWidth: 960,
                height: '92%',
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
                    Add External Expense
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: colors.label, marginTop: 2 }}
                  >
                    Track off-PO purchases with line-item detail
                  </Text>
                </View>
                <TouchableOpacity onPress={closeAll} style={{ padding: 6 }}>
                  <X size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 14, paddingBottom: 14 }}
              >
                <View
                  style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Purchased By</Text>
                    <TouchableOpacity
                      onPress={() => setIsEmployeePickerOpen(true)}
                      style={{
                        ...inputStyle,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: selectedEmployee
                            ? colors.heading
                            : colors.muted
                        }}
                      >
                        {selectedEmployee?.fullName || 'Select employee...'}
                      </Text>
                      <ChevronDown size={14} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Related PO (Optional)</Text>
                    <TouchableOpacity
                      onPress={() => setIsPOPickerOpen(true)}
                      style={{
                        ...inputStyle,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderStyle: 'dashed'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: selectedPO ? colors.heading : colors.muted
                        }}
                      >
                        {selectedPO?.poNumber || 'None'}
                      </Text>
                      <ChevronDown size={14} color={colors.muted} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View
                  style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Store Name (Optional)</Text>
                    <TextInput
                      value={storeName}
                      onChangeText={setStoreName}
                      placeholder='e.g. Fresh Market'
                      placeholderTextColor={colors.muted}
                      style={inputStyle}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Location (Optional)</Text>
                    <TextInput
                      value={storeLocation}
                      onChangeText={setStoreLocation}
                      placeholder='e.g. 123 Main St'
                      placeholderTextColor={colors.muted}
                      style={inputStyle}
                    />
                  </View>
                </View>

                <View
                  style={{
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 12
                  }}
                >
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
                      Line Items ({expenseItems.length})
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: colors.heading
                      }}
                    >
                      Total: ${totalAmount.toFixed(2)}
                    </Text>
                  </View>

                  {expenseItems.length === 0 && (
                    <View style={{ alignItems: 'center', paddingVertical: 14 }}>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        No items added yet
                      </Text>
                    </View>
                  )}

                  {expenseItems.map((lineItem, index) => {
                    const isEditing = editingIndex === index
                    return (
                      <View
                        key={`${lineItem.inventoryItemId}-${index}`}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.panel,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 7
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
                              {lineItem.itemName}
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                color: colors.label,
                                marginTop: 2
                              }}
                            >
                              Qty {lineItem.quantity} × $
                              {lineItem.unitPrice.toFixed(2)}
                            </Text>
                          </View>

                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            {!isEditing && (
                              <>
                                <TouchableOpacity
                                  onPress={() =>
                                    startEditLine(
                                      index,
                                      lineItem.quantity,
                                      lineItem.unitPrice
                                    )
                                  }
                                  style={{ padding: 5 }}
                                >
                                  <Edit3 size={13} color={colors.label} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => removeItemFromExpense(index)}
                                  style={{ padding: 5 }}
                                >
                                  <Trash2 size={13} color={colors.danger} />
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>

                        {isEditing && (
                          <View style={{ marginTop: 10, gap: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={fieldLabel}>Quantity</Text>
                                <TextInput
                                  value={editingQuantity}
                                  onChangeText={setEditingQuantity}
                                  keyboardType='decimal-pad'
                                  placeholder='Qty'
                                  placeholderTextColor={colors.muted}
                                  style={{
                                    ...inputStyle,
                                    flex: 1
                                  }}
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={fieldLabel}>Unit Price</Text>
                                <TextInput
                                  value={editingUnitPrice}
                                  onChangeText={setEditingUnitPrice}
                                  keyboardType='decimal-pad'
                                  placeholder='Unit Price'
                                  placeholderTextColor={colors.muted}
                                  style={{
                                    ...inputStyle,
                                    flex: 1
                                  }}
                                />
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                onPress={() => {
                                  setEditingIndex(null)
                                  setEditingQuantity('')
                                  setEditingUnitPrice('')
                                }}
                                style={{
                                  flex: 1,
                                  paddingVertical: 8,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  borderRadius: 8,
                                  alignItems: 'center'
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: '600',
                                    color: colors.label
                                  }}
                                >
                                  Cancel
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={saveEditLine}
                                style={{
                                  flex: 1,
                                  paddingVertical: 8,
                                  backgroundColor: colors.teal + '20',
                                  borderWidth: 1,
                                  borderColor: colors.teal + '50',
                                  borderRadius: 8,
                                  alignItems: 'center'
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: '600',
                                    color: colors.teal
                                  }}
                                >
                                  Save
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.teal,
                            textAlign: 'right',
                            marginTop: 7
                          }}
                        >
                          ${lineItem.totalAmount.toFixed(2)}
                        </Text>
                      </View>
                    )
                  })}
                </View>

                <Text style={{ ...fieldLabel, marginBottom: 7 }}>
                  Add Items
                </Text>
                <Text style={fieldLabel}>Search Items</Text>
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
                    marginBottom: 9
                  }}
                >
                  <Search size={14} color={colors.muted} />
                  <TextInput
                    value={itemSearch}
                    onChangeText={setItemSearch}
                    placeholder='Search inventory items...'
                    placeholderTextColor={colors.muted}
                    style={{ flex: 1, fontSize: 13, color: colors.heading }}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  {filteredItems.slice(0, 50).map(item => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => addItemToExpense(item.id)}
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
                          {item.category} · ${item.cost.toFixed(2)} per{' '}
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
                          paddingVertical: 4,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Plus size={12} color={colors.teal} />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: colors.teal
                          }}
                        >
                          Add
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}

                  {filteredItems.length === 0 && (
                    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        No items found
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={fieldLabel}>Notes (Optional)</Text>
                  <TextInput
                    value={expenseNotes}
                    onChangeText={setExpenseNotes}
                    placeholder='e.g. emergency stock run'
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                    style={{
                      ...inputStyle,
                      height: 72,
                      paddingTop: 10,
                      textAlignVertical: 'top'
                    }}
                  />
                </View>
              </ScrollView>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  paddingHorizontal: 14,
                  paddingTop: 10,
                  paddingBottom: 12,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  backgroundColor: colors.panel
                }}
              >
                <TouchableOpacity
                  onPress={closeAll}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.label
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={createExpense}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50',
                    borderRadius: 8,
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.teal
                    }}
                  >
                    Create Expense
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={isEmployeePickerOpen}
        animationType='fade'
        onRequestClose={() => setIsEmployeePickerOpen(false)}
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
              maxWidth: 520,
              maxHeight: '75%',
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
                borderBottomColor: colors.border
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
                    fontSize: 14,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Select Employee
                </Text>
                <TouchableOpacity
                  onPress={() => setIsEmployeePickerOpen(false)}
                  style={{ padding: 6 }}
                >
                  <X size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>
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
                  marginTop: 8
                }}
              >
                <Search size={14} color={colors.muted} />
                <TextInput
                  value={employeeSearch}
                  onChangeText={setEmployeeSearch}
                  placeholder='Search employees...'
                  placeholderTextColor={colors.muted}
                  style={{ flex: 1, fontSize: 13, color: colors.heading }}
                />
              </View>
              <Text style={{ ...fieldLabel, marginTop: 8, marginBottom: 0 }}>
                Employee List
              </Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 14 }}>
              {filteredEmployees.map(employee => (
                <TouchableOpacity
                  key={employee.id}
                  onPress={() => {
                    setSelectedEmployeeId(employee.id)
                    setIsEmployeePickerOpen(false)
                    setEmployeeSearch('')
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 8
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    {employee.fullName}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}
                  >
                    {employee.shiftStatus === 'clocked_in'
                      ? 'Clocked In'
                      : 'Clocked Out'}
                  </Text>
                </TouchableOpacity>
              ))}

              {filteredEmployees.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    No employees found
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={isPOPickerOpen}
        animationType='fade'
        onRequestClose={() => setIsPOPickerOpen(false)}
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
              maxWidth: 520,
              maxHeight: '75%',
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
                borderBottomColor: colors.border
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
                    fontSize: 14,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Related PO
                </Text>
                <TouchableOpacity
                  onPress={() => setIsPOPickerOpen(false)}
                  style={{ padding: 6 }}
                >
                  <X size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>
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
                  marginTop: 8
                }}
              >
                <Search size={14} color={colors.muted} />
                <TextInput
                  value={poSearch}
                  onChangeText={setPOSearch}
                  placeholder='Search purchase orders...'
                  placeholderTextColor={colors.muted}
                  style={{ flex: 1, fontSize: 13, color: colors.heading }}
                />
              </View>
              <Text style={{ ...fieldLabel, marginTop: 8, marginBottom: 0 }}>
                Purchase Orders
              </Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 14 }}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedPOId(null)
                  setIsPOPickerOpen(false)
                  setPOSearch('')
                }}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8
                }}
              >
                <Text style={{ fontSize: 13, color: colors.label }}>None</Text>
              </TouchableOpacity>

              {filteredPOs.map(po => (
                <TouchableOpacity
                  key={po.id}
                  onPress={() => {
                    setSelectedPOId(po.id)
                    setIsPOPickerOpen(false)
                    setPOSearch('')
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 8
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
                  <Text
                    style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}
                  >
                    {po.status} · $
                    {po.items
                      .reduce((sum, line) => sum + line.cost * line.quantity, 0)
                      .toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}

              {filteredPOs.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    No purchase orders found
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
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
              borderColor: colors.border,
              borderRadius: 14,
              padding: 18
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color:
                  resultModal?.type === 'success'
                    ? colors.success
                    : colors.danger,
                marginBottom: 6
              }}
            >
              {resultModal?.title}
            </Text>
            <Text style={{ fontSize: 13, color: colors.label, lineHeight: 18 }}>
              {resultModal?.message}
            </Text>
            <TouchableOpacity
              onPress={() => setResultModal(null)}
              style={{
                marginTop: 14,
                paddingVertical: 9,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center'
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.heading
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

export default AddExpenseModule
