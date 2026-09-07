/**
 * Cash Management Settings Screen
 *
 * Configure cash drawer behavior: No Sale rules, blind counting,
 * variance thresholds, and EOD requirements.
 * Also allows assigning cash drawers (from device_catalog) to stations.
 */

import CashDrawerSheet from '@/components/cash-drawer/CashDrawerSheet'
import { Switch } from '@/components/ui/switch'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import {
  classifyKickOutcome,
  describeCashDrawerKickError,
  DRAWER_UNCONFIRMED_MESSAGE
} from '@/lib/cashDrawerKick'
import { colors } from '@/lib/theme'
import { toastService } from '@/lib/toastService'
import { useUiScale } from '@/lib/uiScale'
import { hydrateDrawerSession, setDrawerHostPrinter } from '@/services/cashDrawerService'
import { PrinterService } from '@/services/printing/PrinterService'
import { useCashDrawerStore } from '@/stores/useCashDrawerStore'
import { usePrinterStore } from '@/stores/usePrinterStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { Station } from '@/types/station'
import { formatCurrency } from '@/utils/currency'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  DollarSign,
  FileText,
  Lock,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Unlock,
  X
} from 'lucide-react-native'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CashDrawerRow {
  id: string
  name: string
  station_id: string | null
  is_active: boolean | null
  device_id: string | null
  host_printer_id?: string | null
  device_catalog: {
    model_name: string
    manufacturer: string
  } | null
}

