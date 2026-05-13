import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useInventoryStore } from '@/stores/useInventoryStore'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Calendar,
  Camera,
  CreditCard,
  DollarSign,
  X
} from 'lucide-react-native'
import { useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

const PurchaseOrderDetailScreen = () => {
  const router = useRouter()
  const { poId: rawPoId } = useLocalSearchParams()
  const poId = Array.isArray(rawPoId) ? rawPoId[0] : rawPoId
  const {
    purchaseOrders,
    vendors,
    inventoryItems,
    logDeliveryForPO,
    logPaymentForPO,
    cancelPurchaseOrder,
    submitPurchaseOrder,
    deletePurchaseOrder
  } = useInventoryStore()
  const { show } = useToast()

  const po = purchaseOrders.find(p => p.id === poId)
  const vendor = po ? vendors.find(v => v.id === po.vendorId) : null

  // Delivery logging state
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString())
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [deliveryPhotos, setDeliveryPhotos] = useState<string[]>([])
  // receivedDraft holds per-inventoryItemId quantities the manager confirms
  const [receivedDraft, setReceivedDraft] = useState<Record<string, number>>({})

  // Payment logging state
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'Card' | 'Cash'>('Card')
  const [cardLast4, setCardLast4] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paidToEmployee, setPaidToEmployee] = useState('')

  // Cancel PO state
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  // Delete Draft state
  const [showDeleteDraftDialog, setShowDeleteDraftDialog] = useState(false)
  // Image Viewer state
  const [showImageModal, setShowImageModal] = useState(false)
  const [modalImageUri, setModalImageUri] = useState<string | null>(null)

  if (!po) {
    return (
      <View className='flex-1 bg-screen items-center justify-center'>
        <Text className='text-2xl text-white'>Purchase Order not found.</Text>
      </View>
    )
  }

  const totalCost = po.items.reduce(
    (acc, item) => acc + item.cost * item.quantity,
    0
  )

  const statusColors = {
    Draft: {
      bg: colors.teal + '1A',
      border: colors.teal + '55',
      text: colors.teal
    },
    'Pending Delivery': {
      bg: colors.teal + '1A',
      border: colors.teal + '55',
      text: colors.teal
    },
    'Awaiting Payment': {
      bg: colors.teal + '1F',
      border: colors.teal + '65',
      text: colors.teal
    },
    Paid: {
      bg: colors.teal + '25',
      border: colors.teal + '70',
      text: colors.teal
    },
    Cancelled: {
      bg: colors.danger + '1A',
      border: colors.danger + '60',
      text: colors.danger
    }
  }

  const handleLogDelivery = async () => {
    if (!poId) return
    // Build received items payload from draft (fallback to original quantities)
    const receivedItems = po.items
      .map(li => ({
        inventoryItemId: li.inventoryItemId,
        quantity: receivedDraft[li.inventoryItemId] ?? li.quantity,
        cost: li.cost
      }))
      .filter(li => li.quantity > 0)

    try {
      await logDeliveryForPO(poId as string, {
        photos: deliveryPhotos,
        deliveredAt: deliveryDate,
        notes: deliveryNotes,
        receivedItems
      })
      setShowDeliveryForm(false)
      show({
        title: 'Success',
        message: `Delivery logged for PO #${po.poNumber}`,
        type: 'success'
      })
    } catch {
      Alert.alert('Error', 'Failed to log delivery.')
    }
  }

  const handleSubmitDelivery = () => {
    void handleLogDelivery()
  }

  const adjustReceivedQty = (inventoryItemId: string, qty: number) => {
    setReceivedDraft(prev => ({
      ...prev,
      [inventoryItemId]: Math.max(0, qty)
    }))
  }

  const handleLogPayment = async () => {
    if (!poId || !paymentAmount) return
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount)) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount.')
      return
    }
    try {
      await logPaymentForPO(poId as string, {
        method: paymentMethod,
        amount,
        paidAt: new Date().toISOString(),
        cardLast4: paymentMethod === 'Card' ? cardLast4 : undefined,
        paidToEmployee
      })
      setShowPaymentForm(false)
      show({
        title: 'Success',
        message: `Payment logged for PO #${po.poNumber}`,
        type: 'success'
      })
    } catch {
      Alert.alert('Error', 'Failed to log payment.')
    }
  }

  const handleCancelPO = async () => {
    if (!poId) return
    try {
      await cancelPurchaseOrder(poId as string)
      setShowCancelDialog(false)
      show({
        title: 'Success',
        message: `PO #${po.poNumber} has been cancelled`,
        type: 'success'
      })
    } catch {
      Alert.alert('Error', 'Failed to cancel purchase order.')
    }
  }

  const handleSubmitDraft = async () => {
    if (!poId) return
    try {
      await submitPurchaseOrder(poId as string)
      show({
        title: 'Success',
        message: `PO #${po.poNumber} submitted to Pending Delivery`,
        type: 'success'
      })
    } catch {
      Alert.alert('Error', 'Failed to submit draft purchase order.')
    }
  }

  const handleDeleteDraft = async () => {
    if (!poId) return
    try {
      await deletePurchaseOrder(poId as string)
      setShowDeleteDraftDialog(false)
      show({
        title: 'Success',
        message: `Draft ${po.poNumber} deleted`,
        type: 'success'
      })
      router.back()
    } catch {
      Alert.alert('Error', 'Failed to delete draft purchase order.')
    }
  }

  const handleAddPhoto = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant camera roll permissions to add photos.'
        )
        return
      }

      // Show action sheet for camera or gallery
      Alert.alert('Add Photos', 'Choose how you want to add photos', [
        {
          text: 'Camera',
          onPress: () => openCamera()
        },
        {
          text: 'Photo Library',
          onPress: () => openImagePicker()
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ])
    } catch (error) {
      console.error('Error requesting permissions:', error)
      Alert.alert('Error', 'Failed to request permissions.')
    }
  }

  const openCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant camera permissions to take photos.'
        )
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8
      })

      if (!result.canceled && result.assets[0]) {
        setDeliveryPhotos(prev => [...prev, result.assets[0].uri])
      }
    } catch (error) {
      console.error('Error taking photo:', error)
      Alert.alert('Error', 'Failed to take photo.')
    }
  }

  const openImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 10 // Limit to 10 photos
      })

      if (!result.canceled && result.assets) {
        const newPhotos = result.assets.map(asset => asset.uri)
        setDeliveryPhotos(prev => [...prev, ...newPhotos])
      }
    } catch (error) {
      console.error('Error picking images:', error)
      Alert.alert('Error', 'Failed to pick images.')
    }
  }

  const removePhoto = (index: number) => {
    setDeliveryPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const inputStyle = {
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.heading,
    fontSize: 12,
    height: 36,
    paddingHorizontal: 10,
    paddingVertical: 0
  } as const

  const sectionTitleStyle = {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.heading
  } as const

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.screen }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 18 }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            marginBottom: 10
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10
            }}
          >
            <Text style={sectionTitleStyle}>PO Details: {po.poNumber}</Text>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                borderWidth: 1,
                backgroundColor: statusColors[po.status].bg,
                borderColor: statusColors[po.status].border
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: statusColors[po.status].text
                }}
              >
                {po.status}
              </Text>
            </View>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 10
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.screen,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRightWidth: 1,
                  borderRightColor: colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    textAlign: 'center'
                  }}
                >
                  Vendor
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRightWidth: 1,
                  borderRightColor: colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    textAlign: 'center'
                  }}
                >
                  Created
                </Text>
              </View>
              <View
                style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 8 }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    textAlign: 'center'
                  }}
                >
                  Total Cost
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.panel,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View
                style={{
                  flex: 1,
                  minHeight: 34,
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                  borderRightWidth: 1,
                  borderRightColor: colors.border
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.heading,
                    textAlign: 'center'
                  }}
                >
                  {vendor?.name || 'Unknown'}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  minHeight: 34,
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                  borderRightWidth: 1,
                  borderRightColor: colors.border
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.heading,
                    textAlign: 'center'
                  }}
                >
                  {new Date(po.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  minHeight: 34,
                  justifyContent: 'center',
                  paddingHorizontal: 8
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.teal,
                    textAlign: 'center'
                  }}
                >
                  ${totalCost.toFixed(2)}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.screen,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRightWidth: 1,
                  borderRightColor: colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    textAlign: 'center'
                  }}
                >
                  Created By
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRightWidth: 1,
                  borderRightColor: colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    textAlign: 'center'
                  }}
                >
                  PO Number
                </Text>
              </View>
              <View
                style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 8 }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    textAlign: 'center'
                  }}
                >
                  Items Count
                </Text>
              </View>
            </View>

            <View
              style={{ flexDirection: 'row', backgroundColor: colors.panel }}
            >
              <View
                style={{
                  flex: 1,
                  minHeight: 34,
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                  borderRightWidth: 1,
                  borderRightColor: colors.border
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.heading,
                    textAlign: 'center'
                  }}
                >
                  {po.createdByEmployeeName || 'Unknown'}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  minHeight: 34,
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                  borderRightWidth: 1,
                  borderRightColor: colors.border
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.teal,
                    textAlign: 'center'
                  }}
                >
                  {po.poNumber}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  minHeight: 34,
                  justifyContent: 'center',
                  paddingHorizontal: 8
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.heading,
                    textAlign: 'center'
                  }}
                >
                  {po.items.length}
                </Text>
              </View>
            </View>
          </View>

          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: colors.heading,
              marginBottom: 6
            }}
          >
            Items
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              overflow: 'hidden'
            }}
          >
            {po.items.map(item => {
              const invItem = inventoryItems.find(
                i => i.id === item.inventoryItemId
              )
              return (
                <View
                  key={item.inventoryItemId}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: colors.screen
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    {invItem?.name || 'Item'}
                  </Text>
                  <Text
                    style={{
                      width: 90,
                      fontSize: 11,
                      color: colors.label,
                      textAlign: 'right'
                    }}
                  >
                    {item.quantity} {invItem?.unit}
                  </Text>
                  <Text
                    style={{
                      width: 90,
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.teal,
                      textAlign: 'right'
                    }}
                  >
                    ${(item.cost * item.quantity).toFixed(2)}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* Draft Actions */}
        {po.status === 'Draft' && (
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <Text style={{ ...sectionTitleStyle, marginBottom: 8 }}>
              Draft Actions
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={handleSubmitDraft}
                style={{
                  flex: 1,
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                  borderRadius: 8,
                  paddingVertical: 9,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  Submit to Pending
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDeleteDraftDialog(true)}
                style={{
                  flex: 1,
                  backgroundColor: colors.danger + '20',
                  borderWidth: 1,
                  borderColor: colors.danger + '50',
                  borderRadius: 8,
                  paddingVertical: 9,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.danger
                  }}
                >
                  Delete Draft
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {po.status === 'Pending Delivery' && (
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginBottom: 10
              }}
            >
              <Calendar size={15} color={colors.label} />
              <Text style={sectionTitleStyle}>Log Delivery</Text>
            </View>

            {!showDeliveryForm ? (
              <TouchableOpacity
                onPress={() => setShowDeliveryForm(true)}
                style={{
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                  borderRadius: 8,
                  paddingVertical: 9,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  Log Goods Received
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ gap: 10 }}>
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 4
                    }}
                  >
                    Date & Time of Delivery
                  </Text>
                  <TextInput
                    value={new Date(deliveryDate).toLocaleString()}
                    editable={false}
                    style={inputStyle}
                  />
                </View>

                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 4
                    }}
                  >
                    Received Items
                  </Text>
                  {po.items.map(li => {
                    const invItem = inventoryItems.find(
                      i => i.id === li.inventoryItemId
                    )
                    return (
                      <View
                        key={li.inventoryItemId}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border
                        }}
                      >
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: colors.heading
                          }}
                        >
                          {invItem?.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            adjustReceivedQty(
                              li.inventoryItemId,
                              Math.max(
                                0,
                                (receivedDraft[li.inventoryItemId] ??
                                  li.quantity) - 1
                              )
                            )
                          }
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text style={{ fontSize: 14, color: colors.heading }}>
                            -
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          value={String(
                            receivedDraft[li.inventoryItemId] ?? li.quantity
                          )}
                          onChangeText={t =>
                            adjustReceivedQty(
                              li.inventoryItemId,
                              Number(t) || 0
                            )
                          }
                          keyboardType='numeric'
                          style={{
                            width: 52,
                            textAlign: 'center',
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 6,
                            color: colors.heading,
                            fontSize: 12,
                            height: 30,
                            paddingVertical: 0
                          }}
                        />
                        <TouchableOpacity
                          onPress={() =>
                            adjustReceivedQty(
                              li.inventoryItemId,
                              (receivedDraft[li.inventoryItemId] ??
                                li.quantity) + 1
                            )
                          }
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text style={{ fontSize: 14, color: colors.heading }}>
                            +
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            adjustReceivedQty(li.inventoryItemId, 0)
                          }
                          style={{
                            marginLeft: 4,
                            paddingHorizontal: 6,
                            paddingVertical: 3,
                            borderRadius: 6,
                            backgroundColor: colors.danger + '20',
                            borderWidth: 1,
                            borderColor: colors.danger + '50'
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '600',
                              color: colors.danger
                            }}
                          >
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                </View>

                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 4
                    }}
                  >
                    Photos
                  </Text>
                  <TouchableOpacity
                    onPress={handleAddPhoto}
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Camera size={18} color={colors.label} />
                    <Text style={{ fontSize: 12, color: colors.label }}>
                      Add Photos
                    </Text>
                  </TouchableOpacity>
                  {deliveryPhotos.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.muted,
                          marginBottom: 6
                        }}
                      >
                        {deliveryPhotos.length} photo(s)
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 6
                        }}
                      >
                        {deliveryPhotos.map((photo, index) => (
                          <View key={index} style={{ position: 'relative' }}>
                            <Image
                              source={{ uri: photo }}
                              style={{ width: 64, height: 64, borderRadius: 8 }}
                              resizeMode='cover'
                            />
                            <TouchableOpacity
                              onPress={() => removePhoto(index)}
                              style={{
                                position: 'absolute',
                                top: -6,
                                right: -6,
                                backgroundColor: colors.danger,
                                borderRadius: 999,
                                width: 20,
                                height: 20,
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <X size={12} color='white' />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 4
                    }}
                  >
                    Notes
                  </Text>
                  <TextInput
                    value={deliveryNotes}
                    onChangeText={setDeliveryNotes}
                    placeholder='e.g., Box damaged'
                    placeholderTextColor={colors.muted}
                    multiline
                    style={{
                      ...inputStyle,
                      minHeight: 56,
                      height: 56,
                      textAlignVertical: 'top',
                      paddingTop: 8
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setShowDeliveryForm(false)}
                    style={{
                      flex: 1,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingVertical: 9,
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
                    onPress={handleSubmitDelivery}
                    style={{
                      flex: 1,
                      backgroundColor: colors.teal + '20',
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      Submit Log
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {po.status === 'Awaiting Payment' && (
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginBottom: 10
              }}
            >
              <DollarSign size={15} color={colors.label} />
              <Text style={sectionTitleStyle}>Log Payment</Text>
            </View>

            {!showPaymentForm ? (
              <TouchableOpacity
                onPress={() => setShowPaymentForm(true)}
                style={{
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                  borderRadius: 8,
                  paddingVertical: 9,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  Log Payment
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ gap: 10 }}>
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 6
                    }}
                  >
                    Method
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setPaymentMethod('Card')}
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor:
                          paymentMethod === 'Card'
                            ? colors.teal + '60'
                            : colors.border,
                        backgroundColor:
                          paymentMethod === 'Card'
                            ? colors.teal + '20'
                            : colors.screen
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <CreditCard
                          size={16}
                          color={
                            paymentMethod === 'Card'
                              ? colors.teal
                              : colors.label
                          }
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '700',
                            color:
                              paymentMethod === 'Card'
                                ? colors.teal
                                : colors.label
                          }}
                        >
                          Card
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPaymentMethod('Cash')}
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor:
                          paymentMethod === 'Cash'
                            ? colors.teal + '60'
                            : colors.border,
                        backgroundColor:
                          paymentMethod === 'Cash'
                            ? colors.teal + '20'
                            : colors.screen
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <DollarSign
                          size={16}
                          color={
                            paymentMethod === 'Cash'
                              ? colors.teal
                              : colors.label
                          }
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '700',
                            color:
                              paymentMethod === 'Cash'
                                ? colors.teal
                                : colors.label
                          }}
                        >
                          Cash
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {paymentMethod === 'Card' && (
                  <View>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: colors.label,
                        marginBottom: 4
                      }}
                    >
                      Card Last 4
                    </Text>
                    <TextInput
                      value={cardLast4}
                      onChangeText={setCardLast4}
                      placeholder='1234'
                      placeholderTextColor={colors.muted}
                      keyboardType='numeric'
                      maxLength={4}
                      style={inputStyle}
                    />
                  </View>
                )}

                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 4
                    }}
                  >
                    Amount
                  </Text>
                  <TextInput
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    placeholder='0.00'
                    placeholderTextColor={colors.muted}
                    keyboardType='numeric'
                    style={inputStyle}
                  />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 4
                    }}
                  >
                    Vendor
                  </Text>
                  <TextInput
                    value={vendor?.name || ''}
                    editable={false}
                    style={{
                      ...inputStyle,
                      color: colors.label,
                      backgroundColor: colors.panel
                    }}
                  />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 4
                    }}
                  >
                    Paid To
                  </Text>
                  <TextInput
                    value={paidToEmployee}
                    onChangeText={setPaidToEmployee}
                    placeholder='Employee name'
                    placeholderTextColor={colors.muted}
                    style={inputStyle}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setShowPaymentForm(false)}
                    style={{
                      flex: 1,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingVertical: 9,
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
                    onPress={handleLogPayment}
                    style={{
                      flex: 1,
                      backgroundColor: colors.teal + '20',
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      Confirm
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Delivery History */}
        {po.deliveryLoggedAt && (
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <Text style={{ ...sectionTitleStyle, marginBottom: 8 }}>
              Delivery History
            </Text>
            <View
              style={{
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 10
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 6
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  Delivered At
                </Text>
                <Text style={{ fontSize: 11, color: colors.heading }}>
                  {new Date(po.deliveryLoggedAt).toLocaleString()}
                </Text>
              </View>
              {po.discrepancyNotes && (
                <View style={{ marginBottom: 6 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.heading,
                      marginBottom: 4
                    }}
                  >
                    Notes
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    {po.discrepancyNotes}
                  </Text>
                </View>
              )}
              {po.deliveryPhotos && po.deliveryPhotos.length > 0 && (
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.heading,
                      marginBottom: 6
                    }}
                  >
                    Photos ({po.deliveryPhotos.length})
                  </Text>
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                  >
                    {po.deliveryPhotos.map((photo, index) => (
                      <TouchableOpacity
                        key={index}
                        onPress={() => {
                          setModalImageUri(photo)
                          setShowImageModal(true)
                        }}
                      >
                        <Image
                          source={{ uri: photo }}
                          style={{ width: 64, height: 64, borderRadius: 8 }}
                          resizeMode='cover'
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Discrepancy Report */}
        {(() => {
          const requested =
            po.originalItems && po.originalItems.length > 0
              ? po.originalItems
              : po.items
          const received = po.receivedItems || []
          const ids = Array.from(
            new Set([
              ...requested.map(i => i.inventoryItemId),
              ...received.map(i => i.inventoryItemId)
            ])
          )
          const rows = ids.map(id => {
            const req = requested.find(x => x.inventoryItemId === id)
            const rec = received.find(x => x.inventoryItemId === id)
            const reqQty = req?.quantity ?? 0
            const recQty = rec?.quantity ?? 0
            return { id, reqQty, recQty, cost: req?.cost ?? rec?.cost ?? 0 }
          })
          const hasDiscrepancy = rows.some(r => r.reqQty !== r.recQty)
          if (!hasDiscrepancy) return null
          return (
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                marginBottom: 10
              }}
            >
              <Text style={{ ...sectionTitleStyle, marginBottom: 8 }}>
                Discrepancy Report
              </Text>
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 11, color: colors.muted }}>
                    Item
                  </Text>
                  <Text
                    style={{
                      width: 52,
                      textAlign: 'right',
                      fontSize: 11,
                      color: colors.muted
                    }}
                  >
                    Req
                  </Text>
                  <Text
                    style={{
                      width: 52,
                      textAlign: 'right',
                      fontSize: 11,
                      color: colors.muted
                    }}
                  >
                    Rec
                  </Text>
                  <Text
                    style={{
                      width: 64,
                      textAlign: 'right',
                      fontSize: 11,
                      color: colors.muted
                    }}
                  >
                    Status
                  </Text>
                </View>
                {rows.map(r => {
                  if (r.reqQty === r.recQty) return null
                  const invItem = inventoryItems.find(i => i.id === r.id)
                  let status = 'Modified'
                  let badge = 'bg-teal-600 text-teal-50'
                  if (r.recQty === 0 && r.reqQty > 0) {
                    status = 'Missing'
                    badge = 'bg-red-600 text-red-50'
                  } else if (r.recQty > r.reqQty) {
                    status = '+ Added'
                    badge = 'bg-teal-500 text-teal-50'
                  }
                  return (
                    <View
                      key={r.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border
                      }}
                    >
                      <Text
                        style={{ flex: 1, fontSize: 11, color: colors.heading }}
                      >
                        {invItem?.name || r.id}
                      </Text>
                      <Text
                        style={{
                          width: 52,
                          textAlign: 'right',
                          fontSize: 11,
                          color: colors.label
                        }}
                      >
                        {r.reqQty}
                      </Text>
                      <Text
                        style={{
                          width: 52,
                          textAlign: 'right',
                          fontSize: 11,
                          color: colors.label
                        }}
                      >
                        {r.recQty}
                      </Text>
                      <View style={{ width: 64, alignItems: 'flex-end' }}>
                        <Text
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge}`}
                        >
                          {status}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>
          )
        })()}

        {po.payment && (
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <Text style={{ ...sectionTitleStyle, marginBottom: 8 }}>
              Payment History
            </Text>
            <View
              style={{
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 10
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 6
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  Method
                </Text>
                <Text style={{ fontSize: 11, color: colors.heading }}>
                  {po.payment.method}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 6
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  Amount
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  ${po.payment.amount.toFixed(2)}
                </Text>
              </View>
              {po.payment.cardLast4 && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    Card Last 4
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.heading }}>
                    ****{po.payment.cardLast4}
                  </Text>
                </View>
              )}
              {po.payment.paidToEmployee && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    Paid To
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.heading }}>
                    {po.payment.paidToEmployee}
                  </Text>
                </View>
              )}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between'
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  Paid At
                </Text>
                <Text style={{ fontSize: 11, color: colors.heading }}>
                  {new Date(po.payment.paidAt).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {po.status !== 'Cancelled' && po.status !== 'Paid' && (
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12
            }}
          >
            <TouchableOpacity
              onPress={() => setShowCancelDialog(true)}
              style={{
                backgroundColor: colors.danger + '20',
                borderWidth: 1,
                borderColor: colors.danger + '50',
                borderRadius: 8,
                paddingVertical: 9,
                paddingHorizontal: 14,
                alignItems: 'center'
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: colors.danger
                }}
              >
                Cancel Purchase Order
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {showCancelDialog && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 14
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 360,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 14
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading,
                  marginBottom: 8
                }}
              >
                Cancel PO
              </Text>
              <Text
                style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}
              >
                Cancel PO #{po.poNumber}? This cannot be undone.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setShowCancelDialog(false)}
                  style={{
                    flex: 1,
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingVertical: 9,
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
                    Keep PO
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancelPO}
                  style={{
                    flex: 1,
                    backgroundColor: colors.danger + '20',
                    borderWidth: 1,
                    borderColor: colors.danger + '50',
                    borderRadius: 8,
                    paddingVertical: 9,
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: colors.danger
                    }}
                  >
                    Cancel PO
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {showDeleteDraftDialog && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 14
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 360,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 14
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading,
                  marginBottom: 8
                }}
              >
                Delete Draft
              </Text>
              <Text
                style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}
              >
                Delete draft {po.poNumber}? This cannot be undone.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setShowDeleteDraftDialog(false)}
                  style={{
                    flex: 1,
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingVertical: 9,
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
                    Keep Draft
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteDraft}
                  style={{
                    flex: 1,
                    backgroundColor: colors.danger + '20',
                    borderWidth: 1,
                    borderColor: colors.danger + '50',
                    borderRadius: 8,
                    paddingVertical: 9,
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: colors.danger
                    }}
                  >
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Image Viewer Modal */}
        <Dialog
          open={showImageModal}
          onOpenChange={() => setShowImageModal(false)}
          className='w-full h-full items-center justify-center flex'
        >
          <DialogContent className='w-full h-full bg-transparent border-none p-0'>
            <View className='flex-1 items-center w-full h-full justify-center'>
              {/* <TouchableOpacity
                className="absolute top-10 right-6 z-10 bg-black/50 rounded-full px-4 py-2"
                onPress={() => setShowImageModal(false)}
              >
                <Text className="text-white font-semibold text-lg">Close</Text>
              </TouchableOpacity> */}
              {modalImageUri && (
                <Image
                  source={{ uri: modalImageUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode='contain'
                />
              )}
            </View>
          </DialogContent>
        </Dialog>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export default PurchaseOrderDetailScreen
