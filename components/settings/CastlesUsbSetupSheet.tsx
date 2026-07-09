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
import { useUiScale } from '@/lib/uiScale'
import {
  listDevices,
  requestPermission,
  type UsbDeviceInfo,
} from '@/modules/castles-usb'
import { getSharedCastlesService } from '@/services/terminals/castles-service'
import { useTerminalConnectionStore } from '@/stores/useTerminalConnectionStore'
import { withDeadline, DeadlineExceededError } from '@/lib/network/withDeadline'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Usb,
  X,
} from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, Text, TouchableOpacity, View } from 'react-native'

const CASTLES_VENDOR_ID = 0x0ca6

// Hard ceilings so the wizard's progress spinner can never appear to hang on a
// stuck native call. Exempt `_probe_` opNames keep terminal reachability out of
// the global connection-quality signal. Permission is intentionally NOT bounded
// here — it legitimately waits on the user tapping the Android dialog.
const USB_DETECT_DEADLINE_MS = 10_000
const USB_HANDSHAKE_DEADLINE_MS = 25_000

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
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [found, setFound] = useState<UsbDeviceInfo | null>(null)
  // Live connect sub-step published by CastlesService (Connecting/Waking/Verifying…).
  const connectActivity = useTerminalConnectionStore((s) => s.connectActivity)

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
      devices = await withDeadline(
        () => listDevices(),
        USB_DETECT_DEADLINE_MS,
        '_probe_usb_detect',
      )
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
    // The singleton may have been suspended by the AppState background handler
    // (or never woken if the user navigated here before PosSyncProvider's resume
    // effect ran). resume() is a no-op when not suspended, so safe to call.
    if (service.isSuspended()) {
      service.resume()
    }
    const usbConfig = {
      connectionType: 'usb',
      timeout: 10_000,
      terminalId: `usb-setup-${castles.deviceId}`,
    } as Parameters<typeof service.connect>[0]
    try {
      // Bound the connect + getData chain so the wizard's spinner can never hang
      // on a wedged USB session. On timeout we force-recover (suspend tears the
      // transport down; resume re-warms) so the next "Try Again" isn't starved.
      const result = await withDeadline(
        async () => {
          await service.connect(usbConfig)
          // CastlesService reserves '000000' for housekeeping (handshake inside
          // _connectInner, return2Idle, watchdog ping). Stricter firmwares
          // (e.g., S1P2 Pro) reject a duplicate getData on '000000', so use a
          // time-derived ID in [1..999999] for the wizard probe.
          const probeTxnId = ((Date.now() % 999_998) + 1)
            .toString()
            .padStart(6, '0')
          return service.getTerminalData(probeTxnId)
        },
        USB_HANDSHAKE_DEADLINE_MS,
        '_probe_usb_setup',
      )
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
      if (err instanceof DeadlineExceededError) {
        // Force-recover the wedged singleton so a retry isn't starved.
        try { await service.suspend() } catch { /* best-effort */ }
        service.resume(usbConfig)
        fail(
          'Verification timed out — the terminal didn’t respond in time.',
          'Power-cycle the Saturn1000, re-seat the USB cable, then tap Try Again.',
        )
        return
      }
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
          padding: s(24),
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(16),
            padding: s(22),
            width: '100%',
            maxWidth: s(460),
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(10),
              marginBottom: s(12),
            }}
          >
            <Usb size={s(22)} color={colors.teal} />
            <Text style={{ flex: 1, fontSize: s(17), fontWeight: '700', color: colors.heading }}>
              Verify Castles over USB
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={s(8)}>
              <X size={s(20)} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Stage UI */}
          {stage === 'idle' && (
            <View style={{ gap: s(12) }}>
              <Text style={{ color: colors.label, fontSize: s(13), lineHeight: s(19) }}>
                Plug the Castles Saturn1000 into the tablet via USB-OTG, then tap
                Detect. We&rsquo;ll find the device, request USB permission, and
                run a handshake to confirm the terminal app is responding before
                you save the terminal config.
              </Text>
            </View>
          )}
          {(stage === 'detecting' || stage === 'permission' || stage === 'handshake') && (
            <StageProgress stage={stage} liveDetail={connectActivity} />
          )}
          {stage === 'success' && found && (
            <View style={{ gap: s(10) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                <CheckCircle2 size={s(20)} color={colors.success} />
                <Text style={{ color: colors.success, fontWeight: '700', fontSize: s(15) }}>
                  Terminal verified
                </Text>
              </View>
              <View
                style={{
                  padding: s(12),
                  borderRadius: s(8),
                  backgroundColor: colors.screen,
                  gap: s(4),
                }}
              >
                <DetailRow label='Device' value={found.productName || '(unnamed)'} uiScale={uiScale} />
                <DetailRow
                  label='VID/PID'
                  value={`0x${found.vendorId.toString(16).padStart(4, '0')} / 0x${found.productId.toString(16).padStart(4, '0')}`}
                  mono
                  uiScale={uiScale}
                />
                <DetailRow label='Serial (USB)' value={found.serialNumber || '—'} uiScale={uiScale} />
              </View>
            </View>
          )}
          {stage === 'failed' && (
            <View style={{ gap: s(10) }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(8) }}>
                <AlertCircle size={s(20)} color={colors.danger} />
                <Text style={{ flex: 1, color: colors.danger, fontWeight: '600', fontSize: s(14) }}>
                  {error}
                </Text>
              </View>
              {errorHint && (
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(12),
                    lineHeight: s(18),
                    backgroundColor: colors.screen,
                    padding: s(10),
                    borderRadius: s(8),
                  }}
                >
                  {errorHint}
                </Text>
              )}
            </View>
          )}

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: s(10), marginTop: s(18) }}>
            <TouchableOpacity
              onPress={handleClose}
              style={{
                flex: 1,
                paddingVertical: s(12),
                borderRadius: s(10),
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.heading, fontWeight: '600', fontSize: s(14) }}>
                {stage === 'success' ? 'Done' : 'Cancel'}
              </Text>
            </TouchableOpacity>
            {stage !== 'success' && (
              <TouchableOpacity
                onPress={run}
                disabled={stage === 'detecting' || stage === 'permission' || stage === 'handshake'}
                style={{
                  flex: 1,
                  paddingVertical: s(12),
                  borderRadius: s(10),
                  backgroundColor:
                    stage === 'detecting' || stage === 'permission' || stage === 'handshake'
                      ? colors.teal + '60'
                      : colors.teal,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: s(14) }}>
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

/** Loader2 icon with a continuous rotation so progress never looks frozen. */
function Spinner ({ size = 28, color }: { size?: number; color: string }) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [spin])
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={s(size)} color={color} />
    </Animated.View>
  )
}

