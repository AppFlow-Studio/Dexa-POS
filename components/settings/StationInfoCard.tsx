import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Smartphone, RefreshCw, Wifi, Battery, Signal } from "lucide-react-native";
import { colors } from "@/lib/theme";
import type { DeviceCapabilities } from "@/services/hardware/deviceDetection";

interface StationInfoCardProps {
  capabilities: DeviceCapabilities | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const HardwareBadge = ({ label, available }: { label: string; available: boolean }) => (
  <View
    style={{
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: available ? colors.success + "20" : colors.muted + "15",
      marginRight: 6,
      marginBottom: 6,
    }}
  >
    <Text
      style={{
        fontSize: 11,
        fontWeight: "600",
        color: available ? colors.success : colors.muted,
      }}
    >
      {label}
    </Text>
  </View>
);

export default function StationInfoCard({ capabilities, isRefreshing, onRefresh }: StationInfoCardProps) {
  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.panel,
        padding: 16,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Smartphone size={18} color={colors.teal} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>This Station</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={isRefreshing} style={{ padding: 4 }}>
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <RefreshCw size={16} color={colors.muted} />
          )}
        </TouchableOpacity>
      </View>

      {!capabilities ? (
        <Text style={{ fontSize: 13, color: colors.muted }}>Detecting...</Text>
      ) : (
        <>
          {/* Device title */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.heading, marginBottom: 10 }}>
            {capabilities.manufacturer} {capabilities.model}
          </Text>

          {/* Info rows - 2 columns */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <View style={{ width: "48%", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Battery size={13} color={colors.muted} />
              <Text style={{ fontSize: 12, color: colors.label }}>
                Battery: {capabilities.batteryLevel != null ? `${Math.round(capabilities.batteryLevel)}%` : "N/A"}
              </Text>
            </View>
            <View style={{ width: "48%", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Wifi size={13} color={colors.muted} />
              <Text style={{ fontSize: 12, color: colors.label }} numberOfLines={1}>
                Network: {capabilities.networkType ?? "N/A"}
                {capabilities.networkType === "wifi" && capabilities.networkSsid ? ` (${capabilities.networkSsid})` : ""}
              </Text>
            </View>
            <View style={{ width: "48%", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Signal size={13} color={colors.muted} />
              <Text style={{ fontSize: 12, color: colors.label }} numberOfLines={1}>
                Local IP: {capabilities.localIpAddress ?? "N/A"}
              </Text>
            </View>
            <View style={{ width: "48%", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Smartphone size={13} color={colors.muted} />
              <Text style={{ fontSize: 12, color: colors.label }}>
                App Version: {capabilities.appVersion ?? "N/A"}
              </Text>
            </View>
          </View>

          {/* Hardware badges */}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {capabilities.hasBuiltinPrinter && <HardwareBadge label="Built-in Printer" available />}
            {capabilities.hasBuiltinCfd && <HardwareBadge label="CFD" available />}
            {capabilities.hasCashDrawerPort && <HardwareBadge label="Cash Drawer" available />}
            {capabilities.hasNfc && <HardwareBadge label="NFC" available />}
            {capabilities.hasBarcodeScanner && <HardwareBadge label="Scanner" available />}
            {!capabilities.hasBuiltinPrinter &&
              !capabilities.hasBuiltinCfd &&
              !capabilities.hasCashDrawerPort &&
              !capabilities.hasNfc &&
              !capabilities.hasBarcodeScanner && (
                <Text style={{ fontSize: 11, color: colors.muted, fontStyle: "italic" }}>
                  No built-in hardware detected
                </Text>
              )}
          </View>
        </>
      )}
    </View>
  );
}
