import { colors } from "@/lib/theme";
import { vars } from "nativewind";
import React from "react";
import { View } from "react-native";

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
 * pages) at dp-true scale, edge to edge like the register. The root layout
 * hides both system bars; a SafeAreaView here kept padding for them after
 * they were gone (Android reports the bar insets it measured), which left a
 * dead band top and bottom on every page. The product devices (Landi P30 /
 * P32, Valor VP550) have no display cutout, so nothing needs insetting. A
 * StatusBar here would re-show the bar (RN stacks the last mounted props).
 * Portrait is locked by app/_layout.tsx, which never remounts on a theme
 * toggle. Mounted once by app/(main)/handheld/_layout.tsx around its Stack.
 */
export default function HandheldFrame({ children }: { children: React.ReactNode }) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.screen }, HANDHELD_UI_VARS]}>
      {children}
    </View>
  );
}
