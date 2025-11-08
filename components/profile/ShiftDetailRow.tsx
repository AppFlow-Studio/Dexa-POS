import { Shift } from "@/lib/types";
import { format, parse, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  Coffee,
  MapPin,
  MessageSquare,
  MinusCircle,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  GestureResponderEvent,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ComplianceBadge from "./ComplianceBadge";

interface ShiftDetailRowProps {
  shift: Shift;
  onPress: () => void;
  onRequestDrop: (shift: Shift) => void;
  onRequestSwap: (shift: Shift) => void;
  onCancelDropRequest: (shift: Shift) => void;
}

const StatusBadge = ({
  text,
  color,
}: {
  text: string;
  color: "blue" | "yellow" | "gray" | "green";
}) => {
  const bgColors = {
    blue: "bg-blue-600/20 text-blue-400",
    yellow: "bg-yellow-600/20 text-yellow-400",
    gray: "bg-gray-600/20 text-gray-300",
    green: "bg-green-600/20 text-green-400",
  };

  const textColors = {
    blue: "text-blue-400",
    yellow: "text-yellow-400",
    gray: "text-gray-300",
    green: "text-green-400",
  };
  return (
    <View className={`px-2 py-1 rounded ${bgColors[color]}`}>
      <Text className={`text-xs font-semibold ${textColors[color]}`}>
        {text}
      </Text>
    </View>
  );
};

const ShiftDetailRow: React.FC<ShiftDetailRowProps> = ({
  shift,
  onPress,
  onRequestDrop,
  onRequestSwap,
  onCancelDropRequest,
}) => {
  const [isNoteVisible, setNoteVisible] = useState(false);
  console.log("shift status:", shift.status);

  const getStatusLabel = () => {
    switch (shift.status) {
      case "confirmed":
        return { label: "Assigned", color: "blue" as const };
      case "pending-swap":
        return { label: "Pending swap", color: "yellow" as const };
      case "dropped":
        return { label: "Drop Pending", color: "yellow" as const };
      case "on-shift":
        return { label: "On shift", color: "green" as const };
      default:
        return { label: "Scheduled", color: "gray" as const };
    }
  };

  const getPaceVariant = (
    pace?: "Calm" | "Moderate" | "Busy"
  ): "success" | "default" | "warning" => {
    if (pace === "Calm") return "success";
    if (pace === "Busy") return "warning";
    return "default";
  };

  const getStaffingVariant = (
    level?: "Fully staffed" | "May need help"
  ): "success" | "warning" => {
    if (level === "May need help") return "warning";
    return "success";
  };

  const { label, color } = getStatusLabel();

  const handleNotePress = (e: GestureResponderEvent) => {
    e.stopPropagation();
    setNoteVisible(!isNoteVisible);
  };

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
          {shift.startTime ? format(parseISO(shift.startTime), "h:mm a") : "N/A"} –{" "}
          {shift.endTime ? format(parseISO(shift.endTime), "h:mm a") : "N/A"}
        </Text>
        {shift.status === "on-shift" && shift.actualClockIn && (
          <Text className="text-base text-green-400">
            (On since{" "}
            {format(parse(shift.actualClockIn, "HH:mm", new Date()), "h:mm a")})
          </Text>
        )}
      </View>

      <View className="flex-row items-center gap-2 mb-3">
        <MapPin size={16} color="#9CA3AF" />
        <Text className="text-base text-gray-400">{shift.location}</Text>
      </View>

      {shift.managerNote && (
        <View>
          <TouchableOpacity
            onPress={handleNotePress}
            className="flex-row items-center gap-2 mb-3"
          >
            <MessageSquare size={16} color="#60A5FA" />
            <Text className="text-sm text-blue-300 underline">
              Manager note
            </Text>
          </TouchableOpacity>
          {isNoteVisible && (
            <View className="p-3 bg-gray-800/50 rounded-lg mt-2 mb-3">
              <Text className="text-white">{shift.managerNote}</Text>
            </View>
          )}
        </View>
      )}

      <View className="flex-row flex-wrap items-center gap-2 mb-4">
        <ComplianceBadge
          icon={<Coffee size={14} color="#9CA3AF" />}
          text={`Meal break ${shift.breakMinutes}m required`}
          variant="default"
        />
        {shift.expectedPace && (
          <ComplianceBadge
            icon={<TrendingUp size={14} color="#9CA3AF" />}
            text={`Expected: ${shift.expectedPace}`}
            variant={getPaceVariant(shift.expectedPace)}
          />
        )}
        {shift.staffingLevel && (
          <ComplianceBadge
            icon={<Users size={14} color="#9CA3AF" />}
            text={shift.staffingLevel}
            variant={getStaffingVariant(shift.staffingLevel)}
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

      <View className="flex-row items-center justify-between border-t border-gray-700 pt-3">
        <View className="flex-row items-center gap-4">
          {shift.status === "confirmed" && (
            <>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onRequestSwap(shift);
                }}
                className="flex-row items-center gap-2 rounded-lg bg-gray-700/50 p-2 border-2 border-gray-600"
              >
                <ArrowRightLeft size={16} color="#9CA3AF" />
                <Text className="text-base font-semibold text-white">
                  Request Swap
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onRequestDrop(shift);
                }}
                className="flex-row items-center gap-2 rounded-lg bg-gray-700/50 p-2 border-2 border-gray-600"
              >
                <MinusCircle size={16} color="#9CA3AF" />
                <Text className="text-base font-semibold text-gray-300">
                  Drop to Open
                </Text>
              </TouchableOpacity>
            </>
          )}
          {shift.status === "pending-swap" && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onRequestSwap(shift);
              }}
              className="px-3 py-1 bg-purple-600/20 border-2 border-purple-500 rounded-lg"
            >
              <Text className="text-base font-semibold text-purple-300">
                View swap
              </Text>
            </TouchableOpacity>
          )}
          {shift.status === "dropped" && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onCancelDropRequest(shift);
              }}
              className="flex-row items-center gap-2 rounded-lg bg-red-700/50 p-2 border-2 border-red-600"
            >
              <XCircle size={16} color="#FCA5A5" />
              <Text className="text-base font-semibold text-red-300">
                Cancel Drop Request
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default ShiftDetailRow;
