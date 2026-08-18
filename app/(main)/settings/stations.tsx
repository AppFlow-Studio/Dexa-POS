import { createSupabaseClient } from '@/lib/supabase'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useOrderStore } from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { isSerialMismatch } from '@/services/terminals/terminalIdentity'
import { Station, StationViewScope } from '@/types/station'
import { useAuth } from '@clerk/clerk-expo'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  CreditCard,
  Eye,
  Monitor,
  Printer,
  RefreshCw,
  Shield,
  Smartphone,
  User,
  Wifi,
  WifiOff
} from 'lucide-react-native'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

const StationsScreen = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const { getToken } = useAuth()
  const supabase = createSupabaseClient(getToken)
  const selectedStore = useStoreSettingsStore(state => state.selectedStore)
  const selectedStation = useStoreSettingsStore(state => state.selectedStation)
  const setSelectedStation = useStoreSettingsStore(state => state.setSelectedStation)

  const [viewScopeUpdating, setViewScopeUpdating] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    stations: true,
    terminals: true
  })

  const toggleSection = (section: keyof typeof expandedSections) =>
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))

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
        { p_location_id: selectedStore.id }
      )
      if (error) throw error
      return (data as Station[]) || []
    },
    enabled: !!selectedStore?.id,
    staleTime: 30000,
    refetchInterval: 30000
  })

  const handleViewScopeChange = async (newScope: StationViewScope) => {
    if (!selectedStation || selectedStation.view_scope === newScope) return
    setViewScopeUpdating(true)
    try {
      const { error: updateError } = await supabase
        .from('stations')
        .update({ view_scope: newScope })
        .eq('id', selectedStation.id)
      if (updateError) {
        Alert.alert('Error', 'Failed to update view scope')
        return
      }

      const updatedStation = { ...selectedStation, view_scope: newScope }
      setSelectedStation(updatedStation)

      const stationForOrderStore: Station = {
        id: updatedStation.id,
        station_name: updatedStation.station_name,
        station_type: updatedStation.station_type as Station['station_type'],
        station_number: updatedStation.station_number,
        is_active: true,
        is_available: true,
        current_session: null,
        view_scope: newScope,
        can_create_orders: updatedStation.can_create_orders,
        can_process_payments: updatedStation.can_process_payments,
        can_void_orders: updatedStation.can_void_orders,
        can_apply_discounts: updatedStation.can_apply_discounts,
        can_update_kitchen_status: updatedStation.can_update_kitchen_status
      }
      useOrderStore.getState().setCurrentStation(stationForOrderStore)

      if (newScope === 'location') {
        await useOrderStore.getState().fetchVisibleOrders()
      }
      refetch()
    } catch {
      Alert.alert('Error', 'Failed to update view scope')
    } finally {
      setViewScopeUpdating(false)
    }
  }

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
          paddingHorizontal: s(14),
          paddingVertical: s(11),
          borderTopLeftRadius: s(12),
          borderTopRightRadius: s(12),
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
              width: s(32),
              height: s(32),
              borderRadius: s(8),
              backgroundColor: colors.teal + '15',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: s(8)
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>
              {title}
            </Text>
            <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
              {subtitle}
            </Text>
          </View>
        </View>
        {isExpanded ? (
          <ChevronUp size={s(14)} color={colors.label} />
        ) : (
          <ChevronDown size={s(14)} color={colors.label} />
        )}
      </TouchableOpacity>
    )
  }

  const renderCapabilityBadge = (label: string, enabled?: boolean) => {
    if (enabled === undefined) return null
    return (
      <View
        style={{
          paddingHorizontal: s(8),
          paddingVertical: s(3),
          borderRadius: s(20),
          backgroundColor: enabled ? colors.teal + '20' : colors.border + '80',
          borderWidth: 1,
          borderColor: enabled ? colors.teal + '50' : colors.border
        }}
      >
        <Text
          style={{
            fontSize: s(10),
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
          padding: s(12),
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: s(8)
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: s(10)
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View
              style={{
                width: s(32),
                height: s(32),
                borderRadius: s(8),
                backgroundColor: colors.teal + '15',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: s(8)
              }}
            >
              <Monitor size={s(16)} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>
                  {station.station_name}
                </Text>
                {station.station_number > 0 && (
                  <View
                    style={{
                      marginLeft: s(6),
                      paddingHorizontal: s(6),
                      paddingVertical: s(2),
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      borderRadius: s(20)
                    }}
                  >
                    <Text style={{ fontSize: s(10), color: colors.label }}>
                      #{station.station_number}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
                {station.station_type.charAt(0).toUpperCase() +
                  station.station_type.slice(1)}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(4) }}>
              {isOnline ? (
                <Wifi size={s(13)} color={colors.teal} />
              ) : (
                <WifiOff size={s(13)} color={colors.muted} />
              )}
              <Text
                style={{
                  fontSize: s(11),
                  marginLeft: s(4),
                  color: isOnline ? colors.teal : colors.muted
                }}
              >
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {isAvailable ? (
                <CheckCircle2 size={s(13)} color={colors.teal} />
              ) : (
                <AlertCircle size={s(13)} color={colors.label} />
              )}
              <Text
                style={{
                  fontSize: s(11),
                  marginLeft: s(4),
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
              marginBottom: s(10),
              paddingHorizontal: s(8),
              paddingVertical: s(6),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(8)
            }}
          >
            <User size={s(12)} color={colors.label} />
            <Text style={{ fontSize: s(11), color: colors.label, marginLeft: s(6) }}>
              In use by {station.current_session.staff_name}
              {station.current_session.device_name &&
                ` on ${station.current_session.device_name}`}
            </Text>
          </View>
        )}

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: s(10),
            marginBottom: s(10)
          }}
        >
          <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(6) }}>
            View Scope
          </Text>
          {(() => {
            const scopeColor =
              station.view_scope === 'own'
                ? colors.info
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
                  paddingHorizontal: s(10),
                  paddingVertical: s(3),
                  borderRadius: s(20),
                  alignSelf: 'flex-start',
                  backgroundColor: scopeColor + '20',
                  borderWidth: 1,
                  borderColor: scopeColor + '50'
                }}
              >
                <Text style={{ fontSize: s(10), fontWeight: '600', color: scopeColor }}>
                  {scopeLabel}
                </Text>
              </View>
            )
          })()}
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: s(10),
            marginBottom: s(10)
          }}
        >
          <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(8) }}>
            Capabilities
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6) }}>
            {renderCapabilityBadge('Create Orders', station.can_create_orders)}
            {renderCapabilityBadge('Process Payments', station.can_process_payments)}
            {renderCapabilityBadge('Void Orders', station.can_void_orders)}
            {renderCapabilityBadge('Apply Discounts', station.can_apply_discounts)}
            {renderCapabilityBadge('Update Kitchen', station.can_update_kitchen_status)}
          </View>
        </View>

        {(station.device_manufacturer ||
          station.hardware_model ||
          station.last_heartbeat_at) && (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: s(10),
              marginBottom: s(10)
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(8) }}>
              <Smartphone size={s(13)} color={colors.label} />
              <Text style={{ fontSize: s(11), color: colors.muted, marginLeft: s(6) }}>
                Device Health
              </Text>
            </View>
            <View
              style={{
                backgroundColor: colors.panel,
                padding: s(10),
                borderRadius: s(8),
                gap: s(6)
              }}
            >
              {station.hardware_model && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: s(11), color: colors.label }}>Hardware</Text>
                  <Text style={{ fontSize: s(11), color: colors.heading }}>
                    {station.device_manufacturer && `${station.device_manufacturer} `}
                    {station.hardware_model || station.device_model}
                  </Text>
                </View>
              )}
              {station.last_heartbeat_at && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: s(11), color: colors.label }}>Last Heartbeat</Text>
                  <Text style={{ fontSize: s(11), color: colors.heading }}>
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
                  <Text style={{ fontSize: s(11), color: colors.label }}>Network</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
                    <Wifi size={s(10)} color={colors.label} />
                    <Text style={{ fontSize: s(11), color: colors.heading }}>
                      {station.network_type}
                    </Text>
                  </View>
                </View>
              )}
              {station.app_version && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: s(11), color: colors.label }}>App Version</Text>
                  <Text style={{ fontSize: s(11), color: colors.heading }}>
                    v{station.app_version}
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6), marginTop: s(2) }}>
                {station.has_builtin_printer && (
                  <View
                    style={{
                      paddingHorizontal: s(8),
                      paddingVertical: s(3),
                      borderRadius: s(20),
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(4)
                    }}
                  >
                    <Printer size={s(9)} color={colors.teal} />
                    <Text style={{ fontSize: s(10), fontWeight: '600', color: colors.teal }}>
                      Printer
                    </Text>
                  </View>
                )}
                {station.has_builtin_cfd && (
                  <View
                    style={{
                      paddingHorizontal: s(8),
                      paddingVertical: s(3),
                      borderRadius: s(20),
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(4)
                    }}
                  >
                    <Monitor size={s(9)} color={colors.teal} />
                    <Text style={{ fontSize: s(10), fontWeight: '600', color: colors.teal }}>
                      CFD
                    </Text>
                  </View>
                )}
                {station.has_nfc && (
                  <View
                    style={{
                      paddingHorizontal: s(8),
                      paddingVertical: s(3),
                      borderRadius: s(20),
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(4)
                    }}
                  >
                    <Cpu size={s(9)} color={colors.teal} />
                    <Text style={{ fontSize: s(10), fontWeight: '600', color: colors.teal }}>
                      NFC
                    </Text>
                  </View>
                )}
                {station.has_cash_drawer_port && (
                  <View
                    style={{
                      paddingHorizontal: s(8),
                      paddingVertical: s(3),
                      borderRadius: s(20),
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(4)
                    }}
                  >
                    <CreditCard size={s(9)} color={colors.teal} />
                    <Text style={{ fontSize: s(10), fontWeight: '600', color: colors.teal }}>
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
              paddingTop: s(10)
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(8) }}>
              <CreditCard size={s(13)} color={colors.label} />
              <Text style={{ fontSize: s(11), color: colors.muted, marginLeft: s(6) }}>
                Linked Payment Terminal
              </Text>
            </View>
            <View style={{ backgroundColor: colors.panel, padding: s(10), borderRadius: s(8) }}>
              <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}>
                {station.payment_terminal.terminal_name}
              </Text>
              {station.payment_terminal.register_id && (
                <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(2) }}>
                  Register: {station.payment_terminal.register_id}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: s(8) }}>
                {station.payment_terminal.is_connected ? (
                  <>
                    <CheckCircle2 size={s(12)} color={colors.teal} />
                    <Text style={{ fontSize: s(11), color: colors.teal, marginLeft: s(4) }}>
                      Connected
                    </Text>
                  </>
                ) : (
                  <>
                    <AlertCircle size={s(12)} color={colors.danger} />
                    <Text style={{ fontSize: s(11), color: colors.danger, marginLeft: s(4) }}>
                      Disconnected
                    </Text>
                  </>
                )}
                {station.payment_terminal.last_connection_test_at && (
                  <Text style={{ fontSize: s(10), color: colors.muted, marginLeft: s(8) }}>
                    Last test:{' '}
                    {formatDistanceToNow(
                      new Date(station.payment_terminal.last_connection_test_at),
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
          padding: s(12),
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: s(8)
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: s(10)
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View
              style={{
                width: s(32),
                height: s(32),
                borderRadius: s(8),
                backgroundColor: terminal.is_connected
                  ? colors.teal + '20'
                  : colors.danger + '20',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: s(8)
              }}
            >
              <CreditCard
                size={s(16)}
                color={terminal.is_connected ? colors.teal : colors.danger}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>
                {terminal.terminal_name}
              </Text>
              <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
                {terminal.terminal_type.charAt(0).toUpperCase() +
                  terminal.terminal_type.slice(1)}
                {terminal.terminal_model && ` • ${terminal.terminal_model}`}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {terminal.is_connected ? (
              <>
                <CheckCircle2 size={s(16)} color={colors.teal} />
                <Text style={{ fontSize: s(10), color: colors.teal, marginTop: s(3) }}>
                  Connected
                </Text>
              </>
            ) : (
              <>
                <AlertCircle size={s(16)} color={colors.danger} />
                <Text style={{ fontSize: s(10), color: colors.danger, marginTop: s(3) }}>
                  Offline
                </Text>
              </>
            )}
          </View>
        </View>

        <View
          style={{
            backgroundColor: colors.panel,
            padding: s(10),
            borderRadius: s(8),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(10),
            gap: s(6)
          }}
        >
          {terminal.register_id && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: s(11), color: colors.label }}>Register ID</Text>
              <Text style={{ fontSize: s(11), color: colors.heading }}>
                {terminal.register_id}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: s(11), color: colors.label }}>Linked Station</Text>
            <Text style={{ fontSize: s(11), color: colors.heading }}>
              {station.station_name}
            </Text>
          </View>
        </View>

        {isSerialMismatch(terminal.last_connection_status) ? (
          // Identity mismatch is a security signal, not a routine status — the
          // device answering at this address reports a different serial than the
          // one registered. Surface it prominently (parity with the Devices card)
          // rather than as plain gray text.
          <View
            style={{
              marginBottom: s(10),
              padding: s(8),
              borderRadius: s(6),
              backgroundColor: colors.danger + '15',
              borderWidth: 1,
              borderColor: colors.danger + '55',
              gap: s(2)
            }}
          >
            <Text
              style={{ fontSize: s(11), fontWeight: '700', color: colors.danger }}
            >
              ⚠ Identity mismatch — different device
            </Text>
            <Text style={{ fontSize: s(10), color: colors.danger }}>
              This address reports a different serial than the registered one.
              If you swapped hardware, register the replacement as a new terminal.
            </Text>
            {terminal.last_connection_test_at && (
              <Text style={{ fontSize: s(9), color: colors.muted }}>
                Detected{' '}
                {formatDistanceToNow(new Date(terminal.last_connection_test_at), {
                  addSuffix: true
                })}
              </Text>
            )}
          </View>
        ) : (
          terminal.last_connection_status && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(10) }}>
              <Text style={{ fontSize: s(11), color: colors.label }}>Status: </Text>
              <Text
                style={{
                  fontSize: s(11),
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
                <Text style={{ fontSize: s(10), color: colors.muted, marginLeft: s(8) }}>
                  •{' '}
                  {formatDistanceToNow(new Date(terminal.last_connection_test_at), {
                    addSuffix: true
                  })}
                </Text>
              )}
            </View>
          )
        )}

        <View
          style={{
            backgroundColor: colors.teal + '10',
            borderWidth: 1,
            borderColor: colors.teal + '30',
            padding: s(10),
            borderRadius: s(8),
            flexDirection: 'row',
            alignItems: 'center'
          }}
        >
          <Shield size={s(14)} color={colors.teal} />
          <Text style={{ fontSize: s(11), color: colors.teal, marginLeft: s(8), flex: 1 }}>
            Auth credentials encrypted and accessed securely during payment processing
          </Text>
        </View>
      </View>
    )
  }

  if (isLoading) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: s(14), paddingVertical: s(10) }}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: s(80) }}>
          <ActivityIndicator size='large' color={colors.teal} />
          <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(12) }}>
            Loading stations...
          </Text>
        </View>
      </ScrollView>
    )
  }

  if (error) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: s(14), paddingVertical: s(10) }}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: s(80) }}>
          <AlertCircle size={s(40)} color={colors.danger} />
          <Text style={{ fontSize: s(14), color: colors.danger, textAlign: 'center', marginTop: s(12) }}>
            Failed to load stations
          </Text>
          <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(4), textAlign: 'center' }}>
            {(error as Error).message || 'Please try again later'}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={{
              marginTop: s(14),
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50',
              paddingHorizontal: s(16),
              paddingVertical: s(8),
              borderRadius: s(8)
            }}
          >
            <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.teal }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{ paddingHorizontal: s(14), paddingVertical: s(10), paddingBottom: s(24) }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: s(10)
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}>
            Stations
          </Text>
          <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(1) }}>
            Manage stations, view scopes, and linked payment terminals
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          style={{
            marginLeft: s(12),
            padding: s(7),
            borderRadius: s(8),
            backgroundColor: isRefetching ? colors.border : colors.teal + '20',
            borderWidth: 1,
            borderColor: isRefetching ? colors.border : colors.teal + '50'
          }}
        >
          <RefreshCw
            size={s(14)}
            color={isRefetching ? colors.muted : colors.teal}
            style={isRefetching ? { opacity: 0.5 } : undefined}
          />
        </TouchableOpacity>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: s(10) }} />

      {/* This Station — View Scope */}
      {selectedStation && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(12),
            padding: s(12),
            marginBottom: s(10)
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(10) }}>
            <View
              style={{
                width: s(32),
                height: s(32),
                borderRadius: s(8),
                backgroundColor: colors.teal + '15',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: s(8)
              }}
            >
              <Eye size={s(16)} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>
                This Station
              </Text>
              <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
                {selectedStation.station_name} — Order visibility
              </Text>
            </View>
            {viewScopeUpdating && (
              <ActivityIndicator size='small' color={colors.teal} />
            )}
          </View>

          <View style={{ gap: s(8) }}>
            {([
              {
                value: 'own' as StationViewScope,
                label: 'This Station Only',
                description: 'Only show orders created by this station'
              },
              {
                value: 'location' as StationViewScope,
                label: 'All Location Orders',
                description: 'Show all orders from this location'
              }
            ]).map(option => {
              const isSelected = (selectedStation.view_scope ?? 'own') === option.value
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => handleViewScopeChange(option.value)}
                  disabled={viewScopeUpdating}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isSelected ? colors.teal + '12' : colors.screen,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.teal + '50' : colors.border,
                    borderRadius: s(10),
                    padding: s(10),
                    opacity: viewScopeUpdating ? 0.6 : 1
                  }}
                >
                  <View
                    style={{
                      width: s(22),
                      height: s(22),
                      borderRadius: s(11),
                      borderWidth: 2,
                      borderColor: isSelected ? colors.teal : colors.border,
                      backgroundColor: isSelected ? colors.teal : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: s(10)
                    }}
                  >
                    {isSelected && <Check size={s(13)} color='#fff' strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: '600',
                        color: isSelected ? colors.teal : colors.heading
                      }}
                    >
                      {option.label}
                    </Text>
                    <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
                      {option.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      {/* Stations Section */}
      {stations && stations.length > 0 && (
        <View style={{ marginBottom: s(10) }}>
          {renderSectionHeader(
            <Monitor size={s(14)} color={colors.teal} />,
            'Stations',
            `${stations.length} station${stations.length !== 1 ? 's' : ''} registered`,
            'stations'
          )}
          {expandedSections.stations && (
            <View
              style={{
                backgroundColor: colors.panel,
                borderBottomLeftRadius: s(12),
                borderBottomRightRadius: s(12),
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: colors.border,
                padding: s(12)
              }}
            >
              {stations.map(renderStationCard)}
            </View>
          )}
        </View>
      )}

      {/* Terminals Section */}
      {stations && stations.some(s => s.payment_terminal) && (
        <View style={{ marginBottom: s(10) }}>
          {renderSectionHeader(
            <CreditCard size={s(14)} color={colors.teal} />,
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
                borderBottomLeftRadius: s(12),
                borderBottomRightRadius: s(12),
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: colors.border,
                padding: s(12)
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
          padding: s(12),
          borderRadius: s(12),
          marginTop: s(8)
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(10) }}>
          <Shield size={s(16)} color={colors.teal} style={{ marginTop: s(1) }} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: s(12),
                fontWeight: '600',
                color: colors.teal,
                marginBottom: s(4)
              }}
            >
              Security & Encryption
            </Text>
            <Text style={{ fontSize: s(10), color: colors.label, lineHeight: s(14) }}>
              All payment terminal auth keys are encrypted in the database using PGP
              encryption and are only decrypted in memory during payment processing.
              Credentials are never stored persistently on devices.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

export default StationsScreen
