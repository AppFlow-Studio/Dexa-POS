/**
 * USB Diagnostics
 *
 * Surfaces the native `diagnoseUsb()` + `listDevices()` output with explicit
 * per-field interpretation, so when a merchant hits the "USB device not
 * found" wall on a new tablet we know which bucket the failure is in
 * without log archaeology. Also exposes (dev-only) the Castles mock
 * transport scenario picker so we can reproduce the wedge / detach / slow
 * flows on iOS Simulator with no hardware plugged in.
 *
 * This screen is the single place that maps "what the native module returns"
 * → "what the staff member should do next". Add new failure-mode bullets
 * here as we discover them in the field.
 */

import SettingsCard from '@/components/settings/SettingsCard'
import { colors } from '@/lib/theme'
import {
  diagnoseUsb,
  listDevices,
  type UsbDeviceInfo,
  type UsbDiagnosticInfo,
} from '@/modules/castles-usb'
import {
  setCastlesMockScenario,
  type CastlesMockScenario,
} from '@/services/terminals/castles-transport-mock'
import { useCastlesMockStore } from '@/stores/useCastlesMockStore'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  RefreshCcw,
  Usb,
} from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native'

type Severity = 'ok' | 'warn' | 'error' | 'info'

interface InterpretedField {
  label: string
  value: string
  severity: Severity
  hint?: string
}

const MOCK_SCENARIOS: { id: CastlesMockScenario; label: string; description: string }[] = [
  { id: 'healthy', label: 'Healthy', description: 'Connect ok, replies to every command.' },
  { id: 'connect_timeout', label: 'Connect timeout', description: 'connect() never resolves.' },
  { id: 'connect_refused', label: 'Connect refused', description: 'ECONNREFUSED on connect.' },
  { id: 'wedge_empty_buffer', label: 'Wedge (empty buffer)', description: 'TCP up, writes ok, no responses — the live merchant bug.' },
  { id: 'wedge_after_first_sale', label: 'Wedge after first sale', description: 'First sale works, then wedges. Test mid-session recovery.' },
  { id: 'slow_response', label: 'Slow responses', description: 'Valid responses, 2.5s delay each.' },
  { id: 'detach_mid_sale', label: 'Detach mid-sale', description: 'Healthy until first sale write, then close-with-error.' },
  { id: 'permission_denied', label: 'Permission denied', description: 'connect() rejects with USB permission error.' },
]

export default function UsbDiagnosticsScreen () {
  const [diag, setDiag] = useState<UsbDiagnosticInfo | null>(null)
  const [devices, setDevices] = useState<UsbDeviceInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      // diagnoseUsb is native; iOS will throw because the module is Android-only.
      const d = await diagnoseUsb()
      setDiag(d)
      try {
        const list = await listDevices()
        setDevices(list)
      } catch (listErr) {
        // Diagnose worked but listDevices threw — partial result is still useful.
        setDevices([])
        console.warn('[usb-diagnostics] listDevices failed:', listErr)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        Platform.OS === 'ios'
          ? `USB module is Android-only. (${msg})`
          : msg,
      )
      setDiag(null)
      setDevices(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const fields: InterpretedField[] = diag ? interpretDiagnostics(diag, devices) : []

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Usb size={22} color={colors.heading} />
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading }}>
          USB Diagnostics
        </Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
        Surfaces the native USB host state so &ldquo;terminal not found&rdquo;
        failures classify clearly. Mock scenarios below let you reproduce
        every Castles failure mode on simulator without hardware.
      </Text>

      {/* Refresh */}
      <TouchableOpacity
        onPress={refresh}
        disabled={loading}
        style={{
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: colors.teal + '20',
          borderWidth: 1,
          borderColor: colors.teal + '40',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <RefreshCcw size={14} color={colors.teal} />
        <Text style={{ color: colors.teal, fontWeight: '600', fontSize: 13 }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Text>
      </TouchableOpacity>

      {/* Error path (e.g., iOS simulator) */}
      {error && (
        <SettingsCard title='Native module unavailable'>
          <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
            <AlertCircle size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.warning, fontWeight: '600', marginBottom: 4 }}>
                {error}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                USB diagnostics only work on a physical Android device with a
                dev client build. Use the mock scenarios below to iterate the
                UX without hardware.
              </Text>
            </View>
          </View>
        </SettingsCard>
      )}

      {/* Diagnostics fields */}
      {diag && (
        <SettingsCard title='Host state'>
          <View style={{ gap: 8, padding: 12 }}>
            {fields.map((f) => (
              <DiagnosticRow key={f.label} field={f} />
            ))}
          </View>
        </SettingsCard>
      )}

      {/* Device list */}
      {diag && devices != null && (
        <SettingsCard title={`Discovered USB serial devices (${devices.length})`}>
          {devices.length === 0 ? (
            <View style={{ padding: 12, flexDirection: 'row', gap: 10 }}>
              <AlertTriangle size={20} color={colors.warning} />
              <Text style={{ flex: 1, color: colors.label, fontSize: 13, lineHeight: 19 }}>
                The native prober didn&rsquo;t recognise any serial device.
                If &ldquo;raw devices&rdquo; above is &gt; 0, the tablet sees
                USB devices but doesn&rsquo;t recognise the Castles VID/PID.
                Capture the raw device names and add the new PID to{' '}
                <Text style={{ fontFamily: 'monospace' }}>CASTLES_PRODUCT_IDS</Text>
                {' '}in the Kotlin module.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8, padding: 12 }}>
              {devices.map((d) => (
                <DeviceCard key={d.deviceId} device={d} />
              ))}
            </View>
          )}
        </SettingsCard>
      )}

      {/* Mock scenarios — QA / on-site debug. Runtime-toggleable so a Landi
          preview build over EAS Update can be flipped into mock mode without
          a rebuild. Defaults OFF; explicit toggle below. */}
      <MockScenarioSection />
    </ScrollView>
  )
}

