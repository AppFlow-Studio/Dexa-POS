import { useCFDClientStore } from "@/stores/useCFDClientStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { CFDPairingData } from "@/types/cfd.types";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type PairingTab = "qr" | "manual";

export default function CFDPairingScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualIp, setManualIp] = useState("");
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PairingTab>("qr");

  const { isPaired, setPairing } = useCFDClientStore();

  // Redirect if already paired
  useEffect(() => {
    if (isPaired) {
      requestAnimationFrame(() => {
        router.replace("/(cfd)/cfd-display");
      });
    }
  }, [isPaired]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!scanning) return;
    setScanning(false);

    try {
      const pairingData: CFDPairingData = JSON.parse(data);
      if (!pairingData.ip || !pairingData.port || !pairingData.stationId) {
        throw new Error("Invalid QR code");
      }
      setPairing(pairingData);
      router.replace("/(cfd)/cfd-display");
    } catch (e) {
      setError("Invalid QR code. Please try again.");
      setTimeout(() => {
        setScanning(true);
        setError(null);
      }, 2000);
    }
  };

  const handleManualConnect = () => {
    const [ip, portStr] = manualIp.split(":");
    const port = parseInt(portStr, 10);

    if (!ip || isNaN(port)) {
      setError("Invalid format. Use IP:PORT (e.g., 192.168.1.100:8080)");
      return;
    }

    setPairing({
      ip,
      port,
      stationId: "manual",
      stationName: "POS Station",
      locationId: "manual",
      locationName: "Restaurant",
    });

    router.replace("/(cfd)/cfd-display");
  };

  const handleExitCFDMode = () => {
    useStoreSettingsStore.getState().exitCFDMode();
    router.replace("/store-select");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DEXA CFD</Text>
      <Text style={styles.subtitle}>Customer Facing Display</Text>

      {/* Tab Selector */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setActiveTab("qr")}
          style={[styles.tab, activeTab === "qr" && styles.tabActive]}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "qr" && styles.tabTextActive,
            ]}
          >
            Scan QR
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("manual")}
          style={[styles.tab, activeTab === "manual" && styles.tabActive]}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "manual" && styles.tabTextActive,
            ]}
          >
            Manual
          </Text>
        </Pressable>
      </View>

      {/* QR Tab */}
      {activeTab === "qr" && (
        <View style={styles.tabContent}>
          {!permission?.granted ? (
            <View style={styles.permissionSection}>
              <Text style={styles.permissionText}>
                Camera permission required to scan QR code
              </Text>
              <Pressable onPress={requestPermission} style={styles.button}>
                <Text style={styles.buttonText}>Grant Permission</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.scannerContainer}>
                <CameraView
                  style={styles.scanner}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={
                    scanning ? handleBarCodeScanned : undefined
                  }
                />
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerFrame} />
                </View>
              </View>
              <Text style={styles.scanText}>
                {scanning ? "Scan QR code from POS" : "Processing..."}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Manual Tab */}
      {activeTab === "manual" && (
        <View style={styles.tabContent}>
          <Text style={styles.manualLabel}>Enter POS IP and port:</Text>
          <TextInput
            value={manualIp}
            onChangeText={(text) => {
              setManualIp(text);
              if (error) setError(null);
            }}
            placeholder="192.168.1.100:8080"
            placeholderTextColor="#6b7280"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          <Pressable onPress={handleManualConnect} style={styles.button}>
            <Text style={styles.buttonText}>Connect</Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Exit CFD Mode */}
      <Pressable onPress={handleExitCFDMode} style={styles.exitButton}>
        <Text style={styles.exitButtonText}>Exit CFD Mode</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 36, fontWeight: "700", color: "#ffffff" },
  subtitle: { fontSize: 18, color: "#6b7280", marginBottom: 24 },
  tabRow: {
    flexDirection: "row",
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: "#1f1f1f",
    overflow: "hidden",
  },
  tab: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  tabActive: {
    backgroundColor: "#10b981",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  tabContent: {
    alignItems: "center",
    minHeight: 320,
    justifyContent: "center",
  },
  permissionSection: {
    alignItems: "center",
    gap: 16,
  },
  permissionText: {
    fontSize: 16,
    color: "#9ca3af",
    textAlign: "center",
  },
  scannerContainer: {
    width: 280,
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  scanner: { flex: 1 },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scannerFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "#10b981",
    borderRadius: 12,
  },
  scanText: { fontSize: 16, color: "#9ca3af", marginBottom: 24 },
  error: { color: "#ef4444", marginBottom: 16, marginTop: 8 },
  manualLabel: { fontSize: 16, color: "#9ca3af", marginBottom: 12 },
  input: {
    width: 300,
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#10b981",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#ffffff" },
  exitButton: {
    position: "absolute",
    bottom: 40,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  exitButtonText: { fontSize: 14, color: "#9ca3af" },
});
