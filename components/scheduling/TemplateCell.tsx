import { colors } from "@/lib/theme";
import { TemplateShift } from "@/lib/types";
import { Plus } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TemplateCellProps {
  dayOfWeek: number;
  shifts: TemplateShift[];
  onAddShift: (dayOfWeek: number) => void;
  onUpdateShift: (updatedShift: TemplateShift) => void; // For future drag/drop
  onDeleteShift: (tempId: string) => void; // For future shift deletion
}

const TemplateCell: React.FC<TemplateCellProps> = ({
  dayOfWeek,
  shifts,
  onAddShift,
  onUpdateShift,
  onDeleteShift,
}) => {
  return (
    <View
      className="w-40 p-2 min-h-[80px] border-r border-b border-border bg-panel" // Styling adapted from ScheduleCell
    >
      {shifts.length > 0 ? (
        <View className="gap-y-2">
          {/* DraggableTemplateShift components will go here */}
          {shifts.map((shift) => (
            <Text key={shift.tempId} className="text-white text-xs">
              {shift.role} ({shift.startTime.substring(11, 16)} -{" "}
              {shift.endTime.substring(11, 16)})
            </Text>
          ))}
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => onAddShift(dayOfWeek)}
          className="flex-1 h-full w-full items-center justify-center border-2 border-dashed border-gray-600 rounded-lg"
        >
          <Plus size={16} color={colors.label} />
          <Text className="text-gray-400 ml-2">Add Shift</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default TemplateCell;
