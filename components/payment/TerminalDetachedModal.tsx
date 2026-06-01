/**
 * TerminalDetachedModal
 *
 * Renders when the connection store flips to `lost` AND the active payment
 * terminal is configured for USB. Distinct from TerminalWedgedModal (which
 * handles the CastlesPay app-layer freeze on TCP). This one handles "USB
 * cable physically pulled out" or "terminal lost power", which is the
 * detach-mid-sale failure mode.
 *
 * Auto-recovers without staff clicking anything: every 5s while visible
 * we re-call listDevices() and, if the Castles VID/PID reappears, attempt
 * a service.connect() on USB. On success the store flips back to `ok` via
 * the existing connect path and the modal auto-dismisses.
 *
 * We deliberately keep this Castles-USB scoped — `lost` quality on a TCP
 * terminal continues to surface through the lighter-weight header pill
 * (NetworkStatusBadge / TerminalConnectionBadge). USB detach is more
 * disruptive (physical cable yanked mid-sale) and warrants a modal.
 */

import { colors } from '@/lib/theme'
import { listDevices } from '@/modules/castles-usb'
import { getSharedCastlesService } from '@/services/terminals/castles-service'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTerminalConnectionStore } from '@/stores/useTerminalConnectionStore'
import { CableIcon, Loader2, RefreshCcw } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Modal, Text, TouchableOpacity, View } from 'react-native'

const CASTLES_VENDOR_ID = 0x0ca6
const RECONNECT_POLL_MS = 5_000

export function TerminalDetachedModal () {
  const quality = useTerminalConnectionStore(s => s.quality)
  const paymentTerminal = useStoreSettingsStore(
    s => s.selectedStation?.payment_terminal
  )

  const isUsbTerminal =
    paymentTerminal?.terminal_type === 'castles' &&
    paymentTerminal.connection_type === 'usb'
  const visible = quality === 'lost' && isUsbTerminal

  const [reconnecting, setReconnecting] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll listDevices() while visible. On Castles re-detection, attempt connect.
  useEffect(() => {
    const clearPoll = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
    if (!visible) {
      clearPoll()
      return
    }
    const attemptReconnect = async () => {
      if (reconnecting) return
      try {
        const devices = await listDevices()
        const castles = devices.find((d) => d.vendorId === CASTLES_VENDOR_ID)
        if (!castles) return
        setReconnecting(true)
        try {
          const service = getSharedCastlesService()
          if (service.isSuspended()) service.resume()
          await service.connect({
            connectionType: 'usb',
            timeout: 10_000,
            terminalId: paymentTerminal?.id,
          } as Parameters<ReturnType<typeof getSharedCastlesService>['connect']>[0])
          // CastlesService.connect already publishes quality='ok' on success →
          // visible flips false → effect cleans up.
        } catch (err) {
          console.warn('[TerminalDetachedModal] reconnect failed:', err)
        } finally {
          setReconnecting(false)
        }
      } catch {
        // listDevices threw — module unavailable or transient. Keep polling.
      }
    }
    // Try once immediately, then keep polling.
    void attemptReconnect()
    pollTimerRef.current = setInterval(() => void attemptReconnect(), RECONNECT_POLL_MS)
    return clearPoll
  }, [visible, paymentTerminal?.id, reconnecting])

  const onTryNow = async () => {
    if (reconnecting) return
    setReconnecting(true)
    try {
      const devices = await listDevices()
      const castles = devices.find((d) => d.vendorId === CASTLES_VENDOR_ID)
      if (!castles) {
        // Still not seen — leave the modal visible, polling will pick it up.
        return
      }
      const service = getSharedCastlesService()
      if (service.isSuspended()) service.resume()
      await service.connect({
        connectionType: 'usb',
        timeout: 10_000,
        terminalId: paymentTerminal?.id,
      } as Parameters<ReturnType<typeof getSharedCastlesService>['connect']>[0])
    } catch (err) {
      console.warn('[TerminalDetachedModal] manual reconnect failed:', err)
    } finally {
      // Spinner stays at least 600ms so the user sees something happened.
      setTimeout(() => setReconnecting(false), 600)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      statusBarTranslucent
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
            padding: 24,
            width: '100%',
            maxWidth: 460,
            borderWidth: 1,
            borderColor: colors.warning + '60',
          }}
        >
          {/* Icon */}
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.warning + '20',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CableIcon size={28} color={colors.warning} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.warning,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            Terminal Disconnected
          </Text>

          {/* Body */}
          <Text
            style={{
              fontSize: 14,
              color: colors.label,
              textAlign: 'center',
              marginBottom: 16,
              lineHeight: 21,
            }}
          >
            The USB connection to the Castles terminal was lost. This usually
            means the cable was unplugged or the terminal lost power.
          </Text>

          {/* Steps */}
          <View
            style={{
              padding: 14,
              borderRadius: 10,
              backgroundColor: colors.screen,
              marginBottom: 16,
              gap: 6,
            }}
          >
            <Step n='1' text='Re-plug the USB cable into the tablet and the terminal.' />
            <Step n='2' text='Make sure the terminal is powered on.' />
            <Step n='3' text='This screen will close automatically once the terminal is back.' />
          </View>

          {/* CTAs */}
          <TouchableOpacity
            onPress={onTryNow}
            disabled={reconnecting}
            style={{
              paddingVertical: 14,
              borderRadius: 10,
              backgroundColor: reconnecting ? colors.warning + '60' : colors.warning,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {reconnecting ? (
              <Loader2 size={16} color='#fff' />
            ) : (
              <RefreshCcw size={16} color='#fff' />
            )}
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
              {reconnecting ? 'Reconnecting…' : 'Try Now'}
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 11,
              color: colors.muted,
              textAlign: 'center',
              marginTop: 10,
            }}
          >
            Auto-checks every 5 seconds while this screen is open.
          </Text>
        </View>
      </View>
    </Modal>
  )
}

function Step ({ n, text }: { n: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.warning + '30',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.warning }}>
          {n}
        </Text>
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: colors.heading,
          lineHeight: 19,
        }}
      >
        {text}
      </Text>
    </View>
  )
}
