import AppUpdateModal from '@/components/AppUpdateModal'
import { CastlesUsbSetupSheet, type CastlesUsbVerifiedPayload } from '@/components/settings/CastlesUsbSetupSheet'
import { isValidIpv4 } from '@/components/settings/ManualIpPanel'
import { PrinterRoutingModal } from '@/components/settings/PrinterRoutingModal'
import { usePaymentTerminal } from '@/hooks/usePaymentTerminal'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { useTerminalStatus } from '@/hooks/useTerminalStatus'
import { colors } from '@/lib/theme'
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
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        backgroundColor: colors.panel,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomWidth: expanded ? 1 : 0,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View
          style={{
            width: 32,
            height: 32,
            backgroundColor: colors.teal + '15',
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10
          }}
        >
          {icon}
        </View>
        <Text
          style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
        >
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {rightContent}
        {expanded ? (
          <ChevronUp size={16} color={colors.label} />
        ) : (
          <ChevronDown size={16} color={colors.label} />
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
    'dejavoo' | 'castles'
  >('castles')
  const [registerForm, setRegisterForm] = useState({
    name: '',
    tpn: '',
    authKey: '',
    model: '',
    environment: 'sandbox' as 'sandbox' | 'production',
    ipAddress: '',
    port: '8080',
    connectionType: 'local_socket' as 'local_socket' | 'usb'
  })
  const [isEditingTerminal, setIsEditingTerminal] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    model: '',
    tpn: '',
    authKey: '',
    ipAddress: '',
    port: '8080',
    connectionType: 'local_socket' as 'local_socket' | 'usb'
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
      currentTerminal.serial_number ?? fullRecord.serialNumber ?? null
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
        }

        // If we have a serial number, check if this physical device is already registered
        let existingId: string | null = null
        if (discoveredSN) {
          const { data: existing } = await supabase
            .from('payment_terminals')
            .select('id')
            .eq('location_id', selectedStore.id)
            .eq('serial_number', discoveredSN)
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
              is_active: true
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
        connectionType: 'local_socket'
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
      port: String(currentTerminal.port || 8080),
      connectionType: (currentTerminal.connection_type === 'usb'
        ? 'usb'
        : 'local_socket') as 'local_socket' | 'usb'
    })
    setIsEditingTerminal(true)
  }

  const handleSaveEdit = async () => {
    if (!currentTerminal || !selectedStore || !selectedStation) return
    setIsSavingEdit(true)
    try {
      const testResult = await testConnectionWithConfig({
        terminalId: currentTerminal.id,
        terminalType: currentTerminal.terminal_type as 'castles' | 'dejavoo',
        ipAddress: editForm.ipAddress || undefined,
        port: editForm.port ? parseInt(editForm.port, 10) : undefined,
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
      <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}
          >
            {mode === 'printers' ? 'Printer Settings' : 'Devices & Connections'}
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>
            {mode === 'printers'
              ? 'Printer connection, receipt printing, and order printing.'
              : 'Station hardware, terminal, and printer management.'}
          </Text>
        </View>
        {mode !== 'printers' && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={() => setShowCastlesUsbSetup(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal + '50',
                backgroundColor: colors.teal
              }}
            >
              <Usb size={13} color='#fff' />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>
                Set Up USB Terminal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/settings/usb-diagnostics' as never)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal + '50',
                backgroundColor: colors.teal + '15'
              }}
            >
              <Usb size={13} color={colors.teal} />
              <Text style={{ color: colors.teal, fontWeight: '600', fontSize: 12 }}>
                USB Diagnostics
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View
        style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ================================================================ */}
        {/* SECTION 1 — THIS STATION */}
        {/* ================================================================ */}
        {mode === 'all' && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: 'hidden'
          }}
        >
          <SectionHeader
            title='This Station'
            icon={<Smartphone size={20} color={colors.teal} />}
            expanded={expandedSections.station}
            onToggle={() => toggleSection('station')}
            rightContent={
              <TouchableOpacity
                onPress={handleRefreshCapabilities}
                disabled={isRefreshingCaps}
                style={{ padding: 4 }}
              >
                {isRefreshingCaps ? (
                  <ActivityIndicator size='small' color={colors.teal} />
                ) : (
                  <RefreshCw size={14} color={colors.teal} />
                )}
              </TouchableOpacity>
            }
          />
          {expandedSections.station && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              {capabilities ? (
                <>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: colors.heading,
                      marginBottom: 8
                    }}
                  >
                    {capabilities.manufacturer} {capabilities.model}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 10
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
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          minWidth: 120
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            color: colors.muted,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: 0.5
                          }}
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.heading,
                            fontWeight: '500',
                            marginTop: 1
                          }}
                        >
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
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
                            borderRadius: 6,
                            paddingHorizontal: 8,
                            paddingVertical: 3
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
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
                <Text style={{ fontSize: 12, color: colors.muted }}>
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
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: 'hidden'
          }}
        >
          <SectionHeader
            title='Payment Terminal'
            icon={<Radio size={20} color={colors.teal} />}
            expanded={expandedSections.terminal}
            onToggle={() => toggleSection('terminal')}
          />
          {expandedSections.terminal && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              {showRegisterForm ? (
                // ── Register form ──
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <Plus size={16} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.heading,
                          fontWeight: '700',
                          fontSize: 13
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
                      style={{ padding: 4 }}
                    >
                      <X size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  {/* Castles-only header */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      backgroundColor: colors.teal + '15'
                    }}
                  >
                    <Image
                      source={require('@/assets/images/castles.jpg')}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6
                      }}
                      resizeMode='cover'
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          color: colors.teal
                        }}
                      >
                        Castles Terminal
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.muted,
                          marginTop: 2
                        }}
                      >
                        Network (TCP) payment terminal
                      </Text>
                    </View>
                  </View>

                  {registerFormType === 'castles' ? (
                    <>
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: 8,
                          marginBottom: 8
                        }}
                      >
                        <View style={{ flex: 3 }}>
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: 11,
                              marginBottom: 4
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
                              borderRadius: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              color: colors.heading,
                              fontSize: 13
                            }}
                          />
                        </View>
                        <View style={{ flex: 1.2 }}>
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: 11,
                              marginBottom: 4
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
                              borderRadius: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              color: colors.heading,
                              fontSize: 13
                            }}
                          />
                        </View>
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: 11,
                            marginBottom: 4
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
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: colors.heading,
                            fontSize: 13
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
                        <View key={field.key} style={{ marginBottom: 12 }}>
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: 11,
                              marginBottom: 4
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
                              borderRadius: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              color: colors.heading,
                              fontSize: 13
                            }}
                          />
                        </View>
                      ))}
                      <View style={{ marginBottom: 12 }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: 11,
                            marginBottom: 6
                          }}
                        >
                          Environment
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            backgroundColor: colors.screen,
                            borderRadius: 8,
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
                                paddingVertical: 10,
                                alignItems: 'center',
                                backgroundColor:
                                  registerForm.environment === env
                                    ? colors.teal + '20'
                                    : 'transparent'
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 13,
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
                      paddingVertical: 12,
                      borderRadius: 10,
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
                          size={15}
                          color={
                            isRegisterFormValid ? colors.teal : colors.muted
                          }
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            color: isRegisterFormValid
                              ? colors.teal
                              : colors.muted,
                            fontWeight: '700',
                            marginLeft: 6
                          }}
                        >
                          {registerFormType === 'castles'
                            ? 'Save & Connect'
                            : 'Register Terminal'}
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
                      marginBottom: 16
                    }}
                  >
                    <Text
                      style={{
                        color: colors.heading,
                        fontWeight: 'bold',
                        fontSize: 14
                      }}
                    >
                      Available Terminals
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(false)}
                    >
                      <Text style={{ color: colors.teal }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  {terminals.length === 0 ? (
                    <Text
                      style={{
                        color: colors.muted,
                        textAlign: 'center',
                        paddingVertical: 16
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
                            !isCurrent &&
                            !isOtherStation &&
                            handleAssignTerminal(t)
                          }
                          disabled={
                            isCurrent || isAssigning || !!isOtherStation
                          }
                          style={{
                            backgroundColor: isCurrent
                              ? colors.teal + '10'
                              : colors.screen,
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderWidth: 1,
                            borderColor: isCurrent
                              ? colors.teal + '50'
                              : colors.border,
                            opacity: isOtherStation ? 0.5 : 1
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
                                width: 10,
                                height: 10,
                                borderRadius: 5,
                                marginRight: 10,
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
                                  fontSize: 12
                                }}
                              >
                                {t.name}
                              </Text>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  marginTop: 2
                                }}
                              >
                                <View
                                  style={{
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                    backgroundColor: colors.teal + '30',
                                    marginRight: 6
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 10,
                                      fontWeight: '500',
                                      color: colors.teal
                                    }}
                                  >
                                    {t.terminalType === 'castles'
                                      ? 'Castles'
                                      : 'Dejavoo'}
                                  </Text>
                                </View>
                                {t.model && (
                                  <Text
                                    style={{
                                      color: colors.muted,
                                      fontSize: 10
                                    }}
                                  >
                                    {t.model}
                                  </Text>
                                )}
                              </View>
                              {t.terminalType === 'castles' && (
                                <View style={{ marginTop: 4, gap: 2 }}>
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        color: colors.muted,
                                        fontWeight: '600',
                                        width: 44
                                      }}
                                    >
                                      S/N:
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        color: colors.heading,
                                        fontFamily: 'monospace'
                                      }}
                                      selectable
                                    >
                                      {t.serialNumber ?? '— not yet discovered —'}
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
                                        fontSize: 10,
                                        color: colors.muted,
                                        fontWeight: '600',
                                        width: 44
                                      }}
                                    >
                                      Addr:
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        color: colors.heading,
                                        fontFamily: 'monospace'
                                      }}
                                      selectable
                                    >
                                      {t.ipAddress ?? '—'}
                                      {t.port ? `:${t.port}` : ''}
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
                                        fontSize: 10,
                                        color: colors.muted,
                                        fontWeight: '600',
                                        width: 44
                                      }}
                                    >
                                      ID:
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 10,
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
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 4,
                                borderWidth: 1,
                                borderColor: colors.teal + '50'
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
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
                                backgroundColor: colors.border,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 4
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.label,
                                  fontSize: 10,
                                  fontWeight: 'bold'
                                }}
                              >
                                In Use
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
                      marginTop: 8,
                      paddingVertical: 8
                    }}
                  >
                    <Plus size={16} color={colors.teal} />
                    <Text
                      style={{
                        color: colors.teal,
                        fontWeight: '500',
                        marginLeft: 4
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
                      marginBottom: 16
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <Pencil size={16} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.heading,
                          fontWeight: 'bold',
                          fontSize: 14
                        }}
                      >
                        Edit Terminal
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 4,
                          backgroundColor: colors.teal + '30'
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
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
                      style={{ padding: 4 }}
                    >
                      <X size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ marginBottom: 12 }}>
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 11,
                        marginBottom: 4
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
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: colors.heading,
                        fontSize: 13
                      }}
                    />
                  </View>

                  {currentTerminal.terminal_type === 'castles' && (
                    <View
                      style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}
                    >
                      <View style={{ flex: 3 }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: 11,
                            marginBottom: 4
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
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: colors.heading,
                            fontSize: 13
                          }}
                        />
                      </View>
                      <View style={{ flex: 1.2 }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: 11,
                            marginBottom: 4
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
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: colors.heading,
                            fontSize: 13
                          }}
                        />
                      </View>
                    </View>
                  )}
                  {currentTerminal.terminal_type !== 'castles' && (
                    <>
                      <View style={{ marginBottom: 12 }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: 11,
                            marginBottom: 4
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
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: colors.heading,
                            fontSize: 13
                          }}
                        />
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: 11,
                            marginBottom: 4
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
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: colors.heading,
                            fontSize: 13
                          }}
                        />
                      </View>
                    </>
                  )}

                  <TouchableOpacity
                    onPress={handleSaveEdit}
                    disabled={!isEditFormValid || isSavingEdit}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 10,
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
                          size={15}
                          color={isEditFormValid ? colors.teal : colors.muted}
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            color: isEditFormValid ? colors.teal : colors.muted,
                            fontWeight: '700',
                            marginLeft: 6
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
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: currentTerminal.is_connected
                        ? colors.success + '40'
                        : colors.border,
                      marginBottom: 12,
                      overflow: 'hidden'
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        paddingHorizontal: 12,
                        paddingVertical: 10
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <Text
                            style={{
                              color: colors.heading,
                              fontWeight: '700',
                              fontSize: 13
                            }}
                          >
                            {currentTerminal.terminal_name}
                          </Text>
                          <View
                            style={{
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4,
                              backgroundColor: colors.teal + '20'
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 9,
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
                        <View style={{ marginTop: 4, gap: 2 }}>
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
                                    fontSize: 9,
                                    fontWeight: '600',
                                    width: 36
                                  }}
                                >
                                  Addr:
                                </Text>
                                <Text
                                  style={{
                                    color: colors.heading,
                                    fontSize: 9,
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
                                    fontSize: 9,
                                    fontWeight: '600',
                                    width: 36
                                  }}
                                >
                                  S/N:
                                </Text>
                                <Text
                                  style={{
                                    color: colors.heading,
                                    fontSize: 9,
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
                                      fontSize: 9,
                                      fontWeight: '600',
                                      width: 36
                                    }}
                                  >
                                    Model:
                                  </Text>
                                  <Text
                                    style={{
                                      color: colors.heading,
                                      fontSize: 9,
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
                                    fontSize: 9,
                                    fontWeight: '600',
                                    width: 36
                                  }}
                                >
                                  ID:
                                </Text>
                                <Text
                                  style={{
                                    color: colors.heading,
                                    fontSize: 9,
                                    fontFamily: 'monospace'
                                  }}
                                  selectable
                                >
                                  {currentTerminal.id.slice(0, 8)}
                                </Text>
                              </View>
                            </>
                          ) : currentTerminal.register_id ? (
                            <Text style={{ color: colors.muted, fontSize: 9 }}>
                              TPN: {currentTerminal.register_id}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                          backgroundColor: currentTerminal.is_connected
                            ? colors.success + '15'
                            : colors.danger + '15'
                        }}
                      >
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: currentTerminal.is_connected
                              ? colors.success
                              : colors.danger
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: currentTerminal.is_connected
                              ? colors.success
                              : colors.danger
                          }}
                        >
                          {currentTerminal.is_connected ? 'Online' : 'Offline'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      onPress={handleTestConnection}
                      disabled={isTestingConnection}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        borderWidth: 1,
                        backgroundColor: colors.teal + '20',
                        borderColor: colors.teal + '50'
                      }}
                    >
                      {isTestingConnection ? (
                        <ActivityIndicator size='small' color={colors.teal} />
                      ) : (
                        <>
                          <RefreshCw size={13} color={colors.teal} />
                          <Text
                            style={{
                              fontWeight: '600',
                              marginLeft: 4,
                              fontSize: 11,
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
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center'
                      }}
                    >
                      <Pencil size={13} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.teal,
                          fontWeight: '600',
                          marginLeft: 4,
                          fontSize: 11
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
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center'
                      }}
                    >
                      <CreditCard size={13} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.teal,
                          fontWeight: '600',
                          marginLeft: 4,
                          fontSize: 11
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
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center'
                      }}
                    >
                      <Plus size={13} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.teal,
                          fontWeight: '600',
                          marginLeft: 4,
                          fontSize: 11
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
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      marginBottom: 16
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 12
                      }}
                    >
                      <Wifi size={16} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.heading,
                          fontWeight: '600',
                          fontSize: 13
                        }}
                      >
                        Quick Connect Test
                      </Text>
                    </View>
                    <View
                      style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}
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
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: colors.heading,
                            fontSize: 13,
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
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: colors.heading,
                            fontSize: 13
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
                        paddingVertical: 10,
                        borderRadius: 8,
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
                              fontSize: 13,
                              marginLeft: 8
                            }}
                          >
                            Testing...
                          </Text>
                        </>
                      ) : quickTestStatus === 'online' ? (
                        <>
                          <Check size={15} color={colors.success} />
                          <Text
                            style={{
                              color: colors.success,
                              fontSize: 13,
                              fontWeight: '600',
                              marginLeft: 8
                            }}
                          >
                            Reachable
                          </Text>
                        </>
                      ) : quickTestStatus === 'offline' ? (
                        <>
                          <WifiOff size={15} color={colors.danger} />
                          <Text
                            style={{
                              color: colors.danger,
                              fontSize: 13,
                              marginLeft: 8
                            }}
                          >
                            No response
                          </Text>
                        </>
                      ) : (
                        <>
                          <Wifi size={15} color={colors.teal} />
                          <Text
                            style={{
                              color: colors.teal,
                              fontSize: 13,
                              marginLeft: 8
                            }}
                          >
                            Test Connection
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {terminals.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setShowTerminalPicker(true)}
                        style={{
                          flex: 1,
                          backgroundColor: colors.teal + '20',
                          paddingVertical: 12,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: colors.teal + '50'
                        }}
                      >
                        <CreditCard size={15} color={colors.teal} />
                        <Text
                          style={{
                            fontSize: 13,
                            color: colors.teal,
                            fontWeight: '700',
                            marginLeft: 6
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
                        paddingVertical: 12,
                        borderRadius: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Plus size={15} color={colors.teal} />
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.teal,
                          fontWeight: '700',
                          marginLeft: 6
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
        {/* SECTION 3 — PRINTER CONFIGURATION */}
        {/* ================================================================ */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: 'hidden'
          }}
        >
          <SectionHeader
            title='Printer Configuration'
            icon={<Printer size={20} color={colors.teal} />}
            expanded={expandedSections.printers}
            onToggle={() => toggleSection('printers')}
            rightContent={
              totalActive > 0 ? (
                <View
                  style={{
                    backgroundColor: colors.teal + '20',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 10
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: colors.teal
                    }}
                  >
                    {onlineCount}/{totalActive}
                  </Text>
                </View>
              ) : undefined
            }
          />
          {expandedSections.printers && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              {/* Scope toggle */}
              <View style={{ flexDirection: 'row', marginBottom: 14, gap: 6 }}>
                {(['station', 'location'] as const).map(scope => (
                  <TouchableOpacity
                    key={scope}
                    onPress={() => setPrinterScope(scope)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      backgroundColor:
                        printerScope === scope
                          ? colors.teal + '20'
                          : 'transparent',
                      borderColor:
                        printerScope === scope
                          ? colors.teal + '50'
                          : colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color:
                          printerScope === scope ? colors.teal : colors.muted
                      }}
                    >
                      {scope === 'station' ? 'This Station' : 'All Location'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── RECEIPT PRINTING ── */}
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 8
                }}
              >
                Receipt Printing
              </Text>

              {receiptPrinter ? (
                (() => {
                  const statusColor = getPrinterStatusColor(receiptPrinter)
                  const isEditing = editingPrinterId === receiptPrinter.id
                  return (
                    <View
                      style={{
                        backgroundColor: colors.card,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.success + '40',
                        marginBottom: 12
                      }}
                    >
                      <View
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          flexDirection: 'row',
                          alignItems: 'center'
                        }}
                      >
                        <View
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 7,
                            backgroundColor: colors.success + '15',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10
                          }}
                        >
                          <CheckCircle2 size={14} color={colors.success} />
                        </View>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '700',
                              color: colors.heading
                            }}
                            numberOfLines={1}
                          >
                            {receiptPrinter.printerName}
                          </Text>
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.label,
                              marginTop: 2
                            }}
                            numberOfLines={1}
                          >
                            {receiptPrinter.networkAddress
                              ? `LAN (${receiptPrinter.networkAddress})`
                              : receiptPrinter.connectionType.toUpperCase()}{' '}
                            · {getTypeBadge(receiptPrinter.printerType)}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => handleTestPrint(receiptPrinter)}
                            disabled={testPrintingId === receiptPrinter.id}
                            style={{
                              padding: 5,
                              backgroundColor: colors.teal + '15',
                              borderWidth: 1,
                              borderColor: colors.teal + '40',
                              borderRadius: 7
                            }}
                          >
                            {testPrintingId === receiptPrinter.id ? (
                              <ActivityIndicator
                                size='small'
                                color={colors.teal}
                              />
                            ) : (
                              <Printer size={12} color={colors.teal} />
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={openReceiptPicker}>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: '600',
                                color: colors.teal
                              }}
                            >
                              Change
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      {/* Tap to configure */}
                      {!isEditing && (
                        <TouchableOpacity
                          onPress={() => {
                            setEditingPrinterId(receiptPrinter.id)
                            setDraftPrinterEdits({})
                          }}
                          style={{ paddingHorizontal: 12, paddingBottom: 8 }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.teal,
                              textAlign: 'center'
                            }}
                          >
                            Tap to configure
                          </Text>
                        </TouchableOpacity>
                      )}
                      {/* Inline edit panel */}
                      {isEditing &&
                        (() => {
                          const draftRole =
                            draftPrinterEdits.printerRole ??
                            receiptPrinter.printerRole
                          const draftDefaultReceipt =
                            draftPrinterEdits.isDefaultReceipt ??
                            receiptPrinter.isDefaultReceipt
                          const draftDefaultKitchen =
                            draftPrinterEdits.isDefaultKitchen ??
                            receiptPrinter.isDefaultKitchen
                          const draftActive =
                            draftPrinterEdits.isActive ??
                            receiptPrinter.isActive
                          const draftPrinterName =
                            draftPrinterEdits.printerName ??
                            receiptPrinter.printerName
                          return (
                            <View
                              style={{
                                marginHorizontal: 12,
                                marginBottom: 10,
                                paddingTop: 10,
                                borderTopWidth: 1,
                                borderTopColor: colors.border
                              }}
                            >
                              <View style={{ marginBottom: 8 }}>
                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: colors.muted,
                                    marginBottom: 4
                                  }}
                                >
                                  Printer Name
                                </Text>
                                <TextInput
                                  value={draftPrinterName}
                                  onChangeText={v =>
                                    setDraftPrinterEdits(prev => ({
                                      ...prev,
                                      printerName: v
                                    }))
                                  }
                                  placeholder='Printer name'
                                  placeholderTextColor={colors.muted}
                                  style={{
                                    backgroundColor: colors.screen,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    borderRadius: 8,
                                    paddingHorizontal: 12,
                                    paddingVertical: 9,
                                    color: colors.heading,
                                    fontSize: 13
                                  }}
                                />
                              </View>
                              {draftRole !== 'label' && (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    backgroundColor: colors.card,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    marginBottom: 8
                                  }}
                                >
                                  <View>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: colors.heading
                                      }}
                                    >
                                      Also Prints Kitchen Tickets
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        color: colors.muted,
                                        marginTop: 1
                                      }}
                                    >
                                      This printer will also receive kitchen
                                      orders
                                    </Text>
                                  </View>
                                  <Switch
                                    checked={draftDefaultKitchen}
                                    onCheckedChange={v =>
                                      setDraftPrinterEdits(prev => ({
                                        ...prev,
                                        isDefaultKitchen: v
                                      }))
                                    }
                                  />
                                </View>
                              )}
                              {draftDefaultKitchen && (
                                <TouchableOpacity
                                  onPress={() =>
                                    setRoutingModalPrinter(receiptPrinter)
                                  }
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    backgroundColor: colors.card,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    marginBottom: 8
                                  }}
                                >
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 8
                                    }}
                                  >
                                    <Route size={14} color={colors.teal} />
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: colors.heading
                                      }}
                                    >
                                      Configure Routing
                                    </Text>
                                  </View>
                                  <Text
                                    style={{ fontSize: 11, color: colors.teal }}
                                  >
                                    Edit
                                  </Text>
                                </TouchableOpacity>
                              )}
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  paddingHorizontal: 12,
                                  paddingVertical: 8,
                                  backgroundColor: colors.card,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  marginBottom: 12
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: colors.heading
                                  }}
                                >
                                  Printer Active
                                </Text>
                                <Switch
                                  checked={draftActive}
                                  onCheckedChange={v =>
                                    setDraftPrinterEdits(prev => ({
                                      ...prev,
                                      isActive: v
                                    }))
                                  }
                                />
                              </View>
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity
                                  onPress={() =>
                                    handleSavePrinterEdits(receiptPrinter.id)
                                  }
                                  disabled={isSavingPrinter}
                                  style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    backgroundColor: colors.teal + '20',
                                    borderWidth: 1,
                                    borderColor: colors.teal + '50'
                                  }}
                                >
                                  {isSavingPrinter ? (
                                    <ActivityIndicator
                                      size='small'
                                      color={colors.teal}
                                    />
                                  ) : (
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        fontWeight: '600',
                                        color: colors.teal
                                      }}
                                    >
                                      Save
                                    </Text>
                                  )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => {
                                    setEditingPrinterId(null)
                                    setDraftPrinterEdits({})
                                  }}
                                  style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    borderWidth: 1,
                                    borderColor: colors.border
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      color: colors.muted
                                    }}
                                  >
                                    Cancel
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() =>
                                    handleDeletePrinter(receiptPrinter)
                                  }
                                  style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 16,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    backgroundColor: colors.danger + '15',
                                    borderWidth: 1,
                                    borderColor: colors.danger + '40'
                                  }}
                                >
                                  <Trash2 size={14} color={colors.danger} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          )
                        })()}
                    </View>
                  )
                })()
              ) : (
                <TouchableOpacity
                  onPress={openReceiptPicker}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderStyle: 'dashed',
                    paddingVertical: 14,
                    marginBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <Plus size={16} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.teal
                    }}
                  >
                    Assign Receipt Printer
                  </Text>
                </TouchableOpacity>
              )}

              {/* ── ORDER / KITCHEN / KDS ── */}
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 8,
                  marginTop: 4
                }}
              >
                Order / Kitchen / KDS
              </Text>

              {kitchenPrinters.map(printer => {
                const statusColor = getPrinterStatusColor(printer)
                const statusLabel = getPrinterStatusLabel(printer)
                const isEditing = editingPrinterId === printer.id
                return (
                  <View
                    key={printer.id}
                    style={{
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      marginBottom: 8
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center'
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 7,
                          backgroundColor: colors.teal + '15',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10
                        }}
                      >
                        <Printer size={14} color={colors.teal} />
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '700',
                              color: colors.heading
                            }}
                            numberOfLines={1}
                          >
                            {printer.printerName}
                          </Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 3,
                              backgroundColor: statusColor + '20',
                              borderWidth: 1,
                              borderColor: statusColor + '50',
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              borderRadius: 20
                            }}
                          >
                            <View
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: statusColor
                              }}
                            />
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '600',
                                color: statusColor
                              }}
                            >
                              {statusLabel}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.label,
                            marginTop: 2
                          }}
                          numberOfLines={1}
                        >
                          {printer.networkAddress
                            ? `LAN (${printer.networkAddress})`
                            : printer.connectionType.toUpperCase()}{' '}
                          · {getTypeBadge(printer.printerType)}
                          {printer.isDefaultReceipt ? ' · Also Receipt' : ''}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => handleTestPrint(printer)}
                          disabled={testPrintingId === printer.id}
                          style={{
                            padding: 5,
                            backgroundColor: colors.teal + '15',
                            borderWidth: 1,
                            borderColor: colors.teal + '40',
                            borderRadius: 7
                          }}
                        >
                          {testPrintingId === printer.id ? (
                            <ActivityIndicator
                              size='small'
                              color={colors.teal}
                            />
                          ) : (
                            <Printer size={12} color={colors.teal} />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleRemoveKitchenPrinter(printer.id)}
                          style={{
                            padding: 5,
                            backgroundColor: colors.danger + '10',
                            borderWidth: 1,
                            borderColor: colors.danger + '30',
                            borderRadius: 7
                          }}
                        >
                          <Minus size={12} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {/* Tap to configure */}
                    {!isEditing && (
                      <TouchableOpacity
                        onPress={() => {
                          setEditingPrinterId(printer.id)
                          setDraftPrinterEdits({})
                        }}
                        style={{ paddingHorizontal: 12, paddingBottom: 8 }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.teal,
                            textAlign: 'center'
                          }}
                        >
                          Tap to configure
                        </Text>
                      </TouchableOpacity>
                    )}
                    {/* Inline edit panel */}
                    {isEditing &&
                      (() => {
                        const draftDefaultKitchen =
                          draftPrinterEdits.isDefaultKitchen ??
                          printer.isDefaultKitchen
                        const draftActive =
                          draftPrinterEdits.isActive ?? printer.isActive
                        const draftPrinterName =
                          draftPrinterEdits.printerName ?? printer.printerName
                        return (
                          <View
                            style={{
                              marginHorizontal: 12,
                              marginBottom: 10,
                              paddingTop: 10,
                              borderTopWidth: 1,
                              borderTopColor: colors.border
                            }}
                          >
                            <View style={{ marginBottom: 8 }}>
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: colors.muted,
                                  marginBottom: 4
                                }}
                              >
                                Printer Name
                              </Text>
                              <TextInput
                                value={draftPrinterName}
                                onChangeText={v =>
                                  setDraftPrinterEdits(prev => ({
                                    ...prev,
                                    printerName: v
                                  }))
                                }
                                placeholder='Printer name'
                                placeholderTextColor={colors.muted}
                                style={{
                                  backgroundColor: colors.screen,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  borderRadius: 8,
                                  paddingHorizontal: 12,
                                  paddingVertical: 9,
                                  color: colors.heading,
                                  fontSize: 13
                                }}
                              />
                            </View>
                            <TouchableOpacity
                              onPress={() => setRoutingModalPrinter(printer)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                backgroundColor: colors.card,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.border,
                                marginBottom: 8
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 8
                                }}
                              >
                                <Route size={14} color={colors.teal} />
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: colors.heading
                                  }}
                                >
                                  Configure Routing
                                </Text>
                              </View>
                              <Text
                                style={{ fontSize: 11, color: colors.teal }}
                              >
                                Edit
                              </Text>
                            </TouchableOpacity>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                backgroundColor: colors.card,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.border,
                                marginBottom: 12
                              }}
                            >
                              <Text
                                style={{ fontSize: 12, color: colors.heading }}
                              >
                                Printer Active
                              </Text>
                              <Switch
                                checked={draftActive}
                                onCheckedChange={v =>
                                  setDraftPrinterEdits(prev => ({
                                    ...prev,
                                    isActive: v
                                  }))
                                }
                              />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                onPress={() =>
                                  handleSavePrinterEdits(printer.id)
                                }
                                disabled={isSavingPrinter}
                                style={{
                                  flex: 1,
                                  paddingVertical: 10,
                                  borderRadius: 8,
                                  alignItems: 'center',
                                  backgroundColor: colors.teal + '20',
                                  borderWidth: 1,
                                  borderColor: colors.teal + '50'
                                }}
                              >
                                {isSavingPrinter ? (
                                  <ActivityIndicator
                                    size='small'
                                    color={colors.teal}
                                  />
                                ) : (
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: '600',
                                      color: colors.teal
                                    }}
                                  >
                                    Save
                                  </Text>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  setEditingPrinterId(null)
                                  setDraftPrinterEdits({})
                                }}
                                style={{
                                  flex: 1,
                                  paddingVertical: 10,
                                  borderRadius: 8,
                                  alignItems: 'center',
                                  borderWidth: 1,
                                  borderColor: colors.border
                                }}
                              >
                                <Text
                                  style={{ fontSize: 12, color: colors.muted }}
                                >
                                  Cancel
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleDeletePrinter(printer)}
                                style={{
                                  paddingVertical: 10,
                                  paddingHorizontal: 16,
                                  borderRadius: 8,
                                  alignItems: 'center',
                                  backgroundColor: colors.danger + '15',
                                  borderWidth: 1,
                                  borderColor: colors.danger + '40'
                                }}
                              >
                                <Trash2 size={14} color={colors.danger} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        )
                      })()}
                  </View>
                )
              })}

              <TouchableOpacity
                onPress={() => setShowKitchenPicker(true)}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderStyle: 'dashed',
                  paddingVertical: 14,
                  marginBottom: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Plus size={16} color={colors.teal} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  Assign Order/Kitchen Printer or KDS
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {afterPrinters}

        {/* ================================================================ */}
        {/* SECTION 4 — DISCOVERED DEVICES */}
        {/* ================================================================ */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: 'hidden'
          }}
        >
          <SectionHeader
            title='Discovered Devices'
            icon={<Search size={20} color={colors.teal} />}
            expanded={expandedSections.discovered}
            onToggle={() => toggleSection('discovered')}
            rightContent={
              builtinDetected ||
              dejavooDetected ||
              discoveredStarPrinters.length > 0 ? (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.teal
                  }}
                />
              ) : undefined
            }
          />
          {expandedSections.discovered && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              {/* Scan buttons */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={handleScanStarPrinters}
                  disabled={isScanningStar}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50'
                  }}
                >
                  {isScanningStar ? (
                    <>
                      <ActivityIndicator size='small' color={colors.teal} />
                      <Text
                        style={{
                          color: colors.teal,
                          fontSize: 12,
                          fontWeight: '600',
                          marginLeft: 6
                        }}
                      >
                        Scanning...
                        {scanSecondsRemaining
                          ? ` (${scanSecondsRemaining}s)`
                          : ''}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Search size={14} color={colors.teal} />
                      <Text
                        style={{
                          color: colors.teal,
                          fontSize: 12,
                          fontWeight: '600',
                          marginLeft: 6
                        }}
                      >
                        Scan Network
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Built-in printer discovery */}
              {builtinDetected && (
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.success + '40',
                    padding: 12,
                    marginBottom: 8
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        flex: 1
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          backgroundColor: colors.success + '20',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Printer size={14} color={colors.success} />
                      </View>
                      <View>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: colors.heading
                          }}
                        >
                          Built-in Printer Detected
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.muted }}>
                          {capabilities?.model}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={handleProvisionBuiltin}
                      disabled={provisioningBuiltin}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        backgroundColor: colors.teal + '20',
                        borderWidth: 1,
                        borderColor: colors.teal + '50'
                      }}
                    >
                      {provisioningBuiltin ? (
                        <ActivityIndicator size='small' color={colors.teal} />
                      ) : (
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: colors.teal
                          }}
                        >
                          Add
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Dejavoo terminal printer discovery */}
              {dejavooDetected && (
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.teal + '40',
                    padding: 12,
                    marginBottom: 8
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        flex: 1
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          backgroundColor: colors.teal + '20',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <CreditCard size={14} color={colors.teal} />
                      </View>
                      <View>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: colors.heading
                          }}
                        >
                          Dejavoo Terminal Printer
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.muted }}>
                          {currentTerminal?.terminal_name}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={handleProvisionDejavoo}
                      disabled={provisioningDejavoo}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        backgroundColor: colors.teal + '20',
                        borderWidth: 1,
                        borderColor: colors.teal + '50'
                      }}
                    >
                      {provisioningDejavoo ? (
                        <ActivityIndicator size='small' color={colors.teal} />
                      ) : (
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: colors.teal
                          }}
                        >
                          Add
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Star printers from scan */}
              {discoveredStarPrinters.map(discovered => {
                const existingPrinter = storedPrinters.find(
                  p =>
                    p.printerType === 'star_micronics' &&
                    p.networkAddress === discovered.ipAddress
                )
                const alreadyAdded = !!existingPrinter
                const isProvisioning =
                  provisioningStarIp === discovered.ipAddress
                return (
                  <View
                    key={discovered.ipAddress}
                    style={{
                      backgroundColor: colors.card,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: alreadyAdded
                        ? colors.success + '40'
                        : colors.border,
                      padding: 12,
                      marginBottom: 8
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          flex: 1
                        }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            backgroundColor: colors.teal + '15',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Printer size={14} color={colors.teal} />
                        </View>
                        <View>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '600',
                              color: colors.heading
                            }}
                          >
                            {discovered.modelName}
                          </Text>
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.muted,
                              fontFamily: 'monospace'
                            }}
                          >
                            {discovered.ipAddress}
                          </Text>
                        </View>
                      </View>
                      {alreadyAdded ? (
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: colors.success + '15'
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.success,
                              fontWeight: '600'
                            }}
                          >
                            Available
                          </Text>
                        </View>
                      ) : isProvisioning ? (
                        <ActivityIndicator size='small' color={colors.teal} />
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            onPress={() =>
                              handleProvisionStar(discovered, 'receipt')
                            }
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                              borderRadius: 8,
                              backgroundColor: colors.teal + '20',
                              borderWidth: 1,
                              borderColor: colors.teal + '50'
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '600',
                                color: colors.teal
                              }}
                            >
                              Receipt
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              handleProvisionStar(discovered, 'kitchen')
                            }
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                              borderRadius: 8,
                              backgroundColor: colors.teal + '20',
                              borderWidth: 1,
                              borderColor: colors.teal + '50'
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '600',
                                color: colors.teal
                              }}
                            >
                              Kitchen
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              handleProvisionStar(discovered, 'both')
                            }
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                              borderRadius: 8,
                              backgroundColor: colors.teal + '20',
                              borderWidth: 1,
                              borderColor: colors.teal + '50'
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '600',
                                color: colors.teal
                              }}
                            >
                              Both
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                )
              })}

              {starScanError && (
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.danger,
                    marginBottom: 8
                  }}
                >
                  {starScanError}
                </Text>
              )}

              {/* Manual IP entry */}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: 10,
                  marginTop: 4
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.muted,
                    textTransform: 'uppercase',
                    marginBottom: 8
                  }}
                >
                  Add by IP
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={manualIp}
                    onChangeText={v => {
                      setManualIp(v)
                      setManualIpError(null)
                    }}
                    placeholder='192.168.1.100'
                    placeholderTextColor={colors.muted}
                    keyboardType='decimal-pad'
                    style={{
                      flex: 3,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.heading,
                      fontSize: 13,
                      fontFamily: 'monospace'
                    }}
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 4,
                      alignItems: 'center'
                    }}
                  >
                    {(['receipt', 'kitchen', 'both'] as const).map(r => (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setManualIpRole(r)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          backgroundColor:
                            manualIpRole === r
                              ? colors.teal + '20'
                              : 'transparent',
                          borderColor:
                            manualIpRole === r
                              ? colors.teal + '50'
                              : colors.border
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color:
                              manualIpRole === r ? colors.teal : colors.muted,
                            textTransform: 'capitalize'
                          }}
                        >
                          {r}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={handleManualIpAdd}
                    disabled={isProbing || !manualIp.trim()}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: colors.teal + '20',
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      opacity: manualIp.trim() ? 1 : 0.4
                    }}
                  >
                    {isProbing ? (
                      <ActivityIndicator size='small' color={colors.teal} />
                    ) : (
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: colors.teal
                        }}
                      >
                        Add
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
                {manualIpError && (
                  <Text
                    style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}
                  >
                    {manualIpError}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* APP UPDATES SECTION                                                 */}
        {/* ------------------------------------------------------------------ */}
        {mode === 'all' && Platform.OS === 'android' && (
          <View
            style={{
              marginTop: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            <SectionHeader
              title='App Updates'
              icon={<RefreshCw size={16} color={colors.teal} />}
              expanded={expandedSections.appUpdates}
              onToggle={() => toggleSection('appUpdates')}
            />
            {expandedSections.appUpdates && (
              <View
                style={{ backgroundColor: colors.card, padding: 14, gap: 12 }}
              >
                {/* Version row */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.label }}>
                    Current Version
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.heading,
                      fontFamily: 'monospace'
                    }}
                  >
                    {currentVersion}
                  </Text>
                </View>

                {/* Last checked row */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.label }}>
                    Last Checked
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
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
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50',
                    opacity: isCheckingUpdate ? 0.6 : 1
                  }}
                >
                  {isCheckingUpdate ? (
                    <ActivityIndicator size='small' color={colors.teal} />
                  ) : (
                    <RefreshCw size={14} color={colors.teal} />
                  )}
                  <Text
                    style={{
                      fontSize: 13,
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

        <View style={{ height: 40 }} />
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
          setRegisterForm(f => ({
            ...f,
            name: payload.productName || 'Castles Saturn1000',
            model: payload.productName || 'Saturn1000',
            connectionType: 'usb',
            ipAddress: '',
            port: '8080'
          }))
          setShowRegisterForm(true)
          toastService.show({
            title: 'USB Terminal Verified',
            message: `${payload.firmwareVersion ? `Firmware ${payload.firmwareVersion}. ` : ''}Complete registration below.`,
            type: 'success'
          })
        }}
      />

      {/* Receipt Printer Picker Modal */}
      <Modal
        visible={showReceiptPicker}
        transparent
        animationType='fade'
        onRequestClose={() => setShowReceiptPicker(false)}
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
              width: 380,
              maxHeight: '70%',
              backgroundColor: colors.panel,
              borderRadius: 14,
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
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <TouchableOpacity onPress={() => setShowReceiptPicker(false)}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.danger
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Select Printer
              </Text>
              <TouchableOpacity onPress={handleApplyReceiptSelection}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  Done
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10
                }}
              >
                Select Receipt Printer (Max 1)
              </Text>

              {/* No Printer option */}
              <TouchableOpacity
                onPress={() => setPendingReceiptId('none')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  marginBottom: 6,
                  backgroundColor:
                    pendingReceiptId === 'none'
                      ? colors.teal + '10'
                      : 'transparent',
                  borderWidth: 1,
                  borderColor:
                    pendingReceiptId === 'none'
                      ? colors.teal + '40'
                      : colors.border
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor:
                      pendingReceiptId === 'none' ? colors.teal : colors.muted,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12
                  }}
                >
                  {pendingReceiptId === 'none' && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: colors.teal
                      }}
                    />
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  No Printer
                </Text>
              </TouchableOpacity>

              {/* Printer options */}
              {receiptCandidates.map(p => {
                const selected = pendingReceiptId === p.id
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setPendingReceiptId(p.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      marginBottom: 6,
                      backgroundColor: selected
                        ? colors.teal + '10'
                        : 'transparent',
                      borderWidth: 1,
                      borderColor: selected ? colors.teal + '40' : colors.border
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: selected ? colors.teal : colors.muted,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12
                      }}
                    >
                      {selected && (
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: colors.teal
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: colors.heading
                        }}
                      >
                        {p.printerName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.muted,
                          marginTop: 1
                        }}
                      >
                        {p.networkAddress
                          ? `LAN (${p.networkAddress})`
                          : p.connectionType.toUpperCase()}
                        {p.isDefaultKitchen ? ' · Kitchen' : ''}
                      </Text>
                    </View>
                    <Printer size={16} color={colors.muted} />
                  </TouchableOpacity>
                )
              })}

              {receiptCandidates.length === 0 && (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    textAlign: 'center',
                    paddingVertical: 16
                  }}
                >
                  No printers available. Add printers from Discovered Devices.
                </Text>
              )}

              <Text
                style={{
                  fontSize: 10,
                  color: colors.muted,
                  marginTop: 8,
                  marginBottom: 4
                }}
              >
                Label printers cannot be selected for receipt printing.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Kitchen Printer Picker Modal */}
      <Modal
        visible={showKitchenPicker}
        transparent
        animationType='fade'
        onRequestClose={() => setShowKitchenPicker(false)}
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
              width: 380,
              maxHeight: '70%',
              backgroundColor: colors.panel,
              borderRadius: 14,
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
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.heading,
                  flex: 1,
                  textAlign: 'center'
                }}
              >
                Assign Kitchen Printer
              </Text>
              <TouchableOpacity
                onPress={() => setShowKitchenPicker(false)}
                style={{ position: 'absolute', right: 16 }}
              >
                <X size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              {kitchenCandidates.length === 0 ? (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    textAlign: 'center',
                    paddingVertical: 20
                  }}
                >
                  All printers are already assigned to kitchen.
                </Text>
              ) : (
                kitchenCandidates.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => handleAssignKitchenPrinter(p.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      marginBottom: 6,
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 7,
                        backgroundColor: colors.teal + '15',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10
                      }}
                    >
                      <Printer size={14} color={colors.teal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: colors.heading
                        }}
                      >
                        {p.printerName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.muted,
                          marginTop: 1
                        }}
                      >
                        {p.networkAddress
                          ? `LAN (${p.networkAddress})`
                          : p.connectionType.toUpperCase()}{' '}
                        · {getTypeBadge(p.printerType)}
                        {p.isDefaultReceipt ? ' · Receipt Printer' : ''}
                      </Text>
                    </View>
                    <Plus size={16} color={colors.teal} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
              width: 320,
              backgroundColor: colors.panel,
              borderRadius: 14,
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
            <View style={{ padding: 20 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 10
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor:
                      (alertModal?.success ? colors.teal : colors.danger) +
                      '20',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {alertModal?.success ? (
                    <Printer size={16} color={colors.teal} />
                  ) : (
                    <AlertTriangle size={16} color={colors.danger} />
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 14,
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
                  fontSize: 12,
                  color: colors.label,
                  lineHeight: 18,
                  marginBottom: 20
                }}
              >
                {alertModal?.message}
              </Text>
              <TouchableOpacity
                onPress={() => setAlertModal(null)}
                style={{
                  paddingVertical: 9,
                  borderRadius: 8,
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
                    fontSize: 13,
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
