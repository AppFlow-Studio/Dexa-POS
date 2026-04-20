import '@/global.css'
import '@/lib/screenConfig' // must be first — calls enableFreeze() before any Screen mounts
import { PortalHost } from '@rn-primitives/portal'
import { PortalProvider } from 'react-native-teleport'

import { ClerkSessionKeeper } from '@/components/auth/ClerkSessionKeeper'
import ClockInWallModal from '@/components/auth/ClockInWallModal'
import ManagerPinModal from '@/components/auth/ManagerPinModal'
import CustomerSheet from '@/components/bill/CustomerSheet'
import { ProductionErrorBoundary } from '@/components/ErrorBoundary'
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
import { markNavigationEvent, setRootNavigationRef } from '@/lib/rootNavigation'
import { POS_SCREEN_OPTIONS } from '@/lib/screenConfig'
import { flushAllPendingWrites, secureStorage } from '@/lib/storage'
import { colors, setThemeMode } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import { PrinterService } from '@/services/printing/PrinterService'
import { useCustomizationStore } from '@/stores/useCustomizationStore'
import { useNoPrinterModalStore } from '@/stores/useNoPrinterModalStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePinOverrideStore } from '@/stores/usePinOverrideStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { Toasts } from '@backpackapp-io/react-native-toast'
import { ClerkProvider, TokenCache, useAuth } from '@clerk/clerk-expo'
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
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  Text,
  View
} from 'react-native'
import { SystemBars } from 'react-native-edge-to-edge'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
// app/_layout.tsx — check for update on launch
import AppUpdateModal from '@/components/AppUpdateModal'
import {
  checkForNativeUpdate,
  type VersionManifest
} from '@/services/appUpdater'
import * as Sentry from '@sentry/react-native'
import { isRunningInExpoGo } from 'expo'
import * as Updates from 'expo-updates'

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo()
})

Sentry.init({
  dsn: 'https://dcfdfcd20582347382d2fb94df146b1e@o4511212537380864.ingest.us.sentry.io/4511212539019264',

  // Maps to EAS channel: "development" | "preview" | "production"
  environment: __DEV__ ? 'development' : Updates.channel ?? 'unknown',

  sendDefaultPii: true,
  enableLogs: true,

  // Auto-capture HTTP 4xx/5xx responses as error events
  enableCaptureFailedRequests: true,

  // Offline: cache up to 100 envelopes on disk (default 30)
  maxCacheItems: 100,

  // 100% in dev for debugging, 30% in production to reduce overhead
  tracesSampleRate: __DEV__ ? 1.0 : 0.3,

  integrations: [navigationIntegration],
  enableNativeFramesTracking: !isRunningInExpoGo()

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
})

async function checkForUpdate () {
  try {
    const update = await Updates.checkForUpdateAsync()
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync()
      await Updates.reloadAsync() // silent restart
    }
  } catch (e) {
    // offline — no problem, skip
  }
}
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

/**
 * Gate that replaces the bare <ClerkLoaded>. While Clerk is loading (either
 * at cold start or if the SDK transiently re-enters a loading state during a
 * session refresh), show a visible spinner instead of rendering null — which
 * would blank the entire tree and produce the ~30-minute white-screen bug.
 */
function ClerkGate ({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useAuth()
  if (!isLoaded) {
    return (
      <View className='flex-1 items-center justify-center bg-background'>
        <ActivityIndicator size='large' />
      </View>
    )
  }
  return <>{children}</>
}

/**
 * Fallback shown when the root ProductionErrorBoundary catches a render
 * error anywhere in the provider / Stack tree. Offers both an in-place retry
 * (which resets the boundary) and a full app reload via expo-updates, which
 * unsticks corrupted top-level state.
 */
function RootErrorFallback () {
  const handleReload = React.useCallback(() => {
    Updates.reloadAsync().catch(err => {
      console.error('[RootErrorFallback] reloadAsync failed:', err)
    })
  }, [])
  return (
    <View className='flex-1 items-center justify-center bg-background p-6'>
      <Text className='text-2xl font-bold text-destructive mb-2'>
        Something went wrong
      </Text>
      <Text className='text-base text-muted-foreground text-center mb-6'>
        The app ran into an unexpected problem. Tap below to reload.
      </Text>
      <Pressable
        onPress={handleReload}
        className='bg-primary px-8 py-4 rounded-lg'
      >
        <Text className='text-primary-foreground font-semibold text-lg'>
          Reload App
        </Text>
      </Pressable>
    </View>
  )
}

export default Sentry.wrap(function RootLayout () {
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
  const [nativeUpdateManifest, setNativeUpdateManifest] =
    React.useState<VersionManifest | null>(null)
  setThemeMode(colorScheme === 'light' ? 'light' : 'dark')

  // Store the navigation container ref for cross-group navigation + Sentry tracing
  const navigationRef = useNavigationContainerRef()
  React.useEffect(() => {
    setRootNavigationRef(navigationRef)
    if (navigationRef?.current) {
      navigationIntegration.registerNavigationContainer(navigationRef)
    }
  }, [navigationRef])

  // Track navigation events so background services can skip non-critical work
  // (order pruning, toasts) during the brief window after a screen transition.
  React.useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      markNavigationEvent()
    })
    return unsubscribe
  }, [navigationRef])

  // Hide system UI for full-screen immersive POS experience
  React.useEffect(() => {
    async function runUpdateChecks () {
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('hidden').catch(() => {})
        const manifest = await checkForNativeUpdate()
        if (manifest) {
          setNativeUpdateManifest(manifest)
          return // skip OTA — native update takes priority
        }
      }
      checkForUpdate()
    }
    runUpdateChecks()
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
        <ClerkGate>
          {/* <ClerkSessionDebugger /> */}
          <ClerkSessionKeeper />
          <ProductionErrorBoundary
            section='RootLayout'
            fallback={<RootErrorFallback />}
          >
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
                                  <Stack screenOptions={POS_SCREEN_OPTIONS}>
                                    <Stack.Screen name='index' />
                                    <Stack.Screen name='(auth)' />
                                    <Stack.Screen name='(cfd)' />
                                    <Stack.Screen name='(main)' />
                                    <Stack.Screen name='(profiles-and-timeclock)' />
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
                                  {nativeUpdateManifest && (
                                    <AppUpdateModal
                                      visible={true}
                                      manifest={nativeUpdateManifest}
                                      onSkip={() =>
                                        setNativeUpdateManifest(null)
                                      }
                                      onInstallComplete={() =>
                                        setNativeUpdateManifest(null)
                                      }
                                    />
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
          </ProductionErrorBoundary>
        </ClerkGate>
      </ClerkProvider>
    </PortalProvider>
  )
})

const useIsomorphicLayoutEffect =
  Platform.OS === 'web' && typeof window === 'undefined'
    ? React.useEffect
    : React.useLayoutEffect
