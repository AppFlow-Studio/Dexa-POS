import { CFDScreenRouter } from "@/components/cfd-client/CFDScreenRouter";
import { CFDExternalDisplayProvider } from "@/contexts/CFDDisplayDataContext";
import { useCFDClient } from "@/contexts/CFDClientContext";
import { replaceRoute } from "@/lib/rootNavigation";
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

const ADMIN_TAP_COUNT = 5;
const ADMIN_TAP_WINDOW_MS = 2000;

export default function CFDDisplayScreen() {
  const { sendTipSelection, reconnect } = useCFDClient();
  const { isPaired, connectionStatus } = useCFDClientStore();

  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  const showAdminMenu = useCallback(() => {
    Alert.alert("CFD Admin", "Select an option:", [
      {
        text: "CFD Settings",
        onPress: () => router.replace("/(cfd)/cfd-pairing"),
      },
      {
        text: "Disconnect & Exit CFD",
        style: "destructive",
        onPress: () => {
          useCFDClientStore.getState().clearPairing();
          useStoreSettingsStore.getState().exitCFDMode();
          replaceRoute("(auth)", "store-select");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);

  const handleAdminTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTimeRef.current > ADMIN_TAP_WINDOW_MS) {
      tapCountRef.current = 0;
    }
    lastTapTimeRef.current = now;
    tapCountRef.current += 1;

    if (tapCountRef.current >= ADMIN_TAP_COUNT) {
      tapCountRef.current = 0;
      showAdminMenu();
    }
  }, [showAdminMenu]);

  // Redirect to pairing if not paired
  useEffect(() => {
    if (!isPaired) {
      router.replace("/(cfd)/cfd-pairing");
    }
  }, [isPaired]);

  if (!isPaired) return null;

  // Disconnected state
  if (connectionStatus === "disconnected") {
    return (
      <View style={styles.errorContainer}>
        <Pressable
          onPress={handleAdminTap}
          style={[styles.connectionDot, { backgroundColor: "#ef4444" }]}
        />
        <Text style={styles.errorTitle}>Disconnected</Text>
        <Text style={styles.errorText}>Could not connect to POS.</Text>
        <Pressable onPress={reconnect} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry Connection</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            useCFDClientStore.getState().clearPairing();
            router.replace("/(cfd)/cfd-pairing");
          }}
          style={styles.resetButton}
        >
          <Text style={styles.resetButtonText}>Back to Pairing</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <CFDExternalDisplayProvider>
      <View style={styles.container}>
        {/* Connection indicator — 5-tap opens hidden admin menu */}
        <Pressable
          onPress={handleAdminTap}
          style={[
            styles.connectionDot,
            connectionStatus === "connected" && styles.connectionDotConnected,
            connectionStatus === "connecting" && styles.connectionDotConnecting,
          ]}
        />

        {/* Screen content — shared with built-in display */}
        <CFDScreenRouter onTipSelected={sendTipSelection} />
      </View>
    </CFDExternalDisplayProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ef4444",
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: "#9ca3af",
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  resetButton: {
    padding: 12,
  },
  resetButtonText: {
    color: "#6b7280",
    fontSize: 14,
  },
  connectionDot: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ef4444",
    zIndex: 100,
  },
  connectionDotConnected: {
    backgroundColor: "#10b981",
  },
  connectionDotConnecting: {
    backgroundColor: "#f59e0b",
  },
});
