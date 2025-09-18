import "@/global.css";
import { PortalHost } from "@rn-primitives/portal";

import ClockInWallModal from "@/components/auth/ClockInWallModal";
import PaymentModal from "@/components/bill/PaymentModal";
import ItemCustomizationDialog from "@/components/menu/ItemCustomizationDialog";
import SearchBottomSheet from "@/components/menu/SearchBottomSheet";
import { NAV_THEME } from "@/lib/constants";
import { useColorScheme } from "@/lib/useColorScheme";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Toasts } from "@backpackapp-io/react-native-toast";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

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
  }, []);

  if (!isColorSchemeLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView>
      <SafeAreaProvider>
        <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
          <StatusBar style={"dark"} />
          <Stack screenOptions={{ headerShown: false }} initialRouteName="(main)" />{/* Remove after testing */}
          <PortalHost />
          <SearchBottomSheet />
          <PaymentModal />
          <ItemCustomizationDialog />
          <ClockInWallModal
            isOpen={isClockInWallOpen}
            onClose={hideClockInWall}
          />
          <Toasts
            defaultStyle={{
              view: {
                backgroundColor: "#ffffff",
                borderWidth: 1,
                borderColor: "#e5e7eb",
                width: "100%",
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
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const useIsomorphicLayoutEffect =
  Platform.OS === "web" && typeof window === "undefined"
    ? React.useEffect
    : React.useLayoutEffect;