function interpretDiagnostics (
  d: UsbDiagnosticInfo,
  devices: UsbDeviceInfo[] | null,
): InterpretedField[] {
  const rows: InterpretedField[] = []

  rows.push({
    label: 'USB Host feature',
    value: d.hasUsbHostFeature ? 'Supported' : 'NOT supported',
    severity: d.hasUsbHostFeature ? 'ok' : 'error',
    hint: d.hasUsbHostFeature
      ? undefined
      : 'This tablet lacks USB Host hardware. USB Castles cannot run here — use a different tablet model or fall back to TCP/WiFi.',
  })

  rows.push({
    label: 'USB Manager available',
    value: d.usbManagerAvailable ? 'Yes' : 'No',
    severity: d.usbManagerAvailable ? 'ok' : 'error',
  })

  rows.push({
    label: 'Tablet',
    value: `${d.manufacturer} ${d.model} (Android SDK ${d.androidSdk})`,
    severity: 'info',
  })

  rows.push({
    label: 'Raw USB devices visible to OS',
    value: String(d.rawDeviceCount),
    severity:
      d.rawDeviceCount === 0
        ? d.hasUsbHostFeature
          ? 'warn'
          : 'error'
        : 'ok',
    hint:
      d.rawDeviceCount === 0
        ? 'No USB devices visible to the OS. Most common causes: (1) charge-only USB cable instead of data cable, (2) OTG adapter not seated correctly, (3) terminal powered off.'
        : undefined,
  })

  if (d.rawDeviceCount > 0 && d.deviceNames.length > 0) {
    rows.push({
      label: 'Raw device names',
      value: d.deviceNames.join(', '),
      severity: 'info',
    })
  }

  if (devices != null) {
    const recognized = devices.length
    rows.push({
      label: 'Recognised serial devices',
      value: String(recognized),
      severity:
        recognized === 0 && d.rawDeviceCount > 0
          ? 'warn'
          : recognized === 0
            ? 'info'
            : 'ok',
      hint:
        recognized === 0 && d.rawDeviceCount > 0
          ? 'Devices are visible but the prober doesn’t recognise the Castles VID/PID. Check terminal model — Saturn1000 is the only PID currently registered.'
          : undefined,
    })

    const castlesMatch = devices.find((dev) => dev.vendorId === 0x0ca6)
    if (recognized > 0) {
      rows.push({
        label: 'Castles terminal recognised',
        value: castlesMatch
          ? `Yes — deviceId ${castlesMatch.deviceId}, "${castlesMatch.productName}"`
          : 'No (none match Castles VID 0x0CA6)',
        severity: castlesMatch ? 'ok' : 'warn',
        hint: castlesMatch && !castlesMatch.hasPermission
          ? 'Castles device found but USB permission has not been granted. Trigger the permission dialog from the register/edit terminal form.'
          : undefined,
      })
    }
  }

  return rows
}

