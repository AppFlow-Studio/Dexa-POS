import { colors } from "@/lib/theme";
import { StatusBar } from "expo-status-bar";
import { vars } from "nativewind";
import React, { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { OfflineBanner } from "./components/OfflineBanner";
import { TabBar } from "./components/TabBar";
import { useHandheldOrientation } from "./hooks/useHandheldOrientation";
import { ChecksScreen } from "./screens/checks/ChecksScreen";
import { MeScreen } from "./screens/me/MeScreen";
import { TablesScreen } from "./screens/tables/TablesScreen";
import type { HandheldTab } from "./types";

/**
 * The tablet's `--ui-scale` is computed from dp width against a 1333dp
 * baseline and floors at 0.6, which on a 360dp handheld would shrink every
 * utility class (text-base → 9.6px, min-h-12 → 29dp). The handheld layout is
 * authored in dp, so it pins the variable to 1 for its own subtree — the same
 * `vars()` mechanism UiScaleProvider uses at the root.
 */
const HANDHELD_UI_VARS = vars({ "--ui-scale": 1 });

function ActiveTab({ tab }: { tab: HandheldTab }) {
  switch (tab) {
    case "tables":
      return <TablesScreen />;
    case "checks":
      return <ChecksScreen />;
    case "me":
      return <MeScreen />;
  }
}

/**
 * Dexa Go shell: offline banner, one active tab, bottom tab bar. Mounted by
 * app/(main)/handheld.tsx inside RegisterRuntime, so realtime, table sessions
 * and the payment sheet are already running above it. Inactive tabs unmount —
 * on a 2GB device that beats keeping three lists warm.
 */
export default function HandheldRoot() {
  const [tab, setTab] = useState<HandheldTab>("tables");
  useHandheldOrientation();

  return (
    <View style={[{ flex: 1 }, HANDHELD_UI_VARS]}>
      <SafeAreaView
        edges={["top", "right", "bottom", "left"]}
        className="flex-1"
        style={{ backgroundColor: colors.screen }}
      >
        <StatusBar style="light" translucent />
        <OfflineBanner />
        <View className="flex-1">
          <ActiveTab tab={tab} />
        </View>
        <TabBar active={tab} onChange={setTab} />
      </SafeAreaView>
    </View>
  );
}
