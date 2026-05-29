import { CFDPairingQR } from '@/components/cfd/CFDPairingQR'
import { CFDStatusBadge } from '@/components/cfd/CFDStatusBadge'
import { Switch } from '@/components/ui/switch'
import { useCFD } from '@/contexts/CFDProvider'
import { createSupabaseClient } from '@/lib/supabase'
import { colors } from '@/lib/theme'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useAuth } from '@clerk/clerk-expo'
import { useQuery } from '@tanstack/react-query'
import {
  Image as ImageIcon,
  Monitor,
  Plus,
  Trash2
} from 'lucide-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'

const CustomerDisplayScreen = () => {
  const { getToken } = useAuth()
  const supabase = createSupabaseClient(getToken)
  const selectedStore = useStoreSettingsStore(state => state.selectedStore)
  const setSelectedStore = useStoreSettingsStore(state => state.setSelectedStore)
  const showCFDOrderingRightPanel = useStoreSettingsStore(
    state => state.showCFDOrderingRightPanel
  )
  const cfdOrderingRightPanelMode = useStoreSettingsStore(
    state => state.cfdOrderingRightPanelMode
  )
  const updateField = useStoreSettingsStore(state => state.updateField)
  const {
    connectedClientIds,
    disconnectClient,
    refreshCarouselImages,
    refreshOrderingPanelImages
  } = useCFD()

  const [showPairing, setShowPairing] = useState(false)
  const [disconnectConfirm, setDisconnectConfirm] = useState<string | null>(null)
  const [imageDeleteConfirm, setImageDeleteConfirm] = useState<{
    id: string
    type: 'carousel' | 'ordering'
  } | null>(null)
  const [carouselUploading, setCarouselUploading] = useState(false)
  const [orderingPanelUploadingSlot, setOrderingPanelUploadingSlot] = useState<
    'primary' | 'secondary' | null
  >(null)
  const [isSavingPricingMode, setIsSavingPricingMode] = useState(false)

  const handlePricingDisplayModeChange = async (
    mode: 'dual' | 'card_only' | 'cash_only'
  ) => {
    if (!selectedStore || isSavingPricingMode) return
    if (selectedStore.cfd_pricing_display_mode === mode) return
    setIsSavingPricingMode(true)
    try {
      const { error } = await supabase
        .from('locations')
        .update({ cfd_pricing_display_mode: mode })
        .eq('id', selectedStore.id)
      if (error) throw error
      setSelectedStore({ ...selectedStore, cfd_pricing_display_mode: mode })
    } catch {
      Alert.alert('Error', 'Failed to update pricing display mode')
    } finally {
      setIsSavingPricingMode(false)
    }
  }

  const { data: carouselImages, refetch: refetchCarousel } = useQuery({
    queryKey: ['cfd-carousel-images', selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return []
      const { data, error } = await supabase
        .from('cfd_carousel_images')
        .select('id, image_url, is_active, display_order')
        .eq('location_id', selectedStore.id)
        .order('display_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedStore?.id
  })

  const { data: orderingPanelImages, refetch: refetchOrderingPanelImages } = useQuery({
    queryKey: ['cfd-ordering-panel-images', selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return []
      const { data, error } = await supabase
        .from('cfd_ordering_panel_images')
        .select('id, image_url, is_active, display_order, panel_slot')
        .eq('location_id', selectedStore.id)
        .order('panel_slot', { ascending: true })
        .order('display_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedStore?.id
  })

  const pickCarouselImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      base64: true
    })
    if (result.canceled || !result.assets[0]?.base64) return
    setCarouselUploading(true)
    try {
      const base64 = result.assets[0].base64
      const token = await getToken()
      const { data, error: uploadError } = await supabase.functions.invoke('cdn-upload', {
        body: {
          scope: 'merchant',
          merchantId: selectedStore!.merchant_id,
          category: 'cfd-images',
          fileName: `carousel_${Date.now()}.jpg`,
          fileBase64: base64,
          contentType: 'image/jpeg'
        },
        headers: { Authorization: `Bearer ${token}` }
      })
      if (uploadError || !data?.cdnUrl) throw uploadError ?? new Error('No CDN URL returned')
      const nextOrder = (carouselImages?.length ?? 0) + 1
      await supabase.from('cfd_carousel_images').insert({
        location_id: selectedStore!.id,
        image_url: data.cdnUrl,
        is_active: true,
        display_order: nextOrder
      })
      refetchCarousel()
      await refreshCarouselImages()
    } catch {
      Alert.alert('Error', 'Failed to upload image')
    } finally {
      setCarouselUploading(false)
    }
  }

  const pickOrderingPanelImage = async (
    panelSlot: 'primary' | 'secondary',
    cropVariant: 'vertical' | 'half'
  ) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: cropVariant === 'vertical' ? [9, 16] : [9, 8],
      quality: 0.8,
      base64: true
    })
    if (result.canceled || !result.assets[0]?.base64) return
    setOrderingPanelUploadingSlot(panelSlot)
    try {
      const base64 = result.assets[0].base64
      const token = await getToken()
      const { data, error: uploadError } = await supabase.functions.invoke('cdn-upload', {
        body: {
          scope: 'merchant',
          merchantId: selectedStore!.merchant_id,
          category: 'cfd-images',
          fileName: `ordering_panel_${panelSlot}_${Date.now()}.jpg`,
          fileBase64: base64,
          contentType: 'image/jpeg'
        },
        headers: { Authorization: `Bearer ${token}` }
      })
      if (uploadError || !data?.cdnUrl) throw uploadError ?? new Error('No CDN URL returned')
      const nextOrder =
        ((orderingPanelImages ?? []).filter(img => img.panel_slot === panelSlot).length ?? 0) + 1
      await supabase.from('cfd_ordering_panel_images').insert({
        location_id: selectedStore!.id,
        panel_slot: panelSlot,
        image_url: data.cdnUrl,
        is_active: true,
        display_order: nextOrder
      })
      refetchOrderingPanelImages()
      await refreshOrderingPanelImages()
    } catch {
      Alert.alert('Error', 'Failed to upload image')
    } finally {
      setOrderingPanelUploadingSlot(null)
    }
  }

  const deleteCarouselImage = async (id: string) => {
    await supabase.from('cfd_carousel_images').delete().eq('id', id)
    refetchCarousel()
    await refreshCarouselImages()
  }

  const toggleCarouselImage = async (id: string, current: boolean) => {
    await supabase.from('cfd_carousel_images').update({ is_active: !current }).eq('id', id)
    refetchCarousel()
    await refreshCarouselImages()
  }

  const deleteOrderingPanelImage = async (id: string) => {
    await supabase.from('cfd_ordering_panel_images').delete().eq('id', id)
    refetchOrderingPanelImages()
    await refreshOrderingPanelImages()
  }

  const toggleOrderingPanelImage = async (id: string, current: boolean) => {
    await supabase
      .from('cfd_ordering_panel_images')
      .update({ is_active: !current })
      .eq('id', id)
    refetchOrderingPanelImages()
    await refreshOrderingPanelImages()
  }

  const primaryOrderingPanelImages =
    (orderingPanelImages ?? []).filter(img => img.panel_slot === 'primary')
  const secondaryOrderingPanelImages =
    (orderingPanelImages ?? []).filter(img => img.panel_slot === 'secondary')
  const getOrderingPanelCropVariant = (panelSlot: 'primary' | 'secondary') =>
    cfdOrderingRightPanelMode === 'single' && panelSlot === 'primary' ? 'vertical' : 'half'

  const extractIp = (clientId: string) => clientId.substring(0, clientId.lastIndexOf(':'))

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 24 }}
    >
      {/* Header */}
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>
          Customer Display
        </Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
          Configure the customer-facing display shown during ordering and payment
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }} />

      {/* CFD Card */}
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
        {/* Title row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.teal + '15',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Monitor size={16} color={colors.teal} />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
                Connected Displays
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted }}>
                Pair and manage external customer displays
              </Text>
            </View>
          </View>
          <CFDStatusBadge onPress={() => setShowPairing(true)} />
        </View>

        {/* Connected displays list */}
        {connectedClientIds.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text
              style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontWeight: '600' }}
            >
              Active Connections
            </Text>
            {connectedClientIds.map(clientId => (
              <View
                key={clientId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: colors.screen,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 8,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: colors.teal + '30'
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.heading, fontWeight: '500' }}>
                    {extractIp(clientId)}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
                    Connected
                  </Text>
                </View>
                <Pressable
                  onPress={() => setDisconnectConfirm(clientId)}
                  style={{
                    backgroundColor: colors.danger + '20',
                    borderWidth: 1,
                    borderColor: colors.danger + '50',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 6
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.danger }}>
                    Disconnect
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Pair button */}
        <Pressable
          onPress={() => setShowPairing(true)}
          style={{
            backgroundColor: colors.teal + '20',
            borderWidth: 1,
            borderColor: colors.teal + '50',
            paddingVertical: 7,
            borderRadius: 8,
            alignItems: 'center'
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>
            {connectedClientIds.length > 0 ? 'Pair Additional Display' : 'Connect Display'}
          </Text>
        </Pressable>

        {/* Show right panel toggle */}
        <View
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
              Show right side panel
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
              Optional image panel shown alongside the order items
            </Text>
          </View>
          <Switch
            checked={showCFDOrderingRightPanel}
            onCheckedChange={checked => updateField('showCFDOrderingRightPanel', checked)}
          />
        </View>

        {/* Right panel layout */}
        <View
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 8
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted }}>
            Right Panel Layout
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: 'Single Image', value: 'single' },
              { label: 'Stacked Images', value: 'stacked' }
            ].map(option => {
              const active = cfdOrderingRightPanelMode === option.value
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() =>
                    updateField(
                      'cfdOrderingRightPanelMode',
                      option.value as 'single' | 'stacked'
                    )
                  }
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? colors.teal + '50' : colors.border,
                    backgroundColor: active ? colors.teal + '15' : colors.screen
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      textAlign: 'center',
                      color: active ? colors.teal : colors.label
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Price display mode */}
        <View
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 8
          }}
        >
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
              Price Display Mode
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
              Which totals are shown on the ordering screen
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { label: 'Dual (card + cash)', value: 'dual' as const },
              { label: 'Card only', value: 'card_only' as const },
              { label: 'Cash only', value: 'cash_only' as const }
            ]).map(option => {
              const active =
                (selectedStore?.cfd_pricing_display_mode ?? 'dual') === option.value
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => handlePricingDisplayModeChange(option.value)}
                  disabled={isSavingPricingMode}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    paddingHorizontal: 6,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? colors.teal + '50' : colors.border,
                    backgroundColor: active ? colors.teal + '15' : colors.screen,
                    alignItems: 'center'
                  }}
                >
                  {isSavingPricingMode && active ? (
                    <ActivityIndicator size={12} color={colors.teal} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        textAlign: 'center',
                        color: active ? colors.teal : colors.label
                      }}
                    >
                      {option.label}
                    </Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </View>

      {/* Idle Carousel Images */}
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
            justifyContent: 'space-between',
            marginBottom: 8
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
              Idle Carousel Images
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
              Shown while the customer display is idle
            </Text>
          </View>
          <TouchableOpacity
            onPress={pickCarouselImage}
            disabled={carouselUploading}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: carouselUploading ? colors.border : colors.teal + '20',
              borderWidth: 1,
              borderColor: carouselUploading ? colors.border : colors.teal + '50',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 7
            }}
          >
            {carouselUploading ? (
              <ActivityIndicator size={12} color={colors.teal} />
            ) : (
              <Plus size={13} color={colors.teal} />
            )}
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: carouselUploading ? colors.muted : colors.teal
              }}
            >
              {carouselUploading ? 'Uploading...' : 'Add Image'}
            </Text>
          </TouchableOpacity>
        </View>

        {!carouselImages || carouselImages.length === 0 ? (
          <View
            style={{
              paddingVertical: 10,
              alignItems: 'center',
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.border,
              borderRadius: 8
            }}
          >
            <ImageIcon size={16} color={colors.muted} />
            <Text style={{ fontSize: 9, color: colors.muted, marginTop: 4 }}>
              No carousel images yet
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {carouselImages.map(img => (
              <View
                key={img.id}
                style={{
                  width: 104,
                  borderRadius: 8,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: img.is_active ? colors.teal + '50' : colors.border
                }}
              >
                <Image
                  source={{ uri: img.image_url }}
                  style={{ width: '100%', height: 58 }}
                  resizeMode='cover'
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 6,
                    paddingVertical: 5,
                    backgroundColor: colors.screen
                  }}
                >
                  <TouchableOpacity
                    onPress={() => toggleCarouselImage(img.id, img.is_active ?? true)}
                  >
                    <View
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 20,
                        backgroundColor: img.is_active ? colors.teal + '20' : colors.border,
                        borderWidth: 1,
                        borderColor: img.is_active ? colors.teal + '50' : colors.border
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: '600',
                          color: img.is_active ? colors.teal : colors.muted
                        }}
                      >
                        {img.is_active ? 'On' : 'Off'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setImageDeleteConfirm({ id: img.id, type: 'carousel' })}
                  >
                    <Trash2 size={13} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Ordering Right Panel Images */}
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
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
            Ordering Right Panel Images
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
            Shown on the ordering screen when the right panel is enabled
          </Text>
        </View>

        {[
          {
            title: 'Primary Slot',
            subtitle:
              cfdOrderingRightPanelMode === 'single'
                ? 'Used for single-image layout'
                : 'Used for the top image in stacked layout',
            slot: 'primary' as const,
            images: primaryOrderingPanelImages
          },
          {
            title: 'Secondary Slot',
            subtitle: 'Used for the bottom image in stacked layout',
            slot: 'secondary' as const,
            images: secondaryOrderingPanelImages
          }
        ]
          .filter(
            section => section.slot === 'primary' || cfdOrderingRightPanelMode === 'stacked'
          )
          .map(section => (
            <View
              key={section.slot}
              style={{
                marginTop: section.slot === 'primary' ? 0 : 12,
                paddingTop: section.slot === 'primary' ? 0 : 12,
                borderTopWidth: section.slot === 'primary' ? 0 : 1,
                borderTopColor: colors.border
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
                    {section.title}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
                    {section.subtitle}
                  </Text>
                  <Text
                    style={{ fontSize: 10, color: colors.teal, marginTop: 4, fontWeight: '600' }}
                  >
                    Crop:{' '}
                    {getOrderingPanelCropVariant(section.slot) === 'vertical'
                      ? 'Vertical 9:16'
                      : 'Half Panel 9:8'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    pickOrderingPanelImage(
                      section.slot,
                      getOrderingPanelCropVariant(section.slot)
                    )
                  }
                  disabled={orderingPanelUploadingSlot !== null}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor:
                      orderingPanelUploadingSlot === section.slot
                        ? colors.border
                        : colors.teal + '20',
                    borderWidth: 1,
                    borderColor:
                      orderingPanelUploadingSlot === section.slot
                        ? colors.border
                        : colors.teal + '50',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 7
                  }}
                >
                  {orderingPanelUploadingSlot === section.slot ? (
                    <ActivityIndicator size={12} color={colors.teal} />
                  ) : (
                    <Plus size={13} color={colors.teal} />
                  )}
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color:
                        orderingPanelUploadingSlot === section.slot
                          ? colors.muted
                          : colors.teal
                    }}
                  >
                    {orderingPanelUploadingSlot === section.slot
                      ? 'Uploading...'
                      : getOrderingPanelCropVariant(section.slot) === 'vertical'
                      ? 'Add Vertical'
                      : 'Add Half'}
                  </Text>
                </TouchableOpacity>
              </View>

              {section.images.length === 0 ? (
                <View
                  style={{
                    paddingVertical: 10,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.border,
                    borderRadius: 8
                  }}
                >
                  <ImageIcon size={16} color={colors.muted} />
                  <Text style={{ fontSize: 9, color: colors.muted, marginTop: 4 }}>
                    No images in this slot yet
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {section.images.map(img => (
                    <View
                      key={img.id}
                      style={{
                        width: 116,
                        borderRadius: 8,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: img.is_active ? colors.teal + '50' : colors.border
                      }}
                    >
                      <Image
                        source={{ uri: img.image_url }}
                        style={{
                          width: '100%',
                          height:
                            getOrderingPanelCropVariant(section.slot) === 'vertical' ? 180 : 98
                        }}
                        resizeMode='cover'
                      />
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingHorizontal: 6,
                          paddingVertical: 5,
                          backgroundColor: colors.screen
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => toggleOrderingPanelImage(img.id, img.is_active ?? true)}
                        >
                          <View
                            style={{
                              paddingHorizontal: 7,
                              paddingVertical: 3,
                              borderRadius: 20,
                              backgroundColor: img.is_active ? colors.teal + '20' : colors.border,
                              borderWidth: 1,
                              borderColor: img.is_active ? colors.teal + '50' : colors.border
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: '600',
                                color: img.is_active ? colors.teal : colors.muted
                              }}
                            >
                              {img.is_active ? 'On' : 'Off'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            setImageDeleteConfirm({ id: img.id, type: 'ordering' })
                          }
                        >
                          <Trash2 size={13} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
      </View>

      {/* Pairing Modal */}
      <Modal
        visible={showPairing}
        transparent
        animationType='fade'
        onRequestClose={() => setShowPairing(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.8)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16
          }}
        >
          <CFDPairingQR onClose={() => setShowPairing(false)} />
        </View>
      </Modal>

      {/* Disconnect Confirmation */}
      <Modal
        visible={disconnectConfirm !== null}
        transparent
        animationType='fade'
        onRequestClose={() => setDisconnectConfirm(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 20,
              width: '100%',
              maxWidth: 340,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: colors.heading,
                marginBottom: 8
              }}
            >
              Disconnect Display?
            </Text>
            <Text style={{ fontSize: 12, color: colors.label, marginBottom: 20 }}>
              The display at {disconnectConfirm ? extractIp(disconnectConfirm) : ''} will be
              disconnected.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setDisconnectConfirm(null)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 13, color: colors.label }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (disconnectConfirm) disconnectClient(disconnectConfirm)
                  setDisconnectConfirm(null)
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: colors.danger + '20',
                  borderWidth: 1,
                  borderColor: colors.danger + '50',
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>
                  Disconnect
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Delete Confirmation */}
      <Modal
        visible={imageDeleteConfirm !== null}
        transparent
        animationType='fade'
        onRequestClose={() => setImageDeleteConfirm(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 20,
              width: '100%',
              maxWidth: 340,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: colors.heading,
                marginBottom: 8
              }}
            >
              Delete Image?
            </Text>
            <Text style={{ fontSize: 12, color: colors.label, marginBottom: 20 }}>
              This image will be permanently removed.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setImageDeleteConfirm(null)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 13, color: colors.label }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!imageDeleteConfirm) return
                  if (imageDeleteConfirm.type === 'carousel') {
                    await deleteCarouselImage(imageDeleteConfirm.id)
                  } else {
                    await deleteOrderingPanelImage(imageDeleteConfirm.id)
                  }
                  setImageDeleteConfirm(null)
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: colors.danger + '20',
                  borderWidth: 1,
                  borderColor: colors.danger + '50',
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

export default CustomerDisplayScreen
