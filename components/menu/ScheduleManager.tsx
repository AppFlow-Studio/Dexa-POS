import { Schedule } from "@/lib/types";
import { Clock, Plus, Trash2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export interface ScheduleManagerProps {
  value: Schedule[];
  onChange: (next: Schedule[]) => void;
  onAdd: () => void;
  onEdit: (rule: Schedule, index: number) => void;
}

const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  value,
  onChange,
  onAdd,
  onEdit,
}) => {
  const schedules = value ?? [];

  const removeRule = (idx: number) => {
    onChange(schedules.filter((_, i) => i !== idx));
  };

  return (
    <View className="gap-2">
      {schedules.length === 0 && (
        <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
          <Text className="text-gray-300 text-lg">
            No schedule rules defined.
          </Text>
        </View>
      )}

      {schedules.map((rule, idx) => (
        <TouchableOpacity
          key={rule.id}
          onPress={() => onEdit(rule, idx)}
          className="bg-[#303030] border rounded-lg p-3 border-gray-600"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Clock size={16} color="#9CA3AF" />
              <Text className="text-white font-semibold text-xl">
                {rule.name || `Rule ${idx + 1}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                removeRule(idx);
              }}
              className="p-1.5 bg-red-900/30 border border-red-500 rounded-lg"
            >
              <Trash2 size={18} color="#F87171" />
            </TouchableOpacity>
          </View>
          <Text className="text-base text-gray-400 mt-1.5">
            {rule.days.join(", ")} from {rule.startTime} to {rule.endTime}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={onAdd}
        className="flex-row items-center gap-2 px-4 py-3 rounded-lg bg-blue-600 self-start"
      >
        <Plus size={18} color="#FFFFFF" />
        <Text className="text-white font-bold text-lg">Add Schedule Rule</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ScheduleManager;
