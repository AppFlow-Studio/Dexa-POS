import { colors } from "@/lib/theme";
import { Shift } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { Clock, UserPlus } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OpenShiftChipProps {
  shift: Shift;
  onClick: () => void;
}

const formatTime = (time: string): string => {
  if (!time) return "N/A";
  return format(parseISO(time), "h:mm a");
};

export const OpenShiftChip: React.FC<OpenShiftChipProps> = ({
  shift,
  onClick,
}) => {
  return (
    <TouchableOpacity
      onPress={onClick}
      className="p-2 rounded-lg bg-amber-900/50 border-2 border-dashed border-amber-500"
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-xs font-bold text-amber-400">OPEN SHIFT</Text>
        <UserPlus size={14} color={colors.warning} />
      </View>
      <Text className="text-sm font-semibold text-white" numberOfLines={1}>
        {shift.role}
      </Text>
      <View className="flex-row items-center gap-1 mt-1">
        <Clock size={12} color={colors.label} />
        <Text className="text-xs text-gray-300">
          {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};
