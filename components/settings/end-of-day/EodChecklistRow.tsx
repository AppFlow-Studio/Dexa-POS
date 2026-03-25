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
      className="rounded-xl border border-gray-700 bg-panel px-4 py-3"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: statusInfo.color,
        opacity: onPress ? 1 : 0.92,
      }}
    >
      <View className="flex-row items-start gap-3">
        <View
          className="mt-1 rounded-full"
          style={{ opacity: 0.95 }}
        >
          {statusInfo.icon}
        </View>
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-white">{title}</Text>
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: statusInfo.color + "1a" }}>
              <Text className="text-[11px]" style={{ color: statusInfo.color }}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
          {description ? (
            <Text className="text-xs text-zinc-400">{description}</Text>
          ) : null}
          {detail ? (
            <Text
              className="text-[11px] font-medium"
              style={{
                color: status === "failed" ? colors.danger : colors.label,
              }}
            >
              {detail}
            </Text>
          ) : null}
        </View>
        {actionLabel ? (
          <View className="rounded-lg bg-zinc-800 px-2 py-1">
            <Text className="text-xs text-white">{actionLabel}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

