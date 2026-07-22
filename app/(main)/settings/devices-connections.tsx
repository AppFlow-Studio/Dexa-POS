import AppUpdateModal from '@/components/AppUpdateModal'
import { CastlesUsbSetupSheet, type CastlesUsbVerifiedPayload } from '@/components/settings/CastlesUsbSetupSheet'
import { isValidIpv4 } from '@/components/settings/ManualIpPanel'
import { PrinterRoutingModal } from '@/components/settings/PrinterRoutingModal'
import { usePaymentTerminal } from '@/hooks/usePaymentTerminal'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { useTerminalStatus } from '@/hooks/useTerminalStatus'
import { exportTelemetry } from '@/lib/telemetry/export'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { toastService } from '@/lib/toastService'
import {
  checkForNativeUpdate,
  type VersionManifest
} from '@/services/appUpdater'
import {
  detectDeviceCapabilities,
  getCachedCapabilities,
  type DeviceCapabilities
} from '@/services/hardware/deviceDetection'
import {
  addBuiltinPrinter,
  addDejavooPrinter,
  addStarPrinter,
  testPrinterConnection
} from '@/services/hardware/printerProvisioning'
import {
  discoverStarPrinters,
  probeStarPrinterByIp,
  stopDiscovery,
  type DiscoveredStarPrinter
} from '@/services/printing/discovery/StarPrinterDiscovery'
import { PrinterService } from '@/services/printing/PrinterService'
import { usePrinterStore } from '@/stores/usePrinterStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTerminalConnectionStore } from '@/stores/useTerminalConnectionStore'
import { getSharedCastlesService } from '@/services/terminals/castles-service'
import { CASTLES_DEFAULT_PORT } from '@/types/castles'
import type {
  PrinterConfig,
  PrinterDriverType,
  PrinterRole
} from '@/types/printer'
import type { StationPaymentTerminal } from '@/types/station'
import { formatDistanceToNow } from 'date-fns'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Minus,
  Pencil,
  Plus,
  Printer,
  Radio,
  RefreshCw,
  Route,
  Search,
  Smartphone,
  Trash2,
  Usb,
  Wifi,
  WifiOff,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { Switch } from '~/components/ui/switch'

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function getPrinterStatusColor (printer: PrinterConfig): string {
  if (printer.lastStatus === 'verified') return colors.success
  if (printer.isConnected) return colors.success
  if (printer.lastStatus?.startsWith('verification_failed'))
    return colors.danger
  return colors.muted
}

function getPrinterStatusLabel (printer: PrinterConfig): string {
  if (printer.lastStatus === 'verified') return 'Verified'
  if (printer.isConnected) return 'Online'
  if (printer.lastStatus?.startsWith('verification_failed'))
    return 'Verify Failed'
  if (printer.errorCount > 0) return 'Error'
  return 'Offline'
}

function getRoleBadge (role: PrinterRole): {
  label: string
  bg: string
  text: string
} {
  switch (role) {
    case 'receipt':
      return { label: 'Receipt', bg: colors.teal + '20', text: colors.teal }
    case 'kitchen':
      return { label: 'Kitchen', bg: colors.teal + '20', text: colors.teal }
    case 'bar':
      return { label: 'Bar', bg: colors.teal + '20', text: colors.teal }
    case 'label':
      return { label: 'Label', bg: colors.teal + '15', text: colors.teal }
    default:
      return { label: role, bg: colors.teal + '15', text: colors.teal }
  }
}

function getTypeBadge (type: PrinterDriverType): string {
  switch (type) {
    case 'builtin_landi':
      return 'Built-in'
    case 'dejavoo_spin_p':
      return 'Dejavoo'
    case 'star_micronics':
      return 'Star'
    case 'generic_escpos':
      return 'ESC/POS'
    default:
      return type
  }
}

function getRelativeTime (iso: string | null): string {
  if (!iso) return '\u2014'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return '\u2014'
  }
}

// ---------------------------------------------------------------------------
// SECTION HEADER
// ---------------------------------------------------------------------------

