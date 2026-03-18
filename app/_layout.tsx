import "@/global.css";
import { PortalHost } from "@rn-primitives/portal";

import ClockInWallModal from "@/components/auth/ClockInWallModal";
import ManagerPinModal from "@/components/auth/ManagerPinModal";
import CustomerSheet from "@/components/bill/CustomerSheet";
import ItemCustomizationDialog from "@/components/menu/ItemCustomizationDialog";
import { NoPrinterModal } from "@/components/printing/NoPrinterModal";
import SearchBottomSheet from "@/components/menu/SearchBottomSheet";
// SyncStatusBar removed - now using NetworkStatusBadge in Header
// import { SyncStatusBar } from "@/components/SyncStatusBar";
import { CFDProvider } from "@/contexts/CFDProvider";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { PosSyncProvider } from "@/contexts/PosSyncProvider";
import { RemoteActionsProvider } from "@/contexts/RemoteActionsProvider";
import { SessionKickListenerProvider } from "@/contexts/SessionKickListenerProvider";
import { TanstackProvider } from "@/contexts/TanstackProvider";
import { ToastProvider } from "@/contexts/ToastContext";
import { NAV_THEME } from "@/lib/constants";
import { colors } from "@/lib/theme";
import { initImmer } from "@/lib/initImmer";
import { initLogCollector } from "@/lib/logCollector";
import { useColorScheme } from "@/lib/useColorScheme";
import { flushAllPendingWrites } from "@/lib/storage";
import { PrinterService } from "@/services/printing/PrinterService";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Toasts } from "@backpackapp-io/react-native-toast";
import { ClerkLoaded, ClerkProvider, TokenCache } from "@clerk/clerk-expo";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import * as React from "react";
import { AppState, Platform, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

// IMPORTANT: Must be called once at module level for OAuth to work correctly
WebBrowser.maybeCompleteAuthSession();

// Register CFD secondary display component for Android built-in displays.
// Must happen at module level before native side mounts the ReactRootView.
if (Platform.OS === "android") {
  require("@/components/cfd-builtin/CFDBuiltinDisplay");
}

// Initialize log collector to capture console output for remote log retrieval
initLogCollector();
// Optimize Immer array iteration in producers
initImmer();

export const tokenCache: TokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error("[TokenCache] Error:", error);
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error("[TokenCache] Error:", error);
    }
  },
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: NAV_THEME.light,
};
const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: NAV_THEME.dark,
};

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export default function RootLayout() {
  const hasMounted = React.useRef(false);
  const { colorScheme, isDarkColorScheme } = useColorScheme();
  const [isColorSchemeLoaded, setIsColorSchemeLoaded] = React.useState(false);
  const isClockInWallOpen = useTimeclockStore((s) => s.isClockInWallOpen);
  const hideClockInWall = useTimeclockStore((s) => s.hideClockInWall);
  const isKDS = useStoreSettingsStore((s) => s.selectedStation?.station_type === "kds");
  const isCFDMode = useStoreSettingsStore((s) => s.isCFDMode);
  const isPOSMode = !isKDS && !isCFDMode;
  const isPinModalOpen = usePinOverrideStore((s) => s.isPinModalOpen);
  const isNoPrinterModalVisible = useNoPrinterModalStore((s) => s.visible);
  const isCustomizationOpen = useCustomizationStore((s) => s.isOpen);

  useIsomorphicLayoutEffect(() => {
    if (hasMounted.current) {
      return;
    }

    if (Platform.OS === "web") {
      // Adds the background color to the html element to prevent white background on overscroll.
      document.documentElement.classList.add("bg-background");
    }
    setIsColorSchemeLoaded(true);
    hasMounted.current = true;

    // Skip POS-only initialization for KDS stations and CFD client mode
    if (!isKDS && !isCFDMode) {
      // NOTE: Timeclock hydration now happens in PosSyncProvider after employees sync.
      // PTO history is calculated from real shift data, not mock data.
      // Start draft order cleanup
      useOrderStore.getState().startDraftCleanup();
      // One-time cleanup: Remove duplicate draft orders (safe to run on every startup)
      useOrderStore.getState().cleanupDraftDuplicates();
      // Start print queue processing
      PrinterService.startProcessing();
    }
  }, []);

  // Flush pending MMKV writes when app goes to background to prevent data loss
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        flushAllPendingWrites();
      }
    });
    return () => sub.remove();
  }, []);

  // Cleanup intervals on unmount
  React.useEffect(() => {
    return () => {
      if (!isKDS && !isCFDMode) {
        useOrderStore.getState().stopDraftCleanup();
        PrinterService.stopProcessing();
      }
    };
  }, [isKDS, isCFDMode]);

  if (!isColorSchemeLoaded) {
    return null;
  }

  if (!publishableKey) {
    return (
      <View className="flex-1 items-center justify-center bg-red-100">
        <Text className="text-red-600 text-lg font-semibold">
          Missing Clerk Publishable Key
        </Text>
        <Text className="text-red-500 text-sm mt-2">
          Please add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file
        </Text>
      </View>
    );
  }

  if (__DEV__) {
    console.log("Clerk Key:", publishableKey?.substring(0, 20));
    console.log("TokenCache:", typeof tokenCache);
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
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
                            <StatusBar style={"dark"} translucent />
                            <Stack screenOptions={{ headerShown: false }}>
                              <Stack.Screen name="(main)/tables/[tableId]" options={{ animation: 'none' }} />
                              <Stack.Screen name="(main)/tables/waitlist" options={{ animation: 'none' }} />
                            </Stack>
                            <PortalHost />
                            {isPOSMode && <SearchBottomSheet />}
                            {isPOSMode && isCustomizationOpen && <ItemCustomizationDialog />}
                            {isPOSMode && isClockInWallOpen && (
                              <ClockInWallModal
                                isOpen={isClockInWallOpen}
                                onClose={hideClockInWall}
                              />
                            )}
                            {isPOSMode && isPinModalOpen && <ManagerPinModal />}
                            {isPOSMode && <CustomerSheet />}
                            {isPOSMode && isNoPrinterModalVisible && <NoPrinterModal />}
                            <Toasts
                              defaultStyle={{
                                view: {
                                  backgroundColor: colors.card,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  flex: 1,
                                },
                                text: {
                                  color: colors.heading,
                                  fontWeight: "bold",
                                  fontSize: 24,
                                },
                                indicator: {
                                  backgroundColor: colors.teal,
                                },
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
  );
}

const useIsomorphicLayoutEffect =
  Platform.OS === "web" && typeof window === "undefined"
    ? React.useEffect
    : React.useLayoutEffect;
