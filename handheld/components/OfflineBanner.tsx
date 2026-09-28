import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { useOrderStore } from "@/stores/useOrderStore";
import { colors } from "@/lib/theme";
import { RefreshCw, WifiOff } from "@/lib/icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useConnectionStore } from "../lib/connectionStore";
import { tint } from "../lib/tokens";
import { type } from "../lib/type";

/**
 * The artifact's `.bn`: a tinted card under the header. Two states, both
 * after a grace period so walking between access points does not flash it
 * (see `hooks/useConnectionWatcher.ts`):
 *
 * - offline: warning tint, "You're offline". Driven by NetInfo's raw status,
 *   not `isOnline`: slow mode queues silently and must not show an "offline"
 *   card that scares the server (see useNetworkStatus).
 * - reconnecting: info tint. The network is up but live updates are not, so
 *   other devices' changes may be behind. Tapping it reconnects now instead
 *   of waiting out the channel's backoff.
 */
export function OfflineBanner() {
  const state = useConnectionStore((s) => s.state);
  const pendingSyncCount = useOrderStore((s) => s.pendingSyncCount);
  const { reconnectAll } = useLocationRealtime();
  if (state === "online") return null;

  const offline = state === "offline";
  const pending = offline && pendingSyncCount > 0 ? ` ${pendingSyncCount} waiting to send.` : "";
  const fg = offline ? colors.warning : colors.info;
  const Icon = offline ? WifiOff : RefreshCw;

  return (
    <Pressable
      onPress={offline ? undefined : reconnectAll}
      disabled={offline}
      accessibilityRole={offline ? undefined : "button"}
      accessibilityLiveRegion="polite"
      className="mx-4 mb-3 flex-row items-center gap-3.5 rounded-[22px] px-4 py-3.5"
      style={{ backgroundColor: offline ? tint.warnSoft : tint.infoSoft }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: offline ? tint.warnIcon : tint.infoSoft }}
      >
        <Icon size={22} color={fg} />
      </View>
      <View className="min-w-0 flex-1">
        <Text style={[type.line, { fontWeight: "600", color: colors.heading }]}>
          {offline ? "You're offline" : "Reconnecting"}
        </Text>
        <Text className="mt-0.5" style={[type.detail, { color: colors.label }]}>
          {offline
            ? `Orders are saved here and send when you reconnect.${pending}`
            : "Changes from other devices may be a few seconds behind. Tap to retry now."}
        </Text>
      </View>
    </Pressable>
  );
}
