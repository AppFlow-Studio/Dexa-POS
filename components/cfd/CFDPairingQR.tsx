// src/components/cfd/CFDPairingQR.tsx
import { useCFD } from "@/hooks/useCFD";
import { useUiScale } from "@/lib/uiScale";
import { X } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg"; // npm install react-native-qrcode-svg react-native-svg

interface CFDPairingQRProps {
  onClose?: () => void;
}

export function CFDPairingQR({ onClose }: CFDPairingQRProps) {
  const { serverStatus, isServerReady, isConnected, pairingData, clientCount } =
    useCFD();
  const uiScale = useUiScale();
  const styles = useMemo(() => createStyles(uiScale), [uiScale]);
  const qrSize = Math.round(200 * uiScale);
  const closeIconSize = Math.round(24 * uiScale);
  // Quick checks
  if (serverStatus === "disabled") {
    // No station selected - CFD not available
  }

  if (serverStatus === "initializing") {
    // Server starting up...
  }

  if (serverStatus === "error") {
    // Failed to start server
  }

  if (isServerReady && !isConnected) {
    // Server running, waiting for CFD to connect
  }

  if (isConnected) {
    // CFD is connected and receiving updates!
  }

  if (!pairingData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>CFD server not ready</Text>
      </View>
    );
  }

  // Encode pairing data as JSON in QR
  const qrValue = JSON.stringify(pairingData);

  return (
    <View style={styles.container}>
      {onClose && (
        <Pressable onPress={onClose} style={styles.closeButton}>
          <X size={closeIconSize} color="#9ca3af" />
        </Pressable>
      )}

      <Text style={styles.title}>Connect Customer Display</Text>

      <View style={styles.qrContainer}>
        <QRCode
          value={qrValue}
          size={qrSize}
          backgroundColor="#1f1f1f"
          color="#ffffff"
        />
      </View>

      <Text style={styles.instructions}>
        Scan this QR code with the DEXA CFD app
      </Text>

      <View style={styles.manualSection}>
        <Text style={styles.manualLabel}>Or connect manually:</Text>
        <View style={styles.manualInfo}>
          <Text style={styles.manualValue}>
            {pairingData.ip}:{pairingData.port}
          </Text>
        </View>
      </View>

      <View style={styles.statusSection}>
        <View
          style={[styles.statusDot, isConnected && styles.statusDotConnected]}
        />
        <Text
          style={[styles.statusText, isConnected && styles.statusTextConnected]}
        >
          {isConnected
            ? `Connected (${clientCount} display${clientCount > 1 ? "s" : ""})`
            : "Waiting for connection..."}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale);
  return StyleSheet.create({
    container: {
      backgroundColor: "#0a0a0a",
      borderRadius: s(16),
      padding: s(24),
      alignItems: "center",
      minWidth: s(300),
    },
    closeButton: {
      position: "absolute",
      top: s(12),
      right: s(12),
      padding: s(8),
    },
    title: {
      fontSize: s(20),
      fontWeight: "600",
      color: "#ffffff",
      marginBottom: s(24),
    },
    qrContainer: {
      padding: s(16),
      backgroundColor: "#1f1f1f",
      borderRadius: s(12),
      marginBottom: s(16),
    },
    instructions: {
      fontSize: s(14),
      color: "#9ca3af",
      textAlign: "center",
      marginBottom: s(24),
    },
    manualSection: {
      alignItems: "center",
      marginBottom: s(24),
    },
    manualLabel: {
      fontSize: s(12),
      color: "#6b7280",
      marginBottom: s(8),
    },
    manualInfo: {
      backgroundColor: "#1f1f1f",
      paddingHorizontal: s(16),
      paddingVertical: s(8),
      borderRadius: s(8),
    },
    manualValue: {
      fontSize: s(16),
      color: "#ffffff",
      fontFamily: "monospace",
    },
    statusSection: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(8),
    },
    statusDot: {
      width: s(8),
      height: s(8),
      borderRadius: s(4),
      backgroundColor: "#6b7280",
    },
    statusDotConnected: {
      backgroundColor: "#10b981",
    },
    statusText: {
      fontSize: s(14),
      color: "#6b7280",
    },
    statusTextConnected: {
      color: "#10b981",
    },
    errorText: {
      color: "#ef4444",
      fontSize: s(14),
    },
  });
};
