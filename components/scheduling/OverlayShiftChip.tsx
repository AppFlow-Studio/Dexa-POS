import { TemplateShift } from "@/lib/types";
import { format } from "date-fns";
import React from "react";
import { Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

interface OverlayShiftChipProps {
  shift: TemplateShift;
  isConflicting: boolean;
}

const OverlayShiftChip: React.FC<OverlayShiftChipProps> = ({ shift, isConflicting }) => {
  const startTime = format(new Date(`${shift.startTime}`), "h:mm a");
  const endTime = format(new Date(`${shift.endTime}`), "h:mm a");

  const containerClasses = isConflicting
    ? "p-2 rounded-lg bg-red-900/30 border-2 border-dashed border-red-500/50 mb-2"
    : "p-2 rounded-lg bg-gray-500/20 border-2 border-dashed border-gray-500/50 mb-2";

  const textClasses = isConflicting ? "text-red-400" : "text-gray-400";

  return (
    <View className={containerClasses}>
      <View className="flex-row justify-between items-center">
        <Text className={`text-xs font-bold ${textClasses}`}>{shift.role}</Text>
        {isConflicting && <AlertTriangle size={14} color="#f87171" />}
      </View>
      <Text className={`text-xs ${textClasses}`}>
        {startTime} - {endTime}
      </Text>
    </View>
  );
};

export default OverlayShiftChip;
