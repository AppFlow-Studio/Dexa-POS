import { CFDScreenRouter } from '@/components/cfd-client/CFDScreenRouter'
import { useCFDClient } from '@/contexts/CFDClientContext'
import { CFDExternalDisplayProvider } from '@/contexts/CFDDisplayDataContext'
import { replaceRoute } from '@/lib/rootNavigation'
import { colors } from '@/lib/theme'
import { useCFDClientStore } from '@/stores/useCFDClientStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { router } from 'expo-router'
import { AlertCircle, Loader } from 'lucide-react-native'
import { useCallback, useEffect, useRef } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

const ADMIN_TAP_COUNT = 5
const ADMIN_TAP_WINDOW_MS = 2000

export default function CFDDisplayScreen () {
  const {
    sendTipSelection,
    sendPhoneNumber,
    sendLoyaltySkip,
    sendLoyaltyJoin,
    reconnect
  } = useCFDClient()
  const { isPaired, connectionStatus } = useCFDClientStore()

  const tapCountRef = useRef(0)
  const lastTapTimeRef = useRef(0)

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

  // Redirect to pairing if not paired
  useEffect(() => {
    if (!isPaired) {
      router.replace('/(cfd)/cfd-pairing')
    }
  }, [isPaired])

  if (!isPaired) return null

  // Disconnected state
  if (connectionStatus === 'disconnected') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        {/* Invisible admin tap target */}
        <Pressable
          onPress={handleAdminTap}
          style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, zIndex: 100 }}
        />

        {/* Error content */}
        <Animated.View
          entering={FadeIn.duration(300)}
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
              onPress={reconnect}
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

  // Connecting state
  if (connectionStatus === 'connecting') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        {/* Invisible admin tap target */}
        <Pressable
          onPress={handleAdminTap}
          style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, zIndex: 100 }}
        />

        {/* Connecting content */}
        <Animated.View
          entering={FadeIn.duration(300)}
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

  // Connected state — show normal content
  return (
    <CFDExternalDisplayProvider>
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        {/* Invisible admin tap target */}
        <Pressable
          onPress={handleAdminTap}
          style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, zIndex: 100 }}
        />

        {/* Screen content */}
        <CFDScreenRouter
          onTipSelected={sendTipSelection}
          onPhoneSubmitted={sendPhoneNumber}
          onLoyaltySkip={sendLoyaltySkip}
          onLoyaltyJoin={sendLoyaltyJoin}
        />
      </View>
    </CFDExternalDisplayProvider>
  )
}
