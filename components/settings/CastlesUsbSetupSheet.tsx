/**
 * CastlesUsbSetupSheet
 *
 * Reusable modal that walks staff through detecting + verifying a Castles
 * Saturn1000 over USB before they save a payment_terminals row in the
 * register / edit forms. Three sequential gates:
 *
 *   1. Detect — listDevices() and filter by Castles VID (0x0CA6) or
 *      product-name fallback (Saturn / S1000).
 *   2. Permission — requestPermission(deviceId) → Android grants USB
 *      access (per-app, per-device, persists until uninstall).
 *   3. Handshake — open the singleton CastlesService over USB, send
 *      getData, verify the terminal app is alive and responding.
 *
 * On success we call onVerified() with the device info pulled out of the
 * native probe + the getData response (serial, firmware version). The
 * parent form pre-fills the registration row from that payload — no
 * duplicate INSERT logic lives here.
 *
 * Failure paths each get a specific error string + recovery hint, mapping
 * to the same buckets the USB diagnostics screen surfaces.
 */

import { colors } from '@/lib/theme'
import {
  listDevices,
  requestPermission,
  type UsbDeviceInfo,
} from '@/modules/castles-usb'
import { getSharedCastlesService } from '@/services/terminals/castles-service'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Usb,
  X,
} from 'lucide-react-native'
import { useState } from 'react'
import { Modal, Text, TouchableOpacity, View } from 'react-native'

const CASTLES_VENDOR_ID = 0x0ca6

type Stage = 'idle' | 'detecting' | 'permission' | 'handshake' | 'success' | 'failed'

export interface CastlesUsbVerifiedPayload {
  deviceId: number
  vendorId: number
  productId: number
  productName: string
  manufacturer: string
  serialNumber: string
  /** From getData response — firmware version reported by terminal. */
  firmwareVersion?: string
  /** From getData response — serial reported by terminal app. */
  terminalSerial?: string
}

interface Props {
  visible: boolean
  onCancel: () => void
  onVerified: (payload: CastlesUsbVerifiedPayload) => void
}

