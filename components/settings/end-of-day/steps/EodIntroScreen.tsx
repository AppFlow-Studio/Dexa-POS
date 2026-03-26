import { CheckCircle2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/lib/theme";

interface EodIntroScreenProps {
  locationName: string | null;
  dateLabel: string;
  isStartEnabled: boolean;
  onStart: () => void;
  onViewChecklist: () => void;
}

export default function EodIntroScreen({
  locationName,
  dateLabel,
  isStartEnabled,
  onStart,
  onViewChecklist,
}: EodIntroScreenProps) {
  return (
    <View style={{ gap: 24 }}>
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.teal + "10",
          padding: 16,
          gap: 12,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: colors.teal,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          End of Day
        </Text>
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.heading }}>
          {dateLabel}
        </Text>
        <Text style={{ fontSize: 12, color: colors.label }}>
          {locationName || "Active location"}
        </Text>
        <View style={{ marginTop: 8, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} color={colors.success} />
            <Text style={{ fontSize: 12, color: colors.label, flex: 1 }}>
              Reconcile tables, close active drawers, and review staff clocks
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} color={colors.success} />
            <Text style={{ fontSize: 12, color: colors.label, flex: 1 }}>Finalize tips and payments</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} color={colors.success} />
            <Text style={{ fontSize: 12, color: colors.label, flex: 1 }}>Generate end-of-day report and close</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <TouchableOpacity
          onPress={onStart}
          disabled={!isStartEnabled}
          style={{
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: "center",
            backgroundColor: isStartEnabled ? colors.teal : colors.teal + "66",
            opacity: isStartEnabled ? 1 : 0.5,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSolid }}>
            Start Close Out
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onViewChecklist}
          style={{
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>
            View checklist only
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

