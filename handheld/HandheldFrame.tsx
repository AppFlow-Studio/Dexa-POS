import { colors } from "@/lib/theme";
import { useColorScheme } from "@/lib/useColorScheme";
import { StatusBar } from "expo-status-bar";
import { vars } from "nativewind";
import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * The tablet's `--ui-scale` is computed from dp width against a 1333dp
 * baseline and floors at 0.6, which on a 360dp handheld would shrink every
 * utility class (text-base → 9.6px, min-h-12 → 29dp). The handheld layout is
 * authored in dp, so it pins the variable to 1 for its own subtree — the same
 * `vars()` mechanism UiScaleProvider uses at the root.
 */
const HANDHELD_UI_VARS = vars({ "--ui-scale": 1 });

/**
 * Wraps every handheld page (the tab root and the pushed table / order
 * pages): dp-true scale, safe areas, a status bar that follows the theme.
 * Portrait is locked by app/_layout.tsx, which never remounts on a theme
 * toggle. Mounted once by app/(main)/handheld/_layout.tsx around its Stack.
 */
export default function HandheldFrame({ children }: { children: React.ReactNode }) {
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View style={[{ flex: 1 }, HANDHELD_UI_VARS]}>
      <SafeAreaView
        edges={["top", "right", "bottom", "left"]}
        className="flex-1"
        style={{ backgroundColor: colors.screen }}
      >
        <StatusBar style={isDarkColorScheme ? "light" : "dark"} translucent />
        {children}
      </SafeAreaView>
    </View>
  );
}
