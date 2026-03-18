import { Shift } from "@/lib/types";
import { format, parse, parseISO } from "date-fns";
import { colors } from "@/lib/theme";
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
  onCancelSwapRequest: (shift: Shift) => void;
  onPickUpShift?: (shift: Shift) => void; // New prop for pickup action
}

const StatusBadge = ({
  text,
  color,
}: {
  text: string;
  color: "blue" | "yellow" | "gray" | "green";
}) => {
  const styles = {
    blue: { bg: 'bg-teal-500/15', text: 'text-teal-400' },
    yellow: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
    gray: { bg: 'bg-white/5', text: 'text-label' },
    green: { bg: 'bg-green-500/15', text: 'text-green-400' },
  };
  return (
    <View className={`px-2 py-0.5 rounded-md ${styles[color].bg}`}>
      <Text className={`text-xs font-semibold ${styles[color].text}`}>{text}</Text>
    </View>
  );
};

const ShiftDetailRow: React.FC<ShiftDetailRowProps> = ({
  shift,
  onPress,
  onRequestDrop,
  onRequestSwap,
  onCancelDropRequest,
  onCancelSwapRequest,
  onPickUpShift,
}) => {
  const [isNoteVisible, setNoteVisible] = useState(false);
  const getStatusLabel = () => {
    switch (shift.status) {
      case "confirmed":
        return { label: "Assigned", color: "blue" as const };
      case "open":
        return { label: "Open Shift", color: "yellow" as const }; // Use yellow for visibility, or customize
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
      className="bg-panel rounded-xl border border-border overflow-hidden"
      style={shift.status === "open" ? { borderColor: colors.teal + '60', backgroundColor: colors.teal + '08' } : undefined}
    >
      {/* Top accent bar for open shifts */}
      {shift.status === "open" && (
        <View style={{ height: 3, backgroundColor: colors.teal }} />
      )}

      <View className="p-4">
        {/* Role + badges */}
        <View className="flex-row items-center gap-2 mb-3">
          <Text className="text-sm font-semibold text-heading flex-1">{shift.role}</Text>
          <StatusBadge text={label} color={color} />
          {shift.isToday && <StatusBadge text="Today" color="blue" />}
        </View>

        {/* Time */}
        <View className="flex-row items-center gap-2 mb-1.5">
          <Clock size={13} color={colors.muted} />
          <Text className="text-sm text-heading">
            {shift.startTime ? format(parseISO(shift.startTime), "h:mm a") : "N/A"} – {shift.endTime ? format(parseISO(shift.endTime), "h:mm a") : "N/A"}
          </Text>
          {shift.status === "on-shift" && shift.actualClockIn && (
            <Text className="text-xs text-teal-400">
              (on since {format(parse(shift.actualClockIn, "HH:mm", new Date()), "h:mm a")})
            </Text>
          )}
        </View>

        {/* Location */}
        <View className="flex-row items-center gap-2 mb-3">
          <MapPin size={13} color={colors.muted} />
          <Text className="text-sm text-label">{shift.location}</Text>
        </View>

        {/* Manager note */}
        {shift.managerNote && (
          <View className="mb-3">
            <TouchableOpacity onPress={handleNotePress} className="flex-row items-center gap-2">
              <MessageSquare size={13} color={colors.teal} />
              <Text className="text-xs text-teal-400">Manager note</Text>
            </TouchableOpacity>
            {isNoteVisible && (
              <View className="mt-2 p-3 bg-white/5 rounded-lg">
                <Text className="text-sm text-heading">{shift.managerNote}</Text>
              </View>
            )}
          </View>
        )}

        {/* Compliance badges */}
        <View className="flex-row flex-wrap gap-1.5 mb-3">
          <ComplianceBadge icon={<Coffee size={12} color={colors.muted} />} text={`Break ${shift.breakMinutes}m`} variant="default" />
          {shift.expectedPace && (
            <ComplianceBadge icon={<TrendingUp size={12} color={colors.muted} />} text={shift.expectedPace} variant={getPaceVariant(shift.expectedPace)} />
          )}
          {shift.staffingLevel && (
            <ComplianceBadge icon={<Users size={12} color={colors.muted} />} text={shift.staffingLevel} variant={getStaffingVariant(shift.staffingLevel)} />
          )}
          {shift.isOvertimeRisk && (
            <ComplianceBadge icon={<AlertTriangle size={12} color={colors.warning} />} text="OT Risk" variant="warning" />
          )}
        </View>

        {/* Action buttons */}
        <View className="flex-row items-center gap-2 pt-3 border-t border-border">
          {shift.status === "open" && onPickUpShift && (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onPickUpShift(shift); }}
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg"
              style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50' }}
            >
              <Clock size={13} color={colors.teal} />
              <Text className="text-xs font-semibold text-teal-400">Pick Up Shift</Text>
            </TouchableOpacity>
          )}
          {shift.status === "confirmed" && (
            <>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); onRequestSwap(shift); }}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white/5"
              >
                <ArrowRightLeft size={13} color={colors.label} />
                <Text className="text-xs font-semibold text-label">Swap</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); onRequestDrop(shift); }}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white/5"
              >
                <MinusCircle size={13} color={colors.label} />
                <Text className="text-xs font-semibold text-label">Drop</Text>
              </TouchableOpacity>
            </>
          )}
          {shift.status === "pending-swap" && (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onCancelSwapRequest(shift); }}
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg"
              style={{ backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '40' }}
            >
              <XCircle size={13} color={colors.danger} />
              <Text className="text-xs font-semibold text-red-400">Cancel Swap</Text>
            </TouchableOpacity>
          )}
          {shift.status === "dropped" && (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onCancelDropRequest(shift); }}
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg"
              style={{ backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '40' }}
            >
              <XCircle size={13} color={colors.danger} />
              <Text className="text-xs font-semibold text-red-400">Cancel Drop</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default ShiftDetailRow;
