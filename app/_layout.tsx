import '@/global.css'
import { PortalHost } from '@rn-primitives/portal'
import { PortalProvider } from 'react-native-teleport'

import ClockInWallModal from '@/components/auth/ClockInWallModal'
import ManagerPinModal from '@/components/auth/ManagerPinModal'
import CustomerSheet from '@/components/bill/CustomerSheet'
import ItemCustomizationDialog from '@/components/menu/ItemCustomizationDialog'
import SearchBottomSheet from '@/components/menu/SearchBottomSheet'
import { NoPrinterModal } from '@/components/printing/NoPrinterModal'
// SyncStatusBar removed - now using NetworkStatusBadge in Header
// import { SyncStatusBar } from "@/components/SyncStatusBar";
import { CFDProvider } from '@/contexts/CFDProvider'
import { LoadingProvider } from '@/contexts/LoadingContext'
import { PosSyncProvider } from '@/contexts/PosSyncProvider'
import { RemoteActionsProvider } from '@/contexts/RemoteActionsProvider'
import { SessionKickListenerProvider } from '@/contexts/SessionKickListenerProvider'
import { TanstackProvider } from '@/contexts/TanstackProvider'
import { ToastProvider } from '@/contexts/ToastContext'
import { NAV_THEME } from '@/lib/constants'
import { initImmer } from '@/lib/initImmer'
import { initLogCollector } from '@/lib/logCollector'
import { setRootNavigationRef } from '@/lib/rootNavigation'
import { flushAllPendingWrites, secureStorage } from '@/lib/storage'
import { colors } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import { PrinterService } from '@/services/printing/PrinterService'
import { useCustomizationStore } from '@/stores/useCustomizationStore'
import { useNoPrinterModalStore } from '@/stores/useNoPrinterModalStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePinOverrideStore } from '@/stores/usePinOverrideStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { Toasts } from '@backpackapp-io/react-native-toast'
import { ClerkLoaded, ClerkProvider, TokenCache } from '@clerk/clerk-expo'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider
} from '@react-navigation/native'
import * as NavigationBar from 'expo-navigation-bar'
import { Stack, useNavigationContainerRef } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import * as React from 'react'
import { AppState, Platform, Text, View } from 'react-native'
import { SystemBars } from 'react-native-edge-to-edge'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// IMPORTANT: Must be called once at module level for OAuth to work correctly
WebBrowser.maybeCompleteAuthSession()

// Register CFD secondary display component for Android built-in displays.
// Must happen at module level before native side mounts the ReactRootView.
if (Platform.OS === 'android') {
  require('@/components/cfd-builtin/CFDBuiltinDisplay')
}

// Initialize log collector to capture console output for remote log retrieval
initLogCollector()
// Optimize Immer array iteration in producers
initImmer()

export const tokenCache: TokenCache = {
  async getToken (key: string) {
    try {
      const result = secureStorage.getString(key) ?? null
      if (__DEV__)
        console.log(`[TokenCache] getToken key="${key}" hit=${!!result}`)
      return result
    } catch (error) {
      console.error('[TokenCache] getToken error:', error)
      return null
    }
  },
  async saveToken (key: string, value: string) {
    try {
      secureStorage.set(key, value)
      if (__DEV__) console.log(`[TokenCache] saveToken key="${key}"`)
    } catch (error) {
      console.error('[TokenCache] saveToken error:', error)
    }
  }
}

const mmkvResourceCache = () => ({
  get: async (key: string) => secureStorage.getString(key) ?? null,
  set: async (key: string, value: string) => {
    secureStorage.set(key, value)
  }
})

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

const LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: NAV_THEME.light
}
const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: NAV_THEME.dark
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router'