function DiagnosticRow ({ field }: { field: InterpretedField }) {
  const icon =
    field.severity === 'ok' ? (
      <CheckCircle2 size={16} color={colors.success} />
    ) : field.severity === 'warn' ? (
      <AlertTriangle size={16} color={colors.warning} />
    ) : field.severity === 'error' ? (
      <AlertCircle size={16} color={colors.danger} />
    ) : (
      <Usb size={16} color={colors.muted} />
    )
  const tone =
    field.severity === 'ok'
      ? colors.success
      : field.severity === 'warn'
        ? colors.warning
        : field.severity === 'error'
          ? colors.danger
          : colors.label

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon}
        <Text style={{ flex: 1, color: colors.label, fontSize: 13 }}>
          {field.label}
        </Text>
        <Text style={{ color: tone, fontWeight: '600', fontSize: 13 }}>
          {field.value}
        </Text>
      </View>
      {field.hint && (
        <Text
          style={{
            color: colors.muted,
            fontSize: 12,
            lineHeight: 17,
            marginLeft: 24,
          }}
        >
          {field.hint}
        </Text>
      )}
    </View>
  )
}

function MockScenarioSection () {
  const enabled = useCastlesMockStore((s) => s.enabled)
  const scenario = useCastlesMockStore((s) => s.scenario)
  const setEnabled = useCastlesMockStore((s) => s.setEnabled)
  const setScenarioStore = useCastlesMockStore((s) => s.setScenario)

  return (
    <SettingsCard title='Castles mock scenario (QA)'>
      <View style={{ padding: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <FlaskConical size={18} color={enabled ? colors.warning : colors.muted} />
          <Text style={{ flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 }}>
            {enabled
              ? 'Mock mode is ON. ALL Castles connect attempts on this device route through the mock — real terminal traffic is bypassed. Disable this before processing live sales.'
              : 'Mock mode is OFF. Enable to reproduce wedge / detach / timeout scenarios on this build without hardware. The toggle persists across restarts.'}
          </Text>
        </View>

        {/* Enable / disable */}
        <TouchableOpacity
          onPress={() => setEnabled(!enabled)}
          style={{
            padding: 14,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: enabled ? colors.warning : colors.border,
            backgroundColor: enabled ? colors.warning + '20' : colors.panel,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View
            style={{
              width: 42,
              height: 24,
              borderRadius: 12,
              backgroundColor: enabled ? colors.warning : colors.muted + '40',
              padding: 2,
              alignItems: enabled ? 'flex-end' : 'flex-start',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#fff',
              }}
            />
          </View>
          <Text style={{ flex: 1, fontWeight: '700', color: enabled ? colors.warning : colors.heading, fontSize: 14 }}>
            {enabled ? 'Mock mode ENABLED' : 'Enable mock mode'}
          </Text>
        </TouchableOpacity>

        {/* Scenarios */}
        {MOCK_SCENARIOS.map((s) => {
          const active = scenario === s.id
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => {
                setScenarioStore(s.id)
                // Keep the mock module's internal var in sync immediately so
                // the next connect picks up the new scenario without needing
                // a factory call to refresh it.
                setCastlesMockScenario(s.id)
              }}
              disabled={!enabled}
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: active && enabled ? colors.teal : colors.border,
                backgroundColor: active && enabled ? colors.teal + '15' : colors.panel,
                opacity: enabled ? 1 : 0.5,
              }}
            >
              <Text
                style={{
                  fontWeight: '700',
                  color: active && enabled ? colors.teal : colors.heading,
                  fontSize: 14,
                }}
              >
                {s.label}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                {s.description}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </SettingsCard>
  )
}

function DeviceCard ({ device }: { device: UsbDeviceInfo }) {
  const isCastles = device.vendorId === 0x0ca6
  return (
    <View
      style={{
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: isCastles ? colors.success + '60' : colors.border,
        backgroundColor: colors.panel,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {isCastles ? (
          <CheckCircle2 size={14} color={colors.success} />
        ) : (
          <Usb size={14} color={colors.muted} />
        )}
        <Text style={{ flex: 1, color: colors.heading, fontWeight: '700', fontSize: 13 }}>
          {device.productName || '(unnamed device)'}
        </Text>
        {device.hasPermission ? (
          <Text style={{ color: colors.success, fontSize: 11, fontWeight: '600' }}>
            permission ✓
          </Text>
        ) : (
          <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '600' }}>
            no permission
          </Text>
        )}
      </View>
      <Text style={{ color: colors.muted, fontSize: 11, fontFamily: 'monospace' }}>
        VID 0x{device.vendorId.toString(16).padStart(4, '0').toUpperCase()} ·
        {' '}PID 0x{device.productId.toString(16).padStart(4, '0').toUpperCase()} ·
        {' '}deviceId {device.deviceId}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        Driver: {device.driverName || '—'} · Manufacturer:{' '}
        {device.manufacturerName || '—'} · Serial:{' '}
        {device.serialNumber || '—'}
      </Text>
    </View>
  )
}
