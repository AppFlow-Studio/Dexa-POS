import { replaceRoute } from "@/lib/rootNavigation";
import { colors } from "@/lib/theme";
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { CFDPairingData } from "@/types/cfd.types";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { QrCode, Wifi } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Pressable,
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
    replaceRoute('(auth)', 'store-select');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: 16, paddingVertical: 12 }}>
      {/* Header */}
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading, marginBottom: 4 }}>
          Customer Facing Display
        </Text>
        <Text style={{ fontSize: 12, color: colors.label }}>
          Connect your tablet to the POS system
        </Text>
      </View>

      {/* Tab Selector */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20, backgroundColor: colors.panel, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: colors.border }}>
        <Pressable
          onPress={() => setActiveTab("qr")}
          style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: activeTab === "qr" ? colors.teal + '20' : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: activeTab === "qr" ? 1 : 0,
            borderColor: activeTab === "qr" ? colors.teal + '50' : 'transparent',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <QrCode size={14} color={activeTab === "qr" ? colors.teal : colors.label} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: activeTab === "qr" ? colors.teal : colors.label }}>
              Scan QR
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("manual")}
          style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: activeTab === "manual" ? colors.teal + '20' : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: activeTab === "manual" ? 1 : 0,
            borderColor: activeTab === "manual" ? colors.teal + '50' : 'transparent',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Wifi size={14} color={activeTab === "manual" ? colors.teal : colors.label} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: activeTab === "manual" ? colors.teal : colors.label }}>
              Manual
            </Text>
          </View>
        </Pressable>
      </View>

      {/* QR Tab */}
      {activeTab === "qr" && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {!permission?.granted ? (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '50', alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={28} color={colors.teal} />
              </View>
              <Text style={{ fontSize: 14, color: colors.label, textAlign: 'center', maxWidth: 280 }}>
                Camera permission required to scan QR code
              </Text>
              <Pressable
                onPress={requestPermission}
                style={{
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>
                  Grant Permission
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={{ width: 240, height: 240, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
                />
                <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 160, height: 160, borderWidth: 2, borderColor: colors.teal, borderRadius: 8 }} />
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.label, textAlign: 'center' }}>
                {scanning ? "Position QR code in frame" : "Processing..."}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Manual Tab */}
      {activeTab === "manual" && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '50', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Wifi size={28} color={colors.teal} />
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label, marginBottom: 4 }}>
            Enter POS Connection Details
          </Text>
          <TextInput
            value={manualIp}
            onChangeText={(text) => {
              setManualIp(text);
              if (error) setError(null);
            }}
            placeholder="192.168.1.100:8080"
            placeholderTextColor={colors.muted}
            style={{
              width: 280,
              backgroundColor: colors.card,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 13,
              color: colors.heading,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 12,
            }}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          <Pressable
            onPress={handleManualConnect}
            style={{
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50',
              paddingHorizontal: 20,
              paddingVertical: 8,
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>
              Connect
            </Text>
          </Pressable>
        </View>
      )}

      {/* Error Message */}
      {error && (
        <View style={{ backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '30', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 }}>
          <Text style={{ fontSize: 11, color: colors.danger, textAlign: 'center' }}>
            {error}
          </Text>
        </View>
      )}

      {/* Exit Button */}
      <Pressable
        onPress={handleExitCFDMode}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 12, color: colors.label }}>
          Exit CFD Mode
        </Text>
      </Pressable>
    </View>
  );
}
