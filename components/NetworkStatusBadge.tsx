/**
 * NetworkStatusBadge
 *
 * Compact offline-only indicator for the header center. Renders nothing when
 * the app is online — all sync recovery UX lives in
 * Settings → General (FailedSyncsPanel + SyncQueuePanel).
 *
 * Auto-retry of failed operations is handled by `offlineSyncService` with
 * exponential backoff. Operations that exhaust retries are dead-lettered;
 * those are surfaced for manual review in the settings panel only.
 *
 * IMPORTANT: This badge consults `rawIsOnline` (raw NetInfo state), NOT the
 * effective `isOnline` which also reflects connection-quality slow-mode.
 * Slow-mode silently queues mutations in the background; surfacing it as
 * "Offline" would scare operators on flaky-but-connected WiFi.
 *
 * Reanimated entering/exiting animations were intentionally removed here to
 * avoid the Fabric `Unable to find viewState for tag` crash class
 * (software-mansion/react-native-reanimated#6908).
 */

import {
  useForceOfflineToggle,
  useNetworkStatus,
} from "@/hooks/useNetworkStatus";
import { colors } from "@/lib/theme";
import { WifiOff } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export function NetworkStatusBadge(): React.ReactElement | null {
  const { rawIsOnline, pendingSyncCount } = useNetworkStatus();
  const { forceOffline, toggleForceOffline } = useForceOfflineToggle();

  // Only render when truly offline (NetInfo says so). Slow-mode is invisible.
  if (rawIsOnline) return null;

  const suffix = forceOffline ? " (forced)" : "";
  const label =
    pendingSyncCount > 0
      ? `Offline${suffix} — ${pendingSyncCount} pending`
      : `Offline${suffix}`;

  const className =
    "flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-900/30";

  if (__DEV__) {
    return (
      <TouchableOpacity
        onLongPress={toggleForceOffline}
        delayLongPress={800}
        activeOpacity={0.7}
        className={className}
      >
        <WifiOff size={11} color={colors.danger} />
        <Text className="text-xs font-medium text-red-400">{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View className={className}>
      <WifiOff size={11} color={colors.danger} />
      <Text className="text-xs font-medium text-red-400">{label}</Text>
    </View>
  );
}

export default NetworkStatusBadge;
