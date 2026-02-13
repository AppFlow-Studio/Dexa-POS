import "@/global.css";
import { PortalHost } from "@rn-primitives/portal";

import ClockInWallModal from "@/components/auth/ClockInWallModal";
import ManagerPinModal from "@/components/auth/ManagerPinModal";
import CustomerSheet from "@/components/bill/CustomerSheet";
import ItemCustomizationDialog from "@/components/menu/ItemCustomizationDialog";
import SearchBottomSheet from "@/components/menu/SearchBottomSheet";
// SyncStatusBar removed - now using NetworkStatusBadge in Header
// import { SyncStatusBar } from "@/components/SyncStatusBar";
import { CFDProvider } from "@/contexts/CFDProvider";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { PosSyncProvider } from "@/contexts/PosSyncProvider";
import { SessionKickListenerProvider } from "@/contexts/SessionKickListenerProvider";
import { TanstackProvider } from "@/contexts/TanstackProvider";
import { ToastProvider } from "@/contexts/ToastContext";
import { NAV_THEME } from "@/lib/constants";
import { useColorScheme } from "@/lib/useColorScheme";
import { PrinterService } from "@/services/printing/PrinterService";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePtoStore } from "@/stores/usePtoStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
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
import { Platform, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

// IMPORTANT: Must be called once at module level for OAuth to work correctly
WebBrowser.maybeCompleteAuthSession();

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
  const { isClockInWallOpen, hideClockInWall } = useTimeclockStore();
  const isKDS = useStoreSettingsStore((s) => s.selectedStation?.station_type === "kds");

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

    // Skip POS-only initialization for KDS stations
    if (!isKDS) {
      // Initialize timeclock history first
      useTimeclockStore.getState().initializeHistory();
      // Then initialize PTO history based on the timeclock history
      usePtoStore.getState().initializePtoFromHistory();
      // Start draft order cleanup
      useOrderStore.getState().startDraftCleanup();
      // One-time cleanup: Remove duplicate draft orders (safe to run on every startup)
      useOrderStore.getState().cleanupDraftDuplicates();
      // Start print queue processing
      PrinterService.startProcessing();
    }
  }, []);

  // Cleanup intervals on unmount
  React.useEffect(() => {
    return () => {
      if (!isKDS) {
        useOrderStore.getState().stopDraftCleanup();
        PrinterService.stopProcessing();
      }
    };
  }, [isKDS]);

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
              <BottomSheetModalProvider>
                <SafeAreaProvider>
                  <ThemeProvider
                    value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}
                  >
                    <ToastProvider>
                      <LoadingProvider>
                        <SessionKickListenerProvider>
                          <CFDProvider>
                            <StatusBar style={"dark"} translucent />
                            <Stack screenOptions={{ headerShown: false }} />
                            <PortalHost />
                            {!isKDS && <SearchBottomSheet />}
                            {!isKDS && <ItemCustomizationDialog />}
                            {!isKDS && (
                              <ClockInWallModal
                                isOpen={isClockInWallOpen}
                                onClose={hideClockInWall}
                              />
                            )}
                            {!isKDS && <ManagerPinModal />}
                            {!isKDS && <CustomerSheet />}
                            <Toasts
                              defaultStyle={{
                                view: {
                                  backgroundColor: "#ffffff",
                                  borderWidth: 1,
                                  borderColor: "#e5e7eb",
                                  flex: 1,
                                },
                                text: {
                                  color: "#1f2937",
                                  fontWeight: "bold",
                                  fontSize: 24,
                                },
                                indicator: {
                                  backgroundColor: "#659AF0",
                                },
                              }}
                            />
                          </CFDProvider>
                        </SessionKickListenerProvider>
                      </LoadingProvider>
                    </ToastProvider>
                  </ThemeProvider>
                </SafeAreaProvider>
              </BottomSheetModalProvider>
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
