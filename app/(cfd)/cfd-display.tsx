import { CFDScreenRouter } from '@/components/cfd-client/CFDScreenRouter'
import { useCFDClient } from '@/contexts/CFDClientContext'
import { CFDExternalDisplayProvider } from '@/contexts/CFDDisplayDataContext'
import { replaceRoute } from '@/lib/rootNavigation'
import { iosOnly } from '@/lib/safeAnimations'
import { colors, setThemeMode } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import { useCFDClientStore } from '@/stores/useCFDClientStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { router } from 'expo-router'
import { AlertCircle, Loader } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

const ADMIN_TAP_COUNT = 5
const ADMIN_TAP_WINDOW_MS = 2000

// Grace window for absorbing brief WS reconnects after a previously successful
// connection. Within this window we keep the last-known screen visible with a
// small "Reconnecting…" pill overlay — preventing the visible flash where the
// screen jumped to a full "Connection Lost" modal for <1s before reconnecting.
// If the reconnect genuinely takes longer than this, we fall back to the full
// error screen so real failures stay visible.
const RECONNECT_GRACE_MS = 4000

export default function CFDDisplayScreen () {
  const {
    sendTipSelection,
    sendPhoneNumber,
    sendLoyaltySkip,
    sendLoyaltyJoin,
    reconnect
  } = useCFDClient()
  const { isPaired, connectionStatus, themeMode } = useCFDClientStore()
  const { setColorScheme } = useColorScheme()

  // Mirror the POS theme on this CFD tablet whenever the source changes
  useEffect(() => {
    setThemeMode(themeMode)
    setColorScheme(themeMode)
  }, [themeMode, setColorScheme])

  const tapCountRef = useRef(0)
  const lastTapTimeRef = useRef(0)
  const isNavigatingRef = useRef(false)

  // Grace-window state for reconnect absorption. Defaults to `true` so the
  // first-ever connection attempt still shows the full "Connecting…" screen;
  // flips to `false` once we've had a successful connection, at which point
  // brief drops render stale content + a pill instead of a full error modal.
  const [showFullConnectionUI, setShowFullConnectionUI] = useState(true)
  const hasEverConnectedRef = useRef(false)

  const showAdminMenu = useCallback(() => {
    Alert.alert('CFD Settings', 'Select an option:', [
      {
        text: 'Back to Pairing',
        onPress: () => router.replace('/(cfd)/cfd-pairing')
      },
      {
        text: 'Disconnect & Exit CFD',
        style: 'destructive',
        onPress: () => {
          useCFDClientStore.getState().clearPairing()
          useStoreSettingsStore.getState().exitCFDMode()
          replaceRoute('(auth)', 'store-select')
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ])
  }, [])

  const handleAdminTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapTimeRef.current > ADMIN_TAP_WINDOW_MS) {
      tapCountRef.current = 0
    }
    lastTapTimeRef.current = now
    tapCountRef.current += 1

    if (tapCountRef.current >= ADMIN_TAP_COUNT) {
      tapCountRef.current = 0
      showAdminMenu()
    }
  }, [showAdminMenu])

  // Redirect to pairing if not paired.
  // Use a ref guard so we never fire router.replace twice during a transition
  // (e.g. clearPairing + re-render + effect dispatch). Reset the guard when
  // pairing comes back so a subsequent unpair still navigates.
  useEffect(() => {
    if (!isPaired && !isNavigatingRef.current) {
      isNavigatingRef.current = true
      router.replace('/(cfd)/cfd-pairing')
    } else if (isPaired) {
      isNavigatingRef.current = false
    }
  }, [isPaired])

  // Grace-window controller: decides whether a non-connected status should
  // render the full "Connection Lost"/"Connecting…" screen or keep the last
  // good screen mounted with a small reconnecting pill. The cleanup returned
  // from this effect handles BOTH the next status change AND unmount, so the
  // grace timer can never outlive the component.
  useEffect(() => {
    if (connectionStatus === 'connected') {
      hasEverConnectedRef.current = true
      setShowFullConnectionUI(false)
      return
    }

    // Not connected. If we've never successfully connected, show the full
    // UI immediately so the user gets real feedback on first-boot failures.
    if (!hasEverConnectedRef.current) {
      setShowFullConnectionUI(true)
      return
    }

    // Reconnecting after a previous successful connection: stay in stale-
    // content mode and only escalate to the full error screen if the reconnect
    // drags on past the grace window.
    setShowFullConnectionUI(false)
    const timer = setTimeout(() => {
      setShowFullConnectionUI(true)
    }, RECONNECT_GRACE_MS)
    return () => clearTimeout(timer)
  }, [connectionStatus])

  // Explicit fallback view (not `return null`) so the screen never goes blank
  // while navigation is in flight. Prevents the white-screen amplification
  // seen during the display ↔ pairing ping-pong.
  if (!isPaired) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12
        }}
      >
        <Loader size={32} color={colors.teal} />
        <Text style={{ fontSize: 13, color: colors.label }}>Redirecting…</Text>
      </View>
    )
  }

  // Disconnected state — only render the full error screen once the grace
  // window has elapsed (or on a first-boot failure). Brief disconnects keep
  // the last-known screen visible with a pill overlay (see the connected /
  // fall-through branch below).
  if (connectionStatus === 'disconnected' && showFullConnectionUI) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        {/* Invisible admin tap target */}
        <Pressable
          onPress={handleAdminTap}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 60,
            height: 60,
            zIndex: 100
          }}
        />

        {/* Error content */}
        <Animated.View
          entering={iosOnly(FadeIn.duration(300))}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
            gap: 16
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              backgroundColor: colors.danger + '15',
              borderWidth: 1,
              borderColor: colors.danger + '30',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <AlertCircle size={32} color={colors.danger} />
          </View>

          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text
              style={{ fontSize: 18, fontWeight: '700', color: colors.heading }}
            >
              Connection Lost
            </Text>
            <Text
              style={{ fontSize: 13, color: colors.label, textAlign: 'center' }}
            >
              Unable to connect to the POS system. Check your connection and try
              again.
            </Text>
          </View>

          <View style={{ gap: 8, width: '100%', maxWidth: 280 }}>
            <Pressable
              onPress={() => reconnect({ manual: true })}
              style={{
                backgroundColor: colors.teal + '20',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 8,
                alignItems: 'center'
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}
              >
                Retry Connection
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                useCFDClientStore.getState().clearPairing()
                router.replace('/(cfd)/cfd-pairing')
              }}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 8,
                alignItems: 'center'
              }}
            >
              <Text style={{ fontSize: 13, color: colors.label }}>
                Back to Setup
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    )
  }

  // Connecting state — same grace-window rule: the full "Connecting…" screen
  // only shows on first-boot attempts. Reconnects keep stale content visible.
  if (connectionStatus === 'connecting' && showFullConnectionUI) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        {/* Invisible admin tap target */}
        <Pressable
          onPress={handleAdminTap}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 60,
            height: 60,
            zIndex: 100
          }}
        />

        {/* Connecting content */}
        <Animated.View
          entering={iosOnly(FadeIn.duration(300))}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              backgroundColor: colors.warning + '15',
              borderWidth: 1,
              borderColor: colors.warning + '30',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: '0deg'
                  }
                ]
              }}
            >
              <Loader size={32} color={colors.warning} />
            </Animated.View>
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text
              style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}
            >
              Connecting...
            </Text>
            <Text style={{ fontSize: 12, color: colors.label }}>
              Please wait
            </Text>
          </View>
        </Animated.View>
      </View>
    )
  }

  // Connected — or reconnecting within the grace window. Render the normal
  // screen content; if we're not actually connected, surface a small
  // "Reconnecting…" pill overlay so the operator still knows something is off
  // without a full-screen modal flashing in and out.
  const isReconnecting = connectionStatus !== 'connected'

  return (
    <CFDExternalDisplayProvider>
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        {/* Invisible admin tap target */}
        <Pressable
          onPress={handleAdminTap}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 60,
            height: 60,
            zIndex: 100
          }}
        />

        {/* Screen content */}
        <CFDScreenRouter
          onTipSelected={sendTipSelection}
          onPhoneSubmitted={sendPhoneNumber}
          onLoyaltySkip={sendLoyaltySkip}
          onLoyaltyJoin={sendLoyaltyJoin}
        />

        {/* Reconnect pill overlay. pointerEvents=none so it never blocks
            taps on underlying content (including the admin tap target). */}
        {isReconnecting && (
          <View
            pointerEvents='none'
            style={{
              position: 'absolute',
              top: 12,
              left: 0,
              right: 0,
              alignItems: 'center',
              zIndex: 90
            }}
          >
            <Animated.View
              entering={iosOnly(FadeIn.duration(200))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: colors.warning + '20',
                borderWidth: 1,
                borderColor: colors.warning + '50',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999
              }}
            >
              <Loader size={14} color={colors.warning} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.warning
                }}
              >
                Reconnecting…
              </Text>
            </Animated.View>
          </View>
        )}
      </View>
    </CFDExternalDisplayProvider>
  )
}
