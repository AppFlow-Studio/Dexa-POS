import { colors } from "@/lib/theme";
import { ChecklistStatus } from "@/stores/useEndOfDayStore";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Minus,
  Check,
} from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const ICON_SIZE = 16;

const STATUS_CONFIG: Record<
  ChecklistStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  pending: {
    color: colors.label,
    icon: <Clock size={ICON_SIZE} color={colors.label} />,
    label: "Pending",
  },
  in_progress: {
    color: colors.info,
    icon: <Loader2 size={ICON_SIZE} color={colors.info} />,
    label: "In progress",
  },
  passed: {
    color: colors.success,
    icon: <CheckCircle size={ICON_SIZE} color={colors.success} />,
    label: "Passed",
  },
  failed: {
    color: colors.danger,
    icon: <AlertCircle size={ICON_SIZE} color={colors.danger} />,
    label: "Failed",
  },
  skipped: {
    color: colors.muted,
    icon: <Minus size={ICON_SIZE} color={colors.muted} />,
    label: "Skipped",
  },
};

interface EodChecklistRowProps {
  title: string;
  description?: string;
  status: ChecklistStatus;
  detail?: string;
  actionLabel?: string;
  onPress?: () => void;
}

export default function EodChecklistRow({
  title,
  description,
  status,
  detail,
  actionLabel,
  onPress,
}: EodChecklistRowProps) {
  const statusInfo = STATUS_CONFIG[status];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 3,
        borderLeftColor: statusInfo.color,
        backgroundColor: colors.panel,
        paddingHorizontal: 12,
        paddingVertical: 10,
        opacity: onPress ? 1 : 0.92,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ marginTop: 4, opacity: 0.95 }}>
          {statusInfo.icon}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
              {title}
            </Text>
            <View
              style={{
                borderRadius: 20,
                paddingHorizontal: 8,
                paddingVertical: 3,
                backgroundColor: statusInfo.color + "1a",
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "600", color: statusInfo.color }}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
          {description ? (
            <Text style={{ fontSize: 11, color: colors.label }}>
              {description}
            </Text>
          ) : null}
          {detail ? (
            <Text
              style={{
                fontSize: 10,
                fontWeight: "500",
                color: status === "failed" ? colors.danger : colors.label,
              }}
            >
              {detail}
            </Text>
          ) : null}
        </View>
        {actionLabel ? (
          <View
            style={{
              borderRadius: 8,
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>
              {actionLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

