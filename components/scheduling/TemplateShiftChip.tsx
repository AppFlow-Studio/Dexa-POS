import { TemplateShift } from "@/lib/types";
import { format, parseISO } from "date-fns";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TemplateShiftChipProps {
  shift: TemplateShift;
  wage?: number; // Add wage prop
  onClick: (shift: TemplateShift) => void;
}

const formatTime = (isoString: string): string => {
  if (!isoString) return "N/A";
  try {
    return format(parseISO(isoString), "h:mm a");
  } catch (error) {
    console.warn(`Invalid ISO string passed to formatTime: ${isoString}`);
    return "";
  }
};

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
          {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
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
