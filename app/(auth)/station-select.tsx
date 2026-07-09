import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import { replaceRoute } from '@/lib/rootNavigation'
import { createSupabaseClient } from '@/lib/supabase'
import { colors, spinnerColor } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { SelectedStation, Station } from '@/types/station'
import { useAuth } from '@clerk/clerk-expo'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  Monitor,
  MonitorPlay,
  RefreshCw,
  User,
  Wifi,
  WifiOff
} from 'lucide-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface StationSelectItemProps {
  station: Station
  isSelected: boolean
  onPress: () => void
  onTakeOver: () => void
}

const StationSelectItem = ({
  station,
  isSelected,
  onPress,
  onTakeOver
}: StationSelectItemProps) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const isAvailable = station.is_available

  return (
    <TouchableOpacity
      onPress={isAvailable ? onPress : undefined}
      activeOpacity={isAvailable ? 0.7 : 1}
      style={{
        backgroundColor: isSelected ? colors.teal + '10' : colors.card,
        borderWidth: 1,
        borderColor: isSelected
          ? colors.teal + '50'
          : isAvailable
          ? colors.border
          : colors.border,
        borderRadius: s(10),
        paddingHorizontal: s(14),
        paddingVertical: s(10),
        marginBottom: s(8)
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        {/* Left: icon + info */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View
            style={{
              width: s(34),
              height: s(34),
              borderRadius: s(8),
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isSelected
                ? colors.teal + '20'
                : isAvailable
                ? colors.teal + '15'
                : colors.teal + '10',
              marginRight: s(12)
            }}
          >
            <Monitor
              size={s(16)}
              color={
                isSelected
                  ? colors.teal
                  : isAvailable
                  ? colors.teal
                  : colors.muted
              }
            />
          </View>

          <View style={{ flex: 1 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: '600',
                  color: isSelected ? colors.teal : colors.heading
                }}
              >
                {station.station_name}
              </Text>
              {station.station_number > 0 && (
                <View
                  style={{
                    backgroundColor: colors.screen,
                    borderRadius: s(20),
                    paddingHorizontal: s(7),
                    paddingVertical: s(2),
                    borderWidth: 1,
                    borderColor: colors.border
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(10),
                      fontWeight: '600',
                      color: colors.muted
                    }}
                  >
                    #{station.station_number}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(2) }}>
              {station.station_type.charAt(0).toUpperCase() +
                station.station_type.slice(1)}
            </Text>
            {!isAvailable && station.current_session && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: s(4),
                  gap: s(4)
                }}
              >
                <User size={s(11)} color={colors.muted} />
                <Text style={{ fontSize: s(11), color: colors.muted }}>
                  {station.current_session.staff_name}
                  {station.current_session.device_name
                    ? ` · ${station.current_session.device_name}`
                    : ''}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Right: status / action */}
        <View style={{ alignItems: 'flex-end' }}>
          {isAvailable ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(4),
                backgroundColor: colors.teal + '15',
                borderRadius: s(20),
                paddingHorizontal: s(9),
                paddingVertical: s(3),
                borderWidth: 1,
                borderColor: colors.teal + '40'
              }}
            >
              <Wifi size={s(11)} color={colors.teal} />
              <Text
                style={{ fontSize: s(11), fontWeight: '600', color: colors.teal }}
              >
                Available
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'flex-end', gap: s(6) }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(4),
                  backgroundColor: colors.border,
                  borderRadius: s(20),
                  paddingHorizontal: s(9),
                  paddingVertical: s(3),
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <WifiOff size={s(11)} color={colors.muted} />
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: '600',
                    color: colors.muted
                  }}
                >
                  In Use
                </Text>
              </View>
              <TouchableOpacity
                onPress={onTakeOver}
                style={{
                  backgroundColor: colors.teal + '15',
                  borderWidth: 1,
                  borderColor: colors.teal + '40',
                  borderRadius: s(8),
                  paddingHorizontal: s(10),
                  paddingVertical: s(4)
                }}
              >
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  Take Over
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const StationSelectScreen = () => {
  const router = useRouter()
  const { getToken } = useAuth()
  const supabase = createSupabaseClient(getToken)
  const selectedStore = useStoreSettingsStore(state => state.selectedStore)
  const setSelectedStation = useStoreSettingsStore(
    state => state.setSelectedStation
  )
  const setIsCFDMode = useStoreSettingsStore(state => state.setIsCFDMode)
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null
  )
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false)
  const [stationToTakeover, setStationToTakeover] = useState<Station | null>(
    null
  )

  const {
    data: stations,
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['stations', selectedStore?.id],
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
    refetchInterval: 60000
  })

  const handleSelectStation = (station: Station) => {
    if (station.is_available) {
      setSelectedStationId(station.id)
    }
  }

  const handleTakeOverPress = (station: Station) => {
    setStationToTakeover(station)
    setShowTakeoverConfirm(true)
  }

  const handleContinue = () => {
    const station = stations?.find(s => s.id === selectedStationId)
    if (station) {
      const stationData: SelectedStation = {
        id: station.id,
        station_name: station.station_name,
        station_type: station.station_type,
        station_number: station.station_number,
        view_scope: station.view_scope,
        can_create_orders: station.can_create_orders,
        can_process_payments: station.can_process_payments,
        can_void_orders: station.can_void_orders,
        can_apply_discounts: station.can_apply_discounts,
        can_update_kitchen_status: station.can_update_kitchen_status,
        payment_terminal: station.payment_terminal || null,
        kiosk_profile_id: station.kiosk_profile_id ?? null
      }
      setSelectedStation(stationData)
      router.push({
        pathname: '/pin-login',
        params: { forceTakeover: 'false' }
      })
    }
  }

  const handleTakeoverConfirm = () => {
    if (stationToTakeover) {
      const stationData: SelectedStation = {
        id: stationToTakeover.id,
        station_name: stationToTakeover.station_name,
        station_type: stationToTakeover.station_type,
        station_number: stationToTakeover.station_number,
        view_scope: stationToTakeover.view_scope,
        can_create_orders: stationToTakeover.can_create_orders,
        can_process_payments: stationToTakeover.can_process_payments,
        can_void_orders: stationToTakeover.can_void_orders,
        can_apply_discounts: stationToTakeover.can_apply_discounts,
        can_update_kitchen_status: stationToTakeover.can_update_kitchen_status,
        payment_terminal: stationToTakeover.payment_terminal || null,
        kiosk_profile_id: stationToTakeover.kiosk_profile_id ?? null
      }
      setSelectedStation(stationData)
      setShowTakeoverConfirm(false)
      router.push({ pathname: '/pin-login', params: { forceTakeover: 'true' } })
    }
  }

  if (isLoading) {
    return (
      <View
        style={{
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: s(60)
        }}
      >
        <ActivityIndicator size='small' color={spinnerColor} />
        <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(10) }}>
          Loading stations...
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View
        style={{
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: s(60),
          gap: s(8)
        }}
      >
        <Text
          style={{
            fontSize: s(13),
            fontWeight: '600',
            color: colors.danger,
            textAlign: 'center'
          }}
        >
          Failed to load stations
        </Text>
        <Text
          style={{ fontSize: s(12), color: colors.muted, textAlign: 'center' }}
        >
          {(error as Error).message || 'Please try again later'}
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{
            marginTop: s(4),
            backgroundColor: colors.teal + '20',
            borderWidth: 1,
            borderColor: colors.teal + '50',
            borderRadius: s(8),
            paddingHorizontal: s(14),
            paddingVertical: s(6)
          }}
        >
          <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.teal }}>
            Retry
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.replace('/store-select')}
          style={{
            marginTop: s(6),
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(4),
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            paddingHorizontal: s(14),
            paddingVertical: s(6)
          }}
        >
          <ChevronLeft size={s(14)} color={colors.muted} />
          <Text
            style={{ fontSize: s(12), fontWeight: '600', color: colors.muted }}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!stations || stations.length === 0) {
    return (
      <View
        style={{
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: s(60),
          gap: s(8)
        }}
      >
        <View
          style={{
            width: s(44),
            height: s(44),
            borderRadius: s(12),
            backgroundColor: colors.teal + '15',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Monitor size={s(20)} color={colors.muted} />
        </View>
        <Text
          style={{
            fontSize: s(13),
            fontWeight: '600',
            color: colors.label,
            textAlign: 'center'
          }}
        >
          No stations available
        </Text>
        <Text
          style={{ fontSize: s(12), color: colors.muted, textAlign: 'center' }}
        >
          Contact your administrator to set up stations
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{
            marginTop: s(4),
            backgroundColor: colors.teal + '20',
            borderWidth: 1,
            borderColor: colors.teal + '50',
            borderRadius: s(8),
            paddingHorizontal: s(14),
            paddingVertical: s(6)
          }}
        >
          <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.teal }}>
            Refresh
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.replace('/store-select')}
          style={{
            marginTop: s(6),
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(4),
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            paddingHorizontal: s(14),
            paddingVertical: s(6)
          }}
        >
          <ChevronLeft size={s(14)} color={colors.muted} />
          <Text
            style={{ fontSize: s(12), fontWeight: '600', color: colors.muted }}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ width: '100%' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: s(4)
        }}
      >
        <Text
          style={{
            fontSize: s(15),
            fontWeight: '700',
            color: colors.heading,
            flex: 1
          }}
        >
          Select Station
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          style={{
            padding: s(6),
            backgroundColor: colors.teal + '10',
            borderRadius: s(8),
            borderWidth: 1,
            borderColor: colors.teal + '30',
            opacity: isRefetching ? 0.5 : 1
          }}
        >
          <RefreshCw size={s(14)} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Location subtitle */}
      <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(14) }}>
        {selectedStore?.name || 'Unknown Location'}
      </Text>

      {/* Station list */}
      <ScrollView
        style={{ maxHeight: s(320) }}
        showsVerticalScrollIndicator={false}
      >
        {stations.map(station => (
          <StationSelectItem
            key={station.id}
            station={station}
            isSelected={selectedStationId === station.id}
            onPress={() => handleSelectStation(station)}
            onTakeOver={() => handleTakeOverPress(station)}
          />
        ))}
      </ScrollView>

      {/* Continue button */}
      <TouchableOpacity
        onPress={handleContinue}
        disabled={!selectedStationId}
        style={{
          marginTop: s(14),
          backgroundColor: selectedStationId ? colors.teal : colors.teal + '30',
          borderRadius: s(10),
          paddingVertical: s(11),
          alignItems: 'center'
        }}
      >
        <Text
          style={{
            fontSize: s(13),
            fontWeight: '700',
            color: selectedStationId ? colors.onSolid : colors.muted
          }}
        >
          Continue
        </Text>
      </TouchableOpacity>

      {/* CFD Display Mode */}
      <TouchableOpacity
        onPress={() => {
          setIsCFDMode(true)
          replaceRoute('(cfd)', 'cfd-pairing')
        }}
        style={{
          width: '100%',
          marginTop: s(16),
          padding: s(16),
          borderRadius: s(12),
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: s(12)
        }}
      >
        <MonitorPlay size={s(20)} color={colors.label} />
        <View>
          <Text
            style={{ fontSize: s(16), fontWeight: '500', color: colors.heading }}
          >
            Use as CFD Display
          </Text>
          <Text style={{ fontSize: s(12), color: colors.muted }}>
            Turn this tablet into a customer-facing display
          </Text>
        </View>
      </TouchableOpacity>

      <ConfirmationModal
        isOpen={showTakeoverConfirm}
        onClose={() => setShowTakeoverConfirm(false)}
        onConfirm={handleTakeoverConfirm}
        title='Take Over Station?'
        description={
          stationToTakeover?.current_session
            ? `Station is used by ${stationToTakeover.current_session.staff_name}. You must enter your PIN to take over and end their session.`
            : 'Station is in use. You must enter your PIN to take over.'
        }
        confirmText='Proceed to PIN'
        variant='destructive'
      />
    </View>
  )
}

export default StationSelectScreen