function StageProgress ({
  stage,
  liveDetail,
}: {
  stage: 'detecting' | 'permission' | 'handshake'
  liveDetail?: string | null
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const meta: Record<
    typeof stage,
    { step: number; label: string; detail: string }
  > = {
    detecting: {
      step: 1,
      label: 'Scanning for the terminal…',
      detail: 'Looking for a Castles device (vendor 0x0CA6) on the USB bus.',
    },
    permission: {
      step: 2,
      label: 'Waiting for USB permission…',
      detail: 'Tap “Allow” on the Android dialog so the app can reach the terminal.',
    },
    handshake: {
      step: 3,
      label: 'Verifying the terminal app…',
      detail: 'Opening the connection and sending a getData handshake.',
    },
  }
  const m = meta[stage]
  // During the handshake the service streams live sub-steps (“Connecting…”,
  // “Waking terminal…”, “Verifying…”, “Reconnecting (2/3)…”) — show those as the
  // headline so the user sees real progress instead of one frozen label.
  const label = stage === 'handshake' && liveDetail ? liveDetail : m.label
  return (
    <View style={{ alignItems: 'center', gap: s(8), paddingVertical: s(16) }}>
      <Spinner size={28} color={colors.teal} />
      <Text
        style={{
          color: colors.muted,
          fontSize: s(11),
          fontWeight: '700',
          letterSpacing: s(0.6),
        }}
      >
        STEP {m.step} OF 3
      </Text>
      <Text style={{ color: colors.heading, fontSize: s(14), fontWeight: '600' }}>
        {label}
      </Text>
      <Text
        style={{
          color: colors.muted,
          fontSize: s(12),
          lineHeight: s(18),
          textAlign: 'center',
          maxWidth: s(320),
        }}
      >
        {m.detail}
      </Text>
    </View>
  )
}

function DetailRow ({ label, value, mono, uiScale }: { label: string; value: string; mono?: boolean; uiScale: number }) {
  const s = (n: number) => Math.round(n * uiScale)
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: s(12) }}>
      <Text style={{ fontSize: s(12), color: colors.muted }}>{label}</Text>
      <Text
        style={{
          fontSize: s(12),
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
