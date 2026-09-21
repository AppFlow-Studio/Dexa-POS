import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { colors } from "@/lib/theme";
import { WifiOff } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

/**
 * Wired to the existing connectivity state. Reads `rawIsOnline`, not
 * `isOnline`: slow-mode queues silently in the background and must not show
 * an "Offline" strip that scares the server (see useNetworkStatus).
 */
export function OfflineBanner() {
  const { rawIsOnline, pendingSyncCount } = useNetworkStatus();
  if (rawIsOnline) return null;
  const pending = pendingSyncCount > 0 ? ` (${pendingSyncCount} pending)` : "";
  return (
    <View
      className="min-h-10 flex-row items-center px-4 py-2"
      style={{ backgroundColor: colors.warning }}
      accessibilityLiveRegion="polite"
    >
      <WifiOff size={16} color={colors.onSolid} />
      <Text
        className="ml-2 flex-1 text-sm font-semibold"
        style={{ color: colors.onSolid }}
        numberOfLines={2}
      >
        Offline — changes sync when the connection returns{pending}
      </Text>
    </View>
  );
}