export default function CashManagementScreen () {
  const supabase = useSupabaseClient()
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const cashDrawerSettings = useLocationConfigStore((s) => s.config.cashDrawer)
  const _updateConfig = useLocationConfigStore((s) => s.updateConfig)
  const updateCashDrawerSettings = (partial: Partial<typeof cashDrawerSettings>) =>
    _updateConfig('cashDrawer', partial)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)

  const drawerId = useCashDrawerStore(s => s.drawerId)
  const drawerName = useCashDrawerStore(s => s.drawerName)
  const hostPrinterId = useCashDrawerStore(s => s.hostPrinterId)
  const activeSession = useCashDrawerStore(s => s.activeSession)
  const getRunningBalance = useCashDrawerStore(s => s.getRunningBalance)
  const operations = useCashDrawerStore(s => s.operations)
  const printers = usePrinterStore(s => s.printers)

  const isSessionOpen = activeSession?.status === 'open'

  const [isCashDrawerSheetOpen, setCashDrawerSheetOpen] = useState(false)
  const [isRefreshing, setRefreshing] = useState(false)
  const [isTestingPop, setTestingPop] = useState(false)
  const [hostPickerOpen, setHostPickerOpen] = useState(false)

  const handleRefresh = useCallback(async () => {
    if (!selectedStation || !selectedStore || isRefreshing) return
    setRefreshing(true)
    await hydrateDrawerSession(supabase, selectedStation.id, selectedStore.id)
    setRefreshing(false)
  }, [selectedStation, selectedStore, supabase, isRefreshing])

  // Ground-truth verification: kick the drawer for THIS station and report
  // exactly which printer answered and whether the pop was confirmed. This is
  // the installer's proof the drawer is wired to the printer the kick targets.
  const handleTestPop = useCallback(async () => {
    if (isTestingPop) return
    setTestingPop(true)
    try {
      const kick = await PrinterService.openCashDrawer({
        stationId: selectedStation?.id ?? null,
        locationId: selectedStore?.id ?? null,
        trigger: 'manual'
      })
      const outcome = classifyKickOutcome(kick)
      if (outcome === 'failed') {
        toastService.show({
          title: 'Drawer Did Not Open',
          message: describeCashDrawerKickError(kick),
          type: 'error',
          duration: 6000
        })
      } else if (outcome === 'unconfirmed') {
        toastService.show({
          title: 'Check the Drawer',
          message: kick.printerName
            ? `${DRAWER_UNCONFIRMED_MESSAGE} (tried ${kick.printerName})`
            : DRAWER_UNCONFIRMED_MESSAGE,
          type: 'warning',
          duration: 6000
        })
      } else {
        toastService.show({
          title: 'Cash Drawer Opened',
          message: kick.printerName
            ? `Popped via ${kick.printerName}.`
            : 'Drawer kick sent.',
          type: 'success',
          duration: 5000
        })
      }
    } catch (err) {
      console.error('[CashMgmt] test pop error:', err)
      toastService.show({
        title: 'Drawer Did Not Open',
        message: 'The cash drawer could not be opened.',
        type: 'error',
        duration: 6000
      })
    } finally {
      setTestingPop(false)
    }
  }, [isTestingPop, selectedStation, selectedStore])

  // Explicit host-printer override — bind the drawer to a specific printer, or
  // clear to fall back to sense-based auto-detection.
  const queryClient = useQueryClient()

  const handleSetHostPrinter = useCallback(
    async (printerId: string | null) => {
      setHostPickerOpen(false)
      if (!drawerId) return
      const ok = await setDrawerHostPrinter(supabase, drawerId, printerId)
      if (ok) {
        // Refresh both indicators immediately: the per-station "Drawer host"
        // line here and the "Drawer: X" chip on the Printers screen.
        queryClient.invalidateQueries({
          queryKey: ['cash-drawers-location', selectedStore?.id]
        })
        queryClient.invalidateQueries({
          queryKey: ['location-cash-drawers', selectedStore?.id]
        })
      }
      toastService.show({
        title: ok ? 'Drawer Host Updated' : 'Update Failed',
        message: ok
          ? printerId
            ? `Bound to ${
                printers.find(p => p.id === printerId)?.printerName ?? 'printer'
              }.`
            : 'Cleared — will auto-detect from drawer sense.'
          : 'Could not update the drawer host printer.',
        type: ok ? 'success' : 'error',
        duration: 4000
      })
    },
    [drawerId, supabase, printers, queryClient, selectedStore?.id]
  )

  // ─── Station list ─────────────────────────────────────────────────────────
  const { data: stations = [], isLoading: loadingStations } = useQuery<
    Station[]
  >({
    queryKey: ['stations-cash-mgmt', selectedStore?.id],
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
    staleTime: 60000
  })

  // ─── Cash drawers for this location ──────────────────────────────────────
  const {
    data: cashDrawers = [],
    isLoading: loadingDrawers,
    refetch: refetchDrawers
  } = useQuery<CashDrawerRow[]>({
    queryKey: ['cash-drawers-location', selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return []
      const { data, error } = await supabase
        .from('cash_drawers')
        // select('*') is prod-safe: host_printer_id is simply absent (→ null)
        // where the migration hasn't landed, instead of 400-ing on an explicit
        // column list.
        .select('*, device_catalog(model_name, manufacturer)')
        .eq('location_id', selectedStore.id)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return (data as unknown as CashDrawerRow[]) || []
    },
    enabled: !!selectedStore?.id,
    staleTime: 30000
  })

  // ─── Assignment modal state ───────────────────────────────────────────────
  const [assigningStation, setAssigningStation] = useState<Station | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)

  const handleAssignDrawer = useCallback(
    async (drawer: CashDrawerRow) => {
      if (!assigningStation || !selectedStore || !selectedStation) return
      setIsAssigning(true)
      try {
        await supabase
          .from('cash_drawers')
          .update({ station_id: null })
          .eq('station_id', assigningStation.id)

        const { error } = await supabase
          .from('cash_drawers')
          .update({ station_id: assigningStation.id })
          .eq('id', drawer.id)
        if (error) throw error

        if (assigningStation.id === selectedStation.id) {
          await hydrateDrawerSession(
            supabase,
            selectedStation.id,
            selectedStore.id
          )
        }

        queryClient.invalidateQueries({
          queryKey: ['cash-drawers-location', selectedStore.id]
        })
        setAssigningStation(null)
      } catch (err) {
        console.error('[CashMgmt] assign drawer error:', err)
      } finally {
        setIsAssigning(false)
      }
    },
    [assigningStation, selectedStation, selectedStore, supabase, queryClient]
  )

  const handleUnassignDrawer = useCallback(
    async (station: Station) => {
      if (!selectedStore) return
      try {
        await supabase
          .from('cash_drawers')
          .update({ station_id: null })
          .eq('station_id', station.id)

        if (selectedStation?.id === station.id) {
          await hydrateDrawerSession(supabase, station.id, selectedStore.id)
        }
        queryClient.invalidateQueries({
          queryKey: ['cash-drawers-location', selectedStore.id]
        })
      } catch (err) {
        console.error('[CashMgmt] unassign drawer error:', err)
      }
    },
    [selectedStation, selectedStore, supabase, queryClient]
  )

  const [expandedSections, setExpandedSections] = useState({
    assignment: true,
    session: true,
    noSale: true,
    drawer: true,
    variance: false,
    eod: false
  })

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: s(14),
        paddingVertical: s(12),
        backgroundColor: colors.panel,
        borderTopLeftRadius: s(12),
        borderTopRightRadius: s(12),
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: s(28),
            height: s(28),
            backgroundColor: colors.teal + '15',
            borderRadius: s(8),
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: s(8)
          }}
        >
          {icon}
        </View>
        <Text
          style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}
        >
          {title}
        </Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={s(14)} color={colors.label} />
      ) : (
        <ChevronDown size={s(14)} color={colors.label} />
      )}
    </TouchableOpacity>
  )

  const renderToggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (v: boolean) => void
  ) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: s(9),
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flex: 1, marginRight: s(12) }}>
        <Text
          style={{ fontSize: s(13), fontWeight: '500', color: colors.heading }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
          {description}
        </Text>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  )

  const renderNumberRow = (
    label: string,
    description: string,
    value: number,
    onChange: (v: number) => void,
    prefix?: string
  ) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: s(9),
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flex: 1, marginRight: s(12) }}>
        <Text
          style={{ fontSize: s(13), fontWeight: '500', color: colors.heading }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
          {description}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {prefix && (
          <Text style={{ fontSize: s(12), color: colors.label, marginRight: s(3) }}>
            {prefix}
          </Text>
        )}
        <TextInput
          value={String(value)}
          onChangeText={t => {
            const num = parseFloat(t)
            if (!isNaN(num)) onChange(num)
          }}
          keyboardType='decimal-pad'
          style={{
            width: s(64),
            height: s(36),
            paddingHorizontal: s(8),
            paddingVertical: 0,
            backgroundColor: colors.inset,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            color: colors.heading,
            fontSize: s(13),
            lineHeight: Platform.OS === 'android' ? undefined : s(18),
            textAlignVertical: 'center',
            includeFontPadding: true,
            textAlign: 'center'
          }}
        />
      </View>
    </View>
  )

  return (
    <>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          paddingHorizontal: s(14),
          paddingVertical: s(10)
        }}
      >
        {/* Header */}
        <View
          style={{
            marginBottom: s(12),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}
            >
              Cash Management
            </Text>
            <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(1) }}>
              Configure drawers, approval rules, and reconciliation
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={isRefreshing}
            style={{
              marginLeft: s(12),
              padding: s(7),
              borderRadius: s(8),
              backgroundColor: colors.teal + '15',
              borderWidth: 1,
              borderColor: colors.teal + '30'
            }}
          >
            {isRefreshing ? (
              <ActivityIndicator size='small' color={colors.teal} />
            ) : (
              <RefreshCw size={s(14)} color={colors.teal} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: s(12) }}
        >
          {/* ── Stations & Devices ── */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: s(10),
              overflow: 'hidden'
            }}
          >
            {renderSectionHeader(
              'Stations & Devices',
              <Monitor size={s(14)} color={colors.teal} />,
              'assignment'
            )}
            {expandedSections.assignment && (
              <View style={{ padding: s(12) }}>
                <Text
                  style={{
                    fontSize: s(10),
                    color: colors.muted,
                    marginBottom: s(10)
                  }}
                >
                  Assign physical cash drawers to stations. Only active drawers
                  for this location shown.
                </Text>

                {loadingStations || loadingDrawers ? (
                  <View style={{ alignItems: 'center', paddingVertical: s(20) }}>
                    <ActivityIndicator color={colors.teal} />
                    <Text
                      style={{
                        fontSize: s(11),
                        color: colors.muted,
                        marginTop: s(8)
                      }}
                    >
                      Loading stations…
                    </Text>
                  </View>
                ) : stations.length === 0 ? (
                  <Text
                    style={{
                      fontSize: s(12),
                      color: colors.muted,
                      textAlign: 'center',
                      paddingVertical: s(12)
                    }}
                  >
                    No stations found for this location.
                  </Text>
                ) : (
                  stations.map(station => {
                    const assignedDrawer = cashDrawers.find(
                      d => d.station_id === station.id
                    )
                    const isCurrentStation = station.id === selectedStation?.id

                    return (
                      <View
                        key={station.id}
                        style={{
                          marginBottom: s(8),
                          borderRadius: s(10),
                          borderWidth: 1,
                          borderColor: isCurrentStation
                            ? colors.teal + '50'
                            : colors.border,
                          overflow: 'hidden'
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: s(12),
                            paddingVertical: s(8),
                            backgroundColor: isCurrentStation
                              ? colors.teal + '10'
                              : colors.screen
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: s(8) }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: s(6)
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: s(13),
                                  fontWeight: '700',
                                  color: colors.heading
                                }}
                              >
                                {station.station_name}
                              </Text>
                              {isCurrentStation && (
                                <View
                                  style={{
                                    backgroundColor: colors.teal + '20',
                                    borderWidth: 1,
                                    borderColor: colors.teal + '40',
                                    paddingHorizontal: s(5),
                                    paddingVertical: s(1),
                                    borderRadius: 20
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: s(10),
                                      color: colors.teal,
                                      fontWeight: '600'
                                    }}
                                  >
                                    Active
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text
                              style={{
                                fontSize: s(10),
                                color: colors.label,
                                marginTop: s(0.5),
                                textTransform: 'capitalize'
                              }}
                            >
                              {station.station_type} · #{station.station_number}
                            </Text>
                            {/* Forward binding: which printer holds this
                                station's drawer (or auto-detect if unbound). */}
                            {assignedDrawer && (
                              <Text
                                style={{
                                  fontSize: s(10),
                                  color: assignedDrawer.host_printer_id
                                    ? colors.teal
                                    : colors.muted,
                                  marginTop: s(1)
                                }}
                                numberOfLines={1}
                              >
                                {assignedDrawer.host_printer_id
                                  ? `Drawer host: ${
                                      printers.find(
                                        p => p.id === assignedDrawer.host_printer_id
                                      )?.printerName ?? 'Bound printer'
                                    }`
                                  : 'Drawer host: auto-detect'}
                              </Text>
                            )}
                          </View>
                          {assignedDrawer ? (
                            <TouchableOpacity
                              onPress={() => handleUnassignDrawer(station)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: s(4),
                                backgroundColor: colors.teal + '15',
                                borderWidth: 1,
                                borderColor: colors.teal + '50',
                                paddingHorizontal: s(10),
                                paddingVertical: s(4),
                                borderRadius: s(8)
                              }}
                            >
                              <Check size={s(11)} color={colors.teal} />
                              <Text
                                style={{
                                  fontSize: s(11),
                                  color: colors.teal,
                                  fontWeight: '600'
                                }}
                                numberOfLines={1}
                              >
                                {assignedDrawer.name}
                              </Text>
                              <X size={s(9)} color={colors.teal} />
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              onPress={() => setAssigningStation(station)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: s(4),
                                backgroundColor: colors.screen,
                                borderWidth: 1,
                                borderColor: colors.border,
                                paddingHorizontal: s(10),
                                paddingVertical: s(4),
                                borderRadius: s(8)
                              }}
                            >
                              <Text
                                style={{ fontSize: s(11), color: colors.label }}
                              >
                                Assign
                              </Text>
                              <ChevronRight size={s(11)} color={colors.muted} />
                            </TouchableOpacity>
                          )}
                        </View>

                        {assignedDrawer && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingHorizontal: s(12),
                              paddingVertical: s(6),
                              backgroundColor: colors.screen,
                              borderTopWidth: 1,
                              borderTopColor: colors.border
                            }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: s(5),
                                flex: 1
                              }}
                            >
                              <Banknote size={s(10)} color={colors.teal} />
                              <Text
                                style={{ fontSize: s(10), color: colors.label }}
                                numberOfLines={1}
                              >
                                {assignedDrawer.device_catalog
                                  ? `${assignedDrawer.device_catalog.manufacturer} ${assignedDrawer.device_catalog.model_name}`
                                  : 'No hardware'}
                              </Text>
                            </View>
                            <View
                              style={{
                                backgroundColor: colors.teal + '15',
                                borderWidth: 1,
                                borderColor: colors.teal + '40',
                                borderRadius: 20,
                                paddingHorizontal: s(7),
                                paddingVertical: s(2),
                                marginLeft: s(8)
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: s(10),
                                  color: colors.teal,
                                  fontWeight: '600'
                                }}
                              >
                                Connected
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    )
                  })
                )}

                {cashDrawers.length === 0 && !loadingDrawers && (
                  <View
                    style={{
                      marginTop: s(6),
                      backgroundColor: colors.screen,
                      borderRadius: s(10),
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: s(12),
                      paddingVertical: s(10)
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        color: colors.label,
                        fontWeight: '500'
                      }}
                    >
                      No cash drawers registered
                    </Text>
                    <Text
                      style={{
                        fontSize: s(10),
                        color: colors.muted,
                        marginTop: s(1)
                      }}
                    >
                      Add drawers to this location to enable assignment.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Drawer Session */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: s(10),
              overflow: 'hidden'
            }}
          >
            {renderSectionHeader(
              'Drawer Session',
              <CircleDollarSign size={s(14)} color={colors.teal} />,
              'session'
            )}
            {expandedSections.session && (
              <View style={{ padding: s(12) }}>
                {!drawerId ? (
                  <Text style={{ fontSize: s(11), color: colors.muted }}>
                    No drawer assigned to this station.
                  </Text>
                ) : !isSessionOpen ? (
                  <View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: s(10)
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: '600',
                            color: colors.heading
                          }}
                        >
                          {drawerName || 'Cash Drawer'}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: s(1),
                            gap: s(4)
                          }}
                        >
                          <Lock size={s(11)} color={colors.muted} />
                          <Text style={{ fontSize: s(11), color: colors.muted }}>
                            Closed
                          </Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setCashDrawerSheetOpen(true)}
                      style={{
                        paddingVertical: s(10),
                        borderRadius: s(10),
                        alignItems: 'center',
                        backgroundColor: colors.teal
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: s(6)
                        }}
                      >
                        <Unlock size={s(14)} color={colors.onSolid} />
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: '700',
                            color: colors.onSolid
                          }}
                        >
                          Open Drawer
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: s(10)
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: '600',
                            color: colors.heading
                          }}
                        >
                          {drawerName || 'Cash Drawer'}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: s(1),
                            gap: s(4)
                          }}
                        >
                          <View
                            style={{
                              width: s(6),
                              height: s(6),
                              borderRadius: s(3),
                              backgroundColor: colors.success
                            }}
                          />
                          <Text style={{ fontSize: s(11), color: colors.success }}>
                            Active
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: s(10), color: colors.muted }}>
                          Balance
                        </Text>
                        <Text
                          style={{
                            fontSize: s(15),
                            fontWeight: '700',
                            color: colors.teal
                          }}
                        >
                          {formatCurrency(getRunningBalance())}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setCashDrawerSheetOpen(true)}
                      style={{
                        paddingVertical: s(10),
                        borderRadius: s(10),
                        alignItems: 'center',
                        backgroundColor: colors.teal + '15',
                        borderWidth: 1,
                        borderColor: colors.teal + '40'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(12),
                          fontWeight: '600',
                          color: colors.teal
                        }}
                      >
                        Manage Drawer
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* No Sale Settings */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: s(10),
              overflow: 'hidden'
            }}
          >
            {renderSectionHeader(
              'No Sale Settings',
              <ShieldCheck size={s(14)} color={colors.teal} />,
              'noSale'
            )}
            {expandedSections.noSale && (
              <View style={{ padding: s(12) }}>
                {renderToggleRow(
                  'Require Reason',
                  'Staff must select a reason for No Sale operations',
                  cashDrawerSettings.requireNoSaleReason,
                  v => updateCashDrawerSettings({ requireNoSaleReason: v })
                )}
                {renderToggleRow(
                  'Require Manager Approval',
                  'Manager PIN required for No Sale operations',
                  cashDrawerSettings.requireNoSaleApproval,
                  v => updateCashDrawerSettings({ requireNoSaleApproval: v })
                )}
                {renderToggleRow(
                  'Auto-Print No Sale Receipt',
                  'Print a receipt when a No Sale is performed',
                  cashDrawerSettings.autoPrintNoSaleReceipt,
                  v => updateCashDrawerSettings({ autoPrintNoSaleReceipt: v })
                )}
                {renderNumberRow(
                  'Alert Threshold',
                  'Alert after this many No Sales per session',
                  cashDrawerSettings.noSaleAlertThreshold,
                  v => updateCashDrawerSettings({ noSaleAlertThreshold: v })
                )}
              </View>
            )}
          </View>

          {/* Drawer Settings */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: s(10),
              overflow: 'hidden'
            }}
          >
            {renderSectionHeader(
              'Drawer Settings',
              <Banknote size={s(14)} color={colors.teal} />,
              'drawer'
            )}
            {expandedSections.drawer && (
              <View style={{ padding: s(12) }}>
                {renderToggleRow(
                  'Blind Close Count',
                  'Hide expected amount during closing count',
                  cashDrawerSettings.blindCloseCount,
                  v => updateCashDrawerSettings({ blindCloseCount: v })
                )}
                {renderNumberRow(
                  'Default Opening Amount',
                  'Pre-filled amount for Quick Start opening',
                  cashDrawerSettings.defaultOpeningAmount,
                  v => updateCashDrawerSettings({ defaultOpeningAmount: v }),
                  '$'
                )}
                {/* Test Pop — ground-truth verify the drawer is wired to the
                    printer the kick targets for this station. */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: s(9)
                  }}
                >
                  <View style={{ flex: 1, marginRight: s(12) }}>
                    <Text
                      style={{
                        fontSize: s(13),
                        fontWeight: '500',
                        color: colors.heading
                      }}
                    >
                      Test Cash Drawer
                    </Text>
                    <Text
                      style={{
                        fontSize: s(10),
                        color: colors.muted,
                        marginTop: s(1)
                      }}
                    >
                      Kick the drawer for this station and confirm which printer
                      answered
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleTestPop}
                    disabled={isTestingPop}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: s(12),
                      height: s(36),
                      borderRadius: s(8),
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '30',
                      opacity: isTestingPop ? 0.6 : 1
                    }}
                  >
                    {isTestingPop ? (
                      <ActivityIndicator size='small' color={colors.teal} />
                    ) : (
                      <>
                        <Banknote size={s(14)} color={colors.teal} />
                        <Text
                          style={{
                            marginLeft: s(6),
                            fontSize: s(12),
                            fontWeight: '600',
                            color: colors.teal
                          }}
                        >
                          Test Pop
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                {/* Drawer Host Printer — explicit binding override; when unset
                    the kick auto-detects the host from Star drawer-sense. */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: s(9)
                  }}
                >
                  <View style={{ flex: 1, marginRight: s(12) }}>
                    <Text
                      style={{
                        fontSize: s(13),
                        fontWeight: '500',
                        color: colors.heading
                      }}
                    >
                      Drawer Host Printer
                    </Text>
                    <Text
                      style={{
                        fontSize: s(10),
                        color: colors.muted,
                        marginTop: s(1)
                      }}
                    >
                      {hostPrinterId
                        ? printers.find(p => p.id === hostPrinterId)
                            ?.printerName ?? 'Bound printer'
                        : 'Auto-detect from drawer sense'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setHostPickerOpen(true)}
                    disabled={!drawerId}
                    style={{
                      paddingHorizontal: s(12),
                      height: s(36),
                      justifyContent: 'center',
                      borderRadius: s(8),
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '30',
                      opacity: drawerId ? 1 : 0.5
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Change
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Variance Thresholds */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: s(10),
              overflow: 'hidden'
            }}
          >
            {renderSectionHeader(
              'Variance Thresholds',
              <DollarSign size={s(14)} color={colors.teal} />,
              'variance'
            )}
            {expandedSections.variance && (
              <View style={{ padding: s(12) }}>
                {renderNumberRow(
                  'Warning Threshold',
                  'Show yellow warning when variance exceeds this amount',
                  cashDrawerSettings.varianceWarningThreshold,
                  v =>
                    updateCashDrawerSettings({ varianceWarningThreshold: v }),
                  '$'
                )}
                {renderNumberRow(
                  'Alert Threshold',
                  'Show red alert when variance exceeds this amount',
                  cashDrawerSettings.varianceAlertThreshold,
                  v => updateCashDrawerSettings({ varianceAlertThreshold: v }),
                  '$'
                )}
              </View>
            )}
          </View>

          {/* EOD Settings */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: s(10),
              overflow: 'hidden'
            }}
          >
            {renderSectionHeader(
              'End of Day',
              <FileText size={s(14)} color={colors.teal} />,
              'eod'
            )}
            {expandedSections.eod && (
              <View style={{ padding: s(12) }}>
                {renderToggleRow(
                  'Require EOD Before Close',
                  'Cash drawer must be closed through End of Day process',
                  cashDrawerSettings.requireEodBeforeClose,
                  v => updateCashDrawerSettings({ requireEodBeforeClose: v })
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <CashDrawerSheet
        isOpen={isCashDrawerSheetOpen}
        onClose={() => setCashDrawerSheetOpen(false)}
      />

      {/* ── Drawer Host Printer Picker ── */}
      <Modal
        visible={hostPickerOpen}
        transparent
        animationType='fade'
        onRequestClose={() => setHostPickerOpen(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: s(20)
          }}
          activeOpacity={1}
          onPress={() => setHostPickerOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: '100%',
              backgroundColor: colors.panel,
              borderRadius: s(16),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: s(14),
                paddingVertical: s(10),
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Drawer Host Printer
                </Text>
                <Text
                  style={{ fontSize: s(10), color: colors.label, marginTop: s(1) }}
                >
                  {drawerName || 'Cash Drawer'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setHostPickerOpen(false)}
                style={{ padding: s(4) }}
              >
                <X size={s(14)} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: s(300) }}
              contentContainerStyle={{ padding: s(12) }}
            >
              {/* Auto-detect (clear binding) */}
              <TouchableOpacity
                onPress={() => handleSetHostPrinter(null)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: s(10),
                  paddingHorizontal: s(10),
                  borderRadius: s(8),
                  backgroundColor: !hostPrinterId
                    ? colors.teal + '12'
                    : 'transparent'
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: s(12),
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    Auto-detect
                  </Text>
                  <Text
                    style={{
                      fontSize: s(10),
                      color: colors.muted,
                      marginTop: s(1)
                    }}
                  >
                    Infer the host from Star drawer sense
                  </Text>
                </View>
                {!hostPrinterId && <Check size={s(15)} color={colors.teal} />}
              </TouchableOpacity>

              {printers
                .filter(p => p.isActive && p.locationId === selectedStore?.id)
                .map(p => {
                  const selected = hostPrinterId === p.id
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => handleSetHostPrinter(p.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: s(10),
                        paddingHorizontal: s(10),
                        borderRadius: s(8),
                        backgroundColor: selected
                          ? colors.teal + '12'
                          : 'transparent'
                      }}
                    >
                      <View style={{ flex: 1, marginRight: s(8) }}>
                        <Text
                          style={{
                            fontSize: s(12),
                            fontWeight: '600',
                            color: colors.heading
                          }}
                        >
                          {p.printerName}
                        </Text>
                        <Text
                          style={{
                            fontSize: s(10),
                            color: colors.muted,
                            marginTop: s(1)
                          }}
                        >
                          {p.printerType}
                          {p.networkAddress ? ` · ${p.networkAddress}` : ''}
                        </Text>
                      </View>
                      {selected && <Check size={s(15)} color={colors.teal} />}
                    </TouchableOpacity>
                  )
                })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Drawer Picker Modal ── */}
      <Modal
        visible={!!assigningStation}
        transparent
        animationType='fade'
        onRequestClose={() => setAssigningStation(null)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: s(20)
          }}
          activeOpacity={1}
          onPress={() => !isAssigning && setAssigningStation(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: '100%',
              backgroundColor: colors.panel,
              borderRadius: s(16),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: s(14),
                paddingVertical: s(10),
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Assign Device
                </Text>
                {assigningStation && (
                  <Text
                    style={{ fontSize: s(10), color: colors.label, marginTop: s(1) }}
                  >
                    {assigningStation.station_name}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setAssigningStation(null)}
                style={{ padding: s(4) }}
              >
                <X size={s(14)} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {/* Drawer list */}
            <View style={{ padding: s(12) }}>
              {cashDrawers.length === 0 ? (
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.muted,
                    textAlign: 'center',
                    paddingVertical: s(14)
                  }}
                >
                  No drawers available for this location.
                </Text>
              ) : (
                cashDrawers.map(drawer => {
                  const isAssignedElsewhere =
                    drawer.station_id !== null &&
                    drawer.station_id !== assigningStation?.id
                  const isAssignedHere =
                    drawer.station_id === assigningStation?.id
                  const occupiedByStation = isAssignedElsewhere
                    ? stations.find(s => s.id === drawer.station_id)
                    : null

                  return (
                    <TouchableOpacity
                      key={drawer.id}
                      onPress={() =>
                        !isAssignedElsewhere &&
                        !isAssigning &&
                        handleAssignDrawer(drawer)
                      }
                      disabled={isAssignedElsewhere || isAssigning}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: s(8),
                        paddingHorizontal: s(12),
                        paddingVertical: s(9),
                        borderRadius: s(10),
                        borderWidth: 1,
                        borderColor: isAssignedHere
                          ? colors.teal + '50'
                          : colors.border,
                        backgroundColor: isAssignedHere
                          ? colors.teal + '10'
                          : colors.screen,
                        opacity: isAssignedElsewhere ? 0.5 : 1
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: '600',
                            color: isAssignedElsewhere
                              ? colors.muted
                              : colors.heading
                          }}
                        >
                          {drawer.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: s(10),
                            color: colors.label,
                            marginTop: s(0.5)
                          }}
                        >
                          {drawer.device_catalog
                            ? `${drawer.device_catalog.manufacturer} ${drawer.device_catalog.model_name}`
                            : 'No hardware'}
                          {isAssignedElsewhere && occupiedByStation
                            ? ` · ${occupiedByStation.station_name}`
                            : ''}
                        </Text>
                      </View>
                      {isAssigning && isAssignedHere ? (
                        <ActivityIndicator size='small' color={colors.teal} />
                      ) : isAssignedHere ? (
                        <Check size={s(13)} color={colors.teal} />
                      ) : isAssignedElsewhere ? (
                        <Lock size={s(11)} color={colors.muted} />
                      ) : (
                        <ChevronRight size={s(13)} color={colors.muted} />
                      )}
                    </TouchableOpacity>
                  )
                })
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  )
}