export function CastlesUsbSetupSheet ({ visible, onCancel, onVerified }: Props) {
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [found, setFound] = useState<UsbDeviceInfo | null>(null)

  const reset = () => {
    setStage('idle')
    setError(null)
    setErrorHint(null)
    setFound(null)
  }

  const fail = (msg: string, hint?: string) => {
    setStage('failed')
    setError(msg)
    setErrorHint(hint ?? null)
  }

  const run = async () => {
    reset()
    setStage('detecting')

    // ── Step 1: Detect ──
    let devices: UsbDeviceInfo[]
    try {
      devices = await listDevices()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      fail(
        `Couldn't scan USB devices: ${msg}`,
        'This usually means the tablet doesn’t expose USB Host. ' +
          'Open USB Diagnostics from the top of Devices & Connections to confirm.',
      )
      return
    }

    const castles =
      devices.find((d) => d.vendorId === CASTLES_VENDOR_ID) ??
      devices.find((d) => {
        const name = (d.productName || '').toUpperCase()
        return name.includes('SATURN') || name.includes('CASTLES') || name.includes('S1000')
      })

    if (!castles) {
      fail(
        'No Castles terminal found on USB.',
        `Tablet sees ${devices.length} USB serial device${devices.length === 1 ? '' : 's'} ` +
          'but none match the Castles vendor ID (0x0CA6). Check the cable (data, not charge-only), ' +
          'the OTG adapter, and that the terminal is powered on.',
      )
      return
    }
    setFound(castles)

    // ── Step 2: Permission ──
    if (!castles.hasPermission) {
      setStage('permission')
      let granted = false
      try {
        granted = await requestPermission(castles.deviceId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        fail(
          `Permission request failed: ${msg}`,
          'Try unplugging and re-plugging the terminal, then run setup again.',
        )
        return
      }
      if (!granted) {
        fail(
          'USB permission was denied.',
          'Android needs USB access permission to talk to the terminal. ' +
            'Tap "Try Again" and choose Allow when the dialog appears.',
        )
        return
      }
    }

    // ── Step 3: Handshake (real CastlesService + getData) ──
    setStage('handshake')
    const service = getSharedCastlesService()
    let firmwareVersion: string | undefined
    let terminalSerial: string | undefined
    try {
      // The singleton may have been suspended by the AppState background
      // handler (or never woken up if the user navigated here before
      // PosSyncProvider's resume effect ran). resume() is a no-op if not
      // suspended, so it's safe to call unconditionally.
      if (service.isSuspended()) {
        service.resume()
      }
      await service.connect({
        connectionType: 'usb',
        timeout: 10_000,
        terminalId: `usb-setup-${castles.deviceId}`,
      } as Parameters<typeof service.connect>[0])
      // CastlesService reserves '000000' for housekeeping (internal handshake
      // inside _connectInner, return2Idle, watchdog ping). Stricter firmwares
      // (e.g., S1P2 Pro) reject our wizard's getData with "duplicate
      // transaction ID" because connect() already consumed '000000' on this
      // session. Use a time-derived ID in [1..999999] for the wizard probe —
      // collision-resistant for one-shot setup and never overlaps with
      // housekeeping or the live counter's monotonic progression.
      const probeTxnId = ((Date.now() % 999_998) + 1)
        .toString()
        .padStart(6, '0')
      const result = await service.getTerminalData(probeTxnId)
      if (result.success) {
        firmwareVersion = result.data?.infAppVersion as string | undefined
        terminalSerial = result.data?.infSN as string | undefined
      } else {
        fail(
          `Handshake failed: ${result.error || 'no response'}`,
          'The terminal app didn’t answer our getData. Power-cycle the terminal and try again.',
        )
        return
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      fail(
        `Handshake failed: ${msg}`,
        'Couldn’t complete a getData over USB. Check that this is a Saturn1000 ' +
          '(USB CDC/ACM, baud 115200). If you’re testing on iOS or the emulator, USB is unavailable there.',
      )
      return
    }

    setStage('success')
    onVerified({
      deviceId: castles.deviceId,
      vendorId: castles.vendorId,
      productId: castles.productId,
      productName: castles.productName,
      manufacturer: castles.manufacturerName,
      serialNumber: castles.serialNumber,
      firmwareVersion,
      terminalSerial,
    })
  }

  const handleClose = () => {
    reset()
    onCancel()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.78)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 16,
            padding: 22,
            width: '100%',
            maxWidth: 460,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <Usb size={22} color={colors.teal} />
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: colors.heading }}>
              Verify Castles over USB
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Stage UI */}
          {stage === 'idle' && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: colors.label, fontSize: 13, lineHeight: 19 }}>
                Plug the Castles Saturn1000 into the tablet via USB-OTG, then tap
                Detect. We&rsquo;ll find the device, request USB permission, and
                run a handshake to confirm the terminal app is responding before
                you save the terminal config.
              </Text>
            </View>
          )}
          {(stage === 'detecting' || stage === 'permission' || stage === 'handshake') && (
            <StageProgress stage={stage} />
          )}
          {stage === 'success' && found && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={20} color={colors.success} />
                <Text style={{ color: colors.success, fontWeight: '700', fontSize: 15 }}>
                  Terminal verified
                </Text>
              </View>
              <View
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: colors.screen,
                  gap: 4,
                }}
              >
                <DetailRow label='Device' value={found.productName || '(unnamed)'} />
                <DetailRow
                  label='VID/PID'
                  value={`0x${found.vendorId.toString(16).padStart(4, '0')} / 0x${found.productId.toString(16).padStart(4, '0')}`}
                  mono
                />
                <DetailRow label='Serial (USB)' value={found.serialNumber || '—'} />
              </View>
            </View>
          )}
          {stage === 'failed' && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <AlertCircle size={20} color={colors.danger} />
                <Text style={{ flex: 1, color: colors.danger, fontWeight: '600', fontSize: 14 }}>
                  {error}
                </Text>
              </View>
              {errorHint && (
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    lineHeight: 18,
                    backgroundColor: colors.screen,
                    padding: 10,
                    borderRadius: 8,
                  }}
                >
                  {errorHint}
                </Text>
              )}
            </View>
          )}

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <TouchableOpacity
              onPress={handleClose}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.heading, fontWeight: '600', fontSize: 14 }}>
                {stage === 'success' ? 'Done' : 'Cancel'}
              </Text>
            </TouchableOpacity>
            {stage !== 'success' && (
              <TouchableOpacity
                onPress={run}
                disabled={stage === 'detecting' || stage === 'permission' || stage === 'handshake'}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor:
                    stage === 'detecting' || stage === 'permission' || stage === 'handshake'
                      ? colors.teal + '60'
                      : colors.teal,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {stage === 'idle' ? 'Detect' : stage === 'failed' ? 'Try Again' : 'Working…'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

function StageProgress ({ stage }: { stage: 'detecting' | 'permission' | 'handshake' }) {
  const labels: Record<typeof stage, string> = {
    detecting: 'Scanning USB devices…',
    permission: 'Waiting for USB permission…',
    handshake: 'Verifying terminal app is responsive…',
  }
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
      <Loader2 size={28} color={colors.teal} />
      <Text style={{ color: colors.label, fontSize: 13 }}>{labels[stage]}</Text>
    </View>
  )
}

function DetailRow ({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text
        style={{
          fontSize: 12,
          color: colors.heading,
          fontFamily: mono ? 'monospace' : undefined,
          maxWidth: '65%',
          textAlign: 'right',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}
