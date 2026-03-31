import { CFDPairingQR } from '@/components/cfd/CFDPairingQR'
import { CFDStatusBadge } from '@/components/cfd/CFDStatusBadge'
import { Switch } from '@/components/ui/switch'
import { useCFD } from '@/contexts/CFDProvider'
import { createSupabaseClient } from '@/lib/supabase'
import { colors } from '@/lib/theme'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { Station } from '@/types/station'
import { useAuth } from '@clerk/clerk-expo'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import * as ImagePicker from 'expo-image-picker'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  CreditCard,
  Image as ImageIcon,
  Monitor,
  Plus,
  Printer,
  RefreshCw,
  Shield,
  Smartphone,
  Trash2,
  User,
  Wifi,
  WifiOff
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

const StationsDevicesScreen = () => {
  const { getToken } = useAuth()
  const supabase = createSupabaseClient(getToken)
  const selectedStore = useStoreSettingsStore(state => state.selectedStore)
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

  // Fetch carousel images
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
    } catch (err) {
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
    } catch (err) {
      Alert.alert('Error', 'Failed to upload image')
    } finally {
      setOrderingPanelUploadingSlot(null)
    }
  }

  const deleteCarouselImage = async (id: string, _imageUrl: string) => {
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
    cfdOrderingRightPanelMode === 'single' && panelSlot === 'primary'
      ? 'vertical'
      : 'half'

  const extractIp = (clientId: string) => clientId.substring(0, clientId.lastIndexOf(':'))

  const [expandedSections, setExpandedSections] = useState({
    stations: true,
    terminals: true
  })

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Fetch stations with payment terminal data
  const {
    data: stations,
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['stations-with-terminals', selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return []

      const { data, error } = await supabase.rpc(
        'get_location_stations_with_status',
        {
          p_location_id: selectedStore.id
        }
      )

      if (error) throw error
      return (data as Station[]) || []
    },
    enabled: !!selectedStore?.id,
    staleTime: 30000,
    refetchInterval: 30000
  })

  const renderSectionHeader = (
    icon: React.ReactNode,
    title: string,
    subtitle: string,
    sectionKey: keyof typeof expandedSections
  ) => {
    const isExpanded = expandedSections[sectionKey]
    return (
      <TouchableOpacity
        onPress={() => toggleSection(sectionKey)}
        style={{
          backgroundColor: colors.panel,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: colors.teal + '15',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
            >
              {title}
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
              {subtitle}
            </Text>
          </View>
        </View>
        {isExpanded ? (
          <ChevronUp size={14} color={colors.label} />
        ) : (
          <ChevronDown size={14} color={colors.label} />
        )}
      </TouchableOpacity>
    )
  }

  const renderCapabilityBadge = (label: string, enabled?: boolean) => {
    if (enabled === undefined) return null

    return (
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 20,
          backgroundColor: enabled ? colors.teal + '20' : colors.border + '80',
          borderWidth: 1,
          borderColor: enabled ? colors.teal + '50' : colors.border
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: '600',
            color: enabled ? colors.teal : colors.muted
          }}
        >
          {label}
        </Text>
      </View>
    )
  }

  const renderStationCard = (station: Station) => {
    const isOnline = station.is_online
    const isAvailable = station.is_available

    return (
      <View
        key={station.id}
        style={{
          backgroundColor: colors.screen,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 8
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.teal + '15',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8
              }}
            >
              <Monitor size={16} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  {station.station_name}
                </Text>
                {station.station_number > 0 && (
                  <View
                    style={{
                      marginLeft: 6,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      borderRadius: 20
                    }}
                  >
                    <Text style={{ fontSize: 10, color: colors.label }}>
                      #{station.station_number}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                {station.station_type.charAt(0).toUpperCase() +
                  station.station_type.slice(1)}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 4
              }}
            >
              {isOnline ? (
                <Wifi size={13} color={colors.teal} />
              ) : (
                <WifiOff size={13} color={colors.muted} />
              )}
              <Text
                style={{
                  fontSize: 11,
                  marginLeft: 4,
                  color: isOnline ? colors.teal : colors.muted
                }}
              >
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {isAvailable ? (
                <CheckCircle2 size={13} color={colors.teal} />
              ) : (
                <AlertCircle size={13} color={colors.label} />
              )}
              <Text
                style={{
                  fontSize: 11,
                  marginLeft: 4,
                  color: isAvailable ? colors.teal : colors.label
                }}
              >
                {isAvailable ? 'Available' : 'In Use'}
              </Text>
            </View>
          </View>
        </View>

        {!isAvailable && station.current_session && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 10,
              paddingHorizontal: 8,
              paddingVertical: 6,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8
            }}
          >
            <User size={12} color={colors.label} />
            <Text style={{ fontSize: 11, color: colors.label, marginLeft: 6 }}>
              In use by {station.current_session.staff_name}
              {station.current_session.device_name && ` on ${station.current_session.device_name}`}
            </Text>
          </View>
        )}

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: 10,
            marginBottom: 10
          }}
        >
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>
            View Scope
          </Text>
          <View>
            {(() => {
              const scopeColor =
                station.view_scope === 'own'
                  ? colors.info
                  : station.view_scope === 'location'
                  ? colors.teal
                  : colors.teal
              const scopeLabel =
                station.view_scope === 'own'
                  ? 'Own Orders Only'
                  : station.view_scope === 'location'
                  ? 'All Location Orders'
                  : 'Online Orders'
              return (
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    borderRadius: 20,
                    alignSelf: 'flex-start',
                    backgroundColor: scopeColor + '20',
                    borderWidth: 1,
                    borderColor: scopeColor + '50'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: scopeColor
                    }}
                  >
                    {scopeLabel}
                  </Text>
                </View>
              )
            })()}
          </View>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: 10,
            marginBottom: 10
          }}
        >
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>
            Capabilities
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {renderCapabilityBadge('Create Orders', station.can_create_orders)}
            {renderCapabilityBadge(
              'Process Payments',
              station.can_process_payments
            )}
            {renderCapabilityBadge('Void Orders', station.can_void_orders)}
            {renderCapabilityBadge(
              'Apply Discounts',
              station.can_apply_discounts
            )}
            {renderCapabilityBadge(
              'Update Kitchen',
              station.can_update_kitchen_status
            )}
          </View>
        </View>

        {/* Device Health Section */}
        {(station.device_manufacturer ||
          station.hardware_model ||
          station.last_heartbeat_at) && (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 10,
              marginBottom: 10
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 8
              }}
            >
              <Smartphone size={13} color={colors.label} />
              <Text
                style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}
              >
                Device Health
              </Text>
            </View>
            <View
              style={{
                backgroundColor: colors.panel,
                padding: 10,
                borderRadius: 8,
                gap: 6
              }}
            >
              {station.hardware_model && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    Hardware
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.heading }}>
                    {station.device_manufacturer &&
                      `${station.device_manufacturer} `}
                    {station.hardware_model || station.device_model}
                  </Text>
                </View>
              )}
              {station.last_heartbeat_at && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    Last Heartbeat
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.heading }}>
                    {formatDistanceToNow(new Date(station.last_heartbeat_at), {
                      addSuffix: true
                    })}
                  </Text>
                </View>
              )}
              {station.network_type && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    Network
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Wifi size={10} color={colors.label} />
                    <Text style={{ fontSize: 11, color: colors.heading }}>
                      {station.network_type}
                    </Text>
                  </View>
                </View>
              )}
              {station.app_version && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    App Version
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.heading }}>
                    v{station.app_version}
                  </Text>
                </View>
              )}
              {/* Hardware capability badges */}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 2
                }}
              >
                {station.has_builtin_printer && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 20,
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Printer size={9} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Printer
                    </Text>
                  </View>
                )}
                {station.has_builtin_cfd && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 20,
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Monitor size={9} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      CFD
                    </Text>
                  </View>
                )}
                {station.has_nfc && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 20,
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Cpu size={9} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      NFC
                    </Text>
                  </View>
                )}
                {station.has_cash_drawer_port && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 20,
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <CreditCard size={9} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Cash Drawer
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {station.payment_terminal && (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 10
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 8
              }}
            >
              <CreditCard size={13} color={colors.label} />
              <Text
                style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}
              >
                Linked Payment Terminal
              </Text>
            </View>
            <View
              style={{
                backgroundColor: colors.panel,
                padding: 10,
                borderRadius: 8
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.heading
                }}
              >
                {station.payment_terminal.terminal_name}
              </Text>
              {station.payment_terminal.register_id && (
                <Text
                  style={{ fontSize: 11, color: colors.label, marginTop: 2 }}
                >
                  Register: {station.payment_terminal.register_id}
                </Text>
              )}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 8
                }}
              >
                {station.payment_terminal.is_connected ? (
                  <>
                    <CheckCircle2 size={12} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.teal,
                        marginLeft: 4
                      }}
                    >
                      Connected
                    </Text>
                  </>
                ) : (
                  <>
                    <AlertCircle size={12} color={colors.danger} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.danger,
                        marginLeft: 4
                      }}
                    >
                      Disconnected
                    </Text>
                  </>
                )}
                {station.payment_terminal.last_connection_test_at && (
                  <Text
                    style={{ fontSize: 10, color: colors.muted, marginLeft: 8 }}
                  >
                    Last test:{' '}
                    {formatDistanceToNow(
                      new Date(
                        station.payment_terminal.last_connection_test_at
                      ),
                      { addSuffix: true }
                    )}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    )
  }

  const renderTerminalCard = (station: Station) => {
    if (!station.payment_terminal) return null

    const terminal = station.payment_terminal

    return (
      <View
        key={terminal.id}
        style={{
          backgroundColor: colors.screen,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 8
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: terminal.is_connected
                  ? colors.teal + '20'
                  : colors.danger + '20',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8
              }}
            >
              <CreditCard
                size={16}
                color={terminal.is_connected ? colors.teal : colors.danger}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {terminal.terminal_name}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                {terminal.terminal_type.charAt(0).toUpperCase() +
                  terminal.terminal_type.slice(1)}
                {terminal.terminal_model && ` • ${terminal.terminal_model}`}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {terminal.is_connected ? (
              <>
                <CheckCircle2 size={16} color={colors.teal} />
                <Text
                  style={{ fontSize: 10, color: colors.teal, marginTop: 3 }}
                >
                  Connected
                </Text>
              </>
            ) : (
              <>
                <AlertCircle size={16} color={colors.danger} />
                <Text
                  style={{ fontSize: 10, color: colors.danger, marginTop: 3 }}
                >
                  Offline
                </Text>
              </>
            )}
          </View>
        </View>

        <View
          style={{
            backgroundColor: colors.panel,
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 10,
            gap: 6
          }}
        >
          {terminal.register_id && (
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text style={{ fontSize: 11, color: colors.label }}>
                Register ID
              </Text>
              <Text style={{ fontSize: 11, color: colors.heading }}>
                {terminal.register_id}
              </Text>
            </View>
          )}
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 11, color: colors.label }}>
              Linked Station
            </Text>
            <Text style={{ fontSize: 11, color: colors.heading }}>
              {station.station_name}
            </Text>
          </View>
        </View>

        {terminal.last_connection_status && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 10
            }}
          >
            <Text style={{ fontSize: 11, color: colors.label }}>Status: </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color:
                  terminal.last_connection_status === 'Online'
                    ? colors.teal
                    : terminal.last_connection_status === 'Offline'
                    ? colors.danger
                    : colors.label
              }}
            >
              {terminal.last_connection_status}
            </Text>
            {terminal.last_connection_test_at && (
              <Text
                style={{ fontSize: 10, color: colors.muted, marginLeft: 8 }}
              >
                •{' '}
                {formatDistanceToNow(
                  new Date(terminal.last_connection_test_at),
                  { addSuffix: true }
                )}
              </Text>
            )}
          </View>
        )}

        <View
          style={{
            backgroundColor: colors.teal + '10',
            borderWidth: 1,
            borderColor: colors.teal + '30',
            padding: 10,
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center'
          }}
        >
          <Shield size={14} color={colors.teal} />
          <Text
            style={{ fontSize: 11, color: colors.teal, marginLeft: 8, flex: 1 }}
          >
            Auth credentials encrypted and accessed securely during payment
            processing
          </Text>
        </View>
      </View>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          paddingHorizontal: 14,
          paddingVertical: 10
        }}
      >
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 80
          }}
        >
          <ActivityIndicator size='large' color={colors.teal} />
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 12 }}>
            Loading stations...
          </Text>
        </View>
      </ScrollView>
    )
  }

  // Error state
  if (error) {
    return (
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          paddingHorizontal: 14,
          paddingVertical: 10
        }}
      >
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 80
          }}
        >
          <AlertCircle size={40} color={colors.danger} />
          <Text
            style={{
              fontSize: 14,
              color: colors.danger,
              textAlign: 'center',
              marginTop: 12
            }}
          >
            Failed to load stations
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
              marginTop: 4,
              textAlign: 'center'
            }}
          >
            {(error as Error).message || 'Please try again later'}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={{
              marginTop: 14,
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        paddingBottom: 12
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
          >
            Stations & Devices
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
            View stations, capabilities, and linked payment terminals
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          style={{
            marginLeft: 12,
            padding: 7,
            borderRadius: 8,
            backgroundColor: isRefetching ? colors.border : colors.teal + '20',
            borderWidth: 1,
            borderColor: isRefetching ? colors.border : colors.teal + '50'
          }}
        >
          <RefreshCw
            size={14}
            color={isRefetching ? colors.muted : colors.teal}
            style={isRefetching ? { opacity: 0.5 } : undefined}
          />
        </TouchableOpacity>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }}
      />

      {/* CFD Section */}
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
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Customer Display
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted }}>
                Show order details to customers
              </Text>
            </View>
          </View>
          <CFDStatusBadge onPress={() => setShowPairing(true)} />
        </View>

        {/* Connected Displays List */}
        {connectedClientIds.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontWeight: '600' }}>
              Connected Displays
            </Text>
            {connectedClientIds.map((clientId) => (
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

        {/* Connect Display Button */}
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
              Controls the optional right panel on the ordering customer display
            </Text>
          </View>
          <Switch
            checked={showCFDOrderingRightPanel}
            onCheckedChange={(checked) =>
              updateField('showCFDOrderingRightPanel', checked)
            }
          />
        </View>

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
        <View
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 10
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
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
              {carouselUploading
                ? <ActivityIndicator size={12} color={colors.teal} />
                : <Plus size={13} color={colors.teal} />
              }
              <Text style={{ fontSize: 11, fontWeight: '600', color: carouselUploading ? colors.muted : colors.teal }}>
                {carouselUploading ? 'Uploading...' : 'Add Image'}
              </Text>
            </TouchableOpacity>
          </View>

          {!carouselImages || carouselImages.length === 0 ? (
            <View style={{ paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8 }}>
              <ImageIcon size={16} color={colors.muted} />
              <Text style={{ fontSize: 9, color: colors.muted, marginTop: 4 }}>No carousel images yet</Text>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 5, backgroundColor: colors.screen }}>
                    <TouchableOpacity onPress={() => toggleCarouselImage(img.id, img.is_active ?? true)}>
                      <View style={{
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 20,
                        backgroundColor: img.is_active ? colors.teal + '20' : colors.border,
                        borderWidth: 1,
                        borderColor: img.is_active ? colors.teal + '50' : colors.border
                      }}>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: img.is_active ? colors.teal : colors.muted }}>
                          {img.is_active ? 'On' : 'Off'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  <TouchableOpacity onPress={() => setImageDeleteConfirm({ id: img.id, type: 'carousel' })}>
                    <Trash2 size={13} color={colors.danger} />
                  </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 10
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
            subtitle: cfdOrderingRightPanelMode === 'single'
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
          .filter(section =>
            section.slot === 'primary' || cfdOrderingRightPanelMode === 'stacked'
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
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
                    {section.title}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
                    {section.subtitle}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.teal, marginTop: 4, fontWeight: '600' }}>
                    Crop: {getOrderingPanelCropVariant(section.slot) === 'vertical' ? 'Vertical 9:16' : 'Half Panel 9:8'}
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
                  {orderingPanelUploadingSlot === section.slot
                    ? <ActivityIndicator size={12} color={colors.teal} />
                    : <Plus size={13} color={colors.teal} />
                  }
                  <Text style={{ fontSize: 11, fontWeight: '600', color: orderingPanelUploadingSlot === section.slot ? colors.muted : colors.teal }}>
                    {orderingPanelUploadingSlot === section.slot
                      ? 'Uploading...'
                      : getOrderingPanelCropVariant(section.slot) === 'vertical'
                        ? 'Add Vertical'
                        : 'Add Half'}
                  </Text>
                </TouchableOpacity>
              </View>

              {section.images.length === 0 ? (
                <View style={{ paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8 }}>
                  <ImageIcon size={16} color={colors.muted} />
                  <Text style={{ fontSize: 9, color: colors.muted, marginTop: 4 }}>
                    No images in this slot yet
                  </Text>
                </View>
              ) : (
                <>
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
                            getOrderingPanelCropVariant(section.slot) === 'vertical'
                              ? 180
                              : 98
                        }}
                        resizeMode='cover'
                      />
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 5, backgroundColor: colors.screen }}>
                        <TouchableOpacity onPress={() => toggleOrderingPanelImage(img.id, img.is_active ?? true)}>
                          <View style={{
                            paddingHorizontal: 7,
                            paddingVertical: 3,
                            borderRadius: 20,
                            backgroundColor: img.is_active ? colors.teal + '20' : colors.border,
                            borderWidth: 1,
                            borderColor: img.is_active ? colors.teal + '50' : colors.border
                          }}>
                            <Text style={{ fontSize: 9, fontWeight: '600', color: img.is_active ? colors.teal : colors.muted }}>
                              {img.is_active ? 'On' : 'Off'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setImageDeleteConfirm({ id: img.id, type: 'ordering' })}>
                          <Trash2 size={13} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
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

      {/* Stations Section */}
      {stations && stations.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          {renderSectionHeader(
            <Monitor size={14} color={colors.teal} />,
            'Stations',
            `${stations.length} station${
              stations.length !== 1 ? 's' : ''
            } registered`,
            'stations'
          )}
          {expandedSections.stations && (
            <View
              style={{
                backgroundColor: colors.panel,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: colors.border,
                padding: 12
              }}
            >
              {stations.map(renderStationCard)}
            </View>
          )}
        </View>
      )}

      {/* Terminals Section */}
      {stations && stations.some(s => s.payment_terminal) && (
        <View style={{ marginBottom: 10 }}>
          {renderSectionHeader(
            <CreditCard size={14} color={colors.teal} />,
            'Payment Terminals',
            `${stations.filter(s => s.payment_terminal).length} terminal${
              stations.filter(s => s.payment_terminal).length !== 1 ? 's' : ''
            } linked`,
            'terminals'
          )}
          {expandedSections.terminals && (
            <View
              style={{
                backgroundColor: colors.panel,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: colors.border,
                padding: 12
              }}
            >
              {stations.filter(s => s.payment_terminal).map(renderTerminalCard)}
            </View>
          )}
        </View>
      )}

      {/* Security Notice */}
      <View
        style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          borderRadius: 12,
          marginTop: 8
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
        >
          <Shield size={16} color={colors.teal} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: colors.teal,
                marginBottom: 4
              }}
            >
              Security & Encryption
            </Text>
            <Text style={{ fontSize: 10, color: colors.label, lineHeight: 14 }}>
              All payment terminal auth keys are encrypted in the database using
              PGP encryption and are only decrypted in memory during payment
              processing. Credentials are never stored persistently on devices.
            </Text>
          </View>
        </View>
      </View>

      {/* Disconnect Confirmation Dialog */}
      <Modal
        visible={disconnectConfirm !== null}
        transparent
        animationType='fade'
        onRequestClose={() => setDisconnectConfirm(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              width: '100%',
              maxWidth: 340,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            {/* Icon */}
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: colors.danger + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10
                }}
              >
                <AlertCircle size={22} color={colors.danger} strokeWidth={2} />
              </View>

              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: colors.heading,
                  marginBottom: 6,
                  textAlign: 'center'
                }}
              >
                Disconnect Display?
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.label,
                  textAlign: 'center',
                  lineHeight: 18
                }}
              >
                This will disconnect the customer display at {disconnectConfirm ? extractIp(disconnectConfirm) : ''}.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                onPress={() => setDisconnectConfirm(null)}
                style={{
                  flex: 1,
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 13, color: colors.label, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (disconnectConfirm) {
                    disconnectClient(disconnectConfirm)
                    setDisconnectConfirm(null)
                  }
                }}
                style={{
                  flex: 1,
                  backgroundColor: colors.danger + '20',
                  borderWidth: 1,
                  borderColor: colors.danger + '50',
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 13, color: colors.danger, fontWeight: '600' }}>
                  Disconnect
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={imageDeleteConfirm !== null}
        transparent
        animationType='fade'
        onRequestClose={() => setImageDeleteConfirm(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              width: '100%',
              maxWidth: 340,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: colors.danger + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10
                }}
              >
                <Trash2 size={20} color={colors.danger} strokeWidth={2} />
              </View>

              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: colors.heading,
                  marginBottom: 6,
                  textAlign: 'center'
                }}
              >
                Delete Image?
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.label,
                  textAlign: 'center'
                }}
              >
                This will permanently remove the image from the customer display configuration.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setImageDeleteConfirm(null)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  backgroundColor: colors.screen
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  if (!imageDeleteConfirm) return
                  const pending = imageDeleteConfirm
                  setImageDeleteConfirm(null)
                  if (pending.type === 'carousel') {
                    await deleteCarouselImage(pending.id, '')
                  } else {
                    await deleteOrderingPanelImage(pending.id)
                  }
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: colors.danger + '20',
                  borderWidth: 1,
                  borderColor: colors.danger + '40'
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>
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

export default StationsDevicesScreen
