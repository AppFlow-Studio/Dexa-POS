import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { colors } from "@/lib/theme";
import { WifiOff } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";
import { tint } from "../lib/tokens";
import { type } from "../lib/type";

/**
 * The artifact's `.bn`: a warning-tinted card under the header. Reads
 * `rawIsOnline`, not `isOnline`: slow mode queues silently and must not
 * show an "offline" card that scares the server (see useNetworkStatus).
 */
export function OfflineBanner() {
  const { rawIsOnline, pendingSyncCount } = useNetworkStatus();
  if (rawIsOnline) return null;
  const pending = pendingSyncCount > 0 ? ` ${pendingSyncCount} waiting to send.` : "";
  return (
    <View
      className="mx-4 mb-3 flex-row items-center gap-3.5 rounded-[22px] px-4 py-3.5"
      style={{ backgroundColor: tint.warnSoft }}
      accessibilityLiveRegion="polite"
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: tint.warnIcon }}
      >
        <WifiOff size={22} color={colors.warning} />
      </View>
      <View className="min-w-0 flex-1">
        <Text style={[type.line, { fontWeight: "600", color: colors.heading }]}>
          {"You're offline"}
        </Text>
        <Text className="mt-0.5" style={[type.detail, { color: colors.label }]}>
          Orders are saved here and send when you reconnect.{pending}
        </Text>
      </View>
    </View>
  );
}