export default function RootLayout () {
  const hasMounted = React.useRef(false)
  const { colorScheme, isDarkColorScheme } = useColorScheme()
  const [isColorSchemeLoaded, setIsColorSchemeLoaded] = React.useState(false)
  const isClockInWallOpen = useTimeclockStore(s => s.isClockInWallOpen)
  const hideClockInWall = useTimeclockStore(s => s.hideClockInWall)
  const isKDS = useStoreSettingsStore(
    s => s.selectedStation?.station_type === 'kds'
  )
  const isCFDMode = useStoreSettingsStore(s => s.isCFDMode)
  const isPOSMode = !isKDS && !isCFDMode
  const isPinModalOpen = usePinOverrideStore(s => s.isPinModalOpen)
  const isNoPrinterModalVisible = useNoPrinterModalStore(s => s.visible)
  const isCustomizationOpen = useCustomizationStore(s => s.isOpen)

  // Store the navigation container ref for cross-group navigation
  const navigationRef = useNavigationContainerRef()
  React.useEffect(() => {
    setRootNavigationRef(navigationRef)
  }, [navigationRef])

  // Hide system UI for full-screen immersive POS experience
  React.useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden').catch(() => {})
    }
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (hasMounted.current) {
      return
    }

    if (Platform.OS === 'web') {
      // Adds the background color to the html element to prevent white background on overscroll.
      document.documentElement.classList.add('bg-background')
    }
    setIsColorSchemeLoaded(true)
    hasMounted.current = true

    // Skip POS-only initialization for KDS stations and CFD client mode
    if (!isKDS && !isCFDMode) {
      // NOTE: Timeclock hydration now happens in PosSyncProvider after employees sync.
      // PTO history is calculated from real shift data, not mock data.
      // Start draft order cleanup
      useOrderStore.getState().startDraftCleanup()
      // One-time cleanup: Remove duplicate draft orders (safe to run on every startup)
      useOrderStore.getState().cleanupDraftDuplicates()
      // Start print queue processing
      PrinterService.startProcessing()
    }
  }, [])

  // Flush pending MMKV writes when app goes to background to prevent data loss
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        flushAllPendingWrites()
      }
    })
    return () => sub.remove()
  }, [])

  // Cleanup intervals on unmount
  React.useEffect(() => {
    return () => {
      if (!isKDS && !isCFDMode) {
        useOrderStore.getState().stopDraftCleanup()
        PrinterService.stopProcessing()
      }
    }
  }, [isKDS, isCFDMode])

  if (!isColorSchemeLoaded) {
    return null
  }

  if (!publishableKey) {
    return (
      <View className='flex-1 items-center justify-center bg-red-100'>
        <Text className='text-red-600 text-lg font-semibold'>
          Missing Clerk Publishable Key
        </Text>
        <Text className='text-red-500 text-sm mt-2'>
          Please add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file
        </Text>
      </View>
    )
  }

  if (__DEV__) {
    console.log('Clerk Key:', publishableKey?.substring(0, 20))
    console.log('TokenCache:', typeof tokenCache)
  }

  return (
    <PortalProvider>
      <ClerkProvider
        publishableKey={publishableKey}
        tokenCache={tokenCache}
        __experimental_resourceCache={mmkvResourceCache}
      >
        <ClerkLoaded>
          {/* <ClerkSessionDebugger /> */}
          <TanstackProvider>
            <PosSyncProvider>
              <GestureHandlerRootView>
                <SafeAreaProvider>
                  <ThemeProvider
                    value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}
                  >
                    <BottomSheetModalProvider>
                      <ToastProvider>
                        <LoadingProvider>
                          <SessionKickListenerProvider>
                            <RemoteActionsProvider>
                              <CFDProvider>
                                <StatusBar
                                  style={'dark'}
                                  translucent
                                  hidden={Platform.OS === 'android'}
                                />
                                {Platform.OS === 'android' && (
                                  <SystemBars
                                    hidden={{
                                      navigationBar: true,
                                      statusBar: true
                                    }}
                                  />
                                )}
                                <Stack screenOptions={{ headerShown: false }}>
                                  <Stack.Screen name='index' />
                                  <Stack.Screen name='(auth)' />
                                  <Stack.Screen name='(cfd)' />
                                  <Stack.Screen name='(main)' />
                                  <Stack.Screen name='(profiles-and-timeclock)' />
                                  <Stack.Screen
                                    name='(main)/tables/[tableId]'
                                    options={{
                                      presentation: 'transparentModal',
                                      animation: 'none'
                                    }}
                                  />
                                  <Stack.Screen
                                    name='(main)/tables/waitlist'
                                    options={{ animation: 'none' }}
                                  />
                                </Stack>
                                <PortalHost />
                                {isPOSMode && <SearchBottomSheet />}
                                {isPOSMode && isCustomizationOpen && (
                                  <ItemCustomizationDialog />
                                )}
                                {isPOSMode && isClockInWallOpen && (
                                  <ClockInWallModal
                                    isOpen={isClockInWallOpen}
                                    onClose={hideClockInWall}
                                  />
                                )}
                                {isPOSMode && isPinModalOpen && (
                                  <ManagerPinModal />
                                )}
                                {isPOSMode && <CustomerSheet />}
                                {isPOSMode && isNoPrinterModalVisible && (
                                  <NoPrinterModal />
                                )}
                                <Toasts
                                  defaultStyle={{
                                    view: {
                                      backgroundColor: colors.card,
                                      borderWidth: 1,
                                      borderColor: colors.border,
                                      flex: 1
                                    },
                                    text: {
                                      color: colors.heading,
                                      fontWeight: 'bold',
                                      fontSize: 24
                                    },
                                    indicator: {
                                      backgroundColor: colors.teal
                                    }
                                  }}
                                />
                              </CFDProvider>
                            </RemoteActionsProvider>
                          </SessionKickListenerProvider>
                        </LoadingProvider>
                      </ToastProvider>
                    </BottomSheetModalProvider>
                  </ThemeProvider>
                </SafeAreaProvider>
              </GestureHandlerRootView>
            </PosSyncProvider>
          </TanstackProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </PortalProvider>
  )
}

const useIsomorphicLayoutEffect =
  Platform.OS === 'web' && typeof window === 'undefined'
    ? React.useEffect
    : React.useLayoutEffect
