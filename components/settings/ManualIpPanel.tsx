import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Plus, XCircle, Wifi } from "lucide-react-native";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";

// ---------------------------------------------------------------------------
// IPv4 validation helper
// ---------------------------------------------------------------------------

export const isValidIpv4 = (ip: string): boolean => {
  const clean = ip.replace(/\s/g, '');
  const parts = clean.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return p !== "" && !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ManualIpPanelProps {
  forRole: "receipt" | "kitchen";
  manualIp: string;
  onChangeIp: (ip: string) => void;
  manualIpError: string | null;
  onClearError: () => void;
  isProbing: boolean;
  isScanningStar: boolean;
  onConnect: () => void;
  onScanNetwork: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManualIpPanel({
  forRole,
  manualIp,
  onChangeIp,
  manualIpError,
  onClearError,
  isProbing,
  isScanningStar,
  onConnect,
  onScanNetwork,
  onCancel,
}: ManualIpPanelProps) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const isReceipt = forRole === "receipt";
  const accentColor = isReceipt ? colors.teal : "#f97316";

  const trimmedIp = manualIp.replace(/\s/g, '');
  const ipValid = isValidIpv4(trimmedIp);
  const connectDisabled = isProbing || !trimmedIp || !ipValid;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        padding: s(14),
        borderRadius: s(12),
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: s(10),
      }}
    >
      {/* Header + Cancel */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: s(10),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
          <Plus size={s(14)} color={accentColor} />
          <Text
            style={{
              fontSize: s(13),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Add {isReceipt ? "Receipt" : "Kitchen"} Printer by IP
          </Text>
        </View>
        <TouchableOpacity
          onPress={onCancel}
          style={{
            padding: s(6),
            backgroundColor: colors.panel,
            borderRadius: s(6),
          }}
        >
          <XCircle size={s(14)} color={colors.label} />
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(10) }}>
        Enter the IP address from the printer's configuration receipt.
      </Text>

      {/* IP address input */}
      <TextInput
        value={manualIp}
        onChangeText={(t) => {
          onChangeIp(t);
          if (manualIpError) onClearError();
        }}
        placeholder="192.168.1.100"
        placeholderTextColor={colors.muted}
        keyboardType="numeric"
        style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: s(8),
          paddingHorizontal: s(12),
          paddingVertical: s(9),
          fontSize: s(13),
          color: colors.heading,
          marginBottom: s(10),
        }}
        editable={!isProbing}
      />

      {/* IPv4 validation message */}
      {trimmedIp.length > 0 && !ipValid && !manualIpError && (
        <Text
          style={{
            fontSize: s(11),
            color: colors.warning,
            marginBottom: s(6),
            marginTop: s(-4),
          }}
        >
          Enter a valid IPv4 address (e.g. 192.168.1.100)
        </Text>
      )}

      {/* Error display */}
      {manualIpError && (
        <View
          style={{
            backgroundColor: colors.danger + "12",
            borderWidth: 1,
            borderColor: colors.danger + "30",
            borderRadius: s(8),
            padding: s(10),
            marginBottom: s(10),
          }}
        >
          <Text style={{ fontSize: s(11), color: colors.danger }}>
            {manualIpError}
          </Text>
        </View>
      )}

      {/* Connect + Scan buttons */}
      <View style={{ flexDirection: "row", marginBottom: s(10), gap: s(8) }}>
        <TouchableOpacity
          onPress={onConnect}
          disabled={connectDisabled}
          style={{
            flex: 1,
            paddingVertical: s(10),
            borderRadius: s(8),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: connectDisabled
              ? colors.border
              : accentColor + "20",
            borderWidth: 1,
            borderColor: connectDisabled
              ? colors.border
              : accentColor + "60",
          }}
        >
          {isProbing ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <>
              <Wifi
                size={s(14)}
                color={connectDisabled ? colors.muted : accentColor}
              />
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "600",
                  marginLeft: s(6),
                  color: connectDisabled ? colors.muted : accentColor,
                }}
              >
                Connect
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onScanNetwork}
          disabled={isScanningStar}
          style={{
            paddingHorizontal: s(14),
            paddingVertical: s(10),
            borderRadius: s(8),
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {isScanningStar ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <>
              <Wifi size={s(13)} color={colors.teal} />
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "600",
                  marginLeft: s(5),
                  color: colors.teal,
                }}
              >
                Scan
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
