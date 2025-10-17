import { Shift } from "@/lib/types";
import {
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  Coffee,
  MapPin,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";

import React from "react";
interface ShiftDetailRowProps {
  shift: Shift;
  onPress: () => void;
  onRequestDrop: (shift: Shift) => void;
  onRequestSwap: (shift: Shift) => void;
}

const StatusBadge = ({
  text,
  color,
}: {
  text: string;
  color: "blue" | "yellow" | "gray" | "green";
}) => {
  const colors = {
    blue: "bg-blue-600/20 text-blue-400 border-blue-500/30",
    yellow: "bg-yellow-600/20 text-yellow-400 border-yellow-500/30",
    gray: "bg-gray-600/20 text-gray-300 border-gray-500/30",
    green: "bg-green-600/20 text-green-400 border-green-500/30",
  };
  return (
    <View className={`px-2 py-1 rounded border ${colors[color]}`}>
      <Text className={`text-xs font-semibold ${colors[color]}`}>{text}</Text>
    </View>
  );
};

const ComplianceBadge = ({
  icon,
  text,
  variant,
}: {
  icon: React.ReactNode;
  text: string;
  variant: "default" | "success" | "warning";
}) => {
  const colors = {
    default: "text-gray-400",
    success: "text-green-400",
    warning: "text-yellow-400",
  };
  return (
    <View className="flex-row items-center gap-1.5">
      {icon}
      <Text className={`text-sm ${colors[variant]}`}>{text}</Text>
    </View>
  );
};

const ShiftDetailRow: React.FC<ShiftDetailRowProps> = ({
  shift,
  onPress,
  onRequestDrop,
  onRequestSwap,
}) => {
  const getStatusLabel = () => {
    switch (shift.status) {
      case "confirmed":
        return { label: "Assigned", color: "blue" as const };
      case "pending-swap":
        return { label: "Pending swap", color: "yellow" as const };
      case "dropped":
        return { label: "Dropped (pending)", color: "yellow" as const };
      case "on-shift":
        return { label: "On shift", color: "green" as const };
      default:
        return { label: "Scheduled", color: "gray" as const };
    }
  };

  const { label, color } = getStatusLabel();

  return (
    <TouchableOpacity
      onPress={onPress}
      className="p-4 bg-[#212121] rounded-xl border border-gray-700"
    >
      <View className="flex-row items-center gap-3 mb-3">
        <Text className="text-base font-semibold text-white">{shift.role}</Text>
        <StatusBadge text={label} color={color} />
        {shift.isToday && <StatusBadge text="Today" color="blue" />}
      </View>

      <View className="flex-row items-center gap-2 mb-2">
        <Clock size={16} color="#9CA3AF" />
        <Text className="text-base text-white">
          {shift.startTime} – {shift.endTime}
        </Text>
        {shift.status === "on-shift" && (
          <Text className="text-base text-green-400">
            (On since {shift.actualClockIn})
          </Text>
        )}
      </View>

      <View className="flex-row items-center gap-2 mb-3">
        <MapPin size={16} color="#9CA3AF" />
        <Text className="text-base text-gray-400">{shift.location}</Text>
      </View>

      {shift.managerNote && (
        <View className="flex-row items-center gap-2 mb-3 p-2 bg-blue-900/20 rounded-md">
          <MessageSquare size={16} color="#60A5FA" />
          <Text className="text-sm text-blue-300">{shift.managerNote}</Text>
        </View>
      )}

      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <ComplianceBadge
          icon={<Coffee size={14} color="#9CA3AF" />}
          text={`Meal break ${shift.breakMinutes}m required`}
          variant="default"
        />
        {shift.restRiskHours && (
          <ComplianceBadge
            icon={<AlertTriangle size={14} color="#f59e0b" />}
            text={`Risk: ${shift.restRiskHours}h rest`}
            variant="warning"
          />
        )}
        {shift.expectedPace && (
          <ComplianceBadge
            icon={<TrendingUp size={14} color="#9CA3AF" />}
            text={`Expected: ${shift.expectedPace}`}
            variant="default"
          />
        )}
        {shift.staffingLevel && (
          <ComplianceBadge
            icon={<Users size={14} color="#9CA3AF" />}
            text={shift.staffingLevel}
            variant="default"
          />
        )}
        {shift.isOvertimeRisk && (
          <ComplianceBadge
            icon={<AlertTriangle size={14} color="#f59e0b" />}
            text="OT risk"
            variant="warning"
          />
        )}
      </View>

      <View className="flex-row items-center gap-4 border-t border-gray-700 pt-3">
        {shift.status === "confirmed" && (
          <>
            <TouchableOpacity
              onPress={() => onRequestSwap(shift)}
              className="flex-row items-center gap-1.5"
            >
              <ArrowRightLeft size={14} color="#9CA3AF" />
              <Text className="text-base text-gray-400">Request Swap</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onRequestDrop(shift)}>
              <Text className="text-base text-gray-400">Drop to Open</Text>
            </TouchableOpacity>
          </>
        )}
        {shift.status === "pending-swap" && (
          <TouchableOpacity onPress={() => onRequestSwap(shift)}>
            <Text className="text-base font-semibold text-blue-400">
              View swap
            </Text>
          </TouchableOpacity>
        )}
        {shift.status === "dropped" && (
          <Text className="text-base text-yellow-400">
            Drop pending approval
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default ShiftDetailRow;
