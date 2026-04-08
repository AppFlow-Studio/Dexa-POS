import { TemplateShift } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TemplateShiftChipProps {
  shift: TemplateShift;
  wage?: number; // Add wage prop
  onClick: (shift: TemplateShift) => void;
}

export const TemplateShiftChip: React.FC<TemplateShiftChipProps> = ({
  shift,
  wage,
  onClick,
}) => {
  return (
    <TouchableOpacity
      onPress={() => onClick(shift)}
      className="bg-blue-600/20 border border-blue-500 rounded-lg p-2 flex-row items-center justify-between"
    >
      <View>
        <Text className="text-white font-semibold text-sm">{shift.role}</Text>
        <Text className="text-blue-200 text-xs">
          {formatInTimeZone(shift.startTime, "UTC", "h:mm a")} -{" "}
          {formatInTimeZone(shift.endTime, "UTC", "h:mm a")}
        </Text>
        {wage && (
          <Text className="text-gray-400 text-xs mt-1">
            ${wage.toFixed(2)}/hr
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};
