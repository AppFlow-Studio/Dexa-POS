import React from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CheckCircle2,
  Printer,
  RefreshCw,
  Wifi,
  XCircle,
} from "lucide-react-native";
import { colors } from "@/lib/theme";
import type { DiscoveredStarPrinter } from "@/services/printing/discovery/StarPrinterDiscovery";
import type { PrinterConfig } from "@/types/printer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredPrinterListProps {
  discoveredPrinters: DiscoveredStarPrinter[];
  storedPrinters: PrinterConfig[];
  isScanning: boolean;
  scanSecondsRemaining: number | null;
  scanError: string | null;
  provisioningIp: string | null;
  testResults: Record<string, { success: boolean; message: string } | null>;
  testingIp: string | null;
  onRefresh: () => void;
  onProvision: (printer: DiscoveredStarPrinter, role: "receipt" | "kitchen" | "both") => void;
  onTest: (ip: string) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ title, rightContent }: { title: string; rightContent?: React.ReactNode }) {
  return (
    <View style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 16,
      marginBottom: 6,
      paddingHorizontal: 2,
    }}>
      <Text style={{
        fontSize: 11,
        fontWeight: "700",
        color: colors.muted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
      }}>
        {title}
      </Text>
      {rightContent}
    </View>
  );
}

function CapabilityBadge({ label }: { label: string }) {
  return (
    <View style={{ backgroundColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
      <Text style={{ fontSize: 10, color: colors.label }}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DiscoveredPrinterList({
  discoveredPrinters,
  storedPrinters,
  isScanning,
  scanSecondsRemaining,
  scanError,
  provisioningIp,
  testResults,
  testingIp,
  onRefresh,
  onProvision,
  onTest,
}: DiscoveredPrinterListProps) {
  const newPrinters = discoveredPrinters.filter(
    (dp) => !storedPrinters.some((p) => p.printerType === "star_micronics" && p.networkAddress === dp.ipAddress),
  );

  // Hide entire section when not scanning and there are no new printers to show
  if (!isScanning && newPrinters.length === 0) return null;

  return (
    <View style={{ marginBottom: 12 }}>
      {/* Header */}
      <SectionHeader
        title="Discovered Printers"
        rightContent={
          <TouchableOpacity
            onPress={onRefresh}
            disabled={isScanning}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              backgroundColor: colors.teal + "15",
              borderRadius: 6,
            }}
          >
            {isScanning ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <>
                <RefreshCw size={11} color={colors.teal} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Refresh</Text>
              </>
            )}
          </TouchableOpacity>
        }
      />

      {/* Scanning indicator (no printers found yet) */}
      {isScanning && discoveredPrinters.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 20, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
          <ActivityIndicator size="large" color={colors.teal} />
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 10 }}>
            {scanSecondsRemaining != null
              ? `Scanning... ${scanSecondsRemaining}s remaining`
              : "Scanning for Star printers..."}
          </Text>
        </View>
      )}

      {/* Scanning indicator (some printers already found) */}
      {isScanning && discoveredPrinters.length > 0 && (
        <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>
          {scanSecondsRemaining != null
            ? `Scanning... ${scanSecondsRemaining}s remaining · ${discoveredPrinters.length} found`
            : `${discoveredPrinters.length} found`}
        </Text>
      )}

      {/* Scan error */}
      {scanError && (
        <View style={{ backgroundColor: colors.danger + "12", borderWidth: 1, borderColor: colors.danger + "30", borderRadius: 8, padding: 10, marginBottom: 6 }}>
          <Text style={{ fontSize: 12, color: colors.danger }}>{scanError}</Text>
        </View>
      )}

      {/* Discovered printer cards */}
      {newPrinters.map((dp) => {
        const isProvisioningThis = provisioningIp === dp.ipAddress;
        const testResult = testResults[dp.ipAddress];

        return (
          <View
            key={dp.ipAddress}
            style={{
              backgroundColor: colors.card,
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 6,
            }}
          >
            {/* Model + IP header */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Printer size={14} color={colors.teal} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, marginLeft: 6, flex: 1 }}>{dp.modelName}</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Wifi size={10} color={colors.muted} />
                <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }}>{dp.ipAddress}</Text>
              </View>
            </View>

            {/* MAC address */}
            {dp.macAddress && (
              <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 6 }}>MAC: {dp.macAddress}</Text>
            )}

            {/* Capability badges */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              <CapabilityBadge label={`${dp.capabilities.paperWidth}mm`} />
              <CapabilityBadge label={`${dp.capabilities.maxCharsPerLine} chars`} />
              <CapabilityBadge label={dp.capabilities.supportsAutoCut ? "Auto-cut" : "Tear-off"} />
              {dp.capabilities.graphicsOnly && (
                <CapabilityBadge label="Graphics-only" />
              )}
            </View>

            {/* Pre-provision test result */}
            {testResult && (
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: testResult.success ? colors.success + "12" : colors.danger + "12",
              }}>
                {testResult.success ? (
                  <CheckCircle2 size={12} color={colors.success} />
                ) : (
                  <XCircle size={12} color={colors.danger} />
                )}
                <Text style={{ fontSize: 11, color: testResult.success ? colors.success : colors.danger }}>
                  {testResult.message}
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 6 }}>
              {/* Test connection */}
              <TouchableOpacity
                onPress={() => onTest(dp.ipAddress)}
                disabled={testingIp === dp.ipAddress || isProvisioningThis}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                {testingIp === dp.ipAddress ? (
                  <ActivityIndicator size="small" color={colors.muted} />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.label }}>Test</Text>
                )}
              </TouchableOpacity>

              {/* Add as Receipt */}
              <TouchableOpacity
                onPress={() => onProvision(dp, "receipt")}
                disabled={isProvisioningThis}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: isProvisioningThis ? colors.border : colors.teal + "15",
                  borderWidth: 1,
                  borderColor: isProvisioningThis ? colors.border : colors.teal + "40",
                }}
              >
                {isProvisioningThis ? (
                  <ActivityIndicator size="small" color={colors.teal} />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Add as Receipt</Text>
                )}
              </TouchableOpacity>

              {/* Add as Kitchen */}
              <TouchableOpacity
                onPress={() => onProvision(dp, "kitchen")}
                disabled={isProvisioningThis}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: isProvisioningThis ? colors.border : "#f97316" + "15",
                  borderWidth: 1,
                  borderColor: isProvisioningThis ? colors.border : "#f97316" + "40",
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: isProvisioningThis ? colors.muted : "#f97316" }}>Add as Kitchen</Text>
              </TouchableOpacity>

              {/* Add as Both */}
              <TouchableOpacity
                onPress={() => onProvision(dp, "both")}
                disabled={isProvisioningThis}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: isProvisioningThis ? colors.border : "#8b5cf6" + "15",
                  borderWidth: 1,
                  borderColor: isProvisioningThis ? colors.border : "#8b5cf6" + "40",
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: isProvisioningThis ? colors.muted : "#8b5cf6" }}>Add as Both</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}
