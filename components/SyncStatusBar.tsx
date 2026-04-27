/**
 * SyncStatusBar Component
 *
 * Displays sync status at bottom of screen when there are pending operations.
 * Hidden when fully synced and online.
 *
 * Uses `rawIsOnline` (NetInfo) so connection-quality slow-mode renders as
 * normal "N changes pending" amber UX rather than scary red "Offline" — the
 * queue still drains silently in the background.
 */

import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import React from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export function SyncStatusBar(): React.ReactElement | null {
  const { rawIsOnline, pendingSyncCount, syncNow } = useNetworkStatus();
  const [syncing, setSyncing] = React.useState(false);

  // Hide when truly online (per NetInfo) and no pending operations
  if (rawIsOnline && pendingSyncCount === 0) {
    return null;
  }

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        rawIsOnline ? styles.containerOnline : styles.containerOffline,
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>{rawIsOnline ? "🔄" : "📴"}</Text>
        <Text style={styles.text}>
          {rawIsOnline
            ? syncing
              ? `Syncing ${pendingSyncCount} changes...`
              : `${pendingSyncCount} changes pending`
            : `Offline - ${pendingSyncCount} changes pending`}
        </Text>
      </View>

      {rawIsOnline && pendingSyncCount > 0 && !syncing && (
        <TouchableOpacity onPress={handleSyncNow} style={styles.syncButton}>
          <Text style={styles.syncButtonText}>Sync Now</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  containerOnline: {
    backgroundColor: "#FEF3C7", // Amber light
    borderTopColor: "#F59E0B",
  },
  containerOffline: {
    backgroundColor: "#FEE2E2", // Red light
    borderTopColor: "#EF4444",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  icon: {
    fontSize: 18,
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1F2937",
  },
  syncButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  syncButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
