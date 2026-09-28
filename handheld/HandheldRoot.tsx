import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { View } from "react-native";
import { TabBar } from "./components/TabBar";
import { useHandheldTab } from "./lib/tabStore";
import { ChecksScreen } from "./screens/checks/ChecksScreen";
import { checksIndex } from "./screens/checks/useChecks";
import { MeScreen } from "./screens/me/MeScreen";
import { TablesScreen } from "./screens/tables/TablesScreen";
import type { HandheldTab } from "./types";

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

/** The Checks tab badge. */
function useTabBadges(): Partial<Record<HandheldTab, number>> {
  // Shares the Checks tab's single pass over the orders (checksIndex): no
  // second scan of every order on each store update.
  const needsYou = useOrderStore((s) => checksIndex(s.ordersById).needsYou);
  return needsYou > 0 ? { checks: needsYou } : {};
}

/**
 * Dexa Go tab root: one active tab over the bottom tab bar (each tab's
 * Screen carries the header and the offline card, as the artifact draws
 * them). Tapping a table or a check pushes its page on the handheld Stack
 * (app/(main)/handheld/_layout.tsx), which sits inside RegisterRuntime, so
 * realtime, table sessions and the payment sheet are already running above.
 * Inactive tabs unmount — on a 2GB device that beats keeping three lists warm.
 */
export default function HandheldRoot() {
  const tab = useHandheldTab((s) => s.tab);
  const setTab = useHandheldTab((s) => s.setTab);
  const badges = useTabBadges();
  return (
    <View className="flex-1">
      <View className="flex-1">
        <ActiveTab tab={tab} />
      </View>
      <TabBar active={tab} badges={badges} onChange={setTab} />
    </View>
  );
}