function SectionHeader ({
  title,
  icon,
  expanded,
  onToggle,
  rightContent
}: {
  title: string
  icon: React.ReactNode
  expanded: boolean
  onToggle: () => void
  rightContent?: React.ReactNode
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: s(14),
        backgroundColor: colors.panel,
        borderTopLeftRadius: s(12),
        borderTopRightRadius: s(12),
        borderBottomWidth: expanded ? 1 : 0,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View
          style={{
            width: s(32),
            height: s(32),
            backgroundColor: colors.teal + '15',
            borderRadius: s(8),
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: s(10)
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
        {rightContent}
        {expanded ? (
          <ChevronUp size={s(16)} color={colors.label} />
        ) : (
          <ChevronDown size={s(16)} color={colors.label} />
        )}
      </View>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

type DevicesConnectionsScreenProps = {
  mode?: 'all' | 'printers'
  afterPrinters?: React.ReactNode
}

const DevicesConnectionsScreen = ({
  mode = 'all',
  afterPrinters
}: DevicesConnectionsScreenProps) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const supabase = useSupabaseClient()
  const router = useRouter()
  const [showCastlesUsbSetup, setShowCastlesUsbSetup] = useState(false)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const setSelectedStation = useStoreSettingsStore(s => s.setSelectedStation)

  // Payment terminal hook
  const {
    terminals,
    isTestingConnection,
    loadTerminals,
    setActiveTerminal,
    testConnection,
    testConnectionWithConfig,
    diagnoseCastlesConnection,
    registerTerminal
  } = usePaymentTerminal()

  // Live connect sub-step ("Connecting…", "Verifying…") shown while testing.
  const terminalConnectActivity = useTerminalConnectionStore(
    s => s.connectActivity
  )

  // Pre-warm the Castles singleton when this screen opens so the first "Test"
  // (or the next sale) skips the cold-connect cost. Fire-and-forget; no-op when
  // already connected, suspended, or no Castles terminal is configured.
  useEffect(() => {
    const terminal = selectedStation?.payment_terminal
    if (terminal?.terminal_type !== 'castles') return
    const service = getSharedCastlesService()
    if (service.isSuspended() || service.isConnected()) return
    const isUsb = terminal.connection_type === 'usb'
    service
      .connect({
        connectionType: isUsb ? ('usb' as const) : ('local_socket' as const),
        host: isUsb ? undefined : terminal.ip_address,
        port: isUsb ? undefined : terminal.port ?? CASTLES_DEFAULT_PORT,
        timeout: 10_000,
        terminalId: terminal.id
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation?.payment_terminal?.id])

  // Printer store
  const storedPrinters = usePrinterStore(s => s.printers)
  const fetchPrinters = usePrinterStore(s => s.fetchPrinters)
  const updatePrinterConfig = usePrinterStore(s => s.updatePrinterConfig)
  const deletePrinter = usePrinterStore(s => s.deletePrinter)
  const discoveredStarPrinters = usePrinterStore(s => s.discoveredPrinters)
  const isScanningStar = usePrinterStore(s => s.isScanning)
  const setDiscoveredPrinters = usePrinterStore(s => s.setDiscoveredPrinters)
  const addDiscoveredPrinter = usePrinterStore(s => s.addDiscoveredPrinter)
  const setIsScanning = usePrinterStore(s => s.setIsScanning)

  // Terminal status
  const currentTerminal = selectedStation?.payment_terminal ?? null
  const { status: terminalStatus, recheckStatus } = useTerminalStatus(
    currentTerminal?.id ?? undefined,
    currentTerminal ?? undefined
  )

  // Section expansion state
  const [expandedSections, setExpandedSections] = useState({
    station: mode === 'all',
    terminal: mode === 'all',
    printers: true,
    discovered: mode === 'printers',
    appUpdates: false
  })

  // App Updates state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [nativeUpdateManifest, setNativeUpdateManifest] =
    useState<VersionManifest | null>(null)
  const currentVersion = Constants.expoConfig?.version ?? '—'

  const handleCheckForUpdate = async () => {
    setIsCheckingUpdate(true)
    try {
      const manifest = await checkForNativeUpdate()
      setLastChecked(new Date())
      if (manifest) {
        setNativeUpdateManifest(manifest)
      } else {
        toastService.show({
          title: 'Up to Date',
          message: `Version ${currentVersion} is the latest.`,
          type: 'success'
        })
      }
    } catch {
      toastService.show({
        title: 'Check Failed',
        message: 'Could not reach update server.',
        type: 'error'
      })
    } finally {
      setIsCheckingUpdate(false)
    }
  }
  // Wave-0 telemetry: hidden export — long-press the version value to dump
  // the local perf ring buffer as JSON and open the share sheet. Local-only,
  // works offline; even if no share target exists the file lands in the
  // cache directory (retrievable via adb).
  const handleExportTelemetry = async () => {
    try {
      const fileUri = await exportTelemetry()
      toastService.show({
        title: 'Telemetry Exported',
        message: `Saved to ${fileUri}`,
        type: 'success'
      })
    } catch (e) {
      toastService.show({
        title: 'Telemetry Export Failed',
        message: e instanceof Error ? e.message : 'Unknown error',
        type: 'error'
      })
    }
  }

  const toggleSection = (s: keyof typeof expandedSections) =>
    setExpandedSections(prev => ({ ...prev, [s]: !prev[s] }))

  // Device capabilities — seed from cache immediately, then refresh in background on mount
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(
    getCachedCapabilities
  )
  const [isRefreshingCaps, setIsRefreshingCaps] = useState(false)

  useEffect(() => {
    detectDeviceCapabilities()
      .then(setCapabilities)
      .catch(() => {})
  }, [])

  // Terminal UI state
  const [showTerminalPicker, setShowTerminalPicker] = useState(false)
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [registerFormType, setRegisterFormType] = useState<
    'dejavoo' | 'castles' | 'valor'
  >('castles')
  const [registerForm, setRegisterForm] = useState({
    name: '',
    tpn: '',
    authKey: '',
    model: '',
    environment: 'sandbox' as 'sandbox' | 'production',
    ipAddress: '',
    port: '8080',
    connectionType: 'local_socket' as 'local_socket' | 'usb',
    /** Pre-discovered serial number from the USB wizard's getData handshake.
     *  Threaded into the INSERT so the terminal card shows S/N immediately
     *  instead of "— not yet discovered —" until the next testConnection. */
    serialNumber: '' as string,
    /** Valor cancel port (5001) + EPI (merchant/device id). */
    cancelPort: '5001',
    epi: ''
  })
  const [isEditingTerminal, setIsEditingTerminal] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    model: '',
    tpn: '',
    authKey: '',
    ipAddress: '',
    port: '8080',
    connectionType: 'local_socket' as 'local_socket' | 'usb',
    cancelPort: '5001',
    epi: ''
  })
  const [isAssigning, setIsAssigning] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [quickTestIp, setQuickTestIp] = useState('')
  const [quickTestPort, setQuickTestPort] = useState('8080')
  const [quickTestStatus, setQuickTestStatus] = useState<
    'idle' | 'testing' | 'online' | 'offline'
  >('idle')

  // Printer UI state
  const [printerScope, setPrinterScope] = useState<'station' | 'location'>(
    'station'
  )
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null)
  const [retryingPrinterId, setRetryingPrinterId] = useState<string | null>(
    null
  )
  const [testPrintingId, setTestPrintingId] = useState<string | null>(null)
  const [routingModalPrinter, setRoutingModalPrinter] =
    useState<PrinterConfig | null>(null)
  const [draftPrinterEdits, setDraftPrinterEdits] = useState<{
    printerRole?: PrinterRole
    isDefaultReceipt?: boolean
    isDefaultKitchen?: boolean
    isActive?: boolean
    printerName?: string
  }>({})
  const [isSavingPrinter, setIsSavingPrinter] = useState(false)

  // Receipt / Kitchen picker state
  const [showReceiptPicker, setShowReceiptPicker] = useState(false)
  const [showKitchenPicker, setShowKitchenPicker] = useState(false)
  const [pendingReceiptId, setPendingReceiptId] = useState<string | 'none'>(
    'none'
  )

  // Discovery UI state
  const [scanSecondsRemaining, setScanSecondsRemaining] = useState<
    number | null
  >(null)
  const [starScanError, setStarScanError] = useState<string | null>(null)
  const [provisioningStarIp, setProvisioningStarIp] = useState<string | null>(
    null
  )
  const [starRoleOverrides, setStarRoleOverrides] = useState<
    Record<string, 'receipt' | 'kitchen' | 'both'>
  >({})
  const [manualIp, setManualIp] = useState('')
  const [manualIpRole, setManualIpRole] = useState<
    'receipt' | 'kitchen' | 'both'
  >('receipt')
  const [isProbing, setIsProbing] = useState(false)
  const [manualIpError, setManualIpError] = useState<string | null>(null)
  const [provisioningBuiltin, setProvisioningBuiltin] = useState(false)
  const [provisioningDejavoo, setProvisioningDejavoo] = useState(false)

  // Alert modal
  const [alertModal, setAlertModal] = useState<{
    title: string
    message: string
    success: boolean
  } | null>(null)

  // ---------------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (selectedStore?.id) {
      fetchPrinters(selectedStore.id)
      loadTerminals(selectedStore.id)
    }
  }, [selectedStore?.id])

  // Hydrate station terminal with IP/port/serial from full terminal record
  useEffect(() => {
    if (!currentTerminal || !terminals.length || !selectedStation) return
    const needsHydration =
      !currentTerminal.ip_address || !currentTerminal.serial_number
    if (!needsHydration) return
    const fullRecord = terminals.find(t => t.id === currentTerminal.id)
    if (!fullRecord) return
    const hydratedIp = currentTerminal.ip_address ?? fullRecord.ipAddress
    const hydratedSerial =
      currentTerminal.serial_number ?? null
    if (
      hydratedIp === currentTerminal.ip_address &&
      hydratedSerial === currentTerminal.serial_number
    )
      return
    setSelectedStation({
      ...selectedStation,
      payment_terminal: {
        ...currentTerminal,
        ip_address: hydratedIp,
        port: currentTerminal.port ?? fullRecord.port,
        connection_type:
          currentTerminal.connection_type ?? fullRecord.connectionType,
        serial_number: hydratedSerial
      }
    })
  }, [terminals, currentTerminal?.id, currentTerminal?.serial_number])

  // ---------------------------------------------------------------------------
  // DEVICE CAPABILITIES
  // ---------------------------------------------------------------------------

  const handleRefreshCapabilities = useCallback(async () => {
    setIsRefreshingCaps(true)
    try {
      const caps = await detectDeviceCapabilities()
      setCapabilities(caps)
    } catch (e) {
      console.warn('[DevicesConnections] Failed to refresh capabilities:', e)
    } finally {
      setIsRefreshingCaps(false)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // TERMINAL HANDLERS
  // ---------------------------------------------------------------------------

  const handleTestConnection = async () => {
    const online = await testConnection()
    if (currentTerminal && selectedStation) {
      setSelectedStation({
        ...selectedStation,
        payment_terminal: {
          ...currentTerminal,
          is_connected: online,
          last_connection_status: online ? 'Online' : 'Offline',
          last_connection_test_at: new Date().toISOString()
        }
      })
    }
    toastService.show({
      title: online ? 'Terminal Online' : 'Terminal Offline',
      message: online
        ? 'Connection verified.'
        : 'Could not reach terminal. Check network.',
      type: online ? 'success' : 'error'
    })
  }

  const handleDiagnoseCastles = async () => {
    toastService.show({
      title: 'Running TCP Diagnostics...',
      message: 'Testing 4 delimiter formats (~35s).',
      type: 'warning'
    })
    const result = await diagnoseCastlesConnection()
    if (result.dataReceived) {
      toastService.show({
        title: 'Diagnosis: Data Received!',
        message: `Delimiter: ${result.delimiterUsed}`,
        type: 'success'
      })
    } else if (result.tcpConnected) {
      toastService.show({
        title: 'Diagnosis: TCP OK, No Response',
        message: result.error ?? 'Terminal did not respond',
        type: 'warning'
      })
    } else {
      toastService.show({
        title: 'Diagnosis: TCP Failed',
        message: result.error ?? 'Could not establish TCP connection',
        type: 'error'
      })
    }
  }

  const handleQuickTest = async () => {
    const ip = quickTestIp.trim()
    if (!ip) return
    setQuickTestStatus('testing')
    try {
      const ok = await testConnectionWithConfig({
        terminalId: currentTerminal?.id ?? 'quick-test',
        terminalType: 'castles',
        ipAddress: ip,
        port: parseInt(quickTestPort, 10) || 8080
      })
      setQuickTestStatus(ok.success ? 'online' : 'offline')
    } catch {
      setQuickTestStatus('offline')
    }
  }

  const handleAssignTerminal = async (terminal: typeof terminals[number]) => {
    if (!selectedStation || !selectedStore) return

    // Loosened binding: a terminal that's connected/active at another station
    // can still be claimed here. Confirm the move first so we don't silently
    // steal another station's reader. (The body below already unbinds the old
    // station and rebinds to this one.)
    const boundElsewhere =
      terminal.isActive &&
      !!terminal.stationId &&
      terminal.stationId !== selectedStation.id
    if (boundElsewhere) {
      const confirmed = await new Promise<boolean>(resolve => {
        Alert.alert(
          'Move terminal to this station?',
          `${terminal.name} is currently in use at another station. Moving it here disconnects it from that station.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Move here', onPress: () => resolve(true) }
          ]
        )
      })
      if (!confirmed) return
    }

    setIsAssigning(true)
    try {
      await supabase
        .from('payment_terminals')
        .update({ station_id: null })
        .eq('station_id', selectedStation.id)
        .neq('id', terminal.id)
      await supabase
        .from('payment_terminals')
        .update({ is_active: true, station_id: selectedStation.id })
        .eq('id', terminal.id)
      setActiveTerminal(terminal.id)
      const newTerminalData: StationPaymentTerminal = {
        id: terminal.id,
        terminal_name: terminal.name,
        register_id: null,
        auth_key: null,
        terminal_type:
          (terminal.terminalType as StationPaymentTerminal['terminal_type']) ||
          'dejavoo',
        terminal_model: terminal.model || null,
        is_connected: terminal.isConnected,
        ip_address: terminal.ipAddress,
        port: terminal.port,
        last_connection_status: terminal.lastConnectionStatus || null,
        last_connection_test_at: terminal.lastConnectionTest || null
      }
      setSelectedStation({
        ...selectedStation,
        payment_terminal: newTerminalData
      })
      toastService.show({
        title: 'Terminal Switched',
        message: `Now using ${terminal.name}.`,
        type: 'success'
      })
      setShowTerminalPicker(false)
    } catch (err) {
      toastService.show({
        title: 'Assignment Failed',
        message:
          err instanceof Error ? err.message : 'Failed to switch terminal.',
        type: 'error'
      })
    } finally {
      setIsAssigning(false)
    }
  }

  const handleRegisterTerminal = async () => {
    if (!selectedStore || !selectedStation) return
    setIsRegistering(true)
    let newTerminalId: string | undefined

    try {
      if (registerFormType === 'dejavoo') {
        const result = await registerTerminal({
          locationId: selectedStore.id,
          merchantId: selectedStore.merchant_id,
          stationId: selectedStation.id,
          terminalName: registerForm.name,
          tpn: registerForm.tpn,
          authKey: registerForm.authKey,
          terminalModel: registerForm.model || undefined,
          environment: registerForm.environment
        })
        if (!result.success) throw new Error(result.error)
        newTerminalId = result.terminalId
        if (result.terminalId) {
          setActiveTerminal(result.terminalId)
          setSelectedStation({
            ...selectedStation,
            payment_terminal: {
              id: result.terminalId,
              terminal_name: registerForm.name,
              register_id: registerForm.tpn,
              auth_key: null,
              terminal_type: 'dejavoo',
              terminal_model: registerForm.model || null,
              is_connected: false,
              last_connection_status: null,
              last_connection_test_at: null
            }
          })
        }
      } else if (registerFormType === 'valor') {
        const connectionType =
          registerForm.connectionType === 'usb' ? 'usb' : 'local'
        const localIp =
          registerForm.connectionType === 'local_socket'
            ? registerForm.ipAddress
            : null
        const localPort =
          registerForm.connectionType === 'local_socket'
            ? parseInt(registerForm.port, 10) || 5000
            : null
        const cancelPort = parseInt(registerForm.cancelPort, 10) || 5001

        // Pre-test over TCP to discover the serial number before the INSERT.
        let discoveredSN: string | undefined
        if (
          registerForm.connectionType === 'local_socket' &&
          registerForm.ipAddress
        ) {
          const preTest = await testConnectionWithConfig({
            terminalId: `provisional-${selectedStation.id}`,
            terminalType: 'valor',
            ipAddress: registerForm.ipAddress,
            port: localPort ?? 5000,
            cancelPort,
            epi: registerForm.epi
          })
          // Don't persist a terminal we can't reach. A failed pre-test would
          // otherwise leave a dead row that resolves as the station's active
          // terminal and knocks the real terminal offline.
          if (!preTest.success) {
            throw new Error(
              preTest.error ||
                'Could not connect to the Valor terminal. Check the IP, port, and that Valor Connect is enabled on the terminal, then try again.'
            )
          }
          discoveredSN = preTest.serialNumber
        } else {
          // No pre-test possible (USB is gated until the Valor VID lands), so we
          // cannot confirm the terminal is reachable — refuse to register.
          throw new Error(
            'A reachable IP address is required to register a Valor terminal over TCP.'
          )
        }

        // Store the IP in BOTH local_ip_address (surfaced as ip_address by the
        // station RPC, so the sale path works without a server change) AND the
        // valor_* columns (canonical config).
        const { data: terminalRow, error: termErr } = await supabase
          .from('payment_terminals')
          .insert({
            location_id: selectedStore.id,
            merchant_id: selectedStore.merchant_id,
            station_id: selectedStation.id,
            terminal_name: registerForm.name,
            terminal_type: 'valor',
            terminal_model: registerForm.model || null,
            register_id: 'VALOR',
            auth_key: 'VALOR',
            local_ip_address: localIp,
            local_port: localPort,
            valor_ip_address: localIp,
            valor_port: localPort ?? 5000,
            valor_cancel_port: cancelPort,
            valor_epi: registerForm.epi || null,
            connection_type: connectionType,
            is_active: true,
            is_connected: false,
            api_environment: 'production',
            serial_number: discoveredSN ?? null
          } as any)
          .select('id')
          .single()
        if (termErr) throw termErr
        newTerminalId = terminalRow.id
        // Deactivate other terminals at this station — otherwise the station
        // keeps >1 is_active=true row and the station RPC resolves the active
        // terminal ambiguously, flip-flopping the health-check target.
        await supabase
          .from('payment_terminals')
          .update({ is_active: false })
          .eq('station_id', selectedStation.id)
          .eq('is_active', true)
          .neq('id', newTerminalId)
        await loadTerminals(selectedStore.id)
        if (newTerminalId) {
          setActiveTerminal(newTerminalId)
          setSelectedStation({
            ...selectedStation,
            payment_terminal: {
              id: newTerminalId,
              terminal_name: registerForm.name,
              register_id: null,
              auth_key: null,
              terminal_type: 'valor',
              terminal_model: registerForm.model || null,
              is_connected: false,
              ip_address: localIp ?? undefined,
              port: localPort ?? 5000,
              cancel_port: cancelPort,
              epi: registerForm.epi || undefined,
              connection_type:
                connectionType === 'usb' ? 'usb' : 'local_socket',
              serial_number: discoveredSN ?? null,
              last_connection_status: null,
              last_connection_test_at: null
            }
          })
        }
      } else {
        const connectionType =
          registerForm.connectionType === 'usb' ? 'usb' : 'local'
        const localIp =
          registerForm.connectionType === 'local_socket'
            ? registerForm.ipAddress
            : null
        const localPort =
          registerForm.connectionType === 'local_socket'
            ? parseInt(registerForm.port, 10) || 8080
            : null

        // Pre-test on network terminals to get serial number before touching the DB.
        // This lets us upsert by SN instead of blindly creating duplicates.
        // For USB the wizard already ran getData and captured the SN —
        // use that directly instead of re-running a connection test.
        let discoveredSN: string | undefined
        if (
          registerForm.connectionType === 'local_socket' &&
          registerForm.ipAddress
        ) {
          const preTest = await testConnectionWithConfig({
            terminalId: `provisional-${selectedStation.id}`,
            terminalType: 'castles',
            ipAddress: registerForm.ipAddress,
            port: localPort ?? 8080
          })
          discoveredSN = preTest.serialNumber
        } else if (
          registerForm.connectionType === 'usb' &&
          registerForm.serialNumber
        ) {
          discoveredSN = registerForm.serialNumber
        }

        // If we have a serial number, check if this physical device is already registered.
        // Ordered .limit(1) instead of .maybeSingle() so we still pick a row to update
        // when legacy data already contains duplicates — otherwise the duplicate-row
        // PostgREST error makes us fall through to INSERT and compound the problem.
        let existingId: string | null = null
        if (discoveredSN) {
          const { data: existing } = await supabase
            .from('payment_terminals')
            .select('id')
            .eq('location_id', selectedStore.id)
            .eq('serial_number', discoveredSN)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          existingId = existing?.id ?? null
        }

        if (existingId) {
          // Same physical device already in DB — update it rather than creating a duplicate
          await supabase
            .from('payment_terminals')
            .update({
              terminal_name: registerForm.name,
              terminal_model: registerForm.model || null,
              local_ip_address: localIp,
              local_port: localPort,
              connection_type: connectionType,
              station_id: selectedStation.id,
              is_active: true,
              // Refresh SN if we discovered one (handles the case where an
              // old row had a stale or null serial_number).
              ...(discoveredSN ? { serial_number: discoveredSN } : {})
            })
            .eq('id', existingId)
          newTerminalId = existingId
        } else {
          // New device — insert with serial number already populated if we got it
          const { data: terminalRow, error: termErr } = await supabase
            .from('payment_terminals')
            .insert({
              location_id: selectedStore.id,
              merchant_id: selectedStore.merchant_id,
              station_id: selectedStation.id,
              terminal_name: registerForm.name,
              terminal_type: 'castles',
              terminal_model: registerForm.model || null,
              register_id: 'CASTLES',
              auth_key: 'CASTLES',
              local_ip_address: localIp,
              local_port: localPort,
              connection_type: connectionType,
              is_active: true,
              is_connected: false,
              api_environment: 'production',
              serial_number: discoveredSN ?? null
            })
            .select('id')
            .single()
          if (termErr) throw termErr
          newTerminalId = terminalRow.id
        }

        // Deactivate other terminals at this station
        await supabase
          .from('payment_terminals')
          .update({ is_active: false })
          .eq('station_id', selectedStation.id)
          .eq('is_active', true)
          .neq('id', newTerminalId)
        await loadTerminals(selectedStore.id)
        setActiveTerminal(newTerminalId!)
        setSelectedStation({
          ...selectedStation,
          payment_terminal: {
            id: newTerminalId!,
            terminal_name: registerForm.name,
            register_id: null,
            auth_key: null,
            terminal_type: 'castles',
            terminal_model: registerForm.model || null,
            is_connected: false,
            ip_address:
              registerForm.connectionType === 'local_socket'
                ? registerForm.ipAddress
                : undefined,
            port:
              registerForm.connectionType === 'local_socket'
                ? parseInt(registerForm.port, 10) || 8080
                : undefined,
            connection_type:
              registerForm.connectionType === 'usb' ? 'usb' : 'local_socket',
            // Paint the card with the wizard-discovered SN immediately so
            // staff aren't staring at "— not yet discovered —" until the
            // next testConnection finishes writing the SN to the DB.
            serial_number: discoveredSN ?? null,
            last_connection_status: null,
            last_connection_test_at: null
          }
        })
      }

      // Test after registration
      const testTargetId = newTerminalId || currentTerminal?.id
      if (testTargetId) {
        const online = await testConnection(testTargetId)
        if (selectedStation?.payment_terminal) {
          setSelectedStation({
            ...selectedStation,
            payment_terminal: {
              ...selectedStation.payment_terminal,
              is_connected: online,
              last_connection_status: online ? 'Online' : 'Offline',
              last_connection_test_at: new Date().toISOString()
            }
          })
        }
        toastService.show({
          title: online ? 'Terminal Online' : 'Terminal Registered (Offline)',
          message: online
            ? `${registerForm.name} is connected.`
            : `${registerForm.name} registered but offline.`,
          type: online ? 'success' : 'warning'
        })
      }

      setShowRegisterForm(false)
      setRegisterForm({
        name: '',
        tpn: '',
        authKey: '',
        model: '',
        environment: 'sandbox',
        ipAddress: '',
        port: '8080',
        connectionType: 'local_socket',
        serialNumber: '',
        cancelPort: '5001',
        epi: ''
      })
    } catch (err) {
      toastService.show({
        title: 'Registration Failed',
        message:
          err instanceof Error ? err.message : 'Failed to register terminal.',
        type: 'error'
      })
    } finally {
      setIsRegistering(false)
    }
  }

  const handleStartEdit = () => {
    if (!currentTerminal) return
    setEditForm({
      name: currentTerminal.terminal_name || '',
      model: currentTerminal.terminal_model || '',
      tpn: currentTerminal.register_id || '',
      authKey: '',
      ipAddress: currentTerminal.ip_address || '',
      port: String(
        currentTerminal.port ||
          (currentTerminal.terminal_type === 'valor' ? 5000 : 8080)
      ),
      connectionType: (currentTerminal.connection_type === 'usb'
        ? 'usb'
        : 'local_socket') as 'local_socket' | 'usb',
      cancelPort: String(currentTerminal.cancel_port || 5001),
      epi: currentTerminal.epi || ''
    })
    setIsEditingTerminal(true)
  }

  const handleSaveEdit = async () => {
    if (!currentTerminal || !selectedStore || !selectedStation) return
    setIsSavingEdit(true)
    try {
      const testResult = await testConnectionWithConfig({
        terminalId: currentTerminal.id,
        terminalType: currentTerminal.terminal_type as
          | 'castles'
          | 'dejavoo'
          | 'valor',
        ipAddress: editForm.ipAddress || undefined,
        port: editForm.port ? parseInt(editForm.port, 10) : undefined,
        cancelPort: editForm.cancelPort
          ? parseInt(editForm.cancelPort, 10)
          : undefined,
        epi: editForm.epi || undefined,
        tpn: editForm.tpn || undefined,
        authKey: editForm.authKey || undefined
      })

      const updatePayload: Record<string, any> = {
        terminal_name: editForm.name.trim(),
        terminal_model: editForm.model.trim() || null
      }
      if (currentTerminal.terminal_type === 'castles') {
        updatePayload.connection_type =
          editForm.connectionType === 'usb' ? 'usb' : 'local'
        updatePayload.local_ip_address =
          editForm.connectionType === 'local_socket'
            ? editForm.ipAddress.trim()
            : null
        updatePayload.local_port =
          editForm.connectionType === 'local_socket'
            ? parseInt(editForm.port, 10) || 8080
            : null
        if (testResult.serialNumber)
          updatePayload.serial_number = testResult.serialNumber
      } else if (currentTerminal.terminal_type === 'valor') {
        updatePayload.connection_type =
          editForm.connectionType === 'usb' ? 'usb' : 'local'
        const ip =
          editForm.connectionType === 'local_socket'
            ? editForm.ipAddress.trim()
            : null
        const port =
          editForm.connectionType === 'local_socket'
            ? parseInt(editForm.port, 10) || 5000
            : null
        updatePayload.local_ip_address = ip
        updatePayload.local_port = port
        updatePayload.valor_ip_address = ip
        updatePayload.valor_port = port ?? 5000
        updatePayload.valor_cancel_port = parseInt(editForm.cancelPort, 10) || 5001
        updatePayload.valor_epi = editForm.epi.trim() || null
        if (testResult.serialNumber)
          updatePayload.serial_number = testResult.serialNumber
      } else {
        updatePayload.tpn = editForm.tpn.trim()
        updatePayload.register_id = editForm.tpn.trim()
        if (editForm.authKey.trim())
          updatePayload.auth_key = editForm.authKey.trim()
      }

      const { error: dbErr } = await supabase
        .from('payment_terminals')
        .update(updatePayload)
        .eq('id', currentTerminal.id)
      if (dbErr) throw dbErr

      setSelectedStation({
        ...selectedStation,
        payment_terminal: {
          ...currentTerminal,
          terminal_name: editForm.name.trim(),
          terminal_model: editForm.model.trim() || null,
          ...(currentTerminal.terminal_type === 'castles'
            ? {
                ip_address:
                  editForm.connectionType === 'local_socket'
                    ? editForm.ipAddress.trim()
                    : undefined,
                port:
                  editForm.connectionType === 'local_socket'
                    ? parseInt(editForm.port, 10) || 8080
                    : undefined,
                connection_type:
                  editForm.connectionType === 'usb'
                    ? ('usb' as const)
                    : ('local_socket' as const)
              }
            : currentTerminal.terminal_type === 'valor'
              ? {
                  ip_address:
                    editForm.connectionType === 'local_socket'
                      ? editForm.ipAddress.trim()
                      : undefined,
                  port:
                    editForm.connectionType === 'local_socket'
                      ? parseInt(editForm.port, 10) || 5000
                      : undefined,
                  cancel_port: parseInt(editForm.cancelPort, 10) || 5001,
                  epi: editForm.epi.trim() || undefined,
                  connection_type:
                    editForm.connectionType === 'usb'
                      ? ('usb' as const)
                      : ('local_socket' as const)
                }
              : { register_id: editForm.tpn.trim() }),
          is_connected: testResult.success,
          last_connection_status: testResult.success ? 'Online' : 'Offline',
          last_connection_test_at: new Date().toISOString()
        }
      })

      await loadTerminals(selectedStore.id)
      setIsEditingTerminal(false)
      toastService.show({
        title: testResult.success ? 'Saved & Online' : 'Saved (Offline)',
        message: testResult.success
          ? 'Settings saved, terminal connected.'
          : 'Settings saved but terminal unreachable.',
        type: testResult.success ? 'success' : 'warning'
      })
    } catch (err) {
      toastService.show({
        title: 'Save Failed',
        message: err instanceof Error ? err.message : 'Failed to save.',
        type: 'error'
      })
    } finally {
      setIsSavingEdit(false)
    }
  }

  const isRegisterFormValid =
    registerFormType === 'dejavoo'
      ? !!(
          registerForm.name.trim() &&
          registerForm.tpn.trim() &&
          registerForm.authKey.trim()
        )
      : registerFormType === 'valor'
        ? !!(
            registerForm.name.trim() &&
            (registerForm.connectionType === 'usb' ||
              registerForm.ipAddress.trim()) &&
            registerForm.epi.trim()
          )
        : !!(
            registerForm.name.trim() &&
            (registerForm.connectionType === 'usb' ||
              registerForm.ipAddress.trim())
          )

  const isEditFormValid =
    currentTerminal?.terminal_type === 'castles'
      ? !!(
          editForm.name.trim() &&
          (editForm.connectionType === 'usb' || editForm.ipAddress.trim())
        )
      : currentTerminal?.terminal_type === 'valor'
        ? !!(
            editForm.name.trim() &&
            (editForm.connectionType === 'usb' || editForm.ipAddress.trim()) &&
            editForm.epi.trim()
          )
        : !!(editForm.name.trim() && editForm.tpn.trim())

  // ---------------------------------------------------------------------------
  // PRINTER HANDLERS
  // ---------------------------------------------------------------------------

  // Printers are location-level resources. Network printers (Star) are always visible.
  // Builtin printers are station-specific (they're physically on that device).
  const scopedPrinters = storedPrinters.filter(p => {
    if (p.connectionType === 'network') return true
    if (p.connectionType === 'builtin')
      return p.stationId === selectedStation?.id
    return true
  })

  // Auto-provision built-in Landi printer if hardware is present but no DB row exists.
  // Runs silently so the built-in is always available on Landi devices even after deletion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!capabilities?.hasBuiltinPrinter) return
    if (!selectedStation || !selectedStore) return
    if (
      scopedPrinters.some(p => p.printerType === 'builtin_landi' && p.isActive)
    )
      return
    addBuiltinPrinter(
      supabase,
      selectedStation.id,
      selectedStore.id,
      selectedStore.merchant_id,
      capabilities
    )
      .then(id => {
        if (id && selectedStore.id) fetchPrinters(selectedStore.id)
      })
      .catch(e =>
        console.warn('[DevicesConnections] Auto-provision built-in failed:', e)
      )
  }, [
    capabilities?.hasBuiltinPrinter,
    selectedStation?.id,
    selectedStore?.id,
    scopedPrinters.length
  ])

  const handleRetryConnection = async (printer: PrinterConfig) => {
    setRetryingPrinterId(printer.id)
    try {
      const result = await testPrinterConnection(supabase, printer)
      if (selectedStore?.id) await fetchPrinters(selectedStore.id)
      setAlertModal({
        success: result.online,
        title: result.online ? 'Printer Online' : 'Connection Failed',
        message: result.online
          ? `${printer.printerName} is connected and ready.`
          : `Could not reach ${printer.printerName}. ${
              result.error || 'Check power & network.'
            }`
      })
    } catch (e: any) {
      setAlertModal({
        success: false,
        title: 'Connection Failed',
        message: e.message || 'Unable to connect.'
      })
    } finally {
      setRetryingPrinterId(null)
    }
  }

  const handleTestPrint = async (printer: PrinterConfig) => {
    setTestPrintingId(printer.id)
    try {
      await PrinterService.printTestPage(printer)
    } catch (e) {
      console.warn('[DevicesConnections] Test print failed:', e)
    } finally {
      setTestPrintingId(null)
    }
  }

  const handleSavePrinterEdits = async (printerId: string) => {
    setIsSavingPrinter(true)
    try {
      const hasNameUpdate = draftPrinterEdits.printerName !== undefined
      const trimmedName = draftPrinterEdits.printerName?.trim()
      if (hasNameUpdate && !trimmedName) {
        Alert.alert('Invalid Name', 'Printer name cannot be empty.')
        return
      }

      const updatePayload = {
        ...draftPrinterEdits,
        ...(hasNameUpdate ? { printerName: trimmedName } : {})
      }

      await updatePrinterConfig(printerId, updatePayload)
      if (selectedStore?.id) await fetchPrinters(selectedStore.id)
      setEditingPrinterId(null)
      setDraftPrinterEdits({})
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update printer')
    } finally {
      setIsSavingPrinter(false)
    }
  }

  const handleDeletePrinter = (printer: PrinterConfig) => {
    Alert.alert(
      'Delete Printer?',
      `Remove "${printer.printerName}" permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePrinter(printer.id)
              setEditingPrinterId(null)
              if (selectedStore?.id) await fetchPrinters(selectedStore.id)
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete printer')
            }
          }
        }
      ]
    )
  }

  // ---------------------------------------------------------------------------
  // RECEIPT / KITCHEN ASSIGNMENT
  // ---------------------------------------------------------------------------

  // Receipt printer: station-level assignment stored in MMKV (per-device)
  const defaultReceiptPrinterId = useSettingsStore(
    s => s.defaultReceiptPrinterId
  )
  const setDefaultReceiptPrinterId = useSettingsStore(
    s => s.setDefaultReceiptPrinterId
  )
  const receiptPrinter = defaultReceiptPrinterId
    ? scopedPrinters.find(
        p => p.id === defaultReceiptPrinterId && p.isActive
      ) ?? null
    : null
  const kitchenPrinters = scopedPrinters.filter(
    p =>
      p.isActive &&
      (p.printerRole === 'kitchen' ||
        p.printerRole === 'bar' ||
        p.isDefaultKitchen)
  )
  const receiptCandidates = scopedPrinters.filter(
    p => p.isActive && p.printerRole !== 'label'
  )
  const kitchenCandidates = scopedPrinters.filter(
    p => p.isActive && !kitchenPrinters.some(k => k.id === p.id)
  )

  const openReceiptPicker = () => {
    setPendingReceiptId(receiptPrinter?.id ?? 'none')
    setShowReceiptPicker(true)
  }

  const handleApplyReceiptSelection = async () => {
    setShowReceiptPicker(false)
    try {
      // Station-level receipt assignment — stored locally in MMKV
      setDefaultReceiptPrinterId(
        pendingReceiptId === 'none' ? null : pendingReceiptId
      )
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update receipt printer')
    }
  }

  const handleAssignKitchenPrinter = async (printerId: string) => {
    setShowKitchenPicker(false)
    try {
      await updatePrinterConfig(printerId, { isDefaultKitchen: true })
      if (selectedStore?.id) await fetchPrinters(selectedStore.id)
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to assign kitchen printer')
    }
  }

  const handleRemoveKitchenPrinter = async (printerId: string) => {
    try {
      await updatePrinterConfig(printerId, { isDefaultKitchen: false })
      if (selectedStore?.id) await fetchPrinters(selectedStore.id)
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to remove kitchen printer')
    }
  }

  // ---------------------------------------------------------------------------
  // DISCOVERY HANDLERS
  // ---------------------------------------------------------------------------

  const handleScanStarPrinters = async () => {
    const SCAN_DURATION_S = 10
    setIsScanning(true)
    setStarScanError(null)
    setDiscoveredPrinters([])
    setScanSecondsRemaining(SCAN_DURATION_S)

    const countdownId = setInterval(() => {
      setScanSecondsRemaining(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownId)
          return null
        }
        return prev - 1
      })
    }, 1000)

    try {
      await discoverStarPrinters(SCAN_DURATION_S * 1000, {
        onPrinterFound: printer => addDiscoveredPrinter(printer)
      })
    } catch (e: any) {
      setStarScanError(e.message || 'Discovery failed')
    } finally {
      clearInterval(countdownId)
      setScanSecondsRemaining(null)
      setIsScanning(false)
    }
  }

  const handleProvisionStar = async (
    discovered: DiscoveredStarPrinter,
    roleOverride?: 'receipt' | 'kitchen' | 'both'
  ) => {
    if (!selectedStation || !selectedStore) return
    setProvisioningStarIp(discovered.ipAddress)
    try {
      const resolvedOverride =
        roleOverride ?? starRoleOverrides[discovered.ipAddress]
      const isBoth = resolvedOverride === 'both'
      const role: 'receipt' | 'kitchen' = isBoth
        ? 'receipt'
        : resolvedOverride ?? discovered.capabilities.suggestedRole
      const printerId = await addStarPrinter(
        supabase,
        selectedStation.id,
        selectedStore.id,
        selectedStore.merchant_id,
        discovered,
        role
      )
      if (printerId) {
        if (isBoth) {
          await updatePrinterConfig(printerId, { isDefaultKitchen: true })
        }
        await fetchPrinters(selectedStore.id)
        toastService.show({
          title: 'Printer Added',
          message: `${discovered.modelName} added as ${
            isBoth ? 'receipt + kitchen' : role
          }.`,
          type: 'success'
        })
      } else {
        toastService.show({
          title: 'Failed',
          message: 'Could not add printer.',
          type: 'error'
        })
      }
    } catch (e: any) {
      toastService.show({
        title: 'Error',
        message: e.message || 'Provisioning failed',
        type: 'error'
      })
    } finally {
      setProvisioningStarIp(null)
    }
  }

  const handleManualIpAdd = async () => {
    const ip = manualIp.trim()
    if (!ip || !selectedStation || !selectedStore) return
    if (!isValidIpv4(ip)) {
      setManualIpError('Invalid IP format.')
      return
    }
    // Printer already exists at location — no need to add again, just assign in receipt picker
    if (
      storedPrinters.some(
        p => p.printerType === 'star_micronics' && p.networkAddress === ip
      )
    ) {
      setManualIpError(
        'Printer already available at this location. Use the receipt picker to assign it.'
      )
      return
    }

    setIsProbing(true)
    setManualIpError(null)
    try {
      const discovered = await probeStarPrinterByIp(ip)
      const isBoth = manualIpRole === 'both'
      const provisionRole = isBoth ? 'receipt' : manualIpRole
      const printerId = await addStarPrinter(
        supabase,
        selectedStation.id,
        selectedStore.id,
        selectedStore.merchant_id,
        discovered,
        provisionRole
      )
      if (printerId) {
        if (isBoth) {
          await updatePrinterConfig(printerId, { isDefaultKitchen: true })
        }
        await fetchPrinters(selectedStore.id)
        setManualIp('')
        setManualIpError(null)
        toastService.show({
          title: 'Printer Added',
          message: `${discovered.modelName} at ${ip} added${
            isBoth ? ' as receipt + kitchen' : ''
          }.`,
          type: 'success'
        })
      } else {
        setManualIpError('Failed to add printer.')
      }
    } catch (e: any) {
      setManualIpError(e.message || 'Failed to connect')
    } finally {
      setIsProbing(false)
    }
  }

  const handleProvisionBuiltin = async () => {
    if (!selectedStation || !selectedStore || !capabilities) return
    setProvisioningBuiltin(true)
    try {
      const printerId = await addBuiltinPrinter(
        supabase,
        selectedStation.id,
        selectedStore.id,
        selectedStore.merchant_id,
        capabilities
      )
      if (printerId) {
        await fetchPrinters(selectedStore.id)
        toastService.show({
          title: 'Built-in Printer Added',
          message: 'Ready to print.',
          type: 'success'
        })
      }
    } catch (e: any) {
      toastService.show({ title: 'Error', message: e.message, type: 'error' })
    } finally {
      setProvisioningBuiltin(false)
    }
  }

  const handleProvisionDejavoo = async () => {
    if (!selectedStation || !selectedStore || !currentTerminal) return
    setProvisioningDejavoo(true)
    try {
      const printerId = await addDejavooPrinter(
        supabase,
        selectedStation.id,
        selectedStore.id,
        selectedStore.merchant_id,
        currentTerminal
      )
      if (printerId) {
        await fetchPrinters(selectedStore.id)
        toastService.show({
          title: 'Dejavoo Printer Added',
          message: 'Terminal printer ready.',
          type: 'success'
        })
      }
    } catch (e: any) {
      toastService.show({ title: 'Error', message: e.message, type: 'error' })
    } finally {
      setProvisioningDejavoo(false)
    }
  }

  // Cleanup discovery on unmount
  useEffect(
    () => () => {
      stopDiscovery()
    },
    []
  )

  // ---------------------------------------------------------------------------
  // DERIVED
  // ---------------------------------------------------------------------------

  const hasBuiltinPrinter = scopedPrinters.some(
    p => p.printerType === 'builtin_landi'
  )
  const hasDejavooPrinter = scopedPrinters.some(
    p => p.printerType === 'dejavoo_spin_p'
  )
  const builtinDetected = capabilities?.hasBuiltinPrinter && !hasBuiltinPrinter
  const dejavooDetected =
    currentTerminal?.terminal_type === 'dejavoo' && !hasDejavooPrinter
  const onlineCount = scopedPrinters.filter(
    p => p.isActive && p.isConnected
  ).length
  const totalActive = scopedPrinters.filter(p => p.isActive).length

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: 14,
        paddingVertical: 10
      }}
    >
      <View style={{ marginBottom: s(12), flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: s(16), fontWeight: '700', color: colors.heading }}
          >
            {mode === 'printers' ? 'Printer Settings' : 'Devices & Connections'}
          </Text>
          <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(2) }}>
            {mode === 'printers'
              ? 'Printer connection, receipt printing, and order printing.'
              : 'Station hardware, terminal, and printer management.'}
          </Text>
        </View>
        {mode !== 'printers' && (
          <View style={{ flexDirection: 'row', gap: s(6) }}>
            <TouchableOpacity
              onPress={() => setShowCastlesUsbSetup(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(6),
                paddingHorizontal: s(10),
                paddingVertical: s(6),
                borderRadius: s(8),
                borderWidth: 1,
                borderColor: colors.teal + '50',
                backgroundColor: colors.teal
              }}
            >
              <Usb size={s(13)} color='#fff' />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: s(12) }}>
                Set Up USB Terminal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/settings/usb-diagnostics' as never)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(6),
                paddingHorizontal: s(10),
                paddingVertical: s(6),
                borderRadius: s(8),
                borderWidth: 1,
                borderColor: colors.teal + '50',
                backgroundColor: colors.teal + '15'
              }}
            >
              <Usb size={s(13)} color={colors.teal} />
              <Text style={{ color: colors.teal, fontWeight: '600', fontSize: s(12) }}>
                USB Diagnostics
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View
        style={{ height: 1, backgroundColor: colors.border, marginBottom: s(16) }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ================================================================ */}
        {/* SECTION 1 — THIS STATION */}
        {/* ================================================================ */}
        {mode === 'all' && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(12),
            overflow: 'hidden'
          }}
        >
          <SectionHeader
            title='This Station'
            icon={<Smartphone size={s(20)} color={colors.teal} />}
            expanded={expandedSections.station}
            onToggle={() => toggleSection('station')}
            rightContent={
              <TouchableOpacity
                onPress={handleRefreshCapabilities}
                disabled={isRefreshingCaps}
                style={{ padding: s(4) }}
              >
                {isRefreshingCaps ? (
                  <ActivityIndicator size='small' color={colors.teal} />
                ) : (
                  <RefreshCw size={s(14)} color={colors.teal} />
                )}
              </TouchableOpacity>
            }
          />
          {expandedSections.station && (
            <View style={{ paddingHorizontal: s(12), paddingVertical: s(10) }}>
              {capabilities ? (
                <>
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: '700',
                      color: colors.heading,
                      marginBottom: s(8)
                    }}
                  >
                    {capabilities.manufacturer} {capabilities.model}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: s(8),
                      marginBottom: s(10)
                    }}
                  >
                    {[
                      {
                        label: 'Battery',
                        value: capabilities.batteryLevel
                          ? `${capabilities.batteryLevel}%`
                          : 'N/A'
                      },
                      {
                        label: 'Network',
                        value: capabilities.networkType ?? 'N/A'
                      },
                      {
                        label: 'IP',
                        value: capabilities.localIpAddress ?? 'N/A'
                      },
                      {
                        label: 'Version',
                        value: capabilities.appVersion ?? 'N/A'
                      }
                    ].map(item => (
                      <View
                        key={item.label}
                        style={{
                          backgroundColor: colors.card,
                          borderRadius: s(8),
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingHorizontal: s(10),
                          paddingVertical: s(6),
                          minWidth: s(120)
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(9),
                            color: colors.muted,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: s(0.5)
                          }}
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: s(12),
                            color: colors.heading,
                            fontWeight: '500',
                            marginTop: s(1)
                          }}
                        >
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6) }}
                  >
                    {[
                      {
                        label: 'Built-in Printer',
                        has: capabilities.hasBuiltinPrinter
                      },
                      { label: 'CFD', has: capabilities.hasBuiltinCfd },
                      {
                        label: 'Cash Drawer',
                        has: capabilities.hasCashDrawerPort
                      },
                      { label: 'NFC', has: capabilities.hasNfc },
                      { label: 'Scanner', has: capabilities.hasBarcodeScanner }
                    ]
                      .filter(f => f.has)
                      .map(f => (
                        <View
                          key={f.label}
                          style={{
                            backgroundColor: colors.success + '20',
                            borderWidth: 1,
                            borderColor: colors.success + '40',
                            borderRadius: s(6),
                            paddingHorizontal: s(8),
                            paddingVertical: s(3)
                          }}
                        >
                          <Text
                            style={{
                              fontSize: s(10),
                              fontWeight: '500',
                              color: colors.success
                            }}
                          >
                            {f.label}
                          </Text>
                        </View>
                      ))}
                  </View>
                </>
              ) : (
                <Text style={{ fontSize: s(12), color: colors.muted }}>
                  Detecting device capabilities...
                </Text>
              )}
            </View>
          )}
        </View>
        )}

        {/* ================================================================ */}
        {/* SECTION 2 — PAYMENT TERMINAL */}
        {/* ================================================================ */}
        {mode === 'all' && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(12),
            overflow: 'hidden'
          }}
        >
          <SectionHeader
            title='Payment Terminal'
            icon={<Radio size={s(20)} color={colors.teal} />}
            expanded={expandedSections.terminal}
            onToggle={() => toggleSection('terminal')}
          />
          {expandedSections.terminal && (
            <View style={{ paddingHorizontal: s(12), paddingVertical: s(10) }}>
              {showRegisterForm ? (
                // ── Register form ──
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: s(12)
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: s(8)
                      }}
                    >
                      <Plus size={s(16)} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.heading,
                          fontWeight: '700',
                          fontSize: s(13)
                        }}
                      >
                        Add Terminal
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setShowRegisterForm(false)
                        setQuickTestStatus('idle')
                      }}
                      style={{ padding: s(4) }}
                    >
                      <X size={s(18)} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  {/* Terminal type toggle (Castles / Valor) */}
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: s(8),
                      marginBottom: s(12)
                    }}
                  >
                    {(
                      [
                        { id: 'castles' as const, label: 'Castles' },
                        { id: 'valor' as const, label: 'Valor' }
                      ]
                    ).map(opt => {
                      const active = registerFormType === opt.id
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          onPress={() => {
                            setRegisterFormType(opt.id)
                            setQuickTestStatus('idle')
                            setRegisterForm(f => ({
                              ...f,
                              port: opt.id === 'valor' ? '5000' : '8080'
                            }))
                          }}
                          style={{
                            flex: 1,
                            borderRadius: s(8),
                            borderWidth: 1,
                            paddingVertical: s(10),
                            alignItems: 'center',
                            backgroundColor: active
                              ? colors.teal + '20'
                              : 'transparent',
                            borderColor: active
                              ? colors.teal + '50'
                              : colors.border
                          }}
                        >
                          <Text
                            style={{
                              fontWeight: '700',
                              fontSize: s(12),
                              color: active ? colors.teal : colors.muted
                            }}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  {/* Type header */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(12),
                      marginBottom: s(12),
                      paddingVertical: s(10),
                      paddingHorizontal: s(12),
                      borderRadius: s(8),
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      backgroundColor: colors.teal + '15'
                    }}
                  >
                    {registerFormType === 'castles' && (
                      <Image
                        source={require('@/assets/images/castles.jpg')}
                        style={{
                          width: s(36),
                          height: s(36),
                          borderRadius: s(6)
                        }}
                        resizeMode='cover'
                      />
                    )}
                    {registerFormType === 'valor' && (
                      <Image
                        source={require('@/assets/images/valorlogo.jpg')}
                        style={{
                          width: s(36),
                          height: s(36),
                          borderRadius: s(6)
                        }}
                        resizeMode='cover'
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: s(13),
                          fontWeight: '700',
                          color: colors.teal
                        }}
                      >
                        {registerFormType === 'valor'
                          ? 'Valor Terminal'
                          : 'Castles Terminal'}
                      </Text>
                      <Text
                        style={{
                          fontSize: s(11),
                          color: colors.muted,
                          marginTop: s(2)
                        }}
                      >
                        {registerFormType === 'valor'
                          ? 'Semi-integrated (TCP) payment terminal'
                          : 'Network (TCP) payment terminal'}
                      </Text>
                    </View>
                  </View>

                  {registerFormType === 'castles' || registerFormType === 'valor' ? (
                    <>
                      {/* Connection type selector — visibly tells the user
                          this terminal is wired (USB) or networked (TCP).
                          USB is pre-set by the Setup wizard but the user can
                          still flip it back to TCP for a network terminal. */}
                      <View style={{ marginBottom: s(8) }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: s(11),
                            marginBottom: s(6)
                          }}
                        >
                          Connection
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            backgroundColor: colors.screen,
                            borderRadius: s(8),
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: colors.border
                          }}
                        >
                          {([
                            { id: 'local_socket' as const, label: 'TCP / WiFi', Icon: Wifi },
                            { id: 'usb' as const, label: 'USB (wired)', Icon: Usb }
                          ]).map(opt => {
                            const active = registerForm.connectionType === opt.id
                            const Icon = opt.Icon
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                onPress={() =>
                                  setRegisterForm(f => ({ ...f, connectionType: opt.id }))
                                }
                                style={{
                                  flex: 1,
                                  paddingVertical: s(10),
                                  alignItems: 'center',
                                  flexDirection: 'row',
                                  justifyContent: 'center',
                                  gap: s(6),
                                  backgroundColor: active ? colors.teal + '20' : 'transparent'
                                }}
                              >
                                <Icon size={s(13)} color={active ? colors.teal : colors.muted} />
                                <Text
                                  style={{
                                    fontSize: s(12),
                                    fontWeight: '600',
                                    color: active ? colors.teal : colors.muted
                                  }}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      </View>

                      {/* IP / Port — only shown for TCP. USB is point-to-point
                          over the cable, no host needed; the wizard already
                          verified the device by VID/PID + handshake. */}
                      {registerForm.connectionType === 'local_socket' ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            gap: s(8),
                            marginBottom: s(8)
                          }}
                        >
                        <View style={{ flex: 3 }}>
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: s(11),
                              marginBottom: s(4)
                            }}
                          >
                            IP Address *
                          </Text>
                          <TextInput
                            value={registerForm.ipAddress}
                            onChangeText={v =>
                              setRegisterForm(f => ({ ...f, ipAddress: v }))
                            }
                            placeholder='192.168.1.100'
                            placeholderTextColor={colors.muted}
                            keyboardType='decimal-pad'
                            style={{
                              backgroundColor: colors.screen,
                              borderWidth: 1,
                              borderColor: colors.border,
                              borderRadius: s(8),
                              paddingHorizontal: s(12),
                              paddingVertical: s(10),
                              color: colors.heading,
                              fontSize: s(13)
                            }}
                          />
                        </View>
                        <View style={{ flex: 1.2 }}>
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: s(11),
                              marginBottom: s(4)
                            }}
                          >
                            Port
                          </Text>
                          <TextInput
                            value={registerForm.port}
                            onChangeText={v =>
                              setRegisterForm(f => ({ ...f, port: v }))
                            }
                            placeholder='8080'
                            placeholderTextColor={colors.muted}
                            keyboardType='number-pad'
                            style={{
                              backgroundColor: colors.screen,
                              borderWidth: 1,
                              borderColor: colors.border,
                              borderRadius: s(8),
                              paddingHorizontal: s(12),
                              paddingVertical: s(10),
                              color: colors.heading,
                              fontSize: s(13)
                            }}
                          />
                        </View>
                        </View>
                      ) : (
                        <View
                          style={{
                            padding: s(10),
                            marginBottom: s(8),
                            borderRadius: s(8),
                            borderWidth: 1,
                            borderColor: colors.teal + '40',
                            backgroundColor: colors.teal + '10',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: s(8)
                          }}
                        >
                          <Usb size={s(14)} color={colors.teal} />
                          <Text style={{ flex: 1, fontSize: s(11), color: colors.label, lineHeight: s(16) }}>
                            USB — no IP needed. The terminal is identified by USB device serial after the wizard handshake.
                          </Text>
                        </View>
                      )}
                      {/* Valor-only: cancel port (5001) + EPI */}
                      {registerFormType === 'valor' && (
                        <View
                          style={{
                            flexDirection: 'row',
                            gap: s(8),
                            marginBottom: s(8)
                          }}
                        >
                          {registerForm.connectionType === 'local_socket' && (
                            <View style={{ flex: 1.2 }}>
                              <Text
                                style={{
                                  color: colors.muted,
                                  fontSize: s(11),
                                  marginBottom: s(4)
                                }}
                              >
                                Cancel Port
                              </Text>
                              <TextInput
                                value={registerForm.cancelPort}
                                onChangeText={v =>
                                  setRegisterForm(f => ({ ...f, cancelPort: v }))
                                }
                                placeholder='5001'
                                placeholderTextColor={colors.muted}
                                keyboardType='number-pad'
                                style={{
                                  backgroundColor: colors.screen,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  borderRadius: s(8),
                                  paddingHorizontal: s(12),
                                  paddingVertical: s(10),
                                  color: colors.heading,
                                  fontSize: s(13)
                                }}
                              />
                            </View>
                          )}
                          <View style={{ flex: 3 }}>
                            <Text
                              style={{
                                color: colors.muted,
                                fontSize: s(11),
                                marginBottom: s(4)
                              }}
                            >
                              EPI *
                            </Text>
                            <TextInput
                              value={registerForm.epi}
                              onChangeText={v =>
                                setRegisterForm(f => ({ ...f, epi: v }))
                              }
                              placeholder='e.g. 2319900000'
                              placeholderTextColor={colors.muted}
                              keyboardType='number-pad'
                              style={{
                                backgroundColor: colors.screen,
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: s(8),
                                paddingHorizontal: s(12),
                                paddingVertical: s(10),
                                color: colors.heading,
                                fontSize: s(13)
                              }}
                            />
                          </View>
                        </View>
                      )}
                      <View style={{ marginBottom: s(12) }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: s(11),
                            marginBottom: s(4)
                          }}
                        >
                          Terminal Name *
                        </Text>
                        <TextInput
                          value={registerForm.name}
                          onChangeText={v =>
                            setRegisterForm(f => ({ ...f, name: v }))
                          }
                          placeholder='e.g. Front Counter'
                          placeholderTextColor={colors.muted}
                          style={{
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: s(8),
                            paddingHorizontal: s(12),
                            paddingVertical: s(10),
                            color: colors.heading,
                            fontSize: s(13)
                          }}
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      {[
                        {
                          key: 'name',
                          label: 'Terminal Name *',
                          placeholder: 'e.g. Front Counter'
                        },
                        {
                          key: 'tpn',
                          label: 'TPN *',
                          placeholder: 'Terminal Point Number'
                        },
                        {
                          key: 'authKey',
                          label: 'Auth Key *',
                          placeholder: 'Authentication Key',
                          secure: true
                        }
                      ].map(field => (
                        <View key={field.key} style={{ marginBottom: s(12) }}>
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: s(11),
                              marginBottom: s(4)
                            }}
                          >
                            {field.label}
                          </Text>
                          <TextInput
                            value={(registerForm as any)[field.key]}
                            onChangeText={v =>
                              setRegisterForm(f => ({ ...f, [field.key]: v }))
                            }
                            placeholder={field.placeholder}
                            placeholderTextColor={colors.muted}
                            secureTextEntry={field.secure}
                            style={{
                              backgroundColor: colors.screen,
                              borderWidth: 1,
                              borderColor: colors.border,
                              borderRadius: s(8),
                              paddingHorizontal: s(12),
                              paddingVertical: s(10),
                              color: colors.heading,
                              fontSize: s(13)
                            }}
                          />
                        </View>
                      ))}
                      <View style={{ marginBottom: s(12) }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: s(11),
                            marginBottom: s(6)
                          }}
                        >
                          Environment
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            backgroundColor: colors.screen,
                            borderRadius: s(8),
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: colors.border
                          }}
                        >
                          {(['sandbox', 'production'] as const).map(env => (
                            <TouchableOpacity
                              key={env}
                              onPress={() =>
                                setRegisterForm(f => ({
                                  ...f,
                                  environment: env
                                }))
                              }
                              style={{
                                flex: 1,
                                paddingVertical: s(10),
                                alignItems: 'center',
                                backgroundColor:
                                  registerForm.environment === env
                                    ? colors.teal + '20'
                                    : 'transparent'
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: s(13),
                                  fontWeight: '500',
                                  color:
                                    registerForm.environment === env
                                      ? colors.teal
                                      : colors.muted,
                                  textTransform: 'capitalize'
                                }}
                              >
                                {env}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </>
                  )}

                  <TouchableOpacity
                    onPress={handleRegisterTerminal}
                    disabled={!isRegisterFormValid || isRegistering}
                    style={{
                      paddingVertical: s(12),
                      borderRadius: s(10),
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      backgroundColor:
                        isRegisterFormValid && !isRegistering
                          ? colors.teal + '20'
                          : colors.screen,
                      borderWidth: 1,
                      borderColor:
                        isRegisterFormValid && !isRegistering
                          ? colors.teal + '50'
                          : colors.border
                    }}
                  >
                    {isRegistering ? (
                      <ActivityIndicator size='small' color={colors.teal} />
                    ) : (
                      <>
                        <Check
                          size={s(15)}
                          color={
                            isRegisterFormValid ? colors.teal : colors.muted
                          }
                        />
                        <Text
                          style={{
                            fontSize: s(13),
                            color: isRegisterFormValid
                              ? colors.teal
                              : colors.muted,
                            fontWeight: '700',
                            marginLeft: s(6)
                          }}
                        >
                          {registerFormType === 'dejavoo'
                            ? 'Register Terminal'
                            : 'Save & Connect'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : showTerminalPicker ? (
                // ── Terminal picker ──
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: s(16)
                    }}
                  >
                    <Text
                      style={{
                        color: colors.heading,
                        fontWeight: 'bold',
                        fontSize: s(14)
                      }}
                    >
                      Available Terminals
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(false)}
                    >
                      <Text style={{ color: colors.teal, fontSize: s(13) }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  {terminals.length === 0 ? (
                    <Text
                      style={{
                        color: colors.muted,
                        textAlign: 'center',
                        paddingVertical: s(16)
                      }}
                    >
                      No terminals found.
                    </Text>
                  ) : (
                    terminals.map(t => {
                      const isCurrent = t.id === currentTerminal?.id
                      const isOtherStation =
                        t.isActive &&
                        t.stationId &&
                        t.stationId !== selectedStation?.id
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() =>
                            !isCurrent && handleAssignTerminal(t)
                          }
                          disabled={isCurrent || isAssigning}
                          style={{
                            backgroundColor: isCurrent
                              ? colors.teal + '10'
                              : colors.screen,
                            paddingHorizontal: s(12),
                            paddingVertical: s(12),
                            borderRadius: s(8),
                            marginBottom: s(8),
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderWidth: 1,
                            borderColor: isCurrent
                              ? colors.teal + '50'
                              : colors.border,
                            opacity: 1
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              flex: 1
                            }}
                          >
                            <View
                              style={{
                                width: s(10),
                                height: s(10),
                                borderRadius: s(5),
                                marginRight: s(10),
                                backgroundColor: t.isConnected
                                  ? colors.success
                                  : colors.muted
                              }}
                            />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  color: colors.heading,
                                  fontWeight: '500',
                                  fontSize: s(12)
                                }}
                              >
                                {t.name}
                              </Text>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  marginTop: s(2),
                                  flexWrap: 'wrap',
                                  gap: s(4)
                                }}
                              >
                                <View
                                  style={{
                                    paddingHorizontal: s(6),
                                    paddingVertical: s(2),
                                    borderRadius: s(4),
                                    backgroundColor: colors.teal + '30'
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: s(10),
                                      fontWeight: '500',
                                      color: colors.teal
                                    }}
                                  >
                                    {t.terminalType === 'castles'
                                      ? 'Castles'
                                      : t.terminalType === 'valor'
                                        ? 'Valor'
                                        : 'Dejavoo'}
                                  </Text>
                                </View>
                                {/* Connection-type pill — USB vs TCP/WiFi. Helps staff
                                    tell at a glance whether this terminal needs the
                                    cable plugged or just network. */}
                                {t.terminalType === 'castles' && (
                                  <View
                                    style={{
                                      paddingHorizontal: s(6),
                                      paddingVertical: s(2),
                                      borderRadius: s(4),
                                      backgroundColor:
                                        t.connectionType === 'usb'
                                          ? colors.warning + '30'
                                          : colors.muted + '30',
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: s(3)
                                    }}
                                  >
                                    {t.connectionType === 'usb' ? (
                                      <Usb size={s(9)} color={colors.warning} />
                                    ) : (
                                      <Wifi size={s(9)} color={colors.muted} />
                                    )}
                                    <Text
                                      style={{
                                        fontSize: s(10),
                                        fontWeight: '600',
                                        color:
                                          t.connectionType === 'usb'
                                            ? colors.warning
                                            : colors.muted
                                      }}
                                    >
                                      {t.connectionType === 'usb' ? 'USB' : 'TCP'}
                                    </Text>
                                  </View>
                                )}
                                {t.model && (
                                  <Text
                                    style={{
                                      color: colors.muted,
                                      fontSize: s(10)
                                    }}
                                  >
                                    {t.model}
                                  </Text>
                                )}
                              </View>
                              {t.terminalType === 'castles' && (
                                <View style={{ marginTop: s(4), gap: s(2) }}>
                                  {(t as any).serialNumber && (
                                    <View
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center'
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: s(10),
                                          color: colors.muted,
                                          fontWeight: '600',
                                          width: s(44)
                                        }}
                                      >
                                        S/N:
                                      </Text>
                                      <Text
                                        style={{
                                          fontSize: s(10),
                                          color: colors.heading,
                                          fontFamily: 'monospace'
                                        }}
                                        selectable
                                      >
                                        {(t as any).serialNumber ?? '— not yet discovered —'}
                                      </Text>
                                    </View>
                                  )}
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: s(10),
                                        color: colors.muted,
                                        fontWeight: '600',
                                        width: s(44)
                                      }}
                                    >
                                      {t.connectionType === 'usb' ? 'Conn:' : 'Addr:'}
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: s(10),
                                        color: colors.heading,
                                        fontFamily: 'monospace'
                                      }}
                                      selectable
                                    >
                                      {t.connectionType === 'usb'
                                        ? 'USB · CDC ACM @ 115200'
                                        : `${t.ipAddress ?? '—'}${t.port ? `:${t.port}` : ''}`}
                                    </Text>
                                  </View>
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: s(10),
                                        color: colors.muted,
                                        fontWeight: '600',
                                        width: s(44)
                                      }}
                                    >
                                      ID:
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: s(10),
                                        color: colors.heading,
                                        fontFamily: 'monospace'
                                      }}
                                      selectable
                                    >
                                      {t.id.slice(0, 8)}
                                    </Text>
                                  </View>
                                </View>
                              )}
                            </View>
                          </View>
                          {isCurrent && (
                            <View
                              style={{
                                backgroundColor: colors.teal + '20',
                                paddingHorizontal: s(8),
                                paddingVertical: s(3),
                                borderRadius: s(4),
                                borderWidth: 1,
                                borderColor: colors.teal + '50'
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: s(10),
                                  color: colors.teal,
                                  fontWeight: '700'
                                }}
                              >
                                Current
                              </Text>
                            </View>
                          )}
                          {isOtherStation && (
                            <View
                              style={{
                                backgroundColor: colors.warning + '20',
                                paddingHorizontal: s(8),
                                paddingVertical: s(3),
                                borderRadius: s(4)
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.warning,
                                  fontSize: s(10),
                                  fontWeight: 'bold'
                                }}
                              >
                                Tap to move here
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      )
                    })
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setShowTerminalPicker(false)
                      setShowRegisterForm(true)
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: s(8),
                      paddingVertical: s(8)
                    }}
                  >
                    <Plus size={s(16)} color={colors.teal} />
                    <Text
                      style={{
                        color: colors.teal,
                        fontWeight: '500',
                        marginLeft: s(4),
                        fontSize: s(12)
                      }}
                    >
                      Register New Terminal
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : isEditingTerminal && currentTerminal ? (
                // ── Edit form ──
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: s(16)
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: s(8)
                      }}
                    >
                      <Pencil size={s(16)} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.heading,
                          fontWeight: 'bold',
                          fontSize: s(14)
                        }}
                      >
                        Edit Terminal
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: s(8),
                          paddingVertical: s(2),
                          borderRadius: s(4),
                          backgroundColor: colors.teal + '30'
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(11),
                            fontWeight: 'bold',
                            color: colors.teal
                          }}
                        >
                          {currentTerminal.terminal_type === 'castles'
                            ? 'Castles'
                            : 'Dejavoo'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setIsEditingTerminal(false)}
                      style={{ padding: s(4) }}
                    >
                      <X size={s(18)} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ marginBottom: s(12) }}>
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: s(11),
                        marginBottom: s(4)
                      }}
                    >
                      Terminal Name *
                    </Text>
                    <TextInput
                      value={editForm.name}
                      onChangeText={v => setEditForm(f => ({ ...f, name: v }))}
                      placeholder='e.g. Front Counter'
                      placeholderTextColor={colors.muted}
                      style={{
                        backgroundColor: colors.screen,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: s(8),
                        paddingHorizontal: s(12),
                        paddingVertical: s(10),
                        color: colors.heading,
                        fontSize: s(13)
                      }}
                    />
                  </View>

                  {currentTerminal.terminal_type === 'castles' && (
                    <>
                      {/* Connection type — same selector pattern as register. */}
                      <View style={{ marginBottom: s(12) }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: s(11),
                            marginBottom: s(6)
                          }}
                        >
                          Connection
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            backgroundColor: colors.screen,
                            borderRadius: s(8),
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: colors.border
                          }}
                        >
                          {([
                            { id: 'local_socket' as const, label: 'TCP / WiFi', Icon: Wifi },
                            { id: 'usb' as const, label: 'USB (wired)', Icon: Usb }
                          ]).map(opt => {
                            const active = editForm.connectionType === opt.id
                            const Icon = opt.Icon
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                onPress={() =>
                                  setEditForm(f => ({ ...f, connectionType: opt.id }))
                                }
                                style={{
                                  flex: 1,
                                  paddingVertical: s(10),
                                  alignItems: 'center',
                                  flexDirection: 'row',
                                  justifyContent: 'center',
                                  gap: s(6),
                                  backgroundColor: active ? colors.teal + '20' : 'transparent'
                                }}
                              >
                                <Icon size={s(13)} color={active ? colors.teal : colors.muted} />
                                <Text
                                  style={{
                                    fontSize: s(12),
                                    fontWeight: '600',
                                    color: active ? colors.teal : colors.muted
                                  }}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      </View>

                      {editForm.connectionType === 'local_socket' ? (
                        <View
                          style={{ flexDirection: 'row', gap: s(8), marginBottom: s(12) }}
                        >
                          <View style={{ flex: 3 }}>
                            <Text
                              style={{
                                color: colors.muted,
                                fontSize: s(11),
                                marginBottom: s(4)
                              }}
                            >
                              IP Address *
                            </Text>
                            <TextInput
                              value={editForm.ipAddress}
                              onChangeText={v =>
                                setEditForm(f => ({ ...f, ipAddress: v }))
                              }
                              placeholder='192.168.1.100'
                              placeholderTextColor={colors.muted}
                              keyboardType='decimal-pad'
                              style={{
                                backgroundColor: colors.screen,
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: s(8),
                                paddingHorizontal: s(12),
                                paddingVertical: s(10),
                                color: colors.heading,
                                fontSize: s(13)
                              }}
                            />
                          </View>
                          <View style={{ flex: 1.2 }}>
                            <Text
                              style={{
                                color: colors.muted,
                                fontSize: s(11),
                                marginBottom: s(4)
                              }}
                            >
                              Port
                            </Text>
                            <TextInput
                              value={editForm.port}
                              onChangeText={v =>
                                setEditForm(f => ({ ...f, port: v }))
                              }
                              placeholder='8080'
                              placeholderTextColor={colors.muted}
                              keyboardType='number-pad'
                              style={{
                                backgroundColor: colors.screen,
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: s(8),
                                paddingHorizontal: s(12),
                                paddingVertical: s(10),
                                color: colors.heading,
                                fontSize: s(13)
                              }}
                            />
                          </View>
                        </View>
                      ) : (
                        <View
                          style={{
                            padding: s(10),
                            marginBottom: s(12),
                            borderRadius: s(8),
                            borderWidth: 1,
                            borderColor: colors.teal + '40',
                            backgroundColor: colors.teal + '10',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: s(8)
                          }}
                        >
                          <Usb size={s(14)} color={colors.teal} />
                          <Text style={{ flex: 1, fontSize: s(11), color: colors.label, lineHeight: s(16) }}>
                            USB — no IP needed. The terminal is identified by USB device serial.
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                  {currentTerminal.terminal_type !== 'castles' && (
                    <>
                      <View style={{ marginBottom: s(12) }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: s(11),
                            marginBottom: s(4)
                          }}
                        >
                          TPN *
                        </Text>
                        <TextInput
                          value={editForm.tpn}
                          onChangeText={v =>
                            setEditForm(f => ({ ...f, tpn: v }))
                          }
                          placeholder='Terminal Point Number'
                          placeholderTextColor={colors.muted}
                          style={{
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: s(8),
                            paddingHorizontal: s(12),
                            paddingVertical: s(10),
                            color: colors.heading,
                            fontSize: s(13)
                          }}
                        />
                      </View>
                      <View style={{ marginBottom: s(12) }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: s(11),
                            marginBottom: s(4)
                          }}
                        >
                          Auth Key
                        </Text>
                        <TextInput
                          value={editForm.authKey}
                          onChangeText={v =>
                            setEditForm(f => ({ ...f, authKey: v }))
                          }
                          placeholder='Leave blank to keep current'
                          placeholderTextColor={colors.muted}
                          secureTextEntry
                          style={{
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: s(8),
                            paddingHorizontal: s(12),
                            paddingVertical: s(10),
                            color: colors.heading,
                            fontSize: s(13)
                          }}
                        />
                      </View>
                    </>
                  )}

                  <TouchableOpacity
                    onPress={handleSaveEdit}
                    disabled={!isEditFormValid || isSavingEdit}
                    style={{
                      paddingVertical: s(12),
                      borderRadius: s(10),
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      backgroundColor:
                        isEditFormValid && !isSavingEdit
                          ? colors.teal + '20'
                          : colors.screen,
                      borderWidth: 1,
                      borderColor:
                        isEditFormValid && !isSavingEdit
                          ? colors.teal + '50'
                          : colors.border
                    }}
                  >
                    {isSavingEdit ? (
                      <ActivityIndicator size='small' color={colors.teal} />
                    ) : (
                      <>
                        <Check
                          size={s(15)}
                          color={isEditFormValid ? colors.teal : colors.muted}
                        />
                        <Text
                          style={{
                            fontSize: s(13),
                            color: isEditFormValid ? colors.teal : colors.muted,
                            fontWeight: '700',
                            marginLeft: s(6)
                          }}
                        >
                          Save Changes
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : currentTerminal ? (
                // ── Terminal info card ──
                <View>
                  <View
                    style={{
                      borderRadius: s(12),
                      borderWidth: 1,
                      borderColor: currentTerminal.is_connected
                        ? colors.success + '40'
                        : colors.border,
                      marginBottom: s(12),
                      overflow: 'hidden'
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        paddingHorizontal: s(12),
                        paddingVertical: s(10)
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: s(6)
                          }}
                        >
                          <Text
                            style={{
                              color: colors.heading,
                              fontWeight: '700',
                              fontSize: s(13)
                            }}
                          >
                            {currentTerminal.terminal_name}
                          </Text>
                          <View
                            style={{
                              paddingHorizontal: s(6),
                              paddingVertical: s(2),
                              borderRadius: s(4),
                              backgroundColor: colors.teal + '20'
                            }}
                          >
                            <Text
                              style={{
                                fontSize: s(9),
                                fontWeight: '700',
                                color: colors.teal
                              }}
                            >
                              {currentTerminal.terminal_type === 'castles'
                                ? 'CASTLES'
                                : 'DEJAVOO'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ marginTop: s(4), gap: s(2) }}>
                          {currentTerminal.terminal_type === 'castles' ? (
                            <>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center'
                                }}
                              >
                                <Text
                                  style={{
                                    color: colors.muted,
                                    fontSize: s(9),
                                    fontWeight: '600',
                                    width: s(36)
                                  }}
                                >
                                  Addr:
                                </Text>
                                <Text
                                  style={{
                                    color: colors.heading,
                                    fontSize: s(9),
                                    fontFamily: 'monospace'
                                  }}
                                  selectable
                                >
                                  {currentTerminal.ip_address ?? '—'}
                                  {currentTerminal.ip_address
                                    ? `:${currentTerminal.port || 8080}`
                                    : ''}
                                </Text>
                              </View>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center'
                                }}
                              >
                                <Text
                                  style={{
                                    color: colors.muted,
                                    fontSize: s(9),
                                    fontWeight: '600',
                                    width: s(36)
                                  }}
                                >
                                  S/N:
                                </Text>
                                <Text
                                  style={{
                                    color: colors.heading,
                                    fontSize: s(9),
                                    fontFamily: 'monospace'
                                  }}
                                  selectable
                                >
                                  {currentTerminal.serial_number ??
                                    '— not yet discovered —'}
                                </Text>
                              </View>
                              {currentTerminal.terminal_model && (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center'
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: colors.muted,
                                      fontSize: s(9),
                                      fontWeight: '600',
                                      width: s(36)
                                    }}
                                  >
                                    Model:
                                  </Text>
                                  <Text
                                    style={{
                                      color: colors.heading,
                                      fontSize: s(9),
                                      fontFamily: 'monospace'
                                    }}
                                    selectable
                                  >
                                    {currentTerminal.terminal_model}
                                  </Text>
                                </View>
                              )}
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center'
                                }}
                              >
                                <Text
                                  style={{
                                    color: colors.muted,
                                    fontSize: s(9),
                                    fontWeight: '600',
                                    width: s(36)
                                  }}
                                >
                                  ID:
                                </Text>
                                <Text
                                  style={{
                                    color: colors.heading,
                                    fontSize: s(9),
                                    fontFamily: 'monospace'
                                  }}
                                  selectable
                                >
                                  {currentTerminal.id.slice(0, 8)}
                                </Text>
                              </View>
                            </>
                          ) : currentTerminal.register_id ? (
                            <Text style={{ color: colors.muted, fontSize: s(9) }}>
                              TPN: {currentTerminal.register_id}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      {(() => {
                        // While the singleton is mid-connect (auto-connect on
                        // plug/boot, pre-warm, or a test), show the live phase in
                        // teal; otherwise fall back to Online/Offline.
                        const statusColor = terminalConnectActivity
                          ? colors.teal
                          : currentTerminal.is_connected
                            ? colors.success
                            : colors.danger
                        return (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: s(4),
                              paddingHorizontal: s(8),
                              paddingVertical: s(4),
                              borderRadius: s(6),
                              maxWidth: s(200),
                              backgroundColor: statusColor + '15'
                            }}
                          >
                            <View
                              style={{
                                width: s(6),
                                height: s(6),
                                borderRadius: s(3),
                                backgroundColor: statusColor
                              }}
                            />
                            <Text
                              style={{
                                fontSize: s(10),
                                fontWeight: '600',
                                color: statusColor
                              }}
                              numberOfLines={1}
                            >
                              {terminalConnectActivity ??
                                (currentTerminal.is_connected
                                  ? 'Online'
                                  : 'Offline')}
                            </Text>
                          </View>
                        )
                      })()}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: s(6) }}>
                    <TouchableOpacity
                      onPress={handleTestConnection}
                      disabled={isTestingConnection}
                      style={{
                        flex: 1,
                        paddingVertical: s(8),
                        borderRadius: s(8),
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        borderWidth: 1,
                        backgroundColor: colors.teal + '20',
                        borderColor: colors.teal + '50'
                      }}
                    >
                      {isTestingConnection ? (
                        <>
                          <ActivityIndicator size='small' color={colors.teal} />
                          <Text
                            style={{
                              fontWeight: '600',
                              marginLeft: s(6),
                              fontSize: s(11),
                              color: colors.teal
                            }}
                            numberOfLines={1}
                          >
                            {terminalConnectActivity ?? 'Testing…'}
                          </Text>
                        </>
                      ) : (
                        <>
                          <RefreshCw size={s(13)} color={colors.teal} />
                          <Text
                            style={{
                              fontWeight: '600',
                              marginLeft: s(4),
                              fontSize: s(11),
                              color: colors.teal
                            }}
                          >
                            Test
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleStartEdit}
                      style={{
                        flex: 1,
                        backgroundColor: colors.teal + '20',
                        borderWidth: 1,
                        borderColor: colors.teal + '50',
                        paddingVertical: s(8),
                        borderRadius: s(8),
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center'
                      }}
                    >
                      <Pencil size={s(13)} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.teal,
                          fontWeight: '600',
                          marginLeft: s(4),
                          fontSize: s(11)
                        }}
                      >
                        Edit
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(true)}
                      style={{
                        flex: 1,
                        backgroundColor: colors.teal + '20',
                        borderWidth: 1,
                        borderColor: colors.teal + '50',
                        paddingVertical: s(8),
                        borderRadius: s(8),
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center'
                      }}
                    >
                      <CreditCard size={s(13)} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.teal,
                          fontWeight: '600',
                          marginLeft: s(4),
                          fontSize: s(11)
                        }}
                      >
                        Switch
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setShowRegisterForm(true)
                        setQuickTestStatus('idle')
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: colors.teal + '20',
                        borderWidth: 1,
                        borderColor: colors.teal + '50',
                        paddingVertical: s(8),
                        borderRadius: s(8),
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center'
                      }}
                    >
                      <Plus size={s(13)} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.teal,
                          fontWeight: '600',
                          marginLeft: s(4),
                          fontSize: s(11)
                        }}
                      >
                        Add
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // ── No terminal ──
                <View>
                  <View
                    style={{
                      backgroundColor: colors.screen,
                      borderRadius: s(12),
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: s(16),
                      paddingVertical: s(16),
                      marginBottom: s(16)
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: s(8),
                        marginBottom: s(12)
                      }}
                    >
                      <Wifi size={s(16)} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.heading,
                          fontWeight: '600',
                          fontSize: s(13)
                        }}
                      >
                        Quick Connect Test
                      </Text>
                    </View>
                    <View
                      style={{ flexDirection: 'row', gap: s(8), marginBottom: s(8) }}
                    >
                      <View style={{ flex: 3 }}>
                        <TextInput
                          value={quickTestIp}
                          onChangeText={v => {
                            setQuickTestIp(v)
                            setQuickTestStatus('idle')
                          }}
                          placeholder='192.168.1.100'
                          placeholderTextColor={colors.muted}
                          keyboardType='decimal-pad'
                          style={{
                            backgroundColor: colors.panel,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: s(8),
                            paddingHorizontal: s(12),
                            paddingVertical: s(10),
                            color: colors.heading,
                            fontSize: s(13),
                            fontFamily: 'monospace'
                          }}
                        />
                      </View>
                      <View style={{ flex: 1.2 }}>
                        <TextInput
                          value={quickTestPort}
                          onChangeText={setQuickTestPort}
                          placeholder='8080'
                          placeholderTextColor={colors.muted}
                          keyboardType='number-pad'
                          style={{
                            backgroundColor: colors.panel,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: s(8),
                            paddingHorizontal: s(12),
                            paddingVertical: s(10),
                            color: colors.heading,
                            fontSize: s(13)
                          }}
                        />
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={handleQuickTest}
                      disabled={
                        !quickTestIp.trim() || quickTestStatus === 'testing'
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: s(10),
                        borderRadius: s(8),
                        borderWidth: 1,
                        backgroundColor:
                          quickTestStatus === 'online'
                            ? colors.success + '15'
                            : quickTestStatus === 'offline'
                            ? colors.danger + '15'
                            : colors.teal + '15',
                        borderColor:
                          quickTestStatus === 'online'
                            ? colors.success + '50'
                            : quickTestStatus === 'offline'
                            ? colors.danger + '50'
                            : colors.teal + '50',
                        opacity: !quickTestIp.trim() ? 0.4 : 1
                      }}
                    >
                      {quickTestStatus === 'testing' ? (
                        <>
                          <ActivityIndicator size='small' color={colors.teal} />
                          <Text
                            style={{
                              color: colors.teal,
                              fontSize: s(13),
                              marginLeft: s(8)
                            }}
                          >
                            Testing...
                          </Text>
                        </>
                      ) : quickTestStatus === 'online' ? (
                        <>
                          <Check size={s(15)} color={colors.success} />
                          <Text
                            style={{
                              color: colors.success,
                              fontSize: s(13),
                              fontWeight: '600',
                              marginLeft: s(8)
                            }}
                          >
                            Reachable
                          </Text>
                        </>
                      ) : quickTestStatus === 'offline' ? (
                        <>
                          <WifiOff size={s(15)} color={colors.danger} />
                          <Text
                            style={{
                              color: colors.danger,
                              fontSize: s(13),
                              marginLeft: s(8)
                            }}
                          >
                            No response
                          </Text>
                        </>
                      ) : (
                        <>
                          <Wifi size={s(15)} color={colors.teal} />
                          <Text
                            style={{
                              color: colors.teal,
                              fontSize: s(13),
                              marginLeft: s(8)
                            }}
                          >
                            Test Connection
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', gap: s(12) }}>
                    {terminals.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setShowTerminalPicker(true)}
                        style={{
                          flex: 1,
                          backgroundColor: colors.teal + '20',
                          paddingVertical: s(12),
                          borderRadius: s(10),
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: colors.teal + '50'
                        }}
                      >
                        <CreditCard size={s(15)} color={colors.teal} />
                        <Text
                          style={{
                            fontSize: s(13),
                            color: colors.teal,
                            fontWeight: '700',
                            marginLeft: s(6)
                          }}
                        >
                          Assign Existing
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        setShowRegisterForm(true)
                        setQuickTestStatus('idle')
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: colors.screen,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingVertical: s(12),
                        borderRadius: s(10),
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Plus size={s(15)} color={colors.teal} />
                      <Text
                        style={{
                          fontSize: s(13),
                          color: colors.teal,
                          fontWeight: '700',
                          marginLeft: s(6)
                        }}
                      >
                        Register New
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
        )}

        {/* ================================================================ */}
        {/* PRINTERS — POINTER CARD                                           */}
        {/* Printer setup, discovery, and routing live on /settings/printers   */}
        {/* now. This card keeps Devices & Connections focused on terminals,   */}
        {/* CFD, and built-in capabilities.                                    */}
        {/* ================================================================ */}
        <TouchableOpacity
          onPress={() => router.push('/settings/printers')}
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(12),
            padding: s(14),
            flexDirection: 'row',
            alignItems: 'center'
          }}
        >
          <View
            style={{
              width: s(32),
              height: s(32),
              backgroundColor: colors.teal + '15',
              borderRadius: s(8),
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: s(12)
            }}
          >
            <Printer size={s(18)} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: s(13), fontWeight: '700', color: colors.heading, marginBottom: s(2) }}
            >
              Printers
            </Text>
            <Text style={{ fontSize: s(11), color: colors.muted }}>
              Manage printers, discovery, and routing in Settings → Printers
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: s(10),
              paddingVertical: s(6),
              borderRadius: s(8),
              backgroundColor: colors.teal + '15',
              borderWidth: 1,
              borderColor: colors.teal + '40'
            }}
          >
            <Text style={{ fontSize: s(11), fontWeight: '700', color: colors.teal }}>Open</Text>
          </View>
        </TouchableOpacity>

        {/* ------------------------------------------------------------------ */}
        {/* APP UPDATES SECTION                                                 */}
        {/* ------------------------------------------------------------------ */}
        {mode === 'all' && Platform.OS === 'android' && (
          <View
            style={{
              marginTop: s(16),
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            <SectionHeader
              title='App Updates'
              icon={<RefreshCw size={s(16)} color={colors.teal} />}
              expanded={expandedSections.appUpdates}
              onToggle={() => toggleSection('appUpdates')}
            />
            {expandedSections.appUpdates && (
              <View
                style={{ backgroundColor: colors.card, padding: s(14), gap: s(12) }}
              >
                {/* Version row */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ fontSize: s(12), color: colors.label }}>
                    Current Version
                  </Text>
                  <TouchableOpacity
                    activeOpacity={1}
                    onLongPress={handleExportTelemetry}
                    delayLongPress={600}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: '600',
                        color: colors.heading,
                        fontFamily: 'monospace'
                      }}
                    >
                      {currentVersion}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Last checked row */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ fontSize: s(12), color: colors.label }}>
                    Last Checked
                  </Text>
                  <Text style={{ fontSize: s(12), color: colors.muted }}>
                    {lastChecked ? lastChecked.toLocaleTimeString() : '—'}
                  </Text>
                </View>

                {/* Check button */}
                <TouchableOpacity
                  onPress={handleCheckForUpdate}
                  disabled={isCheckingUpdate}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: s(6),
                    paddingVertical: s(10),
                    borderRadius: s(8),
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50',
                    opacity: isCheckingUpdate ? 0.6 : 1
                  }}
                >
                  {isCheckingUpdate ? (
                    <ActivityIndicator size='small' color={colors.teal} />
                  ) : (
                    <RefreshCw size={s(14)} color={colors.teal} />
                  )}
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: '600',
                      color: colors.teal
                    }}
                  >
                    {isCheckingUpdate ? 'Checking…' : 'Check for Updates'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={{ height: s(40) }} />
      </ScrollView>

      {/* Native APK Update Modal */}
      {nativeUpdateManifest && (
        <AppUpdateModal
          visible={true}
          manifest={nativeUpdateManifest}
          onSkip={() => setNativeUpdateManifest(null)}
          onInstallComplete={() => setNativeUpdateManifest(null)}
        />
      )}

      {/* Routing Modal */}
      {routingModalPrinter && (
        <PrinterRoutingModal
          visible={!!routingModalPrinter}
          onClose={() => setRoutingModalPrinter(null)}
          printer={routingModalPrinter}
        />
      )}

      {/* Castles USB Setup — detect + permission + handshake before register */}
      <CastlesUsbSetupSheet
        visible={showCastlesUsbSetup}
        onCancel={() => setShowCastlesUsbSetup(false)}
        onVerified={(payload: CastlesUsbVerifiedPayload) => {
          setShowCastlesUsbSetup(false)
          // Pre-fill the existing register form so the user only has to confirm
          // a name + auth credentials — name, model, and connection type come
          // straight from the verified device.
          setRegisterFormType('castles')
          // Prefer the SN reported by the terminal app's getData (more
          // authoritative than the USB descriptor's serial). Fall back to
          // the USB-descriptor serial if the terminal didn't report one.
          const sn = payload.terminalSerial || payload.serialNumber || ''
          setRegisterForm(f => ({
            ...f,
            name: payload.productName || 'Castles Saturn1000',
            model: payload.productName || 'Saturn1000',
            connectionType: 'usb',
            ipAddress: '',
            port: '8080',
            serialNumber: sn
          }))
          setShowRegisterForm(true)
          toastService.show({
            title: 'USB Terminal Verified',
            message: `${payload.firmwareVersion ? `Firmware ${payload.firmwareVersion}. ` : ''}Complete registration below.`,
            type: 'success'
          })
        }}
      />


      {/* Alert Modal */}
      <Modal
        visible={!!alertModal}
        transparent
        animationType='fade'
        onRequestClose={() => setAlertModal(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <View
            style={{
              width: s(320),
              backgroundColor: colors.panel,
              borderRadius: s(14),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                height: 4,
                backgroundColor: alertModal?.success
                  ? colors.teal
                  : colors.danger
              }}
            />
            <View style={{ padding: s(20) }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(10),
                  marginBottom: s(10)
                }}
              >
                <View
                  style={{
                    width: s(32),
                    height: s(32),
                    borderRadius: s(8),
                    backgroundColor:
                      (alertModal?.success ? colors.teal : colors.danger) +
                      '20',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {alertModal?.success ? (
                    <Printer size={s(16)} color={colors.teal} />
                  ) : (
                    <AlertTriangle size={s(16)} color={colors.danger} />
                  )}
                </View>
                <Text
                  style={{
                    fontSize: s(14),
                    fontWeight: '700',
                    color: colors.heading,
                    flex: 1
                  }}
                >
                  {alertModal?.title}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: s(12),
                  color: colors.label,
                  lineHeight: s(18),
                  marginBottom: s(20)
                }}
              >
                {alertModal?.message}
              </Text>
              <TouchableOpacity
                onPress={() => setAlertModal(null)}
                style={{
                  paddingVertical: s(9),
                  borderRadius: s(8),
                  alignItems: 'center',
                  backgroundColor:
                    (alertModal?.success ? colors.teal : colors.danger) + '20',
                  borderWidth: 1,
                  borderColor:
                    (alertModal?.success ? colors.teal : colors.danger) + '50'
                }}
              >
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: '600',
                    color: alertModal?.success ? colors.teal : colors.danger
                  }}
                >
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

export default DevicesConnectionsScreen
